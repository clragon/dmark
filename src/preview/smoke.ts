// Stand-alone smoke driver for the preview workbench. Runs every built-in
// sample through the same parse + renderToHTML pipeline the live page runs,
// asserts no exceptions plus non-empty HTML output. Intended for ad-hoc
// invocation via `tsx src/preview/smoke.ts`; not wired into vitest because
// the project's vitest globalSetup spins up the dtext oracle docker
// container, which is overkill for a preview-side regression check.

import { parseDTextToAST, renderToHTML } from '../dtext';
import { parseMarkdown } from '../md/parse';
import { SAMPLES } from './samples';

let failures = 0;
for (const sample of SAMPLES) {
  try {
    if (sample.side === 'dtext') {
      const ast = parseDTextToAST(sample.source);
      const html = renderToHTML(ast);
      if (!html.length) throw new Error('empty html');
      process.stdout.write(
        `  ok   ${sample.id.padEnd(20)} ${html.length} chars html\n`,
      );
    } else {
      const result = parseMarkdown(sample.source);
      const html = renderToHTML(result.document);
      if (!html.length) throw new Error('empty html');
      const diags = result.diagnostics.length;
      process.stdout.write(
        `  ok   ${sample.id.padEnd(20)} ${html.length} chars html, ${diags} diag\n`,
      );
    }
  } catch (e) {
    failures++;
    const msg = e instanceof Error ? e.message : String(e);
    process.stdout.write(`  FAIL ${sample.id.padEnd(20)} ${msg}\n`);
  }
}

if (failures > 0) {
  process.stdout.write(`\n${failures} sample(s) failed.\n`);
  process.exit(1);
}
process.stdout.write(`\nall ${SAMPLES.length} samples ok.\n`);
