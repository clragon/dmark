// Downloads the latest e621 db_export wiki_pages dump and writes every page
// whose body clears MIN_BODY_BYTES to corpus/staging/ as .dtext fixtures.
//
// Idempotent: re-running with the same dump file skips the download.
//
// Short pages (<MIN_BODY_BYTES) are skipped because they almost always lack
// non-trivial formatting (less text = less formatting); their parser coverage
// is already met by hand-curated unit fixtures. Curation from staging/ into
// the smaller representative golden set lives in scripts/curate-corpus.ts.

import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { parse as parseCsv } from 'csv-parse';

const USER_AGENT = 'dmark-corpus-fetch/v1 (binaryfloof)';
const DB_EXPORTS_INDEX = 'https://e621.net/db_exports.json';
const REPO_ROOT = resolve(import.meta.dirname, '..');
const CORPUS_DB_EXPORT = resolve(REPO_ROOT, 'corpus', 'db_export');
const CORPUS_STAGING = resolve(REPO_ROOT, 'corpus', 'staging');

const MIN_BODY_BYTES = 1000; // skip stubs / formatting-light pages

interface WikiPageRow {
  id: string;
  title: string;
  body: string;
  // The dump has more columns (created_at, updated_at, locked, etc.).
  // Reading by header name ignores them at parse time.
}

interface CorpusEntry {
  id: number;
  title: string;
  slug: string;
  bytes: number;
  file: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return await res.text();
}

interface DbExport {
  name: string;
  file_name: string;
  file_size: number;
  updated_at: string;
  url: string;
}

async function findLatestDumpUrl(): Promise<{ url: string; filename: string }> {
  const exports = JSON.parse(await fetchText(DB_EXPORTS_INDEX)) as DbExport[];
  const dump = exports.find((e) => e.name === 'wiki_pages');
  if (!dump) {
    throw new Error('no wiki_pages dump found at ' + DB_EXPORTS_INDEX);
  }
  const date = dump.updated_at.slice(0, 10);
  return { url: dump.url, filename: `wiki_pages-${date}.csv.gz` };
}

async function downloadDump(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`[fetch-corpus] dump already present: ${dest}`);
    return;
  }
  console.log(`[fetch-corpus] downloading ${url}`);
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok || !res.body) {
    throw new Error(`download ${url}: HTTP ${res.status}`);
  }
  const tmp = dest + '.partial';
  await pipeline(
    res.body as unknown as NodeJS.ReadableStream,
    createWriteStream(tmp),
  );
  const { renameSync } = await import('node:fs');
  renameSync(tmp, dest);
  console.log(`[fetch-corpus] saved ${dest}`);
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'untitled'
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
        const body = row.body ?? '';
        if (Buffer.byteLength(body, 'utf8') < MIN_BODY_BYTES) continue;
        all.push({
          id: row.id ?? '0',
          title: row.title ?? '',
          body,
        });
      }
    },
  );

  console.log(`[fetch-corpus] read ${all.length} eligible rows; sorting`);
  all.sort(
    (a, b) =>
      Buffer.byteLength(b.body, 'utf8') - Buffer.byteLength(a.body, 'utf8'),
  );

  rmSync(CORPUS_STAGING, { recursive: true, force: true });
  mkdirSync(CORPUS_STAGING, { recursive: true });

  const entries: CorpusEntry[] = [];
  for (const row of all) {
    const id = Number(row.id);
    const slug = slugify(row.title);
    const file = `${id}-${slug}.dtext`;
    await writeFile(resolve(CORPUS_STAGING, file), row.body, 'utf8');
    entries.push({
      id,
      title: row.title,
      slug,
      bytes: Buffer.byteLength(row.body, 'utf8'),
      file,
    });
  }

  await writeFile(
    resolve(CORPUS_STAGING, 'index.json'),
    JSON.stringify(
      { generated_at: new Date().toISOString(), entries },
      null,
      2,
    ),
    'utf8',
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
