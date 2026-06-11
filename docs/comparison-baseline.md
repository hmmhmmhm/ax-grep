# Comparison Baseline

Generated on 2026-06-05.

The comparison harness runs `ax-grep` through Puppeteer and compares named
role output against `agent-browser snapshot`.

Operational rule: run comparison suites sequentially. `agent-browser` and
Chromium can exhaust the host when several `compare:static*` runs overlap. Check
for existing browser processes before a run and confirm cleanup afterward.

The historical `named role overlap` score is intentionally strict: it is an
exact match over normalized `role:name` pairs, with no fuzzy or containment
matching. It is useful for tracking whether `ax-grep` is reproducing
`agent-browser snapshot` output, but it can understate agent usefulness when the
missing items are mostly static text.

The harness also reports `agentReadiness` scores. These are still based on the
same exact normalized `role:name` matches, but split by agent-facing use:

- `referenceRecall`: how much of the `agent-browser` named output appears in
  `ax-grep`.
- `candidatePrecision`: how much of the `ax-grep` named output appears in
  `agent-browser`.
- `actionableRecall`: exact recall for links, buttons, fields, tabs, and other
  operation targets.
- `navigationRecall`: exact recall for links, headings, landmarks, and search.
- `contentRecall`: exact recall for headings, images, table/list structure, and
  static text.
- `score`: weighted summary for agent parsing: actionable 40%, navigation 25%,
  content 20%, precision 15%.

