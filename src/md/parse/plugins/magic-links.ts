// Magic-link core post-process. Free-form patterns like `post #1234`,
// `pool #5`, `take down request #99` lower to `LinkNode { linkType:
// "id_link", idType, id, ... }`. Implemented as a `markdown-it` core rule
// that runs after inline tokenisation: it walks every inline `text`
// token, splits it on magic-link matches, and replaces it with a sequence
// of `text` and `id_link` tokens.
//
// Why a core rule and not an inline rule: the patterns are mid-text
// (e.g. "see post #42 for context"), not anchored at a delimiter the
// inline parser would yield to. Post-processing already-tokenised text is
// the same approach `markdown-it`'s built-in `linkify` rule uses for bare
// URLs.
//
// All metadata (`ID_PATTERNS`, `ID_TYPE_MAP`) is imported from
// `@dmark/ast/links` so the dtext parser and this plugin stay in lockstep
// on which prefixes mint links and what types they map to.

import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';

import { ID_PATTERNS, ID_TYPE_MAP } from '../../../ast/links';

// Combined alternation of every prefix pattern, with `\b` boundaries so
// matches only fire on whole-word transitions and an `\s+#(\d+)` tail to
// capture the numeric id. Built once at module load; the regex is cloned
// per match loop because `exec` with the `g` flag carries `lastIndex`
// state.
const PATTERN_SOURCE =
  '\\b(' +
  ID_PATTERNS.map((p) => p.pattern).join('|') +
  ')\\s+#(\\d+)\\b';

interface MagicMatch {
  start: number;
  end: number;
  idType: string;
  id: string;
}

function findMagicLinks(text: string): MagicMatch[] {
  const re = new RegExp(PATTERN_SOURCE, 'gi');
  const matches: MagicMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const prefix = m[1]!.toLowerCase().replace(/\s+/g, ' ');
    const idType = ID_TYPE_MAP.get(prefix);
    if (!idType) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      idType,
      id: m[2]!,
    });
  }
  return matches;
}

// Replace one `text` token with a sequence of `text` and `id_link` tokens
// reflecting the matches found in its content. If no matches are present
// the original token is returned unchanged.
function splitTextToken(
  textTok: Token,
  state: StateCore,
): Token[] {
  const matches = findMagicLinks(textTok.content);
  if (matches.length === 0) return [textTok];

  const out: Token[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      const t = new state.Token('text', '', 0);
      t.content = textTok.content.slice(cursor, match.start);
      out.push(t);
    }
    const t = new state.Token('id_link', '', 0);
    t.attrSet('idType', match.idType);
    t.attrSet('id', match.id);
    out.push(t);
    cursor = match.end;
  }
  if (cursor < textTok.content.length) {
    const t = new state.Token('text', '', 0);
    t.content = textTok.content.slice(cursor);
    out.push(t);
  }
  return out;
}

function magicLinksCore(state: StateCore): void {
  for (const blockTok of state.tokens) {
    if (blockTok.type !== 'inline' || !blockTok.children) continue;
    const next: Token[] = [];
    for (const inlineTok of blockTok.children) {
      if (inlineTok.type !== 'text') {
        next.push(inlineTok);
        continue;
      }
      next.push(...splitTextToken(inlineTok, state));
    }
    blockTok.children = next;
  }
}

export function magicLinksPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'magic_links', magicLinksCore);
}
