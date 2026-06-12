import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import puppeteer from "puppeteer";
import {
  createExtractorScript,
  flattenSemanticTree,
  summarizeSemanticTree,
  type SemanticNode,
} from "../src/index";

type Comparison = {
  url: string;
  axLite: ReturnType<typeof summarizeSemanticTree>;
  axLiteNormalized: NormalizedSummary;
  agentBrowser: {
    lineCount: number;
    roleCounts: Record<string, number>;
    namedRoles: string[];
    normalized: NormalizedSummary;
  } | null;
  overlap: {
    namedRoleMatches: number;
    namedRoleTotal: number;
    ratio: number;
  };
  agentReadiness: AgentReadinessScores;
  warnings: string[];
};

type NormalizedSummary = {
  roleCounts: Record<string, number>;
  namedRoles: string[];
};

type AgentReadinessScores = {
  referenceRecall: number;
  candidatePrecision: number;
  f1: number;
  actionableRecall: number;
  navigationRecall: number;
  contentRecall: number;
  score: number;
};

const comparisonViewport = parseViewport(process.env.AX_LITE_COMPARE_VIEWPORT);
const comparisonSetupScript = readSetupScript(process.env.AX_LITE_COMPARE_SETUP);
const actionableRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);
const navigationRoles = new Set([
  "article",
  "banner",
  "complementary",
  "contentinfo",
  "heading",
  "link",
  "main",
  "navigation",
  "region",
  "search",
]);
const contentRoles = new Set([
  "cell",
  "columnheader",
  "definition",
  "heading",
  "img",
  "list",
  "listitem",
  "p",
  "row",
  "rowheader",
  "table",
  "term",
  "text",
]);

const urls = process.argv.slice(2);
const targets = urls.length > 0
  ? urls
  : ["https://example.com", "https://www.wikipedia.org"];

const browser = await puppeteer.launch({ headless: true });
const comparisons: Comparison[] = [];

for (const [index, url] of targets.entries()) {
  const page = await browser.newPage();
  const warnings: string[] = [];
  try {
    if (comparisonViewport) await page.setViewport(comparisonViewport);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (comparisonSetupScript) {
      await page.evaluate(comparisonSetupScript);
    }
    await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {
      warnings.push("Puppeteer network idle timed out; used DOMContentLoaded state");
    });

    const tree = await page.evaluate(
      createExtractorScript({
        mode: "compact",
        includeBounds: false,
        includeTextNodes: false,
        includeSelectOptions: false,
        excludeLikelyAds: true,
      }),
    ) as SemanticNode;
    const axLite = summarizeSemanticTree(tree);
    const axLiteNormalized = normalizeNamedRoles(axLite.namedRoles);
    const agentBrowser = runAgentBrowserSnapshot(url, `ax-grep-compare-${Date.now()}-${index}`, warnings);
    const agentNamedRoles = new Set(agentBrowser?.normalized.namedRoles ?? []);
    const matches = axLiteNormalized.namedRoles.filter((item) => agentNamedRoles.has(item)).length;
    const namedRoleTotal = Math.max(axLiteNormalized.namedRoles.length, agentBrowser?.normalized.namedRoles.length ?? 0);
    const agentReadiness = scoreAgentReadiness(axLiteNormalized, agentBrowser?.normalized ?? emptyNormalizedSummary());

    comparisons.push({
      url,
      axLite,
      axLiteNormalized,
      agentBrowser,
      overlap: {
        namedRoleMatches: matches,
        namedRoleTotal,
        ratio: namedRoleTotal === 0 ? 1 : matches / namedRoleTotal,
      },
      agentReadiness,
      warnings,
    });

    printTreeSample(url, tree);
  } finally {
    await page.close();
  }
}

await browser.close();

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), comparisons }, null, 2));

