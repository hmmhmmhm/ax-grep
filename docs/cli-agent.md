# CLI and Agent Mode

`ax-grep` fetches a URL, extracts a semantic page summary, and prints compact
text by default.

```sh
ax-grep https://example.com
ax-grep https://example.com --json
ax-grep https://example.com --json --summary
ax-grep https://example.com --links-only
ax-grep https://example.com --max-tree-lines 80
ax-grep https://example.com --mode interactive --exclude-boilerplate
ax-grep https://example.com --timeout 30000 --user-agent "my-agent/1.0"
```

## Search

```sh
ax-grep --search "agent browser accessibility tree"
ax-grep --search "ax-grep npm" --engine bing --links-only
ax-grep --search "ax-grep npm" --engine bing --lang en --region US
ax-grep --search "ax-grep npm" --open-result best --json
```

- `--search` tries DuckDuckGo, Bing, and StartPage by default.
- `--engine <name>` forces one search engine.
- `--open-result <n|best>` fetches a ranked result in the same command.
- `--lang` and `--region` make locale-specific searches reproducible.

## Agent Routing

Use `--agent` when another program needs the next step instead of raw tree text.
The response includes compact `agent`, `pageCheck`, `verification`, search, and
warning fields.

Read these first:

- `agent.status`: `ready`, `choose-result`, `verify`, `needs-browser`, or `error`.
- `agent.executor`: one-field executor step with decision, command/read/browser fields.
- `agent.executorActionName`, `agent.executorOperation`, and related `executor*`
  shortcuts: top-level mirror of the next executable step, loop decision, and
  target, terminal/continue flags.
- `agent.handoff`: the shortest executor handoff for the next step.
- `agent.handoffActionName`, `agent.handoffOperation`, and related `handoff*`
  shortcuts: top-level mirror of the brief handoff contract, loop decision, and
  target, terminal/continue flags.
- `agent.runbook*`: top-level loop reason, mode, confidence, answer status, and
  iteration shortcuts for `--agent-brief` routing without expanding `runbook`.
- `agent.next`: canonical loop payload with command, read target, or browser step.
- `agent.next*`: canonical next-step action, execution, command, read, and URL shortcuts.
- `agent.page*`: title, canonical URL, language, author, dates, and structured-data type shortcuts.
- `agent.expectedOutcome*` and `agent.executionPlan*`: top-level success
  condition and execution-plan shortcuts for fast routing without expanding
  nested objects.
- `agent.sourceSearch*`: opened-result query, locale, verification queries, engine,
  selected/alternate result, and command shortcuts.
- `agent.searchDecision*` and `agent.pageDecision*`: top-level routing decisions and command/read pointers.
- `agent.answerPlan`, `agent.citations`, and `agent.answerEvidence`: final answer evidence.
- `agent.answerPlanStatus`, `agent.answerPlanConfidence`, and related `answer*`
  shortcuts: top-level answer readiness, next action, command, and citation routing.
- `agent.topCitation*`: first citation item for fast source quality checks.
- `agent.topAnswerEvidence*`: first answer evidence item for fast citation/read routing.
- `agent.topVerificationFoundQuery` and `agent.topVerificationMissingQuery`: first
  matched or missing `--find` query for fast verification routing.
- `agent.readTargets`, `agent.topReadTarget*`, and `agent.bestReadTarget*`: ranked paths to inspect and the
  best path's count/primary flags.
- `agent.bestHiddenReadTarget*`: best hidden metadata path to inspect first.
- `agent.topHiddenSignal*`: first hidden metadata/API/config/provenance signal.
- `agent.semantic*`: compact semantic tree counts and direct paths to top
  heading/landmark/named role/interactive/focusable/link/button/image/table/list/form-field/description/value/relation/choice/state/unavailable entries.
  `semanticOutline` and `semanticTopOutline*` preserve heading/landmark page flow
  plus parent landmark context for fast structural routing. `semanticKeyboardShortcut*` exposes keyboard shortcut,
  access key, and tabindex hints. Field shortcuts include placeholder/autocomplete/inputmode
  and aria label/description references. `semanticTopInPageLink*` exposes skip
  links and same-page anchors. Relation shortcuts include resolved target role/selector when available.
  State shortcuts also expose parsed top-state fields such as `semanticTopStateCurrent`,
  `semanticTopStateControls`, `semanticTopStateHaspopup`, and `semanticTopStateInvalid`.
- `agent.barrierCount` and `agent.topBarrier*`: primary login, paywall,
  challenge, consent, age, or geo barrier details for browser routing.
- `agent.dataTableCount`, `agent.faqCount`, `agent.codeBlockCount`,
  `agent.resourceCount`, `agent.mediaCount`, `agent.sectionCount`,
  `agent.breadcrumbCount`, `agent.paginationCount`, `agent.tocCount`,
  `agent.embedCount`, `agent.transcriptCount`, `agent.authorLinkCount`,
  `agent.provenanceCount`, `agent.offerCount`, `agent.datasetCount`,
  `agent.identityCount`, `agent.timelineCount`, `agent.contactPointCount`, and
  matching `top*` fields: first structured page item shortcuts with direct paths/selectors when available.
