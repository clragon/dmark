import type {
  BlockNode,
  CodeBlockNode,
  ColorNode,
  DocumentNode,
  FragmentNode,
  HeaderNode,
  IdType,
  InlineNode,
  LinkNode,
  ListItemNode,
  ListNode,
  LiteralHtmlNode,
  LTableNode,
  ParagraphNode,
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
import {
  buildIdLink,
  buildPostSearchLink,
  buildWikiLink,
  ID_PATTERNS,
  ID_TYPE_MAP,
  type WikiLinkInput,
} from '../../ast/links';
import { asciiLowercase, rubyUriEscape } from '../../ast/text';
import { isBoundaryChar } from '../url';

interface ParserOptions {
  allowColor?: boolean;
  maxThumbs?: number;
  baseUrl?: string;
  inlineOnly?: boolean;
}

interface UrlMatch {
  url: string;
}

interface IdMatch {
  type: IdType;
  id: string;
  text: string;
}

interface PostSearchMatch {
  tag: string;
  title?: string;
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

// ASCII letter test (A-Z, a-z): replaces `/[a-z]/i.test(char)` in hot paths.
function isAsciiAlpha(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

// ASCII alphanumeric test: replaces `/[a-z0-9]/i.test(char)` in hot paths.
function isAsciiAlphaNumeric(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

// Horizontal whitespace excluding line terminators. Same set that
// peekDoubleNewline uses to skip indentation between two newlines.
function isHorizontalWhitespace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

// `BOUNDARY_CHARS` and `isBoundaryChar` live in `../url` so the formatter can
// import the same data; the lockstep comment there names the cross-module
// contract.

// Quote-color validity (verified against the oracle):
//   * #hex of exactly 3 or 6 hex digits, mixed case allowed
//   * lowercase color word (^[a-z]+$), covers common css names like yellow
//   * one of the tag-category aliases used elsewhere by ruby's dtext
//     renderer; case insensitive on the match, but the original case is
//     preserved in the rendered class name.
const QUOTE_CATEGORY_RE =
  /^(gen(eral)?|art(ist)?|contributor|char(acter)?|copy(right)?|spec(ies)?|inv(alid)?|meta|lore)$/i;

function isValidQuoteColor(value: string): boolean {
  if (QUOTE_CATEGORY_RE.test(value)) return true;
  // Oracle accepts 3 to 6 hex digits inclusive after `#`. Anything outside
  // that range is literal text (`#abcdefab` and `#1234567` both fail).
  if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return true;
  if (/^[a-z]+$/.test(value)) return true;
  return false;
}

// Strip a single trailing boundary character from a URL. Ruby's dtext only
// peels one trailing punctuation off a url, regardless of paren balance:
//
//   https://x/a)        -> href "https://x/a", trailing ")"
//   https://x/a).       -> href "https://x/a)", trailing "."  (kept the paren!)
//   https://x/a)),      -> href "https://x/a))", trailing ","
//   https://x/path...   -> href "https://x/path..", trailing "."
//
// Verified against the oracle.
function trimUrlBoundaries(url: string): string {
  if (url.length === 0) return url;
  if (isBoundaryChar(url.charCodeAt(url.length - 1))) {
    return url.slice(0, -1);
  }
  return url;
}

// Append an inline node to a child list, merging into the previous text node
// when both are text. Inline collection points emit text nodes one parse step
// at a time, and the AST keeps adjacent text runs as a single TextNode (the
// renderer would otherwise emit them as separate tokens). Used at every spot
// in the parser that builds an inline child list directly from
// `parseInlineElement` results.
function pushInlineMergingText(children: InlineNode[], node: InlineNode): void {
  if (node.type === 'text' && children.length > 0) {
    const last = children[children.length - 1];
    if (last.type === 'text') {
      (last as TextNode).content += (node as TextNode).content;
      return;
    }
  }
  children.push(node);
}

// Drop trailing line-break nodes from an inline child list. Used at every
// inline-collection close (paragraph end, container close, table cell end)
// to avoid emitting a `<br>` immediately before the surrounding element's
// own closing tag, mirroring ruby's behavior.
function trimTrailingLineBreaks(children: InlineNode[]): void {
  while (
    children.length > 0 &&
    children[children.length - 1].type === 'line_break'
  ) {
    children.pop();
  }
}

// Parse a string of inline content in a fully isolated parser context. Used
// for textile link titles, which sit syntactically inside the outer document
// but semantically belong to their own world: a `[/quote]` typed into a
// textile title is literal text, not a scope-killer; thumbs in a textile
// title get their own budget rather than counting against the document
// total. The fresh parser instance reflects that isolation.
//
// Compare `parseInlineText` (method on the class), which does the opposite:
// it shares the surrounding parser's depth counters and thumb count so list
// item / ltable cell content stays aware of its outer block context.
//
// Falls back to a single text node if parsing yields nothing useful.
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

// Ruby's dtext only accepts a textile-style "title":url link when the url
// looks like an absolute path or an http(s) URL. Bare hostnames like
// `example.com/foo` or relative paths like `users/123` are left as literal
// text. Verified against the oracle.
function isAcceptedTextileUrl(url: string): boolean {
  if (url.length === 0) return false;
  if (url[0] === '/') return true;
  return /^https?:\/\//i.test(url);
}

// Sticky-flag (`/y`) variants of the regexes the parser anchors at `this.pos`.
// Sticky regexes match starting exactly at `lastIndex`, so a leading `^` is
// implicit and `this.input.slice(this.pos)` allocations vanish. Patterns are
// hoisted to module scope so they compile once for the whole process instead
// of per call site.
const RE_STRAY_SPOILER_CLOSE = /\[\/spoilers?\]/iy;
const RE_STRAY_CODE_TABLE_CLOSE = /\[\/(code|table)\]/iy;
const RE_QUOTE_COLOR_OPEN = /\[quote=([^\]\n]*)\]/iy;
const RE_HEADER = /h([123456])\.\s*/iy;
const RE_LIST_ITEM = /(\*+)[ \t]+([^\r\n]+)/y;
const RE_INTERNAL_ANCHOR = /\[#([a-zA-Z0-9_-]+)\]/y;
const RE_POST_SEARCH = /\{\{([^}]*)\}\}/y;
const RE_WIKI_LINK = /\[\[([^\]]*)\]\]/y;
const RE_TEXTILE_BRACKETED = /"([^"]+)":\[([^\]]+)\]/y;
const RE_TEXTILE_BASIC = /"([^"]+)":(\S+)/y;
const RE_URL = /https?:\/\/\S+/iy;
const RE_DELIMITED_URL = /<(https?:\/\/[^>]+)>/iy;
const RE_COLOR_OPEN = /\[color=([^\]]+)\]/iy;
const RE_SECTION_EXPANDED_TITLE = /\[section,expanded=([^\]]+)\]/iy;
const RE_SECTION_TITLE = /\[section=([^\]]+)\]/iy;
const RE_SPOILER_BLOCK = /\[(spoilers?)\]([\s\S]*?)\[\/\1\]/iy;
// Peek-only variant: matches `[spoiler]...[/spoiler...]` with the close form
// independent of the open form (used by peekBlockElement, which only cares
// whether *some* close exists, matching the prior `(.*?)\[\/spoilers?\]` rule).
const RE_SPOILER_BLOCK_LOOSE = /\[spoilers?\]([\s\S]*?)\[\/spoilers?\]/iy;
const RE_SPOILER_OPEN = /\[spoilers?\]/iy;
const RE_QUOTE_CLOSE = /\[\/quote\]/iy;
const RE_SECTION_CLOSE = /\[\/section\]/iy;
const RE_TEXTILE_TITLE = /"[^"]+":/y;

