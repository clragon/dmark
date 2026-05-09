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
// HTML allowlist (locked by captain): only `<details>` and `<summary>`,
// only the `open` attribute on `<details>`. Any other attribute or any
// other tag falls through to the standard text path; no rejection
// diagnostic is emitted today (deferred).

import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

const RE_BBCODE_OPEN = /^\[section(?:,(expanded))?(?:=([^\]]+))?\]\s*$/i;
const RE_BBCODE_CLOSE = /^\[\/section\]\s*$/i;

// HTML form. The opening line must be exactly `<details>` or `<details open>`,
// optionally followed by an inline `<summary>Title</summary>` on the same
// line. Body content begins on the next line; the close must be a line on
// its own holding `</details>`. All-on-one-line forms are deliberately not
// recognised (they would force a different inner-parsing path; users who
// want a section format properly).
//
// Captures:
//   1: ` open` (or undefined)    -> presence indicates expanded
//   2: title text (or undefined) -> from inline `<summary>...</summary>`
const RE_HTML_OPEN =
  /^<details(\s+open)?>(?:<summary>([\s\S]*?)<\/summary>)?\s*$/i;
const RE_HTML_CLOSE = /^\s*<\/details>\s*$/i;

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

function sectionBlockHtml(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const openLine = getLine(state, startLine);
  const openMatch = RE_HTML_OPEN.exec(openLine);
  if (!openMatch) return false;

  const expanded = openMatch[1] !== undefined;
  const title = openMatch[2];

  let depth = 1;
  let closeLine = -1;
  for (let l = startLine + 1; l < endLine; l++) {
    const text = getLine(state, l);
    if (RE_HTML_OPEN.test(text)) {
      depth++;
      continue;
    }
    if (RE_HTML_CLOSE.test(text)) {
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
  openTok.markup = '<details>';
  if (title !== undefined) openTok.attrSet('title', title);
  if (expanded) openTok.attrSet('expanded', '1');
  openTok.map = [startLine, closeLine + 1];

  state.md.block.tokenize(state, startLine + 1, closeLine);

  const closeTok = state.push('section_close', 'section', -1);
  closeTok.markup = '</details>';

  state.line = closeLine + 1;
  return true;
}

export function sectionsPlugin(md: MarkdownIt): void {
  // Register both rules before `paragraph` so a `[section]` or `<details>`
  // line is not absorbed into a preceding paragraph. The third argument
  // names the alt-rules array; sections are a top-level container that
  // also matters when the parser tries to interrupt a list / blockquote.
  // The two rules are independent: each returns false when its sigil does
  // not match, letting the next rule try.
  md.block.ruler.before('paragraph', 'section', sectionBlock, {
    alt: ['paragraph', 'blockquote', 'list'],
  });
  md.block.ruler.before('paragraph', 'section_html', sectionBlockHtml, {
    alt: ['paragraph', 'blockquote', 'list'],
  });
}
