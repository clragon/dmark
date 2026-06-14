// Shared runner: each probes-N.test.ts asks for slice index N; the runner
// executes the corresponding chunk of `cases`. SLICES is the total number
// of files.
//
// Performance: per-slice tests use `it.concurrent` so vitest fans the oracle
// HTTP calls out in parallel up to its built-in concurrent limit. The big
// cost is the sequential HTTP roundtrip per oracle render; running tests
// concurrently lets dozens of those overlap.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { convertDTextToHtml } from '@dmark/convert';
import { diskRenderViaOracle } from './disk-oracle';
import type { Case } from './cases';

export const SLICES = 64;

const HERE = dirname(fileURLToPath(import.meta.url));
const SLICES_DIR = resolve(HERE, '.case-slices');

function loadSlice(index: number): Case[] {
  // Pre-built slice JSON is the only supported source. Run
  //   npx tsx test/evil/evil-parser-destroyer/build-slices.mjs
  // once after editing cases.ts. Skipping the eager 30k+ object literal
  // evaluation in cases.ts is what keeps each worker's heap small.
  const file = resolve(SLICES_DIR, `slice-${index}.json`);
  if (!existsSync(file)) {
    throw new Error(
      `slice ${index} not pre-built. Run: npx tsx test/evil/evil-parser-destroyer/build-slices.mjs`,
    );
  }
  return JSON.parse(readFileSync(file, 'utf8')) as Case[];
}

export function runSlice(index: number): void {
  const slice = loadSlice(index);

  describe(`Evil Parser Destroyer probes [slice ${index + 1}/${SLICES}]`, () => {
    for (const c of slice) {
      it(c.name, async () => {
        const oracle = await diskRenderViaOracle(c.input, {
          allow_color: c.allowColor ?? true,
          max_thumbs: c.maxThumbs ?? 75,
        });
        const dmark = convertDTextToHtml(c.input, {
          allowColor: c.allowColor ?? true,
          maxThumbs: c.maxThumbs ?? 75,
        });
        // Faithfulness invariant: dmark output must equal oracle output.
        // When the oracle errors (e.g. NUL byte that ruby rejects as
        // invalid UTF-8) it returns `{ error, html: undefined }`. The
        // parity check still runs - dmark is expected to produce some
        // defined string output, never the raw bytes that crashed ruby.
        // Comparison is done by hand (instead of expect(...).toBe(...)) so
        // that on mismatch only a short truncated diff is retained, never
        // the full HTML strings; thousands of failing tests with long
        // expected/received fields would otherwise OOM the worker.
        const oracleHtml = typeof oracle.html === 'string' ? oracle.html : '';
        if (dmark !== oracleHtml) {
          const max = 80;
          const a = dmark.length > max ? dmark.slice(0, max) + '...' : dmark;
          const b =
            oracleHtml.length > max
              ? oracleHtml.slice(0, max) + '...'
              : oracleHtml;
          const errSuffix = oracle.error
            ? ` (oracle error: ${oracle.error})`
            : '';
          throw new Error(
            `dmark != oracle (input=${JSON.stringify(c.input.slice(0, 60))})${errSuffix}: dmark=${JSON.stringify(a)} oracle=${JSON.stringify(b)}`,
          );
        }
      });
    }
  });
}
