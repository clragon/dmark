// Buffer-pattern markdown formatter (dmark flavour). The inverse of
// `parseMarkdown`: takes a canonical AST and emits markdown source whose
// round-trip is deep-equal to the input (subject to documented divergences).
// Per-construct rules live in `docs/mapping.md`. Each `formatXxx(node, out,
// ctx)` pushes fragments into the shared `out` array; `out` is created fresh
// per call so concurrent renders do not interleave.

import type {
  ASTNode,
  BoldNode,
  CodeBlockNode,
  ColorNode,
  DocumentNode,
  FragmentNode,
  HeaderNode,
  InlineCodeNode,
  InlineNode,
  InlineSpoilerNode,
  InternalAnchorNode,
  ItalicNode,
  LTableNode,
  LinkNode,
  ListNode,
  LiteralHtmlNode,
  ParagraphNode,
  QuoteNode,
  RawBlockTextNode,
  SectionNode,
  SpoilerBlockNode,
  StrikeoutNode,
  SubscriptNode,
  SuperscriptNode,
  TableBodyNode,
  TableCellNode,
  TableHeadNode,
  TableNode,
  TableRowNode,
  TextNode,
  UnderlineNode,
  BlockNode,
} from '../../ast';
import { ID_SOURCE } from '../../ast/links';
import { asciiLowercase } from '../../ast/text';
import type { Diagnostic } from '../../diagnostics';

export interface MarkdownFormatterOptions {
  // Reserved for flags.
}

export interface MarkdownFormatResult {
  output: string;
  diagnostics: Diagnostic[];
}

interface FormatContext {
  options: MarkdownFormatterOptions;
  diagnostics: Diagnostic[];
  // True when the next emit lands at the start of a line. The text emitter
  // applies the line-start-only escape set only when this is true (ADR-0017).
  // Functions emitting newline-terminated fragments set it back to true.
  atLineStart: boolean;
  // True when the formatter is inside a `TableCellNode`; flips the
  // line-break handling per ADR-0019.
  inTableCell: boolean;
}

export function formatMarkdown(
  ast: ASTNode,
  options: MarkdownFormatterOptions = {},
): MarkdownFormatResult {
  const out: string[] = [];
  const ctx: FormatContext = {
    options,
    diagnostics: [],
    atLineStart: true,
    inTableCell: false,
  };
  formatNode(ast, out, ctx);
  return { output: out.join(''), diagnostics: ctx.diagnostics };
}

