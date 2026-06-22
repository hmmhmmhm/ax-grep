import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { getEncoding } from "js-tiktoken";
import { resolveBenchmarkTargets, type BenchmarkTarget } from "./benchmark-targets";

type ProviderName =
  | "ax-grep"
  | "readability"
  | "turndown-lib"
  | "html-to-text-lib"
  | "crawl4ai"
  | "trafilatura"
  | "lynx"
  | "w3m"
  | "pandoc"
  | "html2text";

type ProviderResult = {
  provider: ProviderName;
  status: "ok" | "skipped" | "error";
  reason?: string;
  durationMs: number;
  httpStatus?: number;
  outputBytes: number;
  estimatedTokens: number;
  peakRssKb?: number;
  exitCode?: number | null;
  title?: string;
  outputKind: "agent-brief-json" | "markdown" | "text" | "unknown";
  preview: string;
  diagnostics?: string[];
};

type TargetResult = {
  category: string;
  url: string;
  gate: {
    included: boolean;
    reason?: string;
  };
  providers: ProviderResult[];
  deltas: {
    provider: ProviderName;
    tokenRatioToAxGrep: number | null;
    byteRatioToAxGrep: number | null;
    durationRatioToAxGrep: number | null;
  }[];
};

type TargetInput = {
  html: string;
  httpStatus: number;
  source: "fixture" | "fetch";
};

const encoder = getEncoding("cl100k_base");
const require = createRequire(import.meta.url);
const root = process.cwd();
const outDir = resolve(root, "tmp", "benchmarks");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const timeoutMs = numberArg("--timeout", 45_000);
const providers = providerArg();
const targets = resolveBenchmarkTargets(
  stripBenchmarkFlags(args),
  ["https://example.com", "https://books.toscrape.com/", "https://news.ycombinator.com"],
);
const startedAt = Date.now();
const results: TargetResult[] = [];
const workspace = mkdtempSync(join(tmpdir(), "ax-grep-web-extractors-"));

