# Current Progress

Status: about 85% fit for the goal of making `ax-grep --agent` a useful
first-pass page/search checker before `agent-browser`.

Last updated: 2026-06-12.

This is a research track, so the target can expand when comparison work finds a
new class of browser accessibility-tree signal that static HTML can expose
safely. When that happens, add it to this file instead of treating the earlier
percentage as a fixed contract.

## Progress Model

| Area | Current estimate | Evidence |
| --- | ---: | --- |
| README/docs hygiene | 90% | Root README is short; detailed docs live under `docs/`. |
| Process safety | 85% | `AGENTS.md`, `pnpm check:processes`, and non-browser gates are in place. |
| Search result handoff | 82% | Result choices, host shortcuts, source hints, verification, decision counts, and command args are exposed. |
| Page check handoff | 86% | Forms, action targets, table navigation shortcuts, hidden signal group counts/top shortcuts/selectors, static-readiness reasons, browser-capture reasons/codes/execution shortcuts, barriers, and read targets are exposed. |
| Semantic accessibility signals | 78% | Landmarks, headings, links, buttons, fields, values, relations, choices, states, list item refs, and table header/cell navigation shortcuts are exposed. |
| Browser-tree parity research | 60% | Static gates exist; browser-backed checks must stay sequential and limited. |

Overall estimate: 85%. This is intentionally conservative because the final
goal is comparative usefulness, not just passing the current tests.

Reading guide:

- 90% or higher means the area is useful in normal agent handoff flows and only
  needs maintenance unless new research expands the target.
- 75-89% means the area works for known fixtures but still has known comparison
  or fallback gaps.
- 60-74% means the area has infrastructure and early evidence, but the research
  set is still too small to call stable.
- Below 60% means the area should not be used as a completion signal.

The estimate can move down as well as up. If research finds a browser
accessibility-tree signal that is important for agents and not yet represented
by static output, record it here, add a candidate task, and adjust the estimate
instead of hiding the new scope.

## Active Work Tracker

| Track | Progress | Current work | Remaining work | Next checkpoint |
| --- | ---: | --- | --- | --- |
| Documentation control | 90% | Keep README short and move long operational detail into `docs/`. | Add only status, safety, and research notes that help future sessions resume quickly. | README length/mojibake tests pass after each docs change. |
| Process containment | 85% | Keep validation sequential and check for leftover browser/test/comparison processes. | Add more explicit notes when a task would require browser-backed validation, including why it is necessary. | `pnpm check:processes` before and after risky work shows no leftovers. |
| Search handoff | 82% | Expose enough ranked-result context for an agent to choose, open, or skip results. | Identify whether ranked result snippets need stronger dedupe, provenance, or failed-open reasons. | A static search fixture lets an agent choose a result without browser inspection first. |
| Page handoff | 86% | Surface barriers, read targets, action targets, table navigation shortcuts, hidden signal group shortcuts, static-readiness reasons, and browser-capture reason/execution shortcuts. | Tighten fallback decisions for client-rendered, blocked, and low-content pages. | Fixtures show clear `use static output` vs `need browser capture` reasons. |
| Semantic accessibility | 78% | Continue adding high-value shortcuts from roles, states, relations, lists, tables, and controls. | Compare table/grid/list/control output against browser-tree expectations and add only useful static equivalents. | Each accepted signal has a public type, CLI output, compact output, and fixture/test coverage. |
| Browser parity research | 60% | Compare static output against a small sequential fixture set and record gaps. | Expand the gap list as research finds new browser accessibility-tree signals; lower estimates if new important gaps appear. | Each gap is tagged `implement`, `browser-only`, or `defer` with priority and evidence. |

## Active Work Detail

These are the items currently being worked or prepared. Use this table to
estimate whether the overall percentage should move.

