import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkAgentReadinessProject, collectAgentReadinessEvidence } from "../scripts/check-agent-readiness";

describe("agent readiness audit", () => {
  it("accepts the current project wiring", () => {
    expect(checkAgentReadinessProject()).toEqual([]);
  });

  it("tracks explicit evidence for the agent readiness requirements", () => {
    const checks = collectAgentReadinessEvidence();
    expect(checks.map((check) => check.id)).toEqual([
      "resource-safety",
      "browser-session-cleanup",
      "fixture-loop-coverage",
      "real-page-smoke",
      "declarative-shadow-static",
      "agent-browser-smoke",
      "agent-browser-text-heavy-smoke",
      "per-target-gates",
      "weak-target-diagnostics",
      "executable-agent-continuations",
      "count-shortcuts",
      "brief-generic-choice-routing",
      "semantic-state-text-parity",
      "browser-fallback-command-text",
      "public-type-shortcuts",
      "readme-doc-split",
      "progress-tracker-current",
    ]);
    expect(checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("rejects missing safety and completion wiring", () => {
    const root = makeMinimalProject();
    writeFileSync(join(root, "package.json"), JSON.stringify({
      scripts: {
        check: "tsc --noEmit",
        "compare:gate": "tsx scripts/check-comparison-gates.ts",
        "compare:static:fixtures:gate": "tsx scripts/check-fixture-static-gate.ts",
        "check:processes": "tsx scripts/check-project-processes.ts",
      },
    }));

    const failures = checkAgentReadinessProject(root).map((failure) => failure.message);

    expect(failures).toContain("script readiness:audit must include \"scripts/check-agent-readiness.ts\"");
  });
});

function makeMinimalProject(): string {
  const root = join(tmpdir(), `ax-grep-readiness-${process.pid}-${Date.now()}`);
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });

  writeFileSync(join(root, "README.md"), "# ax-grep\n\n[Docs](./docs/README.md)\n");
  writeFileSync(join(root, "docs", "README.md"), [
    "- ./cli-agent.md",
    "- ./agent-handoff.md",
    "- ./agent-readiness.md",
    "- ./benchmarks.md",
    "- ./comparison-baseline.md",
  ].join("\n"));
  writeFileSync(join(root, "vitest.config.ts"), "fileParallelism: false\nmaxWorkers: 1\n");
  writeFileSync(join(root, "AGENTS.md"), [
    "Do not run project tests, comparison scripts, or browser-backed checks in",
    "  parallel",
    "After any browser-backed command, verify that no project-owned browser or",
    "  `agent-browser` process was left behind",
  ].join("\n"));
  writeFileSync(join(root, "docs", "benchmarks.md"), [
    "pnpm compare:static:fixtures:gate",
    "pnpm check:processes",
    "uses synthetic",
    "HTML fixtures only",
  ].join("\n"));
  writeFileSync(join(root, "docs", "comparison-baseline.md"), [
    "Operational rule: run comparison suites sequentially",
    "averageCliAgentScore",
    "averageAgentExecutorScore",
    "averageAgentHiddenSignalScore",
    "averageAgentHiddenCommandShortcutScore",
  ].join("\n"));
  writeFileSync(join(root, "docs", "agent-readiness.md"), [
    "Do not call this objective complete from unit tests alone",
    "Browser-backed comparison suites must run sequentially",
    "process cleanup before and after browser-backed comparison commands",
  ].join("\n"));
  writeFileSync(join(root, "scripts", "check-fixture-static-gate.ts"), [
    "agent-fixtures",
    "runStaticComparisons",
    "checkComparisonGateReport",
  ].join("\n"));
  writeFileSync(join(root, "tests", "compare-static-fixture.test.ts"), [
    "agent-fixtures",
    "!warning.includes(\"agent-browser\")",
    "checkComparisonGateReport(report)",
  ].join("\n"));
  writeFileSync(join(root, "tests", "process-check.test.ts"), [
    "findProjectProcesses",
    "agent-browser",
    "pnpm compare:static:fixtures:gate",
  ].join("\n"));

  return root;
}
