# Dmark

The gold standard for rendering dtext on the web.

Dmark parses [dtext](https://e621.net/help/dtext) at stupid speeds, in TypeScript, on the client. It runs through an intermediary AST and is tested thoroughly against the Ruby/Ragel implementation ([e621ng/dtext](https://github.com/e621ng/dtext)). It also parses a special flavour of Markdown, with a full roundtrip.

## Promises

Dmark tries to fulfill these promises throughout its lifetime:

True to the source: we prove we render dtext exactly like e621's source code, matching it on 99% of a huge corpus of real wiki pages.

Very fast: we optimize Dmark to render live in the browser, a couple of milliseconds per page, fast enough to feel instant as you type.

Stable: Dmark parses both dtext and its own [Markdown flavour](docs/mapping.md), which has equivalents for every dtext element. When it renders dtext or markdown, it parses and renders back without changes.

Resilient: Dmark tries not to fail to render. In specific edge cases, it emits diagnostic warnings you can use to understand why it couldn't parse something correctly.

## Layout

```
src/
  ast/              shared canonical AST (the middle of every conversion)
  dtext/parse/      dtext string -> AST
  dtext/render-html/AST -> html (matches ruby reference under normalization)
  dtext/render/     AST -> dtext string (round-trip)
  md/parse/         markdown string -> AST (wraps markdown-it)
  md/render/        AST -> markdown string
  diagnostics/      lossy-mapping reports
  preview/          vanilla TS + Vite live preview page
oracle/             ruby + e621ng/dtext gem in a docker container, used as the test oracle
scripts/            fetch-corpus, oracle-smoke, etc.
corpus/seed/        ~10 hand-picked dtext fixtures, committed (offline tests)
corpus/golden/      large corpus from db_export, gitignored, fetched on demand
test/               cross-cutting test infra (dom-equal, oracle lifecycle)
ref/                external clones (e621ng/dtext for Ragel lookup), gitignored
docs/               mapping spec and architecture decision records (adr/)
```

## Performance

Measured on the golden corpus (50 fixtures, 16 KB to 108 KB), Node 22 on a development machine.

|                       | dmark  | ruby oracle | ratio |
| --------------------- | ------ | ----------- | ----- |
| <=20 KB cohort median | 1.0 ms | 49.0 ms     | 49x   |
| <=20 KB cohort p95    | 3.0 ms | 53.6 ms     | 18x   |
| full-corpus median    | 1.9 ms | 49.2 ms     | 25x   |
| worst fixture (108 KB)| 7.4 ms | 50.9 ms     | 7x    |

The oracle is the real e621ng/dtext gem in a docker container; both the tests and this benchmark run against it, so docker is required.

### Reproducing

```sh
# 1. Build the golden corpus from db_export. Gitignored, ~75 MB total.
#    `corpus:build` runs fetch (full eligible set into staging/),
#    survey (round-trip + oracle parity, fault-isolated), and curate
#    (selects ~150 representatives into golden/).
npm run corpus:build

# 2. Build the oracle image once. Required for the cross-pipeline bench
#    and the corpus survey's oracle parity check.
npm run oracle:build

# 3. Parse + render through dmark only. Fast, no docker.
npx tsx scripts/bench-parse.ts 30 --save --label local

# 4. Side-by-side dmark vs the ruby gem (spawns a container per run).
npx tsx scripts/bench-vs-oracle.ts 10
```

`scripts/bench-parse.ts --split` decomposes total time into parse vs render so a regression hunt knows which side moved.
