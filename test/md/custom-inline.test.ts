// Custom inline coverage. One describe block per spec row from
// `docs/mapping.md`'s "Custom inline" section: `||spoiler||`, BBCode
// survivors (`[sup]`, `[sub]`, `[color]`), magic links.

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

describe('BBCode survivors `[sup]` / `[sub]` / `[color=x]`', () => {
  it('lowers `[sup]text[/sup]` to SuperscriptNode', () => {
    expect(inlineOf('[sup]hi[/sup]')).toEqual([
      {
        type: 'superscript',
        children: [{ type: 'text', content: 'hi' }],
      },
    ]);
  });

  it('lowers `[sub]text[/sub]` to SubscriptNode', () => {
    expect(inlineOf('[sub]hi[/sub]')).toEqual([
      {
        type: 'subscript',
        children: [{ type: 'text', content: 'hi' }],
      },
    ]);
  });

  it('lowers `[color=red]text[/color]` to ColorNode with the value preserved', () => {
    expect(inlineOf('[color=red]hi[/color]')).toEqual([
      {
        type: 'color',
        color: 'red',
        children: [{ type: 'text', content: 'hi' }],
      },
    ]);
  });

  it('matches tags case-insensitively', () => {
    expect(inlineOf('[SUP]hi[/SUP]')).toEqual([
      {
        type: 'superscript',
        children: [{ type: 'text', content: 'hi' }],
      },
    ]);
    expect(inlineOf('[Color=Blue]hi[/COLOR]')).toEqual([
      {
        type: 'color',
        color: 'Blue',
        children: [{ type: 'text', content: 'hi' }],
      },
    ]);
  });

  it('parses inline emphasis inside the tag', () => {
    expect(inlineOf('[sup]**bold**[/sup]')).toEqual([
      {
        type: 'superscript',
        children: [
          { type: 'bold', children: [{ type: 'text', content: 'bold' }] },
        ],
      },
    ]);
  });

  it('composes with bold (`**[sub]x[/sub]**`)', () => {
    expect(inlineOf('**[sub]x[/sub]**')).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'subscript', children: [{ type: 'text', content: 'x' }] },
        ],
      },
    ]);
  });

  it('preserves color value with hex form', () => {
    expect(inlineOf('[color=#ff0000]red[/color]')).toEqual([
      {
        type: 'color',
        color: '#ff0000',
        children: [{ type: 'text', content: 'red' }],
      },
    ]);
  });

  it('does not match an unclosed `[sup]`', () => {
    const inline = inlineOf('[sup]forever');
    expect(inline.find((n) => n.type === 'superscript')).toBeUndefined();
  });
});

describe('magic link `post #1234`', () => {
  it('lowers `post #1234` to a LinkNode with linkType id_link', () => {
    expect(inlineOf('see post #1234 for context')).toEqual([
      { type: 'text', content: 'see ' },
      {
        type: 'link',
        linkType: 'id_link',
        idType: 'post',
        id: '1234',
        href: '/posts/1234',
        children: [{ type: 'text', content: 'post #1234' }],
      },
      { type: 'text', content: ' for context' },
    ]);
  });

  it('produces canonical display text per ID_DISPLAY (Pool -> pool, bur -> BUR)', () => {
    expect(inlineOf('Pool #5')[0]).toMatchObject({
      type: 'link',
      linkType: 'id_link',
      idType: 'pool',
      id: '5',
      children: [{ type: 'text', content: 'pool #5' }],
    });
    expect(inlineOf('bur #99')[0]).toMatchObject({
      type: 'link',
      linkType: 'id_link',
      idType: 'bur',
      id: '99',
      children: [{ type: 'text', content: 'BUR #99' }],
    });
  });

  it('handles the multi-word `take down request` form, contracted to takedown', () => {
    expect(inlineOf('take down request #7')[0]).toMatchObject({
      type: 'link',
      linkType: 'id_link',
      idType: 'takedown',
      id: '7',
      children: [{ type: 'text', content: 'takedown #7' }],
    });
  });

  it('does not match in the middle of a word (boundary required)', () => {
    expect(inlineOf('hostpost #1')).toEqual([
      { type: 'text', content: 'hostpost #1' },
    ]);
  });

  it('matches multiple links in the same paragraph', () => {
    const inline = inlineOf('post #1 and pool #2');
    const links = inline.filter((n) => n.type === 'link');
    expect(links).toHaveLength(2);
  });

  it('matches links inside emphasis containers', () => {
    const inline = inlineOf('**see post #42**');
    expect(inline).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'text', content: 'see ' },
          {
            type: 'link',
            linkType: 'id_link',
            idType: 'post',
            id: '42',
            href: '/posts/42',
            children: [{ type: 'text', content: 'post #42' }],
          },
        ],
      },
    ]);
  });
});

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
    expect(() => parseMarkdownToAst('||open and never closed')).not.toThrow();
    const result = parseMarkdownToAst('||open and never closed');
    const para = result.document.children[0]!;
    if (para.type !== 'paragraph') throw new Error('expected paragraph');
    expect(
      para.children.find((n) => n.type === 'inline_spoiler'),
    ).toBeUndefined();
  });

  it('does not eat a single bare `|` (which is not a spoiler delimiter)', () => {
    const inline = inlineOf('a | b');
    expect(inline.find((n) => n.type === 'inline_spoiler')).toBeUndefined();
  });
});
