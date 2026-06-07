import { spawnSync } from "node:child_process";
import process from "node:process";
import { Readable } from "node:stream";
import { extract } from "../src/static";
import { flattenSemanticTree, summarizeSemanticTree, type SemanticNode } from "../src/index";
import { runCli } from "../src/cli";
import { resolveBenchmarkTargets, type BenchmarkTarget } from "./benchmark-targets";

type NormalizedSummary = {
  roleCounts: Record<string, number>;
  namedRoles: string[];
};

type StaticComparison = {
  category: string;
  url: string;
  gate: {
    included: boolean;
    reason?: string;
  };
  classification: StaticClassification;
  fetch: {
    status: number;
    htmlBytes: number;
    source: "fetch" | "agent-browser-rendered";
  };
  static: ReturnType<typeof summarizeSemanticTree>;
  staticNormalized: NormalizedSummary;
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
  agentReadiness: {
    referenceRecall: number;
    candidatePrecision: number;
    f1: number;
    actionableRecall: number;
    navigationRecall: number;
    contentRecall: number;
    score: number;
  };
  cliAgentSummary: CliAgentSummary;
  warnings: string[];
};

type CliAgentSummary = {
  ok: boolean;
  kind: string;
  pageCheck: {
    confidence: "low" | "medium" | "high";
    contentPreviewCount: number;
    contentLength: number;
    primaryLinkCount: number;
    actionCount: number;
  };
  searchResultCount: number;
  suggestedActionCount: number;
  score: number;
};

type StaticClassification = "usable" | "needs-browser" | "challenge" | "shell" | "over-collected" | "reference-challenge" | "reference-missing" | "volatile";

type GateSummary = {
  included: number;
  excluded: number;
  averageScore: number;
  averageCliAgentScore: number;
  averagePrecision: number;
  averageReferenceRecall: number;
  classifications: Record<StaticClassification, number>;
};

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
const navigationRoles = new Set(["article", "banner", "complementary", "contentinfo", "heading", "link", "main", "navigation", "region", "search"]);
const contentRoles = new Set(["cell", "columnheader", "definition", "heading", "img", "list", "listitem", "p", "row", "rowheader", "table", "term", "text"]);

const targets = resolveBenchmarkTargets(process.argv.slice(2), ["https://example.com", "https://www.wikipedia.org"]);
const comparisons: StaticComparison[] = [];

for (const [index, target] of targets.entries()) {
  const warnings: string[] = [];
  const { html, source, status, agentBrowser: renderedAgentBrowser } = await fetchOrRenderHtml(target.url, `ax-grep-static-html-${Date.now()}-${index}`, warnings);

  const tree = extract(html, {
    mode: "compact",
    excludeLikelyAds: true,
    excludeLikelyBoilerplate: target.excludeLikelyBoilerplate === true,
    includeAttributes: false,
    includeSelectOptions: false,
    includeTextNodes: false,
    ...(target.maxChildrenPerNode === undefined ? {} : { maxChildrenPerNode: target.maxChildrenPerNode }),
    ...(target.maxLinkFarmChildren === undefined ? {} : { maxLinkFarmChildren: target.maxLinkFarmChildren }),
  });
  const staticSummary = summarizeSemanticTree(tree);
  const staticNormalized = normalizeNamedRoles(staticSummary.namedRoles);
  const agentBrowser = renderedAgentBrowser ?? runAgentBrowserSnapshot(target.url, `ax-grep-static-${Date.now()}-${index}`, warnings);
  const agentNamedRoles = new Set(agentBrowser?.normalized.namedRoles ?? []);
  const matches = staticNormalized.namedRoles.filter((item) => agentNamedRoles.has(item)).length;
  const namedRoleTotal = Math.max(staticNormalized.namedRoles.length, agentBrowser?.normalized.namedRoles.length ?? 0);

  const agentReadiness = scoreAgentReadiness(staticNormalized, agentBrowser?.normalized ?? emptyNormalizedSummary());
  const cliAgentSummary = await summarizeCliAgentOutput(target.url, html, warnings);
  const comparison: StaticComparison = {
    category: target.category,
    url: target.url,
    gate: gateInfo(target),
    classification: "usable",
    fetch: {
      status,
      htmlBytes: new TextEncoder().encode(html).length,
      source,
    },
    static: staticSummary,
    staticNormalized,
    agentBrowser,
    overlap: {
      namedRoleMatches: matches,
      namedRoleTotal,
      ratio: namedRoleTotal === 0 ? 1 : matches / namedRoleTotal,
    },
    agentReadiness,
    cliAgentSummary,
    warnings,
  };
  comparison.classification = classifyComparison(comparison);
  comparisons.push(comparison);

  printTreeSample(target.url, tree);
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), gateSummary: summarizeGate(comparisons), comparisons }, null, 2));

