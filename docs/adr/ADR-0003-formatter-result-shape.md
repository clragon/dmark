# ADR-0003: Formatter result shape

- Status: Accepted
- Date: 2026-05-09

## Context

Two formatters exist: dtext and markdown. The markdown side has lossy emit
paths that need to surface diagnostics to callers (`LTableNode`
approximation, dtext-salvage passthrough, table-cell linebreak collapse).
The dtext side has no emit-time diagnostics; its documented divergences
surface in the round-trip harness instead.

Callers that drive both pipelines benefit from a uniform return shape so
they can treat the two formatters interchangeably.

## Decision

Both formatters return the same shape:

```ts
formatX(ast: ASTNode, options?: FormatterOptions): {
  output: string;
  diagnostics: Diagnostic[];
};
```

The dtext formatter's `diagnostics` array is empty under the present
emit policy. The shape leaves room for that to change without breaking
callers.

## Consequences

- A single calling pattern works for both pipelines.
- Adding a diagnostic on the dtext side is non-breaking; the field
  already exists.
- Callers that ignore `diagnostics` lose lossy-emit warnings silently.
  Documenting the diagnostic catalog alongside the formatter is part of
  the contract.

## Alternatives considered

- Return a bare string from the dtext formatter and a struct from the
  markdown one. Rejected: forces callers to branch on pipeline and
  blocks adding a dtext-side diagnostic without an API change.
