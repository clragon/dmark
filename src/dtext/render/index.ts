// Buffer-pattern dtext formatter.
//
// `formatDText(ast)` is the inverse of `parseDTextToAST`: it takes a canonical
// AST and emits dtext source whose round-trip through `parseDTextToAST` is
// deep-equal to the input. The contract and per-construct canonical forms are
// captured in `dtext-formatter-spec.md`'s Resolved design decisions section
// (`Q-MAGIC-LINK-CANONICAL`, `Q-WIKI-PAGE-RECOVER`, `Q-TEXTILE-BRACKET`,
// `Q-URL-DELIMITER`, `Q-CODE-BLOCK-LAYOUT`, `Q-TABLE-LAYOUT`, `Q-LTABLE-SEP`,
// `Q-DOC-TRAILING`, `Q-INLINE-CODE-BACKTICK`).
//
// Each `formatXxx(node, out, ctx)` pushes its dtext fragments into the shared
// `out` array; the recursion never builds intermediate strings. A single
// `out.join('')` at `formatDText`'s exit produces the final output. Mirrors
// the post-Tier-A shape of `src/dtext/render-html/index.ts`.
//
// Load-bearing rule: `out` is created fresh inside `formatDText` and never
// reused across calls. Concurrent renders would interleave otherwise.
//
// Diagnostics today: empty. The dtext side has no runtime-emit divergences;
// `Q-INLINE-CODE-BACKTICK` and salvage-path round-trip are surfaced through
// the round-trip harness as documented-divergence fixtures rather than as
// `Diagnostic` entries. The `diagnostics: Diagnostic[]` return shape is kept
// per resolved `Q-MD-API-SHAPE` so callers can treat both pipelines
// identically.

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

export interface DTextFormatterOptions {
  // Reserved for future flags. Kept as an explicit type so the public
  // contract has a stable shape from day one.
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
    case 'code_block':
      // Q-CODE-BLOCK-LAYOUT: strict-verbatim. User-fenced sources round-trip
      // fenced because `content` already includes the leading/trailing `\n`.
      out.push('[code]', (node as CodeBlockNode).content, '[/code]');
      return;
    case 'raw_block_text':
      // Salvage path. Content is a stray block-level closing tag the parser
      // captured verbatim; emit it the same way (passthrough).
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

    // Table sub-nodes are reached only via `formatTable`; the recursive
    // dispatch lands here for completeness but in practice the table arm
    // owns its own layout.
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
      // Verbatim emission (resolved Text-content escape policy section).
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
      // Same surface form as the block spoiler; the parser disambiguates
      // by paragraph-boundary context. Formatter emits `[/spoiler]`
      // unconditionally — the parser-side `getSpoilerClosePattern` faithfulness
      // gap (preferring `[/spoilers]`) is unreachable from formatter output.
      out.push('[spoiler]');
      formatInlines((node as InlineSpoilerNode).children, out, ctx);
      out.push('[/spoiler]');
      return;
    case 'inline_code':
      // Q-INLINE-CODE-BACKTICK: verbatim emit. Backtick-bearing content is
      // unrepresentable in dtext source and round-trips lossy through this
      // surface; the markdown→AST→dtext path is the only producer.
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
      // Transparent grouping; emit children with no wrapper.
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

// Walk an array of block nodes, emitting `\n\n` between blocks (resolved
// block separator policy). No leading or trailing separator; callers wrap
// with their own framing (e.g. `[quote]\n...\n[/quote]`).
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

// Walk an array of inline nodes; no separator (inline content concatenates).
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
  // Four canonical forms per the resolved Section row, mirroring the four
  // matched-string forms in `src/dtext/parse/index.ts`'s `matchSection`.
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
  // Q-TABLE-LAYOUT: pretty layout. Structural tags on their own lines; rows
  // on their own lines; cells inline within the row.
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
  // Q-LTABLE-SEP: cells joined by ' | ' (space-pipe-space).
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
  // Depth → asterisk-count, mirroring the parser's `(\*+)[ \t]+` rule.
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

// URL bare-vs-delimited boundary check (Q-URL-DELIMITER). Bare emit when the
// href contains no whitespace AND ends in a non-boundary char; delimited
// `<href>` otherwise. The boundary-char set mirrors the parser's
// `BOUNDARY_CHARS` in `src/dtext/parse/index.ts` lockstep.
const URL_BOUNDARY_CHAR_CODES: ReadonlySet<number> = new Set([
  0x0021, 0x0029, 0x002c, 0x002e, 0x003a, 0x003b, 0x003c, 0x003e, 0x003f,
  0x005d, 0x007d, 0x276d, 0x3000, 0x3001, 0x3002, 0x3008, 0x3009, 0x300a,
  0x300b, 0x300c, 0x300d, 0x300e, 0x300f, 0x3010, 0x3011, 0x3014, 0x3015,
]);

function urlEndsAtBoundary(url: string): boolean {
  if (url.length === 0) return false;
  return URL_BOUNDARY_CHAR_CODES.has(url.charCodeAt(url.length - 1));
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
  // Q-TEXTILE-BRACKET: bare "title":url when href has no whitespace, no `]`,
  // and is unchanged by trim-boundary; bracketed otherwise.
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
  // Anchor-only form: href is `#<encoded-anchor>`.
  if (node.href.startsWith('#') && node.anchor !== undefined) {
    out.push('[[#', node.anchor, ']]');
    return;
  }

  // Page-with-optional-anchor form. Two branches per Q-WIKI-PAGE-RECOVER:
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
  // Title-vs-bare: bare when children content equals tags (the no-title
  // branch of `buildPostSearchLink`); titled otherwise.
  if (childText === tags || childText === '') {
    out.push('{{', tags, '}}');
  } else {
    out.push('{{', tags, '|', childText, '}}');
  }
}

function formatIdLink(node: LinkNode, out: string[]): void {
  // Q-MAGIC-LINK-CANONICAL: emit `<source-prefix> #<id>` from `ID_SOURCE`,
  // not from `ID_DISPLAY` (which would round-trip-break `thumb` to `post`).
  // `node.children[0].content` carries the display form and is ignored here.
  if (!node.idType || !node.id) return;
  const source = ID_SOURCE[node.idType];
  out.push(source, ' #', node.id);
}
