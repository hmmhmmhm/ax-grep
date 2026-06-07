#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extract, type StaticSemanticTreeOptions } from "./static";
import type { SemanticNode } from "./types";

type CliFormat = "text" | "json";

type CliOptions = {
  url: string;
  format: CliFormat;
  timeoutMs: number;
  userAgent: string;
  extractOptions: StaticSemanticTreeOptions;
};

type FetchResult = {
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
};

type CliErrorCode = "FETCH_FAILED" | "HTTP_ERROR" | "NO_INSPECTABLE_CONTENT" | "TIMEOUT" | "USAGE";

type LinkSummary = {
  text: string;
  url: string;
  role: string;
  selector?: string;
};

type CliIO = {
  fetch?: typeof fetch;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

const defaultTimeoutMs = 15_000;
const defaultUserAgent = "ax-grep/0.1 (+https://github.com/hmmhmmhm/ax-grep)";

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const fetchImpl = io.fetch ?? globalThis.fetch;

  try {
    const options = parseArgs(argv);
    const fetched = await fetchHtml(options, fetchImpl);
    const tree = extract(fetched.html, options.extractOptions);
    if (isUnavailableTree(tree)) {
      const message = "no inspectable content; if the page is challenged or JavaScript-rendered, pass browser-captured HTML to the library API";
      if (options.format === "json") {
        stdout.write(`${JSON.stringify(jsonEnvelope(options, fetched, tree, [{ code: "NO_INSPECTABLE_CONTENT", message }]), null, 2)}\n`);
      } else {
        stderr.write(`ax-grep: warning: ${message}\n`);
        stdout.write(`${formatCliText(tree, fetched.finalUrl)}\n`);
      }
      return 20;
    }
    const output = options.format === "json"
      ? `${JSON.stringify(jsonEnvelope(options, fetched, tree), null, 2)}\n`
      : `${formatCliText(tree, fetched.finalUrl)}\n`;
    stdout.write(output);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      if (argv.includes("--json")) {
        stdout.write(`${JSON.stringify(jsonErrorEnvelope(toCliError(error), parseArgMetadata(argv)), null, 2)}\n`);
      } else if (error.exitCode === 0) {
        stdout.write(`${error.message}\n`);
      } else {
        stderr.write(`ax-grep: ${error.message}\n`);
      }
      return error.exitCode;
    }
    if (argv.includes("--json")) {
      const cliError = toCliError(error);
      stdout.write(`${JSON.stringify(jsonErrorEnvelope(cliError, parseArgMetadata(argv)), null, 2)}\n`);
      return cliError.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`ax-grep: ${message}\n`);
    return toCliError(error).exitCode;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const extractOptions: StaticSemanticTreeOptions = {};
  let format: CliFormat = "text";
  let formatOption: CliFormat | undefined;
  let timeoutMs = defaultTimeoutMs;
  let userAgent = defaultUserAgent;
  let url = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      throw new UsageError(usage(), 0);
    }
    if (arg === "--json") {
      if (formatOption && formatOption !== "json") throw new UsageError(`--json and --text cannot be used together`);
      format = "json";
      formatOption = "json";
      continue;
    }
    if (arg === "--text") {
      if (formatOption && formatOption !== "text") throw new UsageError(`--json and --text cannot be used together`);
      format = "text";
      formatOption = "text";
      continue;
    }
    if (arg === "--include-hidden") {
      extractOptions.includeHidden = true;
      continue;
    }
    if (arg === "--include-text") {
      extractOptions.includeTextNodes = true;
      continue;
    }
    if (arg === "--no-attributes") {
      extractOptions.includeAttributes = false;
      continue;
    }
    if (arg === "--exclude-ads") {
      extractOptions.excludeLikelyAds = true;
      continue;
    }
    if (arg === "--exclude-boilerplate") {
      extractOptions.excludeLikelyBoilerplate = true;
      continue;
    }
    if (arg === "--mode") {
      extractOptions.mode = parseMode(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--max-text-length") {
      extractOptions.maxTextLength = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      timeoutMs = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--user-agent") {
      userAgent = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new UsageError(`unknown option: ${arg}\n\n${usage()}`);
    }
    if (url) {
      throw new UsageError(`expected one URL, got extra argument: ${arg}\n\n${usage()}`);
    }
    url = arg;
  }

  if (!url) throw new UsageError(`missing URL\n\n${usage()}`);
  validateUrl(url);
  return { url, format, timeoutMs, userAgent, extractOptions };
}

