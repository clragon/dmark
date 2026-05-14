# Known oracle divergences

This file enumerates wiki articles in the staging corpus where the dmark
HTML output disagrees with the ruby oracle and the disagreement is
**not** a dmark bug. Each entry names the affected files plus the root
cause; the curator (`scripts/curate-corpus.ts`) reads this file to mark
them as `known_divergences` in `corpus/golden/curation.json` rather than
unclassified `regressions`. Articles listed here are still excluded from
the curated `corpus/golden/` so the golden tests stay at 100%.

## unclosed-inline propagation

When a textile URL absorbs its trailing `[/i]`, `[/sup]`, or `` ` ``
(`"text":http://x.com/y(foo)[/i]`, since the URL regex
`[^ \t\n\r\f\v]+` is greedy non-whitespace, oracle-confirmed), the
inline tag is left unclosed by the source. The two parsers then
disagree on what to do with the still-open inline at the next paragraph
boundary:

- **dmark** closes the inline at the paragraph boundary, matching the
  structural expectations of every common AST model and producing
  well-formed HTML.
- **oracle** keeps the inline open and re-wraps the next header, list,
  or paragraph in `<em>`, `<sup>`, or `<span class="inline-code">`. The
  resulting HTML has `<em>` enclosing `<h4>` and even `<p>` elements,
  which is invalid; `parse5` then normalises it by closing `<em>` at
  the next block boundary, leaving an empty `<p></p>` artefact.

Replicating the oracle behaviour would mean threading "pending inline"
state across the block parser and emitting deliberately malformed HTML,
so dmark intentionally diverges here.

Affected files:

- `13885-tapu_lele.dtext`
- `15902-tapu_fini.dtext`
- `15903-tapu_bulu.dtext`
- `6179-meloetta.dtext`
- `21126-sergen.dtext`
- `34400-mozu_gigantic.dtext`
- `49495-kidden_eksis.dtext`
- `12086-the_great_mouse_detective.dtext`
- `38152-the_whistler_darli_buni.dtext`
- `10882-titanmelon_tags.dtext`
- `10853-titanmelon_index.dtext`
