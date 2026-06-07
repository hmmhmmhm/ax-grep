import process from "node:process";
import { getEncoding } from "js-tiktoken";
import puppeteer from "puppeteer";
import { createExtractorScript, flattenSemanticTree, type SemanticNode } from "../src/index";
import { extract } from "../src/static";
import { resolveBenchmarkTargets, type BenchmarkTarget } from "./benchmark-targets";

type ModeCost = {
  available: boolean;
  nodeCount: number;
  interactiveCount: number;
  textBytes: number;
  textChars: number;
  estimatedTokens: number;
  tokensPerNode: number;
  preview: string[];
};

type TokenComparison = {
  category: string;
  url: string;
  gate: {
    included: boolean;
    reason?: string;
  };
  staticHtmlBytes: number;
  staticHtmlSource: "fetch" | "browser-rendered";
  browser: ModeCost;
  static: ModeCost;
  delta: {
    staticMinusBrowserTokens: number | null;
    staticToBrowserTokenRatio: number | null;
    staticMinusBrowserNodes: number | null;
  };
  warnings: string[];
};

type TokenGateSummary = {
  included: number;
  excluded: number;
  averageStaticToBrowserTokenRatio: number;
  averageStaticMinusBrowserTokens: number;
  averageStaticMinusBrowserNodes: number;
};

const targets = resolveBenchmarkTargets(process.argv.slice(2), ["https://example.com", "https://news.ycombinator.com", "https://www.yonhapnewstv.co.kr/"]);
const encoder = getEncoding("cl100k_base");
const browser = await puppeteer.launch({ headless: true });
const comparisons: TokenComparison[] = [];

for (const target of targets) {
  const warnings: string[] = [];
  const response = await fetch(target.url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "ax-grep-token-cost/0.1 (+https://github.com/hmmhmmhm/ax-grep)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  if (!response.ok) warnings.push(`fetch returned HTTP ${response.status}`);

  const page = await browser.newPage();
  let browserTree: SemanticNode = unavailableTree("Browser extraction did not run");
  let staticHtml = html;
  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {
      warnings.push("Puppeteer network idle timed out; used DOMContentLoaded state");
    });
    browserTree = await page.evaluate(
      createExtractorScript({
        mode: "compact",
        includeAttributes: false,
        includeBounds: false,
        includeSelectOptions: false,
        includeTextNodes: false,
        excludeLikelyAds: true,
        excludeLikelyBoilerplate: target.excludeLikelyBoilerplate === true,
        ...(target.maxChildrenPerNode === undefined ? {} : { maxChildrenPerNode: target.maxChildrenPerNode }),
        ...(target.maxLinkFarmChildren === undefined ? {} : { maxLinkFarmChildren: target.maxLinkFarmChildren }),
      }),
    ) as SemanticNode;
    if (!response.ok || looksLikeChallenge(html)) {
      staticHtml = await renderedHtmlFromPage(page, warnings);
    }
  } catch (error) {
    warnings.push(`Puppeteer extraction failed: ${trimError(error)}`);
  } finally {
    await page.close();
  }

  const browserCost = measureTree(browserTree);
  const staticHtmlSource = staticHtml === html ? "fetch" : "browser-rendered";
  const staticCost = measureTree(extract(staticHtml, {
    mode: "compact",
    excludeLikelyAds: true,
    excludeLikelyBoilerplate: target.excludeLikelyBoilerplate === true,
    includeAttributes: false,
    includeSelectOptions: false,
    includeTextNodes: false,
    ...(target.maxChildrenPerNode === undefined ? {} : { maxChildrenPerNode: target.maxChildrenPerNode }),
    ...(target.maxLinkFarmChildren === undefined ? {} : { maxLinkFarmChildren: target.maxLinkFarmChildren }),
  }));
  comparisons.push({
    category: target.category,
    url: target.url,
    gate: gateInfo(target),
    staticHtmlBytes: new TextEncoder().encode(staticHtml).length,
    staticHtmlSource,
    browser: browserCost,
    static: staticCost,
    delta: {
      staticMinusBrowserTokens: browserCost.available ? staticCost.estimatedTokens - browserCost.estimatedTokens : null,
      staticToBrowserTokenRatio: browserCost.available ? round(staticCost.estimatedTokens / Math.max(browserCost.estimatedTokens, 1)) : null,
      staticMinusBrowserNodes: browserCost.available ? staticCost.nodeCount - browserCost.nodeCount : null,
    },
    warnings,
  });
}

