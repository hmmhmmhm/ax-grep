# Current Progress

Status: about 85% fit for the goal of making `ax-grep --agent` a useful
first-pass page/search checker before `agent-browser`.

This is a research track, so the target can expand when comparison work finds a
new class of browser accessibility-tree signal that static HTML can expose
safely. When that happens, add it to this file instead of treating the earlier
percentage as a fixed contract.

## Progress Model

| Area | Current estimate | Evidence |
| --- | ---: | --- |
| README/docs hygiene | 90% | Root README is short; detailed docs live under `docs/`. |
| Process safety | 85% | `AGENTS.md`, `pnpm check:processes`, and non-browser gates are in place. |
| Search result handoff | 80% | Result choices, source hints, verification, and command args are exposed. |
| Page check handoff | 84% | Forms, action targets, table navigation shortcuts, hidden signal group counts/top shortcuts/selectors, browser-capture reasons/codes, barriers, and read targets are exposed. |
| Semantic accessibility signals | 76% | Landmarks, headings, links, buttons, fields, values, relations, choices, states, list item refs, and table cell header shortcuts are exposed. |
| Browser-tree parity research | 60% | Static gates exist; browser-backed checks must stay sequential and limited. |

Overall estimate: 85%. This is intentionally conservative because the final
goal is comparative usefulness, not just passing the current tests.

The estimate can move down as well as up. If research finds a browser
accessibility-tree signal that is important for agents and not yet represented
by static output, record it here, add a candidate task, and adjust the estimate
instead of hiding the new scope.

## Active Work Tracker

| Track | Progress | Current work | Done when |
| --- | ---: | --- | --- |
| Documentation control | 90% | Keep README short and move long operational detail into `docs/`. | README stays under the enforced length limit and detailed notes are discoverable from docs links. |
| Process containment | 85% | Keep validation sequential and check for leftover browser/test/comparison processes. | Every risky run starts and ends with `pnpm check:processes`, and no browser-backed parallel checks are introduced. |
| Search handoff | 80% | Expose enough ranked-result context for an agent to choose, open, or skip results. | Agents can explain which result to open and why without relying on browser inspection first. |
| Page handoff | 84% | Surface barriers, read targets, action targets, table navigation shortcuts, hidden signal group shortcuts, and browser-capture reason codes. | Agents can decide whether static HTML is enough, which source to inspect next, or why browser capture is needed. |
| Semantic accessibility | 76% | Continue adding high-value shortcuts from roles, states, relations, lists, tables, and controls. | Common browser accessibility-tree navigation questions have direct static equivalents or explicit fallback reasons. |
| Browser parity research | 60% | Compare static output against a small sequential fixture set and record gaps. | Known useful browser-tree-only signals are either implemented, documented as impossible statically, or queued with priority. |

## Current Focus

1. Browser parity research: compare static semantic output with browser
   accessibility output on a small fixture set, one command at a time.
2. Gap triage: classify each missing signal as `implement`, `document as
   browser-only`, or `defer`.
3. Shortcut selection: only add top-level fields when they reduce agent
   routing work or reduce unnecessary browser handoff.
4. Safety verification: keep process cleanup checks visible in the workflow so
   the previous server freeze does not repeat.

## Planned Work

| Priority | Candidate | Expected value | Scope status |
| --- | --- | --- | --- |
| P0 | Keep process checks around all validation work. | Prevent leaked browser/test/comparison processes from blocking the server again. | Ongoing guardrail. |
| P1 | Improve deeper table/grid ownership and navigation context beyond first-row shortcuts. | Closes remaining gaps versus accessibility-tree table navigation. | Candidate after fixtures identify exact missing fields. |
| P2 | Refine browser-only fallback policy with more observed categories. | Makes handoff decisions more predictable and easier to audit. | Candidate; depends on observed failures. |
| P2 | Expand docs for comparison methodology without lengthening README. | Makes long-running research easier to inspect between sessions. | Use `docs/`, not root README. |

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
- Added `browserHtmlReason` so agents can explain why browser capture is needed
  without digging through nested answer-plan gaps.
- Added `browserHtmlReasonCode` so agents can branch on browser fallback causes
  such as no inspectable content, HTTP errors, fetch failures, retry actions,
  and browser interaction.
- Added non-browser fixture gates and readiness audits for repeatable checks.
- Added process-safety guidance: run tests and browser-backed checks
  sequentially, and verify process cleanup.

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
