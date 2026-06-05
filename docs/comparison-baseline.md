# Comparison Baseline

Generated on 2026-06-05.

The comparison harness runs `ax-lite` through Puppeteer and compares named
role output against `agent-browser snapshot`.

## Sample Results

| URL | ax-lite nodes | agent-browser lines | named role overlap |
| --- | ---: | ---: | ---: |
| `https://example.com` | 4 | 3 | 1.00 |
| `https://www.wikipedia.org` | 296 | 105 | 0.16 |
| `https://developer.mozilla.org/en-US/docs/Web/Accessibility` | 341 | 286 | 0.42 |

## Observations

- Simple static pages line up well. `example.com` matched the important named roles exactly.
- Wikipedia exposes a large language `<select>`. `ax-lite` currently unrolls options, while `agent-browser snapshot` keeps the compact combobox view. This lowers overlap but is useful for agents that need option values.
- MDN uses many custom elements. `ax-lite` currently preserves unknown custom-element tag names as structural nodes when they carry children; future pruning should reduce noise.
- Chrome/agent-browser role names differ from the package's role vocabulary in a few places, such as `image` vs `img`, `paragraph` vs `p`, and `StaticText` vs `text`.

## Next Improvements

- Add role vocabulary normalization for comparison reports.
- Make option unrolling configurable in comparison mode.
- Prune unknown custom elements that only wrap semantic descendants.
- Add fixture cases for shadow DOM, same-origin iframes, cross-origin iframe placeholders, and dynamic mutation streams.
