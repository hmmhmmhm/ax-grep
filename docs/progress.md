# Current Progress

Status: about 75% fit for the goal of making `ax-grep --agent` useful as a
lightweight first pass before `agent-browser`.

## Done

- Kept the root README short and moved detailed docs under `docs/`.
- Added agent handoff fields for results, forms, sources, barriers, hidden
  signals, semantic links, buttons, fields, choices, and state.
- Added non-browser fixture gates and readiness audits for repeatable checks.
- Added process-safety guidance: run tests and browser-backed checks
  sequentially, and verify process cleanup.

## In Progress

- Improve `pageCheck.actionTargets` and agent handoff choices so action targets
  expose execution state such as disabled, pressed, expanded, popup, and
  controls.

## Next

- Continue closing gaps between static semantic output and browser accessibility
  tree output.
- Keep adding narrow tests and readiness evidence for each handoff signal.
- Run browser-backed comparisons only when needed, one command at a time.

## Safety Rule

Use one validation command at a time. Before and after risky work, run:

```sh
pnpm check:processes
```
