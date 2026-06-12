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

type SmokeTarget = {
  url: string;
  minLineCount: number;
  requiredNamedRoles: string[];
  minOverlapRatio: number;
  minReadinessScore: number;
  minReferenceRecall: number;
  minActionableRecall: number;
  minNavigationRecall: number;
  requireNoAgentBrowserWarning: boolean;
};

const targets: SmokeTarget[] = [
  {
    url: "https://example.com",
    minLineCount: 2,
    requiredNamedRoles: ["heading:Example Domain", "link:Learn more"],
    minOverlapRatio: 1,
    minReadinessScore: 1,
    minReferenceRecall: 1,
    minActionableRecall: 1,
    minNavigationRecall: 1,
    requireNoAgentBrowserWarning: true,
  },
  {
    url: "https://books.toscrape.com/",
    minLineCount: 500,
    requiredNamedRoles: ["heading:All products", "link:Books to Scrape", "button:Add to basket", "link:next"],
    minOverlapRatio: 0.8,
    minReadinessScore: 0.85,
    minReferenceRecall: 0.8,
    minActionableRecall: 0.85,
    minNavigationRecall: 0.9,
    requireNoAgentBrowserWarning: true,
  },
  {
    url: "https://news.ycombinator.com",
    minLineCount: 500,
    requiredNamedRoles: ["link:Hacker News", "link:new", "link:comments", "link:ask", "link:show", "link:jobs", "link:submit", "link:More"],
    minOverlapRatio: 0.82,
    minReadinessScore: 0.82,
    minReferenceRecall: 0.82,
    minActionableRecall: 0.78,
    minNavigationRecall: 0.78,
    requireNoAgentBrowserWarning: true,
  },
  {
    url: "https://www.gov.uk/foreign-travel-advice",
    minLineCount: 500,
    requiredNamedRoles: ["heading:Foreign travel advice", "textbox:Search for a country or territory - you can sign up for email updates on its page", "link:Afghanistan", "link:USA", "button:Yes this page is useful"],
    minOverlapRatio: 0.9,
    minReadinessScore: 0.9,
    minReferenceRecall: 0.9,
    minActionableRecall: 0.95,
    minNavigationRecall: 0.95,
    requireNoAgentBrowserWarning: true,
  },
];

const result = spawnSync("pnpm", ["compare", ...targets.map((target) => target.url)], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 360_000,
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

const failures: string[] = [];

if (report.comparisons?.length !== targets.length) {
  failures.push(`expected ${targets.length} comparisons, got ${String(report.comparisons?.length)}`);
}

for (const target of targets) {
  const comparison = report.comparisons?.find((item) => item.url === target.url);
  if (!comparison) {
    failures.push(`${target.url}: comparison missing`);
    continue;
  }
  if (!comparison.agentBrowser) failures.push(`${target.url}: agentBrowser snapshot missing`);
  if ((comparison.agentBrowser?.lineCount ?? 0) < target.minLineCount) {
    failures.push(`${target.url}: agentBrowser lineCount below ${target.minLineCount}: ${String(comparison.agentBrowser?.lineCount)}`);
  }
  for (const namedRole of target.requiredNamedRoles) {
    if (!comparison.agentBrowser?.namedRoles?.includes(namedRole)) failures.push(`${target.url}: required named role missing: ${namedRole}`);
  }
  if ((comparison.overlap?.ratio ?? 0) < target.minOverlapRatio) {
    failures.push(`${target.url}: overlap ratio below ${target.minOverlapRatio}: ${String(comparison.overlap?.ratio)}`);
  }
  if ((comparison.agentReadiness?.score ?? 0) < target.minReadinessScore) {
    failures.push(`${target.url}: agent readiness score below ${target.minReadinessScore}: ${String(comparison.agentReadiness?.score)}`);
  }
  if ((comparison.agentReadiness?.referenceRecall ?? 0) < target.minReferenceRecall) {
    failures.push(`${target.url}: reference recall below ${target.minReferenceRecall}: ${String(comparison.agentReadiness?.referenceRecall)}`);
  }
  if ((comparison.agentReadiness?.actionableRecall ?? 0) < target.minActionableRecall) {
    failures.push(`${target.url}: actionable recall below ${target.minActionableRecall}: ${String(comparison.agentReadiness?.actionableRecall)}`);
  }
  if ((comparison.agentReadiness?.navigationRecall ?? 0) < target.minNavigationRecall) {
    failures.push(`${target.url}: navigation recall below ${target.minNavigationRecall}: ${String(comparison.agentReadiness?.navigationRecall)}`);
  }
  if (target.requireNoAgentBrowserWarning && (comparison.warnings ?? []).some((warning) => warning.includes("agent-browser"))) {
    failures.push(`${target.url}: agent-browser warning present: ${(comparison.warnings ?? []).join("; ")}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`agent-browser smoke: ok (${targets.length} targets)`);

function trim(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function extractJsonObject(value: string): string {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object found");
  return value.slice(start, end + 1);
}
