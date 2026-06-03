// Fault-isolated round-trip + oracle survey over the staging corpus.
//
// The vitest worker holds every parse result in one process; on an
// expanded corpus that easily exceeds the heap (we OOM'd the host with
// 8.4k articles in a single worker). This driver spawns a child node
// process with a tight heap cap and per-file wall-clock timeout, streams
// jobs one at a time over stdin/stdout, and respawns on crash so a
// single runaway article cannot take down the whole survey.
//
// If SURVEY_ORACLE_URL is set in the environment, the driver passes it
// through to workers and the survey checks oracle parity in addition to
// the round-trip property. Otherwise the driver starts a dmark-oracle
// container via testcontainers and tears it down at the end.
// Set SURVEY_SKIP_ORACLE=1 to opt out of oracle checking entirely (then
// the oracle field on every result is "skipped"; faster, but the curator
// cannot pre-filter for oracle parity).
//
// Output: corpus/staging/survey.json with one record per fixture:
//   { file, bytes, kind, ms?, diff?, error?,
//     oracle, oracleDiff?, oracleError? }
//
// kind values (round-trip property):
//   ok            parse → format → parse produced an equal AST
//   diff          the two ASTs differ (round-trip bug)
//   parse-error   first parse threw
//   format-error  formatter threw
//   reparse-error second parse threw (formatter emitted unparseable
//                 text; the most interesting class of bug)
//   crash         worker died while processing this file (heap or
//                 uncaught fatal). Bound by the heap cap.
//   timeout       worker did not return within PER_FILE_TIMEOUT_MS.
//                 Suggests pathological backtracking or runaway loop.
//
// oracle values (only meaningful when round-trip kind is "ok" or "diff"):
//   ok       dmark HTML dom-equals oracle HTML
//   diff     HTML rendering disagrees with the oracle (parser bug
//            invisible to round-trip)
//   error    oracle endpoint errored or dmark renderer threw
//   skipped  oracle checking disabled or parse/format chain failed
//
// Run via: npx tsx scripts/corpus-survey.ts

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

interface CorpusEntry {
  id: number;
  title: string;
  slug: string;
  bytes: number;
  file: string;
}

interface CorpusIndex {
  generated_at: string;
  entries: CorpusEntry[];
}

type ResultKind =
  | "ok"
  | "diff"
  | "parse-error"
  | "format-error"
  | "reparse-error"
  | "crash"
  | "timeout";

type OracleKind = "ok" | "diff" | "error" | "skipped";

interface ResultRecord {
  file: string;
  bytes: number;
  kind: ResultKind;
  ms?: number;
  diff?: string;
  error?: string;
  oracle: OracleKind;
  oracleDiff?: string;
  oracleError?: string;
}

interface SurveyReport {
  generated_at: string;
  total: number;
  counts: Record<ResultKind, number>;
  oracleCounts: Record<OracleKind, number>;
  oracleUrl?: string;
  oracleVersion?: string;
  results: ResultRecord[];
}

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CORPUS_STAGING = resolve(REPO_ROOT, "corpus", "staging");
const INDEX_PATH = process.env.SURVEY_INDEX
  ? resolve(process.env.SURVEY_INDEX)
  : resolve(CORPUS_STAGING, "index.json");
const REPORT_PATH = process.env.SURVEY_REPORT
  ? resolve(process.env.SURVEY_REPORT)
  : resolve(CORPUS_STAGING, "survey.json");
const WORKER_PATH = resolve(REPO_ROOT, "scripts", "corpus-survey-worker.ts");
const TSX_BIN = resolve(REPO_ROOT, "node_modules", ".bin", "tsx");

const WORKER_HEAP_MB = Number(process.env.SURVEY_HEAP_MB ?? "512");
const PER_FILE_TIMEOUT_MS = Number(process.env.SURVEY_TIMEOUT_MS ?? "30000");
const PROGRESS_EVERY = Number(process.env.SURVEY_PROGRESS_EVERY ?? "100");
const SKIP_ORACLE = process.env.SURVEY_SKIP_ORACLE === "1";
const ORACLE_IMAGE = "dmark-oracle:dev";
const ORACLE_INTERNAL_PORT = 4567;
const ORACLE_HEALTH_TIMEOUT_MS = 30_000;

interface RunWorkerOutcome {
  // The (zero-based) index of the next entry to process; equals
  // entries.length when the worker drained the queue cleanly.
  nextIndex: number;
  // If non-null, this is the result the driver synthesised for the file
  // that killed the worker (crash or timeout). The caller adds it to
  // results and skips that index when respawning.
  killer: ResultRecord | null;
}

