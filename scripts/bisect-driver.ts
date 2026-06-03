// Drives bisect-heap.ts as a subprocess so OOM/hangs don't kill us.
// Usage:
//   tsx scripts/bisect-driver.ts <fixture-path> [budgetMs]
// Bisects on prefix length: smallest prefix that still triggers the
// bad behavior.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , fixture, budgetStr] = process.argv;
if (!fixture) {
  console.error('usage: bisect-driver <fixture> [budgetMs]');
  process.exit(2);
}
const budgetMs = budgetStr ? Number(budgetStr) : 4000;
const size = statSync(resolve(process.cwd(), fixture)).size;

function run(
  start: number,
  end: number,
): { ok: boolean; ms: number; code: number } {
  const t0 = Date.now();
  const r = spawnSync(
    'node',
    [
      '--max-old-space-size=512',
      './node_modules/tsx/dist/cli.mjs',
      'scripts/bisect-heap.ts',
      fixture,
      String(start),
      String(end),
      String(budgetMs),
    ],
    { encoding: 'utf8', timeout: budgetMs + 4000 },
  );
  const ms = Date.now() - t0;
  const code = r.status ?? -1;
  // ok if exit 0
  return { ok: code === 0, ms, code };
}

console.log(`fixture ${fixture} size ${size}, budget ${budgetMs}ms per probe`);

// First check the whole file behaves badly. If not, bail.
const whole = run(0, size);
console.log(`whole: ok=${whole.ok} code=${whole.code} ms=${whole.ms}`);
if (whole.ok) {
  console.log('whole file parses fine; nothing to bisect');
  process.exit(0);
}

// Bisect by prefix end
let lo = 0;
let hi = size;
let firstBadEnd = size;
while (lo + 1 < hi) {
  const mid = ((lo + hi) / 2) | 0;
  const r = run(0, mid);
  console.log(
    `prefix 0..${mid} (${mid}b): ok=${r.ok} code=${r.code} ms=${r.ms}`,
  );
  if (r.ok) {
    lo = mid;
  } else {
    hi = mid;
    firstBadEnd = mid;
  }
}
console.log(`first bad prefix length: ${firstBadEnd}`);

// Now bisect by start to find the minimal slice [start..firstBadEnd] that still fails.
let slo = 0;
let shi = firstBadEnd;
let lastBadStart = 0;
while (slo + 1 < shi) {
  const mid = ((slo + shi) / 2) | 0;
  const r = run(mid, firstBadEnd);
  console.log(
    `slice ${mid}..${firstBadEnd} (${firstBadEnd - mid}b): ok=${r.ok} code=${r.code} ms=${r.ms}`,
  );
  if (r.ok) {
    shi = mid;
  } else {
    slo = mid;
    lastBadStart = mid;
  }
}
console.log(
  `narrowest bad slice: ${lastBadStart}..${firstBadEnd} (${firstBadEnd - lastBadStart} bytes)`,
);
