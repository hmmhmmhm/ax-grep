# Agent Handoff Loop

`--agent` returns compact JSON with `agent.executor`, `agent.handoff`, `agent.next`,
`pageCheck`, `verification`, and source evidence. Executors can usually switch
only on `agent.executor.decision`.

## Decisions

| Decision | Meaning |
| --- | --- |
| `return` | Read the named payload path and answer from current evidence. |
| `execute` | Run `commandArgs` and inspect the next `ax-grep` payload. |
| `browser` | Open the URL in a live browser and optionally rerun with captured HTML. |
| `stop` | Stop because the page or query cannot be usefully advanced. |

`commandArgs` always starts with `ax-grep`. Callers using `execFile` can pass
`commandArgs.slice(1)` back to the binary.

## Minimal Executor

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentExecutorStep, AgentJsonEnvelope } from "ax-grep";

const execFileAsync = promisify(execFile);

async function runAxGrep(args: string[]): Promise<AgentJsonEnvelope> {
  const { stdout } = await execFileAsync("ax-grep", args);
  return JSON.parse(stdout);
}

async function inspectWithAxGrep(urlOrQuery: string) {
  let payload = await runAxGrep([urlOrQuery, "--agent"]);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const step: AgentExecutorStep = payload.agent.executor;

    if (step.decision === "return") {
      return step.readValue?.value ?? payload;
    }

    if (step.decision === "stop") return payload;

    if (step.decision === "execute" && step.commandArgs) {
      payload = await runAxGrep(step.commandArgs.slice(1));
      continue;
    }

    if (step.decision === "browser") {
      return openInAgentBrowser(step.url);
    }

    throw new Error(step.reason);
  }

  return payload;
}
```

## Output Shape

The full JSON is intentionally compact but can still be large. Read these
fields first:

- `agent.handoff`: shortest next-step instruction.
- `agent.executor`: single-field executor step with command, read, or browser fields.
- `agent.next`: canonical loop payload with command, read target, or browser step.
- `verification`: quickest answer for `--find` checks.
- `pageCheck`: title, evidence, actions, barriers, forms, sources, and metadata.
- `agent.citations` and `agent.answerEvidence`: evidence ready for final answers.

`--agent-brief` keeps `agent.executor` and `agent.handoff` as the primary loop
surface and omits larger planning fields. When there are alternate search
results or source links, brief mode places executable choices on
`agent.handoff.resultChoices` and `agent.handoff.sourceChoices`; each choice
uses raw `commandArgs` so callers can run it without rebuilding a command.

For browser-rendered pages, capture HTML in the agent browser and rerun:

```sh
ax-grep https://example.com --html-file captured.html --agent
cat captured.html | ax-grep https://example.com --stdin --agent
```
