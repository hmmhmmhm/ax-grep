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
      stdout.write(`${error.message}\n`);
      return 0;
    }
    if (argv.includes("--json")) {
      const cliError = toCliError(error);
      stdout.write(`${JSON.stringify(jsonErrorEnvelope(cliError), null, 2)}\n`);
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
  let timeoutMs = defaultTimeoutMs;
  let userAgent = defaultUserAgent;
  let url = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      throw new UsageError(usage());
    }
    if (arg === "--json") {
      format = "json";
      continue;
    }
    if (arg === "--text") {
      format = "text";
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
      throw new Error(`unknown option: ${arg}\n\n${usage()}`);
    }
    if (url) {
      throw new Error(`expected one URL, got extra argument: ${arg}\n\n${usage()}`);
    }
    url = arg;
  }

  if (!url) throw new Error(`missing URL\n\n${usage()}`);
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
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value`);
  return value;
}

function parseMode(value: string): NonNullable<StaticSemanticTreeOptions["mode"]> {
  if (value === "compact" || value === "interactive" || value === "full") return value;
  throw new Error(`--mode must be compact, interactive, or full`);
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer`);
  return parsed;
}

function validateUrl(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL must use http or https`);
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
  Text output includes link hrefs for search/navigation decisions.
  JSON output is an envelope with fetch metadata, warnings, and tree.`;
}

class UsageError extends Error {}

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
  const lines: string[] = [];
  function visit(current: SemanticNode, depth: number): void {
    const prefix = "  ".repeat(depth);
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
    tree,
  };
}

function jsonErrorEnvelope(error: CliError): object {
  return {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: false,
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
