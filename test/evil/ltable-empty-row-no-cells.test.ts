// `[ltable]` row that splits to all-empty cells must render with zero
// cells, not synthetic empty `<th>` / `<td>` placeholders.
//
// Oracle (matches ruby's `preprocess_for_tables` + the `[table]` scanner):
//
//   [ltable]\n|\n[/ltable]
//   ->
//   <table class="striped"><thead><tr></tr></thead><tbody></tbody></table>
//
// Splitting `|` on the cell delimiter yields `['', '']`; the oracle drops
// every empty cell, so the row has no children. dmark's splitter emits
// `<th></th><th></th>` (two empty cells), which is structural noise the
// oracle never produces.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('ltable row with only empty cells renders zero cells', () => {
  it('emits `<tr></tr>` for a row that is just a single `|`', async () => {
    const input = '[ltable]\n|\n[/ltable]';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});
