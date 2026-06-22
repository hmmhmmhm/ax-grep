# Benchmarks and Comparison Gates

Resource safety:

- Run these commands one at a time. Do not parallelize `compare:static*`,
  `compare:tokens*`, or browser-backed tests.
- `compare:static*` may launch `agent-browser` and Chromium. Check for existing
  browser work before starting, and confirm processes are cleaned up afterward.
- Use `pnpm readiness:audit` before claiming the agent-readiness objective is
  complete. It checks that the single-worker validation rules, fixture gate,
  comparison gate, process checker, and README/docs split are still wired in.
- Use `pnpm readiness:real-page-smoke` for the smallest real-page check. It
  fetches `https://example.com` with `--agent-brief` and does not launch
  Puppeteer or `agent-browser`.
- Use `pnpm readiness:search-smoke` for the smallest real search check. It
  runs `--search "ax-grep npm" --engine auto --agent-brief`, verifies engine
  attempts, and does not launch Puppeteer or `agent-browser`.
- Use `pnpm readiness:agent-browser-smoke` for the smallest `agent-browser`
  comparison set. It checks `https://example.com` and
  `https://books.toscrape.com/`, `https://news.ycombinator.com`, and
  `https://www.gov.uk/foreign-travel-advice`; run `pnpm check:processes`
  before and after it.
- Use `pnpm readiness:agent-browser-text-heavy-smoke` only when checking the
  text-heavy document policy. It checks Korean Wikipedia separately from the
  main smoke because strict StaticText overlap is tracked apart from structural
  content readiness.
- Use `pnpm check:processes` before and after browser-backed comparison runs.
- If several target sets are needed, run them sequentially and save each output
  separately.

```sh
pnpm benchmark:agent-cost
pnpm benchmark:library-cost
pnpm benchmark:web-extractors
pnpm compare:sample
pnpm compare:static:fixtures
pnpm compare:static:fixtures:gate
pnpm readiness:audit
pnpm readiness:real-page-smoke
pnpm readiness:search-smoke
pnpm readiness:agent-browser-smoke
pnpm readiness:agent-browser-text-heavy-smoke
pnpm check:processes
pnpm compare:static https://example.com https://news.ycombinator.com
pnpm compare:tokens https://example.com https://news.ycombinator.com
pnpm compare:static:agent
pnpm compare:static:korea-social
pnpm compare:tokens:korea-social
pnpm compare:static:china-japan
pnpm compare:tokens:china-japan
pnpm compare:gate /tmp/ax-grep-agent.json /tmp/ax-grep-tokens.json
```

The comparison scripts compare `ax-grep` output with `agent-browser snapshot`
output and score the CLI `--agent` summary. The score covers `agent`,
`pageCheck`, `searchResults`, structured evidence, readability, source link
quality, verification status, recommended actions, and next steps.

Token comparisons estimate prompt cost for compact tree text and agent JSON
payloads. See [comparison-baseline.md](./comparison-baseline.md) for the current
baseline run.

## Agent Cost Benchmark

`pnpm benchmark:agent-cost` compares `ax-grep --agent-brief` with
`agent-browser snapshot --compact` on local fixture pages. It runs cases
sequentially, writes `tmp/benchmarks/agent-cost.json`, and closes the browser
session after each case.

Latest local run:

| Case | ax-grep peak RSS | agent-browser peak RSS | RAM multiple | ax-grep decision tokens | agent-browser tokens | Token multiple |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| content-page | 80.0 MB | 906.4 MB | 11.3x | 631 | 1,903 | 3.0x |
| challenge-page | 72.1 MB | 1,404.7 MB | 19.5x | 910 | 241 | 0.3x |

Summary: average RAM reduction was 15.4x. The content fixture used 3.0x fewer
decision tokens when the agent reads the compact handoff instead of a browser
snapshot. The challenge fixture is primarily a memory/browser-avoidance win:
`ax-grep` detects hCaptcha markers and returns an explicit browser handoff
without launching Chromium.

Search, social, challenge, and volatile targets may be diagnostic-only and
excluded from gate averages. Check each run's `included` and `excluded` counts
before treating an average as release-gating coverage.

## Library Cost Benchmark

`pnpm benchmark:library-cost` measures warm in-process `extract(html)` calls and
writes `tmp/benchmarks/library-cost.json`. It does not fetch remote pages and
does not launch a browser. This is the better metric for server integrations
where a Node process is already running and the question is incremental RSS per
library call, not total CLI process RSS.

