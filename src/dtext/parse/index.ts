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
  TableLiteralNode,
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
  // Restrict inline tokenisation to ragel's `parse_basic_inline` machine
  // (lines 188-226): only b/i/s/u/sup/sub formatting is recognised; every
  // other char is literal text. Used for textile link titles, whose ragel
  // entrypoint routes through parse_basic_inline rather than the full
  // inline scanner. Implies inlineOnly.
  basicInline?: boolean;
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

// `BOUNDARY_CHARS` and `isBoundaryChar` live in `../url` so the formatter
// shares the same data; the lockstep comment there names the cross-module
// contract.

// Quote-color validity (oracle-verified):
//   * `#` followed by 3 to 6 hex digits, mixed case allowed
//   * lowercase color word (`^[a-z]+$`), covers common css names like yellow
//   * one of the tag-category aliases used elsewhere by ruby's dtext
//     renderer; matched case-insensitively, but original case is preserved
//     in the rendered class name.
const QUOTE_CATEGORY_RE =
  /^(gen(eral)?|art(ist)?|cont(ributor)?|char(acter)?|copy(right)?|spec(ies)?|inv(alid)?|meta|lor(e)?)$/i;

function isValidQuoteColor(value: string): boolean {
  if (QUOTE_CATEGORY_RE.test(value)) return true;
  // 3 to 6 hex digits inclusive after `#`; anything outside that range is
  // literal text (`#abcdefab` and `#1234567` both fail; oracle-verified).
  if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return true;
  if (/^[a-z]+$/.test(value)) return true;
  return false;
}

// Strip a single trailing boundary character from a URL. Ruby's dtext only
// peels one trailing punctuation off a URL, regardless of paren balance
// (oracle-verified):
//
//   https://x/a)        -> href "https://x/a", trailing ")"
//   https://x/a).       -> href "https://x/a)", trailing "."  (kept the paren)
//   https://x/a)),      -> href "https://x/a))", trailing ","
//   https://x/path...   -> href "https://x/path..", trailing "."
function trimUrlBoundaries(url: string): string {
  if (url.length === 0) return url;
  if (isBoundaryChar(url.charCodeAt(url.length - 1))) {
    return url.slice(0, -1);
  }
  return url;
}

// Append an inline node to a child list, merging into the previous text node
// when both are text. Inline collection points emit text nodes one parse step
// at a time, and the AST keeps adjacent text runs as a single TextNode.
// Used at every spot that builds an inline child list directly from
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
// own closing tag, mirroring ruby.
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
// shares the surrounding parser's depth counters and thumb count so list
// item / ltable cell content stays aware of its outer block context.
//
// Falls back to a single text node if parsing yields nothing useful.
function parseInlineString(input: string): InlineNode[] {
  if (input.length === 0) return [];
  const sub = new DTextStateMachineParser(input, {
    inlineOnly: true,
    basicInline: true,
  });
  const doc = sub.parse();
  const first = doc.children[0];
  if (first && first.type === 'paragraph' && first.children.length > 0) {
    return first.children;
  }
  return [{ type: 'text', content: input }];
}

// Ruby's dtext only accepts a textile-style "title":url link when the URL
// looks like an absolute path, a fragment, or an http(s) URL. Bare hostnames
// like `example.com/foo` or relative paths like `users/123` are left as
// literal text (oracle-verified).
function isAcceptedTextileUrl(url: string): boolean {
  if (url.length === 0) return false;
  if (url[0] === '/' || url[0] === '#') return url.length > 1;
  return /^https?:\/\//i.test(url);
}

// Sticky-flag (`/y`) regexes anchored at `this.pos`. Sticky regexes match
// only when their start equals `lastIndex`, so a leading `^` is implicit and
// the `this.input.slice(this.pos)` allocations vanish. Hoisted to module
// scope so each pattern compiles once per process.
// Hot-path peek for `peekBlockElement`, which runs once per paragraph step
// and only needs the two-state question "is `[/spoiler]` at the cursor?".
// `scanStrayClose` is the general lookup, but its hit-object allocation
// isn't free in a loop this hot.
const RE_STRAY_SPOILER_CLOSE = /\[\/spoilers?\]/iy;
// Backing regex for `scanStrayClose`. Matches any of the three block-close
// kinds whose stray behaviour is grammar-specified (`spoilers?`, `code`,
// `table`). The captured group is the tag-name fragment; the scanner
// normalises it to a `StrayKind`.
const RE_STRAY_CLOSE_ANY = /\[\/(spoilers?|code|table)\]/iy;

type StrayKind = 'spoiler' | 'code' | 'table';

interface StrayCloseHit {
  kind: StrayKind;
  /** Byte position of the close tag's `[` in `this.input`. */
  closePos: number;
  /** Byte position just past the close tag's `]` in `this.input`. */
  endPos: number;
  /** Verbatim slice from `this.pos` to `closePos` (the leading newline run). */
  prefix: string;
  /** The matched close tag text, case-preserved. */
  closeText: string;
}
const RE_QUOTE_COLOR_OPEN = /\[quote=([^\]\n]*)\]/iy;
const RE_HEADER = /h([123456])\.[ \t]*/iy;
// Content runs to the first true line terminator (`\n` / `\r\n`). A bare
// `\r` is allowed inside the content; the inline scanner converts it to a
// single space (mirroring ruby's `'\r' => append(' ')` rule). Excluding
// `\r` here would split an item like `* "x":[/a\rb]\n` mid-content and let
// the surrounding parser reinterpret `b]` as a fresh paragraph.
const RE_LIST_ITEM = /(\*+)[ \t]+([^\n]+?)(?=\r?\n|$)/y;
const RE_INTERNAL_ANCHOR = /\[#([a-zA-Z0-9_-]+)\]/y;
const RE_POST_SEARCH = /\{\{([^}]*)\}\}/y;
const RE_WIKI_LINK = /\[\[([^\]]*)\]\]/y;
const RE_TEXTILE_BRACKETED = /"([^"]+)":\[([^\]]+)\]/y;
// Ragel `basic_textile_link = '"' nonquote+ '":' (url | internal_url)` and
// both URL forms use `^space+` with POSIX `space` (ASCII whitespace only).
// `\S` would over-eagerly terminate at Unicode whitespace like NBSP.
const RE_TEXTILE_BASIC = /"([^"]+)":([^ \t\n\r\f\v]+)/y;
// Ragel `url = 'http'i 's'i? '://' ^space+;` — POSIX `space` is ASCII
// whitespace only (` \t\n\r\f\v`). Unicode spaces like NBSP do not
// terminate the URL; `\S` would over-eagerly stop at them.
const RE_URL = /https?:\/\/[^ \t\n\r\f\v]+/iy;
// Ragel `delimited_url = '<' url '>'` with `url = 'http'... '://' ^space+`
// where POSIX `space` includes ASCII tab. A tab inside the `<…>` therefore
// kills the delimited form (the `url` terminates and the `>` is never
// reached), and the fallback fires (literal `<` + bare-url + literal tail).
// `[^>]` would slurp the tab into one big anchor.
const RE_DELIMITED_URL = /<(https?:\/\/[^ \t\n\r\f\v>]+)>/iy;
const RE_COLOR_OPEN = /\[color=([^\]]+)\]/iy;
const RE_SECTION_EXPANDED_TITLE = /\[section,expanded=([^\]]+)\]/iy;
const RE_SECTION_TITLE = /\[section=([^\]]+)\]/iy;
const RE_SPOILER_BLOCK = /\[(spoilers?)\]([\s\S]*?)\[\/\1\]/iy;
// Peek-only variant: matches `[spoiler]...[/spoiler...]` with the close form
// independent of the open form (used by peekBlockElement, which only cares
// whether some close exists ahead).
const RE_SPOILER_BLOCK_LOOSE = /\[spoilers?\]([\s\S]*?)\[\/spoilers?\]/iy;
const RE_SPOILER_OPEN = /\[spoilers?\]/iy;
const RE_QUOTE_CLOSE = /\[\/quote\]/iy;
const RE_SECTION_CLOSE = /\[\/section\]/iy;
const RE_TEXTILE_TITLE = /"[^"]+":/y;

// Inline-spoiler close forms. Ragel's `spoilers_close = '[/spoiler' 's'? ']'i`
// pair-matches by depth (dstack), not by spelling: an opener of either form
// pairs with a closer of either form. The longer pattern is listed first so
// `matchAnyClose` would prefer it if the two ever shared a prefix; today they
// are disjoint and order is moot.
const INLINE_SPOILER_CLOSES: readonly string[] = ['[/spoilers]', '[/spoiler]'];

// Block-context patterns shared by `peekBlockElement`. Hoisted so the array
// isn't rebuilt and the regexes aren't recompiled on every paragraph step.
//
// The `[section...]` pattern is intentionally restrictive: it matches only
// the four forms `matchSection` will commit to (`[section]`,
// `[section,expanded]`, `[section,expanded=title]`, `[section=title]`). A
// permissive `\[section/i` would peek-true on malformed openers like
// `[section,]` / `[section=]`, which `matchSection` would then reject,
// leaving `parseBlock` unable to advance and the document loop spinning.
const BLOCK_PATTERNS_STICKY: readonly RegExp[] = [
  /\[quote\]/iy,
  /\[code\]/iy,
  /\[\/code\]/iy,
  /\[section(?:\]|,expanded(?:=[^\]]+)?\]|=[^\]]+\])/iy,
  /\[table\]/iy,
  /\[\/table\]/iy,
  /\[ltable\]/iy,
];

