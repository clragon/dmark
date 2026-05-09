/// <reference types="vite/client" />

// Workbench bootstrapping. The architecture is "focused field is source of
// truth": typing in a textarea parses that side, drives the unified output
// surface (HTML, AST, diagnostics), and live-translates into the unfocused
// textarea. Switching focus to the other side retranslates from the current
// AST so the newly-focused field never holds stale text.
//
// One AST flows through the workbench at a time. The round-trip violation
// detector reparses the formatted output and deep-equals it against the
// source AST. A divergence with no explanatory diagnostics is a real
// round-trip-stability bug; with diagnostics, the divergence is documented
// and the banner reports it as a known-lossy round-trip.

import { parseDTextToAST, renderToHTML } from '@dmark/dtext';
import { formatDText } from '@dmark/dtext/render';
import { parseMarkdown, type ParseResult } from '@dmark/md/parse';
import { formatMarkdown } from '@dmark/md/render';
import type { Diagnostic } from '@dmark/diagnostics';
import type { ASTNode, DocumentNode } from '@dmark/ast';

import { renderAST, renderASTError } from './ast-tree';
import { SAMPLES } from './samples';

const DEBOUNCE_MS = 80;

// `corpus/seed/` is the small hand-picked set (currently empty save for
// `.gitkeep`); load eagerly because the bytes are negligible. `corpus/golden/`
// is the large db_export-derived set (51 entries today, real wiki pages,
// can be tens of KB each); load lazily so the dev bundle stays slim and the
// fetch only happens when a viewer picks one.
const seedFixtures = import.meta.glob<string>(
  '../../corpus/seed/*.{dtext,txt,md}',
  { query: '?raw', import: 'default', eager: true },
);
const goldenFixtures = import.meta.glob<string>(
  '../../corpus/golden/*.{dtext,txt,md}',
  { query: '?raw', import: 'default' },
);

type Side = 'dtext' | 'md';

type DiagnosticOrigin = 'parse' | 'format' | 'reparse';

interface TaggedDiagnostic {
  origin: DiagnosticOrigin;
  diagnostic: Diagnostic;
}

interface SideEls {
  source: HTMLElement;
  badge: HTMLElement;
  input: HTMLTextAreaElement;
  metaInput: HTMLElement;
}

