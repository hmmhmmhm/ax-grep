# Comparison Baseline

Generated on 2026-06-05.

The comparison harness runs `ax-lite` through Puppeteer and compares named
role output against `agent-browser snapshot`.

## Sample Results

| URL | ax-lite nodes | agent-browser lines | named role overlap |
| --- | ---: | ---: | ---: |
| `https://example.com` | 4 | 3 | 1.00 |
| `https://www.wikipedia.org` | 142 | 105 | 0.59 |
| `https://developer.mozilla.org/en-US/docs/Web/Accessibility` | 341 | 286 | 0.56 |
| `https://news.ycombinator.com` | 713 | 502 | 0.64 |
| `https://github.com/features` | 765 | 538 | 0.90 |
| `https://www.npmjs.com/package/typescript` | 16 | 15 | 0.50 |

## Observations

- Simple static pages line up well. `example.com` matched the important named roles exactly.
- Wikipedia exposes a large language `<select>`. `ax-lite` can still unroll options for agent operation, but the comparison harness now disables option unrolling to match `agent-browser snapshot` more closely.
- Wikipedia language links use both visible article-count text and descriptive `title` attributes. `ax-lite` now follows accessible-name priority more closely by using link contents before title fallback.
- MDN uses many custom elements. `ax-lite` now prunes simple custom-element wrappers, but host elements that expose state, ids, or shadow content still need deeper handling.
- The comparison harness normalizes common role vocabulary differences such as `image` vs `img`, `paragraph` vs `p`, and `StaticText` vs `text`.
- `npmjs.com` currently serves a Cloudflare challenge in the sample environment. The baseline is useful as a challenge-page fixture, not as a package-page content fixture.

## Next Improvements

- Improve custom-element/shadow-host pruning without losing useful selector targets.
- Add a package-registry sample that does not block automated browsers, or support authenticated/cached sessions for `npmjs.com`.
- Add fixture cases for shadow DOM, same-origin iframes, cross-origin iframe placeholders, and dynamic mutation streams.