try {
  for (const target of targets) {
    let input: TargetInput;
    try {
      input = await prepareTargetInput(target);
    } catch (error) {
      input = { html: "", httpStatus: 0, source: "fetch" };
      const providerResults = providers.map((provider) => errored(provider, Date.now(), error));
      results.push({
        category: target.category,
        url: target.url,
        gate: gateInfo(target),
        providers: providerResults,
        deltas: summarizeDeltas(providerResults),
      });
      continue;
    }
    const providerResults: ProviderResult[] = [];
    for (const provider of providers) {
      providerResults.push(await runProvider(provider, target, input));
    }
    results.push({
      category: target.category,
      url: target.url,
      gate: gateInfo(target),
      providers: providerResults,
      deltas: summarizeDeltas(providerResults),
    });
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

const report = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - startedAt,
  note: "Runs local, keyless providers sequentially against the same fetched or fixture HTML. Providers that are not installed on this machine are marked skipped. No hosted extraction API or API key is used.",
  providers,
  timeoutMs,
  summary: summarize(results),
  targets: results,
};

const outPath = join(outDir, "web-extractors.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

async function runProvider(provider: ProviderName, target: BenchmarkTarget, input: TargetInput): Promise<ProviderResult> {
  if (provider === "ax-grep") return runAxGrep(target, input);
  if (provider === "readability") return runReadability(input);
  if (provider === "turndown-lib") return runTurndown(input);
  if (provider === "html-to-text-lib") return runHtmlToTextLibrary(input);
  if (provider === "crawl4ai") return runCrawl4Ai(target);
  if (provider === "trafilatura") return runUrlCommandProvider(provider, "trafilatura", ["-u", target.url, "--markdown"], "markdown");
  if (provider === "lynx") return runUrlCommandProvider(provider, "lynx", ["-dump", "-nolist", target.url], "text");
  if (provider === "w3m") return runUrlCommandProvider(provider, "w3m", ["-dump", target.url], "text");
  if (provider === "pandoc") return runUrlCommandProvider(provider, "pandoc", ["-f", "html", "-t", "markdown", target.url], "markdown");
  return runHtmlStdinProvider(provider, "html2text", [], target.url, "markdown");
}

function runAxGrep(target: BenchmarkTarget, input: TargetInput): ProviderResult {
  const started = Date.now();
  if (!existsSync(join(root, "dist", "cli.js"))) {
    return skipped("ax-grep", started, "dist/cli.js is missing; run pnpm build first");
  }
  const htmlFile = join(workspace, `${safeFileName(target.url)}.html`);
  writeFileSync(htmlFile, input.html, "utf8");
  const command = [
    "node",
    "dist/cli.js",
    target.url,
    "--html-file",
    htmlFile,
    "--agent-brief",
    "--timeout",
    String(timeoutMs),
    ...(target.cliBriefArgs ?? []),
  ];
  const timed = spawnSync("/usr/bin/time", ["-v", ...dedupeCommand(command)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
    timeout: timeoutMs + 10_000,
  });
  const stdout = timed.stdout ?? "";
  const stderr = timed.stderr ?? "";
  const diagnostics = diagnosticsFromAxGrep(stdout);
  const title = titleFromAxGrep(stdout);
  return {
    provider: "ax-grep",
    status: timed.status === 0 ? "ok" : "error",
    ...(timed.status === 0 ? {} : { reason: trim(stderr || stdout) }),
    durationMs: Date.now() - started,
    httpStatus: input.httpStatus,
    outputBytes: Buffer.byteLength(stdout),
    estimatedTokens: encoder.encode(stdout).length,
    peakRssKb: parsePeakRss(stderr),
    exitCode: timed.status,
    ...(title ? { title } : {}),
    outputKind: "agent-brief-json",
    preview: preview(stdout),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

function runCrawl4Ai(target: BenchmarkTarget): ProviderResult {
  return runUrlCommandProvider("crawl4ai", "crwl", [target.url, "-o", "markdown"], "markdown");
}

async function runReadability(input: TargetInput): Promise<ProviderResult> {
  const started = Date.now();
  try {
    const [{ parseHTML }, { Readability }] = await Promise.all([
      import("linkedom"),
      import("@mozilla/readability"),
    ]);
    const { document } = parseHTML(input.html);
    const article = new Readability(document).parse();
    const output = article
      ? [`# ${article.title ?? ""}`.trim(), article.excerpt ? `> ${article.excerpt}` : "", article.textContent ?? ""].filter(Boolean).join("\n\n")
      : "";
    return libraryResult("readability", started, output, "markdown", input.httpStatus, article?.title ?? undefined);
  } catch (error) {
    return errored("readability", started, error);
  }
}

async function runTurndown(input: TargetInput): Promise<ProviderResult> {
  const started = Date.now();
  try {
    const TurndownService = require("turndown") as new (options?: { headingStyle?: string; codeBlockStyle?: string }) => { turndown(html: string): string };
    const output = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }).turndown(input.html);
    return libraryResult("turndown-lib", started, output, "markdown", input.httpStatus, titleFromMarkdown(output));
  } catch (error) {
    return errored("turndown-lib", started, error);
  }
}

async function runHtmlToTextLibrary(input: TargetInput): Promise<ProviderResult> {
  const started = Date.now();
  try {
    const { htmlToText } = require("html-to-text") as { htmlToText(html: string, options?: unknown): string };
    const output = htmlToText(input.html, {
      wordwrap: false,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
      ],
    });
    return libraryResult("html-to-text-lib", started, output, "text", input.httpStatus, titleFromMarkdown(output));
  } catch (error) {
    return errored("html-to-text-lib", started, error);
  }
}

async function prepareTargetInput(target: BenchmarkTarget): Promise<TargetInput> {
  if (target.html !== undefined) {
    return {
      html: target.html,
      httpStatus: target.status ?? 200,
      source: "fixture",
    };
  }
  const fetched = await fetchHtml(target.url);
  return { ...fetched, source: "fetch" };
}

async function fetchHtml(url: string): Promise<{ html: string; httpStatus: number }> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "ax-grep-web-extractor-benchmark/0.1 (+https://github.com/hmmhmmhm/ax-grep)",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { html: await response.text(), httpStatus: response.status };
}