async function fetchHtml(options: CliOptions, fetchImpl: typeof fetch): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(options.url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": options.userAgent,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CliError("HTTP_ERROR", `fetch failed with HTTP ${response.status} ${response.statusText}`.trim(), 12, response.status);
    }
    return {
      html: await response.text(),
      finalUrl: response.url || options.url,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CliError("TIMEOUT", `fetch timed out after ${options.timeoutMs}ms`, 11);
    }
    if (!(error instanceof CliError)) {
      throw new CliError("FETCH_FAILED", error instanceof Error ? error.message : String(error), 10);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new UsageError(`${option} requires a value`);
  return value;
}

function parseMode(value: string): NonNullable<StaticSemanticTreeOptions["mode"]> {
  if (value === "compact" || value === "interactive" || value === "full") return value;
  throw new UsageError(`--mode must be compact, interactive, or full`);
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new UsageError(`${option} must be a positive integer`);
  return parsed;
}

function validateUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UsageError(`URL must be absolute`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UsageError(`URL must use http or https`);
  }
}

function usage(): string {
  return `Usage: ax-grep <url> [options]

Fetch a page and print a compact semantic accessibility-like tree.

Options:
  --json                     Print the SemanticNode tree as JSON.
  --text                     Print the compact text tree. This is the default.
  --mode <compact|interactive|full>
  --include-hidden           Include hidden and collapsed content.
  --include-text             Include static text nodes.
  --no-attributes            Omit element attributes from JSON output.
  --exclude-ads              Prune likely ad and promotion regions.
  --exclude-boilerplate      Prune likely forum/search boilerplate.
  --max-text-length <n>      Limit direct text/name fragments.
  --timeout <ms>             Fetch timeout. Default: ${defaultTimeoutMs}.
  --user-agent <value>       Override the request User-Agent.
  -h, --help                 Show this help.

Notes:
  The CLI uses fetch only. It does not run JavaScript or bypass bot checks.
  Text output starts with a deduplicated links summary for agent navigation.
  JSON output is an envelope with fetch metadata, links, warnings, and tree.`;
}

class UsageError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message);
  }
}

class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
    readonly exitCode: number,
    readonly status?: number,
  ) {
    super(message);
  }
}

function formatCliText(node: SemanticNode, baseUrl: string): string {
  const links = summarizeLinks(node, baseUrl);
  const lines: string[] = links.length > 0 ? formatLinksText(links) : [];
  if (lines.length > 0) lines.push("", "tree");
  function visit(current: SemanticNode, depth: number): void {
    const prefix = lines.length > 0 ? `  ${"  ".repeat(depth)}` : "  ".repeat(depth);
    const role = current.role || current.tag;
    const marker = current.interactive ? "[i] " : "";
    const name = current.name ? ` '${current.name}'` : "";
    const href = current.role === "link" ? formatHref(current, baseUrl) : "";
    const state = formatState(current);
    const unavailable = current.unavailableReason ? ` (${current.unavailableReason})` : "";
    lines.push(`${prefix}${marker}${role}${name}${href}${state}${unavailable}`);
    for (const child of current.children) visit(child, depth + 1);
  }
  visit(node, 0);
  return lines.join("\n");
}

function formatLinksText(links: LinkSummary[]): string[] {
  return [
    "links",
    ...links.map((link, index) => `  ${index + 1}. ${link.text || link.role} <${link.url}>`),
  ];
}

function formatHref(node: SemanticNode, baseUrl: string): string {
  const href = node.attributes?.href;
  if (!href) return "";
  try {
    return ` <${unwrapKnownRedirect(new URL(href, baseUrl)).toString()}>`;
  } catch {
    return ` <${href}>`;
  }
}

function unwrapKnownRedirect(url: URL): URL {
  if (url.hostname.endsWith("bing.com") && url.pathname === "/ck/a") {
    const encoded = url.searchParams.get("u");
    const decoded = decodeBingTarget(encoded);
    if (decoded) return decoded;
  }
  if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") {
    const target = url.searchParams.get("uddg");
    if (target) return new URL(target);
  }
  return url;
}

