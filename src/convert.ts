import {
  parseDTextToAST,
  formatDText,
  dtextHandlers,
  type DTextRenderOptions,
  type DTextFormatterOptions,
  type DTextFormatResult,
  type DTextHandlers,
} from './dtext';
import { parseMarkdown, type ParserOptions } from './md/parse';
import {
  formatMarkdown,
  markdownHandlers,
  type MarkdownFormatterOptions,
  type MarkdownFormatResult,
  type MarkdownHandlers,
} from './md/render';

export function parseDTextToMarkdown(
  input: string,
  parseOptions: DTextRenderOptions = {},
  formatOptions: MarkdownFormatterOptions = {},
  handlers: MarkdownHandlers = markdownHandlers,
): MarkdownFormatResult {
  const ast = parseDTextToAST(input, parseOptions);
  return formatMarkdown(ast, formatOptions, handlers);
}

export function parseMarkdownToDText(
  input: string,
  parseOptions: ParserOptions = {},
  formatOptions: DTextFormatterOptions = {},
  handlers: DTextHandlers = dtextHandlers,
): DTextFormatResult {
  const { document, diagnostics } = parseMarkdown(input, parseOptions);
  const { output, diagnostics: formatDiagnostics } = formatDText(
    document,
    formatOptions,
    handlers,
  );
  return { output, diagnostics: [...diagnostics, ...formatDiagnostics] };
}
