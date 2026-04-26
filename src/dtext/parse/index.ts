import type {
  BlockNode,
  CodeBlockNode,
  ColorNode,
  DocumentNode,
  HeaderNode,
  InlineNode,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  QuoteNode,
  SectionNode,
  SpoilerBlockNode,
  TableBodyNode,
  TableCellNode,
  TableHeadNode,
  TableNode,
  TableRowNode,
  TextNode,
} from '../../ast';

interface ParserOptions {
  allowColor?: boolean;
  maxThumbs?: number;
  baseUrl?: string;
  inlineOnly?: boolean;
}

interface UrlMatch {
  url: string;
  start: number;
  end: number;
}

interface IdMatch {
  type: string;
  id: string;
  text: string;
}

interface PostSearchMatch {
  tag: string;
  title?: string;
}

interface WikiLinkMatch {
  tag: string;
  title?: string;
  anchor?: string;
}

interface TextileLinkMatch {
  url: string;
  title: string;
}

interface SectionMatch {
  title?: string;
  expanded?: boolean;
}

export interface ListMatch {
  depth: number;
  content: string;
}

const BOUNDARY_CHARS = [
  0x0021, 0x0029, 0x002c, 0x002e, 0x003a, 0x003b, 0x003c, 0x003e, 0x003f,
  0x005d, 0x007d, 0x276d, 0x3000, 0x3001, 0x3002, 0x3008, 0x3009, 0x300a,
  0x300b, 0x300c, 0x300d, 0x300e, 0x300f, 0x3010, 0x3011, 0x3014, 0x3015,
  0x3016, 0x3017, 0x3018, 0x3019, 0x301a, 0x301b, 0x301c, 0xff09, 0xff3d,
  0xff5d, 0xff60, 0xff63,
];

function isBoundaryChar(char: string): boolean {
  return BOUNDARY_CHARS.includes(char.charCodeAt(0));
}

// Parse a piece of text that's already known to be inline-only (link titles,
// for example) and return the resulting inline children. Falls back to a
// single text node if parsing yields nothing useful.
function parseInlineString(input: string): InlineNode[] {
  if (input.length === 0) return [];
  const sub = new DTextStateMachineParser(input, { inlineOnly: true });
  const doc = sub.parse();
  const first = doc.children[0];
  if (first && first.type === 'paragraph' && first.children.length > 0) {
    return first.children;
  }
  return [{ type: 'text', content: input }];
}

