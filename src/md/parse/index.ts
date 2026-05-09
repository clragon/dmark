// Markdown -> shared AST adapter. Wraps `markdown-it` with the strict
// flavour configured by `md-ast-mapping.md`. The token walk is the
// load-bearing part: every CommonMark token produced by `markdown-it` lowers
// either to a node type from `../../ast` or to a `Diagnostic`. The function
// never throws; rejected or unsupported constructs survive as literal text
// and surface through the diagnostics array so callers can decide policy.
//
// Coverage so far: paragraph + standard inline (text, line break, bold,
// underline, italic, strikethrough, inline code, link, autolink) + headers,
// blockquote, fenced and indented code blocks + lists (ordered demoted to
// unordered with a warning) + pipe tables + inline spoilers (`||...||`) +
// BBCode survivors (`[sup]`, `[sub]`, `[color=x]`) + magic links
// (`post #1234`, `pool #5`, etc.) + references (`[[wikilink]]`,
// `{{tag search}}`, `[#anchor]`). Everything else still routes to the
// `md.unsupported_*` fallback and lands in follow-up commits as each spec
// row is implemented.

import MarkdownIt from 'markdown-it';
// The `MarkdownIt.Token` namespace pattern only exists in the CJS variant
// of `@types/markdown-it`; the ESM `.d.mts` we resolve under `module:
// ESNext` does not re-export `Token` at the index. The submodule path is
// the only one that types under our ESM + `verbatimModuleSyntax` config.
// Revisit if `@types/markdown-it` ever ships a unified ESM namespace.
import type Token from 'markdown-it/lib/token.mjs';

import type {
  BlockNode,
  BoldNode,
  CodeBlockNode,
  ColorNode,
  DocumentNode,
  HeaderNode,
  InlineCodeNode,
  InlineNode,
  InlineSpoilerNode,
  ItalicNode,
  LineBreakNode,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  QuoteNode,
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

import {
  buildIdLink,
  buildPostSearchLink,
  buildWikiLink,
} from '../../ast/links';
import { bbcodePlugin } from './plugins/bbcode';
import { magicLinksPlugin } from './plugins/magic-links';
import { referencesPlugin } from './plugins/references';
import { spoilerPlugin } from './plugins/spoiler';

import type { IdType, InternalAnchorNode } from '../../ast';

export interface ParserOptions {
  // Reserved for future flags (e.g. `allowColor` parity with the dtext side).
  // Kept as an explicit type so the public contract has a stable shape from
  // day one even when no flags are present.
}

export interface Diagnostic {
  // Stable code, e.g. `md.legacy_bbcode`. See md-ast-mapping.md for the
  // catalog and severity assignments.
  code: string;
  severity: 'info' | 'warning' | 'fatal';
  message: string;
  // Optional source span. Line/column tracking lands when the adapter wires
  // up token position propagation; today most diagnostics omit this.
  range?: { start: number; end: number };
}

export interface ParseResult {
  document: DocumentNode;
  diagnostics: Diagnostic[];
}

// One shared instance; per-call mutable state lives only in the visitor we
// run after `md.parse`. Configuration matches md-ast-mapping.md:
//   - `html: false`    The HTML allowlist (`<details>`, `<summary>`) lands
//                      in a follow-up commit; until then any HTML tag emits
//                      `md.html_tag_rejected` and the source survives.
//   - `linkify: false` Bare-URL autolink lands with the URL/autolink commit.
//                      Explicit `<url>` autolinks still work via the standard
//                      autolink rule.
//   - `typographer: false`  Source bytes are not rewritten (no smart quotes
//                           or ascii dashes; round-trip stays faithful).
// `breaks` is left at the default; the AST emission treats both `softbreak`
// and `hardbreak` as `LineBreakNode` so every inline `\n` becomes a hard
// break in the AST regardless of how `markdown-it` would render it.
const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});
md.use(spoilerPlugin);
md.use(bbcodePlugin);
md.use(referencesPlugin);
md.use(magicLinksPlugin);

