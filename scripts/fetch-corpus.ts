// Downloads the latest e621 db_export wiki_pages dump and selects a sample of
// pages to use as golden test fixtures. Writes raw dtext to corpus/golden/.
//
// Idempotent: re-running with the same dump file skips the download. Selection
// is deterministic given the same dump.
//
// For phase 1: top-N by body byte-length, skipping empty/blank pages.
// Feature-stratified sampling lands when the AST node-kind frequency analysis
// is wired up.

import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { parse as parseCsv } from "csv-parse";

const USER_AGENT = "dmark-corpus-fetch/v1 (binaryfloof)";
const DB_EXPORT_INDEX = "https://e621.net/db_export/";
const REPO_ROOT = resolve(import.meta.dirname, "..");
const CORPUS_DB_EXPORT = resolve(REPO_ROOT, "corpus", "db_export");
const CORPUS_GOLDEN = resolve(REPO_ROOT, "corpus", "golden");

const SAMPLE_SIZE = 50;
const MIN_BODY_BYTES = 200; // skip stubs

interface WikiPageRow {
  id: string;
  title: string;
  body: string;
  // The dump has more columns (created_at, updated_at, locked, etc.) — we
  // ignore them at parse time by reading by header name.
}

interface CorpusEntry {
  id: number;
  title: string;
  slug: string;
  bytes: number;
  file: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return await res.text();
}

async function findLatestDumpUrl(): Promise<{ url: string; filename: string }> {
  const html = await fetchText(DB_EXPORT_INDEX);
  const matches = [
    ...new Set(html.match(/wiki_pages-\d{4}-\d{2}-\d{2}\.csv\.gz/g) ?? []),
  ];
  if (matches.length === 0) {
    throw new Error("no wiki_pages dumps found at " + DB_EXPORT_INDEX);
  }
  matches.sort();
  const filename = matches[matches.length - 1];
  return { url: DB_EXPORT_INDEX + filename, filename };
}

async function downloadDump(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`[fetch-corpus] dump already present: ${dest}`);
    return;
  }
  console.log(`[fetch-corpus] downloading ${url}`);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok || !res.body) {
    throw new Error(`download ${url}: HTTP ${res.status}`);
  }
  const tmp = dest + ".partial";
  await pipeline(
    res.body as unknown as NodeJS.ReadableStream,
    createWriteStream(tmp),
  );
  const { renameSync } = await import("node:fs");
  renameSync(tmp, dest);
  console.log(`[fetch-corpus] saved ${dest}`);
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

async function selectAndWrite(dumpPath: string): Promise<CorpusEntry[]> {
  console.log(`[fetch-corpus] reading ${dumpPath}`);
  const all: WikiPageRow[] = [];

  await pipeline(
    createReadStream(dumpPath),
    createGunzip(),
    parseCsv({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: false,
    }),
    async function* (source: AsyncIterable<Record<string, string>>) {
      for await (const row of source) {
        const body = row.body ?? "";
        if (Buffer.byteLength(body, "utf8") < MIN_BODY_BYTES) continue;
        all.push({
          id: row.id ?? "0",
          title: row.title ?? "",
          body,
        });
        // Keep memory bounded: we only ever need the top SAMPLE_SIZE.
        if (all.length > SAMPLE_SIZE * 50) {
          all.sort(
            (a, b) =>
              Buffer.byteLength(b.body, "utf8") -
              Buffer.byteLength(a.body, "utf8"),
          );
          all.length = SAMPLE_SIZE * 10;
        }
      }
    },
  );

  console.log(`[fetch-corpus] read ${all.length} eligible rows; sorting`);
  all.sort(
    (a, b) =>
      Buffer.byteLength(b.body, "utf8") - Buffer.byteLength(a.body, "utf8"),
  );
  const top = all.slice(0, SAMPLE_SIZE);

  rmSync(CORPUS_GOLDEN, { recursive: true, force: true });
  mkdirSync(CORPUS_GOLDEN, { recursive: true });

  const entries: CorpusEntry[] = [];
  for (const row of top) {
    const id = Number(row.id);
    const slug = slugify(row.title);
    const file = `${id}-${slug}.dtext`;
    await writeFile(resolve(CORPUS_GOLDEN, file), row.body, "utf8");
    entries.push({
      id,
      title: row.title,
      slug,
      bytes: Buffer.byteLength(row.body, "utf8"),
      file,
    });
  }

  await writeFile(
    resolve(CORPUS_GOLDEN, "index.json"),
    JSON.stringify(
      { generated_at: new Date().toISOString(), entries },
      null,
      2,
    ),
    "utf8",
  );

  return entries;
}

async function main(): Promise<void> {
  mkdirSync(CORPUS_DB_EXPORT, { recursive: true });

  const { url, filename } = await findLatestDumpUrl();
  const dumpPath = resolve(CORPUS_DB_EXPORT, filename);
  await downloadDump(url, dumpPath);

  const entries = await selectAndWrite(dumpPath);

  console.log(
    `[fetch-corpus] selected ${entries.length} pages, ` +
      `${entries[0]?.bytes ?? 0}b largest, ` +
      `${entries[entries.length - 1]?.bytes ?? 0}b smallest`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