function runAgentBrowserSnapshot(
  url: string,
  session: string,
  warnings: string[],
): Comparison["agentBrowser"] {
  const agentBrowserBin = resolveAgentBrowserBin();
  if (!agentBrowserBin) {
    warnings.push("agent-browser binary was not found; skipped reference snapshot");
    return null;
  }

  if (comparisonViewport) {
    const viewport = spawnSync(agentBrowserBin, [
      "--session",
      session,
      "set",
      "viewport",
      String(comparisonViewport.width),
      String(comparisonViewport.height),
    ], {
      encoding: "utf8",
      timeout: 15_000,
    });
    if (viewport.status !== 0) {
      warnings.push(`agent-browser viewport setup failed: ${trimError(viewport.stderr || viewport.stdout)}`);
    }
  }

  const open = spawnSync(agentBrowserBin, ["--session", session, "open", url], {
    encoding: "utf8",
    timeout: 45_000,
  });
  if (open.status !== 0) {
    warnings.push(`agent-browser open failed: ${trimError(open.stderr || open.stdout)}`);
    return null;
  }

  if (comparisonSetupScript) {
    const setup = spawnSync(agentBrowserBin, ["--session", session, "eval", comparisonSetupScript], {
      encoding: "utf8",
      timeout: 15_000,
    });
    if (setup.status !== 0) {
      warnings.push(`agent-browser setup script failed: ${trimError(setup.stderr || setup.stdout)}`);
    }
  }

  const snapshot = spawnSync(agentBrowserBin, ["--session", session, "snapshot", "-c", "-d", "8"], {
    encoding: "utf8",
    timeout: 45_000,
  });
  spawnSync(agentBrowserBin, ["--session", session, "close"], { encoding: "utf8", timeout: 10_000 });

  if (snapshot.status !== 0) {
    warnings.push(`agent-browser snapshot failed: ${trimError(snapshot.stderr || snapshot.stdout)}`);
    return null;
  }

  return parseAgentBrowserSnapshot(snapshot.stdout);
}

function parseAgentBrowserSnapshot(output: string): NonNullable<Comparison["agentBrowser"]> {
  const roleCounts: Record<string, number> = {};
  const namedRoles: string[] = [];
  const contentLines = output
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- "));

  for (const line of contentLines) {
    const trimmed = line.trim().replace(/^- /, "");
    const role = trimmed.split(/\s+/)[0] ?? "unknown";
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    const name = trimmed.match(/^[a-zA-Z0-9_-]+\s+"([^"]+)"/)?.[1];
    if (name) namedRoles.push(`${role}:${name}`);
  }

  return {
    lineCount: contentLines.length,
    roleCounts,
    namedRoles,
    normalized: normalizeNamedRoles(namedRoles),
  };
}

function normalizeNamedRoles(namedRoles: string[]): NormalizedSummary {
  const normalizedRoles = namedRoles.flatMap((item) => {
    const [role = "unknown", ...nameParts] = item.split(":");
    const normalized = `${normalizeRole(role)}:${normalizeName(nameParts.join(":"))}`;
    return isComparableNamedRole(normalized) ? [normalized] : [];
  });
  const roleCounts: Record<string, number> = {};
  for (const item of normalizedRoles) {
    const role = item.split(":")[0] ?? "unknown";
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  }
  return {
    roleCounts,
    namedRoles: Array.from(new Set(normalizedRoles)),
  };
}

function isComparableNamedRole(item: string): boolean {
  const [role = "unknown", ...nameParts] = item.split(":");
  const name = nameParts.join(":");
  if (!name) return false;
  if (role !== "text") return true;
  return !/^(?:\\[nrt]\s*)+$/.test(name)
    && !/^[|/\\\-–—·•,.;:()[\]{}]+$/.test(name);
}

function emptyNormalizedSummary(): NormalizedSummary {
  return {
    roleCounts: {},
    namedRoles: [],
  };
}

