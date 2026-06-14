// Targeted oracle-parity probes against specific ragel grammar rules.
//
// Each test feeds a tiny input through both `convertDTextToHtml` and the ruby
// oracle and asserts the HTML matches. Cases are grouped into two classes:
//
//  - narrowness: a regex or literal in the TS port accepts less than the
//    corresponding ragel rule. The grammar is the spec; the parser owes
//    whatever the grammar accepts.
//
//  - asymmetry: a single ragel rule should fire from N call sites but the
//    TS port wires it to one site only. The fix is rarely "make this case
//    work too", it is "extract the rule and apply it from every site that
//    already uses the same grammar piece".
//
// Each case names the ragel rule it derives from, with line numbers from
// `ref/dtext/ext/dtext/dtext.cpp.rl`. Do not narrow inputs to whatever
// happens to pass; if the oracle says X, the parser owes X.
//
// Broad corpus parity lives in `test/golden-baseline.test.ts`. This file
// is the targeted-probe surface. The companion to it on the markdown side
// is `test/md/oracle-html.test.ts`.

import { describe, expect, it } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

async function expectMatchesOracle(
  input: string,
  options: { allow_color?: boolean; max_thumbs?: number } = {},
): Promise<void> {
  const oracle = await renderViaOracle(input, {
    allow_color: options.allow_color ?? true,
    max_thumbs: options.max_thumbs ?? 75,
  });
  const dmark = convertDTextToHtml(input, {
    allowColor: options.allow_color ?? true,
    maxThumbs: options.max_thumbs ?? 75,
  });
  expect(dmark).toBe(oracle.html);
}

describe('grammar parity (narrowness)', () => {
  // Ragel: color_name accepts `'cont'i ('ributor'i)?` and `'lor'i ('e'i)?`.
  // TS QUOTE_CATEGORY_RE only spelled out `contributor` and `lore`.
  it('accepts abbreviated color name `cont`', async () => {
    await expectMatchesOracle('[quote=cont]hi[/quote]');
  });

  it('accepts abbreviated color name `lor`', async () => {
    await expectMatchesOracle('[color=lor]hi[/color]');
  });

  // Ragel: `takedown_id = 'take'i ' 'i? 'down 'i 'request 'i? '#'i id;`
  // accepts four forms; TS ID_PATTERNS lacked the `take down` (no request)
  // case.
  it('detects `take down #N` as a takedown id-link', async () => {
    await expectMatchesOracle('see take down #1234 for details');
  });

  // Ragel: `header = 'h'i [123456] '.' ws*;` where `ws = ' ' | '\t'`.
  // TS RE_HEADER used `\s*`, which slurps newlines.
  it('does not eat the newline after `h1.`', async () => {
    await expectMatchesOracle('h1.\nbar');
  });

  // Ragel: `internal_url = [/#] ^space+;` requires at least one non-space
  // char after the leading `/` or `#`. TS isAcceptedTextileUrl accepted a
  // bare `/`.
  it('rejects a single-slash textile internal URL', async () => {
    await expectMatchesOracle('"foo":/');
  });

  // Ragel: `url = 'http'i 's'i? '://' ^space+;` where POSIX `space` is
  // ASCII-only. TS RE_URL used `\S+`, which excludes Unicode whitespace
  // (NBSP, ideographic space, ...) so the URL terminated earlier in TS.
  it('keeps a bare URL going across NBSP the way ragel does', async () => {
    await expectMatchesOracle('https://example.com/a b');
  });

  // Same `^space+` rule applies to the URL half of a textile link
  // (`basic_textile_link = '"' nonquote+ '":' (url | internal_url)`).
  // TS RE_TEXTILE_BASIC uses `(\S+)` for the URL, terminating at NBSP.
  it('keeps a textile-link URL going across NBSP', async () => {
    await expectMatchesOracle('"a":https://example.com/x y');
  });

  // Ragel: `spoilers_open` always opens a block at block context, regardless
  // of body content. TS peekBlockElement gated on `\n` inside the spoiler
  // body, so a single-line block-position spoiler was not promoted.
  it('treats a single-line `[spoiler]...[/spoiler]` at document start as a block', async () => {
    await expectMatchesOracle('[spoiler]inline body[/spoiler]');
  });

  // Symmetric failure of the same gate: a multiline inline spoiler
  // (mid-paragraph) was incorrectly broken into a block by TS, while ragel
  // keeps it inline.
  it('keeps a multiline `[spoiler]a\\nb[/spoiler]` mid-paragraph inline', async () => {
    await expectMatchesOracle('prefix [spoiler]a\nb[/spoiler] suffix');
  });

  // Ragel: `inline_code := |* ... '`' => fret; any => append_html_escaped(fc); *|`
  // (lines 563-576). At EOF the body is whatever was appended. TS
  // parseInlineCode does `slice(start, this.pos - 1)`, which lops the
  // final byte when the loop exited via end-of-input rather than a
  // matching backtick.
  it('preserves the trailing char of an unclosed `\\``', async () => {
    await expectMatchesOracle('`hello');
  });

  // Ragel: `'[code]'i space* => ...` (line 693). POSIX `space` includes
  // newlines and the `*` is greedy across mixed whitespace. TS does
  // `skipWhitespace(); matchNewlines();` once each, so a second indent
  // pass leaks into the body.
  it('eats interleaved whitespace and newlines after `[code]`', async () => {
    await expectMatchesOracle('[code]  \n  \nbody[/code]');
  });

  // Ragel: textile-link titles run through `parse_basic_inline` (line 874),
  // whose machine only accepts b/i/s/u/sup/sub plus `any => append_html_escaped`
  // (lines 188-226). TS parseInlineString reuses the full inline parser,
  // so id-link patterns inside a title get rendered as anchors.
  it('does not parse id-links inside a textile-link title', async () => {
    await expectMatchesOracle('"see post #1":/x');
  });

  // Same scope rule: backticks have no inline_code branch in basic_inline.
  it('does not parse inline-code inside a textile-link title', async () => {
    await expectMatchesOracle('"a `b` c":/x');
  });
});

