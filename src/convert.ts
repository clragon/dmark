import {
  parseDTextToAST,
  formatDText,
  type DTextRenderOptions,
  type DTextFormatterOptions,
  type DTextFormatResult,
} from './dtext';
import { parseMarkdown, type ParserOptions } from './md/parse';
import {
  formatMarkdown,
  type MarkdownFormatterOptions,
  type MarkdownFormatResult,
} from './md/render';

export function parseDTextToMarkdown(
  input: string,
  parseOptions: DTextRenderOptions = {},
  formatOptions: MarkdownFormatterOptions = {},
): MarkdownFormatResult {
  const ast = parseDTextToAST(input, parseOptions);
  return formatMarkdown(ast, formatOptions);
}

export function parseMarkdownToDText(
  input: string,
  parseOptions: ParserOptions = {},
  formatOptions: DTextFormatterOptions = {},
): DTextFormatResult {
  const { document, diagnostics } = parseMarkdown(input, parseOptions);
  const { output, diagnostics: formatDiagnostics } = formatDText(
    document,
    formatOptions,
  );
  return { output, diagnostics: [...diagnostics, ...formatDiagnostics] };
}
