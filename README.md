# ax-grep

[![npm version](https://img.shields.io/npm/v/ax-grep.svg)](https://www.npmjs.com/package/ax-grep)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![line coverage: 100%](https://img.shields.io/badge/line%20coverage-100%25-brightgreen.svg)](#coverage)

`ax-grep` turns HTML or a live DOM into a compact semantic tree for agents,
automation code, browser extensions, WebViews, and Workers.

It is not a browser accessibility tree. It approximates one from DOM, ARIA,
labels, focusability, element state, and static page metadata.

## Install

```sh
pnpm add ax-grep
```

```sh
npm install ax-grep
```

## CLI

```sh
npx ax-grep https://example.com
```

```text
main
  heading 'Example Domain'
  p 'This domain is for use in illustrative examples...'
  [i] link 'More information...' <https://www.iana.org/domains/example>
```

Useful agent commands:

```sh
ax-grep https://example.com --agent
ax-grep https://example.com --agent --find "documentation examples"
ax-grep --search "ax-grep npm" --agent
ax-grep --search "ax-grep npm" --open-result best --agent
cat captured.html | ax-grep https://example.com --stdin --agent
```

`--agent` returns compact JSON with `agent.handoff`, `pageCheck`,
`verification`, and source evidence. Use `--find <text>` when an agent needs to
verify a claim without reading the full tree.

## Library

```ts
import { extract, formatSemanticTreeText } from "ax-grep";

const html = await fetch("https://example.com").then((response) => response.text());
const tree = extract(html);

console.log(formatSemanticTreeText(tree));
```

Use `ax-grep/static` for static HTML-only bundles, `ax-grep/browser` inside a
page, and `createExtractorScript()` for Puppeteer, Playwright, WebView, or
extension injection.

## Agent Handoff

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

    if (step.decision === "browser") {
      return openInAgentBrowser(step.url);
    }

    throw new Error(step.reason);
  }

  return payload;
}
```

`commandArgs` always starts with `ax-grep`, so callers using `execFile` can pass
`commandArgs.slice(1)` back to the binary.

## Compact JSON Example

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

## Docs

- [CLI and agent mode](./docs/cli-agent.md)
- [Library API and browser injection](./docs/library-api.md)
- [Benchmarks and comparison gates](./docs/benchmarks.md)
- [Current comparison baseline](./docs/comparison-baseline.md)

## Limitations

- Static CLI fetches do not execute JavaScript.
- It does not bypass login, bot checks, paywalls, or site challenges.
- It does not call the platform accessibility API or DevTools Protocol.

## Coverage

```sh
pnpm test:coverage
```

The coverage gate requires 100% line coverage for the V8-instrumented static
extractor core in `src/static.ts`.