// Match ruby's CGI.escape / URI::DEFAULT_PARSER.escape behavior: encode
// everything outside RFC 3986 unreserved (A-Z a-z 0-9 - _ . ~). JS's
// encodeURIComponent leaves !'()* unencoded; ruby encodes them.
function rubyUriEscape(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export class DTextStateMachineParser {
  protected input: string;
  protected pos: number;
  private options: ParserOptions;
  private thumbCount: number;

  // All link ID patterns
  private static readonly ID_PATTERNS = [
    { pattern: 'post', type: 'post' },
    { pattern: 'thumb', type: 'thumb' },
    { pattern: 'post changes', type: 'post_changes' },
    { pattern: 'flag', type: 'flag' },
    { pattern: 'note', type: 'note' },
    { pattern: 'forum', type: 'forum_post' },
    { pattern: 'topic', type: 'topic' },
    { pattern: 'comment', type: 'comment' },
    { pattern: 'pool', type: 'pool' },
    { pattern: 'user', type: 'user' },
    { pattern: 'artist', type: 'artist' },
    { pattern: 'ban', type: 'ban' },
    { pattern: 'bur', type: 'bur' },
    { pattern: 'alias', type: 'alias' },
    { pattern: 'implication', type: 'implication' },
    { pattern: 'mod action', type: 'mod_action' },
    { pattern: 'record', type: 'record' },
    { pattern: 'wiki', type: 'wiki' },
    { pattern: 'set', type: 'set' },
    { pattern: 'blip', type: 'blip' },
    { pattern: 'takedown', type: 'takedown' },
    { pattern: 'take\\s?down\\s+request', type: 'takedown' },
    { pattern: 'ticket', type: 'ticket' },
  ];

  // Single compiled regex for all ID patterns
  private static readonly COMPILED_ID_PATTERN = new RegExp(
    '^(' +
      DTextStateMachineParser.ID_PATTERNS.map((p) => p.pattern).join('|') +
      ')\\s*#(\\d+)',
    'i',
  );

  private static readonly ID_TYPE_MAP = new Map(
    DTextStateMachineParser.ID_PATTERNS.map((p) => [
      p.pattern.replace(/\\s\?\+/g, '').replace(/\\s/g, ' '),
      p.type,
    ]),
  );

  constructor(input: string, options: ParserOptions = {}) {
    this.input = input;
    this.pos = 0;
    this.options = {
      allowColor: true,
      maxThumbs: 10,
      baseUrl: '',
      inlineOnly: false,
      ...options,
    };
    this.thumbCount = 0;
  }

  parse(): DocumentNode {
    if (this.options.inlineOnly) {
      return this.parseInlineDocument();
    }

    const children: BlockNode[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.pos >= this.input.length) break;

      if (this.peekDoubleNewline()) {
        this.consumeNewline();
        this.consumeNewline();
        continue;
      }

      const node = this.parseBlock();
      if (node) {
        children.push(node);
      }
    }

    return { type: 'document', children };
  }

  private parseInlineDocument(): DocumentNode {
    const inlineNodes: InlineNode[] = [];

    while (this.pos < this.input.length) {
      const node = this.parseInlineElement();
      if (node) {
        inlineNodes.push(node);
      }
    }

    const paragraph: ParagraphNode = {
      type: 'paragraph',
      children: inlineNodes,
    };

    return { type: 'document', children: [paragraph] };
  }

  protected parseBlock(): BlockNode | null {
    if (this.matchNewlines()) {
      return null;
    }

    const headerMatch = this.matchHeader();
    if (headerMatch) {
      return this.parseHeader(headerMatch);
    }

    if (this.matchString('[quote]', true)) {
      return this.parseQuote();
    }

    if (this.matchSpoilerBlockOpen()) {
      return this.parseSpoilerBlock();
    }

    if (this.matchString('[code]', true)) {
      return this.parseCodeBlock();
    }

    const sectionMatch = this.matchSection();
    if (sectionMatch) {
      return this.parseSection(sectionMatch);
    }

    if (this.matchString('[table]', true)) {
      return this.parseTable();
    }

    if (this.matchString('[ltable]', true)) {
      return this.parseLTable();
    }

    const listMatch = this.matchListItem();
    if (listMatch) {
      return this.parseList(listMatch);
    }

    return this.parseParagraph();
  }

  private parseHeader(level: number): HeaderNode {
    const children: InlineNode[] = [];

    while (this.pos < this.input.length && !this.peekNewline()) {
      const node = this.parseInlineElement();
      if (node) {
        children.push(node);
      }
    }

    this.consumeNewline();

    return { type: 'header', level, children };
  }

  private parseQuote(): QuoteNode {
    this.skipWhitespace();
    this.consumeNewline();

    const children: BlockNode[] = [];

    while (this.pos < this.input.length && !this.peekString('[/quote]', true)) {
      const node = this.parseBlock();
      if (node) {
        children.push(node);
      }
    }

    if (this.peekString('[/quote]', true)) {
      this.matchString('[/quote]', true);
    }

    return { type: 'quote', children };
  }

  private parseSpoilerBlock(): SpoilerBlockNode {
    this.skipWhitespace();
    this.consumeNewline();

    const children: BlockNode[] = [];

    while (this.pos < this.input.length && !this.matchSpoilerClose()) {
      const node = this.parseBlock();
      if (node) {
        children.push(node);
      }
    }

    return { type: 'spoiler_block', children };
  }

  private parseCodeBlock(): CodeBlockNode {
    this.skipWhitespace();
    this.consumeNewline();

    const start = this.pos;

    while (this.pos < this.input.length) {
      if (this.matchString('[/code]', true)) {
        break;
      }
      this.pos++;
    }

    const content = this.input.slice(start, this.pos - 7);

    return { type: 'code_block', content };
  }

  private parseSection(sectionMatch: SectionMatch): SectionNode {
    this.skipWhitespace();
    this.consumeNewline();

    const children: BlockNode[] = [];

    while (
      this.pos < this.input.length &&
      !this.matchString('[/section]', true)
    ) {
      const node = this.parseBlock();
      if (node) {
        children.push(node);
      }
    }

    const result: SectionNode = { type: 'section', children };
    if (sectionMatch.title) result.title = sectionMatch.title;
    if (sectionMatch.expanded) result.expanded = sectionMatch.expanded;

    return result;
  }

  private parseTable(): TableNode {
    const children: (TableHeadNode | TableBodyNode | TableRowNode)[] = [];

    this.skipWhitespace();

    while (
      this.pos < this.input.length &&
      !this.matchString('[/table]', true)
    ) {
      this.skipWhitespace();

      if (this.matchString('[thead]', true)) {
        children.push(this.parseTableHead());
      } else if (this.matchString('[tbody]', true)) {
        children.push(this.parseTableBody());
      } else if (this.matchString('[tr]', true)) {
        children.push(this.parseTableRow());
      } else {
        // Skip unknown content
        this.pos++;
      }

      this.skipWhitespace();
    }

    return { type: 'table', children };
  }

  private parseTableHead(): TableHeadNode {
    const rows: TableRowNode[] = [];

    this.skipWhitespace();

    while (
      this.pos < this.input.length &&
      !this.matchString('[/thead]', true)
    ) {
      this.skipWhitespace();

      if (this.matchString('[tr]', true)) {
        rows.push(this.parseTableRow());
      } else {
        // Skip unknown content
        this.pos++;
      }

      this.skipWhitespace();
    }

    return { type: 'table_head', rows };
  }

  private parseTableBody(): TableBodyNode {
    const rows: TableRowNode[] = [];

    this.skipWhitespace();

    while (
      this.pos < this.input.length &&
      !this.matchString('[/tbody]', true)
    ) {
      this.skipWhitespace();

      if (this.matchString('[tr]', true)) {
        rows.push(this.parseTableRow());
      } else {
        // Skip unknown content
        this.pos++;
      }

      this.skipWhitespace();
    }

    return { type: 'table_body', rows };
  }

  private parseTableRow(): TableRowNode {
    const cells: TableCellNode[] = [];

    this.skipWhitespace();

    while (this.pos < this.input.length && !this.matchString('[/tr]', true)) {
      this.skipWhitespace();

      if (this.matchString('[th]', true)) {
        cells.push(this.parseTableCell('th'));
      } else if (this.matchString('[td]', true)) {
        cells.push(this.parseTableCell('td'));
      } else {
        // Skip unknown content
        this.pos++;
      }

      this.skipWhitespace();
    }

    return { type: 'table_row', cells };
  }

  private parseTableCell(cellType: 'th' | 'td'): TableCellNode {
    const children: InlineNode[] = [];
    const endTag = cellType === 'th' ? '[/th]' : '[/td]';

    while (this.pos < this.input.length && !this.matchString(endTag, true)) {
      const element = this.parseInlineElement();
      if (element) {
        children.push(element);
      } else {
        // If no inline element matched, consume one character as text
        this.pos++;
      }
    }

    return { type: 'table_cell', cellType, children };
  }

  private parseLTable(): TableNode {
    const children: (TableHeadNode | TableBodyNode)[] = [];
    const lines: string[] = [];

    this.skipWhitespace();

    // Collect all lines until [/ltable]
    while (
      this.pos < this.input.length &&
      !this.matchString('[/ltable]', true)
    ) {
      const lineStart = this.pos;

      // Read until newline or end of input
      while (
        this.pos < this.input.length &&
        this.input[this.pos] !== '\n' &&
        this.input[this.pos] !== '\r'
      ) {
        this.pos++;
      }

      const line = this.input.slice(lineStart, this.pos).trim();
      if (line) {
        lines.push(line);
      }

      // Skip the newline
      if (this.pos < this.input.length && this.input[this.pos] === '\r') {
        this.pos++;
      }
      if (this.pos < this.input.length && this.input[this.pos] === '\n') {
        this.pos++;
      }
    }

    if (lines.length > 0) {
      const headerCells = this.parseLTableRow(lines[0], 'th');
      const headerRow: TableRowNode = { type: 'table_row', cells: headerCells };
      children.push({ type: 'table_head', rows: [headerRow] });

      if (lines.length > 1) {
        const bodyRows: TableRowNode[] = [];
        for (let i = 1; i < lines.length; i++) {
          const bodyCells = this.parseLTableRow(lines[i], 'td');
          bodyRows.push({ type: 'table_row', cells: bodyCells });
        }
        children.push({ type: 'table_body', rows: bodyRows });
      }
    }

    return { type: 'table', children };
  }

  private parseLTableRow(line: string, cellType: 'th' | 'td'): TableCellNode[] {
    const cells: TableCellNode[] = [];
    const parts = line.split('|');

    for (const part of parts) {
      const content = part.trim();
      const children: InlineNode[] = content ? [{ type: 'text', content }] : [];
      cells.push({ type: 'table_cell', cellType, children });
    }

    return cells;
  }

  protected parseList(firstItem: ListMatch): ListNode {
    const items: ListItemNode[] = [];

    items.push({
      type: 'list_item',
      depth: firstItem.depth,
      children: this.parseInlineText(firstItem.content),
    });

    while (this.pos < this.input.length) {
      // Skip any whitespace but stop at double newlines
      const savedPos = this.pos;
      this.skipWhitespace();

      if (this.peekDoubleNewline()) {
        this.pos = savedPos;
        break;
      }

      // Try to consume a newline
      if (!this.peekNewline()) {
        this.pos = savedPos;
        break;
      }
      this.consumeNewline();

      const nextListMatch = this.matchListItem();
      if (!nextListMatch) {
        // Put back the newline we consumed and any whitespace
        this.pos = savedPos;
        break;
      }

      items.push({
        type: 'list_item',
        depth: nextListMatch.depth,
        children: this.parseInlineText(nextListMatch.content),
      });
    }

    return { type: 'list', items };
  }

  protected parseParagraph(): ParagraphNode {
    const children: InlineNode[] = [];

    while (this.pos < this.input.length) {
      // Stop at double newlines or block-level elements
      if (this.peekDoubleNewline() || this.peekBlockElement()) {
        break;
      }

      // A single newline followed by a block-level marker also ends the
      // paragraph (otherwise the newline would emit a trailing <br>).
      if (this.peekNewline() && this.peekBlockElementAfterNewline()) {
        break;
      }

      const node = this.parseInlineElement();
      if (node) {
        // Merge consecutive text nodes
        if (node.type === 'text' && children.length > 0) {
          const lastChild = children[children.length - 1];
          if (lastChild.type === 'text') {
            (lastChild as TextNode).content += (node as TextNode).content;
            continue;
          }
        }
        children.push(node);
      }
    }

    this.consumeNewline();

    // Drop trailing line breaks (a final '\n' inside a paragraph buffer
    // shouldn't render as <br></p> — ruby closes the paragraph cleanly).
    while (
      children.length > 0 &&
      children[children.length - 1].type === 'line_break'
    ) {
      children.pop();
    }

    return { type: 'paragraph', children };
  }

  protected parseInlineElement(): InlineNode | null {
    if (this.pos >= this.input.length) return null;

    // Escaped backtick
    if (this.matchString('\\`')) {
      return { type: 'text', content: '`' };
    }

    // Inline code
    if (this.matchString('`')) {
      return this.parseInlineCode();
    }

    // Internal anchor
    const anchorMatch = this.matchInternalAnchor();
    if (anchorMatch) {
      return { type: 'internal_anchor', name: anchorMatch };
    }

    // ID links
    const idMatch = this.matchIdLink();
    if (idMatch) {
      return this.createIdLink(idMatch);
    }

    // Post search links
    const postSearchMatch = this.matchPostSearchLink();
    if (postSearchMatch) {
      return this.createPostSearchLink(postSearchMatch);
    }

    // Wiki links
    const wikiMatch = this.matchWikiLink();
    if (wikiMatch) {
      return this.createWikiLink(wikiMatch);
    }

    // Textile links
    const textileMatch = this.matchTextileLink();
    if (textileMatch) {
      return this.createTextileLink(textileMatch);
    }

    // URLs
    const urlMatch = this.matchUrl();
    if (urlMatch) {
      return this.createUrlLink(urlMatch);
    }

    // Delimited URLs
    const delimitedUrlMatch = this.matchDelimitedUrl();
    if (delimitedUrlMatch) {
      return this.createUrlLink(delimitedUrlMatch);
    }

    // Bold
    if (this.matchString('[b]', true)) {
      return this.parseInlineContainer('[/b]', 'bold');
    }

    // Italic
    if (this.matchString('[i]', true)) {
      return this.parseInlineContainer('[/i]', 'italic');
    }

    // Strikeout
    if (this.matchString('[s]', true)) {
      return this.parseInlineContainer('[/s]', 'strikeout');
    }

    // Underline
    if (this.matchString('[u]', true)) {
      return this.parseInlineContainer('[/u]', 'underline');
    }

    // Superscript
    if (this.matchString('[sup]', true)) {
      return this.parseInlineContainer('[/sup]', 'superscript');
    }

    // Subscript
    if (this.matchString('[sub]', true)) {
      return this.parseInlineContainer('[/sub]', 'subscript');
    }

    // Color
    const colorMatch = this.matchColor();
    if (colorMatch) {
      return this.parseColorContainer(colorMatch);
    }

    // Inline spoiler
    if (this.matchSpoilerOpen()) {
      return this.parseInlineContainer(
        this.getSpoilerClosePattern(),
        'inline_spoiler',
      );
    }

    // Line break
    if (this.peekNewline()) {
      this.consumeNewline();
      return { type: 'line_break' };
    }

    // Regular text
    return this.parseText();
  }

  private parseInlineCode(): InlineNode {
    const start = this.pos;

    while (this.pos < this.input.length) {
      if (this.matchString('\\`')) {
        continue; // Escaped backtick
      }
      if (this.matchString('`')) {
        break; // End of code
      }
      this.pos++;
    }

    const content = this.input.slice(start, this.pos - 1).replace(/\\`/g, '`');
    return { type: 'inline_code', content };
  }

  private parseInlineContainer(
    closePattern: string,
    nodeType: string,
  ): InlineNode {
    const children: InlineNode[] = [];

    while (
      this.pos < this.input.length &&
      !this.matchString(closePattern, true)
    ) {
      const node = this.parseInlineElement();
      if (node) {
        children.push(node);
      }
    }

    return { type: nodeType, children } as InlineNode;
  }

  private parseColorContainer(color: string): ColorNode {
    if (!this.options.allowColor) {
      // Parse content without color wrapper
      const children: InlineNode[] = [];
      while (
        this.pos < this.input.length &&
        !this.matchString('[/color]', true)
      ) {
        const node = this.parseInlineElement();
        if (node) {
          children.push(node);
        }
      }
      return { type: 'color', color: '', children };
    }

    const children: InlineNode[] = [];

    while (
      this.pos < this.input.length &&
      !this.matchString('[/color]', true)
    ) {
      const node = this.parseInlineElement();
      if (node) {
        children.push(node);
      }
    }

    return { type: 'color', color, children };
  }

  protected parseText(): TextNode {
    const start = this.pos;

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      // Stop at markup characters
      if (char === '[' || char === '`' || char === '\r' || char === '\n') {
        break;
      }

      // Handle escaped characters
      if (char === '\\' && this.pos + 1 < this.input.length) {
        const nextChar = this.input[this.pos + 1];
        if (nextChar === '`') {
          // Don't stop here, let the escaped backtick be handled by parseInlineElement
          break;
        }
      }

      // Stop at potential link starts
      if (char === '"' || char === '<' || char === '{') {
        if (this.looksLikeMarkup()) {
          break;
        }
      }

      // Stop at URL starts
      if (char === 'h' && this.pos + 3 < this.input.length) {
        if (this.input.slice(this.pos, this.pos + 4).toLowerCase() === 'http') {
          break;
        }
      }

      // ID pattern checking.
      // It is vitally important to only check this at word boundaries,
      // to avoid performance issues.
      if (
        /[a-z]/i.test(char) &&
        (this.pos === start || this.input[this.pos - 1] === ' ')
      ) {
        if (this.looksLikeIdPattern()) {
          break;
        }
      }

      this.pos++;
    }

    const content = this.input.slice(start, this.pos);
    return content
      ? { type: 'text', content }
      : { type: 'text', content: this.input[this.pos++] || '' };
  }

  private parseInlineText(text: string): InlineNode[] {
    const savedPos = this.pos;
    const savedInput = this.input;

    this.input = text;
    this.pos = 0;

    const children: InlineNode[] = [];
    while (this.pos < this.input.length) {
      const node = this.parseInlineElement();
      if (node) {
        children.push(node);
      }
    }

    this.input = savedInput;
    this.pos = savedPos;

    return children;
  }

  // Pattern matching methods
  private matchString(pattern: string, caseInsensitive = false): boolean {
    const slice = this.input.slice(this.pos, this.pos + pattern.length);
    const matches = caseInsensitive
      ? slice.toLowerCase() === pattern.toLowerCase()
      : slice === pattern;

    if (matches) {
      this.pos += pattern.length;
      return true;
    }
    return false;
  }

  private matchHeader(): number | null {
    const match = this.input.slice(this.pos).match(/^h([123456])\.\s*/i);
    if (match) {
      this.pos += match[0].length;
      return parseInt(match[1]);
    }
    return null;
  }

  private matchSpoilerOpen(): boolean {
    return (
      this.matchString('[spoiler]', true) ||
      this.matchString('[spoilers]', true)
    );
  }

  private matchSpoilerBlockOpen(): boolean {
    // Block spoilers require space or newline after opening tag
    if (this.peekString('[spoiler]', true)) {
      const afterTag = this.pos + '[spoiler]'.length;
      const nextChar = this.input[afterTag];
      if (
        nextChar === ' ' ||
        nextChar === '\t' ||
        nextChar === '\n' ||
        nextChar === '\r'
      ) {
        this.matchString('[spoiler]', true);
        return true;
      }
    }
    if (this.peekString('[spoilers]', true)) {
      const afterTag = this.pos + '[spoilers]'.length;
      const nextChar = this.input[afterTag];
      if (
        nextChar === ' ' ||
        nextChar === '\t' ||
        nextChar === '\n' ||
        nextChar === '\r'
      ) {
        this.matchString('[spoilers]', true);
        return true;
      }
    }
    return false;
  }

  private matchSpoilerClose(): boolean {
    return (
      this.matchString('[/spoiler]', true) ||
      this.matchString('[/spoilers]', true)
    );
  }

  private getSpoilerClosePattern(): string {
    // Look ahead to determine the right close pattern
    const remaining = this.input.slice(this.pos).toLowerCase();
    return remaining.includes('[/spoilers]') ? '[/spoilers]' : '[/spoiler]';
  }

  private matchSection(): SectionMatch | null {
    if (this.matchString('[section,expanded]', true)) {
      return { expanded: true };
    }
    if (this.matchString('[section]', true)) {
      return {};
    }

    const expandedMatch = this.input
      .slice(this.pos)
      .match(/^\[section,expanded=([^\]]+)\]/i);
    if (expandedMatch) {
      this.pos += expandedMatch[0].length;
      return { title: expandedMatch[1], expanded: true };
    }

    const titleMatch = this.input
      .slice(this.pos)
      .match(/^\[section=([^\]]+)\]/i);
    if (titleMatch) {
      this.pos += titleMatch[0].length;
      return { title: titleMatch[1] };
    }

    return null;
  }

  private matchListItem(): ListMatch | null {
    const match = this.input.slice(this.pos).match(/^(\*+)\s+([^\r\n]+)/);
    if (match) {
      this.pos += match[0].length;
      return { depth: match[1].length, content: match[2] };
    }
    return null;
  }

  private matchInternalAnchor(): string | null {
    const match = this.input.slice(this.pos).match(/^\[#([a-zA-Z0-9_-]+)\]/);
    if (match) {
      this.pos += match[0].length;
      return match[1];
    }
    return null;
  }

  protected matchIdLink(): IdMatch | null {
    const remaining = this.input.slice(this.pos);
    const match = remaining.match(DTextStateMachineParser.COMPILED_ID_PATTERN);

    if (match) {
      this.pos += match[0].length;
      const matchedPattern = match[1].toLowerCase().replace(/\s+/g, ' ');

      let type = 'unknown';
      for (const [
        pattern,
        patternType,
      ] of DTextStateMachineParser.ID_TYPE_MAP) {
        if (matchedPattern === pattern.toLowerCase()) {
          type = patternType;
          break;
        }
      }

      return {
        type,
        id: match[2],
        text: match[0],
      };
    }

    return null;
  }

  protected matchPostSearchLink(): PostSearchMatch | null {
    // {{tag|title}} format
    const aliasedMatch = this.input
      .slice(this.pos)
      .match(/^\{\{([^}|]+)\|([^}]+)\}\}/);
    if (aliasedMatch) {
      this.pos += aliasedMatch[0].length;
      return { tag: aliasedMatch[1], title: aliasedMatch[2] };
    }

    // {{tag}} format
    const basicMatch = this.input.slice(this.pos).match(/^\{\{([^}]+)\}\}/);
    if (basicMatch) {
      this.pos += basicMatch[0].length;
      return { tag: basicMatch[1] };
    }

    return null;
  }

  protected matchWikiLink(): WikiLinkMatch | null {
    // [[tag#anchor|title]] format
    const anchorAliasedMatch = this.input
      .slice(this.pos)
      .match(/^\[\[([^\]|#]+)#([^\]|]+)\|([^\]]+)\]\]/);
    if (anchorAliasedMatch) {
      this.pos += anchorAliasedMatch[0].length;
      return {
        tag: anchorAliasedMatch[1],
        anchor: anchorAliasedMatch[2],
        title: anchorAliasedMatch[3],
      };
    }

    // [[tag#anchor]] format
    const anchorMatch = this.input
      .slice(this.pos)
      .match(/^\[\[([^\]|#]+)#([^\]]+)\]\]/);
    if (anchorMatch) {
      this.pos += anchorMatch[0].length;
      return { tag: anchorMatch[1], anchor: anchorMatch[2] };
    }

    // [[#anchor|title]] format
    const internalAnchorAliasedMatch = this.input
      .slice(this.pos)
      .match(/^\[\[#([^\]|]+)\|([^\]]+)\]\]/);
    if (internalAnchorAliasedMatch) {
      this.pos += internalAnchorAliasedMatch[0].length;
      return {
        tag: '',
        anchor: internalAnchorAliasedMatch[1],
        title: internalAnchorAliasedMatch[2],
      };
    }

    // [[#anchor]] format
    const internalAnchorMatch = this.input
      .slice(this.pos)
      .match(/^\[\[#([^\]]+)\]\]/);
    if (internalAnchorMatch) {
      this.pos += internalAnchorMatch[0].length;
      return { tag: '', anchor: internalAnchorMatch[1] };
    }

    // [[tag|title]] format
    const aliasedMatch = this.input
      .slice(this.pos)
      .match(/^\[\[([^\]|]+)\|([^\]]+)\]\]/);
    if (aliasedMatch) {
      this.pos += aliasedMatch[0].length;
      return { tag: aliasedMatch[1], title: aliasedMatch[2] };
    }

    // [[tag]] format
    const basicMatch = this.input.slice(this.pos).match(/^\[\[([^\]]+)\]\]/);
    if (basicMatch) {
      this.pos += basicMatch[0].length;
      return { tag: basicMatch[1] };
    }

    return null;
  }

  protected matchTextileLink(): TextileLinkMatch | null {
    const currentChar = this.input[this.pos];
    if (currentChar !== '"') {
      return null;
    }

    // "title":[url] format
    const bracketedMatch = this.input
      .slice(this.pos)
      .match(/^"([^"]+)":\[([^\]]+)\]/);
    if (bracketedMatch) {
      this.pos += bracketedMatch[0].length;
      return { title: bracketedMatch[1], url: bracketedMatch[2] };
    }

    // "title":url format. Strip trailing boundary punctuation (,.;:!?) the
    // way matchUrl does for bare urls.
    const basicMatch = this.input.slice(this.pos).match(/^"([^"]+)":(\S+)/);
    if (basicMatch) {
      let url = basicMatch[2];
      let consumed = basicMatch[0].length;
      while (url.length > 0 && isBoundaryChar(url[url.length - 1])) {
        url = url.slice(0, -1);
        consumed--;
      }
      this.pos += consumed;
      return { title: basicMatch[1], url };
    }

    return null;
  }

  protected matchUrl(): UrlMatch | null {
    const match = this.input.slice(this.pos).match(/^https?:\/\/\S+/i);
    if (match) {
      const start = this.pos;
      let url = match[0];

      // Remove boundary characters from the end
      while (url.length > 0 && isBoundaryChar(url[url.length - 1])) {
        url = url.slice(0, -1);
      }

      this.pos = start + url.length;

      return { url, start, end: this.pos };
    }
    return null;
  }

  private matchDelimitedUrl(): UrlMatch | null {
    const match = this.input.slice(this.pos).match(/^<(https?:\/\/[^>]+)>/i);
    if (match) {
      this.pos += match[0].length;
      return {
        url: match[1],
        start: this.pos - match[0].length,
        end: this.pos,
      };
    }
    return null;
  }

  private matchColor(): string | null {
    const colorMatch = this.input.slice(this.pos).match(/^\[color=([^\]]+)\]/i);
    if (colorMatch) {
      this.pos += colorMatch[0].length;
      return colorMatch[1];
    }
    return null;
  }

  private matchNewlines(): boolean {
    const start = this.pos;
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
    return this.pos > start;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /[ \t]/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private peekNewline(): boolean {
    return (
      this.input[this.pos] === '\n' ||
      this.input.slice(this.pos, this.pos + 2) === '\r\n'
    );
  }

  private peekString(pattern: string, caseInsensitive = false): boolean {
    const slice = this.input.slice(this.pos, this.pos + pattern.length);
    return caseInsensitive
      ? slice.toLowerCase() === pattern.toLowerCase()
      : slice === pattern;
  }

  private consumeNewline(): void {
    if (this.input.slice(this.pos, this.pos + 2) === '\r\n') {
      this.pos += 2;
    } else if (this.input[this.pos] === '\n') {
      this.pos += 1;
    }
  }

  private peekDoubleNewline(): boolean {
    let tempPos = this.pos;

    // First newline
    if (this.input.slice(tempPos, tempPos + 2) === '\r\n') {
      tempPos += 2;
    } else if (this.input[tempPos] === '\n') {
      tempPos += 1;
    } else {
      return false;
    }

    // Skip horizontal whitespace between the two newlines. MUST NOT include
    // \n or \r — \s does, and that ate the second newline and broke
    // block-boundary detection (gating ~80% of the corpus).
    const maxLookahead = 10;
    let lookaheadCount = 0;
    while (
      tempPos < this.input.length &&
      lookaheadCount < maxLookahead &&
      /[ \t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/.test(
        this.input[tempPos],
      )
    ) {
      tempPos++;
      lookaheadCount++;
    }

    // Second newline
    if (this.input.slice(tempPos, tempPos + 2) === '\r\n') {
      return true;
    } else if (this.input[tempPos] === '\n') {
      return true;
    }

    return false;
  }

  private peekBlockElementAfterNewline(): boolean {
    const here = this.input[this.pos];
    let offset = 0;
    if (this.input.slice(this.pos, this.pos + 2) === '\r\n') {
      offset = 2;
    } else if (here === '\n') {
      offset = 1;
    } else {
      return false;
    }
    const saved = this.pos;
    this.pos += offset;
    const result = this.peekBlockElement();
    this.pos = saved;
    return result;
  }

  private peekBlockElement(): boolean {
    const remaining = this.input.slice(this.pos);
    const blockPatterns = [
      /^h[123456]\./i,
      /^\[quote\]/i,
      /^\[\/quote\]/i,
      /^\[code\]/i,
      /^\[section/i,
      /^\[\/section\]/i,
      /^\[table\]/i,
      /^\[ltable\]/i,
      /^\*+\s/,
    ];

    // Special handling for spoilers - only block if multiline
    if (/^\[spoilers?\]/i.test(remaining)) {
      const spoilerMatch = remaining.match(
        /^\[spoilers?\](.*?)\[\/spoilers?\]/is,
      );
      if (spoilerMatch && spoilerMatch[1].includes('\n')) {
        return true; // Block spoiler (contains newlines)
      }
      return false; // Inline spoiler (single line)
    }

    return blockPatterns.some((pattern) => pattern.test(remaining));
  }

  protected looksLikeMarkup(): boolean {
    const remaining = this.input.slice(this.pos);
    return (
      remaining.startsWith('{{') ||
      remaining.startsWith('[[') ||
      remaining.startsWith('"http') ||
      remaining.startsWith('<http') ||
      /^"[^"]+":/.test(remaining)
    ); // Match textile links like "text":url or "text":[url]
  }

  protected looksLikeIdPattern(): boolean {
    const remaining = this.input.slice(this.pos);

    const idPatterns = [
      /^post #\d+/i,
      /^thumb #\d+/i,
      /^post changes #\d+/i,
      /^flag #\d+/i,
      /^note #\d+/i,
      /^forum #\d+/i,
      /^topic #\d+/i,
      /^comment #\d+/i,
      /^pool #\d+/i,
      /^user #\d+/i,
      /^artist #\d+/i,
      /^ban #\d+/i,
      /^bur #\d+/i,
      /^alias #\d+/i,
      /^implication #\d+/i,
      /^mod action #\d+/i,
      /^record #\d+/i,
      /^wiki #\d+/i,
      /^set #\d+/i,
      /^blip #\d+/i,
      /^takedown #\d+/i,
      /^take\s?down\s+request\s*#\d+/i,
      /^ticket #\d+/i,
    ];

    return idPatterns.some((pattern) => pattern.test(remaining));
  }

  // Link creation methods
  private createIdLink(match: IdMatch): LinkNode {
    const routes: Record<string, string> = {
      post: '/posts/',
      thumb: '/posts/',
      post_changes: '/post_versions?search[post_id]=',
      flag: '/post_flags/',
      note: '/notes/',
      forum_post: '/forum_posts/',
      topic: '/forum_topics/',
      comment: '/comments/',
      pool: '/pools/',
      user: '/users/',
      artist: '/artists/',
      ban: '/bans/',
      bur: '/bulk_update_requests/',
      alias: '/tag_aliases/',
      implication: '/tag_implications/',
      mod_action: '/mod_actions/',
      record: '/user_feedbacks/',
      wiki: '/wiki_pages/',
      set: '/post_sets/',
      blip: '/blips/',
      takedown: '/takedowns/',
      ticket: '/tickets/',
    };

    const href = routes[match.type] + match.id;

    // Ruby's renderer always uses "post #N" as the text content for
    // thumb-type id links (the thumb-placeholder-link class lets a frontend
    // script swap in an actual thumbnail image; "post #N" is the fallback).
    const text =
      match.type === 'thumb' ? `post #${match.id}` : match.text;

    if (match.type === 'thumb') {
      this.thumbCount++;
      if (this.options.maxThumbs && this.thumbCount > this.options.maxThumbs) {
        // Past the per-document thumb limit ruby drops the thumb-placeholder
        // class and emits a plain post id-link, so swap idType to 'post' to
        // suppress the thumb-only attributes the renderer would otherwise add.
        return {
          type: 'link',
          linkType: 'id_link',
          idType: 'post',
          id: match.id,
          href,
          children: [{ type: 'text', content: text }],
        };
      }
    }

    return {
      type: 'link',
      linkType: 'id_link',
      idType: match.type,
      id: match.id,
      href,
      children: [{ type: 'text', content: text }],
    };
  }

  private createPostSearchLink(match: PostSearchMatch): LinkNode {
    const normalizedTag = match.tag.toLowerCase();
    const href = `/posts?tags=${rubyUriEscape(normalizedTag)}`;
    const title = match.title || match.tag;

    return {
      type: 'link',
      linkType: 'post_search',
      tags: normalizedTag,
      href,
      children: [{ type: 'text', content: title }],
    };
  }

  private createWikiLink(match: WikiLinkMatch): LinkNode {
    if (match.anchor && !match.tag) {
      // Internal anchor link
      const href = `#${rubyUriEscape(match.anchor.toLowerCase())}`;
      const title = match.title || `#${match.anchor}`;
      return {
        type: 'link',
        linkType: 'wiki',
        href,
        anchor: match.anchor,
        children: [{ type: 'text', content: title }],
      };
    }

    const normalizedTag = match.tag.replace(/ /g, '_').toLowerCase();
    let href = `/wiki_pages/show_or_new?title=${rubyUriEscape(normalizedTag)}`;

    if (match.anchor) {
      href += `#${rubyUriEscape(match.anchor)}`;
    }

    const title =
      match.title ||
      (match.anchor ? `${match.tag}#${match.anchor}` : match.tag);

    return {
      type: 'link',
      linkType: 'wiki',
      href,
      anchor: match.anchor,
      children: [{ type: 'text', content: title }],
    };
  }

  private createTextileLink(match: TextileLinkMatch): LinkNode {
    return {
      type: 'link',
      linkType: 'textile',
      href: match.url,
      children: parseInlineString(match.title),
    };
  }

  private createUrlLink(match: UrlMatch): LinkNode {
    return {
      type: 'link',
      linkType: 'url',
      href: match.url,
      children: [{ type: 'text', content: match.url }],
    };
  }
}

export function parseDText(
  input: string,
  options: ParserOptions = {},
): DocumentNode {
  const parser = new DTextStateMachineParser(input, options);
  return parser.parse();
}

export function parseBasicInline(input: string): DocumentNode {
  const parser = new DTextStateMachineParser(input, {
    inlineOnly: true,
    allowColor: false,
    maxThumbs: 0,
  });
  return parser.parse();
}
