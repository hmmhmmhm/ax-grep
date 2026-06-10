import { readFileSync } from "node:fs";
import process from "node:process";

type GateSummary = Record<string, unknown> & {
  included?: number;
  excluded?: number;
  averageAgentExecutorScore?: number;
  averageAgentHandoffScore?: number;
  averageAgentBrowserAdvantageScore?: number;
  averageAgentActionListScore?: number;
  averageAgentSearchDecisionScore?: number;
  averageAgentPageDecisionScore?: number;
  averageAgentToBrowserTokenRatio?: number;
  excludedThinBrowserReference?: number;
  classifications?: Record<string, number>;
};

type ComparisonReport = {
  generatedAt?: string;
  gateSummary?: GateSummary;
  comparisons?: unknown[];
};

type GateFailure = {
  file: string;
  message: string;
};

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: pnpm compare:gate <comparison-json> [...]");
  process.exit(2);
}

const failures = files.flatMap((file) => checkReport(file, readReport(file)));
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.file}: ${failure.message}`);
  }
  process.exit(1);
}

for (const file of files) {
  const summary = readReport(file).gateSummary;
  const included = typeof summary?.included === "number" ? summary.included : 0;
  console.log(`${file}: gate ok (${included} included)`);
}

function readReport(file: string): ComparisonReport {
  const text = readFileSync(file, "utf8");
  const jsonStart = text.indexOf('{\n  "generatedAt"');
  const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
  return JSON.parse(jsonText) as ComparisonReport;
}

function checkReport(file: string, report: ComparisonReport): GateFailure[] {
  const summary = report.gateSummary;
  if (!summary) return [{ file, message: "missing gateSummary" }];
  if (typeof summary.averageAgentExecutorScore === "number") return checkStaticGate(file, summary);
  if (typeof summary.averageAgentToBrowserTokenRatio === "number") return checkTokenGate(file, summary);
  return [{ file, message: "unknown comparison report type" }];
}

function checkStaticGate(file: string, summary: GateSummary): GateFailure[] {
  const failures: GateFailure[] = [];
  requireAtLeast(file, failures, "included", summary.included, 1);
  requireAtLeast(file, failures, "averageAgentExecutorScore", summary.averageAgentExecutorScore, 0.995);
  requireAtLeast(file, failures, "averageAgentHandoffScore", summary.averageAgentHandoffScore, 0.995);
  requireAtLeast(file, failures, "averageAgentBrowserAdvantageScore", summary.averageAgentBrowserAdvantageScore, 0.995);
  requireAtLeast(file, failures, "averageAgentActionListScore", summary.averageAgentActionListScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSearchDecisionScore", summary.averageAgentSearchDecisionScore, 0.995);
  requireAtLeast(file, failures, "averageAgentPageDecisionScore", summary.averageAgentPageDecisionScore, 0.995);
  const classifications = summary.classifications ?? {};
  requireEqual(file, failures, "classifications.over-collected", classifications["over-collected"], 0);
  requireEqual(file, failures, "classifications.challenge", classifications.challenge, 0);
  requireEqual(file, failures, "classifications.shell", classifications.shell, 0);
  return failures;
}

function checkTokenGate(file: string, summary: GateSummary): GateFailure[] {
  const failures: GateFailure[] = [];
  requireAtLeast(file, failures, "included", summary.included, 1);
  requireAtMost(file, failures, "averageAgentToBrowserTokenRatio", summary.averageAgentToBrowserTokenRatio, 1);
  if (typeof summary.excludedThinBrowserReference !== "number") {
    failures.push({ file, message: "missing excludedThinBrowserReference" });
  }
  return failures;
}

function requireAtLeast(file: string, failures: GateFailure[], field: string, value: unknown, minimum: number): void {
  if (typeof value === "number" && value >= minimum) return;
  failures.push({ file, message: `${field} expected >= ${minimum}, got ${formatValue(value)}` });
}

function requireAtMost(file: string, failures: GateFailure[], field: string, value: unknown, maximum: number): void {
  if (typeof value === "number" && value <= maximum) return;
  failures.push({ file, message: `${field} expected <= ${maximum}, got ${formatValue(value)}` });
}

function requireEqual(file: string, failures: GateFailure[], field: string, value: unknown, expected: number): void {
  if (value === expected) return;
  failures.push({ file, message: `${field} expected ${expected}, got ${formatValue(value)}` });
}

function formatValue(value: unknown): string {
  return typeof value === "undefined" ? "undefined" : JSON.stringify(value);
}
