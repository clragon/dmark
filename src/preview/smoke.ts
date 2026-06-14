// Stand-alone smoke driver for the preview workbench. Runs every built-in
// sample through the full round-trip pipeline the live page runs:
//
//   parse(source) → AST → format(AST) → parse(formatted) → AST'
//
// and reports whether AST equals AST' (round-trip stable) or not (violation).
// A violation accompanied by formatter diagnostics is documented loss; a
// violation with no diagnostics is a real round-trip-stability bug. Not a
// vitest test by design: the project's vitest globalSetup boots the dtext
// oracle docker, which is overkill for a preview-side regression check.

import { parseDTextToAst } from '../dtext';
import { renderAstToHtml } from '../html';
import { renderAstToDText } from '../dtext/render';
import { parseMarkdownToAst } from '../md/parse';
import { renderAstToMarkdown } from '../md/render';
import type { AstNode, DocumentNode } from '../ast';
import type { Diagnostic } from '../diagnostics';
import { SAMPLES } from './samples';

interface SideOps {
  parse: (s: string) => { ast: DocumentNode; diagnostics: Diagnostic[] };
  format: (ast: AstNode) => { output: string; diagnostics: Diagnostic[] };
}

const dtext: SideOps = {
  parse: (s) => ({ ast: parseDTextToAst(s) as DocumentNode, diagnostics: [] }),
  format: renderAstToDText,
};

const md: SideOps = {
  parse: (s) => {
    const r = parseMarkdownToAst(s);
    return { ast: r.document, diagnostics: r.diagnostics };
  },
  format: renderAstToMarkdown,
};

function astEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let failures = 0;
let violations = 0;
for (const sample of SAMPLES) {
  const sourceSide = sample.side === 'dtext' ? dtext : md;
  const otherSide = sample.side === 'dtext' ? md : dtext;
  try {
    const { ast } = sourceSide.parse(sample.source);
    const html = renderAstToHtml(ast);
    if (!html.length) throw new Error('empty html');
    const formatted = otherSide.format(ast);
    const reparsed = otherSide.parse(formatted.output);
    const stable = astEqual(ast, reparsed.ast);
    const diagCount =
      formatted.diagnostics.length + reparsed.diagnostics.length;
    if (stable) {
      process.stdout.write(
        `  ok   ${sample.id.padEnd(20)} round-trip stable ` +
          `(html ${html.length}, ${diagCount} diag)\n`,
      );
    } else {
      violations++;
      const tag =
        formatted.diagnostics.length > 0 ? 'documented' : 'UNDOCUMENTED';
      process.stdout.write(
        `  ${tag === 'documented' ? 'warn' : 'BAD '} ${sample.id.padEnd(20)} ` +
          `round-trip diverged (${tag}, ${diagCount} diag)\n`,
      );
    }
  } catch (e) {
    failures++;
    const msg = e instanceof Error ? e.message : String(e);
    process.stdout.write(`  FAIL ${sample.id.padEnd(20)} ${msg}\n`);
  }
}

process.stdout.write(
  `\n${SAMPLES.length} samples · ${failures} failed · ${violations} round-trip divergences\n`,
);
if (failures > 0) process.exit(1);
