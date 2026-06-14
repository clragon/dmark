export interface AstNode {
  type: string;
}

export interface DocumentNode extends AstNode {
  type: 'document';
  children: BlockNode[];
}

// Block and inline node sets are declared as interface maps so a consumer can
// add their own node types with declaration merging:
//
//   declare module '@clynamic/dmark' {
//     interface InlineNodeMap { my_node: MyNode }
//   }
//
// The merged type flows into every `BlockNode[]`/`InlineNode[]` slot and into
// the renderer/formatter handler tables, so custom nodes need no cast.
export interface BlockNodeMap {
  header: HeaderNode;
  paragraph: ParagraphNode;
  quote: QuoteNode;
  spoiler_block: SpoilerBlockNode;
  section: SectionNode;
  code_block: CodeBlockNode;
  table: TableNode;
  ltable: LTableNode;
  list: ListNode;
  raw_block_text: RawBlockTextNode;
  literal_html: LiteralHtmlNode;
}
export type BlockNode = BlockNodeMap[keyof BlockNodeMap];

export interface InlineNodeMap {
  text: TextNode;
  bold: BoldNode;
  italic: ItalicNode;
  strikeout: StrikeoutNode;
  underline: UnderlineNode;
  superscript: SuperscriptNode;
  subscript: SubscriptNode;
  inline_spoiler: InlineSpoilerNode;
  inline_code: InlineCodeNode;
  color: ColorNode;
  link: LinkNode;
  internal_anchor: InternalAnchorNode;
  line_break: LineBreakNode;
  fragment: FragmentNode;
}
export type InlineNode = InlineNodeMap[keyof InlineNodeMap];

export type TablePartNode =
  | TableHeadNode
  | TableBodyNode
  | TableRowNode
  | TableCellNode
  | TableLiteralNode;

export interface HeaderNode extends AstNode {
  type: 'header';
  level: number;
  children: InlineNode[];
}

export interface ParagraphNode extends AstNode {
  type: 'paragraph';
  children: InlineNode[];
}

export interface QuoteNode extends AstNode {
  type: 'quote';
  children: BlockNode[];
  // Optional color from [quote=COLOR]. Value is the raw token as typed
  // (case preserved); the renderer chooses class/style based on shape.
  color?: string;
}

export interface SpoilerBlockNode extends AstNode {
  type: 'spoiler_block';
  children: BlockNode[];
}

export interface SectionNode extends AstNode {
  type: 'section';
  title?: string;
  expanded?: boolean;
  children: BlockNode[];
}

export interface CodeBlockNode extends AstNode {
  type: 'code_block';
  content: string;
}

// Stray block-level closing tags ([/code], [/table]) that ruby renders as
// literal text without paragraph wrapping when no matching open is in scope.
export interface RawBlockTextNode extends AstNode {
  type: 'raw_block_text';
  content: string;
}

// Stray-close fallout. Ruby ends the surrounding paragraph and continues
// streaming output without re-opening one. `prefix` is verbatim HTML for the
// inter-block whitespace plus the close tag itself; `children` is the inline
// tail (so `Topic #1` after a stray close still becomes an `<a>`). Newlines
// inside `children` render as `<br>` via the LineBreakNode path.
export interface LiteralHtmlNode extends AstNode {
  type: 'literal_html';
  prefix: string;
  children: InlineNode[];
}

// Stray bracketed tags that don't match an open are rendered as literal
// inside the surrounding scope (matching ruby's `dstack_close_block` fallback
// which appends `{ ts, te }` when the close type doesn't match the top). Used
// to capture orphan `[/tr]` / `[/thead]` / `[/td]` / etc seen inside a
// `[table]` body so they re-emit verbatim between structural elements.
export interface TableLiteralNode extends AstNode {
  type: 'table_literal';
  content: string;
}

export interface TableNode extends AstNode {
  type: 'table';
  children: (TableHeadNode | TableBodyNode | TableRowNode | TableLiteralNode)[];
}

export interface LTableNode extends AstNode {
  type: 'ltable';
  // Children of the synthesised `[table]` produced by ruby's
  // `preprocess_for_tables`. Storing the full structure (instead of a flat
  // row list) preserves the `<thead>` / `<tbody>` divide and the literal-text
  // fallout that lives between them, while the formatter recovers a flat
  // pipe-separated row source by walking the structural wrappers.
  children: (TableHeadNode | TableBodyNode | TableRowNode | TableLiteralNode)[];
  // Original trimmed text between `[ltable]` and `[/ltable]`. Stored so the
  // formatter can re-emit the exact source — `children` is derived through a
  // synthesised `[table]` parse where URL patterns intentionally spill past
  // structural tags (matching oracle HTML), and that spillover is lossy if
  // the formatter has to reconstruct cells from the parsed AST.
  source?: string;
}

