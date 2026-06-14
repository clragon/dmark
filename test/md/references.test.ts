// References coverage: wikilinks, tag search, internal anchors. The shape
// these produce is shared with the dtext side via `buildWikiLink` and
// `buildPostSearchLink`, so the AST-equivalence harness pairs them
// trivially.

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

describe('wikilink `[[page]]`', () => {
  it('lowers a plain page reference', () => {
    expect(inlineOf('[[page]]')).toEqual([
      {
        type: 'link',
        linkType: 'wiki',
        href: '/wiki_pages/show_or_new?title=page',
        anchor: undefined,
        children: [{ type: 'text', content: 'page' }],
      },
    ]);
  });

  it('honours `[[page|title]]` for the display text', () => {
    expect(inlineOf('[[wolf|the wolf]]')).toEqual([
      {
        type: 'link',
        linkType: 'wiki',
        href: '/wiki_pages/show_or_new?title=wolf',
        anchor: undefined,
        children: [{ type: 'text', content: 'the wolf' }],
      },
    ]);
  });

  it('lowers `[[page#anchor]]` with anchor stored on the node', () => {
    expect(inlineOf('[[wolf#types]]')).toEqual([
      {
        type: 'link',
        linkType: 'wiki',
        href: '/wiki_pages/show_or_new?title=wolf#types',
        anchor: 'types',
        children: [{ type: 'text', content: 'wolf#types' }],
      },
    ]);
  });

  it('lowers `[[#anchor]]` to an in-page fragment link (preserves AST equivalence)', () => {
    expect(inlineOf('[[#footnotes]]')).toEqual([
      {
        type: 'link',
        linkType: 'wiki',
        href: '#footnotes',
        anchor: 'footnotes',
        children: [{ type: 'text', content: '#footnotes' }],
      },
    ]);
  });

  it('lowercases the tag and replaces spaces with underscores in the href', () => {
    const result = inlineOf('[[Big Bad Wolf]]');
    expect(result[0]).toMatchObject({
      type: 'link',
      linkType: 'wiki',
      href: '/wiki_pages/show_or_new?title=big_bad_wolf',
    });
  });

  it('does not match an unclosed `[[`', () => {
    const inline = inlineOf('[[broken');
    expect(inline.find((n) => n.type === 'link')).toBeUndefined();
  });
});

describe('tag search `{{tags}}`', () => {
  it('lowers `{{tags}}` to a post_search LinkNode', () => {
    expect(inlineOf('{{wolf solo}}')).toEqual([
      {
        type: 'link',
        linkType: 'post_search',
        tags: 'wolf solo',
        href: '/posts?tags=wolf%20solo',
        children: [{ type: 'text', content: 'wolf solo' }],
      },
    ]);
  });

  it('honours `{{tags|title}}` for display text', () => {
    expect(inlineOf('{{wolf|the wolf tag}}')).toEqual([
      {
        type: 'link',
        linkType: 'post_search',
        tags: 'wolf',
        href: '/posts?tags=wolf',
        children: [{ type: 'text', content: 'the wolf tag' }],
      },
    ]);
  });

  it('does not match an unclosed `{{`', () => {
    const inline = inlineOf('{{never closed');
    expect(inline.find((n) => n.type === 'link')).toBeUndefined();
  });
});

describe('internal anchor definition `[#name]`', () => {
  it('lowers to InternalAnchorNode', () => {
    expect(inlineOf('see [#footnotes] later')).toEqual([
      { type: 'text', content: 'see ' },
      { type: 'internal_anchor', name: 'footnotes' },
      { type: 'text', content: ' later' },
    ]);
  });

  it('does not match if the inside contains whitespace', () => {
    const inline = inlineOf('[#has space]');
    expect(inline.find((n) => n.type === 'internal_anchor')).toBeUndefined();
  });

  it('does not collide with a wikilink (`[[`)', () => {
    expect(inlineOf('[[page]]')[0]!.type).toBe('link');
  });
});

describe('composition with emphasis and other rules', () => {
  it('parses a wikilink inside bold', () => {
    expect(inlineOf('**see [[page]] now**')).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'text', content: 'see ' },
          {
            type: 'link',
            linkType: 'wiki',
            href: '/wiki_pages/show_or_new?title=page',
            anchor: undefined,
            children: [{ type: 'text', content: 'page' }],
          },
          { type: 'text', content: ' now' },
        ],
      },
    ]);
  });
});
