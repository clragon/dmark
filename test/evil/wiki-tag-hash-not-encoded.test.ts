// Ragel's `append_wiki_link` URI-escapes the normalised tag with `#` as
// the whitelist character (line 903):
//
//   append_uri_escaped(normalized_tag, '#');
//
// So `#` characters in a wiki tag stay literal in the href, while every
// other special byte gets encoded.
//
// Example: the leading-pipe wiki form `[[|#]]` keeps the entire content
// as the tag (`|#`). Oracle renders:
//   href="/wiki_pages/show_or_new?title=%7C#"
//                                          ^ literal `#`
//
// dmark's `buildWikiLink` calls `rubyUriEscape(normalizedTag)` with no
// whitelist, so `#` gets encoded to `%23` and the href is `…?title=%7C%23`.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('wiki tag URI escape whitelists `#`', () => {
  it('keeps `#` literal in the href for `[[|#]]`', async () => {
    const input = '[[|#]]';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