interface OutputEls {
  status: HTMLElement;
  html: HTMLElement;
  ast: HTMLElement;
  diagnostics: HTMLUListElement;
  metaHtml: HTMLElement;
  metaAst: HTMLElement;
  metaDiagnostics: HTMLElement;
  banner: HTMLElement;
  bannerMessage: HTMLElement;
  bannerSourceAST: HTMLElement;
  bannerReparsedAST: HTMLElement;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing in index.html`);
  return el;
}

function getSideEls(side: Side): SideEls {
  return {
    source: $(`source-${side}`),
    badge: $(`badge-${side}`),
    input: $(`input-${side}`) as HTMLTextAreaElement,
    metaInput: $(`meta-${side}-input`),
  };
}

function getOutputEls(): OutputEls {
  return {
    status: $('pipeline-status'),
    html: $('html-output'),
    ast: $('ast-output'),
    diagnostics: $('diagnostics-output') as HTMLUListElement,
    metaHtml: $('meta-html'),
    metaAst: $('meta-ast'),
    metaDiagnostics: $('meta-diagnostics'),
    banner: $('violation-banner'),
    bannerMessage: $('violation-message'),
    bannerSourceAST: $('violation-ast-source'),
    bannerReparsedAST: $('violation-ast-reparsed'),
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

function timeMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
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

function renderDiagnostics(
  list: HTMLUListElement,
  entries: TaggedDiagnostic[],
): void {
  list.replaceChildren();
  for (const entry of entries) {
    const { diagnostic: d, origin } = entry;
    const li = document.createElement('li');
    const originSpan = document.createElement('span');
    originSpan.classList.add('diag-origin');
    originSpan.textContent = origin;
    const sev = document.createElement('span');
    sev.classList.add('severity', d.severity);
    sev.textContent = d.severity;
    const code = document.createElement('span');
    code.classList.add('diag-code');
    code.textContent = d.code;
    const msg = document.createElement('span');
    msg.textContent = d.message;
    li.append(originSpan, sev, code, msg);
    list.appendChild(li);
  }
}

function tagDiagnostics(
  origin: DiagnosticOrigin,
  diagnostics: Diagnostic[],
): TaggedDiagnostic[] {
  return diagnostics.map((diagnostic) => ({ origin, diagnostic }));
}

// Parse one side. Both sides share the AST shape (DocumentNode), so callers
// downstream don't need to know which parser produced it.
function parseSide(
  side: Side,
  input: string,
): { ast: DocumentNode; diagnostics: Diagnostic[] } {
  if (side === 'dtext') {
    const ast = parseDTextToAST(input) as DocumentNode;
    return { ast, diagnostics: [] };
  }
  const result: ParseResult = parseMarkdown(input);
  return { ast: result.document, diagnostics: result.diagnostics };
}

// Format an AST out to the *opposite* side's surface form. Returns the
// formatter's `{ output, diagnostics }` shape directly.
function formatTo(
  side: Side,
  ast: ASTNode,
): { output: string; diagnostics: Diagnostic[] } {
  return side === 'dtext' ? formatDText(ast) : formatMarkdown(ast);
}

// Stable structural compare. JSON.stringify is sufficient because every AST
// node is a plain object with a stable property set per `src/ast/index.ts`;
// we don't need referential equality and we're never comparing across
// serialisation boundaries.
function astEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface PipelineRun {
  ast: DocumentNode;
  html: string;
  parseDiagnostics: Diagnostic[];
  formatOutput: string;
  formatDiagnostics: Diagnostic[];
  reparsedAST: DocumentNode | null;
  reparseDiagnostics: Diagnostic[];
  reparseError: string | null;
  parseMs: number;
}

// Run the full source-side → AST → outputs → other-side pipeline on a piece
// of input. Throws only if the source-side parser throws (which `parseMarkdown`
// promises not to do, and `parseDTextToAST` does for malformed UTF or bugs).
function runPipeline(side: Side, input: string): PipelineRun {
  const t0 = timeMs();
  const { ast, diagnostics: parseDiagnostics } = parseSide(side, input);
  const html = renderToHTML(ast);
  const parseMs = timeMs() - t0;

  const otherSide: Side = side === 'dtext' ? 'md' : 'dtext';
  const formatted = formatTo(otherSide, ast);

  let reparsedAST: DocumentNode | null = null;
  let reparseDiagnostics: Diagnostic[] = [];
  let reparseError: string | null = null;
  try {
    const reparsed = parseSide(otherSide, formatted.output);
    reparsedAST = reparsed.ast;
    reparseDiagnostics = reparsed.diagnostics;
  } catch (e) {
    reparseError = e instanceof Error ? e.message : String(e);
  }

  return {
    ast,
    html,
    parseDiagnostics,
    formatOutput: formatted.output,
    formatDiagnostics: formatted.diagnostics,
    reparsedAST,
    reparseDiagnostics,
    reparseError,
    parseMs,
  };
}

// Workbench-level state. `currentSide` is the source of truth; `lastAST` is
// the AST produced by the most recent successful run on the source side and
// is what `re-translate on focus switch` reads.
const state: { currentSide: Side | null; lastAST: ASTNode | null } = {
  currentSide: null,
  lastAST: null,
};

const sideEls: Record<Side, SideEls> = {
  dtext: { source: null!, badge: null!, input: null!, metaInput: null! },
  md: { source: null!, badge: null!, input: null!, metaInput: null! },
};
let outputEls: OutputEls;

function setSourceBadges(): void {
  for (const side of ['dtext', 'md'] as const) {
    const isSource = state.currentSide === side;
    sideEls[side].source.classList.toggle('is-source', isSource);
    sideEls[side].badge.textContent = isSource ? 'source' : 'translation';
  }
}

function clearOutputs(message: string): void {
  outputEls.html.innerHTML = '';
  renderAST(outputEls.ast, null);
  renderDiagnostics(outputEls.diagnostics, []);
  outputEls.metaHtml.textContent = '';
  outputEls.metaAst.textContent = '';
  outputEls.metaDiagnostics.textContent = '0';
  setStatus(outputEls.status, 'idle', message);
  hideViolation();
}

function showViolation(
  message: string,
  sourceAST: ASTNode,
  reparsedAST: ASTNode | null,
): void {
  outputEls.banner.hidden = false;
  outputEls.bannerMessage.textContent = message;
  renderAST(outputEls.bannerSourceAST, sourceAST);
  if (reparsedAST) {
    renderAST(outputEls.bannerReparsedAST, reparsedAST);
  } else {
    renderASTError(outputEls.bannerReparsedAST, '(reparse failed)');
  }
}

function hideViolation(): void {
  outputEls.banner.hidden = true;
}

// Drive the unified output surface from a pipeline result. The renderer is
// idempotent on the same input, so a focus-switch re-run produces the same
// visible state when round-trip is honest.
function applyRun(side: Side, run: PipelineRun): void {
  outputEls.html.innerHTML = run.html;
  renderAST(outputEls.ast, run.ast);
  outputEls.metaHtml.textContent = `${run.html.length} chars`;
  outputEls.metaAst.textContent = `${countNodes(run.ast)} nodes`;

  const otherSide: Side = side === 'dtext' ? 'md' : 'dtext';
  // Programmatic textarea assignment does not fire 'input', so the live
  // translation does not loop back through the focused-side handler.
  sideEls[otherSide].input.value = run.formatOutput;
  sideEls[otherSide].metaInput.textContent = `${run.formatOutput.length} chars`;

  const merged: TaggedDiagnostic[] = [
    ...tagDiagnostics('parse', run.parseDiagnostics),
    ...tagDiagnostics('format', run.formatDiagnostics),
    // Reparse diagnostics are always tagged separately so the source of a
    // surprising entry is visible.
    ...tagDiagnostics('reparse', run.reparseDiagnostics),
  ];
  renderDiagnostics(outputEls.diagnostics, merged);
  outputEls.metaDiagnostics.textContent = `${merged.length}`;

  setStatus(
    outputEls.status,
    'ok',
    `parsed ${side} in ${run.parseMs.toFixed(1)}ms`,
  );

  // Round-trip violation detection. Two failure modes:
  //
  //   1. Reparse threw — the formatter produced output the inverse parser
  //      could not consume. Always a real bug.
  //   2. ASTs differ. If the formatter emitted *any* warning/info diagnostic,
  //      the divergence is documented (per Q-MD-LTABLE-EMIT,
  //      Q-MD-DTEXT-SALVAGE, Q-MD-TABLE-MULTILINE, Q-MD-QUOTE-COLOR's
  //      future md.quote_color_dropped — though path 4 retired that one).
  //      A divergence without a diagnostic is the real-bug case.
  //
  // Either case pops the banner; the message names the kind so the reader
  // can tell at a glance whether to act.
  if (run.reparseError) {
    showViolation(
      `Round-trip reparse failed: ${run.reparseError}`,
      run.ast,
      null,
    );
    return;
  }
  if (!astEqual(run.ast, run.reparsedAST)) {
    const formatHasDiagnostics = run.formatDiagnostics.length > 0;
    if (formatHasDiagnostics) {
      showViolation(
        'AST diverged on round-trip; see formatter diagnostics for the documented loss.',
        run.ast,
        run.reparsedAST,
      );
    } else {
      showViolation(
        'AST diverged on round-trip with no formatter diagnostic — likely a real round-trip-stability bug.',
        run.ast,
        run.reparsedAST,
      );
    }
    return;
  }
  hideViolation();
}

function applyError(side: Side, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  outputEls.html.innerHTML = '';
  renderASTError(outputEls.ast, msg);
  outputEls.metaHtml.textContent = '';
  outputEls.metaAst.textContent = '';
  renderDiagnostics(outputEls.diagnostics, []);
  outputEls.metaDiagnostics.textContent = '0';
  setStatus(outputEls.status, 'error', `${side} parse error`);
  hideViolation();
}

function processSourceInput(side: Side, value: string): void {
  sideEls[side].metaInput.textContent = `${value.length} chars`;
  if (!value) {
    state.lastAST = null;
    // Both sides should appear empty, including the unfocused translation.
    const otherSide: Side = side === 'dtext' ? 'md' : 'dtext';
    sideEls[otherSide].input.value = '';
    sideEls[otherSide].metaInput.textContent = '0 chars';
    clearOutputs('idle');
    return;
  }
  try {
    const run = runPipeline(side, value);
    state.lastAST = run.ast;
    applyRun(side, run);
  } catch (e) {
    state.lastAST = null;
    applyError(side, e);
  }
}

// On focus switch: regenerate the newly-focused side's text from `lastAST`
// (the AST of the previously-focused side), then re-run the pipeline as if
// the user had typed the regenerated text. This is the "ignore unfocused
// content" rule — whatever was sitting in the field gets replaced.
function adoptFocus(side: Side): void {
  if (state.currentSide === side) return;
  state.currentSide = side;
  setSourceBadges();
  if (state.lastAST === null) {
    // No previous truth — just process whatever the user has typed so far,
    // which the input handler will do anyway. Nothing to retranslate.
    processSourceInput(side, sideEls[side].input.value);
    return;
  }
  // Format the latest AST onto the newly-focused side and replace its text.
  // The formatter throws only on programmer error; a thrown formatter is a
  // real bug and we surface it as a parse-error-style state.
  let text: string;
  try {
    text = formatTo(side, state.lastAST).output;
  } catch (e) {
    applyError(side, e);
    return;
  }
  sideEls[side].input.value = text;
  processSourceInput(side, text);
}

// Keep both textareas the same height. The native `resize: vertical` handle
// sets an inline height on the dragged textarea; ResizeObserver mirrors the
// resulting height to its sibling. The early-exit when heights already match
// breaks the otherwise-symmetric A→B→A→… update cycle. CSS-only mirrors via
// `flex: 1` fight the resize handle (the flex basis preempts the inline
// height set by the drag), so the JS mirror is the cleaner path.
function syncTextareaHeights(
  a: HTMLTextAreaElement,
  b: HTMLTextAreaElement,
): void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const source = entry.target as HTMLTextAreaElement;
      const target = source === a ? b : a;
      const sourceHeight = source.getBoundingClientRect().height;
      const targetHeight = target.getBoundingClientRect().height;
      if (Math.abs(sourceHeight - targetHeight) < 1) continue;
      target.style.height = `${sourceHeight}px`;
    }
  });
  observer.observe(a);
  observer.observe(b);
}

function init(): void {
  sideEls.dtext = getSideEls('dtext');
  sideEls.md = getSideEls('md');
  outputEls = getOutputEls();

  syncTextareaHeights(sideEls.dtext.input, sideEls.md.input);

  const debounced: Record<Side, () => void> = {
    dtext: debounce(
      () => processSourceInput('dtext', sideEls.dtext.input.value),
      DEBOUNCE_MS,
    ),
    md: debounce(
      () => processSourceInput('md', sideEls.md.input.value),
      DEBOUNCE_MS,
    ),
  };

  for (const side of ['dtext', 'md'] as const) {
    sideEls[side].input.addEventListener('focus', () => adoptFocus(side));
    sideEls[side].input.addEventListener('input', () => {
      // Typing implies focus already, but defensive: ensure the side that
      // received the input is the source side regardless of focus order.
      if (state.currentSide !== side) {
        state.currentSide = side;
        setSourceBadges();
      }
      debounced[side]();
    });
  }

  // Fixture picker: load raw text into the side that matches the file
  // extension and treat that side as if focused. Seed entries resolve
  // synchronously (eager load); golden entries resolve via dynamic import.
  const fixturePicker = $('fixture-picker') as HTMLSelectElement;
  populateFixturePicker(fixturePicker);
  fixturePicker.addEventListener('change', async () => {
    const path = fixturePicker.value;
    if (!path) return;
    let raw: string | undefined;
    if (path in seedFixtures) {
      raw = seedFixtures[path];
    } else if (path in goldenFixtures) {
      raw = await goldenFixtures[path]!();
    }
    if (typeof raw !== 'string') return;
    const target: Side = path.endsWith('.md') ? 'md' : 'dtext';
    sideEls[target].input.value = raw;
    sideEls[target].input.focus();
    state.currentSide = target;
    setSourceBadges();
    processSourceInput(target, raw);
  });

  const samplePicker = $('sample-picker') as HTMLSelectElement;
  populateSamplePicker(samplePicker);
  samplePicker.addEventListener('change', () => {
    const id = samplePicker.value;
    if (!id) return;
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    sideEls[sample.side].input.value = sample.source;
    sideEls[sample.side].input.focus();
    state.currentSide = sample.side;
    setSourceBadges();
    processSourceInput(sample.side, sample.source);
  });

  $('clear-button').addEventListener('click', () => {
    sideEls.dtext.input.value = '';
    sideEls.md.input.value = '';
    sideEls.dtext.metaInput.textContent = '0 chars';
    sideEls.md.metaInput.textContent = '0 chars';
    state.lastAST = null;
    state.currentSide = null;
    setSourceBadges();
    clearOutputs('idle');
    fixturePicker.value = '';
    samplePicker.value = '';
  });

  setSourceBadges();
  clearOutputs('idle');

  // Browsers restore textarea contents across reloads. If either side has
  // content from a previous session, treat it as the source and render
  // immediately so the viewer doesn't see a blank output column on a
  // restored-state reload. Prefer dtext if both sides have content (they
  // should be translation-equivalent, so the choice is cosmetic — the
  // unfocused side will retranslate on focus switch anyway).
  const restoredSide: Side | null = sideEls.dtext.input.value
    ? 'dtext'
    : sideEls.md.input.value
      ? 'md'
      : null;
  if (restoredSide) {
    state.currentSide = restoredSide;
    setSourceBadges();
    processSourceInput(restoredSide, sideEls[restoredSide].input.value);
  }
}

function populateFixturePicker(select: HTMLSelectElement): void {
  appendFixtureGroup(select, 'seed', seedFixtures, /^.*corpus\/seed\//);
  appendFixtureGroup(select, 'golden', goldenFixtures, /^.*corpus\/golden\//);
  if (
    Object.keys(seedFixtures).length === 0 &&
    Object.keys(goldenFixtures).length === 0
  ) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(no fixtures; run `yarn corpus:fetch`)';
    opt.disabled = true;
    select.appendChild(opt);
  }
}

function appendFixtureGroup(
  select: HTMLSelectElement,
  label: string,
  fixtures: Record<string, unknown>,
  pathStrip: RegExp,
): void {
  const paths = Object.keys(fixtures).sort();
  if (paths.length === 0) return;
  const group = document.createElement('optgroup');
  group.label = `${label} (${paths.length})`;
  for (const path of paths) {
    const opt = document.createElement('option');
    opt.value = path;
    opt.textContent = path.replace(pathStrip, '');
    group.appendChild(opt);
  }
  select.appendChild(group);
}

function populateSamplePicker(select: HTMLSelectElement): void {
  for (const sample of SAMPLES) {
    const opt = document.createElement('option');
    opt.value = sample.id;
    opt.textContent = sample.label;
    select.appendChild(opt);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
