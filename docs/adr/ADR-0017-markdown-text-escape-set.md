# ADR-0017: Markdown text-content escape set

- Status: Accepted
- Date: 2026-05-09

## Context

The markdown parser recognises a small set of escapable sigils
(`\*`, `\_`, `\[`, `\]`, `` \` ``, `\\`, etc.). A `TextNode { content }`
emitted into a markdown surface can re-parse as markup if a sigil in
`content` happens to land in a sensitive position — `*foo*` would
re-parse as italic, `||foo||` as inline spoiler, a leading `#` at line
start as a header.

The dtext side emits text verbatim because the dtext parser is
conservative about sigil interpretation in mid-text positions; the
markdown side cannot do the same without breaking round-trip on a wide
class of inputs.

## Decision

The formatter emits `TextNode.content` with selective backslash escaping
for the following set:

| Position | Sigils to escape |
| --- | --- |
| Always (any position) | `*`, `_`, `` ` ``, `\`, `[`, `~~`, `\|\|` |
| Line-start only | `#`, `>`, `-`, `+`, `1.` through `9.`, `\|` |

`<` and `>` are not escaped. The markdown parser runs with
`html: false`, so neither character is interpreted as HTML markup in
text positions, and the formatter never emits raw HTML in text
positions anyway.

## Consequences

- A text content that would otherwise re-parse as inline markup
  (italic, code, link-open, strikeout, spoiler) round-trips intact.
- A text content whose first character on a line is a block sigil
  (`#`, `>`, `-`, `+`, `|`, ordered-list digit) round-trips as plain
  text rather than triggering a spurious block.
- Escapes appear in the formatter output. Consumers that render the
  output as markdown see the intended characters; consumers that read
  the raw text see the backslashes.

## Alternatives considered

- Verbatim emit (mirror the dtext side's policy). Rejected: a text
  node containing `*foo*`, `# header`, or `||spoiler||` would re-parse
  as markup, breaking round-trip on any AST that passed through a
  markdown text node containing those sigils.
- Universal backslash-escape of every recognised sigil. Rejected: the
  output would be visually noisy and the escapes would not all be
  necessary in every position; the minimum-escape rule above covers
  the reachable cases.
