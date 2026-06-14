# ADR-0010: Inline code backtick handling

- Status: Accepted
- Date: 2026-05-14 (supersedes 2026-05-09 entry; see Revision history)

## Context

`InlineCodeNode { content }` emits as `` `<content>` ``. The dtext
parser's inline-code rule advances character by character looking for
the closing backtick, with one escape recognised: a backslash
immediately followed by a backtick (`` \` ``) is consumed as two bytes
and contributes a literal backtick to the slice. After the loop the
captured slice is run through `s.replace(/\\`/g, '`')` so the AST
content stores literal backticks where the source had the escape
sequence. The same escape is also recognised by `parseInlineElement` at
the top of the inline scanner, so a bare `` \` `` outside any
inline-code span emits a `TextNode` whose content is a single backtick.

This is verified against the ruby oracle:
``` `\`hello\`` ``` and `` `\`x\\\`` `` both produce
`<span class="inline-code">` with the expected literal backtick(s) in
the rendered content. Real wiki corpus (`11229-e621_dtext.dtext`) uses
the escape in inline-code documentation.

The earlier ADR-0010 (dated 2026-05-09) claimed *"no backslash-escape
exists in the dtext parser for this position"* and prescribed a
verbatim formatter emit. That premise was wrong: the escape did exist
in `parseInlineCode` from the start of the project, and verbatim emit
produced unrepresentable output whenever an `InlineCodeNode.content`
contained a literal backtick (`` `<>` `` collapsed to two empty
inline-code spans bracketing the inner text on re-parse). The corpus
survey added in commit `81dcc3a` surfaced this as a round-trip failure
on the dtext side, not just on the markdown side.

## Decision

`renderAstToDText` emits `` `<escaped>` `` where `<escaped>` is the AST
`content` with every literal backtick replaced by `` \` ``. The
matching escape rule in `parseInlineCode` recovers the original
backtick on re-parse, so the round-trip is exact for any
`InlineCodeNode.content` that contains backticks, whether the node
originated from dtext source, the markdown adapter, or a hand-built
AST.

The parser's escape rule is the load-bearing fact. The formatter does
not need any additional encoding for other characters in inline-code
content because no other byte starts the inline-code close.

## Consequences

- Dtext-originated and markdown-originated `InlineCodeNode` both
  round-trip losslessly when content contains backticks.
- Round-trip remains lossy in the specific case where AST content ends
  with a backslash, since the formatter's appended close `` ` `` then
  glues to the trailing `\` to form a `` \` `` escape on re-parse,
  yielding a content with a trailing backtick instead of a backslash.
  Documented in `corpus/known-divergences.md` under Pattern 4. A real
  fix needs a second escape rule (`\\` , producing a literal
  backslash) in `parseInlineCode`; that change is held back because it
  alters the AST shape for legacy sources that contain double
  backslashes inside inline-code spans, and the audit of those sources
  has not been done.
- The dtext text-node emit shares the same escape via ADR-0020 so a
  literal backtick in plain text content also survives the round-trip.

## Revision history

- 2026-05-09: original "verbatim emit, divergence pinned" decision.
- 2026-05-14: replaced by the current escape rule after the corpus
  survey surfaced concrete round-trip failures on dtext-only paths.

## Alternatives considered

- Refuse the escape and keep the verbatim emit (the 2026-05-09 form).
  Rejected: the verbatim emit was demonstrably wrong for dtext-only
  inputs containing backticks.
- Add a `\\` escape to the parser to fix the trailing-backslash case
  too. Held: requires a corpus audit before changing legacy semantics.
