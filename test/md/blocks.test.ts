// Standard markdown block coverage. One describe block per spec row in
// `docs/mapping.md`. Pairs naturally with `inline.test.ts`; together they
// cover the CommonMark surface the adapter relies on before the custom
// extensions.

import { describe, expect, it } from 'vitest';

import { parseMarkdownToAst } from '../../src/md/parse';
import type { BlockNode } from '../../src/ast';

function blocksOf(input: string): BlockNode[] {
  const result = parseMarkdownToAst(input);
  expect(result.diagnostics).toEqual([]);
  return result.document.children;
}

describe('headers', () => {
  it('lowers `# h1` through `###### h6` to HeaderNode with the right level', () => {
    for (let level = 1; level <= 6; level++) {
      const input = `${'#'.repeat(level)} title ${level}`;
      expect(blocksOf(input)).toEqual([
        {
          type: 'header',
          level,
          children: [{ type: 'text', content: `title ${level}` }],
        },
      ]);
    }
  });

  it('parses inline emphasis inside header text', () => {
    expect(blocksOf('## **bold** title')).toEqual([
      {
        type: 'header',
        level: 2,
        children: [
          { type: 'bold', children: [{ type: 'text', content: 'bold' }] },
          { type: 'text', content: ' title' },
        ],
      },
    ]);
  });

  it('emits md.setext_header_normalized info for `===` (level 1)', () => {
    const result = parseMarkdownToAst('big\n===');
    expect(result.diagnostics).toEqual([
      {
        code: 'md.setext_header_normalized',
        severity: 'info',
        message: expect.stringContaining('Setext'),
      },
    ]);
    expect(result.document.children).toEqual([
      {
        type: 'header',
        level: 1,
        children: [{ type: 'text', content: 'big' }],
      },
    ]);
  });

  it('emits md.setext_header_normalized info for `---` (level 2)', () => {
    const result = parseMarkdownToAst('mid\n---');
    expect(result.diagnostics[0]!.code).toBe('md.setext_header_normalized');
    expect(result.document.children[0]).toEqual({
      type: 'header',
      level: 2,
      children: [{ type: 'text', content: 'mid' }],
    });
  });
});

describe('blockquote', () => {
  it('lowers `> text` to QuoteNode containing a paragraph', () => {
    expect(blocksOf('> hello')).toEqual([
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', content: 'hello' }],
          },
        ],
      },
    ]);
  });

  it('joins continuation lines into a single paragraph inside the quote', () => {
    expect(blocksOf('> first\n> second')).toEqual([
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', content: 'first' },
              { type: 'line_break' },
              { type: 'text', content: 'second' },
            ],
          },
        ],
      },
    ]);
  });

  it('handles nested quotes', () => {
    expect(blocksOf('> outer\n>\n> > inner')).toEqual([
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', content: 'outer' }],
          },
          {
            type: 'quote',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', content: 'inner' }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('does not set the optional `color` field', () => {
    const blocks = blocksOf('> hi');
    expect(blocks[0]).not.toHaveProperty('color');
  });
});

describe('fenced code block', () => {
  it('lowers triple-backtick fenced code to CodeBlockNode', () => {
    expect(blocksOf('```\nlet x = 1;\n```')).toEqual([
      { type: 'code_block', content: 'let x = 1;\n' },
    ]);
  });

  it('emits md.code_lang_dropped info when a language hint is present', () => {
    const result = parseMarkdownToAst('```ruby\nputs :hi\n```');
    expect(result.diagnostics).toEqual([
      {
        code: 'md.code_lang_dropped',
        severity: 'info',
        message: expect.stringContaining('ruby'),
      },
    ]);
    expect(result.document.children[0]).toEqual({
      type: 'code_block',
      content: 'puts :hi\n',
    });
  });
});

describe('indented code block', () => {
  it('lowers four-space indented code to CodeBlockNode without a diagnostic', () => {
    const result = parseMarkdownToAst('    let x = 1;');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children[0]).toEqual({
      type: 'code_block',
      content: 'let x = 1;\n',
    });
  });
});

describe('robustness', () => {
  it('does not throw on an unclosed fence', () => {
    expect(() => parseMarkdownToAst('```\nunclosed')).not.toThrow();
  });

  it('does not throw on a deeply nested quote', () => {
    expect(() => parseMarkdownToAst('> > > > > deep')).not.toThrow();
  });
});