function formatNode(
  node: ASTNode,
  out: string[],
  ctx: FormatContext,
): void {
  switch (node.type) {
    case 'document':
      formatBlocks((node as DocumentNode).children, out, ctx);
      return;

    // Block nodes
    case 'header':
      formatHeader(node as HeaderNode, out, ctx);
      return;
    case 'paragraph':
      formatInlines((node as ParagraphNode).children, out, ctx);
      return;
    case 'quote':
      formatQuote(node as QuoteNode, out, ctx);
      return;
    case 'spoiler_block':
      formatSpoilerBlock(node as SpoilerBlockNode, out, ctx);
      return;
    case 'section':
      formatSection(node as SectionNode, out, ctx);
      return;
    case 'code_block':
      formatCodeBlock(node as CodeBlockNode, out, ctx);
      return;
    case 'raw_block_text':
      formatRawBlockText(node as RawBlockTextNode, out, ctx);
      return;
    case 'literal_html':
      formatLiteralHtml(node as LiteralHtmlNode, out, ctx);
      return;
    case 'table':
      formatTable(node as TableNode, out, ctx);
      return;
    case 'ltable':
      formatLTable(node as LTableNode, out, ctx);
      return;
    case 'list':
      formatList(node as ListNode, out, ctx);
      return;

    // Inline nodes
    case 'text':
      emitTextContent((node as TextNode).content, out, ctx);
      return;
    case 'bold':
      out.push('**');
      ctx.atLineStart = false;
      formatInlines((node as BoldNode).children, out, ctx);
      out.push('**');
      return;
    case 'italic':
      out.push('*');
      ctx.atLineStart = false;
      formatInlines((node as ItalicNode).children, out, ctx);
      out.push('*');
      return;
    case 'strikeout':
      out.push('~~');
      ctx.atLineStart = false;
      formatInlines((node as StrikeoutNode).children, out, ctx);
      out.push('~~');
      return;
    case 'underline':
      out.push('__');
      ctx.atLineStart = false;
      formatInlines((node as UnderlineNode).children, out, ctx);
      out.push('__');
      return;
    case 'superscript':
      // BBCode survivor on the markdown side.
      out.push('[sup]');
      ctx.atLineStart = false;
      formatInlines((node as SuperscriptNode).children, out, ctx);
      out.push('[/sup]');
      return;
    case 'subscript':
      out.push('[sub]');
      ctx.atLineStart = false;
      formatInlines((node as SubscriptNode).children, out, ctx);
      out.push('[/sub]');
      return;
    case 'inline_spoiler':
      out.push('||');
      ctx.atLineStart = false;
      formatInlines((node as InlineSpoilerNode).children, out, ctx);
      out.push('||');
      return;
    case 'inline_code':
      // Verbatim emit; backtick-bearing content is a documented divergence
      // (ADR-0010).
      out.push('`', (node as InlineCodeNode).content, '`');
      ctx.atLineStart = false;
      return;
    case 'color':
      out.push('[color=', (node as ColorNode).color, ']');
      ctx.atLineStart = false;
      formatInlines((node as ColorNode).children, out, ctx);
      out.push('[/color]');
      return;
    case 'line_break':
      formatLineBreak(out, ctx);
      return;
    case 'fragment':
      formatInlines((node as FragmentNode).children, out, ctx);
      return;
    case 'link':
      formatLink(node as LinkNode, out, ctx);
      return;
    case 'internal_anchor':
      out.push('[#', (node as InternalAnchorNode).name, ']');
      ctx.atLineStart = false;
      return;

    // Table sub-nodes: standalone emit lands here. The primary path runs
    // through `formatTable`, which unwraps head/body and emits rows directly
    // with the header-separator row markdown-it requires.
    case 'table_head':
      for (const row of (node as TableHeadNode).rows) formatNode(row, out, ctx);
      return;
    case 'table_body':
      for (const row of (node as TableBodyNode).rows) formatNode(row, out, ctx);
      return;
    case 'table_row':
      formatTableRowFallback(node as TableRowNode, out, ctx);
      return;
    case 'table_cell':
      formatTableCellFallback(node as TableCellNode, out, ctx);
      return;

    default:
      // eslint-disable-next-line no-console
      console.warn(
        `formatMarkdown: unknown node type: ${(node as ASTNode).type}`,
      );
  }
}

function formatBlocks(
  blocks: BlockNode[],
  out: string[],
  ctx: FormatContext,
): void {
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) {
      out.push('\n\n');
      ctx.atLineStart = true;
    }
    formatNode(blocks[i], out, ctx);
  }
}

function formatInlines(
  inlines: InlineNode[],
  out: string[],
  ctx: FormatContext,
): void {
  for (const node of inlines) formatNode(node, out, ctx);
}

function formatHeader(
  node: HeaderNode,
  out: string[],
  ctx: FormatContext,
): void {
  out.push('#'.repeat(node.level), ' ');
  ctx.atLineStart = false;
  formatInlines(node.children, out, ctx);
}

function formatQuote(
  node: QuoteNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Per ADR-0018: colourless uses `> ` prefix, coloured uses
  // `[quote=<color>]...[/quote]`.
  if (node.color !== undefined) {
    out.push('[quote=', node.color, ']\n');
    ctx.atLineStart = true;
    formatBlocks(node.children, out, ctx);
    out.push('\n[/quote]');
    ctx.atLineStart = false;
    return;
  }

  // Colourless `>` form. Emit each child block, line-prefix every line
  // (including blank separator lines) with `> `.
  const innerBuf: string[] = [];
  const innerCtx: FormatContext = {
    options: ctx.options,
    diagnostics: ctx.diagnostics,
    atLineStart: true,
    inTableCell: ctx.inTableCell,
  };
  formatBlocks(node.children, innerBuf, innerCtx);
  const inner = innerBuf.join('');
  // Prefix every line. Use `\n` split + map to keep blank lines as `>`.
  const lines = inner.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) out.push('\n');
    if (lines[i].length === 0) {
      out.push('>');
    } else {
      out.push('> ', lines[i]);
    }
  }
  ctx.atLineStart = false;
}

function formatSpoilerBlock(
  node: SpoilerBlockNode,
  out: string[],
  ctx: FormatContext,
): void {
  // BBCode-survivor form: `||...||` is the inline spoiler; block spoilers
  // use the bracket form.
  out.push('[spoiler]\n');
  ctx.atLineStart = true;
  formatBlocks(node.children, out, ctx);
  out.push('\n[/spoiler]');
  ctx.atLineStart = false;
}

