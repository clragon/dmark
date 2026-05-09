// Buffer-pattern dtext formatter. `formatDText(ast)` is the inverse of
// `parseDText`: emits dtext source whose round-trip is deep-equal to the
// input. Per-construct canonical forms are in `docs/mapping.md`; the result
// shape follows ADR-0003. The `out` buffer is created fresh per call;
// promoting it to module scope would interleave concurrent renders.

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
import { isBoundaryChar } from '../url';

export interface DTextFormatterOptions {
  // Reserved for flags; kept as an explicit type so the public contract has a
  // stable shape.
}

export interface DTextFormatResult {
  output: string;
  diagnostics: Diagnostic[];
}

interface FormatContext {
  options: DTextFormatterOptions;
  diagnostics: Diagnostic[];
}

export function formatDText(
  ast: ASTNode,
  options: DTextFormatterOptions = {},
): DTextFormatResult {
  const out: string[] = [];
  const ctx: FormatContext = { options, diagnostics: [] };
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
    case 'code_block': {
      // ADR-0007 emit. The parser eats one whitespace+newline run after
      // `[code]`, so when content's first byte is itself whitespace we
      // prepend `\n` to absorb the parser's consume on round-trip. Without
      // it, content like `"\nhi"` reparses as `"hi"`.
      const content = (node as CodeBlockNode).content;
      const needsLeadingNewline = content.length > 0 && /^\s/.test(content);
      out.push('[code]');
      if (needsLeadingNewline) out.push('\n');
      out.push(content, '[/code]');
      return;
    }
    case 'raw_block_text':
      // Salvage passthrough: `content` is a stray block-level close captured
      // verbatim by the parser.
      out.push((node as RawBlockTextNode).content);
      return;
    case 'literal_html': {
      const lit = node as LiteralHtmlNode;
      out.push(lit.prefix);
      formatInlines(lit.children, out, ctx);
      return;
    }
    case 'table':
      formatTable(node as TableNode, out, ctx);
      return;
    case 'ltable':
      formatLTable(node as LTableNode, out, ctx);
      return;
    case 'list':
      formatList(node as ListNode, out, ctx);
      return;

    // Table sub-nodes are normally reached via `formatTable`; the dispatch
    // arms exist for completeness, the table arm owns its own layout.
    case 'table_head':
      formatTableHead(node as TableHeadNode, out, ctx);
      return;
    case 'table_body':
      formatTableBody(node as TableBodyNode, out, ctx);
      return;
    case 'table_row':
      formatTableRow(node as TableRowNode, out, ctx);
      return;
    case 'table_cell':
      formatTableCell(node as TableCellNode, out, ctx);
      return;

    // Inline nodes
    case 'text':
      out.push((node as TextNode).content);
      return;
    case 'bold':
      out.push('[b]');
      formatInlines((node as BoldNode).children, out, ctx);
      out.push('[/b]');
      return;
    case 'italic':
      out.push('[i]');
      formatInlines((node as ItalicNode).children, out, ctx);
      out.push('[/i]');
      return;
    case 'strikeout':
      out.push('[s]');
      formatInlines((node as StrikeoutNode).children, out, ctx);
      out.push('[/s]');
      return;
    case 'underline':
      out.push('[u]');
      formatInlines((node as UnderlineNode).children, out, ctx);
      out.push('[/u]');
      return;
    case 'superscript':
      out.push('[sup]');
      formatInlines((node as SuperscriptNode).children, out, ctx);
      out.push('[/sup]');
      return;
    case 'subscript':
      out.push('[sub]');
      formatInlines((node as SubscriptNode).children, out, ctx);
      out.push('[/sub]');
      return;
    case 'inline_spoiler':
      // Same surface form as the block spoiler; the parser disambiguates by
      // paragraph-boundary context. The `[/spoiler]` unconditional emit can
      // never reach the parser's `[/spoilers]`-preference gap.
      out.push('[spoiler]');
      formatInlines((node as InlineSpoilerNode).children, out, ctx);
      out.push('[/spoiler]');
      return;
    case 'inline_code':
      // Verbatim emit (ADR-0010). Backtick-bearing content is unrepresentable
      // in dtext source; only the markdown to AST to dtext path produces it.
      out.push('`', (node as InlineCodeNode).content, '`');
      return;
    case 'color':
      out.push('[color=', (node as ColorNode).color, ']');
      formatInlines((node as ColorNode).children, out, ctx);
      out.push('[/color]');
      return;
    case 'line_break':
      out.push('\n');
      return;
    case 'fragment':
      formatInlines((node as FragmentNode).children, out, ctx);
      return;
    case 'link':
      formatLink(node as LinkNode, out, ctx);
      return;
    case 'internal_anchor':
      out.push('[#', (node as InternalAnchorNode).name, ']');
      return;

    default:
      // eslint-disable-next-line no-console
      console.warn(`formatDText: unknown node type: ${(node as ASTNode).type}`);
  }
}