The static harness also emits `cliAgentSummary`, which scores the actual
agent-facing `--agent` compact JSON envelope rather than raw tree overlap. It uses
top-level `agent` routing status, `pageCheck`, structured content evidence, source links and source quality,
readability, requested verification status, follow-up `nextSteps`, `searchResults`, and `suggestedActions` to estimate how directly an agent can
decide whether to read, open, or retry a page. `averageCliAgentScore`
in `gateSummary` tracks that higher-level usefulness separately from
`agentReadiness`, which remains an exact `agent-browser snapshot` overlap
metric.
`minCliAgentScore` enforces the same readiness floor per included target, so a
weak search, page-check, or browser-retry case cannot be hidden by strong
average results.
When a per-target floor fails, `weakAgentTargets` lists the affected category,
URL, scores, status, and primary action for quick follow-up.
`averageAgentExecutorScore` is the executor-focused aggregate. It combines the
schema, routing, `next`, expected-outcome, signal, read-target, command,
browser-retry, continuation, response, diagnostic, and verification fields that
subagents need to run a search/page-check loop without reconstructing intent
from the raw tree.
`minAgentExecutorScore` applies the executor floor per included target.
The score includes action-schema completeness, so `run-command` actions need
both a human-readable command and raw `commandArgs`, `read-current` actions need
`readFrom`, and `interact-browser` actions need an explicit browser-interaction
signal.
`averageActionSchemaScore` tracks that schema completeness directly across the
gate-included targets.
`averageSearchResultActionScore` tracks whether compact search results include
rank-specific `openResult`, `command`, and raw `commandArgs`, so search agents
can open alternate results without reconstructing commands.
`averageAgentRoutingIntentScore` tracks whether `agent.routingIntent` correctly
summarizes the primary action as reading current payload, opening a URL,
searching, retrying with browser HTML, requiring browser interaction, or
stopping.
`averageAgentContinuationModeScore` tracks whether `agent.continuationMode`
maps that intent to the executor-facing mode: `read`, `command`, `browser`,
`capture-html`, `inspect`, or `stop`.
`averageAgentNextScore` tracks whether `agent.next` is a canonical executor
payload that agrees with `continuationMode` and mirrors the primary action's
command, read pointer, URL, browser interaction, and terminal fields.
`averageAgentNextShortcutScore` tracks whether top-level `agent.next*`
shortcuts mirror that canonical `agent.next` payload.
`averageAgentRunbookShortcutScore` tracks whether top-level `agent.runbook*`
shortcuts mirror the nested loop runbook contract.
`averageAgentExpectedOutcomeScore` tracks whether `agent.expectedOutcome`
describes the success condition for the next step, including read pointers when
the next step is evidence reading.
`averageAgentPlanShortcutScore` tracks whether top-level
`agent.expectedOutcome*` and `agent.executionPlan*` shortcuts mirror the nested
next-step contract.
`averageAgentSignalScore` tracks whether `agent.signals` exposes structured
content, verification, search result, source link, browser, response, and
diagnostic signals needed for fast agent routing.
`averageContentEvidenceMetadataScore` tracks whether `pageCheck.contentEvidence`
items include `source` and bounded `score` metadata, so agents can prioritize
semantic evidence over fallback excerpts.
`averageReadabilityReasonScore` tracks whether compact page checks preserve
concise readability reasons, so agents can understand why a page is readable,
thin, blocked, or worth retrying.
`averageAgentReadabilityReasonScore` tracks whether the compact top-level
`agent` summary repeats concise readability reasons, so agents can route from
the first object before drilling into `pageCheck`.
`averageAgentPageMetadataShortcutScore` tracks whether `agent.page*` mirrors
root page metadata such as canonical URL, language, author, dates, and
structured-data types.
`averageAgentSemanticSummaryScore` tracks whether `agent.semanticSummary` and
top-level `agent.semantic*` shortcuts preserve semantic tree counts, role-group
counts, top role, heading, landmark, named role, interactive
description/value/state, link URL, and button description shortcuts for quick
page-shape routing.
`averageAgentBarrierShortcutScore` tracks whether top-level `agent.topBarrier*`
shortcuts mirror the highest-priority page barrier.
`averageAgentStructuredShortcutScore` tracks whether top-level structured
content counts and `top*` shortcuts mirror the first table, FAQ, code block,
resource, media item, section, navigation/media structure, and best structured
read-target shortcut.
`averageAgentReadTargetScore` tracks whether `agent.readTargets` points to
payload fields that actually exist and are worth reading, and whether
`read-current` actions mark the matching target as primary.
`averageAgentTopReadTargetShortcutScore` tracks whether `agent.topReadTarget*`
mirrors the first read-target entry for fast routing without scanning
`agent.readTargets`.
`averageAgentAlternativeActionShortcutScore` tracks whether top-level
`agent.alternativeAction*` shortcuts mirror the first non-primary action.
`averageAgentHandoffScore` and `averageAgentBriefExecutorStepScore` also cover
handoff detail preservation. Search handoffs must keep executable result/source
choices with snippets and command args; answer handoffs must keep selected
evidence text/reasons; read handoffs for forms and action targets must keep URL
templates, fields, selectors, methods, and encoding; diagnostic handoffs must
keep selected signals and quality gates. This prevents the compact handoff from
turning into an opaque "retry/open this" instruction.
`averageAgentResultChoiceScore`, `averageAgentSourceChoiceScore`, and
`averageAgentActionListScore` cover the same problem outside the handoff.
Search choices keep snippets, freshness dates, and sitelinks; source choices
keep source-link text, snippets, selectors, and executable commands; source-link
actions keep `sourceLinkRef` so agents can jump back to the exact
`pageCheck.sourceLinks[n]` item.
`averageAgentTopActionShortcutScore` tracks whether `agent.topAction*` mirrors
the first action candidate, including execution, priority, command/read target,
URL, and source-link reference.
`averageAgentResultCountScore` tracks whether `agent.resultCount` is zero for
non-search pages and at least the compact result count for search pages.
`averageAgentChoiceCountScore` tracks whether executable choice-count shortcuts
match their result, form, action-target, and source-link source counts.
`averageAgentTopChoiceShortcutScore` tracks whether `agent.topChoiceKind`,
path, label, URL, and command arguments mirror the first executable result,
source, form, or action-target choice for fast subagent routing.
`averageAgentTopResultChoiceShortcutScore` tracks whether `agent.topResultChoice*`
mirrors the first search result choice, including URL, rank, open-result value,
command arguments, and selection reason.
`averageAgentTopSourceChoiceShortcutScore` tracks whether source-link specific
top-level shortcuts mirror the first executable source choice.
`averageAgentEvidenceCountShortcutScore` tracks citation, answer-evidence,
read-target, and action count shortcuts against their agent arrays.
`averageAgentTopCitationShortcutScore` tracks whether `agent.topCitation*`
mirrors the first citation item, including path, kind, confidence, reason, URL,
and score.
`averageAgentSignalCountShortcutScore` tracks signal severity and failing
quality-gate count shortcuts against `agent.signals` and `agent.qualityGates`.
`averageAgentTopQualityShortcutScore` tracks whether `agent.topSignal*` and
`agent.topQualityGate*` mirror the first signal and quality gate for fast
accept/block routing without scanning diagnostic arrays.
`averageAgentProblemShortcutScore` tracks whether `agent.problemSignalKind`,
severity, message, and `agent.failingQualityGate*` mirror the first
warning/error signal and first failing quality gate, including gate severity and
score, so agents can explain blocked pages without scanning diagnostic arrays.
`averageAgentSourceLinkCountScore` tracks whether `agent.sourceLinkCount` is
zero for search pages and matches compact `pageCheck.sourceLinks` for ordinary
content pages.
`averageAgentFormActionCountScore` tracks whether top-level `agent.formCount`
and `agent.actionTargetCount` match compact `pageCheck.forms` and
`pageCheck.actionTargets`, so agents can detect hidden forms and JSON-LD/OpenSearch
actions before scanning nested page-check arrays.
`averageAgentFormActionChoiceScore` tracks whether `agent.formChoices` and
`agent.actionTargetChoices` preserve the compact form/action target IDs, paths,
selectors, URL templates, query inputs, and methods needed for subagent
selection loops.
`averageAgentTopFormActionChoiceShortcutScore` tracks whether top-level
form/action-target shortcuts mirror the first executable form and action target.
`averagePageLinkCommandScore` tracks whether compact `pageCheck.primaryLinks`
and `pageCheck.sourceLinks` include direct `command` and `commandArgs`, so
agents can open page links without reconstructing fetch flags.
`averageAgentBrowserNeedScore` tracks whether `agent.needsBrowserHtml` agrees
with the primary action: browser HTML retry actions should require browser
HTML, while URL search recovery, alternate-result recovery, read-current, and
retry-later actions should not.
`averageAgentPageKindScore` tracks whether `agent.pageKind` mirrors the root
payload `kind`, so agents can route from the top-level `agent` object without
re-reading `analysis.kind` or the envelope root.
`averageAgentAlternativeActionCountScore` tracks whether
`agent.alternativeActionCount` matches the deduplicated compact follow-up
actions left outside `agent.primaryAction`, so agents can know whether a page
has useful alternatives before scanning nested action arrays.
`averageAgentUsabilityScoreConsistency` tracks whether `agent.usabilityScore`
matches the documented compact quality heuristic derived from status,
readability, confidence, evidence, search results, source links, and
verification status.
`averageAgentEvidenceQualityScoreConsistency` and
`averageAgentSourceQualityScoreConsistency` track whether top-level evidence
and source quality scores match the compact evidence/source arrays, so agents
can compare payload quality before reading every candidate item.
`averageAgentBestReadTargetScore` tracks whether `agent.bestReadTarget` and its
count, score, primary flag, and reason match the primary or highest-scored
`agent.readTargets` entry, so agents can start reading the best compact field
without sorting candidates.
`averageAgentDiagnosticCountScore` tracks whether top-level diagnostic severity
counts and `agent.topDiagnostic*` match the compact diagnostics array, so agents
can distinguish warnings from hard errors before drilling into diagnostic
messages.
`averageAgentVerificationCountScore` tracks whether top-level verification
requested/found/missing counts match the compact verification object, so agents
can decide whether requested evidence is complete before reading details.
`averageAgentVerificationQueryScore` tracks whether
`agent.verificationFoundQueries` and `agent.verificationMissingQueries` preserve
the exact matched and missing `--find` query lists and whether the top matched
or missing query shortcuts mirror the first items; `agent.handoff` and
`agent.executor` carry the same lists for brief subagent loops.
`averageAgentResponseMetadataScore` tracks whether `agent.responseStatus`,
`agent.responseOk`, `agent.responseContentType`, and `agent.finalUrlChanged`
mirror the compact envelope response fields, so agents can judge fetch health
from the top-level `agent` object.
`averageAgentHiddenSignalScore` tracks whether hidden `pageCheck` groups such
as hydration, API endpoints, app config, app/mobile hints, provenance,
policies, JSON-LD facts, and resource metadata are present at valid payload
paths and discoverable through at least one read target when available. This is
the executor-focused counterweight to raw accessibility-tree overlap: these
signals are often useful to subagents but absent from browser accessibility
snapshots.
`averageAgentHiddenSignalCountScore` tracks whether top-level
`agent.hiddenSignalCount`, `agent.hiddenReadTargetCount`, and
`agent.bestHiddenReadTarget*` match those hidden groups and read-target
shortcuts.
`averageAgentTopHiddenSignalShortcutScore` tracks whether
`agent.topHiddenSignal*` mirrors the first hidden metadata, API, config, or
provenance signal.
`averageAgentBrowserAdvantageScore` tracks whether those hidden `pageCheck`
signals create a concrete agent-browser advantage when they exist, rather than
only matching visible accessibility-tree roles.
The higher-level CLI agent score also credits hidden `pageCheck` signal groups
and recoverable browser-HTML retry actions. A page with little visible text can
still be useful to a subagent when it exposes metadata read targets or a
runnable browser-capture handoff.
When `ax-grep` produces a ready, high-scoring agent payload with content
evidence, the static comparison treats the page as usable before applying raw
tree-size failure classes such as thin-reference challenge or over-collection.
This keeps agent-browser advantage cases visible in the gate even when the raw
static tree is larger than the browser snapshot.
`averageAgentCanContinueScore` tracks whether `agent.canContinue` agrees with
the primary action execution class, so recoverable errors with runnable actions
do not look terminal and usage/input errors without actions do not look
actionable.
`averageAgentPrimaryExecutionScore` tracks whether `agent.primaryExecution`
matches `agent.primaryAction.execution`, so agents can route from the shortcut
field without rereading the full action object.
`averageAgentPrimaryShortcutScore` tracks whether `agent.primaryActionName`,
reason, priority, command, URL, rank, read-from, source-link reference, and
browser shortcuts mirror `agent.primaryAction`, so agents can continue from
top-level routing fields.
`averageAgentExecutorShortcutScore` tracks whether `agent.executorActionName`,
decision, mode, operation, confidence, terminal/continue flags, command
arguments, read-from, URL, target, and expected-outcome shortcuts mirror
`agent.executor`, so subagents can route the next step without parsing the full
executor object.
`averageAgentHandoffShortcutScore` tracks whether `agent.handoffActionName`,
decision, mode, operation, answer status, confidence, terminal/continue flags,
priority, command arguments, read-from, URL, target, and expected-outcome shortcuts
mirror `agent.handoff`, so brief loops can run from top-level fields when they
do not need the full handoff object.
`averageAgentAnswerShortcutScore` tracks whether `agent.answerPlanStatus`,
confidence, reason, next action, gap count, citation IDs, first answer-evidence
metadata, command arguments, after-interaction command, read-from, and URL
shortcuts mirror `agent.answerPlan` and
`agent.answerEvidence`, so agents can decide whether to answer or continue
without parsing the full plan object.
`averageAgentSourceSearchProvenanceScore` tracks whether opened-result payloads
with `sourceSearch.selectedResult` or `sourceSearch.alternateResults` expose
matching `agent.readTargets`, so agents can inspect original SERP provenance
before trusting or recovering from an opened page.
`averageAgentSourceSearchShortcutScore` tracks whether top-level
`agent.sourceSearchQuery`, locale, verification-query count/top query,
engine/search URL, selected rank/title/URL, selected command, and first
alternate command mirror the source-search payload for quick SERP recovery
decisions.
The command shortcuts are exposed as `sourceSearchSelectedCommandArgs` and
`sourceSearchAlternateCommandArgs`.
`averageAgentRecommendedMetadataScore` tracks whether search pages with a
`recommendedResult` repeat its URL, title, rank, source, relevance,
official-source hint, selection reason, and command args on the top-level
`agent` object for quick routing.
`averageAgentSearchDecisionScore` and `averageAgentPageDecisionScore` also check
top-level `agent.searchDecision*` and `agent.pageDecision*` shortcuts, so agents
can route without reopening the nested decision objects.
Terminal actions such as `read-content` and `use-evidence` are treated as
usable without executable commands when `execution` is `read-current` and a
`readFrom` pointer is present, because the compact payload already contains the
evidence an agent should read. Browser-interaction actions are also valid
without commands when `execution` is `interact-browser`; in those cases another
static fetch would not advance the page state.

