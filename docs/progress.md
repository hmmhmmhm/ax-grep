# Current Progress

Status: about 80% fit for the goal of making `ax-grep --agent` a useful
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
| Page check handoff | 80% | Forms, action targets, hidden signals with selectors, browser-capture reasons, barriers, and read targets are exposed. |
| Semantic accessibility signals | 75% | Landmarks, headings, links, buttons, fields, values, relations, choices, states, list item refs, and table cell header refs are exposed. |
| Browser-tree parity research | 60% | Static gates exist; browser-backed checks must stay sequential and limited. |

Overall estimate: 80%. This is intentionally conservative because the final
goal is comparative usefulness, not just passing the current tests.

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
- Added top hidden signal selectors so agents can jump from hydration/API/client
  hints back to the exact script or link source before deciding on browser
  capture.
- Added `browserHtmlReason` so agents can explain why browser capture is needed
  without digging through nested answer-plan gaps.
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
