// Ragel's inline `[code]'i` rule (line 455) is a fret-out exit for every
// inline scope, including the `[color=…]` span (which lives in the same
// `inline` scanner). When `[code]` opens mid-content, the color span
// closes around the prefix, the main scanner promotes the code block,
// and any text past `[/code]` continues at block scope — the `[/color]`
// that originally belonged to the span ends up unmatched in the trailing
// paragraph as literal text.
//
//   [color=red]a [code]x[/code] b[/color]
//   ->
//   <p><span ...>a </span></p>
//   <pre>x</pre>
//   <p> b[/color]</p>
//
// dmark's `parseColorContainer` is a private loop that lacks the
// `peekBlockElement` break and the `peekStrayCodeOrTableClose` guard
// shared by `parseInlineContainer`. So a bracketed always-block open
// inside `[color=…]` is absorbed as literal `[code]x[/code]` text and
// the span stays open.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('color span exits when [code] opens mid-content', () => {
  it('promotes the inline `[code]` to a real <pre> block', async () => {
    const input = '[color=red]a [code]x[/code] b[/color]';
    const oracle = await renderViaOracle(input, { allow_color: true });
    const dmark = parseDText(input, { allowColor: true });
    expect(dmark).toBe(oracle.html);
  });
});
