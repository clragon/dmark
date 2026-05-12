// Ragel inline rule (ref/dtext/ext/dtext/dtext.cpp.rl line 461):
//
//   '[/code]'i space* => { ... }
//
// `space` is POSIX, which includes VT (0x0b) and FF (0x0c). So a stray
// `[/code]` followed by a VT eats the VT before resuming text.
//
//   "before [/code]\x0bafter"
//   oracle: "<p>before </p>[/code]after"
//
// dmark's inline stray-close-tail eat in `parseInlineElement` is hardcoded
// to ' ', '\t', '\n', '\r' only, so the VT survives into the output.
// Distinct code path from the `quote_open space*` POSIX-space eat that
// already shipped: this is the `[/code]/[/table]` inline-stray-close
// branch, a different inline-scanner action.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('inline stray [/code] eats POSIX space (incl. VT) after the close', () => {
  it('strips a VT immediately after `[/code]`', async () => {
    const input = 'before [/code]\x0bafter';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