// Block-context patterns shared by `peekBlockElement`. Hoisted so the array
// isn't rebuilt and the regexes aren't recompiled on every paragraph step.
//
// The `[section...]` pattern is intentionally restrictive: it matches only the
// four forms `matchSection` will commit to (`[section]`, `[section,expanded]`,
// `[section,expanded=title]`, `[section=title]`). A permissive `\[section/i`
// would peek-true on malformed openers like `[section,]` / `[section=]`,
// which `matchSection` would then reject, leaving `parseBlock` unable to
// advance and the document loop spinning forever.
const BLOCK_PATTERNS_STICKY: readonly RegExp[] = [
  /\[quote\]/iy,
  /\[code\]/iy,
  /\[\/code\]/iy,
  /\[section(?:\]|,expanded(?:=[^\]]+)?\]|=[^\]]+\])/iy,
  /\[table\]/iy,
  /\[\/table\]/iy,
  /\[ltable\]/iy,
];

// Body-cell `[/td]` truncator for `parseLTableRow`. Hoisted so the regex
// compiles once instead of per cell.
const RE_LTABLE_TD_CLOSE = /\[\/td\]/i;

// Container-tag scanner used by `findContainerCloseInItem` to walk a
// list-item's text body looking for opens/closes that should truncate the
// item at the offset of a matching close. Hoisted to module scope so V8
// keeps a single compiled regex across all calls; `lastIndex` is reset at
// the call site since this is the only `/g`-style scanner here.
const RE_CONTAINER_TAG_GLOBAL =
  /\[(\/?)(section|quote|spoilers?|code|ltable|table)\b[^\]]*\]/gi;

// Line-start-only patterns: structural at column 0, ordinary text mid-line.
//
// The list pattern requires `\*+`, then horizontal whitespace `[ \t]+`, then
// a single non-whitespace char `\S` for the content. Both narrowings matter:
// a `\s+` separator would match a bare `*\n` line and eat the next line as
// item content (matchListItem would then disagree, looping forever); a bare
// `[ \t]+` without the trailing `\S` would peek-true on `** \n` (spaces but
// no content after), which matchListItem would also reject. Both failure
// modes were observed against the oracle before the narrowing landed.
const LINE_START_PATTERNS_STICKY: readonly RegExp[] = [
  /h[123456]\./iy,
  /\*+[ \t]+\S/y,
];

export class DTextStateMachineParser {
  protected input: string;
  protected pos: number;
  private options: ParserOptions;
  private thumbCount: number;
  // Combined nesting depth of [sup]/[sub] containers currently open. Ruby
  // caps this at 3; further opens are dropped (their close tags vanish too).
  private supSubDepth: number = 0;
  private static readonly SUP_SUB_MAX_DEPTH = 3;
  // Depth of currently-open block containers. A close tag only acts as a
  // scope killer / block break when its depth is > 0; otherwise ruby
  // treats it as literal text. Required to avoid infinite loops on stray
  // closes at the document root.
  private quoteDepth: number = 0;
  private sectionDepth: number = 0;
  private spoilerBlockDepth: number = 0;


  // Single compiled regex for all ID patterns. Ruby requires exactly one
  // ASCII space or NBSP between the prefix word and `#` (verified against
  // the oracle: `pool#1234`, `pool  #1234`, and `pool\t#1234` all stay
  // literal, while `pool #1234` and `pool #1234` link).
  private static readonly COMPILED_ID_PATTERN = new RegExp(
    '^(' +
      ID_PATTERNS.map((p) => p.pattern).join('|') +
      ') #(\\d+)',
    'i',
  );

