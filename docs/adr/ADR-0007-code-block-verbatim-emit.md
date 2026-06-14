# ADR-0007: Code block canonical emit (dtext)

- Status: Accepted
- Date: 2026-05-12

## Context

A `CodeBlockNode { content }` carries the literal slice the dtext parser
captured between `[code]` and `[/code]`. The parser's open rule mirrors
Ruby's `[code] space*` and eats every leading whitespace byte (including
newlines) after `[code]` before recording `content`. So
`[code]\nhello\n[/code]` and `[code]hello\n[/code]` both produce
`content = "hello\n"`; fenced vs trailing-only layout is not
distinguishable from the AST alone.

The formatter therefore cannot reproduce the author's exact byte layout
in every case. It can pick a canonical form that round-trips through the
parser without loss.

## Decision

Emit `[code]<content>[/code]` with `content` written verbatim, and
prepend a single `\n` after `[code]` when either:

1. `content` ends with `\n` (the closing `[/code]` lands on its own
   line, so the canonical form opens on its own line too — fenced
   layout), or
2. `content` starts with a whitespace byte (` `, `\t`, `\n`, or `\r`),
   which would otherwise be eaten by the parser's leading-whitespace
   rule and shorten `content` on re-parse.

## Consequences

- A `content` ending with `\n` emits as fenced (`[code]\n...\n[/code]`)
  and round-trips byte-stable through both `parseDTextToAst -> renderAstToDText`
  and `parseDTextToAst -> renderAstToMarkdown -> parseMarkdownToAst -> renderAstToDText`.
- A `content` without a trailing newline emits inline
  (`[code]hi[/code]`) and round-trips byte-stable through `parseDTextToAst
  -> renderAstToDText`. The markdown roundtrip will add a trailing `\n`
  because markdown-it normalises fenced-code content with one, so an
  inline-source becomes fenced after the markdown trip — an unavoidable
  consequence of the markdown format, not a formatter choice.
- A constructed `content` starting with whitespace round-trips because
  the parser's eat absorbs the prepended `\n`. A constructed `content`
  ending in trailing horizontal whitespace (no `\n`) is preserved by
  the parser's `[/code]` rule.

## Alternatives considered

- Strict-verbatim emit with no prepend. Rejected: a `content` starting
  with whitespace would reparse to a shorter string. A `content` ending
  in `\n` would emit `[code]hi\n[/code]` — legal but visually unfenced
  despite the obvious newline signal.
- Always emit fenced. Rejected: would inflate inline `[code]hi[/code]`
  to fenced form on every `parseDTextToAst -> renderAstToDText` cycle, churning
  the author's layout choice for content that has no newline signal at
  all.
- Restore the leading newline in the parser to make fenced layout
  recoverable from the AST. Rejected: diverges from Ruby's oracle
  behaviour, which the parser follows by design.
