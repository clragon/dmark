# ADR-0016: Markdown list marker

- Status: Accepted
- Date: 2026-05-09

## Context

A `ListNode { items: [ListItemNode { depth, ... }, ...] }` emits as one
line per item. The markdown parser accepts three bullet markers — `-`,
`*`, `+` — and either two-space or four-space indent per nesting
level. The formatter has to pick one canonical marker and one indent
width.

The AST has no ordered/unordered distinction. Ordered-list source
parses to the same shape as unordered, with the parser emitting
`md.ordered_list_demoted` (warning) at parse time. The formatter has
no way to recover the distinction.

## Decision

- Bullet marker: `- ` (dash + space). Most common modern-markdown
  convention; recognised by every markdown surface that matters.
- Indent: two spaces per nesting level, mirroring the parser's
  indent-to-depth rule.
- Ordered lists are not emitted; every list emits as unordered.

```
- top-level
  - nested once
    - nested twice
- back to top
```

## Consequences

- All formatter-produced lists use the same marker and indent.
- Round-trip from an ordered-list source AST emits unordered. The
  original demote produced a parse-time `md.ordered_list_demoted`
  warning; the format pass produces no further diagnostic.
- Source-side mixed-marker lists (`- ` and `* ` siblings) collapse to
  `- ` on emit. Original marker variation is not preserved through the
  AST.
