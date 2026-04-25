# Dmark

Two-way `dtext ↔ markdown` parser with a shared AST. TypeScript, client-side, fast.

Goal: write [dtext](https://e621.net/help/dtext) using markdown syntax, render either side to html, and prove the rendered output matches the reference [e621ng/dtext](https://github.com/e621ng/dtext) ruby implementation.

## Verifiable guarantees

1. **Faithfulness.** For ≥99% of pages in a corpus drawn from the e621 `db_export/wiki_pages` dump, `dtext --Dmark--> md --Dmark--> html` is DOM-equal (under documented normalization) to `dtext --ruby--> html`.
2. **Round-trip.** `dtext → md → dtext → html` produces the same html as `dtext → html` on the second pass (html-stable; string-stable is a non-required bonus).
3. **Performance.** Median <10 ms, p95 <25 ms for a ≤20 KB page on a midrange laptop. Typing-preview <5 ms p95 on ≤5 KB. Benched in CI.
4. **Lossy mappings are explicit.** When a markdown construct has no exact dtext equivalent, the conversion records a `Diagnostic` so callers can surface it. Constructs with no sensible mapping are rejected at parse time, not silently dropped.

If a feature can't be tied to one of these guarantees, it's out of scope.

## Layout

```
src/
  ast/              shared canonical AST (the middle of every conversion)
  dtext/parse/      dtext string → AST (ported from Forderband)
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
```

## Test oracle

Tests verify Dmark output against the actual ruby implementation by spawning a docker container that wraps the e621ng/dtext gem and exposes a tiny http endpoint. No network, no rate limits, no scraping. Docker is required for tests.

## Markdown ↔ dtext mapping

See `markdown.md` at the repo root. Treat that doc as the design spec; deviations need justification.
