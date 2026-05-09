/// <reference types="vite/client" />

// Workbench bootstrapping. The pipelines themselves are tiny — every line of
// real work lives in `src/dtext` and `src/md`. This file's job is to wire DOM
// inputs to those entry points, render results, and degrade gracefully for
// the round-trip formatter slots that don't exist yet (`src/dtext/render` and
// `src/md/render` are stubs at the time of this writing; the spec docs at
// repo root specify their behaviour but no code lands until the captain
// resolves the remaining `Q-MD-*` round).

import { parseDTextToAST, renderToHTML } from '@dmark/dtext';
import { parseMarkdown, type Diagnostic, type ParseResult } from '@dmark/md/parse';
import type { ASTNode, DocumentNode } from '@dmark/ast';

import { renderAST, renderASTError } from './ast-tree';
import { SAMPLES } from './samples';

const DEBOUNCE_MS = 80;

// Vite's import.meta.glob picks up corpus/seed/*.dtext at build time. Today
// the directory only has a `.gitkeep`; the picker will surface fixtures
// automatically once committed seeds appear.
const seedFixtures = import.meta.glob<string>(
  '../../corpus/seed/*.{dtext,txt,md}',
  { query: '?raw', import: 'default', eager: true },
);

interface PaneEls {
  input: HTMLTextAreaElement;
  status: HTMLElement;
  metaInput: HTMLElement;
  metaHtml: HTMLElement;
  metaAst: HTMLElement;
  metaCross: HTMLElement;
  html: HTMLElement;
  ast: HTMLElement;
  cross: HTMLElement;
  diagnostics?: HTMLUListElement;
  metaDiagnostics?: HTMLElement;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing in index.html`);
  return el;
}

function getPaneEls(side: 'dtext' | 'md'): PaneEls {
  return {
    input: $(`input-${side}`) as HTMLTextAreaElement,
    status: $(`status-${side}`),
    metaInput: $(`meta-${side}-input`),
    metaHtml: $(`meta-${side}-html`),
    metaAst: $(`meta-${side}-ast`),
    metaCross: $(`meta-${side}-cross`),
    html: $(`html-${side}`),
    ast: $(`ast-${side}`),
    cross: $(`cross-${side}`),
    diagnostics:
      side === 'md' ? ($(`diagnostics-md`) as HTMLUListElement) : undefined,
    metaDiagnostics: side === 'md' ? $(`meta-md-diagnostics`) : undefined,
  };
}

function setStatus(
  el: HTMLElement,
  state: 'idle' | 'ok' | 'error',
  text: string,
): void {
  el.classList.remove('ok', 'error');
  if (state !== 'idle') el.classList.add(state);
  el.textContent = text;
}

function setPending(el: HTMLElement, message: string): void {
  el.classList.add('pending');
  el.textContent = message;
}

function setReady(el: HTMLElement, value: string): void {
  el.classList.remove('pending');
  el.textContent = value;
}

function renderDiagnostics(
  list: HTMLUListElement,
  diagnostics: Diagnostic[],
): void {
  list.replaceChildren();
  for (const d of diagnostics) {
    const li = document.createElement('li');
    const sev = document.createElement('span');
    sev.classList.add('severity', d.severity);
    sev.textContent = d.severity;
    const code = document.createElement('span');
    code.classList.add('diag-code');
    code.textContent = d.code;
    const msg = document.createElement('span');
    msg.textContent = d.message;
    li.append(sev, code, msg);
    list.appendChild(li);
  }
}

function timeMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function runDText(els: PaneEls, source: string): void {
  els.metaInput.textContent = `${source.length} chars`;
  if (!source) {
    setStatus(els.status, 'idle', 'idle');
    els.html.innerHTML = '';
    renderAST(els.ast, null);
    els.metaHtml.textContent = '';
    els.metaAst.textContent = '';
    setPending(els.cross, '(empty)');
    return;
  }
  let ast: ASTNode;
  try {
    const t0 = timeMs();
    ast = parseDTextToAST(source);
    const html = renderToHTML(ast);
    const elapsed = timeMs() - t0;
    els.html.innerHTML = html;
    renderAST(els.ast, ast);
    els.metaHtml.textContent = `${html.length} chars`;
    els.metaAst.textContent = countNodes(ast) + ' nodes';
    setStatus(els.status, 'ok', `parsed in ${elapsed.toFixed(1)}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    els.html.innerHTML = '';
    renderASTError(els.ast, msg);
    els.metaHtml.textContent = '';
    els.metaAst.textContent = '';
    setStatus(els.status, 'error', 'parse error');
    setPending(els.cross, '(parse error)');
    return;
  }
  // AST → markdown is the round-trip slot. Lights up when src/md/render
  // ships; today it stays in pending state.
  setPending(
    els.cross,
    'AST → Markdown formatter not implemented yet. ' +
      'Once src/md/render exports formatMarkdown(ast), this slot will show ' +
      'the canonical markdown re-emit of the AST above.',
  );
}

