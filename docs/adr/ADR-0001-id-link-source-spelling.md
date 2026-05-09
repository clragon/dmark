# ADR-0001: Canonical source spelling for id-link emits

- Status: Accepted
- Date: 2026-05-09

## Context

An id-link AST node (`LinkNode { linkType: "id_link", idType, id }`) is built
by both parsers from sources like `post #1234`, `pool #5`, `BUR #42`. The
node's `children[0].content` carries the **display** form (e.g. `post #123`
for a thumb, `BUR #42` for `bur`), built from `ID_DISPLAY` for HTML
rendering.

When a formatter has to emit the AST back to source, the display form is the
wrong choice. A thumb's display is `post`, but emitting `post #123` would
round-trip the AST to `idType: 'post'` and lose the thumb-ness. A separate
source-spelling table is required.

## Decision

Add `ID_SOURCE: Record<IdType, string>` in `src/ast/links.ts`, derived from
`ID_PATTERNS` by first-match-per-type with regex-source escapes literalised
(the same normalisation `ID_TYPE_MAP` keys already use). Both formatters
emit `<source-prefix> #<id>` from this table and ignore
`node.children[0].content`.

| `IdType`        | source spelling     | display spelling | notes                |
| --------------- | ------------------- | ---------------- | -------------------- |
| `post`          | `post`              | `post`           |                      |
| `thumb`         | `thumb`             | `post`           | display divergence   |
| `post_changes`  | `post changes`      | `post changes`   |                      |
| `flag`          | `flag`              | `flag`           |                      |
| `note`          | `note`              | `note`           |                      |
| `forum_post`    | `forum`             | `forum`          |                      |
| `topic`         | `topic`             | `topic`          |                      |
| `comment`       | `comment`           | `comment`        |                      |
| `pool`          | `pool`              | `pool`           |                      |
| `user`          | `user`              | `user`           |                      |
| `artist`        | `artist`            | `artist`         |                      |
| `ban`           | `ban`               | `ban`            |                      |
| `bur`           | `bur`               | `BUR`            | display upcases      |
| `alias`         | `alias`             | `alias`          |                      |
| `implication`   | `implication`       | `implication`    |                      |
| `mod_action`    | `mod action`        | `mod action`     |                      |
| `record`        | `record`            | `record`         |                      |
| `wiki`          | `wiki`              | `wiki`           |                      |
| `set`           | `set`               | `set`            |                      |
| `blip`          | `blip`              | `blip`           |                      |
| `takedown`      | `takedown`          | `takedown`       | two parser patterns; shorter wins |
| `ticket`        | `ticket`            | `ticket`         |                      |

- `bur` source stays lowercase. A source typed as `BUR #5` lands as `idType:
  'bur'` (the parser-side `ID_TYPE_MAP` is case-insensitive) and re-emits as
  `bur #5`. Round-trip preserves `idType` even though source casing is lost.
- `takedown` uses the shorter source form. Sources typed as `take down
  request #5` or `take down #5` canonicalise to `takedown #5` on emit. The
  original spelling is unrecoverable from the AST; the canonicalisation is
  accepted.

## Consequences

- Round-trip of `idType` is preserved through both formatters for every
  id-link kind.
- Source-spelling variants collapse to a single canonical form on emit.
  Original spelling is not preserved on the AST and cannot be recovered.
- The id-link metadata lockstep group grows by one table (`ID_SOURCE`).
  Every place that names an `IdType` must be updated together; the
  exhaustive `Record<IdType, ...>` types make a missing entry a compile
  error.

## Alternatives considered

- Emit `node.children[0].content` directly. Rejected: that field carries the
  display form, which loses thumb-vs-post and case for `bur`.
- Add a `sourcePrefix` field on `LinkNode`. Rejected: would bloat every
  id-link node with redundant data when a static table can derive the same
  value from `idType`.
