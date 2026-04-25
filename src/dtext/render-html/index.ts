/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  ASTNode,
  BoldNode,
  CodeBlockNode,
  ColorNode,
  DocumentNode,
  HeaderNode,
  InlineCodeNode,
  InlineSpoilerNode,
  InternalAnchorNode,
  ItalicNode,
  LTableNode,
  LineBreakNode,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  QuoteNode,
  SectionNode,
  SpoilerBlockNode,
  StrikeoutNode,
  SubscriptNode,
  SuperscriptNode,
  TableBodyNode,
  TableCellNode,
  TableHeadNode,
  TableNode,
  TableRowNode,
  TextNode,
  UnderlineNode,
} from '../../ast';

export interface DTextRenderOptions {
  allowColor?: boolean;
  maxThumbs?: number;
  baseUrl?: string;
}

interface RenderContext {
  options: DTextRenderOptions;
  thumbCount: number;
}

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uriEscape(str: string, whitelist = ''): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (/[a-zA-Z0-9\-_.~]/.test(c) || c === whitelist) {
      result += c;
    } else {
      const code = str.charCodeAt(i);
      result += '%' + code.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

export function renderToHTML(
  node: ASTNode,
  options: DTextRenderOptions = {},
): string {
  const context: RenderContext = {
    options,
    thumbCount: 0,
  };

  return renderNode(node, context);
}

function renderNode(node: ASTNode, context: RenderContext): string {
  switch (node.type) {
    case 'document':
      return renderDocument(node as DocumentNode, context);

    // Block nodes
    case 'header':
      return renderHeader(node as HeaderNode, context);
    case 'paragraph':
      return renderParagraph(node as ParagraphNode, context);
    case 'quote':
      return renderQuote(node as QuoteNode, context);
    case 'spoiler_block':
      return renderSpoilerBlock(node as SpoilerBlockNode, context);
    case 'section':
      return renderSection(node as SectionNode, context);
    case 'code_block':
      return renderCodeBlock(node as CodeBlockNode, context);
    case 'table':
      return renderTable(node as TableNode, context);
    case 'ltable':
      return renderLTable(node as LTableNode, context);
    case 'table_head':
      return renderTableHead(node as TableHeadNode, context);
    case 'table_body':
      return renderTableBody(node as TableBodyNode, context);
    case 'table_row':
      return renderTableRow(node as TableRowNode, context);
    case 'table_cell':
      return renderTableCell(node as TableCellNode, context);
    case 'list':
      return renderList(node as ListNode, context);
    case 'list_item':
      return renderListItem(node as ListItemNode, context);

    // Inline nodes
    case 'text':
      return renderText(node as TextNode, context);
    case 'bold':
      return renderBold(node as BoldNode, context);
    case 'italic':
      return renderItalic(node as ItalicNode, context);
    case 'strikeout':
      return renderStrikeout(node as StrikeoutNode, context);
    case 'underline':
      return renderUnderline(node as UnderlineNode, context);
    case 'superscript':
      return renderSuperscript(node as SuperscriptNode, context);
    case 'subscript':
      return renderSubscript(node as SubscriptNode, context);
    case 'inline_spoiler':
      return renderInlineSpoiler(node as InlineSpoilerNode, context);
    case 'inline_code':
      return renderInlineCode(node as InlineCodeNode, context);
    case 'color':
      return renderColor(node as ColorNode, context);
    case 'line_break':
      return renderLineBreak(node as LineBreakNode, context);
    case 'link':
      return renderLink(node as LinkNode, context);
    case 'internal_anchor':
      return renderInternalAnchor(node as InternalAnchorNode, context);

    default:
      console.warn(`Unknown node type: ${node.type}`);
      return '';
  }
}

function renderDocument(node: DocumentNode, context: RenderContext): string {
  return node.children.map((child) => renderNode(child, context)).join('');
}

function renderHeader(node: HeaderNode, context: RenderContext): string {
  const tag = `h${node.level}`;
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<${tag}>${content}</${tag}>`;
}

function renderParagraph(node: ParagraphNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<p>${content}</p>`;
}

function renderQuote(node: QuoteNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<blockquote>${content}</blockquote>`;
}

function renderSpoilerBlock(
  node: SpoilerBlockNode,
  context: RenderContext,
): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<div class="spoiler">${content}</div>`;
}

function renderSection(node: SectionNode, context: RenderContext): string {
  const openAttr = node.expanded ? ' open' : '';
  const title = node.title ? htmlEscape(node.title) : '';
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<details${openAttr}><summary>${title}</summary><div>${content}</div></details>`;
}

function renderCodeBlock(node: CodeBlockNode, _context: RenderContext): string {
  return `<pre>${htmlEscape(node.content)}</pre>`;
}

function renderTable(node: TableNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<table class="striped">${content}</table>`;
}

function renderLTable(node: LTableNode, context: RenderContext): string {
  const headerRow = node.rows[0];
  const bodyRows = node.rows.slice(1);

  let result = '';
  if (headerRow) {
    result += `<thead>${renderNode(headerRow, context)}</thead>`;
  }
  if (bodyRows.length > 0) {
    result += `<tbody>${bodyRows.map((row) => renderNode(row, context)).join('')}</tbody>`;
  }

  return `<table class="striped">${result}</table>`;
}

function renderTableHead(node: TableHeadNode, context: RenderContext): string {
  const content = node.rows.map((row) => renderNode(row, context)).join('');
  return `<thead>${content}</thead>`;
}

function renderTableBody(node: TableBodyNode, context: RenderContext): string {
  const content = node.rows.map((row) => renderNode(row, context)).join('');
  return `<tbody>${content}</tbody>`;
}

function renderTableRow(node: TableRowNode, context: RenderContext): string {
  const content = node.cells.map((cell) => renderNode(cell, context)).join('');
  return `<tr>${content}</tr>`;
}

function renderTableCell(node: TableCellNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<${node.cellType}>${content}</${node.cellType}>`;
}

function renderList(node: ListNode, context: RenderContext): string {
  let result = '';
  let prevDepth = 0;

  for (const item of node.items) {
    if (item.depth > prevDepth) {
      for (let i = prevDepth; i < item.depth; i++) {
        result += '<ul>';
      }
    } else if (item.depth < prevDepth) {
      for (let i = item.depth; i < prevDepth; i++) {
        result += '</ul>';
      }
    }
    result += renderNode(item, context);
    prevDepth = item.depth;
  }

  for (let i = 0; i < prevDepth; i++) {
    result += '</ul>';
  }

  return result;
}

function renderListItem(node: ListItemNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<li>${content}</li>`;
}

function renderText(node: TextNode, _context: RenderContext): string {
  return htmlEscape(node.content);
}

function renderBold(node: BoldNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<strong>${content}</strong>`;
}

function renderItalic(node: ItalicNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<em>${content}</em>`;
}

function renderStrikeout(node: StrikeoutNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<s>${content}</s>`;
}

function renderUnderline(node: UnderlineNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<u>${content}</u>`;
}

function renderSuperscript(
  node: SuperscriptNode,
  context: RenderContext,
): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<sup>${content}</sup>`;
}

function renderSubscript(node: SubscriptNode, context: RenderContext): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<sub>${content}</sub>`;
}

