// Side-by-side benchmark: Dmark dtext->html pipeline vs the ruby reference
// renderer (e621ng/dtext gem) running inside the oracle docker container.
//
// What this measures:
//   - Dmark: in-process `parseDText` (parse + render in TS).
//   - Oracle: HTTP POST to the running container's /render endpoint, which
//     parses + renders via the ruby gem and returns the HTML string. Includes
//     loopback HTTP overhead.
//
// The HTTP overhead matters: the oracle is consumed *as* an HTTP service in
// dmark's test harness, so its in-test cost is what we benchmark against. A
// pure-CPU comparison would ignore the dispatch path and overstate ruby's
// throughput in any context where dmark might replace it.
//
// Usage:
//   tsx scripts/bench-vs-oracle.ts [iters] [--max-bytes N]
//
// Requires the oracle image: `yarn oracle:build` once, then this script
// spawns a container automatically (testcontainers manages the lifecycle).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

import { parseDText } from '../src/dtext';

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
const iters = Number(positional[0] ?? 10);
const maxBytesIdx = process.argv.indexOf('--max-bytes');
const maxBytes =
  maxBytesIdx >= 0 ? Number(process.argv[maxBytesIdx + 1]) : Number.POSITIVE_INFINITY;

const ROOT = process.cwd();
const GOLDEN = resolve(ROOT, 'corpus', 'golden');
const INDEX = resolve(GOLDEN, 'index.json');
if (!existsSync(INDEX)) {
  console.error('corpus/golden/index.json missing. Run `yarn corpus:fetch`.');
  process.exit(1);
}

const idx = JSON.parse(readFileSync(INDEX, 'utf8')) as Index;
const fixtures = idx.entries
  .filter((e) => e.bytes <= maxBytes)
  .map((e) => ({
    name: e.file,
    text: readFileSync(resolve(GOLDEN, e.file), 'utf8'),
    bytes: e.bytes,
  }));

if (fixtures.length === 0) {
  console.error('no fixtures matched filter');
  process.exit(1);
}

function pct(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}
const median = (a: number[]) => pct(a, 50);
const fmt = (n: number) => n.toFixed(2).padStart(9);
const fmtInt = (n: number) => String(n).padStart(8);

interface Row {
  name: string;
  bytes: number;
  dmark: number[];
  oracle: number[];
}

async function startOracle(): Promise<{ url: string; stop: () => Promise<void> }> {
  if (process.env.DMARK_ORACLE_URL) {
    const url = process.env.DMARK_ORACLE_URL;
    console.log(`[oracle] using preset DMARK_ORACLE_URL=${url}`);
    return { url, stop: async () => {} };
  }
  console.log('[oracle] starting container dmark-oracle:dev ...');
  const container: StartedTestContainer = await new GenericContainer('dmark-oracle:dev')
    .withExposedPorts(4567)
    .withWaitStrategy(
      Wait.forHttp('/health', 4567).forStatusCode(200).withStartupTimeout(30_000),
    )
    .start();
  const host = container.getHost();
  const port = container.getMappedPort(4567);
  const url = `http://${host}:${port}`;
  const health = (await (await fetch(`${url}/health`)).json()) as {
    dtext_version: string;
  };
  console.log(`[oracle] dtext ${health.dtext_version} ready at ${url}`);
  return { url, stop: () => container.stop().then(() => undefined) };
}

async function oracleRender(url: string, dtext: string): Promise<void> {
  const res = await fetch(`${url}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dtext,
      options: { allow_color: true, max_thumbs: 75 },
    }),
  });
  if (!res.ok) throw new Error(`oracle HTTP ${res.status}`);
  await res.text();
}

const opts = { allowColor: true, maxThumbs: 75 };

async function main() {
  const oracle = await startOracle();
  try {
    // Warm both pipelines once per fixture so the comparison isn't dominated
    // by cold-start: V8 tier-up on the dmark side, ruby/gem warmup on the oracle.
    console.log(`[warm] running each fixture once on both pipelines ...`);
    for (const f of fixtures) {
      parseDText(f.text, opts);
      await oracleRender(oracle.url, f.text);
    }

    const rows: Row[] = [];
    for (const f of fixtures) {
      const dm: number[] = [];
      const or: number[] = [];
      for (let i = 0; i < iters; i++) {
        const t0 = performance.now();
        parseDText(f.text, opts);
        const t1 = performance.now();
        await oracleRender(oracle.url, f.text);
        const t2 = performance.now();
        dm.push(t1 - t0);
        or.push(t2 - t1);
      }
      rows.push({ name: f.name, bytes: f.bytes, dmark: dm, oracle: or });
    }

    rows.sort((a, b) => b.bytes - a.bytes);
    console.log('');
    console.log(
      `bench-vs-oracle: ${fixtures.length} fixtures, ${iters} iters each` +
        (Number.isFinite(maxBytes) ? `, maxBytes=${maxBytes}` : ''),
    );
    console.log(
      '   bytes      dmark      oracle    ratio  fixture',
    );
    let totDm = 0;
    let totOr = 0;
    for (const r of rows) {
      const d = median(r.dmark);
      const o = median(r.oracle);
      totDm += d;
      totOr += o;
      const ratio = (o / d).toFixed(2).padStart(7);
      console.log(
        `  ${fmtInt(r.bytes)} ${fmt(d)}ms ${fmt(o)}ms ${ratio}x  ${basename(r.name)}`,
      );
    }
    console.log('');
    console.log(`aggregate sum-of-medians:`);
    console.log(`  dmark   ${fmt(totDm)}ms`);
    console.log(`  oracle  ${fmt(totOr)}ms`);
    console.log(`  ratio   ${(totOr / totDm).toFixed(2)}x  (oracle / dmark; >1 means dmark is faster)`);

    const allDm = rows.map((r) => median(r.dmark));
    const allOr = rows.map((r) => median(r.oracle));
    const dmMed = median(allDm);
    const orMed = median(allOr);
    console.log(`\nper-fixture median:`);
    console.log(`  dmark median-of-medians   ${fmt(dmMed)}ms`);
    console.log(`  oracle median-of-medians  ${fmt(orMed)}ms`);
    console.log(`  median ratio              ${(orMed / dmMed).toFixed(2)}x`);

    const cohort20kb = rows.filter((r) => r.bytes <= 20480);
    if (cohort20kb.length > 0) {
      const c20Dm = median(cohort20kb.map((r) => median(r.dmark)));
      const c20Or = median(cohort20kb.map((r) => median(r.oracle)));
      const c20DmP95 = pct(cohort20kb.flatMap((r) => r.dmark), 95);
      const c20OrP95 = pct(cohort20kb.flatMap((r) => r.oracle), 95);
      console.log(
        `\n≤20KB cohort (${cohort20kb.length} fixtures):` +
          `\n  dmark   median ${fmt(c20Dm)}ms  p95 ${fmt(c20DmP95)}ms` +
          `\n  oracle  median ${fmt(c20Or)}ms  p95 ${fmt(c20OrP95)}ms` +
          `\n  ratio   median ${(c20Or / c20Dm).toFixed(2)}x  p95 ${(c20OrP95 / c20DmP95).toFixed(2)}x`,
      );
    }
  } finally {
    await oracle.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
