#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseDocument } from "htmlparser2";
import { Element as DomElement } from "domhandler";
import type { AnyNode, Element } from "domhandler";
import { extract, type StaticSemanticTreeOptions } from "./static";
import type { SemanticNode } from "./types";

type CliFormat = "text" | "json";
type SearchEngine = "bing" | "duckduckgo" | "startpage";

type CliOptions = {
  url?: string;
  baseUrl: string;
  format: CliFormat;
  linksOnly: boolean;
  maxTreeLines?: number;
  input: "fetch" | "html-file" | "stdin";
  htmlFile?: string;
  searchQuery?: string;
  searchEngine?: SearchEngine;
  searchLang?: string;
  searchRegion?: string;
  openResult?: number;
  sourceSearch?: SourceSearchSummary;
  timeoutMs: number;
  userAgent: string;
  extractOptions: StaticSemanticTreeOptions;
};

type SourceSearchSummary = {
  query: string;
  engine: SearchEngine;
  searchUrl: string;
  lang?: string;
  region?: string;
  selectedRank: number;
  selectedTitle: string;
  selectedUrl: string;
};

type FetchResult = {
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
  page: PageSummary;
};

type CliErrorCode = "FETCH_FAILED" | "HTTP_ERROR" | "NO_INSPECTABLE_CONTENT" | "NO_RESULT" | "TIMEOUT" | "USAGE";

type LinkSummary = {
  text: string;
  url: string;
  role: string;
  snippet?: string;
  selector?: string;
};

type ResultSummary = {
  title: string;
  url: string;
  source: string;
  rank: number;
  snippet?: string;
};

type PageSummary = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  lang?: string;
};

type OutlineSummary = {
  text: string;
  level?: number;
};

type ActionSummary = {
  type: string;
  text: string;
  selector?: string;
};

type ContentSummary = {
  text: string;
  role: string;
  selector?: string;
};

type ContentKind = "empty" | "blocked-page" | "search-results" | "content-page" | "interactive-page" | "page";

type DiagnosticSummary = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
};

type SuggestedAction = {
  action: string;
  reason: string;
  url?: string;
  rank?: number;
};

type AnalysisSummary = {
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
};

type PageLinkSummary = ResultSummary & {
  kind: "internal" | "external";
};

type PageCheckSummary = {
  title?: string;
  canonicalUrl?: string;
  mainHeading?: string;
  lang?: string;
  contentPreview: string[];
  contentLength: number;
  primaryLinks: PageLinkSummary[];
  actions: ActionSummary[];
  confidence: "low" | "medium" | "high";
};

