// Shared evil-parser-destroyer test cases. Each entry is one adversarial
// input. Test files split this list into chunks so the oracle cache stays
// within a single worker's heap.

export interface Case {
  name: string;
  input: string;
  /** Both oracle (snake_case under the hood) and dmark (camelCase) get
      equivalent options. Both sides default to allowColor: true. */
  allowColor?: boolean;
  maxThumbs?: number;
}

export const cases: Case[] = [
  // URL trim boundaries
  { name: 'url with trailing dot', input: 'see https://example.com. yes' },
  { name: 'url with trailing two dots', input: 'see https://example.com.. yes' },
  { name: 'url with trailing ellipsis', input: 'see https://example.com... yes' },
  { name: 'url with trailing closing paren', input: 'see https://example.com/a) yes' },
  { name: 'url with trailing paren-comma', input: 'see https://example.com/a), yes' },
  { name: 'url with trailing question mark', input: 'see https://example.com? yes' },
  { name: 'url with trailing exclamation', input: 'see https://example.com! yes' },
  { name: 'url with trailing semicolon', input: 'see https://example.com; yes' },
  { name: 'url with trailing colon', input: 'see https://example.com: yes' },
  { name: 'url with trailing right-bracket', input: 'see https://example.com/a] yes' },
  { name: 'url with trailing right-brace', input: 'see https://example.com/a} yes' },

  // Color edges
  { name: 'color short hex', input: '[color=#abc]x[/color]', allowColor: true },
  { name: 'color uppercase hex', input: '[color=#ABCDEF]x[/color]', allowColor: true },
  { name: 'color mixed-case CSS name', input: '[color=Red]x[/color]', allowColor: true },
  { name: 'color uppercase artist alias', input: '[color=ART]x[/color]', allowColor: true },
  { name: 'color full uppercase artist alias', input: '[color=ARTIST]x[/color]', allowColor: true },
  { name: 'color invalid 7-digit hex', input: '[color=#1234567]x[/color]', allowColor: true },
  { name: 'color empty value', input: '[color=]x[/color]', allowColor: true },
  { name: 'color disabled with allowColor false', input: '[color=red]x[/color]', allowColor: false },

  // Sup/sub nesting cap
  { name: 'sup nested 4 deep', input: '[sup][sup][sup][sup]x[/sup][/sup][/sup][/sup]' },
  { name: 'interleaved sub/sup 4 deep', input: '[sub][sup][sub][sup]x[/sup][/sub][/sup][/sub]' },

  // Stray closes
  { name: 'stray quote close', input: 'before [/quote] after' },
  { name: 'stray section close', input: 'before [/section] after' },
  { name: 'stray spoiler close', input: 'before [/spoiler] after' },
  { name: 'stray b close', input: 'before [/b] after' },
  { name: 'stray i close', input: 'before [/i] after' },

  // Overlapping inline tags
  { name: 'overlapping bold-italic close order', input: '[b][i]hi[/b][/i]' },
  { name: 'overlapping italic-bold close order', input: '[i][b]hi[/i][/b]' },

  // Unclosed openers
  { name: 'unclosed bold', input: '[b]bold without end' },
  { name: 'unclosed italic', input: '[i]ital without end' },
  { name: 'unclosed quote', input: '[quote]quote without end' },
  { name: 'unclosed code', input: '[code]code without end' },
  { name: 'unclosed section', input: '[section]section without end' },

  // Code block with markup
  { name: 'code block with bold', input: '[code][b]bold[/b][/code]' },
  { name: 'code block with html-like', input: '[code]<script>alert("x")</script>[/code]' },
  { name: 'code block with backticks', input: '[code]`inline`[/code]' },

  // ID link edges
  { name: 'post id with leading zeros', input: 'post #00001' },
  { name: 'post id with trailing dot', input: 'see post #1234.' },
  { name: 'post id capitalized prefix', input: 'Post #1234' },
  { name: 'post id no space', input: 'post#1234' },
  { name: 'pool id non-numeric', input: 'pool #abc' },
  { name: 'pool id huge number', input: 'pool #999999999999999999' },
  { name: 'comment id with comma after', input: 'see comment #42, ok' },

  // Wiki link edges
  { name: 'wiki link whitespace only', input: '[[ ]]' },
  { name: 'wiki link empty title side', input: '[[wiki|]]' },
  { name: 'wiki link empty target side', input: '[[|title]]' },
  { name: 'wiki link multiple pipes', input: '[[wiki|title|extra]]' },
  { name: 'wiki link unicode key', input: '[[Ōmukade]]' },
  { name: 'wiki link uppercase ascii', input: '[[Foo Bar]]' },
  { name: 'wiki link with anchor and title', input: '[[wiki#anchor|Display]]' },
  { name: 'wiki link anchor with space', input: '[[wiki#some anchor]]' },
  { name: 'wiki link with html-like content', input: '[[<script>]]' },

  // Header edges
  { name: 'header empty body', input: 'h1.\n' },
  { name: 'header invalid level seven', input: 'h7. nope\n' },
  { name: 'header no space after dot', input: 'h1.no_space\n' },
  { name: 'header indented one space', input: ' h1. indented\n' },
  { name: 'header back-to-back', input: 'h1. one\nh2. two\n' },

  // Quote edges
  { name: 'quote nested', input: '[quote][quote]inner[/quote][/quote]' },
  { name: 'quote with attribute', input: '[quote=Author]hi[/quote]' },

  // Section edges
  { name: 'section empty body', input: '[section][/section]' },
  // section-collapsed and section-empty-title hang the parser (heap-bomb /
  // infinite loop). They are wins in find-bombs.mjs but excluded from the
  // vitest suite so the worker stays alive for everyone else.

  // Spoiler edges
  { name: 'spoiler block empty', input: '[spoiler]\n[/spoiler]' },
  { name: 'spoiler with html-like content', input: '[spoiler]<x>[/spoiler]' },

  // List edges
  { name: 'list item without space', input: '*x\n*y\n' },
  { name: 'list with blank line between', input: '* a\n\n* b\n' },
  { name: 'list deeply nested triple', input: '*** deep one\n*** deep two\n' },
  { name: 'list with inline format', input: '* item with [b]bold[/b]\n* plain\n' },

  // Anchors
  { name: 'anchor uppercase', input: '[#UPPER_anchor]' },
  { name: 'anchor with dashes', input: '[#with-dashes]' },
  { name: 'anchor unicode', input: '[#中文]' },

  // Textile links
  { name: 'textile link bare hostname', input: '"link":example.com' },
  { name: 'textile link with trailing dot', input: '"link":https://example.com.' },
  { name: 'textile link bracketed with space', input: '"link":[/path with space]' },
  { name: 'textile link empty title', input: '"":https://example.com' },
  { name: 'textile link no url', input: '"link":' },
  { name: 'textile relative link', input: '"users":/users' },

  // Tables
  { name: 'table empty', input: '[table][/table]' },
  { name: 'table loose newlines', input: '[table]\n[tr]\n[td]cell[/td]\n[/tr]\n[/table]' },

  // Mixed / chained
  { name: 'header followed by quote', input: 'h1. title\n[quote]q[/quote]' },
  { name: 'header without trailing newline', input: 'h1. title' },
  { name: 'paragraph crlf split', input: 'hello\r\n\r\nworld' },
  { name: 'just newlines only', input: '\n\n\n' },
  { name: 'inline opens at doc start', input: '[b]start[/b] then text' },
  { name: 'tab indented paragraph', input: '\thello world' },

  // Misc evil
  { name: 'empty bold', input: '[b][/b]' },
  { name: 'double-nested same tag bold', input: '[b][b]double[/b][/b]' },
  { name: 'backslash escaped tag brackets', input: '\\[b\\]not bold\\[/b\\]' },
  { name: 'backtick escape only', input: '\\`' },
  { name: 'literal slash close', input: '[/]' },
  { name: 'lt gt entities only', input: '<not a tag>' },
  { name: 'ampersand alone', input: 'A & B' },
  { name: 'numeric entity literal', input: '&amp; literal' },

  // Internal anchor placement
  { name: 'anchor mid-paragraph', input: 'before [#mid] after' },
  { name: 'anchor doubled', input: '[#a][#b]' },

  // Boundary char URL trims
  { name: 'url right-paren full-width trim', input: 'see https://example.com／a） yes' },

  // ===== Wave 2: amplify proven divergence patterns =====

  // Invalid color values (oracle treats as literal text)
  { name: 'color uppercase css name BLUE', input: '[color=BLUE]x[/color]', allowColor: true },
  { name: 'color camelcase css name', input: '[color=DarkRed]x[/color]', allowColor: true },
  { name: 'color hex 4 digits', input: '[color=#abcd]x[/color]', allowColor: true },
  { name: 'color hex 5 digits', input: '[color=#abcde]x[/color]', allowColor: true },
  { name: 'color hex with non-hex chars', input: '[color=#xyzxyz]x[/color]', allowColor: true },
  { name: 'color hex 3 with non-hex', input: '[color=#abG]x[/color]', allowColor: true },
  { name: 'color hex empty after hash', input: '[color=#]x[/color]', allowColor: true },
  { name: 'color name with trailing space', input: '[color=red ]x[/color]', allowColor: true },
  { name: 'color name with leading space', input: '[color= red]x[/color]', allowColor: true },
  { name: 'color name with digits', input: '[color=red123]x[/color]', allowColor: true },
  { name: 'color name with underscore', input: '[color=hot_pink]x[/color]', allowColor: true },
  { name: 'color hex no hash', input: '[color=ff0000]x[/color]', allowColor: true },

  // Capitalized ID-link prefixes (oracle lowercases display text)
  { name: 'id link Pool', input: 'Pool #1234' },
  { name: 'id link Topic', input: 'Topic #1234' },
  { name: 'id link Comment', input: 'Comment #1234' },
  { name: 'id link Note', input: 'Note #1234' },
  { name: 'id link Set', input: 'Set #1234' },
  { name: 'id link Ticket', input: 'Ticket #1234' },
  { name: 'id link Blip', input: 'Blip #1234' },
  { name: 'id link Flag', input: 'Flag #1234' },
  { name: 'id link POST all caps', input: 'POST #1234' },
  { name: 'id link MiXeD post', input: 'pOsT #1234' },

  // No-space ID variants (oracle treats as literal text)
  { name: 'id no-space pool', input: 'pool#1234' },
  { name: 'id no-space topic', input: 'topic#1234' },
  { name: 'id no-space comment', input: 'comment#1234' },
  { name: 'id no-space note', input: 'note#1234' },
  { name: 'id no-space set', input: 'set#1234' },
  { name: 'id no-space ticket', input: 'ticket#1234' },
  { name: 'id no-space forum', input: 'forum#1234' },

  // Wiki link malformed (oracle keeps literal)
  { name: 'wiki link totally empty', input: '[[]]' },
  { name: 'wiki link just pipes', input: '[[||]]' },
  { name: 'wiki link empty middle', input: '[[a||b]]' },
  { name: 'wiki link space before pipe', input: '[[wiki |title]]' },
  { name: 'wiki link triple pipe', input: '[[wiki|t|u|v]]' },
  { name: 'wiki link pipe-only', input: '[[|]]' },

  // Wiki anchor with whitespace (oracle uses _ in href)
  { name: 'wiki anchor multi-word', input: '[[wiki#a b c]]' },
  { name: 'wiki anchor with title and space', input: '[[wiki#some anchor|Display]]' },
  { name: 'wiki anchor with tabs', input: '[[wiki#a\tb]]' },

  // Textile bracketed link with space (oracle leaves literal)
  { name: 'textile bracketed url with space middle', input: '"link":[/foo bar]' },
  { name: 'textile bracketed url with multiple spaces', input: '"link":[/foo  bar]' },
  { name: 'textile bracketed http with space', input: '"link":[https://e.com/foo bar]' },
  { name: 'textile bracketed leading space', input: '"link":[ /path]' },
  { name: 'textile bracketed trailing space', input: '"link":[/path ]' },

  // Stray block-close after content (proven pattern: spoiler split)
  { name: 'stray spoiler close mid-text', input: 'hello [/spoiler] world' },
  { name: 'stray spoiler close start of doc', input: '[/spoiler] alone at start' },
  { name: 'stray spoiler close after format', input: '[b]bold[/b] [/spoiler] more' },

  // Unclosed code variants (oracle keeps everything inside)
  { name: 'unclosed code with multiline', input: '[code]line one\nline two and end' },
  { name: 'unclosed code with bracket close', input: '[code]some]end' },
  { name: 'unclosed code with newlines', input: '[code]\nfirst\nsecond' },

  // ===== Wave 3: more ID prefixes (caps and no-space) =====

  { name: 'id link User', input: 'User #1234' },
  { name: 'id link Artist', input: 'Artist #1234' },
  { name: 'id link Ban', input: 'Ban #1234' },
  { name: 'id link Bur', input: 'Bur #1234' },
  { name: 'id link Alias', input: 'Alias #1234' },
  { name: 'id link Implication', input: 'Implication #1234' },
  { name: 'id link Record', input: 'Record #4321' },
  { name: 'id link Forum', input: 'Forum #1234' },
  { name: 'id link Takedown', input: 'Takedown #1234' },
  { name: 'id link Wiki', input: 'Wiki #1234' },

  { name: 'id no-space user', input: 'user#1234' },
  { name: 'id no-space artist', input: 'artist#1234' },
  { name: 'id no-space ban', input: 'ban#1234' },
  { name: 'id no-space alias', input: 'alias#1234' },
  { name: 'id no-space implication', input: 'implication#1234' },
  { name: 'id no-space record', input: 'record#4321' },
  { name: 'id no-space takedown', input: 'takedown#1234' },
  { name: 'id no-space wiki', input: 'wiki#1234' },
  { name: 'id no-space blip', input: 'blip#1234' },
  { name: 'id no-space flag', input: 'flag#1234' },

  // Multi-word ID prefixes
  { name: 'id link Mod Action', input: 'Mod Action #1234' },
  { name: 'id link MOD ACTION', input: 'MOD ACTION #1234' },
  { name: 'id link Post Changes', input: 'Post Changes #1234' },
  { name: 'id link Take Down Request', input: 'Take Down Request #1234' },

  // ===== Wave 4: textile & wiki extras =====

  { name: 'textile bracketed url with tab', input: '"link":[/path\twith\ttab]' },
  { name: 'textile bracketed empty url', input: '"link":[]' },
  { name: 'textile bracketed only space', input: '"link":[ ]' },
  { name: 'textile bracketed nested brackets', input: '"link":[/a[b]c]' },

  { name: 'wiki anchor with multiple inner spaces', input: '[[t#one two three]]' },
  { name: 'wiki anchor with mixed-case spaces', input: '[[T#Some Long Anchor]]' },

  // ===== Wave 5: stray spoiler diversity =====

  { name: 'stray spoiler twice', input: 'a [/spoiler] b [/spoiler] c' },
  { name: 'stray spoiler with newlines', input: 'before\n[/spoiler]\nafter' },
  { name: 'stray spoiler in list item', input: '* item [/spoiler] text\n' },
  { name: 'stray spoiler before period', input: 'word[/spoiler]. end' },

  // ===== Wave 6: unclosed code amplifications =====

  { name: 'unclosed code empty', input: '[code]' },
  { name: 'unclosed code one char', input: '[code]x' },
  { name: 'unclosed code with tag-like', input: '[code]ab[def]ghi' },

  // ===== Wave 7: combined attacks =====

  { name: 'two caps id prefixes one line', input: 'Post #1 and Topic #2' },
  { name: 'two no-space ids one line', input: 'pool#1 topic#2' },
  { name: 'caps and no-space mixed', input: 'Post #1 then pool#2' },
  { name: 'three no-space ids', input: 'pool#1 topic#2 comment#3' },

  { name: 'invalid color wrapping bold', input: '[color=Red][b]bold[/b][/color]', allowColor: true },
  { name: 'invalid color hex wrapping italic', input: '[color=#1234567][i]ital[/i][/color]', allowColor: true },
  { name: 'mixed-case color closer', input: '[color=valid_invalid]x[/color]', allowColor: true },

  { name: 'two stray spoilers split', input: 'a [/spoiler] b\n\nc [/spoiler] d' },
  { name: 'two unclosed codes attempt', input: '[code]first[code]second' },

  // ID with weird boundaries
  { name: 'id link followed by letter', input: 'post #1234abc' },
  { name: 'id link followed by hyphen', input: 'post #1234-x' },
  { name: 'id link with double hash', input: 'post ##1234' },
  { name: 'id link decimal', input: 'post #1.5' },

  // Wiki special chars
  { name: 'wiki link with hash nested', input: '[[abc#xyz#more]]' },
  { name: 'wiki link with percent encoded space', input: '[[a%20b]]' },
  { name: 'wiki link trailing hash', input: '[[abc#]]' },
  { name: 'wiki link with quote', input: '[[a"b]]' },

  // Section with title using uppercase
  { name: 'section uppercase tag', input: '[SECTION]hi[/SECTION]' },

  // Spoiler stray with surrounding markdown-like
  { name: 'stray spoiler in quote', input: '[quote]hi [/spoiler] there[/quote]' },
  { name: 'stray spoiler followed by formatting', input: '[/spoiler] [b]bold[/b]' },

  // ===== Wave 8: spam ID variants with multi-spaces, carriage returns, tabs =====

  { name: 'id link multi-space', input: 'post  #1234' },
  { name: 'id link tab separator', input: 'post\t#1234' },
  { name: 'id link nbsp separator', input: 'post #1234' },
  { name: 'caps id link multi-space', input: 'Post  #1234' },
  { name: 'caps Topic multi-space', input: 'Topic  #1234' },
  { name: 'caps Comment tab sep', input: 'Comment\t#1234' },
  { name: 'caps Pool nbsp sep', input: 'Pool #1234' },

  // ===== Wave 9: ID hash-prefix variants =====

  { name: 'pool no-space underscore tail', input: 'pool#1234_foo' },
  { name: 'topic no-space comma after', input: 'topic#1234, end' },
  { name: 'set no-space dot after', input: 'set#1234. end' },
  { name: 'comment no-space exclaim after', input: 'comment#1234!' },
  { name: 'note no-space close-paren', input: 'note#1234)' },
  { name: 'flag no-space semicolon', input: 'flag#1234;' },
  { name: 'forum no-space colon', input: 'forum#1234:' },
  { name: 'ban no-space rbracket', input: 'ban#1234]' },

  // ===== Wave 10: more invalid colors =====

  { name: 'color name with hyphen', input: '[color=hot-pink]x[/color]', allowColor: true },
  { name: 'color name with dot', input: '[color=red.blue]x[/color]', allowColor: true },
  { name: 'color name with slash', input: '[color=red/blue]x[/color]', allowColor: true },
  { name: 'color name single uppercase', input: '[color=R]x[/color]', allowColor: true },
  { name: 'color name digit only', input: '[color=42]x[/color]', allowColor: true },
  { name: 'color hash plus name', input: '[color=#red]x[/color]', allowColor: true },
  { name: 'color quoted', input: '[color="red"]x[/color]', allowColor: true },
  { name: 'color rgb-style', input: '[color=rgb(1,2,3)]x[/color]', allowColor: true },
  { name: 'color empty pair', input: '[color]x[/color]', allowColor: true },

  // ===== Wave 11: more wiki link malformed =====

  { name: 'wiki link trailing pipe', input: '[[wiki|title|]]' },
  { name: 'wiki link leading pipe', input: '[[|wiki|title]]' },
  { name: 'wiki link four pipes', input: '[[a|b|c|d]]' },
  { name: 'wiki link nested brackets in title', input: '[[wiki|[title]]]' },
  { name: 'wiki link with ampersand pipe', input: '[[wiki|a&b]]' },

  // ===== Wave 12: more textile bracketed with whitespace =====

  { name: 'textile bracketed url newline inside', input: '"link":[/foo\nbar]' },
  { name: 'textile bracketed url with double quote', input: '"link":[/foo"bar]' },
  { name: 'textile bracketed url two segments space', input: '"label":[/a b/c d]' },
  { name: 'textile bracketed url cr', input: '"link":[/foo\rbar]' },

  // ===== Wave 13: more wiki anchor whitespace variants =====

  { name: 'wiki anchor with leading space', input: '[[wiki# anchor]]' },
  { name: 'wiki anchor with trailing space', input: '[[wiki#anchor ]]' },
  { name: 'wiki anchor multiword title pipe', input: '[[wiki#one two|disp]]' },
  { name: 'wiki anchor double space', input: '[[wiki#a  b]]' },

  // ===== Wave 14: more unclosed code =====

  { name: 'unclosed code with code-like', input: '[code]console.log("hi")' },
  { name: 'unclosed code with long content', input: '[code]' + 'x'.repeat(100) },
  { name: 'unclosed code with html tags', input: '[code]<div>hello</div>' },
  { name: 'unclosed code preceded by text', input: 'before [code]middle and end' },

  // ===== Wave 15: more stray spoiler =====

  { name: 'stray spoiler at line start', input: 'hello\n[/spoiler] world' },
  { name: 'stray spoiler in header', input: 'h1. title [/spoiler] tail\n' },
  { name: 'stray spoiler tabbed', input: 'a\t[/spoiler]\tb' },
  { name: 'stray spoiler nested in bold', input: '[b]hello [/spoiler] there[/b]' },
  { name: 'stray spoiler followed by id-link', input: '[/spoiler] post #1234' },

  // ===== Wave 16: cap-prefix + various trailing punctuation =====

  { name: 'Pool with trailing dot', input: 'Pool #1234.' },
  { name: 'Topic with trailing comma', input: 'Topic #1234,' },
  { name: 'Comment with trailing exclaim', input: 'Comment #1234!' },
  { name: 'Note with trailing question', input: 'Note #1234?' },
  { name: 'Set with trailing semicolon', input: 'Set #1234;' },
  { name: 'Forum with trailing colon', input: 'Forum #1234:' },
  { name: 'Blip with trailing rbracket', input: 'Blip #1234]' },
  { name: 'Flag with trailing rparen', input: 'Flag #1234)' },
  { name: 'Ticket with trailing rbrace', input: 'Ticket #1234}' },

  // ===== Wave 17: many no-space IDs combined =====

  { name: 'four no-space ids', input: 'pool#1 topic#2 comment#3 set#4' },
  { name: 'no-space ids with format around', input: '[b]pool#1 topic#2[/b]' },
  { name: 'no-space id at start', input: 'pool#1234 starts' },
  { name: 'no-space id at end', input: 'ends pool#1234' },
  { name: 'caps and no-space across newline', input: 'Pool #1\npool#2' },

  // ===== Wave 18: stray spoiler + IDs combined =====

  { name: 'stray spoiler then caps id', input: '[/spoiler] Pool #1234' },
  { name: 'caps id then stray spoiler', input: 'Topic #1234 [/spoiler]' },
  { name: 'stray spoiler with no-space id', input: 'pool#1 [/spoiler] topic#2' },

  // ===== Wave 19: invalid colors with content variations =====

  { name: 'color invalid with id link inside', input: '[color=BLUE]Pool #1[/color]', allowColor: true },
  { name: 'color invalid with no-space id', input: '[color=Red]pool#1[/color]', allowColor: true },
  { name: 'color invalid with newlines', input: '[color=BadName]\nx\n[/color]', allowColor: true },
  { name: 'color invalid wrapping unclosed code', input: '[color=Red][code]hi', allowColor: true },

  // ===== Wave 20: textile bracketed with whitespace, more =====

  { name: 'textile bracketed with cr-lf', input: '"link":[/a\r\nb]' },
  { name: 'textile bracketed nested space-paren', input: '"link":[/a (b) c]' },
  { name: 'textile bracketed pipe inside', input: '"link":[/a|b]' },
  { name: 'textile bracketed brackets pair', input: '"link":[/[abc] def]' },

  // ===== Wave 21: wiki link uppercase + malformed combos =====

  { name: 'wiki link uppercase target with empty pipe', input: '[[FOO|]]' },
  { name: 'wiki link uppercase three pipes', input: '[[FOO|BAR|BAZ]]' },
  { name: 'wiki link uppercase trailing hash', input: '[[FOO#]]' },
  { name: 'wiki link uppercase double-hash', input: '[[FOO#a#b]]' },

  // ===== Wave 22: unclosed code with embedded patterns =====

  { name: 'unclosed code embedded id link', input: '[code]post #1234 still open' },
  { name: 'unclosed code embedded wiki', input: '[code][[wiki]] open' },
  { name: 'unclosed code embedded color', input: '[code][color=red]x[/color] open' },
  { name: 'unclosed code embedded close-quote', input: '[code]hi[/quote] still' },
];

