// URL boundary code points shared by the dtext parser and formatter.
// Ruby's dtext peels exactly one of these off as trailing punctuation from a
// captured bare URL (verified against the oracle; see `trimUrlBoundaries` in
// `parse/index.ts`). The parser strips them from captured URLs; the formatter
// uses the same set to decide bare-vs-delimited emit (see ADR-0006 and
// ADR-0005). Both callers must agree on the set or round-trip breaks for any
// URL ending in a CJK or full-width bracket.

export const BOUNDARY_CHARS: readonly number[] = [
  0x0021, 0x0029, 0x002c, 0x002e, 0x003a, 0x003b, 0x003c, 0x003e, 0x003f,
  0x005d, 0x007d, 0x276d, 0x3000, 0x3001, 0x3002, 0x3008, 0x3009, 0x300a,
  0x300b, 0x300c, 0x300d, 0x300e, 0x300f, 0x3010, 0x3011, 0x3014, 0x3015,
  0x3016, 0x3017, 0x3018, 0x3019, 0x301a, 0x301b, 0x301c, 0xff09, 0xff3d,
  0xff5d, 0xff60, 0xff63,
];

const BOUNDARY_CHAR_SET: ReadonlySet<number> = new Set(BOUNDARY_CHARS);

export function isBoundaryChar(charCode: number): boolean {
  return BOUNDARY_CHAR_SET.has(charCode);
}
