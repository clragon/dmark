// Two stray `[/spoiler]` closes separated by a paragraph break, with prior
// content closing the first paragraph cleanly.
//
//   "a\n[/spoiler]\n\n[/spoiler] tail"
//
// Ragel emits:
//   <p>a</p>
//   \n[/spoiler]\n\n[/spoiler] tail
//
// At main scope a stray `[/spoiler]` against an empty dstack is a no-op
// action: `dstack_close_before_block` closes nothing, the spoiler check
// fails. The scanner is positioned past the close, but ragel's `any`
// catchall for the preceding `[` already opened nothing (the rule didn't
// fire), so the chars stay in `output` as plain text. Both closes survive
// as literal text and the trailing ` tail` is NOT wrapped in a fresh `<p>`.
//
// dmark consumes the first stray (with its preceding `\n`) as a literal,
// then eats the `\n\n` as a paragraph-break tail of the stray-close eat,
// then re-encounters the SECOND stray. This time the recursive structure
// or block scanner has nothing in scope so the close vanishes and the
// remaining ` tail` starts a fresh `<p>`. The second close is silently
// lost and ` tail` becomes a wrapped paragraph that the oracle never
// emits.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('two stray `[/spoiler]` closes around a paragraph break stay literal', () => {
  it('keeps both `[/spoiler]` tokens and leaves the trailing text unwrapped', async () => {
    const input = 'a\n[/spoiler]\n\n[/spoiler] tail';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
