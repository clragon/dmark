// Spoiler-block coverage on the markdown side. The block form
// (`[spoiler]\n...\n[/spoiler]`) is BBCode-survivor only: markdown's
// `||...||` syntax is inline (per `docs/mapping.md`'s Spoiler-block row)
// and cannot span block boundaries.
//
// Block recogniser lives in `src/md/parse/plugins/spoiler-block`; the
// inline `||` rule lives in `src/md/parse/plugins/spoiler` and produces
// `InlineSpoilerNode` rather than `SpoilerBlockNode`.

import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../../src/md/parse';

describe('spoiler-block BBCode form', () => {
  it('lowers a bare `[spoiler]...[/spoiler]` to a SpoilerBlockNode', () => {
    const result = parseMarkdown('[spoiler]\nhidden body\n[/spoiler]');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children).toEqual([
      {
        type: 'spoiler_block',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', content: 'hidden body' }],
          },
        ],
      },
    ]);
  });

  it('treats the open marker case-insensitively', () => {
    const result = parseMarkdown('[SPOILER]\nbody\n[/Spoiler]');
    expect(result.document.children[0]).toEqual({
      type: 'spoiler_block',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'body' }],
        },
      ],
    });
  });

  it('supports nested spoilers via depth tracking', () => {
    const result = parseMarkdown(
      '[spoiler]\n[spoiler]\ninner\n[/spoiler]\n[/spoiler]',
    );
    expect(result.document.children[0]).toEqual({
      type: 'spoiler_block',
      children: [
        {
          type: 'spoiler_block',
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

  it('recursively tokenises inner block content', () => {
    const result = parseMarkdown(
      '[spoiler]\n# Title\n\nbody\n[/spoiler]',
    );
    expect(result.document.children[0]).toEqual({
      type: 'spoiler_block',
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

  it('falls through when the close marker is missing', () => {
    const result = parseMarkdown('[spoiler]\nno close marker here');
    expect(
      result.document.children.find((n) => n.type === 'spoiler_block'),
    ).toBeUndefined();
  });

  it('does not interfere with the inline `||` spoiler rule', () => {
    // `||x||` mid-paragraph still produces an InlineSpoilerNode; the block
    // plugin only fires on standalone `[spoiler]` lines.
    const result = parseMarkdown('before ||hidden|| after');
    expect(result.document.children[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', content: 'before ' },
        {
          type: 'inline_spoiler',
          children: [{ type: 'text', content: 'hidden' }],
        },
        { type: 'text', content: ' after' },
      ],
    });
  });
});