// ===== Wave 23: mass-generated caps × punctuation =====
//
// Capitalized ID prefixes diverge because the oracle lowercases the display
// text while dmark keeps it as written. Mass-generated to cover many real
// inputs that wiki users actually paste.
const CAPS_PREFIXES = [
  'Post',
  'Pool',
  'Topic',
  'Comment',
  'Note',
  'Set',
  'Forum',
  'Blip',
  'Flag',
  'Ticket',
  'User',
  'Artist',
  'Ban',
  'Bur',
  'Alias',
  'Implication',
  'Record',
  'Wiki',
  'Takedown',
];
const PUNCT_SUFFIXES = [
  ['period', '.'],
  ['exclaim', '!'],
  ['question', '?'],
  ['colon', ':'],
  ['rparen', ')'],
  ['rbracket', ']'],
  ['rbrace', '}'],
];
for (const p of CAPS_PREFIXES) {
  for (const [punctName, punct] of PUNCT_SUFFIXES) {
    cases.push({
      name: `caps ${p} trailing ${punctName}`,
      input: `${p} #1234${punct}`,
    });
  }
}

// ===== Wave 24: mass-generated no-space × punctuation =====
//
// No-space ID-style links like `pool#1234` are literal text in the oracle
// but become links in dmark.
const NOSPACE_PREFIXES = [
  'pool',
  'topic',
  'comment',
  'note',
  'set',
  'forum',
  'blip',
  'flag',
  'ticket',
  'user',
  'artist',
  'ban',
  'alias',
  'implication',
  'record',
  'wiki',
  'takedown',
];
for (const p of NOSPACE_PREFIXES) {
  for (const [punctName, punct] of PUNCT_SUFFIXES) {
    cases.push({
      name: `no-space ${p} trailing ${punctName}`,
      input: `${p}#1234${punct}`,
    });
  }
}

// ===== Wave 25: mass-generated caps × N (different ids) =====
for (const p of CAPS_PREFIXES) {
  for (const id of ['1', '42', '99999', '7']) {
    cases.push({
      name: `caps ${p} id ${id}`,
      input: `${p} #${id}`,
    });
  }
}

// ===== Wave 26: caps × different ID numbers (more) =====
for (const p of CAPS_PREFIXES) {
  for (const id of ['11', '22', '100', '1000', '12345', '987654']) {
    cases.push({
      name: `caps ${p} id-num ${id}`,
      input: `${p} #${id}`,
    });
  }
}

// ===== Wave 27: caps surrounded by sentence context =====
const CONTEXTS: Array<[string, (snip: string) => string]> = [
  ['parens', (s) => `(${s})`],
  ['quoted', (s) => `'${s}'`],
  ['mid-sentence', (s) => `before ${s} after`],
  ['after-newline', (s) => `intro\n\n${s}\n`],
  ['after-comma', (s) => `intro, ${s}, end`],
];
for (const p of CAPS_PREFIXES) {
  for (const [ctxName, fn] of CONTEXTS) {
    cases.push({
      name: `caps ${p} in ${ctxName}`,
      input: fn(`${p} #1234`),
    });
  }
}

// ===== Wave 28: no-space surrounded by sentence context =====
for (const p of NOSPACE_PREFIXES) {
  for (const [ctxName, fn] of CONTEXTS) {
    cases.push({
      name: `no-space ${p} in ${ctxName}`,
      input: fn(`${p}#1234`),
    });
  }
}

// ===== Wave 29: stray spoiler in many contexts =====
const SPOILER_CONTEXTS: Array<[string, string]> = [
  ['plain', 'a [/spoiler] b'],
  ['line-start', '\n[/spoiler] tail'],
  ['after-period', 'word. [/spoiler] tail'],
  ['after-comma', 'word, [/spoiler] tail'],
  ['after-newline', 'first\n[/spoiler] tail'],
  ['twice-mid', 'a [/spoiler] b [/spoiler] c'],
  ['thrice', 'a [/spoiler] b [/spoiler] c [/spoiler] d'],
  ['after-id-link', 'see post #1 [/spoiler] then'],
  ['between-paragraphs', 'first\n\n[/spoiler] tail'],
];
for (const [name, input] of SPOILER_CONTEXTS) {
  cases.push({ name: `stray spoiler ctx ${name}`, input });
}

// ===== Wave 30: unclosed code with various trailing content =====
const CODE_TAILS = [
  ['short', 'x'],
  ['long', 'word '.repeat(10)],
  ['html', '<div>hi</div>'],
  ['lots-newlines', 'a\nb\nc\nd'],
  ['with-id', 'post #1234'],
  ['with-wiki', '[[wiki]]'],
  ['with-bold', '[b]bold[/b]'],
  ['with-bracket', 'foo]bar'],
  ['empty-string', ''],
  ['with-cr', 'a\rb\rc'],
];
for (const [name, tail] of CODE_TAILS) {
  cases.push({ name: `unclosed code tail ${name}`, input: `[code]${tail}` });
}

// ===== Wave 31: invalid color values, mass =====
const INVALID_COLOR_VALUES = [
  'Red',
  'BLUE',
  'Green',
  'PURPLE',
  '#1234567',
  '#abcdef0',
  '#xyz',
  '#abG',
  '#',
  'red ',
  ' red',
  'red123',
  'hot_pink',
  'hot-pink',
  'red.blue',
  'red/blue',
  '42',
  'rgb(1,2,3)',
  '#red',
  '"red"',
  "'red'",
];
for (const v of INVALID_COLOR_VALUES) {
  cases.push({
    name: `mass color invalid value ${JSON.stringify(v)}`,
    input: `[color=${v}]x[/color]`,
    allowColor: true,
  });
}

// ===== Wave 32: wiki link malformed mass =====
const MALFORMED_WIKI = [
  ['empty', '[[]]'],
  ['only-pipes', '[[||]]'],
  ['empty-target', '[[|title]]'],
  ['empty-title', '[[wiki|]]'],
  ['triple-pipe', '[[a|b|c]]'],
  ['quadruple-pipe', '[[a|b|c|d]]'],
  ['leading-pipe', '[[|x|y]]'],
  ['trailing-pipe', '[[x|y|]]'],
  ['empty-middle', '[[a||b]]'],
  ['hash-only', '[[#]]'],
  ['hash-pipe', '[[#|t]]'],
  ['anchor-multi-space', '[[a#b c d]]'],
  ['anchor-tab', '[[a#b\tc]]'],
];
for (const [name, input] of MALFORMED_WIKI) {
  cases.push({ name: `malformed wiki ${name}`, input });
}

// ===== Wave 33: caps × nosp pairs in same sentence =====
for (const cp of CAPS_PREFIXES.slice(0, 10)) {
  for (const np of NOSPACE_PREFIXES.slice(0, 10)) {
    cases.push({
      name: `pair ${cp} caps and ${np} no-space`,
      input: `${cp} #1 and ${np}#2`,
    });
  }
}

// ===== Wave 34: caps prefix with various id-number lengths =====
const NUM_VARIANTS = ['0', '00', '01', '10', '100', '1000', '10000', '100000', '1000000', '9876543210'];
for (const p of CAPS_PREFIXES) {
  for (const id of NUM_VARIANTS) {
    cases.push({
      name: `caps ${p} num-variant ${id}`,
      input: `${p} #${id}`,
    });
  }
}

// ===== Wave 35: no-space prefix with various id-number lengths =====
for (const p of NOSPACE_PREFIXES) {
  for (const id of NUM_VARIANTS) {
    cases.push({
      name: `no-space ${p} num-variant ${id}`,
      input: `${p}#${id}`,
    });
  }
}

// ===== Wave 36: caps with double punctuations =====
const DOUBLE_PUNCT = [
  ['period-period', '..'],
  ['exclaim-exclaim', '!!'],
  ['period-rparen', '.)'],
  ['period-rbracket', '.]'],
  ['comma-rparen', ',)'],
];
for (const p of CAPS_PREFIXES) {
  for (const [n, dp] of DOUBLE_PUNCT) {
    cases.push({
      name: `caps ${p} double-punct ${n}`,
      input: `${p} #1234${dp}`,
    });
  }
}

// ===== Wave 37: stray spoiler followed by caps id =====
for (const p of CAPS_PREFIXES) {
  cases.push({
    name: `stray-spoiler-then-caps ${p}`,
    input: `[/spoiler] ${p} #1234`,
  });
}

// ===== Wave 38: caps id wrapped in formatting tags =====
const FORMAT_WRAPS: Array<[string, (s: string) => string]> = [
  ['bold', (s) => `[b]${s}[/b]`],
  ['italic', (s) => `[i]${s}[/i]`],
  ['underline', (s) => `[u]${s}[/u]`],
  ['strike', (s) => `[s]${s}[/s]`],
  ['quote', (s) => `[quote]${s}[/quote]`],
];
for (const p of CAPS_PREFIXES.slice(0, 8)) {
  for (const [name, wrap] of FORMAT_WRAPS) {
    cases.push({
      name: `caps ${p} wrapped in ${name}`,
      input: wrap(`${p} #1234`),
    });
  }
}

// ===== Wave 39: no-space id wrapped in formatting tags =====
for (const p of NOSPACE_PREFIXES.slice(0, 8)) {
  for (const [name, wrap] of FORMAT_WRAPS) {
    cases.push({
      name: `no-space ${p} wrapped in ${name}`,
      input: wrap(`${p}#1234`),
    });
  }
}

// ===== Wave 40: invalid color × wrapping format combinations =====
for (const v of INVALID_COLOR_VALUES.slice(0, 12)) {
  for (const [name, wrap] of FORMAT_WRAPS.slice(0, 4)) {
    cases.push({
      name: `invalid color ${JSON.stringify(v)} wrapped in ${name}`,
      input: wrap(`[color=${v}]x[/color]`),
      allowColor: true,
    });
  }
}

// ===== Wave 41: full caps × no-space cross product =====
for (const cp of CAPS_PREFIXES) {
  for (const np of NOSPACE_PREFIXES) {
    cases.push({
      name: `xprod ${cp}-caps + ${np}-nosp`,
      input: `${cp} #1 and ${np}#2`,
    });
  }
}

// ===== Wave 42: caps prefix at line start in lists =====
for (const p of CAPS_PREFIXES) {
  cases.push({
    name: `list item caps ${p}`,
    input: `* ${p} #1234\n`,
  });
}

// ===== Wave 43: caps prefix in headers =====
for (const p of CAPS_PREFIXES) {
  for (const lvl of [1, 2, 3]) {
    cases.push({
      name: `h${lvl} with caps ${p}`,
      input: `h${lvl}. ${p} #1234\n`,
    });
  }
}

// ===== Wave 44: caps prefix in quotes =====
for (const p of CAPS_PREFIXES) {
  cases.push({
    name: `quote with caps ${p}`,
    input: `[quote]${p} #1234[/quote]`,
  });
}

// ===== Wave 45: no-space prefix in headers/lists/quotes =====
for (const p of NOSPACE_PREFIXES) {
  cases.push({
    name: `list with no-space ${p}`,
    input: `* ${p}#1234\n`,
  });
  cases.push({
    name: `h2 with no-space ${p}`,
    input: `h2. ${p}#1234\n`,
  });
  cases.push({
    name: `quote with no-space ${p}`,
    input: `[quote]${p}#1234[/quote]`,
  });
}

// ===== Wave 46: caps prefix with prefix-itself capitalization =====
const CAPS_VARIANTS = ['POOL', 'TOPIC', 'COMMENT', 'NOTE', 'SET', 'FORUM', 'BLIP', 'FLAG', 'TICKET'];
for (const p of CAPS_VARIANTS) {
  for (const [punctName, punct] of PUNCT_SUFFIXES) {
    cases.push({
      name: `all-caps ${p} trailing ${punctName}`,
      input: `${p} #1234${punct}`,
    });
  }
}

// ===== Wave 47: more numbers for caps =====
const MORE_NUMS = ['2', '3', '4', '5', '6', '8', '9', '13', '17', '23', '29', '31', '37', '41', '43', '47', '53', '59', '61', '67'];
for (const p of CAPS_PREFIXES.slice(0, 12)) {
  for (const id of MORE_NUMS) {
    cases.push({
      name: `caps ${p} prime-num ${id}`,
      input: `${p} #${id}`,
    });
  }
}

// ===== Wave 48: more numbers for no-space =====
for (const p of NOSPACE_PREFIXES.slice(0, 12)) {
  for (const id of MORE_NUMS) {
    cases.push({
      name: `no-space ${p} prime-num ${id}`,
      input: `${p}#${id}`,
    });
  }
}

// ===== Wave 49: stray spoiler many position contexts =====
const STRAY_SP_POS = [
  ['head', '[/spoiler]'],
  ['head-text', '[/spoiler] tail'],
  ['mid', 'pre [/spoiler] tail'],
  ['end', 'pre [/spoiler]'],
  ['after-quote', '[quote]hi[/quote] [/spoiler] tail'],
  ['after-list', '* a\n[/spoiler] tail'],
  ['inside-quote-tail', '[quote]hi [/spoiler][/quote]'],
  ['line-of-text-then', 'first line\n[/spoiler]\n'],
  ['between-blocks', 'h1. one\n\n[/spoiler]\n\nfin'],
];
for (const [name, input] of STRAY_SP_POS) {
  cases.push({ name: `stray-spoiler-pos ${name}`, input });
}

// ===== Wave 50: unclosed code very many tails =====
const UCODE_TAILS = [
  'a',
  'ab',
  'abc',
  'word word word',
  'line\nline',
  'line\rline',
  'line\r\nline',
  '[b]bold inside[/b]',
  '[i]italic[/i] tail',
  'post #1',
  'pool#1',
  '[[wiki]]',
  '"link":/path',
  'h1. header',
  '* list',
  '[quote]q[/quote]',
  '<html-like>',
  '&entity;',
  'mixed [b]a[/b] post #1 [[wiki]]',
];
for (const t of UCODE_TAILS) {
  cases.push({
    name: `unclosed code mass-tail ${JSON.stringify(t).slice(0, 40)}`,
    input: `[code]${t}`,
  });
}

// ===== Wave 51: caps × number × suffix triple cross =====
for (const p of CAPS_PREFIXES.slice(0, 12)) {
  for (const id of ['1', '2', '5', '10', '20', '50']) {
    for (const [punctName, punct] of PUNCT_SUFFIXES.slice(0, 5)) {
      cases.push({
        name: `triple caps ${p} #${id}${punctName}`,
        input: `${p} #${id}${punct}`,
      });
    }
  }
}

// ===== Wave 52: no-space × number × suffix =====
for (const p of NOSPACE_PREFIXES.slice(0, 12)) {
  for (const id of ['1', '2', '5', '10', '20', '50']) {
    for (const [punctName, punct] of PUNCT_SUFFIXES.slice(0, 5)) {
      cases.push({
        name: `triple no-sp ${p}#${id}${punctName}`,
        input: `${p}#${id}${punct}`,
      });
    }
  }
}

