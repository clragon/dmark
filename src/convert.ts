import {
  parseDTextToAst,
  renderAstToDText,
  dtextHandlers,
  type DTextParseOptions,
  type DTextRenderOptions,
  type DTextRenderResult,
  type DTextHandlers,
} from './dtext';
import {
  renderAstToHtml,
  htmlHandlers,
  type HtmlRenderOptions,
  type HtmlHandlers,
} from './html';
import { parseMarkdownToAst, type ParserOptions } from './md/parse';
import {
  renderAstToMarkdown,
  markdownHandlers,
  type MarkdownRenderOptions,
  type MarkdownRenderResult,
  type MarkdownHandlers,
} from './md/render';

export function convertDTextToHtml(
  input: string,
  options: HtmlRenderOptions = {},
  handlers: HtmlHandlers = htmlHandlers,
): string {
  const ast = parseDTextToAst(input, options);
  return renderAstToHtml(ast, options, handlers);
}

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
