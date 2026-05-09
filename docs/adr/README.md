# Architecture Decision Records

Each ADR captures one resolved design decision in the dmark parser/formatter
project. Read top-down by number for chronological order, or jump to a topic
through the table below. To add a new record, copy ADR-0001 as the format
template, increment the number, and append a row to the table.

| Number | Title | Summary | Link |
| --- | --- | --- | --- |
| ADR-0001 | Canonical source spelling for id-link emits | `ID_SOURCE` table maps each `IdType` to its source-prefix spelling for formatter emit. | [file](ADR-0001-id-link-source-spelling.md) |
| ADR-0002 | No trailing newline at document end | Both formatters end output exactly at the last block's last character. | [file](ADR-0002-no-trailing-newline.md) |
| ADR-0003 | Formatter result shape | Both formatters return `{ output, diagnostics }`. | [file](ADR-0003-formatter-result-shape.md) |
| ADR-0004 | Wikilink page recovery on emit | No-title case recovers from children content; title-override case emits the normalised page form. | [file](ADR-0004-wikilink-page-recovery.md) |
| ADR-0005 | Textile link bracket-vs-bare emit rule | Bare form when href has no whitespace, no `]`, and survives `trimUrlBoundaries`; bracketed form otherwise. | [file](ADR-0005-textile-link-bracket-rule.md) |
| ADR-0006 | Bare-vs-delimited URL emit rule (dtext) | Bare URL when no whitespace and unchanged by `trimUrlBoundaries`; `<<href>>` otherwise. | [file](ADR-0006-dtext-url-delimiter-rule.md) |
| ADR-0007 | Code block verbatim emit (dtext) | `[code]<content>[/code]` emitted with `content` exactly as captured. | [file](ADR-0007-code-block-verbatim-emit.md) |
| ADR-0008 | Table pretty-layout emit | One structural tag per line, each `[tr]...[/tr]` on its own line. | [file](ADR-0008-table-pretty-layout.md) |
| ADR-0009 | Light-table cell separator | Cell separator is `' \| '` (space-pipe-space). | [file](ADR-0009-ltable-cell-separator.md) |
| ADR-0010 | Inline code backtick divergence | Verbatim emit; markdown-originated backtick-bearing nodes pinned as documented divergence. | [file](ADR-0010-inline-code-backtick-divergence.md) |
| ADR-0011 | Markdown section canonical emit form | BBCode `[section]` family is canonical on the markdown side. | [file](ADR-0011-markdown-section-canonical-form.md) |
| ADR-0012 | LTable pipe-table approximation on markdown emit | Pipe-table approximation with `md.ltable_approximated` warning. | [file](ADR-0012-ltable-pipe-table-approximation.md) |
| ADR-0013 | Dtext salvage passthrough on markdown emit | Verbatim passthrough with `md.dtext_salvage_passthrough` warning. | [file](ADR-0013-dtext-salvage-passthrough.md) |
| ADR-0014 | Markdown link URL escape strategy | Backslash-escape parens by default; angle-bracket wrap only for whitespace-bearing URLs. | [file](ADR-0014-markdown-link-paren-escape.md) |
| ADR-0015 | Bare-vs-autolink URL emit rule (markdown) | Bare URL when markdown-it's autolinker would detect it and no whitespace; `<href>` otherwise. | [file](ADR-0015-markdown-url-delimiter-rule.md) |
| ADR-0016 | Markdown list marker | `- ` marker, two-space indent per nesting level, unordered only. | [file](ADR-0016-markdown-list-marker.md) |
| ADR-0017 | Markdown text-content escape set | Selective backslash escape: always `*`, `_`, `` ` ``, `\`, `[`, `~~`, `\|\|`; line-start adds block sigils. | [file](ADR-0017-markdown-text-escape-set.md) |
| ADR-0018 | Coloured quote uses BBCode survivor form | Colourless quote uses `>`; coloured quote uses `[quote=COLOR]`. | [file](ADR-0018-coloured-quote-bbcode-survivor.md) |
| ADR-0019 | Table cell linebreak collapse on markdown emit | Replace `LineBreakNode` in cells with a single space, warn `md.table_cell_linebreak_collapsed`. | [file](ADR-0019-table-cell-linebreak-collapse.md) |