  // Sticky-flag twin of `COMPILED_ID_PATTERN`. Used by `matchIdLink` and
  // `looksLikeIdPattern` so the precheck and the actual match share one
  // alternation regex (was 23 separate compiled regexes rebuilt per call).
  // `^` is dropped since sticky already anchors to `lastIndex`.
  private static readonly COMPILED_ID_PATTERN_STICKY = new RegExp(
    '(' +
      ID_PATTERNS.map((p) => p.pattern).join('|') +
      ') #(\\d+)',
    'iy',
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
      // Pristine flag for the code/table close path is "no block has been
      // emitted yet" at document root, so the synthesised `<p></p>` only
      // shows up before the very first block.
      if (this.consumeStrayCloseIfPresent(children, children.length === 0)) {
        continue;
      }

      // Don't strip leading horizontal whitespace here. Ruby treats indented
      // lines as ordinary paragraph content, so a line like "    body" should
      // produce `<p>    body</p>`, and a "blank" line that has horizontal
      // whitespace between two newlines is two single `<br>`s, not a
      // paragraph break. The only thing we collapse at the top level is a
      // true contiguous `\n\n`, the actual paragraph-break separator.
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

  // True at a `[/spoiler]` or `[/spoilers]` close tag whose matching open is
  // NOT in scope. Such a close is a Ragel "scope killer" that ruby treats as
  // a paragraph break plus literal-text fallout. Stray `[/quote]`, `[/ltable]`,
  // and `[/section]` closes do NOT trigger this; they stay as plain inline
  // text inside the paragraph (verified against the oracle).
  private peekStrayBlockClose(): boolean {
    if (this.spoilerBlockDepth > 0) return false;
    return this.testSticky(RE_STRAY_SPOILER_CLOSE);
  }

  // True at a stray `[/code]` or `[/table]`. Their behaviour differs from
  // stray spoiler closes: ruby eats whitespace and newlines around the tag,
  // emits an implicit `<p></p>` if at pristine state, and renders the
  // following inline tail without a `<p>` wrap (verified against the oracle).
  private peekStrayCodeOrTableClose(): boolean {
    return this.testSticky(RE_STRAY_CODE_TABLE_CLOSE);
  }

  // Consume a stray `[/code]` or `[/table]`. `pristine` is true when the
  // surrounding container has not emitted any block yet, in which case ruby
  // synthesises an empty paragraph before the close.
  private consumeStrayCodeTableAsLiteral(pristine: boolean): LiteralHtmlNode {
    const m = this.matchSticky(RE_STRAY_CODE_TABLE_CLOSE);
    if (!m) return { type: 'literal_html', prefix: '', children: [] };
    this.pos += m[0].length;
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.pos++;
        continue;
      }
      break;
    }
    const children: InlineNode[] = [];
    while (this.pos < this.input.length) {
      if (this.peekDoubleNewline()) break;
      // Break on an in-scope container close ([/quote], [/section],
      // [/spoiler]) so the surrounding container can pick it up. Without
      // this the inline-tail loop would eat the close as plain text and
      // the closing block would never render.
      if (this.peekContainerClose()) break;
      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
    }
    // A `\n` immediately before the container close should not render as a
    // `<br>`; ruby closes the wrapper cleanly here too.
    trimTrailingLineBreaks(children);
    const prefix = (pristine ? '<p></p>' : '') + m[0];
    return { type: 'literal_html', prefix, children };
  }

  private peekStrayBlockCloseAfterNewline(): boolean {
    const input = this.input;
    const code = input.charCodeAt(this.pos);
    let offset = 0;
    if (code === 0x0d && input.charCodeAt(this.pos + 1) === 0x0a) {
      offset = 2;
    } else if (code === 0x0a) {
      offset = 1;
    } else {
      return false;
    }
    const saved = this.pos;
    this.pos += offset;
    const result = this.peekStrayBlockClose();
    this.pos = saved;
    return result;
  }

  // Drop a stray block-close at the very start of a container before any
  // block has been emitted. Verified against the oracle:
  // `[/spoiler] alone at start` becomes `<p> alone at start</p>` and
  // `[/spoiler]\n\nafter` becomes `<p>after</p>`.
  private consumeStrayBlockCloseSilent(): void {
    const m = this.matchSticky(RE_STRAY_SPOILER_CLOSE);
    if (!m) return;
    this.pos += m[0].length;
  }

  // Emit a stray block-close after content. The leading `prefix` (any inter
  // block whitespace and the close tag itself) is rendered verbatim; the
  // tail is parsed as inline content so id-links, wiki links, and formatting
  // still resolve after the close. Newlines in the tail render as `<br>` via
  // the normal LineBreakNode path. Tail collection stops at a paragraph
  // break (`\n\n`) or at an in-scope `[/quote]` / `[/section]` so the
  // surrounding container can resume normally.
  private consumeStrayBlockCloseAsLiteral(prefix = ''): LiteralHtmlNode {
    const m = this.matchSticky(RE_STRAY_SPOILER_CLOSE);
    if (!m) return { type: 'literal_html', prefix, children: [] };
    this.pos += m[0].length;
    const fullPrefix = prefix + m[0];
    const children: InlineNode[] = [];
    while (this.pos < this.input.length) {
      if (this.peekDoubleNewline()) break;
      if (this.peekContainerClose()) break;
      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
    }
    return { type: 'literal_html', prefix: fullPrefix, children };
  }

  // Read-only variant of peekStrayBlockCloseAfterWhitespace: same check, no
  // pos mutation. Used to decide whether to consume the trailing newline at
  // the end of a paragraph that broke on a stray close.
  private peekStrayBlockCloseAfterAnyWs(): boolean {
    let p = this.pos;
    while (p < this.input.length) {
      const c = this.input[p];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        p++;
        continue;
      }
      break;
    }
    RE_STRAY_SPOILER_CLOSE.lastIndex = p;
    return RE_STRAY_SPOILER_CLOSE.test(this.input);
  }

  // Look ahead through any whitespace and newlines starting at pos. If a
  // stray spoiler close sits past them, return the literal whitespace prefix
  // so the caller can hand it to consumeStrayBlockCloseAsLiteral. Otherwise
  // return null and leave pos unchanged. The stray close itself is not
  // consumed here.
  private peekStrayBlockCloseAfterWhitespace(): string | null {
    let p = this.pos;
    while (p < this.input.length) {
      const c = this.input[p];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        p++;
        continue;
      }
      break;
    }
    if (this.spoilerBlockDepth !== 0) return null;
    RE_STRAY_SPOILER_CLOSE.lastIndex = p;
    if (!RE_STRAY_SPOILER_CLOSE.test(this.input)) return null;
    const prefix = this.input.slice(this.pos, p);
    this.pos = p;
    return prefix;
  }

  // Consume a stray block close tag at the current block-loop boundary, if
  // one is sitting there. Returns `true` when something was consumed (and
  // the caller should `continue` its loop); `false` to let the caller proceed
  // to `parseBlock()`. Captures the three-way dispatch shared by the document
  // loop and every container-block parser:
  //
  //   - `[/spoiler]` past optional whitespace, after at least one block has
  //     been emitted: silently dropped if the previous block was a quote /
  //     section close (the oracle absorbs that case), otherwise emitted as
  //     a literal-html fallout carrying the whitespace prefix.
  //   - `[/spoiler]` at pristine state (no block emitted yet): silently
  //     dropped.
  //   - `[/code]` / `[/table]`: emitted as a literal-html node. `pristine`
  //     decides whether the surrounding container synthesises a `<p></p>`
  //     before the close (true at document root, false inside any container).
  private consumeStrayCloseIfPresent(
    children: BlockNode[],
    pristineForCodeTable: boolean,
  ): boolean {
    if (children.length > 0) {
      const last = children[children.length - 1];
      const lastIsContainerBlock =
        last.type === 'quote' || last.type === 'section';
      const prefix = this.peekStrayBlockCloseAfterWhitespace();
      if (prefix !== null) {
        if (lastIsContainerBlock) {
          this.consumeStrayBlockCloseSilent();
        } else {
          children.push(this.consumeStrayBlockCloseAsLiteral(prefix));
        }
        return true;
      }
    } else if (this.peekStrayBlockClose()) {
      this.consumeStrayBlockCloseSilent();
      return true;
    }
    if (this.peekStrayCodeOrTableClose()) {
      children.push(this.consumeStrayCodeTableAsLiteral(pristineForCodeTable));
      return true;
    }
    return false;
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

    const quoteColor = this.matchQuoteColorOpen();
    if (quoteColor !== null) {
      return this.parseQuote(quoteColor);
    }

    if (this.matchSpoilerBlockOpen()) {
      return this.parseSpoilerBlock();
    }

    if (this.matchString('[code]', true)) {
      return this.parseCodeBlock();
    }

    // Stray block-level closes ([/code], [/table]) at block start: ruby
    // emits the literal text without a paragraph wrap. Their open tags
    // consume content to the matching close, so reaching one here means
    // it has no matching open in scope.
    if (this.peekString('[/code]', true)) {
      return this.parseRawBlockClose('[/code]');
    }
    if (this.peekString('[/table]', true)) {
      return this.parseRawBlockClose('[/table]');
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

  // Recognize a colored quote open like [quote=#00CCFF] or [quote=yellow]
  // and consume it, returning the raw color token. Returns null and leaves
  // pos unchanged when not a valid colored quote (so the surrounding parser
  // can fall through to inline-text handling).
  private matchQuoteColorOpen(): string | null {
    const m = this.matchSticky(RE_QUOTE_COLOR_OPEN);
    if (!m) return null;
    const color = m[1];
    if (!isValidQuoteColor(color)) return null;
    this.pos += m[0].length;
    return color;
  }

  private parseQuote(color?: string): QuoteNode {
    this.skipWhitespace();
    this.consumeNewline();
    // Strip blank lines at the very top of the container only; once content
    // starts, a whitespace-only line becomes a real <p> </p> paragraph
    // (verified against the oracle).
    this.skipBlankLines();

    const children: BlockNode[] = [];

    this.quoteDepth++;
    try {
      while (
        this.pos < this.input.length &&
        !this.peekString('[/quote]', true)
      ) {
        // Inside a block container the stray code/table close emits a
        // literal-html node WITHOUT synthesising a `<p></p>` first
        // (`[quote][/table] tail[/quote]` -> `<blockquote>[/table]tail
        // </blockquote>`); hence the `false` pristine flag.
        if (this.consumeStrayCloseIfPresent(children, false)) continue;
        const node = this.parseBlock();
        if (node) {
          children.push(node);
        }
      }
    } finally {
      this.quoteDepth--;
    }

    if (this.peekString('[/quote]', true)) {
      this.matchString('[/quote]', true);
      this.consumeBlockCloseTail();
    }

    const result: QuoteNode = { type: 'quote', children };
    if (color !== undefined) result.color = color;
    return result;
  }

  private parseSpoilerBlock(): SpoilerBlockNode {
    this.skipWhitespace();
    this.consumeNewline();
    this.skipBlankLines();
    // Drop horizontal whitespace at the start of the first content line.
    // Verified against the oracle: `[spoiler]\n  hi\n[/spoiler]` ->
    // `<div class="spoiler"><p>hi</p></div>` (the two leading spaces are
    // gone). Subsequent lines preserve indentation, so this only fires
    // here, not inside the block loop.
    this.skipWhitespace();

    const children: BlockNode[] = [];

    this.spoilerBlockDepth++;
    try {
      while (this.pos < this.input.length && !this.peekSpoilerClose()) {
        if (this.consumeStrayCloseIfPresent(children, false)) continue;
        const node = this.parseBlock();
        if (node) {
          children.push(node);
        }
      }
    } finally {
      this.spoilerBlockDepth--;
    }
    if (this.matchSpoilerClose()) {
      this.consumeBlockCloseTail();
    }

    return { type: 'spoiler_block', children };
  }

  private peekSpoilerClose(): boolean {
    return (
      this.peekString('[/spoiler]', true) ||
      this.peekString('[/spoilers]', true)
    );
  }

  private parseCodeBlock(): CodeBlockNode {
    this.skipWhitespace();
    this.consumeNewline();

    const start = this.pos;
    let closed = false;

    while (this.pos < this.input.length) {
      if (this.matchString('[/code]', true)) {
        closed = true;
        break;
      }
      this.pos++;
    }

    // Only trim the close-tag length if we actually consumed one. Falling off
    // the end without seeing [/code] means everything from start..pos is the
    // body (verified against the oracle: an unclosed [code] keeps trailing
    // text, brackets, and newlines literal).
    const content = closed
      ? this.input.slice(start, this.pos - '[/code]'.length)
      : this.input.slice(start);
    if (closed) this.consumeBlockCloseTail();

    return { type: 'code_block', content };
  }

  private parseRawBlockClose(tag: string): RawBlockTextNode {
    this.matchString(tag, true);
    this.consumeBlockCloseTail();
    return { type: 'raw_block_text', content: tag };
  }

  private parseSection(sectionMatch: SectionMatch): SectionNode {
    this.skipWhitespace();
    this.consumeNewline();
    this.skipBlankLines();

    const children: BlockNode[] = [];

    this.sectionDepth++;
    try {
      while (
        this.pos < this.input.length &&
        !this.peekString('[/section]', true)
      ) {
        if (this.consumeStrayCloseIfPresent(children, false)) continue;
        const node = this.parseBlock();
        if (node) {
          children.push(node);
        }
      }
    } finally {
      this.sectionDepth--;
    }
    if (this.matchString('[/section]', true)) {
      this.consumeBlockCloseTail();
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
      } else if (
        this.peekString('[td]', true) ||
        this.peekString('[th]', true)
      ) {
        // Source omitted the [tr]. Synthesize a row from the loose cells
        // so they still render. parse5 will auto-wrap orphan <td> children
        // of <tbody> in an implicit <tr> too, so this matches the oracle's
        // serialized output under DOM normalization.
        rows.push(this.parseLooseTableRow());
      } else {
        // Skip unknown content
        this.pos++;
      }

      this.skipWhitespace();
    }

    return { type: 'table_body', rows };
  }

  private parseLooseTableRow(): TableRowNode {
    const cells: TableCellNode[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.matchString('[th]', true)) {
        cells.push(this.parseTableCell('th'));
      } else if (this.matchString('[td]', true)) {
        cells.push(this.parseTableCell('td'));
      } else {
        break;
      }
    }

    return { type: 'table_row', cells };
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

    trimTrailingLineBreaks(children);

    return { type: 'table_cell', cellType, children };
  }

  private parseLTable(): LTableNode {
    const rows: TableRowNode[] = [];
    const lines: string[] = [];

    this.skipWhitespace();

    // Collect lines until [/ltable]. The close tag may appear mid-line
    // (e.g. `[ltable]a[/ltable] tail`), so scan char-by-char and break the
    // line at it just like a newline would.
    while (
      this.pos < this.input.length &&
      !this.matchString('[/ltable]', true)
    ) {
      const lineStart = this.pos;

      while (this.pos < this.input.length) {
        const code = this.input.charCodeAt(this.pos);
        if (code === 0x0a || code === 0x0d) break;
        if (code === 0x5b /* [ */ && this.compareAtPos('[/ltable]', true)) {
          break;
        }
        this.pos++;
      }

      const line = this.input.slice(lineStart, this.pos).trim();
      if (line) {
        lines.push(line);
      }

      // Skip the newline (but leave [/ltable] for the outer loop to consume).
      if (this.pos < this.input.length && this.input[this.pos] === '\r') {
        this.pos++;
      }
      if (this.pos < this.input.length && this.input[this.pos] === '\n') {
        this.pos++;
      }
    }

    if (lines.length > 0) {
      rows.push({
        type: 'table_row',
        cells: this.parseLTableRow(lines[0], 'th'),
      });
      for (let i = 1; i < lines.length; i++) {
        rows.push({
          type: 'table_row',
          cells: this.parseLTableRow(lines[i], 'td'),
        });
      }
    }

    return { type: 'ltable', rows };
  }

  private parseLTableRow(line: string, cellType: 'th' | 'td'): TableCellNode[] {
    const cells: TableCellNode[] = [];
    const parts = line.split('|');

    for (const part of parts) {
      let content = part.trim();
      // Body cells (not the header row) truncate at the first literal
      // `[/td]` and drop everything from there to the cell's end. Verified
      // against the oracle: `[td]body[/td]` -> `[td]body`, `body[/td]more`
      // -> `body`, `[/td]bare` -> empty. Header cells are kept as-is.
      //
      // Fast path: most body cells contain no `[` at all, in which case
      // `[/td]` cannot appear. Probe with `indexOf('[')` before allocating
      // a lowercased copy. When present, a CI regex finds the close in a
      // single pass without the eager `toLowerCase()` allocation.
      if (cellType === 'td' && content.indexOf('[') >= 0) {
        const m = RE_LTABLE_TD_CLOSE.exec(content);
        if (m) content = content.slice(0, m.index).trimEnd();
      }
      const children: InlineNode[] = content
        ? this.parseInlineText(content)
        : [];
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

      // A stray block-close tag (no matching open in scope) terminates the
      // paragraph without consuming the close itself; the surrounding block
      // loop will pick it up as a literal-html fallout node.
      if (this.peekStrayBlockClose()) {
        break;
      }
      if (this.peekNewline() && this.peekStrayBlockCloseAfterNewline()) {
        break;
      }

      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
    }

    // If we broke on a stray spoiler close, leave the trailing newlines for
    // the surrounding block loop to absorb into the literal-html prefix.
    // Otherwise (normal paragraph end), eat one trailing newline.
    if (!this.peekStrayBlockClose() && !this.peekStrayBlockCloseAfterAnyWs()) {
      this.consumeNewline();
    }

    // A final `\n` inside a paragraph buffer shouldn't render as
    // `<br></p>`; ruby closes the paragraph cleanly.
    trimTrailingLineBreaks(children);

    return { type: 'paragraph', children };
  }

  protected parseInlineElement(): InlineNode | null {
    if (this.pos >= this.input.length) return null;

    // Stray `[/code]` / `[/table]` reached as inline content (header, inline
    // wrapper, top-level inline doc): render the close tag literal AND
    // swallow the run of whitespace that follows it. Verified against the
    // oracle: `h1. a [/table] b` -> `<h1>a [/table]b</h1>`,
    // `[b]a [/table] tail[/b]` -> `<strong>a [/table]tail</strong>`.
    // Paragraphs never reach this branch because peekBlockElement breaks
    // them on `[/table]` first; the document/quote/section block loops
    // intercept the same close earlier via consumeStrayCodeTableAsLiteral.
    const inlineCT = this.matchSticky(RE_STRAY_CODE_TABLE_CLOSE);
    if (inlineCT) {
      this.pos += inlineCT[0].length;
      while (this.pos < this.input.length) {
        const c = this.input[this.pos];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
          this.pos++;
          continue;
        }
        break;
      }
      return { type: 'text', content: inlineCT[0] };
    }

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
      return this.parseSupSubContainer('[/sup]', 'superscript');
    }

    // Subscript
    if (this.matchString('[sub]', true)) {
      return this.parseSupSubContainer('[/sub]', 'subscript');
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

    // A lone CR (not part of CRLF) renders as a single space inside inline
    // text per the oracle, e.g. `"link":[/a\rb]` becomes `[/a b]` literal.
    // It is not a line break here; CRLF and bare LF are handled above.
    if (this.input[this.pos] === '\r') {
      this.pos++;
      return { type: 'text', content: ' ' };
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
      // Inside an inline container, a paragraph break (\n\n+) is dropped
      // entirely. Ruby's parser consumes the newlines without emitting
      // anything, joining the surrounding text seamlessly.
      if (this.peekDoubleNewline()) {
        this.consumeBlankLines();
        continue;
      }
      // Block-container closes ([/section], [/quote]) act as scope killers
      // in ruby: they close any open inline tag and the surrounding
      // paragraph. Stop here without consuming so the outer parser sees
      // the close tag.
      if (this.peekContainerClose()) {
        break;
      }
      const node = this.parseInlineElement();
      if (node) {
        children.push(node);
      }
    }

    trimTrailingLineBreaks(children);

    return { type: nodeType, children } as InlineNode;
  }

  // Ruby caps the combined [sup]/[sub] nesting depth at 3. Past that the
  // open tag is silently dropped along with its matching close, and the
  // body's children bubble up to the parent. We model the drop with a
  // transparent fragment node so the renderer emits the children inline
  // without surrounding markup.
  private parseSupSubContainer(
    closePattern: string,
    nodeType: 'superscript' | 'subscript',
  ): InlineNode {
    const dropped =
      this.supSubDepth >= DTextStateMachineParser.SUP_SUB_MAX_DEPTH;
    this.supSubDepth++;
    try {
      const wrapped = this.parseInlineContainer(closePattern, nodeType);
      if (!dropped) return wrapped;
      const children =
        'children' in wrapped && Array.isArray(wrapped.children)
          ? (wrapped.children as InlineNode[])
          : [];
      const fragment: FragmentNode = { type: 'fragment', children };
      return fragment;
    } finally {
      this.supSubDepth--;
    }
  }

  private peekContainerClose(): boolean {
    return (
      (this.sectionDepth > 0 && this.peekString('[/section]', true)) ||
      (this.quoteDepth > 0 && this.peekString('[/quote]', true)) ||
      (this.spoilerBlockDepth > 0 &&
        (this.peekString('[/spoiler]', true) ||
          this.peekString('[/spoilers]', true)))
    );
  }

  private consumeBlankLines(): void {
    while (this.pos < this.input.length) {
      if (this.peekNewline()) {
        this.consumeNewline();
        continue;
      }
      if (isHorizontalWhitespace(this.input.charCodeAt(this.pos))) {
        this.pos++;
        continue;
      }
      break;
    }
  }

  private parseColorContainer(color: string): ColorNode {
    // Parse the children either way; the only difference between "color
    // allowed" and "color disabled" is whether the color value survives onto
    // the node. Disabled mode emits an empty-string color so the renderer
    // skips the wrapping span (see render-html's allowColor branch).
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
    return {
      type: 'color',
      color: this.options.allowColor ? color : '',
      children,
    };
  }

  protected parseText(): TextNode {
    const start = this.pos;
    const input = this.input;
    const len = input.length;

    while (this.pos < len) {
      const code = input.charCodeAt(this.pos);

      // Stop at markup characters: '[' (0x5b), '`' (0x60), '\r' (0x0d), '\n' (0x0a)
      if (code === 0x5b || code === 0x60 || code === 0x0d || code === 0x0a) {
        break;
      }

      // Handle escaped characters: '\\' (0x5c) followed by '`'
      if (code === 0x5c && this.pos + 1 < len) {
        if (input.charCodeAt(this.pos + 1) === 0x60) {
          // Don't stop here, let the escaped backtick be handled by parseInlineElement
          break;
        }
      }

      // Stop at potential link starts: '"' (0x22), '<' (0x3c), '{' (0x7b)
      if (code === 0x22 || code === 0x3c || code === 0x7b) {
        if (this.looksLikeMarkup()) {
          break;
        }
      }

      // Stop at URL starts: 'h' (0x68) or 'H' (0x48), prefix matches "http"
      if ((code === 0x68 || code === 0x48) && this.pos + 3 < len) {
        if (this.compareAtPos('http', true)) {
          break;
        }
      }

      // ID pattern checking. Only check at the start of a "word" (start of
      // buffer or after a non-alphanumeric character) so we don't pay the
      // cost of a regex check at every char. Ruby's parser fires id-link
      // detection after any non-word boundary including `(`, `[`, `,`, etc.
      if (isAsciiAlpha(code)) {
        const prevIsAlnum =
          this.pos !== start &&
          isAsciiAlphaNumeric(input.charCodeAt(this.pos - 1));
        if (!prevIsAlnum && this.looksLikeIdPattern()) {
          break;
        }
      }

      this.pos++;
    }

    if (this.pos > start) {
      return { type: 'text', content: input.slice(start, this.pos) };
    }
    return { type: 'text', content: input[this.pos++] || '' };
  }

  // Parse a string of inline content while sharing the outer parser's state
  // (depth counters, thumb count). Used for list-item bodies and ltable cell
  // contents, which sit inside an outer block context that they need to stay
  // aware of: a `[/quote]` inside a list item that's nested in a quote should
  // close the outer quote (not show up as literal text), and thumbs inside a
  // list item should count toward the document-wide `maxThumbs` budget.
  //
  // Compare the free function `parseInlineString` near the top of the file,
  // which does the opposite: fresh parser instance, own budget, container
  // closes stay literal. That one is for genuinely isolated contexts like
  // textile link titles.
  //
  // The save/restore of `input` and `pos` lets the caller stage a substring
  // through the existing matcher infrastructure without leaking position
  // state back to the caller.
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
    if (!this.compareAtPos(pattern, caseInsensitive)) return false;
    this.pos += pattern.length;
    return true;
  }

  // Compare `pattern` against the input at `this.pos` without allocating.
  // CS path delegates to `String.prototype.startsWith(pattern, pos)`.
  //
  // Precondition for the CI path: `pattern` MUST be ASCII. Every current
  // caller passes a hardcoded bracketed tag (`[/quote]`, `[code]`, etc.).
  // Non-ASCII letters that JS's `String#toLowerCase` *would* fold (e.g. the
  // Kelvin sign U+212A folds to ASCII `k`) will NOT fold here. The manual
  // loop only case-folds A-Z. Closer to ruby's `String#downcase` behavior
  // than the prior implementation, but the contract narrowed: do not call
  // with a non-ASCII pattern unless you've thought about the fold rules.
  private compareAtPos(pattern: string, caseInsensitive: boolean): boolean {
    const input = this.input;
    const pos = this.pos;
    if (!caseInsensitive) return input.startsWith(pattern, pos);
    const len = pattern.length;
    if (pos + len > input.length) return false;
    for (let i = 0; i < len; i++) {
      const a = input.charCodeAt(pos + i);
      const b = pattern.charCodeAt(i);
      if (a === b) continue;
      const al = a >= 0x41 && a <= 0x5a ? a + 0x20 : a;
      const bl = b >= 0x41 && b <= 0x5a ? b + 0x20 : b;
      if (al !== bl) return false;
    }
    return true;
  }

  // Run a sticky regex anchored at `this.pos`. Sticky regexes (`/y` flag)
  // match only when their start equals `lastIndex`, so this is the in-place
  // equivalent of `this.input.slice(this.pos).match(/^.../)` minus the
  // O(n - pos) allocation per call. Returns the match or null; does not
  // advance `this.pos` (callers do, the same way the slice form did).
  private matchSticky(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this.pos;
    return re.exec(this.input);
  }

  // Boolean variant of `matchSticky`. Identical contract; just avoids
  // allocating a match object when callers only need a yes/no.
  private testSticky(re: RegExp): boolean {
    re.lastIndex = this.pos;
    return re.test(this.input);
  }

  private matchHeader(): number | null {
    const match = this.matchSticky(RE_HEADER);
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
    // At block context (parseBlock is only entered at document start or after
    // a paragraph break) `[spoiler]` opens a block spoiler when a matching
    // close exists somewhere ahead. A spoiler embedded inside a paragraph
    // (after a single newline or mid-line) stays inline; that case never
    // reaches parseBlock, so the structural test here is sufficient.
    //
    // Known faithfulness gap: this regex pairs the close form with the open
    // form via `\1`, so `[spoiler]x[/spoilers]` does NOT match here and
    // falls through to inline parsing. The oracle is more permissive and
    // treats either close form as block when at block context (probed
    // against the live oracle 2026-05-09). Fixing this requires both this
    // matcher and `getSpoilerClosePattern` to be reworked together; the
    // close-form picking and the open-form pairing interact.
    const blockMatch = this.matchSticky(RE_SPOILER_BLOCK);
    if (!blockMatch) return false;
    this.pos += blockMatch[1].length + 2; // consume only the opening tag
    return true;
  }

  private matchSpoilerClose(): boolean {
    return (
      this.matchString('[/spoiler]', true) ||
      this.matchString('[/spoilers]', true)
    );
  }

  private getSpoilerClosePattern(): string {
    // Pick which close form `parseInlineContainer` should look for. Prefer
    // `[/spoilers]` whenever one appears anywhere ahead, otherwise fall
    // back to `[/spoiler]`. The `/g` flag lets us walk forward from
    // `this.pos` without allocating a lower-cased copy of the rest of the
    // buffer.
    //
    // Known faithfulness gap: ruby pair-matches by depth, not by form, so
    // `[spoiler]a [spoiler]b[/spoiler] c[/spoilers]` correctly nests with
    // the outer `[spoiler]` paired against the trailing `[/spoilers]`.
    // Our naive "first `[/spoilers]` ahead wins" picker loses that
    // structure when nested inline spoilers appear, and is also coupled
    // to the block-vs-inline decision in `matchSpoilerBlockOpen` which
    // has its own gap. Fix the two together. Probed against the live
    // oracle 2026-05-09.
    const re = /\[\/spoilers\]/gi;
    re.lastIndex = this.pos;
    return re.test(this.input) ? '[/spoilers]' : '[/spoiler]';
  }

  private matchSection(): SectionMatch | null {
    if (this.matchString('[section,expanded]', true)) {
      return { expanded: true };
    }
    if (this.matchString('[section]', true)) {
      return {};
    }

    const expandedMatch = this.matchSticky(RE_SECTION_EXPANDED_TITLE);
    if (expandedMatch) {
      this.pos += expandedMatch[0].length;
      return { title: expandedMatch[1], expanded: true };
    }

    const titleMatch = this.matchSticky(RE_SECTION_TITLE);
    if (titleMatch) {
      this.pos += titleMatch[0].length;
      return { title: titleMatch[1] };
    }

    return null;
  }

  // Find the first byte offset in `content` where a container close tag
  // belongs to an outer block rather than the list item itself. Returns -1
  // if no such close exists.
  //
  // [/section] and [/quote] always terminate (their opens are block-only;
  // any close that appears inside an item is closing an outer container).
  // [/spoiler] is dual-mode: inside an item it usually pairs with an inline
  // [spoiler] open, so we track the open count and only truncate at a close
  // that has no matching open. Verified against the oracle: a balanced
  // inline pair stays paired, an unpaired close ends the item.
  // [/code] and [/table] also terminate the item; their opens are block-only
  // and a stray close inside a list item ends the list (verified against
  // the oracle: `* a [/table] b` becomes `<ul><li>a </li></ul>[/table]b`).
  private findContainerCloseInItem(content: string): number {
    // Fast path: most list items are pure prose with no `[` at all. Skip
    // the regex setup entirely; `indexOf` lowers to a tight machine-code
    // scan that returns -1 quickly on the common case.
    if (content.indexOf('[') < 0) return -1;
    const re = RE_CONTAINER_TAG_GLOBAL;
    re.lastIndex = 0;
    let spoilerDepth = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const isClose = m[1] === '/';
      const tag = m[2].toLowerCase();
      if (tag === 'code' || tag === 'table' || tag === 'ltable') {
        // Always splits the item. `* [code]hi[/code]` -> empty `<li>`
        // then the block; `* a [/code]` -> end the list at the close.
        return m.index;
      }
      if (tag === 'quote' || tag === 'section') {
        // Block opens always split. Stray closes in scope split (so the
        // outer container can absorb them); stray closes out of scope
        // stay literal inside the item. Verified: `* a [/quote]` stays
        // inline literal, but `[quote]\n* a [/quote]\n[/quote]` truncates
        // at the inner close so the outer quote ends.
        if (!isClose) return m.index;
        if (tag === 'quote' && this.quoteDepth > 0) return m.index;
        if (tag === 'section' && this.sectionDepth > 0) return m.index;
        continue;
      }
      // spoiler or spoilers
      if (isClose) {
        if (spoilerDepth === 0) return m.index;
        spoilerDepth--;
      } else {
        spoilerDepth++;
      }
    }
    return -1;
  }

  private matchListItem(): ListMatch | null {
    // Separator must be horizontal whitespace only. Using `\s+` here would
    // let a bare `*\n` line eat the next line as item content (verified
    // failure: `* a\n*\n* b` then matched `*\n* b` as one item with text
    // `* b`). Oracle keeps the bare `*` as a paragraph and starts a fresh
    // list afterwards.
    const match = this.matchSticky(RE_LIST_ITEM);
    if (!match) return null;

    const contentStart = match[0].length - match[2].length;
    const closeIdx = this.findContainerCloseInItem(match[2]);
    if (closeIdx >= 0) {
      // A block-level tag inside the item content ends the item there.
      // Truncate the item (which may now be empty) and rewind pos so the
      // outer parser picks the block up. `* [ltable]...` produces an
      // empty `<li>` followed by the table; `* a [/quote]` produces a
      // single-char item then lets the quote container see the close.
      const content = match[2].slice(0, closeIdx);
      this.pos += contentStart + content.length;
      return { depth: match[1].length, content };
    }

    this.pos += match[0].length;
    return { depth: match[1].length, content: match[2] };
  }

  private matchInternalAnchor(): string | null {
    const match = this.matchSticky(RE_INTERNAL_ANCHOR);
    if (match) {
      this.pos += match[0].length;
      return match[1];
    }
    return null;
  }

  protected matchIdLink(): IdMatch | null {
    const match = this.matchSticky(
      DTextStateMachineParser.COMPILED_ID_PATTERN_STICKY,
    );
    if (!match) return null;

    // Lookup keys are stored lowercase with whitespace collapsed; the input
    // pattern is normalised to match. The map is built from the same source
    // list as the regex alternation, so any successful regex match has a
    // corresponding entry here. The null guard is paranoia for a future
    // edit that adds a regex pattern without a map entry.
    const matchedPattern = match[1].toLowerCase().replace(/\s+/g, ' ');
    const type = ID_TYPE_MAP.get(matchedPattern);
    if (type === undefined) return null;

    this.pos += match[0].length;
    return { type, id: match[2], text: match[0] };
  }

  protected matchPostSearchLink(): PostSearchMatch | null {
    // Mirror of `matchWikiLink`'s pipe-counting rule, verified against the
    // oracle for `{{...}}`:
    //   * 0 pipes -> {{tag}} (tag must be non-empty)
    //   * 1 pipe with both sides non-empty -> {{tag|title}}
    //   * 1 leading pipe -> tag form, tag includes the pipe (`{{|}}` -> "|",
    //     `{{|tag}}` -> "|tag")
    //   * 1 trailing pipe -> literal
    //   * 2+ pipes -> literal
    const block = this.matchSticky(RE_POST_SEARCH);
    if (!block) return null;
    const content = block[1];
    if (content.length === 0) return null;

    const firstPipe = content.indexOf('|');
    const lastPipe = content.lastIndexOf('|');
    if (firstPipe !== lastPipe) return null;

    let result: PostSearchMatch;
    if (firstPipe < 0) {
      result = { tag: content };
    } else {
      const before = content.slice(0, firstPipe);
      const after = content.slice(firstPipe + 1);
      if (before.length === 0) {
        result = { tag: content };
      } else if (after.length === 0) {
        return null;
      } else {
        result = { tag: before, title: after };
      }
    }

    this.pos += block[0].length;
    return result;
  }

  protected matchWikiLink(): WikiLinkInput | null {
    // Match the [[...]] block first, then validate the content as a whole.
    // Verified against the oracle:
    //   * 0 pipes  -> [[tag]] form (tag must be non-empty)
    //   * 1 pipe with both sides non-empty -> [[tag|title]] form
    //   * 1 leading pipe (empty before) -> tag form, tag includes the pipe
    //     (e.g. `[[|]]` -> tag "|", `[[|title]]` -> tag "|title")
    //   * 1 trailing pipe (empty after) -> literal
    //   * 2+ pipes -> literal
    // After tag-vs-title is decided, the tag is split on its first `#` for
    // an anchor (anchor may be empty: `[[abc#]]` -> tag "abc", anchor "").
    const block = this.matchSticky(RE_WIKI_LINK);
    if (!block) return null;
    const content = block[1];
    if (content.length === 0) return null;

    const result = this.parseWikiContent(content);
    if (!result) return null;

    this.pos += block[0].length;
    return result;
  }

  private parseWikiContent(content: string): WikiLinkInput | null {
    const firstPipe = content.indexOf('|');
    const lastPipe = content.lastIndexOf('|');

    if (firstPipe !== lastPipe) return null;

    let tagPart: string;
    let titlePart: string | undefined;

    if (firstPipe < 0) {
      tagPart = content;
    } else {
      const before = content.slice(0, firstPipe);
      const after = content.slice(firstPipe + 1);
      if (before.length === 0) {
        // Leading-pipe form: keep the entire content (with the pipe) as the
        // tag. Anchor splitting is skipped here.
        return { tag: content };
      }
      if (after.length === 0) return null;
      tagPart = before;
      titlePart = after;
    }

    const hashIdx = tagPart.indexOf('#');
    if (hashIdx === 0) {
      const r: WikiLinkInput = { tag: '', anchor: tagPart.slice(1) };
      if (titlePart !== undefined) r.title = titlePart;
      return r;
    }
    if (hashIdx > 0) {
      const r: WikiLinkInput = {
        tag: tagPart.slice(0, hashIdx),
        anchor: tagPart.slice(hashIdx + 1),
      };
      if (titlePart !== undefined) r.title = titlePart;
      return r;
    }
    const r: WikiLinkInput = { tag: tagPart };
    if (titlePart !== undefined) r.title = titlePart;
    return r;
  }

  protected matchTextileLink(): TextileLinkMatch | null {
    const currentChar = this.input[this.pos];
    if (currentChar !== '"') {
      return null;
    }

    // "title":[url] format. Oracle rejects bracketed urls that contain any
    // whitespace (space/tab/newline/CR) or are empty. The empty case is
    // already screened by the `+` in the regex.
    const bracketedMatch = this.matchSticky(RE_TEXTILE_BRACKETED);
    if (bracketedMatch) {
      if (!isAcceptedTextileUrl(bracketedMatch[2])) return null;
      if (/\s/.test(bracketedMatch[2])) return null;
      this.pos += bracketedMatch[0].length;
      return { title: bracketedMatch[1], url: bracketedMatch[2] };
    }

    // "title":url format. Strip trailing boundary punctuation (,.;:!?) the
    // way matchUrl does for bare urls , preserving balanced parens.
    const basicMatch = this.matchSticky(RE_TEXTILE_BASIC);
    if (basicMatch) {
      const trimmed = trimUrlBoundaries(basicMatch[2]);
      if (!isAcceptedTextileUrl(trimmed)) return null;
      const consumed = basicMatch[0].length - (basicMatch[2].length - trimmed.length);
      this.pos += consumed;
      return { title: basicMatch[1], url: trimmed };
    }

    return null;
  }

  protected matchUrl(): UrlMatch | null {
    const match = this.matchSticky(RE_URL);
    if (match) {
      const url = trimUrlBoundaries(match[0]);
      this.pos += url.length;
      return { url };
    }
    return null;
  }

  private matchDelimitedUrl(): UrlMatch | null {
    const match = this.matchSticky(RE_DELIMITED_URL);
    if (match) {
      this.pos += match[0].length;
      return { url: match[1] };
    }
    return null;
  }

  private matchColor(): string | null {
    const colorMatch = this.matchSticky(RE_COLOR_OPEN);
    if (colorMatch) {
      // Same validity rules as a quote-colour: hex (3 or 6), strict-lowercase
      // word, or one of the tag-category aliases. Anything else is left as
      // literal so [/color] also stays literal (verified against the oracle).
      if (!isValidQuoteColor(colorMatch[1])) return null;
      this.pos += colorMatch[0].length;
      return colorMatch[1];
    }
    return null;
  }

  private matchNewlines(): boolean {
    // Consume only line terminators here. Horizontal whitespace must stay so
    // it can be picked up as paragraph content (ruby preserves indentation).
    const input = this.input;
    const len = input.length;
    const start = this.pos;
    while (this.pos < len) {
      const code = input.charCodeAt(this.pos);
      if (code === 0x0d && input.charCodeAt(this.pos + 1) === 0x0a) {
        this.pos += 2;
      } else if (code === 0x0a || code === 0x0d) {
        this.pos += 1;
      } else {
        break;
      }
    }
    return this.pos > start;
  }

  private skipWhitespace(): void {
    const input = this.input;
    const len = input.length;
    while (this.pos < len) {
      const code = input.charCodeAt(this.pos);
      if (code !== 0x20 && code !== 0x09) break;
      this.pos++;
    }
  }

  private peekNewline(): boolean {
    const code = this.input.charCodeAt(this.pos);
    if (code === 0x0a) return true;
    return code === 0x0d && this.input.charCodeAt(this.pos + 1) === 0x0a;
  }

  private peekString(pattern: string, caseInsensitive = false): boolean {
    return this.compareAtPos(pattern, caseInsensitive);
  }

  private consumeNewline(): void {
    const code = this.input.charCodeAt(this.pos);
    if (code === 0x0d && this.input.charCodeAt(this.pos + 1) === 0x0a) {
      this.pos += 2;
    } else if (code === 0x0a) {
      this.pos += 1;
    }
  }

  // After consuming a block close tag like [/quote] or [/section], ruby
  // also eats any horizontal whitespace remaining on the same line plus one
  // trailing newline. This way `[/quote] \n\nbody` produces a clean
  // paragraph break before `body` instead of an empty <p></p> from the
  // leftover ` \n`.
  private consumeBlockCloseTail(): void {
    const input = this.input;
    const len = input.length;
    while (this.pos < len && isHorizontalWhitespace(input.charCodeAt(this.pos))) {
      this.pos++;
    }
    const code = input.charCodeAt(this.pos);
    if (code === 0x0d && input.charCodeAt(this.pos + 1) === 0x0a) {
      this.pos += 2;
    } else if (code === 0x0a || code === 0x0d) {
      this.pos += 1;
    }
  }

  // Consume any whitespace-only lines at the current position. A line
  // counts as whitespace-only if it contains zero or more horizontal-WS
  // characters followed by a newline. Used inside container blocks
  // (section, quote, spoiler block) where ruby does not preserve such lines
  // as empty paragraphs. At document level we don't do this; ruby keeps
  // " \n\n" as a real <p> </p>.
  private skipBlankLines(): void {
    const input = this.input;
    const len = input.length;
    while (this.pos < len) {
      let lookahead = this.pos;
      while (lookahead < len && isHorizontalWhitespace(input.charCodeAt(lookahead))) {
        lookahead++;
      }
      const code = input.charCodeAt(lookahead);
      if (code === 0x0d && input.charCodeAt(lookahead + 1) === 0x0a) {
        this.pos = lookahead + 2;
      } else if (code === 0x0a || code === 0x0d) {
        this.pos = lookahead + 1;
      } else {
        break;
      }
    }
  }

  private peekDoubleNewline(): boolean {
    const input = this.input;
    let tempPos = this.pos;

    // First newline
    const code1 = input.charCodeAt(tempPos);
    if (code1 === 0x0d && input.charCodeAt(tempPos + 1) === 0x0a) {
      tempPos += 2;
    } else if (code1 === 0x0a) {
      tempPos += 1;
    } else {
      return false;
    }

    // Strict: only true contiguous newlines count as a paragraph break.
    // Ruby treats `newline + horizontal whitespace + newline` as two
    // separate single newlines (rendered as `<br>...<br>` inside the same
    // paragraph), not as a paragraph break.
    const code2 = input.charCodeAt(tempPos);
    return (
      code2 === 0x0a ||
      (code2 === 0x0d && input.charCodeAt(tempPos + 1) === 0x0a)
    );
  }

  private peekBlockElementAfterNewline(): boolean {
    const input = this.input;
    const code = input.charCodeAt(this.pos);
    let offset = 0;
    if (code === 0x0d && input.charCodeAt(this.pos + 1) === 0x0a) {
      offset = 2;
    } else if (code === 0x0a) {
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
    // Some block markers (h1., * item, etc.) are only structural at the
    // start of a line. Mid-line they are ordinary text. Bracketed tags
    // ([code], [/code], ...) break paragraphs regardless of position.
    const atLineStart =
      this.pos === 0 || this.input[this.pos - 1] === '\n';

    // Special handling for spoilers - only block if multiline
    if (this.testSticky(RE_SPOILER_OPEN)) {
      const spoilerMatch = this.matchSticky(RE_SPOILER_BLOCK_LOOSE);
      return spoilerMatch !== null && spoilerMatch[1].includes('\n');
    }

    // Closes for block containers only count as block markers when their
    // matching open is in scope. Outside of one, ruby treats them as
    // ordinary inline text and so do we (otherwise we infinite-loop in
    // parseBlock since no branch consumes them).
    if (this.quoteDepth > 0 && this.testSticky(RE_QUOTE_CLOSE))
      return true;
    if (this.sectionDepth > 0 && this.testSticky(RE_SECTION_CLOSE))
      return true;
    if (this.spoilerBlockDepth > 0 && this.testSticky(RE_STRAY_SPOILER_CLOSE))
      return true;

    // Colored quote opens like [quote=#00CCFF] count as block elements only
    // when the color is valid; invalid color attributes (e.g. [quote=Bob])
    // are treated as inline text by ruby and we mirror that.
    const coloredQuote = this.matchSticky(RE_QUOTE_COLOR_OPEN);
    if (coloredQuote && isValidQuoteColor(coloredQuote[1])) return true;

    for (const pattern of BLOCK_PATTERNS_STICKY) {
      if (this.testSticky(pattern)) return true;
    }
    if (atLineStart) {
      for (const pattern of LINE_START_PATTERNS_STICKY) {
        if (this.testSticky(pattern)) return true;
      }
    }
    return false;
  }

  protected looksLikeMarkup(): boolean {
    // `String.prototype.startsWith` accepts a position arg, so the four
    // literal-prefix checks need no slice. The textile-title regex uses the
    // sticky form anchored at this.pos for the same reason.
    const input = this.input;
    const pos = this.pos;
    return (
      input.startsWith('{{', pos) ||
      input.startsWith('[[', pos) ||
      input.startsWith('"http', pos) ||
      input.startsWith('<http', pos) ||
      this.testSticky(RE_TEXTILE_TITLE)
    ); // Match textile links like "text":url or "text":[url]
  }

  protected looksLikeIdPattern(): boolean {
    // `COMPILED_ID_PATTERN_STICKY` is exactly the same alternation that
    // `matchIdLink` uses to commit. Sharing it keeps the precheck and the
    // commit in lockstep (no drift) and replaces 23 freshly-allocated
    // RegExp objects per call with a single pre-compiled regex.
    return this.testSticky(DTextStateMachineParser.COMPILED_ID_PATTERN_STICKY);
  }

  // Link creation methods
  private createIdLink(match: IdMatch): LinkNode {
    // Past the per-document thumb limit ruby drops the thumb-placeholder
    // class and emits a plain post id-link, so swap idType to 'post' to
    // suppress the thumb-only attributes the renderer would otherwise add.
    // The actual node shape lives in `buildIdLink`; this wrapper just
    // resolves the budget question and delegates.
    let type = match.type;
    if (type === 'thumb') {
      this.thumbCount++;
      if (this.options.maxThumbs && this.thumbCount > this.options.maxThumbs) {
        type = 'post';
      }
    }
    return buildIdLink(type, match.id);
  }

  private createPostSearchLink(match: PostSearchMatch): LinkNode {
    // Pure construction lives in `buildPostSearchLink` so the markdown
    // adapter produces byte-identical post-search nodes without copying
    // the rules. `PostSearchMatch` is structurally identical to
    // `PostSearchInput`.
    return buildPostSearchLink(match);
  }

  private createWikiLink(match: WikiLinkInput): LinkNode {
    // Pure construction lives in `buildWikiLink` so the markdown adapter
    // produces byte-identical hrefs without copying the rules.
    return buildWikiLink(match);
  }

  // Builds a `LinkNode` for the dtext textile-style syntax (`"text":url` and
  // `"text":[url]`). The function's name describes its input shape, but the
  // AST tag it produces is the flavor-neutral `linkType: 'inline'` (shared
  // with the markdown adapter's `[text](url)` form).
  private createTextileLink(match: TextileLinkMatch): LinkNode {
    return {
      type: 'link',
      linkType: 'inline',
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
