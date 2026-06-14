import type { ASTNode } from '../ast';
import { DTextStateMachineParser } from './parse';
import { renderToHTML, type DTextRenderOptions } from './render-html';

export function parseDTextToAST(
  input: string,
  options: DTextRenderOptions = {},
): ASTNode {
  return new DTextStateMachineParser(input, options).parse();
}

export function parseDText(
  input: string,
  options: DTextRenderOptions = {},
): string {
  const ast = new DTextStateMachineParser(input, options).parse();
  return renderToHTML(ast, options);
}

export { DTextStateMachineParser } from './parse';
export {
  renderToHTML,
  renderHtml,
  htmlHandlers,
  htmlEscape,
  uriEscape,
} from './render-html';
export type {
  DTextRenderOptions,
  HtmlHandler,
  HtmlHandlers,
  HtmlRenderContext,
} from './render-html';
export { formatDText, dtextHandlers } from './render';
export type {
  DTextFormatterOptions,
  DTextFormatResult,
  DTextHandler,
  DTextHandlers,
  DTextFormatContext,
} from './render';
