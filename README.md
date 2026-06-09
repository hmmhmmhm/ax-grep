# ax-grep

[![npm version](https://img.shields.io/npm/v/ax-grep.svg)](https://www.npmjs.com/package/ax-grep)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![line coverage: 100%](https://img.shields.io/badge/line%20coverage-100%25-brightgreen.svg)](#coverage)

`ax-grep` turns HTML or a live DOM into a compact semantic tree that is easier
for agents and automation code to inspect than raw markup.

It is built for browser extensions, injected scripts, WebView bridges, Workers,
and agent pipelines that need page structure without Chrome DevTools Protocol or
a platform accessibility API.

```ts
import { extract, formatSemanticTreeText } from "ax-grep";

const html = await fetch("https://example.com").then((response) => response.text());
const tree = extract(html);

console.log(formatSemanticTreeText(tree));
```

```text
document
  main
    heading 'Example Domain'
    p 'This domain is for use in illustrative examples...'
    [i] link 'More information...'
```

`ax-grep` is not a replacement for a real browser accessibility tree. It
approximates one from DOM, ARIA, computed style, labels, focusability, and
element state.

## Install

```sh
pnpm add ax-grep
```

```sh
npm install ax-grep
```

## CLI

`ax-grep` can also run as a small agent-oriented command. It fetches a URL,
extracts the static semantic tree, and prints compact text by default.

```sh
npx ax-grep https://example.com
```

```text
main
  heading 'Example Domain'
  p 'This domain is for use in illustrative examples...'
  [i] link 'More information...' <https://www.iana.org/domains/example>
```

Text output includes link URLs, with common search redirect links normalized
when possible. It starts with deduplicated `links`, then page metadata,
analysis, ranked `results` with source/snippet details, heading outline,
important actions, content excerpts, and finally the full tree. Use JSON when
another tool needs the same summaries as structured data.

```sh
ax-grep --search "agent browser accessibility tree"
ax-grep --search "ax-grep npm" --agent
ax-grep --search "ax-grep npm" --json --summary
ax-grep --search "ax-grep npm" --engine bing --links-only
ax-grep --search "ax-grep npm" --engine bing --lang en --region US
ax-grep --search "ax-grep npm" --open-result best --json
ax-grep https://example.com --json
ax-grep https://example.com --json --no-tree
ax-grep https://example.com --agent --find "documentation examples"
ax-grep https://example.com --json --summary --find "documentation examples"
ax-grep https://example.com --links-only
ax-grep https://example.com --max-tree-lines 80
ax-grep https://example.com --mode interactive --exclude-boilerplate
ax-grep https://example.com --timeout 30000 --user-agent "my-agent/1.0"
```

`--search` builds search URLs for the agent. By default it uses auto mode:
DuckDuckGo, Bing, and StartPage are tried, blocked or empty result pages are
skipped, and the best usable result set is kept. Pass `--engine duckduckgo`,
`--engine bing`, or `--engine startpage` to force a single engine. Auto mode
keeps the request as `searchEngine: "auto"`, records the chosen engine as
`selectedSearchEngine`, and includes per-engine attempts in `searchEngines`.
Add `--open-result <n>` to fetch and analyze a selected ranked result in the
same command, or use `--open-result best` to open the strongest query match
based on relevance, matched terms, official-source hints, and any repeatable
`--find <text>` checks supplied with the search. The JSON output keeps
`sourceSearch` metadata so an agent can see which query, selected engine, and
result rank produced the final page. It also keeps compact `selectedResult` and
`alternateResults` metadata, so if the opened result is missing or thin, the
agent can recover from the original SERP without rerunning the search. In
compact `--agent` output those result entries include ready-to-run open-result
commands, preserving custom fetch options such as `--timeout` and
`--user-agent` when they were needed for the original request.
For supported search engines, `searchResults` is extracted from SERP result
cards before falling back to generic link ranking, so result order tracks the
page's own ranking more closely. Search results also include simple agent
judgment hints: `sourceType`, `sourceScore`, `sourceHints`, `relevance`,
`matchedTerms`, `isLikelyOfficial`, extracted date hints, result sitelinks, and
`selectionReason`; if top results only weakly match the query, `diagnostics` includes
`SEARCH_LOW_CONFIDENCE`. On search result pages, JSON also includes
`recommendedResult`, and `suggestedActions` includes `openResult: "best"` plus
a ready-to-run `command` when the original query is known. When all top results
miss an essential package-like term such as `ax-grep`, `recommendedResult` is
omitted and the agent action becomes `refine-search` instead of opening a
misleading high-rank result.
`agent.searchDecision` summarizes that same choice as `open-result`,
`refine-search`, or `none`, with confidence, result counts, relevance counts,
and the runnable command when one is available.
For non-search pages, `agent.pageDecision` mirrors the page-level choice as
`read-content`, `open-source-link`, `retry-with-browser-html`, `inspect-actions`,
or `none`, with readability, evidence, source quality, and runnable command
fields where applicable.
Search result pages also cap the trailing text tree to 80 lines by default to
keep agent prompts focused; pass `--max-tree-lines <n>` to choose a different
limit. In JSON mode, pass `--no-tree` or `--summary` to omit the raw tree while
keeping metadata, diagnostics, pageCheck, links, pageLinks, results, and
searchResults.
Use `--lang <code>` and `--region <code>` to add search URL parameters and an
`Accept-Language` header, making agent searches more reproducible across
locales.

For agent routing, use `--agent` when you do not need the raw tree or full link
tables. It prints compact JSON with the top-level `agent` object plus
`pageCheck`, search results, requested verification results, and warnings when
they are present. Read `agent` first: it combines page classification,
readability, verification, diagnostic codes, and recommended result selection
into `contract`, `status`, `summary`, `routingIntent`, `continuationMode`,
`next`, `runbook`, `handoff`, `expectedOutcome`, `signals`, `canUseFetchedHtml`, `needsBrowserHtml`,
`responseStatus`, `responseOk`, `responseContentType`, `finalUrlChanged`,
`pageKind`, `alternativeActionCount`, `usabilityScore`,
`evidenceQualityScore`, `sourceQualityScore`, `readabilityScore`,
`readabilityReasons`, `diagnosticCodes`, `diagnosticErrorCount`,
`diagnosticWarningCount`, `diagnosticInfoCount`, `verificationRequestedCount`,
`verificationFoundCount`, `verificationMissingCount`, `readTargets`, `bestReadTarget`,
`executionPlan`, `primaryExecution`, `primaryAction`, and compact recommended-result metadata
such as `recommendedRank`, `recommendedSource`, `recommendedRelevance`, and
`recommendedLikelyOfficial`.

`routingIntent` explains the next-step intent (`read-current`, `open-url`,
`search`, `browser-html`, `browser-interaction`, `inspect-output`, or `none`).
`contract.version` and `contract.features` identify the agent payload contract
supported by the current CLI output, so executors can check for fields such as
`next.loop`, `next.readValue`, `next.target`, and `executionPlan` before
relying on them.
`continuationMode` is the simpler executor switch for agent loops: `read`,
`command`, `browser`, `capture-html`, `inspect`, or `stop`.
`agent.runbook` is the easiest executor entry point. It flattens the canonical
loop decision, operation, answer readiness, command/read/browser-HTML fields,
and target metadata into one object, so a subagent can usually switch on
`runbook.decision` without joining `next`, `executionPlan`, and `answerPlan`.
`agent.handoff` is the shortest executor handoff. It gives one plain
`instruction` plus the same decision, mode, operation, action, priority,
confidence, answer status, citation IDs and resolved answer evidence, result or
source choices, compact signals/quality gates, read path/value, command, URL,
target metadata, or browser-HTML fields needed for the immediate next step, so
a subagent can do the right thing without assembling a sentence from multiple
objects.
`agent.next` is the canonical next-step payload for executors. It always has a
`mode`, `reason`, and `loop`. `next.loop.decision` is the direct executor
switch: `return`, `execute`, `browser`, `inspect`, or `stop`. When a follow-up
exists, `next` mirrors the exact fields needed to continue, such as
`commandArgs`, `readFrom`, `url`, `openResult`, `browserHtml`, or
`requiresBrowserInteraction`. When `mode` is `read`, `next.readTarget` mirrors
the matching `agent.readTargets` entry so an executor can understand the target
without joining arrays itself, and `next.readValue` contains the resolved
current-payload value for that path. When `mode` is `command` for a result or
source link, `next.target` carries the target URL's title, source host, rank,
source-type score, relevance, and official-source hints when known, so an agent
can decide whether to run the command without looking up the result array.
When browser-captured HTML is needed, `next.browserHtml` gives the capture
script, placeholder file name, and the command or after-interaction command that
should receive the captured HTML file path.
Text output includes the same loop switch as `nextMode`, `loopDecision`,
`loopContinue`, `loopTerminal`, `loopMaxIterations`, and `loopReason`, so a
lightweight executor can still continue without parsing the full JSON envelope.
`agent.expectedOutcome` states what success should look like after following
`agent.next`, such as reading evidence, opening a result, retrying a failed
fetch, running a search, capturing rendered HTML, using a browser inspection,
inspecting output, or stopping.
`agent.executionPlan` condenses the executor decision into one checklist:
`operation` is `return`, `execute-command`, `capture-browser-html`,
`inspect-browser`, `inspect-output`, or `stop`, and the same object repeats
trust flags (`useFetchedHtml`, `needsBrowserHtml`, `answerReady`), loop limits,
expected outcome, and runnable `commandArgs` or `readFrom` fields when present.
For `capture-browser-html` and `inspect-browser`, the same plan also repeats
`browserHtml` so an executor can write the captured
`document.documentElement.outerHTML` to the placeholder file and rerun the
provided command without inferring the protocol from prose.
`agent.signals` is a short structured status feed for routing and debugging:
`content`, `verification`, `search-results`, `source-links`, `browser`,
`diagnostic`, and `response` signals each carry `info`, `warning`, or `error`
severity plus a concise message.
`agent.qualityGates` turns the same extraction state into pass/fail checks for
fetch, content, source, search, verification, browser, and diagnostic quality,
plus overall status, including a severity, optional score, and payload path. Use it when a subagent
needs a quick trust audit before answering or executing the next command.
`agent.citations` is a compact shortlist of citeable content, verification
evidence, search results, and source links with stable `id`/`path` references,
plus `confidence` and `reason`, so an executor can assemble an answer without
scanning the full tree first.
`agent.answerPlan` says whether the current payload is ready for a final answer
(`ready`), needs another command (`needs-more`), needs browser capture
(`blocked`), or failed (`error`), lists the citation IDs to use, exposes
`confidence` plus concise `gaps`, mirrors the primary action fields
(`command`, `commandArgs`, `url`, or `readFrom`) needed to execute or answer
from the plan directly, and pairs with `agent.answerEvidence`, which contains
the resolved citation objects for those IDs.
On recoverable extraction errors, `agent.status` remains `error` while
`agent.answerPlan.status` becomes `needs-more` or `blocked`, so executors should
route from `agent.next`/`agent.answerPlan` instead of stopping on status alone.
`canContinue` is true when the primary action is directly usable by an agent
(`run-command`, `read-current`, or browser interaction), including recoverable
error states such as alternate-result recovery or retry-later.
On search result pages, `agent.resultChoices` mirrors the compact result
shortlist inside the top-level agent object. It marks the `recommended` and
`primary` choice, includes the `searchResults[...]` path, and keeps rank,
source, relevance, source score, match hints, and `selectionReason` together so
a subagent can compare candidates before drilling into the full result list.
Text output prints the same shortlist as `resultChoice:` lines and mirrors the
next handoff as `handoffCommandArgs:` plus `handoffResultChoice:` lines in the
`agent` block for agents that are inspecting stdout instead of compact JSON.
Browser-capture handoffs also get flat stdout keys:
`handoffBrowserHtmlUrl:`, `handoffBrowserHtmlFile:`,
`handoffBrowserHtmlCaptureScript:`, and `handoffBrowserHtmlCommandArgs:`.
On normal page checks, `agent.sourceChoices` mirrors `pageCheck.sourceLinks`
with stable `pageCheck.sourceLinks[...]` paths, source scores, reasons, and
runnable command fields so an executor can compare source candidates without
walking the page-check payload first. Text output prints these as
`sourceChoice:` lines in the `agent` block, while the handoff section also
exposes direct stdout hints such as `handoffReadFrom:`, `handoffReadValue:`,
`handoffReadValueType:`, `handoffReadValueItem:`, `handoffEvidence:`,
`handoffSourceChoice:`, and `handoffQualityGate:`.
`agent.readTargets` lists the compact payload paths worth reading next, marking
the primary `read-current` target when one exists. In compact agent
mode the first action lives in `agent.primaryAction`, while
`agent.primaryExecution` mirrors that action's `execution` for quick routing.
`agent.primaryReadFrom`, `agent.primaryCommand`, `agent.primaryCommandArgs`,
`agent.primaryAfterInteractionCommand`, `agent.primaryAfterInteractionCommandArgs`,
`agent.primaryUrl`, `agent.primaryRank`, `agent.primaryOpenResult`, and
`agent.requiresBrowserInteraction` mirror the most common continuation fields
from that same primary action, so a calling agent can route without drilling
into the full action object first.
Agent-facing actions include `priority` and `priorityReason`, so executors can
compare follow-up alternatives without re-ranking them from prose alone.
`agent.actions` provides the same deduplicated candidate set in one list,
marking the first item with `primary: true` and preserving each candidate's
source path.
Duplicate `suggestedActions`,
`pageCheck.recommendedAction`, and `verification.recommendedAction` entries are
omitted when they repeat that same command, leaving `pageCheck.nextSteps` for
follow-up alternatives. When verification has already selected `use-evidence`,
compact output suppresses page-level alternative actions so the agent does not
branch away from confirmed evidence. Generated follow-up commands preserve
search and fetch context such as `--lang`, `--region`, `--find`, `--timeout`,
`--user-agent`, and `--agent` so another agent can continue the same
investigation without reconstructing flags. Compact search-result entries also
include citeable `id`/`path` metadata plus rank-specific `openResult`,
`command`, and `commandArgs`, so an agent can compare, cite, or open result 2
or 3 without inventing a command from the raw URL; compact
`pageCheck.primaryLinks` and `pageCheck.sourceLinks` also include `id`, `path`,
`selectionReason`, `command`, and `commandArgs` in `--agent` output, preserving
fetch flags for source-link follow-up;
search-like pages reached by a normal URL expose a direct
`ax-grep <result-url>` continuation for the selected result;
fetch errors also emit a
browser-captured HTML retry command when a URL is known. `run-command` actions
include both a human-copyable `command` string and raw `commandArgs` for
`spawn`/`execFile` style execution, so agents do not need to parse shell
quoting. Terminal actions such
as `read-content` and `use-evidence` include `execution: "read-current"`,
`terminal: true`, and a `readFrom` pointer, and intentionally do not include
commands, so agents read the current evidence instead of refetching the same
usable page. Browser-interaction actions include `execution: "interact-browser"`
and `requiresBrowserInteraction: true`. They still omit immediate `command`
fields when another static fetch would not reveal more information, but may
include `afterInteractionCommandArgs` for the follow-up `--html-file` run after
the browser state has been changed and recaptured. When
`--html-file` or `--stdin` is already supplying browser-captured HTML, compact
output suppresses another browser retry recommendation. On search result pages,
compact agent output keeps the ranked `searchResults` list and omits
duplicate `pageCheck` link lists, search-form actions, and search-page
follow-up steps that repeat `agent.primaryAction`. Page checks also suppress
common global-navigation buttons and links so agents are routed toward page
content instead of site chrome; when `sourceLinks` are present, extra external
`primaryLinks` are omitted from compact output. To keep payloads small, it emits
the first five search results plus the recommended result when that result is
outside the first five; auto-search engine attempts are reduced to status,
result counts, diagnostic codes, and each engine's top result, and are omitted
after `--open-result` once `sourceSearch` records the selected result.
`sourceSearch.alternateResults` keeps the nearby candidate results needed for
failure recovery while avoiding the full engine-attempt payload. When the
primary action is `open-alternate-result`, `agent.readTargets` points at
`sourceSearch.alternateResults` so an agent can inspect the original SERP
candidates before running the recovery command. After any `--open-result`,
`agent.readTargets` also points at `sourceSearch.selectedResult`, preserving
the original SERP title, snippet, rank, relevance, and runnable command as
page provenance. Text output mirrors that recovery context with flat keys such
as `handoffSourceSearchQuery:`, `handoffSourceSearchSearchUrl:`,
`handoffSourceSearchSelectedUrl:`, `handoffSourceSearchFindQueries:`, and
`handoffSourceSearchAlternateCommandArgs:`.

An agent executor can treat `agent.handoff.decision` as the only required switch:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentHandoff, AgentJsonEnvelope } from "ax-grep";

const execFileAsync = promisify(execFile);

async function runAxGrep(args: string[]): Promise<AgentJsonEnvelope> {
  const { stdout } = await execFileAsync("ax-grep", args);
  return JSON.parse(stdout);
}

async function inspectWithAxGrep(urlOrQuery: string) {
  let payload = await runAxGrep([urlOrQuery, "--agent"]);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const step: AgentHandoff = payload.agent.handoff;

    if (step.decision === "return") {
      if (step.readValue) return step.readValue.value;
      return payload;
    }

    if (step.decision === "stop") return payload;

    if (step.decision === "execute" && step.commandArgs) {
      payload = await runAxGrep(step.commandArgs.slice(1));
      continue;
    }

    const browserHtml = step.browserHtml;
    if (step.decision === "browser" && browserHtml?.commandArgs) {
      const htmlPath = await captureRenderedHtml(step.url, browserHtml.captureScript);
      payload = await runAxGrep(browserHtml.commandArgs
        .slice(1)
        .map((arg: string) => arg === browserHtml.htmlFile ? htmlPath : arg));
      continue;
    }

    if (step.decision === "browser") {
      return openInAgentBrowser(step.url);
    }

    throw new Error(step.reason);
  }

  return payload;
}
```

`commandArgs` always starts with `ax-grep`, so callers using `execFile` can pass
`commandArgs.slice(1)` back to the binary. `capture-html` means the current
fetch was not enough; use the browser controller to save rendered HTML, then
run the supplied command with that file path. `read` and `stop` are terminal for
the current payload: use `agent.handoff.readValue.value` when present, and fall
back to the payload if no extra evidence is needed.

Use repeatable `--find <text>` with any page or search result page to ask
`ax-grep` whether the page summaries contain a term or phrase. JSON output adds
`finds` with `found`, `matchCount`, and the matching field/evidence text, so an
agent can verify a page without scanning the full tree. It also adds
`verification`, a compact roll-up with `status`, found/missing query counts,
best evidence, and the next verification action. On search result pages,
matching results also expose `findMatches`; the SERP title itself is not enough
to satisfy `--find`. `recommendedResult`, suggested `open-result` actions, and
`--open-result best` prefer result-card matches automatically.

When a page is challenged, logged-in, or JavaScript-rendered, let a browser
controller capture the HTML and pass it back through the same CLI:

```sh
ax-grep https://example.com --html-file captured.html --links-only
cat captured.html | ax-grep https://example.com --stdin --json
```

A shortened `--json --summary` envelope looks like this. It is intentionally
small; the full CLI output is the tool contract, not README fixture data:

```json
{
  "schemaVersion": 1,
  "tool": "ax-grep",
  "ok": true,
  "url": "https://example.com",
  "finalUrl": "https://example.com/",
  "kind": "content-page",
  "mode": "compact",
  "page": {
    "title": "Example Domain",
    "description": "Example Domain is reserved for illustrative examples.",
    "siteName": "Example",
    "structuredDataTypes": ["Article"]
  },
  "pageCheck": {
    "title": "Example Domain",
    "confidence": "medium",
    "contentEvidence": [
      {
        "id": "c1",
        "path": "pageCheck.contentEvidence[0]",
        "text": "This domain is for use in illustrative examples in documents.",
        "quality": "medium"
      }
    ],
    "readability": {
      "level": "medium",
      "score": 0.45,
      "reasons": ["1 content evidence item"]
    }
  },
  "verification": {
    "status": "matched",
    "bestEvidence": {
      "field": "contentEvidence",
      "path": "pageCheck.contentEvidence[0]",
      "text": "This domain is for use in illustrative examples in documents."
    }
  },
  "agent": {
    "contract": {
      "version": 1,
      "features": [
        "next.loop",
        "next.readValue",
        "handoff",
        "handoff.answerEvidence",
        "handoff.quality"
      ]
    },
    "status": "ready",
    "continuationMode": "read",
    "next": {
      "mode": "read",
      "loop": {
        "decision": "return",
        "shouldContinue": false,
        "terminal": true
      },
      "readFrom": "verification.bestEvidence",
      "readValue": {
        "path": "verification.bestEvidence",
        "value": {
          "field": "contentEvidence",
          "text": "This domain is for use in illustrative examples in documents."
        }
      }
    },
    "handoff": {
      "instruction": "Answer now from verification.bestEvidence using citations v1.",
      "decision": "return",
      "mode": "read",
      "operation": "return",
      "action": "use-evidence",
      "answerStatus": "ready",
      "answerReady": true,
      "readFrom": "verification.bestEvidence",
      "answerEvidence": [
        {
          "id": "v1",
          "path": "verification.bestEvidence",
          "kind": "verification",
          "text": "This domain is for use in illustrative examples in documents."
        }
      ],
      "qualityGates": [
        {
          "kind": "verification",
          "pass": true,
          "severity": "info",
          "path": "verification.bestEvidence"
        }
      ]
    }
  },
  "treeOmitted": true
}
```

The default URL path uses plain `fetch()`. It does not execute page JavaScript
or bypass bot checks. If a fetched page has no inspectable content, the CLI
returns exit code `20` and emits a structured JSON error and warning in
`--json` mode. Use `--html-file` or `--stdin` for browser-captured fallback
HTML.

`kind` is an agent-facing page classification: `search-results`, `content-page`,
`interactive-page`, `blocked-page`, `empty`, or `page`. `diagnostics` flags
states such as `CHALLENGE_LIKELY`, `LOGIN_REQUIRED`, `PAYWALL_LIKELY`,
`NO_USEFUL_LINKS`, and `NON_HTML_CONTENT_TYPE`; `suggestedActions` gives the
next useful move, such as opening the strongest matching result or retrying
with captured browser HTML. For search pages, `recommendedResult` is the result
an agent should inspect first when it does not have a stronger reason to choose
another rank. It uses query relevance plus any `--find` matches, so the same
command can search, identify the likely source, and open it with
`--open-result best`. `links` always describes links on the current page.
`pageLinks` is the ranked source-scored view over those links. `results` is a
backward-compatible alias that contains search candidates on search pages and
page-link candidates on ordinary pages;
`searchResults` is populated when the current page is classified as a search
results page. `pageCheck` is the higher-level page inspection summary agents
should read first for title, canonical URL, main heading, content excerpts,
structured content evidence, source-like external links, actions, and
extraction confidence. When available, it also preserves head provenance fields
such as `siteName`, `author`, `publishedTime`, and `modifiedTime`, which are
not normally visible in the accessibility tree. JSON-LD schema.org `@type`
values are exposed as `structuredDataTypes`, and JSON-LD headline, author, and
dates are used as fallback provenance when equivalent meta tags are missing.
Each `contentEvidence` item includes a compact citation `id`, its stable
payload `path`, plus `source`, `score`, `quality`, and `qualityReason` fields,
so agents can distinguish semantic page evidence from fallback text, judge
whether a snippet is strong enough to answer from, and cite exact snippets when
choosing what to verify or return. `pageCheck.dataTables` captures compact
table captions, headers, and sample rows from HTML so agents can verify prices,
specs, rankings, and other tabular facts without reading the full tree.
`pageCheck.barriers` captures login, paywall, challenge, consent, age, and
regional barrier signals that affect browser handling.
`pageCheck.forms` captures form method, action URL, field names, labels, and
GET query templates so agents can plan searches and filters without inferring
submission details from controls alone. `pageCheck.keyValues` captures compact
facts from definition lists, time elements, and short label/value text.
`pageCheck.metaFacts` captures robots directives, canonical URLs, alternate
links, refresh targets, and selected social/article metadata from head tags.
`pageCheck.schemaFacts` captures compact facts from hidden JSON-LD schema.org
data such as product offers, ratings, events, and FAQ answers.
`pageCheck.timeline` captures publication, modification, event, and visible time facts.
`pageCheck.faqs` captures visible FAQ question-answer pairs from details and
accordion-style HTML.
`pageCheck.breadcrumbs` captures JSON-LD and HTML breadcrumb trails as ordered
context. `pageCheck.sections` groups nearby text under headings for fast
section-level source checking. `pageCheck.pagination` captures next, previous,
numbered, and current-page navigation.
`pageCheck.toc` captures table-of-contents and in-page section links.
`pageCheck.codeBlocks` captures code examples and command snippets from pre/code
blocks.
`pageCheck.citations` captures blockquotes, cites, footnotes, and reference-list
snippets for source verification.
`pageCheck.media` captures resolved image URLs, alt text, captions, and social
preview images. `pageCheck.resources` captures feed, alternate, license,
manifest, sitemap, and document resource links that are often hidden in head
metadata or download anchors. `pageCheck.embeds` captures iframe, object,
audio, video, and embed URLs with titles and source metadata. `pageCheck.authorLinks`
captures author, byline, and profile URLs from HTML and JSON-LD.
`pageCheck.readability` includes `level`, numeric `score`, and concise
`reasons`, explaining how directly useful the page is for source checking;
compact `agent` repeats the score and first few reasons so agents can route
from the top-level object before drilling into `pageCheck`.
`pageCheck.recommendedAction` gives the next
page-level move without requiring the agent to infer it from raw fields.
`pageCheck.nextSteps` expands that into a deduplicated shortlist of follow-ups
such as opening the best search result, opening source links, inspecting
controls, or retrying with browser-captured HTML. Actions include an
`execution` discriminator: `run-command` means execute the included `command`
or, preferably, `commandArgs`,
`read-current` means read the field named by `readFrom`, and
`interact-browser` means use the live browser before recapturing HTML.

`agent.status` is the shortest routing signal: `ready` means fetched HTML is
usable, `choose-result` means open the primary search result action, `verify`
means evidence is partial or thin, `needs-browser` means browser-captured HTML
is recommended, and `error` means extraction failed before fetched page content
was usable; recoverable errors still expose the next executable step through
`agent.answerPlan`, `agent.next`, and `agent.canContinue`. `agent.canUseFetchedHtml`
stays true for successfully parsed search result pages, even when page
readability is low, because the SERP cards are already usable for choosing or
refining results. `agent.resultCount` counts
search results only, while `agent.sourceLinkCount` counts page-level source
links only; on search pages, use `searchResults` for candidate sources.
When `--html-file` or `--stdin` supplies browser-captured HTML, blocker
diagnostics are still reported, but actions do not ask for another browser HTML
retry; browser-state inspection actions intentionally omit commands because the
next step is interaction in the already-open browser. HTTP failures also branch
by status: likely access blocks can request browser HTML, opened missing search
results route to an alternate SERP result when available, other missing URLs
route to URL-check/search recovery, and server errors route to a later retry.

`sourceType`, `sourceScore`, and `sourceHints` are lightweight source-profiling
fields on ranked results and page links. They classify obvious domains such as
government, education, official registries, documentation, code hosts, wiki,
news, forums, social platforms, and commerce pages. They are hints for agent
triage, not a trust guarantee.

When `--find` is used, `verification.status` is the quickest page-check answer:
`matched` means every requested phrase was found, `partial` means some were
found, and `missing` means none were found. Without `--find`, full JSON reports
`not-requested`; compact `--agent` output omits the `verification` object and
keeps the same state in `agent.verificationStatus`. If evidence is missing,
`verification.recommendedAction` points to the next useful move, such as opening
a source link, opening an alternate original SERP result, or retrying with
browser-captured HTML. If no source or alternate is available, `broaden-search`
emits a fresh `--search` command rather than refetching the same page. In
compact agent output, empty verification arrays and actions already present as
`agent.primaryAction` are omitted. Verification commands preserve the missing
`--find` query so the next page is checked for the same claim automatically.
When a search result page has no result card matching `--find`, `refine-search`
also folds the missing phrase into the next `--search` query so agents do not
repeat the same SERP.

## Entry Points

| Situation | Use |
| --- | --- |
| HTML string from `fetch()`, SSR, or a Worker | `extract(html)` from `ax-grep` |
| Small Worker/static-only bundle | `extract(html)` from `ax-grep/static` |
| Code already running inside the page | `extract()` from `ax-grep/browser` |
| Puppeteer, Playwright, WebView, or another external page controller | `createExtractorScript()` from `ax-grep` |

## Static HTML

Use the root entry when you have an HTML string. This path does not create a DOM
with jsdom and does not launch a browser.

```ts
import { extract } from "ax-grep";