async function fetchOrRenderHtml(
  url: string,
  session: string,
  warnings: string[],
): Promise<{ html: string; source: "fetch" | "agent-browser-rendered"; status: number; agentBrowser?: StaticComparison["agentBrowser"] }> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "ax-grep-static/0.1 (+https://github.com/hmmhmmhm/ax-grep)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  if (!response.ok) warnings.push(`fetch returned HTTP ${response.status}`);
  if (response.ok && !looksLikeChallenge(html)) return { html, source: "fetch", status: response.status };

  const rendered = runAgentBrowserHtml(url, session, warnings);
  return rendered ? { html: rendered.html, source: "agent-browser-rendered", status: response.status, agentBrowser: rendered.agentBrowser } : { html, source: "fetch", status: response.status };
}

function runAgentBrowserSnapshot(
  url: string,
  session: string,
  warnings: string[],
): StaticComparison["agentBrowser"] {
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

function runAgentBrowserHtml(url: string, session: string, warnings: string[]): { html: string; agentBrowser: StaticComparison["agentBrowser"] } | null {
  const agentBrowserBin = resolveAgentBrowserBin();
  if (!agentBrowserBin) {
    warnings.push("agent-browser binary was not found; kept fetched HTML");
    return null;
  }

  const open = spawnSync(agentBrowserBin, ["--session", session, "open", url], {
    encoding: "utf8",
    timeout: 45_000,
  });
  if (open.status !== 0) {
    warnings.push(`agent-browser rendered HTML open failed: ${trimError(open.stderr || open.stdout)}`);
    return null;
  }

  spawnSync(agentBrowserBin, ["--session", session, "wait", "3000"], { encoding: "utf8", timeout: 10_000 });
  const rendered = spawnSync(agentBrowserBin, ["--session", session, "eval", "document.documentElement.outerHTML"], {
    encoding: "utf8",
    timeout: 45_000,
  });
  const snapshot = spawnSync(agentBrowserBin, ["--session", session, "snapshot", "-c", "-d", "8"], {
    encoding: "utf8",
    timeout: 45_000,
  });
  spawnSync(agentBrowserBin, ["--session", session, "close"], { encoding: "utf8", timeout: 10_000 });

  if (rendered.status !== 0 && !looksLikeHtml(rendered.stdout)) {
    warnings.push(`agent-browser rendered HTML eval failed: ${trimError(rendered.stderr || rendered.stdout)}`);
    return null;
  }
  const agentBrowser = snapshot.status === 0 ? parseAgentBrowserSnapshot(snapshot.stdout) : null;
  if (snapshot.status !== 0) warnings.push(`agent-browser rendered snapshot failed: ${trimError(snapshot.stderr || snapshot.stdout)}`);
  warnings.push("used agent-browser rendered HTML fallback");
  return {
    html: decodeAgentBrowserEvalHtml(rendered.stdout),
    agentBrowser,
  };
}

function parseAgentBrowserSnapshot(output: string): NonNullable<StaticComparison["agentBrowser"]> {
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

function emptyNormalizedSummary(): NormalizedSummary {
  return {
    roleCounts: {},
    namedRoles: [],
  };
}

function scoreAgentReadiness(candidate: NormalizedSummary, reference: NormalizedSummary): StaticComparison["agentReadiness"] {
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

async function summarizeCliAgentOutput(url: string, html: string, warnings: string[]): Promise<CliAgentSummary> {
  const stdout = createMemoryWriter();
  const stderr = createMemoryWriter();
  const status = await runCli([url, "--stdin", "--json"], {
    stdout,
    stderr,
    stdin: Readable.from([html]) as NodeJS.ReadStream,
    fetch: async () => {
      throw new Error("compare-static should pass HTML through stdin");
    },
  });
  if (status !== 0) warnings.push(`ax-grep CLI summary exited ${status}: ${trimError(stderr.output || stdout.output)}`);
  try {
    return summarizeCliEnvelope(JSON.parse(stdout.output));
  } catch (error) {
    warnings.push(`ax-grep CLI summary parse failed: ${trimError(error)}`);
    return emptyCliAgentSummary();
  }
}

function summarizeCliEnvelope(envelope: unknown): CliAgentSummary {
  const item = envelope as {
    ok?: boolean;
    kind?: string;
    pageCheck?: {
      confidence?: "low" | "medium" | "high";
      contentPreview?: unknown[];
      contentLength?: number;
      primaryLinks?: unknown[];
      actions?: unknown[];
    };
    searchResults?: unknown[];
    suggestedActions?: unknown[];
  };
  const confidence = item.pageCheck?.confidence ?? "low";
  const summary: CliAgentSummary = {
    ok: item.ok === true,
    kind: item.kind ?? "unknown",
    pageCheck: {
      confidence,
      contentPreviewCount: item.pageCheck?.contentPreview?.length ?? 0,
      contentLength: item.pageCheck?.contentLength ?? 0,
      primaryLinkCount: item.pageCheck?.primaryLinks?.length ?? 0,
      actionCount: item.pageCheck?.actions?.length ?? 0,
    },
    searchResultCount: item.searchResults?.length ?? 0,
    suggestedActionCount: item.suggestedActions?.length ?? 0,
    score: 0,
  };
  summary.score = scoreCliAgentSummary(summary);
  return summary;
}

function emptyCliAgentSummary(): CliAgentSummary {
  return {
    ok: false,
    kind: "unknown",
    pageCheck: {
      confidence: "low",
      contentPreviewCount: 0,
      contentLength: 0,
      primaryLinkCount: 0,
      actionCount: 0,
    },
    searchResultCount: 0,
    suggestedActionCount: 0,
    score: 0,
  };
}

function scoreCliAgentSummary(summary: CliAgentSummary): number {
  const confidenceScore = summary.pageCheck.confidence === "high" ? 1 : summary.pageCheck.confidence === "medium" ? 0.65 : 0.2;
  const contentScore = Math.min(1, summary.pageCheck.contentPreviewCount / 3) * 0.4
    + Math.min(1, summary.pageCheck.contentLength / 600) * 0.6;
  const linkScore = Math.min(1, summary.pageCheck.primaryLinkCount / 4);
  const actionScore = Math.min(1, Math.max(summary.suggestedActionCount, summary.pageCheck.actionCount) / 2);
  const searchScore = summary.kind === "search-results" ? Math.min(1, summary.searchResultCount / 5) : 1;
  return roundScore(
    confidenceScore * 0.25
    + contentScore * 0.25
    + linkScore * 0.2
    + actionScore * 0.1
    + searchScore * 0.2
  );
}

function classifyComparison(comparison: StaticComparison): StaticClassification {
  if (comparison.fetch.source === "fetch" && (comparison.fetch.status === 401 || comparison.fetch.status === 403 || comparison.fetch.status === 429)) return "challenge";
  if (!comparison.agentBrowser) return "reference-missing";
  if (isChallengeSnapshot(comparison.agentBrowser.normalized)) return "reference-challenge";
  if (comparison.fetch.htmlBytes > 10_000 && comparison.static.nodeCount <= 5 && comparison.agentBrowser.lineCount <= 5) return "shell";
  if (comparison.agentBrowser.lineCount <= 2 && comparison.static.nodeCount > 100) return "challenge";
  if (isVolatileDiagnostic(comparison)) return "volatile";
  if (comparison.static.nodeCount > Math.max(1_500, comparison.agentBrowser.lineCount * 3)) return "over-collected";
  if (comparison.agentReadiness.score < 0.45) return "needs-browser";
  return "usable";
}

function isVolatileDiagnostic(comparison: StaticComparison): boolean {
  if (comparison.gate.included) return false;
  if (!comparison.category.toLowerCase().includes("search")) return false;
  return comparison.fetch.source === "agent-browser-rendered";
}

function gateInfo(target: BenchmarkTarget): StaticComparison["gate"] {
  const gate = { included: target.gate !== false };
  return target.gateReason ? { ...gate, reason: target.gateReason } : gate;
}

function summarizeGate(comparisons: StaticComparison[]): GateSummary {
  const included = comparisons.filter((comparison) => comparison.gate.included && isGateEligible(comparison));
  const classifications = Object.fromEntries(
    (["usable", "needs-browser", "challenge", "shell", "over-collected", "reference-challenge", "reference-missing", "volatile"] as StaticClassification[])
      .map((classification) => [classification, 0]),
  ) as Record<StaticClassification, number>;
  for (const comparison of included) {
    classifications[comparison.classification] += 1;
  }
  return {
    included: included.length,
    excluded: comparisons.length - included.length,
    averageScore: average(included.map((comparison) => comparison.agentReadiness.score)),
    averageCliAgentScore: average(included.map((comparison) => comparison.cliAgentSummary.score)),
    averagePrecision: average(included.map((comparison) => comparison.agentReadiness.candidatePrecision)),
    averageReferenceRecall: average(included.map((comparison) => comparison.agentReadiness.referenceRecall)),
    classifications,
  };
}

function isGateEligible(comparison: StaticComparison): boolean {
  return comparison.classification !== "challenge"
    && comparison.classification !== "reference-challenge"
    && comparison.classification !== "reference-missing"
    && comparison.classification !== "shell"
    && comparison.classification !== "volatile";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isChallengeSnapshot(reference: NormalizedSummary): boolean {
  const names = reference.namedRoles.join("\n");
  return names.includes("captcha")
    || names.includes("your connection has been suspended")
    || names.includes("why did this happen?")
    || names.includes("ip address:")
    || names.includes("please enter the text below");
}

function looksLikeChallenge(html: string): boolean {
  const lower = html.toLowerCase();
  if (hasUsefulSearchResultHtml(lower)) return false;
  return lower.length < 2_000
    || lower.includes("your connection has been suspended")
    || lower.includes("cloudflare")
    || lower.includes("enable javascript")
    || lower.includes("captcha input")
    || lower.includes("login to continue")
    || lower.includes("please log in")
    || lower.includes("로그인 후");
}

function hasUsefulSearchResultHtml(lowerHtml: string): boolean {
  return (lowerHtml.includes("startpage search results") || lowerHtml.includes("bing"))
    && (lowerHtml.includes("search categories") || lowerHtml.includes("search results") || lowerHtml.includes("result_type") || lowerHtml.includes("web results"));
}

function decodeAgentBrowserEvalHtml(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      return output;
    }
  }
  return output;
}

function looksLikeHtml(output: string): boolean {
  const trimmed = output.trim();
  return trimmed.startsWith("<!DOCTYPE")
    || trimmed.startsWith("<html")
    || trimmed.startsWith("\"<html")
    || trimmed.startsWith("\"<!DOCTYPE");
}

function categoryRecall(candidateSet: Set<string>, referenceNamedRoles: string[], roles: Set<string>): number {
  const referenceItems = referenceNamedRoles.filter((item) => roles.has(roleFromNamedRole(item)));
  const matches = referenceItems.filter((item) => candidateSet.has(item)).length;
  return ratio(matches, referenceItems.length, 1);
}

function normalizeRole(role: string): string {
  const key = role.toLowerCase();
  const aliases: Record<string, string> = {
    descriptionlist: "list",
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
    .trim()
    .toLowerCase();
  return normalizeDigitSeparators(normalized);
}

function normalizeDigitSeparators(value: string): string {
  return value.replace(/(?<=\d)[\s,.\u202f\u00a0]+(?=\d{3}\b)/g, "");
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

function trimError(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 240);
}

function createMemoryWriter(): Pick<NodeJS.WriteStream, "write"> & { output: string } {
  const writer = {
    output: "",
    write(chunk: string | Uint8Array): boolean {
      writer.output += chunk.toString();
      return true;
    },
  };
  return writer;
}
