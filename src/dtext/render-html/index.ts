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

// Buffer-pattern renderer.
//
// Each `renderXxx(node, out, ctx)` pushes its HTML fragments into the shared
// `out` array; the recursion never builds intermediate strings. A single
// `out.join('')` at `renderToHTML`'s exit produces the final output. This
// turns the cost from O(depth × size) (every parent re-concatenated all
// children) into O(size), and removes the per-level transient array that
// `children.map(renderNode).join('')` used to allocate.
//
// Load-bearing rule: `out` is created fresh inside `renderToHTML` and never
// reused across calls. Do not promote it to a module-level singleton or
// reuse it between invocations: concurrent renders would interleave and the
// caller's HTML would be mangled. The signature passing it explicitly keeps
// that boundary visible.
export function renderToHTML(
  node: ASTNode,
  options: DTextRenderOptions = {},
): string {
  const out: string[] = [];
  const context: RenderContext = {
    options,
    thumbCount: 0,
  };
  renderNode(node, out, context);
  return out.join('');
}

function renderNode(
  node: ASTNode,
  out: string[],
  context: RenderContext,
): void {
  switch (node.type) {
    case 'document':
      renderNodes((node as DocumentNode).children, out, context);
      return;

    // Block nodes
    case 'header':
      renderHeader(node as HeaderNode, out, context);
      return;
    case 'paragraph':
      renderParagraph(node as ParagraphNode, out, context);
      return;
    case 'quote':
      renderQuote(node as QuoteNode, out, context);
      return;
    case 'spoiler_block':
      renderSpoilerBlock(node as SpoilerBlockNode, out, context);
      return;
    case 'section':
      renderSection(node as SectionNode, out, context);
      return;
    case 'code_block':
      out.push('<pre>', htmlEscape((node as CodeBlockNode).content), '</pre>');
      return;
    case 'raw_block_text':
      out.push(htmlEscape((node as RawBlockTextNode).content));
      return;
    case 'literal_html': {
      const lit = node as LiteralHtmlNode;
      out.push(lit.prefix);
      renderNodes(lit.children, out, context);
      return;
    }
    case 'table':
      out.push('<table class="striped">');
      renderNodes((node as TableNode).children, out, context);
      out.push('</table>');
      return;
    case 'ltable':
      renderLTable(node as LTableNode, out, context);
      return;
    case 'table_head':
      out.push('<thead>');
      renderNodes((node as TableHeadNode).rows, out, context);
      out.push('</thead>');
      return;
    case 'table_body':
      out.push('<tbody>');
      renderNodes((node as TableBodyNode).rows, out, context);
      out.push('</tbody>');
      return;
    case 'table_row':
      out.push('<tr>');
      renderNodes((node as TableRowNode).cells, out, context);
      out.push('</tr>');
      return;
    case 'table_cell': {
      const cell = node as TableCellNode;
      out.push('<', cell.cellType, '>');
      renderNodes(cell.children, out, context);
      out.push('</', cell.cellType, '>');
      return;
    }
    case 'list':
      renderList(node as ListNode, out, context);
      return;
    case 'list_item':
      out.push('<li>');
      renderNodes((node as ListItemNode).children, out, context);
      out.push('</li>');
      return;

    // Inline nodes
    case 'text':
      out.push(htmlEscape((node as TextNode).content));
      return;
    case 'bold':
      out.push('<strong>');
      renderNodes((node as BoldNode).children, out, context);
      out.push('</strong>');
      return;
    case 'italic':
      out.push('<em>');
      renderNodes((node as ItalicNode).children, out, context);
      out.push('</em>');
      return;
    case 'strikeout':
      out.push('<s>');
      renderNodes((node as StrikeoutNode).children, out, context);
      out.push('</s>');
      return;
    case 'underline':
      out.push('<u>');
      renderNodes((node as UnderlineNode).children, out, context);
      out.push('</u>');
      return;
    case 'superscript':
      out.push('<sup>');
      renderNodes((node as SuperscriptNode).children, out, context);
      out.push('</sup>');
      return;
    case 'subscript':
      out.push('<sub>');
      renderNodes((node as SubscriptNode).children, out, context);
      out.push('</sub>');
      return;
    case 'inline_spoiler':
      out.push('<span class="spoiler">');
      renderNodes((node as InlineSpoilerNode).children, out, context);
      out.push('</span>');
      return;
    case 'inline_code':
      out.push(
        '<span class="inline-code">',
        htmlEscape((node as InlineCodeNode).content),
        '</span>',
      );
      return;
    case 'color':
      renderColor(node as ColorNode, out, context);
      return;
    case 'line_break':
      out.push('<br>');
      return;
    case 'fragment':
      renderNodes((node as FragmentNode).children, out, context);
      return;
    case 'link':
      renderLink(node as LinkNode, out, context);
      return;
    case 'internal_anchor':
      out.push(
        '<a id="',
        uriEscape((node as InternalAnchorNode).name.toLowerCase()),
        '"></a>',
      );
      return;

    default:
      console.warn(`Unknown node type: ${node.type}`);
      return;
  }
}

// Walk an array of AST nodes in order, pushing each one's HTML fragments
// into the shared `out` buffer. Used by every container arm (anything with
// `.children`, plus the table arms with `.rows`); the field name is an
// implementation detail, the contract is just "render each element."
function renderNodes(
  nodes: readonly ASTNode[],
  out: string[],
  context: RenderContext,
): void {
  for (const node of nodes) renderNode(node, out, context);
}

