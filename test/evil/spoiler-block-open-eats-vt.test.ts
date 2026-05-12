// Sibling of test/evil/section-open-eats-vt.test.ts. Same shape, fourth
// call site of the same `<open> space*` POSIX-space rule:
//
//   spoilers_open space* => { ... dstack_open_block(BLOCK_SPOILER, ...); };
//                                                        (line 679)
//
// `parseSpoilerBlock` still calls `skipWhitespace()` (space + tab only),
// so VT or FF immediately after `[spoiler]` leaks into the first
// paragraph instead of getting stripped.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('spoiler block open eats every POSIX space, including VT', () => {
  it('strips a leading VT before the first content line', async () => {
    const input = '[spoiler]\x0bbody[/spoiler]';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