function renderInlineSpoiler(
  node: InlineSpoilerNode,
  context: RenderContext,
): string {
  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');
  return `<span class="spoiler">${content}</span>`;
}

function renderInlineCode(
  node: InlineCodeNode,
  _context: RenderContext,
): string {
  return `<span class="inline-code">${htmlEscape(node.content)}</span>`;
}

function renderColor(node: ColorNode, context: RenderContext): string {
  if (context.options.allowColor === false) {
    return node.children.map((child) => renderNode(child, context)).join('');
  }

  const content = node.children
    .map((child) => renderNode(child, context))
    .join('');

  if (
    /^(art(ist)?|char(acter)?|copy(right)?|spec(ies)?|inv(alid)?|meta|lore)$/i.test(
      node.color,
    )
  ) {
    return `<span class="dtext-color-${node.color.toLowerCase()}">${content}</span>`;
  } else {
    return `<span class="dtext-color" style="color:${node.color}">${content}</span>`;
  }
}

function renderLineBreak(
  _node: LineBreakNode,
  _context: RenderContext,
): string {
  return '<br>';
}

function renderLink(node: LinkNode, context: RenderContext): string {
  if (node.idType === 'thumb' && context.options.maxThumbs !== undefined) {
    if (context.thumbCount >= context.options.maxThumbs) {
      return `<span class="thumb-limit-exceeded">${htmlEscape(node.title || node.href)}</span>`;
    }
    context.thumbCount++;
  }

  const classes = generateLinkClasses(node);

  let content = '';
  if (node.children) {
    content = node.children.map((child) => renderNode(child, context)).join('');
  } else if (node.title) {
    content = htmlEscape(node.title);
  } else {
    content = htmlEscape(node.href);
  }

  let href = node.href;
  if (context.options.baseUrl && href.startsWith('/')) {
    href = context.options.baseUrl.replace(/\/$/, '') + href;
  }

  const relAttr = ' rel="nofollow"';

  let dataAttr = '';
  if (node.idType === 'thumb' && node.id) {
    dataAttr = ` data-id="${htmlEscape(node.id)}"`;
  }

  return `<a${relAttr} class="${classes.join(' ')}"${dataAttr} href="${htmlEscape(href)}">${content}</a>`;
}

