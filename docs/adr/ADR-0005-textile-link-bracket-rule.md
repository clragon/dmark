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
that makes `parseDText(format(node))` recover the same `href`.

## Decision

Emit the bare form `"title":url` when **all** of the following hold:

- `href` contains no whitespace.
- `href` is unchanged by a `trimUrlBoundaries` simulation.
- `href` contains no `]`.

Otherwise, emit the bracketed form `"title":[url]`.

## Consequences

- A bare-form emit is guaranteed to re-parse back to the same `href`;
  nothing the bare matcher would trim is left for it to trim.
- A href containing `]` always takes the bracketed form's surrounding
  brackets without ambiguity, because the simulated trim check covers
  the trailing-punctuation case and the explicit `]` check covers the
  closing-bracket case.
- The picking rule is purely a function of `href`; the children content
  does not influence the choice.
