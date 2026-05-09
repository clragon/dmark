# ADR-0018: Coloured quote uses BBCode survivor form

- Status: Accepted
- Date: 2026-05-09

## Context

`QuoteNode { children: [...block], color? }` has two emit shapes on the
markdown side. Markdown's native `> ` line-prefix syntax has no slot for
a colour; a coloured quote has to use a different surface form. The
candidate forms are GFM-style admonition blocks (`> [!NOTE]`, etc.) and
the BBCode survivor form (`[quote=COLOR]...[/quote]`), the latter
already used on the markdown side for `[sup]`, `[sub]`, `[color]`, and
`[section]`.

## Decision

Dispatch on `node.color`:

- `QuoteNode { color: undefined, children }` emits the markdown-native
  line-prefixed form: each line of the rendered children prefixed with
  `> `, blank `>` between paragraphs.
- `QuoteNode { color: <value>, children }` emits the BBCode survivor
  form `[quote=<value>]\n<blocks>\n[/quote]`, byte-identical to the
  dtext sibling formatter's emit.

`[quote]` joins the BBCode survivor set on the markdown side. The
markdown `>` syntax always produces a colorless `QuoteNode` by design;
colour is carried only via the BBCode form.

No emit-time diagnostic is raised. Round-trip is stable for both
shapes; hex colours fall out cleanly (`[quote=#abc]` is identical on
both sides).

## Consequences

- An AST round-tripped through both formatters yields the colourless
  form on the markdown side as `> ...` and the coloured form as
  `[quote=...]`, with the dtext side emitting its own canonical
  `[quote]` shape for both.
- The markdown parser plugin set requires a `[quote]` survivor plugin
  modeled on the existing `[section]` plugin; `[quote]` is removed
  from the `md.legacy_bbcode` rejection list. Plugin coordination is a
  prerequisite for shipping the formatter.

## Alternatives considered

- GFM-style admonition syntax (`> [!NOTE]`, `> [!WARNING]`) for
  colour. Rejected as the colour-carrying form: admonitions are a
  closed set of named callout kinds, not arbitrary colour values, and
  do not map cleanly onto `QuoteNode.color`. The admonition path
  remains available as a separate feature for non-colour callouts;
  this decision does not foreclose it.
- A new AST node distinguishing coloured from uncoloured quotes.
  Rejected: `QuoteNode.color` already carries the distinction; a
  separate node would duplicate the field for no gain.