function renderHeader(
  node: HeaderNode,
  out: string[],
  context: RenderContext,
): void {
  out.push('<h', String(node.level), '>');
  renderNodes(node.children, out, context);
  out.push('</h', String(node.level), '>');
}

function renderParagraph(
  node: ParagraphNode,
  out: string[],
  context: RenderContext,
): void {
  out.push('<p>');
  renderNodes(node.children, out, context);
  out.push('</p>');
}

function renderQuote(
  node: QuoteNode,
  out: string[],
  context: RenderContext,
): void {
  if (node.color) {
    if (TAG_CATEGORY_RE.test(node.color)) {
      // Tag-category quotes get a sidebar class with the color name as
      // typed; case is preserved (verified against the oracle).
      out.push('<blockquote class="dtext-sidebar-colored-', node.color, '">');
    } else {
      out.push(
        '<blockquote class="dtext-quote-color" style="border-left-color:',
        node.color,
        '">',
      );
    }
  } else {
    out.push('<blockquote>');
  }
  renderNodes(node.children, out, context);
  out.push('</blockquote>');
}

function renderSpoilerBlock(
  node: SpoilerBlockNode,
  out: string[],
  context: RenderContext,
): void {
  out.push('<div class="spoiler">');
  renderNodes(node.children, out, context);
  out.push('</div>');
}

function renderSection(
  node: SectionNode,
  out: string[],
  context: RenderContext,
): void {
  out.push(node.expanded ? '<details open><summary>' : '<details><summary>');
  if (node.title) out.push(htmlEscape(node.title));
  out.push('</summary><div>');
  renderNodes(node.children, out, context);
  out.push('</div></details>');
}

function renderLTable(
  node: LTableNode,
  out: string[],
  context: RenderContext,
): void {
  // Oracle quirks:
  //   * Zero rows -> emit a literal `[/tbody]` between the table tags
  //     (verified for `[ltable][/ltable]` and `[ltable]\n\n[/ltable]`).
  //   * Any rows -> always emit `<tbody></tbody>` after `<thead>`, even
  //     when there are no body rows beyond the single header.
  if (node.rows.length === 0) {
    out.push('<table class="striped">[/tbody]</table>');
    return;
  }
  out.push('<table class="striped"><thead>');
  renderNode(node.rows[0], out, context);
  out.push('</thead><tbody>');
  for (let i = 1; i < node.rows.length; i++) renderNode(node.rows[i], out, context);
  out.push('</tbody></table>');
}

function renderList(
  node: ListNode,
  out: string[],
  context: RenderContext,
): void {
  let prevDepth = 0;

  for (const item of node.items) {
    if (item.depth > prevDepth) {
      for (let i = prevDepth; i < item.depth; i++) out.push('<ul>');
    } else if (item.depth < prevDepth) {
      for (let i = item.depth; i < prevDepth; i++) out.push('</ul>');
    }
    renderNode(item, out, context);
    prevDepth = item.depth;
  }

  for (let i = 0; i < prevDepth; i++) out.push('</ul>');
}

function renderColor(
  node: ColorNode,
  out: string[],
  context: RenderContext,
): void {
  if (context.options.allowColor === false) {
    renderNodes(node.children, out, context);
    return;
  }

  if (TAG_CATEGORY_RE.test(node.color)) {
    // Preserve the original case of the color name in the class. Ruby's
    // dtext does not normalize the case here: `[color=Character]` becomes
    // `dtext-color-Character`, not `dtext-color-character`.
    out.push('<span class="dtext-color-', node.color, '">');
  } else {
    out.push('<span class="dtext-color" style="color:', node.color, '">');
  }
  renderNodes(node.children, out, context);
  out.push('</span>');
}

function renderLink(
  node: LinkNode,
  out: string[],
  context: RenderContext,
): void {
  if (node.idType === 'thumb' && context.options.maxThumbs !== undefined) {
    if (context.thumbCount >= context.options.maxThumbs) {
      out.push(
        '<span class="thumb-limit-exceeded">',
        htmlEscape(node.title || node.href),
        '</span>',
      );
      return;
    }
    context.thumbCount++;
  }

  // Ruby's dtext renderer omits rel="nofollow" on id_link anchors (post #N,
  // comment #N etc.) but adds it on every other link type.
  out.push(node.linkType === 'id_link' ? '<a class="' : '<a rel="nofollow" class="');
  appendLinkClasses(node, out);
  out.push('"');

  if (node.idType === 'thumb' && node.id) {
    out.push(' data-id="', htmlEscape(node.id), '"');
  }

  let href = node.href;
  if (context.options.baseUrl && href.startsWith('/')) {
    href = context.options.baseUrl.replace(/\/$/, '') + href;
  }
  out.push(' href="', htmlEscape(href), '">');

  if (node.children) {
    renderNodes(node.children, out, context);
  } else if (node.title) {
    out.push(htmlEscape(node.title));
  } else {
    out.push(htmlEscape(node.href));
  }

  out.push('</a>');
}

function appendLinkClasses(node: LinkNode, out: string[]): void {
  out.push('dtext-link');

  switch (node.linkType) {
    case 'url':
      break;
    case 'textile':
      if (!node.href.startsWith('/')) out.push(' dtext-external-link');
      break;
    case 'wiki':
      out.push(' dtext-wiki-link');
      break;
    case 'post_search':
      out.push(' dtext-post-search-link');
      break;
    case 'id_link':
      out.push(' dtext-id-link');
      if (node.idType) {
        const extra = ID_TYPE_CLASSES[node.idType];
        if (extra) {
          for (const c of extra) {
            out.push(' ', c);
          }
        }
      }
      break;
  }
}