function loadIndex(): CorpusIndex {
  if (!INDEX_PATH) throw new Error("missing index path");
  const raw = readFileSync(INDEX_PATH, "utf8");
  return JSON.parse(raw) as CorpusIndex;
}

function runWorker(
  entries: CorpusEntry[],
  startIndex: number,
  oracleUrl: string,
  onResult: (record: ResultRecord, absoluteIndex: number) => void,
): Promise<RunWorkerOutcome> {
  return new Promise<RunWorkerOutcome>((resolveOutcome) => {
    const child: ChildProcess = spawn(
      TSX_BIN,
      [WORKER_PATH],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS: `--max-old-space-size=${WORKER_HEAP_MB}`,
          SURVEY_ORACLE_URL: oracleUrl,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error("child stdio not piped");
    }

    // Workers can die between two writes; swallow EPIPE so the driver
    // keeps draining stdout/stderr and synthesises the crash record from
    // the exit event instead.
    child.stdin.on("error", () => {});

    let currentIndex = startIndex;
    let pendingFile: string | null = null;
    let lastActivity = Date.now();
    let watchdog: NodeJS.Timeout | null = null;
    let finished = false;

    const finish = (outcome: RunWorkerOutcome): void => {
      if (finished) return;
      finished = true;
      if (watchdog) clearInterval(watchdog);
      if (!child.killed) child.kill("SIGKILL");
      resolveOutcome(outcome);
    };

    watchdog = setInterval(() => {
      if (pendingFile !== null && Date.now() - lastActivity > PER_FILE_TIMEOUT_MS) {
        const entry = entries[currentIndex];
        const killer: ResultRecord = {
          file: entry.file,
          bytes: entry.bytes,
          kind: "timeout",
          oracle: "skipped",
          error: `worker exceeded ${PER_FILE_TIMEOUT_MS}ms`,
        };
        finish({ nextIndex: currentIndex + 1, killer });
      }
    }, Math.min(2000, PER_FILE_TIMEOUT_MS));

    const stderrChunks: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
    });

    const rl = createInterface({ input: child.stdout, terminal: false });
    rl.on("line", (line: string) => {
      lastActivity = Date.now();
      const trimmed = line.trim();
      if (!trimmed.length) return;
      let event: { event: string; file?: string } & Record<string, unknown>;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (event.event === "start" && typeof event.file === "string") {
        pendingFile = event.file;
        return;
      }
      if (event.event === "done" && typeof event.file === "string") {
        const entry = entries[currentIndex];
        if (entry === undefined || entry.file !== event.file) {
          // Out-of-sync; treat as crash and bail.
          finish({
            nextIndex: currentIndex,
            killer: null,
          });
          return;
        }
        const record: ResultRecord = {
          file: event.file,
          bytes: entry.bytes,
          kind: (event.kind as ResultKind) ?? "diff",
          ms: typeof event.ms === "number" ? event.ms : undefined,
          diff: typeof event.diff === "string" ? event.diff : undefined,
          error: typeof event.error === "string" ? event.error : undefined,
          oracle: (event.oracle as OracleKind) ?? "skipped",
          oracleDiff: typeof event.oracleDiff === "string" ? event.oracleDiff : undefined,
          oracleError: typeof event.oracleError === "string" ? event.oracleError : undefined,
        };
        onResult(record, currentIndex);
        pendingFile = null;
        currentIndex += 1;
        if (currentIndex >= entries.length) {
          finish({ nextIndex: currentIndex, killer: null });
        }
      }
    });

    child.on("exit", (code, signal) => {
      if (finished) return;
      if (pendingFile !== null) {
        const entry = entries[currentIndex];
        const stderrText = stderrChunks.join("").trim();
        const killer: ResultRecord = {
          file: entry.file,
          bytes: entry.bytes,
          kind: "crash",
          oracle: "skipped",
          error: stderrText.length
            ? `worker died (code=${code ?? "?"} signal=${signal ?? "?"}): ${stderrText.slice(-400)}`
            : `worker died (code=${code ?? "?"} signal=${signal ?? "?"})`,
        };
        finish({ nextIndex: currentIndex + 1, killer });
      } else {
        // Worker exited between files; resume at currentIndex.
        finish({ nextIndex: currentIndex, killer: null });
      }
    });

    for (let i = startIndex; i < entries.length; i++) {
      const entry = entries[i];
      const job = {
        file: entry.file,
        absPath: resolve(CORPUS_STAGING, entry.file),
        bytes: entry.bytes,
      };
      child.stdin.write(JSON.stringify(job) + "\n");
    }
    child.stdin.end();
  });
}

