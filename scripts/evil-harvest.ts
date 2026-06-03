// Workbench: read every pre-built evil-parser-destroyer slice, run each
// case through dmark + the disk-cached oracle, and dump mismatches as JSON.
//
// Usage:
//   npx tsx scripts/evil-harvest.ts           # all slices
//   npx tsx scripts/evil-harvest.ts --limit=8 # first 8 slices
//
// Output: .evil-failures.json (gitignored, scratch only).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDText } from '../src/dtext';
import type { Case } from '../test/evil/evil-parser-destroyer/cases';
import { diskRenderViaOracle } from '../test/evil/evil-parser-destroyer/disk-oracle';

const HERE = dirname(fileURLToPath(import.meta.url));
const SLICES_DIR = resolve(
  HERE,
  '..',
  'test',
  'evil',
  'evil-parser-destroyer',
  '.case-slices',
);
const SLICES = 64;
const OUT = resolve(HERE, '..', '.evil-failures.json');

interface Failure {
  slice: number;
  name: string;
  input: string;
  dmark: string;
  oracle: string;
  allowColor: boolean;
  maxThumbs: number;
}

function loadSlice(i: number): Case[] {
  const file = resolve(SLICES_DIR, `slice-${i}.json`);
  if (!existsSync(file))
    throw new Error(`missing slice ${i}; run build-slices.mjs`);
  return JSON.parse(readFileSync(file, 'utf8')) as Case[];
}

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const sliceLimit = limitArg ? Number(limitArg.split('=')[1]) : SLICES;

async function run(): Promise<void> {
  const failures: Failure[] = [];
  let total = 0;
  for (let s = 0; s < sliceLimit; s++) {
    const slice = loadSlice(s);
    for (const c of slice) {
      total++;
      const allowColor = c.allowColor ?? true;
      const maxThumbs = c.maxThumbs ?? 75;
      const oracle = await diskRenderViaOracle(c.input, {
        allow_color: allowColor,
        max_thumbs: maxThumbs,
      });
      let dmark: string;
      try {
        dmark = parseDText(c.input, { allowColor, maxThumbs });
      } catch (err) {
        dmark = `__THROW__ ${(err as Error).message}`;
      }
      if (dmark !== oracle.html) {
        failures.push({
          slice: s,
          name: c.name,
          input: c.input,
          dmark,
          oracle: oracle.html,
          allowColor,
          maxThumbs,
        });
      }
    }
    if (s % 8 === 7) {
      process.stderr.write(
        `slice ${s + 1}/${sliceLimit}: ${failures.length} fails / ${total} total\n`,
      );
    }
  }
  writeFileSync(OUT, JSON.stringify(failures, null, 2));
  console.log(JSON.stringify({ total, failed: failures.length, out: OUT }));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