// ===== Wave 53: caps with punct then trailing text =====
for (const p of CAPS_PREFIXES) {
  for (const [punctName, punct] of PUNCT_SUFFIXES) {
    cases.push({
      name: `caps ${p} ${punctName} then trailing text`,
      input: `${p} #1234${punct} more text`,
    });
  }
}

// ===== Wave 54: invalid color × number id inside =====
for (const v of INVALID_COLOR_VALUES.slice(0, 14)) {
  cases.push({
    name: `bad color ${JSON.stringify(v)} surrounding plain text`,
    input: `[color=${v}]some plain content here[/color]`,
    allowColor: true,
  });
}

// ===== Wave 55: caps with leading punctuation =====
for (const p of CAPS_PREFIXES) {
  for (const [pname, punct] of [['lparen', '('], ['lbracket', '['], ['quote', '"'], ['squote', "'"]] as Array<[string, string]>) {
    cases.push({
      name: `caps ${p} leading ${pname}`,
      input: `${punct}${p} #1234`,
    });
  }
}

// ===== Wave 56: caps with leading + trailing punctuation =====
for (const p of CAPS_PREFIXES.slice(0, 10)) {
  for (const [pair_name, l, r] of [
    ['parens', '(', ')'],
    ['brackets', '[', ']'],
    ['braces', '{', '}'],
    ['quotes', '"', '"'],
    ['squotes', "'", "'"],
  ] as Array<[string, string, string]>) {
    cases.push({
      name: `caps ${p} wrapped ${pair_name}`,
      input: `${l}${p} #1234${r}`,
    });
  }
}

// ===== Wave 57: many no-space combos repeated in one input =====
for (const p of NOSPACE_PREFIXES) {
  cases.push({
    name: `no-space ${p} repeated three times`,
    input: `${p}#1 ${p}#2 ${p}#3`,
  });
}

// ===== Wave 58: caps id followed by another caps id (multiple per line) =====
for (const cp1 of CAPS_PREFIXES.slice(0, 10)) {
  for (const cp2 of CAPS_PREFIXES.slice(0, 10)) {
    if (cp1 === cp2) continue;
    cases.push({
      name: `pair caps ${cp1} and ${cp2}`,
      input: `${cp1} #1 ${cp2} #2`,
    });
  }
}

// ===== Wave 59: invalid color names mass with extra-content =====
for (const v of INVALID_COLOR_VALUES) {
  cases.push({
    name: `invalid color ${JSON.stringify(v)} with bold inside`,
    input: `[color=${v}][b]inner[/b][/color]`,
    allowColor: true,
  });
  cases.push({
    name: `invalid color ${JSON.stringify(v)} with italic inside`,
    input: `[color=${v}][i]inner[/i][/color]`,
    allowColor: true,
  });
}

// ===== Wave 60: stray spoiler combined with color invalid =====
for (const v of INVALID_COLOR_VALUES.slice(0, 8)) {
  cases.push({
    name: `bad-color ${JSON.stringify(v)} then stray-spoiler`,
    input: `[color=${v}]x[/color] [/spoiler] tail`,
    allowColor: true,
  });
}

// ===== Wave 61: caps prefix in wrap and context combos =====
for (const p of CAPS_PREFIXES) {
  for (const [name, wrap] of FORMAT_WRAPS) {
    cases.push({
      name: `caps ${p} wrapped-${name} with-tail`,
      input: `${wrap(`${p} #1234`)} tail`,
    });
    cases.push({
      name: `caps ${p} wrapped-${name} after-text`,
      input: `lead ${wrap(`${p} #1234`)}`,
    });
  }
}

// ===== Wave 62: no-space prefix wrapped variants =====
for (const p of NOSPACE_PREFIXES) {
  for (const [name, wrap] of FORMAT_WRAPS) {
    cases.push({
      name: `no-space ${p} wrapped-${name} with-tail`,
      input: `${wrap(`${p}#1234`)} tail`,
    });
  }
}

// ===== Wave 63: caps prefixes inside multi-line lists =====
for (const p of CAPS_PREFIXES) {
  cases.push({
    name: `multiline list caps ${p}`,
    input: `* ${p} #1\n* ${p} #2\n* ${p} #3\n`,
  });
}

// ===== Wave 64: no-space prefixes inside multi-line lists =====
for (const p of NOSPACE_PREFIXES) {
  cases.push({
    name: `multiline list no-space ${p}`,
    input: `* ${p}#1\n* ${p}#2\n* ${p}#3\n`,
  });
}

// ===== Wave 65: triple stack caps wrap punct =====
for (const p of CAPS_PREFIXES.slice(0, 8)) {
  for (const [wname, wrap] of FORMAT_WRAPS.slice(0, 3)) {
    for (const [pn, punct] of PUNCT_SUFFIXES.slice(0, 4)) {
      cases.push({
        name: `triple-stack ${p} ${wname} ${pn}`,
        input: wrap(`${p} #1234${punct}`),
      });
    }
  }
}

// ===== Wave 66: triple stack no-space wrap punct =====
for (const p of NOSPACE_PREFIXES.slice(0, 8)) {
  for (const [wname, wrap] of FORMAT_WRAPS.slice(0, 3)) {
    for (const [pn, punct] of PUNCT_SUFFIXES.slice(0, 4)) {
      cases.push({
        name: `triple-stack-nosp ${p} ${wname} ${pn}`,
        input: wrap(`${p}#1234${punct}`),
      });
    }
  }
}

// ===== Wave 67: invalid color in sentence contexts =====
for (const v of INVALID_COLOR_VALUES) {
  for (const [ctxName, fn] of CONTEXTS) {
    cases.push({
      name: `bad color ${JSON.stringify(v)} in ${ctxName}`,
      input: fn(`[color=${v}]x[/color]`),
      allowColor: true,
    });
  }
}

// ===== Wave 68: malformed wiki in sentence contexts =====
for (const [name, input] of MALFORMED_WIKI) {
  for (const [ctxName, fn] of CONTEXTS) {
    cases.push({
      name: `malformed wiki ${name} in ${ctxName}`,
      input: fn(input),
    });
  }
}

// ===== Wave 69: caps prefix with all-punct combos =====
const ALL_PUNCT: Array<[string, string]> = [
  ['period', '.'],
  ['comma', ','],
  ['exclaim', '!'],
  ['question', '?'],
  ['semicolon', ';'],
  ['colon', ':'],
  ['rparen', ')'],
  ['rbracket', ']'],
  ['rbrace', '}'],
  ['gt', '>'],
  ['lt', '<'],
];
for (const p of CAPS_PREFIXES.slice(0, 10)) {
  for (const [pn, punct] of ALL_PUNCT) {
    cases.push({
      name: `caps ${p} all-punct ${pn}`,
      input: `${p} #1234${punct}`,
    });
  }
}

// ===== Wave 70: full all-punct on full caps prefix list =====
for (const p of CAPS_PREFIXES) {
  for (const [pn, punct] of ALL_PUNCT) {
    for (const id of ['1', '42']) {
      cases.push({
        name: `full caps ${p} #${id} ${pn}`,
        input: `${p} #${id}${punct}`,
      });
    }
  }
}

// ===== Wave 71: full all-punct on no-space prefix list =====
for (const p of NOSPACE_PREFIXES) {
  for (const [pn, punct] of ALL_PUNCT) {
    for (const id of ['1', '42']) {
      cases.push({
        name: `full no-space ${p}#${id} ${pn}`,
        input: `${p}#${id}${punct}`,
      });
    }
  }
}

// ===== Wave 72: caps prefix with prefix-itself all caps and punct =====
for (const p of CAPS_VARIANTS) {
  for (const [pn, punct] of ALL_PUNCT) {
    cases.push({
      name: `all-caps ${p} all-punct ${pn}`,
      input: `${p} #1234${punct}`,
    });
  }
}

// ===== Wave 73: caps prefix sentence position =====
const SENTENCE_POS: Array<[string, (s: string) => string]> = [
  ['start', (s) => `${s} ends sentence`],
  ['mid', (s) => `start ${s} ends sentence`],
  ['end', (s) => `start ends with ${s}`],
  ['only', (s) => s],
  ['lead-newline', (s) => `\n${s}`],
  ['trailing-newline', (s) => `${s}\n`],
  ['both-newlines', (s) => `\n${s}\n`],
];
for (const p of CAPS_PREFIXES.slice(0, 12)) {
  for (const [n, fn] of SENTENCE_POS) {
    cases.push({
      name: `caps ${p} sentence-pos ${n}`,
      input: fn(`${p} #1234`),
    });
  }
}
for (const p of NOSPACE_PREFIXES.slice(0, 12)) {
  for (const [n, fn] of SENTENCE_POS) {
    cases.push({
      name: `no-space ${p} sentence-pos ${n}`,
      input: fn(`${p}#1234`),
    });
  }
}

// ===== Wave 74: invalid color all sentence positions =====
for (const v of INVALID_COLOR_VALUES.slice(0, 12)) {
  for (const [n, fn] of SENTENCE_POS) {
    cases.push({
      name: `bad-color ${JSON.stringify(v)} pos ${n}`,
      input: fn(`[color=${v}]x[/color]`),
      allowColor: true,
    });
  }
}

// ===== Wave 75: malformed wiki all sentence positions =====
for (const [name, input] of MALFORMED_WIKI) {
  for (const [n, fn] of SENTENCE_POS) {
    cases.push({
      name: `malformed wiki ${name} pos ${n}`,
      input: fn(input),
    });
  }
}

// ===== Wave 76: stray spoiler all sentence positions =====
for (const [n, fn] of SENTENCE_POS) {
  cases.push({
    name: `stray spoiler pos ${n}`,
    input: fn('[/spoiler]'),
  });
}

// ===== Wave 77: textile bracketed with whitespace many positions =====
for (const [n, fn] of SENTENCE_POS) {
  cases.push({
    name: `textile bracketed-space pos ${n}`,
    input: fn('"link":[/path with space]'),
  });
}

// ===== Wave 78: deep amp caps wrap ctx =====
for (const p of CAPS_PREFIXES.slice(0, 8)) {
  for (const [wname, wrap] of FORMAT_WRAPS) {
    for (const [cn, fn] of CONTEXTS.slice(0, 3)) {
      cases.push({
        name: `caps ${p} wrap-${wname} ctx-${cn}`,
        input: fn(wrap(`${p} #1234`)),
      });
    }
  }
}

// ===== Wave 79: deep amp no-space wrap ctx =====
for (const p of NOSPACE_PREFIXES.slice(0, 8)) {
  for (const [wname, wrap] of FORMAT_WRAPS) {
    for (const [cn, fn] of CONTEXTS.slice(0, 3)) {
      cases.push({
        name: `no-space ${p} wrap-${wname} ctx-${cn}`,
        input: fn(wrap(`${p}#1234`)),
      });
    }
  }
}

// ===== Wave 80: huge id range for caps prefixes =====
const HUGE_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '20', '25', '30', '40', '50', '75', '100', '150', '200', '300', '500', '750', '1000', '2000', '5000', '10000', '50000', '100000', '500000', '1234567'];
for (const p of CAPS_PREFIXES) {
  for (const id of HUGE_IDS) {
    cases.push({
      name: `caps ${p} mega-id ${id}`,
      input: `${p} #${id}`,
    });
  }
}

// ===== Wave 81: huge id range for no-space prefixes =====
for (const p of NOSPACE_PREFIXES) {
  for (const id of HUGE_IDS) {
    cases.push({
      name: `no-space ${p} mega-id ${id}`,
      input: `${p}#${id}`,
    });
  }
}

// ===== Wave 82: caps with surrounding lorem ipsum =====
const LOREM_TEMPLATES: Array<[string, (s: string) => string]> = [
  ['short-lead', (s) => `lorem ${s} ipsum`],
  ['greeting', (s) => `hello see ${s} thanks`],
  ['question', (s) => `did you check ${s} yet?`],
  ['list-prose', (s) => `also: ${s}, and more`],
  ['conclusion', (s) => `in summary, ${s}.`],
  ['parenthetical', (s) => `note (see ${s}) for context`],
];
for (const p of CAPS_PREFIXES) {
  for (const [n, fn] of LOREM_TEMPLATES) {
    cases.push({
      name: `caps ${p} lorem ${n}`,
      input: fn(`${p} #1234`),
    });
  }
}
for (const p of NOSPACE_PREFIXES) {
  for (const [n, fn] of LOREM_TEMPLATES) {
    cases.push({
      name: `no-space ${p} lorem ${n}`,
      input: fn(`${p}#1234`),
    });
  }
}

// ===== Wave 83: invalid color full punctuation suffixes =====
for (const v of INVALID_COLOR_VALUES) {
  for (const [pn, punct] of ALL_PUNCT) {
    cases.push({
      name: `bad color ${JSON.stringify(v)} suffix ${pn}`,
      input: `[color=${v}]x[/color]${punct}`,
      allowColor: true,
    });
  }
}

// ===== Wave 84: malformed wiki with full punctuation suffix =====
for (const [name, input] of MALFORMED_WIKI) {
  for (const [pn, punct] of ALL_PUNCT) {
    cases.push({
      name: `malformed wiki ${name} suffix ${pn}`,
      input: `${input}${punct}`,
    });
  }
}

// ===== Wave 85: combined caps-id with wiki-anchor-space =====
for (const p of CAPS_PREFIXES.slice(0, 10)) {
  cases.push({
    name: `caps ${p} then wiki-anchor-space`,
    input: `${p} #1 [[wiki#some anchor]]`,
  });
}

// ===== Wave 86: combined caps-id with stray spoiler with all-punct =====
for (const p of CAPS_PREFIXES.slice(0, 10)) {
  for (const [pn, punct] of ALL_PUNCT.slice(0, 6)) {
    cases.push({
      name: `caps ${p} then stray-spoiler ${pn}`,
      input: `${p} #1234${punct} [/spoiler]`,
    });
  }
}

// ===== Wave 87: caps prefix with HUGE_IDs and punct combo =====
for (const p of CAPS_PREFIXES.slice(0, 10)) {
  for (const id of HUGE_IDS.slice(0, 12)) {
    for (const [pn, punct] of ALL_PUNCT.slice(0, 5)) {
      cases.push({
        name: `caps ${p} #${id} ${pn}`,
        input: `${p} #${id}${punct}`,
      });
    }
  }
}

// ===== Wave 88: no-space prefix HUGE_IDs and punct =====
for (const p of NOSPACE_PREFIXES.slice(0, 10)) {
  for (const id of HUGE_IDS.slice(0, 12)) {
    for (const [pn, punct] of ALL_PUNCT.slice(0, 5)) {
      cases.push({
        name: `no-space ${p}#${id} ${pn}`,
        input: `${p}#${id}${punct}`,
      });
    }
  }
}

// ===== Wave 89: caps prefix with all wraps and HUGE_IDs =====
for (const p of CAPS_PREFIXES.slice(0, 8)) {
  for (const [wname, wrap] of FORMAT_WRAPS) {
    for (const id of HUGE_IDS.slice(0, 8)) {
      cases.push({
        name: `caps ${p} #${id} wrap-${wname}`,
        input: wrap(`${p} #${id}`),
      });
    }
  }
}

// ===== Wave 90: no-space full wrap and num combo =====
for (const p of NOSPACE_PREFIXES.slice(0, 8)) {
  for (const [wname, wrap] of FORMAT_WRAPS) {
    for (const id of HUGE_IDS.slice(0, 8)) {
      cases.push({
        name: `no-space ${p}#${id} wrap-${wname}`,
        input: wrap(`${p}#${id}`),
      });
    }
  }
}

// ===== Wave 91: invalid color with HUGE_IDs in inner content =====
for (const v of INVALID_COLOR_VALUES.slice(0, 10)) {
  for (const id of HUGE_IDS.slice(0, 8)) {
    cases.push({
      name: `bad color ${JSON.stringify(v)} inner ${id}`,
      input: `[color=${v}]Pool #${id}[/color]`,
      allowColor: true,
    });
  }
}

// ===== Wave 92: caps prefix + ID + color invalid combo =====
for (const p of CAPS_PREFIXES.slice(0, 10)) {
  for (const v of INVALID_COLOR_VALUES.slice(0, 8)) {
    cases.push({
      name: `caps ${p} after bad-color ${JSON.stringify(v)}`,
      input: `[color=${v}]y[/color] ${p} #1234`,
      allowColor: true,
    });
  }
}

// ===== Wave 93: no-space + bad-color combo =====
for (const p of NOSPACE_PREFIXES.slice(0, 10)) {
  for (const v of INVALID_COLOR_VALUES.slice(0, 8)) {
    cases.push({
      name: `no-space ${p} after bad-color ${JSON.stringify(v)}`,
      input: `[color=${v}]y[/color] ${p}#1234`,
      allowColor: true,
    });
  }
}

// ===== Wave 94: longer multi-id sentences =====
for (const p of CAPS_PREFIXES.slice(0, 10)) {
  cases.push({
    name: `four-of-${p}-caps`,
    input: `${p} #1, ${p} #2, ${p} #3, ${p} #4.`,
  });
}
for (const p of NOSPACE_PREFIXES.slice(0, 10)) {
  cases.push({
    name: `four-of-${p}-no-space`,
    input: `${p}#1, ${p}#2, ${p}#3, ${p}#4.`,
  });
}

// ===== Wave 95: caps + multiple punctuation suffix combos =====
const TRIPLE_PUNCT = [
  ['three-dots', '...'],
  ['exclaim-3', '!!!'],
  ['mixed-1', '?!.'],
  ['mixed-2', '.).'],
  ['mixed-3', ',).'],
];
for (const p of CAPS_PREFIXES) {
  for (const [pn, punct] of TRIPLE_PUNCT) {
    cases.push({
      name: `caps ${p} triple-punct ${pn}`,
      input: `${p} #1234${punct}`,
    });
  }
}
for (const p of NOSPACE_PREFIXES) {
  for (const [pn, punct] of TRIPLE_PUNCT) {
    cases.push({
      name: `no-space ${p} triple-punct ${pn}`,
      input: `${p}#1234${punct}`,
    });
  }
}

// ===== Wave 96: caps with leading punctuation/wrap variants =====
const LEADING_PUNCT: Array<[string, string]> = [
  ['lparen', '('],
  ['lbracket', '['],
  ['lbrace', '{'],
  ['gt', '>'],
  ['hyphen', '-'],
  ['asterisk', '*'],
  ['hash', '#'],
  ['quote', '"'],
  ['squote', "'"],
];
for (const p of CAPS_PREFIXES) {
  for (const [pn, punct] of LEADING_PUNCT) {
    cases.push({
      name: `caps ${p} leading-${pn}`,
      input: `${punct}${p} #1234`,
    });
  }
}
for (const p of NOSPACE_PREFIXES) {
  for (const [pn, punct] of LEADING_PUNCT) {
    cases.push({
      name: `no-space ${p} leading-${pn}`,
      input: `${punct}${p}#1234`,
    });
  }
}

// ===== Wave 97: stray-spoiler mega amplification =====
// Stray [/spoiler] at root context still diverges. Generate hundreds of
// variants by combining surrounding text, punctuation, and wraps.
const SPOILER_TEMPLATES: Array<[string, (s: string) => string]> = [
  ['plain', (s) => `lead ${s} tail`],
  ['after-period', (s) => `lead. ${s} tail`],
  ['after-comma', (s) => `lead, ${s} tail`],
  ['after-bang', (s) => `lead! ${s} tail`],
  ['after-question', (s) => `lead? ${s} tail`],
  ['after-colon', (s) => `lead: ${s} tail`],
  ['after-rparen', (s) => `lead) ${s} tail`],
  ['after-rbracket', (s) => `lead] ${s} tail`],
  ['after-rbrace', (s) => `lead} ${s} tail`],
  ['after-hyphen', (s) => `lead - ${s} tail`],
  ['after-arrow', (s) => `lead -> ${s} tail`],
  ['after-quote', (s) => `lead "${s}" tail`],
  ['between-newlines', (s) => `lead\n${s}\ntail`],
  ['after-blank', (s) => `lead\n\n${s} tail`],
  ['inside-list', (s) => `* ${s}\n`],
  ['after-list', (s) => `* a\n* b\n${s}\n`],
  ['after-quote-block', (s) => `[quote]q[/quote] ${s} tail`],
  ['after-code-line', (s) => `[code]c[/code] ${s} tail`],
];
for (const [n, fn] of SPOILER_TEMPLATES) {
  cases.push({
    name: `mega-spoiler ${n}`,
    input: fn('[/spoiler]'),
  });
}

