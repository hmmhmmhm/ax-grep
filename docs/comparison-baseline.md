# Comparison Baseline

Generated on 2026-06-05.

The comparison harness runs `ax-grep` through Puppeteer and compares named
role output against `agent-browser snapshot`.

The historical `named role overlap` score is intentionally strict: it is an
exact match over normalized `role:name` pairs, with no fuzzy or containment
matching. It is useful for tracking whether `ax-grep` is reproducing
`agent-browser snapshot` output, but it can understate agent usefulness when the
missing items are mostly static text.

The harness also reports `agentReadiness` scores. These are still based on the
same exact normalized `role:name` matches, but split by agent-facing use:

- `referenceRecall`: how much of the `agent-browser` named output appears in
  `ax-grep`.
- `candidatePrecision`: how much of the `ax-grep` named output appears in
  `agent-browser`.
- `actionableRecall`: exact recall for links, buttons, fields, tabs, and other
  operation targets.
- `navigationRecall`: exact recall for links, headings, landmarks, and search.
- `contentRecall`: exact recall for headings, images, table/list structure, and
  static text.
- `score`: weighted summary for agent parsing: actionable 40%, navigation 25%,
  content 20%, precision 15%.

The static harness also emits `cliAgentSummary`, which scores the actual
agent-facing CLI JSON envelope rather than raw tree overlap. It uses
`pageCheck`, `searchResults`, and `suggestedActions` to estimate how directly an
agent can decide whether to read, open, or retry a page. `averageCliAgentScore`
in `gateSummary` tracks that higher-level usefulness separately from
`agentReadiness`, which remains an exact `agent-browser snapshot` overlap
metric.

The default baseline does not force a viewport. A shared viewport can be tested
with `AX_LITE_COMPARE_VIEWPORT=WIDTHxHEIGHT`, but the default run is kept stable
to avoid changing the benchmark shape unexpectedly.

For state-sensitive pages, `AX_LITE_COMPARE_SETUP=path/to/setup.js` evaluates a
setup script in both Puppeteer and `agent-browser` before extraction. This keeps
exact-match scoring intact while making page state explicit.

## Sample Results

| URL | ax-grep nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://example.com` | 4 | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `https://www.wikipedia.org` | 140 | 105 | 0.57 | 0.97 | 1.00 | 0.04 | 0.80 |
| `https://developer.mozilla.org/en-US/docs/Web/Accessibility` | 315 | 286 | 0.56 | 0.74 | 0.89 | 0.15 | 0.68 |
| `https://news.ycombinator.com` | 710 | 501 | 0.75 | 0.82 | 0.82 | 0.63 | 0.78 |
| `https://github.com/features` | 764 | 538 | 0.90 | 0.88 | 0.95 | 0.93 | 0.92 |
| `https://libraries.io/npm/typescript` | 382 | 609 | 0.49 | 0.95 | 0.95 | 0.17 | 0.80 |
| `https://www.npmjs.com/package/typescript` | 16 | 15 | 0.50 | 0.67 | 0.80 | 0.50 | 0.72 |

## Korean Sample Results

Run with `pnpm compare:korea`.

| URL | ax-grep nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://ko.wikipedia.org/wiki/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD` | 5713 | 7088 | 0.44 | 0.82 | 0.85 | 0.14 | 0.69 |
| `https://www.hani.co.kr/` | 998 | 992 | 0.42 | 0.50 | 0.48 | 0.23 | 0.48 |
| `https://www.korea.kr/` | 569 | 494 | 0.47 | 0.66 | 0.69 | 0.24 | 0.59 |
| `https://www.yonhapnewstv.co.kr/` | 566 | 448 | 0.79 | 0.79 | 0.83 | 0.79 | 0.81 |

## Static SSR HTML Results

Run with `pnpm compare:static URL...`.

This path fetches HTML and runs `extract(html)` from the static entry without
Chrome, jsdom, WebView, layout, or script execution. `agent-browser` is used only
as the reference snapshot for comparison.

