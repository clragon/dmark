import { parseDTextToAst } from './dtext';
import {
  renderAstToHtml,
  htmlHandlers,
  type HtmlRenderOptions,
  type HtmlHandlers,
} from './html';

export function convertDTextToHtml(
  input: string,
  options: HtmlRenderOptions = {},
  handlers: HtmlHandlers = htmlHandlers,
): string {
  const ast = parseDTextToAst(input, options);
  return renderAstToHtml(ast, options, handlers);
}
