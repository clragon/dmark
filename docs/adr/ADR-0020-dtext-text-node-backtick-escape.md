# ADR-0020: Dtext text-node backtick escape

- Status: Accepted
- Date: 2026-05-14

## Context

`TextNode { content }` is the leaf inline node for arbitrary plain
text. The dtext parser emits a `TextNode` whose content is a single
backtick whenever it sees the source bytes `` \` `` at a position where
inline content is allowed (`parseInlineElement`, the escaped-backtick
rule that fires before the inline-code opener at the same position).
Real wiki corpus contains examples like
`11229-e621_dtext.dtext` where the prose discusses backticks in
text form: *"will be shown as 'JavaScript uses the ` character to
delimit a templated string literal.'"*.

`renderAstToDText`'s text emit previously pushed `content` to the output
buffer verbatim. When the AST contained a literal backtick inside a
text node, the formatter wrote a bare `` ` `` byte to the output and
the next inline-code opener rule on re-parse claimed it, absorbing the
rest of the surrounding inline run as inline-code content. The
round-trip property `parseDTextToAst(format(node)) ≡ node` therefore failed
for any inline run containing a backtick text node, and the failure
landed on real corpus during the survey added in commit `81dcc3a`.

## Decision

`renderAstToDText` escapes every literal backtick in `TextNode.content` to
`` \` `` on emit. The parser's `parseInlineElement` escaped-backtick
rule recovers the original backtick on re-parse, so the round-trip is
exact.

No other characters in plain text need escaping. The dtext parser
recognises exactly one backslash escape (`` \` ``); a `\` preceding any
other byte is treated as literal text by both parsers. Adding a
broader escape set would change the semantics of legacy sources
containing bare `\` runs.

## Consequences

- Plain-text backticks survive the round-trip exactly, matching
  ADR-0010 for the inline-code node and the markdown text emit
  ADR-0017 for the markdown side.
- The `content.includes('\`')` fast path keeps the escape free for the
  vast majority of text nodes (no `replace` call when no backtick is
  present).
- A future widening of the parser's escape set (for example, adding
  `\\` to encode a literal backslash so inline-code with trailing
  backslash can round-trip; see the Held alternative in ADR-0010) will
  require the text-node emit to update accordingly so the two sides
  stay symmetric.

## Alternatives considered

- Continue emitting verbatim and accept the round-trip failure on
  backtick-bearing text nodes as a documented divergence. Rejected:
  the parser already has the escape rule, so the loss is purely a
  formatter omission; the corpus survey found it surfaces in real
  articles, not just synthetic markdown imports.
- Escape additional characters in text content. Rejected: only `` ` ``
  has a context-dependent meaning in plain inline text. Adding `[`,
  `*`, etc. would change the AST shape of legacy sources containing
  those characters unescaped, since the parser does not recognise the
  escape sequences for them.
