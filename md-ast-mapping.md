# Markdown ↔ AST mapping

State of this document: NOT FINAL

The contract this parser implements: for every construct in `markdown.md`, the
markdown form parses to the same canonical AST node the dtext side already
emits for the equivalent `[tag]` form. AST node types are defined in
`src/ast/index.ts`. The dtext column is for cross-reference; that side already
works and is the source of truth for node shape.

The verification: `test/md/ast-equivalence.test.ts` (planned) holds paired
fixtures (one dtext, one markdown) for every row in this document and asserts
deep-equal AST output. If a row has no exact dtext analogue, it is called out
explicitly and the test pairs the markdown form with a hand-constructed expected
AST instead.

Engine: `markdown-it`, with a small set of in-tree plugins for the custom
syntax. Standard CommonMark constructs ride built-in rules where the AST shape
already lines up; the adapter walks `markdown-it` Tokens and emits our nodes.

## Notation

- **md** is the markdown source (the new flavour).
- **dtext** is the equivalent dtext source (existing, ground truth).
- **AST** is the produced node, in TypeScript-ish notation. Children that are
  themselves arbitrary inline content are written `children: [...inline]`;
  children that are block content are `children: [...block]`. Fields shown as
  `?` are optional and omitted when absent.
- A row marked **strict** is rejected at parse with no AST output (see
  Rejected at parse).

## Inline

### Bold

- md: `**text**`
- dtext: `[b]text[/b]`
- AST: `BoldNode { children: [...inline] }`

### Italic

- md: `*text*`
- dtext: `[i]text[/i]`
- AST: `ItalicNode { children: [...inline] }`

### Strikethrough

- md: `~~text~~`
- dtext: `[s]text[/s]`
- AST: `StrikeoutNode { children: [...inline] }`

### Underline

- md: `__text__`
- dtext: `[u]text[/u]`
- AST: `UnderlineNode { children: [...inline] }`

Notes: `markdown-it` parses `__` as `<strong>` by default (an alias for `**`).
The plugin disables that alias and registers `__` as an `UnderlineNode` rule
so it never collides with bold.

### Inline spoiler

- md: `||text||`
- dtext: `[spoiler]text[/spoiler]`
- AST: `InlineSpoilerNode { children: [...inline] }`

Notes: `markdown-it` has no built-in `||` rule. Custom inline plugin. The
dtext side resolves spoilers as either inline or block; on the markdown side,
`||...||` is always inline (it cannot span block boundaries). Block spoilers
use the surviving `[spoiler]...[/spoiler]` BBCode form below.

### Inline code

- md: `` `text` ``
- dtext: `` `text` ``
- AST: `InlineCodeNode { content: "text" }`

### Superscript

- md: `[sup]text[/sup]`
- dtext: `[sup]text[/sup]`
- AST: `SuperscriptNode { children: [...inline] }`

Notes: BBCode survivor. Custom inline plugin. The `^text^` alternative from
markdown.md is **not** implemented (see Open questions).

### Subscript

- md: `[sub]text[/sub]`
- dtext: `[sub]text[/sub]`
- AST: `SubscriptNode { children: [...inline] }`

Notes: BBCode survivor. Custom inline plugin.

### Color

- md: `[color=red]text[/color]`
- dtext: `[color=red]text[/color]`
- AST: `ColorNode { color: "red", children: [...inline] }`

Notes: BBCode survivor. The dtext parser sets `color: ""` when color is
disabled by parser options; the markdown plugin honours the same option so
the renderer's allowColor branch still works unchanged.

### Line break

- md: trailing two spaces, or backslash, before a newline
- dtext: bare `\n` inside a paragraph
- AST: `LineBreakNode`

Notes: paragraph-internal newlines in markdown are soft (joined into the same
text run by CommonMark); only explicit hard breaks emit `LineBreakNode`. The
dtext side emits `LineBreakNode` for every `\n` inside a paragraph, so this
is one of the few rows where the AST shape can legitimately diverge for the
same rendered intent. See Open questions.

## Links and references

### Markdown link

- md: `[text](url)`
- dtext: `"text":url` or `"text":[url]`
- AST: `LinkNode { linkType: "inline", href: "url", children: [...inline-of-text] }`

