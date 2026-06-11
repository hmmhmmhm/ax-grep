# Agent Instructions

## Resource Safety

- Do not run project tests, comparison scripts, or browser-backed checks in
  parallel. Use one command at a time.
- Treat sequential execution as mandatory. A prior multi-agent/browser run
  exhausted the host and blocked external connections for hours.
- Treat `agent-browser`, Playwright, Puppeteer, Chromium, and Chrome as scarce
  host resources. Before starting a browser-backed command, check for existing
  processes if there is any chance another run is active.
- After any browser-backed command, verify that no project-owned browser or
  `agent-browser` process was left behind.
- If a comparison command needs multiple target sets, run them sequentially.
  Never start several `compare:static*` commands at once.
- Do not leave long-running benchmark, test, or browser sessions active when
  handing work back to the user.

## Validation

- Prefer narrow non-browser checks first, such as `pnpm exec tsc --noEmit` and
  focused Vitest files.
- Full `pnpm test -- --run` is configured for single-worker execution. If a
  browser hook times out, rerun the specific file once with a larger hook
  timeout instead of starting another full suite in parallel.
