// Sibling of test/evil/quote-open-eats-vt.test.ts. Ragel attaches
// `space*` (POSIX `[ \t\n\v\f\r]`) to EVERY section-open variant:
//
//   section_open space* => append_section({}, false);            (line 699)
//   section_open_expanded space* => append_section({}, true);    (line 703)
//   section_open_aliased space* => ...                           (line 707)
//   section_open_aliased_expanded space* => ...                  (line 712)
//
// You added a `skipPosixSpace()` helper and wired it into `parseQuote`.
// `parseSection` still calls `skipWhitespace()` (space+tab only). VT and
// FF after `[section]` leak straight into the first `<p>` of body content.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('section_open eats every POSIX space, including VT', () => {
  it('strips a leading VT before the first content line', async () => {
    const input = '[section]\x0bhi[/section]';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
