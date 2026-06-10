# CLI and Agent Mode

`ax-grep` fetches a URL, extracts a semantic page summary, and prints compact
text by default.

```sh
ax-grep https://example.com
ax-grep https://example.com --json
ax-grep https://example.com --json --summary
ax-grep https://example.com --links-only
ax-grep https://example.com --max-tree-lines 80
ax-grep https://example.com --mode interactive --exclude-boilerplate
ax-grep https://example.com --timeout 30000 --user-agent "my-agent/1.0"
```

## Search

```sh
ax-grep --search "agent browser accessibility tree"
ax-grep --search "ax-grep npm" --engine bing --links-only
ax-grep --search "ax-grep npm" --engine bing --lang en --region US
ax-grep --search "ax-grep npm" --open-result best --json
```

- `--search` tries DuckDuckGo, Bing, and StartPage by default.
- `--engine <name>` forces one search engine.
- `--open-result <n|best>` fetches a ranked result in the same command.
- `--lang` and `--region` make locale-specific searches reproducible.

## Agent Routing

Use `--agent` when another program needs the next step instead of raw tree text.
The response includes compact `agent`, `pageCheck`, `verification`, search, and
warning fields.

Read these first:

- `agent.status`: `ready`, `choose-result`, `verify`, `needs-browser`, or `error`.
- `agent.executor`: one-field executor step with decision, command/read/browser fields.
- `agent.handoff`: the shortest executor handoff for the next step.
- `agent.next`: canonical loop payload with command, read target, or browser step.
- `agent.answerPlan`, `agent.citations`, and `agent.answerEvidence`: final answer evidence.
- `agent.readTargets`, `agent.resultChoices`, and `agent.sourceChoices`: ranked paths to inspect.
- `agent.signals` and `agent.qualityGates`: compact diagnostics.

Agent actions use an `execution` discriminator:

- `run-command`: execute `commandArgs` with `execFile`-style argument passing.
- `read-current`: read the current payload path named by `readFrom`.
- `interact-browser`: use a live browser, then optionally rerun with captured HTML.

Generated commands preserve fetch and search context such as `--lang`,
`--region`, `--find`, `--timeout`, `--user-agent`, and `--agent`.

## Find and Verification

Use repeatable `--find <text>` with any page or search result page to verify a
term or phrase.

```sh
ax-grep https://example.com --agent --find "documentation examples"
ax-grep --search "OpenAI API docs" --find "Responses API" --agent
```

JSON output adds `finds` and `verification`. `verification.status` is the
quickest page-check answer:

- `matched`: every requested phrase was found.
- `partial`: some phrases were found.
- `missing`: none were found.
- `not-requested`: no `--find` query was supplied.

When evidence is missing, `verification.recommendedAction` points to the next
useful move, such as opening a source link, opening an alternate original SERP
result, retrying with browser-captured HTML, or broadening the search.

## Browser-Captured HTML

The default URL path uses plain `fetch()`. It does not execute page JavaScript.
When a page is challenged, logged-in, or JavaScript-rendered, let a browser
controller capture the HTML and pass it back through the same CLI.

```sh
ax-grep https://example.com --html-file captured.html --agent
cat captured.html | ax-grep https://example.com --stdin --agent
```

If fetched HTML has no inspectable content, JSON mode returns a structured error
and warning. Use `--html-file` or `--stdin` for rendered fallback HTML.

## Page Summary Fields

`kind` classifies the page as `search-results`, `content-page`,
`interactive-page`, `blocked-page`, `empty`, or `page`.

`pageCheck` is the higher-level inspection summary agents should read before the
raw tree. It includes title, canonical URL, main heading, content evidence,
source-like external links, actions, confidence, readability, and follow-up
actions.

Useful `pageCheck` groups include:

- Content and verification: `contentEvidence`, `dataTables`, `sections`, `toc`, `codeBlocks`, `citations`, `faqs`, and `breadcrumbs`.
- Interaction and recovery: `barriers`, `forms`, `actionTargets`, `pagination`, `recommendedAction`, and `nextSteps`.
- Hidden app/page state: `hydration`, `apiEndpoints`, `clientState`, `runtime`, `config`, `appHints`, and `mobileHints`.
- Metadata and provenance: `topics`, `keyValues`, `metaFacts`, `provenance`, `httpPolicies`, `schemaFacts`, `offers`, `identities`, `datasets`, `timeline`, `contactPoints`, and `authorLinks`.
- Media and resources: `media`, `resources`, `embeds`, and `transcripts`.

These fields expose details often absent from an accessibility tree, including
JSON-LD facts, head metadata, API endpoints, app configuration, policy
directives, feed/license/resource links, and mobile app-link hints.
