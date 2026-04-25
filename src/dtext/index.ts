import type { ASTNode } from '../ast';
import { DTextStateMachineParser } from './parse';
import { renderToHTML, type DTextRenderOptions } from './render-html';

export function parseDTextToAST(input: string): ASTNode {
  return new DTextStateMachineParser(input).parse();
}

export function parseDText(
  input: string,
  options: DTextRenderOptions = {},
): string {
  const ast = new DTextStateMachineParser(input).parse();
  return renderToHTML(ast, options);
}

export { DTextStateMachineParser } from './parse';
export { renderToHTML } from './render-html';
export type { DTextRenderOptions } from './render-html';
