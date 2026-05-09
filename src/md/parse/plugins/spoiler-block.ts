// BBCode `[spoiler]...[/spoiler]` block plugin. Sibling of the inline
// `||...||` rule (`./spoiler.ts`); produces `SpoilerBlockNode` rather than
// `InlineSpoilerNode` when the markers stand on their own lines and the
// inner range is block content.
//
// Per `md-formatter-spec.md`'s Spoiler-block row, the markdown surface for
// block spoilers is the BBCode-survivor form (`||...||` cannot span block
// boundaries by design). Until this plugin landed, the markdown parser had
// no block-spoiler recogniser — a `[spoiler]\n...\n[/spoiler]` block parsed
// as paragraph text and the formatter's spec-compliant emit round-tripped
// lossy without any diagnostic flagging it. The Painter's workbench
// surfaced this on the `dtext-section` round-trip sample.
//
// Block-level: open / close markers stand on their own line. Nesting works
// (a `[spoiler]` inside another `[spoiler]` is depth-tracked). Inner
// content is recursively tokenised through `markdown-it`'s block parser so
// headers, paragraphs, lists, nested spoilers, etc. compose naturally.
//
// Token type: `spoiler_block_open` / `spoiler_block_close`. Distinct from
// the inline `spoiler_open` / `spoiler_close` so the block walker reaches
// the correct case (block walks land on `walkBlocks` rather than
// `walkInline`).

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