const response = await fetch("https://example.com");
const html = await response.text();
const tree = extract(html);
```

The root `extract(html)` function is the same static extractor exposed at
`ax-grep/static`.

```ts
import { extract } from "ax-grep/static";

const tree = extract(html, {
  includeAttributes: false,
});
```

Static extraction can infer roles, names, labels, ARIA state, links, forms,
headings, tables, and lists from SSR markup. It also applies conservative
prompt-size controls by default:

- skips non-semantic payload tags such as `script`, `style`, and `template`
- prunes hidden markup and collapsed controlled regions
- summarizes very large child lists and repeated template-like subtrees
- detects broad wiki-like and forum-like HTML shapes to tune summarization

Static extraction cannot see computed CSS, layout bounds, client-rendered DOM,
shadow DOM, iframe contents, or post-load mutations.

## Browser Injection

Use `createExtractorScript()` when you control a page from the outside. This is
the right path for Puppeteer, Playwright, Android WebView, iOS WKWebView, or an
agent browser that can evaluate JavaScript.

```ts
import { createExtractorScript } from "ax-grep";

const tree = await page.evaluate(createExtractorScript());
```

Playwright example:

```ts
import { chromium } from "playwright";
import { createExtractorScript, formatSemanticTreeText } from "ax-grep";

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("https://example.com");

