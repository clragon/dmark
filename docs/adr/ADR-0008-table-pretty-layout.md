# ADR-0008: Table pretty-layout emit

- Status: Accepted
- Date: 2026-05-09

## Context

A `TableNode` emits as the BBCode shape ruby's dtext parser accepts:
`[table][thead]...[tbody]...[/table]` with rows nesting
`[tr][th]...[/th][/tr]` or `[tr][td]...[/td][/tr]`. The parser tolerates
compact and pretty layouts equally: line-break placement and indent are
convention-bound, not parser-bound. The formatter must pick one
canonical layout.

## Decision

Pretty layout is canonical:

- One structural tag per line: `[table]`, `[thead]`, `[tbody]`,
  `[/thead]`, `[/tbody]`, `[/table]` each on their own line.
- Each `[tr]...[/tr]` on its own line.
- Cells inline within the row.

```
[table]
[thead]
[tr][th]<inline>[/th][th]<inline>[/th][/tr]
[/thead]
[tbody]
[tr][td]<inline>[/td][td]<inline>[/td][/tr]
[/tbody]
[/table]
```

## Consequences

- Tables produced by the formatter are diff-readable and grep-friendly.
- The parser accepts the layout unchanged, so round-trip is stable.
- A source-side compact table parses to the same AST and re-emits in
  the canonical pretty form. Layout is not preserved through the AST;
  this is accepted as a layout-only canonicalisation.
