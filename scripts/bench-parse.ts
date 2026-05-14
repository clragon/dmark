// Repeatable parser benchmark for the dtext side.
//
// Loads every fixture under corpus/golden, runs parseDText N times per fixture,
// and reports per-fixture stats (median/p95) plus an aggregate. Performance
// guarantee #3 from the README: median <10ms, p95 <25ms on a ≤20KB page.
//
// Usage:
//   tsx scripts/bench-parse.ts [iters] [maxBytes]
// Defaults: iters=15, maxBytes=Infinity (use 20480 to scope to guarantee #3).

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

import { parseDText, parseDTextToAST, renderToHTML } from '../src/dtext';

interface Entry {
  id: number;
  title: string;
  slug: string;
  bytes: number;
  file: string;
}
interface Index {
  generated_at: string;
  entries: Entry[];
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
// Strip values that follow flag-style args (e.g. --label foo, --compare bar).
const flagValues = new Set<string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--label' || a === '--compare') flagValues.add(process.argv[i + 1] ?? '');
}
const cleanPositional = positional.filter((a) => !flagValues.has(a));
const itersArg = Number(cleanPositional[0] ?? 15);
const maxBytesArg = Number(cleanPositional[1] ?? Number.POSITIVE_INFINITY);
const SAVE = process.argv.includes('--save');
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const COMPARE = (() => {
  const i = process.argv.indexOf('--compare');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const ROOT = process.cwd();
const GOLDEN = resolve(ROOT, 'corpus', 'golden');
const INDEX = resolve(GOLDEN, 'index.json');
const SNAPSHOT_DIR = resolve(ROOT, 'scripts', 'bench-snapshots');

if (!existsSync(INDEX)) {
  console.error('corpus/golden/index.json missing, run yarn corpus:build');
  process.exit(1);
}

const idx = JSON.parse(readFileSync(INDEX, 'utf8')) as Index;
const fixtures = idx.entries
  .filter((e) => e.bytes <= maxBytesArg)
  .map((e) => ({
    name: e.file,
    text: readFileSync(resolve(GOLDEN, e.file), 'utf8'),
    bytes: e.bytes,
  }));

if (fixtures.length === 0) {
  console.error('no fixtures matched filter');
  process.exit(1);
}

const opts = { allowColor: true, maxThumbs: 75 };

function pct(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return sorted[idx];
}
function median(arr: number[]): number {
  return pct(arr, 50);
}

const fmt = (n: number) => n.toFixed(2).padStart(8);
const fmtInt = (n: number) => String(n).padStart(8);

const SPLIT = process.argv.includes('--split');

// Warm V8 by parsing each fixture twice off-record so the optimizer has run.
for (const f of fixtures) {
  parseDText(f.text, opts);
  parseDText(f.text, opts);
}

if (SPLIT) {
  // Diagnostic mode: time parse-only and render-only separately to surface
  // which side dominates. Skips the comparison/save flow.
  const splitResults: { name: string; bytes: number; pMed: number; rMed: number; tMed: number }[] = [];
  for (const f of fixtures) {
    const parseS: number[] = [];
    const renderS: number[] = [];
    const totalS: number[] = [];
    for (let i = 0; i < itersArg; i++) {
      const a = performance.now();
      const ast = parseDTextToAST(f.text, opts);
      const b = performance.now();
      renderToHTML(ast as never, opts);
      const c = performance.now();
      parseS.push(b - a);
      renderS.push(c - b);
      totalS.push(c - a);
    }
    splitResults.push({
      name: f.name,
      bytes: f.bytes,
      pMed: median(parseS),
      rMed: median(renderS),
      tMed: median(totalS),
    });
  }
  splitResults.sort((a, b) => b.tMed - a.tMed);
  console.log('\nsplit timing (parse vs render), top 15 by total median:');
  console.log('   bytes    parse   render    total   render%   fixture');
  for (const r of splitResults.slice(0, 15)) {
    const pct = ((r.rMed / r.tMed) * 100).toFixed(0).padStart(4);
    console.log(
      `  ${fmtInt(r.bytes)} ${fmt(r.pMed)}ms ${fmt(r.rMed)}ms ${fmt(r.tMed)}ms ${pct}%  ${basename(r.name)}`,
    );
  }
  const totParse = splitResults.reduce((s, r) => s + r.pMed, 0);
  const totRender = splitResults.reduce((s, r) => s + r.rMed, 0);
  console.log(
    `\naggregate sum-of-medians: parse=${totParse.toFixed(1)}ms render=${totRender.toFixed(1)}ms ` +
      `render-share=${((totRender / (totParse + totRender)) * 100).toFixed(0)}%`,
  );
  process.exit(0);
}

interface Result {
  name: string;
  bytes: number;
  median: number;
  p95: number;
  best: number;
  iterations: number[];
}

const results: Result[] = [];
const allIters: number[] = [];

for (const f of fixtures) {
  const samples: number[] = [];
  for (let i = 0; i < itersArg; i++) {
    const t0 = performance.now();
    parseDText(f.text, opts);
    const dt = performance.now() - t0;
    samples.push(dt);
    allIters.push(dt);
  }
  results.push({
    name: f.name,
    bytes: f.bytes,
    median: median(samples),
    p95: pct(samples, 95),
    best: Math.min(...samples),
    iterations: samples,
  });
}

results.sort((a, b) => b.median - a.median);

console.log('');
console.log(
  `bench: ${fixtures.length} fixtures, ${itersArg} iters each, maxBytes=${
    Number.isFinite(maxBytesArg) ? maxBytesArg : 'inf'
  }`,
);
console.log(
  '  bytes      median       p95      best  fixture',
);
for (const r of results.slice(0, 20)) {
  console.log(
    `  ${fmtInt(r.bytes)}  ${fmt(r.median)}ms ${fmt(r.p95)}ms ${fmt(r.best)}ms  ${basename(r.name)}`,
  );
}
if (results.length > 20) {
  console.log(`  ... (${results.length - 20} more)`);
}

const aggMedian = median(results.map((r) => r.median));
const aggP95 = pct(results.map((r) => r.p95), 95);
const aggMax = Math.max(...results.map((r) => r.median));
const totalMs = allIters.reduce((a, b) => a + b, 0);

console.log('');
console.log(`aggregate (per-fixture median across ${results.length} fixtures):`);
console.log(`  median-of-medians  ${fmt(aggMedian)}ms`);
console.log(`  p95-of-p95s        ${fmt(aggP95)}ms`);
console.log(`  worst median       ${fmt(aggMax)}ms`);
console.log(`  total time         ${fmt(totalMs)}ms across ${allIters.length} parses`);
console.log('');

const under20kb = results.filter((r) => r.bytes <= 20480);
if (under20kb.length > 0) {
  const m20 = median(under20kb.map((r) => r.median));
  const p95_20 = pct(under20kb.map((r) => r.p95), 95);
  console.log(
    `≤20KB cohort (${under20kb.length} fixtures): median ${fmt(m20)}ms, p95 ${fmt(p95_20)}ms ` +
      `(targets: <10ms, <25ms)`,
  );
}

if (SAVE) {
  if (!existsSync(SNAPSHOT_DIR)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  const label = LABEL ?? new Date().toISOString().replace(/[:.]/g, '-');
  const path = resolve(SNAPSHOT_DIR, `${label}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        label,
        iters: itersArg,
        maxBytes: Number.isFinite(maxBytesArg) ? maxBytesArg : null,
        node: process.version,
        results: results.map((r) => ({
          name: r.name,
          bytes: r.bytes,
          median: r.median,
          p95: r.p95,
          best: r.best,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`saved snapshot -> ${path}`);
}

if (COMPARE) {
  const cmpPath = resolve(SNAPSHOT_DIR, `${COMPARE}.json`);
  if (!existsSync(cmpPath)) {
    console.error(`compare snapshot not found: ${cmpPath}`);
    process.exit(0);
  }
  const prev = JSON.parse(readFileSync(cmpPath, 'utf8')) as {
    results: { name: string; median: number; p95: number; bytes: number }[];
  };
  const prevByName = new Map(prev.results.map((r) => [r.name, r]));
  const deltas: { name: string; pctMedian: number; deltaMs: number; bytes: number; before: number; after: number }[] = [];
  for (const r of results) {
    const p = prevByName.get(r.name);
    if (!p) continue;
    deltas.push({
      name: r.name,
      bytes: r.bytes,
      before: p.median,
      after: r.median,
      deltaMs: r.median - p.median,
      pctMedian: ((r.median - p.median) / p.median) * 100,
    });
  }
  deltas.sort((a, b) => a.pctMedian - b.pctMedian);
  console.log('');
  console.log(`compare vs ${COMPARE}.json (negative pct = faster):`);
  console.log('   bytes    before    after   delta    pct  fixture');
  for (const d of deltas.slice(0, 10)) {
    console.log(
      `  ${fmtInt(d.bytes)} ${fmt(d.before)}ms ${fmt(d.after)}ms ${fmt(d.deltaMs)}ms ${d.pctMedian.toFixed(1).padStart(6)}%  ${basename(d.name)}`,
    );
  }
  if (deltas.length > 10) console.log(`  ... ${deltas.length - 10} more (top 10 fastest shown)`);
  console.log('worst regressions (top 10 slowest):');
  for (const d of [...deltas].sort((a, b) => b.pctMedian - a.pctMedian).slice(0, 10)) {
    console.log(
      `  ${fmtInt(d.bytes)} ${fmt(d.before)}ms ${fmt(d.after)}ms ${fmt(d.deltaMs)}ms ${d.pctMedian.toFixed(1).padStart(6)}%  ${basename(d.name)}`,
    );
  }
  const overallBefore = median(prev.results.map((r) => r.median));
  const overallAfter = median(results.map((r) => r.median));
  console.log(
    `overall median-of-medians ${overallBefore.toFixed(2)}ms -> ${overallAfter.toFixed(2)}ms (` +
      `${(((overallAfter - overallBefore) / overallBefore) * 100).toFixed(1)}%)`,
  );
}
