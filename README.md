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
tables. It returns a compact top-level `agent` object plus the relevant
`pageCheck`, search, verification, and warning fields.

Read these fields first:

- `agent.status`: high-level state such as `ready`, `choose-result`,
  `verify`, `needs-browser`, or `error`.
- `agent.handoff`: shortest executor handoff, with one instruction and the
  command, URL, browser HTML capture, or read target needed for the next step.
- `agent.next`: canonical loop payload with `mode`, `loop.decision`,
  `commandArgs`, `readFrom`, `readValue`, `target`, or `browserHtml`.
- `agent.runbook` and `agent.executionPlan`: flattened forms of the same loop
  decision for simpler executors.
- `agent.answerPlan`, `agent.citations`, and `agent.answerEvidence`: final
  answer readiness and the citeable evidence to use.
- `agent.readTargets`, `agent.resultChoices`, and `agent.sourceChoices`: ranked
  payload paths worth reading or opening next.
- `agent.signals` and `agent.qualityGates`: compact diagnostics for routing and
  trust checks.

`contract.version`, `contract.compact`, and `contract.featureCount` identify the
payload contract without repeating the full feature list in every prompt.
`continuationMode` is a simple loop switch: `read`, `command`, `browser`,
`capture-html`, `inspect`, or `stop`.

Agent actions use an `execution` discriminator:

- `run-command`: execute `commandArgs` with `execFile`-style argument passing.
- `read-current`: read the current payload path named by `readFrom`.
- `interact-browser`: use a live browser, then optionally rerun with captured
  HTML.

Generated commands preserve fetch and search context such as `--lang`,
`--region`, `--find`, `--timeout`, `--user-agent`, and `--agent`. Compact output
also removes duplicate follow-up actions, suppresses common global navigation,
and avoids repeating search-result links in `pageCheck` when `searchResults`
already contains the ranked candidates. Browser-captured HTML inputs do not ask
for another browser HTML retry unless a new interaction is needed.

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
      "compact": true,
      "featureCount": 69
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

`kind` is an agent-facing page classification: `search-results`,
`content-page`, `interactive-page`, `blocked-page`, `empty`, or `page`.
`diagnostics` flags states such as `CHALLENGE_LIKELY`, `LOGIN_REQUIRED`,
`PAYWALL_LIKELY`, `NO_USEFUL_LINKS`, and `NON_HTML_CONTENT_TYPE`.
`suggestedActions` gives the next useful move, such as opening the strongest
matching result or retrying with captured browser HTML.

For search pages, `recommendedResult` is the result an agent should inspect
first. `searchResults` contains ranked SERP candidates; `results` remains a
backward-compatible alias for search candidates or ordinary page links.
`pageLinks` is the source-scored view over links on the current page.

`pageCheck` is the higher-level page inspection summary agents should read
before the raw tree. It includes title, canonical URL, main heading, content
evidence, source-like external links, actions, extraction confidence,
readability, and page-level follow-up actions.

Useful `pageCheck` groups:

- Content and verification: `contentEvidence`, `dataTables`, `sections`,
  `toc`, `codeBlocks`, `citations`, `faqs`, and `breadcrumbs`.
- Interaction and recovery: `barriers`, `forms`, `actionTargets`,
  `pagination`, `recommendedAction`, and `nextSteps`.
- Hidden app/page state: `hydration`, `apiEndpoints`, `clientState`, `runtime`,
  `config`, `appHints`, and `mobileHints`.
- Metadata and provenance: `topics`, `keyValues`, `metaFacts`, `provenance`,
  `httpPolicies`, `schemaFacts`, `offers`, `identities`, `datasets`,
  `timeline`, `contactPoints`, and `authorLinks`.
- Media and resources: `media`, `resources`, `embeds`, and `transcripts`.

These groups expose details that are often absent from an accessibility tree,
including JSON-LD facts, head metadata, API endpoints, app configuration,
HTTP/meta policy directives, source identifiers, feed/license/resource links,
and mobile app-link hints. Each `contentEvidence` item includes a citation `id`,
stable payload `path`, `source`, `score`, `quality`, and `qualityReason` so an
agent can cite or verify a compact snippet without scanning the whole tree.

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
