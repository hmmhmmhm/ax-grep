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
| Search result handoff | 85% | Result choices, top choice snippet/host shortcuts, source-search selected/alternate/failure shortcuts, source hints, verification, decision counts, and command args are exposed. |
| Page check handoff | 88% | Forms, action targets, table navigation shortcuts, hidden signal group counts/top shortcuts/selectors, static-readiness reason codes/reasons, barrier-specific browser-capture reason codes, execution shortcuts, barriers, and read targets are exposed. |
| Semantic accessibility signals | 81% | Landmarks, headings, links, interactive/focusable controls, buttons, fields, values, relations, choices, states, list item refs, table header/cell navigation shortcuts, and table ownership refs are exposed. |
| Browser-tree parity research | 60% | Static gates exist; browser-backed checks must stay sequential and limited. |

Overall estimate: 85%. This is intentionally conservative because the final
goal is comparative usefulness, not just passing the current tests.

Forecast from the current evidence:

- 85% means the tool is already useful for common static search/page handoff
  loops.
- 88-90% is expected after the current non-browser shortcut and fallback-policy
  candidates are either implemented or explicitly deferred.
- 90%+ requires a small, sequential browser accessibility-tree comparison set
  with each observed gap classified as `implement`, `browser-only`, or `defer`.
- The estimate may drop if comparison finds a high-value browser-tree signal
  that static output does not yet expose.

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
| Search handoff | 85% | Expose enough ranked-result context for an agent to choose, open, skip, or recover from failed opened results. | Identify whether deeper snippet dedupe or provenance is needed beyond top choice shortcuts. | A static search fixture lets an agent choose or recover from a result without browser inspection first. |
| Page handoff | 88% | Surface barriers, read targets, action targets, table navigation shortcuts, hidden signal group shortcuts, static-readiness reason codes/reasons, and barrier-specific browser-capture reason/execution shortcuts. | Tighten remaining client-rendered and interaction-required categories when fixture evidence shows ambiguity. | Fixtures show clear `use static output` vs `need browser capture` reasons. |
| Semantic accessibility | 81% | Continue adding high-value shortcuts from roles, states, relations, lists, tables, ownership, and controls. | Compare table/grid/list/control output against browser-tree expectations and add only useful static equivalents. | Each accepted signal has a public type, CLI output, compact output, and fixture/test coverage. |
| Browser parity research | 60% | Compare static output against a small sequential fixture set and record gaps. | Expand the gap list as research finds new browser accessibility-tree signals; lower estimates if new important gaps appear. | Each gap is tagged `implement`, `browser-only`, or `defer` with priority and evidence. |

## Remaining Work Breakdown

The percentages below are not time estimates. They are confidence estimates for
how much of each work packet is already covered by code, tests, and documented
evidence.

| Packet | Current coverage | Remaining decision | Expected next result | Scope can expand when |
| --- | ---: | --- | --- | --- |
| P1: README/docs containment | 90% | Keep root README short while this progress file carries detailed state. | Stable README tests and a readable progress ledger. | A new workflow needs durable instructions. |
| P2: Search result routing | 85% | Watch whether snippet provenance needs anything beyond top result/source snippet shortcuts. | Keep current top choice shortcuts unless fixtures show agents need deeper dedupe/provenance. | Search fixtures show agents still need to inspect nested choices before opening or recovering. |
| P3: Failed source-search recovery | 88% | Watch for missing failure categories after selected-result HTTP/fetch failures. | Keep current shortcuts unless a new failure class appears. | A fixture shows an unclear `sourceSearchFailureCode`/reason. |
| P4: Static readiness and browser fallback | 78% | Watch whether client-rendered and interaction-required cases need more detail beyond static-readiness reason codes and browser HTML reason codes. | Keep current codes unless fixtures show ambiguous guidance. | A page needs browser capture but current reason text/code does not explain why. |
| P5: Semantic table/grid parity | 72% | Decide whether virtualized row counts or owned row/cell sampling are worth exposing beyond current header/ownership refs. | One new shortcut or a documented `defer` decision. | Browser-tree comparison exposes useful table structure not represented in static output. |
| P6: General accessibility parity | 60% | Run only small sequential comparisons and record every new signal before implementation. | A gap row with priority, decision, validation command, and estimate impact. | Any browser accessibility-tree signal repeatedly helps agent routing. |
| P7: Process safety | 85% | Keep every validation step single-process and record browser-backed exceptions before running them. | Clean process check before final handoff. | A new test path would spawn browsers, servers, or long-running comparison jobs. |

