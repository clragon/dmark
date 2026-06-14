// Delimited URL `<…>` containing an embedded tab.
//
// Ragel (ref/dtext/ext/dtext/dtext.cpp.rl):
//   url            = 'http'i 's'i? '://' ^space+;       (line 110)
//   delimited_url  = '<' url >mark_a1 %mark_a2 :>> '>'; (line 111)
//
// POSIX `space` includes the ASCII tab, so the `url` token terminates at
// the tab; the closing `>` is never matched and `delimited_url` fails.
// The fallback is a literal `<`, the bare-url rule eating up to the tab,
// then a literal tab and `>`.
//
// The TS port's RE_DELIMITED_URL is `<(https?:\/\/[^>]+)>` - the URL body
// is "any non-`>`", so it slurps the tab right through and emits one big
// anchor with a tab in its href.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('delimited URL terminates at ASCII whitespace, not just `>`', () => {
  it('breaks `<https://example.com/a\\tb>` at the tab the way ragel does', async () => {
    const input = '<https://example.com/a\tb>';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
