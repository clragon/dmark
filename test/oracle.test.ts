// Smoke test: confirms the oracle container is running and rendering correctly.
// If this passes, all subsequent golden tests can rely on renderViaOracle.

import { describe, it, expect } from 'vitest';
import { oracleHealth, renderViaOracle } from './oracle';

describe('dtext oracle', () => {
  it('reports healthy with a dtext version', async () => {
    const h = await oracleHealth();
    expect(h.ok).toBe(true);
    expect(h.dtext_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('renders [b]hi[/b] to <strong>', async () => {
    const r = await renderViaOracle('[b]hi[/b]');
    expect(r.html).toBe('<p><strong>hi</strong></p>');
    expect(r.post_ids).toEqual([]);
    expect(r.error).toBeUndefined();
  });

  it('renders headers, italic, and unordered lists', async () => {
    const r = await renderViaOracle('h1. title\n\n[i]hi[/i]\n\n* one\n* two');
    expect(r.html).toContain('<h1>title</h1>');
    expect(r.html).toContain('<em>hi</em>');
    expect(r.html).toContain('<ul><li>one</li><li>two</li></ul>');
  });

  it('caches identical render calls', async () => {
    const a = await renderViaOracle('[b]cached[/b]');
    const b = await renderViaOracle('[b]cached[/b]');
    expect(b).toBe(a);
  });
});
