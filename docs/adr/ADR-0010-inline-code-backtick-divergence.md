# ADR-0010: Inline code backtick divergence

- Status: Accepted
- Date: 2026-05-09

## Context

`InlineCodeNode { content }` emits as `` `<content>` ``. The dtext
parser's inline-code rule terminates on the first backtick, so a
backtick inside `content` is unrepresentable in dtext source: dtext
source can never produce a backtick-bearing `InlineCodeNode`.

The markdown side can produce one. CommonMark's multi-backtick fence
rule (`` ``code with ` inside`` ``) admits embedded backticks inside the
node. Feeding such an AST through the dtext formatter loses the
backtick boundary on round-trip through dtext source.

## Decision

The dtext formatter emits `` `<content>` `` verbatim. No escape, no
substitution. The round-trip harness pins the markdown→AST→dtext path
on a backtick-bearing `InlineCodeNode` as a documented divergence,
mirroring the `CodeBlockNode.content` trailing-newline divergence
pattern already recorded for the markdown pipeline.

## Consequences

- Dtext-originated `InlineCodeNode` round-trips losslessly (the parser
  cannot have produced a backtick-bearing node in the first place).
- Markdown-originated `InlineCodeNode` containing backticks survives
  the markdown formatter and the AST, but the dtext formatter emits
  source that re-parses to a shorter `content`. The harness flags this
  pair rather than masking it.
- No emit-time diagnostic is raised; the divergence is a property of
  the dtext source surface, not a runtime warning.

## Alternatives considered

- Substitute or escape embedded backticks in the dtext emit. Rejected:
  no backslash-escape exists in the dtext parser for this position;
  any substitute would corrupt the content on round-trip.
- Refuse to emit the node and raise an error. Rejected: the AST is
  valid; the emit produces source that parses cleanly, just to a
  different AST. The divergence is informational.
