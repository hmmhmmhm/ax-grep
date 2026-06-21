<div align="center">

# ax-grep

[![npm version](https://img.shields.io/npm/v/ax-grep.svg)](https://www.npmjs.com/package/ax-grep)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](./tests)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![agent ready](https://img.shields.io/badge/agent-ready-0b7f3a.svg)](./docs/agent-handoff.md)
[![Codex skill](https://img.shields.io/badge/Codex-skill-111111.svg)](./skills/ax-grep-cli/SKILL.md)
[![Claude compatible](https://img.shields.io/badge/Claude-compatible-5b4b8a.svg)](./docs/cli-agent.md)
[![Gemini ready](https://img.shields.io/badge/Gemini-ready-1a73e8.svg)](./docs/cli-agent.md)

<img src="./docs/assets/ax-grep-og.png" alt="ax-grep promo image" width="920">

<img src="./docs/assets/ax-grep-benchmark.png" alt="ax-grep benchmark comparison image" width="920">

<img src="./docs/assets/ax-grep-search.png" alt="ax-grep auto search comparison image" width="920">

Compact semantic trees and agent-ready page checks from HTML, URLs, WebViews,
and live browser pages. It approximates browser accessibility trees before
automation, defaults to `impit` for browser-like HTTP/2/TLS fetches, detects
hCaptcha, reCAPTCHA, and Cloudflare challenge markers, saves 15.4x less peak
RAM and 3.0x fewer decision tokens in the local benchmark, and `--search` auto
mode tries DuckDuckGo, Bing, and StartPage while recording every engine attempt.

</div>

## 1. Try With A Prompt

Paste this into a Codex session or subagent prompt before opening a browser
(also works as guidance for Claude, Gemini, OpenRouter, and other agents):

```md
Before opening a browser, inspect pages with ax-grep when possible.

Run:
npx --yes ax-grep@latest <url> --agent-brief

Read agent.executor, agent.handoff, agent.readTargets, pageCheck, and
verification first. Open a browser only when the payload says static HTML is
not enough.
```

## 2. Install The CLI Skill

```sh
curl -fsSL https://raw.githubusercontent.com/hmmhmmhm/ax-grep/main/skills.sh | sh
```

This installs the Codex skill prompt only. The same prompt pattern can be pasted
into Claude, Gemini, OpenRouter, or other agent runners. Restart Codex if the
new skill is not listed immediately.

## 3. Try The CLI

```sh
npx --yes ax-grep@latest https://example.com --agent-brief
```

If you installed the binary globally, use `ax-grep` directly.
Agents should read `agent.executor`, `agent.handoff`, `agent.readTargets`,
`pageCheck`, and `verification` first. Open a browser only when the handoff
fields say static HTML is not enough.

## 4. Use From A Server

Use this inside agent services built with Codex SDK, OpenRouter, or similar
LLM routing stacks to turn fetched HTML into compact source evidence before
spending tokens or memory on browser automation.

```sh
npm install ax-grep
```

```ts
import { extract, formatSemanticTreeText } from "ax-grep";

const html = await fetch("https://example.com").then((r) => r.text());
const tree = extract(html);
const promptText = formatSemanticTreeText(tree);
```

`ax-grep` is ESM-only and requires Node 18 or newer. CommonJS services can use `const { extract } = await import("ax-grep")`.

## 5. Use In WebViews Or Pages

In mobile apps, WebViews, and in-page agents, inject the extractor to create an
accessibility-style structure immediately from the current page. It is useful
for local sLLM web search, local web parsing, and instant agent-ready page
summaries without leaving the app.

```ts
import { createExtractorScript } from "ax-grep";

const script = createExtractorScript({ format: "text" });
const text = await page.evaluate(script);
// iOS/Android WebView: evaluateJavaScript(script) returns the same text value.
```

## Docs
- [Documentation index](./docs/README.md)
- [CLI skill prompt](./skills/ax-grep-cli/SKILL.md)
- [CLI and agent mode](./docs/cli-agent.md)
- [Agent handoff loop](./docs/agent-handoff.md)
- [Benchmarks](./docs/benchmarks.md)
- [Library API](./docs/library-api.md)
