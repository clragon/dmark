// Inline `||spoiler||` plugin. Registers two pieces with the host
// `markdown-it` instance:
//
// 1. A replacement for the `text` rule that adds `|` to the terminator set
//    so the inline parser hands control to other rules at `|` positions.
//    Without this, the default text rule would gobble `||...||` as plain
//    text and the spoiler rule would never see its opener.
//
// 2. A `spoiler` inline rule registered ahead of `emphasis` that scans for
//    a `||` opener, locates the matching `||` close, and recursively
//    tokenises the inner content so emphasis / inline code / autolinks
//    inside the spoiler still parse normally.
//
// Output tokens: `spoiler_open` (nesting +1) and `spoiler_close` (nesting
// -1) bracketing the inner inline tokens. The adapter walker maps these
// to `InlineSpoilerNode`.

import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

const PIPE = 0x7c;

// Mirror of `markdown-it/lib/rules_inline/text.mjs`'s terminator set, with
// `|` (0x7C) added so the text rule yields at spoiler-opener positions.
// Keep this in lockstep with markdown-it major-version bumps; if the
// upstream terminator set changes, copy the new set and re-add `|`.
function isTerminator(ch: number): boolean {
  switch (ch) {
    case 0x0a:
    case 0x21:
    case 0x23:
    case 0x24:
    case 0x25:
    case 0x26:
    case 0x2a:
    case 0x2b:
    case 0x2d:
    case 0x3a:
    case 0x3c:
    case 0x3d:
    case 0x3e:
    case 0x40:
    case 0x5b:
    case 0x5c:
    case 0x5d:
    case 0x5e:
    case 0x5f:
    case 0x60:
    case 0x7b:
    case 0x7c:
    case 0x7d:
    case 0x7e:
      return true;
    default:
      return false;
  }
}

function textWithPipeTerminator(state: StateInline, silent: boolean): boolean {
  let pos = state.pos;
  const max = state.posMax;
  const src = state.src;
  while (pos < max && !isTerminator(src.charCodeAt(pos))) {
    pos++;
  }
  if (pos === state.pos) return false;
  if (!silent) state.pending += src.slice(state.pos, pos);
  state.pos = pos;
  return true;
}

function spoilerInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  const src = state.src;

  // Need at least `||x||` (5 chars).
  if (start + 4 > max) return false;
  if (src.charCodeAt(start) !== PIPE || src.charCodeAt(start + 1) !== PIPE) {
    return false;
  }

  // Find the matching `||` close. Scan greedily: the first `||` after the
  // opener wins. Empty spoilers (`||||`) are rejected; the spec calls for
  // at least one inner character so the rendered span is meaningful.
  let closePos = -1;
  for (let scan = start + 2; scan + 1 < max; scan++) {
    if (
      src.charCodeAt(scan) === PIPE &&
      src.charCodeAt(scan + 1) === PIPE
    ) {
      closePos = scan;
      break;
    }
  }
  if (closePos === -1 || closePos === start + 2) return false;

  if (silent) return true;

  state.push('spoiler_open', 'span', 1);
  // Tokenise inner content recursively so `||x **y** z||` parses bold
  // inside the spoiler. `posMax` is bounded so the inner tokeniser stops
  // at the close marker; both pointers are restored after.
  const oldPosMax = state.posMax;
  state.pos = start + 2;
  state.posMax = closePos;
  state.md.inline.tokenize(state);
  state.pos = closePos + 2;
  state.posMax = oldPosMax;
  state.push('spoiler_close', 'span', -1);

  return true;
}

export function spoilerPlugin(md: MarkdownIt): void {
  md.inline.ruler.at('text', textWithPipeTerminator);
  md.inline.ruler.before('emphasis', 'spoiler', spoilerInline);
}
