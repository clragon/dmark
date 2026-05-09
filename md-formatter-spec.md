# AST → Markdown mapping

State of this document: NOT FINAL

The contract this formatter implements: for every AST node the parsers produce
(`src/ast/index.ts`), this document names the canonical *dmark-flavour
markdown* source the formatter emits. The dtext sibling spec
(`dtext-formatter-spec.md`) covers the inverse direction; this document is
its mirror image and assumes the reader has it open. Where a construct's
canonical-form choice is identical on both sides, this spec cross-references
rather than re-derives.

The verification: `test/md/round-trip.test.ts` (planned) will pair each AST
node with its emitted markdown and assert
`parseMarkdown(format(ast)).document` is deep-equal to `ast` (subject to the
documented divergences below). The formatter inadvertently becomes the
project's markdown formatter; round-trip stability on the AST is the
load-bearing guarantee, with the caveat that markdown-side asymmetries
(`LTableNode`, salvage-path nodes, multi-line table cells) cannot
round-trip through the markdown surface and produce documented
divergences instead. `QuoteNode.color` *does* round-trip via the BBCode
survivor form (`[quote=COLOR]`); see Q-MD-QUOTE-COLOR.

## Notation

Same as the dtext sibling spec. Cross-reference back to it for AST shapes
and the `[...inline]` / `[...block]` shorthand.

## Inline

Most inline constructs are direct surface-form swaps from the dtext side.
This section names the swap; for any subtleties, the dtext spec is the
canonical reference.

| AST node | dtext form | markdown form |
| -------- | ---------- | ------------- |
| `BoldNode`        | `[b]...[/b]` | `**text**` |
| `ItalicNode`      | `[i]...[/i]` | `*text*` |
| `StrikeoutNode`   | `[s]...[/s]` | `~~text~~` |
| `UnderlineNode`   | `[u]...[/u]` | `__text__` |
| `SuperscriptNode` | `[sup]...[/sup]` | `[sup]text[/sup]` (BBCode survivor) |
| `SubscriptNode`   | `[sub]...[/sub]` | `[sub]text[/sub]` (BBCode survivor) |
| `InlineSpoilerNode` | `[spoiler]...[/spoiler]` | `\|\|text\|\|` |
| `InlineCodeNode`  | `` `text` `` | `` `text` `` (same) |
| `ColorNode`       | `[color=x]...[/color]` | `[color=x]text[/color]` (BBCode survivor) |
| `LineBreakNode`   | `\n` (paragraph-internal) | `\n` (paragraph-internal) |
| `FragmentNode`    | children, no wrapper | children, no wrapper |
| `InternalAnchorNode` | `[#name]` | `[#name]` (BBCode survivor) |

The BBCode-survivor rows (`SuperscriptNode`, `SubscriptNode`, `ColorNode`,
`InternalAnchorNode`) emit the same BBCode form on both sides; the markdown
side has no Markdown-native sigil for any of them and the dmark-flavour
spec keeps the BBCode form (per `markdown.md` and `md-ast-mapping.md`).

`LineBreakNode` emits a literal `\n`. With `markdown-it`'s `breaks: true`
option (locked by Q6 in `md-ast-mapping.md`) every paragraph-internal `\n`
re-parses to `LineBreakNode`. CommonMark's "trailing two spaces" form is
*not* used; emitting it would re-parse the same but visually clutters the
text and the `breaks: true` configuration makes the simpler form sufficient.

### Inline code (caveat)

Same body as the dtext spec — `` `text` `` literal backticks, content with
embedded backticks is unrepresentable. The `Q-INLINE-CODE-BACKTICK`
recommendation in the dtext spec applies here too (emit verbatim, document
divergence in the round-trip harness).

### URL link (bare)

- AST: `LinkNode { linkType: "url", href, children: [TextNode { content: href }] }`
- markdown: bare `<href>` by default; the autolink form `<<href>>` (literal
  `<` and `>` wrapping the URL) when the URL contains characters that
  break bare detection (whitespace, surrounding-text adjacency).

The two markdown surface forms are exactly analogous to the two dtext forms;
the picking rule is the same shape, but markdown-it's bare-URL detection
differs slightly from dtext's `RE_URL`. See **Q-MD-URL-DELIMITER** below.

### Markdown link

- AST: `LinkNode { linkType: "inline", href, children: [...inline] }`
- markdown: `[<children-flat-text>](<href>)`

Notes: the `linkType: "inline"` tag is shared with dtext's `"text":url`
syntax. The two surface forms produce a structurally identical `LinkNode`
and the markdown formatter is the one that picks `[text](url)` as the
canonical emit on this side.