| ID | Item | Progress | Current output | Still needed | Completion signal | Estimate impact |
| --- | --- | ---: | --- | --- | --- | ---: |
| A1 | Answer/evidence citation shortcuts | 100% | Top-level citation count and first citation id were implemented, validated, committed, and pushed. | Watch for regressions only. | Typecheck, focused CLI tests, static comparison gate, readiness audit, and process check passed. | Landed. |
| A2 | Static-vs-browser gap ledger | 45% | Research scope ledger exists and requires every new signal to be tracked. | Add observed gap rows from the next sequential fixture comparison instead of generic placeholders. | Each new gap has source, priority, decision, status, and next command. | +3-5% to browser parity research. |
| A3 | Table/grid ownership research | 65% | Header refs now include path, role, row/column index, sort state, and selector; cell refs keep row/column/header context. | Decide whether deeper grid ownership such as `aria-owns`/virtualized rows needs separate table-level shortcuts. | Either implement missing static shortcuts or mark as `browser-only`/`defer` with evidence. | +1-3% more to semantic accessibility. |
| A4 | Browser fallback policy | 70% | Browser HTML reason/code/action/operation/args/capture shortcuts and static-readiness status/reason/readFrom shortcuts exist. | Add more observed low-content, blocked, client-rendered, and interaction-required categories. | Fixtures show clear `use static` or `need browser capture` reasons without manual interpretation. | +1-3% more to page handoff. |
| A5 | Process-safety guardrails | 85% | `AGENTS.md`, progress rules, and `pnpm check:processes` are in place. | Keep every validation run sequential and document any browser-backed exception before running it. | No leftover browser/test/comparison processes before final handoff. | Prevents regression rather than raising feature %. |

## Planned Work Detail

| Order | Work | Why it matters | Entry condition | Done when | Risk |
| ---: | --- | --- | --- | --- | --- |
| 1 | Validate and land citation shortcut work. | Agents can cite ready answers without parsing nested `answerPlan.useCitationIds`. | Current WIP compiles. | The focused tests and gates pass, then the change is committed and pushed. | Low; public type expansion only. |
| 2 | Convert the generic research ledger into observed gap records. | Progress becomes auditable instead of a broad percentage. | One small sequential fixture comparison is selected. | At least one real fixture result is recorded as `implement`, `browser-only`, or `defer`. | Medium; browser-backed checks must remain limited. |
| 3 | Re-check table/grid semantics against the observed gaps. | Tables are a major place where accessibility-tree context can beat plain HTML. | Gap record says current static output is insufficient. | New shortcut is added with public type/CLI/compact/test coverage, or the gap is documented as not worth implementing. | Medium; avoid adding noisy fields. |
| 4 | Tighten fallback policy categories. | Agents need to know when static inspection is enough and when browser capture is justified. | A fixture or real page produces unclear fallback guidance. | Reason codes and docs explain the decision without reading nested plans. | Medium; fetch/browser behavior can vary. |
| 5 | Keep README short while moving detail into docs. | Prevents another unreadable README buildup. | Any new long explanation is needed. | README tests pass and the detail lives under `docs/`. | Low. |

## Milestone Tracker

| Milestone | Estimate impact | Status | Evidence needed |
| --- | ---: | --- | --- |
| M1: README and docs stay controlled. | Keeps 90% docs hygiene stable. | In progress. | README tests pass and long operational detail remains under `docs/`. |
| M2: No process leaks during validation. | Keeps 85% process containment stable. | In progress. | Sequential commands plus clean `pnpm check:processes` results before/after risky runs. |
| M3: Static page output gives clear browser fallback reasons. | +2-4% page handoff. | In progress. | Reason codes cover observed no-content, fetch, retry, and browser-interaction cases. |
| M4: Semantic tables/lists/controls have enough path shortcuts for agents to jump directly to evidence. | +3-6% semantic accessibility. | In progress. | Top shortcuts and nested refs include stable paths, selectors, and resolved context. |
| M5: Browser parity gaps are tracked as research scope, not hidden churn. | +5-10% browser parity research. | Planned. | A maintained gap table records candidate signal, source, priority, decision, and validation result. |

## Research Scope Ledger

Research can grow while the work is underway. When a new useful
accessibility-tree signal appears, add it here before implementing so progress
estimates stay honest.

| Signal or gap | Source | Priority | Decision | Status |
| --- | --- | --- | --- | --- |
| Table/grid ownership and cell navigation context beyond first-row shortcuts. | Static/browser fixture comparison. | P1 | Added header refs with path, role, row/column index, sort state, and selector; keep investigating deeper ownership only if fixtures show it matters. | In progress. |
| Browser-only fallback reasons for client-rendered or blocked pages. | Failed or low-content page checks. | P1 | Added `staticReadiness`, `staticReadinessReason`, and `staticReadinessReadFrom` so agents can distinguish usable content, structured data, hidden app data, thin output, and browser-required cases. | In progress. |
| Search-result provenance and failed-open reasons. | Search handoff review. | P2 | Added result/source choice host shortcuts so agents can compare provenance without parsing URLs; keep failed-open reason work as a candidate. | In progress. |
| Additional browser accessibility-tree signals discovered during sequential comparison. | Future research. | P1/P2 after triage. | Add to this ledger, then classify as `implement`, `browser-only`, or `defer`. | Watch. |

When research expands:

