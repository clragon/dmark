# ADR-0012: LTable pipe-table approximation on markdown emit

- Status: Accepted
- Date: 2026-05-09

## Context

`LTableNode` is dtext-only. The markdown parser cannot produce one;
`[ltable]` BBCode in markdown input is rejected at parse with
`md.legacy_bbcode`. An AST coming from `parseDTextToAst` may carry an
`LTableNode` and may then be passed to the markdown formatter, so the
markdown side has to handle the shape regardless.

The markdown surface has no native equivalent: the closest analogue is
the pipe table, which loses the no-head/body split (`LTableNode` has
flat rows; pipe tables require an explicit header separator).

## Decision

Emit a pipe-table approximation:

- Treat the first row as the header.
- Treat the remaining rows as body.
- Generate the required `|---|---|` separator row.

Emit a `md.ltable_approximated` (warning) Diagnostic alongside the
output to surface the lossiness.

## Consequences

- The output is renderable as a markdown table on any markdown surface
  that supports pipe tables.
- Round-trip from `LTableNode` through the markdown formatter and back
  through the markdown parser yields a `TableNode`, not an
  `LTableNode`. The diagnostic flags this asymmetric degradation.
- Callers that ignore diagnostics receive renderable output and lose
  the warning silently.

## Alternatives considered

- Passthrough the `[ltable]` BBCode verbatim. Rejected: would emit
  text the markdown parser already classifies as `md.legacy_bbcode`,
  defeating the purpose of having a markdown formatter.
- Fail emit when an `LTableNode` is present. Rejected: removes a
  recoverable path; an approximation with a warning is more useful
  than a hard stop.