function libraryResult(
  provider: ProviderName,
  started: number,
  output: string,
  outputKind: ProviderResult["outputKind"],
  httpStatus?: number,
  title?: string,
): ProviderResult {
  return {
    provider,
    status: output.length > 0 ? "ok" : "error",
    ...(output.length > 0 ? {} : { reason: "empty output" }),
    durationMs: Date.now() - started,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    outputBytes: Buffer.byteLength(output),
    estimatedTokens: encoder.encode(output).length,
    ...(title ? { title } : {}),
    outputKind,
    preview: preview(output),
  };
}

function runUrlCommandProvider(
  provider: ProviderName,
  executable: string,
  commandArgs: string[],
  outputKind: ProviderResult["outputKind"],
): ProviderResult {
  const started = Date.now();
  const which = spawnSync("which", [executable], { encoding: "utf8" });
  if (which.status !== 0) return skipped(provider, started, `${executable} is not installed`);
  const timed = spawnSync("/usr/bin/time", ["-v", executable, ...commandArgs], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
    timeout: timeoutMs + 20_000,
  });
  const stdout = timed.stdout ?? "";
  const stderr = timed.stderr ?? "";
  const title = titleFromMarkdown(stdout);
  return {
    provider,
    status: timed.status === 0 ? "ok" : "error",
    ...(timed.status === 0 ? {} : { reason: trim(stderr || stdout) }),
    durationMs: Date.now() - started,
    outputBytes: Buffer.byteLength(stdout),
    estimatedTokens: encoder.encode(stdout).length,
    peakRssKb: parsePeakRss(stderr),
    exitCode: timed.status,
    ...(title ? { title } : {}),
    outputKind,
    preview: preview(stdout),
  };
}

async function runHtmlStdinProvider(
  provider: ProviderName,
  executable: string,
  commandArgs: string[],
  url: string,
  outputKind: ProviderResult["outputKind"],
): Promise<ProviderResult> {
  const started = Date.now();
  const which = spawnSync("which", [executable], { encoding: "utf8" });
  if (which.status !== 0) return skipped(provider, started, `${executable} is not installed`);
  let httpStatus = 0;
  let html = "";
  try {
    const fetched = await fetchHtml(url);
    html = fetched.html;
    httpStatus = fetched.httpStatus;
  } catch (error) {
    return errored(provider, started, error);
  }
  const timed = spawnSync("/usr/bin/time", ["-v", executable, ...commandArgs], {
    cwd: root,
    encoding: "utf8",
    input: html,
    maxBuffer: 30 * 1024 * 1024,
    timeout: timeoutMs + 20_000,
  });
  const stdout = timed.stdout ?? "";
  const stderr = timed.stderr ?? "";
  const title = titleFromMarkdown(stdout);
  return {
    provider,
    status: timed.status === 0 ? "ok" : "error",
    ...(timed.status === 0 ? {} : { reason: trim(stderr || stdout) }),
    durationMs: Date.now() - started,
    httpStatus,
    outputBytes: Buffer.byteLength(stdout),
    estimatedTokens: encoder.encode(stdout).length,
    peakRssKb: parsePeakRss(stderr),
    exitCode: timed.status,
    ...(title ? { title } : {}),
    outputKind,
    preview: preview(stdout),
  };
}

function summarize(items: TargetResult[]) {
  const providerSummaries = providers.map((provider) => {
    const measurements = items.map((item) => item.providers.find((result) => result.provider === provider)).filter((item): item is ProviderResult => Boolean(item));
    const ok = measurements.filter((item) => item.status === "ok");
    return {
      provider,
      ok: ok.length,
      skipped: measurements.filter((item) => item.status === "skipped").length,
      error: measurements.filter((item) => item.status === "error").length,
      averageDurationMs: average(ok.map((item) => item.durationMs)),
      averageOutputBytes: average(ok.map((item) => item.outputBytes)),
      averageEstimatedTokens: average(ok.map((item) => item.estimatedTokens)),
      averagePeakRssKb: average(ok.map((item) => item.peakRssKb).filter((item): item is number => typeof item === "number")),
    };
  });
  return {
    targetCount: items.length,
    providerSummaries,
    averageTokenRatiosToAxGrep: providers
      .filter((provider) => provider !== "ax-grep")
      .map((provider) => ({
        provider,
        ratio: average(items.flatMap((item) => item.deltas.filter((delta) => delta.provider === provider).map((delta) => delta.tokenRatioToAxGrep))),
      })),
  };
}