The `--agent` payload intentionally removes repeated routing data: top-level
diagnostics are represented as `agent.diagnosticCodes`, repeated primary actions
are omitted from `suggestedActions` and verification/page-check action slots,
page-level alternatives are suppressed when verification has selected
`use-evidence`,
search-page link/action follow-ups are omitted when `searchResults` already
carry the decision surface, and search output is capped to the first five
results plus any out-of-window recommended result. Opened-result payloads omit
engine attempts once `sourceSearch` records the selected result, but keep compact
selected/alternate SERP candidates with executable open commands for failure
recovery, preserving custom fetch options such as `--timeout` and
`--user-agent`. Page checks also
skip common global-navigation headings, links, and buttons, and omit extra
external primary links when source links are already present, so repository and
documentation pages route agents toward page content instead of site chrome.
Fetch failures that still have a target URL emit an executable browser-HTML
retry command, preserving `--find` checks for the next run. When browser HTML is
already supplied through `--html-file` or `--stdin`, the compact agent payload
does not ask for another browser retry. Parsed search result pages keep
`agent.canUseFetchedHtml` true even when their page-readability score is low,
because the result cards remain usable for open/refine routing.
Captured blocker pages still keep challenge/login/paywall diagnostics; the
follow-up action changes to browser-state inspection instead of another capture
loop. HTTP error actions are status-aware, so missing URLs and transient server
errors no longer all collapse into a browser-HTML retry; missing opened search
results and opened-result verification failures can route directly to an
alternate original SERP candidate when one matches the missing `--find` text.

