// Selects a representative subset from corpus/staging/ and writes it to
// corpus/golden/ as the active test corpus.
//
// Selection strategy: feature-aware, deterministic, three-phase.
//
//   Phase A, set cover: pick the smallest set of articles that
//     collectively exercise every AST feature kind observed across the
//     staging corpus. Greedy: at each step, pick the article that adds
//     the most uncovered features (ties broken by fewer bytes, then by
//     file name).
//
//   Phase B, K-coverage: for each feature, keep adding articles that
//     contain it until at least K articles in the selected set cover
//     that feature (clamped to availability; rare features may have
//     fewer than K examples in the whole corpus). Iterates features in
//     ascending rarity so the rare ones lock down their representatives
//     before commoner features eat the budget.
//
//   Phase C, density tail: top up to TARGET_SIZE with the unselected
//     articles that have the most distinct features (tie: smaller
//     bytes, then file name).
//
// Inputs:
//   corpus/staging/index.json   full staging set
//   corpus/staging/survey.json  round-trip survey results
//
// Filters out any article whose survey kind is not "ok" or whose
// oracle parity is not "ok" (parser bugs, round-trip diffs, oracle
// disagreements, crashes). Those become regression seeds, recorded in
// curation.json for later investigation but not included in golden.
//
// Outputs:
//   corpus/golden/<id>-<slug>.dtext  selected fixtures (copies)
//   corpus/golden/index.json         same shape as fetch-corpus
//   corpus/golden/curation.json      per-article selection metadata
//
// Tunables via env:
//   CURATE_TARGET_SIZE   default 150, total fixtures to emit
//   CURATE_K_COVERAGE    default 5, min articles per feature
//
// Heap: parses each staging article once to extract its feature
// signature. The runaway-allocation article was already filtered out by
// the survey (kind "crash"), so the parser pass here is safe to run in
// a single process with a moderate heap cap.

import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

import { parseDTextToAst } from '@dmark/dtext';
import type { DocumentNode } from '../src/ast';

interface CorpusEntry {
  id: number;
  title: string;
  slug: string;
  bytes: number;
  file: string;
}

interface SurveyRecord {
  file: string;
  bytes: number;
  kind: string;
  oracle?: string;
}

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CORPUS_STAGING = resolve(REPO_ROOT, 'corpus', 'staging');
const CORPUS_GOLDEN = resolve(REPO_ROOT, 'corpus', 'golden');
const STAGING_INDEX = resolve(CORPUS_STAGING, 'index.json');
const STAGING_SURVEY = resolve(CORPUS_STAGING, 'survey.json');
const KNOWN_DIVERGENCES = resolve(REPO_ROOT, 'corpus', 'known-divergences.md');

const TARGET_SIZE = Number(process.env.CURATE_TARGET_SIZE ?? '150');
const K_COVERAGE = Number(process.env.CURATE_K_COVERAGE ?? '5');

interface Candidate {
  entry: CorpusEntry;
  features: Set<string>;
}

interface SelectionRecord {
  file: string;
  bytes: number;
  features: number;
  phase: 'set-cover' | 'k-coverage' | 'density';
  reason: string;
}

