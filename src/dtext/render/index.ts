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
  // Set when an inline link's bare emit had `]` inside its href and could
  // therefore re-parse via `\S+` past the surrounding inline container's
  // close. Reset by emitInlineContainer when it inserts the `\n` terminator
  // (or finishes without one).
  unsafeBareUrl?: boolean;
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

// First byte that `node` would emit when formatted. Used by URL-link
// emitters to detect when a bare form would glue its URL to the next
// sibling's emit on re-parse. Returns `undefined` for nodes whose emit is
// effectively empty (or unknown), which signals "no following byte" — the
// safe default for the bare-form check.
function firstEmitChar(node: ASTNode): string | undefined {
  switch (node.type) {
    case 'text': {
      const c = (node as TextNode).content;
      return c.length > 0 ? c[0] : undefined;
    }
    case 'internal_anchor':
    case 'bold':
    case 'italic':
    case 'strikeout':
    case 'underline':
    case 'superscript':
    case 'subscript':
    case 'inline_spoiler':
    case 'color':
      return '[';
    case 'inline_code':
      return '`';
    case 'line_break':
      return '\n';
    case 'fragment': {
      const ch = (node as FragmentNode).children[0];
      return ch ? firstEmitChar(ch) : undefined;
    }
    case 'link':
      switch ((node as LinkNode).linkType) {
        case 'url': {
          const h = (node as LinkNode).href;
          return h.length > 0 ? h[0] : undefined;
        }
        case 'inline':
          return '"';
        case 'wiki':
          return '[';
        case 'post_search':
          return '{';
        case 'id_link': {
          const t = (node as LinkNode).idType;
          return t ? t[0] : undefined;
        }
      }
      return undefined;
    default:
      return undefined;
  }
}

