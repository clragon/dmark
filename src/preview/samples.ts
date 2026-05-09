// Built-in sample inputs for quick exploration. Used to populate the "Sample"
// dropdown when no real fixtures exist on disk yet (corpus/seed is the
// authoritative store, but it's empty until the captain commits hand-picked
// fixtures). Samples here cover the breadth of the AST so a reader can poke
// at every node type without typing.

export interface Sample {
  id: string;
  label: string;
  side: 'dtext' | 'md';
  source: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'dtext-inline',
    label: 'DText: inline mix',
    side: 'dtext',
    source:
      '[b]bold[/b], [i]italic[/i], [u]under[/u], [s]strike[/s], ' +
      '[sup]sup[/sup], [sub]sub[/sub], `inline code`, ' +
      '[color=red]red text[/color], [spoiler]inline spoiler[/spoiler].',
  },
  {
    id: 'dtext-blocks',
    label: 'DText: headers, quote, list',
    side: 'dtext',
    source:
      'h1. The Big Title\n\n' +
      'A normal paragraph with [b]bold[/b].\n\n' +
      'h2. Subhead\n\n' +
      '[quote]\nA quoted block with [i]italic[/i] inside.\n[/quote]\n\n' +
      '* item one\n* item two\n** nested\n* item three',
  },
  {
    id: 'dtext-links',
    label: 'DText: links + magic',
    side: 'dtext',
    source:
      '"named link":https://example.com/foo, bare https://example.com/bar.\n\n' +
      'Wikilink: [[fluffy]] and titled: [[fluffy|fluffy creatures]].\n\n' +
      'Tag search: {{cat solo}} and titled: {{cat solo|just cats}}.\n\n' +
      'Magic: post #1234, pool #5, BUR #7, mod action #99.',
  },
  {
    id: 'dtext-table',
    label: 'DText: table',
    side: 'dtext',
    source:
      '[table]\n[thead]\n[tr][th]Name[/th][th]Score[/th][/tr]\n[/thead]\n' +
      '[tbody]\n[tr][td]Alpha[/td][td]42[/td][/tr]\n' +
      '[tr][td]Beta[/td][td]88[/td][/tr]\n[/tbody]\n[/table]',
  },
  {
    id: 'dtext-section',
    label: 'DText: section + spoiler',
    side: 'dtext',
    source:
      '[section=Backstory]\n' +
      'Once upon a time...\n\n' +
      '[spoiler]\nA whole spoiler block here.\n[/spoiler]\n' +
      '[/section]',
  },
  {
    id: 'dtext-code',
    label: 'DText: code block',
    side: 'dtext',
    source: '[code]\nfunction hi() {\n  return 42;\n}\n[/code]',
  },
  {
    id: 'md-inline',
    label: 'Markdown: inline mix',
    side: 'md',
    source:
      '**bold**, *italic*, __under__, ~~strike~~, `inline code`, ' +
      '||inline spoiler||, [sup]sup[/sup], [sub]sub[/sub], ' +
      '[color=red]red text[/color].',
  },
  {
    id: 'md-blocks',
    label: 'Markdown: headers, quote, list',
    side: 'md',
    source:
      '# The Big Title\n\n' +
      'A normal paragraph with **bold**.\n\n' +
      '## Subhead\n\n' +
      '> A quoted block with *italic* inside.\n\n' +
      '- item one\n- item two\n  - nested\n- item three',
  },
  {
    id: 'md-links',
    label: 'Markdown: links + magic',
    side: 'md',
    source:
      '[named link](https://example.com/foo) and a bare <https://example.com/bar>.\n\n' +
      'Wikilink: [[fluffy]] and titled: [[fluffy|fluffy creatures]].\n\n' +
      'Tag search: {{cat solo}}.\n\n' +
      'Magic: post #1234, pool #5.',
  },
  {
    id: 'md-table',
    label: 'Markdown: pipe table',
    side: 'md',
    source:
      '| Name | Score |\n| --- | --- |\n| Alpha | 42 |\n| Beta | 88 |',
  },
  {
    id: 'md-code',
    label: 'Markdown: fenced code',
    side: 'md',
    source: '```\nfunction hi() {\n  return 42;\n}\n```',
  },
];