type CliIO = {
  fetch?: typeof fetch;
  stdin?: NodeJS.ReadStream;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

const defaultTimeoutMs = 15_000;
const defaultUserAgent = "ax-grep/0.1 (+https://github.com/hmmhmmhm/ax-grep)";

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const fetchImpl = io.fetch ?? globalThis.fetch;
  const stdin = io.stdin ?? process.stdin;

  try {
    const options = parseArgs(argv);
    const fetched = await loadHtml(options, fetchImpl, stdin);
    const tree = extract(fetched.html, options.extractOptions);
    if (options.openResult) {
      const opened = await openSearchResult(options, fetched, tree, fetchImpl);
      const openedTree = extract(opened.fetched.html, opened.options.extractOptions);
      if (isUnavailableTree(openedTree)) {
        const message = "no inspectable content; if the page is challenged or JavaScript-rendered, pass browser-captured HTML to the library API";
        if (opened.options.format === "json") {
          stdout.write(`${JSON.stringify(jsonEnvelope(opened.options, opened.fetched, openedTree, [{ code: "NO_INSPECTABLE_CONTENT", message }], {
            code: "NO_INSPECTABLE_CONTENT",
            message,
            status: opened.fetched.status,
          }), null, 2)}\n`);
        } else {
          stderr.write(`ax-grep: warning: ${message}\n`);
          stdout.write(`${formatCliText(openedTree, opened.fetched, opened.options)}\n`);
        }
        return 20;
      }
      const output = opened.options.format === "json"
        ? `${JSON.stringify(jsonEnvelope(opened.options, opened.fetched, openedTree), null, 2)}\n`
        : `${formatCliText(openedTree, opened.fetched, opened.options)}\n`;
      stdout.write(output);
      return 0;
    }
    if (isUnavailableTree(tree)) {
      const message = "no inspectable content; if the page is challenged or JavaScript-rendered, pass browser-captured HTML to the library API";
      if (options.format === "json") {
        stdout.write(`${JSON.stringify(jsonEnvelope(options, fetched, tree, [{ code: "NO_INSPECTABLE_CONTENT", message }], {
          code: "NO_INSPECTABLE_CONTENT",
          message,
          status: fetched.status,
        }), null, 2)}\n`);
      } else {
        stderr.write(`ax-grep: warning: ${message}\n`);
        stdout.write(`${formatCliText(tree, fetched, options)}\n`);
      }
      return 20;
    }
    const output = options.format === "json"
      ? `${JSON.stringify(jsonEnvelope(options, fetched, tree), null, 2)}\n`
      : `${formatCliText(tree, fetched, options)}\n`;
    stdout.write(output);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      if (argv.includes("--json")) {
        const cliError = toCliError(error);
        stdout.write(`${JSON.stringify(jsonErrorEnvelope(cliError, { ...parseArgMetadata(argv), ...cliError.metadata }), null, 2)}\n`);
      } else if (error.exitCode === 0) {
        stdout.write(`${error.message}\n`);
      } else {
        stderr.write(`ax-grep: ${error.message}\n`);
      }
      return error.exitCode;
    }
    if (argv.includes("--json")) {
      const cliError = toCliError(error);
      stdout.write(`${JSON.stringify(jsonErrorEnvelope(cliError, { ...parseArgMetadata(argv), ...cliError.metadata }), null, 2)}\n`);
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
  let linksOnly = false;
  let maxTreeLines: number | undefined;
  let input: CliOptions["input"] = "fetch";
  let htmlFile: string | undefined;
  let searchQuery: string | undefined;
  let searchEngine: SearchEngine = "duckduckgo";
  let searchLang: string | undefined;
  let searchRegion: string | undefined;
  let openResult: number | undefined;
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
    if (arg === "--links-only" || arg === "--summary") {
      linksOnly = true;
      continue;
    }
    if (arg === "--html-file") {
      if (input === "stdin") throw new UsageError(`--html-file and --stdin cannot be used together`);
      input = "html-file";
      htmlFile = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--stdin") {
      if (input === "html-file") throw new UsageError(`--html-file and --stdin cannot be used together`);
      input = "stdin";
      continue;
    }
    if (arg === "--search") {
      if (input !== "fetch") throw new UsageError(`--search cannot be used with --html-file or --stdin`);
      searchQuery = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--engine") {
      searchEngine = parseSearchEngine(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--lang") {
      searchLang = parseSearchLang(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--region") {
      searchRegion = parseSearchRegion(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--open-result" || arg === "--open") {
      openResult = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
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
    if (arg === "--max-tree-lines") {
      maxTreeLines = parsePositiveInteger(readValue(argv, index, arg), arg);
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

  if (searchQuery && url) throw new UsageError(`--search cannot be used with an explicit URL`);
  if (openResult && !searchQuery) throw new UsageError(`--open-result requires --search`);
  if (searchQuery) url = searchUrl(searchQuery, searchEngine, searchLang, searchRegion);
  if (input === "fetch" && !url) throw new UsageError(`missing URL\n\n${usage()}`);
  if (url) validateUrl(url);
  if (input === "html-file" && !htmlFile) throw new UsageError(`--html-file requires a value`);
  const baseUrl = url || (htmlFile ? pathToFileURL(resolve(htmlFile)).toString() : "stdin://ax-grep");
  const options: CliOptions = { baseUrl, format, linksOnly, input, timeoutMs, userAgent, extractOptions };
  if (url) options.url = url;
  if (htmlFile) options.htmlFile = htmlFile;
  if (searchQuery) options.searchQuery = searchQuery;
  if (searchQuery) options.searchEngine = searchEngine;
  if (searchLang) options.searchLang = searchLang;
  if (searchRegion) options.searchRegion = searchRegion;
  if (openResult) options.openResult = openResult;
  if (maxTreeLines) options.maxTreeLines = maxTreeLines;
  return options;
}

async function openSearchResult(
  options: CliOptions,
  searchFetched: FetchResult,
  searchTree: SemanticNode,
  fetchImpl: typeof fetch,
): Promise<{ options: CliOptions; fetched: FetchResult }> {
  if (isUnavailableTree(searchTree)) {
    return { options, fetched: searchFetched };
  }
  const rank = options.openResult;
  if (!rank || !options.searchQuery || !options.searchEngine) {
    throw new UsageError(`--open-result requires --search`);
  }
  const links = summarizeLinks(searchTree, searchFetched.finalUrl);
  const results = summarizeSearchResults(searchFetched, links);
  const selected = results[rank - 1];
  if (!selected) {
    throw new CliError("NO_RESULT", `search result ${rank} is not available; found ${results.length}`, 21);
  }
  const openedOptions: CliOptions = {
    ...options,
    url: selected.url,
    baseUrl: selected.url,
    input: "fetch",
    sourceSearch: {
      query: options.searchQuery,
      engine: options.searchEngine,
      searchUrl: searchFetched.finalUrl,
      ...(options.searchLang ? { lang: options.searchLang } : {}),
      ...(options.searchRegion ? { region: options.searchRegion } : {}),
      selectedRank: selected.rank,
      selectedTitle: selected.title,
      selectedUrl: selected.url,
    },
  };
  let openedFetched: FetchResult;
  try {
    openedFetched = await fetchHtml(openedOptions, fetchImpl);
  } catch (error) {
    const cliError = toCliError(error);
    throw new CliError(cliError.code, cliError.message, cliError.exitCode, cliError.status, errorMetadataFromOptions(openedOptions));
  }
  return { options: openedOptions, fetched: openedFetched };
}

function errorMetadataFromOptions(options: CliOptions): Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "sourceSearch">> {
  const metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "sourceSearch">> = {
    extractOptions: options.extractOptions,
  };
  if (options.url) metadata.url = options.url;
  if (options.searchQuery) metadata.searchQuery = options.searchQuery;
  if (options.searchEngine) metadata.searchEngine = options.searchEngine;
  if (options.searchLang) metadata.searchLang = options.searchLang;
  if (options.searchRegion) metadata.searchRegion = options.searchRegion;
  if (options.sourceSearch) metadata.sourceSearch = options.sourceSearch;
  return metadata;
}

async function loadHtml(options: CliOptions, fetchImpl: typeof fetch, stdin: NodeJS.ReadStream): Promise<FetchResult> {
  if (options.input === "fetch") return fetchHtml(options, fetchImpl);
  if (options.input === "html-file") {
    const htmlFile = options.htmlFile;
    if (!htmlFile) throw new UsageError(`--html-file requires a value`);
    const html = await readFile(htmlFile, "utf8");
    return {
      html,
      finalUrl: options.baseUrl,
      status: 0,
      contentType: "text/html",
      page: extractPageSummary(html, options.baseUrl),
    };
  }
  const html = await readStdin(stdin);
  return {
    html,
    finalUrl: options.baseUrl,
    status: 0,
    contentType: "text/html",
    page: extractPageSummary(html, options.baseUrl),
  };
}

async function fetchHtml(options: CliOptions, fetchImpl: typeof fetch): Promise<FetchResult> {
  if (!options.url) throw new UsageError(`missing URL\n\n${usage()}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(options.url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(options.searchLang || options.searchRegion ? { "accept-language": acceptLanguageHeader(options.searchLang, options.searchRegion) } : {}),
        "user-agent": options.userAgent,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CliError("HTTP_ERROR", `fetch failed with HTTP ${response.status} ${response.statusText}`.trim(), 12, response.status);
    }
    const html = await response.text();
    const finalUrl = response.url || options.url;
    return {
      html,
      finalUrl: response.url || options.url,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      page: extractPageSummary(html, finalUrl),
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

function acceptLanguageHeader(lang?: string, region?: string): string {
  if (lang && region) return `${lang}-${region},${lang};q=0.9`;
  if (lang) return lang;
  if (region) return `en-${region},en;q=0.9`;
  return "";
}

async function readStdin(stdin: NodeJS.ReadStream): Promise<string> {
  stdin.setEncoding("utf8");
  let html = "";
  for await (const chunk of stdin) {
    html += chunk;
  }
  return html;
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

function parseSearchEngine(value: string): SearchEngine {
  if (value === "bing" || value === "duckduckgo" || value === "startpage") return value;
  throw new UsageError(`--engine must be bing, duckduckgo, or startpage`);
}

function parseSearchLang(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z]{2})?$/.test(normalized)) throw new UsageError(`--lang must be a language code like en, ko, ja, or zh-cn`);
  return normalized;
}

function parseSearchRegion(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new UsageError(`--region must be a two-letter region code like US, KR, JP, or CN`);
  return normalized;
}

function searchUrl(query: string, engine: SearchEngine, lang?: string, region?: string): string {
  if (engine === "bing") {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", query);
    if (lang) url.searchParams.set("setlang", lang);
    if (region) url.searchParams.set("cc", region);
    if (lang && region) url.searchParams.set("mkt", `${lang}-${region}`);
    return url.toString();
  }
  if (engine === "startpage") {
    const url = new URL("https://www.startpage.com/sp/search");
    url.searchParams.set("query", query);
    if (lang) url.searchParams.set("language", lang);
    if (region) url.searchParams.set("region", region);
    return url.toString();
  }
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  if (lang && region) url.searchParams.set("kl", `${region.toLowerCase()}-${lang}`);
  else if (region) url.searchParams.set("kl", `${region.toLowerCase()}-${region.toLowerCase()}`);
  return url.toString();
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
  --search <query>           Search the web and analyze the result page.
  --engine <name>            Search engine for --search: duckduckgo, bing, or startpage.
  --lang <code>              Search language hint, e.g. en, ko, ja, zh-cn.
  --region <code>            Search region hint, e.g. US, KR, JP, CN.
  --open-result <n>          With --search, fetch and analyze the selected result.
  --json                     Print the SemanticNode tree as JSON.
  --text                     Print the compact text tree. This is the default.
  --mode <compact|interactive|full>
  --include-hidden           Include hidden and collapsed content.
  --include-text             Include static text nodes.
  --no-attributes            Omit element attributes from JSON output.
  --exclude-ads              Prune likely ad and promotion regions.
  --exclude-boilerplate      Prune likely forum/search boilerplate.
  --links-only, --summary    Print only the ranked links summary in text mode.
  --max-tree-lines <n>       Limit tree lines after the links summary.
  --html-file <path>         Extract from browser-captured HTML instead of fetch.
  --stdin                    Read HTML from stdin instead of fetch.
  --max-text-length <n>      Limit direct text/name fragments.
  --timeout <ms>             Fetch timeout. Default: ${defaultTimeoutMs}.
  --user-agent <value>       Override the request User-Agent.
  -h, --help                 Show this help.

Notes:
  The CLI uses fetch only. It does not run JavaScript or bypass bot checks.
  Use --html-file or --stdin with a URL argument for browser-captured HTML.
  Text output starts with a deduplicated links summary for agent navigation.
  JSON output is an envelope with fetch metadata, analysis, links, results, warnings, and tree.`;
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
    readonly metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "sourceSearch">> = {},
  ) {
    super(message);
  }
}

function formatCliText(node: SemanticNode, fetched: FetchResult, options: Pick<CliOptions, "linksOnly" | "maxTreeLines" | "sourceSearch">): string {
  const baseUrl = fetched.finalUrl;
  const links = summarizeLinks(node, baseUrl);
  const lines: string[] = links.length > 0 ? formatLinksText(links) : [];
  if (options.linksOnly) return lines.join("\n");
  appendSection(lines, formatSourceSearchText(options.sourceSearch));
  appendSection(lines, formatPageText(fetched.page));
  const outline = summarizeOutline(node);
  const actions = summarizeActions(node);
  const content = summarizeContent(node);
  const results = summarizeSearchResults(fetched, links);
  const analysis = analyzePage(fetched, node, links, results, outline, actions, content);
  const pageCheck = summarizePageCheck(fetched, links, outline, actions, content, analysis);
  appendSection(lines, formatAnalysisText(analysis));
  appendSection(lines, formatPageCheckText(pageCheck));
  appendSection(lines, formatResultsText(results));
  appendSection(lines, formatOutlineText(outline));
  appendSection(lines, formatActionsText(actions));
  appendSection(lines, formatContentText(content));
  const treeLines: string[] = [];
  function visit(current: SemanticNode, depth: number): void {
    const prefix = lines.length > 0 ? `  ${"  ".repeat(depth)}` : "  ".repeat(depth);
    const role = current.role || current.tag;
    const marker = current.interactive ? "[i] " : "";
    const name = current.name ? ` '${current.name}'` : "";
    const href = current.role === "link" ? formatHref(current, baseUrl) : "";
    const state = formatState(current);
    const unavailable = current.unavailableReason ? ` (${current.unavailableReason})` : "";
    treeLines.push(`${prefix}${marker}${role}${name}${href}${state}${unavailable}`);
    for (const child of current.children) visit(child, depth + 1);
  }
  visit(node, 0);
  if (lines.length > 0) lines.push("", "tree");
  const maxTreeLines = options.maxTreeLines ?? (looksLikeSearchUrl(fetched.finalUrl) ? 80 : undefined);
  if (maxTreeLines && treeLines.length > maxTreeLines) {
    lines.push(...treeLines.slice(0, maxTreeLines));
    lines.push(`  ... ${treeLines.length - maxTreeLines} tree lines omitted`);
  } else {
    lines.push(...treeLines);
  }
  return lines.join("\n");
}

function formatLinksText(links: LinkSummary[]): string[] {
  return [
    "links",
    ...links.map((link, index) => `  ${index + 1}. ${link.text || link.role} <${link.url}>`),
  ];
}

function appendSection(lines: string[], section: string[]): void {
  if (section.length === 0) return;
  if (lines.length > 0) lines.push("");
  lines.push(...section);
}

function formatPageText(page: PageSummary): string[] {
  const lines = [];
  if (page.title) lines.push(`  title: ${page.title}`);
  if (page.description) lines.push(`  description: ${page.description}`);
  if (page.canonicalUrl) lines.push(`  canonical: ${page.canonicalUrl}`);
  if (page.lang) lines.push(`  lang: ${page.lang}`);
  return lines.length > 0 ? ["page", ...lines] : [];
}

function formatSourceSearchText(sourceSearch?: SourceSearchSummary): string[] {
  if (!sourceSearch) return [];
  const locale = [sourceSearch.lang, sourceSearch.region].filter(Boolean).join("/");
  return [
    "source",
    `  search: ${sourceSearch.query} via ${sourceSearch.engine}`,
    ...(locale ? [`  locale: ${locale}`] : []),
    `  selected: ${sourceSearch.selectedRank}. ${sourceSearch.selectedTitle} <${sourceSearch.selectedUrl}>`,
    `  result page: ${sourceSearch.searchUrl}`,
  ];
}

function formatOutlineText(outline: OutlineSummary[]): string[] {
  if (outline.length === 0) return [];
  return [
    "outline",
    ...outline.map((item, index) => {
      const level = item.level ? `h${item.level}` : "heading";
      return `  ${index + 1}. ${level} ${item.text}`;
    }),
  ];
}

function formatActionsText(actions: ActionSummary[]): string[] {
  if (actions.length === 0) return [];
  return [
    "actions",
    ...actions.map((action, index) => `  ${index + 1}. ${action.type} ${action.text}`),
  ];
}

function formatAnalysisText(analysis: AnalysisSummary): string[] {
  const lines = [`  kind: ${analysis.kind}`];
  for (const diagnostic of analysis.diagnostics) {
    lines.push(`  ${diagnostic.severity}: ${diagnostic.code} - ${diagnostic.message}`);
  }
  for (const action of analysis.suggestedActions) {
    const url = action.url ? ` <${action.url}>` : "";
    lines.push(`  next: ${action.action}${url} - ${action.reason}`);
  }
  return ["analysis", ...lines];
}

function formatPageCheckText(pageCheck: PageCheckSummary): string[] {
  const lines = [
    `  confidence: ${pageCheck.confidence}`,
    `  contentLength: ${pageCheck.contentLength}`,
  ];
  if (pageCheck.title) lines.push(`  title: ${pageCheck.title}`);
  if (pageCheck.mainHeading) lines.push(`  mainHeading: ${pageCheck.mainHeading}`);
  if (pageCheck.canonicalUrl) lines.push(`  canonical: ${pageCheck.canonicalUrl}`);
  for (const excerpt of pageCheck.contentPreview) lines.push(`  excerpt: ${excerpt}`);
  for (const link of pageCheck.primaryLinks) lines.push(`  link: ${link.kind} ${link.title} <${link.url}>`);
  for (const action of pageCheck.actions) lines.push(`  action: ${action.type} ${action.text}`);
  return ["pageCheck", ...lines];
}

function formatResultsText(results: ResultSummary[]): string[] {
  if (results.length === 0) return [];
  const lines = ["results"];
  for (const result of results) {
    lines.push(`  ${result.rank}. ${result.title}`);
    lines.push(`     url: ${result.url}`);
    if (result.source) lines.push(`     source: ${result.source}`);
    if (result.snippet) lines.push(`     snippet: ${result.snippet}`);
  }
  return lines;
}

function formatContentText(content: ContentSummary[]): string[] {
  if (content.length === 0) return [];
  return [
    "content",
    ...content.map((item, index) => `  ${index + 1}. ${item.text}`),
  ];
}

function formatHref(node: SemanticNode, baseUrl: string): string {
  const href = node.attributes?.href;
  if (!href) return "";
  try {
    const normalized = normalizeHref(href, baseUrl);
    return normalized ? ` <${normalized}>` : "";
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
  function visit(current: SemanticNode, ancestors: SemanticNode[]): void {
    if (current.role === "link") {
      const href = current.attributes?.href;
      const url = href ? normalizeHref(href, baseUrl) : null;
      if (url && isUsefulLink(current, url, baseUrl)) {
        const candidate: LinkSummary & { score: number; index: number } = {
          text: cleanLinkText(current.name || current.text || url),
          url,
          role: current.role,
          score: linkScore(current, url, baseUrl),
          index,
        };
        const snippet = linkContextSnippet(current, ancestors);
        if (snippet) candidate.snippet = snippet;
        if (current.selector) candidate.selector = current.selector;
        candidates.push(candidate);
      }
      index += 1;
    }
    for (const child of current.children) visit(child, [...ancestors, current]);
  }
  visit(node, []);

  const byUrl = new Map<string, LinkSummary & { score: number; index: number }>();
  for (const candidate of candidates) {
    const previous = byUrl.get(candidate.url);
    if (!previous || candidate.score > previous.score || (candidate.score === previous.score && candidate.index < previous.index)) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return [...byUrl.values()]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 10)
    .map(({ score: _score, index: _index, ...link }) => link);
}

function normalizeHref(href: string, baseUrl: string): string | null {
  try {
    const normalized = unwrapKnownRedirect(new URL(stripTrailingUrlPunctuation(href), baseUrl));
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
  if (/^https?:\/\//i.test(text)) score -= 15;
  if (new URL(url).hostname.replace(/^www\./, "") === text.trim().toLowerCase()) score -= 20;
  if (node.selector?.includes("result") || node.selector?.includes("article")) score += 10;
  if (/^(all|images|videos|maps|news|전체|이미지|동영상|지도|뉴스)$/i.test(text)) score -= 60;
  if (/search|login|settings|home|skip|hamburger|필터|검색|로그인|설정/i.test(text)) score -= 40;
  return score;
}

function cleanLinkText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingUrlPunctuation(href: string): string {
  let stripped = href.trim();
  while (/[),.\]]$/.test(stripped)) stripped = stripped.slice(0, -1);
  return stripped;
}

function summarizeResults(links: LinkSummary[]): ResultSummary[] {
  return links.map((link, index) => {
    const result: ResultSummary = {
      title: link.text,
      url: link.url,
      source: sourceFromUrl(link.url),
      rank: index + 1,
    };
    if (link.snippet) result.snippet = link.snippet;
    return result;
  });
}

function summarizeSearchResults(fetched: Pick<FetchResult, "html" | "finalUrl">, links: LinkSummary[]): ResultSummary[] {
  const linkResults = summarizeResults(links);
  if (!looksLikeSearchUrl(fetched.finalUrl)) return linkResults;
  const extracted = extractSearchResults(fetched.html, fetched.finalUrl);
  return extracted.length > 0 ? extracted : linkResults;
}

function extractSearchResults(html: string, baseUrl: string): ResultSummary[] {
  const engine = detectSearchEngine(baseUrl);
  if (!engine) return [];
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const cards = collectResultCards(document.children, engine);
  const results: ResultSummary[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const result = resultFromCard(card, baseUrl, engine, results.length + 1);
    if (!result || seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
    if (results.length >= 10) break;
  }
  return results;
}

function detectSearchEngine(url: string): SearchEngine | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.endsWith("bing.com")) return "bing";
    if (hostname.endsWith("duckduckgo.com")) return "duckduckgo";
    if (hostname.endsWith("startpage.com")) return "startpage";
    return null;
  } catch {
    return null;
  }
}

function collectResultCards(nodes: AnyNode[], engine: SearchEngine): Element[] {
  const cards: Element[] = [];
  function visit(nodeList: AnyNode[]): void {
    for (const node of nodeList) {
      if (!(node instanceof DomElement)) continue;
      if (isResultCard(node, engine)) {
        cards.push(node);
        continue;
      }
      visit(node.children);
    }
  }
  visit(nodes);
  return cards;
}

function isResultCard(element: Element, engine: SearchEngine): boolean {
  if (engine === "bing") return element.name === "li" && hasClass(element, "b_algo");
  if (engine === "duckduckgo") {
    return hasClass(element, "result")
      || hasClass(element, "web-result")
      || hasClass(element, "result__body");
  }
  return hasClass(element, "w-gl__result")
    || hasClass(element, "result")
    || hasClass(element, "search-result");
}

function resultFromCard(card: Element, baseUrl: string, engine: SearchEngine, rank: number): ResultSummary | null {
  const link = resultTitleLink(card, engine) ?? firstUsefulAnchor(card, baseUrl);
  if (!link) return null;
  const href = attr(link, "href");
  const url = href ? normalizeHref(href, baseUrl) : null;
  if (!url) return null;
  const title = cleanLinkText(descendantText(link));
  if (!title || isSearchNavigationText(title)) return null;
  const result: ResultSummary = {
    title,
    url,
    source: sourceFromUrl(url),
    rank,
  };
  const snippet = resultSnippet(card, title);
  if (snippet) result.snippet = snippet;
  return result;
}

function resultTitleLink(card: Element, engine: SearchEngine): Element | undefined {
  if (engine === "bing") {
    const heading = findElement(card.children, (element) => /^h[1-6]$/.test(element.name));
    const headingLink = heading ? firstUsefulAnchor(heading, "https://example.invalid") : undefined;
    if (headingLink) return headingLink;
  }
  const classMatch = findElement(card.children, (element) => {
    if (element.name !== "a") return false;
    return hasClass(element, "result__a")
      || hasClass(element, "result-title")
      || hasClass(element, "w-gl__result-title")
      || hasClass(element, "result-link");
  });
  if (classMatch) return classMatch;
  const heading = findElement(card.children, (element) => /^h[1-6]$/.test(element.name));
  return heading ? firstUsefulAnchor(heading, "https://example.invalid") : undefined;
}

function firstUsefulAnchor(root: Element, baseUrl: string): Element | undefined {
  return findElement(root.children, (element) => {
    if (element.name !== "a") return false;
    const href = attr(element, "href");
    if (!href || !normalizeHref(href, baseUrl)) return false;
    const text = cleanLinkText(descendantText(element));
    return Boolean(text) && !isSearchNavigationText(text);
  });
}

function resultSnippet(card: Element, title: string): string {
  const snippetElement = findElement(card.children, (element) => {
    return hasClass(element, "result__snippet")
      || hasClass(element, "b_caption")
      || hasClass(element, "b_snippet")
      || hasClass(element, "w-gl__description")
      || hasClass(element, "description")
      || hasClass(element, "snippet")
      || hasClass(element, "excerpt");
  });
  const raw = snippetElement ? descendantText(snippetElement) : descendantText(card).replace(title, " ");
  const snippet = cleanContentText(raw.replace(title, " ").replace(/^[\s,.;:!?-]+/, ""));
  if (!snippet || snippet.toLowerCase() === title.toLowerCase()) return "";
  return snippet;
}

function isSearchNavigationText(text: string): boolean {
  return /^(all|images|videos|maps|news|shopping|전체|이미지|동영상|지도|뉴스|검색|설정|로그인)$/i.test(text.trim());
}

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractPageSummary(html: string, baseUrl: string): PageSummary {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const htmlElement = findElement(document.children, (element) => element.name === "html");
  const titleElement = findElement(document.children, (element) => element.name === "title");
  const description = firstMetaContent(document.children, "description")
    || firstMetaContent(document.children, "og:description")
    || firstMetaContent(document.children, "twitter:description");
  const canonicalHref = firstLinkHref(document.children, "canonical");
  const summary: PageSummary = {};
  const title = titleElement ? cleanLinkText(descendantText(titleElement)) : "";
  if (title) summary.title = title;
  if (description) summary.description = description;
  if (canonicalHref) summary.canonicalUrl = normalizeHref(canonicalHref, baseUrl) ?? canonicalHref;
  const lang = htmlElement ? attr(htmlElement, "lang") : "";
  if (lang) summary.lang = lang;
  return summary;
}

function summarizeOutline(node: SemanticNode): OutlineSummary[] {
  const outline: OutlineSummary[] = [];
  function visit(current: SemanticNode): void {
    if (current.role === "heading" && current.name) {
      const item: OutlineSummary = { text: current.name };
      const match = /^h([1-6])$/.exec(current.tag);
      if (match?.[1]) item.level = Number(match[1]);
      outline.push(item);
    }
    if (outline.length >= 20) return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return outline.slice(0, 20);
}

function summarizeActions(node: SemanticNode): ActionSummary[] {
  const actions: ActionSummary[] = [];
  function visit(current: SemanticNode): void {
    const type = current.role || current.tag;
    if (current.interactive && type !== "link") {
      const text = cleanLinkText(current.name || current.value || current.text || type);
      if (text) {
        const action: ActionSummary = { type, text };
        if (current.selector) action.selector = current.selector;
        actions.push(action);
      }
    }
    if (actions.length >= 12) return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return actions.slice(0, 12);
}

function summarizeContent(node: SemanticNode): ContentSummary[] {
  const content: ContentSummary[] = [];
  const seen = new Set<string>();
  function visit(current: SemanticNode): void {
    const role = current.role || current.tag;
    if (role === "p" || role === "text" || role === "article") {
      const text = cleanContentText(current.text || current.name || descendantSemanticText(current));
      if (text && text.length >= 24 && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        const item: ContentSummary = { text, role };
        if (current.selector) item.selector = current.selector;
        content.push(item);
      }
    }
    if (content.length >= 12) return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return content.slice(0, 12);
}

function summarizePageCheck(
  fetched: FetchResult,
  links: LinkSummary[],
  outline: OutlineSummary[],
  actions: ActionSummary[],
  content: ContentSummary[],
  analysis: AnalysisSummary,
): PageCheckSummary {
  const focusedContent = pageCheckContent(content);
  const contentPreview = focusedContent.slice(0, 4).map((item) => item.text);
  const contentLength = focusedContent.reduce((total, item) => total + item.text.length, 0);
  const pageCheck: PageCheckSummary = {
    contentPreview,
    contentLength,
    primaryLinks: summarizePrimaryPageLinks(links, fetched.finalUrl),
    actions: actions.slice(0, 5),
    confidence: pageCheckConfidence(contentLength, outline, analysis),
  };
  if (fetched.page.title) pageCheck.title = fetched.page.title;
  if (fetched.page.canonicalUrl) pageCheck.canonicalUrl = fetched.page.canonicalUrl;
  if (fetched.page.lang) pageCheck.lang = fetched.page.lang;
  if (outline[0]?.text) pageCheck.mainHeading = outline[0].text;
  return pageCheck;
}

function pageCheckContent(content: ContentSummary[]): ContentSummary[] {
  const paragraphContent = content.filter((item) => item.role !== "article");
  return paragraphContent.length > 0 ? paragraphContent : content;
}

function summarizePrimaryPageLinks(links: LinkSummary[], baseUrl: string): PageLinkSummary[] {
  return links
    .filter((link) => !isLowValuePageLink(link))
    .slice(0, 8)
    .map((link, index) => {
      const summary: PageLinkSummary = {
        title: link.text,
        url: link.url,
        source: sourceFromUrl(link.url),
        rank: index + 1,
        kind: samePageOrSameHost(link.url, baseUrl) ? "internal" : "external",
      };
      if (link.snippet) summary.snippet = link.snippet;
      return summary;
    });
}

function isLowValuePageLink(link: LinkSummary): boolean {
  const haystack = `${link.text} ${link.url}`.toLowerCase();
  return /(login|logout|sign in|signup|register|privacy|terms|cookie|advertis|광고|로그인|회원가입|개인정보|이용약관|메일인증|email verification)/i.test(haystack);
}

function pageCheckConfidence(contentLength: number, outline: OutlineSummary[], analysis: AnalysisSummary): PageCheckSummary["confidence"] {
  if (analysis.kind === "blocked-page" || analysis.kind === "empty") return "low";
  if (contentLength >= 180 && outline.length > 0) return "high";
  if (contentLength >= 80 || outline.length > 0) return "medium";
  return "low";
}

function emptyPageCheck(): PageCheckSummary {
  return {
    contentPreview: [],
    contentLength: 0,
    primaryLinks: [],
    actions: [],
    confidence: "low",
  };
}

function linkContextSnippet(link: SemanticNode, ancestors: SemanticNode[]): string {
  for (const ancestor of [...ancestors].reverse()) {
    const role = ancestor.role || ancestor.tag;
    if (!["li", "listitem", "article", "section", "div", "p", "td", "cell"].includes(role)) continue;
    const text = cleanContentText(descendantSemanticText(ancestor, link));
    if (text.length < 24) continue;
    if (text.toLowerCase() === (link.name || "").toLowerCase()) continue;
    return text;
  }
  return "";
}

function descendantSemanticText(node: SemanticNode, skip?: SemanticNode): string {
  if (node === skip) return "";
  const parts = [node.text, node.role === "link" ? "" : node.name, node.value].filter(Boolean) as string[];
  for (const child of node.children) {
    const text = descendantSemanticText(child, skip);
    if (text) parts.push(text);
  }
  return parts.join(" ");
}

function cleanContentText(text: string): string {
  return cleanLinkText(text)
    .replace(/\s+([,.;:!?])/g, "$1")
    .slice(0, 320);
}

function analyzePage(
  fetched: FetchResult,
  tree: SemanticNode,
  links: LinkSummary[],
  results: ResultSummary[],
  outline: OutlineSummary[],
  actions: ActionSummary[],
  content: ContentSummary[],
): AnalysisSummary {
  const barrierDiagnostics = filterDiagnosticsForResultPages(detectBarrierDiagnostics(fetched, tree, content), results);
  const diagnostics: DiagnosticSummary[] = [...barrierDiagnostics];
  const suggestedActions: SuggestedAction[] = [];
  const kind = classifyPage(fetched, tree, results, outline, actions, content, barrierDiagnostics);

  if (kind === "empty") {
    diagnostics.push({
      severity: "error",
      code: "NO_INSPECTABLE_CONTENT",
      message: "No inspectable content was extracted from the page.",
    });
    suggestedActions.push({
      action: "retry-with-browser-html",
      reason: "The fetched HTML may be challenged, empty, or JavaScript-rendered.",
    });
  }

  if (kind === "blocked-page") {
    suggestedActions.push({
      action: "retry-with-browser-html",
      reason: "The page appears blocked, challenged, paywalled, or login-gated.",
    });
  }

  if (kind === "search-results" && results[0]) {
    suggestedActions.push({
      action: "open-result",
      reason: "The page looks like search results; open the highest-ranked relevant result.",
      url: results[0].url,
      rank: results[0].rank,
    });
  }

  if (kind === "content-page" && content.length > 0) {
    suggestedActions.push({
      action: "read-content",
      reason: "The page has article-like content excerpts suitable for source checking.",
    });
  }

  if (kind === "interactive-page" && actions.length > 0) {
    suggestedActions.push({
      action: "inspect-actions",
      reason: "The page exposes prominent controls that may be needed before content is visible.",
    });
  }

  if (links.length === 0 && kind !== "empty") {
    diagnostics.push({
      severity: "warning",
      code: "NO_USEFUL_LINKS",
      message: "No useful outbound links were found in the semantic tree.",
    });
  }

  if (!fetched.contentType.includes("html") && fetched.contentType) {
    diagnostics.push({
      severity: "warning",
      code: "NON_HTML_CONTENT_TYPE",
      message: `Fetched content-type is ${fetched.contentType}.`,
    });
  }

  return { kind, diagnostics, suggestedActions };
}

function filterDiagnosticsForResultPages(diagnostics: DiagnosticSummary[], results: ResultSummary[]): DiagnosticSummary[] {
  if (results.length < 5) return diagnostics;
  return diagnostics.filter((diagnostic) => diagnostic.code === "CHALLENGE_LIKELY");
}

function classifyPage(
  fetched: FetchResult,
  tree: SemanticNode,
  results: ResultSummary[],
  outline: OutlineSummary[],
  actions: ActionSummary[],
  content: ContentSummary[],
  diagnostics: DiagnosticSummary[],
): ContentKind {
  if (isUnavailableTree(tree)) return "empty";
  if (diagnostics.some((item) => item.code === "CHALLENGE_LIKELY" || item.code === "LOGIN_REQUIRED" || item.code === "PAYWALL_LIKELY")) return "blocked-page";
  if (looksLikeSearchUrl(fetched.finalUrl)) return "search-results";
  if (content.length >= 2 || outline.length >= 3) return "content-page";
  if (actions.length >= 3) return "interactive-page";
  return "page";
}

function detectBarrierDiagnostics(fetched: FetchResult, tree: SemanticNode, content: ContentSummary[]): DiagnosticSummary[] {
  const haystack = [
    fetched.page.title,
    fetched.page.description,
    ...content.map((item) => item.text),
    descendantSemanticText(tree),
  ].filter(Boolean).join(" ").toLowerCase();
  const diagnostics: DiagnosticSummary[] = [];

  if (/(captcha|verify you are human|unusual traffic|checking your browser|just a moment|cf-browser-verification|cloudflare|access denied|request blocked|please wait for verification|please wait|enable javascript|enable java script|자바스크립트|봇이 아닙니다|자동입력|보안문자)/i.test(haystack)) {
    diagnostics.push({
      severity: "warning",
      code: "CHALLENGE_LIKELY",
      message: "The page appears to contain a bot check, CAPTCHA, or access challenge.",
    });
  }
  if (/(log in|login required|sign in to continue|please sign in|로그인|로그인이 필요|회원만|가입 후|unauthorized)/i.test(haystack)) {
    diagnostics.push({
      severity: "warning",
      code: "LOGIN_REQUIRED",
      message: "The page appears to require login or account access.",
    });
  }
  if (/(subscribe to continue|subscription required|paywall|premium article|구독|유료기사|유료 기사|결제 후)/i.test(haystack)) {
    diagnostics.push({
      severity: "warning",
      code: "PAYWALL_LIKELY",
      message: "The page appears to be paywalled or subscription-gated.",
    });
  }

  return dedupeDiagnostics(diagnostics);
}

function dedupeDiagnostics(diagnostics: DiagnosticSummary[]): DiagnosticSummary[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    if (seen.has(diagnostic.code)) return false;
    seen.add(diagnostic.code);
    return true;
  });
}

function looksLikeSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has("q")
      || parsed.searchParams.has("query")
      || /\/search\b|\/sp\/search\b|\/html\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function findElement(nodes: AnyNode[], predicate: (element: Element) => boolean): Element | undefined {
  for (const node of nodes) {
    if (!(node instanceof DomElement)) continue;
    if (predicate(node)) return node;
    const found = findElement(node.children, predicate);
    if (found) return found;
  }
  return undefined;
}

function firstMetaContent(nodes: AnyNode[], name: string): string {
  const element = findElement(nodes, (item) => {
    if (item.name !== "meta") return false;
    return attr(item, "name") === name || attr(item, "property") === name;
  });
  return element ? cleanLinkText(attr(element, "content") ?? "") : "";
}

function firstLinkHref(nodes: AnyNode[], rel: string): string {
  const element = findElement(nodes, (item) => item.name === "link" && (attr(item, "rel") ?? "").split(/\s+/).includes(rel));
  return element ? attr(element, "href") ?? "" : "";
}

function descendantText(element: Element): string {
  if (element.name === "script" || element.name === "style" || element.name === "noscript") return "";
  let text = "";
  for (const child of element.children) {
    if (child.type === "text") {
      text += child.data;
    } else if (child instanceof DomElement) {
      text += descendantText(child);
    }
  }
  return text;
}

function attr(element: Element, name: string): string | undefined {
  return element.attribs[name];
}

function hasClass(element: Element, className: string): boolean {
  return (attr(element, "class") ?? "").split(/\s+/).includes(className);
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
  error?: { code: CliErrorCode; message: string; status?: number },
): object {
  const links = summarizeLinks(tree, fetched.finalUrl);
  const outline = summarizeOutline(tree);
  const actions = summarizeActions(tree);
  const content = summarizeContent(tree);
  const results = summarizeSearchResults(fetched, links);
  const analysis = analyzePage(fetched, tree, links, results, outline, actions, content);
  const pageCheck = summarizePageCheck(fetched, links, outline, actions, content, analysis);
  return {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: warnings.length === 0 && !error,
    url: options.url,
    searchQuery: options.searchQuery,
    searchEngine: options.searchEngine,
    searchLang: options.searchLang,
    searchRegion: options.searchRegion,
    sourceSearch: options.sourceSearch,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    contentType: fetched.contentType,
    fetchedAt: new Date().toISOString(),
    mode: options.extractOptions.mode ?? "compact",
    warnings,
    kind: analysis.kind,
    diagnostics: analysis.diagnostics,
    suggestedActions: analysis.suggestedActions,
    page: fetched.page,
    pageCheck,
    links,
    results,
    searchResults: analysis.kind === "search-results" ? results : [],
    outline,
    actions,
    content,
    error,
    tree,
  };
}

function jsonErrorEnvelope(
  error: CliError,
  metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "sourceSearch">> = {},
): object {
  return {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: false,
    url: metadata.url,
    searchQuery: metadata.searchQuery,
    searchEngine: metadata.searchEngine,
    searchLang: metadata.searchLang,
    searchRegion: metadata.searchRegion,
    sourceSearch: metadata.sourceSearch,
    fetchedAt: new Date().toISOString(),
    mode: metadata.extractOptions?.mode ?? "compact",
    warnings: [],
    kind: "empty",
    diagnostics: [
      {
        severity: "error",
        code: error.code,
        message: error.message,
      },
    ],
    suggestedActions: error.code === "USAGE" ? [] : [
      {
        action: "retry-or-check-input",
        reason: "The CLI could not complete extraction for this request.",
      },
    ],
    page: {},
    pageCheck: emptyPageCheck(),
    links: [],
    results: [],
    searchResults: [],
    outline: [],
    actions: [],
    content: [],
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

function parseArgMetadata(argv: string[]): Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion">> {
  const metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion">> = { extractOptions: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--mode") {
      const value = argv[index + 1];
      if (value === "compact" || value === "interactive" || value === "full") metadata.extractOptions = { mode: value };
      index += 1;
      continue;
    }
    if (arg === "--search") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.searchQuery = value;
      index += 1;
      continue;
    }
    if (arg === "--engine") {
      const value = argv[index + 1];
      if (value === "bing" || value === "duckduckgo" || value === "startpage") metadata.searchEngine = value;
      index += 1;
      continue;
    }
    if (arg === "--lang") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.searchLang = value.toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--region") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.searchRegion = value.toUpperCase();
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      if (["--max-text-length", "--open", "--open-result", "--timeout", "--user-agent"].includes(arg)) index += 1;
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
