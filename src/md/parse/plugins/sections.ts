// Section plugin: BBCode `[section]...[/section]` and HTML
// `<details>...</details>` block forms. Both lower to the same
// `SectionNode { title?, expanded?: true, children: [...block] }`. The
// dtext side only knows the BBCode form; HTML is markdown-only and a
// captain-locked exception to the otherwise-strict no-HTML rule (md-ast-
// mapping.md Q4).
//
// Sections are block-level: open/close markers stand on their own line
// and the inner content is recursively tokenised through `markdown-it`'s
// block parser so headers, paragraphs, lists, nested sections, etc. all
// work inside.
//
// This module currently implements only the BBCode form; the HTML form
// lands in a follow-up commit. The plugin is structured so adding it is a
// localised change.

import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

const RE_BBCODE_OPEN = /^\[section(?:,(expanded))?(?:=([^\]]+))?\]\s*$/i;
const RE_BBCODE_CLOSE = /^\[\/section\]\s*$/i;

function getLine(state: StateBlock, line: number): string {
  const start = state.bMarks[line]! + state.tShift[line]!;
  const end = state.eMarks[line]!;
  return state.src.slice(start, end);
}

function sectionBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const openLine = getLine(state, startLine);
  const openMatch = RE_BBCODE_OPEN.exec(openLine);
  if (!openMatch) return false;

  const expanded = openMatch[1] !== undefined;
  const titleEqMatch = openMatch[2];
  // The regex captures `expanded` and `title` independently; combine forms:
  //   [section]              -> { }
  //   [section,expanded]     -> { expanded }
  //   [section=Title]        -> { title }
  //   [section,expanded=Title] -> { expanded, title }
  const title = titleEqMatch;

  // Find the matching close line. Sections nest, so track depth: every
  // `[section ...]` line is +1, every `[/section]` line is -1.
  let depth = 1;
  let closeLine = -1;
  for (let l = startLine + 1; l < endLine; l++) {
    const text = getLine(state, l);
    if (RE_BBCODE_OPEN.test(text)) {
      depth++;
      continue;
    }
    if (RE_BBCODE_CLOSE.test(text)) {
      depth--;
      if (depth === 0) {
        closeLine = l;
        break;
      }
    }
  }
  if (closeLine === -1) return false;

  if (silent) return true;

  const openTok = state.push('section_open', 'section', 1);
  openTok.markup = '[section]';
  if (title !== undefined) openTok.attrSet('title', title);
  if (expanded) openTok.attrSet('expanded', '1');
  openTok.map = [startLine, closeLine + 1];

  // Recursively tokenise the inner range of lines as block content. The
  // inner parser inherits the same `state.tokens` array, appending its
  // output between our open / close.
  state.md.block.tokenize(state, startLine + 1, closeLine);

  const closeTok = state.push('section_close', 'section', -1);
  closeTok.markup = '[/section]';

  state.line = closeLine + 1;
  return true;
}

export function sectionsPlugin(md: MarkdownIt): void {
  // Register before `paragraph` so a `[section]` line is not mistakenly
  // absorbed into a preceding paragraph. The third argument names the
  // alt-rules array; sections are a top-level container.
  md.block.ruler.before('paragraph', 'section', sectionBlock, {
    alt: ['paragraph', 'blockquote', 'list'],
  });
}