export interface TableHeadNode extends AstNode {
  type: 'table_head';
  rows: (TableRowNode | TableLiteralNode)[];
}

export interface TableBodyNode extends AstNode {
  type: 'table_body';
  // A `[tbody]` body can contain a nested `[thead]...[/thead]` group
  // (some wiki authors use this to interleave header rows mid-table).
  // The HTML rendering emits the nested `<thead>` inside `<tbody>`, which
  // is invalid HTML but is what the ruby oracle produces; parse5 then
  // canonicalises both sides identically (splits tbody around the thead).
  rows: (TableRowNode | TableLiteralNode | TableHeadNode)[];
}

export interface TableRowNode extends AstNode {
  type: 'table_row';
  cells: TableCellNode[];
}

export interface TableCellNode extends AstNode {
  type: 'table_cell';
  cellType: 'th' | 'td';
  children: InlineNode[];
}

export interface ListNode extends AstNode {
  type: 'list';
  items: ListItemNode[];
}

export interface ListItemNode extends AstNode {
  type: 'list_item';
  depth: number;
  children: InlineNode[];
}

export interface TextNode extends AstNode {
  type: 'text';
  content: string;
}

export interface BoldNode extends AstNode {
  type: 'bold';
  children: InlineNode[];
}

export interface ItalicNode extends AstNode {
  type: 'italic';
  children: InlineNode[];
}

export interface StrikeoutNode extends AstNode {
  type: 'strikeout';
  children: InlineNode[];
}

export interface UnderlineNode extends AstNode {
  type: 'underline';
  children: InlineNode[];
}

export interface SuperscriptNode extends AstNode {
  type: 'superscript';
  children: InlineNode[];
}

export interface SubscriptNode extends AstNode {
  type: 'subscript';
  children: InlineNode[];
}

export interface InlineSpoilerNode extends AstNode {
  type: 'inline_spoiler';
  children: InlineNode[];
}

export interface InlineCodeNode extends AstNode {
  type: 'inline_code';
  content: string;
}

export interface ColorNode extends AstNode {
  type: 'color';
  color: string;
  children: InlineNode[];
}

export interface LineBreakNode extends AstNode {
  type: 'line_break';
}

// Transparent inline grouping. Used when the parser drops a wrapping element
// (e.g. an over-deep [sup]/[sub] open) and bubbles its parsed children up
// to the containing inline list. The renderer emits children without any
// surrounding markup.
//
// `wrapper` records the source-level tag that produced the fragment. The
// HTML renderer ignores it (the wrapper was dropped semantically); the
// dtext formatter uses it to re-emit the source-level open/close so the
// round-trip preserves the same depth on re-parse.
export interface FragmentNode extends AstNode {
  type: 'fragment';
  children: InlineNode[];
  wrapper?: 'sub' | 'sup';
}

// id-link kinds the parser emits via `[prefix #N]` syntax (post #123,
// pool #45, etc.). Metadata tables keyed against this union live in
// `./links` (parser side) and `../html/render/index.ts` (renderer side);
// every table is exhaustive over `IdType`, so adding a new id type
// surfaces the missing entry as a compile error. See ADR-0001.
export type IdType =
  | 'post'
  | 'thumb'
  | 'post_changes'
  | 'flag'
  | 'note'
  | 'forum_post'
  | 'topic'
  | 'comment'
  | 'pool'
  | 'user'
  | 'artist'
  | 'ban'
  | 'bur'
  | 'alias'
  | 'implication'
  | 'mod_action'
  | 'record'
  | 'wiki'
  | 'set'
  | 'blip'
  | 'takedown'
  | 'ticket';

export interface LinkNode extends AstNode {
  type: 'link';
  linkType: 'url' | 'inline' | 'wiki' | 'post_search' | 'id_link';
  href: string;
  title?: string;
  children?: InlineNode[];
  idType?: IdType;
  id?: string;
  anchor?: string;
  tags?: string;
}

export interface InternalAnchorNode extends AstNode {
  type: 'internal_anchor';
  name: string;
}
