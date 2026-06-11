# Agent Readiness Matrix

This project goal is not just raw accessibility-tree parity. `ax-grep` should
let subagents search, inspect pages, decide the next step, and recover from thin
or blocked pages with less guesswork than an `agent-browser snapshot` alone.

## Evidence Map

| Requirement | Current evidence | Completion note |
| --- | --- | --- |
| Search agents can open the best or alternate result without rebuilding commands. | `agent.resultChoices`, `openResult`, `commandArgs`; covered by `tests/cli.test.ts` and `averageSearchResultActionScore`. | Covered by focused tests and comparison gate metrics. |
| Page-check agents can read structured evidence instead of raw tree text. | `pageCheck.contentEvidence`, citations, `agent.readTargets`, `bestReadTarget`; covered by `averageAgentReadTargetScore`, citation, answer-plan, and evidence-quality gates. | Covered by tests and static comparison scoring. |
| Source-link follow-up keeps a stable pointer back to the source array. | `sourceLinkRef` on actions, compact actions, page steps, and text output; covered by CLI and public type tests. | Covered for JSON and text output. |
| Brief handoff remains executable for subagent loops. | `agent.executor`, `agent.handoff`, `commandArgs`, `readValue`, `resultChoices`, `sourceChoices`; covered by brief executor/handoff tests and gates. | Covered for common search, page, source, form, action-target, and diagnostic cases. |
| Thin, blocked, or browser-needed pages expose why browser capture is needed. | `needsBrowserHtml`, `browserHtml`, `signals`, `qualityGates`, barriers, and browser retry actions; covered by browser-need, browser-html, signal, and quality-gate scores. | Covered by non-browser fixtures and comparison scoring. |
| Hidden page signals that are absent from accessibility trees stay discoverable. | Hydration, API, config, policy, schema, resource, media, citation, code-block, and action-target summaries are scored through hidden-signal and read-target gates. | Covered by static extraction tests; real browser parity still depends on comparison runs. |
| Operational safety prevents host overload during validation. | `AGENTS.md`, `vitest.config.ts`, `docs/benchmarks.md`, `docs/comparison-baseline.md`, and the `agent-browser` comparison lock. | Commands must still be run one at a time. |

## Completion Gate

Do not call this objective complete from unit tests alone. A completion audit
must inspect:

- `pnpm exec tsc --noEmit`
- focused non-browser Vitest coverage for changed contracts
- `pnpm compare:gate <latest comparison report>` for saved comparison output
- process cleanup before and after browser-backed comparison commands
- current docs proving README details remain split into `docs/`

Browser-backed comparison suites must run sequentially. If the host is already
under browser load, postpone them rather than starting another comparison.
