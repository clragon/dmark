# Markdown ↔ dtext mapping

Per-construct reference for the dmark parser/formatter. Each entry shows the
markdown source, the AST node it parses to, and the dtext source the formatter
emits for that node. Design rationale and rejected alternatives live in
`docs/adr/`; entries cite ADR numbers where a decision is recorded there.

## Notation

- **md:** markdown source (the dmark flavour).
- **AST:** the AST node, in TypeScript-ish notation. AST node types are
  defined in `src/ast/index.ts`.
- **dtext:** dtext source.
- `children: [...inline]` means the children list holds arbitrary inline
  content; `children: [...block]` means block content.
- Fields shown with `?` are optional and omitted when absent.
- Multi-line dtext output uses literal `\n` where line boundaries matter.

## Inline constructs

### Bold

- md: `**text**`
- AST: `BoldNode { children: [...inline] }`
- dtext: `[b]<inline>[/b]`

### Italic

- md: `*text*`
- AST: `ItalicNode { children: [...inline] }`
- dtext: `[i]<inline>[/i]`

### Strikethrough

- md: `~~text~~`
- AST: `StrikeoutNode { children: [...inline] }`
- dtext: `[s]<inline>[/s]`

### Underline

- md: `__text__`
- AST: `UnderlineNode { children: [...inline] }`
- dtext: `[u]<inline>[/u]`

Notes: `markdown-it` parses both `**` and `__` as `strong`, distinguished by
the token's `markup` field. The walker re-tags `strong_open` with
`markup === '__'` as `UnderlineNode`; everything else stays `BoldNode`. No
custom inline rule is registered.

### Superscript

- md: `[sup]text[/sup]` (BBCode survivor)
- AST: `SuperscriptNode { children: [...inline] }`
- dtext: `[sup]<inline>[/sup]`

### Subscript

- md: `[sub]text[/sub]` (BBCode survivor)
- AST: `SubscriptNode { children: [...inline] }`
- dtext: `[sub]<inline>[/sub]`

### Inline spoiler

- md: `||text||`
- AST: `InlineSpoilerNode { children: [...inline] }`
- dtext: `[spoiler]<inline>[/spoiler]`

Notes: `||...||` cannot span block boundaries on the markdown side; block
spoilers use the BBCode form (see Spoiler block). The dtext parser
disambiguates inline-vs-block spoiler by paragraph-boundary context, and the
formatter places open tags so that classification round-trips.

### Inline code

- md: `` `text` ``
- AST: `InlineCodeNode { content: "text" }`
- dtext: `` `<content>` ``

Notes: dtext's inline-code rule terminates on the first backtick, so dtext
source can never produce a backtick-bearing `InlineCodeNode`. Markdown's
multi-backtick fence rule can produce one. See ADR-0010 for the
documented-divergence handling on the markdown → AST → dtext path.

### Color

- md: `[color=red]text[/color]` (BBCode survivor)
- AST: `ColorNode { color: "red", children: [...inline] }`
- dtext: `[color=<color>]<inline>[/color]`

Notes: `color` is preserved as typed (case-sensitive). The dtext parser's
`isValidQuoteColor` gate (hex 3/6, strict-lowercase word, or tag-category
alias) rejects invalid colors at parse time; any `color` field on an AST
node is by construction a form the parser will accept on round-trip. When
parser options disable color, the dtext parser sets `color: ""`; the
markdown plugin honours the same option.

### Line break

- md: paragraph-internal `\n` (markdown-it runs with `breaks: true`)
- AST: `LineBreakNode`
- dtext: `\n`

Notes: every paragraph-internal newline emits a `LineBreakNode` on both
sides. CommonMark's "trailing two spaces" rule is disabled.

### Fragment

- AST: `FragmentNode { children: [...inline] }`
- md / dtext: children emitted with no wrapper.

See Salvage paths.

## Links and references

### Markdown link

- md: `[text](url)`
- AST: `LinkNode { linkType: "inline", href, children: [...inline] }`
- dtext: `"<children-as-flat-text>":<href>` or `"<children-as-flat-text>":[<href>]`

