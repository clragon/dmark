// Stray `[/code]` inside a list item.
//
// Ragel inline rule (ref/dtext/ext/dtext/dtext.cpp.rl lines 461-475):
//
//   '[/code]'i space* => {
//     dstack_close_before_block();
//     if (dstack_check(BLOCK_LI)) { dstack_close_list(); }
//     if (dstack_check(BLOCK_CODE)) { dstack_rewind(); fret; }
//     else { append_block("[/code]"); }
//   };
//
// When the stray close appears inside a list item, the rule explicitly
// closes the list, emits literal `[/code]` at block level, and the trailing
// `\n* next` line tokenises as a brand-new `<ul><li>next</li></ul>`.
//
// Mender's earlier fix added stray-close absorption inside inline containers
// (`[b]`, `[i]`, `[u]`, `[s]`); the list-item context is a different code
// path (block-level, list-aware) and still drops the close and the trailing
// list-item line into a `<br>* next<br>` inline tail.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('stray `[/code]` inside a list item closes the list and resumes', () => {
  it('lets the line after the stray close start a new list', async () => {
    const input = '* item [/code] tail\n* next\n';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