const tree = await page.evaluate(createExtractorScript({
  includeBounds: false,
  includeAttributes: false,
}));

console.log(formatSemanticTreeText(tree));

await browser.close();
```

WebView-style injection works the same way:

```ts
import { createExtractorScript } from "ax-grep";

const script = createExtractorScript({
  mode: "interactive",
  format: "json",
});

// Android: webView.evaluateJavascript(script, callback)
// iOS: webView.evaluateJavaScript(script, completionHandler)
```

## Direct In-Page Usage

Use `ax-grep/browser` when your code is already executing in the page, such as a
browser extension content script.

```ts
import { extract, formatSemanticTreeText } from "ax-grep/browser";

const tree = extract({
  mode: "interactive",
  includeBounds: false,
});

console.log(formatSemanticTreeText(tree));
```

## Output Shape

`extract()` returns a `SemanticNode` tree:

```ts
type SemanticNode = {
  id: string;
  tag: string;
  role: string | null;
  name: string;
  interactive: boolean;
  focusable: boolean;
  selector?: string;
  xpath?: string;
  text?: string;
  value?: string;
  state?: Record<string, unknown>;
  attributes?: Record<string, string>;
  children: SemanticNode[];
};
```

Use `formatSemanticTreeText(tree)` for a compact prompt-friendly text view, or
`flattenSemanticTree(tree)` and `summarizeSemanticTree(tree)` for analysis and
benchmarks.

## Cloudflare Worker Example

```ts
import { extract } from "ax-grep/static";
import { formatSemanticTreeText } from "ax-grep";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url).searchParams.get("url");
    if (!url) return new Response("Missing url", { status: 400 });

    const response = await fetch(url);
    const html = await response.text();
    const tree = extract(html);

    return new Response(formatSemanticTreeText(tree), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
```

## Options

The common options are shared across browser and static extraction where they
make sense.

```ts
const tree = extract(html, {
  mode: "compact",
  includeAttributes: false,
  includeHidden: false,
  includeSelectOptions: true,
  maxTextLength: 240,
});
```

Useful options:

| Option | Default | Notes |
| --- | ---: | --- |
| `mode` | `"compact"` | Use `"interactive"` to keep mostly actionable nodes. |
| `includeAttributes` | `true` | Turn off for smaller prompt payloads. |
| `includeHidden` | `false` | Keep hidden/collapsed content only when needed. |
| `includeSelectOptions` | `true` | Useful for agent planning, verbose for huge selects. |
| `includeTextNodes` | browser: `true`, static: `false` | Static extraction relies more on semantic names by default. |
| `maxTextLength` | `240` | Clips long direct text/name fragments. |
| `excludeLikelyAds` | `false` | Optional heuristic pruning for benchmark or prompt use. |
| `summarizeLargeSubtrees` | static: `true` | Keeps SSR payloads bounded. |
| `summarizeLikelyLinkFarms` | static: `true` | Helps forum/sidebar/navigation-heavy pages. |

## Mutation Stream

```ts
import { observeSemanticTree } from "ax-grep/browser";

const observer = observeSemanticTree((change) => {
  console.log(change.mutationCount, change.tree);
}, { debounceMs: 50 });

observer.disconnect();
```

For injected-script use, `createObserverScript()` installs an observer on
`window.__AX_LITE_OBSERVER__` and dispatches `__AX_LITE_OBSERVER__:change`
events.

## What It Does Not Do

- It does not call the browser accessibility tree API.
- It does not use DevTools Protocol or CDP.
- It does not run JavaScript for static HTML input.
- It does not bypass login, bot checks, or site challenges.
- It does not guarantee identical output to Playwright or `agent-browser`
  accessibility snapshots.

## Benchmarking

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
output, score the CLI's `--agent` compact `agent`/`pageCheck`/`searchResults` summary, including
structured evidence, readability, source link quality, verification status,
recommended actions, next steps, and
estimate token cost for both compact tree prompts and `--agent` JSON prompts. See
`docs/comparison-baseline.md` for the current baseline run.
Search, social, challenge, and volatile targets may be diagnostic-only and
excluded from gate averages; check each run's `included`/`excluded` counts
before treating an average as release-gating coverage.

Current benchmark suites include:

- static HTML vs browser snapshots
- agent executor regression targets for `averageAgentExecutorScore`
- fixture-backed agent executor gates for search open, search refine, and browser HTML retry recovery
- CLI agent summary scoring for `pageCheck`, `searchResults`, source evidence, readability, next steps, and suggested actions
- token-cost comparison for compact tree prompt text and `--agent` JSON payloads
- Korean forum/search/social targets
- Chinese and Japanese wiki/news/forum/search targets
- challenge and volatile-page diagnostics

## Coverage

```sh
pnpm test:coverage
```

The coverage gate requires 100% line coverage for the V8-instrumented static
extractor core in `src/static.ts`. Browser injection behavior is covered by the
Puppeteer test suite, but it runs inside the page context and is not counted in
the Node V8 coverage report.

## Package Status

`ax-grep` is early-stage software. The public API is intentionally small:

- `extract(html)` from `ax-grep` or `ax-grep/static`
- `extract()` from `ax-grep/browser`
- `createExtractorScript()` and `createObserverScript()` from `ax-grep`

The long-form aliases `extractStaticSemanticTree()` and `extractSemanticTree()`
are kept for compatibility.
