// Ragel inline rule (ref/dtext/ext/dtext/dtext.cpp.rl line 413):
//
//   newline* spoilers_close => { ... }
//
// The `newline*` is greedy - it eats EVERY preceding newline before the
// stray close, no matter how many. When the close has no matching open,
// the action body is a no-op, BUT in scanner semantics the consumed bytes
// remain part of the literal text emitted by the surrounding `any`
// branches (and the longest-match rule means this rule still wins over
// `newline{2,}` because it consumes more).
//
// Concrete observation: `[b]a\n\n[/spoiler] b[/b]` renders as
//   <p><strong>a\n\n[/spoiler] b</strong></p>
// - the two newlines AND the literal close are inside the open `<strong>`.
//
// The existing parity probe covers the one-newline case
// (`[b]hello\n[/spoiler] world[/b]`). With two-or-more newlines, TS's
// `parseInlineContainer` hits `peekDoubleNewline` first and consumes the
// blank lines via `consumeBlankLines` BEFORE the stray-spoiler-with-
// newlines check fires, so the newlines vanish from the output. Distinct
// fix from the single-newline rule: ordering of the two checks.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('newline-prefixed stray [/spoiler] eats ALL leading newlines', () => {
  it('keeps two literal newlines plus the close inside an open bold', async () => {
    const input = '[b]a\n\n[/spoiler] b[/b]';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
