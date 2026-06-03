// Bisect helper used to localize a parser hang/heap-blow.
// Usage:
//   tsx scripts/bisect-heap.ts <fixture-path> <slice-start> <slice-end>
// Exits 0 if parse completes within budget, 124 if budget exceeded
// (parent's interpretation), or non-zero on throw/OOM.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseDText } from '../src/dtext';

const [, , fixture, startStr, endStr, budgetStr] = process.argv;
if (!fixture || !startStr || !endStr) {
  console.error('usage: bisect-heap <fixture> <start> <end> [budgetMs]');
  process.exit(2);
}
const start = Number(startStr);
const end = Number(endStr);
const budgetMs = budgetStr ? Number(budgetStr) : 4000;
const text = readFileSync(resolve(process.cwd(), fixture), 'utf8').slice(
  start,
  end,
);

const t0 = Date.now();
const timer = setTimeout(() => {
  const ms = Date.now() - t0;
  console.error(`TIMEOUT after ${ms}ms (budget ${budgetMs}ms)`);
  process.exit(124);
}, budgetMs);

try {
  parseDText(text, { allowColor: true, maxThumbs: 75 });
  const ms = Date.now() - t0;
  clearTimeout(timer);
  console.log(`OK ${ms}ms (slice ${start}..${end} = ${text.length} bytes)`);
  process.exit(0);
} catch (e) {
  clearTimeout(timer);
  console.error(`THROW: ${(e as Error).message}`);
  process.exit(1);
}
