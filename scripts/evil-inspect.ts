// Workbench: filter .evil-failures.json by a regex over input and print
// each match with input/dmark/oracle. Usage:
//   npx tsx scripts/evil-inspect.ts "^h1\." 30

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '..', '.evil-failures.json');
const failures: Array<{
  name: string;
  input: string;
  dmark: string;
  oracle: string;
}> = JSON.parse(readFileSync(FILE, 'utf8'));

const re = new RegExp(process.argv[2] ?? '', 'i');
const limit = Number(process.argv[3] ?? 20);
const matches = failures.filter((f) => re.test(f.input));

console.log(`matched ${matches.length} of ${failures.length}`);
for (const f of matches.slice(0, limit)) {
  console.log('---');
  console.log(`name:   ${f.name}`);
  console.log(`input:  ${JSON.stringify(f.input)}`);
  console.log(`dmark:  ${JSON.stringify(f.dmark)}`);
  console.log(`oracle: ${JSON.stringify(f.oracle)}`);
}
