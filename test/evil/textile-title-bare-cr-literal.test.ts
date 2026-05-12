// Sibling of test/evil/textile-title-newline-literal.test.ts. Same
// scanner (`parse_basic_inline` on textile-link titles, line 874), same
// rule (`any => append_html_escaped(fc)`), different byte.
//
// Ragel's `basic_inline` has NO `'\r' => append(' ')` branch; that
// CR-to-space rule lives in the full `inline` scanner only (line 553).
// So a bare CR inside a textile-link title is just `any`, emitted as the
// literal CR byte.
//
//   "\"a\rb\":/x"
//   oracle: <a href="/x">a\rb</a>
//
// You fixed the LF case (gating `peekNewline -> line_break` on `!basic`).
// The CR-to-space path that fires on a non-newline `\r` two lines lower
// runs regardless of `basic` mode, so the CR still gets aliased to ASCII
// space and the title renders as `a b`.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('basic_inline preserves a bare CR as literal, no space alias', () => {
  it('renders `"a\\rb":/x` with the CR intact inside the anchor', async () => {
    const input = '"a\rb":/x';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
