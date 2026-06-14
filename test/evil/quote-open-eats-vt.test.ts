// Ragel eats POSIX `space*` after `[quote]`:
//
//   main := |* ...
//     quote_open space* => { dstack_close_leaf_blocks(); ... };
//     ...
//   *|;
//
// POSIX `space` is `[ \t\n\v\f\r]`. The TS port's post-open eat is wired
// through `skipWhitespace` + `matchNewlines`, which together cover only
// space, tab, and the LF/CR/CRLF line terminators - VT (`\v`, 0x0b) and
// FF (`\f`, 0x0c) leak into the first cell of paragraph content.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('quote_open eats every POSIX space, including VT', () => {
  it('strips a leading VT before the first content line', async () => {
    const input = '[quote]\x0bhi[/quote]';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
