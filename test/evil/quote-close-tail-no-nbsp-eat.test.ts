// Sibling of test/evil/quote-close-cr-not-newline.test.ts. Same ragel rule
// (`newline? quote_close ws*` with `ws = ' ' | '\t'`), same helper
// (`consumeBlockCloseTail`), different leak in that helper.
//
// The CR-after-close fix touched only the line-terminator branch
// (CR no longer aliases to LF). The leading loop still calls
// `isHorizontalWhitespace`, which counts NBSP (0xA0), the ideographic
// space (0x3000), and the rest of the Unicode space block as horizontal
// whitespace and eats them.
//
// Ragel's `ws` is ASCII space+tab only. An NBSP after `[/quote]` falls
// through to the inline scanner's `any => append_html_escaped(fc)` rule
// and stays inside the next paragraph as a literal NBSP byte:
//
//   "[quote]hi[/quote] after"
//   -> <blockquote><p>hi</p></blockquote><p> after</p>

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('quote_close tail does not eat NBSP either', () => {
  it('keeps a leading NBSP on the paragraph after `[/quote]`', async () => {
    const input = '[quote]hi[/quote] after';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
