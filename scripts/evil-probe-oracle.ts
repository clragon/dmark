// Workbench: probe arbitrary inputs against the live ruby-dtext oracle to
// understand its behavior. Spawns the dmark-oracle:dev container itself,
// then prints `>>> input  <<< html` for each probe in the list below.
//
// Usage: npx tsx scripts/evil-probe-oracle.ts
//
// Edit the PROBES array to change what gets queried. Output also dumped to
// .evil-probe.json next to the script.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', '.evil-probe.json');

const PROBES: string[] = [
  // ltable structure
  '[ltable][tr][td]a[/td][/tr]\n[tr][td]b[/td][/tr][/ltable]',
];

interface ProbeResult {
  input: string;
  html: string;
}

async function startOracle(): Promise<{ url: string; stop: () => Promise<void> }> {
  if (process.env.DMARK_ORACLE_URL) {
    return { url: process.env.DMARK_ORACLE_URL, stop: async () => {} };
  }
  const container: StartedTestContainer = await new GenericContainer('dmark-oracle:dev')
    .withExposedPorts(4567)
    .withWaitStrategy(
      Wait.forHttp('/health', 4567).forStatusCode(200).withStartupTimeout(30_000),
    )
    .start();
  const host = container.getHost();
  const port = container.getMappedPort(4567);
  return {
    url: `http://${host}:${port}`,
    stop: () => container.stop().then(() => undefined),
  };
}

async function render(url: string, dtext: string): Promise<string> {
  const res = await fetch(`${url}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dtext,
      options: { allow_color: true, max_thumbs: 75 },
    }),
  });
  if (!res.ok) throw new Error(`oracle HTTP ${res.status}`);
  const body = (await res.json()) as { html: string };
  return body.html;
}

async function main(): Promise<void> {
  const oracle = await startOracle();
  try {
    const out: ProbeResult[] = [];
    for (const p of PROBES) {
      const html = await render(oracle.url, p);
      console.log(`>>> ${JSON.stringify(p)}\n    ${JSON.stringify(html)}`);
      out.push({ input: p, html });
    }
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`\nwrote ${out.length} results to ${OUT}`);
  } finally {
    await oracle.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
