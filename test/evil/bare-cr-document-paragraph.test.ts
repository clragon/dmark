// Ragel `newline = '\r\n' | '\n'` - bare CR is NOT a newline at the top
// level. In the `main` scanner a bare CR falls into the `any` rule
// (line 746), which `fhold`s, opens `<p>`, and `fcall`s the inline scanner.
// The inline scanner's `'\r' => { append(' '); };` rule then writes a
// single space, and the paragraph closes at end-of-input.
//
//   input:  "\r"
//   oracle: <p> </p>
//
// The TS port treats a bare CR at document scope as a blank-line skip and
// emits an empty document.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('bare CR at document scope opens a paragraph with one space', () => {
  it('produces `<p> </p>` for an input of exactly `\\r`', async () => {
    const input = '\r';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
