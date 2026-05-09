# ADR-0019: Table cell linebreak collapse on markdown emit

- Status: Accepted
- Date: 2026-05-09

## Context

A `TableCellNode` may contain inline children including `LineBreakNode`.
The dtext side renders a paragraph-internal `\n` inside `[td]` / `[th]`
as a `<br>` in the rendered HTML. The markdown side emits the cell as
part of a pipe-table row, where:

- Pipe-table rows are single-line: a literal `\n` inside a cell
  terminates the row.
- Markdown-it does not honour raw `<br>` as a layout primitive in pipe
  tables when the parser runs with `html: false`.
- Ruby's dtext escapes raw `<br>` to `&lt;br&gt;` everywhere, so the
  HTML-tag workaround does not survive the dtext sibling either.

A live oracle probe (nine inputs) confirmed the source-form
constraints: there is no markdown surface form for a multi-line table
cell that round-trips through both formatters.

## Decision

Replace each `LineBreakNode` inside a `TableCellNode` with a single
space on emit. Emit a `md.table_cell_linebreak_collapsed` (warning)
Diagnostic when a substitution occurs.

## Consequences

- A single-row pipe table is always emitted regardless of the cell's
  internal line structure.
- Visual line breaks inside cells are lost on the markdown side; the
  dtext sibling preserves them. The diagnostic flags the asymmetry.
- The diagnostic surfaces per-emit, so callers can locate the lossy
  cells and either rewrite the source or accept the collapse.

## Alternatives considered

- Emit raw `<br>` inside cells. Rejected: markdown-it does not honour
  it in pipe tables under `html: false`, and ruby's dtext escapes it
  on the dtext sibling, so the substitution does not round-trip on
  either surface.
- Emit the cell as an LTable on the markdown side. Rejected:
  `[ltable]` BBCode is rejected by the markdown parser as
  `md.legacy_bbcode`; LTable cells additionally cannot contain `\n`
  because LF is the row separator, so the multi-line-cell case fails
  there too.
- Refuse emit when a cell contains `LineBreakNode`. Rejected: removes a
  recoverable path; collapse-with-warning is more useful than a hard
  stop.