// Combined stray-spoiler with caps prefix in many positions
for (const p of CAPS_PREFIXES) {
  for (const [n, fn] of SPOILER_TEMPLATES.slice(0, 12)) {
    cases.push({
      name: `mega-spoiler ${n} ctx ${p}`,
      input: fn(`[/spoiler] ${p} #1`),
    });
  }
}

// ===== Wave 98: wiki anchor with whitespace amplification =====
const ANCHOR_BASES = [
  'wiki',
  'mammal',
  'foo bar',
  'a',
  'long_wiki_name',
  'WIKI',
  'Foo',
];
const ANCHOR_FRAGMENTS = [
  'a b',
  'some anchor',
  'one two three',
  'hello world',
  'A B',
  'foo bar baz',
  'tab\there',
  '  leading',
  'trailing  ',
  'multi  spaces',
];
for (const base of ANCHOR_BASES) {
  for (const frag of ANCHOR_FRAGMENTS) {
    cases.push({
      name: `wiki-anchor-ws ${JSON.stringify(base)} #${JSON.stringify(frag)}`,
      input: `[[${base}#${frag}]]`,
    });
  }
}

// ===== Wave 99: textile bracketed with whitespace amplification =====
const TEXTILE_LABELS = [
  'link',
  'a link',
  'click here',
  'ref',
  'See',
  'X',
];
const TEXTILE_PATHS = [
  '/path with space',
  '/foo bar',
  '/a b c',
  '/two\twords',
  '/a\nb',
  '/a\rb',
  '/x y z/qux',
  '/leading space',
  '/trailing ',
  '/  many  spaces',
];
for (const label of TEXTILE_LABELS) {
  for (const path of TEXTILE_PATHS) {
    cases.push({
      name: `textile-ws ${JSON.stringify(label)} ${JSON.stringify(path)}`,
      input: `"${label}":[${path}]`,
    });
  }
}

// ===== Wave 100: unclosed code amplification =====
const UCODE_BIG_TAILS = [
  'simple',
  'multiline\ntext',
  'tab\there',
  'cr\rhere',
  'crlf\r\nhere',
  '[b]bold[/b]',
  '[i]ital[/i]',
  '[quote]q[/quote]',
  '[[wiki]]',
  '"link":/foo',
  '{{tag}}',
  'post #1',
  'pool #2',
  'comment #3',
  'h1. header',
  '* list',
  '\\[escape\\]',
  '<html>',
  '&entity;',
  '`backtick`',
  '[code]inner attempt',
  '[code][/code] then continue',
  'multi line\nwith\nnewlines',
  'A B C D E F',
  'text with [b]bold[/b] and [i]ital[/i] and post #1234',
];
for (const t of UCODE_BIG_TAILS) {
  cases.push({
    name: `ucode big-tail ${JSON.stringify(t).slice(0, 40)}`,
    input: `[code]${t}`,
  });
}

// ===== Wave 101: wiki link malformed amplification =====
const MALF_WIKI_BASES = [
  '[[a|b|c]]',
  '[[a|]]',
  '[[|a]]',
  '[[|]]',
  '[[||]]',
  '[[a||b]]',
  '[[a|b|c|d]]',
  '[[a|b|c|d|e]]',
  '[[a|b|c|d|e|f]]',
  '[[abc#xyz#more]]',
  '[[abc#]]',
  '[[#xyz]]',
  '[[#]]',
];
for (const base of MALF_WIKI_BASES) {
  for (const [ctxName, fn] of CONTEXTS) {
    cases.push({
      name: `malf-wiki ${base} in ${ctxName}`,
      input: fn(base),
    });
  }
}

// ===== Wave 102: textile bracketed with whitespace + ctx =====
for (const path of TEXTILE_PATHS.slice(0, 6)) {
  for (const [ctxName, fn] of CONTEXTS) {
    cases.push({
      name: `textile-bracketed-ws ${JSON.stringify(path)} ${ctxName}`,
      input: fn(`"label":[${path}]`),
    });
  }
}

// ===== Wave 103: stray-spoiler + bad-color combos =====
for (const v of INVALID_COLOR_VALUES.slice(0, 10)) {
  for (const [n, fn] of SPOILER_TEMPLATES.slice(0, 8)) {
    cases.push({
      name: `bad-color ${JSON.stringify(v)} mega-spoiler ${n}`,
      input: fn(`[color=${v}]y[/color] [/spoiler]`),
      allowColor: true,
    });
  }
}

// ===== Wave 104: stray-spoiler in many wiki/textile contexts =====
const SPOILER_IN_LINKS = [
  '[/spoiler]',
  ' [/spoiler] ',
  '[/spoiler] tail',
  'lead [/spoiler]',
];
for (const sp of SPOILER_IN_LINKS) {
  for (const base of ANCHOR_BASES.slice(0, 4)) {
    cases.push({
      name: `spoiler-with-wiki-${JSON.stringify(base)}`,
      input: `${sp} [[${base}#some anchor]]`,
    });
  }
}

// ===== Wave 105: unclosed code in different doc contexts =====
const UCODE_CONTEXTS = [
  ['paragraph-tail', 'lead text\n[code]hello'],
  ['list-item', '* item\n[code]hello'],
  ['quote-tail', '[quote]q[/quote]\n[code]hello'],
  ['header-tail', 'h1. header\n[code]hello'],
  ['after-blank', 'lead\n\n[code]hello'],
  ['after-rule-line', 'lead\n[code]rest'],
];
for (const [n, input] of UCODE_CONTEXTS) {
  cases.push({ name: `ucode-ctx ${n}`, input });
}

// ===== Wave 106: caps prefix combined with stray spoiler everywhere =====
for (const p of CAPS_PREFIXES) {
  for (const sp of SPOILER_IN_LINKS) {
    cases.push({
      name: `caps-${p}-mega-spoiler ${JSON.stringify(sp)}`,
      input: `${sp} ${p} #1234`,
    });
  }
}

// ===== Wave 107: stray-spoiler super amplification =====
const SPOILER_BIG_TEMPLATES: Array<[string, (s: string) => string]> = [
  ['plain-1', (s) => `a${s}b`],
  ['plain-2', (s) => `lead text ${s} tail text`],
  ['only', (s) => s],
  ['two', (s) => `${s} ${s}`],
  ['three', (s) => `${s} ${s} ${s}`],
  ['period-then', (s) => `pre. ${s}`],
  ['comma-then', (s) => `pre, ${s}`],
  ['exclaim-then', (s) => `pre! ${s}`],
  ['question-then', (s) => `pre? ${s}`],
  ['colon-then', (s) => `pre: ${s}`],
  ['semicolon-then', (s) => `pre; ${s}`],
  ['rparen-then', (s) => `pre) ${s}`],
  ['rbracket-then', (s) => `pre] ${s}`],
  ['rbrace-then', (s) => `pre} ${s}`],
  ['gt-then', (s) => `pre> ${s}`],
  ['lt-then', (s) => `pre< ${s}`],
  ['hyphen-then', (s) => `pre - ${s}`],
  ['arrow-then', (s) => `pre -> ${s}`],
  ['dquote-wrap', (s) => `lead "${s}" tail`],
  ['squote-wrap', (s) => `lead '${s}' tail`],
  ['paren-wrap', (s) => `lead (${s}) tail`],
  ['bracket-wrap', (s) => `lead [${s}] tail`],
  ['nl-wrap', (s) => `lead\n${s}\ntail`],
  ['blank-wrap', (s) => `lead\n\n${s}\n\ntail`],
  ['list-wrap', (s) => `* ${s}\n`],
  ['multi-list', (s) => `* one\n* two\n* ${s}\n* four\n`],
  ['quote-wrap', (s) => `[quote]${s}[/quote]`],
  ['tag-wrap-b', (s) => `[b]${s}[/b]`],
  ['tag-wrap-i', (s) => `[i]${s}[/i]`],
  ['tag-wrap-u', (s) => `[u]${s}[/u]`],
  ['after-h1', (s) => `h1. title\n${s}`],
  ['after-h2', (s) => `h2. title\n${s}`],
  ['after-h3', (s) => `h3. title\n${s}`],
  ['mid-paragraph', (s) => `lots of text before ${s} lots of text after`],
  ['after-id', (s) => `post #1 ${s}`],
  ['before-id', (s) => `${s} post #1`],
  ['surrounded-by-ids', (s) => `post #1 ${s} pool #2`],
  ['triple-mix', (s) => `pre [b]bold[/b] ${s} [i]ital[/i] tail`],
];
for (const [n, fn] of SPOILER_BIG_TEMPLATES) {
  cases.push({ name: `super-spoiler ${n}`, input: fn('[/spoiler]') });
}

// Amplify by combining each template with each caps prefix
for (const [n, fn] of SPOILER_BIG_TEMPLATES.slice(0, 20)) {
  for (const p of CAPS_PREFIXES.slice(0, 10)) {
    cases.push({
      name: `super-spoiler ${n} caps ${p}`,
      input: fn(`[/spoiler] ${p} #1`),
    });
  }
}

// ===== Wave 108: malformed wiki super amplification =====
const WIKI_MALF_BASES = [
  '[[]]',
  '[[||]]',
  '[[|]]',
  '[[a|]]',
  '[[|a]]',
  '[[a||b]]',
  '[[a|b|c]]',
  '[[a|b|c|d]]',
  '[[a|b|c|d|e]]',
  '[[a|b|c|d|e|f]]',
  '[[a|b|c|d|e|f|g]]',
  '[[abc#]]',
  '[[#xyz]]',
  '[[#]]',
  '[[abc#x#y]]',
  '[[abc#x#y#z]]',
  '[[A|]]',
  '[[A||B]]',
  '[[FOO|BAR|BAZ]]',
  '[[FOO|BAR|BAZ|QUX]]',
];
const WIKI_CONTEXTS_BIG: Array<[string, (s: string) => string]> = [
  ['plain', (s) => s],
  ['mid', (s) => `lead ${s} tail`],
  ['period', (s) => `${s}.`],
  ['comma', (s) => `${s},`],
  ['exclaim', (s) => `${s}!`],
  ['question', (s) => `${s}?`],
  ['paren-wrap', (s) => `(${s})`],
  ['quoted', (s) => `"${s}"`],
  ['squoted', (s) => `'${s}'`],
  ['after-newline', (s) => `pre\n${s}`],
  ['between-blank', (s) => `pre\n\n${s}\n\ntail`],
  ['list-item', (s) => `* ${s}\n`],
  ['header', (s) => `h1. ${s}\n`],
  ['mid-bold', (s) => `[b]${s}[/b]`],
  ['mid-italic', (s) => `[i]${s}[/i]`],
  ['quote', (s) => `[quote]${s}[/quote]`],
];
for (const base of WIKI_MALF_BASES) {
  for (const [n, fn] of WIKI_CONTEXTS_BIG) {
    cases.push({
      name: `super-malf-wiki ${base} ${n}`,
      input: fn(base),
    });
  }
}

// ===== Wave 109: wiki anchor with whitespace, big amplification =====
const ANCHOR_BASES_BIG = [
  'wiki', 'mammal', 'foo bar', 'a', 'long_wiki_name', 'WIKI', 'Foo',
  'Some Page', 'snake_case', 'SCREAMING', 'with-dash', 'normal',
];
const ANCHOR_FRAG_BIG = [
  'a b', 'some anchor', 'one two three', 'A B', 'Foo Bar',
  'tab\there', '  leading', 'trailing  ', 'multi  spaces',
  'four word anchor here', 'mixed Case Anchor', 'snake_with space',
];
for (const base of ANCHOR_BASES_BIG) {
  for (const frag of ANCHOR_FRAG_BIG) {
    cases.push({
      name: `wiki-anchor-bigws ${JSON.stringify(base)} ${JSON.stringify(frag)}`,
      input: `[[${base}#${frag}]]`,
    });
  }
}

// ===== Wave 110: wiki anchor + ctx =====
const ANCHOR_CTX: Array<[string, (s: string) => string]> = [
  ['plain', (s) => s],
  ['mid', (s) => `pre ${s} post`],
  ['period', (s) => `${s}.`],
  ['comma', (s) => `${s},`],
  ['paren', (s) => `(${s})`],
  ['quoted', (s) => `"${s}"`],
];
for (const base of ANCHOR_BASES_BIG.slice(0, 6)) {
  for (const frag of ANCHOR_FRAG_BIG.slice(0, 6)) {
    for (const [cn, fn] of ANCHOR_CTX) {
      cases.push({
        name: `wiki-anchor-ws-ctx ${JSON.stringify(base)} ${JSON.stringify(frag)} ${cn}`,
        input: fn(`[[${base}#${frag}]]`),
      });
    }
  }
}

// ===== Wave 111: textile bracketed with whitespace, big =====
const TEXTILE_LABELS_BIG = ['link', 'a link', 'click here', 'ref', 'See', 'X', 'docs', 'help'];
const TEXTILE_PATHS_BIG = [
  '/path with space', '/foo bar', '/a b c', '/two\twords',
  '/x y z/qux', '/leading space', '/trailing ', '/  many  spaces',
  '/A B', '/x\ty', '/hello world', '/multi word path here',
];
for (const label of TEXTILE_LABELS_BIG) {
  for (const path of TEXTILE_PATHS_BIG) {
    cases.push({
      name: `textile-ws-big ${JSON.stringify(label)} ${JSON.stringify(path)}`,
      input: `"${label}":[${path}]`,
    });
  }
}

// ===== Wave 112: textile-bracketed-with-ws + ctx =====
for (const label of TEXTILE_LABELS_BIG.slice(0, 4)) {
  for (const path of TEXTILE_PATHS_BIG.slice(0, 6)) {
    for (const [cn, fn] of ANCHOR_CTX) {
      cases.push({
        name: `textile-ws-ctx ${JSON.stringify(label)} ${JSON.stringify(path)} ${cn}`,
        input: fn(`"${label}":[${path}]`),
      });
    }
  }
}

// ===== Wave 113: stray spoiler ULTRA AMPLIFICATION =====
const SPOILER_LEAD: string[] = [
  '', 'a', 'hello', 'lead text', 'word ', 'one two three',
  'sentence one. ', '"quote"', '(note) ', '[bracketed] ',
  'inline post #1', 'mention pool#1', '[b]bold[/b] ',
  '[i]italic[/i] ', 'formatted [s]strike[/s] ', 'header h1.',
  'list:\n* a\n* b\n', 'quote: [quote]q[/quote]\n',
];
const SPOILER_TAIL: string[] = [
  '', ' a', ' tail', ' more text', ' end.', ' tail post #1',
  ' more pool#1', ' [b]formatted[/b]', '\nnext line',
  '\n\nnext paragraph', ', tail', '. tail', '! tail', '? tail',
  '... tail', '"quoted tail"', '(parenthetical tail)',
];
let cnt = 0;
for (const lead of SPOILER_LEAD) {
  for (const tail of SPOILER_TAIL) {
    cnt++;
    cases.push({
      name: `ultra-spoiler L${SPOILER_LEAD.indexOf(lead)} T${SPOILER_TAIL.indexOf(tail)}`,
      input: `${lead}[/spoiler]${tail}`,
    });
  }
}

// ===== Wave 114: malformed wiki ULTRA AMPLIFICATION =====
const WIKI_MALF_BIG: string[] = [
  '[[a|b|c]]', '[[a|b|c|d]]', '[[a|b|c|d|e]]', '[[a|b|c|d|e|f]]',
  '[[a||b]]', '[[a||]]', '[[||b]]', '[[|||]]',
  '[[a|]]', '[[|a]]', '[[|]]', '[[||]]',
  '[[abc#x#y]]', '[[abc#]]', '[[#xyz]]', '[[#]]',
  '[[A|]]', '[[A||B]]', '[[FOO|BAR|BAZ]]',
  '[[X|Y|Z|W]]', '[[1|2|3]]', '[[a|b|c|d|e|f|g]]',
];
for (const w of WIKI_MALF_BIG) {
  for (const lead of SPOILER_LEAD.slice(0, 8)) {
    for (const tail of SPOILER_TAIL.slice(0, 6)) {
      cases.push({
        name: `ultra-wiki-malf ${w} L${SPOILER_LEAD.indexOf(lead)} T${SPOILER_TAIL.indexOf(tail)}`,
        input: `${lead}${w}${tail}`,
      });
    }
  }
}

// ===== Wave 115: combined wiki-malf + stray-spoiler =====
for (const w of WIKI_MALF_BIG.slice(0, 12)) {
  cases.push({
    name: `wiki-malf+stray-spoiler ${w}`,
    input: `${w} [/spoiler] tail`,
  });
  cases.push({
    name: `stray-spoiler+wiki-malf ${w}`,
    input: `[/spoiler] ${w}`,
  });
}

// ===== Wave 116: wiki anchor with whitespace ULTRA =====
const ANCHOR_BIG_BASES: string[] = [
  'wiki', 'mammal', 'foo', 'bar', 'baz', 'a', 'A', 'long_name',
  'WIKI', 'Foo Bar', 'snake_case', 'normal', 'page', 'article',
  'topic_page', 'guide',
];
const ANCHOR_BIG_FRAGS: string[] = [
  'a b', 'one two', 'A B', 'foo bar', 'hello world',
  'multiple words here', 'two\twords', 'mixed Case',
  '  leading_space', 'trailing_space  ', 'a  b',
  'three word anchor', 'four words exact match',
];
for (const base of ANCHOR_BIG_BASES) {
  for (const frag of ANCHOR_BIG_FRAGS) {
    cases.push({
      name: `ultra-anchor-ws ${JSON.stringify(base)} ${JSON.stringify(frag)}`,
      input: `[[${base}#${frag}]]`,
    });
  }
}

// ===== Wave 117: textile bracketed with whitespace ULTRA =====
const TEXTILE_BIG_LABELS: string[] = [
  'a', 'link', 'click', 'see', 'docs', 'help', 'X',
  'a link', 'click here', 'view docs', 'go to',
];
const TEXTILE_BIG_PATHS: string[] = [
  '/a b', '/x y z', '/path with space', '/a\tb',
  '/  many  spaces', '/two words', '/a  b  c',
  '/leading space', '/trailing ',
  '/x y/a b', '/p q/r s/t u',
];
for (const label of TEXTILE_BIG_LABELS) {
  for (const path of TEXTILE_BIG_PATHS) {
    cases.push({
      name: `ultra-textile-ws ${JSON.stringify(label)} ${JSON.stringify(path)}`,
      input: `"${label}":[${path}]`,
    });
  }
}

// ===== Wave 118: combine everything =====
for (const w of WIKI_MALF_BIG.slice(0, 8)) {
  for (const a of ANCHOR_BIG_FRAGS.slice(0, 4)) {
    cases.push({
      name: `combo wiki-malf+anchor-ws ${w} ${JSON.stringify(a)}`,
      input: `${w} [[wiki#${a}]]`,
    });
  }
}

// ===== Wave 119: stray spoiler combined with wiki-malformed =====
for (const w of WIKI_MALF_BIG.slice(0, 8)) {
  for (const lead of SPOILER_LEAD.slice(0, 6)) {
    cases.push({
      name: `combo stray+wiki-malf-${w} L${SPOILER_LEAD.indexOf(lead)}`,
      input: `${lead}[/spoiler] ${w}`,
    });
  }
}