Notes: the `"inline"` tag is shared with dtext's `"text":url` and
`"text":[url]` forms, since the render rules are identical. Both surface
syntaxes produce a structurally identical `LinkNode`.

### Bare URL

- md: `<https://example.com>` or autolink-detected URL
- dtext: bare URL in body, or `<url>`
- AST: `LinkNode { linkType: "url", href, children: [TextNode { content: href }] }`

### Wikilink (page only)

- md: `[[page]]`
- dtext: `[[page]]`
- AST: `LinkNode { linkType: "wiki", href: "/wiki_pages/show_or_new?title=<normalized>", children: [TextNode { content: "page" }] }`

### Wikilink (page with display title)

- md: `[[page|title]]`
- dtext: `[[page|title]]`
- AST: `LinkNode { linkType: "wiki", href: "/wiki_pages/show_or_new?title=<normalized>", children: [TextNode { content: "title" }] }`

### Wikilink (page with anchor)

- md: `[[page#anchor]]`
- dtext: `[[page#anchor]]`
- AST: `LinkNode { linkType: "wiki", href: "/wiki_pages/show_or_new?title=<normalized>#<encoded-anchor>", anchor: "anchor", children: [TextNode { content: "page#anchor" }] }`

Notes: anchor normalization (lowercased, spaces → `_`, then ruby URI-escaped,
with `%23` decoded back to `#`) lives in `createWikiLink`. The markdown plugin
delegates to a shared helper rather than re-implementing the rules.

### Anchor-only wikilink

- md: `[[#anchor]]`
- dtext: `[[#anchor]]`
- AST: `LinkNode { linkType: "wiki", href: "#<encoded-anchor>", anchor: "anchor", children: [TextNode { content: "#anchor" }] }`

Notes: markdown.md proposes also mapping this to `[anchor](#anchor)`; we
**don't**. The wikilink form is preserved as-is so the AST stays identical to
the dtext side. The plain markdown link form `[anchor](#anchor)` works too,
but parses as a `linkType: "inline"` link, not a wiki link.

### Tag search

- md: `{{tags}}` or `{{tags|title}}`
- dtext: `{{tags}}` or `{{tags|title}}`
- AST: `LinkNode { linkType: "post_search", tags: "<lowercased>", href: "/posts?tags=<encoded>", children: [TextNode { content: "title or tags" }] }`

Notes: custom inline plugin, since `{{` is not a CommonMark sigil. Pattern
shared with the dtext side (`createPostSearchLink`).

### Magic link (post / pool / topic / etc.)

- md: `post #1234`, `pool #5`, `topic #99`, etc.
- dtext: same
- AST: `LinkNode { linkType: "id_link", idType: "post", id: "1234", href: "/posts/1234", children: [TextNode { content: "post #1234" }] }`

Notes: custom inline plugin. Pattern shared with the dtext side
(`createIdLink`, `ID_PATTERNS`, `ID_DISPLAY`, `ID_ROUTES`, `IdType`). One
match per id-type prefix; canonical display form follows `ID_DISPLAY`. Idem
for the full set in `IdType`: `post`, `thumb`, `post_changes`, `flag`,
`note`, `forum_post`, `topic`, `comment`, `pool`, `user`, `artist`, `ban`,
`bur`, `alias`, `implication`, `mod_action`, `record`, `wiki`, `set`, `blip`,
`takedown`, `ticket`. Adding an id type means an entry in the parser
patterns, the display map, the renderer's class map, and the `IdType` union;
the plugin reuses the existing constants rather than copying them.

### Internal anchor definition

- md: `[#name]`
- dtext: `[#name]`
- AST: `InternalAnchorNode { name: "name" }`

Notes: this is a definition (jump target), not a reference. Parses inline.
Dtext lowercases `name` in render; the AST stores it as typed.

## Blocks

### Header

- md: `# text`, `## text`, ..., `###### text`
- dtext: `h1. text`, ..., `h6. text`
- AST: `HeaderNode { level: 1..6, children: [...inline] }`

Notes: `markdown-it` already produces `heading_open`/`heading_close` with
the level encoded in the tag name; the adapter reads it directly. Setext
headers (underlined `===` / `---`) are accepted as `level: 1` and `level: 2`.

### Paragraph

