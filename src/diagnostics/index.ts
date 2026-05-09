// Shared diagnostic shape used by both parsers and formatters. The catalog
// (codes, severities, when-emitted) is documented per-pipeline in the spec
// docs at the project root:
//
//   * parser-side codes — `md-ast-mapping.md`'s "Diagnostics" section.
//   * markdown-formatter-side codes — `md-formatter-spec.md`'s
//     "Resolved design decisions" section (item entries name the codes
//     per Q-MD-LTABLE-EMIT, Q-MD-DTEXT-SALVAGE, Q-MD-TABLE-MULTILINE).
//
// The dtext sibling pipelines today produce no runtime diagnostics; their
// documented divergences (Q-INLINE-CODE-BACKTICK, salvage-path round-trip
// asymmetry) surface in the round-trip harness as documented-divergence
// fixtures rather than as Diagnostic entries. The dtext formatter still
// returns `diagnostics: Diagnostic[]` (per resolved Q-MD-API-SHAPE) so
// callers can treat both pipelines identically; the array is empty today
// and may grow as the catalog evolves.
export interface Diagnostic {
  // Stable code, e.g. `md.legacy_bbcode`.
  code: string;
  severity: 'info' | 'warning' | 'fatal';
  message: string;
  // Optional source span. Line/column tracking lands when the parser wires
  // up token position propagation; today most diagnostics omit this.
  range?: { start: number; end: number };
}