URL-escaping inside the parens: markdown-it accepts `\(` / `\)` for embedded
parens, or `<...>` wrapping for any URL with whitespace or special chars.
Recommendation: backslash-escape parens inline; wrap in `<...>` only when
the URL contains whitespace. See **Q-MD-LINK-ESCAPE** below.

### Wikilink

- AST: `LinkNode { linkType: "wiki", href, anchor?, children: [TextNode { content }] }`
- markdown: same surface forms as the dtext side (`[[page]]`, `[[page|title]]`,
  `[[page#anchor]]`, `[[page#anchor|title]]`, `[[#anchor]]`).

Wikilink is a custom inline plugin on the markdown side (per the
`references` plugin in `src/md/parse/plugins/`); the surface form is
identical to dtext's, so the formatter emits the same string. The
**Q-WIKI-PAGE-RECOVER** open question in the dtext spec applies symmetrically
here — same no-title (info-lossless) vs. title-case (lossy) split, same
recommended resolution. No new question to surface on this side.

### Tag search

- AST: `LinkNode { linkType: "post_search", tags, href, children: [TextNode { content }] }`
- markdown: `{{<tags>}}` or `{{<tags>|<title>}}`

Same surface form as the dtext side. Custom inline plugin per
`md-ast-mapping.md`.

### Magic / id link

- AST: `LinkNode { linkType: "id_link", idType, id, href, children: [TextNode { content }] }`
- markdown: `<source-prefix> #<id>` — same canonical-source table as the
  dtext spec's **Q-MAGIC-LINK-CANONICAL**.

The markdown side reuses the same `ID_SOURCE` map (proposed in the dtext
spec) for the same reason: round-trip symmetry. The captain decision on
Q-MAGIC-LINK-CANONICAL applies identically to both formatters; a single
constant in `src/ast/links.ts` serves both.

## Blocks

### Header

- AST: `HeaderNode { level: 1..6, children: [...inline] }`
- markdown: ATX form — `# text`, `## text`, ..., `###### text`.

Setext headers (`===` underline for h1, `---` for h2) are *not* emitted.
The parser accepts them at parse time and folds to `HeaderNode` with the
`md.setext_header_normalized` info diagnostic; the formatter always emits
the ATX form. Round-trip from a setext-source AST yields ATX with no
diagnostic on the format side (the original surface form is unrecoverable
from the AST), which is the documented behaviour from `md-ast-mapping.md`'s
"round-trip will emit ATX form" note.

### Paragraph

- AST: `ParagraphNode { children: [...inline] }`
- markdown: `<inline>`

Same as dtext spec's paragraph row; line-break handling differs only in
that markdown's `breaks: true` configuration makes paragraph-internal `\n`
emit a `<br>` natively (no two-space trick required).

### Blockquote

- AST: `QuoteNode { children: [...block], color? }`
- markdown:
  - `color` undefined → each block-line prefixed with `> `:
    ```
    > line one
    > line two
    >
    > paragraph two
    ```
  - `color` set → BBCode-survivor form (joins `[sup]` / `[sub]` /
    `[color]` / `[section]` on the markdown side):
    ```
    [quote=<color>]
    line one
    line two

    paragraph two
    [/quote]
    ```

Notes: markdown's `>` syntax always produces a colorless `QuoteNode` —
by design (captain Q-MD-QUOTE-COLOR resolution). Coloured quotes use
the BBCode form on both sides, byte-identical to the dtext sibling
spec's emit. The parser-side counterpart is a coordinated follow-up
that retires `[quote]` from the `md.legacy_bbcode` rejection list and
adds a survivor plugin recognising `[quote]` / `[quote=COLOR]`. See
**Q-MD-QUOTE-COLOR** in the Resolved design decisions section for
the full resolution and the parser-side coordination note.

### Spoiler block

- AST: `SpoilerBlockNode { children: [...block] }`
- markdown: `[spoiler]\n<blocks>\n[/spoiler]` (BBCode survivor form).

Notes: per `md-ast-mapping.md`, `||...||` is markdown's *inline* spoiler
syntax and cannot span block boundaries. Block spoilers use the surviving
BBCode form on the markdown side. The dmark-flavour spec made this choice
explicit: `||...||` is the inline form (`InlineSpoilerNode`), the BBCode
form is the block form (`SpoilerBlockNode`). The formatter emits each in
its corresponding source shape.

### Section

- AST: `SectionNode { title?, expanded?, children: [...block] }`
- markdown: BBCode form by default — same four shapes as the dtext spec.