- md: any text not opening another block
- dtext: same
- AST: `ParagraphNode { children: [...inline] }`

### Blockquote

- md (colourless): lines beginning with `> `
- md (coloured): `[quote]...[/quote]` or `[quote=COLOR]...[/quote]`
  (BBCode-survivor form, per captain Q-MD-QUOTE-COLOR path 4)
- dtext: `[quote]...[/quote]` or `[quote=COLOR]...[/quote]`
- AST: `QuoteNode { children: [...block], color? }`

Notes: markdown's `>` syntax always produces a colourless `QuoteNode`
by design. Coloured quotes use the BBCode-survivor form on both sides,
joining the existing survivor set (`[sup]`, `[sub]`, `[color]`,
`[section]`, `[#anchor]`); same shape on dtext, byte-identical AST.
The plugin recognising `[quote]` / `[quote=COLOR]` on the markdown
side lands alongside the formatter implementation. The proposed
`>>>...>>>` fenced-quote form in markdown.md is **not** implemented
(see Resolved design decisions).

### Code block

- md: triple-backtick fenced or four-space indented
- dtext: `[code]...[/code]`
- AST: `CodeBlockNode { content: "..." }`

Notes: language hints (`` ```ruby ``) are accepted at parse but discarded;
the AST has no slot for them. Adding one is a future change that touches the
AST and the dtext side together.

### List

- md: `- item` / `* item` / `+ item`, with two-space (or four-space)
  indentation per nesting level
- dtext: `* item`, `** nested`, `*** deeper`
- AST: `ListNode { items: [ListItemNode { depth, children: [...inline] }, ...] }`

Notes: the dtext `ListItemNode.depth` is the count of leading `*`s. The
markdown adapter translates indentation depth (one indent = one level deeper)
into the same field. A single flat `ListNode` holds the whole tree;
items at different depths sit as siblings inside `items`. The renderer
re-derives nesting from `depth`.

Ordered lists (`1.`, `2.`, ...) are accepted at parse but emit a Diagnostic
and lower into the same `ListNode`/`ListItemNode` shape (no ordered/unordered
distinction in the AST today). See Open questions.

### Pipe table

- md:
  ```
  | a | b |
  |---|---|
  | 1 | 2 |
  ```
- dtext: `[table]...[/table]` BBCode form
- AST: `TableNode { children: [TableHeadNode { rows: [...] }, TableBodyNode { rows: [...] }] }`

Notes: the dtext side distinguishes `[ltable]` (lightweight, pipe-flavoured)
from `[table]` (full BBCode). Markdown's pipe table is closer to `[ltable]`
in spirit but maps to `TableNode` because that node already encodes a
header/body split, which `LTableNode` does not.

### Section

- md (BBCode form): `[section]...[/section]`, `[section=Title]...[/section]`,
  `[section,expanded=Title]...[/section]`
- md (HTML form): `<details>content</details>`,
  `<details><summary>Title</summary>content</details>`,
  `<details open><summary>Title</summary>content</details>`
- dtext: BBCode form only
- AST: `SectionNode { title?, expanded?: true, children: [...block] }`

Notes: both forms produce the same `SectionNode`. The `<summary>` element is
optional (untitled sections are valid in either form). The `open` attribute
on `<details>` maps to `expanded: true`. No other attributes are accepted; a
`<details class="foo">` style attribute on either tag emits
`md.html_tag_rejected` and the tag is preserved as literal text.

## Markdown-it overrides

The plugin disables, replaces, or reconfigures these built-in rules so the
flavour matches the spec above:

- **`__` as bold alias.** Disabled. `__` opens an underline run.
- **HTML inline / HTML block.** Restricted to a small allowlist; everything
  else is rejected. Allowlist (locked by captain decision): `<details>` and
  `<summary>`, used together to express sections in HTML form alongside the
  BBCode `[section]`. No other HTML tags pass through.
- **Reference links / link reference definitions** (`[label]: url`).
  Disabled, since the dtext side has no equivalent and the round-trip would
  be lossy.
- **Setext headers.** Kept (folds into `HeaderNode`); they round-trip to ATX
  headers, with a Diagnostic.
- **Soft newlines.** Configured as hard breaks (`breaks: true` in
  `markdown-it` options). Every `\n` inside a paragraph becomes a
  `LineBreakNode`. CommonMark's default of "two trailing spaces or backslash
  to break" is disabled, both to match the dtext side's per-newline shape and
  because it confuses users.

## Parser API

`parseMarkdown(input: string, options?: ParserOptions): { document: DocumentNode, diagnostics: Diagnostic[] }`.

The parser **never throws**. The contract mirrors the dtext side: anything in,
something out. Failures (malformed structure, rejected constructs, unknown
HTML tags) become `Diagnostic` entries with a `severity` field; the document
keeps going past them, dropping or salvaging the offending span as best it
can. Callers decide whether a `severity: "fatal"` diagnostic should halt
their pipeline.

```ts
interface Diagnostic {
  code: string;            // e.g. "md.legacy_bbcode"
  severity: "info" | "warning" | "fatal";
  message: string;
  // Span is optional today; line/col tracking lands when the adapter wires it.
  range?: { start: number; end: number };
}
```

`fatal` is reserved for rejection cases (the Rejected-at-parse list);
`warning` for lossy mappings that produced an AST node with a known caveat;
`info` for transparent normalizations that the renderer will absorb.

## Diagnostics

Diagnostic codes the parser emits during a parse. Each entry: code, severity,
when emitted, and what callers should surface.

- `md.legacy_bbcode` (`fatal`): a `[b]` / `[i]` / `[u]` / `[s]` / `[code]` /
  `[spoiler]` / `[table]` / `[ltable]` open tag was found in markdown
  input. Rejected; the offending span is preserved as literal text
  and the parse continues. (`[quote]` is *no longer* on this list — it
  joins the BBCode-survivor set per the captain's path-4 resolution
  of `Q-MD-QUOTE-COLOR` in `md-formatter-spec.md`; a coordinated
  parser-side plugin landing later will recognise
  `[quote]` / `[quote=COLOR]` and produce `QuoteNode { color?, children }`.)
- `md.ordered_list_demoted` (`warning`): `1.` / `2.` ordered list was
  lowered into an unordered list (one `ListNode` with a flat `items[]`,
  numbers absorbed by the markers and lost). Future plans on the dtext side
  will add ordered-list support; until then, this is the agreed degradation.
- `md.code_lang_dropped` (`info`): a fenced code block had a language hint
  that the AST has no slot for.
- `md.setext_header_normalized` (`info`): a `===` / `---` underlined header
  was produced; round-trip will emit ATX form.
- `md.reference_link_dropped` (`fatal`): a reference link or
  link-reference-definition was found in markdown input. Rejected; the link
  is preserved as literal text, the definition is dropped.
- `md.html_tag_rejected` (`fatal`): an HTML tag outside the small allowlist
  (`<details>`, `<summary>`) was found. The tag is preserved as literal text;
  the parse continues.

## Rejected at parse

Rejected constructs emit a `fatal` Diagnostic and do not produce a normal AST
node; the offending span is preserved as literal text so authors can find it
in the rendered output. The parser does not throw (see Parser API).

- Inline or block HTML tags outside the allowlist (`<details>`, `<summary>`).
  Code: `md.html_tag_rejected`.
- Legacy BBCode formatting that has a real markdown sigil:
  `[b]`, `[i]`, `[u]`, `[s]`, `[spoiler]`, `[code]`. Authors are
  expected to use `**`, `*`, `__`, `~~`, `||`, and triple-backticks
  respectively. Surviving BBCode (`[sup]`, `[sub]`, `[color]`,
  `[section]`, `[quote]`, `[#anchor]`) is accepted as documented above.
  Code: `md.legacy_bbcode`.

  `[quote]` is on the survivor list because markdown's `>` syntax has
  no slot for the color attribute that `[quote=COLOR]` carries —
  per the captain's path-4 resolution of `Q-MD-QUOTE-COLOR` in
  `md-formatter-spec.md`, the markdown side adopts the BBCode form
  for coloured quotes and reserves `>` for colourless ones. The
  surviving-plugin to recognise `[quote]` / `[quote=COLOR]` lands
  alongside the formatter implementation.
- `[table]...[/table]` and `[ltable]...[/ltable]` BBCode in markdown input.
  Pipe tables are the only accepted form on this side. There is no path from
  markdown input to an `LTableNode`; that node is dtext-only.
  Code: `md.legacy_bbcode`.
- Markdown reference link syntax (`[label]`, `[label]: url`), per the
  override above.
  Code: `md.reference_link_dropped`.

## Resolved design decisions

The eight open questions from the first draft were resolved by the captain
on consultation with the Diligent Parser Artisan. Recorded here in
captain's-call form so the spec stands alone going forward.

1. **`^text^` for superscript.** Not adopted. `[sup]...[/sup]` BBCode is
   the only inline superscript form.

2. **`>>>text>>>` fenced blockquote.** Not adopted. The accepted markdown
   blockquote forms are `>` (colourless) and the BBCode-survivor
   `[quote]` / `[quote=COLOR]` (per item 9 below); the proposed
   triple-`>` fence is not implemented.

3. **`[[#anchor]]`.** Keeps the wikilink shape (`linkType: "wiki"`,
   `href: "#anchor"`). AST-equivalence with the dtext side is the
   tiebreaker.

4. **`<details><summary>` for sections.** Adopted alongside the surviving
   `[section]` BBCode. Sections are vital to a lot of pages and the
   ergonomic gain is worth the limited HTML surface. The HTML allowlist
   contains exactly `<details>` and `<summary>`; everything else still emits
   `md.html_tag_rejected`. See the Section row in Blocks for the AST
   mapping; both forms produce the same `SectionNode`.

5. **Ordered lists.** Lowered to `ListNode` with a
   `md.ordered_list_demoted` (`warning`) diagnostic. The marker numbers are
   absorbed by the markdown engine and lost; the bullets render as
   unordered. The dtext side has plans to gain real ordered-list support
   later; until then this asymmetric degradation is the agreed contract.

6. **Soft newlines.** Treated as hard breaks. `markdown-it` is configured
   with `breaks: true`; every `\n` inside a paragraph becomes a
   `LineBreakNode`. CommonMark's "trailing two spaces" rule is disabled
   because it is confusing to non-expert authors and because matching the
   dtext side's per-newline shape happens to fall out of the same
   configuration.

7. **`[ltable]` in markdown input.** Rejected with
   `md.legacy_bbcode`. There is no path from markdown input to an
   `LTableNode`; that node is dtext-only.

8. **Parser API.** The parser never throws. `parseMarkdown` returns
   `{ document, diagnostics }`. See Parser API above for the full contract
   and the `Diagnostic.severity` shape.

9. **Coloured blockquote (`Q-MD-QUOTE-COLOR`, post-resolution
   amendment).** The markdown side adopts the BBCode-survivor form
   `[quote]` / `[quote=COLOR]` for blockquotes that carry a colour;
   markdown's `>` syntax always produces a colourless `QuoteNode`,
   by design. `[quote]` retires from the `md.legacy_bbcode` rejection
   set and joins the surviving BBCode group (`[sup]`, `[sub]`,
   `[color]`, `[section]`, `[#anchor]`). A coordinated parser plugin
   (modeled on `[section]`) lands alongside the formatter
   implementation. See `md-formatter-spec.md` Q-MD-QUOTE-COLOR for
   the formatter dispatch rule and parser-side coordination notes.

## Prerequisites for the first commit

These are dtext-side or AST-side changes the markdown adapter depends on.
They land before, or in the same commit as, the adapter scaffold so the
imports resolve.

- **Wikilink href normalization helper.** Today the anchor-to-href
  normalization (lowercase, spaces to `_`, ruby URI-escape, decode `%23`
  back to `#`) lives inline inside `createWikiLink` in
  `src/dtext/parse/index.ts`. Extracted to a free helper so the markdown
  plugin produces byte-identical hrefs without copying the rules. The dtext
  side delegates to the same helper, no behavior change expected.
- **ID-link metadata exposure.** `ID_PATTERNS`, `ID_DISPLAY`, and
  `ID_ROUTES` are private statics on the dtext parser today. Either lifted
  to module-level exports so the markdown id-link plugin reads the same
  data, or wrapped in a small shared module. The decision should follow
  whatever the Artisan's planned A1 cleanup of these constants has settled
  on; if that cleanup has landed, the export is already there.

