# ADR-0006: Bare-vs-delimited URL emit rule (dtext)

- Status: Accepted
- Date: 2026-05-09

## Context

A bare URL link AST node is `LinkNode { linkType: "url", href, children:
[TextNode { content: href }] }`. The dtext parser produces this node
from two surface forms:

- bare: `https://example.com/foo`
- delimited: `<https://example.com/foo>` (literal `<` and `>` wrapping
  the URL)

Bare detection runs `trimUrlBoundaries` to strip trailing punctuation
that would otherwise be consumed as surrounding text. A href containing
whitespace or characters the trim would alter cannot round-trip through
the bare form.

## Decision

Emit bare `<href>` (literal URL, no wrapping) when:

- `href` contains no whitespace, AND
- `href` is unchanged by a `trimUrlBoundaries` simulation.

Otherwise, emit the delimited form `<<href>>` — the literal `<` and `>`
wrapping the URL.

## Consequences

- Bare-form emit always re-parses to the same `href`.
- URLs that survive trim re-emission take the simpler bare form;
  URLs with trailing characters or whitespace fall through to the
  delimited form, which the parser preserves verbatim.
- The picking rule is symmetric with the markdown side
  (see ADR-0015) so an AST round-tripped through both formatters
  picks the analogous form on each surface.
