// Shared diagnostic shape used by both parsers and formatters. Catalog of
// codes (severities, when-emitted) lives in `docs/mapping.md`; the
// markdown-formatter-emitted codes are referenced from ADR-0012 (ltable
// approximation), ADR-0013 (dtext salvage passthrough), and ADR-0019
// (table-cell linebreak collapse). The dtext formatter returns
// `diagnostics: Diagnostic[]` per ADR-0003 so callers treat both pipelines
// identically.
export interface Diagnostic {
  // Stable code, e.g. `md.legacy_bbcode`.
  code: string;
  severity: 'info' | 'warning' | 'fatal';
  message: string;
  // Optional source span when the parser propagates token position.
  range?: { start: number; end: number };
}
