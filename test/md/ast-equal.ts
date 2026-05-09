// Normalised AST equality for comparing the canonical AST produced by the
// dtext parser against the canonical AST produced by the markdown adapter
// for paired fixtures of equivalent source. Two ASTs are considered equal
// if they match after the normalisation rules below. Spurious shape
// differences (undefined optional fields, sibling key order in object
// literals) do not cause spurious failures.
//
// Normalisation rules (applied to both sides before comparing):
//   1. Object keys are sorted alphabetically before serialising. The dtext
//      and markdown emitters do not need to agree on field-insertion order.
//   2. Fields whose value is `undefined` are dropped entirely. Both sides
//      may emit `{ anchor: undefined }` versus omitting the field; both
//      mean "no anchor present" semantically and should match.
//   3. No other relaxations. Field values must compare exactly. Adding any
//      relaxation here is a meaningful spec change and warrants a captain
//      decision and a comment naming the construct that motivated it.
//
// On mismatch returns a unified-style diff truncated to a useful window so
// failing assertions stay readable, mirroring `test/dom-equal.ts`.

import type { DocumentNode } from '../../src/ast';

export interface AstEqualOptions {
  // Reserved for future relaxations (e.g. ignoring source-range fields if
  // those land later). Empty today; the contract is full-equality minus the
  // two normalisations above.
}

export interface AstEqualResult {
  equal: boolean;
  /** Short JSON-diff between the normalised serialisations, only set when not equal. */
  diff?: string;
  /** Normalised canonical form of the left input (handy for debugging). */
  leftCanonical: string;
  /** Normalised canonical form of the right input. */
  rightCanonical: string;
}

function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined) continue;
      out[key] = normalise(v);
    }
    return out;
  }
  return value;
}

function shortDiff(left: string, right: string, window = 200): string {
  const min = Math.min(left.length, right.length);
  let i = 0;
  while (i < min && left[i] === right[i]) i++;
  const start = Math.max(0, i - 40);
  const leftSlice = left.slice(start, i + window);
  const rightSlice = right.slice(start, i + window);
  return [
    `first diff at offset ${i}:`,
    `  left:  ${JSON.stringify(leftSlice)}`,
    `  right: ${JSON.stringify(rightSlice)}`,
  ].join('\n');
}

export function astEqual(
  left: DocumentNode,
  right: DocumentNode,
  _options: AstEqualOptions = {},
): AstEqualResult {
  const leftCanonical = JSON.stringify(normalise(left), null, 2);
  const rightCanonical = JSON.stringify(normalise(right), null, 2);
  if (leftCanonical === rightCanonical) {
    return { equal: true, leftCanonical, rightCanonical };
  }
  return {
    equal: false,
    diff: shortDiff(leftCanonical, rightCanonical),
    leftCanonical,
    rightCanonical,
  };
}
