// Workbench: cluster .evil-failures.json by (name-stem, leading-tag-signature)
// and print top N clusters with one example each.
//
// Usage: npx tsx scripts/evil-cluster.ts [topN]

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '..', '.evil-failures.json');

interface Failure {
  slice: number;
  name: string;
  input: string;
  dmark: string;
  oracle: string;
}

const failures: Failure[] = JSON.parse(readFileSync(FILE, 'utf8'));
const topN = Number(process.argv[2] ?? 40);

function tagSignature(input: string): string {
  const tags: string[] = [];
  const re = /\[\/?([a-z][a-z0-9]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    tags.push(m[0].toLowerCase());
    if (tags.length >= 3) break;
  }
  return tags.length ? tags.join(' ') : '(no tags)';
}

function nameStem(name: string): string {
  return name
    .split(/[\s/_-]+/)
    .slice(0, 2)
    .join(' ');
}

function diffPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const around = (s: string): string =>
    s.slice(Math.max(0, i - 8), Math.min(s.length, i + 24));
  return `dmark="${around(a)}" oracle="${around(b)}"`;
}

const buckets = new Map<string, { count: number; example: Failure }>();
for (const f of failures) {
  const key = `${nameStem(f.name)} | ${tagSignature(f.input)}`;
  const existing = buckets.get(key);
  if (existing) existing.count++;
  else buckets.set(key, { count: 1, example: f });
}

const sorted = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(`Total failures: ${failures.length}, clusters: ${buckets.size}`);
console.log('---');
for (const [key, b] of sorted.slice(0, topN)) {
  console.log(`[${String(b.count).padStart(4)}] ${key}`);
  console.log(`       in: ${JSON.stringify(b.example.input.slice(0, 100))}`);
  console.log(`       ${diffPrefix(b.example.dmark, b.example.oracle)}`);
}
