// Markdown list coverage. Lists are special because the AST flattens nested
// structure into depth-tagged sibling items in one `ListNode`, while the
// markdown source uses indentation. The walker has to invert that. Ordered
// lists demote to unordered with a `md.ordered_list_demoted` warning; see
// ADR-0016 for the marker rule.

import { describe, expect, it } from 'vitest';

import { parseMarkdownToAst } from '../../src/md/parse';

describe('flat unordered list', () => {
  it('produces one ListNode with depth-1 items', () => {
    const result = parseMarkdownToAst('- a\n- b\n- c');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children).toEqual([
      {
        type: 'list',
        items: [
          {
            type: 'list_item',
            depth: 1,
            children: [{ type: 'text', content: 'a' }],
          },
          {
            type: 'list_item',
            depth: 1,
            children: [{ type: 'text', content: 'b' }],
          },
          {
            type: 'list_item',
            depth: 1,
            children: [{ type: 'text', content: 'c' }],
          },
        ],
      },
    ]);
  });

  it('accepts both `-` and `*` bullet markers', () => {
    const dashes = parseMarkdownToAst('- one\n- two').document.children[0];
    const stars = parseMarkdownToAst('* one\n* two').document.children[0];
    expect(dashes).toEqual(stars);
  });

  it('parses inline emphasis in item text', () => {
    const result = parseMarkdownToAst('- **bold item**');
    expect(result.document.children).toEqual([
      {
        type: 'list',
        items: [
          {
            type: 'list_item',
            depth: 1,
            children: [
              {
                type: 'bold',
                children: [{ type: 'text', content: 'bold item' }],
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe('nested unordered list', () => {
  it('emits nested items as siblings with higher depth, in document order', () => {
    const result = parseMarkdownToAst('- a\n  - nested\n- c');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children).toEqual([
      {
        type: 'list',
        items: [
          {
            type: 'list_item',
            depth: 1,
            children: [{ type: 'text', content: 'a' }],
          },
          {
            type: 'list_item',
            depth: 2,
            children: [{ type: 'text', content: 'nested' }],
          },
          {
            type: 'list_item',
            depth: 1,
            children: [{ type: 'text', content: 'c' }],
          },
        ],
      },
    ]);
  });

  it('handles three levels deep', () => {
    const result = parseMarkdownToAst('- l1\n  - l2\n    - l3');
    expect(result.document.children[0]).toEqual({
      type: 'list',
      items: [
        {
          type: 'list_item',
          depth: 1,
          children: [{ type: 'text', content: 'l1' }],
        },
        {
          type: 'list_item',
          depth: 2,
          children: [{ type: 'text', content: 'l2' }],
        },
        {
          type: 'list_item',
          depth: 3,
          children: [{ type: 'text', content: 'l3' }],
        },
      ],
    });
  });
});

describe('ordered list', () => {
  it('demotes to a flat unordered ListNode with one warning per ordered_list_open', () => {
    const result = parseMarkdownToAst('1. a\n2. b');
    expect(result.diagnostics).toEqual([
      {
        code: 'md.ordered_list_demoted',
        severity: 'warning',
        message: expect.stringContaining('Ordered list'),
      },
    ]);
    expect(result.document.children).toEqual([
      {
        type: 'list',
        items: [
          {
            type: 'list_item',
            depth: 1,
            children: [{ type: 'text', content: 'a' }],
          },
          {
            type: 'list_item',
            depth: 1,
            children: [{ type: 'text', content: 'b' }],
          },
        ],
      },
    ]);
  });

  it('emits a separate diagnostic for each nested ordered list', () => {
    const result = parseMarkdownToAst('1. a\n   1. nested\n2. c');
    const warnings = result.diagnostics.filter(
      (d) => d.code === 'md.ordered_list_demoted',
    );
    expect(warnings).toHaveLength(2);
  });
});

describe('separate top-level lists', () => {
  it('produces two distinct ListNodes when interrupted by another block', () => {
    // CommonMark treats `- a\n\n- b` as a single loose list; two distinct
    // lists require a non-list block between them (here a paragraph).
    const result = parseMarkdownToAst('- a\n\nbreak\n\n- b');
    expect(result.document.children).toHaveLength(3);
    expect(result.document.children[0]!.type).toBe('list');
    expect(result.document.children[1]!.type).toBe('paragraph');
    expect(result.document.children[2]!.type).toBe('list');
  });
});

describe('robustness', () => {
  it('does not throw on a list with empty items', () => {
    expect(() => parseMarkdownToAst('-\n- item')).not.toThrow();
  });

  it('does not throw on extreme nesting', () => {
    let s = '';
    for (let d = 0; d < 6; d++) {
      s += `${'  '.repeat(d)}- l${d + 1}\n`;
    }
    expect(() => parseMarkdownToAst(s)).not.toThrow();
  });
});
