#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseDocument } from "htmlparser2";
import { Element as DomElement } from "domhandler";
import type { AnyNode, Element } from "domhandler";
import { extract, type StaticSemanticTreeOptions } from "./static";
import type {
  AgentAnswerPlan,
  AgentBrowserHtmlCapture,
  AgentCitation,
  AgentContract,
  AgentContinuationMode,
  AgentExecutionPlan,
  AgentExpectedOutcome,
  AgentHandoff,
  AgentLoopDirective,
  AgentNext,
  AgentQualityGate,
  AgentReadTarget,
  AgentReadValue,
  AgentResultChoice,
  AgentRoutingIntent,
  AgentRunbook,
  AgentSignal,
  AgentSourceChoice,
  AgentStatus,
  AgentTarget,
  SemanticNode,
} from "./types";

type CliFormat = "text" | "json";
type SearchEngine = "bing" | "duckduckgo" | "startpage";
type SearchEngineOption = SearchEngine | "auto";
type SearchResultEngine = SearchEngine | "baidu" | "yahoo-japan" | "generic";

type CliOptions = {
  url?: string;
  baseUrl: string;
  format: CliFormat;
  linksOnly: boolean;
  omitTree: boolean;
  agentMode: boolean;
  maxTreeLines?: number;
  input: "fetch" | "html-file" | "stdin";
  htmlFile?: string;
  searchQuery?: string;
  searchEngine?: SearchEngineOption;
  selectedSearchEngine?: SearchEngine;
  searchAttempts?: SearchAttemptSummary[];
  searchLang?: string;
  searchRegion?: string;
  openResult?: number | "best";
  findQueries?: string[];
  sourceSearch?: SourceSearchSummary;
  timeoutMs: number;
  userAgent: string;
  extractOptions: StaticSemanticTreeOptions;
};

type SourceSearchSummary = {
  query: string;
  engine: SearchEngineOption;
  selectedEngine?: SearchEngine;
  searchUrl: string;
  lang?: string;
  region?: string;
  timeoutMs?: number;
  userAgent?: string;
  findQueries?: string[];
  selectedRank: number;
  selectedTitle: string;
  selectedUrl: string;
  selectedResult?: ResultSummary;
  alternateResults?: ResultSummary[];
};

type FetchResult = {
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
  page: PageSummary;
};

type SearchAttemptSummary = {
  engine: SearchEngine;
  url: string;
  ok: boolean;
  resultCount: number;
  kind?: ContentKind;
  status?: number;
  finalUrl?: string;
  diagnostics?: DiagnosticSummary[];
  topResult?: {
    title: string;
    url: string;
    relevance?: "low" | "medium" | "high";
    isLikelyOfficial?: boolean;
  };
  error?: {
    code: CliErrorCode;
    message: string;
    status?: number;
  };
};

type AgentSearchDecision = {
  decision: "open-result" | "refine-search" | "none";
  confidence: "low" | "medium" | "high";
  reason: string;
  resultCount: number;
  highRelevanceCount: number;
  mediumRelevanceCount: number;
  lowRelevanceCount: number;
  officialCount: number;
  findMatchCount: number;
  recommendedRank?: number;
  recommendedUrl?: string;
  command?: string;
  commandArgs?: string[];
};

type AgentPageDecision = {
  decision: "read-content" | "open-source-link" | "retry-with-browser-html" | "inspect-actions" | "none";
  confidence: "low" | "medium" | "high";
  reason: string;
  readability: PageReadabilitySummary["level"];
  readabilityScore: number;
  evidenceCount: number;
  evidenceQualityScore: number;
  sourceLinkCount: number;
  sourceQualityScore: number;
  readFrom?: string;
  url?: string;
  command?: string;
  commandArgs?: string[];
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
  id?: string;
  path?: string;
  title: string;
  url: string;
  source: string;
  rank: number;
  snippet?: string;
  sourceType?: SourceType;
  sourceScore?: number;
  sourceHints?: string[];
  relevance?: "low" | "medium" | "high";
  matchedTerms?: string[];
  findMatches?: string[];
  isLikelyOfficial?: boolean;
  selectionReason?: string;
};

type SourceType = "official" | "government" | "education" | "documentation" | "code" | "wiki" | "news" | "forum" | "social" | "commerce" | "unknown";

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
  priority?: "low" | "medium" | "high";
  priorityReason?: string;
  url?: string;
  rank?: number;
  openResult?: number | "best";
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  terminal?: boolean;
  readFrom?: string;
  requiresBrowserInteraction?: boolean;
  execution?: "run-command" | "read-current" | "interact-browser" | "inspect-output";
  target?: AgentTarget;
};

type AgentActionSource = "agent.primaryAction" | "analysis.suggestedActions" | "pageCheck.recommendedAction" | "pageCheck.nextSteps" | "verification.recommendedAction";

type AgentActionSummary = SuggestedAction & {
  source: AgentActionSource;
  primary?: boolean;
  index?: number;
};

type CommandSpec = {
  command: string;
  commandArgs: string[];
};

type SearchResultCommandContext = {
  query: string;
  engine?: SearchEngineOption;
  findQueries: string[];
  agentMode: boolean;
  lang?: string;
  region?: string;
  timeoutMs?: number;
  userAgent?: string;
};

type PageLinkCommandContext = {
  agentMode: boolean;
  findQueries: string[];
  timeoutMs?: number;
  userAgent?: string;
};

type AnalysisSummary = {
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
};

type PageLinkSummary = ResultSummary & {
  kind: "internal" | "external";
};

type PageEvidenceSummary = {
  id: string;
  path: string;
  rank: number;
  text: string;
  role: string;
  source: "semantic" | "fallback";
  score: number;
  quality: "low" | "medium" | "high";
  qualityReason: string;
  selector?: string;
};

type PageReadabilitySummary = {
  level: "low" | "medium" | "high";
  score: number;
  reasons: string[];
};

type FindMatchSummary = {
  field: string;
  text: string;
  rank?: number;
  url?: string;
  selector?: string;
  source?: PageEvidenceSummary["source"];
  score?: number;
  quality?: PageEvidenceSummary["quality"];
  qualityReason?: string;
};

type FindSummary = {
  query: string;
  found: boolean;
  matchCount: number;
  matches: FindMatchSummary[];
};

type VerificationSummary = {
  status: "not-requested" | "matched" | "partial" | "missing";
  requestedCount: number;
  foundCount: number;
  missingCount: number;
  evidenceCount: number;
  foundQueries: string[];
  missingQueries: string[];
  bestEvidence?: FindMatchSummary;
  recommendedAction?: SuggestedAction;
};

type AgentSummary = {
  contract: AgentContract;
  status: AgentStatus;
  pageKind: ContentKind;
  summary: string;
  routingIntent: AgentRoutingIntent;
  continuationMode: AgentContinuationMode;
  next: AgentNext;
  runbook: AgentRunbook;
  handoff: AgentHandoff;
  expectedOutcome: AgentExpectedOutcome;
  executionPlan: AgentExecutionPlan;
  answerPlan: AgentAnswerPlan;
  searchDecision?: AgentSearchDecision;
  pageDecision?: AgentPageDecision;
  signals: AgentSignal[];
  qualityGates: AgentQualityGate[];
  canContinue: boolean;
  canUseFetchedHtml: boolean;
  needsBrowserHtml: boolean;
  responseStatus: number;
  responseOk: boolean;
  responseContentType: string;
  finalUrlChanged: boolean;
  confidence: PageCheckSummary["confidence"];
  usabilityScore: number;
  readability: PageReadabilitySummary["level"];
  readabilityScore: number;
  readabilityReasons: string[];
  verificationStatus: VerificationSummary["status"];
  verificationRequestedCount: number;
  verificationFoundCount: number;
  verificationMissingCount: number;
  resultCount: number;
  resultChoices: AgentResultChoice[];
  evidenceCount: number;
  sourceLinkCount: number;
  sourceChoices: AgentSourceChoice[];
  evidenceQualityScore: number;
  sourceQualityScore: number;
  alternativeActionCount: number;
  diagnosticCodes: string[];
  diagnosticErrorCount: number;
  diagnosticWarningCount: number;
  diagnosticInfoCount: number;
  citations: AgentCitation[];
  answerEvidence: AgentCitation[];
  readTargets: AgentReadTarget[];
  actions: AgentActionSummary[];
  bestReadTarget?: string;
  bestReadTargetScore?: number;
  bestReadTargetReason?: string;
  primaryExecution?: NonNullable<SuggestedAction["execution"]>;
  primaryReadFrom?: string;
  primaryCommand?: string;
  primaryCommandArgs?: string[];
  primaryAfterInteractionCommand?: string;
  primaryAfterInteractionCommandArgs?: string[];
  primaryUrl?: string;
  primaryRank?: number;
  primaryOpenResult?: number | "best";
  requiresBrowserInteraction?: boolean;
  primaryAction?: SuggestedAction;
  recommendedUrl?: string;
  recommendedTitle?: string;
  recommendedRank?: number;
  recommendedSource?: string;
  recommendedRelevance?: ResultSummary["relevance"];
  recommendedLikelyOfficial?: boolean;
  recommendedSelectionReason?: string;
};

const agentContract: AgentContract = {
  version: 1,
  features: [
    "next.loop",
    "next.readTarget",
    "next.readValue",
    "next.target",
    "runbook",
    "handoff",
    "executionPlan",
    "citations",
    "citation.reason",
    "answerPlan",
    "answerEvidence",
    "answerPlan.actionFields",
    "answerPlan.confidence",
    "searchDecision",
    "resultChoices",
    "sourceChoices",
    "pageDecision",
    "searchResult.selectionReason",
    "sourceLink.selectionReason",
    "action.priority",
    "actions",
    "contentEvidence.quality",
    "readTargets",
    "signals",
    "qualityGates",
    "expectedOutcome",
    "responseMetadata",
    "afterInteractionCommand",
    "browserHtml",
    "primaryActionShortcuts",
  ],
};

type PageCheckSummary = {
  title?: string;
  canonicalUrl?: string;
  mainHeading?: string;
  lang?: string;
  contentPreview: string[];
  contentEvidence: PageEvidenceSummary[];
  contentLength: number;
  primaryLinks: PageLinkSummary[];
  sourceLinks: PageLinkSummary[];
  actions: ActionSummary[];
  confidence: "low" | "medium" | "high";
  readability: PageReadabilitySummary;
  recommendedAction: SuggestedAction;
  nextSteps: SuggestedAction[];
};

type CliIO = {
  fetch?: typeof fetch;
  stdin?: NodeJS.ReadStream;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

const defaultTimeoutMs = 15_000;
const defaultUserAgent = "ax-grep/0.1 (+https://github.com/hmmhmmhm/ax-grep)";
const autoSearchEngines: SearchEngine[] = ["duckduckgo", "bing", "startpage"];

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const fetchImpl = io.fetch ?? globalThis.fetch;
  const stdin = io.stdin ?? process.stdin;

  try {
    const parsedOptions = parseArgs(argv);
    const resolved = await resolveCliInput(parsedOptions, fetchImpl, stdin);
    const options = resolved.options;
    const fetched = resolved.fetched;
    const tree = resolved.tree;
    if (options.openResult) {
      const opened = await openSearchResult(options, fetched, tree, fetchImpl);
      const openedTree = extract(opened.fetched.html, opened.options.extractOptions);
      if (isUnavailableTree(openedTree)) {
        const message = "no inspectable content; if the page is challenged or JavaScript-rendered, pass browser-captured HTML to the library API";
        if (opened.options.format === "json") {
          stdout.write(`${formatJsonOutput(jsonEnvelope(opened.options, opened.fetched, openedTree, [{ code: "NO_INSPECTABLE_CONTENT", message }], {
            code: "NO_INSPECTABLE_CONTENT",
            message,
            status: opened.fetched.status,
          }), opened.options.agentMode)}\n`);
        } else {
          stderr.write(`ax-grep: warning: ${message}\n`);
          stdout.write(`${formatCliText(openedTree, opened.fetched, opened.options)}\n`);
        }
        return 20;
      }
      const output = opened.options.format === "json"
        ? `${formatJsonOutput(jsonEnvelope(opened.options, opened.fetched, openedTree), opened.options.agentMode)}\n`
        : `${formatCliText(openedTree, opened.fetched, opened.options)}\n`;
      stdout.write(output);
      return 0;
    }
    if (isUnavailableTree(tree)) {
      const message = "no inspectable content; if the page is challenged or JavaScript-rendered, pass browser-captured HTML to the library API";
      if (options.format === "json") {
        stdout.write(`${formatJsonOutput(jsonEnvelope(options, fetched, tree, [{ code: "NO_INSPECTABLE_CONTENT", message }], {
          code: "NO_INSPECTABLE_CONTENT",
          message,
          status: fetched.status,
        }), options.agentMode)}\n`);
      } else {
        stderr.write(`ax-grep: warning: ${message}\n`);
        stdout.write(`${formatCliText(tree, fetched, options)}\n`);
      }
      return 20;
    }
    const output = options.format === "json"
      ? `${formatJsonOutput(jsonEnvelope(options, fetched, tree), options.agentMode)}\n`
      : `${formatCliText(tree, fetched, options)}\n`;
    stdout.write(output);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      if (wantsJsonOutput(argv)) {
        const cliError = toCliError(error);
        stdout.write(`${formatJsonOutput(jsonErrorEnvelope(cliError, { ...parseArgMetadata(argv), ...cliError.metadata }), argv.includes("--agent"))}\n`);
      } else if (error.exitCode === 0) {
        stdout.write(`${error.message}\n`);
      } else {
        stderr.write(`ax-grep: ${error.message}\n`);
      }
      return error.exitCode;
    }
    if (wantsJsonOutput(argv)) {
      const cliError = toCliError(error);
      stdout.write(`${formatJsonOutput(jsonErrorEnvelope(cliError, { ...parseArgMetadata(argv), ...cliError.metadata }), argv.includes("--agent"))}\n`);
      return cliError.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`ax-grep: ${message}\n`);
    return toCliError(error).exitCode;
  }
}

function wantsJsonOutput(argv: string[]): boolean {
  return argv.includes("--json") || argv.includes("--agent");
}

function formatJsonOutput(value: object, compact: boolean): string {
  return compact ? JSON.stringify(value) : JSON.stringify(value, null, 2);
}

