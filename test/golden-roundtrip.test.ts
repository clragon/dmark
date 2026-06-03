// Golden-corpus round-trip harness for the dtext formatter.
//
// For every fixture under `corpus/golden`, runs the round-trip property
// from `docs/mapping.md`:
//
//   parseDText(formatDText(parseDText(src)).output) ≡ parseDText(src)
//
// Corpus-scale companion to `test/dtext/round-trip.test.ts`, which
// exercises the same property on hand-curated fixtures spanning the
// construct surface. Hand fixtures cover the intended shapes; the golden
// corpus exercises the encountered shapes (real wiki pages with salvage
// paths, edge-case interactions, uncommon constructs).
//
// Sibling pattern to `test/golden-baseline.test.ts`:
//   - golden-baseline checks `parseDText → renderHTML` against the oracle
//     (single-pipeline correctness)
//   - golden-roundtrip checks `parse → format → parse` AST stability
//     (formatter-inverse correctness)
//
// Pass-rate floor uses the same ratchet discipline: bump up as fixes land,
// never lower. A divergence at corpus scale that is not one of the
// documented ADR skips is a real bug.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseDTextToAST } from '@dmark/dtext';
import { formatDText } from '@dmark/dtext';
import { astEqual } from './md/ast-equal';
import type { DocumentNode } from '../src/ast';

interface CorpusEntry {
  id: number;
  title: string;
  slug: string;
  bytes: number;
  file: string;
}

interface CorpusIndex {
  generated_at: string;
  entries: CorpusEntry[];
}

const CORPUS_GOLDEN = resolve(process.cwd(), 'corpus', 'golden');
const INDEX_PATH = resolve(CORPUS_GOLDEN, 'index.json');

// One-way pass-rate ratchet. Each formatter / parser fix that closes a
// real corpus divergence bumps it up; never lower it. Same discipline as
// `golden-baseline.test.ts`'s PHASE_1_FLOOR.
const ROUND_TRIP_FLOOR = 1.0;
const MAX_DIFF_CHARS = 800;

// Per-fixture skip list for known-failing corpus rows where the divergence
// is documented (ADR citation) rather than a regression. Add entries with
// the ADR number if a corpus fixture surfaces a documented asymmetry that
// the ratchet cannot capture.
const SKIP_FILES: ReadonlyMap<string, string> = new Map([]);

function loadIndex(): CorpusIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as CorpusIndex;
}

const index = loadIndex();
const suite = index ? describe : describe.skip;

suite('dtext round-trip across golden corpus', () => {
  if (!index) {
    it('corpus is empty. Run `npm run corpus:fetch`', () => {
      expect.fail('corpus/golden/index.json not found');
    });
    return;
  }

  it(`round-trip pass rate >= ${(ROUND_TRIP_FLOOR * 100).toFixed(0)}% across ${index.entries.length} fixtures`, () => {
    let passed = 0;
    const mismatches: { file: string; bytes: number; diff: string }[] = [];
    const skipped: { file: string; bytes: number; reason: string }[] = [];

    for (const entry of index.entries) {
      const skipReason = SKIP_FILES.get(entry.file);
      if (skipReason !== undefined) {
        skipped.push({
          file: entry.file,
          bytes: entry.bytes,
          reason: skipReason,
        });
        continue;
      }

      const dtext = readFileSync(resolve(CORPUS_GOLDEN, entry.file), 'utf8');
      // Wiki render options to match `golden-baseline` (so any parser
      // option-sensitive shapes stay consistent across the two harnesses).
      const opts = { allowColor: true, maxThumbs: 75 };
      const ast1 = parseDTextToAST(dtext, opts) as DocumentNode;
      const formatted = formatDText(ast1).output;
      const ast2 = parseDTextToAST(formatted, opts) as DocumentNode;
      const cmp = astEqual(ast1, ast2);
      if (cmp.equal) {
        passed++;
      } else {
        mismatches.push({
          file: entry.file,
          bytes: entry.bytes,
          diff: cmp.diff?.slice(0, MAX_DIFF_CHARS) ?? '',
        });
      }
    }

    const total = index.entries.length;
    const pct = passed / total;
    const lines: string[] = [
      `[golden-roundtrip] ${passed}/${total} (${(pct * 100).toFixed(1)}%) pass, ${mismatches.length} mismatch, ${skipped.length} skipped`,
    ];
    if (skipped.length > 0) {
      lines.push('[golden-roundtrip] skipped (documented divergences):');
      for (const s of skipped.sort((a, b) => a.bytes - b.bytes)) {
        lines.push(`  ${s.bytes}b  ${s.file}  -- ${s.reason}`);
      }
    }
    if (mismatches.length > 0) {
      lines.push('[golden-roundtrip] AST mismatches:');
      for (const m of mismatches.sort((a, b) => a.bytes - b.bytes)) {
        lines.push(`  ${m.bytes}b  ${m.file}\n    ${m.diff}`);
      }
    }
    const summary = '\n' + lines.join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    if (pct < ROUND_TRIP_FLOOR) {
      expect.fail(
        `round-trip pass rate ${(pct * 100).toFixed(1)}% below floor ${(ROUND_TRIP_FLOOR * 100).toFixed(0)}%${summary}`,
      );
    }
  });
});
