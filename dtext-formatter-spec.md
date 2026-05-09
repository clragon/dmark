# AST → DText mapping

State of this document: NOT FINAL

The contract this formatter implements: for every AST node the parsers produce
(`src/ast/index.ts`), this document names the canonical dtext source the
formatter emits. The dtext parser is the inverse — and the source of truth for
what dtext *is*. Where there is one obvious surface form, this spec records it
without ceremony; where multiple surface forms are equivalent under the
parser, the canonical choice is captain-resolved and recorded.

The verification: `test/dtext/round-trip.test.ts` (planned) will pair each AST
node with its emitted dtext and assert `parseDTextToAST(format(ast))` is
deep-equal to `ast`. The formatter inadvertently becomes the project's dtext
formatter; round-trip stability on the AST is the load-bearing guarantee.

## Notation

- **AST** is the input node, in TypeScript-ish notation. Children are
  abbreviated `[...inline]` or `[...block]`.
- **dtext** is the canonical output. Multi-line forms are shown literally with
  `\n` where line boundaries matter.

## Inline

### Bold

- AST: `BoldNode { children: [...inline] }`
- dtext: `[b]<inline>[/b]`

### Italic

- AST: `ItalicNode { children: [...inline] }`
- dtext: `[i]<inline>[/i]`

### Strikethrough

- AST: `StrikeoutNode { children: [...inline] }`
- dtext: `[s]<inline>[/s]`

### Underline

- AST: `UnderlineNode { children: [...inline] }`
- dtext: `[u]<inline>[/u]`

### Superscript

- AST: `SuperscriptNode { children: [...inline] }`
- dtext: `[sup]<inline>[/sup]`

### Subscript

- AST: `SubscriptNode { children: [...inline] }`
- dtext: `[sub]<inline>[/sub]`

### Inline spoiler

- AST: `InlineSpoilerNode { children: [...inline] }`
- dtext: `[spoiler]<inline>[/spoiler]`

Notes: same surface form as the block spoiler. The dtext parser disambiguates
by paragraph-boundary context; the formatter relies on that and emits the
inline form whenever the AST node is `InlineSpoilerNode`. Round-trip stays
stable because the formatter's choice of where the node lives (inside a
paragraph vs. its own block) drives the parser's classification.

The parser's documented `getSpoilerClosePattern` faithfulness gap (the parser
preferring `[/spoilers]` over `[/spoiler]` when both could match ahead) does
**not** apply to formatter output: the formatter emits `[/spoiler]`
unconditionally, never `[/spoilers]`, so the gap surface is unreachable
from formatter-produced text.

### Inline code

- AST: `InlineCodeNode { content: "..." }`
- dtext: `` `<content>` ``

Notes: content containing backticks is unrepresentable in dtext source (the
parser terminates on the first backtick); see **Q-INLINE-CODE-BACKTICK** in
the Resolved design decisions section for the documented-divergence
handling on the markdown→dtext path.

### Color

- AST: `ColorNode { color: "...", children: [...inline] }`
- dtext: `[color=<color>]<inline>[/color]`

Notes: `color` is preserved as typed in the AST (case-sensitive — `Character`
≠ `character`). The formatter emits the same string verbatim. The parser's
`isValidQuoteColor` gate (hex 3/6, strict-lowercase word, or tag-category
alias) is responsible for rejecting invalid colors at parse time, so any
`color` field that survives into the AST is by construction a form the parser
will accept on round-trip.

### Line break

- AST: `LineBreakNode`
- dtext: `\n`

Notes: paragraph-internal `\n`. The dtext parser emits one `LineBreakNode` per
line terminator inside a paragraph; the formatter does the inverse.

### Fragment

- AST: `FragmentNode { children: [...inline] }`

See Salvage paths below.

### URL link (bare)

- AST: `LinkNode { linkType: "url", href, children: [TextNode { content: href }] }`
- dtext: bare `<href>` (e.g. `https://example.com/foo`) by default; or the
  delimited form `<<href>>` — literal `<` and `>` wrapping the URL, e.g.
  `<https://example.com/foo>` — when the URL contains whitespace or trailing
  characters that `trimUrlBoundaries` would re-trim out of a bare match.

The parser emits this node from two surface forms: bare URLs (`https://...`)
and delimited URLs (`<https://...>`). On the formatter side, the canonical
form depends on the URL's lexical shape — see **Q-URL-DELIMITER** below.

