// At top-level (main scanner), `[spoiler]` opens a block-form spoiler:
//
//   spoilers_open space* => {
//     dstack_close_leaf_blocks();
//     dstack_open_block(BLOCK_SPOILER, "<div class=\"spoiler\">");
//   };
//                                                  (line 679)
//
// At end-of-input ragel closes whatever's still on the dstack, so an
// unclosed `[spoiler]body` walks out as
//   <div class="spoiler"><p>body</p></div>
//
// dmark's `peekSpoilerBlockOpen` requires a `\n` somewhere in the body
// before promoting; a single-line input falls through to the INLINE
// spoiler open, producing
//   <p><span class="spoiler">body</span></p>
//
// The block/inline split is correct for closed spoilers (existing parity
// test covers `[spoiler]inline body[/spoiler]` as a block), but the
// unclosed-at-EOF case still goes the wrong way.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('unclosed `[spoiler]…<EOF>` is a block, not an inline span', () => {
  it('renders as `<div class="spoiler"><p>body</p></div>`', async () => {
    const input = '[spoiler]body';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