- `agent.bestStructuredReadTarget*`: highest-priority structured content path to
  read before scanning all `readTargets`.
- `agent.resultChoices` and `agent.sourceChoices`: ranked links to open.
- `agent.topResultChoice*`: first search-result candidate with URL, rank,
  command args, source quality, freshness/relevance, match, and sitelink hints.
- `agent.topSourceChoice*`: first source-link candidate with URL, command args, source type, source hints, and source score.
- `agent.topFormChoice*` and `agent.topActionTargetChoice*`: first executable
  form/action target templates, query inputs, submit text, and first-field hints.
- `agent.topChoice*`: first executable result, source, form, or action-target choice.
- `agent.topAction*`: first action candidate with execution, priority, command/read, and URL shortcuts.
- `agent.primarySourceLinkRef`: primary source-link action's `pageCheck.sourceLinks[n]`.
- `agent.alternativeAction*`: first non-primary action candidate, including source,
  execution mode, command args, URL, and source-link reference when available.
- `agent.recommended*`: selected search result metadata and command args.
- `agent.signals` and `agent.qualityGates`: compact diagnostics.
- `agent.topSignal*` and `agent.topQualityGate*`: first quality signal and gate
  shortcuts for fast accept/block routing.
- `agent.problemSignal*` and `agent.failingQualityGate*`: first blocking or
  warning reason, severity, and score without scanning diagnostic arrays.
- `agent.topDiagnostic*`: first diagnostic code, severity, and message.

In `--agent-brief`, the stable executor surface is `agent.executor` plus
`agent.handoff`. Brief handoff keeps loop metadata, target URL, priority,
reason, and executable `resultChoices` or `sourceChoices` when alternates are
available. It also keeps the details needed to act without reopening the full
payload: search snippets, selected answer evidence text, form/action URL
templates, field selectors, methods, browser barrier targets, and source-link
`sourceLinkRef` pointers.

Agent actions use an `execution` discriminator:

- `run-command`: execute `commandArgs` with `execFile`-style argument passing.
- `read-current`: read the current payload path named by `readFrom`.
- `interact-browser`: use a live browser, then optionally rerun with captured HTML.

Generated commands preserve fetch and search context such as `--lang`,
`--region`, `--find`, `--timeout`, `--user-agent`, and `--agent`.
Text output also prints `executor*` lines for the same next-step fields.

## Find and Verification

Use repeatable `--find <text>` with any page or search result page to verify a
term or phrase.

```sh
ax-grep https://example.com --agent --find "documentation examples"
ax-grep --search "OpenAI API docs" --find "Responses API" --agent
```

JSON output adds `finds` and `verification`. `verification.status` is the
quickest page-check answer:

- `matched`: every requested phrase was found.
- `partial`: some phrases were found.
- `missing`: none were found.
- `not-requested`: no `--find` query was supplied.

When evidence is missing, `verification.recommendedAction` points to the next
useful move, such as opening a source link, opening an alternate original SERP
result, retrying with browser-captured HTML, or broadening the search.

## Browser-Captured HTML

The default URL path uses plain `fetch()`. It does not execute page JavaScript.
When a page is challenged, logged-in, or JavaScript-rendered, let a browser
controller capture the HTML and pass it back through the same CLI.

```sh
ax-grep https://example.com --html-file captured.html --agent
cat captured.html | ax-grep https://example.com --stdin --agent
```

If fetched HTML has no inspectable content, JSON mode returns a structured error
and warning. Use `--html-file` or `--stdin` for rendered fallback HTML.

## Page Summary Fields

`kind` classifies the page as `search-results`, `content-page`,
`interactive-page`, `blocked-page`, `empty`, or `page`.

`pageCheck` is the higher-level inspection summary agents should read before the
raw tree. It includes title, canonical URL, main heading, content evidence,
source-like external links, actions, confidence, readability, and follow-up
actions.

Useful `pageCheck` groups include:

- Content and verification: `contentEvidence`, `dataTables`, `sections`, `toc`, `codeBlocks`, `citations`, `faqs`, and `breadcrumbs`.
- Interaction and recovery: `barriers`, `forms`, `actionTargets`, `pagination`, `recommendedAction`, and `nextSteps`.
- Hidden app/page state: `hydration`, `apiEndpoints`, `clientState`, `runtime`, `config`, `appHints`, and `mobileHints`.
- Metadata and provenance: `topics`, `keyValues`, `metaFacts`, `provenance`, `httpPolicies`, `schemaFacts`, `offers`, `identities`, `datasets`, `timeline`, `contactPoints`, and `authorLinks`.
- Media and resources: `media`, `resources`, `embeds`, and `transcripts`.

These fields expose details often absent from an accessibility tree, including
JSON-LD facts, head metadata, API endpoints, app configuration, policy
directives, feed/license/resource links, and mobile app-link hints.
