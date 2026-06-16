---
name: ax-grep-cli
description: Use ax-grep as a CLI-first page search and page-check tool before opening a browser. Best for agents that need compact semantic trees, source links, hidden app signals, forms, tables, citations, and browser handoff guidance.
---

# ax-grep CLI

Use `ax-grep` before browser automation when a subagent needs to inspect a
search result, URL, HTML file, or captured page.

## First Command

```sh
ax-grep "https://example.com" --agent
```

For smaller context:

```sh
ax-grep "https://example.com" --agent-brief
```

## Search

```sh
ax-grep --search "official docs pricing" --agent
```

Use the returned `agent.*CommandArgs` fields when continuing. They are already
quoted and ordered for the next CLI call.

## Agent Policy

- Prefer `--agent` or `--agent-brief` over raw text output for subagents.
- Read `agent.executor`, `agent.handoff`, `agent.next`, `agent.readTargets`,
  `agent.sourceChoices`, and `agent.resultChoices` before deciding.
- If `agent.executor.decision` is `return`, answer from the referenced
  `readFrom` payload instead of opening a browser.
- If a URL follow-up is needed, run the provided `commandArgs` one command at a
  time.
- Escalate to browser automation only when `needsBrowserHtml`,
  `needsBrowserInteraction`, or the executor/handoff fields say it is needed.
- Do not run multiple browser-backed checks in parallel.

## Useful Patterns

Inspect a result and open the best match in one step:

```sh
ax-grep --search "site:example.com api reference" --open-result best --agent
```

Check a page for specific terms:

```sh
ax-grep "https://example.com/docs" --find "rate limit" --find "authentication" --agent
```

Read static HTML from another tool:

```sh
curl -fsSL "https://example.com" | ax-grep --stdin --agent
```

## What ax-grep Sees

`ax-grep --agent` can expose:

- semantic headings, landmarks, links, buttons, forms, tables, and lists
- source-like links and ranked search choices
- JSON-LD schema facts, metadata, policies, topics, provenance, and citations
- hydration URLs, API endpoints, runtime hints, app config, and mobile hints
- recommended next commands and browser handoff reasons

Treat the full JSON payload as source of truth; top-level shortcuts are for
fast routing.