The default baseline does not force a viewport. A shared viewport can be tested
with `AX_LITE_COMPARE_VIEWPORT=WIDTHxHEIGHT`, but the default run is kept stable
to avoid changing the benchmark shape unexpectedly.

For state-sensitive pages, `AX_LITE_COMPARE_SETUP=path/to/setup.js` evaluates a
setup script in both Puppeteer and `agent-browser` before extraction. This keeps
exact-match scoring intact while making page state explicit.

## Sample Results

| URL | ax-grep nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://example.com` | 4 | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `https://www.wikipedia.org` | 140 | 105 | 0.57 | 0.97 | 1.00 | 0.04 | 0.80 |
| `https://developer.mozilla.org/en-US/docs/Web/Accessibility` | 315 | 286 | 0.56 | 0.74 | 0.89 | 0.15 | 0.68 |
| `https://news.ycombinator.com` | 710 | 501 | 0.75 | 0.82 | 0.82 | 0.63 | 0.78 |
| `https://github.com/features` | 764 | 538 | 0.90 | 0.88 | 0.95 | 0.93 | 0.92 |
| `https://libraries.io/npm/typescript` | 382 | 609 | 0.49 | 0.95 | 0.95 | 0.17 | 0.80 |
| `https://www.npmjs.com/package/typescript` | 16 | 15 | 0.50 | 0.67 | 0.80 | 0.50 | 0.72 |

