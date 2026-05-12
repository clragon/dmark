// `[ltable]` row splitting must preserve inner whitespace around the `|`
// separator. The oracle treats the pipe as a literal cell delimiter and
// emits whatever bytes sit between pipes verbatim into the cell HTML, so
// `h1 | h2` becomes `<th>h1 </th><th> h2</th>` - leading/trailing space
// stays inside the cell.
//
// The TS port trims around the pipe before emitting, collapsing the
// example to `<th>h1</th><th>h2</th>`. Distinct from any URL / inline
// container bug: this is a row-splitter rule on the lightweight-table
// block parser.

import { describe, it, expect } from 'vitest';

import { parseDText } from '@dmark/dtext';
import { renderViaOracle } from '../oracle';

describe('ltable preserves intra-cell whitespace around the `|` separator', () => {
  it('keeps the trailing/leading spaces in `h1 | h2` cells', async () => {
    const input = '[ltable]\nh1 | h2\nv1 | v2\n[/ltable]';
    const oracle = await renderViaOracle(input);
    const dmark = parseDText(input);
    expect(dmark).toBe(oracle.html);
  });
});