## Active Work Detail

These are the items currently being worked or prepared. Use this table to
estimate whether the overall percentage should move.

| ID | Item | Progress | Current output | Still needed | Completion signal | Estimate impact |
| --- | --- | ---: | --- | --- | --- | ---: |
| A1 | Answer/evidence citation shortcuts | 100% | Top-level citation count and first citation id were implemented, validated, committed, and pushed. | Watch for regressions only. | Typecheck, focused CLI tests, static comparison gate, readiness audit, and process check passed. | Landed. |
| A2 | Static-vs-browser gap ledger | 55% | Research scope ledger exists and observed gap rows now track evidence, decision, status, validation, and estimate impact. | Add new rows whenever comparison finds a browser-tree or handoff signal not represented in static output. | Each new gap has source, priority, decision, status, and next command. | +2-4% to browser parity research. |
| A3 | Table/grid ownership research | 72% | Header refs include path, role, row/column index, sort state, and selector; cell refs keep row/column/header context; table/grid `aria-owns` targets are exposed as ownership refs. | Decide whether virtualized row counts or owned row/cell sampling should become separate shortcuts after fixture evidence. | Either implement missing static shortcuts or mark as `browser-only`/`defer` with evidence. | +1-2% more to semantic accessibility. |
| A4 | Browser fallback policy | 78% | Browser HTML reason/action/operation/args/capture shortcuts, static-readiness status/reasonCode/reason/readFrom shortcuts, and barrier-specific reason codes for challenge/login/paywall exist. | Add more observed client-rendered and interaction-required categories only if fixture evidence shows ambiguity. | Fixtures show clear `use static` or `need browser capture` reasons without manual interpretation. | +1-2% more to page handoff. |
| A5 | Process-safety guardrails | 85% | `AGENTS.md`, progress rules, and `pnpm check:processes` are in place. | Keep every validation run sequential and document any browser-backed exception before running it. | No leftover browser/test/comparison processes before final handoff. | Prevents regression rather than raising feature %. |
| A6 | Top choice snippet shortcuts | 100% | Top-level result/source snippet shortcuts were implemented for the first ranked choice, with public type and CLI coverage. | Watch for deeper snippet provenance needs only. | Focused CLI/public type tests, static gates, README test, diff check, and process check pass. | +1% search handoff. |
| A7 | Top interactive control state shortcuts | 100% | Top-level interactive `pressed`, `expanded`, `haspopup`, and `controls` shortcuts were implemented so agents can branch on the first interactive target without parsing state strings. | Watch for additional control states only after fixture evidence. | Focused CLI/public type tests, static gates, README test, diff check, and process check pass. | +1% semantic accessibility. |
| A8 | Top focusable control state shortcuts | 100% | Top-level focusable `disabled`, `pressed`, `expanded`, `haspopup`, and `controls` shortcuts were implemented so keyboard/accessibility navigation can branch without parsing state strings. | Watch for additional focusable states only after fixture evidence. | Focused CLI/public type tests, static gates, README test, diff check, and process check pass. | +1% semantic accessibility. |

## Planned Work Detail

