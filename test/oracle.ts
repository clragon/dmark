// Client for the dtext oracle container. Reads the running container's URL
// from process.env.DMARK_ORACLE_URL (set by test/oracle-setup.ts).
//
// Usage from a test:
//   import { renderViaOracle } from '../test/oracle';
//   const { html } = await renderViaOracle('[b]hi[/b]');

export interface OracleRenderOptions {
  allow_color?: boolean;
  inline?: boolean;
  base_url?: string;
  max_thumbs?: number;
}

export interface OracleRenderResult {
  html: string;
  post_ids: number[];
  error?: string;
}

const cache = new Map<string, OracleRenderResult>();

function cacheKey(dtext: string, options: OracleRenderOptions): string {
  return JSON.stringify([dtext, options]);
}

function oracleUrl(): string {
  const url = process.env.DMARK_ORACLE_URL;
  if (!url) {
    throw new Error(
      'DMARK_ORACLE_URL is not set. The vitest globalSetup at test/oracle-setup.ts is responsible for starting the oracle container and exposing its URL.',
    );
  }
  return url;
}

export async function renderViaOracle(
  dtext: string,
  options: OracleRenderOptions = {},
): Promise<OracleRenderResult> {
  const key = cacheKey(dtext, options);
  const cached = cache.get(key);
  if (cached) return cached;

  const res = await fetch(`${oracleUrl()}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dtext, options }),
  });

  const json = (await res.json()) as OracleRenderResult;
  if (!res.ok && !json.error) {
    throw new Error(`oracle render failed: HTTP ${res.status}`);
  }
  cache.set(key, json);
  return json;
}

export async function oracleHealth(): Promise<{
  ok: boolean;
  dtext_version: string;
}> {
  const res = await fetch(`${oracleUrl()}/health`);
  if (!res.ok) throw new Error(`oracle /health: HTTP ${res.status}`);
  return (await res.json()) as { ok: boolean; dtext_version: string };
}