1. Add the new signal or gap to the ledger before implementation.
2. Lower or hold the relevant percentage until the gap is classified.
3. Record the smallest validation command that proves the decision.
4. Keep browser-backed validation sequential and run `pnpm check:processes`
   afterward.

## Current Focus

1. Browser parity research: compare static semantic output with browser
   accessibility output on a small fixture set, one command at a time.
2. Gap triage: classify each missing signal as `implement`, `document as
   browser-only`, or `defer`.
3. Shortcut selection: only add top-level fields when they reduce agent
   routing work or reduce unnecessary browser handoff.
4. Safety verification: keep process cleanup checks visible in the workflow so
   the previous server freeze does not repeat.

## Research Rules

- Research goals may expand when a new useful browser accessibility-tree signal
  is found.
- New scope must be tracked here with priority, expected value, and status.
- Percentages are estimates of current usefulness, not a promise that the whole
  research space is closed.
- Browser-backed checks must stay sequential and limited. Prefer static
  fixtures, type checks, and non-browser gates first.
- If a task requires browser execution, run the smallest possible case and
  verify cleanup with `pnpm check:processes` afterward.

## Done

- Kept the root README short and moved detailed docs under `docs/`.
- Added agent handoff fields for search results, forms, source links, barriers,
  hidden signals, semantic links, buttons, fields, choices, and state.
- Added action target state: disabled, pressed, expanded, popup, and controls.
- Added field-level `aria-details` and `aria-errormessage` shortcuts with
  resolved text.
- Added list item refs with role, position, set size, current, selected, and
  expanded state for list/tree/menu navigation.
- Added table cell header refs so sampled table/grid cells keep resolved
  `headers` context.
- Added top semantic table first-header and first-sample-cell shortcuts so
  agents can inspect row, column, span, header, and selector context without
  parsing the full table refs array.
- Added semantic table sample-cell ref paths so agents can jump back to the
  exact `agent.semanticSummary.tableItems[*].sampleCellRefs[*]` item.
- Added semantic table sample-cell row/column header shortcuts so agents can
  distinguish browser-tree table context by header role, not only header text.
- Added semantic table header refs and first-header shortcuts so agents can
  inspect columnheader/rowheader path, role, row/column index, sort state, and
  selector without parsing the full table payload.
- Added top data-table navigation shortcuts for header count, first header,
  first row, first cell, and selector so agents can inspect table shape without
  reading the full table payload.
- Added top hidden signal selectors so agents can jump from hydration/API/client
  hints back to the exact script or link source before deciding on browser
  capture.
- Added hidden signal group counts for hydration, API endpoints, client state,
  and app hints so agents can see which static data channels exist without
  scanning nested arrays.
- Added top hidden signal group shortcuts for hydration, API endpoints, client
  state, and app hints so agents can jump directly to the most useful static
  data source in each group.
- Added static-readiness shortcuts so agents can tell whether fetched HTML is
  usable as direct content, structured data, hidden app data, thin output, or a
  browser-required case before opening a browser.
- Added `browserHtmlReason` so agents can explain why browser capture is needed
  without digging through nested answer-plan gaps.
- Added `browserHtmlReasonCode` so agents can branch on browser fallback causes
  such as no inspectable content, HTTP errors, fetch failures, retry actions,
  and browser interaction.
- Added top-level browser HTML capture shortcuts for action, operation, command
  args, capture file, and capture script so agents can execute fallback without
  parsing nested runbook/execution-plan objects.
- Kept semantic unavailable target role/name/selector shortcuts in brief output
  so agents can identify browser-inaccessible static targets without expanding
  the full semantic summary.
- Added top-level answer citation count and first citation id shortcuts so
  agents can cite ready answers without parsing `answerPlan.useCitationIds`.
- Added non-browser fixture gates and readiness audits for repeatable checks.
- Added process-safety guidance: run tests and browser-backed checks
  sequentially, and verify process cleanup.
- Added top-level search decision count shortcuts for relevance, official
  result, and find-match totals so agents can judge result quality without
  parsing the nested `searchDecision` object.
- Added result/source choice host shortcuts so agents can compare domains and
  provenance without parsing URLs before opening a result.

## In Progress

- Compare static semantic output against browser accessibility output for a
  small, sequential fixture set and record any newly discovered signal gaps.

## Next Candidates

- Add missing top-level shortcuts only when they improve agent routing or
  reduce the need for browser handoff.
- Improve table/grid summaries where browser trees expose useful ownership or
  navigation context not already covered by row/column/header refs.
- Track cases where static HTML should stop and recommend browser capture
  instead of guessing.

## Safety Rule

Use one validation command at a time. Before and after risky work, run:

```sh
pnpm check:processes
```