function formatSection(
  node: SectionNode,
  out: string[],
  ctx: FormatContext,
): void {
  // BBCode form is canonical (ADR-0011). HTML `<details>` form is accepted
  // on parse but not emitted.
  if (node.title !== undefined) {
    out.push(node.expanded ? '[section,expanded=' : '[section=');
    out.push(node.title, ']\n');
  } else {
    out.push(node.expanded ? '[section,expanded]\n' : '[section]\n');
  }
  ctx.atLineStart = true;
  formatBlocks(node.children, out, ctx);
  out.push('\n[/section]');
  ctx.atLineStart = false;
}

function formatCodeBlock(
  node: CodeBlockNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Triple-backtick fence; the AST has no slot for language hints. Emit
  // `content` verbatim; ADR-0007 covers the trailing-newline divergence
  // between markdown-it (appends `\n`) and the dtext side (does not).
  out.push('```\n');
  out.push(node.content);
  if (!node.content.endsWith('\n')) out.push('\n');
  out.push('```');
  ctx.atLineStart = false;
}

function formatRawBlockText(
  node: RawBlockTextNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Verbatim passthrough with warning (ADR-0013); content comes from a
  // dtext stray-close salvage path and may not round-trip.
  ctx.diagnostics.push({
    code: 'md.dtext_salvage_passthrough',
    severity: 'warning',
    message:
      'RawBlockTextNode emitted verbatim; content originates from a dtext salvage path and may not round-trip through parseMarkdown.',
  });
  out.push(node.content);
  ctx.atLineStart = node.content.endsWith('\n');
}

function formatLiteralHtml(
  node: LiteralHtmlNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Verbatim passthrough with warning (ADR-0013).
  ctx.diagnostics.push({
    code: 'md.dtext_salvage_passthrough',
    severity: 'warning',
    message:
      'LiteralHtmlNode emitted verbatim; prefix is HTML from a dtext salvage path and may not round-trip through parseMarkdown.',
  });
  out.push(node.prefix);
  ctx.atLineStart = node.prefix.endsWith('\n');
  formatInlines(node.children, out, ctx);
}

function formatTable(
  node: TableNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Pipe-table form. The header separator row (`|---|---|`) is structurally
  // required by markdown-it; emit one even when no `TableHeadNode` is
  // present (a header-less table still needs the separator to re-parse).
  const headerRows: TableRowNode[] = [];
  const bodyRows: TableRowNode[] = [];
  for (const child of node.children) {
    if (child.type === 'table_head') {
      headerRows.push(...(child as TableHeadNode).rows);
    } else if (child.type === 'table_body') {
      bodyRows.push(...(child as TableBodyNode).rows);
    } else if (child.type === 'table_row') {
      // Loose row (no head/body wrapper). Treat as body.
      bodyRows.push(child as TableRowNode);
    }
  }

  // Determine column count from the first available row.
  const firstRow = headerRows[0] ?? bodyRows[0];
  if (firstRow === undefined) {
    // Empty table. Emit the minimum that re-parses as a table-shaped block.
    out.push('|  |\n|---|');
    ctx.atLineStart = false;
    return;
  }
  const colCount = firstRow.cells.length;

  // Header row. If no head AST node, synthesize a blank header from the
  // first body row's column count.
  const headerToEmit = headerRows[0] ?? null;
  if (headerToEmit !== null) {
    formatPipeTableRow(headerToEmit, out, ctx);
  } else {
    out.push('|');
    for (let i = 0; i < colCount; i++) out.push('  |');
  }
  out.push('\n');

  // Separator row.
  out.push('|');
  for (let i = 0; i < colCount; i++) out.push('---|');
  ctx.atLineStart = true;

  // Remaining header rows (rare; markdown pipe tables expect one) and all
  // body rows.
  for (let i = 1; i < headerRows.length; i++) {
    out.push('\n');
    formatPipeTableRow(headerRows[i], out, ctx);
  }
  for (const row of bodyRows) {
    out.push('\n');
    formatPipeTableRow(row, out, ctx);
  }
  ctx.atLineStart = false;
}

function formatPipeTableRow(
  row: TableRowNode,
  out: string[],
  ctx: FormatContext,
): void {
  out.push('|');
  for (const cell of row.cells) {
    out.push(' ');
    const wasInCell = ctx.inTableCell;
    ctx.inTableCell = true;
    ctx.atLineStart = false;
    formatInlines(cell.children, out, ctx);
    ctx.inTableCell = wasInCell;
    out.push(' |');
  }
  ctx.atLineStart = false;
}