function summarizeDeltas(results: ProviderResult[]): TargetResult["deltas"] {
  const ax = results.find((result) => result.provider === "ax-grep" && result.status === "ok");
  return results
    .filter((result) => result.provider !== "ax-grep")
    .map((result) => ({
      provider: result.provider,
      tokenRatioToAxGrep: ratio(result.estimatedTokens, ax?.estimatedTokens, result.status),
      byteRatioToAxGrep: ratio(result.outputBytes, ax?.outputBytes, result.status),
      durationRatioToAxGrep: ratio(result.durationMs, ax?.durationMs, result.status),
    }));
}

function ratio(value: number, baseline: number | undefined, status: ProviderResult["status"]): number | null {
  if (status !== "ok" || !baseline) return null;
  return round(value / Math.max(baseline, 1));
}

function providerArg(): ProviderName[] {
  const index = args.indexOf("--providers");
  const value = index >= 0 ? args[index + 1] : "ax-grep,readability,turndown-lib,html-to-text-lib,crawl4ai,trafilatura,lynx,w3m,pandoc,html2text";
  if (!value) throw new Error("--providers requires a comma-separated value");
  const selected = value.split(",").map((item) => item.trim()).filter(Boolean);
  const valid = new Set<ProviderName>([
    "ax-grep",
    "readability",
    "turndown-lib",
    "html-to-text-lib",
    "crawl4ai",
    "trafilatura",
    "lynx",
    "w3m",
    "pandoc",
    "html2text",
  ]);
  for (const item of selected) {
    if (!valid.has(item as ProviderName)) throw new Error(`Unknown provider: ${item}`);
  }
  return selected as ProviderName[];
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "target";
}

function stripBenchmarkFlags(values: string[]): string[] {
  const stripped: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value) continue;
    if (value === "--providers" || value === "--timeout") {
      index += 1;
      continue;
    }
    stripped.push(value);
  }
  return stripped;
}

function numberArg(name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const raw = args[index + 1];
  if (!raw) throw new Error(`${name} requires a value`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function dedupeCommand(command: string[]): string[] {
  const firstAgentBrief = command.indexOf("--agent-brief");
  if (firstAgentBrief < 0) return command;
  return command.filter((item, index) => item !== "--agent-brief" || index === firstAgentBrief);
}

function gateInfo(target: BenchmarkTarget): TargetResult["gate"] {
  const gate = { included: target.gate !== false };
  return target.gateReason ? { ...gate, reason: target.gateReason } : gate;
}

function skipped(provider: ProviderName, started: number, reason: string): ProviderResult {
  return {
    provider,
    status: "skipped",
    reason,
    durationMs: Date.now() - started,
    outputBytes: 0,
    estimatedTokens: 0,
    outputKind: "unknown",
    preview: "",
  };
}

function errored(provider: ProviderName, started: number, error: unknown): ProviderResult {
  return {
    provider,
    status: "error",
    reason: trim(error instanceof Error ? error.message : String(error)),
    durationMs: Date.now() - started,
    outputBytes: 0,
    estimatedTokens: 0,
    outputKind: "unknown",
    preview: "",
  };
}

function parsePeakRss(stderr: string): number {
  const match = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function diagnosticsFromAxGrep(stdout: string): string[] {
  const parsed = parseJson(stdout) as { diagnosticCodes?: string[]; agent?: { diagnosticCodes?: string[] } } | undefined;
  return parsed?.agent?.diagnosticCodes ?? parsed?.diagnosticCodes ?? [];
}

function titleFromAxGrep(stdout: string): string | undefined {
  const parsed = parseJson(stdout) as { pageCheck?: { title?: string }; agent?: { pageTitle?: string } } | undefined;
  return parsed?.agent?.pageTitle ?? parsed?.pageCheck?.title;
}

function titleFromMarkdown(text: string): string | undefined {
  const titleLine = text.split(/\r?\n/).find((line) => /^#\s+\S/.test(line) || /^Title:\s+/i.test(line));
  return titleLine?.replace(/^#\s+/, "").replace(/^Title:\s+/i, "").trim();
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function preview(value: string): string {
  return trim(value).slice(0, 500);
}

function trim(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function average(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return round(numeric.reduce((total, value) => total + value, 0) / numeric.length);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
