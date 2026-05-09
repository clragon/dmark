// BBCode `[spoiler]...[/spoiler]` block plugin (`docs/mapping.md`,
// Spoiler block). Sibling of the inline `||...||` rule (`./spoiler.ts`);
// produces `SpoilerBlockNode` when the markers stand on their own lines.
// Token type is `spoiler_block_open` / `spoiler_block_close` — distinct
// from the inline `spoiler_open` / `spoiler_close` so block walks route
// to `walkBlocks` rather than `walkInline`.

import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

const RE_OPEN = /^\[spoiler\]\s*$/i;
const RE_CLOSE = /^\[\/spoiler\]\s*$/i;

function getLine(state: StateBlock, line: number): string {
  const start = state.bMarks[line]! + state.tShift[line]!;
  const end = state.eMarks[line]!;
  return state.src.slice(start, end);
}

function spoilerBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const openLine = getLine(state, startLine);
  if (!RE_OPEN.test(openLine)) return false;

  // Find the matching close line. Spoilers nest, so track depth: every
  // `[spoiler]` line is +1, every `[/spoiler]` line is -1.
  let depth = 1;
  let closeLine = -1;
  for (let l = startLine + 1; l < endLine; l++) {
    const text = getLine(state, l);
    if (RE_OPEN.test(text)) {
      depth++;
      continue;
    }
    if (RE_CLOSE.test(text)) {
      depth--;
      if (depth === 0) {
        closeLine = l;
        break;
      }
    }
  }
  if (closeLine === -1) return false;

  if (silent) return true;

  const openTok = state.push('spoiler_block_open', 'div', 1);
  openTok.markup = '[spoiler]';
  openTok.map = [startLine, closeLine + 1];

  // Recursively tokenise the inner range as block content.
  state.md.block.tokenize(state, startLine + 1, closeLine);

  const closeTok = state.push('spoiler_block_close', 'div', -1);
  closeTok.markup = '[/spoiler]';

  state.line = closeLine + 1;
  return true;
}

export function spoilerBlockPlugin(md: MarkdownIt): void {
  // Register before `paragraph` so a `[spoiler]` line is not absorbed into
  // a preceding paragraph or misinterpreted as plain text.
  md.block.ruler.before('paragraph', 'spoiler_block', spoilerBlock, {
    alt: ['paragraph', 'blockquote', 'list'],
  });
}