function parseArgs(argv: string[]): CliOptions {
  const extractOptions: StaticSemanticTreeOptions = {};
  let format: CliFormat = "text";
  let formatOption: CliFormat | undefined;
  let linksOnly = false;
  let omitTree = false;
  let agentMode = false;
  let maxTreeLines: number | undefined;
  let input: CliOptions["input"] = "fetch";
  let htmlFile: string | undefined;
  let searchQuery: string | undefined;
  let searchEngine: SearchEngineOption = "auto";
  let searchLang: string | undefined;
  let searchRegion: string | undefined;
  let openResult: CliOptions["openResult"];
  const findQueries: string[] = [];
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
    if (arg === "--agent") {
      if (formatOption && formatOption !== "json") throw new UsageError(`--agent and --text cannot be used together`);
      agentMode = true;
      format = "json";
      formatOption = "json";
      omitTree = true;
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
    if (arg === "--no-tree") {
      omitTree = true;
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
      openResult = parseOpenResult(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--find") {
      findQueries.push(readValue(argv, index, arg));
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
  if (searchQuery) url = searchUrl(searchQuery, searchEngine === "auto" ? "duckduckgo" : searchEngine, searchLang, searchRegion);
  if (input === "fetch" && !url) throw new UsageError(`missing URL\n\n${usage()}`);
  if (url) validateUrl(url);
  if (input === "html-file" && !htmlFile) throw new UsageError(`--html-file requires a value`);
  const baseUrl = url || (htmlFile ? pathToFileURL(resolve(htmlFile)).toString() : "stdin://ax-grep");
  if (format === "json" && linksOnly) omitTree = true;
  const options: CliOptions = { baseUrl, format, linksOnly, omitTree, agentMode, input, timeoutMs, userAgent, extractOptions };
  if (url) options.url = url;
  if (htmlFile) options.htmlFile = htmlFile;
  if (searchQuery) options.searchQuery = searchQuery;
  if (searchQuery) options.searchEngine = searchEngine;
  if (searchLang) options.searchLang = searchLang;
  if (searchRegion) options.searchRegion = searchRegion;
  if (openResult) options.openResult = openResult;
  if (findQueries.length > 0) options.findQueries = findQueries;
  if (maxTreeLines) options.maxTreeLines = maxTreeLines;
  return options;
}

async function resolveCliInput(
  options: CliOptions,
  fetchImpl: typeof fetch,
  stdin: NodeJS.ReadStream,
): Promise<{ options: CliOptions; fetched: FetchResult; tree: SemanticNode }> {
  if (options.searchQuery && options.searchEngine === "auto") {
    return resolveAutoSearch(options, fetchImpl);
  }
  const fetched = await loadHtml(options, fetchImpl, stdin);
  return { options, fetched, tree: extract(fetched.html, options.extractOptions) };
}

async function resolveAutoSearch(
  options: CliOptions,
  fetchImpl: typeof fetch,
): Promise<{ options: CliOptions; fetched: FetchResult; tree: SemanticNode }> {
  if (!options.searchQuery) throw new UsageError(`--engine auto requires --search`);
  const attempts: SearchAttemptSummary[] = [];
  let best: { options: CliOptions; fetched: FetchResult; tree: SemanticNode; score: number } | undefined;

  for (const engine of autoSearchEngines) {
    const url = searchUrl(options.searchQuery, engine, options.searchLang, options.searchRegion);
    const engineOptions: CliOptions = {
      ...options,
      url,
      baseUrl: url,
      searchEngine: "auto",
      selectedSearchEngine: engine,
    };
    try {
      const fetched = await fetchHtml(engineOptions, fetchImpl);
      const tree = extract(fetched.html, engineOptions.extractOptions);
      const links = summarizeLinks(tree, fetched.finalUrl);
      const outline = summarizeOutline(tree);
      const actions = summarizeActions(tree);
      const content = summarizeContent(tree);
      const results = annotateResults(summarizeSearchResults(fetched, links), options.searchQuery, options.findQueries ?? []);
      const analysis = analyzePage(fetched, tree, links, results, outline, actions, content, engineOptions);
      const unavailable = isUnavailableTree(tree);
      const attempt: SearchAttemptSummary = {
        engine,
        url,
        ok: !unavailable && analysis.kind === "search-results" && results.length > 0,
        resultCount: results.length,
        kind: analysis.kind,
        status: fetched.status,
        finalUrl: fetched.finalUrl,
        diagnostics: analysis.diagnostics,
        ...(results[0] ? {
          topResult: {
            title: results[0].title,
            url: results[0].url,
            ...(results[0].relevance ? { relevance: results[0].relevance } : {}),
            ...(typeof results[0].isLikelyOfficial === "boolean" ? { isLikelyOfficial: results[0].isLikelyOfficial } : {}),
          },
        } : {}),
      };
      attempts.push(attempt);
      const score = scoreAutoSearchAttempt(attempt, unavailable, results);
      if (!best || score > best.score) {
        best = { options: engineOptions, fetched, tree, score };
      }
    } catch (error) {
      const cliError = toCliError(error);
      attempts.push({
        engine,
        url,
        ok: false,
        resultCount: 0,
        error: {
          code: cliError.code,
          message: cliError.message,
          ...(cliError.status ? { status: cliError.status } : {}),
        },
      });
    }
  }

  if (!best) {
    throw new CliError("FETCH_FAILED", "all auto search engines failed", 10, undefined, {
      ...errorMetadataFromOptions(options),
      searchAttempts: attempts,
    });
  }
  if (!attempts.some((attempt) => attempt.ok)) {
    throw new CliError("NO_RESULT", "auto search found no usable results", 21, undefined, {
      ...errorMetadataFromOptions(options),
      ...(best.options.selectedSearchEngine ? { selectedSearchEngine: best.options.selectedSearchEngine } : {}),
      searchAttempts: attempts,
    });
  }

  return {
    options: {
      ...best.options,
      searchAttempts: attempts,
    },
    fetched: best.fetched,
    tree: best.tree,
  };
}

function scoreAutoSearchAttempt(attempt: SearchAttemptSummary, unavailable: boolean, results: ResultSummary[]): number {
  let score = 0;
  if (!attempt.error) score += 100;
  if (!unavailable) score += 25;
  if (attempt.kind === "search-results") score += 500;
  score += Math.min(attempt.resultCount, 20) * 20;
  score += resultQualityScore(results);
  for (const diagnostic of attempt.diagnostics ?? []) {
    if (diagnostic.severity === "error") score -= 100;
    if (/CAPTCHA|CHALLENGE|BLOCK|LOGIN|NO_INSPECTABLE_CONTENT/i.test(diagnostic.code)) score -= 250;
  }
  return score;
}

function resultQualityScore(results: ResultSummary[]): number {
  let score = 0;
  for (const [index, result] of results.entries()) {
    const rankWeight = Math.max(1, 10 - index);
    if (result.relevance === "high") score += 25 * rankWeight;
    else if (result.relevance === "medium") score += 8 * rankWeight;
    score += (result.findMatches?.length ?? 0) * 18 * rankWeight;
    if (result.isLikelyOfficial) score += 30 * rankWeight;
    score += (result.matchedTerms?.length ?? 0) * rankWeight;
  }
  return score;
}

function recommendedSearchResult(results: ResultSummary[], findQueries: string[] = []): ResultSummary | undefined {
  if (findQueries.length > 0 && !results.some((result) => matchedFindQueriesForResult(result, findQueries).length > 0 || (result.findMatches?.length ?? 0) > 0)) {
    return undefined;
  }
  const recommended = [...results].sort((left, right) => {
    const scoreDelta = singleResultRecommendationScore(right, findQueries) - singleResultRecommendationScore(left, findQueries);
    if (scoreDelta !== 0) return scoreDelta;
    return left.rank - right.rank;
  })[0];
  if (!recommended) return undefined;
  if ((recommended.findMatches?.length ?? 0) > 0 || matchedFindQueriesForResult(recommended, findQueries).length > 0) return recommended;
  if (recommended.isLikelyOfficial || recommended.relevance === "high" || recommended.relevance === "medium" || recommended.relevance === undefined) return recommended;
  return undefined;
}

function searchOpenCommand(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  openResult: number | "best" = "best",
  timeoutMs?: number,
  userAgent?: string,
): string | undefined {
  return searchOpenCommandSpec(query, engine, findQueries, agentMode, lang, region, openResult, timeoutMs, userAgent)?.command;
}

function searchOpenCommandSpec(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  openResult: number | "best" = "best",
  timeoutMs?: number,
  userAgent?: string,
): CommandSpec | undefined {
  if (!query) return undefined;
  const commandArgs = ["ax-grep", "--search", query];
  const shellArgs = ["ax-grep", "--search", shellQuote(query)];
  if (engine && engine !== "auto") pushCommandOption(commandArgs, shellArgs, "--engine", engine);
  if (lang) pushCommandOption(commandArgs, shellArgs, "--lang", lang);
  if (region) pushCommandOption(commandArgs, shellArgs, "--region", region);
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  pushCommandOption(commandArgs, shellArgs, "--open-result", String(openResult));
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function searchCommand(query: string, agentMode = false, timeoutMs?: number, userAgent?: string): string {
  return searchCommandSpec(query, agentMode, timeoutMs, userAgent).command;
}

function searchCommandSpec(query: string, agentMode = false, timeoutMs?: number, userAgent?: string): CommandSpec {
  const commandArgs = ["ax-grep", "--search", query];
  const shellArgs = ["ax-grep", "--search", shellQuote(query)];
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function verificationSearchCommand(findQueries: string[], agentMode = false, timeoutMs?: number, userAgent?: string): string {
  return verificationSearchCommandSpec(findQueries, agentMode, timeoutMs, userAgent).command;
}

function verificationSearchCommandSpec(findQueries: string[], agentMode = false, timeoutMs?: number, userAgent?: string): CommandSpec {
  const query = findQueries.length > 0 ? findQueries.join(" ") : "missing evidence";
  const commandArgs = ["ax-grep", "--search", query];
  const shellArgs = ["ax-grep", "--search", shellQuote(query)];
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function refineSearchCommand(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  timeoutMs?: number,
  userAgent?: string,
): string | undefined {
  return refineSearchCommandSpec(query, engine, findQueries, agentMode, lang, region, timeoutMs, userAgent)?.command;
}

function refineSearchCommandSpec(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  timeoutMs?: number,
  userAgent?: string,
): CommandSpec | undefined {
  if (!query) return undefined;
  const terms = queryTerms(query);
  const essentialTerms = essentialQueryTerms(terms);
  const baseQuery = essentialTerms.length > 0
    ? [essentialTerms.map((term) => `"${term}"`).join(" "), ...terms.filter((term) => !essentialTerms.includes(term))].filter(Boolean).join(" ")
    : query;
  const refinedQuery = addMissingFindTextToQuery(baseQuery, findQueries);
  const commandArgs = ["ax-grep", "--search", refinedQuery];
  const shellArgs = ["ax-grep", "--search", shellQuote(refinedQuery)];
  if (engine && engine !== "auto") pushCommandOption(commandArgs, shellArgs, "--engine", engine);
  if (lang) pushCommandOption(commandArgs, shellArgs, "--lang", lang);
  if (region) pushCommandOption(commandArgs, shellArgs, "--region", region);
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function addMissingFindTextToQuery(query: string, findQueries: string[]): string {
  if (findQueries.length === 0) return query;
  const queryTermsSet = new Set(queryTerms(query).map(normalizeForMatch));
  const additions = findQueries.filter((findQuery) => {
    const missingTerms = queryTerms(findQuery)
      .map(normalizeForMatch)
      .filter((term) => !queryTermsSet.has(term));
    return missingTerms.length > 0;
  });
  if (additions.length === 0) return query;
  return [...additions.map((item) => `"${item}"`), query].join(" ");
}

function pageCommand(url: string, agentMode: boolean, browserHtml = false, findQueries: string[] = [], timeoutMs?: number, userAgent?: string): string {
  return pageCommandSpec(url, agentMode, browserHtml, findQueries, timeoutMs, userAgent).command;
}

function pageCommandSpec(url: string, agentMode: boolean, browserHtml = false, findQueries: string[] = [], timeoutMs?: number, userAgent?: string): CommandSpec {
  const commandArgs = ["ax-grep", url];
  const shellArgs = ["ax-grep", shellQuote(url)];
  if (browserHtml) pushCommandOption(commandArgs, shellArgs, "--html-file", "captured.html");
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function appendCommandFetchOptions(commandArgs: string[], shellArgs: string[], timeoutMs?: number, userAgent?: string): void {
  if (typeof timeoutMs === "number" && timeoutMs !== defaultTimeoutMs) pushCommandOption(commandArgs, shellArgs, "--timeout", String(timeoutMs));
  if (userAgent && userAgent !== defaultUserAgent) pushCommandOption(commandArgs, shellArgs, "--user-agent", userAgent, true);
}

function pushCommandFlag(commandArgs: string[], shellArgs: string[], ...flags: string[]): void {
  commandArgs.push(...flags);
  shellArgs.push(...flags);
}

function pushCommandOption(commandArgs: string[], shellArgs: string[], flag: string, value: string, quoteValue = false): void {
  commandArgs.push(flag, value);
  shellArgs.push(flag, quoteValue ? shellQuote(value) : value);
}

function commandFields(spec: CommandSpec | undefined): Pick<SuggestedAction, "command" | "commandArgs"> {
  return spec ? { command: spec.command, commandArgs: spec.commandArgs } : {};
}

function afterInteractionCommandFields(spec: CommandSpec | undefined): Pick<SuggestedAction, "afterInteractionCommand" | "afterInteractionCommandArgs"> {
  return spec ? { afterInteractionCommand: spec.command, afterInteractionCommandArgs: spec.commandArgs } : {};
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function singleResultRecommendationScore(result: ResultSummary, findQueries: string[] = []): number {
  let score = 0;
  score += resultFindMatchScore(result, findQueries);
  if (result.isLikelyOfficial) score += 100;
  const sourceWeight = result.relevance === "low" && !result.isLikelyOfficial ? 8 : 35;
  score += (result.sourceScore ?? 0) * sourceWeight;
  if (result.relevance === "high") score += 75;
  else if (result.relevance === "medium") score += 30;
  score += (result.matchedTerms?.length ?? 0) * 12;
  score += Math.max(0, 10 - result.rank);
  return score;
}

function searchResultActionReason(recommended: ResultSummary, first: ResultSummary): string {
  if ((recommended.findMatches?.length ?? 0) > 0) {
    return `The page looks like search results; open the result matching --find: ${recommended.findMatches?.join(", ")}.`;
  }
  if (recommended.rank === first.rank) {
    return "The page looks like search results; open the highest-ranked relevant result.";
  }
  return "The page looks like search results; open the result with the strongest query match.";
}

function resultFindMatchScore(result: ResultSummary, findQueries: string[]): number {
  const explicitMatches = result.findMatches?.length ?? 0;
  if (explicitMatches > 0) return explicitMatches * 120;
  const matches = matchedFindQueriesForResult(result, findQueries);
  return matches.length * 120;
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
  const requested = options.openResult;
  if (!requested || !options.searchQuery || !options.searchEngine) {
    throw new UsageError(`--open-result requires --search`);
  }
  const links = summarizeLinks(searchTree, searchFetched.finalUrl);
  const results = annotateResults(summarizeSearchResults(searchFetched, links), options.searchQuery, options.findQueries ?? []);
  const selected = requested === "best" ? recommendedSearchResult(results, options.findQueries ?? []) : results[requested - 1];
  if (!selected) {
    throw new CliError("NO_RESULT", `search result ${requested} is not available; found ${results.length}`, 21);
  }
  const alternateResults = results.filter((result) => result.url !== selected.url).slice(0, 4)
    .map((result, index) => withResultReference(result, `a${result.rank}`, `sourceSearch.alternateResults[${index}]`));
  const openedOptions: CliOptions = {
    ...options,
    url: selected.url,
    baseUrl: selected.url,
    input: "fetch",
    sourceSearch: {
      query: options.searchQuery,
      engine: options.selectedSearchEngine ?? options.searchEngine,
      ...(options.searchEngine === "auto" && options.selectedSearchEngine ? { selectedEngine: options.selectedSearchEngine } : {}),
      searchUrl: searchFetched.finalUrl,
      ...(options.searchLang ? { lang: options.searchLang } : {}),
      ...(options.searchRegion ? { region: options.searchRegion } : {}),
      ...(options.timeoutMs !== defaultTimeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== defaultUserAgent ? { userAgent: options.userAgent } : {}),
      ...(options.findQueries?.length ? { findQueries: options.findQueries } : {}),
      selectedRank: selected.rank,
      selectedTitle: selected.title,
      selectedUrl: selected.url,
      selectedResult: withResultReference(selected, "selected", "sourceSearch.selectedResult"),
      alternateResults,
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

function withResultReference(result: ResultSummary, id: string, path: string): ResultSummary {
  return { ...result, id, path };
}

function errorMetadataFromOptions(options: CliOptions): Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "findQueries" | "timeoutMs" | "userAgent">> {
  const metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "findQueries" | "timeoutMs" | "userAgent">> = {
    extractOptions: options.extractOptions,
  };
  if (options.url) metadata.url = options.url;
  if (options.searchQuery) metadata.searchQuery = options.searchQuery;
  if (options.searchEngine) metadata.searchEngine = options.searchEngine;
  if (options.selectedSearchEngine) metadata.selectedSearchEngine = options.selectedSearchEngine;
  if (options.searchAttempts) metadata.searchAttempts = options.searchAttempts;
  if (options.searchLang) metadata.searchLang = options.searchLang;
  if (options.searchRegion) metadata.searchRegion = options.searchRegion;
  if (options.sourceSearch) metadata.sourceSearch = options.sourceSearch;
  if (options.findQueries?.length) metadata.findQueries = options.findQueries;
  if (options.timeoutMs !== defaultTimeoutMs) metadata.timeoutMs = options.timeoutMs;
  if (options.userAgent !== defaultUserAgent) metadata.userAgent = options.userAgent;
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

function parseSearchEngine(value: string): SearchEngineOption {
  if (value === "auto" || value === "bing" || value === "duckduckgo" || value === "startpage") return value;
  throw new UsageError(`--engine must be auto, bing, duckduckgo, or startpage`);
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

function parseOpenResult(value: string, option: string): number | "best" {
  if (value.trim().toLowerCase() === "best") return "best";
  return parsePositiveInteger(value, option);
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
  --engine <name>            Search engine for --search: auto, duckduckgo, bing, or startpage. Default: auto.
  --lang <code>              Search language hint, e.g. en, ko, ja, zh-cn.
  --region <code>            Search region hint, e.g. US, KR, JP, CN.
  --open-result <n|best>     With --search, fetch and analyze the selected result.
  --find <text>              Check whether page summaries contain text. Repeatable.
  --agent                    Print compact JSON for agent routing; read agent.handoff first.
  --json                     Print the SemanticNode tree as JSON.
  --text                     Print the compact text tree. This is the default.
  --mode <compact|interactive|full>
  --include-hidden           Include hidden and collapsed content.
  --include-text             Include static text nodes.
  --no-attributes            Omit element attributes from JSON output.
  --exclude-ads              Prune likely ad and promotion regions.
  --exclude-boilerplate      Prune likely forum/search boilerplate.
  --links-only, --summary    Print only the ranked links summary in text mode; omit tree in JSON mode.
  --no-tree                  Omit the raw tree from JSON output.
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
  --agent implies --json --no-tree and exposes agent.handoff for the next executor step.
  JSON output is an envelope with fetch metadata, analysis, links, results, warnings, and tree unless --no-tree is set.`;
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
    readonly metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "findQueries" | "timeoutMs" | "userAgent">> = {},
  ) {
    super(message);
  }
}

function formatCliText(
  node: SemanticNode,
  fetched: FetchResult,
  options: Pick<CliOptions, "linksOnly" | "maxTreeLines" | "sourceSearch" | "findQueries" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchLang" | "searchRegion" | "agentMode" | "timeoutMs" | "userAgent">,
): string {
  const baseUrl = fetched.finalUrl;
  const links = summarizeLinks(node, baseUrl);
  const lines: string[] = links.length > 0 ? formatLinksText(links) : [];
  if (options.linksOnly) return lines.join("\n");
  appendSection(lines, formatSourceSearchText(options.sourceSearch));
  appendSection(lines, formatPageText(fetched.page));
  const outline = summarizeOutline(node);
  const actions = summarizeActions(node);
  const content = summarizeContent(node);
  const results = annotateResults(summarizeSearchResults(fetched, links), options.searchQuery, options.findQueries ?? []);
  const analysis = analyzePage(fetched, node, links, results, outline, actions, content, options);
  const pageCheck = summarizePageCheck(fetched, links, outline, actions, content, analysis, options.agentMode, false, options.timeoutMs, options.userAgent);
  const finds = summarizeFinds(options.findQueries ?? [], fetched.page, pageCheck, links, results, outline, content, analysis.kind);
  const verification = summarizeVerification(finds, pageCheck, fetched.finalUrl, analysis, options.agentMode, false, options.sourceSearch, options.timeoutMs, options.userAgent);
  const recommendedResult = analysis.kind === "search-results" ? recommendedSearchResult(results, options.findQueries ?? []) : undefined;
  const agent = summarizeAgent(
    analysis,
    pageCheck,
    verification,
    results,
    recommendedResult,
    undefined,
    false,
    options.sourceSearch,
    fetched,
    undefined,
    options.agentMode,
    options.findQueries ?? [],
    options.timeoutMs,
    options.userAgent,
  );
  appendSection(lines, formatAgentText(agent));
  appendSection(lines, formatAnalysisText(analysis));
  appendSection(lines, formatPageCheckText(pageCheck));
  appendSection(lines, formatVerificationText(verification));
  appendSection(lines, formatFindsText(finds));
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
  const maxTreeLines = options.maxTreeLines ?? (looksLikeKnownSearchUrl(fetched.finalUrl) || looksLikeGenericSearchUrl(fetched.finalUrl) ? 80 : undefined);
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

function formatAgentText(agent: AgentSummary): string[] {
  const lines = [
    "agent",
    `  status: ${agent.status}`,
    `  pageKind: ${agent.pageKind}`,
    `  routingIntent: ${agent.routingIntent}`,
    `  continuationMode: ${agent.continuationMode}`,
    `  nextMode: ${agent.next.mode}`,
    `  handoff: ${agent.handoff.decision}/${agent.handoff.operation}/${agent.handoff.confidence}${agent.handoff.action ? ` action=${agent.handoff.action}` : ""}${agent.handoff.priority ? ` priority=${agent.handoff.priority}` : ""} - ${agent.handoff.instruction}`,
    `  executionPlan: ${agent.executionPlan.operation}/${agent.executionPlan.confidence} - ${agent.executionPlan.reason}`,
    `  loopDecision: ${agent.next.loop.decision}`,
    `  loopContinue: ${agent.next.loop.shouldContinue}`,
    `  loopTerminal: ${agent.next.loop.terminal}`,
    `  loopMaxIterations: ${agent.next.loop.maxSuggestedIterations}`,
    `  loopReason: ${agent.next.loop.reason}`,
    `  expectedOutcome: ${agent.expectedOutcome.kind} - ${agent.expectedOutcome.message}`,
    `  answerPlan: ${agent.answerPlan.status} - ${agent.answerPlan.reason}`,
    `  answerConfidence: ${agent.answerPlan.confidence}`,
    `  answerGaps: ${agent.answerPlan.gaps.join("; ") || "none"}`,
    `  answerCitations: ${agent.answerPlan.useCitationIds.join(", ") || "none"}`,
    ...(agent.answerPlan.readFrom ? [`  answerReadFrom: ${agent.answerPlan.readFrom}`] : []),
    ...(agent.answerPlan.url ? [`  answerUrl: ${agent.answerPlan.url}`] : []),
    ...(agent.answerPlan.command ? [`  answerCommand: ${agent.answerPlan.command}`] : []),
    ...(agent.answerPlan.commandArgs ? [`  answerCommandArgs: ${JSON.stringify(agent.answerPlan.commandArgs)}`] : []),
    ...(agent.answerPlan.afterInteractionCommand ? [`  answerAfterInteractionCommand: ${agent.answerPlan.afterInteractionCommand}`] : []),
    ...(agent.answerPlan.afterInteractionCommandArgs ? [`  answerAfterInteractionCommandArgs: ${JSON.stringify(agent.answerPlan.afterInteractionCommandArgs)}`] : []),
    ...(agent.searchDecision ? [`  searchDecision: ${agent.searchDecision.decision}/${agent.searchDecision.confidence} - ${agent.searchDecision.reason}`] : []),
    ...(agent.pageDecision ? [`  pageDecision: ${agent.pageDecision.decision}/${agent.pageDecision.confidence} - ${agent.pageDecision.reason}`] : []),
    `  summary: ${agent.summary}`,
    `  canContinue: ${agent.canContinue}`,
    `  canUseFetchedHtml: ${agent.canUseFetchedHtml}`,
    `  needsBrowserHtml: ${agent.needsBrowserHtml}`,
    `  responseStatus: ${agent.responseStatus}`,
    `  responseOk: ${agent.responseOk}`,
    `  responseContentType: ${agent.responseContentType || "unknown"}`,
    `  finalUrlChanged: ${agent.finalUrlChanged}`,
    `  alternativeActionCount: ${agent.alternativeActionCount}`,
    `  usabilityScore: ${agent.usabilityScore}`,
    `  evidenceQualityScore: ${agent.evidenceQualityScore}`,
    `  sourceQualityScore: ${agent.sourceQualityScore}`,
    `  diagnosticErrors: ${agent.diagnosticErrorCount}`,
    `  diagnosticWarnings: ${agent.diagnosticWarningCount}`,
    `  diagnosticInfo: ${agent.diagnosticInfoCount}`,
    `  verification: ${agent.verificationFoundCount}/${agent.verificationRequestedCount} found, ${agent.verificationMissingCount} missing`,
    `  readability: ${agent.readability} (${agent.readabilityScore})`,
  ];
  for (const signal of agent.signals) lines.push(`  signal: ${signal.kind}/${signal.severity} - ${signal.message}`);
  for (const reason of agent.readabilityReasons) lines.push(`  readabilityReason: ${reason}`);
  for (const gate of agent.qualityGates) {
    const score = typeof gate.score === "number" ? ` score=${gate.score}` : "";
    const path = gate.path ? ` path=${gate.path}` : "";
    lines.push(`  qualityGate: ${gate.kind} ${gate.pass ? "pass" : "fail"}/${gate.severity}${score}${path} - ${gate.message}`);
  }
  for (const citation of agent.citations) {
    const score = typeof citation.score === "number" ? ` score=${citation.score}` : "";
    const target = citation.url ? ` <${citation.url}>` : "";
    const label = citation.text ?? citation.title ?? citation.url ?? "";
    const confidence = citation.confidence ? ` ${citation.confidence}` : "";
    const reason = citation.reason ? ` - ${citation.reason}` : "";
    lines.push(`  citation: ${citation.id} ${citation.path} ${citation.kind}${confidence}${score}${reason} ${label}${target}`);
  }
  if (agent.bestReadTarget) lines.push(`  bestReadTarget: ${agent.bestReadTarget}`);
  if (typeof agent.bestReadTargetScore === "number") lines.push(`  bestReadTargetScore: ${agent.bestReadTargetScore}`);
  if (agent.bestReadTargetReason) lines.push(`  bestReadTargetReason: ${agent.bestReadTargetReason}`);
  if (agent.recommendedUrl) lines.push(`  recommendedUrl: ${agent.recommendedUrl}`);
  if (agent.recommendedTitle) lines.push(`  recommendedTitle: ${agent.recommendedTitle}`);
  if (agent.recommendedRank) lines.push(`  recommendedRank: ${agent.recommendedRank}`);
  if (agent.recommendedSource) lines.push(`  recommendedSource: ${agent.recommendedSource}`);
  if (agent.recommendedRelevance) lines.push(`  recommendedRelevance: ${agent.recommendedRelevance}`);
  if (typeof agent.recommendedLikelyOfficial === "boolean") lines.push(`  recommendedLikelyOfficial: ${agent.recommendedLikelyOfficial}`);
  if (agent.recommendedSelectionReason) lines.push(`  recommendedSelectionReason: ${agent.recommendedSelectionReason}`);
  for (const choice of agent.resultChoices) {
    const rank = typeof choice.rank === "number" ? ` rank=${choice.rank}` : "";
    const flags = [
      choice.recommended ? "recommended" : "",
      choice.primary ? "primary" : "",
      choice.recommendedPath ? `via=${choice.recommendedPath}` : "",
    ].filter(Boolean).join(" ");
    const flagText = flags ? ` ${flags}` : "";
    const score = typeof choice.sourceScore === "number" ? ` score=${choice.sourceScore}` : "";
    const relevance = choice.relevance ? ` relevance=${choice.relevance}` : "";
    const source = choice.source ? ` source=${choice.source}` : "";
    const sourceType = choice.sourceType ? ` type=${choice.sourceType}` : "";
    const official = typeof choice.isLikelyOfficial === "boolean" ? ` official=${choice.isLikelyOfficial}` : "";
    const matchedTerms = choice.matchedTerms?.length ? ` terms=${choice.matchedTerms.join(",")}` : "";
    const findMatches = choice.findMatches?.length ? ` find=${choice.findMatches.join(",")}` : "";
    const target = choice.url ? ` <${choice.url}>` : "";
    const reason = choice.selectionReason ? ` - ${choice.selectionReason}` : "";
    const title = choice.title ? ` ${choice.title}` : "";
    lines.push(`  resultChoice: ${choice.id} ${choice.path}${rank}${flagText}${score}${relevance}${source}${sourceType}${official}${matchedTerms}${findMatches}${target}${reason}${title}`);
  }
  for (const choice of agent.sourceChoices) {
    const rank = typeof choice.rank === "number" ? ` rank=${choice.rank}` : "";
    const primary = choice.primary ? " primary" : "";
    const score = typeof choice.sourceScore === "number" ? ` score=${choice.sourceScore}` : "";
    const source = choice.source ? ` source=${choice.source}` : "";
    const sourceType = choice.sourceType ? ` type=${choice.sourceType}` : "";
    const kind = choice.kind ? ` kind=${choice.kind}` : "";
    const official = typeof choice.isLikelyOfficial === "boolean" ? ` official=${choice.isLikelyOfficial}` : "";
    const target = choice.url ? ` <${choice.url}>` : "";
    const reason = choice.selectionReason ? ` - ${choice.selectionReason}` : "";
    const title = choice.title ? ` ${choice.title}` : "";
    lines.push(`  sourceChoice: ${choice.id} ${choice.path}${rank}${primary}${score}${source}${sourceType}${kind}${official}${target}${reason}${title}`);
    if (choice.command) lines.push(`    command: ${choice.command}`);
    if (choice.commandArgs) lines.push(`    commandArgs: ${formatCommandArgsText(choice.commandArgs)}`);
  }
  for (const target of agent.readTargets) {
    const count = typeof target.count === "number" ? ` count=${target.count}` : "";
    const score = typeof target.score === "number" ? ` score=${target.score}` : "";
    const primary = target.primary ? " primary" : "";
    lines.push(`  readTarget: ${target.path}${count}${score}${primary} - ${target.reason}`);
  }
  for (const action of agent.actions) {
    const primary = action.primary ? " primary" : "";
    const target = action.url ? ` <${action.url}>` : "";
    lines.push(`  actionCandidate: ${action.source}${primary} ${formatActionLabel(action)}${target} - ${action.priority ?? actionPriority(action)} - ${action.reason}`);
  }
  if (agent.primaryAction) {
    lines.push(`  next: ${formatActionLabel(agent.primaryAction)} - ${agent.primaryAction.reason}`);
    lines.push(`  execution: ${actionExecution(agent.primaryAction)}`);
    lines.push(`  priority: ${agent.primaryAction.priority ?? actionPriority(agent.primaryAction)} - ${agent.primaryAction.priorityReason ?? actionPriorityReason(agent.primaryAction)}`);
    if (agent.primaryAction.url) lines.push(`  url: ${agent.primaryAction.url}`);
    if (agent.primaryAction.rank) lines.push(`  rank: ${agent.primaryAction.rank}`);
    if (agent.primaryAction.openResult) lines.push(`  openResult: ${agent.primaryAction.openResult}`);
    if (agent.primaryAction.readFrom) lines.push(`  readFrom: ${agent.primaryAction.readFrom}`);
    if (agent.primaryAction.requiresBrowserInteraction) lines.push("  requiresBrowserInteraction: true");
    if (agent.primaryAction.command) lines.push(`  command: ${agent.primaryAction.command}`);
    if (agent.primaryAction.commandArgs) lines.push(`  commandArgs: ${formatCommandArgsText(agent.primaryAction.commandArgs)}`);
    if (agent.primaryAction.afterInteractionCommand) lines.push(`  afterInteractionCommand: ${agent.primaryAction.afterInteractionCommand}`);
    if (agent.primaryAction.afterInteractionCommandArgs) lines.push(`  afterInteractionCommandArgs: ${formatCommandArgsText(agent.primaryAction.afterInteractionCommandArgs)}`);
  }
  return lines;
}

function formatPageCheckText(pageCheck: PageCheckSummary): string[] {
  const lines = [
    `  confidence: ${pageCheck.confidence}`,
    `  readability: ${pageCheck.readability.level} (${pageCheck.readability.score})`,
    `  contentLength: ${pageCheck.contentLength}`,
  ];
  if (pageCheck.title) lines.push(`  title: ${pageCheck.title}`);
  if (pageCheck.mainHeading) lines.push(`  mainHeading: ${pageCheck.mainHeading}`);
  if (pageCheck.canonicalUrl) lines.push(`  canonical: ${pageCheck.canonicalUrl}`);
  for (const excerpt of pageCheck.contentPreview) lines.push(`  excerpt: ${excerpt}`);
  for (const evidence of pageCheck.contentEvidence) {
    const selector = evidence.selector ? ` (${evidence.selector})` : "";
    lines.push(`  evidence: ${evidence.id} ${evidence.path} ${evidence.rank}. ${evidence.role}${selector} ${evidence.quality} - ${evidence.qualityReason} ${evidence.text}`);
  }
  for (const link of pageCheck.primaryLinks) lines.push(`  link: ${link.kind} ${link.title} <${link.url}> - ${link.selectionReason ?? sourceLinkSelectionReason(link)}`);
  for (const link of pageCheck.sourceLinks) lines.push(`  sourceLink: ${link.title} <${link.url}> - ${link.selectionReason ?? sourceLinkSelectionReason(link)}`);
  for (const action of pageCheck.actions) lines.push(`  action: ${action.type} ${action.text}`);
  lines.push(`  next: ${formatActionLabel(pageCheck.recommendedAction)} - ${pageCheck.recommendedAction.reason}`);
  lines.push(`  execution: ${actionExecution(pageCheck.recommendedAction)}`);
  lines.push(`  priority: ${pageCheck.recommendedAction.priority ?? actionPriority(pageCheck.recommendedAction)} - ${pageCheck.recommendedAction.priorityReason ?? actionPriorityReason(pageCheck.recommendedAction)}`);
  if (pageCheck.recommendedAction.readFrom) lines.push(`  readFrom: ${pageCheck.recommendedAction.readFrom}`);
  if (pageCheck.recommendedAction.requiresBrowserInteraction) lines.push("  requiresBrowserInteraction: true");
  if (pageCheck.recommendedAction.command) lines.push(`  command: ${pageCheck.recommendedAction.command}`);
  if (pageCheck.recommendedAction.commandArgs) lines.push(`  commandArgs: ${formatCommandArgsText(pageCheck.recommendedAction.commandArgs)}`);
  for (const [index, step] of pageCheck.nextSteps.entries()) {
    const target = step.url ? ` <${step.url}>` : "";
    lines.push(`  step: ${index + 1}. ${formatActionLabel(step)}${target} - ${step.reason}`);
    lines.push(`    execution: ${actionExecution(step)}`);
    lines.push(`    priority: ${step.priority ?? actionPriority(step)} - ${step.priorityReason ?? actionPriorityReason(step)}`);
    if (step.readFrom) lines.push(`    readFrom: ${step.readFrom}`);
    if (step.requiresBrowserInteraction) lines.push("    requiresBrowserInteraction: true");
    if (step.command) lines.push(`    command: ${step.command}`);
    if (step.commandArgs) lines.push(`    commandArgs: ${formatCommandArgsText(step.commandArgs)}`);
  }
  return ["pageCheck", ...lines];
}

function formatActionLabel(action: SuggestedAction): string {
  return `${action.action}${action.terminal ? " [terminal]" : ""}`;
}

function formatCommandArgsText(commandArgs: string[]): string {
  return JSON.stringify(commandArgs);
}

function formatFindsText(finds: FindSummary[]): string[] {
  if (finds.length === 0) return [];
  const lines = ["finds"];
  for (const item of finds) {
    lines.push(`  ${item.found ? "found" : "missing"}: ${item.query} (${item.matchCount})`);
    for (const match of item.matches.slice(0, 3)) {
      const rank = match.rank ? `${match.rank}. ` : "";
      const url = match.url ? ` <${match.url}>` : "";
      const selector = match.selector ? ` (${match.selector})` : "";
      lines.push(`    ${rank}${match.field}${selector}: ${match.text}${url}`);
    }
  }
  return lines;
}

function formatVerificationText(verification: VerificationSummary): string[] {
  if (verification.status === "not-requested") return [];
  const lines = [
    "verification",
    `  status: ${verification.status}`,
    `  found: ${verification.foundCount}/${verification.requestedCount}`,
  ];
  if (verification.missingQueries.length > 0) lines.push(`  missing: ${verification.missingQueries.join(", ")}`);
  if (verification.bestEvidence) {
    const rank = verification.bestEvidence.rank ? `${verification.bestEvidence.rank}. ` : "";
    const url = verification.bestEvidence.url ? ` <${verification.bestEvidence.url}>` : "";
    lines.push(`  evidence: ${rank}${verification.bestEvidence.field}: ${verification.bestEvidence.text}${url}`);
  }
  if (verification.recommendedAction) {
    lines.push(`  next: ${verification.recommendedAction.action} - ${verification.recommendedAction.reason}`);
    if (verification.recommendedAction.command) lines.push(`  command: ${verification.recommendedAction.command}`);
    if (verification.recommendedAction.commandArgs) lines.push(`  commandArgs: ${formatCommandArgsText(verification.recommendedAction.commandArgs)}`);
  }
  return lines;
}

function formatResultsText(results: ResultSummary[]): string[] {
  if (results.length === 0) return [];
  const lines = ["results"];
  for (const result of results) {
    lines.push(`  ${result.rank}. ${result.title}`);
    lines.push(`     url: ${result.url}`);
    if (result.source) lines.push(`     source: ${result.source}`);
    if (result.sourceType) {
      const hints = result.sourceHints?.length ? ` (${result.sourceHints.join(", ")})` : "";
      lines.push(`     sourceType: ${result.sourceType} ${result.sourceScore ?? 0}${hints}`);
    }
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
        const snippet = linkContextSnippet(current, ancestors);
        const candidate: LinkSummary & { score: number; index: number } = {
          text: cleanLinkText(current.name || current.text || url),
          url,
          role: current.role,
          score: linkScore(current, url, baseUrl, snippet),
          index,
        };
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

function linkScore(node: SemanticNode, url: string, baseUrl: string, snippet = ""): number {
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
  if (isLikelyGlobalNavigationText(text, snippet)) score -= 120;
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
    const source = sourceFromUrl(link.url);
    const sourceProfile = summarizeSourceProfile(link.url, link.text, link.snippet);
    const result: ResultSummary = {
      title: link.text,
      url: link.url,
      source,
      rank: index + 1,
      sourceType: sourceProfile.type,
      sourceScore: sourceProfile.score,
      sourceHints: sourceProfile.hints,
    };
    if (link.snippet) result.snippet = link.snippet;
    return result;
  });
}

function summarizeSearchResults(fetched: Pick<FetchResult, "html" | "finalUrl">, links: LinkSummary[]): ResultSummary[] {
  const linkResults = summarizeResults(links);
  if (!looksLikeKnownSearchUrl(fetched.finalUrl) && !looksLikeGenericSearchUrl(fetched.finalUrl)) return linkResults;
  const extracted = extractSearchResults(fetched.html, fetched.finalUrl);
  if (extracted.length > 0) return extracted;
  return looksLikeKnownSearchUrl(fetched.finalUrl) ? linkResults : [];
}

function annotateResults(results: ResultSummary[], query?: string, findQueries: string[] = []): ResultSummary[] {
  const terms = queryTerms(query);
  if (terms.length === 0 && findQueries.length === 0) return results;
  return results.map((result) => {
    const sourceProfile = summarizeSourceProfile(result.url, result.title, result.snippet);
    const annotated: ResultSummary = {
      ...result,
      sourceType: result.sourceType ?? sourceProfile.type,
      sourceScore: result.sourceScore ?? sourceProfile.score,
      sourceHints: result.sourceHints ?? sourceProfile.hints,
    };
    if (terms.length > 0) {
      const essentialTerms = essentialQueryTerms(terms);
      const matchedTerms = terms.filter((term) => queryTermMatchesResult(term, result, essentialTerms.includes(term)));
      const matchedEssentialTerms = essentialTerms.filter((term) => matchedTerms.includes(term));
      const isLikelyOfficial = likelyOfficialResult(result, terms);
      let relevance: ResultSummary["relevance"] = "low";
      if (matchedTerms.length === terms.length || isLikelyOfficial) relevance = "high";
      else if (matchedTerms.length > 0 && (essentialTerms.length === 0 || matchedEssentialTerms.length > 0)) relevance = "medium";
      annotated.relevance = relevance;
      annotated.matchedTerms = matchedTerms;
      annotated.isLikelyOfficial = isLikelyOfficial;
    }
    const findMatches = matchedFindQueriesForResult(result, findQueries);
    if (findMatches.length > 0) annotated.findMatches = findMatches;
    annotated.selectionReason = searchResultSelectionReason(annotated);
    return annotated;
  });
}

function queryTermMatchesResult(term: string, result: ResultSummary, exactNameRequired = false): boolean {
  if (!exactNameRequired) {
    return normalizeForMatch(`${result.title} ${result.url} ${result.source} ${result.snippet ?? ""}`).includes(normalizeForMatch(term));
  }
  return exactNameMatchesText(term, result.title)
    || exactNameMatchesText(term, result.snippet ?? "")
    || exactNameMatchesSource(term, result.source)
    || exactNameMatchesUrl(term, result.url);
}

function exactNameMatchesText(term: string, text: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  const normalizedText = normalizeForMatch(text);
  const escaped = escapeRegExp(normalizedTerm).replace(/\\-/g, "[-\\s]+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(normalizedText);
}

function exactNameMatchesSource(term: string, source: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  const normalizedSource = normalizeForMatch(source.replace(/^www\./, ""));
  return normalizedSource === normalizedTerm || normalizedSource.startsWith(`${normalizedTerm}-`) || normalizedSource.startsWith(`${normalizedTerm}.`);
}

function exactNameMatchesUrl(term: string, url: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  try {
    const parsed = new URL(url);
    if (exactNameMatchesSource(term, parsed.hostname)) return true;
    const parts = parsed.pathname.split("/").map((part) => normalizeForMatch(decodeURIComponent(part))).filter(Boolean);
    return parts.some((part) => part === normalizedTerm);
  } catch {
    return exactNameMatchesText(term, url);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchResultSelectionReason(result: Pick<ResultSummary, "rank" | "source" | "sourceHints" | "relevance" | "matchedTerms" | "findMatches" | "isLikelyOfficial">): string {
  if (result.findMatches?.length) return `Matches --find: ${result.findMatches.join(", ")}.`;
  if (result.isLikelyOfficial) return "Likely official source for the query.";
  if (result.relevance === "high" && result.matchedTerms?.length) return `High relevance: matched ${result.matchedTerms.join(", ")}.`;
  if (result.relevance === "medium" && result.matchedTerms?.length) return `Medium relevance: matched ${result.matchedTerms.join(", ")}.`;
  if (result.relevance === "low" && result.matchedTerms?.length) return `Low relevance: only matched ${result.matchedTerms.join(", ")}.`;
  if (result.sourceHints?.length) return `Source profile: ${result.sourceHints.join(", ")}.`;
  return `Ranked result ${result.rank} from ${result.source}.`;
}

function sourceLinkSelectionReason(link: Pick<ResultSummary, "source" | "sourceScore" | "sourceHints" | "sourceType"> & { kind?: PageLinkSummary["kind"] }): string {
  const score = typeof link.sourceScore === "number" ? link.sourceScore : 0;
  if (score >= 0.78 && link.sourceHints?.length) return `Strong source candidate: ${link.sourceHints.join(", ")}.`;
  if (score >= 0.5 && link.sourceHints?.length) return `Possible source candidate: ${link.sourceHints.join(", ")}.`;
  if (link.sourceType && link.sourceType !== "unknown") return `Source profile is ${link.sourceType}.`;
  return `${link.kind === "external" ? "External" : "Page"} link from ${link.source}.`;
}

function matchedFindQueriesForResult(result: ResultSummary, findQueries: string[]): string[] {
  if (findQueries.length === 0) return [];
  const haystack = normalizeFindValue(`${result.title} ${result.url} ${result.source} ${result.snippet ?? ""}`);
  return findQueries.filter((query) => {
    const normalizedQuery = normalizeFindValue(query);
    if (!normalizedQuery) return false;
    if (haystack.includes(normalizedQuery)) return true;
    const terms = queryTerms(query).map(normalizeFindValue).filter(Boolean);
    return terms.length > 0 && terms.every((term) => haystack.includes(term));
  });
}

function queryTerms(query?: string): string[] {
  if (!query) return [];
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, ""))
    .filter((term) => term.length >= 2);
  return Array.from(new Set(terms));
}

function essentialQueryTerms(terms: string[]): string[] {
  return terms.filter((term) => /[a-z0-9]-[a-z0-9]/i.test(term));
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[._/]+/g, "-");
}

function likelyOfficialResult(result: ResultSummary, terms: string[]): boolean {
  const source = result.source.replace(/^www\./, "").toLowerCase();
  const url = result.url.toLowerCase();
  const title = result.title.toLowerCase();
  const packageLike = terms.find((term) => /[a-z0-9]-[a-z0-9]/i.test(term)) ?? terms[0];
  if (!packageLike) return false;
  const normalizedPackage = normalizeForMatch(packageLike);
  if (source === "npmjs.com" && url.includes(`/package/${normalizedPackage}`)) return true;
  if (source === "github.com" && (url.includes(`/${normalizedPackage}`) || title.includes(normalizedPackage))) return true;
  if (source === `${normalizedPackage}.com` || source === `${normalizedPackage}.org` || source === `${normalizedPackage}.dev`) return true;
  if (source.startsWith(`${normalizedPackage}.`) || source.startsWith(`docs.${normalizedPackage}.`) || source.startsWith(`platform.${normalizedPackage}.`)) return true;
  return false;
}

function summarizeSourceProfile(url: string, title?: string, snippet?: string): { type: SourceType; score: number; hints: string[] } {
  const hints: string[] = [];
  let type: SourceType = "unknown";
  let score = 0.35;
  let hostname = "";
  let pathname = "";
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return { type, score: 0, hints: ["invalid-url"] };
  }
  const text = `${title ?? ""} ${snippet ?? ""}`.toLowerCase();
  const hostAndPath = `${hostname}${pathname}`;

  const set = (nextType: SourceType, nextScore: number, hint: string): void => {
    if (nextScore >= score) {
      type = nextType;
      score = nextScore;
    }
    hints.push(hint);
  };

  if (/\.(?:gov|go|gob|gouv|go\.kr|gov\.cn|go\.jp)(?:\.|$)/i.test(hostname) || /(?:^|\.)gov\.uk$/.test(hostname)) {
    set("government", 0.95, "government-domain");
  }
  if (/\.(?:edu|ac)(?:\.|$)/i.test(hostname) || /\.(?:ac\.kr|ac\.jp|edu\.cn)$/i.test(hostname)) {
    set("education", 0.86, "education-domain");
  }
  if (/(?:^|\.)wikipedia\.org$|(?:^|\.)wikidata\.org$/.test(hostname)) set("wiki", 0.62, "wiki");
  if (/(?:^|\.)github\.com$|(?:^|\.)gitlab\.com$|(?:^|\.)bitbucket\.org$/.test(hostname)) set("code", 0.72, "code-host");
  if (/(?:^|\.)npmjs\.com$|(?:^|\.)pypi\.org$|(?:^|\.)crates\.io$|(?:^|\.)packagist\.org$/.test(hostname)) set("official", 0.9, "package-registry");
  if (/(?:^|\.)developer\.mozilla\.org$|(?:^|\.)docs\.[^/]+|\/docs?\/|\/documentation\//.test(hostAndPath) || /\b(documentation|docs|api reference)\b/.test(text)) {
    set("documentation", 0.78, "documentation");
  }
  if (/(?:^|\.)x\.com$|(?:^|\.)twitter\.com$|(?:^|\.)instagram\.com$|(?:^|\.)facebook\.com$|(?:^|\.)threads\.net$|(?:^|\.)tiktok\.com$/.test(hostname)) {
    set("social", 0.42, "social-platform");
  }
  if (/(?:^|\.)reddit\.com$|(?:^|\.)dcinside\.com$|(?:^|\.)clien\.net$|(?:^|\.)ruliweb\.com$|(?:^|\.)stackoverflow\.com$|(?:^|\.)news\.ycombinator\.com$/.test(hostname)) {
    set("forum", 0.5, "community");
  }
  if (/(?:news|press|journal|times|일보|신문)/i.test(hostname) || /\b(news|breaking|article)\b/.test(text)) {
    set("news", 0.58, "news-like");
  }
  if (/(?:shop|store|product|pricing|cart|checkout|buy|commerce)/i.test(hostAndPath)) set("commerce", 0.38, "commerce-like");
  if (/(?:^|\.)iana\.org$|(?:^|\.)ietf\.org$|(?:^|\.)w3\.org$|(?:^|\.)whatwg\.org$|(?:^|\.)openai\.com$/.test(hostname)) {
    set("official", 0.92, "official-organization");
  }

  return {
    type,
    score: roundMetric(Math.max(0, Math.min(1, score))),
    hints: Array.from(new Set(hints)).slice(0, 4),
  };
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

function detectSearchEngine(url: string): SearchResultEngine | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.endsWith("baidu.com")) return "baidu";
    if (hostname.endsWith("bing.com")) return "bing";
    if (hostname.endsWith("duckduckgo.com")) return "duckduckgo";
    if (hostname.endsWith("startpage.com")) return "startpage";
    if (hostname.endsWith("search.yahoo.co.jp")) return "yahoo-japan";
    if (looksLikeGenericSearchUrl(url)) return "generic";
    return null;
  } catch {
    return null;
  }
}

function collectResultCards(nodes: AnyNode[], engine: SearchResultEngine): Element[] {
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

function isResultCard(element: Element, engine: SearchResultEngine): boolean {
  if (engine === "baidu") return hasClass(element, "result") || hasClass(element, "c-container");
  if (engine === "bing") return element.name === "li" && hasClass(element, "b_algo");
  if (engine === "duckduckgo") {
    return hasClass(element, "result")
      || hasClass(element, "web-result")
      || hasClass(element, "result__body");
  }
  if (engine === "yahoo-japan") return hasClass(element, "sw-Card") || hasClass(element, "algo") || hasClass(element, "SearchResult");
  if (engine === "generic") {
    return hasClass(element, "result")
      || hasClass(element, "search-result")
      || (element.name === "li" && findElement(element.children, (child) => child.name === "a") !== undefined && findElement(element.children, (child) => child.name === "p") !== undefined);
  }
  return hasClass(element, "w-gl__result")
    || hasClass(element, "result")
    || hasClass(element, "search-result");
}

function resultFromCard(card: Element, baseUrl: string, engine: SearchResultEngine, rank: number): ResultSummary | null {
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

function resultTitleLink(card: Element, engine: SearchResultEngine): Element | undefined {
  if (engine === "baidu" || engine === "bing" || engine === "yahoo-japan") {
    const heading = findElement(card.children, (element) => /^h[1-6]$/.test(element.name));
    const headingLink = heading ? firstUsefulAnchor(heading, "https://example.invalid") : undefined;
    if (headingLink) return headingLink;
  }
  const classMatch = findElement(card.children, (element) => {
    if (element.name !== "a") return false;
    return hasClass(element, "result__a")
      || hasClass(element, "result-title")
      || hasClass(element, "w-gl__result-title")
      || hasClass(element, "c-title")
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
  agentMode = false,
  capturedHtml = false,
  timeoutMs?: number,
  userAgent?: string,
): PageCheckSummary {
  const focusedContent = pageCheckContent(content);
  const primaryLinks = summarizePrimaryPageLinks(links, fetched.finalUrl);
  const fallbackPreview = focusedContent.length > 0
    ? []
    : htmlContentPreview(fetched.html).concat(fallbackPageCheckPreview(fetched, outline, primaryLinks)).slice(0, 4);
  const contentPreview = focusedContent.length > 0
    ? focusedContent.slice(0, 4).map((item) => item.text)
    : fallbackPreview;
  const contentEvidence = focusedContent.length > 0
    ? summarizeContentEvidence(focusedContent)
    : summarizeFallbackEvidence(fallbackPreview);
  const contentLength = contentPreview.reduce((total, text) => total + text.length, 0);
  const sourceLinks = summarizeSourcePageLinks(primaryLinks);
  const pageActions = summarizePageCheckActions(actions);
  const confidence = pageCheckConfidence(contentLength, outline, analysis);
  const readability = summarizeReadability(confidence, contentEvidence, contentLength, sourceLinks, pageActions, analysis);
  const recommendedAction = recommendedPageCheckAction(readability, analysis, fetched.finalUrl, sourceLinks, agentMode, capturedHtml, timeoutMs, userAgent);
  const pageCheck: PageCheckSummary = {
    contentPreview,
    contentEvidence,
    contentLength,
    primaryLinks,
    sourceLinks,
    actions: pageActions,
    confidence,
    readability,
    recommendedAction,
    nextSteps: summarizePageCheckNextSteps(recommendedAction, readability, analysis, fetched.finalUrl, sourceLinks, pageActions, agentMode, capturedHtml, timeoutMs, userAgent),
  };
  if (fetched.page.title) pageCheck.title = fetched.page.title;
  if (fetched.page.canonicalUrl) pageCheck.canonicalUrl = fetched.page.canonicalUrl;
  if (fetched.page.lang) pageCheck.lang = fetched.page.lang;
  const mainHeading = pageMainHeading(outline);
  if (mainHeading) pageCheck.mainHeading = mainHeading;
  return pageCheck;
}

function pageMainHeading(outline: OutlineSummary[]): string | undefined {
  const meaningful = outline.filter((item) => !isLowValueHeadingText(item.text));
  return meaningful.find((item) => item.level === 1)?.text ?? meaningful[0]?.text;
}

function summarizeReadability(
  confidence: PageCheckSummary["confidence"],
  contentEvidence: PageEvidenceSummary[],
  contentLength: number,
  sourceLinks: PageLinkSummary[],
  actions: ActionSummary[],
  analysis: AnalysisSummary,
): PageReadabilitySummary {
  const reasons: string[] = [];
  let score = confidence === "high" ? 0.35 : confidence === "medium" ? 0.22 : 0.08;
  if (contentEvidence.length > 0) {
    const semanticEvidenceCount = contentEvidence.filter((item) => item.role !== "fallback").length;
    const fallbackEvidenceCount = contentEvidence.length - semanticEvidenceCount;
    score += Math.min(0.25, semanticEvidenceCount * 0.08 + fallbackEvidenceCount * 0.02);
    reasons.push(`${contentEvidence.length} content evidence item${contentEvidence.length === 1 ? "" : "s"}`);
  }
  if (contentLength >= 400) {
    score += 0.18;
    reasons.push("substantial extracted text");
  } else if (contentLength >= 120) {
    score += 0.1;
    reasons.push("some extracted text");
  }
  if (sourceLinks.length > 0) {
    score += 0.12;
    reasons.push(analysis.kind === "search-results"
      ? `${sourceLinks.length} search result source${sourceLinks.length === 1 ? "" : "s"}`
      : `${sourceLinks.length} external source link${sourceLinks.length === 1 ? "" : "s"}`);
  }
  if (actions.length > 0 && contentLength < 120) {
    score -= 0.08;
    reasons.push("interaction may be required");
  }
  if (analysis.kind === "blocked-page" || analysis.kind === "empty") {
    if (analysis.kind === "empty" && contentEvidence.length === 0 && contentLength === 0) {
      return {
        level: "low",
        score: 0,
        reasons: ["no page content extracted"],
      };
    }
    score = Math.min(score, 0.18);
    reasons.push("page appears blocked or empty");
  }
  const bounded = Math.max(0, Math.min(1, score));
  return {
    level: bounded >= 0.7 ? "high" : bounded >= 0.4 ? "medium" : "low",
    score: roundMetric(bounded),
    reasons,
  };
}

function summarizeSourcePageLinks(primaryLinks: PageLinkSummary[]): PageLinkSummary[] {
  return primaryLinks
    .filter((link) => link.kind === "external")
    .sort((left, right) => sourceLinkPriority(right) - sourceLinkPriority(left) || left.rank - right.rank)
    .slice(0, 4)
    .map((link, index) => ({ ...link, rank: index + 1 }));
}

function sourceLinkPriority(link: PageLinkSummary): number {
  return (link.sourceScore ?? 0) >= 0.78 ? 1 : 0;
}

function summarizePageCheckActions(actions: ActionSummary[]): ActionSummary[] {
  return actions.filter((action) => !isLowValueAction(action)).slice(0, 5);
}

function isLowValueAction(action: ActionSummary): boolean {
  return /^(toggle navigation|navigation menu|appearance settings|platform|solutions|resources|open source|enterprise|open sidebar|get started|concepts|how-tos|reference|search or ask copilot|search or jump to…|search or jump to|select language:.*|version:.*|resetting focus|textbox|input|button|upvote|downvote|limit my search to .+|t5_[a-z0-9]+|open menu|close menu|hamburger menu|close|검색하기|통합검색|로그인|나중에 하기|메뉴|내비게이션)$/i.test(action.text.trim());
}

function recommendedPageCheckAction(
  readability: PageReadabilitySummary,
  analysis: AnalysisSummary,
  pageUrl: string,
  sourceLinks: PageLinkSummary[],
  agentMode = false,
  capturedHtml = false,
  timeoutMs?: number,
  userAgent?: string,
): SuggestedAction {
  const searchAction = analysis.suggestedActions.find((action) => action.action === "refine-search" || action.action === "open-result");
  if (searchAction) return searchAction;
  if ((analysis.kind === "blocked-page" || analysis.kind === "empty") && !capturedHtml) {
    return {
      action: "retry-with-browser-html",
      reason: "The page is not reliably readable from fetched HTML.",
      url: pageUrl,
      ...commandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    };
  }
  if ((analysis.kind === "blocked-page" || analysis.kind === "empty") && capturedHtml) {
    return {
      action: "inspect-browser-state",
      reason: "Browser-captured HTML still appears blocked or empty; inspect the browser state or capture after interacting.",
      url: pageUrl,
      requiresBrowserInteraction: true,
      ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    };
  }
  if (readability.level === "high" || readability.level === "medium") {
    return {
      action: "read-content",
      reason: "The page has enough structured evidence for source checking.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.contentEvidence",
    };
  }
  if (sourceLinks[0]) {
    return {
      action: "open-source-link",
      reason: "The page has limited readable content, but an external source link is available.",
      url: sourceLinks[0].url,
      rank: sourceLinks[0].rank,
      target: agentTargetFromResult(sourceLinks[0]),
      ...commandFields(pageCommandSpec(sourceLinks[0].url, agentMode, false, [], timeoutMs, userAgent)),
    };
  }
  return {
    action: "inspect-actions-or-open-source-link",
    reason: "The page has limited readable content; inspect available controls or source links before relying on it.",
    url: pageUrl,
    requiresBrowserInteraction: true,
    ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
  };
}

function summarizePageCheckNextSteps(
  recommendedAction: SuggestedAction,
  readability: PageReadabilitySummary,
  analysis: AnalysisSummary,
  pageUrl: string,
  sourceLinks: PageLinkSummary[],
  actions: ActionSummary[],
  agentMode = false,
  capturedHtml = false,
  timeoutMs?: number,
  userAgent?: string,
): SuggestedAction[] {
  const steps: SuggestedAction[] = [];
  const add = (step: SuggestedAction): void => {
    const key = `${step.action}:${step.url ?? ""}:${step.rank ?? ""}:${step.openResult ?? ""}:${step.readFrom ?? ""}`;
    if (steps.some((item) => `${item.action}:${item.url ?? ""}:${item.rank ?? ""}:${item.openResult ?? ""}:${item.readFrom ?? ""}` === key)) return;
    steps.push(step);
  };
  const needsSearchRefinement = analysis.suggestedActions.some((action) => action.action === "refine-search");

  for (const action of analysis.suggestedActions) {
    if (action.action === "open-result" || action.action === "refine-search") add(action);
  }
  add(recommendedAction);
  if (analysis.kind === "search-results") return steps;

  if (!needsSearchRefinement) {
    for (const link of sourceLinks.slice(0, 2)) {
      add({
        action: "open-source-link",
        reason: "Inspect an external source link referenced by the page.",
        url: link.url,
        rank: link.rank,
        target: agentTargetFromResult(link),
        ...commandFields(pageCommandSpec(link.url, agentMode, false, [], timeoutMs, userAgent)),
      });
    }
  }

  if (actions[0] && analysis.kind !== "blocked-page" && analysis.kind !== "empty") {
    add({
      action: "inspect-actions",
      reason: "Visible controls may reveal more content or navigation choices.",
      url: pageUrl,
      requiresBrowserInteraction: true,
      ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    });
  }

  if (readability.level === "low" && analysis.kind !== "blocked-page" && analysis.kind !== "empty" && !capturedHtml) {
    add({
      action: "retry-with-browser-html",
      reason: "Fetched HTML has limited readable evidence; browser-captured HTML may expose more content.",
      url: pageUrl,
      ...commandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    });
  }

  return steps.slice(0, 5);
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function summarizeContentEvidence(content: ContentSummary[]): PageEvidenceSummary[] {
  return content.slice(0, 4).map((item, index) => {
    const score = evidenceScore(item.text, item.role, true, Boolean(item.selector));
    const evidence: PageEvidenceSummary = {
      id: `e${index + 1}`,
      path: `pageCheck.contentEvidence[${index}]`,
      rank: index + 1,
      text: item.text,
      role: item.role,
      source: "semantic",
      score,
      quality: evidenceQuality(score),
      qualityReason: evidenceQualityReason(score, item.text, item.role, true, Boolean(item.selector)),
    };
    if (item.selector) evidence.selector = item.selector;
    return evidence;
  });
}

function summarizeFallbackEvidence(preview: string[]): PageEvidenceSummary[] {
  return preview.map((text, index) => {
    const score = evidenceScore(text, "fallback", false, false);
    return {
      id: `e${index + 1}`,
      path: `pageCheck.contentEvidence[${index}]`,
      rank: index + 1,
      text,
      role: "fallback",
      source: "fallback",
      score,
      quality: evidenceQuality(score),
      qualityReason: evidenceQualityReason(score, text, "fallback", false, false),
    };
  });
}

function evidenceScore(text: string, role: string, semantic: boolean, hasSelector: boolean): number {
  let score = semantic ? 0.58 : 0.24;
  const length = text.length;
  if (length >= 240) score += 0.2;
  else if (length >= 120) score += 0.14;
  else if (length >= 60) score += 0.08;
  if (role === "p" || role === "article") score += 0.12;
  if (hasSelector) score += 0.06;
  return roundMetric(Math.max(0, Math.min(1, score)));
}

function evidenceQuality(score: number): PageEvidenceSummary["quality"] {
  if (score >= 0.76) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function evidenceQualityReason(score: number, text: string, role: string, semantic: boolean, hasSelector: boolean): string {
  const parts = [
    semantic ? "semantic extraction" : "fallback text",
    `${text.length} chars`,
  ];
  if (role === "p" || role === "article") parts.push(`${role} content`);
  if (hasSelector) parts.push("selector available");
  return `${evidenceQuality(score)} evidence from ${parts.join(", ")}.`;
}

function summarizeFinds(
  queries: string[],
  page: PageSummary,
  pageCheck: PageCheckSummary,
  links: LinkSummary[],
  results: ResultSummary[],
  outline: OutlineSummary[],
  content: ContentSummary[],
  kind: ContentKind,
): FindSummary[] {
  if (queries.length === 0) return [];
  const candidates = findCandidates(page, pageCheck, links, results, outline, content, kind);
  return queries.map((query) => {
    const normalizedQuery = normalizeFindValue(query);
    const terms = queryTerms(query).map(normalizeFindValue);
    const matches = candidates.filter((candidate) => {
      const normalizedText = normalizeFindValue(candidate.text);
      if (!normalizedQuery) return false;
      if (normalizedText.includes(normalizedQuery)) return true;
      return terms.length > 0 && terms.every((term) => normalizedText.includes(term));
    }).slice(0, 8);
    return {
      query,
      found: matches.length > 0,
      matchCount: matches.length,
      matches,
    };
  });
}

function summarizeVerification(
  finds: FindSummary[],
  pageCheck: PageCheckSummary,
  pageUrl: string,
  analysis: AnalysisSummary,
  agentMode = false,
  capturedHtml = false,
  sourceSearch?: SourceSearchSummary,
  timeoutMs?: number,
  userAgent?: string,
): VerificationSummary {
  const requestedCount = finds.length;
  const foundQueries = finds.filter((item) => item.found).map((item) => item.query);
  const missingQueries = finds.filter((item) => !item.found).map((item) => item.query);
  const evidenceCount = finds.reduce((total, item) => total + item.matchCount, 0);
  const bestEvidence = finds.find((item) => item.matches[0])?.matches[0];
  const status: VerificationSummary["status"] = requestedCount === 0
    ? "not-requested"
    : missingQueries.length === 0
      ? "matched"
      : foundQueries.length > 0
        ? "partial"
        : "missing";
  const summary: VerificationSummary = {
    status,
    requestedCount,
    foundCount: foundQueries.length,
    missingCount: missingQueries.length,
    evidenceCount,
    foundQueries,
    missingQueries,
  };
  if (bestEvidence) summary.bestEvidence = bestEvidence;
  const recommendedAction = recommendedVerificationAction(status, pageCheck, pageUrl, analysis, agentMode, missingQueries, capturedHtml, sourceSearch, timeoutMs, userAgent);
  if (recommendedAction) summary.recommendedAction = recommendedAction;
  return summary;
}

function recommendedVerificationAction(
  status: VerificationSummary["status"],
  pageCheck: PageCheckSummary,
  pageUrl: string,
  analysis: AnalysisSummary,
  agentMode = false,
  missingQueries: string[] = [],
  capturedHtml = false,
  sourceSearch?: SourceSearchSummary,
  timeoutMs?: number,
  userAgent?: string,
): SuggestedAction | undefined {
  if (status === "not-requested") return undefined;
  const searchAction = analysis.suggestedActions.find((action) => action.action === "refine-search" || action.action === "open-result");
  if (analysis.kind === "search-results" && searchAction) return searchAction;
  if (status === "matched") {
    return {
      action: "use-evidence",
      reason: "All requested text was found in the page summaries.",
      url: pageUrl,
      terminal: true,
      readFrom: "verification.bestEvidence",
    };
  }
  if (searchAction) return searchAction;
  const alternateAction = sourceSearchAlternateAction(sourceSearch, missingQueries, agentMode);
  if (alternateAction) return alternateAction;
  if (pageCheck.sourceLinks[0]) {
    return {
      action: "open-source-link",
      reason: "Some requested text was not found; inspect the strongest external source link.",
      url: pageCheck.sourceLinks[0].url,
      rank: pageCheck.sourceLinks[0].rank,
      target: agentTargetFromResult(pageCheck.sourceLinks[0]),
      ...commandFields(pageCommandSpec(pageCheck.sourceLinks[0].url, agentMode, false, missingQueries, timeoutMs, userAgent)),
    };
  }
  if ((analysis.kind === "blocked-page" || analysis.kind === "empty" || pageCheck.readability.level === "low") && !capturedHtml) {
    return {
      action: "retry-with-browser-html",
      reason: "Requested text was not found and the fetched page may be incomplete.",
      url: pageUrl,
      ...commandFields(pageCommandSpec(pageUrl, agentMode, true, missingQueries, timeoutMs, userAgent)),
    };
  }
  if (analysis.kind === "blocked-page" || analysis.kind === "empty") {
    return {
      action: "inspect-browser-state",
      reason: "Requested text was not found, and browser-captured HTML still appears blocked or empty.",
      url: pageUrl,
      requiresBrowserInteraction: true,
      ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, missingQueries, timeoutMs, userAgent)),
    };
  }
  return {
    action: "broaden-search",
    reason: "Requested text was not found in the current page summaries.",
    ...commandFields(verificationSearchCommandSpec(missingQueries, agentMode, timeoutMs, userAgent)),
  };
}

function sourceSearchAlternateAction(sourceSearch: SourceSearchSummary | undefined, missingQueries: string[], agentMode = false): SuggestedAction | undefined {
  if (!sourceSearch || missingQueries.length === 0) return undefined;
  const alternate = sourceSearch.alternateResults?.find((result) => {
    const matches = result.findMatches ?? matchedFindQueriesForResult(result, missingQueries);
    return matches.some((match) => missingQueries.includes(match));
  });
  const command = alternate
    ? searchOpenCommandSpec(
        sourceSearch.query,
        sourceSearch.selectedEngine ?? sourceSearch.engine,
        missingQueries,
        agentMode,
        sourceSearch.lang,
        sourceSearch.region,
        alternate.rank,
        sourceSearch.timeoutMs,
        sourceSearch.userAgent,
      )
    : undefined;
  if (!alternate || !command) return undefined;
  return {
    action: "open-alternate-result",
    reason: "The opened result did not verify the requested text; an alternate original SERP result matches the missing query.",
    url: alternate.url,
    rank: alternate.rank,
    target: agentTargetFromResult(alternate),
    ...commandFields(command),
  };
}

function summarizeAgent(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  recommendedResult?: ResultSummary,
  error?: { code: CliErrorCode; message: string; status?: number },
  capturedHtml = false,
  sourceSearch?: SourceSearchSummary,
  fetched?: FetchResult,
  requestUrl?: string,
  agentMode = false,
  findQueries: string[] = [],
  timeoutMs?: number,
  userAgent?: string,
): AgentSummary {
  const diagnosticCodes = analysis.diagnostics.map((diagnostic) => diagnostic.code);
  const primaryAction = primaryAgentAction(analysis, pageCheck, verification);
  const hasUsableSearchResults = analysis.kind === "search-results" && results.length > 0;
  const blockedOrEmpty = analysis.kind === "blocked-page" || analysis.kind === "empty";
  const needsBrowserHtml = Boolean(error)
    || (!capturedHtml && blockedOrEmpty)
    || primaryAction?.action === "retry-with-browser-html";
  const canUseFetchedHtml = !needsBrowserHtml && !blockedOrEmpty && (capturedHtml || hasUsableSearchResults || verification.status === "matched" || pageCheck.readability.level !== "low");
  const status = agentStatus(analysis, pageCheck, verification, needsBrowserHtml, error);
  const summary = agentSummaryText(status, analysis, pageCheck, verification, recommendedResult);
  const diagnosticCounts = countDiagnosticsBySeverity(analysis.diagnostics);
  const readTargets = summarizeAgentReadTargets(primaryAction, analysis.kind, pageCheck, verification, results, sourceSearch);
  const bestReadTarget = selectBestReadTarget(readTargets);
  const citations = summarizeAgentCitations(analysis.kind, pageCheck, verification, recommendedResult, sourceSearch);
  const searchDecision = summarizeAgentSearchDecision(analysis, results, recommendedResult, primaryAction);
  const pageDecision = summarizeAgentPageDecision(analysis, pageCheck, primaryAction);
  const next = summarizeAgentNext(primaryAction, readTargets, agentReadValue(primaryAction, pageCheck, verification, results, sourceSearch));
  const expectedOutcome = summarizeAgentExpectedOutcome(primaryAction);
  const answerPlan = summarizeAgentAnswerPlan(status, primaryAction, pageCheck, verification, citations, needsBrowserHtml, error);
  const answerEvidence = summarizeAgentAnswerEvidence(citations, answerPlan);
  const executionPlan = summarizeAgentExecutionPlan(next, expectedOutcome, answerPlan, canUseFetchedHtml, needsBrowserHtml);
  const runbook = summarizeAgentRunbook(next, executionPlan, answerPlan);
  const handoff = summarizeAgentHandoff(next, executionPlan, answerPlan);
  const evidenceQualityScore = averageEvidenceScore(pageCheck.contentEvidence);
  const sourceQualityScore = agentSourceQualityScore(analysis.kind, pageCheck.sourceLinks, results, recommendedResult);
  const usabilityScore = agentUsabilityScore(status, pageCheck, verification, hasUsableSearchResults ? results : [], needsBrowserHtml, error);
  const agent: AgentSummary = {
    contract: agentContract,
    status,
    pageKind: analysis.kind,
    summary,
    routingIntent: agentRoutingIntent(primaryAction),
    continuationMode: agentContinuationMode(primaryAction),
    next,
    runbook,
    handoff,
    expectedOutcome,
    executionPlan,
    answerPlan,
    ...(searchDecision ? { searchDecision } : {}),
    ...(pageDecision ? { pageDecision } : {}),
    signals: summarizeAgentSignals(status, analysis, pageCheck, verification, hasUsableSearchResults ? results : [], needsBrowserHtml, fetched, error),
    qualityGates: summarizeAgentQualityGates(status, analysis, pageCheck, verification, hasUsableSearchResults ? results : [], needsBrowserHtml, error, usabilityScore, evidenceQualityScore, sourceQualityScore),
    canContinue: agentCanContinue(primaryAction),
    canUseFetchedHtml,
    needsBrowserHtml,
    responseStatus: fetched?.status ?? error?.status ?? 0,
    responseOk: fetched ? fetched.status >= 200 && fetched.status < 400 : false,
    responseContentType: fetched?.contentType ?? "",
    finalUrlChanged: Boolean(fetched && requestUrl && fetched.finalUrl !== requestUrl),
    confidence: pageCheck.confidence,
    usabilityScore,
    readability: pageCheck.readability.level,
    readabilityScore: pageCheck.readability.score,
    readabilityReasons: pageCheck.readability.reasons.slice(0, 3),
    verificationStatus: verification.status,
    verificationRequestedCount: verification.requestedCount,
    verificationFoundCount: verification.foundCount,
    verificationMissingCount: verification.missingCount,
    resultCount: hasUsableSearchResults ? results.length : 0,
    resultChoices: summarizeAgentResultChoices(hasUsableSearchResults ? results : [], recommendedResult, primaryAction),
    evidenceCount: pageCheck.contentEvidence.length,
    sourceLinkCount: analysis.kind === "search-results" ? 0 : pageCheck.sourceLinks.length,
    sourceChoices: summarizeAgentSourceChoices(analysis.kind, pageCheck.sourceLinks, primaryAction, agentMode, findQueries, timeoutMs, userAgent),
    evidenceQualityScore,
    sourceQualityScore,
    alternativeActionCount: countAlternativeAgentActions(analysis, pageCheck, verification, primaryAction),
    diagnosticCodes,
    diagnosticErrorCount: diagnosticCounts.error,
    diagnosticWarningCount: diagnosticCounts.warning,
    diagnosticInfoCount: diagnosticCounts.info,
    citations,
    answerEvidence,
    readTargets,
    actions: summarizeAgentActions(analysis, pageCheck, verification, primaryAction),
  };
  if (bestReadTarget) {
    agent.bestReadTarget = bestReadTarget.path;
    if (typeof bestReadTarget.score === "number") agent.bestReadTargetScore = bestReadTarget.score;
    agent.bestReadTargetReason = bestReadTarget.reason;
  }
  if (primaryAction) {
    agent.primaryExecution = actionExecution(primaryAction);
    if (primaryAction.readFrom) agent.primaryReadFrom = primaryAction.readFrom;
    if (primaryAction.command) agent.primaryCommand = primaryAction.command;
    if (primaryAction.commandArgs) agent.primaryCommandArgs = primaryAction.commandArgs;
    if (primaryAction.afterInteractionCommand) agent.primaryAfterInteractionCommand = primaryAction.afterInteractionCommand;
    if (primaryAction.afterInteractionCommandArgs) agent.primaryAfterInteractionCommandArgs = primaryAction.afterInteractionCommandArgs;
    if (primaryAction.url) agent.primaryUrl = primaryAction.url;
    if (primaryAction.rank) agent.primaryRank = primaryAction.rank;
    if (primaryAction.openResult) agent.primaryOpenResult = primaryAction.openResult;
    if (primaryAction.requiresBrowserInteraction) agent.requiresBrowserInteraction = true;
    agent.primaryAction = primaryAction;
  }
  if (recommendedResult) {
    agent.recommendedUrl = recommendedResult.url;
    agent.recommendedTitle = recommendedResult.title;
    agent.recommendedRank = recommendedResult.rank;
    agent.recommendedSource = recommendedResult.source;
    if (recommendedResult.relevance) agent.recommendedRelevance = recommendedResult.relevance;
    if (typeof recommendedResult.isLikelyOfficial === "boolean") agent.recommendedLikelyOfficial = recommendedResult.isLikelyOfficial;
    agent.recommendedSelectionReason = recommendedResult.selectionReason ?? searchResultSelectionReason(recommendedResult);
  } else if (primaryAction?.url) {
    agent.recommendedUrl = primaryAction.url;
  }
  return agent;
}

function summarizeAgentCitations(
  kind: ContentKind,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  recommendedResult?: ResultSummary,
  sourceSearch?: SourceSearchSummary,
): AgentCitation[] {
  const citations: AgentCitation[] = [];
  const add = (citation: AgentCitation): void => {
    if (citations.some((item) => item.kind === citation.kind && item.path === citation.path)) return;
    citations.push(citation);
  };
  if (verification.bestEvidence) {
    add({
      kind: "verification",
      id: "v1",
      path: "verification.bestEvidence",
      confidence: "high",
      reason: "Best matching evidence for the requested verification text.",
      text: verification.bestEvidence.text,
      ...(verification.bestEvidence.url ? { url: verification.bestEvidence.url } : {}),
      ...(typeof verification.bestEvidence.score === "number" ? { score: verification.bestEvidence.score } : {}),
    });
  }
  for (const evidence of pageCheck.contentEvidence.slice(0, 3)) {
    add({
      kind: "content",
      id: evidence.id,
      path: evidence.path,
      confidence: evidence.quality,
      reason: evidence.qualityReason,
      text: evidence.text,
      score: evidence.score,
    });
  }
  if (recommendedResult) {
    add({
      kind: "search-result",
      id: `r${recommendedResult.rank}`,
      path: "recommendedResult",
      confidence: searchCitationConfidence(recommendedResult),
      reason: recommendedResult.selectionReason ?? searchResultSelectionReason(recommendedResult),
      title: recommendedResult.title,
      url: recommendedResult.url,
      ...(typeof recommendedResult.sourceScore === "number" ? { score: recommendedResult.sourceScore } : {}),
    });
  }
  if (sourceSearch?.selectedResult) {
    add({
      kind: "search-result",
      id: sourceSearch.selectedResult.id ?? "selected",
      path: sourceSearch.selectedResult.path ?? "sourceSearch.selectedResult",
      confidence: searchCitationConfidence(sourceSearch.selectedResult),
      reason: sourceSearch.selectedResult.selectionReason ?? searchResultSelectionReason(sourceSearch.selectedResult),
      title: sourceSearch.selectedResult.title,
      url: sourceSearch.selectedResult.url,
      ...(typeof sourceSearch.selectedResult.sourceScore === "number" ? { score: sourceSearch.selectedResult.sourceScore } : {}),
    });
  }
  if (kind !== "search-results") {
    for (const [index, link] of pageCheck.sourceLinks.slice(0, 2).entries()) {
      add({
        kind: "source-link",
        id: `s${index + 1}`,
        path: `pageCheck.sourceLinks[${index}]`,
        confidence: sourceCitationConfidence(link),
        reason: link.selectionReason ?? sourceLinkSelectionReason(link),
        title: link.title,
        url: link.url,
        ...(typeof link.sourceScore === "number" ? { score: link.sourceScore } : {}),
      });
    }
  }
  return citations.slice(0, 6);
}

function summarizeAgentAnswerEvidence(citations: AgentCitation[], answerPlan: AgentAnswerPlan): AgentCitation[] {
  const byId = new Map(citations.map((citation) => [citation.id, citation]));
  return answerPlan.useCitationIds
    .map((id) => byId.get(id))
    .filter((citation): citation is AgentCitation => Boolean(citation));
}

function summarizeAgentResultChoices(
  results: ResultSummary[],
  recommendedResult: ResultSummary | undefined,
  primaryAction: SuggestedAction | undefined,
): AgentResultChoice[] {
  if (results.length === 0) return [];
  return selectCompactSearchResults(results, recommendedResult).map((result, index) => {
    const recommended = Boolean(recommendedResult && result.rank === recommendedResult.rank && result.url === recommendedResult.url);
    const primary = Boolean(primaryAction?.url === result.url || (typeof primaryAction?.rank === "number" && primaryAction.rank === result.rank));
    return {
      id: `r${result.rank}`,
      path: `searchResults[${index}]`,
      title: result.title,
      url: result.url,
      source: result.source,
      rank: result.rank,
      ...(result.sourceType ? { sourceType: result.sourceType } : {}),
      ...(typeof result.sourceScore === "number" ? { sourceScore: result.sourceScore } : {}),
      ...(result.sourceHints?.length ? { sourceHints: result.sourceHints } : {}),
      ...(result.relevance ? { relevance: result.relevance } : {}),
      ...(result.matchedTerms?.length ? { matchedTerms: result.matchedTerms } : {}),
      ...(result.findMatches?.length ? { findMatches: result.findMatches } : {}),
      ...(typeof result.isLikelyOfficial === "boolean" ? { isLikelyOfficial: result.isLikelyOfficial } : {}),
      selectionReason: result.selectionReason ?? searchResultSelectionReason(result),
      ...(recommended ? { recommended: true, recommendedPath: "recommendedResult" } : {}),
      ...(primary ? { primary: true } : {}),
    };
  });
}

function summarizeAgentSourceChoices(
  kind: ContentKind,
  sourceLinks: PageLinkSummary[],
  primaryAction: SuggestedAction | undefined,
  agentMode: boolean,
  findQueries: string[],
  timeoutMs?: number,
  userAgent?: string,
): AgentSourceChoice[] {
  if (kind === "search-results" || sourceLinks.length === 0) return [];
  return sourceLinks.slice(0, 4).map((link, index) => {
    const command = pageCommandSpec(link.url, agentMode, false, findQueries, timeoutMs, userAgent);
    const primary = Boolean(primaryAction?.url === link.url || (typeof primaryAction?.rank === "number" && primaryAction.rank === link.rank));
    return {
      id: `s${index + 1}`,
      path: `pageCheck.sourceLinks[${index}]`,
      title: link.title,
      url: link.url,
      source: link.source,
      rank: link.rank,
      kind: link.kind,
      ...(link.sourceType ? { sourceType: link.sourceType } : {}),
      ...(typeof link.sourceScore === "number" ? { sourceScore: link.sourceScore } : {}),
      ...(link.sourceHints?.length ? { sourceHints: link.sourceHints } : {}),
      ...(link.relevance ? { relevance: link.relevance } : {}),
      ...(link.matchedTerms?.length ? { matchedTerms: link.matchedTerms } : {}),
      ...(link.findMatches?.length ? { findMatches: link.findMatches } : {}),
      ...(typeof link.isLikelyOfficial === "boolean" ? { isLikelyOfficial: link.isLikelyOfficial } : {}),
      selectionReason: link.selectionReason ?? sourceLinkSelectionReason(link),
      ...commandFields(command),
      ...(primary ? { primary: true } : {}),
    };
  });
}

function summarizeAgentQualityGates(
  status: AgentStatus,
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  needsBrowserHtml: boolean,
  error: { code: CliErrorCode; message: string; status?: number } | undefined,
  usabilityScore: number,
  evidenceQualityScore: number,
  sourceQualityScore: number,
): AgentQualityGate[] {
  const gates: AgentQualityGate[] = [];
  gates.push({
    kind: "fetch",
    pass: !error,
    severity: error ? "error" : "info",
    message: error ? `Fetch or extraction failed with ${error.code}.` : "Fetched response was converted into an agent payload.",
    score: error ? 0 : 1,
    path: "agent.responseStatus",
  });
  gates.push({
    kind: "content",
    pass: pageCheck.contentEvidence.length > 0 && pageCheck.readability.level !== "low",
    severity: pageCheck.readability.level === "low" ? "warning" : "info",
    message: `${pageCheck.contentEvidence.length} content evidence item(s); readability is ${pageCheck.readability.level}.`,
    score: evidenceQualityScore,
    path: "pageCheck.contentEvidence",
  });
  gates.push({
    kind: "source",
    pass: analysis.kind === "search-results" || pageCheck.sourceLinks.length > 0,
    severity: analysis.kind === "search-results" || pageCheck.sourceLinks.length > 0 ? "info" : "warning",
    message: analysis.kind === "search-results"
      ? "Search result pages use result choices instead of page source choices."
      : `${pageCheck.sourceLinks.length} source-like link(s) available.`,
    score: sourceQualityScore,
    path: analysis.kind === "search-results" ? "searchResults" : "pageCheck.sourceLinks",
  });
  if (analysis.kind === "search-results") {
    const highRelevanceCount = results.filter((result) => result.relevance === "high").length;
    gates.push({
      kind: "search",
      pass: results.length > 0,
      severity: results.length > 0 ? "info" : "warning",
      message: `${results.length} search result(s) extracted; ${highRelevanceCount} high-relevance result(s).`,
      score: results.length > 0 ? roundMetric(Math.min(1, (highRelevanceCount || results.length) / Math.max(1, results.length))) : 0,
      path: "searchResults",
    });
  }
  if (verification.status !== "not-requested") {
    gates.push({
      kind: "verification",
      pass: verification.status === "matched",
      severity: verification.status === "matched" ? "info" : verification.status === "partial" ? "warning" : "error",
      message: `${verification.foundCount}/${verification.requestedCount} requested verification text(s) found.`,
      score: verification.requestedCount > 0 ? roundMetric(verification.foundCount / verification.requestedCount) : 1,
      path: verification.bestEvidence ? "verification.bestEvidence" : "verification",
    });
  }
  gates.push({
    kind: "browser",
    pass: !needsBrowserHtml,
    severity: needsBrowserHtml ? "warning" : "info",
    message: needsBrowserHtml ? "Browser-captured HTML or browser inspection is needed." : "Fetched HTML is usable without browser capture.",
    score: needsBrowserHtml ? 0 : 1,
    path: "agent.needsBrowserHtml",
  });
  if (analysis.diagnostics.length > 0) {
    const highestSeverity = analysis.diagnostics.some((item) => item.severity === "error")
      ? "error"
      : analysis.diagnostics.some((item) => item.severity === "warning") ? "warning" : "info";
    gates.push({
      kind: "diagnostic",
      pass: highestSeverity !== "error",
      severity: highestSeverity,
      message: `${analysis.diagnostics.length} diagnostic item(s): ${analysis.diagnostics.map((item) => item.code).slice(0, 3).join(", ")}.`,
      score: highestSeverity === "error" ? 0 : highestSeverity === "warning" ? 0.5 : 1,
      path: "diagnostics",
    });
  }
  gates.push({
    kind: "status",
    pass: status === "ready" || status === "choose-result",
    severity: status === "error" || status === "needs-browser" ? "error" : status === "verify" ? "warning" : "info",
    message: `Overall agent status is ${status}; usability score is ${usabilityScore}.`,
    score: usabilityScore,
    path: "agent.status",
  });
  return gates;
}

function summarizeAgentSearchDecision(
  analysis: AnalysisSummary,
  results: ResultSummary[],
  recommendedResult: ResultSummary | undefined,
  primaryAction: SuggestedAction | undefined,
): AgentSearchDecision | undefined {
  if (analysis.kind !== "search-results") return undefined;
  const highRelevanceCount = results.filter((result) => result.relevance === "high").length;
  const mediumRelevanceCount = results.filter((result) => result.relevance === "medium").length;
  const lowRelevanceCount = results.filter((result) => result.relevance === "low").length;
  const officialCount = results.filter((result) => result.isLikelyOfficial).length;
  const findMatchCount = results.filter((result) => (result.findMatches?.length ?? 0) > 0).length;
  if (recommendedResult && primaryAction?.action === "open-result") {
    return {
      decision: "open-result",
      confidence: searchDecisionConfidence(recommendedResult),
      reason: recommendedResult.selectionReason ?? searchResultSelectionReason(recommendedResult),
      resultCount: results.length,
      highRelevanceCount,
      mediumRelevanceCount,
      lowRelevanceCount,
      officialCount,
      findMatchCount,
      recommendedRank: recommendedResult.rank,
      recommendedUrl: recommendedResult.url,
      ...(primaryAction.command ? { command: primaryAction.command } : {}),
      ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    };
  }
  if (primaryAction?.action === "refine-search") {
    return {
      decision: "refine-search",
      confidence: "low",
      reason: primaryAction.reason,
      resultCount: results.length,
      highRelevanceCount,
      mediumRelevanceCount,
      lowRelevanceCount,
      officialCount,
      findMatchCount,
      ...(primaryAction.command ? { command: primaryAction.command } : {}),
      ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    };
  }
  return {
    decision: "none",
    confidence: "low",
    reason: results.length > 0 ? "Search results were extracted, but no executable search decision was selected." : "No search results were extracted.",
    resultCount: results.length,
    highRelevanceCount,
    mediumRelevanceCount,
    lowRelevanceCount,
    officialCount,
    findMatchCount,
  };
}

function searchDecisionConfidence(result: ResultSummary): AgentSearchDecision["confidence"] {
  if (result.findMatches?.length || result.isLikelyOfficial || result.relevance === "high") return "high";
  if (result.relevance === "medium" || (result.sourceScore ?? 0) >= 0.5) return "medium";
  return "low";
}

function summarizeAgentPageDecision(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  primaryAction: SuggestedAction | undefined,
): AgentPageDecision | undefined {
  if (analysis.kind === "search-results") return undefined;
  const pageAction = primaryAction?.action === "use-evidence" ? pageCheck.recommendedAction : primaryAction;
  const evidenceQualityScore = averageEvidenceScore(pageCheck.contentEvidence);
  const sourceQualityScore = agentSourceQualityScore(analysis.kind, pageCheck.sourceLinks, []);
  const base = {
    readability: pageCheck.readability.level,
    readabilityScore: pageCheck.readability.score,
    evidenceCount: pageCheck.contentEvidence.length,
    evidenceQualityScore,
    sourceLinkCount: pageCheck.sourceLinks.length,
    sourceQualityScore,
  };
  if (pageAction?.action === "read-content") {
    return {
      decision: "read-content",
      confidence: pageDecisionConfidence(pageCheck, sourceQualityScore),
      reason: pageAction.reason,
      ...base,
      ...(pageAction.readFrom ? { readFrom: pageAction.readFrom } : {}),
      ...(pageAction.url ? { url: pageAction.url } : {}),
    };
  }
  if (pageAction?.action === "open-source-link") {
    return {
      decision: "open-source-link",
      confidence: sourceQualityScore >= 0.78 ? "high" : sourceQualityScore >= 0.5 ? "medium" : "low",
      reason: pageAction.reason,
      ...base,
      ...(pageAction.url ? { url: pageAction.url } : {}),
      ...(pageAction.command ? { command: pageAction.command } : {}),
      ...(pageAction.commandArgs ? { commandArgs: pageAction.commandArgs } : {}),
    };
  }
  if (pageAction?.action === "retry-with-browser-html") {
    return {
      decision: "retry-with-browser-html",
      confidence: "low",
      reason: pageAction.reason,
      ...base,
      ...(pageAction.url ? { url: pageAction.url } : {}),
      ...(pageAction.command ? { command: pageAction.command } : {}),
      ...(pageAction.commandArgs ? { commandArgs: pageAction.commandArgs } : {}),
    };
  }
  if (pageAction?.requiresBrowserInteraction || actionExecution(pageAction ?? pageCheck.recommendedAction) === "interact-browser") {
    return {
      decision: "inspect-actions",
      confidence: "low",
      reason: pageAction?.reason ?? pageCheck.recommendedAction.reason,
      ...base,
      ...(pageAction?.url ? { url: pageAction.url } : {}),
    };
  }
  return {
    decision: "none",
    confidence: "low",
    reason: "No page-level decision was selected.",
    ...base,
  };
}

function summarizeAgentExecutionPlan(
  next: AgentNext,
  expectedOutcome: AgentExpectedOutcome,
  answerPlan: AgentAnswerPlan,
  canUseFetchedHtml: boolean,
  needsBrowserHtml: boolean,
): AgentExecutionPlan {
  const operation = agentExecutionOperation(next);
  return {
    operation,
    confidence: executionPlanConfidence(operation, answerPlan, canUseFetchedHtml, needsBrowserHtml),
    reason: executionPlanReason(operation, next, answerPlan),
    useFetchedHtml: canUseFetchedHtml,
    needsBrowserHtml,
    answerReady: answerPlan.status === "ready",
    terminal: next.loop.terminal,
    shouldContinue: next.loop.shouldContinue,
    maxSuggestedIterations: next.loop.maxSuggestedIterations,
    expectedOutcome: expectedOutcome.kind,
    ...(next.readFrom ? { readFrom: next.readFrom } : {}),
    ...(next.command ? { command: next.command } : {}),
    ...(next.commandArgs ? { commandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { afterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { afterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.url ? { url: next.url } : {}),
    ...(next.browserHtml ? { browserHtml: next.browserHtml } : {}),
  };
}

function summarizeAgentRunbook(
  next: AgentNext,
  executionPlan: AgentExecutionPlan,
  answerPlan: AgentAnswerPlan,
): AgentRunbook {
  return {
    decision: next.loop.decision,
    mode: next.mode,
    operation: executionPlan.operation,
    ...(next.action ? { action: next.action } : {}),
    reason: next.loop.reason || next.reason,
    confidence: executionPlan.confidence,
    answerStatus: answerPlan.status,
    answerReady: executionPlan.answerReady,
    shouldContinue: next.loop.shouldContinue,
    terminal: next.loop.terminal,
    maxSuggestedIterations: next.loop.maxSuggestedIterations,
    useFetchedHtml: executionPlan.useFetchedHtml,
    needsBrowserHtml: executionPlan.needsBrowserHtml,
    expectedOutcome: executionPlan.expectedOutcome,
    ...(next.command ? { command: next.command } : {}),
    ...(next.commandArgs ? { commandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { afterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { afterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.readFrom ? { readFrom: next.readFrom } : {}),
    ...(next.readValue ? { readValue: next.readValue } : {}),
    ...(next.url ? { url: next.url } : {}),
    ...(next.target ? { target: next.target } : {}),
    ...(next.browserHtml ? { browserHtml: next.browserHtml } : {}),
  };
}

function summarizeAgentHandoff(
  next: AgentNext,
  executionPlan: AgentExecutionPlan,
  answerPlan: AgentAnswerPlan,
): AgentHandoff {
  return {
    instruction: agentHandoffInstruction(next, executionPlan, answerPlan),
    decision: next.loop.decision,
    mode: next.mode,
    operation: executionPlan.operation,
    ...(next.action ? { action: next.action } : {}),
    confidence: executionPlan.confidence,
    ...(next.priority ? { priority: next.priority } : {}),
    ...(next.priorityReason ? { priorityReason: next.priorityReason } : {}),
    answerStatus: answerPlan.status,
    answerReady: executionPlan.answerReady,
    shouldContinue: next.loop.shouldContinue,
    terminal: next.loop.terminal,
    maxSuggestedIterations: next.loop.maxSuggestedIterations,
    expectedOutcome: executionPlan.expectedOutcome,
    reason: next.loop.reason || next.reason || executionPlan.reason,
    ...(answerPlan.useCitationIds.length > 0 ? { useCitationIds: answerPlan.useCitationIds } : {}),
    ...(next.readTarget ? { readTarget: next.readTarget } : {}),
    ...(next.readFrom ? { readFrom: next.readFrom } : {}),
    ...(next.command ? { command: next.command } : {}),
    ...(next.commandArgs ? { commandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { afterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { afterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.url ? { url: next.url } : {}),
    ...(next.target ? { target: next.target } : {}),
    ...(next.browserHtml ? { browserHtml: next.browserHtml } : {}),
  };
}

function agentHandoffInstruction(next: AgentNext, executionPlan: AgentExecutionPlan, answerPlan: AgentAnswerPlan): string {
  if (answerPlan.status === "ready") {
    const citations = answerPlan.useCitationIds.length > 0 ? ` using citations ${answerPlan.useCitationIds.join(", ")}` : "";
    const readFrom = answerPlan.readFrom ? ` from ${answerPlan.readFrom}` : "";
    return `Answer now${readFrom}${citations}.`;
  }
  if (executionPlan.operation === "execute-command" && next.command) {
    return `Run ${formatShellCommandForInstruction(next.command, next.commandArgs)} and continue with its output.`;
  }
  if (executionPlan.operation === "capture-browser-html" && next.browserHtml) {
    return `Capture rendered HTML into ${next.browserHtml.htmlFile}, then run ${formatShellCommandForInstruction(next.browserHtml.command ?? next.command ?? "ax-grep", next.browserHtml.commandArgs ?? next.commandArgs)}.`;
  }
  if (executionPlan.operation === "inspect-browser") return "Inspect the page in a browser before answering.";
  if (executionPlan.operation === "inspect-output") return "Inspect the command output before answering.";
  if (next.readFrom) return `Read ${next.readFrom} before answering.`;
  return answerPlan.gaps[0] ?? executionPlan.reason;
}

function formatShellCommandForInstruction(command: string, args: string[] | undefined): string {
  if (!args || args.length === 0 || command.includes(" ")) return command;
  return [command, ...args.map(shellQuote)].join(" ");
}

function agentExecutionOperation(next: AgentNext): AgentExecutionPlan["operation"] {
  if (next.loop.decision === "return") return "return";
  if (next.loop.decision === "execute") return "execute-command";
  if (next.loop.decision === "browser") return next.mode === "capture-html" ? "capture-browser-html" : "inspect-browser";
  if (next.loop.decision === "inspect") return "inspect-output";
  return "stop";
}

function executionPlanConfidence(
  operation: AgentExecutionPlan["operation"],
  answerPlan: AgentAnswerPlan,
  canUseFetchedHtml: boolean,
  needsBrowserHtml: boolean,
): AgentExecutionPlan["confidence"] {
  if (needsBrowserHtml || operation === "capture-browser-html" || operation === "inspect-browser") return "low";
  if (operation === "return" && answerPlan.status === "ready") return answerPlan.confidence;
  if (operation === "execute-command" && canUseFetchedHtml) return "medium";
  if (answerPlan.status === "error") return "low";
  return canUseFetchedHtml ? "medium" : "low";
}

function executionPlanReason(operation: AgentExecutionPlan["operation"], next: AgentNext, answerPlan: AgentAnswerPlan): string {
  if (operation === "return" && answerPlan.status === "ready") return answerPlan.reason;
  if (operation === "capture-browser-html") return "Fetch output is not reliable enough; capture rendered HTML and rerun the provided command.";
  if (operation === "inspect-browser") return "Static extraction needs browser interaction or inspection before continuing.";
  return next.reason;
}

function pageDecisionConfidence(pageCheck: PageCheckSummary, sourceQualityScore: number): AgentPageDecision["confidence"] {
  const evidenceQualityScore = averageEvidenceScore(pageCheck.contentEvidence);
  if (pageCheck.readability.level === "high" && evidenceQualityScore >= 0.76) return "high";
  if (pageCheck.readability.level !== "low" && (evidenceQualityScore >= 0.5 || sourceQualityScore >= 0.5)) return "medium";
  return "low";
}

function searchCitationConfidence(result: ResultSummary): NonNullable<AgentCitation["confidence"]> {
  if (result.findMatches?.length || result.isLikelyOfficial || result.relevance === "high") return "high";
  if (result.relevance === "medium" || (result.sourceScore ?? 0) >= 0.5) return "medium";
  return "low";
}

function sourceCitationConfidence(link: PageLinkSummary): NonNullable<AgentCitation["confidence"]> {
  if ((link.sourceScore ?? 0) >= 0.78) return "high";
  if ((link.sourceScore ?? 0) >= 0.5) return "medium";
  return "low";
}

function summarizeAgentAnswerPlan(
  status: AgentStatus,
  primaryAction: SuggestedAction | undefined,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  citations: AgentCitation[],
  needsBrowserHtml: boolean,
  error?: { code: CliErrorCode; message: string; status?: number },
): AgentAnswerPlan {
  const actionFields = answerPlanActionFields(primaryAction);
  const citationIds = citations
    .filter((citation) => citation.kind === "verification" || citation.kind === "content")
    .map((citation) => citation.id)
    .slice(0, 4);
  if (needsBrowserHtml || status === "needs-browser") {
    return {
      status: "blocked",
      confidence: "low",
      reason: "Browser-captured HTML or browser inspection is needed before answering.",
      gaps: error
        ? [`Extraction failed with ${error.code}.`, "Browser-captured HTML or browser inspection is needed."]
        : ["Browser-captured HTML or browser inspection is needed."],
      useCitationIds: [],
      ...actionFields,
    };
  }
  if (error) {
    return {
      status: "error",
      confidence: "low",
      reason: `Extraction failed with ${error.code}.`,
      gaps: [`Extraction failed with ${error.code}.`],
      useCitationIds: [],
      ...actionFields,
    };
  }
  if (verification.status === "matched") {
    return {
      status: "ready",
      confidence: "high",
      reason: "Requested verification text was found; answer from the listed citations.",
      gaps: [],
      useCitationIds: citationIds,
      ...actionFields,
    };
  }
  if (primaryAction && actionExecution(primaryAction) === "read-current" && pageCheck.contentEvidence.length > 0 && pageCheck.readability.level !== "low") {
    return {
      status: "ready",
      confidence: answerPlanReadConfidence(pageCheck),
      reason: "Readable page evidence is available; answer from the listed citations.",
      gaps: answerPlanReadGaps(pageCheck, citationIds),
      useCitationIds: citationIds,
      ...actionFields,
    };
  }
  return {
    status: "needs-more",
    confidence: citationIds.length > 0 ? "medium" : "low",
    reason: "Follow the next action before producing a final answer.",
    gaps: answerPlanFollowupGaps(pageCheck, verification, citationIds),
    useCitationIds: citationIds,
    ...actionFields,
  };
}

function answerPlanReadConfidence(pageCheck: PageCheckSummary): AgentAnswerPlan["confidence"] {
  if (pageCheck.readability.level === "high" && averageEvidenceScore(pageCheck.contentEvidence) >= 0.76) return "high";
  return "medium";
}

function answerPlanReadGaps(pageCheck: PageCheckSummary, citationIds: string[]): string[] {
  const gaps: string[] = [];
  if (citationIds.length === 0) gaps.push("No citeable content evidence was shortlisted.");
  if (pageCheck.sourceLinks.length === 0) gaps.push("No external source-like links were found.");
  if (pageCheck.readability.level !== "high") gaps.push(`Page readability is ${pageCheck.readability.level}.`);
  return gaps.slice(0, 3);
}

function answerPlanFollowupGaps(pageCheck: PageCheckSummary, verification: VerificationSummary, citationIds: string[]): string[] {
  const gaps: string[] = [];
  if (verification.missingQueries.length > 0) gaps.push(`Missing verification text: ${verification.missingQueries.join(", ")}.`);
  if (citationIds.length === 0) gaps.push("No citeable current-payload evidence is ready.");
  if (pageCheck.readability.level === "low") gaps.push("Current page readability is low.");
  gaps.push("A follow-up action is required before final answering.");
  return gaps.slice(0, 4);
}

function answerPlanActionFields(primaryAction: SuggestedAction | undefined): Pick<AgentAnswerPlan, "nextAction" | "command" | "commandArgs" | "afterInteractionCommand" | "afterInteractionCommandArgs" | "url" | "readFrom"> {
  if (!primaryAction) return {};
  return {
    ...(primaryAction.action ? { nextAction: primaryAction.action } : {}),
    ...(primaryAction.command ? { command: primaryAction.command } : {}),
    ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    ...(primaryAction.afterInteractionCommand ? { afterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
    ...(primaryAction.afterInteractionCommandArgs ? { afterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    ...(primaryAction.url ? { url: primaryAction.url } : {}),
    ...(primaryAction.readFrom ? { readFrom: primaryAction.readFrom } : {}),
  };
}

function summarizeAgentReadTargets(
  primaryAction: SuggestedAction | undefined,
  kind: ContentKind,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  sourceSearch?: SourceSearchSummary,
): AgentReadTarget[] {
  const targets: AgentReadTarget[] = [];
  const add = (target: AgentReadTarget): void => {
    if (targets.some((item) => item.path === target.path)) return;
    targets.push(target);
  };
  const primaryReadFrom = primaryAction && actionExecution(primaryAction) === "read-current" ? primaryAction.readFrom : undefined;
  if (verification.bestEvidence) {
    add({
      path: "verification.bestEvidence",
      reason: "Best matching evidence for the requested --find text.",
      count: 1,
      ...(typeof verification.bestEvidence.score === "number" ? { score: verification.bestEvidence.score } : {}),
      ...(primaryReadFrom === "verification.bestEvidence" ? { primary: true } : {}),
    });
  }
  if (pageCheck.contentEvidence.length > 0) {
    add({
      path: "pageCheck.contentEvidence",
      reason: "Structured page excerpts suitable for source checking.",
      count: pageCheck.contentEvidence.length,
      score: averageEvidenceScore(pageCheck.contentEvidence),
      ...(primaryReadFrom === "pageCheck.contentEvidence" ? { primary: true } : {}),
    });
  }
  if (sourceSearch?.selectedResult) {
    add({
      path: "sourceSearch.selectedResult",
      reason: "Original SERP metadata for the result that produced the current page.",
      count: 1,
      ...(typeof sourceSearch.selectedResult.sourceScore === "number" ? { score: sourceSearch.selectedResult.sourceScore } : {}),
    });
  }
  if (kind === "search-results" && results.length > 0) {
    add({
      path: "searchResults",
      reason: "Ranked search result cards extracted from the current result page.",
      count: results.length,
    });
  }
  if (primaryAction?.action === "open-alternate-result" && sourceSearch?.alternateResults?.length) {
    add({
      path: "sourceSearch.alternateResults",
      reason: "Original SERP candidates available for recovery after the selected result failed or did not verify.",
      count: sourceSearch.alternateResults.length,
      score: averageResultSourceScore(sourceSearch.alternateResults),
    });
  }
  if (kind !== "search-results" && pageCheck.sourceLinks.length > 0) {
    add({
      path: "pageCheck.sourceLinks",
      reason: "External source-like links referenced by the page.",
      count: pageCheck.sourceLinks.length,
      score: roundMetric(pageCheck.sourceLinks.reduce((total, link) => total + (link.sourceScore ?? 0), 0) / pageCheck.sourceLinks.length),
    });
  }
  return targets.slice(0, 4);
}

function agentCanContinue(primaryAction: SuggestedAction | undefined): boolean {
  if (!primaryAction) return false;
  return actionExecution(primaryAction) !== "inspect-output";
}

function agentRoutingIntent(primaryAction: SuggestedAction | undefined): AgentRoutingIntent {
  if (!primaryAction) return "none";
  if (primaryAction.action === "retry-with-browser-html") return "browser-html";
  if (primaryAction.requiresBrowserInteraction || actionExecution(primaryAction) === "interact-browser") return "browser-interaction";
  if (primaryAction.action === "read-content" || primaryAction.action === "use-evidence" || actionExecution(primaryAction) === "read-current") return "read-current";
  if (primaryAction.action === "refine-search" || primaryAction.action === "broaden-search" || primaryAction.action === "check-url-or-search") return "search";
  if (primaryAction.action === "open-result" || primaryAction.action === "open-alternate-result" || primaryAction.action === "open-source-link" || primaryAction.url) return "open-url";
  if (actionExecution(primaryAction) === "inspect-output") return "inspect-output";
  return "open-url";
}

function agentContinuationMode(primaryAction: SuggestedAction | undefined): AgentContinuationMode {
  if (!primaryAction) return "stop";
  const routingIntent = agentRoutingIntent(primaryAction);
  if (routingIntent === "browser-html") return "capture-html";
  if (routingIntent === "browser-interaction") return "browser";
  const execution = actionExecution(primaryAction);
  if (execution === "read-current") return "read";
  if (execution === "inspect-output") return "inspect";
  if (execution === "run-command") return "command";
  return agentCanContinue(primaryAction) ? "command" : "stop";
}

function summarizeAgentNext(
  primaryAction: SuggestedAction | undefined,
  readTargets: AgentReadTarget[] = [],
  readValue?: AgentReadValue,
): AgentNext {
  if (!primaryAction) {
    return {
      mode: "stop",
      reason: "No follow-up action is available.",
      loop: summarizeAgentLoop(undefined),
    };
  }
  const readTarget = primaryAction.readFrom
    ? readTargets.find((target) => target.path === primaryAction.readFrom)
    : undefined;
  return {
    mode: agentContinuationMode(primaryAction),
    action: primaryAction.action,
    reason: primaryAction.reason,
    loop: summarizeAgentLoop(primaryAction),
    execution: actionExecution(primaryAction),
    priority: primaryAction.priority ?? actionPriority(primaryAction),
    priorityReason: primaryAction.priorityReason ?? actionPriorityReason(primaryAction),
    ...(primaryAction.url ? { url: primaryAction.url } : {}),
    ...(primaryAction.rank ? { rank: primaryAction.rank } : {}),
    ...(primaryAction.openResult ? { openResult: primaryAction.openResult } : {}),
    ...(primaryAction.readFrom ? { readFrom: primaryAction.readFrom } : {}),
    ...(primaryAction.command ? { command: primaryAction.command } : {}),
    ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    ...(primaryAction.afterInteractionCommand ? { afterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
    ...(primaryAction.afterInteractionCommandArgs ? { afterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    ...(primaryAction.requiresBrowserInteraction ? { requiresBrowserInteraction: true } : {}),
    ...(primaryAction.terminal ? { terminal: true } : {}),
    ...(readTarget ? { readTarget } : {}),
    ...(readValue ? { readValue } : {}),
    ...(primaryAction.target ? { target: primaryAction.target } : {}),
    ...agentBrowserHtmlCaptureFields(primaryAction),
  };
}

function agentBrowserHtmlCaptureFields(primaryAction: SuggestedAction): { browserHtml?: AgentBrowserHtmlCapture } {
  if (primaryAction.action !== "retry-with-browser-html" && !primaryAction.afterInteractionCommandArgs) return {};
  return {
    browserHtml: {
      ...(primaryAction.url ? { url: primaryAction.url } : {}),
      htmlFile: "captured.html",
      captureScript: "document.documentElement.outerHTML",
      ...(primaryAction.command ? { command: primaryAction.command } : {}),
      ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
      ...(primaryAction.afterInteractionCommand ? { afterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
      ...(primaryAction.afterInteractionCommandArgs ? { afterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    },
  };
}

function summarizeAgentLoop(primaryAction: SuggestedAction | undefined): AgentLoopDirective {
  if (!primaryAction) {
    return {
      decision: "stop",
      shouldContinue: false,
      terminal: true,
      reason: "No follow-up action is available.",
      maxSuggestedIterations: 0,
    };
  }
  const mode = agentContinuationMode(primaryAction);
  if (mode === "read") {
    return {
      decision: "return",
      shouldContinue: false,
      terminal: true,
      reason: primaryAction.readFrom
        ? `Return the resolved value for ${primaryAction.readFrom}.`
        : "Return the current payload evidence.",
      maxSuggestedIterations: 0,
    };
  }
  if (mode === "stop") {
    return {
      decision: "stop",
      shouldContinue: false,
      terminal: true,
      reason: primaryAction.reason,
      maxSuggestedIterations: 0,
    };
  }
  if (mode === "browser" || mode === "capture-html") {
    return {
      decision: "browser",
      shouldContinue: true,
      terminal: false,
      reason: mode === "capture-html"
        ? "Capture rendered HTML, rerun the provided command, and inspect the next agent payload."
        : "Use browser interaction or inspection before continuing.",
      maxSuggestedIterations: 1,
    };
  }
  if (mode === "inspect") {
    return {
      decision: "inspect",
      shouldContinue: false,
      terminal: false,
      reason: "Inspect the current payload before choosing a follow-up action.",
      maxSuggestedIterations: 0,
    };
  }
  return {
    decision: "execute",
    shouldContinue: true,
    terminal: false,
    reason: "Run the provided command and inspect the next agent payload.",
    maxSuggestedIterations: 1,
  };
}

function agentReadValue(
  primaryAction: SuggestedAction | undefined,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  sourceSearch?: SourceSearchSummary,
): AgentReadValue | undefined {
  if (!primaryAction?.readFrom || actionExecution(primaryAction) !== "read-current") return undefined;
  const path = primaryAction.readFrom;
  if (path === "verification.bestEvidence" && verification.bestEvidence) return { path, value: verification.bestEvidence };
  if (path === "pageCheck.contentEvidence") return { path, value: pageCheck.contentEvidence };
  if (path === "searchResults") return { path, value: results };
  if (path === "sourceSearch.selectedResult" && sourceSearch?.selectedResult) return { path, value: sourceSearch.selectedResult };
  if (path === "sourceSearch.alternateResults" && sourceSearch?.alternateResults) return { path, value: sourceSearch.alternateResults };
  if (path === "pageCheck.sourceLinks") return { path, value: pageCheck.sourceLinks };
  return undefined;
}

function summarizeAgentExpectedOutcome(primaryAction: SuggestedAction | undefined): AgentExpectedOutcome {
  if (!primaryAction) {
    return {
      kind: "stop",
      message: "No follow-up action is available.",
    };
  }
  if (primaryAction.action === "retry-with-browser-html") {
    return {
      kind: "capture-html",
      message: "Capture rendered browser HTML, rerun the provided command, and expect a readable agent payload.",
    };
  }
  if (primaryAction.requiresBrowserInteraction || actionExecution(primaryAction) === "interact-browser") {
    return {
      kind: "browser-inspection",
      message: "Use a browser session to inspect or interact with the page state before retrying extraction.",
    };
  }
  if (actionExecution(primaryAction) === "read-current") {
    return {
      kind: "read-evidence",
      message: primaryAction.readFrom
        ? `Read ${primaryAction.readFrom} from the current payload and treat it as the next evidence source.`
        : "Read the current payload evidence before running another command.",
    };
  }
  if (primaryAction.action === "refine-search" || primaryAction.action === "broaden-search" || primaryAction.action === "check-url-or-search") {
    return {
      kind: "run-search",
      message: "Run the provided search command and expect a new ranked result payload.",
    };
  }
  if (primaryAction.action === "retry-later") {
    return {
      kind: "retry-fetch",
      message: "Retry the same URL with the provided command and expect a fresh page check payload.",
    };
  }
  if (primaryAction.action === "open-result" || primaryAction.action === "open-alternate-result" || primaryAction.action === "open-source-link" || primaryAction.url) {
    return {
      kind: "open-result",
      message: "Open the target URL with the provided command and expect the resulting page check or verification payload.",
    };
  }
  if (actionExecution(primaryAction) === "inspect-output") {
    return {
      kind: "inspect-output",
      message: "Inspect the current diagnostics and output before choosing a follow-up action.",
    };
  }
  return {
    kind: "inspect-output",
    message: "Inspect the current payload before choosing a follow-up action.",
  };
}

function summarizeAgentSignals(
  status: AgentStatus,
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  needsBrowserHtml: boolean,
  fetched?: FetchResult,
  error?: { code: CliErrorCode; message: string; status?: number },
): AgentSignal[] {
  const signals: AgentSignal[] = [];
  const add = (signal: AgentSignal): void => {
    if (signals.some((item) => item.kind === signal.kind && item.message === signal.message)) return;
    signals.push(signal);
  };

  if (error) {
    add({ kind: "diagnostic", severity: "error", message: `${error.code}: ${error.message}` });
  } else if (fetched && (fetched.status < 200 || fetched.status >= 400)) {
    add({ kind: "response", severity: fetched.status >= 500 ? "error" : "warning", message: `HTTP ${fetched.status} response from fetched page.` });
  }

  if (needsBrowserHtml) {
    add({ kind: "browser", severity: "warning", message: "Browser-captured HTML is recommended before trusting page content." });
  } else if (pageCheck.readability.level !== "low") {
    add({
      kind: "content",
      severity: "info",
      message: `Fetched HTML is ${pageCheck.readability.level} readability with ${pageCheck.contentEvidence.length} evidence item(s).`,
    });
  } else if (pageCheck.contentEvidence.length > 0) {
    add({
      kind: "content",
      severity: "warning",
      message: `Fetched HTML has low readability but ${pageCheck.contentEvidence.length} evidence item(s) were extracted.`,
    });
  } else if (status !== "choose-result") {
    add({ kind: "content", severity: "warning", message: "Fetched HTML has low readability for direct content extraction." });
  }

  if (analysis.kind === "search-results") {
    add({
      kind: "search-results",
      severity: results.length > 0 ? "info" : "warning",
      message: `${results.length} ranked search result(s) extracted.`,
    });
  }

  if (verification.requestedCount > 0) {
    add({
      kind: "verification",
      severity: verification.status === "matched" ? "info" : "warning",
      message: `${verification.foundCount}/${verification.requestedCount} requested verification text(s) found.`,
    });
  }

  if (analysis.kind !== "search-results" && pageCheck.sourceLinks.length > 0) {
    add({
      kind: "source-links",
      severity: "info",
      message: `${pageCheck.sourceLinks.length} source-like link(s) available for follow-up.`,
    });
  }

  for (const diagnostic of analysis.diagnostics.slice(0, 3)) {
    add({ kind: "diagnostic", severity: diagnostic.severity, message: `${diagnostic.code}: ${diagnostic.message}` });
  }

  return signals.slice(0, 6);
}

function selectBestReadTarget(readTargets: AgentReadTarget[]): AgentReadTarget | undefined {
  return [...readTargets].sort((left, right) => {
    if (left.primary !== right.primary) return left.primary ? -1 : 1;
    return (right.score ?? 0) - (left.score ?? 0);
  })[0];
}

function countDiagnosticsBySeverity(diagnostics: DiagnosticSummary[]): Record<DiagnosticSummary["severity"], number> {
  return diagnostics.reduce((counts, diagnostic) => {
    counts[diagnostic.severity] += 1;
    return counts;
  }, { info: 0, warning: 0, error: 0 });
}

function agentUsabilityScore(
  status: AgentStatus,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  needsBrowserHtml: boolean,
  error?: { code: CliErrorCode; message: string; status?: number },
): number {
  if (error) return 0;
  if (needsBrowserHtml) return 0.1;
  const confidence = pageCheck.confidence === "high" ? 1 : pageCheck.confidence === "medium" ? 0.65 : 0.25;
  const evidence = Math.min(1, pageCheck.contentEvidence.length / 3);
  const sources = Math.min(1, pageCheck.sourceLinks.length / 2);
  const searchResults = Math.min(1, results.length / 5);
  const verificationScore = verification.status === "matched"
    ? 1
    : verification.status === "partial"
      ? 0.55
      : verification.status === "missing"
        ? 0.15
        : 0.5;
  const statusScore = status === "ready" || status === "choose-result"
    ? 1
    : status === "verify"
      ? 0.55
      : status === "needs-browser"
        ? 0.15
        : 0;
  const resultScore = results.length > 0
    ? searchResults * 0.35 + confidence * 0.15 + verificationScore * 0.2 + statusScore * 0.3
    : pageCheck.readability.score * 0.35 + confidence * 0.2 + evidence * 0.2 + sources * 0.1 + verificationScore * 0.1 + statusScore * 0.05;
  return roundMetric(Math.max(0, Math.min(1, resultScore)));
}

function countAlternativeAgentActions(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  primaryAction: SuggestedAction | undefined,
): number {
  const actions: SuggestedAction[] = [];
  const add = (action: SuggestedAction | undefined): void => {
    if (!action || sameSuggestedAction(action, primaryAction)) return;
    if ((primaryAction?.action === "use-evidence" || primaryAction?.action === "read-content") && action.action === "read-content") return;
    if (actions.some((item) => sameSuggestedAction(item, action))) return;
    actions.push(action);
  };
  for (const action of analysis.suggestedActions) add(action);
  if (primaryAction?.action !== "use-evidence") {
    add(pageCheck.recommendedAction);
    for (const step of pageCheck.nextSteps) add(step);
  }
  add(verification.recommendedAction);
  return actions.length;
}

function summarizeAgentActions(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  primaryAction: SuggestedAction | undefined,
): AgentActionSummary[] {
  const actions: AgentActionSummary[] = [];
  const add = (action: SuggestedAction | undefined, source: AgentActionSource, primary = false, index?: number): void => {
    if (!action) return;
    if (!primary && sameSuggestedAction(action, primaryAction)) return;
    if (!primary && (primaryAction?.action === "use-evidence" || primaryAction?.action === "read-content") && action.action === "read-content") return;
    if (actions.some((item) => sameSuggestedAction(item, action))) return;
    actions.push({
      ...action,
      source,
      ...(primary ? { primary: true } : {}),
      ...(typeof index === "number" ? { index } : {}),
      execution: actionExecution(action),
      priority: action.priority ?? actionPriority(action),
      priorityReason: action.priorityReason ?? actionPriorityReason(action),
    });
  };
  add(primaryAction, "agent.primaryAction", true);
  analysis.suggestedActions.forEach((action, index) => add(action, "analysis.suggestedActions", false, index));
  if (primaryAction?.action !== "use-evidence") {
    add(pageCheck.recommendedAction, "pageCheck.recommendedAction");
    pageCheck.nextSteps.forEach((step, index) => add(step, "pageCheck.nextSteps", false, index));
  }
  add(verification.recommendedAction, "verification.recommendedAction");
  return actions;
}

function averageResultSourceScore(results: ResultSummary[]): number {
  const scores = results.map((result) => result.sourceScore).filter((score): score is number => typeof score === "number");
  if (scores.length === 0) return 0;
  return roundMetric(scores.reduce((total, score) => total + score, 0) / scores.length);
}

function agentSourceQualityScore(kind: ContentKind, sourceLinks: PageLinkSummary[], results: ResultSummary[], recommendedResult?: ResultSummary): number {
  if (kind === "search-results") return averageResultSourceScore(selectCompactSearchResults(results, recommendedResult));
  if (sourceLinks.length === 0) return 0;
  return roundMetric(sourceLinks.reduce((total, link) => total + (link.sourceScore ?? 0), 0) / sourceLinks.length);
}

function averageEvidenceScore(evidence: PageEvidenceSummary[]): number {
  if (evidence.length === 0) return 0;
  return roundMetric(evidence.reduce((total, item) => total + item.score, 0) / evidence.length);
}

function primaryAgentAction(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
): SuggestedAction | undefined {
  const searchAction = analysis.suggestedActions.find((action) => action.action === "open-result" || action.action === "refine-search");
  if (searchAction) return searchAction;
  if (verification.recommendedAction) return verification.recommendedAction;
  return pageCheck.nextSteps[0] ?? pageCheck.recommendedAction;
}

function agentStatus(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  needsBrowserHtml: boolean,
  error?: { code: CliErrorCode; message: string; status?: number },
): AgentStatus {
  if (error && error.code !== "NO_INSPECTABLE_CONTENT") return "error";
  if (needsBrowserHtml) return "needs-browser";
  if (analysis.kind === "search-results") return "choose-result";
  if (verification.status === "partial" || verification.status === "missing") return "verify";
  if (verification.status === "matched") return "ready";
  if (pageCheck.readability.level === "low") return "verify";
  return "ready";
}

function agentSummaryText(
  status: AgentStatus,
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  recommendedResult?: ResultSummary,
): string {
  if (status === "error") return "Extraction failed before a usable page summary was produced.";
  if (status === "needs-browser") return "Fetched HTML is blocked, empty, or too thin; browser-captured HTML is recommended.";
  if (status === "choose-result" && recommendedResult) return `Open result ${recommendedResult.rank}: ${recommendedResult.title}.`;
  if (status === "choose-result") return "Search results are low confidence; refine the query before opening a result.";
  if (status === "verify") {
    if (verification.status === "partial") return "Some requested text was found; inspect missing evidence before relying on this page.";
    if (verification.status === "missing") return "Requested text was not found in the current page summaries.";
    return "The page has limited readable evidence; inspect source links or controls before relying on it.";
  }
  if (verification.status === "matched") return "All requested text was found in the page summaries.";
  if (analysis.kind === "content-page") return "The page has readable content evidence suitable for source checking.";
  return `The page is usable with ${pageCheck.confidence} confidence and ${pageCheck.readability.level} readability.`;
}

function findCandidates(
  page: PageSummary,
  pageCheck: PageCheckSummary,
  links: LinkSummary[],
  results: ResultSummary[],
  outline: OutlineSummary[],
  content: ContentSummary[],
  kind: ContentKind,
): FindMatchSummary[] {
  const candidates: FindMatchSummary[] = [];
  const seen = new Set<string>();
  const add = (match: FindMatchSummary): void => {
    const key = `${match.url ?? ""}\n${match.text}`.toLowerCase();
    if (!match.text || seen.has(key)) return;
    seen.add(key);
    candidates.push(match);
  };
  if (kind !== "search-results") {
    if (page.title) add({ field: "title", text: page.title });
    if (page.description) add({ field: "description", text: page.description });
    if (pageCheck.mainHeading) add({ field: "mainHeading", text: pageCheck.mainHeading });
  }
  for (const evidence of pageCheck.contentEvidence) {
    add({
      field: "contentEvidence",
      text: evidence.text,
      rank: evidence.rank,
      ...(evidence.selector ? { selector: evidence.selector } : {}),
      source: evidence.source,
      score: evidence.score,
      quality: evidence.quality,
      qualityReason: evidence.qualityReason,
    });
  }
  for (const link of pageCheck.sourceLinks) add({ field: "sourceLink", text: link.title, rank: link.rank, url: link.url });
  for (const link of pageCheck.primaryLinks) add({ field: "primaryLink", text: link.title, rank: link.rank, url: link.url });
  for (const result of results) add({ field: "result", text: [result.title, result.snippet].filter(Boolean).join(" "), rank: result.rank, url: result.url });
  for (const item of outline) add({ field: "heading", text: item.text, ...(item.level ? { rank: item.level } : {}) });
  for (const link of links) add({ field: "link", text: [link.text, link.snippet].filter(Boolean).join(" "), url: link.url });
  for (const item of content) add({ field: "content", text: item.text, ...(item.selector ? { selector: item.selector } : {}) });
  return candidates;
}

function normalizeFindValue(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function pageCheckContent(content: ContentSummary[]): ContentSummary[] {
  const paragraphContent = content.filter((item) => item.role !== "article");
  return paragraphContent.length > 0 ? paragraphContent : content;
}

function fallbackPageCheckPreview(fetched: FetchResult, outline: OutlineSummary[], primaryLinks: PageLinkSummary[]): string[] {
  const seen = new Set<string>();
  const preview: string[] = [];
  const add = (value: string): void => {
    const text = cleanContentText(value);
    const key = text.toLowerCase();
    if (!text || text.length < 6 || seen.has(key)) return;
    if (isLowValuePreviewText(text)) return;
    if (fetched.page.title && normalizePageTitle(fetched.page.title) === normalizePageTitle(text)) return;
    seen.add(key);
    preview.push(text);
  };
  for (const item of outline) add(item.text);
  for (const link of primaryLinks) {
    add(link.title);
    if (link.snippet) add(link.snippet);
  }
  return preview.slice(0, 4);
}

function htmlContentPreview(html: string): string[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const blocks: string[] = [];
  const seen = new Set<string>();
  function visit(nodes: AnyNode[]): void {
    for (const node of nodes) {
      if (!(node instanceof DomElement)) continue;
      if (isLikelyContentElement(node) && !hasLikelyContentChild(node)) {
        const text = cleanContentText(descendantText(node));
        const key = text.toLowerCase();
        if (text.length >= 24 && !seen.has(key) && !isLowValuePreviewText(text)) {
          seen.add(key);
          blocks.push(text);
          if (blocks.length >= 4) return;
        }
      }
      visit(node.children);
      if (blocks.length >= 4) return;
    }
  }
  visit(document.children);
  return blocks;
}

function isLikelyContentElement(element: Element): boolean {
  if (element.name === "p" || element.name === "article") return true;
  const marker = `${attr(element, "id") ?? ""} ${attr(element, "class") ?? ""} ${attr(element, "data-role") ?? ""}`.toLowerCase();
  return /(post|article|content|comment|view|본문|댓글)/i.test(marker)
    && !/(header|footer|nav|menu|login|auth|toolbar|button|contact|info|symph|like|reply)/i.test(marker);
}

function hasLikelyContentChild(element: Element): boolean {
  return element.children.some((child) => child instanceof DomElement && isLikelyContentElement(child));
}

function normalizePageTitle(value: string): string {
  return value.replace(/\s*[:|-]\s*.+$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isLowValuePreviewText(text: string): boolean {
  if (/^(?:\d{2,4}[-./년]\d{1,2}[-./월]\d{1,2}일?\s*){1,2}(?:\d{1,2}:\d{2}(?::\d{2})?)?\s*$/i.test(text)) return true;
  return /(본문 바로가기|메뉴 바로가기|보기설정|테마설정|통합검색|주소복사|Facebook|X\(Twitter\)|static nodes omitted|고객지원|게시물 삭제 요청|불법촬영물|쪽지 신고|닉네임 신고|개인정보|이용약관)/i.test(text);
}

function isLowValueHeadingText(text: string): boolean {
  return /^(navigation menu|folders and files|latest commit|history|repository files navigation|explore|explore by type|support & services|programs|footer|site navigation|메뉴|탐색|내비게이션)$/i.test(text.trim());
}

function summarizePrimaryPageLinks(links: LinkSummary[], baseUrl: string): PageLinkSummary[] {
  return links
    .filter((link) => !isLowValuePageLink(link))
    .slice(0, 8)
    .map((link, index) => {
      const sourceProfile = summarizeSourceProfile(link.url, link.text, link.snippet);
      const summary: PageLinkSummary = {
        title: link.text,
        url: link.url,
        source: sourceFromUrl(link.url),
        rank: index + 1,
        kind: samePageOrSameHost(link.url, baseUrl) ? "internal" : "external",
        sourceType: sourceProfile.type,
        sourceScore: sourceProfile.score,
        sourceHints: sourceProfile.hints,
        selectionReason: sourceLinkSelectionReason({
          source: sourceFromUrl(link.url),
          kind: samePageOrSameHost(link.url, baseUrl) ? "internal" : "external",
          sourceType: sourceProfile.type,
          sourceScore: sourceProfile.score,
          sourceHints: sourceProfile.hints,
        }),
      };
      if (link.snippet) summary.snippet = link.snippet;
      return summary;
    });
}

function isLowValuePageLink(link: LinkSummary): boolean {
  const haystack = `${link.text} ${link.url}`.toLowerCase();
  if (isLikelyGlobalNavigationText(link.text, link.snippet)) return true;
  return /(^clien\s|^clien$|login|logout|sign in|signup|register|privacy|terms|cookie|advertis|facebook\.com\/sharer|x\.com\/intent\/tweet|twitter\.com\/intent\/tweet|\/auth\/|#div_content|#menutop|\/service\/$|share|pricing|githubstatus|github\.blog|contact support|customer support|expert services|ask the github community|community discussions|공유|주소복사|본문 바로가기|메뉴 바로가기|보기설정|테마설정|톺아보기|공감글|커뮤니티전체|고객지원|광고|로그인|회원가입|개인정보|이용약관|메일인증|email verification)/i.test(haystack);
}

function isLikelyGlobalNavigationText(text: string, snippet = ""): boolean {
  const haystack = `${text} ${snippet}`.toLowerCase();
  return /(explore by type|support & services|why github|github skills|customer stories|events & webinars|ebooks & reports|business insights|community forum|trust center|partners|security lab|maintainer community|accelerator|github stars|archive program|blog changelog marketplace|contact support|customer support|expert services|ask the github community|status pricing blog)/i.test(haystack);
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
    contentEvidence: [],
    contentLength: 0,
    primaryLinks: [],
    sourceLinks: [],
    actions: [],
    confidence: "low",
    readability: {
      level: "low",
      score: 0,
      reasons: ["no page content extracted"],
    },
    recommendedAction: {
      action: "retry-with-browser-html",
      reason: "The page is not reliably readable from fetched HTML.",
    },
    nextSteps: [
      {
        action: "retry-with-browser-html",
        reason: "The page is not reliably readable from fetched HTML.",
      },
    ],
  };
}

function emptyVerification(): VerificationSummary {
  return {
    status: "not-requested",
    requestedCount: 0,
    foundCount: 0,
    missingCount: 0,
    evidenceCount: 0,
    foundQueries: [],
    missingQueries: [],
  };
}

function errorAgent(error: CliError, url?: string, agentMode = false, findQueries: string[] = [], sourceSearch?: SourceSearchSummary, timeoutMs?: number, userAgent?: string): AgentSummary {
  const summary = error.code === "USAGE" ? error.message.split("\n")[0] || error.message : error.message;
  const primaryAction = errorAction(error, url, agentMode, findQueries, sourceSearch, timeoutMs, userAgent);
  const readTargets = summarizeErrorAgentReadTargets(primaryAction, sourceSearch);
  const bestReadTarget = selectBestReadTarget(readTargets);
  const next = summarizeAgentNext(primaryAction, readTargets, errorAgentReadValue(primaryAction, sourceSearch));
  const expectedOutcome = summarizeAgentExpectedOutcome(primaryAction);
  const needsBrowserHtml = errorNeedsBrowserHtml(primaryAction);
  const answerPlan = summarizeErrorAgentAnswerPlan(error, primaryAction, needsBrowserHtml);
  const executionPlan = summarizeAgentExecutionPlan(next, expectedOutcome, answerPlan, false, needsBrowserHtml);
  const runbook = summarizeAgentRunbook(next, executionPlan, answerPlan);
  const handoff = summarizeAgentHandoff(next, executionPlan, answerPlan);
  return {
    contract: agentContract,
    status: "error",
    pageKind: "empty",
    summary,
    routingIntent: agentRoutingIntent(primaryAction),
    continuationMode: agentContinuationMode(primaryAction),
    next,
    runbook,
    handoff,
    expectedOutcome,
    executionPlan,
    answerPlan,
    signals: summarizeErrorAgentSignals(error, primaryAction, summary),
    qualityGates: [
      {
        kind: "fetch",
        pass: false,
        severity: "error",
        message: `Fetch or extraction failed with ${error.code}.`,
        score: 0,
        path: "error",
      },
      {
        kind: "browser",
        pass: !needsBrowserHtml,
        severity: needsBrowserHtml ? "warning" : "info",
        message: needsBrowserHtml ? "Browser-captured HTML or browser inspection is needed." : "No browser capture is required for this error path.",
        score: needsBrowserHtml ? 0 : 1,
        path: "agent.needsBrowserHtml",
      },
    ],
    canContinue: agentCanContinue(primaryAction),
    canUseFetchedHtml: false,
    needsBrowserHtml,
    responseStatus: error.status ?? 0,
    responseOk: false,
    responseContentType: "",
    finalUrlChanged: false,
    confidence: "low",
    usabilityScore: 0,
    readability: "low",
    readabilityScore: 0,
    readabilityReasons: ["error before page readability could be evaluated"],
    verificationStatus: "not-requested",
    verificationRequestedCount: 0,
    verificationFoundCount: 0,
    verificationMissingCount: 0,
    resultCount: 0,
    resultChoices: [],
    evidenceCount: 0,
    sourceLinkCount: 0,
    sourceChoices: [],
    evidenceQualityScore: 0,
    sourceQualityScore: 0,
    alternativeActionCount: 0,
    diagnosticCodes: [error.code],
    diagnosticErrorCount: 1,
    diagnosticWarningCount: 0,
    diagnosticInfoCount: 0,
    citations: [],
    answerEvidence: [],
    readTargets,
    actions: primaryAction ? [{
      ...withActionExecution(primaryAction),
      source: "agent.primaryAction",
      primary: true,
    }] : [],
    ...(bestReadTarget ? { bestReadTarget: bestReadTarget.path } : {}),
    ...(typeof bestReadTarget?.score === "number" ? { bestReadTargetScore: bestReadTarget.score } : {}),
    ...(bestReadTarget ? { bestReadTargetReason: bestReadTarget.reason } : {}),
    ...(primaryAction ? { primaryExecution: actionExecution(primaryAction) } : {}),
    ...(primaryAction?.readFrom ? { primaryReadFrom: primaryAction.readFrom } : {}),
    ...(primaryAction?.command ? { primaryCommand: primaryAction.command } : {}),
    ...(primaryAction?.commandArgs ? { primaryCommandArgs: primaryAction.commandArgs } : {}),
    ...(primaryAction?.afterInteractionCommand ? { primaryAfterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
    ...(primaryAction?.afterInteractionCommandArgs ? { primaryAfterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    ...(primaryAction?.url ? { primaryUrl: primaryAction.url } : {}),
    ...(primaryAction?.rank ? { primaryRank: primaryAction.rank } : {}),
    ...(primaryAction?.openResult ? { primaryOpenResult: primaryAction.openResult } : {}),
    ...(primaryAction?.requiresBrowserInteraction ? { requiresBrowserInteraction: true } : {}),
    ...(primaryAction ? { primaryAction } : {}),
  };
}

function summarizeErrorAgentAnswerPlan(error: CliError, primaryAction: SuggestedAction | undefined, needsBrowserHtml: boolean): AgentAnswerPlan {
  const actionFields = answerPlanActionFields(primaryAction);
  if (needsBrowserHtml) {
    return {
      status: "blocked",
      confidence: "low",
      reason: "Extraction failed; browser-captured HTML is needed before answering.",
      gaps: [`Extraction failed with ${error.code}.`, "Browser-captured HTML is needed."],
      useCitationIds: [],
      ...actionFields,
    };
  }
  if (primaryAction && actionExecution(primaryAction) !== "inspect-output") {
    return {
      status: "needs-more",
      confidence: "low",
      reason: "Extraction failed, but a recovery action is available.",
      gaps: [`Extraction failed with ${error.code}.`, "Follow the recovery action before answering."],
      useCitationIds: [],
      ...actionFields,
    };
  }
  return {
    status: "error",
    confidence: "low",
    reason: `Extraction failed with ${error.code}.`,
    gaps: [`Extraction failed with ${error.code}.`],
    useCitationIds: [],
    ...actionFields,
  };
}

function summarizeErrorAgentSignals(error: CliError, primaryAction: SuggestedAction | undefined, summary: string): AgentSignal[] {
  const signals: AgentSignal[] = [
    { kind: "diagnostic", severity: "error", message: `${error.code}: ${summary}` },
  ];
  if (primaryAction?.action === "retry-with-browser-html") {
    signals.push({ kind: "browser", severity: "warning", message: "Browser-captured HTML is recommended before retrying extraction." });
  }
  return signals;
}

function errorNeedsBrowserHtml(primaryAction: SuggestedAction | undefined): boolean {
  return primaryAction?.action === "retry-with-browser-html";
}

function summarizeErrorAgentReadTargets(primaryAction: SuggestedAction | undefined, sourceSearch?: SourceSearchSummary): AgentReadTarget[] {
  const targets: AgentReadTarget[] = [];
  if (sourceSearch?.selectedResult) {
    targets.push({
      path: "sourceSearch.selectedResult",
      reason: "Original SERP metadata for the selected result that failed.",
      count: 1,
      ...(typeof sourceSearch.selectedResult.sourceScore === "number" ? { score: sourceSearch.selectedResult.sourceScore } : {}),
    });
  }
  if (primaryAction?.action !== "open-alternate-result" || !sourceSearch?.alternateResults?.length) return targets;
  targets.push({
    path: "sourceSearch.alternateResults",
    reason: "Original SERP candidates available for recovery after the selected result failed.",
    count: sourceSearch.alternateResults.length,
    score: averageResultSourceScore(sourceSearch.alternateResults),
  });
  return targets;
}

function errorAgentReadValue(primaryAction: SuggestedAction | undefined, sourceSearch?: SourceSearchSummary): AgentReadValue | undefined {
  if (!primaryAction?.readFrom || actionExecution(primaryAction) !== "read-current") return undefined;
  if (primaryAction.readFrom === "sourceSearch.selectedResult" && sourceSearch?.selectedResult) {
    return { path: primaryAction.readFrom, value: sourceSearch.selectedResult };
  }
  if (primaryAction.readFrom === "sourceSearch.alternateResults" && sourceSearch?.alternateResults) {
    return { path: primaryAction.readFrom, value: sourceSearch.alternateResults };
  }
  return undefined;
}

function errorAction(error: CliError, url?: string, agentMode = false, findQueries: string[] = [], sourceSearch?: SourceSearchSummary, timeoutMs?: number, userAgent?: string): SuggestedAction | undefined {
  if (error.code === "USAGE") return undefined;
  if (!url) {
    return {
      action: "retry-or-check-input",
      reason: "The CLI could not complete extraction for this request.",
    };
  }
  if (error.code === "HTTP_ERROR" && (error.status === 404 || error.status === 410)) {
    const alternate = sourceSearch?.alternateResults?.[0];
    const alternateCommand = alternate && sourceSearch
      ? searchOpenCommandSpec(
          sourceSearch.query,
          sourceSearch.selectedEngine ?? sourceSearch.engine,
          findQueries,
          agentMode,
          sourceSearch.lang,
          sourceSearch.region,
          alternate.rank,
          sourceSearch.timeoutMs,
          sourceSearch.userAgent,
        )
      : undefined;
    if (alternate && alternateCommand) {
      return {
        action: "open-alternate-result",
        reason: "The selected search result was missing; open the next available result from the original SERP.",
        url: alternate.url,
        rank: alternate.rank,
        target: agentTargetFromResult(alternate),
        ...commandFields(alternateCommand),
      };
    }
    return {
      action: "check-url-or-search",
      reason: "The URL returned a missing/gone status; verify the URL or search for a replacement source.",
      url,
      ...commandFields(searchCommandSpec(url, agentMode, timeoutMs, userAgent)),
    };
  }
  if (error.code === "HTTP_ERROR" && typeof error.status === "number" && error.status >= 500) {
    return {
      action: "retry-later",
      reason: "The server returned a transient error status; retry the same URL later.",
      url,
      ...commandFields(pageCommandSpec(url, agentMode, false, findQueries, timeoutMs, userAgent)),
    };
  }
  return {
    action: "retry-with-browser-html",
    reason: "Fetch failed before a usable page summary was available; retry with browser-captured HTML.",
    url,
    ...commandFields(pageCommandSpec(url, agentMode, true, findQueries, timeoutMs, userAgent)),
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
  options: Pick<CliOptions, "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchLang" | "searchRegion" | "findQueries">
    & Partial<Pick<CliOptions, "timeoutMs" | "userAgent">>
    & { agentMode?: boolean; capturedHtml?: boolean } = {},
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
    suggestedActions.push(options.capturedHtml
      ? {
          action: "inspect-browser-state",
          reason: "Browser-captured HTML is still empty; inspect the browser state or capture after interacting.",
          url: fetched.finalUrl,
          requiresBrowserInteraction: true,
          ...afterInteractionCommandFields(pageCommandSpec(fetched.finalUrl, options.agentMode ?? false, true, options.findQueries ?? [], options.timeoutMs, options.userAgent)),
        }
      : {
          action: "retry-with-browser-html",
          reason: "The fetched HTML may be challenged, empty, or JavaScript-rendered.",
        });
  }

  if (kind === "blocked-page") {
    suggestedActions.push(options.capturedHtml
      ? {
          action: "inspect-browser-state",
          reason: "Browser-captured HTML still appears blocked, challenged, paywalled, or login-gated.",
          url: fetched.finalUrl,
          requiresBrowserInteraction: true,
          ...afterInteractionCommandFields(pageCommandSpec(fetched.finalUrl, options.agentMode ?? false, true, options.findQueries ?? [], options.timeoutMs, options.userAgent)),
        }
      : {
          action: "retry-with-browser-html",
          reason: "The page appears blocked, challenged, paywalled, or login-gated.",
        });
  }

  if (kind === "search-results" && results[0]) {
    const topResults = results.slice(0, 5);
    const lowConfidence = searchResultsLowConfidence(topResults);
    if (lowConfidence) {
      diagnostics.push({
        severity: "warning",
        code: "SEARCH_LOW_CONFIDENCE",
        message: "Search results were extracted, but top results only weakly match the query.",
      });
    }
    const recommended = recommendedSearchResult(results, options.findQueries ?? []);
    if (recommended) {
      const command = options.searchQuery
        ? searchOpenCommandSpec(options.searchQuery, options.selectedSearchEngine ?? options.searchEngine, options.findQueries ?? [], options.agentMode ?? false, options.searchLang, options.searchRegion, "best", options.timeoutMs, options.userAgent)
        : pageCommandSpec(recommended.url, options.agentMode ?? false, false, options.findQueries ?? [], options.timeoutMs, options.userAgent);
      const reason = searchResultActionReason(recommended, results[0]);
      suggestedActions.push({
        action: "open-result",
        reason,
        url: recommended.url,
        rank: recommended.rank,
        openResult: options.searchQuery ? "best" : recommended.rank,
        target: agentTargetFromResult(recommended),
        ...commandFields(command),
      });
    } else {
      const directSearch = inferSearchResultCommandContext(fetched.finalUrl);
      const query = options.searchQuery ?? directSearch?.query;
      const engine = options.selectedSearchEngine ?? options.searchEngine ?? directSearch?.engine;
      const command = refineSearchCommandSpec(query, engine, options.findQueries ?? [], options.agentMode ?? false, options.searchLang, options.searchRegion, options.timeoutMs, options.userAgent);
      suggestedActions.push({
        action: "refine-search",
        reason: (options.findQueries?.length ?? 0) > 0
          ? "No result card matched the requested --find text; refine the query before opening a result."
          : "Top results do not match the essential query terms; refine the query or add --find before opening a result.",
        ...commandFields(command),
      });
    }
  }

  if (kind === "content-page" && content.length > 0) {
    suggestedActions.push({
      action: "read-content",
      reason: "The page has article-like content excerpts suitable for source checking.",
      url: fetched.finalUrl,
      terminal: true,
      readFrom: "pageCheck.contentEvidence",
    });
  }

  if (kind === "interactive-page" && actions.length > 0) {
    suggestedActions.push({
      action: "inspect-actions",
      reason: "The page exposes prominent controls that may be needed before content is visible.",
      url: fetched.finalUrl,
      requiresBrowserInteraction: true,
      ...afterInteractionCommandFields(pageCommandSpec(fetched.finalUrl, options.agentMode ?? false, true, options.findQueries ?? [], options.timeoutMs, options.userAgent)),
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

function searchResultsLowConfidence(results: ResultSummary[]): boolean {
  return results.some((result) => result.relevance)
    && !results.some((result) => result.relevance === "high" || result.isLikelyOfficial || (result.findMatches?.length ?? 0) > 0);
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
  if (looksLikeKnownSearchUrl(fetched.finalUrl) || (looksLikeGenericSearchUrl(fetched.finalUrl) && extractSearchResults(fetched.html, fetched.finalUrl).length > 0)) return "search-results";
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
  if (/(login required|log in to continue|sign in to continue|please sign in|로그인이 필요|회원만|가입 후|unauthorized)/i.test(haystack)) {
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

function looksLikeKnownSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const pathname = parsed.pathname.toLowerCase();
    if (hostname.endsWith("duckduckgo.com") && (parsed.searchParams.has("q") || pathname === "/html/" || pathname === "/html")) return true;
    if (hostname.endsWith("bing.com") && parsed.searchParams.has("q")) return true;
    if (hostname.endsWith("startpage.com") && (parsed.searchParams.has("query") || pathname.includes("/sp/search"))) return true;
    if (hostname.endsWith("google.com") && parsed.searchParams.has("q") && pathname.startsWith("/search")) return true;
    if (hostname.endsWith("baidu.com") && parsed.searchParams.has("wd")) return true;
    if (hostname.endsWith("search.yahoo.co.jp") && parsed.searchParams.has("p")) return true;
    return false;
  } catch {
    return false;
  }
}

function looksLikeGenericSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return /\/search\b|\/sp\/search\b/i.test(pathname)
      && (parsed.searchParams.has("q") || parsed.searchParams.has("query") || parsed.searchParams.has("wd") || parsed.searchParams.has("p"));
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
  if (["button", "input", "noscript", "script", "select", "style", "svg", "textarea"].includes(element.name)) return "";
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
  const pageLinks = summarizeResults(links);
  const outline = summarizeOutline(tree);
  const actions = summarizeActions(tree);
  const content = summarizeContent(tree);
  const results = annotateResults(summarizeSearchResults(fetched, links), options.searchQuery, options.findQueries ?? []);
  const capturedHtml = options.input !== "fetch";
  const analysis = analyzePage(fetched, tree, links, results, outline, actions, content, { ...options, capturedHtml });
  const pageCheck = summarizePageCheck(fetched, links, outline, actions, content, analysis, options.agentMode, capturedHtml, options.timeoutMs, options.userAgent);
  const finds = summarizeFinds(options.findQueries ?? [], fetched.page, pageCheck, links, results, outline, content, analysis.kind);
  const verification = summarizeVerification(finds, pageCheck, fetched.finalUrl, analysis, options.agentMode, capturedHtml, options.sourceSearch, options.timeoutMs, options.userAgent);
  const recommendedResult = analysis.kind === "search-results" ? recommendedSearchResult(results, options.findQueries ?? []) : undefined;
  const agent = summarizeAgent(
    analysis,
    pageCheck,
    verification,
    results,
    recommendedResult,
    error,
    capturedHtml,
    options.sourceSearch,
    fetched,
    options.url,
    options.agentMode,
    options.findQueries ?? [],
    options.timeoutMs,
    options.userAgent,
  );
  const outputAnalysis = {
    ...analysis,
    suggestedActions: analysis.suggestedActions.map(withActionExecution),
  };
  const outputPageCheck = withPageCheckActionExecution(pageCheck);
  const outputVerification = withVerificationActionExecution(verification);
  const outputAgent = withAgentActionExecution(agent);
  const envelope = {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: warnings.length === 0 && !error,
    url: options.url,
    searchQuery: options.searchQuery,
    searchEngine: options.searchEngine,
    selectedSearchEngine: options.selectedSearchEngine,
    searchEngines: options.searchAttempts,
    searchLang: options.searchLang,
    searchRegion: options.searchRegion,
    sourceSearch: options.sourceSearch,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    contentType: fetched.contentType,
    fetchedAt: new Date().toISOString(),
    mode: options.extractOptions.mode ?? "compact",
    warnings,
    kind: outputAnalysis.kind,
    diagnostics: outputAnalysis.diagnostics,
    suggestedActions: outputAnalysis.suggestedActions,
    agent: outputAgent,
    page: fetched.page,
    pageCheck: outputPageCheck,
    finds,
    verification: outputVerification,
    links,
    pageLinks,
    results,
    searchResults: outputAnalysis.kind === "search-results" ? results : [],
    recommendedResult,
    outline,
    actions,
    content,
    error,
    treeOmitted: options.omitTree || undefined,
    tree: options.omitTree ? undefined : tree,
  };
  if (options.omitTree) delete (envelope as { tree?: SemanticNode }).tree;
  if (options.agentMode) return agentJsonEnvelope(envelope, searchResultCommandContext(options), pageLinkCommandContext(options));
  return envelope;
}

function agentJsonEnvelope(envelope: {
  schemaVersion: number;
  tool: string;
  ok: boolean;
  url: string | undefined;
  searchQuery: string | undefined;
  searchEngine: SearchEngineOption | undefined;
  selectedSearchEngine: SearchEngine | undefined;
  searchEngines: SearchAttemptSummary[] | undefined;
  searchLang: string | undefined;
  searchRegion: string | undefined;
  sourceSearch: SourceSearchSummary | undefined;
  finalUrl: string;
  status: number;
  contentType: string;
  fetchedAt: string;
  mode: string;
  warnings: Array<{ code: string; message: string }>;
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
  agent: AgentSummary;
  page: PageSummary;
  pageCheck: PageCheckSummary;
  finds: FindSummary[];
  verification: VerificationSummary;
  searchResults: ResultSummary[];
  recommendedResult: ResultSummary | undefined;
  error: { code: CliErrorCode; message: string; status?: number } | undefined;
}, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  const suggestedActions = compactSuggestedActions(envelope.suggestedActions, envelope.agent.primaryAction);

  return {
    schemaVersion: envelope.schemaVersion,
    tool: envelope.tool,
    ok: envelope.ok,
    url: envelope.url,
    finalUrl: envelope.finalUrl,
    status: envelope.status,
    contentType: envelope.contentType,
    fetchedAt: envelope.fetchedAt,
    mode: envelope.mode,
    kind: envelope.kind,
    searchQuery: envelope.searchQuery,
    searchEngine: envelope.searchEngine,
    selectedSearchEngine: envelope.selectedSearchEngine,
    ...(!envelope.sourceSearch ? compactAgentSearchEngines(envelope.searchEngines) : {}),
    searchLang: envelope.searchLang,
    searchRegion: envelope.searchRegion,
    sourceSearch: compactAgentSourceSearch(envelope.sourceSearch),
    ...(envelope.warnings.length > 0 ? { warnings: envelope.warnings } : {}),
    agent: compactAgentSummary(envelope.agent),
    ...compactAgentPage(envelope.page),
    pageCheck: compactAgentPageCheck(envelope.pageCheck, envelope.agent.primaryAction, envelope.searchResults.length > 0, pageLinkContext),
    ...compactAgentVerification(envelope.verification, envelope.agent.primaryAction),
    ...(envelope.finds.length > 0 ? { finds: envelope.finds } : {}),
    ...compactAgentSearchResults(envelope.searchResults, envelope.recommendedResult, searchCommandContext, pageLinkContext),
    ...(envelope.recommendedResult ? { recommendedResult: compactAgentSearchResult(envelope.recommendedResult, searchCommandContext, { id: `r${envelope.recommendedResult.rank}`, path: "recommendedResult" }, pageLinkContext) } : {}),
    ...(suggestedActions.length > 0 ? { suggestedActions } : {}),
    ...(envelope.error ? { error: envelope.error } : {}),
    treeOmitted: true,
  };
}

function jsonErrorEnvelope(
  error: CliError,
  metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "agentMode" | "findQueries" | "timeoutMs" | "userAgent">> = {},
): object {
  const action = errorAction(error, metadata.url, metadata.agentMode ?? false, metadata.findQueries ?? [], metadata.sourceSearch, metadata.timeoutMs, metadata.userAgent);
  const outputAction = action ? withActionExecution(action) : undefined;
  const pageCheck = errorPageCheck(outputAction);
  const agent = withAgentActionExecution(errorAgent(error, metadata.url, metadata.agentMode ?? false, metadata.findQueries ?? [], metadata.sourceSearch, metadata.timeoutMs, metadata.userAgent));
  const envelope = {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: false,
    url: metadata.url,
    searchQuery: metadata.searchQuery,
    searchEngine: metadata.searchEngine,
    selectedSearchEngine: metadata.selectedSearchEngine,
    searchEngines: metadata.searchAttempts,
    searchLang: metadata.searchLang,
    searchRegion: metadata.searchRegion,
    sourceSearch: metadata.sourceSearch,
    fetchedAt: new Date().toISOString(),
    mode: metadata.extractOptions?.mode ?? "compact",
    warnings: [],
    kind: "empty" as ContentKind,
    diagnostics: [
      {
        severity: "error" as const,
        code: error.code,
        message: error.message,
      },
    ],
    suggestedActions: outputAction ? [outputAction] : [],
    agent,
    page: {},
    pageCheck,
    finds: [],
    verification: emptyVerification(),
    links: [],
    pageLinks: [],
    results: [],
    searchResults: [],
    outline: [],
    actions: [],
    content: [],
    error: {
      code: error.code,
      message: error.message,
      ...(typeof error.status === "number" ? { status: error.status } : {}),
    },
  };
  if (metadata.agentMode) return agentJsonErrorEnvelope(envelope);
  return envelope;
}

function errorPageCheck(action: SuggestedAction | undefined): PageCheckSummary {
  const pageCheck = emptyPageCheck();
  if (!action) return pageCheck;
  return {
    ...pageCheck,
    recommendedAction: action,
    nextSteps: [action],
  };
}

function agentJsonErrorEnvelope(envelope: {
  schemaVersion: number;
  tool: string;
  ok: boolean;
  url: string | undefined;
  searchQuery: string | undefined;
  searchEngine: SearchEngineOption | undefined;
  selectedSearchEngine: SearchEngine | undefined;
  searchEngines: SearchAttemptSummary[] | undefined;
  searchLang: string | undefined;
  searchRegion: string | undefined;
  sourceSearch: SourceSearchSummary | undefined;
  fetchedAt: string;
  mode: string;
  warnings: Array<{ code: string; message: string }>;
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
  agent: AgentSummary;
  page: PageSummary;
  pageCheck: PageCheckSummary;
  finds: FindSummary[];
  verification: VerificationSummary;
  searchResults: ResultSummary[];
  error: { code: CliErrorCode; message: string; status?: number };
}): object {
  const suggestedActions = compactSuggestedActions(envelope.suggestedActions, envelope.agent.primaryAction);

  return {
    schemaVersion: envelope.schemaVersion,
    tool: envelope.tool,
    ok: envelope.ok,
    url: envelope.url,
    searchQuery: envelope.searchQuery,
    searchEngine: envelope.searchEngine,
    selectedSearchEngine: envelope.selectedSearchEngine,
    ...(!envelope.sourceSearch ? compactAgentSearchEngines(envelope.searchEngines) : {}),
    searchLang: envelope.searchLang,
    searchRegion: envelope.searchRegion,
    sourceSearch: compactAgentSourceSearch(envelope.sourceSearch),
    fetchedAt: envelope.fetchedAt,
    mode: envelope.mode,
    kind: envelope.kind,
    ...(envelope.warnings.length > 0 ? { warnings: envelope.warnings } : {}),
    ...(suggestedActions.length > 0 ? { suggestedActions } : {}),
    agent: compactAgentSummary(envelope.agent),
    ...compactAgentPage(envelope.page),
    pageCheck: compactAgentPageCheck(envelope.pageCheck, envelope.agent.primaryAction, envelope.searchResults.length > 0),
    ...compactAgentVerification(envelope.verification, envelope.agent.primaryAction),
    ...(envelope.finds.length > 0 ? { finds: envelope.finds } : {}),
    ...compactAgentSearchResults(envelope.searchResults),
    error: envelope.error,
    treeOmitted: true,
  };
}

function compactAgentPageCheck(pageCheck: PageCheckSummary, primaryAction?: SuggestedAction, omitResultLinkDuplicates = false, pageLinkContext?: PageLinkCommandContext): object {
  const sourceUrls = new Set(pageCheck.sourceLinks.map((link) => link.url));
  const nonSourcePrimaryLinks = pageCheck.primaryLinks.filter((link) => !sourceUrls.has(link.url));
  const primaryLinks = pageCheck.sourceLinks.length > 0
    ? nonSourcePrimaryLinks.filter((link) => link.kind === "internal")
    : nonSourcePrimaryLinks;
  const suppressPageActions = primaryAction?.action === "use-evidence";
  const nextSteps = suppressPageActions
    ? []
    : primaryAction ? pageCheck.nextSteps.filter((step) => !sameSuggestedAction(step, primaryAction)) : pageCheck.nextSteps;
  const recommendedAction = suppressPageActions || sameSuggestedAction(pageCheck.recommendedAction, primaryAction) ? undefined : pageCheck.recommendedAction;
  return {
    contentEvidence: pageCheck.contentEvidence,
    contentLength: pageCheck.contentLength,
    ...(primaryLinks.length > 0 && !omitResultLinkDuplicates ? { primaryLinks: primaryLinks.map((link, index) => compactAgentPageLink(link, pageLinkContext, { id: `l${index + 1}`, path: `pageCheck.primaryLinks[${index}]` })) } : {}),
    ...(pageCheck.sourceLinks.length > 0 && !omitResultLinkDuplicates ? { sourceLinks: pageCheck.sourceLinks.map((link, index) => compactAgentPageLink(link, pageLinkContext, { id: `s${index + 1}`, path: `pageCheck.sourceLinks[${index}]` })) } : {}),
    ...(pageCheck.actions.length > 0 && !omitResultLinkDuplicates ? { actions: pageCheck.actions } : {}),
    confidence: pageCheck.confidence,
    readability: {
      level: pageCheck.readability.level,
      score: pageCheck.readability.score,
      reasons: pageCheck.readability.reasons,
    },
    ...(recommendedAction ? { recommendedAction: compactAgentAction(recommendedAction) } : {}),
    ...(nextSteps.length > 0 ? { nextSteps: nextSteps.map(compactAgentAction) } : {}),
    ...(pageCheck.title ? { title: pageCheck.title } : {}),
    ...(pageCheck.canonicalUrl ? { canonicalUrl: pageCheck.canonicalUrl } : {}),
    ...(pageCheck.mainHeading ? { mainHeading: pageCheck.mainHeading } : {}),
    ...(pageCheck.lang ? { lang: pageCheck.lang } : {}),
  };
}

function sameSuggestedAction(left: SuggestedAction | undefined, right: SuggestedAction | undefined): boolean {
  if (!left || !right) return false;
  return left.action === right.action
    && left.url === right.url
    && left.command === right.command
    && left.afterInteractionCommand === right.afterInteractionCommand
    && left.rank === right.rank
    && left.openResult === right.openResult
    && left.terminal === right.terminal
    && left.readFrom === right.readFrom
    && left.requiresBrowserInteraction === right.requiresBrowserInteraction
    && actionExecution(left) === actionExecution(right);
}

function compactSuggestedActions(actions: SuggestedAction[], primaryAction?: SuggestedAction): object[] {
  return actions
    .filter((action) => !sameSuggestedAction(action, primaryAction))
    .filter((action) => !((primaryAction?.action === "use-evidence" || primaryAction?.action === "read-content") && action.action === "read-content"))
    .map(compactAgentAction);
}

function compactAgentSummary(agent: AgentSummary): object {
  return {
    contract: agent.contract,
    status: agent.status,
    pageKind: agent.pageKind,
    summary: agent.summary,
    routingIntent: agent.routingIntent,
    continuationMode: agent.continuationMode,
    next: agent.next,
    runbook: agent.runbook,
    handoff: agent.handoff,
    expectedOutcome: agent.expectedOutcome,
    executionPlan: agent.executionPlan,
    answerPlan: agent.answerPlan,
    ...(agent.searchDecision ? { searchDecision: agent.searchDecision } : {}),
    ...(agent.pageDecision ? { pageDecision: agent.pageDecision } : {}),
    ...(agent.signals.length > 0 ? { signals: agent.signals } : {}),
    ...(agent.qualityGates.length > 0 ? { qualityGates: agent.qualityGates } : {}),
    canContinue: agent.canContinue,
    canUseFetchedHtml: agent.canUseFetchedHtml,
    needsBrowserHtml: agent.needsBrowserHtml,
    responseStatus: agent.responseStatus,
    responseOk: agent.responseOk,
    responseContentType: agent.responseContentType,
    finalUrlChanged: agent.finalUrlChanged,
    confidence: agent.confidence,
    usabilityScore: agent.usabilityScore,
    readability: agent.readability,
    readabilityScore: agent.readabilityScore,
    ...(agent.readabilityReasons.length > 0 ? { readabilityReasons: agent.readabilityReasons } : {}),
    verificationStatus: agent.verificationStatus,
    verificationRequestedCount: agent.verificationRequestedCount,
    verificationFoundCount: agent.verificationFoundCount,
    verificationMissingCount: agent.verificationMissingCount,
    resultCount: agent.resultCount,
    ...(agent.resultChoices.length > 0 ? { resultChoices: agent.resultChoices } : {}),
    evidenceCount: agent.evidenceCount,
    sourceLinkCount: agent.sourceLinkCount,
    ...(agent.sourceChoices.length > 0 ? { sourceChoices: agent.sourceChoices } : {}),
    evidenceQualityScore: agent.evidenceQualityScore,
    sourceQualityScore: agent.sourceQualityScore,
    alternativeActionCount: agent.alternativeActionCount,
    ...(agent.diagnosticCodes.length > 0 ? { diagnosticCodes: agent.diagnosticCodes } : {}),
    diagnosticErrorCount: agent.diagnosticErrorCount,
    diagnosticWarningCount: agent.diagnosticWarningCount,
    diagnosticInfoCount: agent.diagnosticInfoCount,
    ...(agent.citations.length > 0 ? { citations: agent.citations } : {}),
    ...(agent.answerEvidence.length > 0 ? { answerEvidence: agent.answerEvidence } : {}),
    ...(agent.readTargets.length > 0 ? { readTargets: agent.readTargets } : {}),
    ...(agent.actions.length > 0 ? { actions: agent.actions.map(compactAgentActionSummary) } : {}),
    ...(agent.bestReadTarget ? { bestReadTarget: agent.bestReadTarget } : {}),
    ...(typeof agent.bestReadTargetScore === "number" ? { bestReadTargetScore: agent.bestReadTargetScore } : {}),
    ...(agent.bestReadTargetReason ? { bestReadTargetReason: agent.bestReadTargetReason } : {}),
    ...(agent.primaryExecution ? { primaryExecution: agent.primaryExecution } : {}),
    ...(agent.primaryReadFrom ? { primaryReadFrom: agent.primaryReadFrom } : {}),
    ...(agent.primaryCommand ? { primaryCommand: agent.primaryCommand } : {}),
    ...(agent.primaryCommandArgs ? { primaryCommandArgs: agent.primaryCommandArgs } : {}),
    ...(agent.primaryAfterInteractionCommand ? { primaryAfterInteractionCommand: agent.primaryAfterInteractionCommand } : {}),
    ...(agent.primaryAfterInteractionCommandArgs ? { primaryAfterInteractionCommandArgs: agent.primaryAfterInteractionCommandArgs } : {}),
    ...(agent.primaryUrl ? { primaryUrl: agent.primaryUrl } : {}),
    ...(agent.primaryRank ? { primaryRank: agent.primaryRank } : {}),
    ...(agent.primaryOpenResult ? { primaryOpenResult: agent.primaryOpenResult } : {}),
    ...(agent.requiresBrowserInteraction ? { requiresBrowserInteraction: true } : {}),
    ...(agent.primaryAction ? { primaryAction: compactAgentAction(agent.primaryAction) } : {}),
    ...(agent.recommendedUrl ? { recommendedUrl: agent.recommendedUrl } : {}),
    ...(agent.recommendedTitle ? { recommendedTitle: agent.recommendedTitle } : {}),
    ...(agent.recommendedRank ? { recommendedRank: agent.recommendedRank } : {}),
    ...(agent.recommendedSource ? { recommendedSource: agent.recommendedSource } : {}),
    ...(agent.recommendedRelevance ? { recommendedRelevance: agent.recommendedRelevance } : {}),
    ...(typeof agent.recommendedLikelyOfficial === "boolean" ? { recommendedLikelyOfficial: agent.recommendedLikelyOfficial } : {}),
    ...(agent.recommendedSelectionReason ? { recommendedSelectionReason: agent.recommendedSelectionReason } : {}),
  };
}

function compactAgentPage(page: PageSummary): object {
  return page.description ? { page: { description: page.description } } : {};
}

function compactAgentVerification(verification: VerificationSummary, primaryAction?: SuggestedAction): object {
  if (verification.status === "not-requested") return {};
  const recommendedAction = sameSuggestedAction(verification.recommendedAction, primaryAction)
    ? undefined
    : verification.recommendedAction;
  return {
    verification: {
      status: verification.status,
      requestedCount: verification.requestedCount,
      foundCount: verification.foundCount,
      missingCount: verification.missingCount,
      evidenceCount: verification.evidenceCount,
      ...(verification.foundQueries.length > 0 ? { foundQueries: verification.foundQueries } : {}),
      ...(verification.missingQueries.length > 0 ? { missingQueries: verification.missingQueries } : {}),
      ...(verification.bestEvidence ? { bestEvidence: verification.bestEvidence } : {}),
      ...(recommendedAction ? { recommendedAction: compactAgentAction(recommendedAction) } : {}),
    },
  };
}

function compactAgentSearchEngines(attempts: SearchAttemptSummary[] | undefined): object {
  if (!attempts || attempts.length === 0) return {};
  return {
    searchEngines: attempts.map((attempt) => ({
      engine: attempt.engine,
      ok: attempt.ok,
      resultCount: attempt.resultCount,
      ...(attempt.kind ? { kind: attempt.kind } : {}),
      ...(typeof attempt.status === "number" ? { status: attempt.status } : {}),
      ...(attempt.finalUrl && attempt.finalUrl !== attempt.url ? { finalUrl: attempt.finalUrl } : {}),
      ...(attempt.diagnostics?.length ? { diagnosticCodes: attempt.diagnostics.map((item) => item.code) } : {}),
      ...(attempt.topResult ? { topResult: compactAttemptTopResult(attempt.topResult) } : {}),
      ...(attempt.error ? { error: { code: attempt.error.code, ...(attempt.error.status ? { status: attempt.error.status } : {}) } } : {}),
    })),
  };
}

function compactAgentSourceSearch(sourceSearch: SourceSearchSummary | undefined): object | undefined {
  if (!sourceSearch) return undefined;
  return {
    query: sourceSearch.query,
    engine: sourceSearch.engine,
    ...(sourceSearch.selectedEngine ? { selectedEngine: sourceSearch.selectedEngine } : {}),
    searchUrl: sourceSearch.searchUrl,
    ...(sourceSearch.lang ? { lang: sourceSearch.lang } : {}),
    ...(sourceSearch.region ? { region: sourceSearch.region } : {}),
    ...(sourceSearch.findQueries?.length ? { findQueries: sourceSearch.findQueries } : {}),
    selectedRank: sourceSearch.selectedRank,
    selectedTitle: sourceSearch.selectedTitle,
    selectedUrl: sourceSearch.selectedUrl,
    ...(sourceSearch.selectedResult ? { selectedResult: compactAgentSourceSearchResult(sourceSearch, sourceSearch.selectedResult) } : {}),
    ...(sourceSearch.alternateResults?.length ? { alternateResults: sourceSearch.alternateResults.map((result, index) => compactAgentSourceSearchResult(sourceSearch, result, index)) } : {}),
  };
}

function compactAgentSourceSearchResult(sourceSearch: SourceSearchSummary, result: ResultSummary, index?: number): object {
  const command = searchOpenCommandSpec(
    sourceSearch.query,
    sourceSearch.selectedEngine ?? sourceSearch.engine,
    sourceSearch.findQueries ?? [],
    true,
    sourceSearch.lang,
    sourceSearch.region,
    result.rank,
    sourceSearch.timeoutMs,
    sourceSearch.userAgent,
  );
  const path = index === undefined ? "sourceSearch.selectedResult" : `sourceSearch.alternateResults[${index}]`;
  return {
    ...compactAgentSearchResult(result, undefined, {
      id: index === undefined ? "selected" : `a${result.rank}`,
      path,
    }),
    ...commandFields(command),
  };
}

function compactAttemptTopResult(topResult: NonNullable<SearchAttemptSummary["topResult"]>): object {
  return {
    title: topResult.title,
    url: topResult.url,
    ...(topResult.relevance ? { relevance: topResult.relevance } : {}),
    ...(typeof topResult.isLikelyOfficial === "boolean" ? { isLikelyOfficial: topResult.isLikelyOfficial } : {}),
  };
}

function searchResultCommandContext(options: CliOptions): SearchResultCommandContext | undefined {
  const inferred = inferSearchResultCommandContext(options.url);
  if (!options.searchQuery && !inferred?.engine) return undefined;
  const query = options.searchQuery ?? inferred?.query;
  if (!query) return undefined;
  const engine = options.selectedSearchEngine ?? options.searchEngine ?? inferred?.engine;
  return {
    query,
    findQueries: options.findQueries ?? [],
    agentMode: true,
    ...(engine ? { engine } : {}),
    ...(options.searchLang ? { lang: options.searchLang } : {}),
    ...(options.searchRegion ? { region: options.searchRegion } : {}),
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
  };
}

function inferSearchResultCommandContext(url: string | undefined): Pick<SearchResultCommandContext, "query" | "engine"> | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (hostname.endsWith("bing.com")) {
      const query = parsed.searchParams.get("q");
      return query ? { query, engine: "bing" } : undefined;
    }
    if (hostname.endsWith("duckduckgo.com")) {
      const query = parsed.searchParams.get("q");
      return query ? { query, engine: "duckduckgo" } : undefined;
    }
    if (hostname.endsWith("startpage.com")) {
      const query = parsed.searchParams.get("query");
      return query ? { query, engine: "startpage" } : undefined;
    }
    if (hostname.endsWith("google.com")) {
      const query = parsed.searchParams.get("q");
      return query ? { query } : undefined;
    }
    if (hostname.endsWith("baidu.com")) {
      const query = parsed.searchParams.get("wd") ?? parsed.searchParams.get("word");
      return query ? { query } : undefined;
    }
    if (hostname.endsWith("search.yahoo.co.jp")) {
      const query = parsed.searchParams.get("p");
      return query ? { query } : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function pageLinkCommandContext(options: CliOptions): PageLinkCommandContext {
  return {
    agentMode: true,
    findQueries: options.findQueries ?? [],
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
  };
}

function compactAgentSearchResults(
  results: ResultSummary[],
  recommendedResult?: ResultSummary,
  commandContext?: SearchResultCommandContext,
  fallbackCommandContext?: PageLinkCommandContext,
): object {
  if (results.length === 0) return {};
  const selected = selectCompactSearchResults(results, recommendedResult);
  return {
    searchResults: selected.map((result, index) => compactAgentSearchResult(
      result,
      commandContext,
      { id: `r${result.rank}`, path: `searchResults[${index}]` },
      fallbackCommandContext,
    )),
  };
}

function selectCompactSearchResults(results: ResultSummary[], recommendedResult?: ResultSummary): ResultSummary[] {
  const selected: ResultSummary[] = [];
  const seen = new Set<string>();
  const add = (result: ResultSummary | undefined): void => {
    if (!result) return;
    const key = `${result.rank}:${result.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(result);
  };
  for (const result of results.slice(0, 5)) add(result);
  add(recommendedResult);
  return selected;
}

function compactAgentSearchResult(
  result: ResultSummary,
  commandContext?: SearchResultCommandContext,
  reference?: { id: string; path: string },
  fallbackCommandContext?: PageLinkCommandContext,
): ResultSummary & Partial<Pick<SuggestedAction, "openResult" | "command" | "commandArgs">> {
  const command = commandContext
    ? searchOpenCommandSpec(
        commandContext.query,
        commandContext.engine,
        commandContext.findQueries,
        commandContext.agentMode,
        commandContext.lang,
        commandContext.region,
        result.rank,
        commandContext.timeoutMs,
        commandContext.userAgent,
      )
    : fallbackCommandContext
      ? pageCommandSpec(result.url, fallbackCommandContext.agentMode, false, fallbackCommandContext.findQueries, fallbackCommandContext.timeoutMs, fallbackCommandContext.userAgent)
      : undefined;
  const compact: ResultSummary = {
    ...(reference ? { id: reference.id, path: reference.path } : {}),
    title: result.title,
    url: result.url,
    source: result.source,
    rank: result.rank,
  };
  if (result.snippet) compact.snippet = result.snippet;
  if (result.sourceType) compact.sourceType = result.sourceType;
  if (typeof result.sourceScore === "number") compact.sourceScore = result.sourceScore;
  if (result.sourceHints?.length) compact.sourceHints = result.sourceHints;
  if (result.relevance) compact.relevance = result.relevance;
  if (result.matchedTerms?.length) compact.matchedTerms = result.matchedTerms;
  if (result.findMatches?.length) compact.findMatches = result.findMatches;
  if (typeof result.isLikelyOfficial === "boolean") compact.isLikelyOfficial = result.isLikelyOfficial;
  compact.selectionReason = result.selectionReason ?? searchResultSelectionReason(result);
  return {
    ...compact,
    ...(command ? { openResult: result.rank, ...commandFields(command) } : {}),
  };
}

function compactAgentPageLink(
  link: PageLinkSummary,
  commandContext?: PageLinkCommandContext,
  reference?: { id: string; path: string },
): PageLinkSummary & Partial<Pick<SuggestedAction, "command" | "commandArgs">> {
  const compact: PageLinkSummary = {
    ...(reference ? { id: reference.id, path: reference.path } : {}),
    title: link.title,
    url: link.url,
    source: link.source,
    rank: link.rank,
    kind: link.kind,
  };
  if (link.sourceType) compact.sourceType = link.sourceType;
  if (typeof link.sourceScore === "number") compact.sourceScore = link.sourceScore;
  if (link.sourceHints) compact.sourceHints = link.sourceHints;
  if (link.relevance) compact.relevance = link.relevance;
  if (link.matchedTerms) compact.matchedTerms = link.matchedTerms;
  if (link.findMatches) compact.findMatches = link.findMatches;
  if (typeof link.isLikelyOfficial === "boolean") compact.isLikelyOfficial = link.isLikelyOfficial;
  compact.selectionReason = link.selectionReason ?? sourceLinkSelectionReason(link);
  const command = commandContext ? pageCommandSpec(link.url, commandContext.agentMode, false, commandContext.findQueries, commandContext.timeoutMs, commandContext.userAgent) : undefined;
  return {
    ...compact,
    ...(command ? commandFields(command) : {}),
  };
}

function agentTargetFromResult(result: ResultSummary): AgentTarget {
  return {
    title: result.title,
    url: result.url,
    source: result.source,
    rank: result.rank,
    ...(result.sourceType ? { sourceType: result.sourceType } : {}),
    ...(typeof result.sourceScore === "number" ? { sourceScore: result.sourceScore } : {}),
    ...(result.sourceHints?.length ? { sourceHints: result.sourceHints } : {}),
    ...(result.relevance ? { relevance: result.relevance } : {}),
    ...(result.matchedTerms?.length ? { matchedTerms: result.matchedTerms } : {}),
    ...(result.findMatches?.length ? { findMatches: result.findMatches } : {}),
    ...(typeof result.isLikelyOfficial === "boolean" ? { isLikelyOfficial: result.isLikelyOfficial } : {}),
    selectionReason: result.selectionReason ?? searchResultSelectionReason(result),
  };
}

function compactAgentAction(action: SuggestedAction): object {
  return {
    action: action.action,
    execution: actionExecution(action),
    priority: action.priority ?? actionPriority(action),
    priorityReason: action.priorityReason ?? actionPriorityReason(action),
    reason: action.reason,
    ...(action.url ? { url: action.url } : {}),
    ...(action.rank ? { rank: action.rank } : {}),
    ...(action.openResult ? { openResult: action.openResult } : {}),
    ...(action.command ? { command: action.command } : {}),
    ...(action.commandArgs ? { commandArgs: action.commandArgs } : {}),
    ...(action.afterInteractionCommand ? { afterInteractionCommand: action.afterInteractionCommand } : {}),
    ...(action.afterInteractionCommandArgs ? { afterInteractionCommandArgs: action.afterInteractionCommandArgs } : {}),
    ...(action.terminal ? { terminal: action.terminal } : {}),
    ...(action.readFrom ? { readFrom: action.readFrom } : {}),
    ...(action.requiresBrowserInteraction ? { requiresBrowserInteraction: action.requiresBrowserInteraction } : {}),
    ...(action.target ? { target: action.target } : {}),
  };
}

function compactAgentActionSummary(action: AgentActionSummary): object {
  return {
    ...compactAgentAction(action),
    source: action.source,
    ...(action.primary ? { primary: true } : {}),
    ...(typeof action.index === "number" ? { index: action.index } : {}),
  };
}

function actionExecution(action: SuggestedAction): NonNullable<SuggestedAction["execution"]> {
  if (action.execution) return action.execution;
  if (action.terminal) return "read-current";
  if (action.requiresBrowserInteraction || action.action === "inspect-browser-state") return "interact-browser";
  if (action.command) return "run-command";
  return "inspect-output";
}

function actionPriority(action: SuggestedAction): NonNullable<SuggestedAction["priority"]> {
  if (action.action === "use-evidence" || action.action === "read-content" || action.terminal) return "high";
  if (action.action === "open-result" || action.action === "open-alternate-result") return "high";
  if (action.action === "retry-with-browser-html") return "high";
  if (action.action === "open-source-link" || action.action === "refine-search" || action.action === "broaden-search") return "medium";
  if (action.requiresBrowserInteraction || actionExecution(action) === "interact-browser") return "medium";
  return "low";
}

function actionPriorityReason(action: SuggestedAction): string {
  if (action.action === "use-evidence") return "Confirmed evidence can be returned from the current payload.";
  if (action.action === "read-content" || action.terminal) return "Readable content evidence is available in the current payload.";
  if (action.action === "open-result" || action.action === "open-alternate-result") return "Opening the selected result is the next required executor step.";
  if (action.action === "retry-with-browser-html") return "Browser-captured HTML is required to make progress.";
  if (action.action === "open-source-link") return "External source-like link can improve verification.";
  if (action.action === "refine-search" || action.action === "broaden-search") return "Search needs refinement before a reliable result can be opened.";
  if (action.requiresBrowserInteraction || actionExecution(action) === "interact-browser") return "Browser interaction may expose additional content or controls.";
  return "Inspect current output before choosing another action.";
}

function withActionExecution(action: SuggestedAction): SuggestedAction {
  return {
    ...action,
    execution: actionExecution(action),
    priority: action.priority ?? actionPriority(action),
    priorityReason: action.priorityReason ?? actionPriorityReason(action),
  };
}

function withPageCheckActionExecution(pageCheck: PageCheckSummary): PageCheckSummary {
  return {
    ...pageCheck,
    recommendedAction: withActionExecution(pageCheck.recommendedAction),
    nextSteps: pageCheck.nextSteps.map(withActionExecution),
  };
}

function withVerificationActionExecution(verification: VerificationSummary): VerificationSummary {
  return verification.recommendedAction
    ? { ...verification, recommendedAction: withActionExecution(verification.recommendedAction) }
    : verification;
}

function withAgentActionExecution(agent: AgentSummary): AgentSummary {
  return {
    ...agent,
    actions: agent.actions.map((action) => ({
      ...withActionExecution(action),
      source: action.source,
      ...(action.primary ? { primary: true } : {}),
      ...(typeof action.index === "number" ? { index: action.index } : {}),
    })),
    ...(agent.primaryAction ? { primaryExecution: actionExecution(agent.primaryAction), primaryAction: withActionExecution(agent.primaryAction) } : {}),
  };
}

function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof UsageError) return new CliError("USAGE", error.message, 2);
  return new CliError("FETCH_FAILED", error instanceof Error ? error.message : String(error), 10);
}

function parseArgMetadata(argv: string[]): Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "agentMode" | "findQueries" | "timeoutMs" | "userAgent">> {
  const metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "agentMode" | "findQueries" | "timeoutMs" | "userAgent">> = { extractOptions: {}, findQueries: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--agent") {
      metadata.agentMode = true;
      continue;
    }
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
      if (value === "auto" || value === "bing" || value === "duckduckgo" || value === "startpage") metadata.searchEngine = value;
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
    if (arg === "--find") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.findQueries?.push(value);
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      const value = argv[index + 1];
      const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
      if (Number.isFinite(parsed) && parsed > 0) metadata.timeoutMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--user-agent") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.userAgent = value;
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
