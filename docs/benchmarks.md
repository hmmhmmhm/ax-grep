# Benchmarks and Comparison Gates

```sh
pnpm compare:sample
pnpm compare:static https://example.com https://news.ycombinator.com
pnpm compare:tokens https://example.com https://news.ycombinator.com
pnpm compare:static:agent
pnpm compare:static:korea-social
pnpm compare:tokens:korea-social
pnpm compare:static:china-japan
pnpm compare:tokens:china-japan
```

The comparison scripts compare `ax-grep` output with `agent-browser snapshot`
output and score the CLI `--agent` summary. The score covers `agent`,
`pageCheck`, `searchResults`, structured evidence, readability, source link
quality, verification status, recommended actions, and next steps.

Token comparisons estimate prompt cost for compact tree text and agent JSON
payloads. See [comparison-baseline.md](./comparison-baseline.md) for the current
baseline run.

Search, social, challenge, and volatile targets may be diagnostic-only and
excluded from gate averages. Check each run's `included` and `excluded` counts
before treating an average as release-gating coverage.

Current suites include:

- static HTML vs browser snapshots
- agent executor regression targets for `averageAgentExecutorScore`
- fixture-backed search open, search refine, and browser HTML retry recovery
- CLI agent summary scoring for `pageCheck`, sources, readability, and actions
- token-cost comparison for compact tree prompts and agent JSON prompts
- Korean forum/search/social targets
- Chinese and Japanese wiki/news/forum/search targets
- challenge and volatile-page diagnostics