await browser.close();

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), gateSummary: summarizeGate(comparisons), comparisons }, null, 2));

function measureTree(tree: SemanticNode): ModeCost {
  const text = serializeForAgent(tree);
  const flat = flattenSemanticTree(tree);
  const estimatedTokens = encoder.encode(text).length;
  return {
    available: !tree.unavailableReason,
    nodeCount: flat.length,
    interactiveCount: flat.filter((node) => node.interactive).length,
    textBytes: new TextEncoder().encode(text).length,
    textChars: text.length,
    estimatedTokens,
    tokensPerNode: round(estimatedTokens / Math.max(flat.length, 1)),
    preview: text.split("\n").slice(0, 12),
  };
}

function unavailableTree(reason: string): SemanticNode {
  return {
    id: "browser-unavailable",
    tag: "document",
    role: null,
    name: "",
    interactive: false,
    focusable: false,
    unavailableReason: reason,
    children: [],
  };
}

function serializeForAgent(root: SemanticNode): string {
  const lines: string[] = [];
  visit(root, 0, lines);
  return lines.join("\n");
}

function visit(node: SemanticNode, depth: number, lines: string[]): void {
  const role = node.role ?? node.tag;
  const pieces = [`${"  ".repeat(depth)}${node.interactive ? "*" : "-"} ${role}`];
  if (node.name) pieces.push(JSON.stringify(node.name));
  if (node.value) pieces.push(`value=${JSON.stringify(node.value)}`);
  const state = formatState(node);
  if (state) pieces.push(state);
  if (node.interactive && node.selector) pieces.push(`selector=${JSON.stringify(node.selector)}`);
  if (node.unavailableReason) pieces.push(`unavailable=${JSON.stringify(node.unavailableReason)}`);
  lines.push(pieces.join(" "));
  for (const child of node.children) visit(child, depth + 1, lines);
}

function formatState(node: SemanticNode): string {
  if (!node.state) return "";
  const entries = Object.entries(node.state).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return "";
  return `state=${entries.map(([key, value]) => `${key}:${String(value)}`).join(",")}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function gateInfo(target: BenchmarkTarget): TokenComparison["gate"] {
  const gate = { included: target.gate !== false };
  return target.gateReason ? { ...gate, reason: target.gateReason } : gate;
}

function summarizeGate(comparisons: TokenComparison[]): TokenGateSummary {
  const included = comparisons.filter((comparison) => comparison.gate.included);
  return {
    included: included.length,
    excluded: comparisons.length - included.length,
    averageStaticToBrowserTokenRatio: averageNumbers(included.map((comparison) => comparison.delta.staticToBrowserTokenRatio)),
    averageStaticMinusBrowserTokens: averageNumbers(included.map((comparison) => comparison.delta.staticMinusBrowserTokens)),
    averageStaticMinusBrowserNodes: averageNumbers(included.map((comparison) => comparison.delta.staticMinusBrowserNodes)),
  };
}

function averageNumbers(values: Array<number | null>): number {
  return average(values.filter((value): value is number => value !== null));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function renderedHtmlFromPage(page: Awaited<ReturnType<typeof browser.newPage>>, warnings: string[]): Promise<string> {
  warnings.push("used browser-rendered HTML fallback");
  return page.evaluate(() => document.documentElement.outerHTML);
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

function trimError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
