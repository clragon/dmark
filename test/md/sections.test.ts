// Section block coverage. BBCode form (`[section]...[/section]`) lands in
// this commit; HTML form (`<details>...</details>`) follows. Both produce
// the same `SectionNode` so the test rows for the HTML form will mirror
// the BBCode rows once they land.

import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../../src/md/parse';

describe('section BBCode form', () => {
  it('lowers a bare `[section]...[/section]` to SectionNode without title or expanded', () => {
    const result = parseMarkdown('[section]\nhello\n[/section]');
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children).toEqual([
      {
        type: 'section',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', content: 'hello' }],
          },
        ],
      },
    ]);
  });

  it('captures the title from `[section=Title]`', () => {
    const result = parseMarkdown('[section=Notes]\nhello\n[/section]');
    expect(result.document.children[0]).toEqual({
      type: 'section',
      title: 'Notes',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'hello' }],
        },
      ],
    });
  });

  it('captures expanded from `[section,expanded]`', () => {
    const result = parseMarkdown('[section,expanded]\nhello\n[/section]');
    expect(result.document.children[0]).toEqual({
      type: 'section',
      expanded: true,
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'hello' }],
        },
      ],
    });
  });

  it('captures both title and expanded from `[section,expanded=Title]`', () => {
    const result = parseMarkdown(
      '[section,expanded=Notes]\nhello\n[/section]',
    );
    expect(result.document.children[0]).toEqual({
      type: 'section',
      title: 'Notes',
      expanded: true,
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'hello' }],
        },
      ],
    });
  });

  it('handles nested sections by tracking depth', () => {
    const result = parseMarkdown(
      '[section]\nouter\n[section]\ninner\n[/section]\nouter again\n[/section]',
    );
    expect(result.document.children).toEqual([
      {
        type: 'section',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', content: 'outer' }],
          },
          {
            type: 'section',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', content: 'inner' }],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [{ type: 'text', content: 'outer again' }],
          },
        ],
      },
    ]);
  });

  it('parses block content (headers, lists) inside a section', () => {
    const result = parseMarkdown(
      '[section]\n# inner header\n\n- item\n[/section]',
    );
    expect(result.document.children[0]).toMatchObject({
      type: 'section',
      children: [
        { type: 'header', level: 1 },
        { type: 'list' },
      ],
    });
  });

  it('matches case-insensitively', () => {
    const result = parseMarkdown('[SECTION=Caps]\nbody\n[/SECTION]');
    expect(result.document.children[0]).toMatchObject({
      type: 'section',
      title: 'Caps',
    });
  });

  it('does not open a section when the close is missing', () => {
    expect(() => parseMarkdown('[section]\nno end')).not.toThrow();
    const result = parseMarkdown('[section]\nno end');
    expect(result.document.children.find((c) => c.type === 'section')).toBeUndefined();
  });
});
