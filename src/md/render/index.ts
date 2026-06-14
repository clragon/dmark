// Buffer-pattern markdown formatter (dmark flavour). The inverse of
// `parseMarkdownToAst`: takes a canonical AST and emits markdown source whose
// round-trip is deep-equal to the input (subject to documented divergences).
// Per-construct rules live in `docs/mapping.md`. Handlers push fragments into
// the `out` buffer they are given; the top buffer is created fresh per call so
// concurrent renders do not interleave.

import type {
  AstNode,
  BlockNode,
  CodeBlockNode,
  DocumentNode,
  HeaderNode,
  InlineNode,
  LTableNode,
  LinkNode,
  ListNode,
  LiteralHtmlNode,
  QuoteNode,
  RawBlockTextNode,
  SectionNode,
  SpoilerBlockNode,
  TableBodyNode,
  TableCellNode,
  TableHeadNode,
  TableNode,
  TableRowNode,
  TextNode,
} from '../../ast';
import { ID_SOURCE } from '../../ast/links';
import { asciiLowercase } from '../../ast/text';
import type { Diagnostic } from '../../diagnostics';

export interface MarkdownRenderOptions {
  // Reserved for flags.
}

export interface MarkdownRenderResult {
  output: string;
  diagnostics: Diagnostic[];
}

// Every node type the formatter dispatches over. `list_item` and
// `table_literal` are not emitted standalone (the former lives inside
// `formatList`, the latter is dropped by `formatTable`), so they are absent
// from the table and fall through to the unknown-type warning.
type RenderableNode =
  | DocumentNode
  | BlockNode
  | InlineNode
  | TableHeadNode
  | TableBodyNode
  | TableRowNode
  | TableCellNode;

type NodeByType = {
  [K in RenderableNode['type']]: Extract<RenderableNode, { type: K }>;
};

export interface MarkdownRenderContext {
  readonly options: MarkdownRenderOptions;
  readonly diagnostics: Diagnostic[];
  // True when the next emit lands at the start of a line. The text emitter
  // applies the line-start-only escape set only when this is true (ADR-0017).
  // Functions emitting newline-terminated fragments set it back to true.
  atLineStart: boolean;
  // True when the formatter is inside a `TableCellNode`; flips the
  // line-break handling per ADR-0019.
  inTableCell: boolean;
  render(node: AstNode, out: string[]): void;
  // Spawn a child context sharing this one's handler table, options, and
  // diagnostics, with its own line state. Used by handlers that format into a
  // local buffer (quote line-prefixing, inline-link title).
  sub(atLineStart: boolean, inTableCell: boolean): MarkdownRenderContext;
}

// Renders one node type; `node` is narrowed to its concrete interface.
export type MarkdownHandler<K extends keyof NodeByType> = (
  node: NodeByType[K],
  out: string[],
  ctx: MarkdownRenderContext,
) => void;

// The dispatch table: one handler per node type, exhaustive over the union.
export type MarkdownHandlers = { [K in keyof NodeByType]: MarkdownHandler<K> };

function formatBlocks(
  blocks: BlockNode[],
  out: string[],
  ctx: MarkdownRenderContext,
): void {
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) {
      out.push('\n\n');
      ctx.atLineStart = true;
    }
    ctx.render(blocks[i], out);
  }
}

function formatInlines(
  inlines: InlineNode[],
  out: string[],
  ctx: MarkdownRenderContext,
): void {
  for (const node of inlines) ctx.render(node, out);
}

function formatHeader(
  node: HeaderNode,
  out: string[],
  ctx: MarkdownRenderContext,
): void {
  out.push('#'.repeat(node.level), ' ');
  ctx.atLineStart = false;
  formatInlines(node.children, out, ctx);
}

function formatQuote(
  node: QuoteNode,
  out: string[],
  ctx: MarkdownRenderContext,
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
  const innerCtx = ctx.sub(true, ctx.inTableCell);
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
  ctx: MarkdownRenderContext,
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
  ctx: MarkdownRenderContext,
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
  ctx: MarkdownRenderContext,
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
  ctx: MarkdownRenderContext,
): void {
  // Verbatim passthrough with warning (ADR-0013); content comes from a
  // dtext stray-close salvage path and may not round-trip.
  ctx.diagnostics.push({
    code: 'md.dtext_salvage_passthrough',
    severity: 'warning',
    message:
      'RawBlockTextNode emitted verbatim; content originates from a dtext salvage path and may not round-trip through parseMarkdownToAst.',
  });
  out.push(node.content);
  ctx.atLineStart = node.content.endsWith('\n');
}

