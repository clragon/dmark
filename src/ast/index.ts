export interface ASTNode {
  type: string;
}

export interface DocumentNode extends ASTNode {
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

export interface HeaderNode extends ASTNode {
  type: 'header';
  level: number;
  children: InlineNode[];
}

export interface ParagraphNode extends ASTNode {
  type: 'paragraph';
  children: InlineNode[];
}

export interface QuoteNode extends ASTNode {
  type: 'quote';
  children: BlockNode[];
  // Optional color from [quote=COLOR]. Value is the raw token as typed
  // (case preserved); the renderer chooses class/style based on shape.
  color?: string;
}

export interface SpoilerBlockNode extends ASTNode {
  type: 'spoiler_block';
  children: BlockNode[];
}

export interface SectionNode extends ASTNode {
  type: 'section';
  title?: string;
  expanded?: boolean;
  children: BlockNode[];
}

export interface CodeBlockNode extends ASTNode {
  type: 'code_block';
  content: string;
}

// Stray block-level closing tags ([/code], [/table]) that ruby renders as
// literal text without paragraph wrapping when no matching open is in scope.
export interface RawBlockTextNode extends ASTNode {
  type: 'raw_block_text';
  content: string;
}

// Stray-close fallout. Ruby ends the surrounding paragraph and continues
// streaming output without re-opening one. `prefix` is verbatim HTML for the
// inter-block whitespace plus the close tag itself; `children` is the inline
// tail (so `Topic #1` after a stray close still becomes an `<a>`). Newlines
// inside `children` render as `<br>` via the LineBreakNode path.
export interface LiteralHtmlNode extends ASTNode {
  type: 'literal_html';
  prefix: string;
  children: InlineNode[];
}

// Stray bracketed tags that don't match an open are rendered as literal
// inside the surrounding scope (matching ruby's `dstack_close_block` fallback
// which appends `{ ts, te }` when the close type doesn't match the top). Used
// to capture orphan `[/tr]` / `[/thead]` / `[/td]` / etc seen inside a
// `[table]` body so they re-emit verbatim between structural elements.
export interface TableLiteralNode extends ASTNode {
  type: 'table_literal';
  content: string;
}

export interface TableNode extends ASTNode {
  type: 'table';
  children: (TableHeadNode | TableBodyNode | TableRowNode | TableLiteralNode)[];
}

export interface LTableNode extends ASTNode {
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

export interface TableHeadNode extends ASTNode {
  type: 'table_head';
  rows: (TableRowNode | TableLiteralNode)[];
}

export interface TableBodyNode extends ASTNode {
  type: 'table_body';
  // A `[tbody]` body can contain a nested `[thead]...[/thead]` group
  // (some wiki authors use this to interleave header rows mid-table).
  // The HTML rendering emits the nested `<thead>` inside `<tbody>`, which
  // is invalid HTML but is what the ruby oracle produces; parse5 then
  // canonicalises both sides identically (splits tbody around the thead).
  rows: (TableRowNode | TableLiteralNode | TableHeadNode)[];
}

export interface TableRowNode extends ASTNode {
  type: 'table_row';
  cells: TableCellNode[];
}

export interface TableCellNode extends ASTNode {
  type: 'table_cell';
  cellType: 'th' | 'td';
  children: InlineNode[];
}

export interface ListNode extends ASTNode {
  type: 'list';
  items: ListItemNode[];
}

export interface ListItemNode extends ASTNode {
  type: 'list_item';
  depth: number;
  children: InlineNode[];
}

export interface TextNode extends ASTNode {
  type: 'text';
  content: string;
}

export interface BoldNode extends ASTNode {
  type: 'bold';
  children: InlineNode[];
}

export interface ItalicNode extends ASTNode {
  type: 'italic';
  children: InlineNode[];
}

export interface StrikeoutNode extends ASTNode {
  type: 'strikeout';
  children: InlineNode[];
}

export interface UnderlineNode extends ASTNode {
  type: 'underline';
  children: InlineNode[];
}

export interface SuperscriptNode extends ASTNode {
  type: 'superscript';
  children: InlineNode[];
}

export interface SubscriptNode extends ASTNode {
  type: 'subscript';
  children: InlineNode[];
}

export interface InlineSpoilerNode extends ASTNode {
  type: 'inline_spoiler';
  children: InlineNode[];
}

export interface InlineCodeNode extends ASTNode {
  type: 'inline_code';
  content: string;
}

export interface ColorNode extends ASTNode {
  type: 'color';
  color: string;
  children: InlineNode[];
}

export interface LineBreakNode extends ASTNode {
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
export interface FragmentNode extends ASTNode {
  type: 'fragment';
  children: InlineNode[];
  wrapper?: 'sub' | 'sup';
}

// id-link kinds the parser emits via `[prefix #N]` syntax (post #123,
// pool #45, etc.). Metadata tables keyed against this union live in
// `./links` (parser side) and `render-html/index.ts` (renderer side);
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

export interface LinkNode extends ASTNode {
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

export interface InternalAnchorNode extends ASTNode {
  type: 'internal_anchor';
  name: string;
}
