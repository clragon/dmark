// Custom inline coverage. One describe block per spec row from
// md-ast-mapping.md's "Custom inline" section. Adds in commits as each
// plugin lands; current scope is `||spoiler||`. BBCode survivors
// (`[sup]`, `[sub]`, `[color]`) and magic links arrive in follow-ups.

import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../../src/md/parse';

function inlineOf(input: string) {
  const result = parseMarkdown(input);
  expect(result.diagnostics).toEqual([]);
  expect(result.document.children).toHaveLength(1);
  const para = result.document.children[0]!;
  expect(para.type).toBe('paragraph');
  return para.type === 'paragraph' ? para.children : [];
}

describe('inline spoiler `||...||`', () => {
  it('lowers to InlineSpoilerNode', () => {
    expect(inlineOf('||secret||')).toEqual([
      {
        type: 'inline_spoiler',
        children: [{ type: 'text', content: 'secret' }],
      },
    ]);
  });

  it('preserves surrounding text', () => {
    expect(inlineOf('a ||x|| b')).toEqual([
      { type: 'text', content: 'a ' },
      {
        type: 'inline_spoiler',
        children: [{ type: 'text', content: 'x' }],
      },
      { type: 'text', content: ' b' },
    ]);
  });

  it('parses inline emphasis inside the spoiler', () => {
    expect(inlineOf('||hidden **bold** stuff||')).toEqual([
      {
        type: 'inline_spoiler',
        children: [
          { type: 'text', content: 'hidden ' },
          { type: 'bold', children: [{ type: 'text', content: 'bold' }] },
          { type: 'text', content: ' stuff' },
        ],
      },
    ]);
  });

  it('composes inside bold (`**||spoiler||**`)', () => {
    expect(inlineOf('**||hidden||**')).toEqual([
      {
        type: 'bold',
        children: [
          {
            type: 'inline_spoiler',
            children: [{ type: 'text', content: 'hidden' }],
          },
        ],
      },
    ]);
  });

  it('does not match an empty spoiler `||||`', () => {
    // Empty span has no rendered content; spec calls for at least one
    // inner character. Falls through to literal text.
    const inline = inlineOf('||||');
    expect(inline.find((n) => n.type === 'inline_spoiler')).toBeUndefined();
  });

  it('does not match an unclosed `||`', () => {
    expect(() => parseMarkdown('||open and never closed')).not.toThrow();
    const result = parseMarkdown('||open and never closed');
    const para = result.document.children[0]!;
    if (para.type !== 'paragraph') throw new Error('expected paragraph');
    expect(para.children.find((n) => n.type === 'inline_spoiler')).toBeUndefined();
  });

  it('does not eat a single bare `|` (which is not a spoiler delimiter)', () => {
    const inline = inlineOf('a | b');
    expect(inline.find((n) => n.type === 'inline_spoiler')).toBeUndefined();
  });
});
