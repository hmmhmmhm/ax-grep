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
      candidatePrecision?: number;
      actionableRecall?: number;
      navigationRecall?: number;
      contentRecall?: number;
      structuralContentRecall?: number;
      textRecall?: number;
    };
    warnings?: string[];
  }>;
};

const targetUrl = "https://ko.wikipedia.org/wiki/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD";

const result = spawnSync("pnpm", ["compare", targetUrl], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 180_000,
});

if (result.status !== 0) {
  console.error(`agent-browser text-heavy smoke compare exited ${String(result.status)}: ${trim(result.stderr || result.stdout)}`);
  process.exit(1);
}

let report: CompareReport;
try {
  report = JSON.parse(extractJsonObject(result.stdout)) as CompareReport;
} catch (error) {
  console.error(`agent-browser text-heavy smoke failed to parse compare output: ${trim(String(error))}`);
  process.exit(1);
}

const comparison = report.comparisons?.[0];
const failures: string[] = [];

if (report.comparisons?.length !== 1) failures.push(`expected one comparison, got ${String(report.comparisons?.length)}`);
if (comparison?.url !== targetUrl) failures.push(`expected url ${targetUrl}, got ${String(comparison?.url)}`);
if (!comparison?.agentBrowser) failures.push("agentBrowser snapshot missing");
if ((comparison?.agentBrowser?.lineCount ?? 0) < 3000) failures.push(`agentBrowser lineCount too low: ${String(comparison?.agentBrowser?.lineCount)}`);
for (const namedRole of ["heading:대한민국", "link:본문으로 이동", "navigation:목차"]) {
  if (!comparison?.agentBrowser?.namedRoles?.includes(namedRole)) failures.push(`required named role missing: ${namedRole}`);
}
if ((comparison?.overlap?.ratio ?? 0) < 0.4) failures.push(`strict overlap ratio below 0.4: ${String(comparison?.overlap?.ratio)}`);
if ((comparison?.agentReadiness?.score ?? 0) < 0.83) failures.push(`agent readiness score below 0.83: ${String(comparison?.agentReadiness?.score)}`);
if ((comparison?.agentReadiness?.candidatePrecision ?? 0) < 0.8) {
  failures.push(`candidate precision below 0.8: ${String(comparison?.agentReadiness?.candidatePrecision)}`);
}
if ((comparison?.agentReadiness?.actionableRecall ?? 0) < 0.8) {
  failures.push(`actionable recall below 0.8: ${String(comparison?.agentReadiness?.actionableRecall)}`);
}
if ((comparison?.agentReadiness?.navigationRecall ?? 0) < 0.8) {
  failures.push(`navigation recall below 0.8: ${String(comparison?.agentReadiness?.navigationRecall)}`);
}
if ((comparison?.agentReadiness?.structuralContentRecall ?? 0) < 0.85) {
  failures.push(`structural content recall below 0.85: ${String(comparison?.agentReadiness?.structuralContentRecall)}`);
}
if (typeof comparison?.agentReadiness?.textRecall !== "number") failures.push("text recall missing");
if ((comparison?.warnings ?? []).some((warning) => warning.includes("agent-browser"))) {
  failures.push(`agent-browser warning present: ${(comparison?.warnings ?? []).join("; ")}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`${targetUrl}: ${failure}`);
  process.exit(1);
}

console.log("agent-browser text-heavy smoke: ok (1 target)");

function trim(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function extractJsonObject(value: string): string {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object found");
  return value.slice(start, end + 1);
}
