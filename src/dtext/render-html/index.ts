import type {
  ASTNode,
  BlockNode,
  ColorNode,
  DocumentNode,
  IdType,
  InlineNode,
  LTableNode,
  LinkNode,
  ListItemNode,
  ListNode,
  QuoteNode,
  SectionNode,
  TablePartNode,
} from '../../ast';

export interface DTextRenderOptions {
  allowColor?: boolean;
  maxThumbs?: number;
  baseUrl?: string;
}

// Every node type the renderer dispatches over. The handler table is keyed off
// this union, so a missing handler is a compile error.
type RenderableNode =
  | DocumentNode
  | BlockNode
  | InlineNode
  | TablePartNode
  | ListItemNode;

type NodeByType = {
  [K in RenderableNode['type']]: Extract<RenderableNode, { type: K }>;
};

// Render state threaded through every handler. `render`/`renderAll` recurse
// through the active handler table; handlers push fragments into the `out`
// buffer they are given.
export interface HtmlRenderContext {
  readonly options: DTextRenderOptions;
  thumbCount: number;
  render(node: ASTNode, out: string[]): void;
  renderAll(nodes: readonly ASTNode[], out: string[]): void;
}

// Renders one node type; `node` is narrowed to its concrete interface.
export type HtmlHandler<K extends keyof NodeByType> = (
  node: NodeByType[K],
  out: string[],
  ctx: HtmlRenderContext,
) => void;

// The dispatch table: one handler per node type, exhaustive over the union.
export type HtmlHandlers = { [K in keyof NodeByType]: HtmlHandler<K> };

// The handler table extended with a consumer's own node types. Each member of
// `Extra` gets a precisely-typed handler; the built-in handlers stay available
// for fallback via spread (`{ ...htmlHandlers, my_node: ... }`).
export type HtmlHandlersFor<Extra extends ASTNode = never> = HtmlHandlers & {
  [K in Extra['type']]: (
    node: Extract<Extra, { type: K }>,
    out: string[],
    ctx: HtmlRenderContext,
  ) => void;
};

// Tag-category aliases that get a class-name treatment instead of an inline
// style. Both `renderQuote` and `renderColor` dispatch on this set: a
// category match emits a `dtext-sidebar-colored-*` or `dtext-color-*` class
// with the original case preserved, otherwise the inline-style path runs.
// Lockstep: the parser keeps the same alternation under `QUOTE_CATEGORY_RE`
// (used by `isValidQuoteColor`) as the upstream gate; both literals must
// agree until the ID-metadata consolidation collapses them.
const TAG_CATEGORY_RE =
  /^(gen(eral)?|art(ist)?|cont(ributor)?|char(acter)?|copy(right)?|spec(ies)?|inv(alid)?|meta|lor(e)?)$/i;

// Class names for `id_link` anchors keyed by the parser-emitted `idType`.
// Multi-class entries (only `thumb`) carry the full ordered list, so the
// consumer is one indexed lookup and one push. Lockstep with `ID_PATTERNS`
// in `parse/index.ts`: every `idType` the parser produces must have an entry
// here, or the rendered link silently loses its type-specific class. A thumb
// over `maxThumbs` is rewritten by the parser to `idType: 'post'`, so the
// over-limit case picks up `dtext-post-id-link` alone (no
// `thumb-placeholder-link`) without any special path here.
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

