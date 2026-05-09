# ADR-0013: Dtext salvage passthrough on markdown emit

- Status: Accepted
- Date: 2026-05-09

## Context

Three node types are dtext-side salvage paths: `RawBlockTextNode`,
`LiteralHtmlNode`, `FragmentNode`. The dtext parser produces them when
input cannot be classified as canonical dtext (stray block-closing tags,
over-deep `[sup]` / `[sub]` opens). The markdown parser never produces
them.

The markdown formatter has to handle them anyway, because an AST
originating from `parseDText` can be fed to either formatter. None of
the three has a markdown-native surface form.

## Decision

Emit the salvage content verbatim:

- `RawBlockTextNode`: emit `content` directly, no wrapping.
- `LiteralHtmlNode`: emit `prefix` (verbatim HTML fragment) followed by
  the rendered inline children.
- `FragmentNode`: emit children with no wrapper.

Emit a `md.dtext_salvage_passthrough` (warning) Diagnostic for each
salvage node encountered.

## Consequences

- The output is the best the markdown formatter can produce for a node
  that has no native surface form on its target surface.
- Round-trip through `parseMarkdown` does not preserve the salvage
  shape; the markdown parser runs with `html: false`, so embedded HTML
  in `LiteralHtmlNode.prefix` re-parses as literal text rather than
  markup. The diagnostic flags this.
- The dtext-side salvage paths are themselves a divergence from
  canonical dtext. A redesign that retires those node types upstream
  would let this resolution collapse.
