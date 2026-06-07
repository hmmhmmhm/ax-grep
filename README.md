# ax-grep

`ax-grep` extracts a semantic accessibility-like tree from HTML or from a live
web page. It is designed for agents, browser extensions, injected scripts, and
WebView bridges that need a compact, inspectable view of page structure.

It is not a replacement for a real browser accessibility tree. It approximates
one from DOM, ARIA, computed style, labels, focusability, and element state.

## Install

```sh
pnpm add ax-grep
```

## Which API Should I Use?

| Situation | Use |
| --- | --- |
| You have an HTML string from `fetch()`, SSR, or a Worker | `extract(html)` from `ax-grep` |
| You control a live page through Puppeteer, Playwright, or a WebView bridge | `createExtractorScript()` from `ax-grep` |
| Your code already runs inside the page, such as a browser extension content script | `extract()` from `ax-grep/browser` |
| You want the explicit Worker-oriented static entry | `extract(html)` from `ax-grep/static` |

## Static HTML

```ts
import { extract } from "ax-grep";

const response = await fetch("https://example.com");
const html = await response.text();
const tree = extract(html);
```

Use `ax-grep/static` for the same static extractor as an explicit subpath when
you want the smallest Worker-oriented import.

## Browser Injection

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

WebView-style injection:

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

```ts
import { extract, formatSemanticTreeText } from "ax-grep/browser";

const tree = extract({
  mode: "interactive",
  includeBounds: false,
});

console.log(formatSemanticTreeText(tree));
```

## Static SSR HTML

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

Static extraction parses the HTML string directly, so it can infer roles, names,
labels, ARIA state, links, forms, headings, tables, and lists from SSR markup. It
cannot see computed style, layout bounds, client-rendered DOM, shadow DOM, or
iframe contents.

By default, static extraction prunes hidden markup and collapsed controlled
regions, skips non-semantic payload tags, summarizes very large child lists, and
collapses repeated template-like subtrees. It also infers broad source profiles
from the HTML, preserving more links for wiki-like pages while tightening dense
link-list summarization for forum-like pages.

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
output and estimate token cost for compact agent prompts. See
`docs/comparison-baseline.md` for the current baseline run.
