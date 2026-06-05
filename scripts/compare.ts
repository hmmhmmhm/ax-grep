import { spawnSync } from "node:child_process";
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
  warnings: string[];
};

type NormalizedSummary = {
  roleCounts: Record<string, number>;
  namedRoles: string[];
};

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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {
      warnings.push("Puppeteer network idle timed out; used DOMContentLoaded state");
    });

    const tree = await page.evaluate(
      createExtractorScript({
        mode: "compact",
        includeBounds: false,
        includeTextNodes: false,
        includeSelectOptions: false,
      }),
    ) as SemanticNode;
    const axLite = summarizeSemanticTree(tree);
    const axLiteNormalized = normalizeNamedRoles(axLite.namedRoles);
    const agentBrowser = runAgentBrowserSnapshot(url, `ax-lite-compare-${Date.now()}-${index}`, warnings);
    const agentNamedRoles = new Set(agentBrowser?.normalized.namedRoles ?? []);
    const matches = axLiteNormalized.namedRoles.filter((item) => agentNamedRoles.has(item)).length;
    const namedRoleTotal = Math.max(axLiteNormalized.namedRoles.length, agentBrowser?.normalized.namedRoles.length ?? 0);

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

  const open = spawnSync(agentBrowserBin, ["--session", session, "open", url], {
    encoding: "utf8",
    timeout: 45_000,
  });
  if (open.status !== 0) {
    warnings.push(`agent-browser open failed: ${trimError(open.stderr || open.stdout)}`);
    return null;
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
  const normalizedRoles = namedRoles.map((item) => {
    const [role = "unknown", ...nameParts] = item.split(":");
    return `${normalizeRole(role)}:${normalizeName(nameParts.join(":"))}`;
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

function normalizeRole(role: string): string {
  const key = role.toLowerCase();
  const aliases: Record<string, string> = {
    descriptionlist: "list",
    definition: "definition",
    disclosuretriangle: "button",
    image: "img",
    labeltext: "text",
    linebreak: "text",
    paragraph: "p",
    statictext: "text",
    term: "term",
  };
  return aliases[key] ?? key;
}

function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/\s+\(external\)$/i, "")
    .trim()
    .toLowerCase();
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