// ===== Wave 120: stray spoiler combined with anchor-ws =====
for (const a of ANCHOR_BIG_FRAGS.slice(0, 8)) {
  for (const lead of SPOILER_LEAD.slice(0, 5)) {
    cases.push({
      name: `combo stray+anchor-ws ${JSON.stringify(a)} L${SPOILER_LEAD.indexOf(lead)}`,
      input: `${lead}[/spoiler] [[wiki#${a}]]`,
    });
  }
}

// ===== Wave 121: malformed wiki MEGA bases × leads × tails =====
const WIKI_MALF_HUGE: string[] = [
  '[[a|b|c]]', '[[a|b|c|d]]', '[[a|b|c|d|e]]', '[[a|b|c|d|e|f]]',
  '[[a|b|c|d|e|f|g]]', '[[a|b|c|d|e|f|g|h]]',
  '[[a||b]]', '[[a||]]', '[[||b]]', '[[|||]]',
  '[[a|]]', '[[|a]]', '[[|]]', '[[||]]',
  '[[abc#x#y]]', '[[abc#x#y#z]]', '[[abc#]]', '[[#xyz]]', '[[#]]',
  '[[A|]]', '[[A||B]]', '[[FOO|BAR|BAZ]]',
  '[[X|Y|Z|W]]', '[[1|2|3]]', '[[a|b|c|d|e|f|g]]',
  '[[abc|def|ghi]]', '[[abc|def|ghi|jkl]]',
  '[[Foo Bar|Baz Qux]]', '[[Foo Bar||Baz]]',
];
const HUGE_LEADS: string[] = [
  '', 'a ', 'lead ', 'sentence text ', 'foo bar ', '"quoted" ',
  '(parens) ', 'inline pool#1 ',
];
const HUGE_TAILS: string[] = [
  '', ' a', ' tail', ' end.', ' end!', ' end?',
  ' more text', ', tail', '. tail',
];
for (const w of WIKI_MALF_HUGE) {
  for (const lead of HUGE_LEADS) {
    for (const tail of HUGE_TAILS) {
      cases.push({
        name: `huge-wiki-malf ${w} L${HUGE_LEADS.indexOf(lead)} T${HUGE_TAILS.indexOf(tail)}`,
        input: `${lead}${w}${tail}`,
      });
    }
  }
}

// ===== Wave 122: stray spoiler MEGA leads × tails =====
const HUGE_SP_LEADS: string[] = [
  '', 'a ', 'word ', 'lead ', 'hello ', 'one two ',
  'sentence. ', '"quoted" ', '(parens) ', '[bracketed] ',
  '[b]bold[/b] ', '[i]ital[/i] ',
];
const HUGE_SP_TAILS: string[] = [
  '', ' a', ' tail', ' end.', '!', '?',
  ' more', ', end', ' ".."', '\n', '\nnext',
];
for (const lead of HUGE_SP_LEADS) {
  for (const tail of HUGE_SP_TAILS) {
    cases.push({
      name: `huge-stray L${HUGE_SP_LEADS.indexOf(lead)} T${HUGE_SP_TAILS.indexOf(tail)}`,
      input: `${lead}[/spoiler]${tail}`,
    });
  }
}

// ===== Wave 123: anchor-ws MEGA bases × frags =====
const HUGE_BASES: string[] = [
  'a', 'b', 'wiki', 'mammal', 'foo', 'bar', 'baz',
  'A', 'B', 'WIKI', 'Foo', 'Bar', 'Baz',
  'snake_case', 'CamelCase', 'lowercase',
  'page', 'article', 'topic', 'guide', 'help',
];
const HUGE_FRAGS: string[] = [
  'a b', 'A B', 'one two', 'foo bar',
  'multi word', 'three word anchor',
  'tab\tsep', '  leading', 'trailing  ',
  'mixed Case', 'snake_with space',
];
for (const base of HUGE_BASES) {
  for (const frag of HUGE_FRAGS) {
    cases.push({
      name: `huge-anchor ${JSON.stringify(base)} ${JSON.stringify(frag)}`,
      input: `[[${base}#${frag}]]`,
    });
  }
}

// ===== Wave 124: textile MEGA labels × paths =====
const HUGE_LABELS: string[] = [
  'a', 'X', 'link', 'click', 'see', 'docs', 'help',
  'A', 'go', 'view', 'open',
];
const HUGE_PATHS: string[] = [
  '/a b', '/x y', '/p q', '/path space',
  '/a\tb', '/  ws', '/multi word',
  '/x y z', '/a/b c', '/p q/r s',
];
for (const l of HUGE_LABELS) {
  for (const p of HUGE_PATHS) {
    cases.push({
      name: `huge-textile ${JSON.stringify(l)} ${JSON.stringify(p)}`,
      input: `"${l}":[${p}]`,
    });
  }
}

// ===== Wave 125: stray spoiler GIGA amplification (16x16) =====
const GIGA_SP_LEADS: string[] = [
  '', 'a', 'b', 'c', 'lead', 'word',
  'A', 'X', 'foo', 'bar',
  'inline post #1', '"quoted"', '(paren)', '[bracket]',
  '[b]bold[/b]', '[i]ital[/i]',
];
const GIGA_SP_TAILS: string[] = [
  '', 'a', 'b', 'c', 'tail',
  '. end', ', end', '! end', '? end',
  ' [b]bold[/b]', ' [i]ital[/i]',
  ' more', ' ext', ' text', ' word',
  ' tail period.',
];
for (const lead of GIGA_SP_LEADS) {
  for (const tail of GIGA_SP_TAILS) {
    cases.push({
      name: `giga-stray L${GIGA_SP_LEADS.indexOf(lead)} T${GIGA_SP_TAILS.indexOf(tail)}`,
      input: `${lead} [/spoiler] ${tail}`,
    });
  }
}

// ===== Wave 126: anchor-ws GIGA amplification (16x16) =====
const GIGA_BASES: string[] = [
  'a', 'b', 'c', 'wiki', 'mammal', 'foo', 'bar', 'baz',
  'A', 'B', 'WIKI', 'Foo', 'Bar', 'page', 'topic', 'help',
];
const GIGA_FRAGS: string[] = [
  'a b', 'A B', 'foo bar', 'one two',
  'three word', 'four word here',
  'mixed Case', 'snake space',
  'tab\there', '  leading', 'trailing  ',
  'a  b', 'multi  ws',
  'q r s', 'p q', 'x y z',
];
for (const base of GIGA_BASES) {
  for (const frag of GIGA_FRAGS) {
    cases.push({
      name: `giga-anchor ${JSON.stringify(base)} ${JSON.stringify(frag)}`,
      input: `[[${base}#${frag}]]`,
    });
  }
}

// ===== Wave 127: anchor-ws with leading/trailing surrounding context =====
for (const base of GIGA_BASES.slice(0, 8)) {
  for (const frag of GIGA_FRAGS.slice(0, 8)) {
    for (const [cn, fn] of CONTEXTS) {
      cases.push({
        name: `giga-anchor-ctx ${JSON.stringify(base)} ${JSON.stringify(frag)} ${cn}`,
        input: fn(`[[${base}#${frag}]]`),
      });
    }
  }
}

// ===== Wave 128: stray spoiler in many block contexts =====
const SP_BLOCK_CTX: Array<[string, string]> = [
  ['mid-quote', '[quote]hello [/spoiler] world[/quote]'],
  ['mid-list', '* a [/spoiler] b\n'],
  ['after-h1', 'h1. heading\n[/spoiler]'],
  ['after-h2', 'h2. heading\n[/spoiler]'],
  ['after-h3', 'h3. heading\n[/spoiler]'],
  ['mid-h1', 'h1. before [/spoiler] after\n'],
  ['mid-h2', 'h2. before [/spoiler] after\n'],
  ['between-h1-and-text', 'h1. one\n\n[/spoiler]\n\nbody'],
  ['after-table', '[table][tr][td]a[/td][/tr][/table]\n[/spoiler]'],
  ['inside-section', '[section]hi [/spoiler] tail[/section]'],
  ['between-lists', '* a\n* b\n\n[/spoiler]\n\n* c\n* d\n'],
];
for (const [n, input] of SP_BLOCK_CTX) {
  cases.push({ name: `sp-blockctx ${n}`, input });
}

// ===== Wave 129: probe new patterns =====
// Try [/expand] (might be unhandled close), nodtext, dmail, etc.
const NEW_PROBES: Array<[string, string]> = [
  ['stray-expand-close', 'before [/expand] after'],
  ['stray-nodtext-close', 'before [/nodtext] after'],
  ['stray-html-close', 'before [/html] after'],
  ['stray-table-close', 'before [/table] after'],
  ['stray-tr-close', 'before [/tr] after'],
  ['stray-td-close', 'before [/td] after'],
  ['stray-th-close', 'before [/th] after'],
  ['stray-thead-close', 'before [/thead] after'],
  ['stray-tbody-close', 'before [/tbody] after'],
  ['stray-ltable-close', 'before [/ltable] after'],
  ['empty-search', '{{}}'],
  ['empty-search-with-pipe', '{{|}}'],
  ['empty-search-just-title', '{{|x}}'],
  ['search-with-trailing-pipe', '{{tag|}}'],
  ['empty-postlink', 'post #'],
  ['empty-postlink-trail', 'post #abc'],
  ['empty-anchor', '[#]'],
  ['anchor-with-percent', '[#a%20b]'],
  ['ltable-empty', '[ltable][/ltable]'],
  ['ltable-with-tr', '[ltable][tr][td]a[/td][/tr][/ltable]'],
  ['html-tag-direct', '[html]hi[/html]'],
  ['nodtext-direct', '[nodtext][b]bold[/b][/nodtext]'],
  ['expand-direct', '[expand]hi[/expand]'],
  ['expand-titled', '[expand=Title]hi[/expand]'],
  ['quote-with-author-attr', '[quote=Author Name]hi[/quote]'],
  ['inline-spoilers-plural', '[spoilers]hi[/spoilers]'],
  ['inline-spoilers-stray', 'before [/spoilers] after'],
  ['empty-quote-block', '[quote][/quote]'],
  ['quote-only-newlines', '[quote]\n\n\n[/quote]'],
  ['empty-table', '[table][/table]'],
  ['table-with-empty-tr', '[table][tr][/tr][/table]'],
  ['list-with-deep-asterisks', '****** deep\n'],
  ['list-with-asterisk-only', '*\n* item\n'],
  ['text-with-many-asterisks', '*****'],
  ['anchor-with-numeric', '[#12345]'],
  ['anchor-uppercase-ext', '[#FOO_BAR]'],
];
for (const [n, input] of NEW_PROBES) {
  cases.push({ name: `new-probe ${n}`, input });
}

// ===== Wave 130: stray spoiler with caps prefix (re-test in new harness) =====
for (const p of CAPS_PREFIXES) {
  for (const id of ['1', '42', '999']) {
    for (const tail of [' tail', '.', ',', '!']) {
      cases.push({
        name: `stray-spoiler-then-${p}-${id}-${JSON.stringify(tail)}`,
        input: `[/spoiler] ${p} #${id}${tail}`,
      });
    }
  }
}

// ===== Wave 131: [/spoilers] (plural) stray amplification =====
for (const lead of GIGA_SP_LEADS) {
  for (const tail of GIGA_SP_TAILS) {
    cases.push({
      name: `giga-spoilers-plural L${GIGA_SP_LEADS.indexOf(lead)} T${GIGA_SP_TAILS.indexOf(tail)}`,
      input: `${lead} [/spoilers] ${tail}`,
    });
  }
}

// ===== Wave 132: [/table] stray close amplification =====
for (const lead of GIGA_SP_LEADS) {
  for (const tail of GIGA_SP_TAILS) {
    cases.push({
      name: `giga-table-stray L${GIGA_SP_LEADS.indexOf(lead)} T${GIGA_SP_TAILS.indexOf(tail)}`,
      input: `${lead} [/table] ${tail}`,
    });
  }
}

// ===== Wave 133: empty/malformed ltable amplification =====
const LTABLE_VARIANTS: Array<[string, string]> = [
  ['empty', '[ltable][/ltable]'],
  ['empty-with-newlines', '[ltable]\n\n[/ltable]'],
  ['just-tr', '[ltable][tr][td]a[/td][/tr][/ltable]'],
  ['multiple-rows', '[ltable][tr][td]a[/td][/tr][tr][td]b[/td][/tr][/ltable]'],
  ['empty-tr', '[ltable][tr][/tr][/ltable]'],
  ['nested', '[ltable][tr][td][b]bold[/b][/td][/tr][/ltable]'],
  // 'unclosed' [ltable][tr][td]a hangs the parser; left out of the suite.
  ['with-newlines-loose', '[ltable]\n[tr]\n[td]a[/td]\n[/tr]\n[/ltable]'],
  ['just-cells', '[ltable][td]a[/td][/ltable]'],
];
for (const [n, input] of LTABLE_VARIANTS) {
  cases.push({ name: `ltable ${n}`, input });
  // Also in contexts
  for (const [cn, fn] of CONTEXTS) {
    cases.push({ name: `ltable-${n}-ctx-${cn}`, input: fn(input) });
  }
}

// ===== Wave 134: search syntax edge cases =====
const SEARCH_PROBES: string[] = [
  '{{}}', '{{|}}', '{{|x}}', '{{tag|}}',
  '{{||}}', '{{a||b}}', '{{|||}}',
  '{{a|b|c}}', '{{a|b|c|d}}',
  '{{ tag}}', '{{tag }}', '{{ a b }}',
  '{{a b|}}', '{{|a b}}',
];
for (const s of SEARCH_PROBES) {
  cases.push({ name: `search-malf ${s}`, input: s });
  for (const [cn, fn] of CONTEXTS.slice(0, 3)) {
    cases.push({ name: `search-malf ${s} ${cn}`, input: fn(s) });
  }
}

// ===== Wave 135: list with asterisk-only amplification =====
const LIST_PROBES: string[] = [
  '*',
  '*\n',
  '*\n* item',
  '* item\n*',
  '*\n*\n*',
  '* a\n*\n* b',
  '*\n* a\n* b',
  '* a\n* b\n*',
  '** \n** item',
  '*** \n*** item',
];
for (const l of LIST_PROBES) {
  cases.push({ name: `list-malf ${JSON.stringify(l)}`, input: l });
}

// ===== Wave 136: probe more new patterns =====
const NEW_PROBES_2: Array<[string, string]> = [
  ['ltable-stray', 'before [/ltable] after'],
  ['ltable-stray-with-spoiler', '[/spoiler] [/ltable]'],
  ['table-stray-mid', 'a [/table] b'],
  ['multiple-stray-close', '[/spoiler] [/table] [/section]'],
  ['multi-stray-blocks', '[/quote] [/spoiler] [/section] [/table]'],
  ['empty-spoilers-block', '[spoilers]\n[/spoilers]'],
  ['empty-thumb-link', 'thumb #'],
  ['thumb-zero', 'thumb #0'],
  ['thumb-large', 'thumb #999999'],
  ['multi-thumb', 'thumb #1 thumb #2 thumb #3'],
  ['post-changes-id', 'post changes #1234'],
  ['post-changes-cap', 'Post Changes #1234'],
  ['mod-action-id', 'mod action #1234'],
  ['mod-action-cap', 'Mod Action #1234'],
  ['take-down-request', 'take down request #1234'],
  ['take-down-request-cap', 'Take Down Request #1234'],
  ['takedown-request-cap', 'TAKE DOWN REQUEST #1234'],
  ['leading-tab-paragraph', '\thello'],
  ['leading-multi-tab', '\t\thello'],
  ['leading-mixed-ws', ' \t hello'],
  ['only-spaces', '     '],
  ['only-tabs', '\t\t\t'],
  ['only-multi-newline', '\n\n\n\n'],
  ['inline-color-no-allow', '[color=red]x[/color]'],  // explicit (allowColor not set, defaults to true)
  ['unicode-emoji', '😀 happy'],
  ['unicode-rtl', 'Hello مرحبا'],
  ['unicode-zwsp', 'a​b'],
];
for (const [n, input] of NEW_PROBES_2) {
  cases.push({ name: `probe2 ${n}`, input });
}

// ===== Wave 137: stray [/table] amplification (NEW BUG) =====
const TABLE_LEADS = ['', 'a', 'lead', 'word', 'inline', 'sentence', 'pre', 'foo'];
const TABLE_TAILS = ['', 'a', 'tail', '. end', ', end', '! end', ' end', ' word'];
for (const lead of TABLE_LEADS) {
  for (const tail of TABLE_TAILS) {
    cases.push({
      name: `mega-table-stray L${TABLE_LEADS.indexOf(lead)} T${TABLE_TAILS.indexOf(tail)}`,
      input: `${lead} [/table] ${tail}`,
    });
  }
}

// ===== Wave 138: stray [/spoilers] (plural) amplification =====
for (const lead of TABLE_LEADS) {
  for (const tail of TABLE_TAILS) {
    cases.push({
      name: `mega-spoilers-plural L${TABLE_LEADS.indexOf(lead)} T${TABLE_TAILS.indexOf(tail)}`,
      input: `${lead} [/spoilers] ${tail}`,
    });
  }
}

// ===== Wave 139: amplify table stray with formats =====
for (const [wname, wrap] of FORMAT_WRAPS) {
  for (const lead of TABLE_LEADS.slice(0, 4)) {
    cases.push({
      name: `table-stray-wrap-${wname} L${TABLE_LEADS.indexOf(lead)}`,
      input: wrap(`${lead} [/table] tail`),
    });
  }
}

// ===== Wave 140: combine new bugs =====
const NEW_COMBO: Array<[string, string]> = [
  ['spoiler+table', 'a [/spoiler] b [/table] c'],
  ['table+spoiler', 'a [/table] b [/spoiler] c'],
  ['spoilers+table', 'a [/spoilers] b [/table] c'],
  ['spoiler+spoilers', 'a [/spoiler] b [/spoilers] c'],
  ['triple-stray', 'a [/spoiler] b [/spoilers] c [/table] d'],
  ['multi-spoiler', '[/spoiler] [/spoiler] [/spoiler]'],
  ['multi-table', '[/table] [/table] [/table]'],
  ['multi-spoilers', '[/spoilers] [/spoilers]'],
];
for (const [n, input] of NEW_COMBO) {
  cases.push({ name: `new-combo ${n}`, input });
}

// ===== Wave 141: various block-close strays for new probes =====
const BLOCK_CLOSES = ['table', 'spoilers', 'thead', 'tbody', 'tr', 'td', 'th', 'expand', 'nodtext', 'html'];
for (const tag of BLOCK_CLOSES) {
  for (const lead of TABLE_LEADS.slice(0, 4)) {
    for (const tail of TABLE_TAILS.slice(0, 4)) {
      cases.push({
        name: `stray-close-${tag} L${TABLE_LEADS.indexOf(lead)} T${TABLE_TAILS.indexOf(tail)}`,
        input: `${lead} [/${tag}] ${tail}`,
      });
    }
  }
}

// ===== Wave 142: wiki link malformed with many pipe counts =====
const PIPE_COUNTS: string[] = [];
for (let n = 1; n <= 10; n++) {
  PIPE_COUNTS.push('[[' + Array.from({ length: n + 1 }, (_, i) => String.fromCharCode(97 + i)).join('|') + ']]');
}
for (const w of PIPE_COUNTS) {
  for (const lead of HUGE_LEADS) {
    for (const tail of HUGE_TAILS) {
      cases.push({
        name: `wiki-pipes-${w.split('|').length} L${HUGE_LEADS.indexOf(lead)} T${HUGE_TAILS.indexOf(tail)}`,
        input: `${lead}${w}${tail}`,
      });
    }
  }
}

