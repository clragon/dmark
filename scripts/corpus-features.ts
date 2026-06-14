// Quick analysis pass over the surveyed corpus: parses each "ok" article,
// extracts AST feature kinds, prints global coverage stats. Used to size
// the curated subset (companion to scripts/curate-corpus.ts).
//
// Heap-cap this when running, since some articles can balloon: e.g.
//   NODE_OPTIONS=--max-old-space-size=1024 npx tsx scripts/corpus-features.ts
// The script does NOT spawn isolated workers; it skips the same files the
// survey flagged as non-ok so it cannot hit the known crasher.

import { readFileSync } from 'node:fs';
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

interface SurveyResult {
  file: string;
  bytes: number;
  kind: string;
}

interface SurveyReport {
  results: SurveyResult[];
}

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CORPUS_STAGING = resolve(REPO_ROOT, 'corpus', 'staging');
const INDEX_PATH = resolve(CORPUS_STAGING, 'index.json');
const SURVEY_PATH = resolve(CORPUS_STAGING, 'survey.json');

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
    if (k === 'source') continue; // ltable raw stash; not structural
    if (v && typeof v === 'object') walkFeatures(v, out);
  }
}

async function main(): Promise<void> {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as {
    entries: CorpusEntry[];
  };
  const survey = JSON.parse(readFileSync(SURVEY_PATH, 'utf8')) as SurveyReport;
  const okFiles = new Set(
    survey.results.filter((r) => r.kind === 'ok').map((r) => r.file),
  );

  const okEntries = index.entries.filter((e) => okFiles.has(e.file));
  console.log(`[features] analysing ${okEntries.length} ok articles`);

  const featureGlobal = new Map<string, number>();
  const articleFeatures: { file: string; bytes: number; features: string[] }[] =
    [];

  let processed = 0;
  for (const entry of okEntries) {
    const dtext = readFileSync(resolve(CORPUS_STAGING, entry.file), 'utf8');
    const ast = parseDTextToAst(dtext, {
      allowColor: true,
      maxThumbs: 75,
    }) as DocumentNode;
    const feats = new Set<string>();
    walkFeatures(ast, feats);
    const list = [...feats].sort();
    for (const f of list) {
      featureGlobal.set(f, (featureGlobal.get(f) ?? 0) + 1);
    }
    articleFeatures.push({
      file: entry.file,
      bytes: entry.bytes,
      features: list,
    });
    processed += 1;
    if (processed % 1000 === 0) {
      console.log(`[features] ${processed}/${okEntries.length}`);
    }
  }

  const sorted = [...featureGlobal.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    `\nfeature coverage across ${okEntries.length} articles (${sorted.length} distinct):`,
  );
  for (const [feat, n] of sorted) {
    const pct = ((n / okEntries.length) * 100).toFixed(1).padStart(5);
    console.log(`  ${feat.padEnd(28)}  ${String(n).padStart(6)}  ${pct}%`);
  }

  console.log('\ndistinct-feature distribution per article:');
  const buckets = new Map<number, number>();
  for (const a of articleFeatures) {
    buckets.set(a.features.length, (buckets.get(a.features.length) ?? 0) + 1);
  }
  const widths = [...buckets.keys()].sort((a, b) => a - b);
  for (const w of widths) {
    console.log(
      `  ${String(w).padStart(3)} features: ${buckets.get(w)} articles`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
