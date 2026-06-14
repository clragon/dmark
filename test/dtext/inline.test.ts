import { describe, it, expect } from 'vitest';
import { convertDTextToHtml } from '@dmark/convert';

describe('DText Inline Formatting', () => {
  describe('Basic Formatting', () => {
    it('parses bold text', () => {
      expect(convertDTextToHtml('[b]Bold[/b]')).toBe(
        '<p><strong>Bold</strong></p>',
      );
    });

    it('parses italic text', () => {
      expect(convertDTextToHtml('[i]Italics[/i]')).toBe(
        '<p><em>Italics</em></p>',
      );
    });

    it('parses strikeout text', () => {
      expect(convertDTextToHtml('[s]Strikeout[/s]')).toBe(
        '<p><s>Strikeout</s></p>',
      );
    });

    it('parses underline text', () => {
      expect(convertDTextToHtml('[u]Underline[/u]')).toBe(
        '<p><u>Underline</u></p>',
      );
    });

    it('parses superscript text', () => {
      expect(convertDTextToHtml('[sup]Superscript[/sup]')).toBe(
        '<p><sup>Superscript</sup></p>',
      );
    });

    it('parses subscript text', () => {
      expect(convertDTextToHtml('[sub]Subscript[/sub]')).toBe(
        '<p><sub>Subscript</sub></p>',
      );
    });

    it('parses inline spoiler', () => {
      // A spoiler embedded inside a paragraph stays inline. A spoiler that
      // sits at block context (start of document, after \n\n, or after a
      // heading) becomes a <div class="spoiler"><p>...</p></div> block,
      // covered separately under Spoiler Block.
      expect(
        convertDTextToHtml("here is [spoiler]I'm a spoiler![/spoiler] hidden"),
      ).toBe(
        '<p>here is <span class="spoiler">I\'m a spoiler!</span> hidden</p>',
      );
    });

    it('parses inline code', () => {
      expect(convertDTextToHtml('`inline code`')).toBe(
        '<p><span class="inline-code">inline code</span></p>',
      );
    });

    it('parses escaped backtick', () => {
      expect(convertDTextToHtml('\\`')).toBe('<p>`</p>');
    });
  });

  describe('Color Formatting', () => {
    it('parses color by name', () => {
      expect(convertDTextToHtml("[color=red]I'm red![/color]")).toBe(
        '<p><span class="dtext-color" style="color:red">I\'m red!</span></p>',
      );
    });

    it('parses color by hex code', () => {
      expect(convertDTextToHtml("[color=#ff0000]I'm red![/color]")).toBe(
        '<p><span class="dtext-color" style="color:#ff0000">I\'m red!</span></p>',
      );
    });

    it('parses tag category color (artist)', () => {
      expect(convertDTextToHtml("[color=artist]I'm an artist![/color]")).toBe(
        '<p><span class="dtext-color-artist">I\'m an artist!</span></p>',
      );
    });

    it('parses tag category color (character)', () => {
      expect(convertDTextToHtml('[color=character]Character[/color]')).toBe(
        '<p><span class="dtext-color-character">Character</span></p>',
      );
    });
  });

  describe('Nested Formatting', () => {
    it('parses nested bold and italic', () => {
      expect(convertDTextToHtml('[b][i]Bold and Italic[/i][/b]')).toBe(
        '<p><strong><em>Bold and Italic</em></strong></p>',
      );
    });

    it('parses multiple inline formats', () => {
      expect(convertDTextToHtml('[b]Bold[/b] and [i]Italic[/i]')).toBe(
        '<p><strong>Bold</strong> and <em>Italic</em></p>',
      );
    });
  });

  describe('HTML Escaping', () => {
    it('escapes HTML entities', () => {
      expect(convertDTextToHtml('<script>alert("xss")</script>')).toBe(
        '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>',
      );
    });

    it('escapes ampersands', () => {
      expect(convertDTextToHtml('Tom & Jerry')).toBe('<p>Tom &amp; Jerry</p>');
    });
  });
});
