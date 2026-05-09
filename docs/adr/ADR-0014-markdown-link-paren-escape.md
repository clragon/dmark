# ADR-0014: Markdown link URL escape strategy

- Status: Accepted
- Date: 2026-05-09

## Context

Markdown's `[text](url)` form has two ways to handle parens or
whitespace inside the URL:

- backslash-escape embedded parens: `[text](https://example.com/foo\(bar\))`
- wrap the URL in angle brackets: `[text](<https://example.com/foo (bar)>)`

The angle-bracket form is required when the URL contains whitespace
(the bare form does not admit it). For URLs without whitespace, both
forms parse correctly and the formatter has to pick one.

## Decision

Backslash-escape parens (`\(`, `\)`) by default. Wrap the URL in
`<...>` only when the URL contains whitespace.

## Consequences

- The simpler `[text](url)` form survives for the common case of URLs
  with embedded parens but no whitespace.
- URLs with whitespace fall through to the angle-bracket form
  unconditionally, the only form that admits whitespace at all.
- The picking rule is purely a function of the URL string.