## Korean Sample Results

Run with `pnpm compare:korea`.

| URL | ax-grep nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://ko.wikipedia.org/wiki/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD` | 5713 | 7088 | 0.44 | 0.82 | 0.85 | 0.14 | 0.69 |
| `https://www.hani.co.kr/` | 998 | 992 | 0.42 | 0.50 | 0.48 | 0.23 | 0.48 |
| `https://www.korea.kr/` | 569 | 494 | 0.47 | 0.66 | 0.69 | 0.24 | 0.59 |
| `https://www.yonhapnewstv.co.kr/` | 566 | 448 | 0.79 | 0.79 | 0.83 | 0.79 | 0.81 |

## Static SSR HTML Results

Run with `pnpm compare:static URL...`.
Run with `pnpm compare:static:agent` for the smaller executor-focused regression
set that exercises readable pages, listings, forum-style links, and a search
diagnostic while tracking `averageAgentExecutorScore`.
In the current run, the gate summary includes 8 targets and excludes 4
diagnostics; `averageAgentExecutorScore` is 1.00 and
`averageAgentHiddenSignalScore` is 1.00 for the included executor targets.
`averageAgentBrowserAdvantageScore` is also tracked so the hidden-metadata
fixture proves more than raw accessibility-tree overlap.
The set includes a synthetic hidden-metadata gate whose browser snapshot only
contains a visible heading while `pageCheck` exposes 13 hidden head, script,
policy, app-link, provenance, and JSON-LD signals.

This path fetches HTML and runs `extract(html)` from the static entry without
Chrome, jsdom, WebView, layout, or script execution. `agent-browser` is used only
as the reference snapshot for comparison.

| URL | fetched bytes | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://example.com` | 528 | 5 | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `https://www.wikipedia.org` | 120361 | 193 | 105 | 0.57 | 0.97 | 1.00 | 0.04 | 0.77 |
| `https://news.ycombinator.com` | 34665 | 700 | 498 | 0.74 | 0.81 | 0.81 | 0.64 | 0.77 |
| `https://www.yonhapnewstv.co.kr/` | 47910 | 630 | 440 | 0.51 | 0.75 | 0.78 | 0.75 | 0.72 |

## Diverse Static Results

Run with `pnpm compare:static:diverse`.

| Category | URL | class | fetched bytes | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| News index | `https://www.bbc.com/news` | usable | 317290 | 672 | 427 | 0.48 | 0.52 | 0.65 | 0.55 | 0.55 |
| News article | `https://www.npr.org/2025/03/11/nx-s1-5324543/ntsb-dca-mid-air-collision-american-black-hawk` | usable | 106490 | 481 | 201 | 0.33 | 0.83 | 0.89 | 0.48 | 0.70 |
| News portal stress | `https://www.theguardian.com/international` | over-collected | 1429586 | 3829 | 1225 | 0.30 | 0.90 | 0.64 | 0.27 | 0.68 |
| Government service | `https://www.gov.uk/foreign-travel-advice` | usable | 111369 | 714 | 698 | 0.53 | 0.97 | 0.99 | 0.49 | 0.81 |
| Accessibility guide | `https://www.nottinghamshire.gov.uk/global-content/how-to-create-accessible-content/how-to-make-web-pages-accessible/checklist-web-page` | usable | 31747 | 239 | 250 | 0.49 | 0.70 | 0.76 | 0.33 | 0.61 |
| Ecommerce fixture | `https://books.toscrape.com/` | usable | 51294 | 482 | 528 | 0.61 | 0.88 | 0.91 | 0.77 | 0.82 |
| Reddit legacy | `https://old.reddit.com/r/programming/` | challenge | 136514 | 1255 | 1 | 0.00 | 0.00 | 0.00 | 1.00 | 0.20 |
| Reddit modern | `https://www.reddit.com/r/programming/` | challenge | 8438 | 53 | 1 | 0.00 | 0.00 | 0.00 | 1.00 | 0.35 |
| X social challenge | `https://x.com/NASA` | needs-browser | 277862 | 38 | 35 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Instagram social challenge | `https://www.instagram.com/nasa/` | shell | 882680 | 3 | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

## Token Cost Results

Run with `pnpm compare:tokens URL...`.

This serializes both browser-injected and static SSR extraction into compact
agent prompt text and estimates token cost with `cl100k_base`. It also measures
the recommended `--agent` compact JSON payload, so the benchmark can compare raw
tree prompts with the actual CLI payload agents should use. The prompt text
includes role, name, state/value, and selectors for interactive nodes.
Token gate averages skip browser references that are only a tiny shell while
static or agent output contains substantially more inspectable payload. Those
thin browser snapshots are counted separately as `excludedThinBrowserReference`
instead of distorting static/browser and agent/browser ratios.