| URL | fetched bytes | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://example.com` | 528 | 5 | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `https://www.wikipedia.org` | 120361 | 193 | 105 | 0.57 | 0.97 | 1.00 | 0.04 | 0.77 |
| `https://news.ycombinator.com` | 34665 | 700 | 498 | 0.74 | 0.81 | 0.81 | 0.64 | 0.77 |
| `https://www.yonhapnewstv.co.kr/` | 47910 | 630 | 440 | 0.51 | 0.75 | 0.78 | 0.75 | 0.72 |

## Diverse Static Results

Run with `pnpm compare:static:diverse`.

| Category | URL | class | fetched bytes | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| News index | `https://www.bbc.com/news` | usable | 317290 | 672 | 427 | 0.48 | 0.52 | 0.65 | 0.55 | 0.55 |
| News article | `https://www.npr.org/2025/03/11/nx-s1-5324543/ntsb-dca-mid-air-collision-american-black-hawk` | usable | 106490 | 481 | 201 | 0.33 | 0.83 | 0.89 | 0.48 | 0.70 |
| News portal stress | `https://www.theguardian.com/international` | over-collected | 1429586 | 3829 | 1225 | 0.30 | 0.90 | 0.64 | 0.27 | 0.68 |
| Government service | `https://www.gov.uk/foreign-travel-advice` | usable | 111369 | 714 | 698 | 0.53 | 0.97 | 0.99 | 0.49 | 0.81 |
| Accessibility guide | `https://www.nottinghamshire.gov.uk/global-content/how-to-create-accessible-content/how-to-make-web-pages-accessible/checklist-web-page` | usable | 31747 | 239 | 250 | 0.49 | 0.70 | 0.76 | 0.33 | 0.61 |
| Ecommerce fixture | `https://books.toscrape.com/` | usable | 51294 | 482 | 528 | 0.61 | 0.88 | 0.91 | 0.77 | 0.82 |
| Reddit legacy | `https://old.reddit.com/r/programming/` | challenge | 136514 | 1255 | 1 | 0.00 | 0.00 | 0.00 | 1.00 | 0.20 |
| Reddit modern | `https://www.reddit.com/r/programming/` | challenge | 8438 | 53 | 1 | 0.00 | 0.00 | 0.00 | 1.00 | 0.35 |
| X social challenge | `https://x.com/NASA` | needs-browser | 277862 | 38 | 35 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Instagram social challenge | `https://www.instagram.com/nasa/` | shell | 882680 | 3 | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

## Token Cost Results

Run with `pnpm compare:tokens URL...`.

This serializes both browser-injected and static SSR extraction into compact
agent prompt text and estimates token cost with `cl100k_base`. The prompt text
includes role, name, state/value, and selectors for interactive nodes.

| URL | browser nodes | browser tokens | static nodes | static tokens | static delta | static/browser ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://example.com` | 4 | 37 | 5 | 29 | -8 | 0.78 |
| `https://www.wikipedia.org` | 140 | 1339 | 193 | 1292 | -47 | 0.97 |
| `https://news.ycombinator.com` | 704 | 14503 | 700 | 6356 | -8147 | 0.44 |
| `https://www.yonhapnewstv.co.kr/` | 568 | 14397 | 630 | 10877 | -3520 | 0.76 |

## Diverse Token Cost Results

Run with `pnpm compare:tokens:diverse`.

| Category | URL | browser nodes | browser tokens | static nodes | static tokens | static/browser ratio |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| News index | `https://www.bbc.com/news` | 554 | 9617 | 672 | 6606 | 0.69 |
| News article | `https://www.npr.org/2025/03/11/nx-s1-5324543/ntsb-dca-mid-air-collision-american-black-hawk` | 504 | 9122 | 481 | 4152 | 0.46 |
| Government service | `https://www.gov.uk/foreign-travel-advice` | 722 | 19115 | 714 | 6477 | 0.34 |
| Ecommerce fixture | `https://books.toscrape.com/` | 455 | 7014 | 482 | 3599 | 0.51 |
| Reddit legacy challenge | `https://old.reddit.com/r/programming/` | 6 | 58 | 1264 | 9343 | 161.09 |
| X social challenge | `https://x.com/NASA` | 314 | 8041 | 38 | 237 | 0.03 |
| Instagram social challenge | `https://www.instagram.com/nasa/` | 35 | 640 | 351 | 1883 | 2.94 |

## Korean/Social Static Benchmark

Run with `pnpm compare:static:korea-social` and
`pnpm compare:tokens:korea-social`.