| Order | Work | Why it matters | Entry condition | Done when | Risk |
| ---: | --- | --- | --- | --- | --- |
| 1 | Keep README short while this file carries progress detail. | Prevents another unreadable README buildup. | Any new long explanation is needed. | README tests pass and the detail lives under `docs/`. | Low. |
| 2 | Watch deeper snippet provenance for search choices. | Agents can now read the selected result/source snippet without parsing nested arrays, but dedupe/provenance may still matter later. | A fixture shows top snippet shortcuts are not enough to choose or recover. | Add a focused provenance shortcut, or mark the gap as already covered. | Low; public type expansion only if justified. |
| 3 | Tighten fallback policy categories. | Agents need to know when static inspection is enough and when browser capture is justified. | A fixture or real page produces unclear fallback guidance. | Reason codes and docs explain the decision without reading nested plans. | Medium; fetch/browser behavior can vary. |
| 4 | Re-check table/grid semantics against observed gaps. | Tables are a major place where accessibility-tree context can beat plain HTML. | Gap record says current static output is insufficient. | New shortcut is added with public type/CLI/compact/test coverage, or the gap is documented as not worth implementing. | Medium; avoid adding noisy fields. |
| 5 | Expand the browser parity gap ledger with only sequential evidence. | Progress becomes auditable instead of a broad percentage. | One small sequential fixture comparison is selected and process safety is clean. | At least one real fixture result is recorded as `implement`, `browser-only`, or `defer`. | Medium-high; browser-backed checks must remain limited. |

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
| Table/grid ownership and cell navigation context beyond first-row shortcuts. | Static/browser fixture comparison. | P1 | Added header refs with path, role, row/column index, sort state, selector, and table/grid ownership refs for `aria-owns`; keep investigating virtualized row sampling only if fixtures show it matters. | In progress. |
| Browser-only fallback reasons for client-rendered or blocked pages. | Failed or low-content page checks. | P1 | Added `staticReadiness`, `staticReadinessReasonCode`, `staticReadinessReason`, `staticReadinessReadFrom`, and barrier-specific `browserHtmlReasonCode` values for challenge, login, and paywall cases. | In progress. |
| Search-result provenance and failed-open reasons. | Search handoff review. | P2 | Added result/source choice host shortcuts and selected-result failure shortcuts so agents can compare provenance and understand failed opens without parsing URLs plus error payloads. | In progress. |
| Additional browser accessibility-tree signals discovered during sequential comparison. | Future research. | P1/P2 after triage. | Add to this ledger, then classify as `implement`, `browser-only`, or `defer`. | Watch. |

## Observed Gap Records

Use this table to keep research scope honest. A row can raise or lower the
percentage depending on whether it is implemented, documented as browser-only,
or deferred.

