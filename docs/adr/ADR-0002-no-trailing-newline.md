# ADR-0002: No trailing newline at document end

- Status: Accepted
- Date: 2026-05-09

## Context

Both formatters serialise an AST rooted at `DocumentNode`. The AST encodes
block boundaries through the children list but carries no representation of
trailing whitespace past the final block. A formatter must pick one of:
end the output at the last block's last character, or append a single `\n`
after it.

A trailing newline would be invisible on the AST round-trip but visible in
diffs, file checksums, and downstream concatenation. The choice has to be
explicit so both formatters agree.

## Decision

Neither formatter emits a trailing newline. Output ends exactly at the last
character of the final block.

The block-separator policy emits `\n\n` *between* blocks inside a container
and a single `\n` after each list item. Those separators apply to internal
boundaries only; the document's outer boundary contributes no terminator.

## Consequences

- `format(ast)` is byte-identical for an AST whose final block ends in any
  given character, with no implicit terminator added by the formatter.
- Concatenating two formatter outputs requires a separator at the call
  site; the formatter does not provide one.
- The round-trip harness compares output without trimming; a stray
  trailing newline in either formatter would be a regression.
