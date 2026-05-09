// Markdown -> shared AST adapter. Wraps `markdown-it` with the strict
// flavour configured by `md-ast-mapping.md`. The token walk is the
// load-bearing part: every CommonMark token produced by `markdown-it` lowers
// either to a node type from `../../ast` or to a `Diagnostic`. The function
// never throws; rejected or unsupported constructs survive as literal text
// and surface through the diagnostics array so callers can decide policy.
//
// This file is the scaffold. It handles paragraph + text + line-break
// (proves the wiring) and emits a `md.unsupported_block` /
// `md.unsupported_inline` diagnostic for everything else. Subsequent commits
// remove tokens from the unsupported set as each spec row lands.

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

import type {
  BlockNode,
  DocumentNode,
  InlineNode,
  LineBreakNode,
  ParagraphNode,
  TextNode,
} from '../../ast';

export interface ParserOptions {
  // Reserved for future flags (e.g. `allowColor` parity with the dtext side).
  // Kept as an explicit type so the public contract has a stable shape from
  // day one even when no flags are present.
}

export interface Diagnostic {
  // Stable code, e.g. `md.legacy_bbcode`. See md-ast-mapping.md for the
  // catalog and severity assignments.
  code: string;
  severity: 'info' | 'warning' | 'fatal';
  message: string;
  // Optional source span. Line/column tracking lands when the adapter wires
  // up token position propagation; today most diagnostics omit this.
  range?: { start: number; end: number };
}

export interface ParseResult {
  document: DocumentNode;
  diagnostics: Diagnostic[];
}

// One shared instance; per-call mutable state lives only in the visitor we
// run after `md.parse`. Configuration matches md-ast-mapping.md:
//   - `html: false`    The HTML allowlist (`<details>`, `<summary>`) lands
//                      in a follow-up commit; until then any HTML tag emits
//                      `md.html_tag_rejected` and the source survives.
//   - `linkify: false` Bare-URL autolink lands with the URL/autolink commit.
//   - `typographer: false`  Source bytes are not rewritten (no smart quotes
//                           or ascii dashes; round-trip stays faithful).
// `breaks` is left at the default; the AST emission treats both `softbreak`
// and `hardbreak` as `LineBreakNode` so every inline `\n` becomes a hard
// break in the AST regardless of how `markdown-it` would render it.
const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

export function parseMarkdown(
  input: string,
  _options: ParserOptions = {},
): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const tokens = md.parse(input, {});
  const children = walkBlocks(tokens, diagnostics);
  return {
    document: { type: 'document', children },
    diagnostics,
  };
}

function walkBlocks(tokens: Token[], diagnostics: Diagnostic[]): BlockNode[] {
  const out: BlockNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    switch (tok.type) {
      case 'paragraph_open': {
        const close = findContainerClose(tokens, i);
        const inline = tokens[i + 1];
        const children =
          inline && inline.type === 'inline' && inline.children
            ? walkInline(inline.children, diagnostics)
            : [];
        const node: ParagraphNode = { type: 'paragraph', children };
        out.push(node);
        i = close;
        break;
      }
      case 'paragraph_close':
        // Consumed by `paragraph_open` above; appears only when the paragraph
        // walk failed to bridge to it (defensive no-op).
        break;
      default:
        i = handleUnsupportedBlock(tokens, i, diagnostics);
    }
  }
  return out;
}

function walkInline(
  tokens: Token[],
  diagnostics: Diagnostic[],
): InlineNode[] {
  const out: InlineNode[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        if (tok.content) {
          const node: TextNode = { type: 'text', content: tok.content };
          out.push(node);
        }
        break;
      case 'softbreak':
      case 'hardbreak': {
        // Both lower to LineBreakNode per md-ast-mapping.md Q6: every inline
        // `\n` is a hard break in the AST, matching the dtext side.
        const node: LineBreakNode = { type: 'line_break' };
        out.push(node);
        break;
      }
      default:
        diagnostics.push({
          code: 'md.unsupported_inline',
          severity: 'fatal',
          message: `Unsupported inline token \`${tok.type}\`: scaffold does not yet implement this construct; the offending span is dropped. See md-ast-mapping.md.`,
        });
    }
  }
  return out;
}

// Bridge an unsupported block-level open to its matching close, emit one
// diagnostic for the whole region (rather than one per inner token), and
// return the index of the close so the caller's loop resumes after it.
// Standalone blocks (nesting === 0) emit one diagnostic and the caller
// advances by one as usual.
function handleUnsupportedBlock(
  tokens: Token[],
  i: number,
  diagnostics: Diagnostic[],
): number {
  const tok = tokens[i]!;
  diagnostics.push({
    code: 'md.unsupported_block',
    severity: 'fatal',
    message: `Unsupported block token \`${tok.type}\`: scaffold does not yet implement this construct; the offending span is dropped. See md-ast-mapping.md.`,
  });
  if (tok.nesting === 1) return findContainerClose(tokens, i);
  return i;
}

// Forward-scan for the matching close of a `markdown-it` container token.
// Tracks nesting depth so nested containers of the same kind do not confuse
// the scan. Falls back to the last token if no close is found (defensive;
// `markdown-it` always pairs opens and closes for valid input).
function findContainerClose(tokens: Token[], openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.nesting === 1) depth++;
    else if (t.nesting === -1) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return tokens.length - 1;
}
