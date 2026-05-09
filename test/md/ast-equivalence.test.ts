// Paired-fixture verification: for every supported construct in
// md-ast-mapping.md, parse the dtext form with `parseDText` and the
// markdown form with `parseMarkdown` and assert the two ASTs are equal
// after normalisation. This is the load-bearing test that closes the
// AST-equivalence promise the project rests on.
//
// Pairs are organised by category. Add a row when a construct lands in the
// markdown adapter; remove a row only after consulting the spec doc.
//
// The "dtext-only" section at the bottom inventories constructs that the
// markdown side cannot produce by design (per the captain's calls in
// md-ast-mapping.md). Those rows do not run an equivalence assertion;
// they exist so future readers see the boundary explicitly.

import { describe, expect, it } from 'vitest';

import { parseDText } from '../../src/dtext/parse';
import { parseMarkdown } from '../../src/md/parse';
import { astEqual } from './ast-equal';

interface Pair {
  name: string;
  dtext: string;
  markdown: string;
}

// Inline constructs.
const INLINE_PAIRS: Pair[] = [
  { name: 'plain text', dtext: 'hello world', markdown: 'hello world' },
  { name: 'bold', dtext: '[b]hello[/b]', markdown: '**hello**' },
  { name: 'italic (asterisk)', dtext: '[i]hello[/i]', markdown: '*hello*' },
  { name: 'italic (underscore)', dtext: '[i]hello[/i]', markdown: '_hello_' },
  { name: 'underline', dtext: '[u]hello[/u]', markdown: '__hello__' },
  { name: 'strikethrough', dtext: '[s]hello[/s]', markdown: '~~hello~~' },
  { name: 'inline code', dtext: '`code`', markdown: '`code`' },
  {
    // Standalone `[spoiler]hi[/spoiler]` lowers to a block-level
    // `spoiler_block` on the dtext side; the inline `inline_spoiler` shape
    // only appears in inline context. Force inline context with surrounding
    // text so both sides emit `inline_spoiler` and the comparison is on
    // the right node.
    name: 'inline spoiler',
    dtext: 'before [spoiler]hi[/spoiler] after',
    markdown: 'before ||hi|| after',
  },
  { name: 'sup', dtext: '[sup]hi[/sup]', markdown: '[sup]hi[/sup]' },
  { name: 'sub', dtext: '[sub]hi[/sub]', markdown: '[sub]hi[/sub]' },
  { name: 'color', dtext: '[color=red]hi[/color]', markdown: '[color=red]hi[/color]' },
];

// Reference constructs (links + wikilinks + tag search + magic links).
const REFERENCE_PAIRS: Pair[] = [
  { name: 'wikilink: page', dtext: '[[page]]', markdown: '[[page]]' },
  { name: 'wikilink: page|title', dtext: '[[wolf|the wolf]]', markdown: '[[wolf|the wolf]]' },
  { name: 'wikilink: page#anchor', dtext: '[[wolf#types]]', markdown: '[[wolf#types]]' },
  { name: 'wikilink: anchor only', dtext: '[[#footnotes]]', markdown: '[[#footnotes]]' },
  { name: 'tag search: bare', dtext: '{{wolf solo}}', markdown: '{{wolf solo}}' },
  { name: 'tag search: with title', dtext: '{{wolf|the wolf tag}}', markdown: '{{wolf|the wolf tag}}' },
  { name: 'magic link: post', dtext: 'see post #1234', markdown: 'see post #1234' },
  { name: 'magic link: pool', dtext: 'see pool #5', markdown: 'see pool #5' },
  { name: 'magic link: bur (uppercases)', dtext: 'bur #99', markdown: 'bur #99' },
  { name: 'magic link: take down request', dtext: 'take down request #7', markdown: 'take down request #7' },
  { name: 'internal anchor definition', dtext: '[#footnotes]', markdown: '[#footnotes]' },
];

// Block constructs.
const BLOCK_PAIRS: Pair[] = [
  { name: 'header level 1', dtext: 'h1. title', markdown: '# title' },
  { name: 'header level 3', dtext: 'h3. title', markdown: '### title' },
  { name: 'blockquote (single line)', dtext: '[quote]hi[/quote]', markdown: '> hi' },
  {
    name: 'blockquote BBCode form (colourless)',
    dtext: '[quote]hi[/quote]',
    markdown: '[quote]\nhi\n[/quote]',
  },
  {
    name: 'blockquote BBCode form (red)',
    dtext: '[quote=red]hi[/quote]',
    markdown: '[quote=red]\nhi\n[/quote]',
  },
  {
    name: 'blockquote BBCode form (hex colour)',
    dtext: '[quote=#abc]hue[/quote]',
    markdown: '[quote=#abc]\nhue\n[/quote]',
  },
  {
    name: 'blockquote BBCode form (tag-category, case preserved)',
    dtext: '[quote=Character]hi[/quote]',
    markdown: '[quote=Character]\nhi\n[/quote]',
  },
  {
    name: 'spoiler block BBCode form',
    dtext: '[spoiler]\nhidden body\n[/spoiler]',
    markdown: '[spoiler]\nhidden body\n[/spoiler]',
  },
  {
    name: 'section: bare',
    dtext: '[section]\nhello\n[/section]',
    markdown: '[section]\nhello\n[/section]',
  },
  {
    name: 'section: with title',
    dtext: '[section=Notes]\nhello\n[/section]',
    markdown: '[section=Notes]\nhello\n[/section]',
  },
  {
    name: 'section: HTML form matches BBCode form',
    dtext: '[section,expanded=Notes]\nhello\n[/section]',
    markdown:
      '<details open><summary>Notes</summary>\nhello\n</details>',
  },
  // NOTE: fenced code block is intentionally absent. See "Documented
  // divergences" below for the trailing-newline shape difference.
];