function formatLTable(
  node: LTableNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Pipe-table approximation with warning (ADR-0012). First row treated as
  // header, rest as body; the no-head/body distinction is lost.
  ctx.diagnostics.push({
    code: 'md.ltable_approximated',
    severity: 'warning',
    message:
      'LTableNode emitted as pipe-table approximation (first row → header, rest → body); the no-head/body distinction is lost.',
  });

  if (node.rows.length === 0) {
    out.push('|  |\n|---|');
    ctx.atLineStart = false;
    return;
  }

  const colCount = node.rows[0].cells.length;
  formatPipeTableRow(node.rows[0], out, ctx);
  out.push('\n|');
  for (let i = 0; i < colCount; i++) out.push('---|');
  ctx.atLineStart = true;
  for (let i = 1; i < node.rows.length; i++) {
    out.push('\n');
    formatPipeTableRow(node.rows[i], out, ctx);
  }
  ctx.atLineStart = false;
}

function formatTableRowFallback(
  node: TableRowNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Reached only when a `TableRowNode` is emitted outside a `TableNode` or
  // `LTableNode` context.
  formatPipeTableRow(node, out, ctx);
}

function formatTableCellFallback(
  node: TableCellNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Reached only when a `TableCellNode` is emitted standalone.
  const wasInCell = ctx.inTableCell;
  ctx.inTableCell = true;
  formatInlines(node.children, out, ctx);
  ctx.inTableCell = wasInCell;
}

function formatList(
  node: ListNode,
  out: string[],
  ctx: FormatContext,
): void {
  // ADR-0016: `- ` marker, two-space indent per nesting level (depth 1 is
  // the top level, so `item.depth - 1` indents).
  for (let i = 0; i < node.items.length; i++) {
    if (i > 0) {
      out.push('\n');
      ctx.atLineStart = true;
    }
    const item = node.items[i];
    if (item.depth > 1) out.push('  '.repeat(item.depth - 1));
    out.push('- ');
    ctx.atLineStart = false;
    formatInlines(item.children, out, ctx);
  }
}

function formatLineBreak(out: string[], ctx: FormatContext): void {
  // Inside a `TableCellNode`, collapse to a single space with a warning
  // (ADR-0019); pipe tables forbid multi-line cells.
  if (ctx.inTableCell) {
    ctx.diagnostics.push({
      code: 'md.table_cell_linebreak_collapsed',
      severity: 'warning',
      message:
        'LineBreakNode inside a table cell collapsed to a single space; markdown pipe tables forbid multi-line cell content.',
    });
    out.push(' ');
    return;
  }
  // Paragraph-internal hard break. The parser runs with `breaks: true`, so
  // every `\n` re-parses to `LineBreakNode`; CommonMark's "trailing two
  // spaces" form is not used.
  out.push('\n');
  ctx.atLineStart = true;
}

function formatLink(
  node: LinkNode,
  out: string[],
  ctx: FormatContext,
): void {
  ctx.atLineStart = false;
  switch (node.linkType) {
    case 'url':
      formatUrlLink(node, out);
      return;
    case 'inline':
      formatInlineLink(node, out, ctx);
      return;
    case 'wiki':
      formatWikiLink(node, out);
      return;
    case 'post_search':
      formatPostSearchLink(node, out);
      return;
    case 'id_link':
      formatIdLink(node, out);
      return;
  }
}

function formatUrlLink(node: LinkNode, out: string[]): void {
  // ADR-0015: bare URL would only re-parse as a `LinkNode` when markdown-it's
  // autolinker would detect it. The parser runs with `linkify: false`, so
  // only the standard autolink rule (`<url>`) produces a `LinkNode`; emit
  // the autolink form unconditionally.
  out.push('<', node.href, '>');
}

function formatInlineLink(
  node: LinkNode,
  out: string[],
  ctx: FormatContext,
): void {
  // `[<text>](<url>)`. URL escape strategy per ADR-0014: backslash-escape
  // parens; angle-bracket wrap only for whitespace-bearing URLs.
  const titleBuf: string[] = [];
  const titleCtx: FormatContext = {
    options: ctx.options,
    diagnostics: ctx.diagnostics,
    atLineStart: false,
    inTableCell: ctx.inTableCell,
  };
  if (node.children) formatInlines(node.children, titleBuf, titleCtx);
  out.push('[', titleBuf.join(''), '](');
  if (/\s/.test(node.href)) {
    out.push('<', node.href, '>');
  } else {
    out.push(node.href.replace(/[()]/g, '\\$&'));
  }
  out.push(')');
}

