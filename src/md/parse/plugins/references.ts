// Reference plugins: `[[wikilink]]`, `{{tag search}}`, `[#anchor]`.
// Three atomic reference rules sharing one file. Each emits a single
// self-closing token whose attrs carry the already-parsed pieces; the
// adapter walker hands off to shared builders in `ast/links` so the
// produced AST matches the dtext side. See `docs/mapping.md`.

import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const HASH = 0x23;
const NEWLINE = 0x0a;

// `[[tag]]`, `[[tag|title]]`, `[[tag#anchor]]`, `[[tag#anchor|title]]`,
// `[[#anchor]]`. Title (after `|`) and anchor (after `#` but before `|`)
// are both optional. Empty tag is the anchor-only form. Empty anchor is
// distinguishable from absent: `[[abc#]]` keeps the trailing `#` in the
// rendered href, per the dtext oracle.
function wikilinkInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 4 > max) return false;
  const src = state.src;
  if (
    src.charCodeAt(start) !== OPEN_BRACKET ||
    src.charCodeAt(start + 1) !== OPEN_BRACKET
  ) {
    return false;
  }

  let closePos = -1;
  for (let i = start + 2; i + 1 < max; i++) {
    if (src.charCodeAt(i) === NEWLINE) return false;
    if (
      src.charCodeAt(i) === CLOSE_BRACKET &&
      src.charCodeAt(i + 1) === CLOSE_BRACKET
    ) {
      closePos = i;
      break;
    }
  }
  if (closePos === -1) return false;

  const inner = src.slice(start + 2, closePos);
  let tag = inner;
  let title: string | undefined;
  let anchor: string | undefined;

  const pipePos = tag.indexOf('|');
  if (pipePos !== -1) {
    title = tag.slice(pipePos + 1);
    tag = tag.slice(0, pipePos);
  }
  const hashPos = tag.indexOf('#');
  if (hashPos !== -1) {
    anchor = tag.slice(hashPos + 1);
    tag = tag.slice(0, hashPos);
  }

  if (silent) return true;

  const tok = state.push('wikilink', '', 0);
  tok.attrSet('tag', tag);
  if (title !== undefined) tok.attrSet('title', title);
  if (anchor !== undefined) tok.attrSet('anchor', anchor);
  state.pos = closePos + 2;
  return true;
}

// `{{tags}}`, `{{tags|title}}`. Tags are space-separated; `buildPostSearchLink`
// lowercases them for the href and stores the lowercased form as `tags`.
function tagSearchInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 4 > max) return false;
  const src = state.src;
  if (
    src.charCodeAt(start) !== OPEN_BRACE ||
    src.charCodeAt(start + 1) !== OPEN_BRACE
  ) {
    return false;
  }

  let closePos = -1;
  for (let i = start + 2; i + 1 < max; i++) {
    if (src.charCodeAt(i) === NEWLINE) return false;
    if (
      src.charCodeAt(i) === CLOSE_BRACE &&
      src.charCodeAt(i + 1) === CLOSE_BRACE
    ) {
      closePos = i;
      break;
    }
  }
  if (closePos === -1) return false;

  const inner = src.slice(start + 2, closePos);
  let tag = inner;
  let title: string | undefined;
  const pipePos = inner.indexOf('|');
  if (pipePos !== -1) {
    tag = inner.slice(0, pipePos);
    title = inner.slice(pipePos + 1);
  }

  if (silent) return true;

  const tok = state.push('tag_search', '', 0);
  tok.attrSet('tag', tag);
  if (title !== undefined) tok.attrSet('title', title);
  state.pos = closePos + 2;
  return true;
}

// `[#name]`. Definition (jump target), not a reference. Single bracket so
// it does not collide with wikilink (`[[`) or BBCode (`[sup]`). The name
// terminates at the closing `]`; whitespace is rejected to avoid eating
// markdown link-text spans like `[#1 in line]`.
function internalAnchorInline(
  state: StateInline,
  silent: boolean,
): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 3 > max) return false;
  const src = state.src;
  if (
    src.charCodeAt(start) !== OPEN_BRACKET ||
    src.charCodeAt(start + 1) !== HASH
  ) {
    return false;
  }

  let closePos = -1;
  for (let i = start + 2; i < max; i++) {
    const c = src.charCodeAt(i);
    if (c === CLOSE_BRACKET) {
      closePos = i;
      break;
    }
    if (c === 0x20 || c === 0x09 || c === NEWLINE) return false;
  }
  if (closePos === -1 || closePos === start + 2) return false;

  if (silent) return true;

  const tok = state.push('internal_anchor_def', '', 0);
  tok.attrSet('name', src.slice(start + 2, closePos));
  state.pos = closePos + 1;
  return true;
}

export function referencesPlugin(md: MarkdownIt): void {
  // Wikilink first (most specific `[[`), then internal anchor (`[#`), then
  // standard link rule. Tag search (`{{`) is independent of the bracket
  // family but registers under the same plugin for cohesion; order vs the
  // standard rules does not matter for `{` since no other rule claims it.
  md.inline.ruler.before('link', 'wikilink', wikilinkInline);
  md.inline.ruler.before('link', 'internal_anchor', internalAnchorInline);
  md.inline.ruler.before('link', 'tag_search', tagSearchInline);
}