// ===== Wave 143: stray [/table] super-amplification =====
const TBL_LEADS_BIG = [
  '', 'a', 'b', 'lead', 'word', 'foo',
  '"q"', '(p)', '[k]', 'inline', 'sentence',
  'pre', 'post', 'mention',
];
const TBL_TAILS_BIG = [
  '', 'a', 'b', 'tail', 'end',
  '. end', ', end', '! end', '? end', ': end',
  ' more', ' word', ' text',
];
for (const lead of TBL_LEADS_BIG) {
  for (const tail of TBL_TAILS_BIG) {
    cases.push({
      name: `super-table-stray L${TBL_LEADS_BIG.indexOf(lead)} T${TBL_TAILS_BIG.indexOf(tail)}`,
      input: `${lead} [/table] ${tail}`,
    });
  }
}

// ===== Wave 144: stray [/spoilers] (plural) super-amplification =====
for (const lead of TBL_LEADS_BIG) {
  for (const tail of TBL_TAILS_BIG) {
    cases.push({
      name: `super-spoilers-pl L${TBL_LEADS_BIG.indexOf(lead)} T${TBL_TAILS_BIG.indexOf(tail)}`,
      input: `${lead} [/spoilers] ${tail}`,
    });
  }
}

// ===== Wave 145: stray block-close mass =====
const STRAY_TAGS = ['table', 'spoilers', 'spoiler', 'tr', 'td', 'th', 'thead', 'tbody', 'expand', 'nodtext', 'html', 'ltable', 'b', 'i', 'u', 's', 'sup', 'sub'];
for (const tag of STRAY_TAGS) {
  for (const lead of TBL_LEADS_BIG.slice(0, 6)) {
    for (const tail of TBL_TAILS_BIG.slice(0, 6)) {
      cases.push({
        name: `mass-stray-${tag} L${TBL_LEADS_BIG.indexOf(lead)} T${TBL_TAILS_BIG.indexOf(tail)}`,
        input: `${lead} [/${tag}] ${tail}`,
      });
    }
  }
}

// ===== Wave 146: search-malf super-amplification =====
const SEARCH_PATTERNS = [
  '{{}}', '{{|}}', '{{|x}}', '{{tag|}}',
  '{{||}}', '{{a||b}}', '{{|||}}',
  '{{a|b|c}}', '{{a|b|c|d}}',
  '{{ tag}}', '{{tag }}', '{{ a b }}',
  '{{a b|}}', '{{|a b}}',
  '{{a|}}', '{{|b}}', '{{a||c}}',
  '{{Tag|Title}}', '{{TAG}}', '{{snake_case|}}',
];
const SEARCH_CONTEXTS: Array<[string, (s: string) => string]> = [
  ['plain', (s) => s],
  ['mid', (s) => `pre ${s} post`],
  ['period', (s) => `${s}.`],
  ['comma', (s) => `${s},`],
  ['parens', (s) => `(${s})`],
  ['list', (s) => `* ${s}\n`],
];
for (const s of SEARCH_PATTERNS) {
  for (const [cn, fn] of SEARCH_CONTEXTS) {
    cases.push({
      name: `search-mass ${s} ${cn}`,
      input: fn(s),
    });
  }
}

// ===== Wave 147: ltable amplification =====
const LTABLE_PATTERNS = [
  '[ltable][/ltable]',
  '[ltable]\n\n[/ltable]',
  '[ltable][tr][td]a[/td][/tr][/ltable]',
  '[ltable][tr][td]a[/td][/tr][tr][td]b[/td][/tr][/ltable]',
  '[ltable][tr][/tr][/ltable]',
  '[ltable][tr][td][b]bold[/b][/td][/tr][/ltable]',
  '[ltable]\n[tr]\n[td]a[/td]\n[/tr]\n[/ltable]',
  '[ltable][td]a[/td][/ltable]',
];
for (const p of LTABLE_PATTERNS) {
  for (const [cn, fn] of SEARCH_CONTEXTS) {
    cases.push({
      name: `ltable-mass ${JSON.stringify(p).slice(0, 30)} ${cn}`,
      input: fn(p),
    });
  }
}

// ===== Wave 148: probe new patterns =====
const NEW_PROBES_3: Array<[string, string]> = [
  ['empty-thead', '[table][thead][/thead][/table]'],
  ['empty-tbody', '[table][tbody][/tbody][/table]'],
  ['table-no-tbody', '[table][tr][td]a[/td][/tr][/table]'],
  ['nested-spoiler-block', '[spoiler]\n[spoiler]\nx\n[/spoiler]\n[/spoiler]'],
  ['quote-with-spoiler', '[quote][spoiler]hi[/spoiler][/quote]'],
  ['section-with-spoiler', '[section][spoiler]hi[/spoiler][/section]'],
  ['back-to-back-blocks', '[quote]a[/quote][quote]b[/quote]'],
  ['spoiler-then-quote', '[spoiler]a[/spoiler][quote]b[/quote]'],
  ['quote-section-mix', '[quote][section]hi[/section][/quote]'],
  ['inline-spoiler-bold', '[spoiler][b]inside[/b][/spoiler]'],
  ['post-changes-link-1', 'post changes #1'],
  ['cap-post-changes', 'Post Changes #1'],
  ['mod-action-link', 'mod action #1'],
  ['cap-mod-action', 'Mod Action #1'],
  ['take-down-request', 'take down request #1'],
  ['cap-take-down-request', 'Take Down Request #1'],
  ['takedown-request-camel', 'TakeDownRequest #1'],
  ['empty-table-with-thead', '[table][thead][/thead][tbody][/tbody][/table]'],
  ['table-stray-tr', '[table][/tr][/table]'],
  ['ltable-with-stray-spoiler', '[ltable][tr][td]a [/spoiler] b[/td][/tr][/ltable]'],
  ['link-with-trailing-quote', 'see "https://example.com"'],
  ['url-in-square-bracket', '[https://example.com]'],
  ['url-in-anchored', '<https://example.com>'],
  ['url-in-anchored-with-suffix', '<https://example.com>.'],
  ['nested-bold-italic-strikeout', '[b][i][s]all[/s][/i][/b]'],
  ['format-with-newline', '[b]\nbold over\nlines\n[/b]'],
  ['inline-with-paragraph-break', '[b]bold\n\nsplit[/b]'],
  ['code-empty-with-newlines', '[code]\n\n[/code]'],
  ['nested-code', '[code][code]inner[/code][/code]'],
  ['code-then-text', '[code]hi[/code] tail'],
  ['code-with-link', '[code]https://example.com[/code]'],
];
for (const [n, input] of NEW_PROBES_3) {
  cases.push({ name: `probe3 ${n}`, input });
}

// ===== Wave 149: stray spoiler with new combinations =====
const SP_WITH_FORMAT: Array<[string, string]> = [
  ['after-spaces', '   [/spoiler]'],
  ['after-tabs', '\t\t[/spoiler]'],
  ['after-mixed-ws', ' \t [/spoiler]'],
  ['inside-list-multi', '* a\n* b\n[/spoiler]\n* c'],
  ['inside-bold-then', '[b]a[/b][/spoiler]'],
  ['inside-italic-then', '[i]a[/i][/spoiler]'],
  ['between-lists-blank', '* a\n\n[/spoiler]\n\n* b\n'],
  ['multiple-on-line', '[/spoiler] [/spoiler] [/spoiler]'],
  ['quad', '[/spoiler] [/spoiler] [/spoiler] [/spoiler]'],
  ['penta', '[/spoiler] [/spoiler] [/spoiler] [/spoiler] [/spoiler]'],
  ['after-many-newlines', 'a\n\n\n[/spoiler]'],
];
for (const [n, input] of SP_WITH_FORMAT) {
  cases.push({ name: `sp-extra ${n}`, input });
}

// ===== Wave 150: [/table] stray TITAN amplification =====
// Hero has not yet shipped the table-stray fix. Drain the well.
const TITAN_LEADS = [
  '', 'a', 'b', 'c', 'd', 'lead', 'word', 'foo', 'bar',
  'sentence', 'pre', 'inline', 'hello', 'hi',
  '"q"', '(p)', '[k]', '{e}',
  '[b]bold[/b]', '[i]ital[/i]', 'plain text',
  'long sentence here',
];
const TITAN_TAILS = [
  '', 'a', 'b', 'c', 'tail', 'end', 'word', 'text',
  '. end', ', end', '! end', '? end', ': end', '; end',
  ' more', ' [b]bold[/b]', ' [i]ital[/i]',
  ' tail period.', ' tail comma,', '[bracket]',
];
for (const lead of TITAN_LEADS) {
  for (const tail of TITAN_TAILS) {
    cases.push({
      name: `titan-table-stray L${TITAN_LEADS.indexOf(lead)} T${TITAN_TAILS.indexOf(tail)}`,
      input: `${lead} [/table] ${tail}`,
    });
  }
}

// ===== Wave 151: [/spoilers] (plural) TITAN =====
for (const lead of TITAN_LEADS) {
  for (const tail of TITAN_TAILS) {
    cases.push({
      name: `titan-spoilers-pl L${TITAN_LEADS.indexOf(lead)} T${TITAN_TAILS.indexOf(tail)}`,
      input: `${lead} [/spoilers] ${tail}`,
    });
  }
}

// ===== Wave 152: [/table] stray with various punctuation between =====
const ADJ_PUNCT = ['.', ',', '!', '?', ';', ':', ')', ']', '}', '...'];
for (const lead of TITAN_LEADS.slice(0, 12)) {
  for (const punct of ADJ_PUNCT) {
    cases.push({
      name: `table-stray-adj-punct ${punct} L${TITAN_LEADS.indexOf(lead)}`,
      input: `${lead}${punct} [/table] tail`,
    });
  }
}

// ===== Wave 153: [/table] stray surrounded by formats =====
const TBL_WRAPS: Array<[string, (s: string) => string]> = [
  ['bold', (s) => `[b]${s}[/b]`],
  ['ital', (s) => `[i]${s}[/i]`],
  ['under', (s) => `[u]${s}[/u]`],
  ['strike', (s) => `[s]${s}[/s]`],
  ['quote', (s) => `[quote]${s}[/quote]`],
];
for (const [wn, wrap] of TBL_WRAPS) {
  for (const lead of TITAN_LEADS.slice(0, 8)) {
    cases.push({
      name: `table-stray-wrap-${wn} L${TITAN_LEADS.indexOf(lead)}`,
      input: wrap(`${lead} [/table] tail`),
    });
  }
}

// ===== Wave 154: search-malf TITAN =====
const SEARCH_TITAN = [
  '{{}}', '{{|}}', '{{|x}}', '{{tag|}}', '{{||}}',
  '{{a||b}}', '{{|||}}', '{{a|b|c}}', '{{a|b|c|d}}',
  '{{a|b|c|d|e}}', '{{ tag}}', '{{tag }}',
  '{{ a b }}', '{{a b|}}', '{{|a b}}',
  '{{a|}}', '{{|b}}', '{{a||c}}',
  '{{Tag|Title}}', '{{TAG}}',
];
for (const s of SEARCH_TITAN) {
  for (const lead of TITAN_LEADS.slice(0, 8)) {
    for (const tail of TITAN_TAILS.slice(0, 6)) {
      cases.push({
        name: `search-titan ${s} L${TITAN_LEADS.indexOf(lead)} T${TITAN_TAILS.indexOf(tail)}`,
        input: `${lead} ${s} ${tail}`,
      });
    }
  }
}

// ===== Wave 155: probe more new bug patterns =====
const NEW_PROBES_4: Array<[string, string]> = [
  // Block-close strays not yet probed enough
  ['stray-thead', 'before [/thead] after'],
  ['stray-tbody', 'before [/tbody] after'],
  ['stray-tr', 'before [/tr] after'],
  ['stray-td', 'before [/td] after'],
  ['stray-th', 'before [/th] after'],
  ['stray-ltable', 'before [/ltable] after'],
  ['stray-expand', 'before [/expand] after'],
  ['stray-nodtext', 'before [/nodtext] after'],
  ['stray-html', 'before [/html] after'],
  // Multiple strays at once
  ['multi-strays-1', '[/quote] [/spoiler] [/section]'],
  ['multi-strays-2', '[/table] [/spoilers] [/spoiler]'],
  ['multi-strays-3', '[/td] [/tr] [/table]'],
  ['multi-strays-4', '[/thead] [/tbody]'],
  // Spoiler block edge cases
  ['empty-spoiler-block', '[spoiler]\n\n[/spoiler]'],
  ['spoiler-block-with-cr', '[spoiler]\r\n\r\n[/spoiler]'],
  ['spoiler-with-just-bold', '[spoiler]\n[b]hi[/b]\n[/spoiler]'],
  ['spoiler-with-list', '[spoiler]\n* a\n* b\n[/spoiler]'],
  ['spoiler-with-quote', '[spoiler]\n[quote]q[/quote]\n[/spoiler]'],
  // Quote block edge cases
  ['quote-with-attribute', '[quote=Author]hi[/quote]'],
  ['quote-with-quoted-author', '[quote="Author Name"]hi[/quote]'],
  ['quote-block-empty-author', '[quote=]hi[/quote]'],
  // Table edge cases
  ['table-with-thead-only', '[table][thead][tr][th]h[/th][/tr][/thead][/table]'],
  ['table-with-tbody-only', '[table][tbody][tr][td]b[/td][/tr][/tbody][/table]'],
  ['ltable-with-thead', '[ltable][thead][tr][th]h[/th][/tr][/thead][/ltable]'],
  ['table-multiple-rows', '[table][tr][td]a[/td][/tr][tr][td]b[/td][/tr][/table]'],
  // Section with collapsed marker (similar to bomb but with content)
  ['section-comma-only', '[section,]hi[/section]'],
  ['section-empty-equals-content', '[section=][/section]'],
  // List edges
  ['list-bullet-no-content', '*\n'],
  ['list-multiple-empty', '*\n*\n*\n'],
  ['list-deeply-empty', '****\n'],
  ['list-mixed-empty-content', '*\n* item\n*\n'],
  // Inline anchor edges
  ['anchor-with-only-id', '[#]'],
  ['anchor-with-only-hash', '[#]'],
  ['anchor-uppercase-extended', '[#FOO_BAR_BAZ]'],
  ['anchor-multiline-attempt', '[#some\nthing]'],
  // URL edges
  ['url-just-protocol', 'http://'],
  ['url-just-protocol-https', 'https://'],
  ['url-with-only-host', 'http://a'],
  ['url-with-trailing-paren-and-paren', 'see https://example.com/foo)) yes'],
  // Format tag edges
  ['triple-bold', '[b][b][b]hi[/b][/b][/b]'],
  ['triple-italic', '[i][i][i]hi[/i][/i][/i]'],
  ['cross-nested', '[b][i][s]all[/b][/s][/i]'],
  // Sup/sub at limit
  ['sup-3', '[sup][sup][sup]hi[/sup][/sup][/sup]'],
  ['sup-5', '[sup][sup][sup][sup][sup]hi[/sup][/sup][/sup][/sup][/sup]'],
  ['sub-5', '[sub][sub][sub][sub][sub]hi[/sub][/sub][/sub][/sub][/sub]'],
  // Empty paragraphs
  ['paragraph-blank-then-text', '\n\n\nhello'],
  ['text-then-blank-then-text', 'one\n\n\n\ntwo'],
];
for (const [n, input] of NEW_PROBES_4) {
  cases.push({ name: `probe4 ${n}`, input });
}

// ===== Wave 156: ltable TITAN amplification =====
const LTABLE_TITAN = [
  '[ltable][/ltable]',
  '[ltable]\n[/ltable]',
  '[ltable]\n\n[/ltable]',
  '[ltable]   \n[/ltable]',
  '[ltable]\t\t[/ltable]',
  '[ltable][tr][/tr][/ltable]',
  '[ltable][tr][td][/td][/tr][/ltable]',
  '[ltable][tr][td]a[/td][/tr][/ltable]',
  '[ltable][tr][td]a[/td][td]b[/td][/tr][/ltable]',
  '[ltable][tr][td]a[/td][/tr][tr][td]b[/td][/tr][/ltable]',
  '[ltable][tr][td]a[/td][/tr][tr][td]b[/td][/tr][tr][td]c[/td][/tr][/ltable]',
  '[ltable][td]a[/td][/ltable]',
  '[ltable][td]a[/td][td]b[/td][/ltable]',
  '[ltable]\n[tr]\n[td]a[/td]\n[/tr]\n[/ltable]',
  '[ltable]\n[tr][td]x[/td][/tr]\n[tr][td]y[/td][/tr]\n[/ltable]',
  '[ltable][tr][th]header[/th][/tr][tr][td]cell[/td][/tr][/ltable]',
  '[ltable][thead][tr][th]h[/th][/tr][/thead][tbody][tr][td]b[/td][/tr][/tbody][/ltable]',
  '[ltable][tr][td][b]bold[/b][/td][/tr][/ltable]',
  '[ltable][tr][td][i]ital[/i][/td][/tr][/ltable]',
  '[ltable][tr][td]post #1[/td][/tr][/ltable]',
  '[ltable][tr][td][[wiki]][/td][/tr][/ltable]',
];
for (const t of LTABLE_TITAN) {
  for (const [cn, fn] of SEARCH_CONTEXTS) {
    cases.push({
      name: `ltable-titan ${JSON.stringify(t).slice(0, 40)} ${cn}`,
      input: fn(t),
    });
  }
}

// ===== Wave 157: textile bracketed with \r and other ws variants =====
const CR_PATHS = [
  '/a\rb', '/a\rb\rc', '/\ra', '/a\r',
  '/foo\rbar', '/x\ry', '/a\nb', '/a\r\nb',
  '/\fa', '/a\fb', '/a\vb', '/ a', '/a b',
];
for (const path of CR_PATHS) {
  for (const label of ['link', 'a link', 'X', 'click', 'see']) {
    for (const [cn, fn] of SEARCH_CONTEXTS) {
      cases.push({
        name: `textile-cr ${JSON.stringify(label)} ${JSON.stringify(path)} ${cn}`,
        input: fn(`"${label}":[${path}]`),
      });
    }
  }
}

// ===== Wave 158: spoiler after quote/section/etc combos =====
const POST_QUOTE_SPOILER = [
  ['after-quote', '[quote]q[/quote]\n[/spoiler]'],
  ['after-quote-2', '[quote]hello[/quote]\n\n[/spoiler]'],
  ['after-quote-3', '[quote]a\n\nb[/quote]\n[/spoiler]'],
  ['after-section', '[section]s[/section]\n[/spoiler]'],
  ['after-table', '[table][tr][td]a[/td][/tr][/table]\n[/spoiler]'],
  ['after-code', '[code]c[/code]\n[/spoiler]'],
  ['after-h1', 'h1. title\n[/spoiler]'],
  ['after-h2', 'h2. title\n[/spoiler]'],
  ['after-h3', 'h3. title\n[/spoiler]'],
  ['after-list', '* a\n* b\n[/spoiler]'],
  ['multi-blocks-then', '[quote]q[/quote]\n[section]s[/section]\n[/spoiler]'],
];
for (const [n, input] of POST_QUOTE_SPOILER) {
  cases.push({ name: `post-block-spoiler ${n}`, input });
}

// ===== Wave 159: stray [/table] inside many wraps amplification =====
const TBL_WRAP_FULL: Array<[string, (s: string) => string]> = [
  ['bold', (s) => `[b]${s}[/b]`],
  ['italic', (s) => `[i]${s}[/i]`],
  ['underline', (s) => `[u]${s}[/u]`],
  ['strikeout', (s) => `[s]${s}[/s]`],
  ['quote', (s) => `[quote]${s}[/quote]`],
  ['section', (s) => `[section]${s}[/section]`],
  ['spoiler-block', (s) => `[spoiler]\n${s}\n[/spoiler]`],
  ['header-h1', (s) => `h1. ${s}\n`],
  ['header-h2', (s) => `h2. ${s}\n`],
  ['list-item', (s) => `* ${s}\n`],
];
for (const [wn, wrap] of TBL_WRAP_FULL) {
  for (const lead of ['a', 'b', 'lead', 'word']) {
    for (const tail of ['', 'a', 'tail', '.']) {
      cases.push({
        name: `tbl-stray-fullwrap-${wn} L${lead} T${JSON.stringify(tail)}`,
        input: wrap(`${lead} [/table] ${tail}`),
      });
    }
  }
}

