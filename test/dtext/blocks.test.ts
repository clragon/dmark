import { describe, expect, it } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';

describe('DText Block Formatting', () => {
  describe('Headers', () => {
    it('parses h1 header', () => {
      expect(convertDTextToHtml('h1. Header 1\n')).toBe('<h1>Header 1</h1>');
    });

    it('parses h2 header', () => {
      expect(convertDTextToHtml('h2. Header 2\n')).toBe('<h2>Header 2</h2>');
    });

    it('parses h3 header', () => {
      expect(convertDTextToHtml('h3. Header 3\n')).toBe('<h3>Header 3</h3>');
    });

    it('parses h4 header', () => {
      expect(convertDTextToHtml('h4. Header 4\n')).toBe('<h4>Header 4</h4>');
    });

    it('parses h5 header', () => {
      expect(convertDTextToHtml('h5. Header 5\n')).toBe('<h5>Header 5</h5>');
    });

    it('parses h6 header', () => {
      expect(convertDTextToHtml('h6. Header 6\n')).toBe('<h6>Header 6</h6>');
    });

    it('parses header with inline formatting', () => {
      expect(convertDTextToHtml('h1. [b]Bold[/b] Header\n')).toBe(
        '<h1><strong>Bold</strong> Header</h1>',
      );
    });
  });

  describe('Quote', () => {
    it('parses basic quote', () => {
      expect(convertDTextToHtml('[quote]Please quote me![/quote]')).toBe(
        '<blockquote><p>Please quote me!</p></blockquote>',
      );
    });

    it('parses quote with multiple paragraphs', () => {
      const input = '[quote]First paragraph\n\nSecond paragraph[/quote]';
      expect(convertDTextToHtml(input)).toContain('<blockquote>');
    });
  });

  describe('Code Block', () => {
    it('parses basic code block', () => {
      expect(
        convertDTextToHtml('[code]std::cout << "Hello, World!";[/code]'),
      ).toBe('<pre>std::cout &lt;&lt; &quot;Hello, World!&quot;;</pre>');
    });

    it('escapes HTML in code block', () => {
      expect(
        convertDTextToHtml('[code]<script>alert("xss")</script>[/code]'),
      ).toBe('<pre>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</pre>');
    });
  });

  describe('Lists', () => {
    it('parses simple list', () => {
      const input = '* Item 1\n* Item 2\n* Item 3\n';
      const result = convertDTextToHtml(input);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('<li>Item 3</li>');
      expect(result).toContain('</ul>');
    });

    it('parses nested list', () => {
      const input = '* Item 1\n* Item 2\n** Item 2A\n** Item 2B\n* Item 3\n';
      const result = convertDTextToHtml(input);
      expect(result).toContain('Item 2A');
      expect(result).toContain('Item 2B');
    });
  });

  describe('Sections', () => {
    it('parses basic section', () => {
      const result = convertDTextToHtml('[section]Content here[/section]');
      expect(result).toContain('<details>');
      expect(result).toContain('<summary></summary>');
      expect(result).toContain('Content here');
      expect(result).toContain('</details>');
    });

    it('parses section with title', () => {
      const result = convertDTextToHtml(
        '[section=Some Title]Content[/section]',
      );
      expect(result).toContain('<summary>Some Title</summary>');
    });

    it('parses expanded section', () => {
      const result = convertDTextToHtml('[section,expanded]Content[/section]');
      expect(result).toContain('<details open>');
    });

    it('parses expanded section with title', () => {
      const result = convertDTextToHtml(
        '[section,expanded=Title]Content[/section]',
      );
      expect(result).toContain('<details open>');
      expect(result).toContain('<summary>Title</summary>');
    });
  });

  describe('Tables', () => {
    it('parses basic table', () => {
      const input = `[table]
[thead]
[tr]
[th]Header[/th]
[/tr]
[/thead]
[tbody]
[tr]
[td]Cell[/td]
[/tr]
[/tbody]
[/table]`;
      const result = convertDTextToHtml(input);
      expect(result).toContain('<table class="striped">');
      expect(result).toContain('<thead>');
      expect(result).toContain('<tbody>');
      expect(result).toContain('<th>Header</th>');
      expect(result).toContain('<td>Cell</td>');
    });

    it('parses table with inline formatting', () => {
      const input = '[table][tr][td][b]Bold Cell[/b][/td][/tr][/table]';
      const result = convertDTextToHtml(input);
      expect(result).toContain('<strong>Bold Cell</strong>');
    });
  });

  describe('Spoiler Block', () => {
    it('parses block spoiler', () => {
      const result = convertDTextToHtml(
        '[spoiler]\nHidden content\n[/spoiler]',
      );
      expect(result).toContain('<div class="spoiler">');
      expect(result).toContain('Hidden content');
      expect(result).toContain('</div>');
    });
  });
});