The HTML form (`<details>` / `<details open><summary>...</summary>...`) is
*also* accepted on the parser side per `md-ast-mapping.md`'s captain Q4,
but the formatter picks one canonical emit form. See
**Q-MD-SECTION-FORM** below.

### Code block

- AST: `CodeBlockNode { content }`
- markdown: triple-backtick fenced.

```
```
<content>
```
```

Notes: language hints are not represented in the AST today; a fenced block
without a language hint is the canonical form. Falcon's documented
`CodeBlockNode.content` trailing-newline divergence (markdown-it appends a
`\n`, dtext does not) applies on the format side too: a `CodeBlockNode`
parsed from markdown source has `content` ending in `\n`, while one
parsed from dtext does not. The markdown formatter emits the content
verbatim and accepts the divergence; round-trip through `parseMarkdown`
will re-add the `\n` if it wasn't there, producing a fixed point on the
second pass. This is the same documented divergence falcon recorded in
the AST-equivalence harness; surfacing it here so format-side fixtures
are paired against the same expectation.

### Table

- AST: `TableNode { children: [TableHeadNode, TableBodyNode, ...] }`
- markdown: pipe-table form:
  ```
  | head | head |
  | --- | --- |
  | body | body |
  ```

Notes: pipe tables require a header separator row (`|---|---|`). The
formatter generates one regardless of the head/body split in the AST;
markdown-it expects it as a structural sigil, not a stylistic choice.
Alignment markers (`:---`, `---:`, `:---:`) are not in the AST today and
are emitted as plain `---`. Cell content is inline-only per the
markdown-it pipe-table rule; multi-line cell content (rare on the dtext
side) is unrepresentable — see **Q-MD-TABLE-MULTILINE** below.

### Light table (`ltable`) — dtext-only

- AST: `LTableNode { rows: [TableRowNode, ...] }`

There is no markdown surface form for `LTableNode`. Per `md-ast-mapping.md`,
`[ltable]` BBCode in markdown input is rejected at parse with
`md.legacy_bbcode`, and `LTableNode` is documented as a dtext-only AST node
in the AST-equivalence harness's "constructs the markdown side cannot
produce" inventory.

The markdown formatter has to handle this anyway — an AST coming from
`parseDText` could feed both formatters. See **Q-MD-LTABLE-EMIT** below
for the policy (Diagnostic + lossy pipe-table approximation, vs. BBCode
passthrough, vs. fatal).

### List

- AST: `ListNode { items: [ListItemNode { depth, children: [...inline] }, ...] }`
- markdown: `- item` form, two-space indent per nesting level:
  ```
  - top-level
    - nested once
      - nested twice
  - back to top
  ```

Notes: depth → indent translation is the inverse of the parser's
indent → depth rule. The parser accepts `- ` / `* ` / `+ ` as bullet
markers and either two-space or four-space indent; the formatter picks one
canonical form per **Q-MD-LIST-MARKER** below.

Ordered lists (`1.`) are *not* emitted by the formatter. The AST has no
ordered/unordered distinction (per Q5 in `md-ast-mapping.md`), so
ordered-list source is unrecoverable; the formatter always emits unordered.
Round-trip from an ordered-list source AST: original demote happened at
parse with `md.ordered_list_demoted` (warning); format produces unordered
and a re-parse round-trips with no diagnostic, which is the documented
asymmetric degradation.

## Salvage paths (dtext-side, passthrough on markdown emit)

The three salvage-path nodes (`RawBlockTextNode`, `LiteralHtmlNode`,
`FragmentNode`) are dtext-side artifacts. The markdown parser does not
produce them. On emit:

- **`RawBlockTextNode`**: emit `content` verbatim. The content is whatever
  the dtext salvage path captured; it's not markdown, but markdown-it's
  HTML-block / paragraph rules will treat it as plain text on round-trip
  unless the content happens to contain markdown sigils. See
  **Q-MD-DTEXT-SALVAGE** below.
- **`LiteralHtmlNode`**: emit `prefix` (verbatim HTML fragment) followed by
  inline children. Same content-is-not-markdown caveat; the prefix is HTML
  the dtext salvage emitted, and markdown-it will treat it as inline HTML
  (which the `md.html_tag_rejected` diagnostic gate will pick up on
  round-trip unless the prefix is `<details>` or `<summary>`).
- **`FragmentNode`**: emit children with no wrapper. Identical to the dtext
  side and to the structural rendering of all container nodes — there is
  no surface form to invert.