The report includes:

- `incrementalRssKb`: RSS after extraction minus RSS before extraction.
- `estimatedTokens`: `cl100k_base` tokens for `formatSemanticTreeText(tree)`.
- `summary.nodeCount`: semantic tree size after compact extraction.

Run it with the package script so Node exposes GC before each measured case:

```sh
pnpm benchmark:library-cost
```

Use `benchmark:agent-cost` for CLI-vs-browser release claims. Use
`benchmark:library-cost` for server SDK sizing and memory regression checks.

## Web Extractor Benchmark

`pnpm benchmark:web-extractors` compares ax-grep against local, keyless
LLM-ready web extraction tools. It does not call hosted extraction APIs. It runs
providers sequentially and writes `tmp/benchmarks/web-extractors.json`.

Default providers:

- `ax-grep`: local `--agent-brief` output through `dist/cli.js`.
- `readability`: local `@mozilla/readability` with `linkedom`.
- `turndown-lib`: local `turndown` HTML-to-Markdown conversion.
- `html-to-text-lib`: local `html-to-text` conversion.
- `crawl4ai`: local Crawl4AI CLI, skipped unless `crwl` is installed.
- `trafilatura`: local `trafilatura` CLI, skipped unless installed.
- `lynx`: local text browser dump, skipped unless installed.
- `w3m`: local text browser dump, skipped unless installed.
- `pandoc`: local HTML-to-Markdown conversion, skipped unless installed.
- `html2text`: local HTML-to-Markdown conversion, skipped unless installed.

Example:

```sh
pnpm benchmark:web-extractors --providers ax-grep,readability,turndown-lib,html-to-text-lib https://example.com
pnpm benchmark:web-extractors --target-set agent-executor --timeout 60000
```

The report records status, duration, output bytes, estimated `cl100k_base`
tokens, subprocess peak RSS when available, and token/byte/duration ratios
against ax-grep. In-process library providers report token, byte, and duration
metrics but not isolated RSS. Missing programs are `skipped`, not failures, so
the same command can run on lean servers and fuller benchmark machines.

Latest local library-only run:

| Case | HTML bytes | Incremental RSS | Output tokens | Nodes |
| --- | ---: | ---: | ---: | ---: |
| content-page | 737 | 0 KB | 79 | 16 |
| challenge-page | 251 | 0 KB | 8 | 2 |
| large-list-page | 37,390 | 896 KB | 428 | 76 |

Summary: max incremental RSS was 896 KB, average incremental RSS was 299 KB.

`compare:static:fixtures:gate` is the non-browser smoke gate: it uses synthetic
HTML fixtures only, so it should not fetch remote pages or launch
`agent-browser`. Use `compare:static:fixtures` when you need the JSON report.

`readiness:real-page-smoke` is the smallest remote-page gate. It checks that
`--agent-brief` can use fetched HTML on `https://example.com` without requesting
browser capture.

`readiness:agent-browser-smoke` is the smallest browser-backed comparison gate.
It runs `pnpm compare` for `https://example.com` and
`https://books.toscrape.com/`, `https://news.ycombinator.com`, and
`https://www.gov.uk/foreign-travel-advice`, requires `agent-browser`
snapshots, and enforces per-target overlap/readiness floors. Treat it like
other browser-backed work: one command at a time, with process checks before
and after.

`readiness:agent-browser-text-heavy-smoke` is a separate browser-backed
comparison for text-heavy document pages. It requires Korean Wikipedia to keep
usable action/navigation/structural-content recall while still reporting strict
text recall separately.

`compare:gate` checks saved JSON output from `compare:static*` and
`compare:tokens*`. Static gates require executor, handoff, browser-advantage,
search/page decision, and action-list scores to stay near 1.0 with no
gate-included challenge, shell, or over-collected classifications. Token gates
require the compact agent payload average to stay cheaper than the browser
reference after thin browser snapshots are excluded.

Current suites include:

- static HTML vs browser snapshots
- fixture-only agent readiness smoke checks
- agent executor regression targets for `averageAgentExecutorScore`
- fixture-backed search open, search refine, and browser HTML retry recovery
- CLI agent summary scoring for `pageCheck`, sources, readability, and actions
- token-cost comparison for compact tree prompts and agent JSON prompts
- Korean forum/search/social targets
- Chinese and Japanese wiki/news/forum/search targets
- challenge and volatile-page diagnostics
