// Anchor-only wiki link with multiple `#` inside the anchor.
//
// Ragel's `append_wiki_link` anchor-only branch (line 896):
//
//   if (tag[0] == '#') {
//     append("…href=\"#");
//     append_uri_escaped(normalized_tag.substr(1, normalized_tag.size() - 1));
//     append("\">");
//   }
//
// The leading `#` is emitted verbatim as the fragment marker. The rest
// of the anchor runs through `append_uri_escaped` with NO whitelist, so
// any `#` inside the anchor body gets encoded to `%23`.
//
// Example:
//   [[#a#b]]  ->  href="#a%23b"
//
// dmark's `buildWikiLink` anchor-only branch uses `anchorHref`, which
// URI-escapes then unescapes EVERY `%23` back to `#`. So the embedded
// hash in the anchor stays literal and the href is `#a#b` (two unencoded
// hashes), which is a different URL.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('anchor-only wiki link encodes internal `#` characters', () => {
  it('renders `[[#a#b]]` with the second hash as `%23`', async () => {
    const input = '[[#a#b]]';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
