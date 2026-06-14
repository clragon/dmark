// Only the plain `quote_open` rule has the post-open `space*` eat in ragel
// (ref/dtext/ext/dtext/dtext.cpp.rl):
//
//   quote_open space* => { ... };               (line 651)
//   quote_open_colored => { ... };              (line 665, NO space*)
//   quote_open_colored_typed => { ... };        (line 656, NO space*)
//
// Leading whitespace after a colored / typed quote open therefore stays
// inside the paragraph that the inline scanner falls into via the `any`
// rule (line 746). The TS port's `parseQuote(color)` is shared by all
// three forms and unconditionally strips that whitespace.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('colored quote_open keeps leading horizontal whitespace', () => {
  it('preserves the two spaces after `[quote=red]`', async () => {
    const input = '[quote=red]  hi[/quote]';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