function decodeBingTarget(value: string | null): URL | null {
  if (!value) return null;
  const payload = value.startsWith("a1") ? value.slice(2) : value;
  try {
    return new URL(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function formatState(node: SemanticNode): string {
  if (!node.state || Object.keys(node.state).length === 0) return "";
  const parts = Object.entries(node.state).map(([key, value]) => `${key}=${value}`);
  return ` [${parts.join(" ")}]`;
}

function summarizeLinks(node: SemanticNode, baseUrl: string): LinkSummary[] {
  const candidates: Array<LinkSummary & { score: number; index: number }> = [];
  let index = 0;
  function visit(current: SemanticNode): void {
    if (current.role === "link") {
      const href = current.attributes?.href;
      const url = href ? normalizeHref(href, baseUrl) : null;
      if (url && isUsefulLink(current, url, baseUrl)) {
        const candidate: LinkSummary & { score: number; index: number } = {
          text: current.name || current.text || url,
          url,
          role: current.role,
          score: linkScore(current, url, baseUrl),
          index,
        };
        if (current.selector) candidate.selector = current.selector;
        candidates.push(candidate);
      }
      index += 1;
    }
    for (const child of current.children) visit(child);
  }
  visit(node);

  const seenBeforeSort = new Set<string>();
  return candidates
    .filter((link) => {
      if (seenBeforeSort.has(link.url)) return false;
      seenBeforeSort.add(link.url);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 10)
    .map(({ score: _score, index: _index, ...link }) => link);
}

function normalizeHref(href: string, baseUrl: string): string | null {
  try {
    const normalized = unwrapKnownRedirect(new URL(href, baseUrl));
    if (normalized.protocol !== "http:" && normalized.protocol !== "https:") return null;
    return normalized.toString();
  } catch {
    return null;
  }
}

function isUsefulLink(node: SemanticNode, url: string, baseUrl: string): boolean {
  const text = (node.name || node.text || "").trim().toLowerCase();
  if (!text && samePageOrSameHost(url, baseUrl)) return false;
  if (/^(skip to|콘텐츠로|접근성|settings|설정|hamburger menu|startpage home page|duckduckgo|english|login|로그인|visit in anonymous view)$/i.test(text)) return false;
  if (url.includes("javascript:")) return false;
  return true;
}

function linkScore(node: SemanticNode, url: string, baseUrl: string): number {
  const text = node.name || node.text || "";
  let score = 0;
  if (!samePageOrSameHost(url, baseUrl)) score += 100;
  if (text.length > 12) score += 20;
  if (text.length > 50) score += 10;
  if (node.selector?.includes("result") || node.selector?.includes("article")) score += 10;
  if (/^(all|images|videos|maps|news|전체|이미지|동영상|지도|뉴스)$/i.test(text)) score -= 60;
  if (/search|login|settings|home|skip|hamburger|필터|검색|로그인|설정/i.test(text)) score -= 40;
  return score;
}

function samePageOrSameHost(url: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    return parsed.hostname === base.hostname;
  } catch {
    return false;
  }
}

function isUnavailableTree(tree: SemanticNode): boolean {
  return tree.children.length === 0 && Boolean(tree.unavailableReason);
}

function jsonEnvelope(
  options: CliOptions,
  fetched: FetchResult,
  tree: SemanticNode,
  warnings: Array<{ code: string; message: string }> = [],
): object {
  return {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: warnings.length === 0,
    url: options.url,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    contentType: fetched.contentType,
    fetchedAt: new Date().toISOString(),
    mode: options.extractOptions.mode ?? "compact",
    warnings,
    links: summarizeLinks(tree, fetched.finalUrl),
    tree,
  };
}

function jsonErrorEnvelope(error: CliError, metadata: Partial<Pick<CliOptions, "url" | "extractOptions">> = {}): object {
  return {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: false,
    url: metadata.url,
    fetchedAt: new Date().toISOString(),
    mode: metadata.extractOptions?.mode ?? "compact",
    warnings: [],
    error: {
      code: error.code,
      message: error.message,
      status: error.status,
    },
  };
}

function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof UsageError) return new CliError("USAGE", error.message, 2);
  return new CliError("FETCH_FAILED", error instanceof Error ? error.message : String(error), 10);
}

function parseArgMetadata(argv: string[]): Partial<Pick<CliOptions, "url" | "extractOptions">> {
  const metadata: Partial<Pick<CliOptions, "url" | "extractOptions">> = { extractOptions: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--mode") {
      const value = argv[index + 1];
      if (value === "compact" || value === "interactive" || value === "full") metadata.extractOptions = { mode: value };
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      if (["--max-text-length", "--timeout", "--user-agent"].includes(arg)) index += 1;
      continue;
    }
    metadata.url ??= arg;
  }
  return metadata;
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
