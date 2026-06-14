// Round-trip verification for the markdown formatter: parse a canonical
// markdown source, format it back, re-parse, and assert the two ASTs are
// deep-equal. Pins the round-trip guarantee from `docs/mapping.md`:
//
//   parseMarkdownToAst(renderAstToMarkdown(parseMarkdownToAst(src).document).output).document
//   ≡ parseMarkdownToAst(src).document
//
// Fixtures span the construct surface; the per-construct files (`inline`,
// `blocks`, `lists`, `tables`, `references`, `sections`, `custom-inline`)
// cover surface-level parser correctness, while this file pins the
// formatter's inverse property for the same constructs.
//
// Documented divergences are catalogued at the bottom (skipped fixtures
// with the ADR reference that justifies the skip), mirroring the
// dtext-side round-trip harness and `ast-equivalence.test.ts`.

import { describe, it } from 'vitest';

import { parseMarkdownToAst } from '../../src/md/parse';
import { renderAstToMarkdown } from '../../src/md/render';
import { astEqual } from './ast-equal';

interface Fixture {
  name: string;
  markdown: string;
}

function assertRoundTrip(fix: Fixture): void {
  const ast1 = parseMarkdownToAst(fix.markdown).document;
  const formatted = renderAstToMarkdown(ast1).output;
  const ast2 = parseMarkdownToAst(formatted).document;
  const result = astEqual(ast1, ast2);
  if (!result.equal) {
    throw new Error(
      `round-trip mismatch (input=${JSON.stringify(fix.markdown)}, formatted=${JSON.stringify(formatted)}):\n${result.diff}`,
    );
  }
}

const INLINE_FIXTURES: Fixture[] = [
  { name: 'plain text', markdown: 'hello world' },
  { name: 'bold', markdown: '**hello**' },
  { name: 'italic', markdown: '*hello*' },
  { name: 'strikeout', markdown: '~~hello~~' },
  { name: 'underline', markdown: '__hello__' },
  { name: 'superscript bbcode', markdown: '[sup]x[/sup]' },
  { name: 'subscript bbcode', markdown: '[sub]x[/sub]' },
  { name: 'inline spoiler in paragraph', markdown: 'before ||hi|| after' },
  { name: 'inline code', markdown: '`code` here' },
  { name: 'color named', markdown: '[color=red]warning[/color]' },
  { name: 'color tag-category', markdown: '[color=character]name[/color]' },
  { name: 'color hex', markdown: '[color=#abc]hue[/color]' },
  { name: 'internal anchor', markdown: '[#section_one]' },
  { name: 'nested inline', markdown: '**bold *and italic* mix**' },
];

const LINK_FIXTURES: Fixture[] = [
  { name: 'bare url autolink', markdown: 'see <https://example.com/page> now' },
  { name: 'markdown link', markdown: '[text](https://example.com/page)' },
  { name: 'wikilink page only', markdown: '[[wolf]]' },
  { name: 'wikilink anchor only', markdown: '[[#footnotes]]' },
  { name: 'wikilink with anchor', markdown: '[[help#syntax]]' },
  { name: 'post search bare', markdown: '{{cat}}' },
  { name: 'post search titled', markdown: '{{cat dog|kittens and puppies}}' },
  { name: 'id link post', markdown: 'see post #1234 too' },
  { name: 'id link forum', markdown: 'forum #42' },
  { name: 'id link mod action', markdown: 'mod action #99' },
  { name: 'id link takedown', markdown: 'takedown #7' },
];