| URL | browser nodes | browser tokens | static nodes | static tokens | static delta | static/browser ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://example.com` | 4 | 37 | 5 | 29 | -8 | 0.78 |
| `https://www.wikipedia.org` | 140 | 1339 | 193 | 1292 | -47 | 0.97 |
| `https://news.ycombinator.com` | 704 | 14503 | 700 | 6356 | -8147 | 0.44 |
| `https://www.yonhapnewstv.co.kr/` | 568 | 14397 | 630 | 10877 | -3520 | 0.76 |

## Diverse Token Cost Results

Run with `pnpm compare:tokens:diverse`.

| Category | URL | browser nodes | browser tokens | static nodes | static tokens | static/browser ratio |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| News index | `https://www.bbc.com/news` | 554 | 9617 | 672 | 6606 | 0.69 |
| News article | `https://www.npr.org/2025/03/11/nx-s1-5324543/ntsb-dca-mid-air-collision-american-black-hawk` | 504 | 9122 | 481 | 4152 | 0.46 |
| Government service | `https://www.gov.uk/foreign-travel-advice` | 722 | 19115 | 714 | 6477 | 0.34 |
| Ecommerce fixture | `https://books.toscrape.com/` | 455 | 7014 | 482 | 3599 | 0.51 |
| Reddit legacy challenge | `https://old.reddit.com/r/programming/` | 6 | 58 | 1264 | 9343 | 161.09 |
| X social challenge | `https://x.com/NASA` | 314 | 8041 | 38 | 237 | 0.03 |
| Instagram social challenge | `https://www.instagram.com/nasa/` | 35 | 640 | 351 | 1883 | 2.94 |

## Korean/Social Static Benchmark

Run with `pnpm compare:static:korea-social` and
`pnpm compare:tokens:korea-social`.

This target set covers Clien, Ruliweb, DCInside, Google/Bing/Startpage Search,
X/Twitter, and Instagram. The static comparison benchmark first tries plain HTML
fetch. If the response looks like a bot challenge, login shell, or empty
client-rendered shell, it falls back to `agent-browser` rendered HTML through
`document.documentElement.outerHTML` before running the static extractor.

Search and social targets stay in the benchmark as diagnostics, but are not
included in the gate summary because their logged-out public views are
anti-bot, hydration, and personalization sensitive. In this run, the gate
summary includes 4 targets and excludes 5 diagnostics; the average gate agent
score is 0.698 and the average static/browser token ratio is 0.395.

| Category | gate | HTML source | class | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score | static/browser token ratio |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Clien home | gate | fetch | usable | 469 | 657 | 0.522 | 0.799 | 0.806 | 0.053 | 0.675 | 0.286 |
| Clien post | gate | fetch | usable | 573 | 1167 | 0.234 | 0.553 | 0.542 | 0.008 | 0.483 | 0.303 |
| Ruliweb post | gate | fetch | usable | 396 | 297 | 0.620 | 0.974 | 0.978 | 0.821 | 0.892 | 0.610 |
| DCInside post | gate | fetch | usable | 1217 | 358 | 0.233 | 0.951 | 0.957 | 0.429 | 0.740 | 0.381 |
| Google search | diagnostic | fetch | reference-challenge | 1 | 5 | 0.000 | 0.000 | 0.000 | 0.000 | 0.150 | 0.110 |
| Bing search | diagnostic | fetch | volatile | 152 | 126 | 0.380 | 0.719 | 0.590 | 0.091 | 0.511 | 1.249 |
| Startpage search | diagnostic | fetch | reference-challenge | 85 | 61 | 0.861 | 0.963 | 0.957 | 0.625 | 0.878 | 0.341 |
| X social | diagnostic | fetch | usable | 156 | 36 | 0.169 | 1.000 | 0.900 | 0.500 | 0.750 | 0.193 |
| Instagram social | diagnostic | fetch | usable | 36 | 115 | 0.255 | 0.293 | 1.000 | 0.130 | 0.543 | 0.145 |

Notes:

- Ruliweb can require rendered HTML fallback in some runs, but this run fetched
  useful static HTML directly.
- Clien matching improved after benchmark normalization started stripping icon
  font private-use glyphs and leading menu bullets from comparable names.
- DCInside preserved action/navigation signals, moved from `over-collected` to
  `usable`, and lowered static/browser token ratio below 0.50 after compact
  static extraction started pruning unnamed leaf wrappers.
- Google Search returned a bot/interstitial shell in the browser reference path.
- Bing Search is volatile in this environment: fetch or rendered HTML can expose
  useful search UI or unrelated image-search affordances, but the exact
  reference comparison is not stable enough for a gate yet. Search diagnostics
  can be classified as `volatile` instead of `usable`.
