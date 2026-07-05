import {
  parseDTextToAst,
  renderAstToDText,
  dtextHandlers,
  type DTextParseOptions,
  type DTextRenderOptions,
  type DTextRenderResult,
  type DTextHandlers,
} from '@clynamic/dmark';
import { parseMarkdownToAst, type ParserOptions } from './parse';
import {
  renderAstToMarkdown,
  markdownHandlers,
  type MarkdownRenderOptions,
  type MarkdownRenderResult,
  type MarkdownHandlers,
} from './render';

export function convertDTextToMarkdown(
  input: string,
  parseOptions: DTextParseOptions = {},
  formatOptions: MarkdownRenderOptions = {},
  handlers: MarkdownHandlers = markdownHandlers,
): MarkdownRenderResult {
  const ast = parseDTextToAst(input, parseOptions);
  return renderAstToMarkdown(ast, formatOptions, handlers);
}

export function convertMarkdownToDText(
  input: string,
  parseOptions: ParserOptions = {},
  formatOptions: DTextRenderOptions = {},
  handlers: DTextHandlers = dtextHandlers,
): DTextRenderResult {
  const { document, diagnostics } = parseMarkdownToAst(input, parseOptions);
  const { output, diagnostics: formatDiagnostics } = renderAstToDText(
    document,
    formatOptions,
    handlers,
  );
  return { output, diagnostics: [...diagnostics, ...formatDiagnostics] };
}
