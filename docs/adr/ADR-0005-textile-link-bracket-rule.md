# ADR-0005: Textile link bracket-vs-bare emit rule

- Status: Accepted
- Date: 2026-05-09

## Context

A dtext textile link has two surface forms:

- bare: `"title":url`
- bracketed: `"title":[url]`

The bare form is `\S+`-only and is subject to `trimUrlBoundaries`, which
strips trailing punctuation that would otherwise be eaten as
surrounding text. The bracketed form survives whitespace and any
character that would be trimmed.

To round-trip through the parser, the formatter has to pick the form
that makes `parseDTextToAst(format(node))` recover the same `href`.

## Decision

Emit the bare form `"title":url` when **all** of the following hold:

- `href` contains no whitespace.
- `href` is unchanged by a `trimUrlBoundaries` simulation.
- `href` contains no `]`.
- The byte that will follow the link's emit (the next sibling's
  first emit byte, or the wrapping container's close-tag opener) is
  whitespace or end-of-input. Otherwise the bare form's `\S+` capture
  would absorb that byte on re-parse.

Otherwise, emit the bracketed form `"title":[url]`.

The same trailing-byte check applies to the bare emit of a `linkType: 'url'`
link; when it fails the formatter falls back to the delimited `<href>` form.

## Consequences

- A bare-form emit is guaranteed to re-parse back to the same `href`;
  nothing the bare matcher would trim is left for it to trim, and the
  next sibling cannot glue onto the URL.
- The picking rule is a function of `href` plus the link's first
  trailing byte. The children content does not influence the choice.
- A bare URL/textile link inside `[b]...[/b]` (or any inline container
  whose close starts with `[`) takes the safe form, because `[` is not
  a whitespace stop for `\S+`.

### Known round-trip failure: `]`-bearing href followed by non-whitespace

When `href.includes(']')`, the bracketed form is excluded (its own
parser uses `[^\]]+` and so cannot encode a `]` inside the URL). The
formatter falls back to bare even when the trailing byte is not
whitespace. If that trailing byte is alphanumeric (not a boundary
character `trimUrlBoundaries` would peel), the URL regex on re-parse
absorbs it, so `parseDTextToAst(format(node))` recovers an extended `href`.

The only corpus instance is `12086-the_great_mouse_detective.dtext`,
where the parser's in-container URL stop yields
`href="...Basil_of_Baker_Street[/i]"` and the trailing text `.The` then
glues on re-parse. Documented in `corpus/known-divergences.md` under
Pattern 4. A real fix needs percent-encoding for `]` inside textile
hrefs; held until the encoding strategy can be cross-validated with the
oracle on a wider corpus.