- Startpage can return useful fetch HTML, but this run hit a suspended-connection
  captcha page in the browser-derived reference path. Embedded CSS-in-JS text is
  now excluded from static names, but the target remains a `reference-challenge`
  fixture.
- Instagram can alternate between login-only and fuller logged-out shells in
  this environment; keep it diagnostic even when a run scores as `usable`.

## China/Japan Static Benchmark

Run with `pnpm compare:static:china-japan` and
`pnpm compare:tokens:china-japan`.

This target set covers Chinese and Japanese encyclopedia, news, portal, forum,
developer, search, and video/social pages. Search, video/social, and pages whose
reference navigation fails in this environment stay in diagnostics. In this
run, the gate summary includes 7 targets and excludes 6 diagnostics; the
average gate agent score is 0.654 and the average static/browser token ratio is
0.544.

| Category | gate | HTML source | class | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score | static/browser token ratio |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| China Wikipedia | gate | fetch | usable | 4907 | 8518 | 0.421 | 0.866 | 0.871 | 0.050 | 0.687 | 0.277 |
| People China portal | diagnostic | fetch | reference-missing | 912 |  | 0.000 | 1.000 | 1.000 | 1.000 | 0.850 | 0.482 |
| Xinhua portal | gate | fetch | usable | 1041 | 1076 | 0.706 | 0.973 | 0.973 | 0.167 | 0.772 | 0.453 |
| Douban home | gate | fetch | usable | 700 | 952 | 0.757 | 0.930 | 0.893 | 0.095 | 0.738 | 0.307 |
| Baidu search | diagnostic | fetch | needs-browser | 250 | 7 | 0.000 | 0.000 | 0.000 | 1.000 | 0.200 | 0.677 |
| Bilibili home | diagnostic | fetch | usable | 231 | 217 | 0.523 | 0.754 | 0.770 | 0.436 | 0.660 | 0.371 |
| Japan Wikipedia | gate | fetch | usable | 5349 | 11774 | 0.311 | 0.599 | 0.618 | 0.072 | 0.491 | 0.649 |
| NHK News | diagnostic | fetch | reference-missing | 490 |  | 0.000 | 1.000 | 1.000 | 1.000 | 0.850 | n/a |
| Qiita TypeScript tag | gate | fetch | usable | 674 | 893 | 0.645 | 0.719 | 0.741 | 0.508 | 0.693 | 0.308 |
| Hatena IT hotentry | gate | fetch | usable | 1675 | 1775 | 0.566 | 0.922 | 0.937 | 0.258 | 0.739 | 0.782 |
| 5ch board | gate | fetch | usable | 780 | 360 | 0.105 | 0.574 | 0.600 | 0.316 | 0.459 | 1.031 |
| Yahoo Japan search | diagnostic | fetch | needs-browser | 54 | 158 | 0.187 | 0.327 | 0.293 | 0.000 | 0.279 | 0.177 |
| Niconico home | diagnostic | fetch | needs-browser | 212 | 373 | 0.123 | 0.186 | 0.196 | 0.018 | 0.159 | 0.228 |

Notes:

- China Wikipedia became usable after the benchmark stopped treating Wikipedia
  table-of-contents section numbers as part of comparable link names and static
  extraction started auto-detecting wiki-like HTML to preserve more article
  links by default.
- Xinhua and Douban are the strongest Chinese gate targets in this run.
- People China fetches usable HTML, but `agent-browser` navigation is blocked in
  this environment, so the target is diagnostic until a stable reference path is
  available.
- Baidu search is unstable across runs. It can collapse to a tiny feedback shell
  or expose a larger fetched search page; keep it diagnostic.
- Japan Wikipedia is usable but still has low exact content recall on the large
  article body.
- NHK fetches static HTML, but Puppeteer and `agent-browser` both hit HTTP/2
  navigation failures in this environment. Token ratio is reported as `n/a`
  when the browser reference is unavailable.
- Qiita and Hatena are useful Japanese gate targets; Hatena remains a token-cost
  stress case.
- 5ch became usable after reference comparison hardening, forum thread metadata
  normalization, auto-detected forum link-farm limits, and pruning redundant
  listitem wrappers around links/buttons. It remains a token-cost stress case at
  roughly parity with browser injection.

## Observations

