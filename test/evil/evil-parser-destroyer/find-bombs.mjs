// One-shot bomb detector. Runs each input through parseDText with a hard
// time budget per case, in a child process so an OOM kills only that child.
// Usage: node test/evil/evil-parser-destroyer/find-bombs.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNNER = resolve(__dirname, 'bomb-runner.mjs');
const REPO = resolve(__dirname, '..', '..', '..');
const TSX = resolve(
  REPO,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
);

const cases = [
  ['url-trailing-dot', 'see https://example.com. yes'],
  ['url-trailing-2dots', 'see https://example.com.. yes'],
  ['url-ellipsis', 'see https://example.com... yes'],
  ['url-paren', 'see https://example.com/a) yes'],
  ['url-paren-comma', 'see https://example.com/a), yes'],
  ['url-question', 'see https://example.com? yes'],
  ['url-bang', 'see https://example.com! yes'],
  ['url-semicolon', 'see https://example.com; yes'],
  ['url-colon', 'see https://example.com: yes'],
  ['url-rbracket', 'see https://example.com/a] yes'],
  ['url-rbrace', 'see https://example.com/a} yes'],
  ['color-short-hex', '[color=#abc]x[/color]'],
  ['color-upper-hex', '[color=#ABCDEF]x[/color]'],
  ['color-mixed-case', '[color=Red]x[/color]'],
  ['color-art-upper', '[color=ART]x[/color]'],
  ['color-artist-upper', '[color=ARTIST]x[/color]'],
  ['color-7hex', '[color=#1234567]x[/color]'],
  ['color-empty', '[color=]x[/color]'],
  ['color-disabled', '[color=red]x[/color]'],
  ['sup-4-deep', '[sup][sup][sup][sup]x[/sup][/sup][/sup][/sup]'],
  ['interleaved-supsub', '[sub][sup][sub][sup]x[/sup][/sub][/sup][/sub]'],
  ['stray-quote', 'before [/quote] after'],
  ['stray-section', 'before [/section] after'],
  ['stray-spoiler', 'before [/spoiler] after'],
  ['stray-b', 'before [/b] after'],
  ['stray-i', 'before [/i] after'],
  ['overlap-bi', '[b][i]hi[/b][/i]'],
  ['overlap-ib', '[i][b]hi[/i][/b]'],
  ['unclosed-b', '[b]bold without end'],
  ['unclosed-i', '[i]ital without end'],
  ['unclosed-quote', '[quote]quote without end'],
  ['unclosed-code', '[code]code without end'],
  ['unclosed-section', '[section]section without end'],
  ['code-with-bold', '[code][b]bold[/b][/code]'],
  ['code-html', '[code]<script>alert("x")</script>[/code]'],
  ['code-backticks', '[code]`inline`[/code]'],
  ['post-zeros', 'post #00001'],
  ['post-trailing-dot', 'see post #1234.'],
  ['post-cap', 'Post #1234'],
  ['post-no-space', 'post#1234'],
  ['pool-non-numeric', 'pool #abc'],
  ['pool-huge', 'pool #999999999999999999'],
  ['comment-comma', 'see comment #42, ok'],
  ['wiki-ws', '[[ ]]'],
  ['wiki-empty-title', '[[wiki|]]'],
  ['wiki-empty-target', '[[|title]]'],
  ['wiki-multipipe', '[[wiki|title|extra]]'],
  ['wiki-unicode', '[[Ōmukade]]'],
  ['wiki-upper', '[[Foo Bar]]'],
  ['wiki-anchor-title', '[[wiki#anchor|Display]]'],
  ['wiki-anchor-space', '[[wiki#some anchor]]'],
  ['wiki-html', '[[<script>]]'],
  ['header-empty', 'h1.\n'],
  ['header-h7', 'h7. nope\n'],
  ['header-no-space', 'h1.no_space\n'],
  ['header-indented', ' h1. indented\n'],
  ['header-back-to-back', 'h1. one\nh2. two\n'],
  ['quote-nested', '[quote][quote]inner[/quote][/quote]'],
  ['quote-attr', '[quote=Author]hi[/quote]'],
  ['section-empty', '[section][/section]'],
  ['section-collapsed', '[section,collapsed]hi[/section]'],
  ['section-empty-title', '[section=]hi[/section]'],
  ['spoiler-empty', '[spoiler]\n[/spoiler]'],
  ['spoiler-html', '[spoiler]<x>[/spoiler]'],
  ['list-no-space', '*x\n*y\n'],
  ['list-blank', '* a\n\n* b\n'],
  ['list-deep-triple', '*** deep one\n*** deep two\n'],
  ['list-inline', '* item with [b]bold[/b]\n* plain\n'],
  ['anchor-upper', '[#UPPER_anchor]'],
  ['anchor-dashes', '[#with-dashes]'],
  ['anchor-unicode', '[#中文]'],
  ['textile-bare-host', '"link":example.com'],
  ['textile-trailing-dot', '"link":https://example.com.'],
  ['textile-bracketed-space', '"link":[/path with space]'],
  ['textile-empty-title', '"":https://example.com'],
  ['textile-no-url', '"link":'],
  ['textile-relative', '"users":/users'],
  ['table-empty', '[table][/table]'],
  ['table-loose', '[table]\n[tr]\n[td]cell[/td]\n[/tr]\n[/table]'],
  ['header-quote', 'h1. title\n[quote]q[/quote]'],
  ['header-no-newline', 'h1. title'],
  ['crlf', 'hello\r\n\r\nworld'],
  ['only-newlines', '\n\n\n'],
  ['inline-doc-start', '[b]start[/b] then text'],
  ['tab-indent', '\thello world'],
  ['empty-bold', '[b][/b]'],
  ['double-bold', '[b][b]double[/b][/b]'],
  ['escaped-brackets', '\\[b\\]not bold\\[/b\\]'],
  ['backtick-escape', '\\`'],
  ['literal-slash', '[/]'],
  ['lt-gt', '<not a tag>'],
  ['amp-alone', 'A & B'],
  ['entity-literal', '&amp; literal'],
  ['anchor-mid', 'before [#mid] after'],
  ['anchor-doubled', '[#a][#b]'],
  ['url-fullwidth-paren', 'see https://example.com／a） yes'],
];

const TIMEOUT_MS = 4000;
const MEM_MB = 512;

async function runOne(name, input) {
  return new Promise((resolveP) => {
    const child = spawn(TSX, [RUNNER], {
      cwd: REPO,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${MEM_MB}` },
      shell: process.platform === 'win32',
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => (out += b.toString()));
    child.stderr.on('data', (b) => (err += b.toString()));
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
    }, TIMEOUT_MS);
    child.on('exit', (code, sig) => {
      clearTimeout(t);
      resolveP({
        code,
        sig,
        out: out.trim().slice(0, 200),
        err: err.trim().slice(0, 200),
      });
    });
    child.stdin.write(JSON.stringify({ input }));
    child.stdin.end();
  });
}

const results = [];
for (const [name, input] of cases) {
  const r = await runOne(name, input);
  const ok = r.code === 0;
  if (!ok) {
    console.log(`BOMB ${name} code=${r.code} sig=${r.sig} err=${r.err}`);
  }
  results.push({ name, ...r });
}

const bombs = results.filter((r) => r.code !== 0);
console.log(`\nbombs: ${bombs.length}/${results.length}`);
for (const b of bombs) console.log(`  ${b.name}`);
