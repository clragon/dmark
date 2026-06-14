// Standard markdown inline coverage. One describe block per spec row in
// `docs/mapping.md` so a regression bisects to the offending construct.
// AST-equivalence with the dtext side is the contract these assertions
// pin down; see `test/md/ast-equivalence.test.ts` for the paired-fixture
// verification.

import { describe, expect, it } from 'vitest';

import { parseMarkdownToAst } from '../../src/md/parse';

function inlineOf(input: string) {
  const result = parseMarkdownToAst(input);
  expect(result.diagnostics).toEqual([]);
  expect(result.document.children).toHaveLength(1);
  const para = result.document.children[0]!;
  expect(para.type).toBe('paragraph');
  return para.type === 'paragraph' ? para.children : [];
}

describe('bold', () => {
  it('lowers `**text**` to BoldNode', () => {
    expect(inlineOf('**hello**')).toEqual([
      { type: 'bold', children: [{ type: 'text', content: 'hello' }] },
    ]);
  });

  it('preserves surrounding text', () => {
    expect(inlineOf('a **b** c')).toEqual([
      { type: 'text', content: 'a ' },
      { type: 'bold', children: [{ type: 'text', content: 'b' }] },
      { type: 'text', content: ' c' },
    ]);
  });
});

describe('underline', () => {
  it('lowers `__text__` to UnderlineNode (not BoldNode)', () => {
    // markdown-it parses `__` as a strong delimiter; the walker re-tags
    // based on `markup` so the AST distinguishes bold from underline.
    expect(inlineOf('__hello__')).toEqual([
      { type: 'underline', children: [{ type: 'text', content: 'hello' }] },
    ]);
  });
});

describe('italic', () => {
  it('lowers `*text*` to ItalicNode', () => {
    expect(inlineOf('*hello*')).toEqual([
      { type: 'italic', children: [{ type: 'text', content: 'hello' }] },
    ]);
  });

  it('lowers `_text_` to ItalicNode (CommonMark `_` form is accepted)', () => {
    expect(inlineOf('_hello_')).toEqual([
      { type: 'italic', children: [{ type: 'text', content: 'hello' }] },
    ]);
  });
});

describe('strikethrough', () => {
  it('lowers `~~text~~` to StrikeoutNode', () => {
    expect(inlineOf('~~hello~~')).toEqual([
      { type: 'strikeout', children: [{ type: 'text', content: 'hello' }] },
    ]);
  });
});

describe('inline code', () => {
  it('lowers backtick-delimited spans to InlineCodeNode', () => {
    expect(inlineOf('`x`')).toEqual([{ type: 'inline_code', content: 'x' }]);
  });

  it('preserves whitespace inside the span exactly', () => {
    expect(inlineOf('` x  y `')).toEqual([
      { type: 'inline_code', content: 'x  y' },
    ]);
  });
});

describe('inline link `[text](url)`', () => {
  it('produces LinkNode with linkType `inline` and parsed text children', () => {
    expect(inlineOf('[google](https://google.com)')).toEqual([
      {
        type: 'link',
        linkType: 'inline',
        href: 'https://google.com',
        children: [{ type: 'text', content: 'google' }],
      },
    ]);
  });

  it('parses inline emphasis inside the link text', () => {
    expect(inlineOf('[**bold link**](https://example.com)')).toEqual([
      {
        type: 'link',
        linkType: 'inline',
        href: 'https://example.com',
        children: [
          {
            type: 'bold',
            children: [{ type: 'text', content: 'bold link' }],
          },
        ],
      },
    ]);
  });
});

describe('autolink `<url>`', () => {
  it('produces LinkNode with linkType `url` and the href as the only child', () => {
    expect(inlineOf('<https://example.com>')).toEqual([
      {
        type: 'link',
        linkType: 'url',
        href: 'https://example.com',
        children: [{ type: 'text', content: 'https://example.com' }],
      },
    ]);
  });
});

describe('nested emphasis', () => {
  it('walks a bold span containing italic', () => {
    expect(inlineOf('**bold *and italic* bold**')).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'text', content: 'bold ' },
          {
            type: 'italic',
            children: [{ type: 'text', content: 'and italic' }],
          },
          { type: 'text', content: ' bold' },
        ],
      },
    ]);
  });

  it('walks underline containing inline code', () => {
    expect(inlineOf('__under `code` line__')).toEqual([
      {
        type: 'underline',
        children: [
          { type: 'text', content: 'under ' },
          { type: 'inline_code', content: 'code' },
          { type: 'text', content: ' line' },
        ],
      },
    ]);
  });
});

describe('robustness', () => {
  it('does not throw on a stray closing delimiter', () => {
    expect(() => parseMarkdownToAst('foo **')).not.toThrow();
    expect(() => parseMarkdownToAst('foo __')).not.toThrow();
    expect(() => parseMarkdownToAst('foo ~~')).not.toThrow();
  });

  it('emits no diagnostics for a well-formed inline document', () => {
    const result = parseMarkdownToAst(
      'a **b** _c_ ~~d~~ `e` [f](g) <https://h.example>',
    );
    expect(result.diagnostics).toEqual([]);
  });
});