function formatNode(
  node: ASTNode,
  out: string[],
  ctx: FormatContext,
  trailing?: string,
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
    case 'text': {
      const content = (node as TextNode).content;
      out.push(content);
      if (ctx.unsafeBareUrl && /\s/.test(content)) ctx.unsafeBareUrl = false;
      return;
    }
    case 'bold':
      emitInlineContainer('b', (node as BoldNode).children, out, ctx);
      return;
    case 'italic':
      emitInlineContainer('i', (node as ItalicNode).children, out, ctx);
      return;
    case 'strikeout':
      emitInlineContainer('s', (node as StrikeoutNode).children, out, ctx);
      return;
    case 'underline':
      emitInlineContainer('u', (node as UnderlineNode).children, out, ctx);
      return;
    case 'superscript':
      emitInlineContainer('sup', (node as SuperscriptNode).children, out, ctx);
      return;
    case 'subscript':
      emitInlineContainer('sub', (node as SubscriptNode).children, out, ctx);
      return;
    case 'inline_spoiler':
      // Same surface form as the block spoiler; the parser disambiguates by
      // paragraph-boundary context. The `[/spoiler]` unconditional emit can
      // never reach the parser's `[/spoilers]`-preference gap.
      emitInlineContainer(
        'spoiler',
        (node as InlineSpoilerNode).children,
        out,
        ctx,
      );
      return;
    case 'inline_code':
      // Verbatim emit (ADR-0010). Backtick-bearing content is unrepresentable
      // in dtext source; only the markdown to AST to dtext path produces it.
      out.push('`', (node as InlineCodeNode).content, '`');
      return;
    case 'color': {
      const color = node as ColorNode;
      const open = `[color=${color.color}]`;
      emitInlineContainer('color', color.children, out, ctx, open);
      return;
    }
    case 'line_break':
      out.push('\n');
      ctx.unsafeBareUrl = false;
      return;
    case 'fragment': {
      const frag = node as FragmentNode;
      if (frag.wrapper) {
        emitInlineContainer(frag.wrapper, frag.children, out, ctx);
      } else {
        formatInlines(frag.children, out, ctx);
      }
      return;
    }
    case 'link':
      formatLink(node as LinkNode, out, ctx, trailing);
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

// Wrap an inline container's children with `open`/`[/tag]` markup. The body
// is formatted into a local buffer so we can detect the rare case where a
// child's emit (typically a textile link with `]` in its URL) would be
// absorbed by the parser's bare-URL `\S+` capture and swallow the close.
// The fix is a single `\n` before the close: the trailing line break gets
// stripped by `trimTrailingLineBreaks` at re-parse, so AST equality holds
// while the close is no longer reachable from the URL capture.
function emitInlineContainer(
  tag: string,
  children: InlineNode[],
  out: string[],
  ctx: FormatContext,
  open?: string,
): void {
  const close = `[/${tag}]`;
  const body: string[] = [];
  const prevUnsafe = ctx.unsafeBareUrl;
  ctx.unsafeBareUrl = false;
  formatInlines(children, body, ctx, '[');
  const joined = body.join('');
  out.push(open ?? `[${tag}]`);
  out.push(joined);
  // The unsafe-bare-url flag is only meaningful when no whitespace has been
  // emitted between the URL and the close — which is exactly when the body
  // still ends in non-whitespace. Otherwise the natural separator already
  // bounds the `\S+` capture and the close is reachable.
  if (ctx.unsafeBareUrl && joined.length > 0 && !/\s$/.test(joined)) {
    out.push('\n');
  }
  ctx.unsafeBareUrl = prevUnsafe;
  out.push(close);
}

// Walk an array of inline nodes; inline content concatenates with no separator.
// `trailing` is the first byte that will follow this group — used by the
// URL-link emitters to pick a glue-safe form for the last child. Pass
// `'['` from a wrapping inline container (its `[/...]` close starts with `[`)
// or omit when the group ends at a newline / end-of-block (safe).
function formatInlines(
  inlines: InlineNode[],
  out: string[],
  ctx: FormatContext,
  trailing?: string,
): void {
  for (let i = 0; i < inlines.length; i++) {
    const next = i + 1 < inlines.length ? inlines[i + 1] : undefined;
    const hint = next ? firstEmitChar(next) : trailing;
    formatNode(inlines[i], out, ctx, hint);
  }
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
  formatInlines(node.children, out, ctx, '[');
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
  trailing: string | undefined,
): void {
  switch (node.linkType) {
    case 'url':
      formatUrlLink(node, out, trailing);
      return;
    case 'inline':
      formatInlineLink(node, out, ctx, trailing);
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

// True when the byte that immediately follows a bare-emitted URL is safe:
// the parser's `\S+` capture stops at it without absorbing into the URL.
// Whitespace and EOF satisfy this; any other glyph (including BOUNDARY_CHARS,
// since `trimUrlBoundaries` only peels one trailing char and a sibling like
// `).` would still leave `)` glued to the URL) is treated as unsafe and
// forces the formatter into the bracketed/delimited form.
function isSafeUrlFollow(ch: string | undefined): boolean {
  if (ch === undefined) return true;
  return /\s/.test(ch);
}

function formatUrlLink(
  node: LinkNode,
  out: string[],
  trailing: string | undefined,
): void {
  const href = node.href;
  if (
    /\s/.test(href) ||
    urlEndsAtBoundary(href) ||
    !isSafeUrlFollow(trailing)
  ) {
    out.push('<', href, '>');
  } else {
    out.push(href);
  }
}

function formatInlineLink(
  node: LinkNode,
  out: string[],
  ctx: FormatContext,
  trailing: string | undefined,
): void {
  // ADR-0005: bare "title":url when href has no whitespace, no `]`, no
  // trailing boundary, AND the surrounding context will not glue the URL to
  // its next sibling on re-parse. Otherwise bracketed.
  //
  // Bracketed form cannot encode a `]` inside the URL (the parser's
  // `[^\]]+` stops at the first one), so for any href containing a `]` we
  // fall back to bare. The bare emit relies on `\S+` reaching whitespace
  // before the URL is over-consumed; `emitInlineContainer` adds a trailing
  // `\n` before the close when the URL would otherwise swallow it.
  const titleBuf: string[] = [];
  if (node.children) formatInlines(node.children, titleBuf, ctx);
  const title = titleBuf.join('');
  const href = node.href;
  const hasCloseBracket = href.includes(']');
  const canBare =
    !/\s/.test(href) &&
    !hasCloseBracket &&
    !urlEndsAtBoundary(href) &&
    isSafeUrlFollow(trailing);
  if (canBare || hasCloseBracket) {
    out.push('"', title, '":', href);
    if (hasCloseBracket) ctx.unsafeBareUrl = true;
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
  const anchor = node.anchor;
  const childText =
    node.children?.[0] && node.children[0].type === 'text'
      ? (node.children[0] as TextNode).content
      : '';

  // Tag normalisation collapses ` ` and `_` into the same href, so either
  // spelling on the children side counts as a no-title match. Comparing both
  // sides under `space → underscore` keeps `[[animated_png]]` and
  // `[[animated png]]` both round-tripping to the no-title form.
  const tagKey = (s: string) => asciiLowercase(s).replace(/ /g, '_');
  const expectedNoTitleKey =
    anchor !== undefined
      ? `${tagKey(normalisedTag)}#${anchor}`
      : tagKey(normalisedTag);

  if (tagKey(childText) === expectedNoTitleKey) {
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