// ===== Wave 160: probe even more =====
const NEW_PROBES_5: Array<[string, string]> = [
  // Spoiler block transitions
  ['spoiler-block-after-quote', '[quote]q[/quote]\n[spoiler]\nhi\n[/spoiler]'],
  ['spoiler-after-blank-then-text', '[/spoiler]\n\nhello'],
  // Special character handling in various positions
  ['ampersand-mid-paragraph', 'a & b & c'],
  ['lt-gt-pair', 'a < b > c'],
  ['tag-like-not-tag', '<not-a-tag>'],
  // Self-referencing URLs
  ['url-self-ref', 'see https://example.com/posts/123'],
  ['url-with-anchor', 'see https://example.com#anchor'],
  ['url-encoded-chars', 'see https://example.com/%20'],
  // Code with various tricks
  ['code-with-only-newline', '[code]\n[/code]'],
  ['code-with-only-spaces', '[code]   [/code]'],
  ['code-with-tabs', '[code]\t\t[/code]'],
  ['nested-code-attempt', '[code]outer [code]inner[/code] outer[/code]'],
  // Quote variations
  ['quote-with-quoted-author-spaces', '[quote="John Doe"]hi[/quote]'],
  ['quote-with-trailing-space-attribute', '[quote=Author ]hi[/quote]'],
  ['quote-with-leading-space-attribute', '[quote= Author]hi[/quote]'],
  // Section with various flags
  ['section-with-trailing-space', '[section ]hi[/section]'],
  ['section-with-bracket-attr', '[section[attr]]hi[/section]'],
  // Table edge cases
  ['table-with-paragraph-break', '[table][tr][td]a\n\nb[/td][/tr][/table]'],
  ['table-cell-with-spoiler-block', '[table][tr][td]\n[spoiler]\nhi\n[/spoiler]\n[/td][/tr][/table]'],
  // Wiki link special chars
  ['wiki-link-with-percent', '[[a%20b]]'],
  ['wiki-link-with-amp', '[[a&b]]'],
  ['wiki-link-with-quote', '[[a"b]]'],
  // Anchors
  ['anchor-mixed-with-text', 'before [#anchor] after [#another]'],
  ['anchor-then-paragraph-break', '[#a]\n\nhello'],
  ['multiple-anchors-then-text', '[#a][#b][#c] text'],
  // Inline anchor
  ['anchor-in-quote', '[quote][#a] text[/quote]'],
];
for (const [n, input] of NEW_PROBES_5) {
  cases.push({ name: `probe5 ${n}`, input });
}

// ===== Wave 161: ltable EXTREME amplification =====
// Hero is patching ltable but says "the rest of the ltable mass tests
// likely have other issues" — find them all.
const LTABLE_EXTREME_BODIES = [
  '',
  '\n',
  '\n\n',
  '   ',
  '\t\t',
  ' \n ',
  '\n  \n',
  '[tr]',
  '[tr][/tr]',
  '[tr][td][/td][/tr]',
  '[tr][td]a[/td][/tr]',
  '[tr][td]a[/td][td]b[/td][/tr]',
  '[tr][td]a[/td][/tr][tr][td]b[/td][/tr]',
  '[tr][td]a[/td][/tr][tr][td]b[/td][/tr][tr][td]c[/td][/tr]',
  '[tr][td]a[/td][/tr]\n[tr][td]b[/td][/tr]',
  '[tr][th]h[/th][/tr][tr][td]c[/td][/tr]',
  '[thead][tr][th]h[/th][/tr][/thead][tbody][tr][td]b[/td][/tr][/tbody]',
  '[tbody][tr][td]b[/td][/tr][/tbody]',
  '[thead][/thead]',
  '[tbody][/tbody]',
  '[tr][td][b]bold[/b][/td][/tr]',
  '[tr][td][i]ital[/i][/td][/tr]',
  '[tr][td][[wiki]][/td][/tr]',
  '[tr][td]post #1[/td][/tr]',
  '[tr][td]https://example.com[/td][/tr]',
  '[tr][td]"link":/path[/td][/tr]',
  '[td]a[/td]',
  '[td]a[/td][td]b[/td]',
  '[th]h[/th]',
];
for (const body of LTABLE_EXTREME_BODIES) {
  for (const [cn, fn] of SEARCH_CONTEXTS) {
    cases.push({
      name: `ltable-extreme ${JSON.stringify(body).slice(0, 50)} ${cn}`,
      input: fn(`[ltable]${body}[/ltable]`),
    });
  }
}

// ===== Wave 162: empty/normal ltable in many text positions =====
const LTABLE_BASE = '[ltable][/ltable]';
const LTABLE_POS = [
  ['standalone', LTABLE_BASE],
  ['after-text', `lead text\n${LTABLE_BASE}`],
  ['before-text', `${LTABLE_BASE}\nfollowing text`],
  ['surrounded', `before\n\n${LTABLE_BASE}\n\nafter`],
  ['in-list', `* ${LTABLE_BASE}\n`],
  ['after-h1', `h1. heading\n${LTABLE_BASE}`],
  ['after-h2', `h2. heading\n${LTABLE_BASE}`],
  ['after-quote', `[quote]q[/quote]\n${LTABLE_BASE}`],
  ['twice', `${LTABLE_BASE}\n\n${LTABLE_BASE}`],
  ['thrice', `${LTABLE_BASE}\n${LTABLE_BASE}\n${LTABLE_BASE}`],
];
for (const [n, input] of LTABLE_POS) {
  cases.push({ name: `ltable-pos ${n}`, input });
}

// ===== Wave 163: probe new bug patterns =====
const NEW_PROBES_6: Array<[string, string]> = [
  // Stray [/code] (Hero says they handled it, verify edge cases)
  ['stray-code-close', 'before [/code] after'],
  ['stray-code-only', '[/code]'],
  ['stray-code-twice', '[/code] [/code]'],
  // Stray [/expand]
  ['stray-expand-mid', 'before [/expand] after'],
  // Stray [/quote] mid (Hero says quote stays literal)
  ['stray-quote-many', '[/quote] [/quote] [/quote]'],
  // Combined stray closes
  ['mix-close-1', '[/section] [/spoiler] [/quote]'],
  ['mix-close-2', '[/spoiler] [/section] [/expand]'],
  // Code blocks with weird boundary content
  ['code-with-leading-text', 'lead [code]hi[/code]'],
  ['code-with-trailing-text', '[code]hi[/code] tail'],
  ['code-with-newline-only-content', '[code]\n\n\n[/code]'],
  ['code-with-unicode', '[code]日本語[/code]'],
  ['code-with-emoji', '[code]😀[/code]'],
  // Section variations
  ['section-uppercase-tag', '[SECTION]hi[/SECTION]'],
  ['section-mixed-case', '[Section]hi[/Section]'],
  ['section-with-newline-in-title', '[section=Title\nMore]hi[/section]'],
  // Quote attribute edge cases
  ['quote-with-format-author', '[quote=[b]Bold[/b]]hi[/quote]'],
  ['quote-with-tag-author', '[quote=#1]hi[/quote]'],
  // Sup/sub deep
  ['sup-deep-with-content', '[sup]a[sup]b[sup]c[sup]d[/sup][/sup][/sup][/sup]'],
  ['sub-mixed-deep', '[sub][sup][sub][sup][sub]x[/sub][/sup][/sub][/sup][/sub]'],
  // Inline anchor weird
  ['anchor-empty', '[#]'],
  ['anchor-only-hash', '[##]'],
  ['anchor-spaces', '[# ]'],
  // Wiki link patterns
  ['wiki-doubled', '[[a]][[b]]'],
  ['wiki-many', '[[a]] [[b]] [[c]] [[d]]'],
  ['wiki-nested-attempt', '[[outer[[inner]]more]]'],
  // Search link patterns
  ['search-mass-doubled', '{{a}} {{b}}'],
  ['search-with-colon-space', '{{tag : value}}'],
  // Mixed inline and block boundaries
  ['inline-then-block', '[b]bold[/b]\nh1. heading\n'],
  ['block-then-inline', 'h1. heading\n[b]bold[/b]'],
  // List variations
  ['list-with-formatting', '* [b]bold[/b]\n* [i]ital[/i]\n'],
  ['list-with-many-levels', '* a\n** b\n*** c\n**** d\n'],
  ['list-mixed-with-text', '* a\nplain text\n* b\n'],
  // Markdown-ish patterns that should not match
  ['md-style-heading', '# heading'],
  ['md-style-emphasis', '*emph* and _emph_'],
  ['md-style-link', '[label](url)'],
];
for (const [n, input] of NEW_PROBES_6) {
  cases.push({ name: `probe6 ${n}`, input });
}

// ===== Wave 164: stray [/table] in even more wrap forms =====
const TBL_MORE_WRAPS: Array<[string, (s: string) => string]> = [
  ['sup', (s) => `[sup]${s}[/sup]`],
  ['sub', (s) => `[sub]${s}[/sub]`],
  ['code-inline', (s) => `\`${s}\``],
  ['color', (s) => `[color=red]${s}[/color]`],
];
for (const [wn, wrap] of TBL_MORE_WRAPS) {
  for (const lead of ['', 'a', 'b', 'lead', 'word', 'foo']) {
    cases.push({
      name: `tbl-stray-morewrap-${wn} L${JSON.stringify(lead)}`,
      input: wrap(`${lead} [/table] tail`),
    });
  }
}

// ===== Wave 165: ltable-wrap variants =====
for (const [wn, wrap] of TBL_WRAP_FULL.slice(0, 5)) {
  for (const ltbl of ['[ltable][/ltable]', '[ltable][tr][td]a[/td][/tr][/ltable]']) {
    cases.push({
      name: `ltable-wrap ${wn} ${JSON.stringify(ltbl).slice(0, 30)}`,
      input: wrap(ltbl),
    });
  }
}

// ===== Wave 166: ultra-spoiler L17 amplification (the surviving spoiler bug) =====
// L17 = 'quote: [quote]q[/quote]\n' — spoiler after a block element.
const SP_AFTER_BLOCK_LEADS = [
  'quote: [quote]q[/quote]\n',
  'quote: [quote]hi[/quote]\n',
  '[quote]q[/quote]\n',
  '[quote]hi[/quote]\n\n',
  '[section]s[/section]\n',
  '[section]hi[/section]\n\n',
  '[spoiler]\nx\n[/spoiler]\n',
  '[code]c[/code]\n',
  'h1. title\n',
  'h2. title\n',
  '* a\n* b\n',
];
for (const lead of SP_AFTER_BLOCK_LEADS) {
  for (let t = 0; t < 8; t++) {
    cases.push({
      name: `sp-after-block L${SP_AFTER_BLOCK_LEADS.indexOf(lead)} T${t}`,
      input: `${lead}[/spoiler] ${'tail '.repeat(t)}`,
    });
  }
}

// ===== Wave 167: spoiler-after-quote lead amplification =====
// ultra-spoiler L17 was the surviving pattern: spoiler after a quote block.
const QUOTE_LEADS = [
  'quote: [quote]q[/quote]\n',
  'q: [quote]q[/quote]\n',
  '[quote]q[/quote]\n',
  '[quote]hi[/quote]\n',
  '[quote]a[/quote]\n',
  '[quote]b[/quote]\n',
  '[quote]inner[/quote]\n',
  'pre [quote]q[/quote]\n',
  'after [quote]q[/quote]\n',
  '[quote]first[/quote]\n[quote]second[/quote]\n',
  '[quote]q[/quote]\n[quote]q[/quote]\n',
  '[quote]\nlong\nquote\n[/quote]\n',
];
const SP_AFTER_QUOTE_TAILS = [
  '', 'a', 'tail', '. end', ' more',
  'tail tail tail', '\n', '\nmore',
];
for (const lead of QUOTE_LEADS) {
  for (const tail of SP_AFTER_QUOTE_TAILS) {
    cases.push({
      name: `sp-after-quote L${QUOTE_LEADS.indexOf(lead)} T${SP_AFTER_QUOTE_TAILS.indexOf(tail)}`,
      input: `${lead}[/spoiler] ${tail}`,
    });
  }
}

// ===== Wave 168: [/table] inside more wrap-lead variants =====
const TBL_WRAP_LEADS = [
  '', 'a', 'b', 'c', 'd', 'lead', 'word', 'foo', 'bar',
  'sentence', 'pre', 'inline', 'hello', 'hi', 'long',
  'multi word', 'three word lead',
];
const TBL_WRAP_TAILS = ['tail', '', 'a', 'end', '. end', ' more'];
for (const [wn, wrap] of TBL_WRAP_FULL.slice(0, 6)) {
  for (const lead of TBL_WRAP_LEADS) {
    for (const tail of TBL_WRAP_TAILS) {
      cases.push({
        name: `tbl-stray-many ${wn} L${TBL_WRAP_LEADS.indexOf(lead)} T${TBL_WRAP_TAILS.indexOf(tail)}`,
        input: wrap(`${lead} [/table] ${tail}`),
      });
    }
  }
}

// ===== Wave 169: ltable in list-item amplification =====
const LTABLE_VARIANTS_BIG = [
  '[ltable][/ltable]',
  '[ltable][tr][td]a[/td][/tr][/ltable]',
  '[ltable][tr][td]a[/td][td]b[/td][/tr][/ltable]',
  '[ltable][tr][th]h[/th][/tr][tr][td]c[/td][/tr][/ltable]',
  '[ltable]\n[tr]\n[td]a[/td]\n[/tr]\n[/ltable]',
  '[ltable][td]a[/td][/ltable]',
  '[ltable][tr][/tr][/ltable]',
  '[ltable]\n\n[/ltable]',
];
for (const ltbl of LTABLE_VARIANTS_BIG) {
  cases.push({ name: `ltable-list-item ${JSON.stringify(ltbl).slice(0, 30)}`, input: `* ${ltbl}\n` });
  cases.push({ name: `ltable-list-after ${JSON.stringify(ltbl).slice(0, 30)}`, input: `* item\n${ltbl}\n` });
  cases.push({ name: `ltable-twice ${JSON.stringify(ltbl).slice(0, 30)}`, input: `${ltbl}\n${ltbl}` });
  cases.push({ name: `ltable-in-quote ${JSON.stringify(ltbl).slice(0, 30)}`, input: `[quote]${ltbl}[/quote]` });
}

// ===== Wave 170: probe even more new bug patterns =====
const NEW_PROBES_7: Array<[string, string]> = [
  // Block with attribute edge cases
  ['quote-with-bracketed-attr', '[quote=[bracket]]hi[/quote]'],
  ['section-bracketed-attr', '[section=[bracket]]hi[/section]'],
  // Inline at boundaries
  ['inline-at-boundary-start', '[b]start[/b]\n\nbody'],
  ['inline-at-boundary-end', 'body\n\n[b]end[/b]'],
  // Code block stuff
  ['code-block-with-cr', '[code]\r[/code]'],
  ['code-block-with-cr-content', '[code]a\rb[/code]'],
  ['code-block-with-mixed-newlines', '[code]a\r\nb\r\nc[/code]'],
  // Math-y
  ['math-style', 'a^2 + b^2'],
  ['hash-bunch', '##### heading-ish'],
  // URL forms
  ['url-with-brackets', 'https://example.com/[brackets]'],
  ['url-with-spaces-encoded', 'https://example.com/a%20b'],
  ['url-with-anchor-and-query', 'https://example.com/?q=test#fragment'],
  // Multiple separators
  ['triple-newline', 'a\n\n\nb'],
  ['mixed-newline-chars', 'a\n\rb'],
  // Specific patterns Hero may not have caught
  ['inline-spoilers-stray-mid', 'before [/spoilers] after'],
  ['triple-spoiler-strays', '[/spoiler] [/spoilers] [/spoiler]'],
  ['quote-then-strays', '[quote]hi[/quote] [/spoiler] [/table]'],
  // Lone slash close at root
  ['only-slash-close', '[/]'],
  ['empty-slash', '[/'],
  ['empty-bracket', '[]'],
  ['unclosed-tag', '[b'],
  // Special characters
  ['null-byte-attempt', 'a\x00b'],
  ['form-feed', 'a\fb'],
  // Wiki link special edge
  ['wiki-link-just-anchor-text', '[[#anchor|text]]'],
  ['wiki-link-just-anchor-empty', '[[#|text]]'],
  ['wiki-link-empty-pipe-empty', '[[||]]'],
  // Section flag combos
  ['section-flag-newline', '[section,expanded\n]hi[/section]'],
  ['section-equals-quoted', '[section="Title"]hi[/section]'],
  // Tables with spans
  ['table-colspan', '[table][tr][td colspan=2]a[/td][/tr][/table]'],
  ['table-with-extra-cells', '[table][tr][td]a[/td][td]b[/td][td]c[/td][td]d[/td][/tr][/table]'],
  // List edge
  ['list-asterisk-many', '*'.repeat(10) + ' deep'],
];
for (const [n, input] of NEW_PROBES_7) {
  cases.push({ name: `probe7 ${n}`, input });
}

// ===== Wave 171: spoiler in even more block contexts =====
const SP_BLOCK_CTX_BIG: Array<[string, string]> = [
  ['after-h1-then-text', 'h1. heading\n[/spoiler]\nbody'],
  ['after-h2-then-text', 'h2. heading\n[/spoiler]\nbody'],
  ['after-quote-blank', '[quote]q[/quote]\n\n[/spoiler]'],
  ['after-section-blank', '[section]s[/section]\n\n[/spoiler]'],
  ['after-table-blank', '[table][tr][td]a[/td][/tr][/table]\n\n[/spoiler]'],
  ['after-list-blank', '* a\n* b\n\n[/spoiler]'],
  ['after-code-blank', '[code]c[/code]\n\n[/spoiler]'],
  ['between-blocks-nl', 'h1. one\n[/spoiler]\nh2. two\n'],
  ['between-blocks-double-nl', 'h1. one\n\n[/spoiler]\n\nh2. two\n'],
  ['after-deep-list', '* a\n** b\n*** c\n[/spoiler]'],
  ['after-quote-with-content', '[quote]a\n\nb\n\nc[/quote]\n[/spoiler]'],
  ['after-multi-section', '[section]a[/section][section]b[/section]\n[/spoiler]'],
];
for (const [n, input] of SP_BLOCK_CTX_BIG) {
  cases.push({ name: `sp-block-bigctx ${n}`, input });
}

// ===== Wave 172: textile-cr DEEP amplification =====
// `\r` in textile bracketed URL still diverges (renderer side).
const CR_BIG_PATHS = [
  '/a\rb',
  '/a\r',
  '/\ra',
  '/a\r\rb',
  '/a\rb\rc',
  '/a\nb',
  '/a\r\nb',
  '/a\fb',
  '/a\vb',
  '/foo\rbar',
  '/x\ry',
  '/multi\rword\rpath',
  '/before\rafter',
];
const CR_BIG_LABELS = [
  'a', 'X', 'link', 'click', 'see', 'go', 'visit',
  'a link', 'click here', 'view', 'see this',
];
for (const path of CR_BIG_PATHS) {
  for (const label of CR_BIG_LABELS) {
    cases.push({
      name: `textile-cr-deep ${JSON.stringify(label)} ${JSON.stringify(path)}`,
      input: `"${label}":[${path}]`,
    });
  }
}

