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
ax-grep --search "ax-grep npm" --engine bing --links-only
ax-grep --search "ax-grep npm" --engine bing --lang en --region US
ax-grep --search "ax-grep npm" --open-result 1 --json
ax-grep https://example.com --json
ax-grep https://example.com --links-only
ax-grep https://example.com --max-tree-lines 80
ax-grep https://example.com --mode interactive --exclude-boilerplate
ax-grep https://example.com --timeout 30000 --user-agent "my-agent/1.0"
```

`--search` builds a search URL for the agent. The default engine is
DuckDuckGo HTML; `--engine bing` and `--engine startpage` are also supported.
Add `--open-result <n>` to fetch and analyze the selected ranked result in
the same command. The JSON output keeps `sourceSearch` metadata so an agent can
see which query, engine, and result rank produced the final page.
For supported search engines, `searchResults` is extracted from SERP result
cards before falling back to generic link ranking, so result order tracks the
page's own ranking more closely.
Search result pages also cap the trailing text tree to 80 lines by default to
keep agent prompts focused; pass `--max-tree-lines <n>` to choose a different
limit.
Use `--lang <code>` and `--region <code>` to add search URL parameters and an
`Accept-Language` header, making agent searches more reproducible across
locales.

When a page is challenged, logged-in, or JavaScript-rendered, let a browser
controller capture the HTML and pass it back through the same CLI:

```sh
ax-grep https://example.com --html-file captured.html --links-only
cat captured.html | ax-grep https://example.com --stdin --json
```

`--json` prints an envelope:

```json
{
  "schemaVersion": 1,
  "tool": "ax-grep",
  "ok": true,
  "url": "https://example.com",
  "searchQuery": "example domain",
  "searchEngine": "duckduckgo",
  "searchLang": "en",
  "searchRegion": "US",
  "sourceSearch": {
    "query": "example domain",
    "engine": "duckduckgo",
    "searchUrl": "https://duckduckgo.com/html/?q=example+domain&kl=us-en",
    "lang": "en",
    "region": "US",
    "selectedRank": 1,
    "selectedTitle": "Example Domain",
    "selectedUrl": "https://example.com/"
  },
  "finalUrl": "https://example.com/",
  "status": 200,
  "mode": "compact",
  "warnings": [],
  "kind": "content-page",
  "diagnostics": [],
  "suggestedActions": [
    {
      "action": "read-content",
      "reason": "The page has article-like content excerpts suitable for source checking."
    }
  ],
  "page": {
    "title": "Example Domain",
    "description": "Example domains are reserved for documentation."
  },
  "pageCheck": {
    "title": "Example Domain",
    "mainHeading": "Example Domain",
    "contentPreview": [
      "This domain is for use in illustrative examples in documents."
    ],
    "contentLength": 58,
    "primaryLinks": [
      {
        "title": "More information...",
        "url": "https://www.iana.org/domains/example",
        "source": "iana.org",
        "rank": 1,
        "kind": "external"
      }
    ],
    "actions": [],
    "confidence": "medium"
  },
  "links": [
    {
      "text": "More information...",
      "url": "https://www.iana.org/domains/example",
      "role": "link"
    }
  ],
  "results": [
    {
      "title": "More information...",
      "url": "https://www.iana.org/domains/example",
      "source": "iana.org",
      "rank": 1,
      "snippet": "Background text near the result when available."
    }
  ],
  "searchResults": [],
  "outline": [
    {
      "text": "Example Domain",
      "level": 1
    }
  ],
  "actions": [],
  "content": [
    {
      "text": "This domain is for use in illustrative examples in documents.",
      "role": "p"
    }
  ],
  "tree": {}
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
next useful move, such as opening the first result or retrying with captured
browser HTML. `links` always describes links on the current page. `results` is
a ranked convenience view over those links for backward compatibility;
`searchResults` is populated when the current page is classified as a search
results page. `pageCheck` is the higher-level page inspection summary agents
should read first for title, canonical URL, main heading, content excerpts,
important links, actions, and extraction confidence.

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
pnpm compare:static:korea-social
pnpm compare:tokens:korea-social
pnpm compare:static:china-japan
pnpm compare:tokens:china-japan
```

The comparison scripts compare `ax-grep` output with `agent-browser snapshot`
output, score the CLI's `pageCheck`/`searchResults` agent summary, and estimate
token cost for compact agent prompts. See
`docs/comparison-baseline.md` for the current baseline run.

Current benchmark suites include:

- static HTML vs browser snapshots
- CLI agent summary scoring for `pageCheck`, `searchResults`, and suggested actions
- token-cost comparison for compact prompt text
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
