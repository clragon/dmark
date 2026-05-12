// Ragel inline rule (line 542):
//
//   newline => {
//     if (header_mode) {
//       dstack_close_leaf_blocks();
//       fret;
//     } else if (dstack_is_open(BLOCK_UL)) { ... }
//     else { append("<br>"); }
//   };
//
// In header_mode a single newline closes the header instead of emitting a
// `<br>`. The `dstack_close_leaf_blocks` walks the dstack down, closing
// any open inline tags (the unclosed `[b]` here) on the way out.
//
// Concrete:
//
//   h1. [b]bold[/i]\n
//   oracle: <h1><strong>bold[/i]</strong></h1>
//
// dmark's bold close from `trimTrailingLineBreaks` was correctly removed
// by an earlier fix (inline containers keep trailing `<br>`). But the
// header trailing newline is a separate signal: in header_mode the
// newline must NOT produce a `<br>` at all. dmark emits
// `<strong>bold[/i]<br></strong>` because the inline container records
// the newline as a line_break before the header loop closes.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('header trailing newline closes the header without emitting <br>', () => {
  it('drops the final newline as a header-end signal, not a line break', async () => {
    const input = 'h1. [b]bold[/i]\n';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
