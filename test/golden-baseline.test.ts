// Baseline golden test for the dtext side of Dmark.
//
// For every fixture under corpus/golden, renders the dtext via Dmark
// (parse → AST → render-html) and via the ruby oracle (DText.parse), and
// checks the two outputs are dom-equal under our normalization rules.
//
// SKIP_FILES holds fixtures known to blow the parser's heap (unbounded
// allocations on certain nested constructs). Each is a real phase-2 bug to
// fix; counted as failures here so the floor still has teeth.
//
// This isolates the dtext-side correctness of the port. Markdown is not
// involved yet. The pass rate here is the floor for the eventual
// dtext → md → html target.
//
// If corpus/golden is missing, the suite is skipped with a clear message.
// Run `yarn corpus:fetch` to populate it.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { domEqual } from './dom-equal';
import { renderViaOracle } from './oracle';

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
// One-way pass-rate ratchet. Each parser fix bumps it up; never lower it,
// since lowering hides regressions. Phase 1 started at 0 (honest baseline).
const PHASE_1_FLOOR = 0.96;
const MAX_DIFF_CHARS = 240;

const SKIP_FILES: ReadonlyMap<string, string> = new Map([
  [
    '9169-e621_cheatsheet.dtext',
    'parser blows the heap on nested [sup][#anchor][[#wikilink|N]][/sup] footnote constructs',
  ],
  [
    '12274-titanmelon_lists.dtext',
    'parser blows the heap on this fixture (cause not yet localized)',
  ],
]);

function loadIndex(): CorpusIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as CorpusIndex;
}

const index = loadIndex();
const suite = index ? describe : describe.skip;

suite('dtext baseline against ruby oracle', () => {
  if (!index) {
    it('corpus is empty. Run `yarn corpus:fetch`', () => {
      expect.fail('corpus/golden/index.json not found');
    });
    return;
  }

  it(
    `pass rate >= ${(PHASE_1_FLOOR * 100).toFixed(0)}% across ${index.entries.length} fixtures`,
    async () => {
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
        // Wiki pages render with these options on production e621:
        //   format_text(body, allow_color: true, max_thumbs: 75)
        // (app/views/wiki_pages/show.html.erb). Match both sides to that.
        const renderOpts = { allow_color: true, max_thumbs: 75 };
        const oracleHtml = (await renderViaOracle(dtext, renderOpts)).html;
        const dmarkHtml = parseDText(dtext, {
          allowColor: renderOpts.allow_color,
          maxThumbs: renderOpts.max_thumbs,
        });
        const cmp = domEqual(dmarkHtml, oracleHtml);

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
        `[golden-baseline] ${passed}/${total} (${(pct * 100).toFixed(1)}%) pass, ${mismatches.length} mismatch, ${skipped.length} skipped`,
      ];
      if (skipped.length > 0) {
        lines.push('[golden-baseline] skipped (known parser bugs):');
        for (const s of skipped.sort((a, b) => a.bytes - b.bytes)) {
          lines.push(`  ${s.bytes}b  ${s.file}  -- ${s.reason}`);
        }
      }
      if (mismatches.length > 0) {
        lines.push('[golden-baseline] dom mismatches:');
        for (const m of mismatches.sort((a, b) => a.bytes - b.bytes)) {
          lines.push(`  ${m.bytes}b  ${m.file}\n    ${m.diff}`);
        }
      }
      const summary = '\n' + lines.join('\n');
      // eslint-disable-next-line no-console
      console.log(summary);

      if (pct < PHASE_1_FLOOR) {
        expect.fail(
          `pass rate ${(pct * 100).toFixed(1)}% below floor ${(PHASE_1_FLOOR * 100).toFixed(0)}%${summary}`,
        );
      }
    },
  );
});
