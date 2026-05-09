/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  ASTNode,
  BoldNode,
  CodeBlockNode,
  ColorNode,
  DocumentNode,
  FragmentNode,
  HeaderNode,
  IdType,
  InlineCodeNode,
  InlineSpoilerNode,
  InternalAnchorNode,
  ItalicNode,
  LTableNode,
  LineBreakNode,
  LinkNode,
  ListItemNode,
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
} from '../../ast';

export interface DTextRenderOptions {
  allowColor?: boolean;
  maxThumbs?: number;
  baseUrl?: string;
}

interface RenderContext {
  options: DTextRenderOptions;
  thumbCount: number;
}

// Tag-category aliases that get a class-name treatment instead of an inline
// style. Both `renderQuote` and `renderColor` dispatch on this same set: a
// category match emits a `dtext-sidebar-colored-*` or `dtext-color-*` class
// with the original case preserved, otherwise the inline-style path runs.
// The parser keeps the same alternation under `QUOTE_CATEGORY_RE` (used by
// `isValidQuoteColor`) as the upstream gate; the two literals must stay in
// lockstep until the ID-metadata consolidation collapses them.
const TAG_CATEGORY_RE =
  /^(gen(eral)?|art(ist)?|contributor|char(acter)?|copy(right)?|spec(ies)?|inv(alid)?|meta|lore)$/i;

// Class names for `id_link` anchors keyed by the parser-emitted `idType`.
// Multi-class entries (today only `thumb`) carry the full ordered list, so
// the consumer is one indexed lookup and one push. The set must stay in
// lockstep with `ID_PATTERNS` in `parse/index.ts`: the parser produces an
// `idType` that this table must recognise, otherwise the rendered link
// silently loses its type-specific class. The `thumb` entry is load-bearing:
// a thumb that exceeds `maxThumbs` gets rewritten by the parser to
// `idType: 'post'`, so the over-limit case picks up `dtext-post-id-link`
// alone (no `thumb-placeholder-link`) without any special path here.
const ID_TYPE_CLASSES: Record<IdType, readonly string[]> = {
  post: ['dtext-post-id-link'],
  thumb: ['dtext-post-id-link', 'thumb-placeholder-link'],
  post_changes: ['dtext-post-changes-for-id-link'],
  flag: ['dtext-post-flag-id-link'],
  note: ['dtext-note-id-link'],
  forum_post: ['dtext-forum-post-id-link'],
  topic: ['dtext-forum-topic-id-link'],
  comment: ['dtext-comment-id-link'],
  pool: ['dtext-pool-id-link'],
  user: ['dtext-user-id-link'],
  artist: ['dtext-artist-id-link'],
  ban: ['dtext-ban-id-link'],
  bur: ['dtext-bulk-update-request-id-link'],
  alias: ['dtext-tag-alias-id-link'],
  implication: ['dtext-tag-implication-id-link'],
  mod_action: ['dtext-mod-action-id-link'],
  record: ['dtext-user-feedback-id-link'],
  wiki: ['dtext-wiki-page-id-link'],
  set: ['dtext-set-id-link'],
  blip: ['dtext-blip-id-link'],
  takedown: ['dtext-takedown-id-link'],
  ticket: ['dtext-ticket-id-link'],
};

