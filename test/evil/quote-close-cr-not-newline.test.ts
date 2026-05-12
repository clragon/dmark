// Ragel terminates a `quote_close` with `ws*` - and `ws = ' ' | '\t'`,
// NOT POSIX `space`. So `[/quote]` does NOT eat a following `\r`. The CR
// is left for the surrounding inline scanner, which has the rule
//   `'\r' => { append(' '); };`
// so the next paragraph begins with a literal ASCII space.
//
//   [quote]hi[/quote]\rafter
//   -> <blockquote><p>hi</p></blockquote><p> after</p>
//
// TS's `consumeBlockCloseTail` runs after every container close (quote /
// section / spoiler) and eats horizontal whitespace AND one line
// terminator, treating bare `\r` as a newline. The CR is consumed
// silently and the leading-space `<p> after</p>` collapses to
// `<p>after</p>`. Distinct from POSIX-space coverage after a block OPEN -
// this is the close-side tail eat for one specific class of line break.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('quote_close tail eats `ws*` only, not bare CR', () => {
  it('leaves bare CR after `[/quote]` for the inline-scanner space conversion', async () => {
    const input = '[quote]hi[/quote]\rafter';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
