// Probe the oracle to estimate pure ruby gem time vs HTTP overhead.
// Strategy:
//   - tiny inputs ("a", "x") give us round-trip + ruby parse-overhead baseline
//   - subtracting that floor from a fixture's render time approximates the
//     ruby gem's intrinsic cost on the same input
//
// The numbers are *estimates*: HTTP latency varies, the ruby parse cost is
// not perfectly linear in input size, and the JSON marshalling cost grows
// with output size. But it's enough to separate "oracle is slow because
// HTTP" from "oracle is slow because ruby."

import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from 'testcontainers';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const ROOT = process.cwd();
const GOLDEN = resolve(ROOT, 'corpus', 'golden');
const INDEX = resolve(GOLDEN, 'index.json');

interface Index {
  entries: { bytes: number; file: string }[];
}
const idx = JSON.parse(readFileSync(INDEX, 'utf8')) as Index;
const fixtures = idx.entries.map((e) => ({
  name: e.file,
  text: readFileSync(resolve(GOLDEN, e.file), 'utf8'),
  bytes: e.bytes,
}));

const ITERS = 15;

async function startOracle(): Promise<{
  url: string;
  stop: () => Promise<void>;
}> {
  if (process.env.DMARK_ORACLE_URL) {
    return { url: process.env.DMARK_ORACLE_URL, stop: async () => {} };
  }
  console.log('[oracle] starting container ...');
  const c: StartedTestContainer = await new GenericContainer('dmark-oracle:dev')
    .withExposedPorts(4567)
    .withWaitStrategy(
      Wait.forHttp('/health', 4567)
        .forStatusCode(200)
        .withStartupTimeout(30_000),
    )
    .start();
  const url = `http://${c.getHost()}:${c.getMappedPort(4567)}`;
  console.log(`[oracle] ready at ${url}`);
  return { url, stop: () => c.stop().then(() => undefined) };
}

async function timeRender(url: string, dtext: string): Promise<number> {
  const t0 = performance.now();
  const r = await fetch(`${url}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dtext,
      options: { allow_color: true, max_thumbs: 75 },
    }),
  });
  await r.text();
  return performance.now() - t0;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

async function main() {
  const oracle = await startOracle();
  try {
    // Warm
    for (let i = 0; i < 5; i++) await timeRender(oracle.url, 'a');

    // HTTP+ruby floor: the cost of rendering a 1-char input is dominated by
    // HTTP round-trip and ruby/sinatra dispatch. This serves as the baseline
    // overhead that every render call pays regardless of input.
    const floorSamples: number[] = [];
    for (let i = 0; i < 30; i++)
      floorSamples.push(await timeRender(oracle.url, 'a'));
    const floor = median(floorSamples);
    console.log(
      `\nHTTP + ruby dispatch floor (input='a'): ${floor.toFixed(2)}ms`,
    );

    // For a representative spread of fixture sizes, time both and report
    // the floor-subtracted value as the "ruby gem only" estimate.
    const sample = fixtures
      .slice()
      .sort((a, b) => b.bytes - a.bytes)
      .filter((_, i) => i % 5 === 0); // every 5th, by size

    console.log('');
    console.log(
      '   bytes      total    floor-corrected ratio (raw / corrected)  fixture',
    );
    for (const f of sample) {
      const samples: number[] = [];
      for (let i = 0; i < ITERS; i++)
        samples.push(await timeRender(oracle.url, f.text));
      const med = median(samples);
      const corrected = Math.max(0, med - floor);
      console.log(
        `  ${String(f.bytes).padStart(8)} ${med.toFixed(2).padStart(8)}ms ${corrected
          .toFixed(2)
          .padStart(8)}ms  ${basename(f.name)}`,
      );
    }
  } finally {
    await oracle.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
