import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenReadmeFragments = [
  '"gateSummary"',
  '"comparisons"',
  '"generatedAt"',
  "Total output lines",
  "\uFFFD",
  "\u00EC",
  "\u00EB",
  "\u00ED",
  "\u00EA",
];

describe("README", () => {
  it("stays concise and avoids generated or mojibake content", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    const lines = readme.split(/\r?\n/);
    expect(lines.length).toBeLessThan(120);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(140);
    for (const fragment of forbiddenReadmeFragments) {
      expect(readme).not.toContain(fragment);
    }

    expect(readme).toContain("[Agent handoff loop](./docs/agent-handoff.md)");
    expect(readme).not.toContain("## Compact JSON Example");
  });

  it("keeps the agent continuation contract in docs", async () => {
    const handoff = await readFile(join(process.cwd(), "docs", "agent-handoff.md"), "utf8");

    expect(handoff).toContain("Executors can usually switch");
    expect(handoff).toContain("only on `agent.executor.decision`");
    expect(handoff).toContain("const step: AgentExecutorStep = payload.agent.executor");
    expect(handoff).toContain("commandArgs.slice(1)");
    expect(handoff).toContain("sourceLinkRef");
  });

  it("keeps agent-readiness evidence outside the root README", async () => {
    const docsIndex = await readFile(join(process.cwd(), "docs", "README.md"), "utf8");
    const readiness = await readFile(join(process.cwd(), "docs", "agent-readiness.md"), "utf8");

    expect(docsIndex).toContain("[agent-readiness.md](./agent-readiness.md)");
    expect(readiness).toContain("Evidence Map");
    expect(readiness).toContain("Completion Gate");
    expect(readiness).toContain("Browser-backed comparison suites must run sequentially");
  });
});
