// Link construction helpers shared by the dtext parser and the markdown
// adapter. Both pipelines feed the same rendered HTML and must agree on
// link-node shape down to the byte; the constructors here are the single
// source.
//
// Id-link metadata tables (`ID_PATTERNS`, `ID_DISPLAY`, `ID_ROUTES`,
// `ID_TYPE_MAP`, `ID_SOURCE`, plus the renderer's `ID_TYPE_CLASSES` and the
// `IdType` union in `./index`) are all keyed against `IdType`. Adding a new
// id type means an entry in each one; the exhaustive `Record<IdType, ...>`
// types make a missing entry a compile error, and the parser-side regex /
// map derive from `ID_PATTERNS`.
//
// `ID_SOURCE` is the canonical source spelling each `IdType` round-trips to
// via the formatters (see ADR-0001). It diverges from `ID_DISPLAY` for
// `thumb` (display says `post`, source is `thumb` so the parser preserves
// `idType: 'thumb'` on round-trip) and `bur` (display upcases to `BUR`,
// source stays `bur` because `ID_TYPE_MAP` is case-insensitive).

import type { IdType, LinkNode } from './index';
import { asciiLowercase, rubyUriEscape, rubyUriEscapeWithHash } from './text';

// Link-id prefix patterns and the canonical type each maps to. Patterns
// are regex source fragments (still escaped, e.g. `take\\s?down\\s+request`)
// the parser stitches together into a single alternation.
export const ID_PATTERNS: ReadonlyArray<{
  pattern: string;
  type: IdType;
}> = [
  { pattern: 'post', type: 'post' },
  { pattern: 'thumb', type: 'thumb' },
  { pattern: 'post changes', type: 'post_changes' },
  { pattern: 'flag', type: 'flag' },
  { pattern: 'note', type: 'note' },
  { pattern: 'forum', type: 'forum_post' },
  { pattern: 'topic', type: 'topic' },
  { pattern: 'comment', type: 'comment' },
  { pattern: 'pool', type: 'pool' },
  { pattern: 'user', type: 'user' },
  { pattern: 'artist', type: 'artist' },
  { pattern: 'ban', type: 'ban' },
  { pattern: 'bur', type: 'bur' },
  { pattern: 'alias', type: 'alias' },
  { pattern: 'implication', type: 'implication' },
  { pattern: 'mod action', type: 'mod_action' },
  { pattern: 'record', type: 'record' },
  { pattern: 'wiki', type: 'wiki' },
  { pattern: 'set', type: 'set' },
  { pattern: 'blip', type: 'blip' },
  { pattern: 'takedown', type: 'takedown' },
  { pattern: 'take down', type: 'takedown' },
  { pattern: 'take\\s?down request', type: 'takedown' },
  { pattern: 'ticket', type: 'ticket' },
];

// Canonical display form per id-type. Ruby renders the link text as
// "<canonical> #<id>" regardless of how the prefix was typed in the source.
// `Pool` and `POOL` both display as `pool`, `Take Down Request` collapses
// to `takedown`, and `bur` always upcases to `BUR`.
export const ID_DISPLAY: Record<IdType, string> = {
  post: 'post',
  thumb: 'post',
  post_changes: 'post changes',
  flag: 'flag',
  note: 'note',
  forum_post: 'forum',
  topic: 'topic',
  comment: 'comment',
  pool: 'pool',
  user: 'user',
  artist: 'artist',
  ban: 'ban',
  bur: 'BUR',
  alias: 'alias',
  implication: 'implication',
  mod_action: 'mod action',
  record: 'record',
  wiki: 'wiki',
  set: 'set',
  blip: 'blip',
  takedown: 'takedown',
  ticket: 'ticket',
};

// URL path prefix per id-type. The id is appended directly to the route
// string.
export const ID_ROUTES: Record<IdType, string> = {
  post: '/posts/',
  thumb: '/posts/',
  post_changes: '/post_versions?search[post_id]=',
  flag: '/post_flags/',
  note: '/notes/',
  forum_post: '/forum_posts/',
  topic: '/forum_topics/',
  comment: '/comments/',
  pool: '/pools/',
  user: '/users/',
  artist: '/artists/',
  ban: '/bans/',
  bur: '/bulk_update_requests/',
  alias: '/tag_aliases/',
  implication: '/tag_implications/',
  mod_action: '/mod_actions/',
  record: '/user_feedbacks/',
  wiki: '/wiki_pages/',
  set: '/post_sets/',
  blip: '/blips/',
  takedown: '/takedowns/',
  ticket: '/tickets/',
};

// Map from a normalised matched-prefix string to the id type it represents.
// Keys are lowercase with whitespace runs collapsed to a single space, so the
// regex metachars in `ID_PATTERNS` resolve to literal forms (`take\\s?down\\s+
// request` becomes `take down request`). The contracted "takedown request"
// alias is added explicitly; regex normalisation only touches patterns.
export const ID_TYPE_MAP: ReadonlyMap<string, IdType> = new Map([
  ...ID_PATTERNS.map(
    (p) =>
      [p.pattern.replace(/\\s[?+*]?/g, ' ').replace(/\s+/g, ' '), p.type] as [
        string,
        IdType,
      ],
  ),
  // alias for the contracted form of takedown request
  ['takedown request', 'takedown'],
]);