function walkFeatures(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkFeatures(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.type === 'string') {
    out.add(`type:${obj.type}`);
    if (obj.type === 'link' && typeof obj.linkType === 'string') {
      out.add(`link:${obj.linkType}`);
      if (obj.linkType === 'id_link' && typeof obj.idType === 'string') {
        out.add(`id:${obj.idType}`);
      }
    }
    if (obj.type === 'header' && typeof obj.level === 'number') {
      out.add(`header_level:${obj.level}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    // ltable raw source stash is not structural; skip.
    if (k === 'source') continue;
    if (v && typeof v === 'object') walkFeatures(v, out);
  }
}

function compareCandidatesDescGain(
  a: { gain: number; bytes: number; file: string },
  b: { gain: number; bytes: number; file: string },
): number {
  if (b.gain !== a.gain) return b.gain - a.gain;
  if (a.bytes !== b.bytes) return a.bytes - b.bytes;
  return a.file.localeCompare(b.file);
}

function compareByDensity(a: Candidate, b: Candidate): number {
  if (b.features.size !== a.features.size)
    return b.features.size - a.features.size;
  if (a.entry.bytes !== b.entry.bytes) return a.entry.bytes - b.entry.bytes;
  return a.entry.file.localeCompare(b.entry.file);
}

async function main(): Promise<void> {
  const index = JSON.parse(readFileSync(STAGING_INDEX, 'utf8')) as {
    generated_at: string;
    entries: CorpusEntry[];
  };
  const survey = JSON.parse(readFileSync(STAGING_SURVEY, 'utf8')) as {
    results: SurveyRecord[];
  };
  // An article is curation-eligible iff round-trip is "ok" AND oracle
  // parity is "ok" (or oracle was skipped, in which case we accept
  // round-trip alone but warn). Anything else is a regression seed.
  const oracleChecked = survey.results.some(
    (r) => r.oracle === 'ok' || r.oracle === 'diff',
  );
  const cleanFiles = new Set(
    survey.results
      .filter(
        (r) => r.kind === 'ok' && (oracleChecked ? r.oracle === 'ok' : true),
      )
      .map((r) => r.file),
  );
  if (!oracleChecked) {
    console.log(
      '[curate] warning: survey has no oracle results; curation will only filter on round-trip parity',
    );
  }

  const okEntries = index.entries.filter((e) => cleanFiles.has(e.file));
  // Stable input order so the curation is deterministic.
  okEntries.sort((a, b) => a.file.localeCompare(b.file));

  console.log(
    `[curate] staging=${index.entries.length} clean=${okEntries.length} target=${TARGET_SIZE} k=${K_COVERAGE}`,
  );

  // Pass 1: extract feature signature per article.
  const candidates: Candidate[] = [];
  const globalCounts = new Map<string, number>();
  let processed = 0;
  for (const entry of okEntries) {
    const dtext = readFileSync(resolve(CORPUS_STAGING, entry.file), 'utf8');
    const ast = parseDTextToAst(dtext, {
      allowColor: true,
      maxThumbs: 75,
    }) as DocumentNode;
    const feats = new Set<string>();
    walkFeatures(ast, feats);
    candidates.push({ entry, features: feats });
    for (const f of feats) globalCounts.set(f, (globalCounts.get(f) ?? 0) + 1);
    processed += 1;
    if (processed % 2000 === 0) {
      console.log(
        `[curate] features extracted ${processed}/${okEntries.length}`,
      );
    }
  }

  const allFeatures = new Set(globalCounts.keys());
  console.log(`[curate] distinct features=${allFeatures.size}`);

  // Phase A: greedy set cover.
  const selected = new Map<string, Candidate>(); // by file
  const covered = new Set<string>();
  const selectedCounts = new Map<string, number>();
  const picks: SelectionRecord[] = [];

  function recordPick(
    c: Candidate,
    phase: SelectionRecord['phase'],
    reason: string,
  ): void {
    selected.set(c.entry.file, c);
    for (const f of c.features) {
      selectedCounts.set(f, (selectedCounts.get(f) ?? 0) + 1);
      covered.add(f);
    }
    picks.push({
      file: c.entry.file,
      bytes: c.entry.bytes,
      features: c.features.size,
      phase,
      reason,
    });
  }

  while (covered.size < allFeatures.size) {
    let best: { candidate: Candidate; gain: number } | null = null;
    for (const c of candidates) {
      if (selected.has(c.entry.file)) continue;
      let gain = 0;
      for (const f of c.features) if (!covered.has(f)) gain += 1;
      if (gain === 0) continue;
      if (best === null) {
        best = { candidate: c, gain };
        continue;
      }
      const cmp = compareCandidatesDescGain(
        { gain, bytes: c.entry.bytes, file: c.entry.file },
        {
          gain: best.gain,
          bytes: best.candidate.entry.bytes,
          file: best.candidate.entry.file,
        },
      );
      if (cmp < 0) best = { candidate: c, gain };
    }
    if (best === null) break;
    recordPick(best.candidate, 'set-cover', `+${best.gain} new features`);
  }
  console.log(
    `[curate] phase A set-cover: ${selected.size} articles, ${covered.size}/${allFeatures.size} features`,
  );

  // Phase B: K-coverage. Process features in ascending corpus rarity so
  // the rare ones grab their (few) representatives before commoner
  // features dilute the budget.
  const featuresByRarity = [...allFeatures].sort((a, b) => {
    const ca = globalCounts.get(a) ?? 0;
    const cb = globalCounts.get(b) ?? 0;
    if (ca !== cb) return ca - cb;
    return a.localeCompare(b);
  });

  for (const feat of featuresByRarity) {
    const have = selectedCounts.get(feat) ?? 0;
    if (have >= K_COVERAGE) continue;
    const need = Math.min(
      K_COVERAGE - have,
      (globalCounts.get(feat) ?? 0) - have,
    );
    if (need <= 0) continue;
    const pool = candidates
      .filter((c) => !selected.has(c.entry.file) && c.features.has(feat))
      .sort(compareByDensity);
    let added = 0;
    for (const c of pool) {
      if (added >= need) break;
      recordPick(
        c,
        'k-coverage',
        `boosts ${feat} (count ${(selectedCounts.get(feat) ?? 0) + 1})`,
      );
      added += 1;
    }
  }
  console.log(`[curate] phase B k-coverage: ${selected.size} articles`);

  // Phase C: density tail.
  if (selected.size < TARGET_SIZE) {
    const tail = candidates
      .filter((c) => !selected.has(c.entry.file))
      .sort(compareByDensity);
    for (const c of tail) {
      if (selected.size >= TARGET_SIZE) break;
      recordPick(c, 'density', `${c.features.size} distinct features`);
    }
  }
  console.log(`[curate] phase C density: ${selected.size} articles`);

  if (selected.size > TARGET_SIZE) {
    console.log(
      `[curate] note: K-coverage required more than TARGET_SIZE; emitting ${selected.size} articles`,
    );
  }

  // Per-feature coverage summary in selected set.
  console.log('\n[curate] feature coverage in selected set:');
  for (const feat of featuresByRarity) {
    const have = selectedCounts.get(feat) ?? 0;
    const total = globalCounts.get(feat) ?? 0;
    const clamped = total < K_COVERAGE;
    const tag = clamped ? ' (clamped)' : '';
    console.log(
      `  ${feat.padEnd(28)}  selected=${String(have).padStart(3)}  corpus=${total}${tag}`,
    );
  }

  // Materialise golden/.
  rmSync(CORPUS_GOLDEN, { recursive: true, force: true });
  mkdirSync(CORPUS_GOLDEN, { recursive: true });

  const goldenEntries: CorpusEntry[] = [];
  const orderedSelections = [...selected.values()].sort((a, b) =>
    a.entry.file.localeCompare(b.entry.file),
  );
  for (const c of orderedSelections) {
    copyFileSync(
      resolve(CORPUS_STAGING, c.entry.file),
      resolve(CORPUS_GOLDEN, c.entry.file),
    );
    goldenEntries.push(c.entry);
  }

  writeFileSync(
    resolve(CORPUS_GOLDEN, 'index.json'),
    JSON.stringify(
      { generated_at: new Date().toISOString(), entries: goldenEntries },
      null,
      2,
    ),
    'utf8',
  );

  // Capture excluded articles. Split into two buckets:
  //   - known_divergences: documented oracle quirks (file listed in
  //     corpus/known-divergences.md). Disposition is "not a dmark bug".
  //   - regressions: unclassified failures. A non-empty list here is a
  //     to-do for the parser; under the project's current ratchet we
  //     expect this array to stay empty after each `corpus:build`.
  const knownDivergenceSet = loadKnownDivergences();
  const indexByFile = new Map(index.entries.map((e) => [e.file, e]));
  const excluded = survey.results
    .filter(
      (r) =>
        r.kind !== 'ok' ||
        (oracleChecked && r.oracle !== 'ok' && r.oracle !== 'skipped'),
    )
    .map((r) => ({
      file: r.file,
      bytes: r.bytes,
      kind: r.kind,
      oracle: r.oracle,
      title: indexByFile.get(r.file)?.title,
    }))
    .sort((a, b) => a.bytes - b.bytes);
  const knownDivergences = excluded.filter((r) =>
    knownDivergenceSet.has(r.file),
  );
  const regressions = excluded.filter((r) => !knownDivergenceSet.has(r.file));
  console.log(
    `[curate] excluded=${excluded.length}  documented=${knownDivergences.length}  regressions=${regressions.length}`,
  );

  writeFileSync(
    resolve(CORPUS_GOLDEN, 'curation.json'),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        staging_size: index.entries.length,
        survey_clean: okEntries.length,
        target_size: TARGET_SIZE,
        k_coverage: K_COVERAGE,
        distinct_features: allFeatures.size,
        selected: picks,
        known_divergences: knownDivergences,
        regressions,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    `\n[curate] wrote ${goldenEntries.length} fixtures to ${CORPUS_GOLDEN}`,
  );
  console.log(`[curate] phases: ${tally(picks)}`);
}

function tally(picks: { phase: string }[]): string {
  const counts = new Map<string, number>();
  for (const p of picks) counts.set(p.phase, (counts.get(p.phase) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${k}=${v}`).join(' ');
}

// Parse corpus/known-divergences.md for `.dtext` filename entries. The
// markdown is the human-readable source of truth (each cluster has its
// rationale alongside the file list), and this scan picks the filenames
// up from any markdown list item that looks like `` `<file>.dtext` ``.
function loadKnownDivergences(): Set<string> {
  try {
    const md = readFileSync(KNOWN_DIVERGENCES, 'utf8');
    const files = new Set<string>();
    for (const m of md.matchAll(/`([^`\n]+\.dtext)`/g)) {
      files.add(m[1]);
    }
    return files;
  } catch {
    return new Set<string>();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