interface OracleHandle {
  url: string;
  version?: string;
  stop: () => Promise<void>;
}

async function startOracle(): Promise<OracleHandle | null> {
  if (SKIP_ORACLE) {
    console.log("[survey] oracle checking disabled (SURVEY_SKIP_ORACLE=1)");
    return null;
  }
  if (process.env.SURVEY_ORACLE_URL) {
    const url = process.env.SURVEY_ORACLE_URL;
    const health = (await fetch(`${url}/health`).then((r) => r.json())) as {
      ok: boolean;
      dtext_version: string;
    };
    console.log(`[survey] using existing oracle at ${url} (dtext ${health.dtext_version})`);
    return { url, version: health.dtext_version, stop: async () => undefined };
  }
  console.log(`[survey] starting oracle container (${ORACLE_IMAGE})`);
  const started: StartedTestContainer = await new GenericContainer(ORACLE_IMAGE)
    .withExposedPorts(ORACLE_INTERNAL_PORT)
    .withWaitStrategy(
      Wait.forHttp("/health", ORACLE_INTERNAL_PORT)
        .forStatusCode(200)
        .withStartupTimeout(ORACLE_HEALTH_TIMEOUT_MS),
    )
    .start();
  const host = started.getHost();
  const port = started.getMappedPort(ORACLE_INTERNAL_PORT);
  const url = `http://${host}:${port}`;
  const health = (await fetch(`${url}/health`).then((r) => r.json())) as {
    ok: boolean;
    dtext_version: string;
  };
  console.log(`[survey] oracle ready at ${url} (dtext ${health.dtext_version})`);
  return {
    url,
    version: health.dtext_version,
    stop: () => started.stop().then(() => undefined),
  };
}

async function main(): Promise<void> {
  const index = loadIndex();
  const entries = index.entries.slice();
  console.log(
    `[survey] ${entries.length} fixtures; heap cap ${WORKER_HEAP_MB} MB; per-file timeout ${PER_FILE_TIMEOUT_MS} ms`,
  );

  const oracle = await startOracle();
  const oracleUrl = oracle?.url ?? "";

  const results: ResultRecord[] = [];
  let nextIndex = 0;
  let lastProgress = 0;

  const onResult = (record: ResultRecord, idx: number): void => {
    results.push(record);
    if (idx + 1 - lastProgress >= PROGRESS_EVERY) {
      lastProgress = idx + 1;
      const counts = tally(results);
      const oc = tallyOracle(results);
      console.log(
        `[survey] ${idx + 1}/${entries.length}  rt: ok=${counts.ok} diff=${counts.diff} parse-err=${counts["parse-error"]} reparse-err=${counts["reparse-error"]} fmt-err=${counts["format-error"]} crash=${counts.crash} timeout=${counts.timeout}  oracle: ok=${oc.ok} diff=${oc.diff} error=${oc.error} skipped=${oc.skipped}`,
      );
    }
  };

  try {
    while (nextIndex < entries.length) {
      const outcome = await runWorker(entries, nextIndex, oracleUrl, onResult);
      if (outcome.killer) {
        results.push(outcome.killer);
        console.log(
          `[survey] ${outcome.killer.kind}: ${outcome.killer.file} (${outcome.killer.bytes} bytes)`,
        );
      }
      nextIndex = outcome.nextIndex;
    }
  } finally {
    if (oracle) await oracle.stop();
  }

  const report: SurveyReport = {
    generated_at: new Date().toISOString(),
    total: entries.length,
    counts: tally(results),
    oracleCounts: tallyOracle(results),
    oracleUrl: oracle?.url,
    oracleVersion: oracle?.version,
    results,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`[survey] wrote ${REPORT_PATH}`);
  console.log(`[survey] round-trip: ${JSON.stringify(report.counts)}`);
  console.log(`[survey] oracle:     ${JSON.stringify(report.oracleCounts)}`);
}

function tally(results: ResultRecord[]): Record<ResultKind, number> {
  const counts: Record<ResultKind, number> = {
    ok: 0,
    diff: 0,
    "parse-error": 0,
    "format-error": 0,
    "reparse-error": 0,
    crash: 0,
    timeout: 0,
  };
  for (const r of results) counts[r.kind] += 1;
  return counts;
}

function tallyOracle(results: ResultRecord[]): Record<OracleKind, number> {
  const counts: Record<OracleKind, number> = { ok: 0, diff: 0, error: 0, skipped: 0 };
  for (const r of results) counts[r.oracle] += 1;
  return counts;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
