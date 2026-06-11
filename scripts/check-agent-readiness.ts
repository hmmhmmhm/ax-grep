import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

type ReadinessFailure = {
  file: string;
  message: string;
};

type PackageJson = {
  scripts?: Record<string, string>;
};

export function checkAgentReadinessProject(root = process.cwd()): ReadinessFailure[] {
  const failures: ReadinessFailure[] = [];
  const packageJson = readJson<PackageJson>(root, "package.json", failures);
  const scripts = packageJson?.scripts ?? {};

  requireScript(failures, scripts, "check", "tsc --noEmit");
  requireScript(failures, scripts, "compare:gate", "scripts/check-comparison-gates.ts");
  requireScript(failures, scripts, "compare:static:fixtures:gate", "scripts/check-fixture-static-gate.ts");
  requireScript(failures, scripts, "check:processes", "scripts/check-project-processes.ts");
  requireScript(failures, scripts, "readiness:audit", "scripts/check-agent-readiness.ts");

  requireFileIncludes(root, failures, "vitest.config.ts", [
    "fileParallelism: false",
    "maxWorkers: 1",
  ]);
  requireFileIncludes(root, failures, "AGENTS.md", [
    "Do not run project tests, comparison scripts, or browser-backed checks in\n  parallel",
    "After any browser-backed command, verify that no project-owned browser or\n  `agent-browser` process was left behind",
  ]);
  requireFileIncludes(root, failures, "docs/benchmarks.md", [
    "pnpm compare:static:fixtures:gate",
    "pnpm check:processes",
    "uses synthetic\nHTML fixtures only",
  ]);
  requireFileIncludes(root, failures, "docs/comparison-baseline.md", [
    "Operational rule: run comparison suites sequentially",
    "averageCliAgentScore",
    "averageAgentExecutorScore",
    "averageAgentHiddenSignalScore",
  ]);
  requireFileIncludes(root, failures, "docs/agent-readiness.md", [
    "Do not call this objective complete from unit tests alone",
    "Browser-backed comparison suites must run sequentially",
    "process cleanup before and after browser-backed comparison commands",
  ]);
  requireFileIncludes(root, failures, "scripts/check-fixture-static-gate.ts", [
    "agent-fixtures",
    "runStaticComparisons",
    "checkComparisonGateReport",
  ]);
  requireFileIncludes(root, failures, "tests/compare-static-fixture.test.ts", [
    "agent-fixtures",
    "!warning.includes(\"agent-browser\")",
    "checkComparisonGateReport(report)",
  ]);
  requireFileIncludes(root, failures, "tests/process-check.test.ts", [
    "findProjectProcesses",
    "agent-browser",
    "pnpm compare:static:fixtures:gate",
  ]);

  checkReadmeSplit(root, failures);

  return failures;
}

if (isMainModule()) {
  const failures = checkAgentReadinessProject();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.file}: ${failure.message}`);
    }
    process.exit(1);
  }
  console.log("agent-readiness: audit ok");
}

function readJson<T>(root: string, relativePath: string, failures: ReadinessFailure[]): T | undefined {
  const file = join(root, relativePath);
  if (!existsSync(file)) {
    failures.push({ file: relativePath, message: "missing file" });
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (error) {
    failures.push({ file: relativePath, message: `invalid JSON: ${String(error)}` });
    return undefined;
  }
}

function readText(root: string, relativePath: string, failures: ReadinessFailure[]): string | undefined {
  const file = join(root, relativePath);
  if (!existsSync(file)) {
    failures.push({ file: relativePath, message: "missing file" });
    return undefined;
  }
  return readFileSync(file, "utf8");
}

function requireScript(
  failures: ReadinessFailure[],
  scripts: Record<string, string>,
  name: string,
  expectedText: string,
): void {
  const value = scripts[name];
  if (typeof value === "string" && value.includes(expectedText)) return;
  failures.push({
    file: "package.json",
    message: `script ${name} must include ${JSON.stringify(expectedText)}`,
  });
}

function requireFileIncludes(
  root: string,
  failures: ReadinessFailure[],
  relativePath: string,
  requiredTexts: string[],
): void {
  const text = readText(root, relativePath, failures);
  if (typeof text !== "string") return;

  for (const requiredText of requiredTexts) {
    if (text.includes(requiredText)) continue;
    failures.push({
      file: relativePath,
      message: `missing required text ${JSON.stringify(requiredText)}`,
    });
  }
}

function checkReadmeSplit(root: string, failures: ReadinessFailure[]): void {
  const readme = readText(root, "README.md", failures);
  if (typeof readme !== "string") return;

  const lineCount = readme.trimEnd().split(/\r?\n/).length;
  if (lineCount > 80) {
    failures.push({ file: "README.md", message: `README must stay concise, got ${lineCount} lines` });
  }
  if (!readme.includes("./docs/README.md")) {
    failures.push({ file: "README.md", message: "README must link to docs/README.md" });
  }

  requireFileIncludes(root, failures, "docs/README.md", [
    "./cli-agent.md",
    "./agent-handoff.md",
    "./agent-readiness.md",
    "./benchmarks.md",
    "./comparison-baseline.md",
  ]);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  return import.meta.url === pathToFileURL(entrypoint).href;
}