const BLOCK_FIXTURES: Fixture[] = [
  { name: 'header h1', markdown: '# Title' },
  { name: 'header h6', markdown: '###### Subhead' },
  { name: 'two paragraphs', markdown: 'first paragraph\n\nsecond paragraph' },
  {
    name: 'paragraph with hard break',
    markdown: 'first line\nsecond line',
  },
  {
    name: 'colourless blockquote single line',
    markdown: '> a single line of quote',
  },
  {
    name: 'colourless blockquote multi-line',
    markdown: '> first line\n> second line',
  },
  {
    name: 'bbcode quote bare',
    markdown: '[quote]\nbody text\n[/quote]',
  },
  {
    name: 'bbcode quote red',
    markdown: '[quote=red]\nin red\n[/quote]',
  },
  {
    name: 'bbcode quote hex',
    markdown: '[quote=#abc]\ncustom hex\n[/quote]',
  },
  {
    name: 'bbcode quote tag-category',
    markdown: '[quote=character]\nin character colour\n[/quote]',
  },
  {
    name: 'bbcode quote multi-paragraph',
    markdown: '[quote=red]\nfirst para\n\nsecond para\n[/quote]',
  },
  {
    name: 'spoiler block bbcode',
    markdown: '[spoiler]\ncontents hidden\n[/spoiler]',
  },
  {
    name: 'section bare',
    markdown: '[section]\nbody\n[/section]',
  },
  {
    name: 'section expanded',
    markdown: '[section,expanded]\nbody\n[/section]',
  },
  {
    name: 'section with title',
    markdown: '[section=Title]\nbody\n[/section]',
  },
  {
    name: 'section expanded with title',
    markdown: '[section,expanded=Open Me]\nbody\n[/section]',
  },
  {
    name: 'list flat',
    markdown: '- one\n- two\n- three',
  },
  {
    name: 'list nested two levels',
    markdown: '- parent\n  - child\n- uncle',
  },
];

describe('markdown round-trip — inline', () => {
  for (const fix of INLINE_FIXTURES) {
    it(fix.name, () => assertRoundTrip(fix));
  }
});

describe('markdown round-trip — links', () => {
  for (const fix of LINK_FIXTURES) {
    it(fix.name, () => assertRoundTrip(fix));
  }
});

describe('markdown round-trip — blocks', () => {
  for (const fix of BLOCK_FIXTURES) {
    it(fix.name, () => assertRoundTrip(fix));
  }
});

// Documented divergences. Each skipped entry names the ADR (or the
// markdown-it / parser-side root cause) that justifies why the round-trip
// is expected to break for this construct.
describe('markdown round-trip — documented divergences (skipped)', () => {
  // ADR-0019: a `LineBreakNode` inside a `TableCellNode` collapses to a
  // single space on emit (`md.table_cell_linebreak_collapsed` warning).
  // Round-trip is intrinsically lossy on the source-form side.
  it.skip('table cell with line break (ADR-0019)', () => {});

  // ADR-0012: `LTableNode` is dtext-only on the parser side; no markdown
  // surface produces it. The formatter approximates as a pipe table with
  // `md.ltable_approximated` warning. Unreachable from a markdown-source
  // fixture; surfaces in cross-pipeline tests.
  it.skip('ltable on markdown side (ADR-0012; dtext-only producer)', () => {});

  // ADR-0013: `LiteralHtmlNode` / `RawBlockTextNode` originate from dtext
  // salvage paths and never appear in markdown-parsed ASTs.
  it.skip('literal_html / raw_block_text (ADR-0013; dtext-only producer)', () => {});

  // CodeBlockNode trailing-newline divergence: markdown-it appends `\n` to
  // fenced code-block content; the dtext side does not. Documented in
  // `ast-equivalence.test.ts`. Round-trip on a markdown-source
  // `CodeBlockNode` produces a fixed point on the second pass (the
  // appended `\n` is already there); this entry flags the asymmetry.
  it.skip('code block trailing newline (markdown-it convention)', () => {});

  // ADR-0010: an `InlineCodeNode` whose content contains a backtick is
  // unrepresentable in dtext source; the markdown side can produce one via
  // CommonMark's multi-backtick fence rule. Round-trip on the markdown
  // surface itself is stable for double-backtick fences, but the
  // formatter's verbatim emit drops the multi-backtick fence wrapping — a
  // focused fixture would need to assert the documented divergence rather
  // than equality.
  it.skip('inline code with backtick (ADR-0010)', () => {});
});
