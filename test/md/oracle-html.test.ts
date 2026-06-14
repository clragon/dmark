// `markdown -> AST -> html` against the ruby oracle.
//
// Closes the loop: the markdown adapter produces the same AST shape as
// the dtext side (verified by `ast-equivalence.test.ts`), and that AST
// rendered through `renderAstToHtml` produces html that is dom-equal to what
// the ruby reference emits for the equivalent dtext source. Verification
// that any markdown payload reaching production rendering matches what
// users expect from the dtext gem.
//
// Pairs are small and hand-curated. The dtext-side coverage lives in
// `golden-baseline.test.ts`; this file verifies that the markdown entry
// point composes with the renderer + oracle the same way.

import { describe, expect, it } from 'vitest';

import { renderAstToHtml } from '../../src/html';
import { parseMarkdownToAst } from '../../src/md/parse';
import { domEqual } from '../dom-equal';
import { renderViaOracle } from '../oracle';

interface Pair {
  name: string;
  markdown: string;
  dtext: string;
}

// Representative payloads. Each row asserts:
//   renderAstToHtml(parseMarkdownToAst(markdown).document) DOM-equals oracle(dtext)
const PAIRS: Pair[] = [
  { name: 'plain text', markdown: 'hello world', dtext: 'hello world' },
  {
    name: 'bold + italic',
    markdown: '**bold** and *italic*',
    dtext: '[b]bold[/b] and [i]italic[/i]',
  },
  { name: 'underline', markdown: '__under__', dtext: '[u]under[/u]' },
  { name: 'strikethrough', markdown: '~~strike~~', dtext: '[s]strike[/s]' },
  { name: 'inline code', markdown: 'use `foo` here', dtext: 'use `foo` here' },
  { name: 'header level 2', markdown: '## hello', dtext: 'h2. hello' },
  {
    name: 'blockquote',
    markdown: '> quoted line',
    dtext: '[quote]quoted line[/quote]',
  },
  {
    name: 'unordered list (depth 1 + 2)',
    markdown: '- a\n  - b\n- c',
    dtext: '* a\n** b\n* c',
  },
  {
    name: 'inline spoiler',
    markdown: 'before ||hidden|| after',
    dtext: 'before [spoiler]hidden[/spoiler] after',
  },
  {
    name: 'magic link (post)',
    markdown: 'see post #1234 for details',
    dtext: 'see post #1234 for details',
  },
  {
    name: 'wikilink with anchor',
    markdown: '[[wolf#types]]',
    dtext: '[[wolf#types]]',
  },
  {
    name: 'section with title and body',
    markdown: '[section=Notes]\nhello\n[/section]',
    dtext: '[section=Notes]\nhello\n[/section]',
  },
  {
    name: 'composition: bold containing magic link',
    markdown: '**see post #42**',
    dtext: '[b]see post #42[/b]',
  },
];

const RENDER_OPTS = { allow_color: true, max_thumbs: 75 };

describe('markdown -> AST -> html matches the ruby oracle on equivalent dtext', () => {
  for (const pair of PAIRS) {
    it(pair.name, async () => {
      const { document, diagnostics } = parseMarkdownToAst(pair.markdown);
      const fatals = diagnostics.filter((d) => d.severity === 'fatal');
      expect(fatals).toEqual([]);
      const ourHtml = renderAstToHtml(document, {
        allowColor: RENDER_OPTS.allow_color,
        maxThumbs: RENDER_OPTS.max_thumbs,
      });
      const oracleHtml = (await renderViaOracle(pair.dtext, RENDER_OPTS)).html;
      const cmp = domEqual(ourHtml, oracleHtml);
      if (!cmp.equal) {
        throw new Error(
          `markdown -> html mismatch for ${pair.name}:\n${cmp.diff}\n\n` +
            `our html:\n${cmp.leftCanonical}\n\noracle html:\n${cmp.rightCanonical}`,
        );
      }
    });
  }
});