// Single-pass HTML escape with a no-alloc fast path. The probe regex first
// tests whether any escape is needed; clean strings (the common case for
// plain prose text nodes) return as-is. When an escape is needed, one regex
// walk plus a small lookup yields the result in a single allocation.
const HTML_ESCAPE_RE = /[&<>"]/;
const HTML_ESCAPE_RE_G = /[&<>"]/g;
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
export function htmlEscape(str: string): string {
  if (!HTML_ESCAPE_RE.test(str)) return str;
  return str.replace(HTML_ESCAPE_RE_G, (c) => HTML_ESCAPES[c]);
}

// Single-pass URI percent-escape with a no-alloc fast path. Mirrors
// `htmlEscape`: a cheap probe regex decides whether any char needs escaping;
// clean strings (e.g. plain ASCII anchor names like `rangesyntax`) skip both
// the regex walk and the per-char `+=` chain. `whitelist` exempts one extra
// char from escaping and runs through the slow path so the probe stays
// correct regardless of its value.
const URI_NEEDS_ESCAPE_RE = /[^a-zA-Z0-9\-_.~]/;
const URI_NEEDS_ESCAPE_RE_G = /[^a-zA-Z0-9\-_.~]/g;

export function uriEscape(str: string, whitelist = ''): string {
  if (!URI_NEEDS_ESCAPE_RE.test(str)) return str;
  return str.replace(URI_NEEDS_ESCAPE_RE_G, (c) => {
    if (c === whitelist) return c;
    return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  });
}

function renderQuote(
  node: QuoteNode,
  out: string[],
  ctx: HtmlRenderContext,
): void {
  if (node.color) {
    if (TAG_CATEGORY_RE.test(node.color)) {
      // Tag-category quotes get a sidebar class with the color name as
      // typed; case is preserved (oracle-verified).
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
  ctx.renderAll(node.children, out);
  out.push('</blockquote>');
}

function renderSection(
  node: SectionNode,
  out: string[],
  ctx: HtmlRenderContext,
): void {
  out.push(node.expanded ? '<details open><summary>' : '<details><summary>');
  if (node.title) out.push(htmlEscape(node.title));
  out.push('</summary><div>');
  ctx.renderAll(node.children, out);
  out.push('</div></details>');
}

function renderLTable(
  node: LTableNode,
  out: string[],
  ctx: HtmlRenderContext,
): void {
  // Empty `[ltable]` is an oracle quirk: ruby's `preprocess_for_tables`
  // wraps zero rows in `[table][/tbody][/table]` so the unmatched
  // `[/tbody]` reaches the output as literal text. We emit it directly so
  // the body-parse step can stay lean.
  if (node.children.length === 0) {
    out.push('<table class="striped">[/tbody]</table>');
    return;
  }
  out.push('<table class="striped">');
  ctx.renderAll(node.children, out);
  out.push('</table>');
}

function renderList(
  node: ListNode,
  out: string[],
  ctx: HtmlRenderContext,
): void {
  let prevDepth = 0;

  for (const item of node.items) {
    if (item.depth > prevDepth) {
      for (let i = prevDepth; i < item.depth; i++) out.push('<ul>');
    } else if (item.depth < prevDepth) {
      for (let i = item.depth; i < prevDepth; i++) out.push('</ul>');
    }
    ctx.render(item, out);
    prevDepth = item.depth;
  }

  for (let i = 0; i < prevDepth; i++) out.push('</ul>');
}

function renderColor(
  node: ColorNode,
  out: string[],
  ctx: HtmlRenderContext,
): void {
  if (ctx.options.allowColor === false) {
    ctx.renderAll(node.children, out);
    return;
  }

  if (TAG_CATEGORY_RE.test(node.color)) {
    // Preserve original case in the class name. Ruby's dtext does not
    // normalize case here: `[color=Character]` becomes `dtext-color-Character`,
    // not `dtext-color-character`.
    out.push('<span class="dtext-color-', node.color, '">');
  } else {
    out.push('<span class="dtext-color" style="color:', node.color, '">');
  }
  ctx.renderAll(node.children, out);
  out.push('</span>');
}

function renderLink(
  node: LinkNode,
  out: string[],
  ctx: HtmlRenderContext,
): void {
  if (node.idType === 'thumb' && ctx.options.maxThumbs !== undefined) {
    if (ctx.thumbCount >= ctx.options.maxThumbs) {
      out.push(
        '<span class="thumb-limit-exceeded">',
        htmlEscape(node.title || node.href),
        '</span>',
      );
      return;
    }
    ctx.thumbCount++;
  }

  // Ruby's dtext renderer omits rel="nofollow" on id_link anchors (post #N,
  // comment #N, etc.) but adds it on every other link type.
  out.push(
    node.linkType === 'id_link' ? '<a class="' : '<a rel="nofollow" class="',
  );
  appendLinkClasses(node, out);
  out.push('"');

  if (node.idType === 'thumb' && node.id) {
    out.push(' data-id="', htmlEscape(node.id), '"');
  }

  let href = node.href;
  if (ctx.options.baseUrl && href.startsWith('/')) {
    href = ctx.options.baseUrl.replace(/\/$/, '') + href;
  }
  out.push(' href="', htmlEscape(href), '">');

  if (node.children) {
    ctx.renderAll(node.children, out);
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
    case 'inline':
      if (!node.href.startsWith('/') && !node.href.startsWith('#'))
        out.push(' dtext-external-link');
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

// Default handler table. Override or extend by spreading:
// `{ ...htmlHandlers, link: myLink }`; children render through `ctx.render`, so
// an override applies wherever its node appears, at any depth.
export const htmlHandlers: HtmlHandlers = {
  document: (node, out, ctx) => ctx.renderAll(node.children, out),

  // Block nodes
  header: (node, out, ctx) => {
    out.push('<h', String(node.level), '>');
    ctx.renderAll(node.children, out);
    out.push('</h', String(node.level), '>');
  },
  paragraph: (node, out, ctx) => {
    out.push('<p>');
    ctx.renderAll(node.children, out);
    out.push('</p>');
  },
  quote: renderQuote,
  spoiler_block: (node, out, ctx) => {
    out.push('<div class="spoiler">');
    ctx.renderAll(node.children, out);
    out.push('</div>');
  },
  section: renderSection,
  code_block: (node, out) =>
    out.push('<pre>', htmlEscape(node.content), '</pre>'),
  raw_block_text: (node, out) => out.push(htmlEscape(node.content)),
  literal_html: (node, out, ctx) => {
    out.push(node.prefix);
    ctx.renderAll(node.children, out);
  },
  table: (node, out, ctx) => {
    out.push('<table class="striped">');
    ctx.renderAll(node.children, out);
    out.push('</table>');
  },
  ltable: renderLTable,
  table_head: (node, out, ctx) => {
    out.push('<thead>');
    ctx.renderAll(node.rows, out);
    out.push('</thead>');
  },
  table_body: (node, out, ctx) => {
    out.push('<tbody>');
    ctx.renderAll(node.rows, out);
    out.push('</tbody>');
  },
  table_row: (node, out, ctx) => {
    out.push('<tr>');
    ctx.renderAll(node.cells, out);
    out.push('</tr>');
  },
  table_cell: (node, out, ctx) => {
    out.push('<', node.cellType, '>');
    ctx.renderAll(node.children, out);
    out.push('</', node.cellType, '>');
  },
  table_literal: (node, out) => out.push(node.content),
  list: renderList,
  list_item: (node, out, ctx) => {
    out.push('<li>');
    ctx.renderAll(node.children, out);
    out.push('</li>');
  },

  // Inline nodes
  text: (node, out) => out.push(htmlEscape(node.content)),
  bold: (node, out, ctx) => {
    out.push('<strong>');
    ctx.renderAll(node.children, out);
    out.push('</strong>');
  },
  italic: (node, out, ctx) => {
    out.push('<em>');
    ctx.renderAll(node.children, out);
    out.push('</em>');
  },
  strikeout: (node, out, ctx) => {
    out.push('<s>');
    ctx.renderAll(node.children, out);
    out.push('</s>');
  },
  underline: (node, out, ctx) => {
    out.push('<u>');
    ctx.renderAll(node.children, out);
    out.push('</u>');
  },
  superscript: (node, out, ctx) => {
    out.push('<sup>');
    ctx.renderAll(node.children, out);
    out.push('</sup>');
  },
  subscript: (node, out, ctx) => {
    out.push('<sub>');
    ctx.renderAll(node.children, out);
    out.push('</sub>');
  },
  inline_spoiler: (node, out, ctx) => {
    out.push('<span class="spoiler">');
    ctx.renderAll(node.children, out);
    out.push('</span>');
  },
  inline_code: (node, out) =>
    out.push('<span class="inline-code">', htmlEscape(node.content), '</span>'),
  color: renderColor,
  line_break: (_node, out) => out.push('<br>'),
  fragment: (node, out, ctx) => ctx.renderAll(node.children, out),
  link: renderLink,
  internal_anchor: (node, out) =>
    out.push('<a id="', uriEscape(node.name.toLowerCase()), '"></a>'),
};

// Renders `node` to HTML through the handler table. The `node.type` lookup is
// the one untyped seam: the table is heterogeneous and the key is a runtime
// string.
export function renderHtml<Extra extends ASTNode = never>(
  node: ASTNode,
  options: DTextRenderOptions = {},
  handlers: HtmlHandlersFor<Extra> = htmlHandlers as HtmlHandlersFor<Extra>,
): string {
  const out: string[] = [];
  const ctx: HtmlRenderContext = {
    options,
    thumbCount: 0,
    render(n: ASTNode, o: string[]): void {
      const handler = handlers[n.type as keyof HtmlHandlersFor<Extra>] as
        | ((node: ASTNode, out: string[], ctx: HtmlRenderContext) => void)
        | undefined;
      if (handler) handler(n, o, ctx);
      else console.warn(`Unknown node type: ${n.type}`);
    },
    renderAll(nodes: readonly ASTNode[], o: string[]): void {
      for (const n of nodes) ctx.render(n, o);
    },
  };
  ctx.render(node, out);
  return out.join('');
}

export function renderToHTML(
  node: ASTNode,
  options: DTextRenderOptions = {},
): string {
  return renderHtml(node, options);
}