This target set covers Clien, Ruliweb, DCInside, Google/Bing/Startpage Search,
X/Twitter, and Instagram. The static comparison benchmark first tries plain HTML
fetch. If the response looks like a bot challenge, login shell, or empty
client-rendered shell, it falls back to `agent-browser` rendered HTML through
`document.documentElement.outerHTML` before running the static extractor.

Search and social targets stay in the benchmark as diagnostics, but are not
included in the gate summary because their logged-out public views are
anti-bot, hydration, and personalization sensitive. In this run, the gate
summary includes 4 targets and excludes 5 diagnostics; the average gate agent
score is 0.698 and the average static/browser token ratio is 0.395.

| Category | gate | HTML source | class | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score | static/browser token ratio |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Clien home | gate | fetch | usable | 469 | 657 | 0.522 | 0.799 | 0.806 | 0.053 | 0.675 | 0.286 |
| Clien post | gate | fetch | usable | 573 | 1167 | 0.234 | 0.553 | 0.542 | 0.008 | 0.483 | 0.303 |
| Ruliweb post | gate | fetch | usable | 396 | 297 | 0.620 | 0.974 | 0.978 | 0.821 | 0.892 | 0.610 |
| DCInside post | gate | fetch | usable | 1217 | 358 | 0.233 | 0.951 | 0.957 | 0.429 | 0.740 | 0.381 |
| Google search | diagnostic | fetch | reference-challenge | 1 | 5 | 0.000 | 0.000 | 0.000 | 0.000 | 0.150 | 0.110 |
| Bing search | diagnostic | fetch | volatile | 152 | 126 | 0.380 | 0.719 | 0.590 | 0.091 | 0.511 | 1.249 |
| Startpage search | diagnostic | fetch | reference-challenge | 85 | 61 | 0.861 | 0.963 | 0.957 | 0.625 | 0.878 | 0.341 |
| X social | diagnostic | fetch | usable | 156 | 36 | 0.169 | 1.000 | 0.900 | 0.500 | 0.750 | 0.193 |
| Instagram social | diagnostic | fetch | usable | 36 | 115 | 0.255 | 0.293 | 1.000 | 0.130 | 0.543 | 0.145 |

Notes:

- Ruliweb can require rendered HTML fallback in some runs, but this run fetched
  useful static HTML directly.
- Clien matching improved after benchmark normalization started stripping icon
  font private-use glyphs and leading menu bullets from comparable names.
- DCInside preserved action/navigation signals, moved from `over-collected` to
  `usable`, and lowered static/browser token ratio below 0.50 after compact
  static extraction started pruning unnamed leaf wrappers.
- Google Search returned a bot/interstitial shell in the browser reference path.
- Bing Search is volatile in this environment: fetch or rendered HTML can expose
  useful search UI or unrelated image-search affordances, but the exact
  reference comparison is not stable enough for a gate yet. Search diagnostics
  can be classified as `volatile` instead of `usable`.
- Startpage can return useful fetch HTML, but this run hit a suspended-connection
  captcha page in the browser-derived reference path. Embedded CSS-in-JS text is
  now excluded from static names, but the target remains a `reference-challenge`
  fixture.
- Instagram can alternate between login-only and fuller logged-out shells in
  this environment; keep it diagnostic even when a run scores as `usable`.

## China/Japan Static Benchmark

Run with `pnpm compare:static:china-japan` and
`pnpm compare:tokens:china-japan`.

This target set covers Chinese and Japanese encyclopedia, news, portal, forum,
developer, search, and video/social pages. Search, video/social, and pages whose
reference navigation fails in this environment stay in diagnostics. In this
run, the gate summary includes 7 targets and excludes 6 diagnostics; the
average gate agent score is 0.654 and the average static/browser token ratio is
0.544.

