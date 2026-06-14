// Pipe-table coverage. Markdown's pipe table maps to `TableNode` with the
// head/body distinction the AST encodes, mirroring how the dtext `[table]`
// form parses on the other side. `[ltable]` is dtext-only and not produced
// from markdown input by design (ADR-0012).

import { describe, expect, it } from 'vitest';

import { parseMarkdownToAst } from '../../src/md/parse';

describe('pipe table', () => {
  it('lowers a header + one body row to TableNode with head and body wrappers', () => {
    const result = parseMarkdownToAst('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children).toEqual([
      {
        type: 'table',
        children: [
          {
            type: 'table_head',
            rows: [
              {
                type: 'table_row',
                cells: [
                  {
                    type: 'table_cell',
                    cellType: 'th',
                    children: [{ type: 'text', content: 'a' }],
                  },
                  {
                    type: 'table_cell',
                    cellType: 'th',
                    children: [{ type: 'text', content: 'b' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'table_body',
            rows: [
              {
                type: 'table_row',
                cells: [
                  {
                    type: 'table_cell',
                    cellType: 'td',
                    children: [{ type: 'text', content: '1' }],
                  },
                  {
                    type: 'table_cell',
                    cellType: 'td',
                    children: [{ type: 'text', content: '2' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('handles multiple body rows', () => {
    const result = parseMarkdownToAst('| h1 |\n|----|\n| r1 |\n| r2 |\n| r3 |');
    const body = (
      result.document.children[0] as {
        children: { type: string; rows?: unknown[] }[];
      }
    ).children.find((c) => c.type === 'table_body') as { rows: unknown[] };
    expect(body.rows).toHaveLength(3);
  });

  it('parses inline emphasis inside cell content', () => {
    const result = parseMarkdownToAst('| h |\n|---|\n| **bold** cell |');
    const bodyRows = (
      result.document.children[0] as {
        children: { type: string; rows?: { cells: unknown[] }[] }[];
      }
    ).children.find((c) => c.type === 'table_body')!.rows!;
    expect(bodyRows[0]).toEqual({
      type: 'table_row',
      cells: [
        {
          type: 'table_cell',
          cellType: 'td',
          children: [
            { type: 'bold', children: [{ type: 'text', content: 'bold' }] },
            { type: 'text', content: ' cell' },
          ],
        },
      ],
    });
  });

  it('drops alignment from `:---:` separator without a diagnostic', () => {
    const result = parseMarkdownToAst('| a | b |\n|:--|:-:|\n| x | y |');
    expect(result.diagnostics).toEqual([]);
    // No alignment field on cells; the AST has no slot.
    const body = (
      result.document.children[0] as {
        children: { type: string; rows?: { cells: { type: string }[] }[] }[];
      }
    ).children.find((c) => c.type === 'table_body')!.rows![0]!;
    expect(body.cells[0]).not.toHaveProperty('align');
  });
});

describe('robustness', () => {
  it('does not throw on a malformed table', () => {
    expect(() =>
      parseMarkdownToAst('| a | b |\n| no-separator |'),
    ).not.toThrow();
  });
});
