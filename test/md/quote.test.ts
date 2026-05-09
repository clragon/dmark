// Quote block coverage on the markdown side. Two source forms produce
// `QuoteNode`:
//   - `>` line-prefix syntax (markdown-it built-in) — colourless.
//   - `[quote]` / `[quote=COLOR]` BBCode-survivor — optional `color`.
//
// Per ADR-0018, the BBCode form is the only way to express a coloured
// quote on the markdown side; `>` always emits a colourless QuoteNode.

import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../../src/md/parse';

describe('quote `>` line-prefix form', () => {
  it('lowers a single-line `>` to a colourless QuoteNode', () => {
    const result = parseMarkdown('> a single line of quote');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children).toEqual([
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', content: 'a single line of quote' },
            ],
          },
        ],
      },
    ]);
  });

  it('preserves multi-line content via line breaks', () => {
    const result = parseMarkdown('> first\n> second');
    expect(result.document.children[0]).toEqual({
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
    });
  });
});

describe('quote BBCode form', () => {
  it('lowers a bare `[quote]...[/quote]` to a colourless QuoteNode', () => {
    const result = parseMarkdown('[quote]\nbody text\n[/quote]');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children).toEqual([
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', content: 'body text' }],
          },
        ],
      },
    ]);
  });

  it('captures named colour from `[quote=red]`', () => {
    const result = parseMarkdown('[quote=red]\nin red\n[/quote]');
    expect(result.document.children[0]).toEqual({
      type: 'quote',
      color: 'red',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'in red' }],
        },
      ],
    });
  });

  it('captures hex colour with case preserved', () => {
    const result = parseMarkdown('[quote=#ABCdef]\nhue\n[/quote]');
    expect(result.document.children[0]).toEqual({
      type: 'quote',
      color: '#ABCdef',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'hue' }],
        },
      ],
    });
  });

  it('captures tag-category colour with case preserved', () => {
    const result = parseMarkdown(
      '[quote=Character]\nhi\n[/quote]',
    );
    expect(result.document.children[0]).toEqual({
      type: 'quote',
      color: 'Character',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'hi' }],
        },
      ],
    });
  });

  it('treats the open marker case-insensitively', () => {
    const result = parseMarkdown('[QUOTE]\nbody\n[/Quote]');
    expect(result.document.children[0]).toEqual({
      type: 'quote',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'body' }],
        },
      ],
    });
  });

  it('supports nested `[quote]` blocks via depth tracking', () => {
    const result = parseMarkdown(
      '[quote]\n[quote=red]\ninner\n[/quote]\n[/quote]',
    );
    expect(result.document.children[0]).toEqual({
      type: 'quote',
      children: [
        {
          type: 'quote',
          color: 'red',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', content: 'inner' }],
            },
          ],
        },
      ],
    });
  });

  it('recursively tokenises inner block content (header inside quote)', () => {
    const result = parseMarkdown(
      '[quote=red]\n# Title\n\nbody\n[/quote]',
    );
    expect(result.document.children[0]).toEqual({
      type: 'quote',
      color: 'red',
      children: [
        {
          type: 'header',
          level: 1,
          children: [{ type: 'text', content: 'Title' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'body' }],
        },
      ],
    });
  });

  it('falls through to text when the close marker is missing', () => {
    const result = parseMarkdown('[quote]\nno close marker here');
    // Open didn't pair; markdown-it absorbs the bracket lines as paragraph
    // text. The exact AST shape depends on tokenisation, but the contract
    // is "no QuoteNode emitted, no throw."
    expect(result.document.children.find((n) => n.type === 'quote')).toBeUndefined();
  });
});
