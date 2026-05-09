# ADR-0009: Light-table cell separator

- Status: Accepted
- Date: 2026-05-09

## Context

The light-table AST is `LTableNode { rows: [TableRowNode, ...] }`. The
dtext source is one row per line between `[ltable]` and `[/ltable]`,
cells joined by a pipe-with-spacing token. The parser accepts a few
spacing variants around the pipe; the formatter has to pick one.

## Decision

Cell separator is `' | '` (space-pipe-space). The first row is the
implicit header; the rest are body rows.

```
[ltable]
<head-cell> | <head-cell> | <head-cell>
<body-cell> | <body-cell> | <body-cell>
...
[/ltable]
```

## Consequences

- Rows produced by the formatter are visually aligned and survive
  straightforward pipe-splitting on the consumer side.
- The parser accepts the form unchanged, so round-trip is stable.
- Source-side variants in pipe spacing collapse to the canonical
  `' | '` on emit.
