// Ragel's scanner has no word-boundary precondition for the id-link rules
// (`post_id = 'post #'i id;` and friends - ref/dtext/ext/dtext/dtext.cpp.rl
// lines 146-167). At every scanner position the longest rule wins, so
// `post #5` glued directly to a preceding digit run still tokenises as
// `post_id`:
//
//   "0post #5" => <p>0<a …>post #5</a></p>
//
// The TS port's parseText gates id-link detection on `prevIsAlnum` (alpha
// + digit), so a digit (or ascii letter) immediately before the prefix
// suppresses the link. Distinct from the `\s+` over-match in the multi-
// word `takedown` pattern.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('id-link detection has no preceding-word-boundary rule', () => {
  it('links `post #5` even when the prior token is digits', async () => {
    const input = '0post #5';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
