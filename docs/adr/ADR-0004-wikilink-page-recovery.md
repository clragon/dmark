# ADR-0004: Wikilink page recovery on emit

- Status: Accepted
- Date: 2026-05-09

## Context

A wikilink AST node is `LinkNode { linkType: "wiki", href, anchor?,
children: [TextNode { content }] }`. The dtext source is one of
`[[page]]`, `[[page|title]]`, `[[page#anchor]]`, `[[page#anchor|title]]`,
or `[[#anchor]]`. To emit, the formatter has to recover `page` from the
AST.

Two cases differ in what the AST preserves:

- **No-title case.** `children[0].content` is exactly `tag` (or
  `tag#anchor` for the with-anchor variant). Original casing is
  preserved.
- **Title-override case.** `children[0].content` carries the display
  title, not the page. `href` stores only the normalised page form
  (lowercase, spaces to `_`, URI-encoded). Original page casing is not
  recoverable from the AST.

## Decision

- **No-title case:** emit `[[<children[0].content>]]`, splitting on the
  embedded `#` for the with-anchor variant. Lossless on the source page
  spelling.
- **Title-override case:** emit `[[<normalised-page>|<title>]]` derived
  from `href`. The page is lowercased with `_` for spaces; original
  casing is not preserved.
- **Anchor-only case:** emit `[[#<node.anchor>]]` from the raw anchor
  field. No `href` decoding required.

Both formatters apply the same rule. The markdown wikilink plugin
produces an identically shaped node, so the resolution is symmetric.

## Consequences

- No-title wikilinks round-trip with original page spelling intact.
- Title-override wikilinks emit the normalised page form on every
  round-trip, even when the original source used mixed-case spelling.
  The lossy form matches what the dtext oracle uses internally for
  normalised lookups, so it is the de-facto canonical form.
- Anchor-only wikilinks round-trip exactly.

## Alternatives considered

- Add a `tag` field to `LinkNode` carrying the source-typed page
  spelling. Deferred. The AST shape change would let the title-override
  case round-trip losslessly on both pipelines. The minimal-change emit
  rule is shipped first; the field can be added later without breaking
  the rule for callers that do not set it.
