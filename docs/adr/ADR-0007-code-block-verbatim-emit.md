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

Emit `[code]<content>[/code]` with `content` written exactly as captured,
with one targeted exception: when `content` begins with a whitespace
byte (` `, `\t`, `\n`, or `\r`) prepend a single `\n` after `[code]`.
The parser eats one whitespace+newline run after `[code]`, so without
the prepend a `content` starting in whitespace round-trips to a shorter
`content` on re-parse.

## Consequences

- A fenced source round-trips fenced; an inline source round-trips
  inline. The author's layout choice is preserved through the AST
  because `content` already encodes it.
- Inline `[code]hi[/code]` (content `"hi"`) emits unchanged.
- Fenced `[code]\nhi\n[/code]` (content `"\nhi\n"`) emits with a
  leading `\n` so the parser's eat-one-newline rule consumes it,
  leaving the original `content` intact on re-parse.
- Any post-emit pretty-printing belongs in a separate pass; the
  formatter's contract is round-trip stability, which forbids it.

## Alternatives considered

- Force `\n` padding unconditionally so every code block emits in
  fenced layout. Rejected: would inflate inline `[code]hi[/code]` to
  fenced form on every round-trip, churning the author's layout choice.
- Strict verbatim emit (no padding ever). Rejected: breaks round-trip
  for any `content` starting with whitespace, which is the common case
  for fenced sources.