Notes: `linkType: "inline"` is shared with dtext's textile-link forms; both
surface syntaxes produce a structurally identical `LinkNode`. The dtext-side
bracket-vs-bare picking rule is in ADR-0005. Markdown URL escaping is in
ADR-0014.

### Bare URL

- md: bare `https://...` (markdown-it autolinker) or `<https://...>` autolink
- AST: `LinkNode { linkType: "url", href, children: [TextNode { content: href }] }`
- dtext: bare `<href>` or delimited `<<href>>`

Notes: dtext bare-vs-delimited rule in ADR-0006; markdown bare-vs-autolink
rule in ADR-0015.

### Wikilink

- md: `[[page]]`, `[[page|title]]`, `[[page#anchor]]`, `[[page#anchor|title]]`
- AST: `LinkNode { linkType: "wiki", href, anchor?, children: [TextNode { content }] }`
- dtext: same surface forms as md.

`href` is the normalised lookup form
(`/wiki_pages/show_or_new?title=<normalized>`, optionally followed by an
encoded anchor). Anchor normalisation (lowercased, spaces → `_`, then ruby
URI-escaped, with `%23` decoded back to `#`) lives in `createWikiLink`; the
markdown plugin delegates to that helper.

Page recovery on emit splits by case (see ADR-0004):

- **No-title case.** `children[0].content` carries the original `tag` (or
  `tag#anchor`), with original casing intact. The formatter recovers the
  page directly. Info-lossless.
- **Title-override case.** `children[0].content` is the display title, not
  the page. The page is reconstructed from the normalised `href` and is
  case-lossy.

### Anchor-only wikilink

- md: `[[#anchor]]`
- AST: `LinkNode { linkType: "wiki", href: "#<encoded-anchor>", anchor: "<raw>", children: [TextNode { content: "#<raw>" }] }`
- dtext: `[[#<raw-anchor>]]`

Notes: the formatter uses `node.anchor` (raw, as typed) directly. The plain
markdown link form `[anchor](#anchor)` also resolves but parses as
`linkType: "inline"`, not as a wiki link.

### Tag search

- md: `{{tags}}` or `{{tags|title}}`
- AST: `LinkNode { linkType: "post_search", tags: "<lowercased>", href: "/posts?tags=<encoded>", children: [TextNode { content: "title or tags" }] }`
- dtext: `{{<tags>}}` or `{{<tags>|<title>}}`

Notes: `tags` is lowercased on the AST; the original casing is not
preserved. Title-vs-bare on emit is determined by whether
`children[0].content` differs from `tags`. Custom inline plugin on the
markdown side, since `{{` is not a CommonMark sigil; pattern shared with
the dtext side via `createPostSearchLink`.

### Magic / id link

- md: `post #1234`, `pool #5`, `topic #99`, etc.
- AST: `LinkNode { linkType: "id_link", idType, id, href, children: [TextNode { content: "<display> #<id>" }] }`
- dtext: `<source-prefix> #<id>`

Notes: the canonical emit prefix is the **source spelling**, not the display
spelling. The two diverge for `thumb` (display `post`) and for case (`bur`
display `BUR`). The mapping is locked in ADR-0001 via `ID_SOURCE` in
`src/ast/links.ts`. The formatter ignores `children[0].content` (which
carries the display form) and rebuilds `<source-prefix> #<id>` from
`idType` and `id`.

The full set of `idType` values: `post`, `thumb`, `post_changes`, `flag`,
`note`, `forum_post`, `topic`, `comment`, `pool`, `user`, `artist`, `ban`,
`bur`, `alias`, `implication`, `mod_action`, `record`, `wiki`, `set`,
`blip`, `takedown`, `ticket`. Adding an id type means an entry in the
parser patterns, the display map, the source map, the renderer's class
map, and the `IdType` union.

The over-limit thumb rewrite (`thumb` → `post` when `maxThumbs` is
exceeded) is parser-side; once an AST node has `idType: "post"` the
formatter emits `post #<id>` unconditionally.