function renderInternalAnchor(
  node: InternalAnchorNode,
  _context: RenderContext,
): string {
  return `<a id="${uriEscape(node.name.toLowerCase())}"></a>`;
}

function generateLinkClasses(node: LinkNode): string[] {
  const classes: string[] = ['dtext-link'];

  switch (node.linkType) {
    case 'url':
      break;
    case 'textile':
      if (node.href.startsWith('/')) {
        break;
      } else {
        classes.push('dtext-external-link');
      }
      break;
    case 'wiki':
      classes.push('dtext-wiki-link');
      break;
    case 'post_search':
      classes.push('dtext-post-search-link');
      break;
    case 'id_link':
      classes.push('dtext-id-link');

      if (node.idType) {
        switch (node.idType) {
          case 'post':
            classes.push('dtext-post-id-link');
            break;
          case 'thumb':
            classes.push('dtext-post-id-link', 'thumb-placeholder-link');
            break;
          case 'post_changes':
            classes.push('dtext-post-changes-for-id-link');
            break;
          case 'flag':
            classes.push('dtext-post-flag-id-link');
            break;
          case 'note':
            classes.push('dtext-note-id-link');
            break;
          case 'forum_post':
            classes.push('dtext-forum-post-id-link');
            break;
          case 'topic':
            classes.push('dtext-forum-topic-id-link');
            break;
          case 'comment':
            classes.push('dtext-comment-id-link');
            break;
          case 'pool':
            classes.push('dtext-pool-id-link');
            break;
          case 'user':
            classes.push('dtext-user-id-link');
            break;
          case 'artist':
            classes.push('dtext-artist-id-link');
            break;
          case 'ban':
            classes.push('dtext-ban-id-link');
            break;
          case 'bur':
            classes.push('dtext-bulk-update-request-id-link');
            break;
          case 'alias':
            classes.push('dtext-tag-alias-id-link');
            break;
          case 'implication':
            classes.push('dtext-tag-implication-id-link');
            break;
          case 'mod_action':
            classes.push('dtext-mod-action-id-link');
            break;
          case 'record':
            classes.push('dtext-user-feedback-id-link');
            break;
          case 'wiki':
            classes.push('dtext-wiki-page-id-link');
            break;
          case 'set':
            classes.push('dtext-set-id-link');
            break;
          case 'blip':
            classes.push('dtext-blip-id-link');
            break;
          case 'takedown':
            classes.push('dtext-takedown-id-link');
            break;
          case 'ticket':
            classes.push('dtext-ticket-id-link');
            break;
        }
      }
      break;
  }

  return classes;
}
