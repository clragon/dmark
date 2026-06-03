// Section block coverage. BBCode form (`[section]...[/section]`) and HTML
// form (`<details>...</details>`) both produce the same `SectionNode`; the
// HTML-form rows mirror the BBCode rows. See ADR-0011.

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
    const result = parseMarkdown('[section,expanded=Notes]\nhello\n[/section]');
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
      children: [{ type: 'header', level: 1 }, { type: 'list' }],
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
    expect(
      result.document.children.find((c) => c.type === 'section'),
    ).toBeUndefined();
  });
});

describe('section HTML form `<details>`', () => {
  it('lowers a bare `<details>...</details>` to SectionNode', () => {
    const result = parseMarkdown('<details>\nhello\n</details>');
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

  it('captures the `open` attribute as expanded', () => {
    const result = parseMarkdown('<details open>\nhello\n</details>');
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

  it('captures the title from `<summary>...</summary>` on the open line', () => {
    const result = parseMarkdown(
      '<details><summary>Notes</summary>\nhello\n</details>',
    );
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

  it('captures both open and summary together', () => {
    const result = parseMarkdown(
      '<details open><summary>Notes</summary>\nhello\n</details>',
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

  it('handles nested `<details>` by tracking depth', () => {
    const result = parseMarkdown(
      '<details>\nouter\n<details>\ninner\n</details>\nouter again\n</details>',
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

  it('produces the same SectionNode for HTML and BBCode forms with the same title', () => {
    const html = parseMarkdown(
      '<details open><summary>X</summary>\nbody\n</details>',
    ).document.children[0];
    const bbcode = parseMarkdown('[section,expanded=X]\nbody\n[/section]')
      .document.children[0];
    expect(html).toEqual(bbcode);
  });

  it('rejects unsupported attributes (falls through to text)', () => {
    const result = parseMarkdown('<details class="foo">\nx\n</details>');
    expect(
      result.document.children.find((c) => c.type === 'section'),
    ).toBeUndefined();
  });
});
