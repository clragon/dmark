import type {
  BlockNode,
  CodeBlockNode,
  ColorNode,
  DocumentNode,
  FragmentNode,
  HeaderNode,
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

interface ParserOptions {
  allowColor?: boolean;
  maxThumbs?: number;
  baseUrl?: string;
  inlineOnly?: boolean;
}

interface UrlMatch {
  url: string;
  start: number;
  end: number;
}

interface IdMatch {
  type: string;
  id: string;
  text: string;
}

interface PostSearchMatch {
  tag: string;
  title?: string;
}

interface WikiLinkMatch {
  tag: string;
  title?: string;
  anchor?: string;
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

const BOUNDARY_CHARS = [
  0x0021, 0x0029, 0x002c, 0x002e, 0x003a, 0x003b, 0x003c, 0x003e, 0x003f,
  0x005d, 0x007d, 0x276d, 0x3000, 0x3001, 0x3002, 0x3008, 0x3009, 0x300a,
  0x300b, 0x300c, 0x300d, 0x300e, 0x300f, 0x3010, 0x3011, 0x3014, 0x3015,
  0x3016, 0x3017, 0x3018, 0x3019, 0x301a, 0x301b, 0x301c, 0xff09, 0xff3d,
  0xff5d, 0xff60, 0xff63,
];

function isBoundaryChar(char: string): boolean {
  return BOUNDARY_CHARS.includes(char.charCodeAt(0));
}

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
  const last = url[url.length - 1];
  if (isBoundaryChar(last)) {
    return url.slice(0, -1);
  }
  return url;
}

// Parse a piece of text that's already known to be inline-only (link titles,
// for example) and return the resulting inline children. Falls back to a
// single text node if parsing yields nothing useful.
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

// Lowercase ASCII letters only, leaving non-ASCII characters untouched.
// Ruby's dtext normalizes wiki/post-search keys with `String#downcase` in a
// way that leaves Unicode letters alone (verified against the oracle:
// `[[Ōmukade]]` keeps the `Ō` in the URL, while `[[Foo]]` becomes `foo`).
// JavaScript's String.prototype.toLowerCase is Unicode-aware, so we need
// our own version.
function asciiLowercase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
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

// Match ruby's CGI.escape / URI::DEFAULT_PARSER.escape behavior: encode
// everything outside RFC 3986 unreserved (A-Z a-z 0-9 - _ . ~). JS's
// encodeURIComponent leaves !'()* unencoded; ruby encodes them.
function rubyUriEscape(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

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

  // All link ID patterns
  private static readonly ID_PATTERNS = [
    { pattern: 'post', type: 'post' },
    { pattern: 'thumb', type: 'thumb' },
    { pattern: 'post changes', type: 'post_changes' },
    { pattern: 'flag', type: 'flag' },
    { pattern: 'note', type: 'note' },
    { pattern: 'forum', type: 'forum_post' },
    { pattern: 'topic', type: 'topic' },
    { pattern: 'comment', type: 'comment' },
    { pattern: 'pool', type: 'pool' },
    { pattern: 'user', type: 'user' },
    { pattern: 'artist', type: 'artist' },
    { pattern: 'ban', type: 'ban' },
    { pattern: 'bur', type: 'bur' },
    { pattern: 'alias', type: 'alias' },
    { pattern: 'implication', type: 'implication' },
    { pattern: 'mod action', type: 'mod_action' },
    { pattern: 'record', type: 'record' },
    { pattern: 'wiki', type: 'wiki' },
    { pattern: 'set', type: 'set' },
    { pattern: 'blip', type: 'blip' },
    { pattern: 'takedown', type: 'takedown' },
    { pattern: 'take\\s?down\\s+request', type: 'takedown' },
    { pattern: 'ticket', type: 'ticket' },
  ];

  // Single compiled regex for all ID patterns. Ruby requires exactly one
  // ASCII space or NBSP between the prefix word and `#` (verified against
  // the oracle: `pool#1234`, `pool  #1234`, and `pool\t#1234` all stay
  // literal, while `pool #1234` and `pool #1234` link).
  private static readonly COMPILED_ID_PATTERN = new RegExp(
    '^(' +
      DTextStateMachineParser.ID_PATTERNS.map((p) => p.pattern).join('|') +
      ') #(\\d+)',
    'i',
  );

  // Canonical display form per id-type. Ruby renders the link text as
  // "<canonical> #<id>" regardless of how the prefix was typed in the source.
  // `Pool` and `POOL` both display as `pool`, `Take Down Request` collapses
  // to `takedown`, and `bur` always upcases to `BUR`.
  private static readonly ID_DISPLAY: Record<string, string> = {
    post: 'post',
    thumb: 'post',
    post_changes: 'post changes',
    flag: 'flag',
    note: 'note',
    forum_post: 'forum',
    topic: 'topic',
    comment: 'comment',
    pool: 'pool',
    user: 'user',
    artist: 'artist',
    ban: 'ban',
    bur: 'BUR',
    alias: 'alias',
    implication: 'implication',
    mod_action: 'mod action',
    record: 'record',
    wiki: 'wiki',
    set: 'set',
    blip: 'blip',
    takedown: 'takedown',
    ticket: 'ticket',
  };

  // Build the matched-prefix to type map by collapsing each pattern's regex
  // whitespace metachars into a single space. `take\\s?down\\s+request`
  // becomes `take down request`; `post changes` is already a literal-space
  // pattern. Lookup keys are lowercase, with input whitespace runs collapsed
  // to a single space.
  private static readonly ID_TYPE_MAP = new Map(
    [
      ...DTextStateMachineParser.ID_PATTERNS.map((p) => [
        p.pattern.replace(/\\s[?+*]?/g, ' ').replace(/\s+/g, ' '),
        p.type,
      ] as [string, string]),
      // extra alias for the contracted form of takedown request
      ['takedown request', 'takedown'],
    ],
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
      // Stray spoiler close after content keeps the inter-block whitespace
      // literal between `</p>` and `[/spoiler]`. Look past any leading WS/NL
      // for a stray close so the literal-html node can carry that gap. Two
      // states drop the close instead of emitting it: pristine (no block has
      // been emitted yet) and "after a quote/section close" (oracle absorbs
      // the stray and re-opens a paragraph for the trailing whitespace).
      if (children.length > 0) {
        const last = children[children.length - 1];
        const lastIsContainerBlock =
          last.type === 'quote' || last.type === 'section';
        const prefix = this.peekStrayBlockCloseAfterWhitespace();
        if (prefix !== null) {
          if (lastIsContainerBlock) {
            this.consumeStrayBlockCloseSilent();
            continue;
          }
          children.push(this.consumeStrayBlockCloseAsLiteral(prefix));
          continue;
        }
      } else if (this.peekStrayBlockClose()) {
        // Pristine state: drop the close silently and continue.
        this.consumeStrayBlockCloseSilent();
        continue;
      }

      // Stray `[/code]` / `[/table]` eat surrounding whitespace and emit a
      // raw close tag plus an inline tail rendered without a `<p>` wrap.
      if (this.peekStrayCodeOrTableClose()) {
        children.push(
          this.consumeStrayCodeTableAsLiteral(children.length === 0),
        );
        continue;
      }

      // Don't strip leading horizontal whitespace here. Ruby treats indented
      // lines as ordinary paragraph content, so a line like "    body" should
      // produce <p>    body</p>, and a "blank" line that has horizontal
      // whitespace between two newlines is two single <br>s, not a paragraph
      // break. The only thing we collapse at the top level is a true
      // contiguous \n\n, which is the actual paragraph-break separator.
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
    return /^\[\/spoilers?\]/i.test(this.input.slice(this.pos));
  }

  // True at a stray `[/code]` or `[/table]`. Their behaviour differs from
  // stray spoiler closes: ruby eats whitespace and newlines around the tag,
  // emits an implicit `<p></p>` if at pristine state, and renders the
  // following inline tail without a `<p>` wrap (verified against the oracle).
  private peekStrayCodeOrTableClose(): boolean {
    return /^\[\/(code|table)\]/i.test(this.input.slice(this.pos));
  }

  // Consume a stray `[/code]` or `[/table]`. `pristine` is true when the
  // surrounding container has not emitted any block yet, in which case ruby
  // synthesises an empty paragraph before the close.
  private consumeStrayCodeTableAsLiteral(pristine: boolean): LiteralHtmlNode {
    const m = this.input.slice(this.pos).match(/^\[\/(code|table)\]/i);
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
      if (!node) continue;
      if (node.type === 'text' && children.length > 0) {
        const last = children[children.length - 1];
        if (last.type === 'text') {
          (last as TextNode).content += (node as TextNode).content;
          continue;
        }
      }
      children.push(node);
    }
    // Drop a trailing line break: a `\n` immediately before the container
    // close should not render as a `<br>`, mirroring the same trim
    // parseParagraph does when a paragraph ends.
    while (
      children.length > 0 &&
      children[children.length - 1].type === 'line_break'
    ) {
      children.pop();
    }
    const prefix = (pristine ? '<p></p>' : '') + m[0];
    return { type: 'literal_html', prefix, children };
  }

  private peekStrayBlockCloseAfterNewline(): boolean {
    let offset = 0;
    if (this.input.slice(this.pos, this.pos + 2) === '\r\n') {
      offset = 2;
    } else if (this.input[this.pos] === '\n') {
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
    const m = this.input.slice(this.pos).match(/^\[\/spoilers?\]/i);
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
    const m = this.input.slice(this.pos).match(/^\[\/spoilers?\]/i);
    if (!m) return { type: 'literal_html', prefix, children: [] };
    this.pos += m[0].length;
    const fullPrefix = prefix + m[0];
    const children: InlineNode[] = [];
    while (this.pos < this.input.length) {
      if (this.peekDoubleNewline()) break;
      if (this.peekContainerClose()) break;
      const node = this.parseInlineElement();
      if (!node) continue;
      if (node.type === 'text' && children.length > 0) {
        const last = children[children.length - 1];
        if (last.type === 'text') {
          (last as TextNode).content += (node as TextNode).content;
          continue;
        }
      }
      children.push(node);
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
    return /^\[\/spoilers?\]/i.test(this.input.slice(p));
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
    const r = this.input.slice(p);
    if (this.spoilerBlockDepth === 0 && /^\[\/spoilers?\]/i.test(r)) {
      const prefix = this.input.slice(this.pos, p);
      this.pos = p;
      return prefix;
    }
    return null;
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
    const remaining = this.input.slice(this.pos);
    const m = remaining.match(/^\[quote=([^\]\n]*)\]/i);
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
        if (children.length > 0) {
          const last = children[children.length - 1];
          const lastIsContainerBlock =
            last.type === 'quote' || last.type === 'section';
          const prefix = this.peekStrayBlockCloseAfterWhitespace();
          if (prefix !== null) {
            if (lastIsContainerBlock) {
              this.consumeStrayBlockCloseSilent();
              continue;
            }
            children.push(this.consumeStrayBlockCloseAsLiteral(prefix));
            continue;
          }
        } else if (this.peekStrayBlockClose()) {
          this.consumeStrayBlockCloseSilent();
          continue;
        }
        // Stray `[/code]` / `[/table]` inside a block container: capture
        // the close + tail as a literal-html node so the tail does NOT
        // get a fresh `<p>` wrap. Pristine-in-container does not synthesise
        // `<p></p>` (verified: `[quote][/table] tail[/quote]` ->
        // `<blockquote>[/table]tail</blockquote>`, no empty paragraph).
        if (this.peekStrayCodeOrTableClose()) {
          children.push(this.consumeStrayCodeTableAsLiteral(false));
          continue;
        }
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
        if (children.length > 0) {
          const last = children[children.length - 1];
          const lastIsContainerBlock =
            last.type === 'quote' || last.type === 'section';
          const prefix = this.peekStrayBlockCloseAfterWhitespace();
          if (prefix !== null) {
            if (lastIsContainerBlock) {
              this.consumeStrayBlockCloseSilent();
              continue;
            }
            children.push(this.consumeStrayBlockCloseAsLiteral(prefix));
            continue;
          }
        } else if (this.peekStrayBlockClose()) {
          this.consumeStrayBlockCloseSilent();
          continue;
        }
        if (this.peekStrayCodeOrTableClose()) {
          children.push(this.consumeStrayCodeTableAsLiteral(false));
          continue;
        }
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
        if (children.length > 0) {
          const last = children[children.length - 1];
          const lastIsContainerBlock =
            last.type === 'quote' || last.type === 'section';
          const prefix = this.peekStrayBlockCloseAfterWhitespace();
          if (prefix !== null) {
            if (lastIsContainerBlock) {
              this.consumeStrayBlockCloseSilent();
              continue;
            }
            children.push(this.consumeStrayBlockCloseAsLiteral(prefix));
            continue;
          }
        } else if (this.peekStrayBlockClose()) {
          this.consumeStrayBlockCloseSilent();
          continue;
        }
        if (this.peekStrayCodeOrTableClose()) {
          children.push(this.consumeStrayCodeTableAsLiteral(false));
          continue;
        }
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

    while (
      children.length > 0 &&
      children[children.length - 1].type === 'line_break'
    ) {
      children.pop();
    }

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
        const ch = this.input[this.pos];
        if (ch === '\n' || ch === '\r') break;
        if (
          ch === '[' &&
          this.input.slice(this.pos, this.pos + 9).toLowerCase() === '[/ltable]'
        ) {
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
      if (cellType === 'td') {
        const idx = content.toLowerCase().indexOf('[/td]');
        if (idx >= 0) content = content.slice(0, idx).trimEnd();
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
      if (node) {
        // Merge consecutive text nodes
        if (node.type === 'text' && children.length > 0) {
          const lastChild = children[children.length - 1];
          if (lastChild.type === 'text') {
            (lastChild as TextNode).content += (node as TextNode).content;
            continue;
          }
        }
        children.push(node);
      }
    }

    // If we broke on a stray spoiler close, leave the trailing newlines for
    // the surrounding block loop to absorb into the literal-html prefix.
    // Otherwise (normal paragraph end), eat one trailing newline.
    if (!this.peekStrayBlockClose() && !this.peekStrayBlockCloseAfterAnyWs()) {
      this.consumeNewline();
    }

    // Drop trailing line breaks (a final '\n' inside a paragraph buffer
    // shouldn't render as <br></p> , ruby closes the paragraph cleanly).
    while (
      children.length > 0 &&
      children[children.length - 1].type === 'line_break'
    ) {
      children.pop();
    }

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
    const inlineCT = this.input.slice(this.pos).match(/^\[\/(code|table)\]/i);
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

    while (
      children.length > 0 &&
      children[children.length - 1].type === 'line_break'
    ) {
      children.pop();
    }

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
    if (!this.options.allowColor) {
      // Parse content without color wrapper
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
      return { type: 'color', color: '', children };
    }

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

    return { type: 'color', color, children };
  }

  protected parseText(): TextNode {
    const start = this.pos;

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      // Stop at markup characters
      if (char === '[' || char === '`' || char === '\r' || char === '\n') {
        break;
      }

      // Handle escaped characters
      if (char === '\\' && this.pos + 1 < this.input.length) {
        const nextChar = this.input[this.pos + 1];
        if (nextChar === '`') {
          // Don't stop here, let the escaped backtick be handled by parseInlineElement
          break;
        }
      }

      // Stop at potential link starts
      if (char === '"' || char === '<' || char === '{') {
        if (this.looksLikeMarkup()) {
          break;
        }
      }

      // Stop at URL starts
      if (char === 'h' && this.pos + 3 < this.input.length) {
        if (this.input.slice(this.pos, this.pos + 4).toLowerCase() === 'http') {
          break;
        }
      }

      // ID pattern checking. Only check at the start of a "word" (start of
      // buffer or after a non-alphanumeric character) so we don't pay the
      // cost of a regex check at every char. Ruby's parser fires id-link
      // detection after any non-word boundary including `(`, `[`, `,`, etc.
      if (
        /[a-z]/i.test(char) &&
        (this.pos === start || !/[a-z0-9]/i.test(this.input[this.pos - 1]))
      ) {
        if (this.looksLikeIdPattern()) {
          break;
        }
      }

      this.pos++;
    }

    const content = this.input.slice(start, this.pos);
    return content
      ? { type: 'text', content }
      : { type: 'text', content: this.input[this.pos++] || '' };
  }

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
    const slice = this.input.slice(this.pos, this.pos + pattern.length);
    const matches = caseInsensitive
      ? slice.toLowerCase() === pattern.toLowerCase()
      : slice === pattern;

    if (matches) {
      this.pos += pattern.length;
      return true;
    }
    return false;
  }

  private matchHeader(): number | null {
    const match = this.input.slice(this.pos).match(/^h([123456])\.\s*/i);
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
    // a paragraph break) `[spoiler]` always opens a block spoiler, regardless
    // of what its body contains. A spoiler embedded inside a paragraph (after
    // a single newline or mid-line) stays inline; that case never reaches
    // parseBlock, so the structural test here is sufficient.
    const remaining = this.input.slice(this.pos);
    const blockMatch = remaining.match(/^\[(spoilers?)\]([\s\S]*?)\[\/\1\]/i);
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
    // Look ahead to determine the right close pattern
    const remaining = this.input.slice(this.pos).toLowerCase();
    return remaining.includes('[/spoilers]') ? '[/spoilers]' : '[/spoiler]';
  }

  private matchSection(): SectionMatch | null {
    if (this.matchString('[section,expanded]', true)) {
      return { expanded: true };
    }
    if (this.matchString('[section]', true)) {
      return {};
    }

    const expandedMatch = this.input
      .slice(this.pos)
      .match(/^\[section,expanded=([^\]]+)\]/i);
    if (expandedMatch) {
      this.pos += expandedMatch[0].length;
      return { title: expandedMatch[1], expanded: true };
    }

    const titleMatch = this.input
      .slice(this.pos)
      .match(/^\[section=([^\]]+)\]/i);
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
    const re =
      /\[(\/?)(section|quote|spoilers?|code|ltable|table)\b[^\]]*\]/gi;
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
    const match = this.input.slice(this.pos).match(/^(\*+)[ \t]+([^\r\n]+)/);
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
    const match = this.input.slice(this.pos).match(/^\[#([a-zA-Z0-9_-]+)\]/);
    if (match) {
      this.pos += match[0].length;
      return match[1];
    }
    return null;
  }

  protected matchIdLink(): IdMatch | null {
    const remaining = this.input.slice(this.pos);
    const match = remaining.match(DTextStateMachineParser.COMPILED_ID_PATTERN);

    if (match) {
      this.pos += match[0].length;
      const matchedPattern = match[1].toLowerCase().replace(/\s+/g, ' ');

      let type = 'unknown';
      for (const [
        pattern,
        patternType,
      ] of DTextStateMachineParser.ID_TYPE_MAP) {
        if (matchedPattern === pattern.toLowerCase()) {
          type = patternType;
          break;
        }
      }

      return {
        type,
        id: match[2],
        text: match[0],
      };
    }

    return null;
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
    const block = this.input.slice(this.pos).match(/^\{\{([^}]*)\}\}/);
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

  protected matchWikiLink(): WikiLinkMatch | null {
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
    const block = this.input.slice(this.pos).match(/^\[\[([^\]]*)\]\]/);
    if (!block) return null;
    const content = block[1];
    if (content.length === 0) return null;

    const result = this.parseWikiContent(content);
    if (!result) return null;

    this.pos += block[0].length;
    return result;
  }

  private parseWikiContent(content: string): WikiLinkMatch | null {
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
      const r: WikiLinkMatch = { tag: '', anchor: tagPart.slice(1) };
      if (titlePart !== undefined) r.title = titlePart;
      return r;
    }
    if (hashIdx > 0) {
      const r: WikiLinkMatch = {
        tag: tagPart.slice(0, hashIdx),
        anchor: tagPart.slice(hashIdx + 1),
      };
      if (titlePart !== undefined) r.title = titlePart;
      return r;
    }
    const r: WikiLinkMatch = { tag: tagPart };
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
    const bracketedMatch = this.input
      .slice(this.pos)
      .match(/^"([^"]+)":\[([^\]]+)\]/);
    if (bracketedMatch) {
      if (!isAcceptedTextileUrl(bracketedMatch[2])) return null;
      if (/\s/.test(bracketedMatch[2])) return null;
      this.pos += bracketedMatch[0].length;
      return { title: bracketedMatch[1], url: bracketedMatch[2] };
    }

    // "title":url format. Strip trailing boundary punctuation (,.;:!?) the
    // way matchUrl does for bare urls , preserving balanced parens.
    const basicMatch = this.input.slice(this.pos).match(/^"([^"]+)":(\S+)/);
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
    const match = this.input.slice(this.pos).match(/^https?:\/\/\S+/i);
    if (match) {
      const start = this.pos;
      let url = match[0];

      url = trimUrlBoundaries(url);

      this.pos = start + url.length;

      return { url, start, end: this.pos };
    }
    return null;
  }

  private matchDelimitedUrl(): UrlMatch | null {
    const match = this.input.slice(this.pos).match(/^<(https?:\/\/[^>]+)>/i);
    if (match) {
      this.pos += match[0].length;
      return {
        url: match[1],
        start: this.pos - match[0].length,
        end: this.pos,
      };
    }
    return null;
  }

  private matchColor(): string | null {
    const colorMatch = this.input.slice(this.pos).match(/^\[color=([^\]]+)\]/i);
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
    const start = this.pos;
    while (this.pos < this.input.length) {
      if (this.input.slice(this.pos, this.pos + 2) === '\r\n') {
        this.pos += 2;
      } else if (this.input[this.pos] === '\n' || this.input[this.pos] === '\r') {
        this.pos += 1;
      } else {
        break;
      }
    }
    return this.pos > start;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /[ \t]/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private peekNewline(): boolean {
    return (
      this.input[this.pos] === '\n' ||
      this.input.slice(this.pos, this.pos + 2) === '\r\n'
    );
  }

  private peekString(pattern: string, caseInsensitive = false): boolean {
    const slice = this.input.slice(this.pos, this.pos + pattern.length);
    return caseInsensitive
      ? slice.toLowerCase() === pattern.toLowerCase()
      : slice === pattern;
  }

  private consumeNewline(): void {
    if (this.input.slice(this.pos, this.pos + 2) === '\r\n') {
      this.pos += 2;
    } else if (this.input[this.pos] === '\n') {
      this.pos += 1;
    }
  }

  // After consuming a block close tag like [/quote] or [/section], ruby
  // also eats any horizontal whitespace remaining on the same line plus one
  // trailing newline. This way `[/quote] \n\nbody` produces a clean
  // paragraph break before `body` instead of an empty <p></p> from the
  // leftover ` \n`.
  private consumeBlockCloseTail(): void {
    while (
      this.pos < this.input.length &&
      isHorizontalWhitespace(this.input.charCodeAt(this.pos))
    ) {
      this.pos++;
    }
    if (this.input.slice(this.pos, this.pos + 2) === '\r\n') {
      this.pos += 2;
    } else if (this.input[this.pos] === '\n' || this.input[this.pos] === '\r') {
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
    while (this.pos < this.input.length) {
      let lookahead = this.pos;
      while (
        lookahead < this.input.length &&
        isHorizontalWhitespace(this.input.charCodeAt(lookahead))
      ) {
        lookahead++;
      }
      if (this.input.slice(lookahead, lookahead + 2) === '\r\n') {
        this.pos = lookahead + 2;
      } else if (
        this.input[lookahead] === '\n' ||
        this.input[lookahead] === '\r'
      ) {
        this.pos = lookahead + 1;
      } else {
        break;
      }
    }
  }

  private peekDoubleNewline(): boolean {
    let tempPos = this.pos;

    // First newline
    if (this.input.slice(tempPos, tempPos + 2) === '\r\n') {
      tempPos += 2;
    } else if (this.input[tempPos] === '\n') {
      tempPos += 1;
    } else {
      return false;
    }

    // Strict: only true contiguous newlines count as a paragraph break.
    // Ruby treats `newline + horizontal whitespace + newline` as two
    // separate single newlines (rendered as `<br>...<br>` inside the same
    // paragraph), not as a paragraph break.
    return (
      this.input.slice(tempPos, tempPos + 2) === '\r\n' ||
      this.input[tempPos] === '\n'
    );
  }

  private peekBlockElementAfterNewline(): boolean {
    const here = this.input[this.pos];
    let offset = 0;
    if (this.input.slice(this.pos, this.pos + 2) === '\r\n') {
      offset = 2;
    } else if (here === '\n') {
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
    const remaining = this.input.slice(this.pos);
    // Some block markers (h1., * item, etc.) are only structural at the
    // start of a line. Mid-line they are ordinary text. Bracketed tags
    // ([code], [/code], ...) break paragraphs regardless of position.
    const atLineStart =
      this.pos === 0 || this.input[this.pos - 1] === '\n';
    // List item pattern must require horizontal whitespace AND a content
    // char. Using `\s` would match a bare `*\n` line; using just `[ \t]+`
    // would match `** \n` (no content after the spaces). In both cases
    // matchListItem would reject the same input, leaving parseBlock unable
    // to advance and the document loop spinning forever.
    const lineStartPatterns = [/^h[123456]\./i, /^\*+[ \t]+[^\s]/];
    const blockPatterns = [
      /^\[quote\]/i,
      /^\[code\]/i,
      /^\[\/code\]/i,
      // Match only forms matchSection accepts: `[section]`,
      // `[section,expanded]`, `[section,expanded=title]`, `[section=title]`.
      // A permissive `^\[section/i` matched malformed openers like
      // `[section,]` and `[section=]`, which matchSection then rejected,
      // causing parseBlock to spin without making progress.
      /^\[section(?:\]|,expanded(?:=[^\]]+)?\]|=[^\]]+\])/i,
      /^\[table\]/i,
      /^\[\/table\]/i,
      /^\[ltable\]/i,
    ];

    // Special handling for spoilers - only block if multiline
    if (/^\[spoilers?\]/i.test(remaining)) {
      const spoilerMatch = remaining.match(
        /^\[spoilers?\](.*?)\[\/spoilers?\]/is,
      );
      if (spoilerMatch && spoilerMatch[1].includes('\n')) {
        return true; // Block spoiler (contains newlines)
      }
      return false; // Inline spoiler (single line)
    }

    // Closes for block containers only count as block markers when their
    // matching open is in scope. Outside of one, ruby treats them as
    // ordinary inline text and so do we (otherwise we infinite-loop in
    // parseBlock since no branch consumes them).
    if (this.quoteDepth > 0 && /^\[\/quote\]/i.test(remaining)) return true;
    if (this.sectionDepth > 0 && /^\[\/section\]/i.test(remaining)) return true;
    if (this.spoilerBlockDepth > 0 && /^\[\/spoilers?\]/i.test(remaining))
      return true;

    // Colored quote opens like [quote=#00CCFF] count as block elements only
    // when the color is valid; invalid color attributes (e.g. [quote=Bob])
    // are treated as inline text by ruby and we mirror that.
    const coloredQuote = remaining.match(/^\[quote=([^\]\n]*)\]/i);
    if (coloredQuote && isValidQuoteColor(coloredQuote[1])) return true;

    if (blockPatterns.some((pattern) => pattern.test(remaining))) return true;
    if (atLineStart && lineStartPatterns.some((p) => p.test(remaining)))
      return true;
    return false;
  }

  protected looksLikeMarkup(): boolean {
    const remaining = this.input.slice(this.pos);
    return (
      remaining.startsWith('{{') ||
      remaining.startsWith('[[') ||
      remaining.startsWith('"http') ||
      remaining.startsWith('<http') ||
      /^"[^"]+":/.test(remaining)
    ); // Match textile links like "text":url or "text":[url]
  }

  protected looksLikeIdPattern(): boolean {
    const remaining = this.input.slice(this.pos);

    const idPatterns = [
      /^post #\d+/i,
      /^thumb #\d+/i,
      /^post changes #\d+/i,
      /^flag #\d+/i,
      /^note #\d+/i,
      /^forum #\d+/i,
      /^topic #\d+/i,
      /^comment #\d+/i,
      /^pool #\d+/i,
      /^user #\d+/i,
      /^artist #\d+/i,
      /^ban #\d+/i,
      /^bur #\d+/i,
      /^alias #\d+/i,
      /^implication #\d+/i,
      /^mod action #\d+/i,
      /^record #\d+/i,
      /^wiki #\d+/i,
      /^set #\d+/i,
      /^blip #\d+/i,
      /^takedown #\d+/i,
      /^take ?down request #\d+/i,
      /^ticket #\d+/i,
    ];

    return idPatterns.some((pattern) => pattern.test(remaining));
  }

  // Link creation methods
  private createIdLink(match: IdMatch): LinkNode {
    const routes: Record<string, string> = {
      post: '/posts/',
      thumb: '/posts/',
      post_changes: '/post_versions?search[post_id]=',
      flag: '/post_flags/',
      note: '/notes/',
      forum_post: '/forum_posts/',
      topic: '/forum_topics/',
      comment: '/comments/',
      pool: '/pools/',
      user: '/users/',
      artist: '/artists/',
      ban: '/bans/',
      bur: '/bulk_update_requests/',
      alias: '/tag_aliases/',
      implication: '/tag_implications/',
      mod_action: '/mod_actions/',
      record: '/user_feedbacks/',
      wiki: '/wiki_pages/',
      set: '/post_sets/',
      blip: '/blips/',
      takedown: '/takedowns/',
      ticket: '/tickets/',
    };

    const href = routes[match.type] + match.id;

    // Display text uses the canonical form for the id-type, not the raw
    // source. `Pool` becomes `pool`, `bur` upcases to `BUR`, and the verbose
    // `take down request` collapses to `takedown` (verified against the
    // oracle). Thumbs piggyback on the post canonical name.
    const canonical =
      DTextStateMachineParser.ID_DISPLAY[match.type] ?? match.type;
    const text = `${canonical} #${match.id}`;

    if (match.type === 'thumb') {
      this.thumbCount++;
      if (this.options.maxThumbs && this.thumbCount > this.options.maxThumbs) {
        // Past the per-document thumb limit ruby drops the thumb-placeholder
        // class and emits a plain post id-link, so swap idType to 'post' to
        // suppress the thumb-only attributes the renderer would otherwise add.
        return {
          type: 'link',
          linkType: 'id_link',
          idType: 'post',
          id: match.id,
          href,
          children: [{ type: 'text', content: text }],
        };
      }
    }

    return {
      type: 'link',
      linkType: 'id_link',
      idType: match.type,
      id: match.id,
      href,
      children: [{ type: 'text', content: text }],
    };
  }

  private createPostSearchLink(match: PostSearchMatch): LinkNode {
    const normalizedTag = asciiLowercase(match.tag);
    const href = `/posts?tags=${rubyUriEscape(normalizedTag)}`;
    const title = match.title || match.tag;

    return {
      type: 'link',
      linkType: 'post_search',
      tags: normalizedTag,
      href,
      children: [{ type: 'text', content: title }],
    };
  }

  private createWikiLink(match: WikiLinkMatch): LinkNode {
    // Anchor presence is signalled by `anchor !== undefined`; an empty-string
    // anchor is meaningful (e.g. `[[abc#]]` -> trailing `#` in href + display,
    // `[[#]]` -> internal anchor with empty fragment). In the href fragment,
    // ASCII spaces become `_` before URI escaping (verified against the
    // oracle: `[[wiki#a b c]]` -> `wiki#a_b_c`); other whitespace like tab
    // is left for `rubyUriEscape` to encode (`\t` -> `%09`). Embedded `#`
    // characters stay literal in the fragment (oracle does not encode them,
    // so `[[abc#x#y#z]]` -> `abc#x#y#z`). Display text preserves the
    // original anchor as typed.
    const anchorHref = (anchor: string) =>
      rubyUriEscape(asciiLowercase(anchor.replace(/ /g, '_'))).replace(
        /%23/g,
        '#',
      );

    if (match.tag === '' && match.anchor !== undefined) {
      const href = `#${anchorHref(match.anchor)}`;
      const title = match.title ?? `#${match.anchor}`;
      return {
        type: 'link',
        linkType: 'wiki',
        href,
        anchor: match.anchor,
        children: [{ type: 'text', content: title }],
      };
    }

    const normalizedTag = asciiLowercase(match.tag.replace(/ /g, '_'));
    let href = `/wiki_pages/show_or_new?title=${rubyUriEscape(normalizedTag)}`;

    if (match.anchor !== undefined) {
      href += `#${anchorHref(match.anchor)}`;
    }

    const title =
      match.title ??
      (match.anchor !== undefined ? `${match.tag}#${match.anchor}` : match.tag);

    return {
      type: 'link',
      linkType: 'wiki',
      href,
      anchor: match.anchor,
      children: [{ type: 'text', content: title }],
    };
  }

  private createTextileLink(match: TextileLinkMatch): LinkNode {
    return {
      type: 'link',
      linkType: 'textile',
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
