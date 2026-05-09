export interface ASTNode {
  type: string;
}

export interface DocumentNode extends ASTNode {
  type: 'document';
  children: BlockNode[];
}

export type BlockNode =
  | HeaderNode
  | ParagraphNode
  | QuoteNode
  | SpoilerBlockNode
  | SectionNode
  | CodeBlockNode
  | TableNode
  | LTableNode
  | ListNode
  | RawBlockTextNode
  | LiteralHtmlNode;

export type InlineNode =
  | TextNode
  | BoldNode
  | ItalicNode
  | StrikeoutNode
  | UnderlineNode
  | SuperscriptNode
  | SubscriptNode
  | InlineSpoilerNode
  | InlineCodeNode
  | ColorNode
  | LinkNode
  | InternalAnchorNode
  | LineBreakNode
  | FragmentNode;

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
  // Optional color from [quote=COLOR]. The value is the raw token as typed
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
// inside `children` render as `<br>` via the normal LineBreakNode path.
export interface LiteralHtmlNode extends ASTNode {
  type: 'literal_html';
  prefix: string;
  children: InlineNode[];
}

export interface TableNode extends ASTNode {
  type: 'table';
  children: (TableHeadNode | TableBodyNode | TableRowNode)[];
}

export interface LTableNode extends ASTNode {
  type: 'ltable';
  rows: TableRowNode[];
}

export interface TableHeadNode extends ASTNode {
  type: 'table_head';
  rows: TableRowNode[];
}

export interface TableBodyNode extends ASTNode {
  type: 'table_body';
  rows: TableRowNode[];
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
// (e.g. an over-deep [sup]/[sub] open) but still wants to bubble its parsed
// children up to the containing inline list. The renderer emits children
// without any surrounding markup.
export interface FragmentNode extends ASTNode {
  type: 'fragment';
  children: InlineNode[];
}

// id-link kinds the parser emits via `[prefix #N]` syntax (post #123,
// pool #45, etc.). The set is kept in lockstep with `ID_PATTERNS` in
// `parse/index.ts` and with `ID_TYPE_CLASSES` in `render-html/index.ts`;
// adding a new id type means a new entry in all three places, and the
// union here makes the renderer's Record exhaustive against it.
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
  linkType: 'url' | 'textile' | 'wiki' | 'post_search' | 'id_link';
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