// True if `input` contains a code unit that can't be encoded to valid
// UTF-8: a NUL byte (U+0000) or a lone UTF-16 surrogate. A high surrogate
// (U+D800-U+DBFF) must be followed by a low surrogate (U+DC00-U+DFFF); a
// low surrogate without a preceding high is also unpaired. Valid surrogate
// pairs (e.g. the two halves of an emoji) pass through.
function hasUnencodableScalar(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c === 0x0000) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i++;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

// Split a string on `|` characters not preceded by a backslash. Mirrors
// ruby's `row.split(/(?<!\\)\|/)` inside `preprocess_for_tables`. Whitespace
// is NOT collapsed; the spaces hugging a `|` belong to the cells around it.
//
// Ruby's `String#split` without an explicit limit drops trailing empty
// strings: `"|".split("|")` is `[]`, `"a|".split("|")` is `["a"]`. JS's
// `String.prototype.split` keeps them. Mirror Ruby's behaviour after the
// split so a row that's just `|` (or `a|b|`) produces zero / fewer cells.
function splitOnUnescapedPipe(line: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    if (line.charCodeAt(i) !== 0x7c /* | */) continue;
    if (i > 0 && line.charCodeAt(i - 1) === 0x5c /* \ */) continue;
    out.push(line.slice(start, i));
    start = i + 1;
  }
  out.push(line.slice(start));
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

// Ruby `dtext.rb` runs `preprocess_for_tables` *before* the Ragel parser
// runs at all: every `[ltable]...[/ltable]` (case-insensitive, dotall,
// non-greedy) is replaced inline with a synthesised `[table]...[/table]`,
// turning the legacy form into a regular table the C parser can consume
// directly. We mirror that pass here so quirks like a URL inside an
// `[ltable]` cell consuming past the synthesised `[/table]` into the source
// tail (e.g. trailing `,` or `.`) reproduce — the URL pattern is greedy
// and only the input-level rewrite leaves the tail reachable from inline
// scope.
//
// The returned `ltableStarts` set records each synthesised `[table]` open's
// offset in the rewritten string; the parser uses it to wrap the resulting
// `TableNode` as an `LTableNode` so the AST round-trip back to `[ltable]`
// survives.
function preprocessLTables(input: string): {
  result: string;
  ltableSources: Map<number, string>;
} {
  // Position-in-rewritten-input → original (trimmed) `[ltable]` contents.
  // The parser uses the position to recognise its synthesised `[table]`
  // opens and stashes the source string on the resulting `LTableNode` so
  // the formatter can re-emit the exact `[ltable]` body verbatim.
  const ltableSources = new Map<number, string>();
  const openRe = /\[ltable\]/gi;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(input)) !== null) {
    result += input.slice(cursor, match.index);
    const contentStart = match.index + match[0].length;
    const closeRe = /\[\/ltable\]/gi;
    closeRe.lastIndex = contentStart;
    const closeMatch = closeRe.exec(input);
    const contentEnd = closeMatch !== null ? closeMatch.index : input.length;
    const nextCursor =
      closeMatch !== null
        ? closeMatch.index + closeMatch[0].length
        : input.length;
    const contents = input.slice(contentStart, contentEnd).trim();

    ltableSources.set(result.length, contents);
    result += '[table]';

    if (contents.length > 0) {
      const lines = contents.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const cols = splitOnUnescapedPipe(lines[i]);
        const tag = i === 0 ? 'th' : 'td';
        let wrapped = '';
        for (const col of cols) {
          wrapped += `[${tag}]${col}[/${tag}]`;
        }
        if (i === 0) {
          result += `[thead][tr]${wrapped}[/tr][/thead][tbody]`;
        } else {
          result += `[tr]${wrapped}[/tr]`;
        }
      }
      result += '[/tbody]';
    }
    result += '[/table]';

    cursor = nextCursor;
    openRe.lastIndex = nextCursor;
  }
  result += input.slice(cursor);
  return { result, ltableSources };
}

// Container-tag scanner used by `findContainerCloseInItem` to walk a
// list-item's text body looking for opens/closes that should truncate the
// item at the offset of a matching close. Hoisted so V8 keeps a single
// compiled regex across all calls; `lastIndex` is reset at the call site
// since this is the only `/g`-style scanner here.
//
// The `(?<!\[)` lookbehind keeps `[[table]]` (a wiki link to "table")
// from being misread as a `[table]` block opener: a `[` preceded by
// another `[` is a wiki-link delimiter, not a container tag. Same for
// `[[code]]`, `[[section]]`, etc.
const RE_CONTAINER_TAG_GLOBAL =
  /(?<!\[)\[(\/?)(section|quote|spoilers?|code|ltable|table)\b[^\]]*\]/gi;

// Line-start-only patterns: structural at column 0, ordinary text mid-line.
//
// The list pattern requires `\*+`, then horizontal whitespace `[ \t]+`, then
// a single non-whitespace char `\S` for the content. Both narrowings matter:
// a `\s+` separator would match a bare `*\n` line and eat the next line as
// item content (matchListItem would then disagree, looping forever); a bare
// `[ \t]+` without the trailing `\S` would peek-true on `** \n` (spaces but
// no content after), which matchListItem would also reject. Both failure
// modes are oracle-observed.
const LINE_START_PATTERNS_STICKY: readonly RegExp[] = [
  /h[123456]\./iy,
  /\*+[ \t]+\S/y,
];

export class DTextStateMachineParser {
  protected input: string;
  protected pos: number;
  private options: ParserOptions;
  private thumbCount: number;
  // Combined nesting depth of open [sup]/[sub] containers. Ruby caps this
  // at 3; further opens are dropped (their close tags vanish too).
  private supSubDepth: number = 0;
  private static readonly SUP_SUB_MAX_DEPTH = 3;
  // Depth of open block containers. A close tag only acts as a scope killer
  // / block break when its depth is > 0; otherwise ruby treats it as literal
  // text. Required to avoid infinite loops on stray closes at the document
  // root.
  private quoteDepth: number = 0;
  private sectionDepth: number = 0;
  private spoilerBlockDepth: number = 0;
  // Depth of open inline `[spoiler]...[/spoiler]` containers. Used to gate
  // the `newline* spoilers_close` literal-eating rule so it only fires when
  // the close ahead is genuinely stray (no enclosing inline-spoiler will
  // claim it as its matching close).
  private inlineSpoilerDepth: number = 0;
  // True while parseHeader is mid-flight. Ragel's inline `newline{2,}` rule
  // always `fret`s, so a paragraph break propagates up through any nested
  // inline scope and main's `newline{2,}` then closes the leaf blocks (the
  // open `<h1>`). When this flag is set, inline containers exit on `\n\n`
  // instead of swallowing the blank lines via consumeBlankLines.
  private headerDepth: number = 0;
  // Offsets in `this.input` at which a synthesised `[table]` open started
  // life as an `[ltable]` open. The parser wraps the resulting `TableNode` as
  // an `LTableNode` at exactly these positions so the round-trip back to
  // `[ltable]` source survives (`preprocessLTables` did the textual swap).
  private ltableSources: Map<number, string>;

  // Single compiled regex for all ID patterns. Ruby requires exactly one
  // ASCII space or NBSP between the prefix word and `#` (oracle-verified:
  // `pool#1234`, `pool  #1234`, and `pool\t#1234` all stay literal, while
  // `pool #1234` and `pool #1234` link).
  private static readonly COMPILED_ID_PATTERN = new RegExp(
    '^(' + ID_PATTERNS.map((p) => p.pattern).join('|') + ') #(\\d+)',
    'i',
  );

  // Sticky-flag twin of `COMPILED_ID_PATTERN`. Used by `matchIdLink` and
  // `looksLikeIdPattern` so the precheck and the actual match share one
  // alternation regex. `^` is dropped since sticky already anchors to
  // `lastIndex`.
  private static readonly COMPILED_ID_PATTERN_STICKY = new RegExp(
    '(' + ID_PATTERNS.map((p) => p.pattern).join('|') + ') #(\\d+)',
    'iy',
  );