### Internal anchor

- md: `[#name]` (BBCode survivor)
- AST: `InternalAnchorNode { name }`
- dtext: `[#<name>]`

Notes: definition (jump target), not a reference. `name` is preserved as
typed in the AST; the renderer lowercases at HTML emit time.

## Block constructs

### Header

- md: `# text`, `## text`, ..., `###### text` (ATX form)
- AST: `HeaderNode { level: 1..6, children: [...inline] }`
- dtext: `h<level>. <inline>`

Notes: setext headers (`===` / `---` underlined) are accepted at parse,
folded into `HeaderNode { level: 1 | 2 }`, and emit a
`md.setext_header_normalized` info diagnostic. The markdown formatter
always emits the ATX form; the original surface form is unrecoverable from
the AST.

### Paragraph

- md: any text not opening another block
- AST: `ParagraphNode { children: [...inline] }`
- dtext: `<inline>`

Notes: a `LineBreakNode` inside a paragraph emits a literal `\n`, so a
multi-line paragraph stays multi-line on both sides. The paragraph's own
boundary is the `\n\n` block separator.

### Blockquote

- md (colourless): lines beginning with `> `
- md (coloured): `[quote]...[/quote]` or `[quote=COLOR]...[/quote]` (BBCode survivor)
- AST: `QuoteNode { children: [...block], color? }`
- dtext: `[quote]\n<blocks>\n[/quote]` or `[quote=<color>]\n<blocks>\n[/quote]`

Notes: markdown's `>` syntax always produces a colourless `QuoteNode`;
coloured quotes use the BBCode form on both sides (see ADR-0018). The
markdown formatter dispatches on `node.color`: undefined → `>` form,
defined → `[quote=<value>]` form. `color` is emitted verbatim with original
casing on both sides.

### Spoiler block

- md: `[spoiler]\n<blocks>\n[/spoiler]` (BBCode survivor)
- AST: `SpoilerBlockNode { children: [...block] }`
- dtext: `[spoiler]\n<blocks>\n[/spoiler]`

Notes: same surface form as the inline spoiler on the dtext side; the
parser disambiguates by paragraph-boundary context. The markdown side
reserves `||...||` for inline and the BBCode form for block.

### Section

- md (BBCode form, canonical): `[section]`, `[section,expanded]`,
  `[section=Title]`, `[section,expanded=Title]`
- md (HTML form, accepted at parse only): `<details>...</details>`,
  `<details><summary>Title</summary>...</details>`,
  `<details open>...</details>`
- AST: `SectionNode { title?, expanded?: true, children: [...block] }`
- dtext: same four BBCode shapes as md.

Body in either form: `\n<blocks>\n[/section]` for BBCode;
`</details>` close for HTML.

Notes: both forms produce the same `SectionNode`. `<summary>` is optional;
the `open` attribute on `<details>` maps to `expanded: true`. No other HTML
attributes are recognised; `<details class="foo">` style markup misses the
section plugin's regex and falls through to text. The markdown formatter
emits the BBCode form (ADR-0011).

### Code block

- md: triple-backtick fenced (or four-space indented)
- AST: `CodeBlockNode { content: "..." }`
- dtext: `[code]<content>[/code]`

Notes: `content` is emitted verbatim. The dtext parser captures the literal
slice between `[code]` and `[/code]` without normalisation; the formatter
re-emits it without padding (ADR-0007). User-fenced layout round-trips
because the `\n` boundary is part of `content`.