// Single-pass HTML escape with a no-alloc fast path. The previous
// implementation chained four `.replace()` calls (one per char), each
// allocating a fresh string even when the input was already clean. The
// regex first pass tests whether *any* escape is needed; clean strings
// (the common case for plain prose text nodes) return as-is. When an
// escape is needed, one regex walk + a small lookup yields the result in
// a single allocation.
const HTML_ESCAPE_RE = /[&<>"]/;
const HTML_ESCAPE_RE_G = /[&<>"]/g;
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
function htmlEscape(str: string): string {
  if (!HTML_ESCAPE_RE.test(str)) return str;
  return str.replace(HTML_ESCAPE_RE_G, (c) => HTML_ESCAPES[c]);
}

// Single-pass URI percent-escape with a no-alloc fast path. Mirrors the
// shape of `htmlEscape`: a cheap probe regex decides whether any char
// needs escaping and clean strings (e.g. plain ASCII anchor names like
// `rangesyntax`) skip both the regex walk and the per-char `+=` chain.
// `whitelist` lets a caller exempt one extra char from escaping; it
// passes through the slow path so the fast-path probe stays correct
// regardless of the whitelist value.
const URI_NEEDS_ESCAPE_RE = /[^a-zA-Z0-9\-_.~]/;
const URI_NEEDS_ESCAPE_RE_G = /[^a-zA-Z0-9\-_.~]/g;

function uriEscape(str: string, whitelist = ''): string {
  if (!URI_NEEDS_ESCAPE_RE.test(str)) return str;
  return str.replace(URI_NEEDS_ESCAPE_RE_G, (c) => {
    if (c === whitelist) return c;
    return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  });
}

export function renderToHTML(
  node: ASTNode,
  options: DTextRenderOptions = {},
): string {
  const context: RenderContext = {
    options,
    thumbCount: 0,
  };

  return renderNode(node, context);
}

function renderNode(node: ASTNode, context: RenderContext): string {
  switch (node.type) {
    case 'document':
      return renderDocument(node as DocumentNode, context);

    // Block nodes
    case 'header':
      return renderHeader(node as HeaderNode, context);
    case 'paragraph':
      return renderParagraph(node as ParagraphNode, context);
    case 'quote':
      return renderQuote(node as QuoteNode, context);
    case 'spoiler_block':
      return renderSpoilerBlock(node as SpoilerBlockNode, context);
    case 'section':
      return renderSection(node as SectionNode, context);
    case 'code_block':
      return renderCodeBlock(node as CodeBlockNode, context);
    case 'raw_block_text':
      return renderRawBlockText(node as RawBlockTextNode, context);
    case 'literal_html': {
      const lit = node as LiteralHtmlNode;
      return (
        lit.prefix +
        lit.children.map((child) => renderNode(child, context)).join('')
      );
    }
    case 'table':
      return renderTable(node as TableNode, context);
    case 'ltable':
      return renderLTable(node as LTableNode, context);
    case 'table_head':
      return renderTableHead(node as TableHeadNode, context);
    case 'table_body':
      return renderTableBody(node as TableBodyNode, context);
    case 'table_row':
      return renderTableRow(node as TableRowNode, context);
    case 'table_cell':
      return renderTableCell(node as TableCellNode, context);
    case 'list':
      return renderList(node as ListNode, context);
    case 'list_item':
      return renderListItem(node as ListItemNode, context);

    // Inline nodes
    case 'text':
      return renderText(node as TextNode, context);
    case 'bold':
      return renderBold(node as BoldNode, context);
    case 'italic':
      return renderItalic(node as ItalicNode, context);
    case 'strikeout':
      return renderStrikeout(node as StrikeoutNode, context);
    case 'underline':
      return renderUnderline(node as UnderlineNode, context);
    case 'superscript':
      return renderSuperscript(node as SuperscriptNode, context);
    case 'subscript':
      return renderSubscript(node as SubscriptNode, context);
    case 'inline_spoiler':
      return renderInlineSpoiler(node as InlineSpoilerNode, context);
    case 'inline_code':
      return renderInlineCode(node as InlineCodeNode, context);
    case 'color':
      return renderColor(node as ColorNode, context);
    case 'line_break':
      return renderLineBreak(node as LineBreakNode, context);
    case 'fragment':
      return renderFragment(node as FragmentNode, context);
    case 'link':
      return renderLink(node as LinkNode, context);
    case 'internal_anchor':
      return renderInternalAnchor(node as InternalAnchorNode, context);

    default:
      console.warn(`Unknown node type: ${node.type}`);
      return '';
  }
}

function renderDocument(node: DocumentNode, context: RenderContext): string {
  return node.children.map((child) => renderNode(child, context)).join('');
}

function renderHeader(node: HeaderNode, context: RenderContext): string {
  const tag = `h${node.level}`;
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<${tag}>${content}</${tag}>`;
}

function renderParagraph(node: ParagraphNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<p>${content}</p>`;
}

function renderQuote(node: QuoteNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  if (node.color) {
    if (TAG_CATEGORY_RE.test(node.color)) {
      // Tag-category quotes get a sidebar class with the color name as
      // typed; case is preserved (verified against the oracle).
      return `<blockquote class="dtext-sidebar-colored-${node.color}">${content}</blockquote>`;
    }
    return `<blockquote class="dtext-quote-color" style="border-left-color:${node.color}">${content}</blockquote>`;
  }
  return `<blockquote>${content}</blockquote>`;
}

function renderSpoilerBlock(
  node: SpoilerBlockNode,
  context: RenderContext,
): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<div class="spoiler">${content}</div>`;
}

function renderSection(node: SectionNode, context: RenderContext): string {
  const openAttr = node.expanded ? ' open' : '';
  const title = node.title ? htmlEscape(node.title) : '';
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<details${openAttr}><summary>${title}</summary><div>${content}</div></details>`;
}

function renderCodeBlock(node: CodeBlockNode, _context: RenderContext): string {
  return `<pre>${htmlEscape(node.content)}</pre>`;
}

function renderRawBlockText(
  node: RawBlockTextNode,
  _context: RenderContext,
): string {
  return htmlEscape(node.content);
}

function renderTable(node: TableNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<table class="striped">${content}</table>`;
}

function renderLTable(node: LTableNode, context: RenderContext): string {
  // Oracle quirks:
  //   * Zero rows -> emit a literal `[/tbody]` between the table tags
  //     (verified for `[ltable][/ltable]` and `[ltable]\n\n[/ltable]`).
  //   * Any rows -> always emit `<tbody></tbody>` after `<thead>`, even
  //     when there are no body rows beyond the single header.
  if (node.rows.length === 0) {
    return `<table class="striped">[/tbody]</table>`;
  }
  const headerRow = node.rows[0];
  const bodyRows = node.rows.slice(1);
  const headHtml = `<thead>${renderNode(headerRow, context)}</thead>`;
  const bodyHtml = `<tbody>${bodyRows
    .map((row) => renderNode(row, context))
    .join('')}</tbody>`;
  return `<table class="striped">${headHtml}${bodyHtml}</table>`;
}

function renderTableHead(node: TableHeadNode, context: RenderContext): string {
  const content = node.rows.map((row) => renderNode(row, context)).join('');
  return `<thead>${content}</thead>`;
}

function renderTableBody(node: TableBodyNode, context: RenderContext): string {
  const content = node.rows.map((row) => renderNode(row, context)).join('');
  return `<tbody>${content}</tbody>`;
}

function renderTableRow(node: TableRowNode, context: RenderContext): string {
  const content = node.cells.map((cell) => renderNode(cell, context)).join('');
  return `<tr>${content}</tr>`;
}

function renderTableCell(node: TableCellNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<${node.cellType}>${content}</${node.cellType}>`;
}

function renderList(node: ListNode, context: RenderContext): string {
  let result = '';
  let prevDepth = 0;

  for (const item of node.items) {
    if (item.depth > prevDepth) {
      for (let i = prevDepth; i < item.depth; i++) {
        result += '<ul>';
      }
    } else if (item.depth < prevDepth) {
      for (let i = item.depth; i < prevDepth; i++) {
        result += '</ul>';
      }
    }
    result += renderNode(item, context);
    prevDepth = item.depth;
  }

  for (let i = 0; i < prevDepth; i++) {
    result += '</ul>';
  }

  return result;
}

function renderListItem(node: ListItemNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<li>${content}</li>`;
}

function renderText(node: TextNode, _context: RenderContext): string {
  return htmlEscape(node.content);
}

function renderBold(node: BoldNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<strong>${content}</strong>`;
}

function renderItalic(node: ItalicNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<em>${content}</em>`;
}

function renderStrikeout(node: StrikeoutNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<s>${content}</s>`;
}

function renderUnderline(node: UnderlineNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<u>${content}</u>`;
}

function renderSuperscript(
  node: SuperscriptNode,
  context: RenderContext,
): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<sup>${content}</sup>`;
}

function renderSubscript(node: SubscriptNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<sub>${content}</sub>`;
}

function renderInlineSpoiler(
  node: InlineSpoilerNode,
  context: RenderContext,
): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<span class="spoiler">${content}</span>`;
}

function renderInlineCode(
  node: InlineCodeNode,
  _context: RenderContext,
): string {
  return `<span class="inline-code">${htmlEscape(node.content)}</span>`;
}

function renderColor(node: ColorNode, context: RenderContext): string {
  if (context.options.allowColor === false) {
    return node.children.map((child) => renderNode(child, context)).join('');
  }

  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');

  if (TAG_CATEGORY_RE.test(node.color)) {
    // Preserve the original case of the color name in the class. Ruby's
    // dtext does not normalize the case here — `[color=Character]` becomes
    // `dtext-color-Character`, not `dtext-color-character`.
    return `<span class="dtext-color-${node.color}">${content}</span>`;
  } else {
    return `<span class="dtext-color" style="color:${node.color}">${content}</span>`;
  }
}

function renderLineBreak(
  _node: LineBreakNode,
  _context: RenderContext,
): string {
  return '<br>';
}

function renderFragment(node: FragmentNode, context: RenderContext): string {
  return node.children.map((child) => renderNode(child, context)).join('');
}

function renderLink(node: LinkNode, context: RenderContext): string {
  if (node.idType === 'thumb' && context.options.maxThumbs !== undefined) {
    if (context.thumbCount >= context.options.maxThumbs) {
      return `<span class="thumb-limit-exceeded">${htmlEscape(node.title || node.href)}</span>`;
    }
    context.thumbCount++;
  }

  const classes = generateLinkClasses(node);

  let content = '';
  if (node.children) {
    content = node.children.map((child) => renderNode(child, context)).join('');
  } else if (node.title) {
    content = htmlEscape(node.title);
  } else {
    content = htmlEscape(node.href);
  }

  let href = node.href;
  if (context.options.baseUrl && href.startsWith('/')) {
    href = context.options.baseUrl.replace(/\/$/, '') + href;
  }

  // Ruby's dtext renderer omits rel="nofollow" on id_link anchors (post #N,
  // comment #N etc.) but adds it on every other link type.
  const relAttr = node.linkType === 'id_link' ? '' : ' rel="nofollow"';

  let dataAttr = '';
  if (node.idType === 'thumb' && node.id) {
    dataAttr = ` data-id="${htmlEscape(node.id)}"`;
  }

  return `<a${relAttr} class="${classes.join(' ')}"${dataAttr} href="${htmlEscape(href)}">${content}</a>`;
}

function renderInternalAnchor(
  node: InternalAnchorNode,
  _context: RenderContext,
): string {
  return `<a id="${uriEscape(node.name.toLowerCase())}"></a>`;
}

function generateLinkClasses(node: LinkNode): string[] {
  const classes: string[] = ['dtext-link'];

  switch (node.linkType) {
    case 'url':
      break;
    case 'textile':
      if (node.href.startsWith('/')) {
        break;
      } else {
        classes.push('dtext-external-link');
      }
      break;
    case 'wiki':
      classes.push('dtext-wiki-link');
      break;
    case 'post_search':
      classes.push('dtext-post-search-link');
      break;
    case 'id_link':
      classes.push('dtext-id-link');
      if (node.idType) {
        const extra = ID_TYPE_CLASSES[node.idType];
        if (extra) classes.push(...extra);
      }
      break;
  }

  return classes;
}
