// Disk-cached oracle wrapper. The shared `renderViaOracle` keeps an in-memory
// cache only, so every test run pays the full HTTP roundtrip for every unique
// input. With 30k+ probes across 48 slice-workers, that is the dominant cost.
//
// This wrapper hashes the (input, options) tuple, looks up
// `.oracle-cache/<sha>.json` on disk, and only hits the live oracle on a miss.
// All workers share the same on-disk store, so subsequent runs are instant.

import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderViaOracle,
  type OracleRenderOptions,
  type OracleRenderResult,
} from '../../oracle';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(HERE, '.oracle-cache');

if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(input: string, options: OracleRenderOptions): string {
  const key = JSON.stringify([input, options]);
  const hash = createHash('sha256').update(key).digest('hex');
  return resolve(CACHE_DIR, `${hash}.json`);
}

export async function diskRenderViaOracle(
  input: string,
  options: OracleRenderOptions = {},
): Promise<OracleRenderResult> {
  const path = cachePath(input, options);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8')) as OracleRenderResult;
  }
  const result = await renderViaOracle(input, options);
  // Write atomically: a plain writeFileSync truncates the destination before
  // writing, so a concurrent reader can observe an empty file between the
  // truncate and the write. Write to a temp file and rename, which is atomic
  // on POSIX and lets last-write-wins resolve harmlessly (oracle is
  // deterministic for a given input+options).
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(result));
    renameSync(tmp, path);
  } catch {
    try {
      unlinkSync(tmp);
    } catch {
      /* nothing to clean up */
    }
  }
  return result;
}