describe('grammar parity (asymmetry)', () => {
  // Ragel `inline := |* newline* spoilers_close => ... ;` is a global
  // inline-scanner rule. The TS port originally applied it from
  // `parseHeader` only via `consumeNewlinesIfFollowedByStraySpoilerClose`.
  // Other inline collectors (`[b]`, table cell, ...) need the same rule.
  it('handles a stray `\\n[/spoiler]` inside a `[b]...[/b]` the same way', async () => {
    await expectMatchesOracle('[b]hello\n[/spoiler] world[/b]');
  });

  it('handles a stray `\\n[/spoiler]` inside a table cell the same way', async () => {
    await expectMatchesOracle(
      '[table][tr][td]hello\n[/spoiler] world[/td][/tr][/table]',
    );
  });

  // After `consumeStrayBlockCloseAsLiteral` emits a literal-html close, its
  // tail loop should match the inline scanner's full break set. A header
  // marker on a fresh line is one such break; the original loop only broke
  // on `\n\n` and in-scope container closes.
  it('breaks the stray-close tail when a header marker starts a new line', async () => {
    await expectMatchesOracle('body\n[/spoiler] tail\nh1. after');
  });

  it('breaks the stray-close tail when `[code]` starts a new line', async () => {
    await expectMatchesOracle('body\n[/spoiler] tail\n[code]boom[/code]');
  });

  // Ragel: `<open> space*` greedily eats all post-open whitespace including
  // an indent on the next content line. `parseSpoilerBlock` had this rule;
  // `parseQuote` and `parseSection` wrap the same `<open> space*` shape and
  // need the same eat.
  it('strips the leading indent on the first content line of a quote', async () => {
    await expectMatchesOracle('[quote]\n  hi\n[/quote]');
  });

  it('strips the leading indent on the first content line of a section', async () => {
    await expectMatchesOracle('[section]\n  hi\n[/section]');
  });

  // Ragel pair-matches `[spoiler]` / `[spoilers]` by dstack depth, not by
  // close-form spelling: a `[/spoilers]` later in the input pairs with the
  // outer `[spoiler]` even when an inner `[/spoiler]` comes first.
  it('pair-matches nested spoilers by depth, not by close-form-first-ahead', async () => {
    await expectMatchesOracle('[spoiler]a [spoiler]b[/spoiler] c[/spoilers]');
  });

  // Ragel: from inline scope, a bracketed always-block open performs
  // `dstack_close_before_block; fexec ts; fret`, exiting the inline scanner
  // so the surrounding block scope promotes the open. parseInlineContainer
  // doesn't do this, so the open gets consumed as inline literal text. One
  // case per ragel rule that fires this fret.
  //
  // Ragel `'[code]'i` rule line 455.
  it('exits an inline `[b]` when `[code]` opens mid-content', async () => {
    await expectMatchesOracle('[b]a [code]x[/code] b[/b]');
  });

  // Ragel `'[table]'i` rule line 433.
  it('exits an inline `[b]` when `[table]` opens mid-content', async () => {
    await expectMatchesOracle('[b]a [table][tr][td]x[/td][/tr][/table] b[/b]');
  });

  // Ragel `quote_open` rule line 477.
  it('exits an inline `[b]` when `[quote]` opens mid-content', async () => {
    await expectMatchesOracle('[b]a [quote]x[/quote] b[/b]');
  });

  // Ragel `section_open` rule line 504.
  it('exits an inline `[b]` when `[section]` opens mid-content', async () => {
    await expectMatchesOracle('[b]a [section]x[/section] b[/b]');
  });

  // Ragel `newline header => fret` rule line 427.
  it('exits an inline `[b]` when a header marker starts a new line', async () => {
    await expectMatchesOracle('[b]a\nh1. heading[/b]');
  });

  // Ragel `newline list_item => fret` rule line 334.
  it('exits an inline `[b]` when a list-item starts a new line', async () => {
    await expectMatchesOracle('[b]a\n* item[/b]');
  });
});