### Textile link

- AST: `LinkNode { linkType: "inline", href, children: [...inline] }`
- dtext: `"<children-as-flat-text>":<href>` or `"<children-as-flat-text>":[<href>]`

Notes: the bracketed form (`"text":[url]`) covers urls containing whitespace
(the bare form is `\S+`-only) or characters that would be eaten by
`trimUrlBoundaries`. Exact rule for picking bracket vs. bare: see
**Q-TEXTILE-BRACKET** below.

The `linkType: "inline"` tag is shared with markdown's `[text](url)` (per
`md-ast-mapping.md`); both pipelines produce the same AST shape and the
renderer treats them identically.

### Wikilink

- AST: `LinkNode { linkType: "wiki", href, anchor?, children: [TextNode { content }] }`
- dtext (one of):
  - `[[<page>]]` — page only, no display title.
  - `[[<page>|<title>]]` — page with display title.
  - `[[<page>#<anchor>]]` — page + anchor.
  - `[[<page>#<anchor>|<title>]]` — page + anchor + display title.
  - `[[#<anchor>]]` — anchor-only (page is the empty string).

Recovering `page` from the AST splits into two cases:

- **No-title case** (`children[0].content` does not include `|` from a title
  override; `buildWikiLink`'s no-title branch). The original `tag` *is*
  preserved here — `children[0].content` is exactly `tag` (or `tag#anchor`
  for the with-anchor variant). The formatter recovers it directly,
  preserving original casing. Info-lossless.
- **Title case**. `children[0].content` carries the display title, not the
  page. The page must be reconstructed from `href`, which only stores the
  *normalized* form (lowercase, spaces → `_`, URI-encoded). The
  reconstruction is lossy on case.

See **Q-WIKI-PAGE-RECOVER** below for the title-case recovery rule.

### Anchor-only wikilink

- AST: `LinkNode { linkType: "wiki", href: "#<encoded-anchor>", anchor: "<raw>", children: [TextNode { content: "#<raw>" }] }`
- dtext: `[[#<raw-anchor>]]`

Notes: the formatter uses `node.anchor` (raw, as typed) directly. No href
decoding required for this branch.

### Tag search

- AST: `LinkNode { linkType: "post_search", tags: "<lowercased>", href, children: [TextNode { content: "<title-or-tags>" }] }`
- dtext: `{{<tags>}}` or `{{<tags>|<title>}}`

Notes: `tags` is the lowercased form (the only one preserved on the AST);
re-casing the original is impossible. Title-vs-bare is determined by whether
`children[0].content` differs from `tags`.

### Magic / id link

- AST: `LinkNode { linkType: "id_link", idType, id, href, children: [TextNode { content: "<display> #<id>" }] }`
- dtext: `<source-prefix> #<id>` (e.g. `post #1234`, `thumb #1234`, `BUR #5`,
  `mod action #99`, `forum #42`).

The canonical prefix is the **source spelling** that the parser would
reverse-map to the same `idType` via `ID_TYPE_MAP` — *not* the display form.
The two diverge for `thumb` (display form `post`); using the display form
here would round-trip-break a `thumb` AST into a `post` AST. See
**Q-MAGIC-LINK-CANONICAL** below for the full canonical-source table and
the takedown ambiguity.

Note that `node.children[0].content` carries the *display* form (built by
`buildIdLink` from `ID_DISPLAY`) which is appropriate for HTML link text but
not for re-emit. The formatter ignores the children content for id-links and
rebuilds `<source-prefix> #<id>` from `idType` and `id`.

The over-limit thumb rewrite (`thumb` → `post` in the parser when `maxThumbs`
is exceeded) is a parse-time concern and not the formatter's problem; once
an AST node has `idType: "post"`, the formatter emits `post #<id>`
unconditionally. The original `thumb` source is unrecoverable from the AST
in that case — that's parser-side semantics, not lost data.

### Internal anchor

- AST: `InternalAnchorNode { name }`
- dtext: `[#<name>]`

Notes: `name` is preserved as-typed in the AST. The renderer lowercases at
HTML emit time; the formatter emits the source-typed form.

## Blocks

### Header

- AST: `HeaderNode { level: 1..6, children: [...inline] }`
- dtext: `h<level>. <inline>`

Notes: one line per header. Block separator below the header is the standard
`\n\n` that follows every block in this spec.

### Paragraph

- AST: `ParagraphNode { children: [...inline] }`
- dtext: `<inline>`

Notes: a `LineBreakNode` inside a paragraph emits a literal `\n` (see Line
break above), so a multi-line paragraph stays as multi-line dtext. The
paragraph's own boundary is the `\n\n` separator emitted between blocks.

### Blockquote

- AST: `QuoteNode { children: [...block], color? }`
- dtext: `[quote]\n<blocks>\n[/quote]` or `[quote=<color>]\n<blocks>\n[/quote]`

Notes: `color` (when present) is emitted verbatim with its original case. The
parser preserves the typed casing in `node.color` and the renderer's quote
class depends on it; round-trip preserves the same casing.

### Spoiler block

- AST: `SpoilerBlockNode { children: [...block] }`
- dtext: `[spoiler]\n<blocks>\n[/spoiler]`

Notes: same surface form as the inline spoiler. The parser's block-vs-inline
classification depends on whether the open tag stands at a paragraph
boundary; the formatter places the open tag on its own line so the parser
takes the block branch on round-trip.

### Section

- AST: `SectionNode { title?, expanded?, children: [...block] }`
- dtext (one of, picked from the four matched-string forms in
  `RE_SECTION_TITLE` / `RE_SECTION_EXPANDED_TITLE` / `matchSection`):
  - `[section]` — neither field set.
  - `[section,expanded]` — `expanded: true`, no title.
  - `[section=<title>]` — title set, `expanded` falsy.
  - `[section,expanded=<title>]` — both set.

Body: `\n<blocks>\n[/section]`.

### Code block

- AST: `CodeBlockNode { content: "..." }`
- dtext: `[code]<content>[/code]`

Notes: `content` is emitted verbatim. The parser captures the literal slice
between `[code]` and `[/code]` without normalisation, so a faithful inverse
emits the same slice without padding. Multi-line content stays multi-line;
single-line content stays single-line. User-fenced sources round-trip
fenced because `content` already includes the leading/trailing `\n`; see
**Q-CODE-BLOCK-LAYOUT** in the Resolved design decisions section.

### Table (heavy)

- AST: `TableNode { children: [TableHeadNode, TableBodyNode, ...] }`, where
  rows nest as `TableRowNode { cells: [TableCellNode, ...] }` and cells carry
  `cellType: 'th' | 'td'`.
- dtext: BBCode shape, mirroring the `[table][thead]...[tbody]...[/table]`
  structure ruby's dtext parser accepts:
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

Layout rules (line-break placement, indent) are convention-bound rather than
parser-bound; the parser tolerates compact and pretty forms equally.
Pretty layout is canonical; see **Q-TABLE-LAYOUT** in the Resolved design
decisions section.

### Light table (`ltable`)

- AST: `LTableNode { rows: [TableRowNode, ...] }` (no head/body split).
- dtext:
  ```
  [ltable]
  <head-cell> | <head-cell> | <head-cell>
  <body-cell> | <body-cell> | <body-cell>
  ...
  [/ltable]
  ```

Notes: the first row is the implicit header. `LTableNode` is dtext-only —
nothing on the markdown side produces this shape (per `md-ast-mapping.md`,
markdown's pipe table maps to `TableNode`, not `LTableNode`). Cell separator
is `' | '` (space-pipe-space); see **Q-LTABLE-SEP** in the Resolved design
decisions section.

### List

- AST: `ListNode { items: [ListItemNode { depth, children: [...inline] }, ...] }`
- dtext: one line per item, prefixed by `<depth>` asterisks and a single
  space:
  ```
  * top-level
  ** nested once
  *** nested twice
  * back to top
  ```

Notes: depth is encoded in the asterisk count, mirroring the parser's
`(\*+)[ \t]+` rule. Items are siblings in a flat `items[]` regardless of
nesting; the formatter emits one `\n`-terminated line per item without any
container markup.

## Salvage paths (passthrough, not canonical)

Three node types are not "real" dtext — they're the parser's escape hatches
for content the dtext rules could not interpret cleanly. The formatter emits
them so the AST round-trips, but the emitted text is *passthrough*, not a
canonical dtext form. A future cleanup that eliminates the parser-side
salvage would also retire these formatter arms.

### Raw block text

- AST: `RawBlockTextNode { content }`
- formatter: emits `content` verbatim (no wrapping, no escaping).

Source of the node: stray block-level closing tags (`[/code]`, `[/table]`)
that ruby renders as literal text without paragraph wrapping when no
matching open is in scope. The content is whatever the parser captured.

### Literal HTML

- AST: `LiteralHtmlNode { prefix, children: [...inline] }`
- formatter: emits `prefix` verbatim, then renders inline children.

Source of the node: stray-close fallout. The parser captures verbatim HTML
fragment in `prefix` (inter-block whitespace + the close tag) and continues
streaming inline content in `children`. The formatter mirrors this directly.
The prefix is **not** dtext — it's HTML the parser already committed to
emitting. Round-tripping through `parseDTextToAST` will not necessarily
produce the same `LiteralHtmlNode` shape; this is acceptable because the
salvage path itself is a divergence from canonical dtext.

### Fragment

- AST: `FragmentNode { children: [...inline] }`
- formatter: emits children with no wrapper.

Source of the node: an over-deep `[sup]` / `[sub]` open that the parser
dropped (the wrapping element couldn't be honoured) but whose children still
bubble up. No surface form to invert; the formatter emits the children
straight.

## Block separator policy

Between any two block nodes inside a `DocumentNode` or block-container child
list (quote, spoiler, section), the formatter emits a single `\n\n`
separator. Inside `ListNode.items`, each item gets exactly one trailing `\n`.
Code blocks, ltable rows, and table rows already establish their own
internal line layout (see those sections); the surrounding `\n\n` policy
applies to their boundaries with sibling blocks.

No trailing newline at document end (see **Q-DOC-TRAILING** in the
Resolved design decisions section).

## Text-content escape policy

The dtext parser does not implement universal backslash escaping (per the
markdown.md note: "DText does currently not fully support escaping with
backslash everywhere"). The formatter therefore emits `TextNode.content`
**verbatim**, with no defensive escaping of `[`, `*`, `` ` ``, etc.

The justification: the AST got there by parsing source text that the parser
classified as plain text in *that surrounding context*. Re-emitting that same
text in the same surrounding context will reproduce the same classification
on round-trip. Defensive escaping would either:

1. introduce backslashes the parser does not recognise (corrupting the
   round-trip), or
2. require simulating the parser's context-sensitive sigil rules (a large
   feature surface for a small problem).

Verification rests on the round-trip harness; if a fixture surfaces a text
content that re-parses differently, that's a parser-side issue or a sign that
the formatter's surrounding context is wrong, not an escape-policy gap.

## Resolved design decisions

The nine load-bearing equivalences below were resolved by the captain on
consultation with the Diligent Parser Artisan. Recorded here in
captain's-call form so the spec stands alone going forward. Numbered with
their `Q-*` identifiers so implementation comments can cite them.

1. **Q-MAGIC-LINK-CANONICAL.** Lock the canonical-source table; emit
   `<source-prefix> #<id>` derived from a new
   `ID_SOURCE: Record<IdType, string>` constant in `src/ast/links.ts`.
   The table is one entry per `IdType`, derived from `ID_PATTERNS` by
   first-match-per-type with regex-source escapes literalised (the same
   normalisation `ID_TYPE_MAP` already does):

   | `IdType`        | source spelling     | display spelling | notes                |
   | --------------- | ------------------- | ---------------- | -------------------- |
   | `post`          | `post`              | `post`           |                      |
   | `thumb`         | `thumb`             | `post`           | divergence           |
   | `post_changes`  | `post changes`      | `post changes`   |                      |
   | `flag`          | `flag`              | `flag`           |                      |
   | `note`          | `note`              | `note`           |                      |
   | `forum_post`    | `forum`             | `forum`          |                      |
   | `topic`         | `topic`             | `topic`          |                      |
   | `comment`       | `comment`           | `comment`        |                      |
   | `pool`          | `pool`              | `pool`           |                      |
   | `user`          | `user`              | `user`           |                      |
   | `artist`        | `artist`            | `artist`         |                      |
   | `ban`           | `ban`               | `ban`            |                      |
   | `bur`           | `bur`               | `BUR`            | display upcases      |
   | `alias`         | `alias`             | `alias`          |                      |
   | `implication`   | `implication`       | `implication`    |                      |
   | `mod_action`    | `mod action`        | `mod action`     |                      |
   | `record`        | `record`            | `record`         |                      |
   | `wiki`          | `wiki`              | `wiki`           |                      |
   | `set`           | `set`               | `set`            |                      |
   | `blip`          | `blip`              | `blip`           |                      |
   | `takedown`      | `takedown`          | `takedown`       | two patterns; shorter wins |
   | `ticket`        | `ticket`            | `ticket`         |                      |

   - `bur` source stays lowercase. Authors typing `BUR #5` get an AST
     that re-emits as `bur #5`; round-trip preserves `idType: 'bur'`
     because `ID_TYPE_MAP` is case-insensitive
     (`parse/index.ts:1715` lowercases the matched prefix before
     lookup). Lowercase reads consistent with the rest of the table.
   - `takedown` uses the shorter source form; sources typed as
     `take down request #5` or `take down #5` canonicalise to
     `takedown #5`. The original spelling is unrecoverable from the AST
     and the canonicalisation is accepted.
   - When `ID_SOURCE` lands, the lockstep comment at the top of
     `src/ast/links.ts` (today naming `ID_PATTERNS` / `ID_DISPLAY` /
     `ID_ROUTES` / `ID_TYPE_MAP` plus the renderer's `ID_TYPE_CLASSES`
     and the `IdType` union) needs a parallel entry naming `ID_SOURCE`
     so the full six-member group is visible at a glance.

2. **Q-WIKI-PAGE-RECOVER.**
   - No-title case: emit `[[<children[0].content>]]` (or split on the
     embedded `#` for the with-anchor variant). Info-lossless; the
     original `tag` is preserved by `buildWikiLink`'s no-title branch.
   - Title-override case: emit the normalised page form
     (`[[foo_bar|title]]`) — option 1. The case-lossy round-trip mirrors
     what the dtext oracle does internally for normalised lookups;
     it's already the de-facto canonical form.
   - **Option 3 (AST `tag` field) is *deferred*, not rejected.** The
     ship-now choice picks the lossy-on-case path; the underlying
     question — *does the AST want to preserve source spelling for
     title-overridden wikilinks?* — stays open. If users care, the AST
     shape change is on the table for a focused follow-up. The same
     change would also retire the analogous title-case loss on the
     markdown side (cross-pipeline note retained from this question's
     drafting).

3. **Q-TEXTILE-BRACKET.** Bare form `"title":url` when the href:
   - contains no whitespace, AND
   - is unchanged by a `trimUrlBoundaries` simulation, AND
   - contains no `]`.

   Bracketed form `"title":[url]` otherwise.

4. **Q-URL-DELIMITER.** Bare `<href>` (literal URL) when the href is
   unchanged by `trimUrlBoundaries` and contains no whitespace; the
   delimited form `<<href>>` (literal `<` and `>` wrapping the URL)
   otherwise.

5. **Q-CODE-BLOCK-LAYOUT.** Strict-verbatim:
   `[code]<content>[/code]` with `content` emitted exactly as captured.
   This automatically preserves user-made fences: when the source was
   `[code]\nhello\n[/code]`, the parser captures
   `content = "\nhello\n"` and the formatter re-emits the same string
   (yielding fenced output); when the source was `[code]hi[/code]`,
   `content = "hi"` and the formatter re-emits inline. The user's
   layout choice round-trips for free; the rejected alternative was
   *forcing* `\n` padding around content that doesn't have it, which
   would round-trip-break.

6. **Q-TABLE-LAYOUT.** Pretty layout — one structural tag per line
   (`[table]`, `[thead]`, `[tbody]`, `[/table]` etc.), each `[tr]...[/tr]`
   on its own line, cells inline within the row. Sample shown in the
   Table section above.

7. **Q-LTABLE-SEP.** Cell separator is `' | '` (space-pipe-space).

8. **Q-DOC-TRAILING.** No trailing newline at end of document. The
   formatter ends output exactly at the last block's last character.
   The parser's `DocumentNode` shape does not encode trailing
   whitespace, so this matches the canonical "no junk past the end"
   path.

9. **Q-INLINE-CODE-BACKTICK.** Verbatim emission with documented
   divergence in the round-trip harness, mirroring falcon's
   `CodeBlockNode.content` trailing-newline divergence pattern. The
   dtext parser's inline-code rule terminates on the first backtick,
   so dtext source can never produce a backtick-bearing
   `InlineCodeNode`. The failure path is markdown → AST → dtext: the
   markdown side can produce such a node via CommonMark's multi-backtick
   fence rule, and feeding that AST through the dtext formatter loses
   the backtick boundary on round-trip through dtext source. The
   harness pins this as a known divergence rather than masking it.
