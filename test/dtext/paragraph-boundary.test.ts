import { describe, expect, it } from 'vitest';
import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

// Reproduces the "trailing <br><br></p>" bug surfaced by the corpus baseline:
// a paragraph followed by `\n\n` and another block keeps the double-newline
// as inline `<br><br>` inside the paragraph, instead of closing the paragraph
// at the block boundary.
//
// Fix lives in src/dtext/parse/index.ts; once corrected, every assertion
// below should match the ruby oracle.

describe('paragraph block-boundary handling', () => {
  it('paragraph followed by header closes cleanly', async () => {
    const input = 'hello\n\nh2. heading';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });

  it('paragraph followed by paragraph splits into two', async () => {
    const input = 'hello\n\nworld';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });

  it('paragraph followed by quote closes cleanly', async () => {
    const input = 'hello\n\n[quote]world[/quote]';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });

  it('inline anchor followed by paragraph splits cleanly', async () => {
    const input = '[#anchor]\n\nhi';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
