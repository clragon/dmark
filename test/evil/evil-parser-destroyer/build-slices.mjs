// One-shot pre-builder for slice JSON files. Run this once after editing
// cases.ts; it imports the full case array and writes each slice's portion
// to its own JSON file under .case-slices/. Test workers then load only
// their own slice file, instead of materializing all ~30k cases per worker.
//
// Usage:
//   npx tsx test/evil/evil-parser-destroyer/build-slices.mjs

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '.case-slices');

const { cases } = await import('./cases.ts');
// Keep this in lockstep with `SLICES` in run-slice.ts.
const SLICES = 64;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Wipe stale slice files (a prior build at a different SLICES count would
// leave orphans).
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.json')) unlinkSync(resolve(OUT_DIR, f));
}

const total = cases.length;
const sliceSize = Math.ceil(total / SLICES);
for (let i = 0; i < SLICES; i++) {
  const start = i * sliceSize;
  const end = Math.min(start + sliceSize, total);
  const slice = cases.slice(start, end);
  const outPath = resolve(OUT_DIR, `slice-${i}.json`);
  writeFileSync(outPath, JSON.stringify(slice));
  console.log(`wrote ${outPath} (${slice.length} cases)`);
}

console.log(`\ndone: ${SLICES} slices, ${total} total cases.`);
