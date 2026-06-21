# Server Agent Integration

Use `ax-grep` in an agent service when you already fetched HTML and want a
compact, accessibility-style source view before paying for browser automation.
This is useful in Codex SDK, OpenRouter, queue workers, and custom agent loops.

## Minimal Pattern

```ts
import { extract, formatSemanticTreeText } from "ax-grep";

export async function readForAgent(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "my-agent/1.0",
    },
  });

  const html = await response.text();
  const tree = extract(html, {
    includeAttributes: false,
    includeHidden: false,
  });

  return {
    url: response.url || url,
    status: response.status,
    text: formatSemanticTreeText(tree),
  };
}
```

Pass `text` into the model as source evidence. Escalate to a browser only when
the fetched HTML is thin, blocked, or client-rendered.

## Agent Prompt Shape

```ts
const page = await readForAgent("https://example.com");

const messages = [
  {
    role: "system",
    content: "Use the provided semantic tree as page evidence. Ask for browser automation only when the evidence is insufficient.",
  },
  {
    role: "user",
    content: `URL: ${page.url}\nHTTP: ${page.status}\n\n${page.text}`,
  },
];
```

For live URLs, the CLI can also produce an agent handoff with challenge
detection and search metadata:

```sh
npx --yes ax-grep@latest https://example.com --agent-brief
```

Use that command when you want `agent.executor`, `agent.handoff`, `pageCheck`,
and challenge reason codes without building the fetch layer yourself.

## Failure Policy

- If a challenge marker is detected, return a browser-required message instead
  of retrying in a loop.
- If HTML is mostly an app shell, fetch browser-captured HTML or run WebView
  injection.
- Keep server fetches sequential for release smoke checks. Browser-backed
  comparisons must use `pnpm check:processes` before and after the run.