function formatWikiLink(node: LinkNode, out: string[]): void {
  // Same dispatch as the dtext sibling formatter (ADR-0004). Anchor-only
  // form has two variants (`[[#anchor]]` and `[[#anchor|title]]`); detect
  // title-override by comparing children content to the default form.
  if (node.href.startsWith('#') && node.anchor !== undefined) {
    const childText =
      node.children?.[0] && node.children[0].type === 'text'
        ? (node.children[0] as TextNode).content
        : '';
    if (childText === `#${node.anchor}` || childText === '') {
      out.push('[[#', node.anchor, ']]');
    } else {
      out.push('[[#', node.anchor, '|', childText, ']]');
    }
    return;
  }

  const HREF_PREFIX = '/wiki_pages/show_or_new?title=';
  let normalisedTag = '';
  if (node.href.startsWith(HREF_PREFIX)) {
    const rest = node.href.slice(HREF_PREFIX.length);
    const hashIdx = rest.indexOf('#');
    const encodedTag = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
    try {
      normalisedTag = decodeURIComponent(encodedTag);
    } catch {
      normalisedTag = encodedTag;
    }
  }
  const denormalisedTag = normalisedTag.replace(/_/g, ' ');
  const anchor = node.anchor;
  const childText =
    node.children?.[0] && node.children[0].type === 'text'
      ? (node.children[0] as TextNode).content
      : '';

  const expectedNoTitle =
    anchor !== undefined ? `${denormalisedTag}#${anchor}` : denormalisedTag;

  if (asciiLowercase(childText) === asciiLowercase(expectedNoTitle)) {
    // No-title case: children content carries the original tag spelling.
    // Title-collision (e.g. `[[Wolf|wolf]]`) is indistinguishable from the
    // no-title `[[Wolf]]` form at the AST level; ADR-0004 accepts the
    // no-title emit here as the documented divergence.
    out.push('[[', childText, ']]');
  } else {
    out.push('[[', normalisedTag);
    if (anchor !== undefined) out.push('#', anchor);
    out.push('|', childText, ']]');
  }
}

function formatPostSearchLink(node: LinkNode, out: string[]): void {
  const tags = node.tags ?? '';
  const childText =
    node.children?.[0] && node.children[0].type === 'text'
      ? (node.children[0] as TextNode).content
      : '';
  // Same dispatch as the wikilink no-title branch: when children text
  // equals `tags` modulo ASCII case, emit `{{<childText>}}` to preserve
  // the original spelling and avoid an unnecessary `|` that would break a
  // wrapping pipe-table cell.
  if (childText === '' || asciiLowercase(childText) === tags) {
    out.push('{{', childText || tags, '}}');
  } else {
    out.push('{{', tags, '|', childText, '}}');
  }
}

function formatIdLink(node: LinkNode, out: string[]): void {
  // ADR-0001: emit `<source-prefix> #<id>` from `ID_SOURCE`. The display
  // form on `node.children[0].content` is ignored.
  if (!node.idType || !node.id) return;
  out.push(ID_SOURCE[node.idType], ' #', node.id);
}

// Text-content emit per ADR-0017. After the walk, `ctx.atLineStart`
// reflects whether the last char emitted was `\n`.
function emitTextContent(
  content: string,
  out: string[],
  ctx: FormatContext,
): void {
  if (content.length === 0) return;
  let atLineStart = ctx.atLineStart;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '\n') {
      out.push('\n');
      atLineStart = true;
      continue;
    }
    let needsEscape = false;
    if (atLineStart && isLineStartSigil(content, i)) {
      needsEscape = true;
    } else if (isAlwaysEscapeChar(ch)) {
      needsEscape = true;
    } else if ((ch === '~' || ch === '|') && content[i + 1] === ch) {
      needsEscape = true;
    }
    if (needsEscape) out.push('\\');
    out.push(ch);
    atLineStart = false;
  }
  ctx.atLineStart = atLineStart;
}

function isAlwaysEscapeChar(ch: string): boolean {
  return ch === '*' || ch === '_' || ch === '`' || ch === '\\' || ch === '[';
}

function isLineStartSigil(content: string, pos: number): boolean {
  const ch = content[pos];
  if (ch === '#' || ch === '>' || ch === '-' || ch === '+' || ch === '|') {
    return true;
  }
  // Numbered-list marker: `1.` through `9.` (digit followed by `.`).
  if (ch >= '1' && ch <= '9' && content[pos + 1] === '.') return true;
  return false;
}
