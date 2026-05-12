// When the thumbnail budget runs out, ragel does NOT render a
// "limit-exceeded" placeholder - it falls back to a plain post-id-link
// (ref/dtext/ext/dtext/dtext.cpp.rl lines 246-262):
//
//   thumb_id => {
//     if(posts.size() < options.max_thumbs) {
//       // ...emit thumbnail link...
//     } else {
//       append_id_link("post", "post", "/posts/");
//     }
//   };
//
// So `thumb #5` with `max_thumbs: 0` renders as the standard
//   <a class="dtext-link dtext-id-link dtext-post-id-link" href="/posts/5">post #5</a>
// - same shape as if the source had said `post #5`.
//
// dmark's renderer emits a `<span class="thumb-limit-exceeded">` shim
// instead, which is a different node entirely.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('thumb-id past max_thumbs falls back to a post-id-link', () => {
  it('renders as a plain `<a … href="/posts/5">post #5</a>` when max_thumbs=0', async () => {
    const input = 'thumb #5';
    const oracle = await renderViaOracle(input, { max_thumbs: 0 });
    const dmark = parseDText(input, { maxThumbs: 0 });
    expect(dmark).toBe(oracle.html);
  });
});
