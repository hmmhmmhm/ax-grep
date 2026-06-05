# ax-lite

`ax-lite` extracts a semantic accessibility-like tree from inside a web page.
It does not use DevTools, CDP, or browser automation protocols.

The goal is broad browser and WebView compatibility:

- browser extension content scripts
- injected scripts
- Android WebView `evaluateJavascript`
- iOS WKWebView `evaluateJavaScript`
- Puppeteer or Playwright page evaluation

It is not a replacement for a real browser accessibility tree. It approximates
one from DOM, ARIA, computed style, labels, focusability, and element state.

## Install

```sh
pnpm add @hmmhmmhm/ax-lite
```

## Browser Usage

```ts
import { createExtractorScript } from "@hmmhmmhm/ax-lite";

const script = createExtractorScript({ format: "json" });
const tree = await page.evaluate(script);
```

## Direct In-Page Usage

```ts
import { extractSemanticTree } from "@hmmhmmhm/ax-lite/browser";

const tree = extractSemanticTree();
```

## Compare With Agent Browser

```sh
pnpm compare:sample
```

The comparison script extracts an `ax-lite` tree with Puppeteer and compares it
against `agent-browser snapshot` output for the same URL.

See `docs/comparison-baseline.md` for the first baseline run.

By default, `ax-lite` includes `<select>` options because that is useful for
agent action planning. The comparison harness disables option unrolling so its
shape is closer to browser accessibility snapshots.