// Walk an array of block nodes, emitting `\n\n` between blocks. No leading
// or trailing separator; callers wrap with their own framing (e.g.
// `[quote]\n...\n[/quote]`). See ADR-0002 for the document-end rule.
function formatBlocks(
  blocks: BlockNode[],
  out: string[],
  ctx: FormatContext,
): void {
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) out.push('\n\n');
    formatNode(blocks[i], out, ctx);
  }
}

// Walk an array of inline nodes; inline content concatenates with no separator.
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
  out.push('h', String(node.level), '. ');
  formatInlines(node.children, out, ctx);
}

function formatQuote(
  node: QuoteNode,
  out: string[],
  ctx: FormatContext,
): void {
  if (node.color !== undefined) {
    out.push('[quote=', node.color, ']\n');
  } else {
    out.push('[quote]\n');
  }
  formatBlocks(node.children, out, ctx);
  out.push('\n[/quote]');
}

function formatSpoilerBlock(
  node: SpoilerBlockNode,
  out: string[],
  ctx: FormatContext,
): void {
  out.push('[spoiler]\n');
  formatBlocks(node.children, out, ctx);
  out.push('\n[/spoiler]');
}

function formatSection(
  node: SectionNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Four canonical forms, mirroring the four matched-string forms in
  // `matchSection`.
  if (node.title !== undefined) {
    out.push(node.expanded ? '[section,expanded=' : '[section=');
    out.push(node.title, ']\n');
  } else {
    out.push(node.expanded ? '[section,expanded]\n' : '[section]\n');
  }
  formatBlocks(node.children, out, ctx);
  out.push('\n[/section]');
}

function formatTable(
  node: TableNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Pretty layout (ADR-0008): structural tags on their own lines, rows on
  // their own lines, cells inline within the row.
  out.push('[table]\n');
  for (const child of node.children) {
    formatNode(child, out, ctx);
    out.push('\n');
  }
  out.push('[/table]');
}

function formatTableHead(
  node: TableHeadNode,
  out: string[],
  ctx: FormatContext,
): void {
  out.push('[thead]\n');
  for (const row of node.rows) {
    formatNode(row, out, ctx);
    out.push('\n');
  }
  out.push('[/thead]');
}

function formatTableBody(
  node: TableBodyNode,
  out: string[],
  ctx: FormatContext,
): void {
  out.push('[tbody]\n');
  for (const row of node.rows) {
    formatNode(row, out, ctx);
    out.push('\n');
  }
  out.push('[/tbody]');
}

function formatTableRow(
  node: TableRowNode,
  out: string[],
  ctx: FormatContext,
): void {
  out.push('[tr]');
  for (const cell of node.cells) formatNode(cell, out, ctx);
  out.push('[/tr]');
}

function formatTableCell(
  node: TableCellNode,
  out: string[],
  ctx: FormatContext,
): void {
  out.push('[', node.cellType, ']');
  formatInlines(node.children, out, ctx);
  out.push('[/', node.cellType, ']');
}

function formatLTable(
  node: LTableNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Cells joined by ' | ' (ADR-0009).
  out.push('[ltable]\n');
  for (const row of node.rows) {
    for (let i = 0; i < row.cells.length; i++) {
      if (i > 0) out.push(' | ');
      formatInlines(row.cells[i].children, out, ctx);
    }
    out.push('\n');
  }
  out.push('[/ltable]');
}