export function parseMarkdown(
  input: string,
  _options: ParserOptions = {},
): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const tokens = md.parse(input, {});
  const children = walkBlocks(tokens, diagnostics);
  return {
    document: { type: 'document', children },
    diagnostics,
  };
}

function walkBlocks(tokens: Token[], diagnostics: Diagnostic[]): BlockNode[] {
  return walkBlocksRange(tokens, 0, tokens.length, diagnostics);
}

function walkBlocksRange(
  tokens: Token[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
): BlockNode[] {
  const out: BlockNode[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    switch (tok.type) {
      case 'paragraph_open': {
        const close = findContainerClose(tokens, i);
        const inline = tokens[i + 1];
        const children =
          inline && inline.type === 'inline' && inline.children
            ? walkInline(inline.children, diagnostics)
            : [];
        const node: ParagraphNode = { type: 'paragraph', children };
        out.push(node);
        i = close;
        break;
      }
      case 'heading_open': {
        // `tag` is the html element name, e.g. `h3`; the digit is the level.
        // Setext-form headers (`===` / `---`) reach this case too with the
        // same tag, so an info diagnostic flags the round-trip will pick the
        // ATX form. Per md-ast-mapping.md only level 1..6 exist; markdown-it
        // never emits anything else, but the clamp is cheap insurance.
        const close = findContainerClose(tokens, i);
        const level = Math.min(6, Math.max(1, parseInt(tok.tag.slice(1), 10) || 1));
        const inline = tokens[i + 1];
        const children =
          inline && inline.type === 'inline' && inline.children
            ? walkInline(inline.children, diagnostics)
            : [];
        if (tok.markup === '=' || tok.markup === '-') {
          diagnostics.push({
            code: 'md.setext_header_normalized',
            severity: 'info',
            message: `Setext header (${tok.markup}) normalised to ATX form (level ${level}); round-trip will emit \`#\`-style.`,
          });
        }
        const node: HeaderNode = { type: 'header', level, children };
        out.push(node);
        i = close;
        break;
      }
      case 'blockquote_open': {
        // Markdown's `>` blockquote has no slot for the dtext `[quote=COLOR]`
        // colour, so the AST `color` field stays unset. Recursion runs the
        // standard block walker over the inner range so nested quotes,
        // headers, lists, etc. all just work.
        const close = findContainerClose(tokens, i);
        const children = walkBlocksRange(tokens, i + 1, close, diagnostics);
        const node: QuoteNode = { type: 'quote', children };
        out.push(node);
        i = close;
        break;
      }
      case 'fence': {
        // Triple-backtick form. `info` carries the optional language hint,
        // which the AST has no slot for; the spec calls this an explicit
        // (info-severity) loss so the caller knows the round-trip will drop
        // it. Trailing newline on `content` is markdown-it's convention.
        if (tok.info && tok.info.trim() !== '') {
          diagnostics.push({
            code: 'md.code_lang_dropped',
            severity: 'info',
            message: `Code block language hint \`${tok.info.trim()}\` dropped (AST has no slot for it).`,
          });
        }
        const node: CodeBlockNode = { type: 'code_block', content: tok.content };
        out.push(node);
        break;
      }
      case 'code_block': {
        // Indented (4-space) code block. No language hint is possible by
        // construction, so no diagnostic is needed.
        const node: CodeBlockNode = { type: 'code_block', content: tok.content };
        out.push(node);
        break;
      }
      case 'table_open': {
        // Pipe tables lower to `TableNode` (not `LTableNode`; the lightweight
        // form is dtext-only per spec). markdown-it splits the table into
        // `thead` and `tbody` regions with `tr` rows of `th`/`td` cells; the
        // walker mirrors that structure into the AST. Per-cell alignment from
        // the header separator (`:---:`) is dropped without a diagnostic; the
        // AST has no slot for it and the dtext side renders aligned cells the
        // same way regardless.
        const close = findContainerClose(tokens, i);
        const children = walkTableChildren(
          tokens,
          i + 1,
          close,
          diagnostics,
        );
        const node: TableNode = { type: 'table', children };
        out.push(node);
        i = close;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        // Both lower to a flat `ListNode` whose items are depth-tagged.
        // Ordered lists demote to unordered with a warning per spec Q5; the
        // `ListItemNode` AST has no `ordered` field today, and marker
        // numbers are not preserved (the markdown engine consumes them).
        if (tok.type === 'ordered_list_open') {
          emitOrderedDemoted(diagnostics);
        }
        const close = findContainerClose(tokens, i);
        const items: ListItemNode[] = [];
        collectListItems(tokens, i + 1, close, 1, items, diagnostics);
        const node: ListNode = { type: 'list', items };
        out.push(node);
        i = close;
        break;
      }
      case 'paragraph_close':
      case 'heading_close':
      case 'blockquote_close':
      case 'bullet_list_close':
      case 'ordered_list_close':
      case 'list_item_close':
      case 'table_close':
        // Consumed by their matching open above (defensive no-op).
        break;
      default:
        i = handleUnsupportedBlock(tokens, i, diagnostics);
    }
  }
  return out;
}

// Walk a flat inline token list (the `children` of an `inline` token).
// Containers like `**bold**` arrive as paired `strong_open` / `strong_close`
// markers in the same flat list with `text` tokens in between; the walker
// matches the close, recurses on the slice, and bridges past it.
function walkInline(
  tokens: Token[],
  diagnostics: Diagnostic[],
): InlineNode[] {
  return walkInlineRange(tokens, 0, tokens.length, diagnostics);
}

function walkInlineRange(
  tokens: Token[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
): InlineNode[] {
  const out: InlineNode[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    switch (tok.type) {
      case 'text':
        if (tok.content) {
          const node: TextNode = { type: 'text', content: tok.content };
          out.push(node);
        }
        break;
      case 'softbreak':
      case 'hardbreak': {
        // Both lower to LineBreakNode per md-ast-mapping.md Q6: every inline
        // `\n` is a hard break in the AST, matching the dtext side.
        const node: LineBreakNode = { type: 'line_break' };
        out.push(node);
        break;
      }
      case 'strong_open': {
        // markdown-it parses both `**` and `__` as `strong`. The two are
        // distinguished by `markup`: `**` is bold, `__` is underline (per
        // md-ast-mapping.md). Re-tagging at emission keeps the underlying
        // delimiter rule shared and avoids a custom inline-rule plugin.
        const close = findInlineClose(tokens, i, end, 'strong_close');
        const children = walkInlineRange(tokens, i + 1, close, diagnostics);
        if (tok.markup === '__') {
          const node: UnderlineNode = { type: 'underline', children };
          out.push(node);
        } else {
          const node: BoldNode = { type: 'bold', children };
          out.push(node);
        }
        i = close;
        break;
      }
      case 'em_open': {
        // Both `*x*` and `_x_` lower to italic. markdown.md does not forbid
        // the `_` form; the dtext side has no analogue (`[i]...[/i]` is the
        // single dtext spelling), so AST equivalence is preserved either way.
        const close = findInlineClose(tokens, i, end, 'em_close');
        const children = walkInlineRange(tokens, i + 1, close, diagnostics);
        const node: ItalicNode = { type: 'italic', children };
        out.push(node);
        i = close;
        break;
      }
      case 's_open': {
        const close = findInlineClose(tokens, i, end, 's_close');
        const children = walkInlineRange(tokens, i + 1, close, diagnostics);
        const node: StrikeoutNode = { type: 'strikeout', children };
        out.push(node);
        i = close;
        break;
      }
      case 'code_inline': {
        const node: InlineCodeNode = {
          type: 'inline_code',
          content: tok.content,
        };
        out.push(node);
        break;
      }
      case 'spoiler_open': {
        // Custom token from the spoiler plugin. Inner content is regular
        // inline tokens that already passed through the standard rules, so
        // emphasis / inline code inside the spoiler is parsed correctly.
        const close = findInlineClose(tokens, i, end, 'spoiler_close');
        const children = walkInlineRange(tokens, i + 1, close, diagnostics);
        const node: InlineSpoilerNode = { type: 'inline_spoiler', children };
        out.push(node);
        i = close;
        break;
      }
      case 'sup_open': {
        const close = findInlineClose(tokens, i, end, 'sup_close');
        const children = walkInlineRange(tokens, i + 1, close, diagnostics);
        const node: SuperscriptNode = { type: 'superscript', children };
        out.push(node);
        i = close;
        break;
      }
      case 'sub_open': {
        const close = findInlineClose(tokens, i, end, 'sub_close');
        const children = walkInlineRange(tokens, i + 1, close, diagnostics);
        const node: SubscriptNode = { type: 'subscript', children };
        out.push(node);
        i = close;
        break;
      }
      case 'id_link': {
        // Atomic token from the magic-links core post-process. The plugin
        // pre-resolved the type and id; the AST `LinkNode` is built via
        // the shared `buildIdLink` helper so href / display text exactly
        // match the dtext side's emission.
        const idType = tok.attrGet('idType') as IdType | null;
        const id = tok.attrGet('id') ?? '';
        if (idType) {
          out.push(buildIdLink(idType, id));
        }
        break;
      }
      case 'wikilink': {
        // Atomic token from the references plugin. Pieces are pre-parsed
        // (tag / title / anchor); shape via shared `buildWikiLink` so href
        // normalisation exactly matches the dtext side.
        const tag = tok.attrGet('tag') ?? '';
        const titleAttr = tok.attrGet('title');
        const anchorAttr = tok.attrGet('anchor');
        out.push(
          buildWikiLink({
            tag,
            ...(titleAttr !== null ? { title: titleAttr } : {}),
            ...(anchorAttr !== null ? { anchor: anchorAttr } : {}),
          }),
        );
        break;
      }
      case 'tag_search': {
        const tag = tok.attrGet('tag') ?? '';
        const titleAttr = tok.attrGet('title');
        out.push(
          buildPostSearchLink({
            tag,
            ...(titleAttr !== null ? { title: titleAttr } : {}),
          }),
        );
        break;
      }
      case 'internal_anchor_def': {
        const node: InternalAnchorNode = {
          type: 'internal_anchor',
          name: tok.attrGet('name') ?? '',
        };
        out.push(node);
        break;
      }
      case 'color_open': {
        // Color value carried on the open token's `color` attr (set by the
        // BBCode plugin). The dtext side blanks the field when its
        // `allowColor` parser option is off; the markdown side preserves
        // the value as typed today and will gain the same option when
        // `ParserOptions` grows the slot.
        const close = findInlineClose(tokens, i, end, 'color_close');
        const children = walkInlineRange(tokens, i + 1, close, diagnostics);
        const color = tok.attrGet('color') ?? '';
        const node: ColorNode = { type: 'color', color, children };
        out.push(node);
        i = close;
        break;
      }
      case 'link_open': {
        // markdown-it's autolink rule sets `markup === 'autolink'` for
        // `<url>` and email autolinks; inline links `[text](url)` set it
        // to `''`. Spec: autolinks become `linkType: 'url'` with the href
        // as the only TextNode child; inline links become `linkType:
        // 'textile'` with the parsed text content as children. Reusing
        // `'textile'` is a captain-locked decision (see Naming-debt note in
        // md-ast-mapping.md).
        const close = findInlineClose(tokens, i, end, 'link_close');
        const href = tok.attrGet('href') ?? '';
        const isAutolink = tok.markup === 'autolink';
        if (isAutolink) {
          const node: LinkNode = {
            type: 'link',
            linkType: 'url',
            href,
            children: [{ type: 'text', content: href }],
          };
          out.push(node);
        } else {
          const children = walkInlineRange(tokens, i + 1, close, diagnostics);
          const node: LinkNode = {
            type: 'link',
            linkType: 'textile',
            href,
            children,
          };
          out.push(node);
        }
        i = close;
        break;
      }
      case 'strong_close':
      case 'em_close':
      case 's_close':
      case 'link_close':
      case 'spoiler_close':
      case 'sup_close':
      case 'sub_close':
      case 'color_close':
        // Closes are bridged by their matching open; reaching one here means
        // the open scan failed (defensive no-op).
        break;
      default:
        diagnostics.push({
          code: 'md.unsupported_inline',
          severity: 'fatal',
          message: `Unsupported inline token \`${tok.type}\`: scaffold does not yet implement this construct; the offending span is dropped. See md-ast-mapping.md.`,
        });
    }
  }
  return out;
}

// Bridge an unsupported block-level open to its matching close, emit one
// diagnostic for the whole region (rather than one per inner token), and
// return the index of the close so the caller's loop resumes after it.
// Standalone blocks (nesting === 0) emit one diagnostic and the caller
// advances by one as usual.
function handleUnsupportedBlock(
  tokens: Token[],
  i: number,
  diagnostics: Diagnostic[],
): number {
  const tok = tokens[i]!;
  diagnostics.push({
    code: 'md.unsupported_block',
    severity: 'fatal',
    message: `Unsupported block token \`${tok.type}\`: scaffold does not yet implement this construct; the offending span is dropped. See md-ast-mapping.md.`,
  });
  if (tok.nesting === 1) return findContainerClose(tokens, i);
  return i;
}

// Forward-scan for the matching close of a `markdown-it` container token.
// Tracks nesting depth so nested containers of the same kind do not confuse
// the scan. Falls back to the last token if no close is found (defensive;
// `markdown-it` always pairs opens and closes for valid input).
//
// Pre-condition: `openIdx` points to a container open (`nesting === 1`).
// Calling with a non-container token returns wrong indices silently.
function findContainerClose(tokens: Token[], openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.nesting === 1) depth++;
    else if (t.nesting === -1) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return tokens.length - 1;
}

// Forward-scan for the matching close of an inline-level open. Inline
// emphasis runs of the same kind can nest (e.g. `**a *b* a**`), so the scan
// counts only opens / closes of the SAME pair-kind to find the right close.
// Bounded by `end` so the search stays inside the surrounding range when
// recursion narrows it.
function findInlineClose(
  tokens: Token[],
  openIdx: number,
  end: number,
  closeType: string,
): number {
  const openType = tokens[openIdx]!.type;
  let depth = 0;
  for (let j = openIdx; j < end; j++) {
    const t = tokens[j]!.type;
    if (t === openType) depth++;
    else if (t === closeType) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return end - 1;
}

// Flatten a list (top-level or nested) into depth-tagged `ListItemNode`
// siblings. `depth` is 1 for the outermost list and increases with every
// nested list encountered. The two-phase walk (item inline first, then
// nested-list recursion) preserves document order: an item appears before
// any of its descendant items in the resulting array.
function collectListItems(
  tokens: Token[],
  start: number,
  end: number,
  depth: number,
  items: ListItemNode[],
  diagnostics: Diagnostic[],
): void {
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    if (tok.type !== 'list_item_open') continue;
    const itemClose = findContainerClose(tokens, i);
    const children = collectInlineFromItem(
      tokens,
      i + 1,
      itemClose,
      diagnostics,
    );
    items.push({ type: 'list_item', depth, children });
    walkNestedListsInItem(
      tokens,
      i + 1,
      itemClose,
      depth + 1,
      items,
      diagnostics,
    );
    i = itemClose;
  }
}

// Phase 1: gather all inline content that belongs to a single list item.
// Multiple paragraphs inside one item (loose lists) are joined with a
// `LineBreakNode` separator. Nested lists are skipped here; they get their
// own pass below.
function collectInlineFromItem(
  tokens: Token[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
): InlineNode[] {
  const out: InlineNode[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    if (tok.type === 'paragraph_open') {
      const close = findContainerClose(tokens, i);
      const inlineTok = tokens[i + 1];
      if (inlineTok && inlineTok.type === 'inline' && inlineTok.children) {
        const parsed = walkInline(inlineTok.children, diagnostics);
        if (out.length > 0) {
          out.push({ type: 'line_break' });
        }
        out.push(...parsed);
      }
      i = close;
    } else if (
      tok.type === 'bullet_list_open' ||
      tok.type === 'ordered_list_open'
    ) {
      i = findContainerClose(tokens, i);
    }
  }
  return out;
}

// Phase 2: emit depth-tagged items for any list nested inside the current
// item. Each nested list is itself flattened by `collectListItems`, which
// recurses through this same pair if it finds further nesting.
function walkNestedListsInItem(
  tokens: Token[],
  start: number,
  end: number,
  depth: number,
  items: ListItemNode[],
  diagnostics: Diagnostic[],
): void {
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    if (
      tok.type === 'bullet_list_open' ||
      tok.type === 'ordered_list_open'
    ) {
      if (tok.type === 'ordered_list_open') {
        emitOrderedDemoted(diagnostics);
      }
      const close = findContainerClose(tokens, i);
      collectListItems(tokens, i + 1, close, depth, items, diagnostics);
      i = close;
    }
  }
}

function emitOrderedDemoted(diagnostics: Diagnostic[]): void {
  diagnostics.push({
    code: 'md.ordered_list_demoted',
    severity: 'warning',
    message:
      'Ordered list demoted to unordered: the AST has no ordered/unordered slot today and marker numbers are not preserved.',
  });
}

// Walk the `thead` / `tbody` regions of a table. The AST shape allows bare
// `TableRowNode`s alongside the head/body wrappers, but markdown-it always
// emits both wrappers around at least one row, so the bare-row branch is
// not reached in practice (the union slot stays available for future
// dtext-side parsers that may emit it).
function walkTableChildren(
  tokens: Token[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
): (TableHeadNode | TableBodyNode | TableRowNode)[] {
  const out: (TableHeadNode | TableBodyNode | TableRowNode)[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    if (tok.type === 'thead_open') {
      const close = findContainerClose(tokens, i);
      const rows = walkTableRows(tokens, i + 1, close, diagnostics);
      out.push({ type: 'table_head', rows });
      i = close;
    } else if (tok.type === 'tbody_open') {
      const close = findContainerClose(tokens, i);
      const rows = walkTableRows(tokens, i + 1, close, diagnostics);
      out.push({ type: 'table_body', rows });
      i = close;
    }
  }
  return out;
}

function walkTableRows(
  tokens: Token[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
): TableRowNode[] {
  const out: TableRowNode[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    if (tok.type === 'tr_open') {
      const close = findContainerClose(tokens, i);
      const cells = walkTableCells(tokens, i + 1, close, diagnostics);
      out.push({ type: 'table_row', cells });
      i = close;
    }
  }
  return out;
}

function walkTableCells(
  tokens: Token[],
  start: number,
  end: number,
  diagnostics: Diagnostic[],
): TableCellNode[] {
  const out: TableCellNode[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i]!;
    if (tok.type === 'th_open' || tok.type === 'td_open') {
      const close = findContainerClose(tokens, i);
      const cellType = tok.type === 'th_open' ? 'th' : 'td';
      const inlineTok = tokens[i + 1];
      const children =
        inlineTok && inlineTok.type === 'inline' && inlineTok.children
          ? walkInline(inlineTok.children, diagnostics)
          : [];
      out.push({ type: 'table_cell', cellType, children });
      i = close;
    }
  }
  return out;
}
