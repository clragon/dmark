// URL boundary semantics shared by the dtext parser (`./parse/`) and the
// dtext formatter (`./render/`). `BOUNDARY_CHARS` is the set of code points
// ruby's dtext peels off as a single trailing punctuation from a captured
// bare URL match (verified against the oracle; see `trimUrlBoundaries` in
// `parse/index.ts`).
//
// Lockstep across two callers:
//   - parser uses these to *strip* trailing chars from captured URLs
//     (`trimUrlBoundaries` callers around `matchUrl` / `matchTextileLink`).
//   - formatter uses these to decide bare-vs-delimited emit
//     (Q-URL-DELIMITER / Q-TEXTILE-BRACKET in `dtext-formatter-spec.md`).
//
// Adding or removing a code touches both pipelines' round-trip behaviour,
// so the data lives in one place rather than as twin copies prone to drift.

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
