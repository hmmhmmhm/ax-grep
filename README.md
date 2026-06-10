# ax-grep

[![npm version](https://img.shields.io/npm/v/ax-grep.svg)](https://www.npmjs.com/package/ax-grep)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![line coverage: 100%](https://img.shields.io/badge/line%20coverage-100%25-brightgreen.svg)](#coverage)

`ax-grep` turns HTML or a live DOM into a compact semantic tree for agents,
automation code, browser extensions, WebViews, and Workers.

It is not the platform accessibility tree. It approximates useful page semantics
from DOM, ARIA, labels, focusability, element state, and page metadata.

<!-- Keep this README short. Put detailed CLI, agent, API, and benchmark notes under docs/. -->

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

For agent handoff JSON:

```sh
ax-grep https://example.com --agent
ax-grep https://example.com --agent --find "documentation examples"
```

## Library

```ts
import { extract, formatSemanticTreeText } from "ax-grep";

const html = await fetch("https://example.com").then((response) => response.text());
const tree = extract(html);

console.log(formatSemanticTreeText(tree));
```

## Docs

- [CLI and agent mode](./docs/cli-agent.md)
- [Agent handoff loop](./docs/agent-handoff.md)
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
