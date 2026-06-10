# Feature Overview

`ax-grep` keeps the root README short. Use this page for the fuller feature map.

## Semantic Tree

- Fetch a URL, read an HTML file, read stdin, or inspect browser-captured HTML.
- Print compact text by default, or return structured JSON.
- Summarize headings, links, forms, media, metadata, tables, code blocks, and page state.

## Agent Mode

- `--agent` returns the next useful step for an automation loop.
- `agent.executor` is the shortest machine-facing step.
- `agent.handoff` and `agent.next` keep compatibility with older integrations.
- `pageCheck` and `verification` summarize whether the page answers the request.

## Search and Verification

- `--search` can collect search results and optionally open a ranked result.
- `--find` verifies requested text on a page or search result.
- Locale flags such as `--lang` and `--region` make searches easier to reproduce.

## Browser Fallback

`ax-grep` does not bypass login, paywalls, bot checks, or JavaScript rendering.
When plain fetch is not enough, capture rendered HTML in a browser and pass it
back with `--html-file` or `--stdin`.
