// BBCode-survivor inline plugin: `[sup]`, `[sub]`, `[color=x]`. These three
// tags survive into the markdown flavour because there is no widely-adopted
// markdown sigil for super/subscript / arbitrary colour, and because the
// dtext side already supports them with the same shape. The plugin
// produces tokens the adapter walks into `SuperscriptNode`, `SubscriptNode`,
// and `ColorNode` respectively.
//
// Open / close form is BBCode-style: `[sup]...[/sup]`. Tag matching is
// case-insensitive (`[SUP]` works the same), matching the dtext parser's
// behaviour. Inner content is recursively tokenised so emphasis, links,
// other BBCode survivors, and inline spoilers all compose naturally.
//
// `[` is already in the host text rule's terminator set, so this plugin
// does not need to extend it; registering before the standard `link` rule
// is enough to claim positions that begin a recognised tag.

import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

const OPEN_BRACKET = 0x5b;

// Static openers and their matching close markers. Color is handled
// separately because its open form carries a value.
const FIXED_TAGS: ReadonlyArray<{
  match: string;
  close: string;
  openType: 'sup_open' | 'sub_open';
  closeType: 'sup_close' | 'sub_close';
  htmlTag: string;
}> = [
  {
    match: '[sup]',
    close: '[/sup]',
    openType: 'sup_open',
    closeType: 'sup_close',
    htmlTag: 'sup',
  },
  {
    match: '[sub]',
    close: '[/sub]',
    openType: 'sub_open',
    closeType: 'sub_close',
    htmlTag: 'sub',
  },
];

const COLOR_OPEN_RE = /^\[color=([^\]\n]+)\]/i;
const COLOR_CLOSE = '[/color]';

// Find a case-insensitive match for `needle` within `haystack` starting at
// `from`, bounded by `end`. Returns -1 if not found in range. Avoids
// allocating a lower-cased copy of the full source by lower-casing during
// the scan; tag close markers are short so the per-char cost is small.
function indexOfICase(
  haystack: string,
  needle: string,
  from: number,
  end: number,
): number {
  const nLen = needle.length;
  const lower = needle.toLowerCase();
  outer: for (let i = from; i + nLen <= end; i++) {
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j]!.toLowerCase() !== lower[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function bbcodeInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start >= max) return false;
  if (state.src.charCodeAt(start) !== OPEN_BRACKET) return false;

  // Try each opener; the first match wins. Color uses a regex match for the
  // value-carrying form; the others are literal slice comparisons. All
  // matching is case-insensitive to mirror the dtext parser.
  for (const tag of FIXED_TAGS) {
    if (
      start + tag.match.length <= max &&
      state.src.slice(start, start + tag.match.length).toLowerCase() ===
        tag.match
    ) {
      const innerStart = start + tag.match.length;
      const closeIdx = indexOfICase(state.src, tag.close, innerStart, max);
      if (closeIdx === -1) return false;
      if (silent) return true;

      state.push(tag.openType, tag.htmlTag, 1);
      const oldPosMax = state.posMax;
      state.pos = innerStart;
      state.posMax = closeIdx;
      state.md.inline.tokenize(state);
      state.pos = closeIdx + tag.close.length;
      state.posMax = oldPosMax;
      state.push(tag.closeType, tag.htmlTag, -1);
      return true;
    }
  }

  const colorMatch = COLOR_OPEN_RE.exec(state.src.slice(start, max));
  if (colorMatch) {
    const innerStart = start + colorMatch[0].length;
    const closeIdx = indexOfICase(state.src, COLOR_CLOSE, innerStart, max);
    if (closeIdx === -1) return false;
    if (silent) return true;

    const openTok = state.push('color_open', 'span', 1);
    // Color value preserved exactly as typed. The renderer decides class
    // vs. inline-style on the dtext side; the markdown side reuses the same
    // ColorNode emission so the rule lives there once.
    openTok.attrSet('color', colorMatch[1] ?? '');
    const oldPosMax = state.posMax;
    state.pos = innerStart;
    state.posMax = closeIdx;
    state.md.inline.tokenize(state);
    state.pos = closeIdx + COLOR_CLOSE.length;
    state.posMax = oldPosMax;
    state.push('color_close', 'span', -1);
    return true;
  }

  return false;
}

export function bbcodePlugin(md: MarkdownIt): void {
  // Run before `link` so `[sup]` does not get misread as a link opener.
  md.inline.ruler.before('link', 'bbcode', bbcodeInline);
}