| ID | Observed gap | Evidence | Priority | Decision | Status | Validation / next command | Estimate impact |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| G1 | `--open-result` failure recovery exposed selected/alternate result metadata, but not selected/alternate hosts as top-level shortcuts. Agents had to parse URLs or nested `sourceSearch` objects before choosing a replacement result. | `tests/cli.test.ts` missing-result fixture and source-search shortcut review. | P2 | Implement top-level `sourceSearchSelectedHost` and `sourceSearchAlternateHost`; keep failed-open reason categories as a later candidate. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check passed. | +1% search handoff. |
| G3 | Table/grid `aria-owns` was visible only as a generic relation, not inside the table summary. Agents inspecting table/grid output had to parse relation items to detect browser-tree ownership or virtualized rowgroups. | Compact semantic fixture with `table[aria-owns]` and owned `rowgroup`. | P1 | Implement `ownedRefs`, `semanticTopTableOwnedCount`, `semanticTopTableOwnedRefs`, and first-owned shortcuts. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check passed. | +1% semantic accessibility. |
| G4 | Blocked pages with challenge, login, or paywall diagnostics collapsed into generic `retry-action`/blocked fallback codes. Agents could not branch between simple rendered HTML capture and barrier-specific browser handling without reading diagnostics. | Challenge and login/paywall fixtures in `tests/cli.test.ts`. | P1 | Extend `browserHtmlReasonCode` with `challenge`, `login-required`, and `paywall` and prioritize diagnostics before generic retry codes. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check passed. | +1% page handoff. |
| G5 | Failed opened search results required joining `error` with `sourceSearch.selectedResult` to know which selected result failed and why. This slowed recovery decisions and made failure provenance less direct. | `tests/cli.test.ts` selected-result HTTP error fixture. | P2 | Add `sourceSearchFailureCode`, `sourceSearchFailureStatus`, `sourceSearchFailureUrl`, and `sourceSearchFailureReason` shortcuts on source-search error payloads. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check passed. | +1% search handoff. |
| G6 | Top ranked result/source snippets were present only inside `resultChoices`/`sourceChoices`. Agents reading the shallow summary could see URL, host, command, and reason, but still had to parse nested arrays to inspect the first choice's snippet before opening or recovering. | Search result text fixture and public `AgentSummary` shortcut review. | P2 | Add `topResultChoiceSnippet` and `topSourceChoiceSnippet` with JSON, text, compact, public type, and focused test coverage. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check pass. | +1% search handoff. |
| G7 | Static readiness exposed status and a prose reason, but not a machine-readable reason code. Agents had to parse text to distinguish hidden app data, source-link recovery, thin content, and browser-required fallback. | Hidden hydration fixture, thin source-link fixture, blocked/no-inspectable/browser retry fixtures, and public `AgentSummary` shortcut review. | P1 | Add `staticReadinessReasonCode` with values for hidden data, source-link/form/action-target structured payloads, readable content, limited static payload, thin content, browser-required, interaction-required, and extraction errors. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check pass. | +1% page handoff. |
| G8 | Top interactive controls exposed their parsed state only through `semanticTopInteractiveState`. Agents had to parse a state string to know whether the first interactive target was pressed, expanded, opened a popup, or controlled another element, while button-specific shortcuts already exposed those fields. | Existing semantic button/control fixtures and public `AgentSummary` shortcut review. | P1 | Add `semanticTopInteractivePressed`, `semanticTopInteractiveExpanded`, `semanticTopInteractiveHaspopup`, and `semanticTopInteractiveControls` with JSON, text, compact, public type, and focused test coverage. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check pass. | +1% semantic accessibility. |
| G9 | Top focusable controls exposed parsed state only through `semanticTopFocusableState`. Agents navigating by keyboard/focus order had to parse a state string to know disabled, pressed, expanded, popup, or controlled-target state. | Existing semantic focusable/control fixtures and public `AgentSummary` shortcut review. | P1 | Add `semanticTopFocusableDisabled`, `semanticTopFocusablePressed`, `semanticTopFocusableExpanded`, `semanticTopFocusableHaspopup`, and `semanticTopFocusableControls` with JSON, text, compact, public type, and focused test coverage. | Landed. | Typecheck, focused CLI/public type tests, readiness audit, static fixture gate, README test, diff check, and process check pass. | +1% semantic accessibility. |
| G2 | Browser accessibility-tree comparison may reveal signals that static HTML cannot safely infer. | Future sequential fixture comparison only; no broad browser run allowed. | P1 after evidence | Track first, then classify as `implement`, `browser-only`, or `defer`. | Watch. | Add the smallest fixture command here before running any browser-backed check; run `pnpm check:processes` afterward. | Unknown until observed. |

## Current Queue

Use this queue when resuming the work. Do not start a browser-backed check while
any earlier non-browser item can still reduce uncertainty.

| Step | Status | What will change | Validation | Percent effect |
| ---: | --- | --- | --- | ---: |
| 1 | Done | Keep progress tracking detailed enough to show current work, planned work, completion signals, and scope-expansion rules. | `pnpm exec vitest run tests/readme.test.ts`, `git diff --check`, `pnpm check:processes`. | Keeps docs hygiene at 90%. |
| 2 | Done | Expose top result/source snippets as shallow shortcuts so agents can inspect the first choice without nested parsing. | Focused CLI/public type tests, typecheck, static gates, README test, diff check, process check. | +1% search handoff. |
| 3 | Done | Add machine-readable static-readiness reason codes for hidden data, low-content source-link recovery, thin content, and browser-required fallback. | Focused CLI/public type tests, typecheck, static gates, README test, diff check, process check. | +1% page handoff. |
| 4 | Later | Compare one semantic table/list/control fixture against browser-tree output, sequentially only. | Pre/post `pnpm check:processes`; smallest comparison command recorded before use. | 1-3% semantic/browser parity. |
| 5 | Later | Recalculate the overall estimate after each landed shortcut or documented defer/browser-only decision. | Update this file in the same commit as the evidence. | Can raise or lower estimate. |

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
- Added semantic table ownership refs and first-owned shortcuts so agents can
  detect `aria-owns` rowgroups or virtualized table ownership from the table
  summary without parsing generic relations.
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
  such as no inspectable content, HTTP errors, fetch failures, challenge,
  login, paywall, retry actions, and browser interaction.
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
- Added source-search failure shortcuts so agents can see the selected result's
  failed URL, error code, status, and reason without joining separate error and
  source-search objects.

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