- Simple static pages line up well. `example.com` matched the important named roles exactly.
- Wikipedia exposes a large language `<select>`. `ax-grep` can still unroll options for agent operation, but the comparison harness now disables option unrolling to match `agent-browser snapshot` more closely.
- Wikipedia language links use both visible article-count text and descriptive `title` attributes. `ax-grep` now follows accessible-name priority more closely by using link contents before title fallback.
- MDN uses many custom elements. `ax-grep` now prunes simple custom-element wrappers, but host elements that expose state, ids, or shadow content still need deeper handling.
- MDN ad-like placements can be excluded in comparison mode with `excludeLikelyAds`. The general extractor keeps this off by default so callers do not silently lose content.
- A shared comparison viewport is available through `AX_LITE_COMPARE_VIEWPORT=WIDTHxHEIGHT`, but it is opt-in because responsive pages can change the benchmark shape significantly.
- Hacker News relies on layout tables. The comparison harness normalizes Chrome's `LayoutTableCell` role to `cell` and removes punctuation-adjacent whitespace, improving overlap from 0.64 to 0.75.
- The comparison harness normalizes common role vocabulary differences such as `image` vs `img`, `paragraph` vs `p`, and `StaticText` vs `text`.
- `libraries.io/npm/typescript` is the stable package-registry-like sample.
- The new agent-facing metrics show a different picture than raw overlap on
  Wikipedia and Libraries.io: static-text recall is low, but actionable and
  navigation targets are mostly preserved. That distinction better matches the
  goal of making pages tractable for agents.
- Korean samples cover a large encyclopedia article, two news-like pages, and a
  public portal. The Korean Wikipedia page is intentionally heavy and is kept in
  `compare:korea` rather than the default sample script.
- `hani.co.kr` timed out waiting for Puppeteer network idle during the baseline
  run and used the DOMContentLoaded state. Keep it as a news-site stress case,
  but do not treat it as a tightly stable target yet.
- Korean live pages can shift by a few nodes or snapshot lines between runs as
  headlines, ads, and embedded widgets update.
- `yonhapnewstv.co.kr` currently lines up best among the Korean samples across
  exact overlap, content recall, and agent score.
- Static SSR extraction is viable for simple and server-rendered pages. It works
  especially well on Hacker News and reasonably on Yonhap News TV without any
  browser runtime.
- Static SSR extraction can prune some non-exposed menu content from HTML
  alone. The most important signal so far is a collapsed control with
  `aria-expanded="false"` and `aria-controls`; pruning the controlled subtree
  reduced Wikipedia static tokens from 11,183 to 1,292 and improved exact
  overlap from 0.05 to 0.57.
- Static SSR extraction now skips non-semantic payload tags, summarizes large
  child lists, and collapses repeated template-like subtrees. This keeps raw SSR
  payloads from turning into unbounded prompt input, while preserving an
  explicit `note` that nodes were omitted.
- Compact static extraction prunes unnamed leaf wrappers such as decorative
  spans, emphasis tags, empty inputs, and line breaks. Ancestor accessible names
  are computed before pruning, so useful link/button names are preserved while
  prompt-only wrapper noise is removed.
- Static SSR extraction cannot account for computed CSS, responsive layout,
  client-only rendering, open shadow roots, iframe documents, or post-load DOM
  mutation. Treat it as a lightweight agent parsing fallback, not an AXTree
  replacement.
- Static SSR extraction is not automatically cheaper in prompt tokens, but it
  can be competitive when collapsed controlled regions are pruned. It is now
  slightly cheaper than browser injection on Wikipedia and still cheaper on
  Hacker News and Yonhap News TV.
- Token cost needs its own benchmark gate. Agent-readiness can be acceptable
  while prompt cost is unacceptable, especially on SSR pages with large hidden
  menus, language selectors, or template payloads.
- Diverse targets show why benchmark categories matter. Government, ecommerce,
  and article pages preserve useful action/navigation signals; large news
  portals are good stress tests; Reddit/X/Instagram are better treated as
  social/challenge fixtures because public logged-out views often collapse to
  shell, login, or bot-protection states.
- Diverse token results show static extraction is often cheaper on server
  rendered news, government, and ecommerce pages. Social sites are inconsistent:
  X's fetched shell is tiny compared with the browser view, old Reddit is the
  opposite in this environment, and Instagram exposes enough SSR payload to make
  static more expensive than the rendered shell.
- Shell/challenge classification is required because exact overlap and agent
  score can look deceptively good when both static and reference snapshots are
  nearly empty.
- AP News and Ars Technica were tested as additional candidates but omitted from
  `compare:static:diverse` because the reference snapshot timed out in this
  environment. Reuters returned HTTP 401 from plain fetch and is also omitted
  from the automated diverse set.
- `npmjs.com` currently serves a Cloudflare challenge in the sample environment. The baseline is useful as a challenge-page fixture, not as a package-page content fixture.

## Next Improvements

- Improve custom-element/shadow-host pruning without losing useful selector targets.
- Add explicit benchmark gates for actionable and navigation recall once a
  stable target set is chosen.
- Compare browser and static extraction side-by-side on the same target set to
  decide when the Worker-compatible path is good enough.
- Tune static pruning controls for hidden menus, select/options, and repeated
  template regions against the diverse benchmark set.
- Support authenticated/cached sessions for `npmjs.com` if the real npm package page remains useful as a target.
- Add more real WebView smoke tests once Android/iOS host projects exist.
