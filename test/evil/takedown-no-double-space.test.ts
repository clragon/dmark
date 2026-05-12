// Ragel's takedown id-link uses literal-space separators between the
// component words (ref/dtext/ext/dtext/dtext.cpp.rl line 166):
//
//   takedown_id = 'take'i ' 'i? 'down 'i 'request 'i? '#'i id;
//
// Note `'down 'i` is the literal four-byte string `down ` - exactly one
// trailing space. So `take down  request #5` (two spaces between `down`
// and `request`) does NOT match: the second space has nowhere to fit.
// Oracle output is plain literal text.
//
// The TS port encodes this rule in `ID_PATTERNS` as `take\\s?down\\s+
// request`. The `\s+` greedily eats the doubled space, so the pattern
// matches and renders an id-link. Distinct from the missing word-
// boundary precondition (no-preceding-word-boundary test) - that's the
// LEFT side; this is the inter-word separators.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('takedown id-link rejects internal double-space', () => {
  it('keeps `take down  request #5` as literal text', async () => {
    const input = 'take down  request #5';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
