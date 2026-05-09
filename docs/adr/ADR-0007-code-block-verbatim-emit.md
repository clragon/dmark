# ADR-0007: Code block verbatim emit (dtext)

- Status: Accepted
- Date: 2026-05-09

## Context

A `CodeBlockNode { content }` carries the literal slice the dtext parser
captured between `[code]` and `[/code]`. The parser does not normalise
that slice: a fenced source like `[code]\nhello\n[/code]` produces
`content = "\nhello\n"`, while an inline source `[code]hi[/code]`
produces `content = "hi"`.

The formatter has to invert this without a layout transform that would
break round-trip.

## Decision

Emit `[code]<content>[/code]` with `content` written exactly as captured.
No padding, no trimming, no fence-style normalisation.

## Consequences

- A fenced source round-trips fenced; an inline source round-trips
  inline. The author's layout choice is preserved through the AST
  because `content` already encodes it.
- Multi-line content stays multi-line; single-line content stays
  single-line. The formatter never inserts surrounding `\n`.
- Any post-emit pretty-printing belongs in a separate pass; the
  formatter's contract is round-trip stability, which forbids it.

## Alternatives considered

- Force `\n` padding around `content` so every code block emits in
  fenced layout. Rejected: an AST whose `content` lacks a leading or
  trailing `\n` would round-trip to a different `content` on re-parse,
  breaking the AST-stability guarantee.
