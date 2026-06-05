# Comparison Baseline

Generated on 2026-06-05.

The comparison harness runs `ax-lite` through Puppeteer and compares named
role output against `agent-browser snapshot`.

The historical `named role overlap` score is intentionally strict: it is an
exact match over normalized `role:name` pairs, with no fuzzy or containment
matching. It is useful for tracking whether `ax-lite` is reproducing
`agent-browser snapshot` output, but it can understate agent usefulness when the
missing items are mostly static text.

The harness also reports `agentReadiness` scores. These are still based on the
same exact normalized `role:name` matches, but split by agent-facing use:

- `referenceRecall`: how much of the `agent-browser` named output appears in
  `ax-lite`.
- `candidatePrecision`: how much of the `ax-lite` named output appears in
  `agent-browser`.
- `actionableRecall`: exact recall for links, buttons, fields, tabs, and other
  operation targets.
- `navigationRecall`: exact recall for links, headings, landmarks, and search.
- `contentRecall`: exact recall for headings, images, table/list structure, and
  static text.
- `score`: weighted summary for agent parsing: actionable 40%, navigation 25%,
  content 20%, precision 15%.

The default baseline does not force a viewport. A shared viewport can be tested
with `AX_LITE_COMPARE_VIEWPORT=WIDTHxHEIGHT`, but the default run is kept stable
to avoid changing the benchmark shape unexpectedly.

For state-sensitive pages, `AX_LITE_COMPARE_SETUP=path/to/setup.js` evaluates a
setup script in both Puppeteer and `agent-browser` before extraction. This keeps
exact-match scoring intact while making page state explicit.

## Sample Results

| URL | ax-lite nodes | agent-browser lines | named role overlap | action recall | nav recall | content recall | agent score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://example.com` | 4 | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `https://www.wikipedia.org` | 140 | 105 | 0.57 | 0.97 | 1.00 | 0.04 | 0.80 |
| `https://developer.mozilla.org/en-US/docs/Web/Accessibility` | 315 | 286 | 0.56 | 0.74 | 0.89 | 0.15 | 0.68 |
| `https://news.ycombinator.com` | 710 | 501 | 0.75 | 0.82 | 0.82 | 0.63 | 0.78 |
| `https://github.com/features` | 764 | 538 | 0.90 | 0.88 | 0.95 | 0.93 | 0.92 |
| `https://libraries.io/npm/typescript` | 382 | 609 | 0.49 | 0.95 | 0.95 | 0.17 | 0.80 |
| `https://www.npmjs.com/package/typescript` | 16 | 15 | 0.50 | 0.67 | 0.80 | 0.50 | 0.72 |

## Observations

- Simple static pages line up well. `example.com` matched the important named roles exactly.
- Wikipedia exposes a large language `<select>`. `ax-lite` can still unroll options for agent operation, but the comparison harness now disables option unrolling to match `agent-browser snapshot` more closely.
- Wikipedia language links use both visible article-count text and descriptive `title` attributes. `ax-lite` now follows accessible-name priority more closely by using link contents before title fallback.
- MDN uses many custom elements. `ax-lite` now prunes simple custom-element wrappers, but host elements that expose state, ids, or shadow content still need deeper handling.
- MDN ad-like placements can be excluded in comparison mode with `excludeLikelyAds`. The general extractor keeps this off by default so callers do not silently lose content.
- A shared comparison viewport is available through `AX_LITE_COMPARE_VIEWPORT=WIDTHxHEIGHT`, but it is opt-in because responsive pages can change the benchmark shape significantly.
- Hacker News relies on layout tables. The comparison harness normalizes Chrome's `LayoutTableCell` role to `cell` and removes punctuation-adjacent whitespace, improving overlap from 0.64 to 0.75.
- The comparison harness normalizes common role vocabulary differences such as `image` vs `img`, `paragraph` vs `p`, and `StaticText` vs `text`.
- `libraries.io/npm/typescript` is the stable package-registry-like sample.
- The new agent-facing metrics show a different picture than raw overlap on
  Wikipedia and Libraries.io: static-text recall is low, but actionable and
  navigation targets are mostly preserved. That distinction better matches the
  goal of making pages tractable for agents.
- `npmjs.com` currently serves a Cloudflare challenge in the sample environment. The baseline is useful as a challenge-page fixture, not as a package-page content fixture.

## Next Improvements

- Improve custom-element/shadow-host pruning without losing useful selector targets.
- Add explicit benchmark gates for actionable and navigation recall once a
  stable target set is chosen.
- Support authenticated/cached sessions for `npmjs.com` if the real npm package page remains useful as a target.
- Add more real WebView smoke tests once Android/iOS host projects exist.
