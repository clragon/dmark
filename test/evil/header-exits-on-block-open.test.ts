// Ragel's `header` rule routes the body through `fcall inline`
// (ref/dtext/ext/dtext/dtext.cpp.rl line 648). The inline scanner has
// dedicated rules that exit on a bracketed always-block open:
//
//   '[code]'i => { dstack_close_before_block(); fexec ts; fret; };  (line 455)
//   '[table]'i => { ... fexec ts; fret; };                          (line 433)
//   quote_open => { ... fexec ts; fret; };                          (line 477)
//   section_open => { ... fexec ts; fret; };                        (line 504)
//
// `fret` returns from the inline scanner; the main scanner then promotes
// the open into a real block, breaking the header.
//
// The existing parity tests cover this fret-rule for an inline `[b]`
// scope (`[b]a [code]x[/code] b[/b]`). The header_mode inline scope is a
// separate call site - and dmark's parseHeader keeps the `[code]` text
// inside the header rather than letting the main parser eat it as a
// block.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('inline-from-header exits when [code] opens mid-content', () => {
  it('breaks the header on `[code]` and emits a real <pre> block', async () => {
    const input = 'h1. heading [code]not code[/code]\n';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
