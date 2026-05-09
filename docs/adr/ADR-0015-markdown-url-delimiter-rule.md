# ADR-0015: Bare-vs-autolink URL emit rule (markdown)

- Status: Accepted
- Date: 2026-05-09

## Context

A bare URL link AST node is `LinkNode { linkType: "url", href, children:
[TextNode { content: href }] }`. The markdown parser produces this node
from two surface forms:

- bare: `https://example.com/foo` (when markdown-it's autolinker
  detects it).
- autolink: `<https://example.com/foo>` (literal `<` and `>` wrapping
  the URL).

The bare form is subject to markdown-it's autolinker rules, which
differ from dtext's `RE_URL` but follow the same shape: trailing
punctuation may be eaten as surrounding text, and whitespace breaks
detection.

## Decision

Emit the bare form when:

- markdown-it's autolinker would detect the URL on re-parse, AND
- `href` contains no whitespace.

Otherwise, emit the autolink form `<href>`.

The rule is symmetric in shape with the dtext-side resolution
(see ADR-0006), differing only in the autolinker used for the
detection check.

## Consequences

- Bare-form emit always re-parses to the same `href`.
- Whitespace-bearing URLs fall through to the autolink form.
- An AST round-tripped through both formatters picks the analogous
  form on each surface.