| Category | gate | HTML source | class | static nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score | static/browser token ratio |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| China Wikipedia | gate | fetch | usable | 4907 | 8518 | 0.421 | 0.866 | 0.871 | 0.050 | 0.687 | 0.277 |
| People China portal | diagnostic | fetch | reference-missing | 912 |  | 0.000 | 1.000 | 1.000 | 1.000 | 0.850 | 0.482 |
| Xinhua portal | gate | fetch | usable | 1041 | 1076 | 0.706 | 0.973 | 0.973 | 0.167 | 0.772 | 0.453 |
| Douban home | gate | fetch | usable | 700 | 952 | 0.757 | 0.930 | 0.893 | 0.095 | 0.738 | 0.307 |
| Baidu search | diagnostic | fetch | needs-browser | 250 | 7 | 0.000 | 0.000 | 0.000 | 1.000 | 0.200 | 0.677 |
| Bilibili home | diagnostic | fetch | usable | 231 | 217 | 0.523 | 0.754 | 0.770 | 0.436 | 0.660 | 0.371 |
| Japan Wikipedia | gate | fetch | usable | 5349 | 11774 | 0.311 | 0.599 | 0.618 | 0.072 | 0.491 | 0.649 |
| NHK News | diagnostic | fetch | reference-missing | 490 |  | 0.000 | 1.000 | 1.000 | 1.000 | 0.850 | n/a |
| Qiita TypeScript tag | gate | fetch | usable | 674 | 893 | 0.645 | 0.719 | 0.741 | 0.508 | 0.693 | 0.308 |
| Hatena IT hotentry | gate | fetch | usable | 1675 | 1775 | 0.566 | 0.922 | 0.937 | 0.258 | 0.739 | 0.782 |
| 5ch board | gate | fetch | usable | 780 | 360 | 0.105 | 0.574 | 0.600 | 0.316 | 0.459 | 1.031 |
| Yahoo Japan search | diagnostic | fetch | needs-browser | 54 | 158 | 0.187 | 0.327 | 0.293 | 0.000 | 0.279 | 0.177 |
| Niconico home | diagnostic | fetch | needs-browser | 212 | 373 | 0.123 | 0.186 | 0.196 | 0.018 | 0.159 | 0.228 |

Notes:

- China Wikipedia became usable after the benchmark stopped treating Wikipedia
  table-of-contents section numbers as part of comparable link names and static
  extraction started auto-detecting wiki-like HTML to preserve more article
  links by default.
- Xinhua and Douban are the strongest Chinese gate targets in this run.
- People China fetches usable HTML, but `agent-browser` navigation is blocked in
  this environment, so the target is diagnostic until a stable reference path is
  available.
- Baidu search is unstable across runs. It can collapse to a tiny feedback shell
  or expose a larger fetched search page; keep it diagnostic.
- Japan Wikipedia is usable but still has low exact content recall on the large
  article body.
- NHK fetches static HTML, but Puppeteer and `agent-browser` both hit HTTP/2
  navigation failures in this environment. Token ratio is reported as `n/a`
  when the browser reference is unavailable.
- Qiita and Hatena are useful Japanese gate targets; Hatena remains a token-cost
  stress case.
- 5ch became usable after reference comparison hardening, forum thread metadata
  normalization, auto-detected forum link-farm limits, and pruning redundant
  listitem wrappers around links/buttons. It remains a token-cost stress case at
  roughly parity with browser injection.

## Observations

- Simple static pages line up well. `example.com` matched the important named roles exactly.
- Wikipedia exposes a large language `<select>`. `ax-grep` can still unroll options for agent operation, but the comparison harness now disables option unrolling to match `agent-browser snapshot` more closely.
- Wikipedia language links use both visible article-count text and descriptive `title` attributes. `ax-grep` now follows accessible-name priority more closely by using link contents before title fallback.
- MDN uses many custom elements. `ax-grep` now prunes simple custom-element wrappers, but host elements that expose state, ids, or shadow content still need deeper handling.
- MDN ad-like placements can be excluded in comparison mode with `excludeLikelyAds`. The general extractor keeps this off by default so callers do not silently lose content.
- A shared comparison viewport is available through `AX_LITE_COMPARE_VIEWPORT=WIDTHxHEIGHT`, but it is opt-in because responsive pages can change the benchmark shape significantly.
- Hacker News relies on layout tables. The comparison harness normalizes Chrome's `LayoutTableCell` role to `cell` and removes punctuation-adjacent whitespace, improving overlap from 0.64 to 0.75.
- The comparison harness normalizes common role vocabulary differences such as `image` vs `img`, `paragraph` vs `p`, and `StaticText` vs `text`.
- `libraries.io/npm/typescript` is the stable package-registry-like sample.
- The new agent-facing metrics show a different picture than raw overlap on
  Wikipedia and Libraries.io: static-text recall is low, but actionable and
  navigation targets are mostly preserved. That distinction better matches the
  goal of making pages tractable for agents.
