// BBCode `[quote]...[/quote]` and `[quote=COLOR]...[/quote]` block plugin
// (ADR-0018). Emits the same `blockquote_open` / `blockquote_close` token
// shape as markdown-it's `>`-syntax rule, plus an optional `color` attr on
// the open token; the block walker lifts it into `QuoteNode.color`. The
// inner colour value is captured verbatim, mirroring the inline
// `[color=...]` plugin's convention.

import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

const RE_OPEN = /^\[quote(?:=([^\]\n]+))?\]\s*$/i;
const RE_CLOSE = /^\[\/quote\]\s*$/i;

function getLine(state: StateBlock, line: number): string {
  const start = state.bMarks[line]! + state.tShift[line]!;
  const end = state.eMarks[line]!;
  return state.src.slice(start, end);
}

function quoteBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const openLine = getLine(state, startLine);
  const openMatch = RE_OPEN.exec(openLine);
  if (!openMatch) return false;
  const color = openMatch[1];

  // Find the matching close line. Quotes nest, so track depth: every
  // `[quote ...]` line is +1, every `[/quote]` line is -1.
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

  const openTok = state.push('blockquote_open', 'blockquote', 1);
  openTok.markup = '[quote]';
  if (color !== undefined) openTok.attrSet('color', color);
  openTok.map = [startLine, closeLine + 1];

  // Recursively tokenise the inner range as block content.
  state.md.block.tokenize(state, startLine + 1, closeLine);

  const closeTok = state.push('blockquote_close', 'blockquote', -1);
  closeTok.markup = '[/quote]';

  state.line = closeLine + 1;
  return true;
}

export function quotePlugin(md: MarkdownIt): void {
  // Register before `blockquote` and `paragraph` so a `[quote]` line is
  // not absorbed into a preceding paragraph or misinterpreted as plain
  // text. Co-existing with the standard `blockquote` rule is fine because
  // the regex is anchored to `[quote]` and ignores `>`-prefixed lines.
  md.block.ruler.before('blockquote', 'bbquote', quoteBlock, {
    alt: ['paragraph', 'blockquote', 'list'],
  });
}
