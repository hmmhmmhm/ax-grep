import { spawnSync } from "node:child_process";
import process from "node:process";

type CompareReport = {
  comparisons?: Array<{
    url?: string;
    agentBrowser?: {
      lineCount?: number;
      namedRoles?: string[];
    } | null;
    overlap?: {
      ratio?: number;
    };
    agentReadiness?: {
      score?: number;
      referenceRecall?: number;
      actionableRecall?: number;
      navigationRecall?: number;
    };
    warnings?: string[];
  }>;
};

const targetUrl = "https://example.com";

const result = spawnSync("pnpm", ["compare", targetUrl], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 120_000,
});

if (result.status !== 0) {
  console.error(`agent-browser smoke compare exited ${String(result.status)}: ${trim(result.stderr || result.stdout)}`);
  process.exit(1);
}

let report: CompareReport;
try {
  report = JSON.parse(extractJsonObject(result.stdout)) as CompareReport;
} catch (error) {
  console.error(`agent-browser smoke failed to parse compare output: ${trim(String(error))}`);
  process.exit(1);
}

const comparison = report.comparisons?.[0];
const failures: string[] = [];

if (report.comparisons?.length !== 1) failures.push(`expected one comparison, got ${String(report.comparisons?.length)}`);
if (comparison?.url !== targetUrl) failures.push(`expected url ${targetUrl}, got ${String(comparison?.url)}`);
if (!comparison?.agentBrowser) failures.push("agentBrowser snapshot missing");
if ((comparison?.agentBrowser?.lineCount ?? 0) < 2) failures.push(`agentBrowser lineCount too low: ${String(comparison?.agentBrowser?.lineCount)}`);
if (!comparison?.agentBrowser?.namedRoles?.includes("heading:Example Domain")) failures.push("agentBrowser heading role missing");
if (!comparison?.agentBrowser?.namedRoles?.includes("link:Learn more")) failures.push("agentBrowser link role missing");
if ((comparison?.overlap?.ratio ?? 0) < 1) failures.push(`overlap ratio below 1: ${String(comparison?.overlap?.ratio)}`);
if ((comparison?.agentReadiness?.score ?? 0) < 1) failures.push(`agent readiness score below 1: ${String(comparison?.agentReadiness?.score)}`);
if ((comparison?.agentReadiness?.referenceRecall ?? 0) < 1) failures.push(`reference recall below 1: ${String(comparison?.agentReadiness?.referenceRecall)}`);
if ((comparison?.agentReadiness?.actionableRecall ?? 0) < 1) failures.push(`actionable recall below 1: ${String(comparison?.agentReadiness?.actionableRecall)}`);
if ((comparison?.agentReadiness?.navigationRecall ?? 0) < 1) failures.push(`navigation recall below 1: ${String(comparison?.agentReadiness?.navigationRecall)}`);
if ((comparison?.warnings ?? []).some((warning) => warning.includes("agent-browser"))) {
  failures.push(`agent-browser warning present: ${(comparison?.warnings ?? []).join("; ")}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`${targetUrl}: ${failure}`);
  process.exit(1);
}

console.log("agent-browser smoke: ok (1 target)");

function trim(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function extractJsonObject(value: string): string {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object found");
  return value.slice(start, end + 1);
}