The markdown formatter never *originates* these nodes (only the dtext
parser produces them). The passthrough policy preserves AST shape for the
emit pipeline; round-trip stability is documented as broken for these
nodes on the markdown surface, mirroring the dtext spec's explicit
"`LiteralHtmlNode` round-trip is *not* AST-stable" admission.

## Block separator policy

Identical to the dtext spec: `\n\n` between block nodes inside a container,
single `\n` after each list item, no trailing newline at document end.
**Q-DOC-TRAILING** in the dtext spec applies symmetrically.

## Text-content escape policy

The markdown side has a *different* escape situation from dtext: markdown-it
recognises a small set of escapable sigils (`\*`, `\_`, `\[`, `\]`, `` \` ``,
`\\`, etc.). The formatter emits `TextNode.content` with **selective
backslash-escaping** for any of those sigils that would otherwise re-parse
as markup in the surrounding context.

The minimum-escape rule (proposed):

- Always escape `*`, `_`, `` ` ``, `\` (these have inline meanings in any
  context).
- At line-start, also escape `#`, `>`, `-`, `+`, `*`, `1.`-`9.`, `|` (block
  starters).
- Inside a `ParagraphNode`, also escape `||` if it would form an inline
  spoiler boundary.

See **Q-MD-TEXT-ESCAPE** below for the exact rule and counter-examples.

This diverges from the dtext spec's verbatim-emit policy because
markdown's sigil set is wider and context-sensitive in ways that are
*reachable* from formatter output (a `TextNode { content: "*foo*" }` would
re-parse as italic without escaping). The dtext side escapes nothing
because dtext's parser is more conservative about sigil interpretation in
mid-text positions; the markdown side has to be more careful.

## API shape

The markdown formatter signature, mirroring `parseMarkdown`'s shape:

```ts
formatMarkdown(ast: ASTNode, options?: FormatterOptions): {
  output: string;
  diagnostics: Diagnostic[];
};
```

Diagnostics are emitted for unrepresentable / lossy constructs:
`LTableNode` approximation, dtext-salvage passthrough warnings,
table-cell linebreak collapse. `QuoteNode.color` does *not* emit a
diagnostic — it round-trips via the BBCode survivor form. The full
catalog is fixed by the captain-resolved emit policies for
**Q-MD-LTABLE-EMIT**, **Q-MD-DTEXT-SALVAGE**, and
**Q-MD-TABLE-MULTILINE** in the Resolved design decisions section.

The dtext sibling formatter mirrors this shape (per resolved
**Q-MD-API-SHAPE**); both formatters return `{ output, diagnostics }`
regardless of whether the dtext-side catalog is empty today. The shape
is harmonised so callers can treat both pipelines identically. The
only documented divergences on the dtext side
(`Q-INLINE-CODE-BACKTICK` and salvage-path round-trip) surface in the
round-trip harness as documented-divergence fixtures rather than as
emit-time diagnostics; the dtext side's diagnostic catalog is therefore
empty today, and the symmetric shape pays for itself when it grows.

## Resolved design decisions

The captain resolved nine of the ten `Q-MD-*` items directly; the
tenth (`Q-MD-TABLE-MULTILINE`) was closed by the artisan after a live
oracle probe demonstrated that the captain's hopeful `<br>` /
real-LTable paths don't survive ruby's dtext.

Cross-references to dtext-side resolutions point at the corresponding
captain's-call entries in `dtext-formatter-spec.md`'s Resolved design
decisions section.

1. **Q-MD-SECTION-FORM.** BBCode form is canonical. Emit `[section]` /
   `[section,expanded]` / `[section=Title]` /
   `[section,expanded=Title]` matching the dtext spec's section emit
   form, so an AST round-tripped through both formatters yields
   byte-identical section markup on both surfaces. The HTML
   `<details>` / `<summary>` form remains accepted on the parser side
   per `md-ast-mapping.md` Q4, but is not emitted; the captain's note
   carries forward that the HTML variant *may* be retired in a future
   round if it earns no usage.

2. **Q-MD-LTABLE-EMIT.** Option 2: emit a `md.ltable_approximated`
   (warning) Diagnostic and emit a pipe-table approximation — first
   row as header, remaining rows as body. Lossy on the no-head/body
   detail of `LTableNode`; the diagnostic surfaces the lossiness.

3. **Q-MD-DTEXT-SALVAGE.** Option 2: passthrough verbatim with a
   `md.dtext_salvage_passthrough` (warning) Diagnostic. The captain
   noted that the salvage approach itself is "annoying and unclean";
   a future redesign of the dtext-side salvage paths
   (`RawBlockTextNode`, `LiteralHtmlNode`) would let this resolution
   collapse. Until then, passthrough-with-warning is the cleanest the
   markdown formatter can do.