  constructor(input: string, options: ParserOptions = {}) {
    // Ruby's dtext rejects an input that contains a byte / code-unit it
    // cannot encode as valid UTF-8 ("invalid byte sequence in UTF-8") and
    // the oracle response carries `html: undefined`. Two cases hit this:
    //   * NUL (U+0000) — a control byte ruby refuses outright.
    //   * Lone UTF-16 surrogates (U+D800-U+DFFF unpaired) — these don't
    //     correspond to a Unicode scalar value at all; a JS engine can hold
    //     them in a 16-bit string but they cannot survive UTF-8 encoding.
    //     Valid surrogate PAIRS (e.g. emoji like `🎉` stored as a high+low
    //     pair) stay through this filter.
    // Either kind of byte can't appear literally in our rendered HTML
    // either, so blank the whole input to mirror oracle's `''` fallback.
    const sanitised = hasUnencodableScalar(input) ? '' : input;
    const { result, ltableSources } = preprocessLTables(sanitised);
    this.input = result;
    this.ltableSources = ltableSources;
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
      // Pristine flag for the code/table close path means "no block has been
      // emitted yet" at document root, so the synthesised `<p></p>` only
      // shows up before the very first block.
      if (this.consumeStrayCloseIfPresent(children, children.length === 0)) {
        continue;
      }

      // Don't strip leading horizontal whitespace here. Ruby treats indented
      // lines as ordinary paragraph content, so a line like "    body" should
      // produce `<p>    body</p>`, and a "blank" line that has horizontal
      // whitespace between two newlines is two single `<br>`s, not a
      // paragraph break. Only a true contiguous `\n\n` collapses at the top
      // level (the actual paragraph-break separator).
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

  // Locate a stray block-close tag at or near the cursor. Read-only; never
  // mutates `this.pos`. With `acrossNewlines: true` the scanner steps past
  // any number of leading `\r` / `\n` (CRLF counts as two steps) before
  // looking for the close tag; horizontal whitespace is never spanned, since
  // none of the ragel rules this scanner backs do that.
  //
  // The `kinds` set filters which close types qualify. Scope-awareness (a
  // `[/spoiler]` reached while a matching block-spoiler open is in scope is
  // *not* stray) is the caller's responsibility: most callers gate on
  // `this.spoilerBlockDepth === 0` before scanning, but `parseParagraph`'s
  // trailing-newline check intentionally wants to defer to the outer handler
  // regardless of scope. Keeping the gate out of the scanner lets each
  // caller spell its own policy.
  private scanStrayClose(opts: {
    kinds: ReadonlyArray<StrayKind>;
    acrossNewlines?: boolean;
  }): StrayCloseHit | null {
    const input = this.input;
    let p = this.pos;
    if (opts.acrossNewlines) {
      while (p < input.length) {
        const code = input.charCodeAt(p);
        if (code === 0x0a || code === 0x0d) {
          p++;
          continue;
        }
        break;
      }
    }
    RE_STRAY_CLOSE_ANY.lastIndex = p;
    const m = RE_STRAY_CLOSE_ANY.exec(input);
    if (!m || m.index !== p) return null;
    const matched = m[1].toLowerCase();
    let kind: StrayKind;
    if (matched === 'code' || matched === 'table') kind = matched;
    else kind = 'spoiler';
    if (!opts.kinds.includes(kind)) return null;
    return {
      kind,
      closePos: p,
      endPos: p + m[0].length,
      prefix: input.slice(this.pos, p),
      closeText: m[0],
    };
  }

  // True at a `[/spoiler]` or `[/spoilers]` close tag whose matching open is
  // NOT in scope. Such a close is a Ragel "scope killer" that ruby treats as
  // a paragraph break plus literal-text fallout. Stray `[/quote]`,
  // `[/ltable]`, and `[/section]` closes do NOT trigger this; they stay as
  // plain inline text inside the paragraph (oracle-verified).
  private peekStrayBlockClose(): boolean {
    if (this.spoilerBlockDepth > 0) return false;
    return this.scanStrayClose({ kinds: ['spoiler'] }) !== null;
  }

  // True at a stray `[/code]` or `[/table]`. Their behaviour differs from
  // stray spoiler closes: ruby eats whitespace and newlines around the tag,
  // emits an implicit `<p></p>` at pristine state, and renders the following
  // inline tail without a `<p>` wrap (oracle-verified).
  private peekStrayCodeOrTableClose(): boolean {
    return this.scanStrayClose({ kinds: ['code', 'table'] }) !== null;
  }

  // Consume a stray `[/code]` or `[/table]`. `pristine` is true when the
  // surrounding container has not emitted any block yet, in which case ruby
  // synthesises an empty paragraph before the close.
  private consumeStrayCodeTableAsLiteral(pristine: boolean): LiteralHtmlNode {
    const hit = this.scanStrayClose({ kinds: ['code', 'table'] });
    if (!hit) return { type: 'literal_html', prefix: '', children: [] };
    this.pos = hit.endPos;
    // Ragel `'[/code]'i space*` / `'[/table]'i space*` — POSIX `space`
    // (covers VT and FF as well as space/tab/CR/LF).
    this.skipPosixSpace();
    const children: InlineNode[] = [];
    let exitedOnContainerClose = false;
    while (this.pos < this.input.length) {
      if (this.peekDoubleNewline()) break;
      // Break on an in-scope container close ([/quote], [/section],
      // [/spoiler]) so the surrounding container can pick it up. Without
      // this the inline-tail loop would eat the close as plain text and
      // the closing block would never render.
      if (this.peekContainerClose()) {
        exitedOnContainerClose = true;
        break;
      }
      // A line-start-only marker (h1., * item) on the next line is a fresh
      // block — break before the newline so the outer block loop can pick
      // it up cleanly. Without this `* a [/code]\n* b\n` would let the
      // inline tail swallow `\n* b` as `<br>* b<br>` instead of opening a
      // new `<ul>`. Ragel's inline `[/code]` rule explicitly closes the
      // list (`dstack_close_list`), and the trailing `* b\n` then enters
      // main at column 0 as a fresh list_item.
      if (this.peekNewline() && this.peekLineStartMarkerAfterNewline()) break;
      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
    }
    // A `\n` immediately before a container close should not render as a
    // `<br>` (ruby closes the wrapper cleanly there). At EOF or a paragraph
    // break the trailing `<br>` is kept — oracle: `[/table] a\n` ends with
    // `<br>` because ruby's inline `newline` rule emits one for the
    // terminating line.
    if (exitedOnContainerClose) trimTrailingLineBreaks(children);
    const prefix = (pristine ? '<p></p>' : '') + hit.closeText;
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
  // block has been emitted. Oracle-verified:
  // `[/spoiler] alone at start` becomes `<p> alone at start</p>` and
  // `[/spoiler]\n\nafter` becomes `<p>after</p>`.
  private consumeStrayBlockCloseSilent(): void {
    const hit = this.scanStrayClose({ kinds: ['spoiler'] });
    if (hit) this.pos = hit.endPos;
  }

  // Emit a stray block-close after content. The leading `prefix` (any inter
  // block whitespace and the close tag itself) is rendered verbatim; the
  // tail is parsed as inline content so id-links, wiki links, and formatting
  // still resolve after the close. Newlines in the tail render as `<br>` via
  // the normal LineBreakNode path. Tail collection stops at a paragraph
  // break (`\n\n`) or at an in-scope `[/quote]` / `[/section]` so the
  // surrounding container can resume normally.
  private consumeStrayBlockCloseAsLiteral(prefix = ''): LiteralHtmlNode {
    const hit = this.scanStrayClose({ kinds: ['spoiler'] });
    if (!hit) return { type: 'literal_html', prefix, children: [] };
    this.pos = hit.endPos;
    const fullPrefix = prefix + hit.closeText;
    const children: InlineNode[] = [];
    let exitedOnContainerClose = false;
    while (this.pos < this.input.length) {
      if (this.peekContainerClose()) {
        exitedOnContainerClose = true;
        break;
      }
      // Mirror parseParagraph's break-set so the surrounding block loop can
      // pick up downstream block markers. Two cases:
      //   1. Bracketed always-block tags (`[code]`, `[table]`, ...) at the
      //      cursor: break now. A preceding `\n` already became a `<br>`.
      //   2. Line-start-only markers (`h1.`, `* item`) after a single
      //      newline: break BEFORE consuming the `\n` so the surrounding
      //      block parser absorbs it (otherwise the header would render
      //      with a stray `<br>` ahead of it).
      // Bracketed tags after a `\n` aren't handled here on purpose: the
      // newline first emits a `<br>` via parseInlineElement, then the next
      // iteration's peekBlockElement catches the tag at line start.
      if (this.peekBlockElement()) break;
      if (this.peekNewline() && this.peekLineStartMarkerAfterNewline()) break;
      // Ragel's inline `newline* spoilers_close` is a SINGLE token: a stray
      // `[/spoiler]` after one or more (including doubled) newlines is
      // appended verbatim by `dstack_close_block`'s else-branch. Mirror that
      // before the paragraph-break check below — otherwise `\n\n[/spoiler]`
      // hits peekDoubleNewline first and the second stray close is dropped.
      if (this.peekNewline()) {
        const consumed = this.consumeNewlinesIfFollowedByStraySpoilerClose();
        if (consumed !== null) {
          pushInlineMergingText(children, { type: 'text', content: consumed });
          continue;
        }
      }
      if (this.peekDoubleNewline()) break;
      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
    }
    if (exitedOnContainerClose) trimTrailingLineBreaks(children);
    return { type: 'literal_html', prefix: fullPrefix, children };
  }

  // True if a `[/spoiler]` sits past any leading newlines. Used by
  // parseParagraph's trailing-newline decision and intentionally ungated:
  // the newlines should defer to the outer handler whether the close is
  // structurally stray or a genuine block-spoiler close.
  private peekStrayBlockCloseAfterAnyWs(): boolean {
    return (
      this.scanStrayClose({ kinds: ['spoiler'], acrossNewlines: true }) !== null
    );
  }

  // Look ahead through zero or more newlines starting at pos. If a stray
  // spoiler close sits past them, return the literal newline prefix so the
  // caller can hand it to consumeStrayBlockCloseAsLiteral, and advance pos
  // to the close. Otherwise return null and leave pos unchanged. Horizontal
  // whitespace is NOT skipped: ruby's block-scope rule treats a leading
  // space/tab as content that opens a paragraph, not as part of the stray
  // close's prefix.
  private peekStrayBlockCloseAfterWhitespace(): string | null {
    if (this.spoilerBlockDepth !== 0) return null;
    const hit = this.scanStrayClose({
      kinds: ['spoiler'],
      acrossNewlines: true,
    });
    if (!hit) return null;
    this.pos = hit.closePos;
    return hit.prefix;
  }

  // Consume a stray block close tag at the current block-loop boundary, if
  // one is sitting there. Returns `true` when something was consumed (the
  // caller should `continue` its loop); `false` to let the caller proceed to
  // `parseBlock()`. Captures the three-way dispatch shared by the document
  // loop and every container-block parser:
  //
  //   - `[/spoiler]` past zero or more newlines, after a block whose inline
  //     scope was still open at the close (paragraph, list): emitted as a
  //     literal-html fallout carrying the newline prefix. This mirrors
  //     ruby's inline `newline* spoilers_close` rule, which appends the
  //     matched range verbatim when no block-spoiler is on the dstack.
  //   - `[/spoiler]` past zero or more newlines, after a fully-closed block
  //     (code, table, header, quote, section, spoiler block, ltable): the
  //     close is silently dropped, mirroring ruby's block-scope spoilers_close
  //     rule which does nothing when no block-spoiler is on the dstack.
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
      const lastLeftInlineOpen =
        last.type === 'paragraph' || last.type === 'list';
      const prefix = this.peekStrayBlockCloseAfterWhitespace();
      if (prefix !== null) {
        if (lastLeftInlineOpen) {
          children.push(this.consumeStrayBlockCloseAsLiteral(prefix));
        } else {
          this.consumeStrayBlockCloseSilent();
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

    if (this.peekString('[table]', true)) {
      const ltableSource = this.ltableSources.get(this.pos);
      this.matchString('[table]', true);
      const tableNode = this.parseTable();
      if (ltableSource !== undefined) {
        return {
          type: 'ltable',
          children: tableNode.children,
          source: ltableSource,
        };
      }
      return tableNode;
    }

    const listMatch = this.matchListItem();
    if (listMatch) {
      return this.parseList(listMatch);
    }

    return this.parseParagraph();
  }

  private parseHeader(level: number): HeaderNode {
    const children: InlineNode[] = [];

    this.headerDepth++;
    try {
      while (this.pos < this.input.length) {
        if (this.peekNewline()) {
          // Ruby's inline scanner has `newline* spoilers_close` as a single
          // token: a stray `[/spoiler]` (with any number of leading newlines)
          // is appended verbatim into the open header, and the header stays
          // open. Other stray block-closes (`[/code]`, `[/table]`) lack the
          // `newline*` prefix in the grammar, so they don't get this
          // treatment — the bare newline closes the header first.
          const consumed = this.consumeNewlinesIfFollowedByStraySpoilerClose();
          if (consumed !== null) {
            pushInlineMergingText(children, {
              type: 'text',
              content: consumed,
            });
            continue;
          }
          break;
        }
        // Ragel `header` calls `fcall inline`, and the inline scanner exits
        // (`fexec ts; fret;`) on bracketed always-block opens: `[code]`,
        // `[table]`, `[quote]`, `[section]`. The matching close stays
        // unconsumed so the surrounding block scope promotes it into a real
        // block. Stray `[/code]` / `[/table]` are NOT exits — they're absorbed
        // inline as literal text (mirrors parseInlineContainer).
        if (this.peekBlockElement() && !this.peekStrayCodeOrTableClose()) break;
        const node = this.parseInlineElement();
        if (node) pushInlineMergingText(children, node);
      }
    } finally {
      this.headerDepth--;
    }

    this.consumeNewline();

    return { type: 'header', level, children };
  }

  // If the cursor sits on one or more consecutive newlines followed by a
  // stray `[/spoiler]` / `[/spoilers]`, consume both ranges and return the
  // verbatim slice. Otherwise return null and leave pos unchanged.
  private consumeNewlinesIfFollowedByStraySpoilerClose(): string | null {
    if (this.spoilerBlockDepth > 0) return null;
    const hit = this.scanStrayClose({
      kinds: ['spoiler'],
      acrossNewlines: true,
    });
    if (!hit || hit.prefix.length === 0) return null;
    const startPos = this.pos;
    this.pos = hit.endPos;
    return this.input.slice(startPos, hit.endPos);
  }

  // Recognise a coloured quote open like [quote=#00CCFF] or [quote=yellow]
  // and consume it, returning the raw colour token. Returns null and leaves
  // pos unchanged when the colour is invalid, so the surrounding parser can
  // fall through to inline-text handling.
  private matchQuoteColorOpen(): string | null {
    const m = this.matchSticky(RE_QUOTE_COLOR_OPEN);
    if (!m) return null;
    const color = m[1];
    if (!isValidQuoteColor(color)) return null;
    this.pos += m[0].length;
    return color;
  }

  private parseQuote(color?: string): QuoteNode {
    if (color === undefined) {
      // Ragel attaches `space*` (POSIX space — includes VT/FF/CR/LF) ONLY to
      // the plain `quote_open` rule. The colored / typed variants don't, so
      // any leading whitespace after `[quote=...]` belongs to the paragraph
      // that the surrounding scanner falls into. Eat POSIX space across the
      // bytes immediately after `[quote]` and one optional newline + blank
      // lines + an indent on the first content line.
      this.skipPosixSpace();
      this.consumeNewline();
      // Strip blank lines only at the very top of the container; once content
      // starts, a whitespace-only line becomes a real <p> </p> paragraph
      // (oracle-verified).
      this.skipBlankLines();
      // Drop horizontal whitespace at the start of the first content line.
      // Ragel's `quote_open space*` consumes all post-open whitespace including
      // an indent on the next line; mirrors parseSpoilerBlock.
      this.skipPosixSpace();
    }

    const children: BlockNode[] = [];

    this.quoteDepth++;
    try {
      while (
        this.pos < this.input.length &&
        !this.peekString('[/quote]', true)
      ) {
        // Outer-container close in scope (e.g. a `[/section]` while we
        // are nested inside an unclosed quote inside a section) means
        // this quote is implicitly terminated. Bail so the outer scope
        // can consume its own close; otherwise parseBlock falls through
        // to parseParagraph, which breaks at the same peekBlockElement
        // and emits an empty paragraph each loop, spinning forever.
        if (this.peekOuterContainerClose('quote')) break;
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
    // Ragel `spoilers_open space*` — POSIX `space` (includes VT/FF).
    this.skipPosixSpace();
    this.consumeNewline();
    this.skipBlankLines();
    // Drop horizontal whitespace at the start of the first content line.
    // Oracle-verified: `[spoiler]\n  hi\n[/spoiler]` ->
    // `<div class="spoiler"><p>hi</p></div>` (the two leading spaces are
    // gone). Subsequent lines preserve indentation, so this only fires here,
    // not inside the block loop.
    this.skipPosixSpace();

    const children: BlockNode[] = [];

    this.spoilerBlockDepth++;
    try {
      while (this.pos < this.input.length && !this.peekSpoilerClose()) {
        if (this.peekOuterContainerClose('spoiler')) break;
        if (this.consumeStrayCloseIfPresent(children, false)) continue;
        const node = this.parseBlock();
        if (node) {
          children.push(node);
        }
      }
    } finally {
      this.spoilerBlockDepth--;
    }
    // Ruby's `spoilers_close` rule (block + inline) consumes only the
    // close tag itself; unlike `[/quote]` and `[/section]` (whose rules
    // include a `ws*` trailing run), it eats no horizontal whitespace
    // and no trailing newline. Letting the next byte fall through means a
    // run like `[/spoiler] tail` keeps the leading space for the
    // surrounding container's paragraph.
    this.matchSpoilerClose();

    return { type: 'spoiler_block', children };
  }

  private peekSpoilerClose(): boolean {
    return (
      this.peekString('[/spoiler]', true) ||
      this.peekString('[/spoilers]', true)
    );
  }

  private parseCodeBlock(): CodeBlockNode {
    // Ruby's `[code] space*` open eats all whitespace (including newlines)
    // after the open tag. POSIX `space*` is greedy across the mixed set
    // ` \t\n\r\f\v`, so `[code]  \n  \nbody[/code]` consumes every byte
    // through the leading run, not just one indent + one newline.
    while (this.pos < this.input.length) {
      const code = this.input.charCodeAt(this.pos);
      if (
        code === 0x20 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0d ||
        code === 0x0b ||
        code === 0x0c
      ) {
        this.pos++;
        continue;
      }
      break;
    }

    const start = this.pos;
    let closed = false;

    while (this.pos < this.input.length) {
      if (this.matchString('[/code]', true)) {
        closed = true;
        break;
      }
      this.pos++;
    }

    // Only trim the close-tag length when one was actually consumed. Falling
    // off the end without seeing [/code] means everything from start..pos is
    // the body (oracle-verified: an unclosed [code] keeps trailing text,
    // brackets, and newlines literal).
    const content = closed
      ? this.input.slice(start, this.pos - '[/code]'.length)
      : this.input.slice(start);
    // Ruby's `[/code]` rule (in code scope) consumes only the close tag —
    // no trailing horizontal whitespace, no trailing newline. The outer
    // block loop is responsible for eating any subsequent newline; leading
    // horizontal whitespace becomes content for the next paragraph (e.g.
    // `[code]c[/code] tail` -> `<pre>c</pre><p> tail</p>`).

    return { type: 'code_block', content };
  }

  private parseRawBlockClose(tag: string): RawBlockTextNode {
    this.matchString(tag, true);
    this.consumeBlockCloseTail();
    return { type: 'raw_block_text', content: tag };
  }

  private parseSection(sectionMatch: SectionMatch): SectionNode {
    // Ragel attaches `space*` (POSIX, includes VT/FF) to ALL four
    // section-open variants (plain, expanded, aliased, aliased+expanded).
    this.skipPosixSpace();
    this.consumeNewline();
    this.skipBlankLines();
    // Drop horizontal whitespace at the start of the first content line.
    // Ragel's `section_open space*` consumes all post-open whitespace
    // including an indent on the next line; mirrors parseSpoilerBlock.
    this.skipPosixSpace();

    const children: BlockNode[] = [];

    this.sectionDepth++;
    try {
      while (
        this.pos < this.input.length &&
        !this.peekString('[/section]', true)
      ) {
        if (this.peekOuterContainerClose('section')) break;
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

  // Inside the table scanner, ruby's Ragel rules for `[/tr]` / `[/thead]` /
  // `[/tbody]` call `dstack_close_block`, which appends the matched text
  // verbatim when the type isn't on top of the dstack. `[/th]` and `[/td]`
  // have no rule in table scope at all and are silently swallowed by `any`.
  // This consume mirrors both behaviours so stray closes reach the AST as
  // `table_literal` nodes (literal emission) or just vanish (silent drop).
  // Returns null when no stray-close pattern matched and the cursor is
  // untouched.
  private consumeStrayTableClose(): { literal: string } | null {
    const saved = this.pos;
    if (
      this.matchString('[/tr]', true) ||
      this.matchString('[/thead]', true) ||
      this.matchString('[/tbody]', true)
    ) {
      return { literal: this.input.slice(saved, this.pos) };
    }
    if (this.matchString('[/th]', true) || this.matchString('[/td]', true)) {
      return { literal: '' };
    }
    return null;
  }

  private parseTable(): TableNode {
    const children: (
      | TableHeadNode
      | TableBodyNode
      | TableRowNode
      | TableLiteralNode
    )[] = [];

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
      } else if (
        this.peekString('[td]', true) ||
        this.peekString('[th]', true)
      ) {
        // Orphan cells directly inside `[table]` (no `[tr]` / `[tbody]`
        // wrapper). Oracle emits them as bare `<td>` children of
        // `<table>`, which parse5 then canonicalises into a synthetic
        // `<tbody><tr>...</tr></tbody>`. parseLooseTableRow produces the
        // same canonical shape on the dmark side. Symmetric with the
        // orphan-cell handling in parseTableBody and parseTableHead.
        children.push(this.parseLooseTableRow());
      } else {
        const stray = this.consumeStrayTableClose();
        if (stray !== null) {
          if (stray.literal) {
            children.push({ type: 'table_literal', content: stray.literal });
          }
        } else {
          this.pos++;
        }
      }

      this.skipWhitespace();
    }

    return { type: 'table', children };
  }

  private parseTableHead(): TableHeadNode {
    const rows: (TableRowNode | TableLiteralNode)[] = [];

    this.skipWhitespace();

    while (
      this.pos < this.input.length &&
      !this.matchString('[/thead]', true)
    ) {
      this.skipWhitespace();

      // Bail back to parseTable on a sibling section opener so the outer
      // loop can emit `</thead><thead>` / `</thead><tbody>` rather than
      // merging rows into one giant thead. Mirrors parseTableBody's
      // nested-[thead] handling but in the opposite direction; necessary
      // for sources like `[table][thead]row1[table][thead]row2`.
      if (
        this.peekString('[thead]', true) ||
        this.peekString('[tbody]', true) ||
        this.peekString('[table]', true)
      ) {
        break;
      }

      if (this.matchString('[tr]', true)) {
        rows.push(this.parseTableRow());
      } else if (
        this.peekString('[th]', true) ||
        this.peekString('[td]', true)
      ) {
        // Authors sometimes write `[thead][th]a[/th][th]b[/th][/thead]`
        // (orphan cells without a `[tr]` wrapper). Oracle auto-wraps them
        // in an implicit row; mirror that here. Symmetric with the
        // parseTableBody handling of orphan cells.
        rows.push(this.parseLooseTableRow());
      } else {
        const stray = this.consumeStrayTableClose();
        if (stray !== null) {
          if (stray.literal) {
            rows.push({ type: 'table_literal', content: stray.literal });
          }
        } else {
          this.pos++;
        }
      }

      this.skipWhitespace();
    }

    return { type: 'table_head', rows };
  }

  private parseTableBody(): TableBodyNode {
    const rows: (TableRowNode | TableLiteralNode | TableHeadNode)[] = [];

    this.skipWhitespace();

    while (
      this.pos < this.input.length &&
      !this.matchString('[/tbody]', true)
    ) {
      this.skipWhitespace();

      // Bail back to parseTable on a sibling [tbody] or redundant
      // [table] opener so the outer loop can re-segment the table.
      // A nested [thead] is kept inline (see below) because oracle
      // emits `<thead>` inside `<tbody>` for that source, and parse5
      // canonicalises both forms to the same split-tbody shape.
      if (
        this.peekString('[tbody]', true) ||
        this.peekString('[table]', true)
      ) {
        break;
      }

      if (this.matchString('[tr]', true)) {
        rows.push(this.parseTableRow());
      } else if (this.matchString('[thead]', true)) {
        // Nested [thead] inside [tbody]: the oracle opens an inline
        // <thead> element rather than closing the surrounding tbody.
        // parse5 normalises both sides identically when canonicalising,
        // so we mirror the same shape here.
        rows.push(this.parseTableHead());
      } else if (
        this.peekString('[td]', true) ||
        this.peekString('[th]', true)
      ) {
        // Source omitted the [tr]. Synthesise a row from the loose cells so
        // they still render. parse5 also auto-wraps orphan <td> children of
        // <tbody> in an implicit <tr>, so this matches the oracle's
        // serialised output under DOM normalisation.
        rows.push(this.parseLooseTableRow());
      } else {
        const stray = this.consumeStrayTableClose();
        if (stray !== null) {
          if (stray.literal) {
            rows.push({ type: 'table_literal', content: stray.literal });
          }
        } else {
          this.pos++;
        }
      }

      this.skipWhitespace();
    }

    return { type: 'table_body', rows };
  }

  private parseLooseTableRow(): TableRowNode {
    const cells: TableCellNode[] = [];

    while (this.pos < this.input.length) {
      // Skip inter-cell whitespace including newlines so that cells
      // separated by a `\n` (very common in pretty-printed tables) still
      // gather into one row. `skipWhitespace` alone only consumes spaces
      // and tabs, which would break the cell run at the first newline.
      this.skipWhitespace();
      while (this.peekNewline()) {
        if (this.input.charCodeAt(this.pos) === 0x0d) this.pos++;
        this.pos++;
        this.skipWhitespace();
      }
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
    let closedByTag = false;
    let inStrayAbsorb = false;

    while (this.pos < this.input.length) {
      if (inStrayAbsorb) {
        // Post-`\n\n` mode: ragel's inline `newline{2,}` rule fret-returns
        // to the table scope WITHOUT closing BLOCK_TD. The table machine has
        // no rule for `[/td]` / `[/th]` (silent), and treats `[/tr]` /
        // `[/thead]` / `[/tbody]` / `[/table]` as `dstack_close_block` calls
        // that, with the cell still on top of the dstack, append their
        // literal text to the cell's still-open output. We never re-enter
        // inline parsing here — that's what makes the trailing `b` of
        // `a\n\nb[/td][/tr][/table]` vanish.
        if (
          this.matchString('[/td]', true) ||
          this.matchString('[/th]', true)
        ) {
          continue;
        }
        if (this.matchString('[/tr]', true)) {
          pushInlineMergingText(children, { type: 'text', content: '[/tr]' });
          continue;
        }
        if (this.matchString('[/thead]', true)) {
          pushInlineMergingText(children, {
            type: 'text',
            content: '[/thead]',
          });
          continue;
        }
        if (this.matchString('[/tbody]', true)) {
          pushInlineMergingText(children, {
            type: 'text',
            content: '[/tbody]',
          });
          continue;
        }
        if (this.matchString('[/table]', true)) {
          pushInlineMergingText(children, {
            type: 'text',
            content: '[/table]',
          });
          continue;
        }
        this.pos++;
        continue;
      }

      if (this.matchString(endTag, true)) {
        closedByTag = true;
        break;
      }
      if (this.peekDoubleNewline()) {
        // Ragel `newline{2,} => dstack_close_list(); fexec ts; fret;` in the
        // inline scanner: a paragraph break inside an open cell exits inline
        // but leaves the cell on the dstack. Drop the `\n\n` and switch to
        // the stray-absorb branch above so downstream stray closes land as
        // literal text inside this cell.
        this.consumeBlankLines();
        inStrayAbsorb = true;
        continue;
      }
      const element = this.parseInlineElement();
      if (element) {
        children.push(element);
      } else {
        // If no inline element matched, consume one character as text
        this.pos++;
      }
    }

    // Ruby eats newlines run up to `[/td]` / `[/th]` via the `newline*`
    // prefix on the inline close rule, so a `\n[/td]` cell ends without a
    // trailing `<br>`. When the cell falls off the end of input instead
    // (e.g. a greedy URL inside the cell consumed past the close tag), the
    // trailing newline survived as a `<br>` in oracle output; keep it here.
    if (closedByTag) trimTrailingLineBreaks(children);

    return { type: 'table_cell', cellType, children };
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
        // Put back the consumed newline and any whitespace
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

    // After breaking on a stray spoiler close, leave trailing newlines for
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

    // Ragel `parse_basic_inline` (lines 188-226) only recognises b/i/s/u/
    // sup/sub formatting plus literal text. In basicInline mode (textile
    // link titles), skip the inline tokens that aren't part of that
    // machine; the formatting tags and parseText path stay live.
    const basic = this.options.basicInline === true;

    // Stray `[/code]` / `[/table]` reached as inline content (header, inline
    // wrapper, top-level inline doc): render the close tag literal AND
    // swallow the whitespace run that follows it. Oracle-verified:
    // `h1. a [/table] b` -> `<h1>a [/table]b</h1>`,
    // `[b]a [/table] tail[/b]` -> `<strong>a [/table]tail</strong>`.
    // Paragraphs never reach this branch because peekBlockElement breaks
    // them on `[/table]` first; the document/quote/section block loops
    // intercept the same close earlier via consumeStrayCodeTableAsLiteral.
    if (!basic) {
      const inlineCT = this.scanStrayClose({ kinds: ['code', 'table'] });
      if (inlineCT) {
        this.pos = inlineCT.endPos;
        // Ragel `'[/code]'i space*` / `'[/table]'i space*`, where POSIX
        // `space` includes VT and FF too, not only space/tab/CR/LF.
        this.skipPosixSpace();
        return { type: 'text', content: inlineCT.closeText };
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

    if (!basic) {
      // Color
      const colorMatch = this.matchColor();
      if (colorMatch) {
        return this.parseColorContainer(colorMatch);
      }

      // Inline spoiler. Ragel pairs `[spoiler]` / `[spoilers]` by dstack
      // depth, not by spelling, so the close-matcher accepts either form and
      // the natural recursion in parseInlineContainer handles depth.
      if (this.matchSpoilerOpen()) {
        this.inlineSpoilerDepth++;
        try {
          return this.parseInlineContainer(
            INLINE_SPOILER_CLOSES,
            'inline_spoiler',
            true,
          );
        } finally {
          this.inlineSpoilerDepth--;
        }
      }

      // Ragel `inline := |* newline* spoilers_close => ... ;`. A run of
      // newlines immediately followed by a stray `[/spoiler]` is a single
      // inline-scanner token that emits the verbatim slice (no `<br>`). The
      // ruby parser applies this rule from every inline collector, so it
      // lives here on parseInlineElement rather than at any specific call
      // site. Gated on inlineSpoilerDepth so an enclosing inline `[spoiler]`
      // claims its own close instead of having it consumed as literal text.
      if (this.inlineSpoilerDepth === 0 && this.peekNewline()) {
        const consumed = this.consumeNewlinesIfFollowedByStraySpoilerClose();
        if (consumed !== null) return { type: 'text', content: consumed };
      }
    }

    // Line break. Ragel's full `inline` scanner has
    //   `newline => append("<br>")` (outside header_mode / list)
    // but `basic_inline` (used for textile link titles) does NOT — its
    // `any` catchall writes the byte verbatim, so a newline inside a
    // link title stays as a real `\n` byte in the anchor's text.
    if (this.peekNewline() && !basic) {
      this.consumeNewline();
      return { type: 'line_break' };
    }

    // A lone CR (not part of CRLF) renders as a single space inside the full
    // `inline` scanner per ruby's `'\r' => append(' ')` rule (e.g. inside a
    // header or paragraph). Ragel's `basic_inline` scanner (used for textile
    // link titles) has NO such rule — CR is just `any` and the byte renders
    // literal. Gate on `!basic` so the alias only fires in full-inline mode.
    if (!basic && this.input[this.pos] === '\r') {
      this.pos++;
      return { type: 'text', content: ' ' };
    }

    // Regular text
    return this.parseText();
  }

  private parseInlineCode(): InlineNode {
    const start = this.pos;
    let closed = false;

    while (this.pos < this.input.length) {
      if (this.matchString('\\`')) {
        continue; // Escaped backtick
      }
      if (this.matchString('`')) {
        closed = true;
        break;
      }
      this.pos++;
    }

    // Ragel's inline_code rule appends every char up to a closing backtick,
    // then matches the close. At end-of-input the body is whatever was
    // appended; the closing backtick has zero width. The `-1` trim only
    // applies when we actually consumed a closing backtick.
    const end = closed ? this.pos - 1 : this.pos;
    const content = this.input.slice(start, end).replace(/\\`/g, '`');
    return { type: 'inline_code', content };
  }

  private parseInlineContainer(
    closePattern: string | readonly string[],
    nodeType: string,
    eatNewlinesBeforeClose: boolean = false,
  ): InlineNode {
    const children: InlineNode[] = [];

    while (this.pos < this.input.length && !this.matchAnyClose(closePattern)) {
      // Ragel `newline* spoilers_close` matches greedily over EVERY leading
      // newline before a stray `[/spoiler]`. When no inline spoiler is open,
      // `dstack_close_block(BLOCK_SPOILER, ...)` returns false and appends
      // the full `{ts,te}` range (newlines + close) as literal output. We
      // mirror that here BEFORE the paragraph-break drop so a multi-newline
      // prefix doesn't get eaten by `consumeBlankLines` first.
      if (this.inlineSpoilerDepth === 0 && this.peekNewline()) {
        const consumed = this.consumeNewlinesIfFollowedByStraySpoilerClose();
        if (consumed !== null) {
          pushInlineMergingText(children, { type: 'text', content: consumed });
          continue;
        }
      }
      // Inside an inline container, a paragraph break (\n\n+) is dropped
      // entirely. Ruby's parser consumes the newlines without emitting any
      // node, joining the surrounding text seamlessly. EXCEPT when the
      // surrounding scope is a header: ragel's inline `newline{2,}` rule
      // `fret`s, the header-scope's call also frets, and main's
      // `newline{2,}` closes the leaf blocks. Break here so the header
      // closes cleanly and the trailing tail falls into the next paragraph.
      if (this.peekDoubleNewline()) {
        if (this.headerDepth > 0) break;
        this.consumeBlankLines();
        continue;
      }
      // Ragel inline `newline` rule in header_mode is
      // `dstack_close_leaf_blocks; fret;` — no `<br>` appended. Break before
      // consuming so the surrounding header loop closes cleanly without an
      // extra `<br>` inside the still-open inline container.
      if (this.headerDepth > 0 && this.peekNewline()) break;
      // Block-container closes ([/section], [/quote]) act as scope killers
      // in ruby: they close any open inline tag and the surrounding
      // paragraph. Stop here without consuming so the outer parser sees
      // the close tag.
      if (this.peekContainerClose()) {
        break;
      }
      // A single `\n` immediately before an in-scope `[/quote]` / `[/section]`
      // / `[/spoiler]` belongs to the close rule (ragel `newline? <close> ws*`),
      // not to the inline content. Break before consuming so the surrounding
      // container parser eats it cleanly and no spurious `<br>` lands inside
      // the still-open inline scope.
      if (this.peekContainerCloseAfterNewline()) break;
      // Ragel `dstack_close_before_block; fexec ts; fret` fires from inline
      // scope for bracketed always-block opens (`[code]`, `[table]`,
      // `[quote]`, `[section]`) and for `newline header` / `newline list_item`
      // (lines 334, 427, 433, 455, 477, 504). The matching close stays
      // unconsumed so the surrounding block scope promotes it. Mirrors the
      // same break-set parseParagraph uses for its outer collector.
      //
      // Stray `[/code]` / `[/table]` are excepted: ruby's inline `[/code]` and
      // `[/table]` rules call `dstack_close_before_block` which only closes
      // BLOCK_P/LI/UL — an open inline tag on top of the dstack keeps it from
      // firing, so the literal `[/code]` / `[/table]` text gets appended into
      // the still-open inline element. Let parseInlineElement consume those.
      if (this.peekBlockElement() && !this.peekStrayCodeOrTableClose()) break;
      if (this.peekNewline() && this.peekLineStartMarkerAfterNewline()) break;
      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
    }

    // Ruby's `[/b]` / `[/i]` / `[/s]` / `[/u]` / `[/sup]` / `[/sub]` rules
    // just call `dstack_close_inline` — they don't eat the preceding
    // newlines that the inline scanner already emitted as `<br>`. The
    // `[/spoiler]` rule does have a `newline*` prefix, though, so its
    // close eats the leading newlines that would otherwise survive as
    // `<br>` inside the closed span. The caller signals that via
    // `eatNewlinesBeforeClose`.
    if (eatNewlinesBeforeClose) trimTrailingLineBreaks(children);
    return { type: nodeType, children } as InlineNode;
  }

  // Ruby caps the combined [sup]/[sub] nesting depth at 3. Past that the
  // open tag is silently dropped along with its matching close, and the
  // body's children bubble up to the parent. The drop is modelled with a
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
      const fragment: FragmentNode = {
        type: 'fragment',
        children,
        wrapper: nodeType === 'subscript' ? 'sub' : 'sup',
      };
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

  // True when an enclosing block container (not the named one) has its
  // close at the cursor. Used by parseQuote / parseSpoilerBlock /
  // parseSection to bail out before parseBlock falls through to
  // parseParagraph and spins on an outer close it cannot consume.
  private peekOuterContainerClose(
    self: 'quote' | 'spoiler' | 'section',
  ): boolean {
    if (
      self !== 'section' &&
      this.sectionDepth > 0 &&
      this.peekString('[/section]', true)
    )
      return true;
    if (
      self !== 'quote' &&
      this.quoteDepth > 0 &&
      this.peekString('[/quote]', true)
    )
      return true;
    if (
      self !== 'spoiler' &&
      this.spoilerBlockDepth > 0 &&
      (this.peekString('[/spoiler]', true) ||
        this.peekString('[/spoilers]', true))
    )
      return true;
    return false;
  }

  // True when the cursor sits on a single `\n` (or CRLF) immediately followed
  // by an in-scope container close. Ragel's `newline? quote_close ws*` and
  // `newline? section_close ws*` rules eat ONE leading newline as part of the
  // close, so inline collectors should break BEFORE that `\n` rather than
  // emitting it as a `<br>` inside a still-open inline scope.
  private peekContainerCloseAfterNewline(): boolean {
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
    const result = this.peekContainerClose();
    this.pos = saved;
    return result;
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
    // Parse the children either way; the only difference between "colour
    // allowed" and "colour disabled" is whether the colour value survives
    // onto the node. Disabled mode emits an empty-string colour so the
    // renderer skips the wrapping span (see render-html's allowColor branch).
    const children: InlineNode[] = [];
    while (
      this.pos < this.input.length &&
      !this.matchString('[/color]', true)
    ) {
      // Ragel's inline `newline{2,}` rule `fret`s the inline scanner; the
      // surrounding INLINE_COLOR stays on the dstack and the next paragraph
      // keeps writing into the same span. Mirror parseInlineContainer:
      // drop the blank lines and resume in the same color scope.
      if (this.peekDoubleNewline()) {
        if (this.headerDepth > 0) break;
        this.consumeBlankLines();
        continue;
      }
      // In header_mode a single newline closes the header (ragel:
      // `dstack_close_leaf_blocks; fret;`). Break before consuming so the
      // header loop picks it up; emitting `<br>` here would slip into the
      // still-open color span.
      if (this.headerDepth > 0 && this.peekNewline()) break;
      if (this.peekContainerClose()) break;
      // A single `\n` immediately before an in-scope container close
      // belongs to the close rule (ragel `newline? <close> ws*`). Break
      // before consuming so no spurious `<br>` lands inside the color span.
      if (this.peekContainerCloseAfterNewline()) break;
      // Bracketed always-block opens (`[code]`, `[table]`, `[quote]`, ...)
      // exit the inline scope via `fexec ts; fret;` — the surrounding main
      // scope then promotes them into real blocks. Stray `[/code]` and
      // `[/table]` are NOT exits; they're absorbed inline as literal text.
      // Mirrors parseInlineContainer's break-set so a `[code]` inside a
      // color span closes the span and lets the code block render.
      if (this.peekBlockElement() && !this.peekStrayCodeOrTableClose()) break;
      if (this.peekNewline() && this.peekLineStartMarkerAfterNewline()) break;
      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
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

      // ID pattern checking. Ragel's scanner has no preceding-word-boundary
      // gate — at every position the longest rule wins, so `0post #5` glued
      // directly after a digit run still tokenises as a post id-link. The
      // sticky regex is hot, but it's cheaper than the divergence here.
      if (isAsciiAlpha(code)) {
        if (this.looksLikeIdPattern()) {
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
  // contents, which sit inside an outer block context they must stay aware
  // of: a `[/quote]` inside a list item that's nested in a quote should
  // close the outer quote (not show up as literal text), and thumbs inside
  // a list item should count toward the document-wide `maxThumbs` budget.
  //
  // Compare the free function `parseInlineString` near the top of the file:
  // fresh parser instance, own budget, container closes stay literal. That
  // one is for genuinely isolated contexts like textile link titles.
  //
  // The save/restore of `input` and `pos` lets the caller stage a substring
  // through the existing matcher infrastructure without leaking position
  // state back.
  private parseInlineText(text: string): InlineNode[] {
    const savedPos = this.pos;
    const savedInput = this.input;

    this.input = text;
    this.pos = 0;

    const children: InlineNode[] = [];
    while (this.pos < this.input.length) {
      const node = this.parseInlineElement();
      if (node) pushInlineMergingText(children, node);
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

  // Case-insensitive match against either a single literal close pattern or
  // any one of several. The single-string path is the hot path (every b/i/s/u/
  // sup/sub/color container goes through it); the array path exists for the
  // inline spoiler, whose ragel rule pairs `[/spoiler]` and `[/spoilers]` by
  // depth rather than by spelling. Patterns are tried in array order; callers
  // pass the longer form first when forms share a prefix.
  private matchAnyClose(pattern: string | readonly string[]): boolean {
    if (typeof pattern === 'string') return this.matchString(pattern, true);
    for (const p of pattern) {
      if (this.matchString(p, true)) return true;
    }
    return false;
  }

  // Compare `pattern` against the input at `this.pos` without allocating.
  // CS path delegates to `String.prototype.startsWith(pattern, pos)`.
  //
  // Precondition for the CI path: `pattern` MUST be ASCII. The manual loop
  // only case-folds A-Z; non-ASCII letters that JS's `String#toLowerCase`
  // would fold (e.g. the Kelvin sign U+212A folds to ASCII `k`) will NOT
  // fold here. Every current caller passes a hardcoded bracketed tag
  // (`[/quote]`, `[code]`, etc.).
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
  // O(n - pos) allocation. Returns the match or null; does not advance
  // `this.pos` (callers do).
  private matchSticky(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this.pos;
    return re.exec(this.input);
  }

  // Boolean variant of `matchSticky`. Identical contract; avoids allocating
  // a match object when callers only need a yes/no.
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
    // a paragraph break) `[spoiler]` opens a block spoiler — even when no
    // matching close exists ahead. Ragel's `spoilers_open` rule fires
    // unconditionally at main scope and EOI's dstack-flush closes whatever
    // stayed open. A spoiler embedded inside a paragraph (after a single
    // newline or mid-line) never reaches parseBlock, so the inline-vs-block
    // split is owned entirely by the caller's entry point.
    let openLen: number;
    if (this.peekString('[spoilers]', true)) openLen = 10;
    else if (this.peekString('[spoiler]', true)) openLen = 9;
    else return false;
    this.pos += openLen;
    return true;
  }

  private matchSpoilerClose(): boolean {
    return (
      this.matchString('[/spoiler]', true) ||
      this.matchString('[/spoilers]', true)
    );
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
  // [spoiler] open, so the open count is tracked and truncation only fires
  // at a close with no matching open (oracle-verified: a balanced inline
  // pair stays paired, an unpaired close ends the item).
  // [/code] and [/table] also terminate the item; their opens are block-only
  // and a stray close inside a list item ends the list (oracle-verified:
  // `* a [/table] b` becomes `<ul><li>a </li></ul>[/table]b`).
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
        // stay literal inside the item. Oracle-verified: `* a [/quote]`
        // stays inline literal, but `[quote]\n* a [/quote]\n[/quote]`
        // truncates at the inner close so the outer quote ends.
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
    // let a bare `*\n` line eat the next line as item content (oracle-
    // verified failure: `* a\n*\n* b` then matched `*\n* b` as one item
    // with text `* b`). Oracle keeps the bare `*` as a paragraph and starts
    // a fresh list afterwards.
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
    // corresponding entry here. The null guard exists in case an edit adds a
    // regex pattern without a map entry.
    const matchedPattern = match[1].toLowerCase().replace(/\s+/g, ' ');
    const type = ID_TYPE_MAP.get(matchedPattern);
    if (type === undefined) return null;

    this.pos += match[0].length;
    return { type, id: match[2], text: match[0] };
  }

  protected matchPostSearchLink(): PostSearchMatch | null {
    // Mirror of `matchWikiLink`'s pipe-counting rule, oracle-verified for
    // `{{...}}`:
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
    // Oracle-verified:
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

    // "title":[url] format. Ruby rejects URLs containing ASCII whitespace
    // (space/tab/newline/CR/VT/FF) — its `^space+` is the POSIX class, NOT
    // JS's `\s` (which also matches NBSP, U+00A0, and other unicode spaces
    // that ruby's grammar treats as ordinary URL bytes). Empty URL fails on
    // the `+` quantifier.
    const bracketedMatch = this.matchSticky(RE_TEXTILE_BRACKETED);
    if (bracketedMatch) {
      if (!isAcceptedTextileUrl(bracketedMatch[2])) return null;
      if (/[ \t\n\r\v\f]/.test(bracketedMatch[2])) return null;
      this.pos += bracketedMatch[0].length;
      return { title: bracketedMatch[1], url: bracketedMatch[2] };
    }

    // "title":url format. Strip trailing boundary punctuation (,.;:!?) the
    // way matchUrl does for bare URLs, preserving balanced parens.
    const basicMatch = this.matchSticky(RE_TEXTILE_BASIC);
    if (basicMatch) {
      const trimmed = trimUrlBoundaries(basicMatch[2]);
      if (!isAcceptedTextileUrl(trimmed)) return null;
      const consumed =
        basicMatch[0].length - (basicMatch[2].length - trimmed.length);
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
      // Same validity rules as a quote-colour: hex (3 to 6), strict-lowercase
      // word, or one of the tag-category aliases. Anything else stays literal
      // so [/color] also stays literal (oracle-verified).
      if (!isValidQuoteColor(colorMatch[1])) return null;
      this.pos += colorMatch[0].length;
      return colorMatch[1];
    }
    return null;
  }

  // Eat one or more POSIX `space` characters (space, tab, VT, FF, CR, LF).
  // Ragel uses POSIX space in several `space*` post-open eats (notably the
  // plain `quote_open space*` rule) and the dmark skipWhitespace / matchNewlines
  // pair only covers space+tab and the CRLF/LF/CR line terminators, missing VT
  // and FF that ragel still strips here.
  private skipPosixSpace(): void {
    const input = this.input;
    const len = input.length;
    while (this.pos < len) {
      const code = input.charCodeAt(this.pos);
      if (
        code === 0x20 /* ' ' */ ||
        code === 0x09 /* \t */ ||
        code === 0x0b /* \v */ ||
        code === 0x0c /* \f */ ||
        code === 0x0a /* \n */ ||
        code === 0x0d /* \r */
      ) {
        this.pos++;
        continue;
      }
      break;
    }
  }

  private matchNewlines(): boolean {
    // Consume only line terminators here. Horizontal whitespace must stay so
    // it can be picked up as paragraph content (ruby preserves indentation).
    // Ragel `newline = '\r\n' | '\n'`, so a bare CR is NOT a newline at the
    // block level — it falls into the `any` rule which opens `<p>` and lets
    // the inline scanner translate the `\r` into a single space.
    const input = this.input;
    const len = input.length;
    const start = this.pos;
    while (this.pos < len) {
      const code = input.charCodeAt(this.pos);
      if (code === 0x0d && input.charCodeAt(this.pos + 1) === 0x0a) {
        this.pos += 2;
      } else if (code === 0x0a) {
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

  // After consuming a block close tag like [/quote] or [/section], ruby also
  // eats any horizontal whitespace remaining on the same line plus one
  // trailing newline. This way `[/quote] \n\nbody` produces a clean
  // paragraph break before `body` instead of an empty <p></p> from the
  // leftover ` \n`.
  private consumeBlockCloseTail(): void {
    const input = this.input;
    const len = input.length;
    // Ragel `ws = ' ' | '\t'` — ASCII space and tab only. NBSP / ideographic
    // space / em space, etc. survive into the next paragraph; bare CR is
    // also kept (ragel `newline = '\r\n' | '\n'`).
    while (this.pos < len) {
      const c = input.charCodeAt(this.pos);
      if (c === 0x20 || c === 0x09) {
        this.pos++;
        continue;
      }
      break;
    }
    const code = input.charCodeAt(this.pos);
    if (code === 0x0d && input.charCodeAt(this.pos + 1) === 0x0a) {
      this.pos += 2;
    } else if (code === 0x0a) {
      this.pos += 1;
    }
  }

  // Consume whitespace-only lines at the current position. A line counts as
  // whitespace-only if it contains zero or more horizontal-WS characters
  // followed by a newline. Used inside container blocks (section, quote,
  // spoiler block) where ruby does not preserve such lines as empty
  // paragraphs. Document level skips this; ruby keeps " \n\n" there as a
  // real <p> </p>.
  private skipBlankLines(): void {
    const input = this.input;
    const len = input.length;
    while (this.pos < len) {
      let lookahead = this.pos;
      while (
        lookahead < len &&
        isHorizontalWhitespace(input.charCodeAt(lookahead))
      ) {
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

  // Sibling of `peekBlockElementAfterNewline` restricted to line-start-only
  // markers (`h1.`, `* item`). The literal-html tail loop uses this to break
  // before the `\n` that introduces a header / list, so the outer block
  // parser swallows that newline as the block-context separator. Bracketed
  // always-block tags don't pass this filter — they take the
  // emit-`<br>`-then-break path via the next iteration's peekBlockElement.
  private peekLineStartMarkerAfterNewline(): boolean {
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
    let hit = false;
    for (const pattern of LINE_START_PATTERNS_STICKY) {
      if (this.testSticky(pattern)) {
        hit = true;
        break;
      }
    }
    this.pos = saved;
    return hit;
  }

  private peekBlockElement(): boolean {
    // Some block markers (h1., * item, etc.) are only structural at the
    // start of a line. Mid-line they are ordinary text. Bracketed tags
    // ([code], [/code], ...) break paragraphs regardless of position.
    const atLineStart = this.pos === 0 || this.input[this.pos - 1] === '\n';

    // `[spoiler]` is never a block-context promoter from inside an inline run.
    // The block-vs-inline split is owned by parseBlock: `matchSpoilerBlockOpen`
    // catches the block-context case (doc start or after `\n\n`) before any
    // inline collector runs. Reaching peekBlockElement at all means we are
    // already inside an inline run — so a `[spoiler]` here is inline content,
    // regardless of whether its body spans multiple lines.

    // Closes for block containers only count as block markers when their
    // matching open is in scope. Outside of one, ruby treats them as
    // ordinary inline text; otherwise parseBlock would infinite-loop since
    // no branch consumes them.
    if (this.quoteDepth > 0 && this.testSticky(RE_QUOTE_CLOSE)) return true;
    if (this.sectionDepth > 0 && this.testSticky(RE_SECTION_CLOSE)) return true;
    if (this.spoilerBlockDepth > 0 && this.testSticky(RE_STRAY_SPOILER_CLOSE))
      return true;

    // Coloured quote opens like [quote=#00CCFF] count as block elements only
    // when the colour is valid; invalid colour attributes (e.g. [quote=Bob])
    // are treated as inline text by ruby, and mirrored here.
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
    // Same alternation `matchIdLink` uses to commit. Sharing keeps the
    // precheck and the commit in lockstep (no drift).
    return this.testSticky(DTextStateMachineParser.COMPILED_ID_PATTERN_STICKY);
  }

  // Link creation methods
  private createIdLink(match: IdMatch): LinkNode {
    // Past the per-document thumb limit ruby drops the thumb-placeholder
    // class and emits a plain post id-link, so swap idType to 'post' to
    // suppress the thumb-only attributes the renderer would otherwise add.
    // The node shape lives in `buildIdLink`; this wrapper resolves the
    // budget question and delegates.
    let type = match.type;
    if (type === 'thumb') {
      this.thumbCount++;
      if (
        this.options.maxThumbs !== undefined &&
        this.thumbCount > this.options.maxThumbs
      ) {
        type = 'post';
      }
    }
    return buildIdLink(type, match.id);
  }

  private createPostSearchLink(match: PostSearchMatch): LinkNode {
    // Pure construction lives in `buildPostSearchLink` so the markdown
    // adapter produces byte-identical post-search nodes without copying the
    // rules. `PostSearchMatch` is structurally identical to
    // `PostSearchInput`.
    return buildPostSearchLink(match);
  }

  private createWikiLink(match: WikiLinkInput): LinkNode {
    // Pure construction lives in `buildWikiLink` so the markdown adapter
    // produces byte-identical hrefs without copying the rules.
    return buildWikiLink(match);
  }

  // Builds a `LinkNode` for the dtext textile-style syntax (`"text":url` and
  // `"text":[url]`). The function name describes the input shape, but the
  // AST tag it produces is the flavour-neutral `linkType: 'inline'` (shared
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