function runMarkdown(els: PaneEls, source: string): void {
  els.metaInput.textContent = `${source.length} chars`;
  if (!source) {
    setStatus(els.status, 'idle', 'idle');
    els.html.innerHTML = '';
    renderAST(els.ast, null);
    els.metaHtml.textContent = '';
    els.metaAst.textContent = '';
    if (els.diagnostics) renderDiagnostics(els.diagnostics, []);
    if (els.metaDiagnostics) els.metaDiagnostics.textContent = '0';
    setPending(els.cross, '(empty)');
    return;
  }
  let result: ParseResult;
  try {
    const t0 = timeMs();
    result = parseMarkdown(source);
    const document_: DocumentNode = result.document;
    const html = renderToHTML(document_);
    const elapsed = timeMs() - t0;
    els.html.innerHTML = html;
    renderAST(els.ast, document_);
    els.metaHtml.textContent = `${html.length} chars`;
    els.metaAst.textContent = countNodes(document_) + ' nodes';
    if (els.diagnostics) renderDiagnostics(els.diagnostics, result.diagnostics);
    if (els.metaDiagnostics) {
      els.metaDiagnostics.textContent = `${result.diagnostics.length}`;
    }
    setStatus(els.status, 'ok', `parsed in ${elapsed.toFixed(1)}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    els.html.innerHTML = '';
    renderASTError(els.ast, msg);
    els.metaHtml.textContent = '';
    els.metaAst.textContent = '';
    if (els.diagnostics) renderDiagnostics(els.diagnostics, []);
    if (els.metaDiagnostics) els.metaDiagnostics.textContent = '0';
    setStatus(els.status, 'error', 'parse error');
    setPending(els.cross, '(parse error)');
    return;
  }
  setPending(
    els.cross,
    'AST → DText formatter not implemented yet. ' +
      'Once src/dtext/render exports formatDText(ast), this slot will show ' +
      'the canonical dtext re-emit of the AST above.',
  );
}

function countNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  let total = 1;
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      for (const x of v) total += countNodes(x);
    } else if (v && typeof v === 'object' && 'type' in v) {
      total += countNodes(v);
    }
  }
  return total;
}

function debounce<F extends (...a: never[]) => void>(fn: F, ms: number): F {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<F>) => {
    if (handle !== null) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, ms);
  }) as F;
}

function populateFixturePicker(select: HTMLSelectElement): void {
  const entries = Object.entries(seedFixtures);
  if (entries.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(corpus/seed empty)';
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }
  for (const [path] of entries) {
    const opt = document.createElement('option');
    opt.value = path;
    opt.textContent = path.replace(/^.*corpus\/seed\//, '');
    select.appendChild(opt);
  }
}

function populateSamplePicker(select: HTMLSelectElement): void {
  for (const sample of SAMPLES) {
    const opt = document.createElement('option');
    opt.value = sample.id;
    opt.textContent = sample.label;
    select.appendChild(opt);
  }
}

function init(): void {
  const dtext = getPaneEls('dtext');
  const md = getPaneEls('md');

  const debouncedDText = debounce(
    () => runDText(dtext, dtext.input.value),
    DEBOUNCE_MS,
  );
  const debouncedMd = debounce(
    () => runMarkdown(md, md.input.value),
    DEBOUNCE_MS,
  );

  const linkInputs = $('link-inputs') as HTMLInputElement;

  dtext.input.addEventListener('input', () => {
    debouncedDText();
    if (linkInputs.checked) {
      md.input.value = dtext.input.value;
      debouncedMd();
    }
  });
  md.input.addEventListener('input', () => {
    debouncedMd();
    if (linkInputs.checked) {
      dtext.input.value = md.input.value;
      debouncedDText();
    }
  });

  // Fixture picker: load raw text into the side that matches the file
  // extension (.dtext → dtext side, .md → md side, .txt → both).
  const fixturePicker = $('fixture-picker') as HTMLSelectElement;
  populateFixturePicker(fixturePicker);
  fixturePicker.addEventListener('change', () => {
    const path = fixturePicker.value;
    if (!path) return;
    const raw = seedFixtures[path];
    if (typeof raw !== 'string') return;
    if (path.endsWith('.md')) {
      md.input.value = raw;
      debouncedMd();
    } else if (path.endsWith('.dtext')) {
      dtext.input.value = raw;
      debouncedDText();
    } else {
      dtext.input.value = raw;
      md.input.value = raw;
      debouncedDText();
      debouncedMd();
    }
  });

  // Sample picker: populates the matching side with a hand-picked snippet so
  // a fresh visitor sees every node type without typing.
  const samplePicker = $('sample-picker') as HTMLSelectElement;
  populateSamplePicker(samplePicker);
  samplePicker.addEventListener('change', () => {
    const id = samplePicker.value;
    if (!id) return;
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    if (sample.side === 'dtext') {
      dtext.input.value = sample.source;
      debouncedDText();
      if (linkInputs.checked) {
        md.input.value = sample.source;
        debouncedMd();
      }
    } else {
      md.input.value = sample.source;
      debouncedMd();
      if (linkInputs.checked) {
        dtext.input.value = sample.source;
        debouncedDText();
      }
    }
  });

  $('clear-button').addEventListener('click', () => {
    dtext.input.value = '';
    md.input.value = '';
    runDText(dtext, '');
    runMarkdown(md, '');
    fixturePicker.value = '';
    samplePicker.value = '';
  });

  // Initial render — both sides empty.
  runDText(dtext, '');
  runMarkdown(md, '');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