// Canonical source spelling per id-type, derived from `ID_PATTERNS` by
// taking the first pattern per type and literalising the regex-source
// escapes the same way `ID_TYPE_MAP` keys are normalised. Diverges from
// `ID_DISPLAY` for `thumb` and `bur`; see the header lockstep comment.
// Used by the formatters to reverse-emit `<source-prefix> #<id>` for
// `LinkNode { linkType: 'id_link' }`. See ADR-0001.
export const ID_SOURCE: Record<IdType, string> = (() => {
  const out = {} as Record<IdType, string>;
  for (const { pattern, type } of ID_PATTERNS) {
    if (out[type] !== undefined) continue;
    out[type] = pattern.replace(/\\s[?+*]?/g, ' ').replace(/\s+/g, ' ');
  }
  return out;
})();

// Construct an id-link `LinkNode` from a resolved id type and a numeric id.
// Pure: no parser state, no thumb-budget logic. Callers that want the
// over-limit thumb-rewrite (`thumb` past `maxThumbs` lowers to `post`) pass
// `'post'` themselves; this builder shapes the node only.
export function buildIdLink(type: IdType, id: string): LinkNode {
  const href = ID_ROUTES[type] + id;
  // Display text uses the canonical form for the id-type, not the raw
  // source. `Pool` becomes `pool`, `bur` upcases to `BUR`, the verbose
  // `take down request` collapses to `takedown` (verified against the
  // oracle). Thumbs piggyback on the post canonical name.
  const canonical = ID_DISPLAY[type] ?? type;
  const text = `${canonical} #${id}`;
  return {
    type: 'link',
    linkType: 'id_link',
    idType: type,
    id,
    href,
    children: [{ type: 'text', content: text }],
  };
}

// Input shape for `buildWikiLink`. The dtext parser's wiki-link matcher
// returns a structurally-identical object; the markdown adapter constructs
// one from its own token shape. Three optional fields:
//
//   - `tag`     wiki page name; empty string is the anchor-only form.
//   - `title`   display text override; absent means use a default derived
//               from `tag` and `anchor`.
//   - `anchor`  fragment after `#`. Presence is meaningful even when empty
//               (e.g. `[[abc#]]` must round-trip a trailing `#`).
export interface WikiLinkInput {
  tag: string;
  title?: string;
  anchor?: string;
}

// Construct a wiki-link `LinkNode` from a parsed input. Encodes the oracle's
// anchor / tag normalisation rules:
//
//   - In the href fragment, ASCII spaces become `_` before URI escaping
//     (verified: `[[wiki#a b c]]` -> `wiki#a_b_c`); other whitespace like
//     tab is left for `rubyUriEscape` to encode (`\t` -> `%09`).
//   - Embedded `#` characters in an anchor stay literal in the href (the
//     oracle does not encode them: `[[abc#x#y#z]]` -> `abc#x#y#z`).
//   - Display text preserves the original anchor as typed.
//   - The anchor-only form (`tag === ''`, anchor present) emits an in-page
//     fragment href instead of a wiki-page url.
export function buildWikiLink(input: WikiLinkInput): LinkNode {
  if (input.tag === '' && input.anchor !== undefined) {
    // Ragel anchor-only branch (`tag[0] == '#'`): append literal `#` then
    // `append_uri_escaped` of the rest with NO whitelist. Internal `#`
    // bytes inside the anchor encode to `%23`.
    const href = `#${rubyUriEscape(asciiLowercase(input.anchor.replace(/ /g, '_')))}`;
    const title = input.title ?? `#${input.anchor}`;
    return {
      type: 'link',
      linkType: 'wiki',
      href,
      anchor: input.anchor,
      children: [{ type: 'text', content: title }],
    };
  }

  // Ragel's `append_wiki_link` passes the ENTIRE `tag#anchor` string as the
  // single `normalized_tag` argument and then `append_uri_escaped` is called
  // with `'#'` as the whitelist. Every `#` byte in the combined string stays
  // literal — both the tag/anchor separator AND any internal `#` inside the
  // anchor (e.g. `[[abc#xyz#more]]` keeps every `#`).
  const normalizedTag = asciiLowercase(input.tag.replace(/ /g, '_'));
  let href = `/wiki_pages/show_or_new?title=${rubyUriEscapeWithHash(normalizedTag)}`;
  if (input.anchor !== undefined) {
    const normalizedAnchor = asciiLowercase(input.anchor.replace(/ /g, '_'));
    href += `#${rubyUriEscapeWithHash(normalizedAnchor)}`;
  }
  const title =
    input.title ??
    (input.anchor !== undefined ? `${input.tag}#${input.anchor}` : input.tag);
  return {
    type: 'link',
    linkType: 'wiki',
    href,
    anchor: input.anchor,
    children: [{ type: 'text', content: title }],
  };
}

// Input shape for `buildPostSearchLink`. The dtext side's tag-search match
// has the same fields. `tag` is the raw tag-list as typed (space-separated
// on the dtext side); the helper lowercases it for the href and stores the
// lowercased form in the AST node's `tags` field.
export interface PostSearchInput {
  tag: string;
  title?: string;
}

// Construct a `LinkNode` for a `{{tags}}` / `post search` reference. The
// dtext parser and the markdown adapter both call this so their AST nodes
// for the same source string are byte-identical.
export function buildPostSearchLink(input: PostSearchInput): LinkNode {
  const normalizedTag = asciiLowercase(input.tag);
  const href = `/posts?tags=${rubyUriEscape(normalizedTag)}`;
  const title = input.title || input.tag;
  return {
    type: 'link',
    linkType: 'post_search',
    tags: normalizedTag,
    href,
    children: [{ type: 'text', content: title }],
  };
}