function formatLiteralHtml(
  node: LiteralHtmlNode,
  out: string[],
  ctx: MarkdownRenderContext,
): void {
  // Verbatim passthrough with warning (ADR-0013).
  ctx.diagnostics.push({
    code: 'md.dtext_salvage_passthrough',
    severity: 'warning',
    message:
      'LiteralHtmlNode emitted verbatim; prefix is HTML from a dtext salvage path and may not round-trip through parseMarkdownToAst.',
  });
  out.push(node.prefix);
  ctx.atLineStart = node.prefix.endsWith('\n');
  formatInlines(node.children, out, ctx);
}

function formatTable(
  node: TableNode,
  out: string[],
  ctx: MarkdownRenderContext,
): void {
  // Pipe-table form. The header separator row (`|---|---|`) is structurally
  // required by markdown-it; emit one even when no `TableHeadNode` is
  // present (a header-less table still needs the separator to re-parse).
  const headerRows: TableRowNode[] = [];
  const bodyRows: TableRowNode[] = [];
  for (const child of node.children) {
    if (child.type === 'table_head') {
      for (const r of (child as TableHeadNode).rows) {
        if (r.type === 'table_row') headerRows.push(r);
      }
    } else if (child.type === 'table_body') {
      for (const r of (child as TableBodyNode).rows) {
        if (r.type === 'table_row') bodyRows.push(r);
      }
    } else if (child.type === 'table_row') {
      // Loose row (no head/body wrapper). Treat as body.
      bodyRows.push(child as TableRowNode);
    }
    // `table_literal` fallout is dtext-only and not representable in markdown
    // pipe-table syntax; drop it silently.
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
  ctx: MarkdownRenderContext,
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
  ctx: MarkdownRenderContext,
): void {
  // Pipe-table approximation with warning (ADR-0012). First row treated as
  // header, rest as body; the no-head/body distinction is lost.
  ctx.diagnostics.push({
    code: 'md.ltable_approximated',
    severity: 'warning',
    message:
      'LTableNode emitted as pipe-table approximation (first row to header, rest to body); the no-head/body distinction is lost.',
  });

  // LTableNode now stores the parsed `[table]` body's children directly
  // (head/body wrappers, rows, and stray-close fallout). Flatten to a row
  // list, skipping any literal-fallout nodes since the markdown pipe-table
  // syntax cannot carry them.
  const rows: TableRowNode[] = [];
  for (const child of node.children) {
    if (child.type === 'table_head' || child.type === 'table_body') {
      for (const r of child.rows) {
        if (r.type === 'table_row') rows.push(r);
      }
    } else if (child.type === 'table_row') {
      rows.push(child);
    }
  }

  if (rows.length === 0) {
    out.push('|  |\n|---|');
    ctx.atLineStart = false;
    return;
  }

  const colCount = rows[0].cells.length;
  formatPipeTableRow(rows[0], out, ctx);
  out.push('\n|');
  for (let i = 0; i < colCount; i++) out.push('---|');
  ctx.atLineStart = true;
  for (let i = 1; i < rows.length; i++) {
    out.push('\n');
    formatPipeTableRow(rows[i], out, ctx);
  }
  ctx.atLineStart = false;
}

function formatTableRowFallback(
  node: TableRowNode,
  out: string[],
  ctx: MarkdownRenderContext,
): void {
  // Reached only when a `TableRowNode` is emitted outside a `TableNode` or
  // `LTableNode` context.
  formatPipeTableRow(node, out, ctx);
}

function formatTableCellFallback(
  node: TableCellNode,
  out: string[],
  ctx: MarkdownRenderContext,
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
  ctx: MarkdownRenderContext,
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

function formatLineBreak(out: string[], ctx: MarkdownRenderContext): void {
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
  ctx: MarkdownRenderContext,
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
  ctx: MarkdownRenderContext,
): void {
  // `[<text>](<url>)`. URL escape strategy per ADR-0014: backslash-escape
  // parens; angle-bracket wrap only for whitespace-bearing URLs.
  const titleBuf: string[] = [];
  const titleCtx = ctx.sub(false, ctx.inTableCell);
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
  ctx: MarkdownRenderContext,
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

// Default handler table. Override or extend by spreading:
// `{ ...markdownHandlers, link: myLink }`; children render through
// `ctx.render`, so an override applies wherever its node appears, at any depth.
export const markdownHandlers: MarkdownHandlers = {
  document: (node, out, ctx) => formatBlocks(node.children, out, ctx),

  // Block nodes
  header: formatHeader,
  paragraph: (node, out, ctx) => formatInlines(node.children, out, ctx),
  quote: formatQuote,
  spoiler_block: formatSpoilerBlock,
  section: formatSection,
  code_block: formatCodeBlock,
  raw_block_text: formatRawBlockText,
  literal_html: formatLiteralHtml,
  table: formatTable,
  ltable: formatLTable,
  list: formatList,

  // Inline nodes
  text: (node, out, ctx) => emitTextContent(node.content, out, ctx),
  bold: (node, out, ctx) => {
    out.push('**');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('**');
  },
  italic: (node, out, ctx) => {
    out.push('*');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('*');
  },
  strikeout: (node, out, ctx) => {
    out.push('~~');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('~~');
  },
  underline: (node, out, ctx) => {
    out.push('__');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('__');
  },
  superscript: (node, out, ctx) => {
    // BBCode survivor on the markdown side.
    out.push('[sup]');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('[/sup]');
  },
  subscript: (node, out, ctx) => {
    out.push('[sub]');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('[/sub]');
  },
  inline_spoiler: (node, out, ctx) => {
    out.push('||');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('||');
  },
  inline_code: (node, out, ctx) => {
    // Verbatim emit; backtick-bearing content is a documented divergence
    // (ADR-0010).
    out.push('`', node.content, '`');
    ctx.atLineStart = false;
  },
  color: (node, out, ctx) => {
    out.push('[color=', node.color, ']');
    ctx.atLineStart = false;
    formatInlines(node.children, out, ctx);
    out.push('[/color]');
  },
  line_break: (_node, out, ctx) => formatLineBreak(out, ctx),
  fragment: (node, out, ctx) => formatInlines(node.children, out, ctx),
  link: formatLink,
  internal_anchor: (node, out, ctx) => {
    out.push('[#', node.name, ']');
    ctx.atLineStart = false;
  },

  // Table sub-nodes: standalone emit lands here. The primary path runs
  // through `formatTable`, which unwraps head/body and emits rows directly
  // with the header-separator row markdown-it requires.
  table_head: (node, out, ctx) => {
    for (const row of node.rows) ctx.render(row, out);
  },
  table_body: (node, out, ctx) => {
    for (const row of node.rows) ctx.render(row, out);
  },
  table_row: formatTableRowFallback,
  table_cell: formatTableCellFallback,
};

function createContext(
  handlers: MarkdownHandlers,
  options: MarkdownRenderOptions,
  diagnostics: Diagnostic[],
  atLineStart: boolean,
  inTableCell: boolean,
): MarkdownRenderContext {
  const ctx: MarkdownRenderContext = {
    options,
    diagnostics,
    atLineStart,
    inTableCell,
    render(node: AstNode, out: string[]): void {
      const handler = handlers[node.type as keyof MarkdownHandlers] as
        | ((n: AstNode, out: string[], c: MarkdownRenderContext) => void)
        | undefined;
      if (handler) handler(node, out, ctx);
      else console.warn(`renderAstToMarkdown: unknown node type: ${node.type}`);
    },
    sub(nextAtLineStart: boolean, nextInTableCell: boolean) {
      return createContext(
        handlers,
        options,
        diagnostics,
        nextAtLineStart,
        nextInTableCell,
      );
    },
  };
  return ctx;
}

export function renderAstToMarkdown(
  ast: AstNode,
  options: MarkdownRenderOptions = {},
  handlers: MarkdownHandlers = markdownHandlers,
): MarkdownRenderResult {
  const out: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const ctx = createContext(handlers, options, diagnostics, true, false);
  ctx.render(ast, out);
  return { output: out.join(''), diagnostics };
}
