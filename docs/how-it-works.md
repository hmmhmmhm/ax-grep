# How ax-grep Works

ax-grep reproduces a browser-like accessibility tree before opening a browser.
It parses HTML into a DOM-like tree, computes role, name, state, focusability,
and interactivity, then reshapes that structure into agent-ready `agent`,
`pageCheck`, `verification`, and `handoff` output.

## 1. It Turns HTML Into A Semantic Tree

The public library entry point, [`extract()`](../src/index.ts#L107), delegates
to the static HTML extractor,
[`extractStaticSemanticTree()`](../src/static.ts#L99). That function parses HTML
with `htmlparser2`, resolves extraction options, and indexes `id`, `aria-*`
references, `label for`, and collapsed-control relationships first
([`indexDocument()`](../src/static.ts#L175)).

Then [`walkElement()`](../src/static.ts#L221) visits each element and builds a
`SemanticNode` that approximates the structure a browser would expose through
its accessibility tree. [`getRole()`](../src/static.ts#L678) maps explicit
`role` values and HTML tags to accessibility roles, while
[`computeName()`](../src/static.ts#L723) computes accessible names from
`aria-labelledby`, `aria-label`, `<label>`, `alt`, and text content.
[`getState()`](../src/static.ts#L791) carries states such as `checked`,
`selected`, `expanded`, `disabled`, and `aria-current`.
[`isFocusable()`](../src/static.ts#L857) and
[`isInteractive()`](../src/static.ts#L851) mark controls an agent can click or
type into.

## 2. It Removes Noise Agents Do Not Need

Static HTML often contains layout wrappers, closed menus, repeated cards, ads,
and footer/sidebar boilerplate. `walkElement()` does not pass all of that
through unchanged. Collapsed subtrees are reduced by
[`shouldSkipChildrenForCollapsedElement()`](../src/static.ts#L550), likely
closed overlays are removed by
[`isLikelyClosedOverlay()`](../src/static.ts#L564), and generic wrappers are
pruned or flattened by [`shouldPrune()`](../src/static.ts#L612).

The goal is not to summarize every byte of the original HTML. The goal is to
preserve the structure an agent is likely to read, cite, click, or continue from.

## 3. The Same Model Works Inside A Browser Or WebView

For WebViews and already-open pages,
[`extractSemanticTree()`](../src/browser.ts#L89) walks the live `document`
instead of static parser output. The browser DOM version of
[`walkElement()`](../src/browser.ts#L168) fills the same role, name, state,
selector, xpath, and child fields, and can also attach bounds, shadow DOM, and
iframe information.

Live page changes are handled by
[`observeSemanticTree()`](../src/browser.ts#L123), which uses `MutationObserver`
to emit updated semantic snapshots. That makes the same extraction model useful
for mobile WebViews, browser extensions, and in-page agents that need to turn
the current page into an agent-readable structure immediately.

## 4. The CLI Rebuilds The Tree As Agent Handoff

The CLI does more than print a semantic tree.
[`jsonEnvelope()`](../src/cli.ts#L21445) extracts links, outline entries,
actions, content, and search results.
[`summarizePageCheck()`](../src/cli.ts#L8414) turns those into content evidence,
forms, action targets, hydration/API hints, and barriers.

Then [`summarizeAgent()`](../src/cli.ts#L14754) decides what an agent should do
next. It determines whether fetched HTML is enough, whether a search result
should be opened, whether browser-captured HTML is required, and whether there
is enough evidence for an answer. The output is exposed through fields such as
`agent.executor`, `agent.handoff`, `agent.readTargets`, `pageCheck`, and
`verification`. In `--agent-brief` mode,
[`compactAgentBrief()`](../src/cli.ts#L24329) and
[`compactAgentBriefHandoff()`](../src/cli.ts#L26406) compress that result for
subagent loops.

## 5. Challenges And Failed Static Reads Become Browser Handoff

Some pages cannot be handled from static HTML alone. hCaptcha, reCAPTCHA,
Cloudflare, Akamai, DataDome, PerimeterX, and Kasada challenge markers are
detected by [`detectBarrierDiagnostics()`](../src/cli.ts#L21157). When those
signals appear, the CLI does not pretend the page is readable. It returns a
handoff that tells the agent browser use or additional capture is required.

Search mode follows the same principle. `--search --engine auto` runs through
DuckDuckGo, Bing, StartPage, and Google in
[`resolveAutoSearch()`](../src/cli.ts#L3683), skips blocked or empty result
pages, and keeps the best usable result set.

## 6. Reproduction Quality Is Checked Against Browser Snapshots

The reproduction target is measured, not guessed.
[`scripts/compare.ts`](../scripts/compare.ts#L123) runs ax-grep and
`agent-browser snapshot` against the same URL, then scores named-role overlap
and agent readiness. After comparison,
[`closeAgentBrowserSession()`](../scripts/compare.ts#L237) closes the browser
session, and [`withAgentBrowserLock()`](../scripts/compare.ts#L247) prevents
parallel browser comparisons from overloading the host.

Release smoke floors live in
[`scripts/check-agent-browser-smoke.ts`](../scripts/check-agent-browser-smoke.ts#L36).
Simple pages require full overlap, while more complex targets use per-site
overlap, recall, and readiness thresholds from 0.75 to 0.90 or higher. In other
words, ax-grep does not blindly copy every browser accessibility node. It keeps
comparing against browser snapshots while tuning the structure agents actually
need.
