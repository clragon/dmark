// Per-article worker for scripts/corpus-survey.ts.
//
// Reads JSON-line job records from stdin (one per file), runs the dtext
// round-trip property AND (if SURVEY_ORACLE_URL is set) compares the
// dmark HTML rendering against the ruby oracle. Emits JSON-line events
// to stdout:
//
//   {"event":"start","file":"<rel>"}                   <- before parsing
//   {"event":"done","file":"<rel>","ok":true,
//    "kind":"ok"|"diff"|"parse-error"|"format-error"|"reparse-error",
//    "ms":<number>,"diff"?:"...","error"?:"...",
//    "oracle":"ok"|"diff"|"error"|"skipped","oracleDiff"?:"..."}  <- result
//
// One event per line, flushed immediately. The driver pairs start/done
// events to detect crashes: a start with no matching done means the file
// killed the worker (heap blowup, segfault, etc.).
//
// Heap is capped externally via NODE_OPTIONS=--max-old-space-size=... so a
// runaway allocation kills only this worker, not the host.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import { parseDTextToAst, renderAstToDText } from '@dmark/dtext';
import { convertDTextToHtml } from '@dmark/convert';
import type { DocumentNode } from '../src/ast';
import { astEqual } from '../test/md/ast-equal';
import { domEqual } from '../test/dom-equal';

interface JobRecord {
  file: string;
  absPath: string;
  bytes: number;
}

type RoundTripKind =
  | 'ok'
  | 'diff'
  | 'parse-error'
  | 'format-error'
  | 'reparse-error';

type OracleKind = 'ok' | 'diff' | 'error' | 'skipped';

interface DoneEvent {
  event: 'done';
  file: string;
  ok: boolean;
  kind: RoundTripKind;
  ms: number;
  diff?: string;
  error?: string;
  oracle: OracleKind;
  oracleDiff?: string;
  oracleError?: string;
}

const DIFF_LIMIT = 600;
const ORACLE_URL = process.env.SURVEY_ORACLE_URL ?? '';

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '...' : text;
}

async function callOracle(
  dtext: string,
): Promise<{ html: string } | { error: string }> {
  try {
    const res = await fetch(`${ORACLE_URL}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dtext,
        options: { allow_color: true, max_thumbs: 75 },
      }),
    });
    const json = (await res.json()) as { html?: string; error?: string };
    if (!res.ok && !json.error) return { error: `HTTP ${res.status}` };
    if (json.error) return { error: json.error };
    return { html: json.html ?? '' };
  } catch (err) {
    return { error: String((err as Error)?.message ?? err) };
  }
}

async function runOracleCheck(
  dtext: string,
): Promise<{ oracle: OracleKind; oracleDiff?: string; oracleError?: string }> {
  if (!ORACLE_URL) return { oracle: 'skipped' };
  const oracleRes = await callOracle(dtext);
  if ('error' in oracleRes) {
    return {
      oracle: 'error',
      oracleError: truncate(oracleRes.error, DIFF_LIMIT),
    };
  }
  let dmarkHtml: string;
  try {
    dmarkHtml = convertDTextToHtml(dtext, { allowColor: true, maxThumbs: 75 });
  } catch (err) {
    return {
      oracle: 'error',
      oracleError: `dmark render: ${truncate(String((err as Error)?.message ?? err), DIFF_LIMIT)}`,
    };
  }
  const cmp = domEqual(dmarkHtml, oracleRes.html);
  if (cmp.equal) return { oracle: 'ok' };
  return { oracle: 'diff', oracleDiff: truncate(cmp.diff ?? '', DIFF_LIMIT) };
}

async function runOne(job: JobRecord): Promise<DoneEvent> {
  const t0 = performance.now();
  const dtext = readFileSync(job.absPath, 'utf8');
  const opts = { allowColor: true, maxThumbs: 75 };

  let ast1: DocumentNode;
  try {
    ast1 = parseDTextToAst(dtext, opts) as DocumentNode;
  } catch (err) {
    return {
      event: 'done',
      file: job.file,
      ok: false,
      kind: 'parse-error',
      ms: performance.now() - t0,
      error: truncate(String((err as Error)?.message ?? err), DIFF_LIMIT),
      oracle: 'skipped',
    };
  }

  let formatted: string;
  try {
    formatted = renderAstToDText(ast1).output;
  } catch (err) {
    return {
      event: 'done',
      file: job.file,
      ok: false,
      kind: 'format-error',
      ms: performance.now() - t0,
      error: truncate(String((err as Error)?.message ?? err), DIFF_LIMIT),
      oracle: 'skipped',
    };
  }

  let ast2: DocumentNode;
  try {
    ast2 = parseDTextToAst(formatted, opts) as DocumentNode;
  } catch (err) {
    return {
      event: 'done',
      file: job.file,
      ok: false,
      kind: 'reparse-error',
      ms: performance.now() - t0,
      error: truncate(String((err as Error)?.message ?? err), DIFF_LIMIT),
      oracle: 'skipped',
    };
  }

  const cmp = astEqual(ast1, ast2);
  const oracleResult = await runOracleCheck(dtext);
  if (cmp.equal) {
    return {
      event: 'done',
      file: job.file,
      ok: oracleResult.oracle !== 'diff' && oracleResult.oracle !== 'error',
      kind: 'ok',
      ms: performance.now() - t0,
      ...oracleResult,
    };
  }
  return {
    event: 'done',
    file: job.file,
    ok: false,
    kind: 'diff',
    ms: performance.now() - t0,
    diff: truncate(cmp.diff ?? '', DIFF_LIMIT),
    ...oracleResult,
  };
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let job: JobRecord;
    try {
      job = JSON.parse(trimmed) as JobRecord;
    } catch {
      // Skip malformed line; driver will time it out as missing.
      continue;
    }
    emit({ event: 'start', file: job.file });
    const result = await runOne({
      ...job,
      absPath: resolve(job.absPath),
    });
    emit(result);
  }
}

main().catch((err: unknown) => {
  // Surface fatal worker error before exit; driver counts it as a crash.
  process.stderr.write(
    `worker fatal: ${String((err as Error)?.message ?? err)}\n`,
  );
  process.exit(1);
});