- Korean samples cover a large encyclopedia article, two news-like pages, and a
  public portal. The Korean Wikipedia page is intentionally heavy and is kept in
  `compare:korea` rather than the default sample script.
- `hani.co.kr` timed out waiting for Puppeteer network idle during the baseline
  run and used the DOMContentLoaded state. Keep it as a news-site stress case,
  but do not treat it as a tightly stable target yet.
- Korean live pages can shift by a few nodes or snapshot lines between runs as
  headlines, ads, and embedded widgets update.
- `yonhapnewstv.co.kr` currently lines up best among the Korean samples across
  exact overlap, content recall, and agent score.
- Static SSR extraction is viable for simple and server-rendered pages. It works
  especially well on Hacker News and reasonably on Yonhap News TV without any
  browser runtime.
- Static SSR extraction can prune some non-exposed menu content from HTML
  alone. The most important signal so far is a collapsed control with
  `aria-expanded="false"` and `aria-controls`; pruning the controlled subtree
  reduced Wikipedia static tokens from 11,183 to 1,292 and improved exact
  overlap from 0.05 to 0.57.
- Static SSR extraction now skips non-semantic payload tags, summarizes large
  child lists, and collapses repeated template-like subtrees. This keeps raw SSR
  payloads from turning into unbounded prompt input, while preserving an
  explicit `note` that nodes were omitted.
- Compact static extraction prunes unnamed leaf wrappers such as decorative
  spans, emphasis tags, empty inputs, and line breaks. Ancestor accessible names
  are computed before pruning, so useful link/button names are preserved while
  prompt-only wrapper noise is removed.
- Static SSR extraction cannot account for computed CSS, responsive layout,
  client-only rendering, open shadow roots, iframe documents, or post-load DOM
  mutation. Treat it as a lightweight agent parsing fallback, not an AXTree
  replacement.
- Static SSR extraction is not automatically cheaper in prompt tokens, but it
  can be competitive when collapsed controlled regions are pruned. It is now
  slightly cheaper than browser injection on Wikipedia and still cheaper on
  Hacker News and Yonhap News TV.
- Token cost needs its own benchmark gate. Agent-readiness can be acceptable
  while prompt cost is unacceptable, especially on SSR pages with large hidden
  menus, language selectors, or template payloads.
- Diverse targets show why benchmark categories matter. Government, ecommerce,
  and article pages preserve useful action/navigation signals; large news
  portals are good stress tests; Reddit/X/Instagram are better treated as
  social/challenge fixtures because public logged-out views often collapse to
  shell, login, or bot-protection states.
- Diverse token results show static extraction is often cheaper on server
  rendered news, government, and ecommerce pages. Social sites are inconsistent:
  X's fetched shell is tiny compared with the browser view, old Reddit is the
  opposite in this environment, and Instagram exposes enough SSR payload to make
  static more expensive than the rendered shell.
- Shell/challenge classification is required because exact overlap and agent
  score can look deceptively good when both static and reference snapshots are
  nearly empty.
- AP News and Ars Technica were tested as additional candidates but omitted from
  `compare:static:diverse` because the reference snapshot timed out in this
  environment. Reuters returned HTTP 401 from plain fetch and is also omitted
  from the automated diverse set.
- `npmjs.com` currently serves a Cloudflare challenge in the sample environment. The baseline is useful as a challenge-page fixture, not as a package-page content fixture.

## Next Improvements

- Improve custom-element/shadow-host pruning without losing useful selector targets.
- Add explicit benchmark gates for actionable and navigation recall once a
  stable target set is chosen.
- Compare browser and static extraction side-by-side on the same target set to
  decide when the Worker-compatible path is good enough.
- Tune static pruning controls for hidden menus, select/options, and repeated
  template regions against the diverse benchmark set.
- Support authenticated/cached sessions for `npmjs.com` if the real npm package page remains useful as a target.
- Add more real WebView smoke tests once Android/iOS host projects exist.