function scoreAgentReadiness(candidate: NormalizedSummary, reference: NormalizedSummary): AgentReadinessScores {
  const candidateSet = new Set(candidate.namedRoles);
  const referenceSet = new Set(reference.namedRoles);
  const matches = candidate.namedRoles.filter((item) => referenceSet.has(item)).length;
  const referenceRecall = ratio(matches, reference.namedRoles.length, 1);
  const candidatePrecision = ratio(matches, candidate.namedRoles.length, 1);
  const f1 = referenceRecall + candidatePrecision === 0
    ? 0
    : (2 * referenceRecall * candidatePrecision) / (referenceRecall + candidatePrecision);
  const actionableRecall = categoryRecall(candidateSet, reference.namedRoles, actionableRoles);
  const navigationRecall = categoryRecall(candidateSet, reference.namedRoles, navigationRoles);
  const contentRecall = categoryRecall(candidateSet, reference.namedRoles, contentRoles);

  return {
    referenceRecall: roundScore(referenceRecall),
    candidatePrecision: roundScore(candidatePrecision),
    f1: roundScore(f1),
    actionableRecall: roundScore(actionableRecall),
    navigationRecall: roundScore(navigationRecall),
    contentRecall: roundScore(contentRecall),
    score: roundScore(
      actionableRecall * 0.4
      + navigationRecall * 0.25
      + contentRecall * 0.2
      + candidatePrecision * 0.15
    ),
  };
}

function categoryRecall(candidateSet: Set<string>, referenceNamedRoles: string[], roles: Set<string>): number {
  const referenceItems = referenceNamedRoles.filter((item) => roles.has(roleFromNamedRole(item)));
  const matches = referenceItems.filter((item) => candidateSet.has(item)).length;
  return ratio(matches, referenceItems.length, 1);
}

function roleFromNamedRole(item: string): string {
  return item.split(":")[0] ?? "unknown";
}

function ratio(numerator: number, denominator: number, emptyValue = 0): number {
  return denominator === 0 ? emptyValue : numerator / denominator;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeRole(role: string): string {
  const key = role.toLowerCase();
  const aliases: Record<string, string> = {
    descriptionlist: "list",
    definition: "definition",
    disclosuretriangle: "button",
    iframe: "iframe",
    image: "img",
    labeltext: "text",
    layouttable: "table",
    layouttablecell: "cell",
    layouttablerow: "row",
    linebreak: "text",
    paragraph: "p",
    statictext: "text",
    term: "term",
  };
  return aliases[key] ?? key;
}

function normalizeName(name: string): string {
  const normalized = name
    .replace(/[\uE000-\uF8FF]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+\(external\)$/i, "")
    .replace(/\s+([|),])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/^[·•ㆍ]\s*/g, "")
    .replace(/^\d+(?:\.\d+)*\s+(?=\p{L})/u, "")
    .replace(/^20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}時\d{1,2}分\s+話題度:\d+\s*\d+レス\s+/, "")
    .replace(/\s+thumbnail$/i, "")
    .replace(/\s*[⌄▾▼]\s*$/g, "")
    .replace(/(?<=\d)\s+(?=\p{L})/gu, "")
    .trim()
    .toLowerCase();
  return normalizeDigitSeparators(normalized);
}

function normalizeDigitSeparators(value: string): string {
  return value.replace(/(?<=\d)[\s,.\u202f\u00a0]+(?=\d{3}\b)/g, "");
}

function resolveAgentBrowserBin(): string | null {
  const local = new URL("../node_modules/.bin/agent-browser", import.meta.url);
  const localPath = local.pathname;
  const localCheck = spawnSync("test", ["-x", localPath]);
  if (localCheck.status === 0) return localPath;

  const globalCheck = spawnSync("which", ["agent-browser"], { encoding: "utf8" });
  if (globalCheck.status === 0) return globalCheck.stdout.trim();
  return null;
}

function printTreeSample(url: string, tree: SemanticNode): void {
  const flat = flattenSemanticTree(tree)
    .filter((node) => node.role && node.name)
    .slice(0, 12)
    .map((node) => `${normalizeRole(node.role ?? "")}:${node.name}`);
  console.error(`\n${url}`);
  console.error(flat.join("\n"));
}

function trimError(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function parseViewport(value: string | undefined): { width: number; height: number } | null {
  if (!value) return null;
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error(`Invalid AX_LITE_COMPARE_VIEWPORT '${value}'. Expected WIDTHxHEIGHT, for example 1365x900.`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function readSetupScript(path: string | undefined): string | null {
  if (!path) return null;
  return readFileSync(path, "utf8");
}
