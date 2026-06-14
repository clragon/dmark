// Ragel renders the title of a textile link by calling `parse_basic_inline`
// on the captured `nonquote+` (ref/dtext/ext/dtext/dtext.cpp.rl line 113).
// The `basic_inline` machine is a tiny scanner whose default for an
// unmatched character is:
//
//   any => { append_html_escaped(fc); };
//
// `\n` is `any`, so a newline inside the title becomes a literal newline
// byte in the anchor's text content. The full `inline` scanner (which has
// a `newline => append("<br>")` rule) is NEVER reached for a link title.
//
// The TS port routes the title through `parseInlineString`, which sets
// `basicInline: true` but still goes through the main parser, so an
// inline newline produces a `<br>` node instead of staying literal.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('textile-link title keeps a literal newline (no <br>)', () => {
  it('`"foo\\nbar":/x` renders the newline as a real byte inside the anchor', async () => {
    const input = '"foo\nbar":/x';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
