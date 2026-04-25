import { describe, expect, it } from 'vitest';

import { parseDText } from '@dmark/dtext';

describe('DText Block Formatting', () => {
  describe('Headers', () => {
    it('parses h1 header', () => {
      expect(parseDText('h1. Header 1\n')).toBe('<h1>Header 1</h1>');
    });

    it('parses h2 header', () => {
      expect(parseDText('h2. Header 2\n')).toBe('<h2>Header 2</h2>');
    });

    it('parses h3 header', () => {
      expect(parseDText('h3. Header 3\n')).toBe('<h3>Header 3</h3>');
    });

    it('parses h4 header', () => {
      expect(parseDText('h4. Header 4\n')).toBe('<h4>Header 4</h4>');
    });

    it('parses h5 header', () => {
      expect(parseDText('h5. Header 5\n')).toBe('<h5>Header 5</h5>');
    });

    it('parses h6 header', () => {
      expect(parseDText('h6. Header 6\n')).toBe('<h6>Header 6</h6>');
    });

    it('parses header with inline formatting', () => {
      expect(parseDText('h1. [b]Bold[/b] Header\n')).toBe(
        '<h1><strong>Bold</strong> Header</h1>',
      );
    });
  });

  describe('Quote', () => {
    it('parses basic quote', () => {
      expect(parseDText('[quote]Please quote me![/quote]')).toBe(
        '<blockquote><p>Please quote me!</p></blockquote>',
      );
    });

    it('parses quote with multiple paragraphs', () => {
      const input = '[quote]First paragraph\n\nSecond paragraph[/quote]';
      expect(parseDText(input)).toContain('<blockquote>');
    });
  });

  describe('Code Block', () => {
    it('parses basic code block', () => {
      expect(parseDText('[code]std::cout << "Hello, World!";[/code]')).toBe(
        '<pre>std::cout &lt;&lt; &quot;Hello, World!&quot;;</pre>',
      );
    });

    it('escapes HTML in code block', () => {
      expect(parseDText('[code]<script>alert("xss")</script>[/code]')).toBe(
        '<pre>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</pre>',
      );
    });
  });

  describe('Lists', () => {
    it('parses simple list', () => {
      const input = '* Item 1\n* Item 2\n* Item 3\n';
      const result = parseDText(input);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('<li>Item 3</li>');
      expect(result).toContain('</ul>');
    });

    it('parses nested list', () => {
      const input = '* Item 1\n* Item 2\n** Item 2A\n** Item 2B\n* Item 3\n';
      const result = parseDText(input);
      expect(result).toContain('Item 2A');
      expect(result).toContain('Item 2B');
    });
  });

  describe('Sections', () => {
    it('parses basic section', () => {
      const result = parseDText('[section]Content here[/section]');
      expect(result).toContain('<details>');
      expect(result).toContain('<summary></summary>');
      expect(result).toContain('Content here');
      expect(result).toContain('</details>');
    });

    it('parses section with title', () => {
      const result = parseDText('[section=Some Title]Content[/section]');
      expect(result).toContain('<summary>Some Title</summary>');
    });

    it('parses expanded section', () => {
      const result = parseDText('[section,expanded]Content[/section]');
      expect(result).toContain('<details open>');
    });

    it('parses expanded section with title', () => {
      const result = parseDText('[section,expanded=Title]Content[/section]');
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
      const result = parseDText(input);
      expect(result).toContain('<table class="striped">');
      expect(result).toContain('<thead>');
      expect(result).toContain('<tbody>');
      expect(result).toContain('<th>Header</th>');
      expect(result).toContain('<td>Cell</td>');
    });

    it('parses table with inline formatting', () => {
      const input = '[table][tr][td][b]Bold Cell[/b][/td][/tr][/table]';
      const result = parseDText(input);
      expect(result).toContain('<strong>Bold Cell</strong>');
    });
  });

  describe('Spoiler Block', () => {
    it('parses block spoiler', () => {
      const result = parseDText('[spoiler]\nHidden content\n[/spoiler]');
      expect(result).toContain('<div class="spoiler">');
      expect(result).toContain('Hidden content');
      expect(result).toContain('</div>');
    });
  });
});