Language hints (`` ```ruby ``) are accepted at parse but discarded with a
`md.code_lang_dropped` info diagnostic; the AST has no slot for them.

### Table (heavy)

- md: pipe-table form:
  ```
  | a | b |
  |---|---|
  | 1 | 2 |
  ```
- AST: `TableNode { children: [TableHeadNode, TableBodyNode, ...] }` with
  `TableRowNode { cells: [TableCellNode, ...] }` and cells carrying
  `cellType: 'th' | 'td'`.
- dtext (pretty layout, ADR-0008):
  ```
  [table]
  [thead]
  [tr][th]<inline>[/th][th]<inline>[/th][/tr]
  [/thead]
  [tbody]
  [tr][td]<inline>[/td][td]<inline>[/td][/tr]
  [/tbody]
  [/table]
  ```

Notes: pipe tables require a header separator row; the markdown formatter
generates one regardless of the head/body split. Alignment markers
(`:---`, `---:`, `:---:`) are not in the AST and are emitted as plain
`---`. Cell content is inline-only on the markdown surface; multi-line
cell content (rare on the dtext side) collapses each `LineBreakNode` to a
single space with a `md.table_cell_linebreak_collapsed` warning (ADR-0019).

### Light table (`ltable`) — dtext-only

- AST: `LTableNode { rows: [TableRowNode, ...] }` (no head/body split).
- dtext:
  ```
  [ltable]
  <head-cell> | <head-cell> | <head-cell>
  <body-cell> | <body-cell> | <body-cell>
  ...
  [/ltable]
  ```
- md (emit only, lossy): pipe-table approximation with a
  `md.ltable_approximated` warning (ADR-0012). First row is treated as
  header, remaining rows as body.

Notes: the first row is the implicit header. Cell separator is `' | '`
(space-pipe-space, ADR-0009). `[ltable]` BBCode in markdown input is
rejected at parse with `md.legacy_bbcode`; there is no markdown source form
for `LTableNode`.

### List

- md: `- item`, two-space indent per nesting level (ADR-0016)
- AST: `ListNode { items: [ListItemNode { depth, children: [...inline] }, ...] }`
- dtext: one line per item, `<depth>` asterisks + a single space:
  ```
  * top-level
  ** nested once
  *** nested twice
  * back to top
  ```

Notes: depth is encoded in the asterisk count, mirroring the parser's
`(\*+)[ \t]+` rule. Items are siblings in a flat `items[]` regardless of
nesting; the renderer re-derives nesting from `depth`. The markdown parser
accepts `-` / `*` / `+` as bullet markers; the formatter emits `- `.

Ordered lists (`1.`, `2.`, ...) are accepted at markdown parse but lowered
into the same `ListNode`/`ListItemNode` shape with a
`md.ordered_list_demoted` warning. The marker numbers are absorbed and
lost; the bullets render as unordered. The markdown formatter emits
unordered unconditionally.

## Salvage paths

Three node types are not canonical dtext; they are dtext-parser escape
hatches for content the dtext rules could not interpret cleanly. The dtext
formatter passes them through so the AST round-trips. The markdown parser
does not produce them; the markdown formatter emits each with a
`md.dtext_salvage_passthrough` warning (ADR-0013).

### Raw block text

- AST: `RawBlockTextNode { content }`
- Source: stray block-level closing tags (`[/code]`, `[/table]`) without a
  matching open in scope.
- dtext emit: `content` verbatim, no wrapping or escaping.
- markdown emit: `content` verbatim, with diagnostic.

### Literal HTML

- AST: `LiteralHtmlNode { prefix, children: [...inline] }`
- Source: stray-close fallout. The dtext parser captures a verbatim HTML
  fragment in `prefix` (inter-block whitespace + the close tag) and
  continues streaming inline content in `children`.
- dtext emit: `prefix` verbatim, then inline children. Round-tripping
  through `parseDText` does not necessarily reproduce the same
  `LiteralHtmlNode` shape; the salvage path itself is a divergence from
  canonical dtext.
- markdown emit: `prefix` verbatim, then inline children, with diagnostic.
  With `html: false` on the markdown parser, a re-parse treats the HTML
  markup as literal text.

### Fragment

- AST: `FragmentNode { children: [...inline] }`
- Source: an over-deep `[sup]` / `[sub]` open the parser dropped; children
  still bubble up.
- dtext emit: children, no wrapper.
- markdown emit: children, no wrapper.

## Block separator policy

Between any two block nodes inside a `DocumentNode` or block-container child
list (quote, spoiler, section), both formatters emit a single `\n\n`
separator. Inside `ListNode.items`, each item gets exactly one trailing
`\n`. Code blocks, ltable rows, and table rows establish their own
internal line layout; the surrounding `\n\n` policy applies at their
boundaries with sibling blocks.

No trailing newline at document end (ADR-0002). Output ends exactly at
the last block's last character.

## Text-content escape policy

### dtext side

`TextNode.content` is emitted **verbatim**, with no defensive escaping of
`[`, `*`, `` ` ``, etc. The dtext parser does not implement universal
backslash escaping, so the AST got there by classifying the source text as
plain text in its surrounding context; re-emitting the same text in the
same surrounding context reproduces the same classification on round-trip.
Verification rests on the round-trip harness.

### markdown side

`TextNode.content` is emitted with **selective backslash-escaping** for
sigils that would otherwise re-parse as markup in the surrounding context
(ADR-0017):

- **Always escape:** `*`, `_`, `` ` ``, `\`, `[`, `~~`, `||`.
- **Line-start only:** `#`, `>`, `-`, `+`, `1.`-`9.`, `|`.
- **Skip:** `<`, `>`. The markdown parser runs with `html: false`; raw
  HTML in text positions is never interpreted as markup, and the
  formatter never emits unescaped raw HTML in text positions.

Markdown's sigil set is wider and more context-sensitive than dtext's;
escaping is reachable from formatter output (a
`TextNode { content: "*foo*" }` would re-parse as italic without
escaping), so the markdown side cannot follow dtext's verbatim policy.

## Markdown-it overrides

The markdown parser reconfigures these built-in rules so the flavour
matches the spec:

- **`__` as bold alias.** Not disabled at the markdown-it level. The
  walker re-tags `strong_open` tokens whose `markup` field is `__` as
  `UnderlineNode` instead of `BoldNode`.
- **HTML inline / HTML block.** `markdown-it` runs with `html: false`. No
  HTML tag is tokenised as HTML; every `<...>` becomes text content. The
  section plugin recognises `<details>` / `<summary>` at the line level
  (regex match) and lifts them to `SectionNode`; any other HTML tag
  survives as plain text in the rendered output, with no diagnostic.
- **Reference links / link reference definitions** (`[label]: url`).
  Disabled. The dtext side has no equivalent and the round-trip would be
  lossy.
- **Setext headers.** Kept (folds into `HeaderNode`); rounds-trip to ATX
  with a `md.setext_header_normalized` info diagnostic.
- **Soft newlines.** Configured as hard breaks (`breaks: true`). Every
  `\n` inside a paragraph becomes a `LineBreakNode`. CommonMark's "two
  trailing spaces" rule is disabled.

Custom inline plugins handle constructs CommonMark does not provide:
`||...||` (inline spoiler), `[sup]` / `[sub]` / `[color]` / `[#anchor]`
BBCode survivors, `[[...]]` wikilinks, `{{...}}` tag searches, magic id
links, `[section]` / `[quote]` BBCode survivors at the block level.

## Parser API

```ts
parseDText(input: string, options?: ParserOptions): {
  document: DocumentNode;
  diagnostics: Diagnostic[];
};

parseMarkdown(input: string, options?: ParserOptions): {
  document: DocumentNode;
  diagnostics: Diagnostic[];
};
```

Both parsers **never throw**. Anything in, something out. Failures
(malformed structure, rejected constructs) become `Diagnostic` entries
with a `severity` field; the document keeps going, dropping or salvaging
the offending span.

```ts
interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "fatal";
  message: string;
  range?: { start: number; end: number };
}
```

`fatal` is reserved for rejection cases (see Rejected at parse);
`warning` for lossy mappings that produced an AST node with a known
caveat; `info` for transparent normalisations the renderer absorbs.

## Formatter API

```ts
formatDText(ast: ASTNode, options?: FormatterOptions): {
  output: string;
  diagnostics: Diagnostic[];
};

formatMarkdown(ast: ASTNode, options?: FormatterOptions): {
  output: string;
  diagnostics: Diagnostic[];
};
```

Both formatters return `{ output, diagnostics }` (ADR-0003). The shared
shape lets callers treat both pipelines identically. The dtext-side
diagnostic catalog is empty; documented divergences (inline-code
backticks, salvage-path round-trips) surface in the round-trip harness
rather than as runtime diagnostics.

## Diagnostic catalog

| Code | Severity | When emitted | What to do |
| --- | --- | --- | --- |
| `md.legacy_bbcode` | fatal | A `[b]` / `[i]` / `[u]` / `[s]` / `[code]` / `[spoiler]` / `[table]` / `[ltable]` open tag was found in markdown input. | Span preserved as literal text; rewrite the source to use the markdown sigil. |
| `md.ordered_list_demoted` | warning | An ordered list (`1.`, `2.`, ...) was lowered to `ListNode` with the marker numbers lost. | Accept the demote, or rewrite as an unordered list. |
| `md.code_lang_dropped` | info | A fenced code block had a language hint that the AST has no slot for. | Informational; no action required. |
| `md.setext_header_normalized` | info | A `===` / `---` underlined header was folded to `HeaderNode`; round-trip emits ATX. | Informational; no action required. |
| `md.reference_link_dropped` | fatal | A reference link or link-reference-definition was found in markdown input. | Link text preserved as literal; definition dropped. Rewrite as inline. |
| `md.ltable_approximated` | warning | `LTableNode` was emitted to markdown as a pipe-table approximation. | Lossy on the no-head/body split detail; accept or reroute through the dtext formatter. |
| `md.dtext_salvage_passthrough` | warning | A salvage-path node (`RawBlockTextNode`, `LiteralHtmlNode`, `FragmentNode`) was emitted to markdown verbatim. | Round-trip through markdown is structurally lossy for these nodes. |
| `md.table_cell_linebreak_collapsed` | warning | A `LineBreakNode` inside a `TableCellNode` was replaced by a single space on markdown emit. | Pipe tables cannot represent multi-line cells; accept the collapse. |

## Rejected at parse (markdown side)

Rejected constructs emit a `fatal` diagnostic and do not produce a normal
AST node; the offending span is preserved as literal text so authors can
find it in the rendered output.

- **Legacy BBCode formatting that has a markdown sigil:** `[b]`, `[i]`,
  `[u]`, `[s]`, `[spoiler]`, `[code]`. Authors use `**`, `*`, `__`, `~~`,
  `||`, and triple-backticks respectively. Code: `md.legacy_bbcode`.
- **`[table]` and `[ltable]` BBCode in markdown input.** Pipe tables are
  the only accepted markdown form for `TableNode`. There is no markdown
  source form for `LTableNode`. Code: `md.legacy_bbcode`.
- **Markdown reference link syntax** (`[label]`, `[label]: url`). The
  dtext side has no equivalent and the round-trip would be lossy. Code:
  `md.reference_link_dropped`.

Surviving BBCode (`[sup]`, `[sub]`, `[color]`, `[section]`, `[quote]`,
`[#anchor]`) is accepted on the markdown side as documented in the
inline and block sections above.

## Constructs without a cross-side analogue

- **`LTableNode` is dtext-only.** No markdown source form produces it.
  Markdown emit goes through the lossy pipe-table approximation
  (ADR-0012).
- **Setext headers are markdown-only-source.** They lower to
  `HeaderNode { level: 1 | 2 }` at parse with a
  `md.setext_header_normalized` info diagnostic; both formatters emit
  ATX form on the markdown side and `h1.` / `h2.` on the dtext side.
- **Ordered lists are markdown-only-source.** They lower to the same
  `ListNode` / `ListItemNode` shape as unordered lists, with a
  `md.ordered_list_demoted` warning. Marker numbers are lost.
- **Salvage-path nodes (`RawBlockTextNode`, `LiteralHtmlNode`,
  `FragmentNode`) are dtext-parser-originated.** The markdown parser
  never produces them; markdown emit is verbatim passthrough with a
  warning (ADR-0013).