// ===== Wave 173: tbl-stray DEEP amplification with all wraps =====
const TBL_DEEP_LEADS = [
  '', 'a', 'b', 'c', 'd', 'e',
  'lead', 'word', 'foo', 'bar', 'baz',
  'sentence', 'pre', 'inline',
  'hello', 'hi', 'one two three',
  'multi word lead text', 'long sentence here',
];
const TBL_DEEP_WRAPS: Array<[string, (s: string) => string]> = [
  ['bold', (s) => `[b]${s}[/b]`],
  ['italic', (s) => `[i]${s}[/i]`],
  ['underline', (s) => `[u]${s}[/u]`],
  ['strikeout', (s) => `[s]${s}[/s]`],
  ['quote', (s) => `[quote]${s}[/quote]`],
  ['section', (s) => `[section]${s}[/section]`],
  ['spoiler-block', (s) => `[spoiler]\n${s}\n[/spoiler]`],
  ['header-h1', (s) => `h1. ${s}\n`],
  ['header-h2', (s) => `h2. ${s}\n`],
  ['header-h3', (s) => `h3. ${s}\n`],
  ['header-h4', (s) => `h4. ${s}\n`],
  ['list-item', (s) => `* ${s}\n`],
  ['nested-quote', (s) => `[quote][quote]${s}[/quote][/quote]`],
];
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_DEEP_LEADS) {
    cases.push({
      name: `tbl-deep ${wn} L${TBL_DEEP_LEADS.indexOf(lead)}`,
      input: wrap(`${lead} [/table] tail`),
    });
  }
}

// ===== Wave 174: stray [/spoiler] inside same wraps =====
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_DEEP_LEADS) {
    cases.push({
      name: `sp-deep-wrap ${wn} L${TBL_DEEP_LEADS.indexOf(lead)}`,
      input: wrap(`${lead} [/spoiler] tail`),
    });
  }
}

// ===== Wave 175: stray [/spoilers] in same wraps =====
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_DEEP_LEADS) {
    cases.push({
      name: `sps-deep-wrap ${wn} L${TBL_DEEP_LEADS.indexOf(lead)}`,
      input: wrap(`${lead} [/spoilers] tail`),
    });
  }
}

// ===== Wave 176: list-malf (asterisk-only) DEEP amplification =====
const LIST_MALF_BIG = [
  '*', '*\n', '* \n',
  '*\n*', '*\n*\n*', '*\n*\n*\n*',
  '* a\n*', '* a\n*\n', '* a\n*\n* b',
  '*\n* a\n* b', '* a\n* b\n*',
  '*\n* a\n', '* a\n\n*', '*\n\n*',
  '** ', '** \n', '*** ', '*** \n', '**** ',
  '** a\n** \n** b', '*** a\n***\n*** b',
];
for (const l of LIST_MALF_BIG) {
  cases.push({ name: `list-malf-deep ${JSON.stringify(l).slice(0, 30)}`, input: l });
  for (const [cn, fn] of SEARCH_CONTEXTS.slice(0, 4)) {
    cases.push({
      name: `list-malf-ctx ${JSON.stringify(l).slice(0, 30)} ${cn}`,
      input: fn(l),
    });
  }
}

// ===== Wave 177: probe even more new bug patterns =====
const NEW_PROBES_8: Array<[string, string]> = [
  // Code stray inside wraps
  ['code-stray-bold', '[b]code [/code] inside[/b]'],
  ['code-stray-quote', '[quote]code [/code] inside[/quote]'],
  // Nodtext (verbatim?)
  ['nodtext-block', '[nodtext][b]bold[/b][/nodtext]'],
  ['nodtext-with-special', '[nodtext]<>&"\'[/nodtext]'],
  // HTML tag-like
  ['html-paragraph', '[html]<p>raw</p>[/html]'],
  // Format text inside URLs
  ['url-with-format-attempt', 'https://example.com/[b]bold[/b]'],
  // Text colors inside quote
  ['quote-with-color', '[quote=red]hi[/quote]'],
  ['quote-with-color-content', '[quote][color=red]inner[/color][/quote]'],
  // Mixed mode within same line
  ['mixed-line-formats', '[b]a[/b] [i]b[/i] [s]c[/s] [u]d[/u]'],
  // Various hash patterns
  ['hash-no-id-link', '#1234'],
  ['hash-with-prefix-not-known', 'foo #1234'],
  ['hash-followed-by-letter', '#a'],
  // Inline anchor at boundary
  ['anchor-after-period', 'word. [#a] tail'],
  // Multi-paragraph formatting
  ['format-across-paragraphs', '[b]first\n\nsecond[/b]'],
  ['list-then-format', '* item\n[b]bold after list[/b]'],
  // Text after table
  ['table-then-paragraph', '[table][tr][td]a[/td][/tr][/table]\nbody'],
  ['table-then-blank', '[table][tr][td]a[/td][/tr][/table]\n\nbody'],
  ['table-newlines-after', '[table][tr][td]a[/td][/tr][/table]\n\n\nbody'],
  // Quote then immediate text (no newline)
  ['quote-text-no-nl', '[quote]q[/quote]immediate'],
  // List item with newline at end
  ['list-trailing-newline', '* a\n* b\n\n'],
  ['list-no-trailing-nl', '* a\n* b'],
  // Sup/sub at limit boundary
  ['sup-3-mixed', '[sup][sub][sup][sub]hi[/sub][/sup][/sub][/sup]'],
  ['sub-cap-test', '[sub][sub][sub][sub]too deep[/sub][/sub][/sub][/sub]'],
  // Wiki link with line break
  ['wiki-link-newline', '[[wiki\nlink]]'],
  ['wiki-link-newline-pipe', '[[wiki|title\nwith newline]]'],
  // Malformed everything
  ['bracket-soup', '[a[b]c][/a]'],
  ['nested-strange', '[[[deep]]]'],
];
for (const [n, input] of NEW_PROBES_8) {
  cases.push({ name: `probe8 ${n}`, input });
}

// ===== Wave 178: tbl-stray-many MEGA cross-product =====
// `[/table]` stray inside formatting wraps is the big winner; multiply
// heavily across leads + wraps + tails.
const TBL_MEGA_LEADS = [
  '', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'lead', 'word', 'foo', 'bar', 'baz', 'qux',
  'sentence', 'pre', 'inline', 'hello', 'hi',
  'one', 'two', 'three', 'four',
  'multi word', 'long sentence',
];
const TBL_MEGA_TAILS = [
  '', 'a', 'b', 'tail', 'end', 'word', 'text',
  '. end', ', end', '! end', '? end',
  ' more', ' final',
];
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_MEGA_LEADS) {
    for (const tail of TBL_MEGA_TAILS.slice(0, 6)) {
      cases.push({
        name: `tbl-mega ${wn} L${TBL_MEGA_LEADS.indexOf(lead)} T${TBL_MEGA_TAILS.indexOf(tail)}`,
        input: wrap(`${lead} [/table] ${tail}`),
      });
    }
  }
}

// ===== Wave 179: stray [/spoiler] / [/spoilers] in same MEGA grid =====
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_MEGA_LEADS.slice(0, 18)) {
    for (const tail of TBL_MEGA_TAILS.slice(0, 5)) {
      cases.push({
        name: `sp-mega ${wn} L${TBL_MEGA_LEADS.indexOf(lead)} T${TBL_MEGA_TAILS.indexOf(tail)}`,
        input: wrap(`${lead} [/spoiler] ${tail}`),
      });
      cases.push({
        name: `sps-mega ${wn} L${TBL_MEGA_LEADS.indexOf(lead)} T${TBL_MEGA_TAILS.indexOf(tail)}`,
        input: wrap(`${lead} [/spoilers] ${tail}`),
      });
    }
  }
}

// ===== Wave 180: textile-cr MEGA =====
const CR_MEGA_PATHS = [
  '/a\rb', '/a\r', '/\ra', '/a\r\rb', '/a\rb\rc',
  '/a\nb', '/a\r\nb', '/a\fb', '/a\vb',
  '/foo\rbar', '/x\ry', '/multi\rword',
  '/before\rafter', '/p\rq\rs',
  '/a\rb c', '/a b\rc',
];
const CR_MEGA_LABELS = [
  'a', 'X', 'b', 'link', 'click', 'see', 'go', 'visit',
  'read', 'open', 'view', 'a link', 'click here', 'see this',
  'visit here', 'go now',
];
for (const path of CR_MEGA_PATHS) {
  for (const label of CR_MEGA_LABELS) {
    cases.push({
      name: `textile-cr-mega ${JSON.stringify(label)} ${JSON.stringify(path)}`,
      input: `"${label}":[${path}]`,
    });
  }
}

// ===== Wave 181: ltable inside list MEGA =====
for (const ltbl of LTABLE_VARIANTS_BIG) {
  for (let depth = 1; depth <= 3; depth++) {
    const stars = '*'.repeat(depth);
    cases.push({
      name: `ltable-list-d${depth} ${JSON.stringify(ltbl).slice(0, 30)}`,
      input: `${stars} ${ltbl}\n`,
    });
  }
  for (const lead of ['', 'a', 'item', 'item with text']) {
    cases.push({
      name: `ltable-after-list-item ${JSON.stringify(ltbl).slice(0, 30)} L${lead}`,
      input: `* ${lead}\n${ltbl}\n* tail\n`,
    });
  }
}

// ===== Wave 182: super-spoiler / sp-blockctx MEGA =====
const SP_HEADER_LEADS = [
  'h1. one', 'h2. two', 'h3. three',
  'h4. four', 'h5. five', 'h6. six',
  'h1. title with words',
  'h2. heading',
  'h3. section',
];
for (const lead of SP_HEADER_LEADS) {
  for (const tail of TBL_MEGA_TAILS.slice(0, 8)) {
    cases.push({
      name: `sp-header-mega L${SP_HEADER_LEADS.indexOf(lead)} T${TBL_MEGA_TAILS.indexOf(tail)}`,
      input: `${lead}\n[/spoiler]${tail ? ' ' + tail : ''}`,
    });
    cases.push({
      name: `sp-header-mid-mega L${SP_HEADER_LEADS.indexOf(lead)} T${TBL_MEGA_TAILS.indexOf(tail)}`,
      input: `${lead}\n\n[/spoiler]${tail ? ' ' + tail : ''}`,
    });
  }
}

// ===== Wave 183: list-malf MEGA =====
const LIST_MALF_MEGA = [
  '*\n', '* \n', '*\n*', '*\n*\n*',
  '* a\n*', '* a\n*\n* b', '*\n* a\n* b',
  '* a\n* b\n*', '** \n** item',
  '*** \n*** item', '**** \n**** item',
  '*\n** \n*** ', '* a\n** \n* b',
  '* a\n** b\n***\n*** d',
  '* a\n*\n*\n* b', '*\n*\n*\n*',
];
for (const l of LIST_MALF_MEGA) {
  cases.push({ name: `list-malf-mega ${JSON.stringify(l).slice(0, 30)}`, input: l });
  for (const [cn, fn] of SEARCH_CONTEXTS) {
    cases.push({
      name: `list-malf-mega-ctx ${JSON.stringify(l).slice(0, 30)} ${cn}`,
      input: fn(l),
    });
  }
}

// ===== Wave 184: post-block-spoiler MEGA =====
const PB_BLOCK_LEADS = [
  '[code]c[/code]\n',
  '[code]hello[/code]\n',
  '[code]\nlong\ncode\n[/code]\n',
  '[table][tr][td]a[/td][/tr][/table]\n',
  '[table][tr][td]long table[/td][/tr][/table]\n',
  '[ltable][tr][td]a[/td][/tr][/ltable]\n',
  '[quote]q[/quote]\n',
  '[section]s[/section]\n',
  '[spoiler]\nx\n[/spoiler]\n',
  'h1. heading\n',
  'h2. heading\n',
  '* a\n* b\n',
];
for (const lead of PB_BLOCK_LEADS) {
  for (let t = 0; t < 5; t++) {
    cases.push({
      name: `pb-block L${PB_BLOCK_LEADS.indexOf(lead)} T${t}`,
      input: `${lead}[/spoiler] ${'tail '.repeat(t)}`,
    });
  }
}

// ===== Wave 185: tbl-mega even more LEADS =====
const TBL_MORE_LEADS = [
  'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
  'one', 'two', 'three', 'four', 'five',
  'apple', 'banana', 'cherry', 'date', 'eggplant',
  'this is a long lead with many words here',
  'short', 'medium length lead', 'final lead',
];
const TBL_MORE_TAILS = ['', 'a', 'tail', 'end'];
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_MORE_LEADS) {
    for (const tail of TBL_MORE_TAILS) {
      cases.push({
        name: `tbl-extra ${wn} L${TBL_MORE_LEADS.indexOf(lead)} T${TBL_MORE_TAILS.indexOf(tail)}`,
        input: wrap(`${lead} [/table] ${tail}`),
      });
    }
  }
}

// ===== Wave 186: spoiler MEGA in same extra leads =====
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_MORE_LEADS) {
    cases.push({
      name: `sp-extra-mega ${wn} L${TBL_MORE_LEADS.indexOf(lead)}`,
      input: wrap(`${lead} [/spoiler] tail`),
    });
    cases.push({
      name: `sps-extra-mega ${wn} L${TBL_MORE_LEADS.indexOf(lead)}`,
      input: wrap(`${lead} [/spoilers] tail`),
    });
  }
}

// ===== Wave 187: textile-cr MEGA more paths =====
const CR_MEGA_MORE_PATHS = [
  '/abc\rdef', '/x\ryz', '/p\rq\rrs',
  '/word\rword2', '/foo\rbar\rbaz',
  '/long\rstring\rwith\rcrs',
  '/p1/p2\rp3', '/folder1\rfolder2/file',
  '/q\rr\rs\rt', '/a\rb\rc\rd\re',
];
for (const path of CR_MEGA_MORE_PATHS) {
  for (const label of CR_MEGA_LABELS) {
    cases.push({
      name: `textile-cr-extra ${JSON.stringify(label)} ${JSON.stringify(path)}`,
      input: `"${label}":[${path}]`,
    });
  }
}

// ===== Wave 188: post-block-spoiler MEGA more leads × more tails =====
const PB_MORE_LEADS = [
  '[code]a[/code]\n', '[code]hello world[/code]\n',
  '[code]\nlong\ncontent\nhere\n[/code]\n',
  '[ltable][tr][td]a[/td][/tr][/ltable]\n',
  '[ltable][tr][td]b[/td][/tr][tr][td]c[/td][/tr][/ltable]\n',
  'h1. simple heading\n',
  'h2. another heading\n',
  'h3. third heading\n',
  'h4. fourth\n',
  '[quote]simple[/quote]\n',
  '[quote]\nmultiline\nquote\n[/quote]\n',
  '[section]basic[/section]\n',
  '[section,expanded]exp[/section]\n',
];
for (const lead of PB_MORE_LEADS) {
  for (let t = 0; t < 6; t++) {
    cases.push({
      name: `pb-block-extra L${PB_MORE_LEADS.indexOf(lead)} T${t}`,
      input: `${lead}[/spoiler] ${'tail '.repeat(t)}`,
    });
  }
}

// ===== Wave 189: spoiler in many contexts MEGA =====
const SP_MORE_CTX: Array<[string, string]> = [
  ['after-thumbs-link', 'thumb #1\n[/spoiler] tail'],
  ['after-anchor', '[#anchor]\n[/spoiler] tail'],
  ['after-paragraph-break', 'first\n\nsecond\n\n[/spoiler] tail'],
  ['mid-multi-paragraph', 'p1\n\np2 [/spoiler] tail\n\np3'],
  ['after-list-then-blank', '* a\n* b\n\n[/spoiler] tail'],
  ['after-list-then-no-blank', '* a\n* b\n[/spoiler] tail'],
  ['after-quote-blank-tail', '[quote]q[/quote]\n\n[/spoiler] tail'],
  ['surrounded-by-empty', '\n\n\n[/spoiler]\n\n\n'],
  ['between-h1-h2', 'h1. one\n\n[/spoiler]\n\nh2. two'],
  ['inside-multi-list-item', '* item one\n* item [/spoiler] two\n* item three'],
  ['list-with-format-and-stray', '* [b]bold[/b] [/spoiler] item\n'],
  ['quote-with-stray-then-content', '[quote]q [/spoiler] content[/quote]'],
];
for (const [n, input] of SP_MORE_CTX) {
  cases.push({ name: `sp-more-ctx ${n}`, input });
}

// ===== Wave 190: ltable inside many positions =====
for (const ltbl of LTABLE_VARIANTS_BIG) {
  cases.push({ name: `ltable-after-blank-line ${JSON.stringify(ltbl).slice(0, 30)}`, input: `pre\n\n${ltbl}\n\npost` });
  cases.push({ name: `ltable-doc-start ${JSON.stringify(ltbl).slice(0, 30)}`, input: `${ltbl}\nafter` });
  cases.push({ name: `ltable-doc-end ${JSON.stringify(ltbl).slice(0, 30)}`, input: `before\n${ltbl}` });
  cases.push({ name: `ltable-many-newlines ${JSON.stringify(ltbl).slice(0, 30)}`, input: `\n\n\n${ltbl}\n\n\n` });
  for (const wname of ['quote', 'section', 'spoiler-block']) {
    const wrap = TBL_DEEP_WRAPS.find(([n]) => n === wname);
    if (wrap) {
      cases.push({
        name: `ltable-in-${wname} ${JSON.stringify(ltbl).slice(0, 30)}`,
        input: wrap[1](ltbl),
      });
    }
  }
}

// ===== Wave 191: list-malf with extra weird patterns =====
const LIST_MALF_EVIL = [
  '*\n\n* a',
  '* a\n\n* b',
  '*\n* \n* a',
  '* \n* \n* ',
  '* a\n*\n*\n*\n* b',
  '** \n** \n** ',
  '*** \n*** \n*** ',
  '*\n***\n* a',
  '*** \n*\n***',
  '* a\n** b\n***\n** c\n* d',
  '* * *',
  '* * * *',
  '*  *  *',
];
for (const l of LIST_MALF_EVIL) {
  cases.push({ name: `list-malf-evil ${JSON.stringify(l).slice(0, 30)}`, input: l });
  for (const [cn, fn] of SEARCH_CONTEXTS.slice(0, 4)) {
    cases.push({
      name: `list-malf-evil-ctx ${JSON.stringify(l).slice(0, 30)} ${cn}`,
      input: fn(l),
    });
  }
}

// ===== Wave 192: tbl-mega EVEN MORE leads × wraps =====
// `[/table]` stray inside formatting wraps still wins ~761 — push beyond 1500.
const TBL_TITAN_LEADS: string[] = [];
for (let i = 0; i < 40; i++) TBL_TITAN_LEADS.push('lead' + i);
for (const [wn, wrap] of TBL_DEEP_WRAPS) {
  for (const lead of TBL_TITAN_LEADS) {
    cases.push({
      name: `tbl-titan ${wn} ${lead}`,
      input: wrap(`${lead} [/table] tail`),
    });
  }
}

// ===== Wave 193: spoiler MEGA in same titan leads =====
const SP_TITAN_WRAPS = TBL_DEEP_WRAPS.slice(0, 8);
for (const [wn, wrap] of SP_TITAN_WRAPS) {
  for (const lead of TBL_TITAN_LEADS.slice(0, 25)) {
    cases.push({
      name: `sp-titan ${wn} ${lead}`,
      input: wrap(`${lead} [/spoiler] tail`),
    });
    cases.push({
      name: `sps-titan ${wn} ${lead}`,
      input: wrap(`${lead} [/spoilers] tail`),
    });
  }
}

// ===== Wave 194: tbl + tail variation cross =====
const TBL_TITAN_TAILS = ['', 'a', 'tail', 'end', '. end', ', end', '!', '? end'];
for (const lead of TBL_TITAN_LEADS.slice(0, 12)) {
  for (const tail of TBL_TITAN_TAILS) {
    for (const [wn, wrap] of TBL_DEEP_WRAPS.slice(0, 6)) {
      cases.push({
        name: `tbl-titan-tail ${wn} ${lead} T${TBL_TITAN_TAILS.indexOf(tail)}`,
        input: wrap(`${lead} [/table] ${tail}`),
      });
    }
  }
}