// Compositions: spec rows applied together. Useful as a smoke that the
// architecture composes (one rule's tokens are visible inside another's).
const COMPOSITION_PAIRS: Pair[] = [
  {
    name: 'bold containing italic',
    dtext: '[b]bold [i]and italic[/i] bold[/b]',
    markdown: '**bold *and italic* bold**',
  },
  {
    name: 'spoiler inside bold',
    dtext: '[b][spoiler]hidden[/spoiler][/b]',
    markdown: '**||hidden||**',
  },
  {
    name: 'magic link inside bold',
    dtext: '[b]see post #42[/b]',
    markdown: '**see post #42**',
  },
];

function runPairs(label: string, pairs: Pair[]): void {
  describe(label, () => {
    for (const pair of pairs) {
      it(pair.name, () => {
        const fromDText = parseDText(pair.dtext);
        const { document: fromMarkdown, diagnostics } = parseMarkdown(
          pair.markdown,
        );
        const fatals = diagnostics.filter((d) => d.severity === 'fatal');
        expect(fatals).toEqual([]);
        const result = astEqual(fromDText, fromMarkdown);
        if (!result.equal) {
          throw new Error(
            `AST mismatch for ${pair.name}:\n${result.diff}\n\n` +
              `dtext canonical:\n${result.leftCanonical}\n\n` +
              `markdown canonical:\n${result.rightCanonical}`,
          );
        }
      });
    }
  });
}

runPairs('inline equivalence', INLINE_PAIRS);
runPairs('reference equivalence', REFERENCE_PAIRS);
runPairs('block equivalence', BLOCK_PAIRS);
runPairs('composition equivalence', COMPOSITION_PAIRS);

// -------------------------------------------------------------------------
// Constructs the markdown side cannot produce, by design.
//
// These are catalogued, not asserted. Each row names a dtext-only AST
// shape and the captain decision (or oracle-quirk) that puts it out of
// scope for the markdown adapter. If a future captain ruling reverses one
// of these, move the row up into a `Pair` array above.
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
// Documented divergences.
//
// These constructs CAN be expressed in both flavours but the two emitters
// produce non-identical AST shapes for spec-permitted reasons. Each row
// names the divergence and the rationale; the harness does not assert
// equality for them. If a future change brings them into alignment, move
// the row up into a `Pair` array.
// -------------------------------------------------------------------------
describe('documented AST divergences (asymmetric on purpose)', () => {
  it.skip(
    'CodeBlockNode.content trailing newline differs between dtext and markdown',
    () => {
      // dtext `[code]x[/code]` -> content "x" (verbatim slice between tags).
      // markdown ```\nx\n``` -> content "x\n" (markdown-it appends \n by
      // convention). Both render identically through the AST→html path.
      // Equivalence on this construct would require either the dtext side
      // to append a trailing \n or the markdown side to strip one. Neither
      // captures all input shapes (e.g. `[code]x\n\n[/code]` vs the
      // markdown form with two trailing blank lines), so the divergence
      // is left in place and verification on this construct rests on the
      // rendered-html oracle path (#10) rather than AST equivalence.
    },
  );
});

// -------------------------------------------------------------------------
// Constructs the markdown side cannot produce, by design.
//
// These are catalogued, not asserted. Each row names a dtext-only AST
// shape and the captain decision (or oracle-quirk) that puts it out of
// scope for the markdown adapter. If a future captain ruling reverses one
// of these, move the row up into a `Pair` array above.
// -------------------------------------------------------------------------
describe('dtext-only constructs (markdown cannot produce, by design)', () => {
  it.skip(
    '[ltable] -> LTableNode (markdown pipe tables map to TableNode; spec Q7)',
    () => {
      // No assertion. Inventory only.
    },
  );
  it.skip(
    'literal_html / raw_block_text from stray dtext close tags',
    () => {
      // These are oracle-quirk salvage paths on the dtext parser. The
      // markdown side never produces them because its rejection mechanism
      // is the diagnostic catalog (md.legacy_bbcode etc.), not literal-text
      // fallout from container-pair mismatches.
    },
  );
  it.skip('FragmentNode from over-deep [sup]/[sub] containers', () => {
    // Same rationale: a markdown adapter quirk that does not arise in
    // markdown source.
  });
});