function formatList(
  node: ListNode,
  out: string[],
  ctx: FormatContext,
): void {
  // Depth maps to asterisk-count, mirroring the parser's `(\*+)[ \t]+` rule.
  // One line per item; no container framing.
  for (let i = 0; i < node.items.length; i++) {
    if (i > 0) out.push('\n');
    const item = node.items[i];
    out.push('*'.repeat(item.depth), ' ');
    formatInlines(item.children, out, ctx);
  }
}

function formatLink(
  node: LinkNode,
  out: string[],
  ctx: FormatContext,
): void {
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

// URL bare-vs-delimited boundary check (ADR-0006). Boundary set is shared
// with the parser via `../url`.
function urlEndsAtBoundary(url: string): boolean {
  if (url.length === 0) return false;
  return isBoundaryChar(url.charCodeAt(url.length - 1));
}

function formatUrlLink(node: LinkNode, out: string[]): void {
  const href = node.href;
  if (/\s/.test(href) || urlEndsAtBoundary(href)) {
    out.push('<', href, '>');
  } else {
    out.push(href);
  }
}

function formatInlineLink(
  node: LinkNode,
  out: string[],
  ctx: FormatContext,
): void {
  // ADR-0005: bare "title":url when href has no whitespace, no `]`, and is
  // unchanged by trim-boundary; bracketed otherwise.
  const titleBuf: string[] = [];
  if (node.children) formatInlines(node.children, titleBuf, ctx);
  const title = titleBuf.join('');
  const href = node.href;
  const canBare =
    !/\s/.test(href) && !href.includes(']') && !urlEndsAtBoundary(href);
  if (canBare) {
    out.push('"', title, '":', href);
  } else {
    out.push('"', title, '":[', href, ']');
  }
}

function formatWikiLink(node: LinkNode, out: string[]): void {
  // Anchor-only form: href is `#<encoded-anchor>`. Two source-form
  // variants both produce this AST shape:
  //   - `[[#anchor]]`         children content = `"#<anchor>"` (default)
  //   - `[[#anchor|title]]`   children content = title override
  // Detect by comparing children content to the default-derived form.
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

  // Page-with-optional-anchor form. Two branches per ADR-0004:
  //   * No-title: emit `children[0].content` directly (preserves casing).
  //   * Title-override: emit normalised page (lossy on case) plus title.
  // Distinguish by ASCII-case-insensitive match between children content and
  // the de-normalised tag (with optional `#anchor`).
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
    // Title-collision edge: `[[Wolf|wolf]]` (title equals the lowercased page
    // form) is indistinguishable from `[[Wolf]]` in the AST, both yielding
    // `LinkNode { children: [TextNode "wolf"], href: ".../wolf", ... }`
    // modulo case. ADR-0004 picks the no-title emit (info-lossless on the
    // page side, lossy on the title side for the collision case).
    out.push('[[', childText, ']]');
  } else {
    // Title-override case: emit normalised page (lossy on case) + title.
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
  // Same trick as the wikilink no-title branch: when children text equals
  // `tags` modulo ASCII case (the parser produces this for any `{{tag}}`
  // source: `tags` is lowercased, children preserves original case), emit
  // `{{<childText>}}` rather than `{{<tags>}}`. The parser lowercases the tag
  // on re-parse and preserves the original case in children, so AST round-trip
  // holds AND the emit avoids a `|` that would break LTable cell parsing on
  // round-trip via an `[ltable]` row.
  if (childText === '' || asciiLowercase(childText) === tags) {
    out.push('{{', childText || tags, '}}');
  } else {
    out.push('{{', tags, '|', childText, '}}');
  }
}

function formatIdLink(node: LinkNode, out: string[]): void {
  // Emit `<source-prefix> #<id>` from `ID_SOURCE` (ADR-0001). `ID_DISPLAY`
  // would round-trip-break `thumb` to `post`. `node.children[0].content`
  // carries the display form and is ignored here.
  if (!node.idType || !node.id) return;
  const source = ID_SOURCE[node.idType];
  out.push(source, ' #', node.id);
}