4. **Q-MD-LINK-ESCAPE.** Backslash-escape parens (`\(`, `\)`) by
   default; wrap URL in `<...>` only when the URL contains whitespace
   (which rules out the backslash form).

5. **Q-MD-URL-DELIMITER.** Symmetric with the dtext spec's resolved
   **Q-URL-DELIMITER**: bare URL when markdown-it's autolinker would
   detect it and the URL contains no whitespace; `<URL>` autolink form
   otherwise.

6. **Q-MD-LIST-MARKER.** `- ` (dash + space). Most common
   modern-markdown convention (GitHub, Obsidian, Discord); the parser
   accepts all three (`-` / `*` / `+`) so the choice is
   convention-bound.

7. **Q-MD-TEXT-ESCAPE.** The minimum escape set the formatter applies
   to `TextNode.content` (proposal in the Text-content escape policy
   section above is locked):

   - **Always escape:** `*`, `_`, `` ` ``, `\`, `[`, `~~`, `||`.
   - **Line-start only:** `#`, `>`, `-`, `+`, `1.`-`9.`, `|`.
   - **Skip:** `<`, `>` — the HTML-tag interpretation is gated by the
     parser's HTML allowlist (`<details>` / `<summary>`); the
     formatter never emits unescaped raw HTML in text positions
     anyway.

8. **Q-MD-API-SHAPE.** Harmonised: both formatters return
   `{ output: string; diagnostics: Diagnostic[] }`. The dtext side's
   diagnostic catalog is empty today (the only documented divergences
   surface in the round-trip harness rather than as runtime
   diagnostics) but the captain noted it may grow over time, and the
   shared shape pays for itself when it does.

9. **Q-MD-QUOTE-COLOR.** `[quote]` joins the BBCode-survivor set on
   the markdown side (mirroring `[sup]` / `[sub]` / `[color]` /
   `[section]`); markdown's `>` syntax always produces a colorless
   `QuoteNode` by design. The formatter dispatches on `node.color`:

   - `QuoteNode { color: undefined, children: [...] }` → `> ...`
     form (markdown-native, line-prefixed).
   - `QuoteNode { color: <value>, children: [...] }` →
     `[quote=<value>]\n...\n[/quote]` BBCode form, identical to the
     dtext sibling spec's emit.

   Round-trip is stable for both shapes. Hex colors fall out cleanly
   (`[quote=#abc]` is the same on both sides). No emit-time
   diagnostic required.

   **Parser-side coordination required.** `md-ast-mapping.md`
   currently lists `[quote]` in the `md.legacy_bbcode` rejection set.
   This resolution retires that rejection — `[quote]` joins the
   BBCode survivors. A new plugin in `src/md/parse/plugins/` modeled
   on the existing `[section]` plugin recognises `[quote]` /
   `[quote=COLOR]` and produces `QuoteNode { color?, children }`.
   Falcon's territory on the parser side; the formatter spec locks
   today and the parser plugin lands as a coordinated follow-up
   before the formatter ships.

   Forward note: GFM-style admonition support (`> [!NOTE]` /
   `> [!WARNING]` etc.) remains available as a separate future
   feature for purposes other than quote coloring; this resolution
   does not foreclose that path, only retires it as the
   quote-coloring answer.

10. **Q-MD-TABLE-MULTILINE.** Recommendation 3: emit Diagnostic
    `md.table_cell_linebreak_collapsed` (warning) and replace
    `LineBreakNode` inside `TableCellNode` with a single space.
    Closed by the artisan after a live `dmark-oracle:dev` probe (nine
    inputs) demonstrated the source-form constraints:

    - Ruby's dtext does **not** honour raw `<br>` as a layout
      primitive — it escapes to `&lt;br&gt;` everywhere, including
      inside `[td]` / `[th]` cells.
    - The `<br>` output ruby's renderer emits inside cells comes from
      a paragraph-internal `\n` (single LF) inside `[td]` / `[th]`.
      A double LF terminates the cell.
    - LTable cells cannot contain `\n` because LF is the row
      separator.

    So the captain's hopeful `<br>` allowlist and real-LTables paths
    don't survive at the dtext source layer. Recommendation 3 is the
    only honest answer that doesn't break round-trip silently.

    Forward note: a future change that allowlists `<br>` on the
    markdown parser side AND maps it to `LineBreakNode` would restore
    source-level round-trip on the markdown surface (with the dtext
    sibling formatter still emitting `\n` for the same `LineBreakNode`,
    an honest asymmetry). Not in scope today.
