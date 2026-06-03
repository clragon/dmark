# Dmark

Two-way `dtext ↔ markdown` parser with a shared AST. TypeScript, client-side, fast.

Goal: write [dtext](https://e621.net/help/dtext) using markdown syntax, render either side to html, and prove the rendered output matches the reference [e621ng/dtext](https://github.com/e621ng/dtext) ruby implementation.

## Verifiable guarantees

1. **Faithfulness.** For ≥99% of pages in a corpus drawn from the e621 `db_export/wiki_pages` dump, `dtext --Dmark--> md --Dmark--> html` is DOM-equal (under documented normalization) to `dtext --ruby--> html`.
2. **Round-trip.** `dtext → md → dtext → html` produces the same html as `dtext → html` on the second pass (html-stable; string-stable is a non-required bonus).
3. **Performance.** Median <3 ms, p95 <8 ms for a ≤20 KB page on a midrange laptop. Typing-preview <2 ms p95 on ≤5 KB. Worst-case ≤15 ms median on a 100 KB page. At least 10x faster than the ruby reference renderer on the same input. Benched in CI; see [Performance](#performance) below for the current numbers and how to reproduce them.
4. **Lossy mappings are explicit.** When a markdown construct has no exact dtext equivalent, the conversion records a `Diagnostic` so callers can surface it. Constructs with no sensible mapping are rejected at parse time, not silently dropped.

If a feature can't be tied to one of these guarantees, it's out of scope.

## Layout

```
src/
  ast/              shared canonical AST (the middle of every conversion)
  dtext/parse/      dtext string → AST
  dtext/render-html/AST → html (matches ruby reference under normalization)
  dtext/render/     AST → dtext string (round-trip)
  md/parse/         markdown string → AST (wraps micromark/remark)
  md/render/        AST → markdown string
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

Current state of the dtext pipeline on the golden corpus (50 fixtures, sizes 16 KB to 108 KB), Node 22 on a midrange laptop. Numbers refresh on every CI bench run.

```
                          dmark         ruby oracle    ratio
≤20 KB cohort median       1.0 ms        49.0 ms       49x
≤20 KB cohort p95          3.0 ms        53.6 ms       18x
full-corpus median         1.9 ms        49.2 ms       25x
worst fixture (108 KB)     7.4 ms        50.9 ms        7x
```

Both pipelines are measured the way they are consumed: dmark in-process, the ruby oracle over its loopback HTTP endpoint (its only public interface). HTTP round-trip overhead is ~1.3 ms; the rest of the oracle's time is the gem itself.

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

## Test oracle

Tests verify Dmark output against the actual ruby implementation by spawning a docker container that wraps the e621ng/dtext gem and exposes a tiny http endpoint. No network, no rate limits, no scraping. Docker is required for tests.

## Markdown ↔ dtext mapping

See `docs/mapping.md` for the per-construct rules and `docs/adr/` for the architecture decisions that shaped them.
