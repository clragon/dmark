# ADR-0011: Markdown section canonical emit form

- Status: Accepted
- Date: 2026-05-09

## Context

`SectionNode { title?, expanded?, children: [...block] }` has two
surface representations on the markdown side: the BBCode form
(`[section]` / `[section,expanded]` / `[section=Title]` /
`[section,expanded=Title]`) and an HTML form (`<details>` /
`<details open><summary>...</summary>...`). The markdown parser accepts
both; the formatter has to pick one canonical emit.

## Decision

The BBCode form is canonical on the markdown side. The four shapes
mirror the dtext spec exactly:

- `[section]` — neither field set.
- `[section,expanded]` — `expanded: true`, no title.
- `[section=Title]` — title set, `expanded` falsy.
- `[section,expanded=Title]` — both set.

Body: `\n<blocks>\n[/section]`.

The HTML `<details>` form remains accepted by the parser but is not
emitted.

## Consequences

- An AST round-tripped through both formatters yields byte-identical
  section markup on both surfaces.
- Markdown source written in the HTML form parses successfully and
  emits in the BBCode form on the next round-trip; original surface
  form is not preserved through the AST.
