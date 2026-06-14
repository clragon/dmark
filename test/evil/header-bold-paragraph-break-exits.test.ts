// Ragel's inline scanner `newline{2,}` rule (line 529) always runs
// `fexec ts; fret;`. When the inline scope is nested inside a header
// (header_mode set, the call chain is header -> inline -> [b] -> inline),
// the fret propagates UP to header_mode's inline scope, which then also
// frets back to main. Main's `newline{2,}` rule then closes the leaf
// blocks (the `<h1>`).
//
// So `h1. [b]bold\n\nmore[/b]\n` walks out as
//   <h1><strong>bold</strong></h1><p>more[/b]</p>
// The header closes at the blank line, the bold close stays unmatched
// after the header, and `[/b]` ends up as literal text in the trailing
// paragraph.
//
// dmark's `parseInlineContainer` silently drops the `\n\n` via the
// `peekDoubleNewline -> consumeBlankLines` short-circuit, which is right
// for a plain `[b]a\n\nb[/b]` paragraph but wrong when bold is nested
// inside a header. The shared `<h1>` swallows `boldmore` and the close
// vanishes.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('paragraph break inside a header-mode inline tag closes the header', () => {
  it('exits the `<h1>` on `\\n\\n` even inside an open `[b]`', async () => {
    const input = 'h1. [b]bold\n\nmore[/b]\n';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
