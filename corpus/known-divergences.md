# Known oracle divergences

This file enumerates wiki articles in the staging corpus where the dmark
output disagrees with the ruby oracle (or the dtext round-trip property
fails) and the disagreement is **not** a dmark bug. Each entry names the
affected files plus the precise root cause; the curator
(`scripts/curate-corpus.ts`) reads filenames in backticked code spans
from this file to mark them as `known_divergences` in
`corpus/golden/curation.json` rather than unclassified `regressions`.
Articles listed here are still excluded from the curated
`corpus/golden/` so the golden tests stay at 100%.

There are four distinct patterns across the 11 currently-recorded
articles. They are not all the same bug.

## Pattern 1: textile URL absorbs the inline close tag (8 articles)

The dtext textile-link URL regex
(`RE_TEXTILE_BASIC = /"([^"]+)":([^ \t\n\r\f\v]+)/y`) is greedy on
non-whitespace bytes. When the inline source places a bracketed inline
close tag immediately after the URL (no whitespace between the URL and
the bracket), the URL captures the close tag, leaving the inline
unclosed at the source level. Both parsers agree on this capture; the
divergence is in what happens next.

- **dmark** closes the unclosed inline at the paragraph boundary,
  matching the expected nesting of every common AST and producing
  well-formed HTML.
- **oracle** does not close the inline. Its emit state keeps the inline
  tag open through subsequent block boundaries, re-wrapping the next
  header, list, or paragraph in `<em>`, `<sup>`, `<strong>`, or
  combinations thereof. The HTML produced is structurally invalid
  (inline elements enclosing block elements); `parse5` then normalises
  by closing the inline at the next block boundary, which leaves an
  empty `<p></p>` artefact between the wrapped header and the next
  block.

Replicating the oracle behaviour would require threading "pending
inline" state across the block parser and intentionally emitting
malformed HTML, so dmark diverges here.

| File | Inline tag eaten by URL |
|---|---|
| `13885-tapu_lele.dtext` | `[/i]` |
| `15902-tapu_fini.dtext` | `[/i]` |
| `15903-tapu_bulu.dtext` | `[/i]` |
| `6179-meloetta.dtext` | `[/i]` |
| `34400-mozu_gigantic.dtext` | `[/i]` |
| `49495-kidden_eksis.dtext` | `[/b]` and `[/i]` (both, in the same URL) |
| `12086-the_great_mouse_detective.dtext` | `[/i]` |
| `21126-sergen.dtext` | `[/sup]` |

`21126-sergen.dtext`'s rendered diff differs slightly from the others:
the unclosed `<sup>` lands inside the paragraph close rather than
around the following header, so the canonical difference is an extra
empty `<p></p>` between the header and the next paragraph rather than
an `<em>`/`<sup>` wrap around the header text. The root cause and
disposition are the same.

## Pattern 2: unclosed inline-code (backtick) propagates across blocks (2 articles)

When a list item or paragraph opens inline code with `` ` `` and never
closes it on the same line:

- **dmark** isolates list-item content in `parseInlineText(content)`,
  so `parseInlineCode` runs out at end-of-input for that line and the
  inline-code span ends there. Subsequent list items and paragraphs
  parse normally.
- **oracle**'s inline-code rule has no line-end exit. It keeps
  consuming through blank lines, list markers, URLs, and following
  list items until it finds the next physical `` ` ``, absorbing the
  intervening source as inline-code text.

| File | Source location | Source fragment |
|---|---|---|
| `10882-titanmelon_tags.dtext` | line 97 onwards | `` * `humanoid_arms `` opens with no close; next `` ` `` appears on line 100 as `` * `pseudo_[n]some` ``, oracle treats two list items, a URL, and a blank line as inline-code content |
| `10853-titanmelon_index.dtext` | line 191 onwards | `` * 5 [known?] escaped (`\`) js bind still functions in \[code\] blocks `` opens an inline-code span whose matching close appears many lines later |

## Pattern 3: whitespace inside a coloured span at quote-close boundary (1 article)

| File | Source location | Source fragment |
|---|---|---|
| `38152-the_whistler_darli_buni.dtext` | lines 22-24 | line 22 `...satisfactory results.`, then blank line, then line 24 begins with 24 leading spaces before `[/color][/quote]` |

The canonical output disagrees by exactly one trailing space inside the
color span before `</span></p></blockquote>`:

- **dmark** trims trailing whitespace from inline content at the
  paragraph close (`trimTrailingLineBreaks` plus the default
  text-collapse run).
- **oracle** preserves a single space at the inline-content tail when
  the close tag is preceded by indentation on a fresh line.

Tracing oracle's exact character-class handling at this boundary has
not been attempted; the inline-content tail-trim is principled and
matches every other corpus article.

## Pattern 4: formatter round-trip limitations on hostile content (2 articles)

Two of the articles already listed in Pattern 1 or 2 also have the
dtext round-trip property
(`parseDText(format(parseDText(src))) ≡ parseDText(src)`) fail with a
second, independent cause:

### `12086-the_great_mouse_detective.dtext` (also Pattern 1)

The first parse stores `link.href` = `https://...Basil_of_Baker_Street[/i]`,
with the `]` from the eaten close tag now inside the href. The
formatter's bracketed textile form `"title":[url]` cannot encode `]`
inside the URL (its parser uses `[^\]]+`), so it falls back to bare
`"title":url` per ADR-0005. On re-parse, the bare URL's greedy
`[^ \t\n\r\f\v]+` capture absorbs the trailing text `.The` because no
whitespace separates the link from the next sibling, so the recovered
href is `https://...Basil_of_Baker_Street[/i].The`. A real fix needs
percent-encoding for `]` inside textile hrefs; held until the encoding
strategy is cross-validated with the oracle on a wider corpus.

### `10853-titanmelon_index.dtext` (also Pattern 2)

The first parse extracts an inline-code span whose content ends with a
literal `\`. The formatter (per ADR-0010) escapes internal backticks as
`` \` `` but does not escape backslashes, so the emit ends as
`...\\\`...\` ` ` ` ` (the content's trailing `\` directly precedes the
closing `` ` ``). On re-parse, `parseInlineCode`'s `` \` `` escape rule
fires on the `\` + `` ` `` pair, eating the close tag and yielding a
content with a trailing `` ` `` instead of `\`. A real fix needs a
second escape rule (`\\` producing a literal backslash) in
`parseInlineCode`; that change is held back because it would alter the
AST shape for legacy sources that contain double backslashes inside
inline-code spans, and the audit of those sources has not been done.
See ADR-0010's Held alternative.
