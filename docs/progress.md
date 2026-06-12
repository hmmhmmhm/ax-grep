# Current Progress

Status: about 76% fit for the goal of making `ax-grep --agent` a useful
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
| Page check handoff | 78% | Forms, action targets, hidden signals, barriers, and read targets are exposed. |
| Semantic accessibility signals | 72% | Landmarks, headings, links, buttons, fields, values, relations, choices, and state shortcuts are exposed. |
| Browser-tree parity research | 60% | Static gates exist; browser-backed checks must stay sequential and limited. |

Overall estimate: 76%. This is intentionally conservative because the final
goal is comparative usefulness, not just passing the current tests.

## Done

- Kept the root README short and moved detailed docs under `docs/`.
- Added agent handoff fields for search results, forms, source links, barriers,
  hidden signals, semantic links, buttons, fields, choices, and state.
- Added action target state: disabled, pressed, expanded, popup, and controls.
- Added non-browser fixture gates and readiness audits for repeatable checks.
- Added process-safety guidance: run tests and browser-backed checks
  sequentially, and verify process cleanup.

## In Progress

- Add field-level relation shortcuts for `aria-details` and
  `aria-errormessage`, including resolved text, so agents can identify form
  help and error messages without opening a browser tree.

## Next Candidates

- Compare static semantic output against browser accessibility output for a
  small, sequential fixture set.
- Add missing top-level shortcuts only when they improve agent routing or
  reduce the need for browser handoff.
- Improve table/list/grid summaries where browser trees expose useful row,
  column, and ownership context.
- Track cases where static HTML should stop and recommend browser capture
  instead of guessing.

## Safety Rule

Use one validation command at a time. Before and after risky work, run:

```sh
pnpm check:processes
```
