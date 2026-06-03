// Round-trip verification for the dtext formatter: parse a canonical dtext
// source, format it back, re-parse, and assert the two ASTs are deep-equal.
// Pins the round-trip guarantee from `docs/mapping.md`:
//
//   parseDText(formatDText(parseDText(src)).output) ≡ parseDText(src)
//
// Fixtures span the construct surface; per-construct test files
// (`blocks.test.ts`, `inline.test.ts`, `links.test.ts`) cover surface-level
// parser correctness, while this file pins the formatter's inverse property
// for the same constructs.
//
// Documented divergences are catalogued at the bottom (skipped fixtures
// with the ADR reference that justifies the skip), mirroring
// `ast-equivalence.test.ts`.

import { describe, expect, it } from 'vitest';

import { parseDText } from '../../src/dtext/parse';
import { formatDText } from '../../src/dtext/render';
import { astEqual } from '../md/ast-equal';

interface Fixture {
  name: string;
  dtext: string;
}

function assertRoundTrip(fix: Fixture): void {
  const ast1 = parseDText(fix.dtext);
  const formatted = formatDText(ast1).output;
  const ast2 = parseDText(formatted);
  const result = astEqual(ast1, ast2);
  if (!result.equal) {
    throw new Error(
      `round-trip mismatch (input=${JSON.stringify(fix.dtext)}, formatted=${JSON.stringify(formatted)}):\n${result.diff}`,
    );
  }
}

const INLINE_FIXTURES: Fixture[] = [
  { name: 'plain text', dtext: 'hello world' },
  { name: 'bold', dtext: '[b]hello[/b]' },
  { name: 'italic', dtext: '[i]hello[/i]' },
  { name: 'strikeout', dtext: '[s]hello[/s]' },
  { name: 'underline', dtext: '[u]hello[/u]' },
  { name: 'superscript', dtext: '[sup]x[/sup]' },
  { name: 'subscript', dtext: '[sub]x[/sub]' },
  {
    name: 'inline spoiler in paragraph',
    dtext: 'before [spoiler]hi[/spoiler] after',
  },
  { name: 'inline code', dtext: '`code` here' },
  { name: 'color named', dtext: '[color=red]warning[/color]' },
  { name: 'color tag-category', dtext: '[color=character]name[/color]' },
  { name: 'color hex', dtext: '[color=#abc]hue[/color]' },
  { name: 'internal anchor', dtext: '[#section_one]' },
  { name: 'nested inline', dtext: '[b]bold [i]and italic[/i] mix[/b]' },
];

const LINK_FIXTURES: Fixture[] = [
  { name: 'bare url', dtext: 'see https://example.com/page now' },
  { name: 'textile link bare', dtext: '"text":https://example.com/page' },
  {
    name: 'textile link bracketed',
    dtext: '"text":[https://example.com/path with space]',
  },
  { name: 'wikilink page only', dtext: '[[wolf]]' },
  { name: 'wikilink with anchor', dtext: '[[help#syntax]]' },
  { name: 'wikilink anchor only', dtext: '[[#footnotes]]' },
  { name: 'post search bare', dtext: '{{cat}}' },
  { name: 'post search titled', dtext: '{{cat dog|kittens and puppies}}' },
  { name: 'id link post', dtext: 'see post #1234 too' },
  { name: 'id link bur uppercase', dtext: 'BUR #5' },
  { name: 'id link forum', dtext: 'forum #42' },
  { name: 'id link mod action', dtext: 'mod action #99' },
  { name: 'id link takedown', dtext: 'takedown #7' },
];

const BLOCK_FIXTURES: Fixture[] = [
  { name: 'header h1', dtext: 'h1. Title' },
  { name: 'header h6', dtext: 'h6. Subhead' },
  { name: 'two paragraphs', dtext: 'first paragraph\n\nsecond paragraph' },
  {
    name: 'paragraph with line break',
    dtext: 'first line\nsecond line',
  },
  { name: 'quote uncoloured', dtext: '[quote]\nan opinion\n[/quote]' },
  { name: 'quote red', dtext: '[quote=red]\nin red\n[/quote]' },
  {
    name: 'quote tag-category',
    dtext: '[quote=character]\nin character colour\n[/quote]',
  },
  {
    name: 'quote hex',
    dtext: '[quote=#abc]\ncustom hex\n[/quote]',
  },
  {
    name: 'spoiler block',
    dtext: '[spoiler]\ncontents hidden\n[/spoiler]',
  },
  {
    name: 'section bare',
    dtext: '[section]\nbody\n[/section]',
  },
  {
    name: 'section expanded',
    dtext: '[section,expanded]\nbody\n[/section]',
  },
  {
    name: 'section with title',
    dtext: '[section=Title]\nbody\n[/section]',
  },
  {
    name: 'section expanded with title',
    dtext: '[section,expanded=Open Me]\nbody\n[/section]',
  },
  {
    name: 'code block single line',
    dtext: '[code]hello[/code]',
  },
  {
    name: 'code block fenced (preserved as content)',
    dtext: '[code]\nhello\nworld\n[/code]',
  },
  {
    name: 'list flat',
    dtext: '* one\n* two\n* three',
  },
  {
    name: 'list nested',
    dtext: '* parent\n** child\n*** grandchild\n* uncle',
  },
  {
    name: 'table head + body',
    dtext:
      '[table]\n[thead]\n[tr][th]a[/th][th]b[/th][/tr]\n[/thead]\n[tbody]\n[tr][td]1[/td][td]2[/td][/tr]\n[/tbody]\n[/table]',
  },
  {
    name: 'ltable',
    dtext: '[ltable]\nhead1 | head2\nbody1 | body2\nbody3 | body4\n[/ltable]',
  },
];

describe('dtext round-trip — inline', () => {
  for (const fix of INLINE_FIXTURES) {
    it(fix.name, () => assertRoundTrip(fix));
  }
});

describe('dtext round-trip — links', () => {
  for (const fix of LINK_FIXTURES) {
    it(fix.name, () => assertRoundTrip(fix));
  }
});

describe('dtext round-trip — blocks', () => {
  for (const fix of BLOCK_FIXTURES) {
    it(fix.name, () => assertRoundTrip(fix));
  }
});

// Documented divergences. Each skipped entry names the ADR that justifies
// why the round-trip is expected to break for this construct on the dtext
// surface.
describe('dtext round-trip — documented divergences (skipped)', () => {
  // ADR-0010: an `InlineCodeNode` whose content contains a backtick is
  // unrepresentable in dtext source. The dtext parser cannot produce such
  // a node from any source string, so this divergence is unreachable from
  // a parser-side test fixture; surfaces only when an AST is fed to
  // `formatDText` from the markdown side (CommonMark's multi-backtick
  // fence rule). The markdown round-trip harness pins this case.
  it.skip('inline code with backtick (ADR-0010; markdown-only producer)', () => {});

  // `LiteralHtmlNode` and `RawBlockTextNode` are dtext salvage artifacts.
  // The formatter emits `prefix` / `content` verbatim; re-parsing through
  // `parseDText` may not produce the same node shape because the salvage
  // path is triggered by stray-close fallout, not by the verbatim text the
  // formatter emits. Salvage paths are passthrough, not canonical dtext;
  // see `docs/mapping.md`.
  it.skip('literal_html salvage (passthrough; not AST-stable)', () => {});
  it.skip('raw_block_text salvage (passthrough; not AST-stable)', () => {});
});
