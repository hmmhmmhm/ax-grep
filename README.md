# ax-grep

[![npm version](https://img.shields.io/npm/v/ax-grep.svg)](https://www.npmjs.com/package/ax-grep)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`ax-grep` turns HTML or a live DOM into a compact semantic tree for agents,
automation code, browser extensions, WebViews, and Workers.

Core features:

- readable semantic trees from URLs, files, stdin, or captured browser HTML
- compact `--agent` JSON for search, page checks, and browser handoff loops

## Quick Start

```sh
npm install ax-grep
```

```sh
npx ax-grep https://example.com
npx ax-grep https://example.com --agent
```

## Docs

- [Documentation index](./docs/README.md)
- [Current progress](./docs/progress.md)
- [Feature overview](./docs/features.md)
- [CLI and agent mode](./docs/cli-agent.md)
- [Agent handoff loop](./docs/agent-handoff.md)
- [Library API](./docs/library-api.md)
