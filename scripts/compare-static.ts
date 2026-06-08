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
  agentStatus: "ready" | "choose-result" | "verify" | "needs-browser" | "error" | "unknown";
  agentExecutorScore: number;
  agentContractScore: number;
  agentRoutingIntentScore: number;
  agentContinuationModeScore: number;
  agentNextScore: number;
  agentExpectedOutcomeScore: number;
  agentSignalScore: number;
  pageLinkCommandScore: number;
  agentPageKindScore: number;
  agentAlternativeActionCountScore: number;
  agentUsabilityScoreConsistency: number;
  agentEvidenceQualityScoreConsistency: number;
  agentSourceQualityScoreConsistency: number;
  agentBestReadTargetScore: number;
  agentDiagnosticCountScore: number;
  agentVerificationCountScore: number;
  agentResponseMetadataScore: number;
  agentPrimaryAction?: string;
  agentPrimaryExecution?: ActionExecution;
  agentReadTargetScore: number;
  agentResultCountScore: number;
  agentSourceLinkCountScore: number;
  agentBrowserNeedScore: number;
  agentReadabilityReasonScore: number;
  agentSourceSearchProvenanceScore: number;
  agentRecommendedMetadataScore: number;
  agentCanContinueScore: number;
  agentPrimaryExecutionScore: number;
  agentPrimaryShortcutScore: number;
  agentCitationScore: number;
  agentAnswerPlanScore: number;
  pageCheck: {
    confidence: "low" | "medium" | "high";
    readabilityLevel: "low" | "medium" | "high";
    readabilityScore: number;
    readabilityReasonScore: number;
    contentPreviewCount: number;
    contentEvidenceCount: number;
    contentEvidenceMetadataScore: number;
    contentLength: number;
    primaryLinkCount: number;
    sourceLinkCount: number;
    averageSourceScore: number;
    actionCount: number;
    recommendedAction?: string;
    nextStepCount: number;
  };
  searchResultCount: number;
  searchResultActionScore: number;
  suggestedActionCount: number;
  actionExecutionCounts: Record<ActionExecution, number>;
  actionSchemaScore: number;
  verificationStatus: "not-requested" | "matched" | "partial" | "missing";
  verificationEvidenceCount: number;
  score: number;
};

type ActionExecution = "run-command" | "read-current" | "interact-browser" | "inspect-output" | "unknown";
type AgentRoutingIntent = "read-current" | "open-url" | "search" | "browser-html" | "browser-interaction" | "inspect-output" | "none";
type AgentContinuationMode = "command" | "read" | "browser" | "capture-html" | "inspect" | "stop";

type CliActionShape = {
  action?: string;
  reason?: string;
  url?: string;
  rank?: number;
  openResult?: number | "best";
  execution?: ActionExecution;
  command?: string;
  commandArgs?: string[];
  readFrom?: string;
  requiresBrowserInteraction?: boolean;
  terminal?: boolean;
  target?: CliAgentTargetShape;
};

type CliAgentNextShape = CliActionShape & {
  mode?: AgentContinuationMode;
  reason?: string;
  loop?: CliAgentLoopShape;
  readTarget?: CliReadTargetShape;
  readValue?: {
    path?: string;
    value?: unknown;
  };
};

type CliAgentLoopShape = {
  decision?: "return" | "execute" | "browser" | "inspect" | "stop";
  shouldContinue?: boolean;
  terminal?: boolean;
  reason?: string;
  maxSuggestedIterations?: number;
};

type CliAgentTargetShape = {
  title?: string;
  url?: string;
  source?: string;
  rank?: number;
  sourceType?: string;
  sourceScore?: number;
  sourceHints?: string[];
  relevance?: "low" | "medium" | "high";
  matchedTerms?: string[];
  findMatches?: string[];
  isLikelyOfficial?: boolean;
  selectionReason?: string;
};

type CliAgentSignalShape = {
  kind?: "content" | "verification" | "search-results" | "source-links" | "browser" | "diagnostic" | "response";
  severity?: "info" | "warning" | "error";
  message?: string;
};

type CliAgentExpectedOutcomeShape = {
  kind?: "read-evidence" | "open-result" | "run-search" | "capture-html" | "browser-inspection" | "inspect-output" | "stop";
  message?: string;
};

type CliSearchResultShape = {
  id?: string;
  path?: string;
  rank?: number;
  source?: string;
  sourceScore?: number;
  relevance?: "low" | "medium" | "high";
  isLikelyOfficial?: boolean;
  selectionReason?: string;
  openResult?: number | "best";
  command?: string;
  commandArgs?: string[];
};

type CliAgentCitationShape = {
  kind?: string;
  id?: string;
  path?: string;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
};

type CliAgentAnswerPlanShape = {
  status?: "ready" | "needs-more" | "blocked" | "error";
  confidence?: "low" | "medium" | "high";
  reason?: string;
  gaps?: unknown[];
  useCitationIds?: unknown[];
  nextAction?: string;
  command?: string;
  commandArgs?: unknown[];
  url?: string;
  readFrom?: string;
};

type CliReadTargetShape = {
  path?: string;
  reason?: string;
  count?: number;
  score?: number;
  primary?: boolean;
};

type CliContentEvidenceShape = {
  id?: string;
  path?: string;
  source?: string;
  score?: number;
  quality?: string;
  qualityReason?: string;
};

type StaticClassification = "usable" | "needs-browser" | "challenge" | "shell" | "over-collected" | "reference-challenge" | "reference-missing" | "volatile";

type GateSummary = {
  included: number;
  excluded: number;
  averageScore: number;
  averageCliAgentScore: number;
  averageAgentExecutorScore: number;
  averageAgentContractScore: number;
  averageActionSchemaScore: number;
  averageSearchResultActionScore: number;
  averageContentEvidenceMetadataScore: number;
  averageReadabilityReasonScore: number;
  averageAgentRoutingIntentScore: number;
  averageAgentContinuationModeScore: number;
  averageAgentNextScore: number;
  averageAgentExpectedOutcomeScore: number;
  averageAgentSignalScore: number;
  averagePageLinkCommandScore: number;
  averageAgentReadTargetScore: number;
  averageAgentResultCountScore: number;
  averageAgentSourceLinkCountScore: number;
  averageAgentBrowserNeedScore: number;
  averageAgentPageKindScore: number;
  averageAgentAlternativeActionCountScore: number;
  averageAgentUsabilityScoreConsistency: number;
  averageAgentEvidenceQualityScoreConsistency: number;
  averageAgentSourceQualityScoreConsistency: number;
  averageAgentBestReadTargetScore: number;
  averageAgentDiagnosticCountScore: number;
  averageAgentVerificationCountScore: number;
  averageAgentResponseMetadataScore: number;
  averageAgentReadabilityReasonScore: number;
  averageAgentSourceSearchProvenanceScore: number;
  averageAgentRecommendedMetadataScore: number;
  averageAgentCanContinueScore: number;
  averageAgentPrimaryExecutionScore: number;
  averageAgentPrimaryShortcutScore: number;
  averageAgentCitationScore: number;
  averageAgentAnswerPlanScore: number;
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
  const cliAgentSummary = await summarizeCliAgentOutput(target.url, html, source, status, warnings);
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
  try {
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
  } catch (error) {
    warnings.push(`fetch failed: ${trimError(error)}`);
    const rendered = runAgentBrowserHtml(url, session, warnings);
    if (rendered) return { html: rendered.html, source: "agent-browser-rendered", status: 0, agentBrowser: rendered.agentBrowser };
    return { html: "", source: "fetch", status: 0 };
  }
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

async function summarizeCliAgentOutput(
  url: string,
  html: string,
  source: "fetch" | "agent-browser-rendered",
  status: number,
  warnings: string[],
): Promise<CliAgentSummary> {
  const stdout = createMemoryWriter();
  const stderr = createMemoryWriter();
  const args = source === "agent-browser-rendered" ? [url, "--stdin", "--agent"] : [url, "--agent"];
  const cliStatus = await runCli(args, {
    stdout,
    stderr,
    ...(source === "agent-browser-rendered" ? { stdin: Readable.from([html]) as NodeJS.ReadStream } : {}),
    fetch: async () => {
      if (source === "agent-browser-rendered") throw new Error("compare-static should pass rendered HTML through stdin");
      return new Response(html, {
        status: status || 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  if (cliStatus !== 0) warnings.push(`ax-grep CLI summary exited ${cliStatus}: ${trimError(stderr.output || stdout.output)}`);
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
    url?: string;
    finalUrl?: string;
    status?: number;
    contentType?: string;
    agent?: {
      contract?: {
        version?: number;
        features?: unknown[];
      };
      status?: "ready" | "choose-result" | "verify" | "needs-browser" | "error";
      routingIntent?: AgentRoutingIntent;
      continuationMode?: AgentContinuationMode;
      next?: CliAgentNextShape;
      expectedOutcome?: CliAgentExpectedOutcomeShape;
      answerPlan?: CliAgentAnswerPlanShape;
      signals?: CliAgentSignalShape[];
      responseStatus?: number;
      responseOk?: boolean;
      responseContentType?: string;
      finalUrlChanged?: boolean;
      pageKind?: string;
      usabilityScore?: number;
      evidenceQualityScore?: number;
      sourceQualityScore?: number;
      alternativeActionCount?: number;
      bestReadTarget?: string;
      bestReadTargetScore?: number;
      bestReadTargetReason?: string;
      diagnosticErrorCount?: number;
      diagnosticWarningCount?: number;
      diagnosticInfoCount?: number;
      verificationRequestedCount?: number;
      verificationFoundCount?: number;
      verificationMissingCount?: number;
      canContinue?: boolean;
      needsBrowserHtml?: boolean;
      readabilityReasons?: unknown[];
      recommendedRank?: number;
      recommendedSource?: string;
      recommendedRelevance?: "low" | "medium" | "high";
      recommendedLikelyOfficial?: boolean;
      resultCount?: number;
      sourceLinkCount?: number;
      primaryExecution?: ActionExecution;
      primaryReadFrom?: string;
      primaryCommand?: string;
      primaryCommandArgs?: string[];
      primaryUrl?: string;
      primaryRank?: number;
      primaryOpenResult?: number | "best";
      requiresBrowserInteraction?: boolean;
      primaryAction?: CliActionShape;
      citations?: CliAgentCitationShape[];
      readTargets?: CliReadTargetShape[];
    };
    diagnostics?: Array<{ severity?: "info" | "warning" | "error" }>;
    sourceSearch?: {
      selectedResult?: unknown;
      alternateResults?: unknown[];
    };
    pageCheck?: {
      confidence?: "low" | "medium" | "high";
      readability?: {
        level?: "low" | "medium" | "high";
        score?: number;
        reasons?: unknown[];
      };
      contentPreview?: unknown[];
      contentEvidence?: CliContentEvidenceShape[];
      contentLength?: number;
      primaryLinks?: Array<{ sourceScore?: number; command?: string; commandArgs?: string[] }>;
      sourceLinks?: Array<{ sourceScore?: number; command?: string; commandArgs?: string[] }>;
      actions?: unknown[];
      recommendedAction?: CliActionShape;
      nextSteps?: CliActionShape[];
    };
    searchResults?: CliSearchResultShape[];
    recommendedResult?: CliSearchResultShape;
    suggestedActions?: CliActionShape[];
    verification?: {
      status?: "not-requested" | "matched" | "partial" | "missing";
      requestedCount?: number;
      foundCount?: number;
      missingCount?: number;
      evidenceCount?: number;
      recommendedAction?: CliActionShape;
    };
  };
  const confidence = item.pageCheck?.confidence ?? "low";
  const readabilityLevel = item.pageCheck?.readability?.level ?? "low";
  const cliActions = collectCliActions(item);
  const pageCheckSummary: CliAgentSummary["pageCheck"] = {
    confidence,
    readabilityLevel,
    readabilityScore: typeof item.pageCheck?.readability?.score === "number" ? item.pageCheck.readability.score : 0,
    readabilityReasonScore: scoreReadabilityReasons(item.pageCheck?.readability?.reasons),
    contentPreviewCount: item.pageCheck?.contentPreview?.length ?? 0,
    contentEvidenceCount: item.pageCheck?.contentEvidence?.length ?? 0,
    contentEvidenceMetadataScore: scoreContentEvidenceMetadata(item.pageCheck?.contentEvidence ?? []),
    contentLength: item.pageCheck?.contentLength ?? 0,
    primaryLinkCount: item.pageCheck?.primaryLinks?.length ?? item.pageCheck?.sourceLinks?.length ?? 0,
    sourceLinkCount: item.pageCheck?.sourceLinks?.length ?? 0,
    averageSourceScore: averageSourceScore(item.pageCheck?.sourceLinks ?? []),
    actionCount: item.pageCheck?.actions?.length ?? 0,
    nextStepCount: item.pageCheck?.nextSteps?.length ?? 0,
  };
  if (item.pageCheck?.recommendedAction?.action) pageCheckSummary.recommendedAction = item.pageCheck.recommendedAction.action;
  const summary: CliAgentSummary = {
    ok: item.ok === true,
    kind: item.kind ?? "unknown",
    agentStatus: item.agent?.status ?? "unknown",
    agentExecutorScore: 0,
    agentContractScore: scoreAgentContract(item.agent?.contract),
    agentRoutingIntentScore: scoreAgentRoutingIntent(item.agent?.routingIntent, item.agent?.primaryAction),
    agentContinuationModeScore: scoreAgentContinuationMode(item.agent?.continuationMode, item.agent?.primaryAction),
    agentNextScore: scoreAgentNext(item.agent?.next, item.agent?.continuationMode, item.agent?.primaryAction),
    agentExpectedOutcomeScore: scoreAgentExpectedOutcome(item.agent?.expectedOutcome, item.agent?.primaryAction),
    agentSignalScore: scoreAgentSignals(item.agent?.signals, item),
    pageLinkCommandScore: scorePageLinkCommands(item.pageCheck?.primaryLinks ?? [], item.pageCheck?.sourceLinks ?? []),
    agentPageKindScore: scoreAgentPageKind(item.agent?.pageKind, item.kind),
    agentAlternativeActionCountScore: scoreAgentAlternativeActionCount(item.agent?.alternativeActionCount, item),
    agentUsabilityScoreConsistency: scoreAgentUsabilityScore(item.agent?.usabilityScore, item),
    agentEvidenceQualityScoreConsistency: scoreAgentEvidenceQualityScore(item.agent?.evidenceQualityScore, item.pageCheck?.contentEvidence ?? []),
    agentSourceQualityScoreConsistency: scoreAgentSourceQualityScore(item.agent?.sourceQualityScore, item.kind, item.pageCheck?.sourceLinks ?? [], item.searchResults ?? []),
    agentBestReadTargetScore: scoreAgentBestReadTarget(item.agent),
    agentDiagnosticCountScore: scoreAgentDiagnosticCounts(item.agent, item.diagnostics ?? []),
    agentVerificationCountScore: scoreAgentVerificationCounts(item.agent, item.verification),
    agentResponseMetadataScore: scoreAgentResponseMetadata(item.agent, item),
    agentReadTargetScore: scoreAgentReadTargets(item.agent?.readTargets ?? [], item.agent?.primaryAction, item),
    agentResultCountScore: scoreAgentResultCount(item.kind ?? "unknown", item.agent?.resultCount, item.searchResults ?? []),
    agentSourceLinkCountScore: scoreAgentSourceLinkCount(item.kind ?? "unknown", item.agent?.sourceLinkCount, item.pageCheck?.sourceLinks ?? []),
    agentBrowserNeedScore: scoreAgentBrowserNeed(item.agent?.needsBrowserHtml, item.agent?.status, item.agent?.primaryAction),
    agentReadabilityReasonScore: scoreReadabilityReasons(item.agent?.readabilityReasons),
    agentSourceSearchProvenanceScore: scoreAgentSourceSearchProvenance(item.sourceSearch, item.agent?.readTargets ?? []),
    agentRecommendedMetadataScore: scoreAgentRecommendedMetadata(item.agent, item.recommendedResult),
    agentCanContinueScore: scoreAgentCanContinue(item.agent?.canContinue, item.agent?.primaryAction),
    agentPrimaryExecutionScore: scoreAgentPrimaryExecution(item.agent?.primaryExecution, item.agent?.primaryAction),
    agentPrimaryShortcutScore: scoreAgentPrimaryShortcuts(item.agent),
    agentCitationScore: scoreAgentCitations(item.agent?.citations ?? [], item),
    agentAnswerPlanScore: scoreAgentAnswerPlan(item.agent?.answerPlan, item.agent?.citations ?? [], item.agent?.primaryAction),
    pageCheck: pageCheckSummary,
    searchResultCount: item.searchResults?.length ?? 0,
    searchResultActionScore: scoreSearchResultActions(item.searchResults ?? []),
    suggestedActionCount: item.suggestedActions?.length ?? 0,
    actionExecutionCounts: actionExecutionCounts(cliActions),
    actionSchemaScore: scoreActionSchema(cliActions),
    verificationStatus: item.verification?.status ?? "not-requested",
    verificationEvidenceCount: item.verification?.evidenceCount ?? 0,
    score: 0,
  };
  if (item.agent?.primaryAction?.action) summary.agentPrimaryAction = item.agent.primaryAction.action;
  if (item.agent?.primaryExecution) summary.agentPrimaryExecution = item.agent.primaryExecution;
  summary.agentExecutorScore = scoreAgentExecutorSummary(summary);
  summary.score = scoreCliAgentSummary(summary);
  return summary;
}

function emptyCliAgentSummary(): CliAgentSummary {
  return {
    ok: false,
    kind: "unknown",
    agentStatus: "unknown",
    agentExecutorScore: 0,
    agentContractScore: 0,
    agentRoutingIntentScore: 0,
    agentContinuationModeScore: 0,
    agentNextScore: 0,
    agentExpectedOutcomeScore: 0,
    agentSignalScore: 0,
    pageLinkCommandScore: 0,
    agentPageKindScore: 0,
    agentAlternativeActionCountScore: 0,
    agentUsabilityScoreConsistency: 0,
    agentEvidenceQualityScoreConsistency: 0,
    agentSourceQualityScoreConsistency: 0,
    agentBestReadTargetScore: 0,
    agentDiagnosticCountScore: 0,
    agentVerificationCountScore: 0,
    agentResponseMetadataScore: 0,
    agentReadTargetScore: 0,
    agentResultCountScore: 0,
    agentSourceLinkCountScore: 0,
    agentBrowserNeedScore: 0,
    agentReadabilityReasonScore: 0,
    agentSourceSearchProvenanceScore: 0,
    agentRecommendedMetadataScore: 0,
    agentCanContinueScore: 0,
    agentPrimaryExecutionScore: 0,
    agentPrimaryShortcutScore: 0,
    agentCitationScore: 0,
    agentAnswerPlanScore: 0,
    pageCheck: {
      confidence: "low",
      readabilityLevel: "low",
      readabilityScore: 0,
      readabilityReasonScore: 1,
      contentPreviewCount: 0,
      contentEvidenceCount: 0,
      contentEvidenceMetadataScore: 1,
      contentLength: 0,
      primaryLinkCount: 0,
      sourceLinkCount: 0,
      averageSourceScore: 0,
      actionCount: 0,
      nextStepCount: 0,
    },
    searchResultCount: 0,
    searchResultActionScore: 1,
    suggestedActionCount: 0,
    actionExecutionCounts: emptyActionExecutionCounts(),
    actionSchemaScore: 0,
    verificationStatus: "not-requested",
    verificationEvidenceCount: 0,
    score: 0,
  };
}

function collectCliActions(item: {
  agent?: { primaryAction?: CliActionShape };
  pageCheck?: { recommendedAction?: CliActionShape; nextSteps?: CliActionShape[] };
  suggestedActions?: CliActionShape[];
  verification?: { recommendedAction?: CliActionShape };
}): CliActionShape[] {
  return [
    item.agent?.primaryAction,
    item.pageCheck?.recommendedAction,
    ...(item.pageCheck?.nextSteps ?? []),
    item.verification?.recommendedAction,
    ...(item.suggestedActions ?? []),
  ].filter((action): action is CliActionShape => Boolean(action?.action));
}

function emptyActionExecutionCounts(): Record<ActionExecution, number> {
  return {
    "run-command": 0,
    "read-current": 0,
    "interact-browser": 0,
    "inspect-output": 0,
    unknown: 0,
  };
}

function actionExecutionCounts(actions: CliActionShape[]): Record<ActionExecution, number> {
  const counts = emptyActionExecutionCounts();
  for (const action of actions) {
    counts[normalizedActionExecution(action)] += 1;
  }
  return counts;
}

function normalizedActionExecution(action: CliActionShape): ActionExecution {
  return action.execution && ["run-command", "read-current", "interact-browser", "inspect-output"].includes(action.execution)
    ? action.execution
    : "unknown";
}

function scoreActionSchema(actions: CliActionShape[]): number {
  if (actions.length === 0) return 0;
  const validCount = actions.filter((action) => {
    const execution = normalizedActionExecution(action);
    if (execution === "run-command") return Boolean(action.command) && Array.isArray(action.commandArgs) && action.commandArgs.length > 0;
    if (execution === "read-current") return Boolean(action.readFrom);
    if (execution === "interact-browser") return action.requiresBrowserInteraction === true || action.action === "inspect-browser-state";
    if (execution === "inspect-output") return !action.command;
    return false;
  }).length;
  return roundScore(validCount / actions.length);
}

function scoreSearchResultActions(results: CliSearchResultShape[]): number {
  if (results.length === 0) return 1;
  const runnableCount = results.filter((result) => {
    return typeof result.id === "string"
      && result.id.length > 0
      && typeof result.path === "string"
      && result.path.length > 0
      && typeof result.openResult !== "undefined"
      && Boolean(result.command)
      && Array.isArray(result.commandArgs)
      && result.commandArgs.length > 0;
  }).length;
  return roundScore(runnableCount / results.length);
}

function scoreContentEvidenceMetadata(evidence: CliContentEvidenceShape[]): number {
  if (evidence.length === 0) return 1;
  const validCount = evidence.filter((item) => {
    return typeof item.id === "string"
      && /^e\d+$/.test(item.id)
      && typeof item.path === "string"
      && item.path.startsWith("pageCheck.contentEvidence[")
      && (item.source === "semantic" || item.source === "fallback")
      && typeof item.score === "number"
      && item.score >= 0
      && item.score <= 1
      && (item.quality === "low" || item.quality === "medium" || item.quality === "high")
      && typeof item.qualityReason === "string"
      && item.qualityReason.length > 0;
  }).length;
  return roundScore(validCount / evidence.length);
}

function scoreReadabilityReasons(reasons: unknown[] | undefined): number {
  if (!Array.isArray(reasons)) return 0;
  const usefulReasons = reasons.filter((reason) => typeof reason === "string" && reason.trim().length > 0);
  return usefulReasons.length > 0 ? 1 : 0;
}

function scoreAgentContract(contract: { version?: number; features?: unknown[] } | undefined): number {
  if (!contract || contract.version !== 1 || !Array.isArray(contract.features)) return 0;
  const features = new Set(contract.features.filter((feature): feature is string => typeof feature === "string"));
  const required = [
    "next.loop",
    "next.readTarget",
    "next.readValue",
    "next.target",
    "citations",
    "answerPlan",
    "readTargets",
    "signals",
    "expectedOutcome",
    "responseMetadata",
    "primaryActionShortcuts",
  ];
  return required.every((feature) => features.has(feature)) ? 1 : 0;
}

function scoreAgentCitations(citations: CliAgentCitationShape[], envelope: unknown): number {
  if (citations.length === 0) return 0;
  const validKinds = new Set(["content", "verification", "search-result", "source-link"]);
  const validCount = citations.filter((citation) => {
    const hasReference = typeof citation.id === "string"
      && citation.id.length > 0
      && typeof citation.path === "string"
      && citation.path.length > 0
      && pathExists(envelope, citation.path);
    const hasPayload = typeof citation.text === "string"
      || typeof citation.title === "string"
      || typeof citation.url === "string";
    const hasValidScore = typeof citation.score === "undefined"
      || (typeof citation.score === "number" && citation.score >= 0 && citation.score <= 1);
    return hasReference
      && validKinds.has(String(citation.kind))
      && hasPayload
      && hasValidScore;
  }).length;
  return roundScore(validCount / citations.length);
}

function scoreAgentAnswerPlan(
  answerPlan: CliAgentAnswerPlanShape | undefined,
  citations: CliAgentCitationShape[],
  primaryAction: CliActionShape | undefined,
): number {
  if (!answerPlan) return 0;
  const validStatus = answerPlan.status === "ready"
    || answerPlan.status === "needs-more"
    || answerPlan.status === "blocked"
    || answerPlan.status === "error";
  const validReason = typeof answerPlan.reason === "string" && answerPlan.reason.length > 0;
  const validConfidence = answerPlan.confidence === "low" || answerPlan.confidence === "medium" || answerPlan.confidence === "high";
  const validGaps = Array.isArray(answerPlan.gaps) && answerPlan.gaps.every((gap) => typeof gap === "string" && gap.length > 0);
  const citationIds = new Set(citations.map((citation) => citation.id).filter((id): id is string => typeof id === "string"));
  const validCitations = Array.isArray(answerPlan.useCitationIds)
    && answerPlan.useCitationIds.every((id) => typeof id === "string" && citationIds.has(id));
  const validNextAction = typeof primaryAction?.action === "string"
    ? answerPlan.nextAction === primaryAction.action
    : typeof answerPlan.nextAction === "undefined";
  const validCommand = typeof primaryAction?.command === "string"
    ? answerPlan.command === primaryAction.command
    : typeof answerPlan.command === "undefined";
  const validCommandArgs = Array.isArray(primaryAction?.commandArgs)
    ? JSON.stringify(answerPlan.commandArgs) === JSON.stringify(primaryAction.commandArgs)
    : typeof answerPlan.commandArgs === "undefined";
  const validUrl = typeof primaryAction?.url === "string"
    ? answerPlan.url === primaryAction.url
    : typeof answerPlan.url === "undefined";
  const validReadFrom = typeof primaryAction?.readFrom === "string"
    ? answerPlan.readFrom === primaryAction.readFrom
    : typeof answerPlan.readFrom === "undefined";
  return validStatus && validConfidence && validReason && validGaps && validCitations && validNextAction && validCommand && validCommandArgs && validUrl && validReadFrom ? 1 : 0;
}

function scoreAgentRoutingIntent(routingIntent: AgentRoutingIntent | undefined, primaryAction: CliActionShape | undefined): number {
  return routingIntent === expectedAgentRoutingIntent(primaryAction) ? 1 : 0;
}

function scoreAgentContinuationMode(continuationMode: AgentContinuationMode | undefined, primaryAction: CliActionShape | undefined): number {
  return continuationMode === expectedAgentContinuationMode(primaryAction) ? 1 : 0;
}

function scoreAgentNext(next: CliAgentNextShape | undefined, continuationMode: AgentContinuationMode | undefined, primaryAction: CliActionShape | undefined): number {
  if (!next) return 0;
  const expectedMode = expectedAgentContinuationMode(primaryAction);
  let required = 2;
  let matched = 0;
  if (next.mode === expectedMode) matched += 1;
  if (continuationMode === undefined || next.mode === continuationMode) matched += 1;
  required += 1;
  if (scoreAgentNextLoop(next.loop, expectedMode) === 1) matched += 1;
  if (!primaryAction) {
    required += 2;
    if (!next.action) matched += 1;
    if (typeof next.reason === "string" && next.reason.length > 0) matched += 1;
    return roundScore(matched / required);
  }
  const fields: Array<keyof CliActionShape> = [
    "action",
    "execution",
    "url",
    "rank",
    "openResult",
    "readFrom",
    "command",
    "commandArgs",
    "requiresBrowserInteraction",
    "terminal",
    "target",
  ];
  for (const field of fields) {
    const expected = primaryAction[field];
    const actual = next[field];
    if (typeof expected !== "undefined") {
      required += 1;
      if (JSON.stringify(actual) === JSON.stringify(expected)) matched += 1;
    } else if (typeof actual !== "undefined") {
      required += 1;
    }
  }
  required += 1;
  if (typeof next.reason === "string" && next.reason === primaryAction.reason) matched += 1;
  if (primaryAction.readFrom) {
    required += 1;
    if (next.readTarget?.path === primaryAction.readFrom && typeof next.readTarget.reason === "string") matched += 1;
    required += 1;
    if (next.readValue?.path === primaryAction.readFrom && typeof next.readValue.value !== "undefined") matched += 1;
  } else if (typeof next.readTarget !== "undefined") {
    required += 1;
  } else if (typeof next.readValue !== "undefined") {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentNextLoop(loop: CliAgentLoopShape | undefined, mode: AgentContinuationMode): number {
  if (!loop) return 0;
  const expectedDecision = mode === "read"
    ? "return"
    : mode === "stop"
      ? "stop"
      : mode === "browser" || mode === "capture-html"
        ? "browser"
        : mode === "inspect"
          ? "inspect"
          : "execute";
  const expectedShouldContinue = expectedDecision === "execute" || expectedDecision === "browser";
  const expectedTerminal = expectedDecision === "return" || expectedDecision === "stop";
  return loop.decision === expectedDecision
    && loop.shouldContinue === expectedShouldContinue
    && loop.terminal === expectedTerminal
    && typeof loop.reason === "string"
    && loop.reason.length > 0
    && typeof loop.maxSuggestedIterations === "number" ? 1 : 0;
}

function scoreAgentSignals(signals: CliAgentSignalShape[] | undefined, envelope: {
  kind?: string;
  diagnostics?: Array<{ severity?: "info" | "warning" | "error" }>;
  agent?: { needsBrowserHtml?: boolean };
  pageCheck?: { contentEvidence?: unknown[]; sourceLinks?: unknown[] };
  searchResults?: unknown[];
  verification?: { requestedCount?: number };
}): number {
  if (!Array.isArray(signals) || signals.length === 0) return 0;
  const wellFormed = signals.filter((signal) => {
    return typeof signal.kind === "string"
      && ["info", "warning", "error"].includes(signal.severity ?? "")
      && typeof signal.message === "string"
      && signal.message.length > 0;
  }).length / signals.length;
  const kinds = new Set(signals.map((signal) => signal.kind));
  let required = 1;
  let matched = wellFormed > 0 ? wellFormed : 0;
  const expectKind = (condition: boolean, kind: CliAgentSignalShape["kind"]): void => {
    if (!condition || !kind) return;
    required += 1;
    if (kinds.has(kind)) matched += 1;
  };
  expectKind(envelope.agent?.needsBrowserHtml === true, "browser");
  expectKind((envelope.diagnostics?.length ?? 0) > 0, "diagnostic");
  expectKind(envelope.kind === "search-results", "search-results");
  expectKind((envelope.verification?.requestedCount ?? 0) > 0, "verification");
  expectKind(envelope.kind !== "search-results" && (envelope.pageCheck?.sourceLinks?.length ?? 0) > 0, "source-links");
  expectKind((envelope.pageCheck?.contentEvidence?.length ?? 0) > 0, "content");
  return roundScore(matched / required);
}

function scoreAgentExpectedOutcome(outcome: CliAgentExpectedOutcomeShape | undefined, primaryAction: CliActionShape | undefined): number {
  if (!outcome) return 0;
  let required = 2;
  let matched = 0;
  if (outcome.kind === expectedAgentOutcomeKind(primaryAction)) matched += 1;
  if (typeof outcome.message === "string" && outcome.message.length > 0) matched += 1;
  if (primaryAction?.readFrom) {
    required += 1;
    if (outcome.message?.includes(primaryAction.readFrom)) matched += 1;
  }
  return roundScore(matched / required);
}

function expectedAgentOutcomeKind(primaryAction: CliActionShape | undefined): NonNullable<CliAgentExpectedOutcomeShape["kind"]> {
  if (!primaryAction) return "stop";
  if (primaryAction.action === "retry-with-browser-html") return "capture-html";
  if (primaryAction.requiresBrowserInteraction || normalizedActionExecution(primaryAction) === "interact-browser") return "browser-inspection";
  if (normalizedActionExecution(primaryAction) === "read-current") return "read-evidence";
  if (primaryAction.action === "refine-search" || primaryAction.action === "broaden-search" || primaryAction.action === "check-url-or-search") return "run-search";
  if (primaryAction.action === "open-result" || primaryAction.action === "open-alternate-result" || primaryAction.action === "open-source-link" || primaryAction.url) return "open-result";
  if (normalizedActionExecution(primaryAction) === "inspect-output") return "inspect-output";
  return "inspect-output";
}

function scorePageLinkCommands(
  primaryLinks: Array<{ id?: string; path?: string; command?: string; commandArgs?: string[] }>,
  sourceLinks: Array<{ id?: string; path?: string; command?: string; commandArgs?: string[] }>,
): number {
  const links = [...primaryLinks, ...sourceLinks];
  if (links.length === 0) return 1;
  const validCount = links.filter((link) => {
    return typeof link.id === "string"
      && link.id.length > 0
      && typeof link.path === "string"
      && link.path.length > 0
      && typeof link.command === "string"
      && link.command.length > 0
      && Array.isArray(link.commandArgs)
      && link.commandArgs.length > 0;
  }).length;
  return roundScore(validCount / links.length);
}

function expectedAgentRoutingIntent(primaryAction: CliActionShape | undefined): AgentRoutingIntent {
  if (!primaryAction) return "none";
  if (primaryAction.action === "retry-with-browser-html") return "browser-html";
  if (primaryAction.requiresBrowserInteraction || normalizedActionExecution(primaryAction) === "interact-browser") return "browser-interaction";
  if (primaryAction.action === "read-content" || primaryAction.action === "use-evidence" || normalizedActionExecution(primaryAction) === "read-current") return "read-current";
  if (primaryAction.action === "refine-search" || primaryAction.action === "broaden-search" || primaryAction.action === "check-url-or-search") return "search";
  if (primaryAction.action === "open-result" || primaryAction.action === "open-alternate-result" || primaryAction.action === "open-source-link" || primaryAction.url) return "open-url";
  if (normalizedActionExecution(primaryAction) === "inspect-output") return "inspect-output";
  return "open-url";
}

function expectedAgentContinuationMode(primaryAction: CliActionShape | undefined): AgentContinuationMode {
  if (!primaryAction) return "stop";
  const routingIntent = expectedAgentRoutingIntent(primaryAction);
  if (routingIntent === "browser-html") return "capture-html";
  if (routingIntent === "browser-interaction") return "browser";
  const execution = normalizedActionExecution(primaryAction);
  if (execution === "read-current") return "read";
  if (execution === "inspect-output") return "inspect";
  if (execution === "run-command") return "command";
  return normalizedActionExecution(primaryAction) !== "inspect-output" ? "command" : "stop";
}

function scoreAgentReadTargets(readTargets: CliReadTargetShape[], primaryAction: CliActionShape | undefined, envelope: unknown): number {
  if (readTargets.length === 0) return primaryAction?.execution === "read-current" ? 0 : 1;
  const validPathScore = readTargets.every((target) => typeof target.path === "string" && target.path.length > 0 && pathExists(envelope, target.path)) ? 0.5 : 0;
  if (primaryAction?.execution !== "read-current" || !primaryAction.readFrom) return validPathScore + 0.5;
  const primaryMatches = readTargets.some((target) => target.path === primaryAction.readFrom && target.primary === true);
  return roundScore(validPathScore + (primaryMatches ? 0.5 : 0));
}

function scoreAgentBestReadTarget(agent: {
  readTargets?: CliReadTargetShape[];
  bestReadTarget?: string;
  bestReadTargetScore?: number;
  bestReadTargetReason?: string;
} | undefined): number {
  const readTargets = agent?.readTargets ?? [];
  if (readTargets.length === 0) return typeof agent?.bestReadTarget === "undefined" ? 1 : 0;
  const best = [...readTargets].sort((left, right) => {
    if (left.primary !== right.primary) return left.primary ? -1 : 1;
    return (right.score ?? 0) - (left.score ?? 0);
  })[0];
  if (!best) return typeof agent?.bestReadTarget === "undefined" ? 1 : 0;
  let required = 1;
  let matched = agent?.bestReadTarget === best.path ? 1 : 0;
  if (typeof best.score === "number") {
    required += 1;
    if (agent?.bestReadTargetScore === best.score) matched += 1;
  } else if (typeof agent?.bestReadTargetScore === "number") {
    required += 1;
  }
  if (best.reason) {
    required += 1;
    if (agent?.bestReadTargetReason === best.reason) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentDiagnosticCounts(agent: {
  diagnosticErrorCount?: number;
  diagnosticWarningCount?: number;
  diagnosticInfoCount?: number;
} | undefined, diagnostics: Array<{ severity?: "info" | "warning" | "error" }>): number {
  const counts = diagnostics.reduce((summary, diagnostic) => {
    if (diagnostic.severity === "error" || diagnostic.severity === "warning" || diagnostic.severity === "info") {
      summary[diagnostic.severity] += 1;
    }
    return summary;
  }, { error: 0, warning: 0, info: 0 });
  return agent?.diagnosticErrorCount === counts.error
    && agent?.diagnosticWarningCount === counts.warning
    && agent?.diagnosticInfoCount === counts.info ? 1 : 0;
}

function scoreAgentVerificationCounts(agent: {
  verificationRequestedCount?: number;
  verificationFoundCount?: number;
  verificationMissingCount?: number;
} | undefined, verification: {
  requestedCount?: number;
  foundCount?: number;
  missingCount?: number;
} | undefined): number {
  return agent?.verificationRequestedCount === (verification?.requestedCount ?? 0)
    && agent?.verificationFoundCount === (verification?.foundCount ?? 0)
    && agent?.verificationMissingCount === (verification?.missingCount ?? 0) ? 1 : 0;
}

function scoreAgentResponseMetadata(agent: {
  responseStatus?: number;
  responseOk?: boolean;
  responseContentType?: string;
  finalUrlChanged?: boolean;
} | undefined, envelope: {
  url?: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
}): number {
  let required = 0;
  let matched = 0;
  if (typeof envelope.status === "number") {
    required += 1;
    if (agent?.responseStatus === envelope.status) matched += 1;
    required += 1;
    if (agent?.responseOk === (envelope.status >= 200 && envelope.status < 400)) matched += 1;
  }
  if (typeof envelope.contentType === "string") {
    required += 1;
    if (agent?.responseContentType === envelope.contentType) matched += 1;
  }
  if (typeof envelope.url === "string" && typeof envelope.finalUrl === "string") {
    required += 1;
    if (agent?.finalUrlChanged === (envelope.finalUrl !== envelope.url)) matched += 1;
  }
  return required === 0 ? 1 : roundScore(matched / required);
}

function scoreAgentResultCount(kind: string, resultCount: number | undefined, searchResults: CliSearchResultShape[]): number {
  if (typeof resultCount !== "number") return 0;
  if (kind !== "search-results") return resultCount === 0 ? 1 : 0;
  if (searchResults.length === 0) return resultCount === 0 ? 1 : 0;
  return resultCount >= searchResults.length ? 1 : 0;
}

function scoreAgentSourceLinkCount(kind: string, sourceLinkCount: number | undefined, sourceLinks: Array<{ sourceScore?: number }>): number {
  if (typeof sourceLinkCount !== "number") return 0;
  if (kind === "search-results") return sourceLinkCount === 0 ? 1 : 0;
  return sourceLinkCount === sourceLinks.length ? 1 : 0;
}

function scoreAgentPageKind(pageKind: string | undefined, rootKind: string | undefined): number {
  if (!rootKind || rootKind === "unknown") return typeof pageKind === "undefined" ? 1 : 0;
  return pageKind === rootKind ? 1 : 0;
}

function scoreAgentAlternativeActionCount(alternativeActionCount: number | undefined, item: {
  suggestedActions?: CliActionShape[];
  pageCheck?: { recommendedAction?: CliActionShape; nextSteps?: CliActionShape[] };
  verification?: { recommendedAction?: CliActionShape };
}): number {
  if (typeof alternativeActionCount !== "number") return 0;
  const actions = [
    ...(item.suggestedActions ?? []),
    item.pageCheck?.recommendedAction,
    ...(item.pageCheck?.nextSteps ?? []),
    item.verification?.recommendedAction,
  ].filter((action): action is CliActionShape => Boolean(action));
  const keys = new Set(actions.map(compactActionKey));
  return alternativeActionCount === keys.size ? 1 : 0;
}

function scoreAgentUsabilityScore(usabilityScore: number | undefined, item: {
  agent?: { status?: CliAgentSummary["agentStatus"]; needsBrowserHtml?: boolean };
  pageCheck?: {
    confidence?: "low" | "medium" | "high";
    readability?: { score?: number };
    contentEvidence?: unknown[];
    sourceLinks?: unknown[];
  };
  searchResults?: unknown[];
  verification?: { status?: CliAgentSummary["verificationStatus"] };
  error?: unknown;
}): number {
  if (typeof usabilityScore !== "number") return 0;
  const expected = expectedAgentUsabilityScore(item);
  return Math.abs(usabilityScore - expected) <= 0.001 ? 1 : 0;
}

function scoreAgentEvidenceQualityScore(evidenceQualityScore: number | undefined, evidence: CliContentEvidenceShape[]): number {
  if (typeof evidenceQualityScore !== "number") return 0;
  const expected = average(evidence.map((item) => typeof item.score === "number" ? item.score : 0));
  return Math.abs(evidenceQualityScore - expected) <= 0.001 ? 1 : 0;
}

function scoreAgentSourceQualityScore(
  sourceQualityScore: number | undefined,
  kind: string | undefined,
  sourceLinks: Array<{ sourceScore?: number }>,
  searchResults: CliSearchResultShape[],
): number {
  if (typeof sourceQualityScore !== "number") return 0;
  const expected = kind === "search-results"
    ? average(searchResults.map((result) => typeof result.sourceScore === "number" ? result.sourceScore : 0))
    : averageSourceScore(sourceLinks);
  return Math.abs(sourceQualityScore - expected) <= 0.001 ? 1 : 0;
}

function expectedAgentUsabilityScore(item: {
  agent?: { status?: CliAgentSummary["agentStatus"]; needsBrowserHtml?: boolean };
  pageCheck?: {
    confidence?: "low" | "medium" | "high";
    readability?: { score?: number };
    contentEvidence?: unknown[];
    sourceLinks?: unknown[];
  };
  searchResults?: unknown[];
  verification?: { status?: CliAgentSummary["verificationStatus"] };
  error?: unknown;
}): number {
  if (item.error) return 0;
  if (item.agent?.needsBrowserHtml === true) return 0.1;
  const confidence = item.pageCheck?.confidence === "high" ? 1 : item.pageCheck?.confidence === "medium" ? 0.65 : 0.25;
  const evidence = Math.min(1, (item.pageCheck?.contentEvidence?.length ?? 0) / 3);
  const sources = Math.min(1, (item.pageCheck?.sourceLinks?.length ?? 0) / 2);
  const results = item.searchResults?.length ?? 0;
  const searchResults = Math.min(1, results / 5);
  const verificationStatus = item.verification?.status ?? "not-requested";
  const verificationScore = verificationStatus === "matched"
    ? 1
    : verificationStatus === "partial"
      ? 0.55
      : verificationStatus === "missing"
        ? 0.15
        : 0.5;
  const status = item.agent?.status ?? "unknown";
  const statusScore = status === "ready" || status === "choose-result"
    ? 1
    : status === "verify"
      ? 0.55
      : status === "needs-browser"
        ? 0.15
        : 0;
  const readabilityScore = item.pageCheck?.readability?.score ?? 0;
  const resultScore = results > 0
    ? searchResults * 0.35 + confidence * 0.15 + verificationScore * 0.2 + statusScore * 0.3
    : readabilityScore * 0.35 + confidence * 0.2 + evidence * 0.2 + sources * 0.1 + verificationScore * 0.1 + statusScore * 0.05;
  return roundScore(Math.max(0, Math.min(1, resultScore)));
}

function compactActionKey(action: CliActionShape): string {
  return [
    action.action ?? "",
    action.url ?? "",
    action.command ?? "",
    action.rank ?? "",
    action.openResult ?? "",
    action.readFrom ?? "",
    action.requiresBrowserInteraction === true ? "browser" : "",
    normalizedActionExecution(action),
  ].join(":");
}

function scoreAgentBrowserNeed(
  needsBrowserHtml: boolean | undefined,
  status: CliAgentSummary["agentStatus"] | undefined,
  primaryAction: CliActionShape | undefined,
): number {
  if (typeof needsBrowserHtml !== "boolean") return 0;
  if (primaryAction?.action === "retry-with-browser-html") return needsBrowserHtml ? 1 : 0;
  if (status === "needs-browser") return needsBrowserHtml ? 1 : 0;
  if (primaryAction?.action && ["check-url-or-search", "retry-later", "open-alternate-result"].includes(primaryAction.action)) {
    return needsBrowserHtml ? 0 : 1;
  }
  if (primaryAction?.execution === "read-current" || primaryAction?.execution === "interact-browser") return needsBrowserHtml ? 0 : 1;
  return needsBrowserHtml ? 0.5 : 1;
}

function scoreAgentCanContinue(canContinue: boolean | undefined, primaryAction: CliActionShape | undefined): number {
  if (typeof canContinue !== "boolean") return 0;
  const expected = primaryAction ? normalizedActionExecution(primaryAction) !== "inspect-output" : false;
  return canContinue === expected ? 1 : 0;
}

function scoreAgentPrimaryExecution(primaryExecution: ActionExecution | undefined, primaryAction: CliActionShape | undefined): number {
  if (!primaryAction) return typeof primaryExecution === "undefined" ? 1 : 0;
  return primaryExecution === normalizedActionExecution(primaryAction) ? 1 : 0;
}

function scoreAgentPrimaryShortcuts(agent: {
  primaryReadFrom?: string;
  primaryCommand?: string;
  primaryCommandArgs?: string[];
  primaryUrl?: string;
  primaryRank?: number;
  primaryOpenResult?: number | "best";
  requiresBrowserInteraction?: boolean;
  primaryAction?: CliActionShape;
} | undefined): number {
  const action = agent?.primaryAction;
  if (!action) {
    return agent?.primaryReadFrom
      || agent?.primaryCommand
      || agent?.primaryCommandArgs
      || agent?.primaryUrl
      || agent?.primaryRank
      || agent?.primaryOpenResult
      || agent?.requiresBrowserInteraction ? 0 : 1;
  }
  let required = 0;
  let matched = 0;
  if (action.readFrom) {
    required += 1;
    if (agent?.primaryReadFrom === action.readFrom) matched += 1;
  } else if (agent?.primaryReadFrom) {
    required += 1;
  }
  if (action.command) {
    required += 1;
    if (agent?.primaryCommand === action.command) matched += 1;
  } else if (agent?.primaryCommand) {
    required += 1;
  }
  if (action.commandArgs) {
    required += 1;
    if (JSON.stringify(agent?.primaryCommandArgs) === JSON.stringify(action.commandArgs)) matched += 1;
  } else if (agent?.primaryCommandArgs) {
    required += 1;
  }
  if (action.url) {
    required += 1;
    if (agent?.primaryUrl === action.url) matched += 1;
  } else if (agent?.primaryUrl) {
    required += 1;
  }
  if (action.rank) {
    required += 1;
    if (agent?.primaryRank === action.rank) matched += 1;
  } else if (agent?.primaryRank) {
    required += 1;
  }
  if (action.openResult) {
    required += 1;
    if (agent?.primaryOpenResult === action.openResult) matched += 1;
  } else if (agent?.primaryOpenResult) {
    required += 1;
  }
  if (action.requiresBrowserInteraction) {
    required += 1;
    if (agent?.requiresBrowserInteraction === true) matched += 1;
  } else if (agent?.requiresBrowserInteraction) {
    required += 1;
  }
  return required === 0 ? 1 : matched / required;
}

function scoreAgentSourceSearchProvenance(
  sourceSearch: { selectedResult?: unknown; alternateResults?: unknown[] } | undefined,
  readTargets: CliReadTargetShape[],
): number {
  if (!sourceSearch?.selectedResult && !sourceSearch?.alternateResults?.length) return 1;
  const paths = new Set(readTargets.map((target) => target.path));
  let required = 0;
  let matched = 0;
  if (sourceSearch.selectedResult) {
    required += 1;
    if (paths.has("sourceSearch.selectedResult")) matched += 1;
  }
  if (sourceSearch.alternateResults?.length) {
    required += 1;
    if (paths.has("sourceSearch.alternateResults")) matched += 1;
  }
  return required === 0 ? 1 : roundScore(matched / required);
}

function scoreAgentRecommendedMetadata(
  agent: {
    recommendedRank?: number;
    recommendedSource?: string;
    recommendedRelevance?: "low" | "medium" | "high";
    recommendedLikelyOfficial?: boolean;
    recommendedSelectionReason?: string;
  } | undefined,
  recommendedResult: CliSearchResultShape | undefined,
): number {
  if (!recommendedResult) return 1;
  let required = 0;
  let matched = 0;
  if (typeof recommendedResult.rank === "number") {
    required += 1;
    if (agent?.recommendedRank === recommendedResult.rank) matched += 1;
  }
  if (recommendedResult.source) {
    required += 1;
    if (agent?.recommendedSource === recommendedResult.source) matched += 1;
  }
  if (recommendedResult.relevance) {
    required += 1;
    if (agent?.recommendedRelevance === recommendedResult.relevance) matched += 1;
  }
  if (typeof recommendedResult.isLikelyOfficial === "boolean") {
    required += 1;
    if (agent?.recommendedLikelyOfficial === recommendedResult.isLikelyOfficial) matched += 1;
  }
  if (recommendedResult.selectionReason) {
    required += 1;
    if (agent?.recommendedSelectionReason === recommendedResult.selectionReason) matched += 1;
  }
  return required === 0 ? 1 : roundScore(matched / required);
}

function pathExists(value: unknown, path: string): boolean {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!part) return false;
    const match = /^([^\[]+)(?:\[(\d+)\])?$/.exec(part);
    if (!match) return false;
    const key = match[1];
    if (!key) return false;
    const index = match[2] === undefined ? undefined : Number(match[2]);
    if (current === null || typeof current !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(current, key)) return false;
    current = (current as Record<string, unknown>)[key];
    if (index !== undefined) {
      if (!Array.isArray(current) || index < 0 || index >= current.length) return false;
      current = current[index];
    }
  }
  if (Array.isArray(current)) return current.length > 0;
  return typeof current !== "undefined" && current !== null;
}

function scoreCliAgentSummary(summary: CliAgentSummary): number {
  const confidenceScore = summary.pageCheck.confidence === "high" ? 1 : summary.pageCheck.confidence === "medium" ? 0.65 : 0.2;
  const readabilityScore = Math.max(
    summary.pageCheck.readabilityScore,
    summary.pageCheck.readabilityLevel === "high" ? 1 : summary.pageCheck.readabilityLevel === "medium" ? 0.65 : 0.2,
  );
  const readabilityExplainabilityScore = readabilityScore * 0.86
    + summary.pageCheck.readabilityReasonScore * 0.07
    + summary.agentReadabilityReasonScore * 0.07;
  const effectivePreviewCount = Math.max(summary.pageCheck.contentPreviewCount, summary.pageCheck.contentEvidenceCount);
  const expectedEvidenceCount = summary.pageCheck.contentLength <= 160 ? 1 : summary.pageCheck.contentLength <= 500 ? 2 : 3;
  const evidenceScore = Math.min(1, effectivePreviewCount / expectedEvidenceCount);
  const lengthScore = summary.pageCheck.contentLength <= 160
    ? (summary.pageCheck.contentLength > 0 ? 1 : 0)
    : Math.min(1, summary.pageCheck.contentLength / 600);
  const contentScore = evidenceScore * 0.65
    + lengthScore * 0.18
    + Math.min(1, summary.pageCheck.contentEvidenceCount / expectedEvidenceCount) * 0.12
    + summary.pageCheck.contentEvidenceMetadataScore * 0.05;
  const linkScore = Math.min(1, summary.pageCheck.primaryLinkCount / 4) * 0.65
    + Math.min(1, summary.pageCheck.sourceLinkCount / 2) * 0.25
    + summary.pageCheck.averageSourceScore * 0.1;
  const actionScore = Math.min(1, Math.max(summary.suggestedActionCount, summary.pageCheck.actionCount, summary.pageCheck.nextStepCount, summary.agentPrimaryAction ? 2 : 0) / 2);
  const recommendedActionScore = summary.pageCheck.recommendedAction || summary.agentPrimaryAction ? 1 : 0;
  const searchScore = summary.kind === "search-results" ? Math.min(1, summary.searchResultCount / 5) : 1;
  const verificationScore = summary.verificationStatus === "not-requested"
    ? 1
    : summary.verificationStatus === "matched"
      ? 1
      : summary.verificationStatus === "partial"
        ? 0.55
        : Math.min(0.25, summary.verificationEvidenceCount * 0.08);
  const agentStatusScore = summary.agentStatus === "ready" || summary.agentStatus === "choose-result"
    ? 1
    : summary.agentStatus === "verify"
      ? 0.55
      : summary.agentStatus === "needs-browser"
        ? 0.25
        : 0;
  const agentActionScore = summary.agentPrimaryAction ? 1 : 0;
  return roundScore(
    confidenceScore * 0.14
    + readabilityExplainabilityScore * 0.1
    + contentScore * 0.2
    + linkScore * 0.16
    + actionScore * 0.05
    + recommendedActionScore * 0.05
    + searchScore * 0.07
    + verificationScore * 0.04
    + agentStatusScore * 0.035
    + agentActionScore * 0.02
    + summary.actionSchemaScore * 0.03
    + summary.searchResultActionScore * 0.005
    + summary.agentReadTargetScore * 0.005
    + summary.agentResultCountScore * 0.005
    + summary.agentSourceLinkCountScore * 0.005
    + summary.agentBrowserNeedScore * 0.005
    + summary.agentPageKindScore * 0.005
    + summary.agentAlternativeActionCountScore * 0.005
    + summary.agentUsabilityScoreConsistency * 0.005
    + summary.agentEvidenceQualityScoreConsistency * 0.005
    + summary.agentSourceQualityScoreConsistency * 0.005
    + summary.agentBestReadTargetScore * 0.005
    + summary.agentDiagnosticCountScore * 0.005
    + summary.agentVerificationCountScore * 0.005
    + summary.agentResponseMetadataScore * 0.005
    + summary.agentRoutingIntentScore * 0.005
    + summary.agentContinuationModeScore * 0.005
    + summary.agentNextScore * 0.005
    + summary.agentExpectedOutcomeScore * 0.005
    + summary.agentSignalScore * 0.005
    + summary.pageLinkCommandScore * 0.005
    + summary.agentPrimaryShortcutScore * 0.005
    + summary.agentCitationScore * 0.005
    + summary.agentAnswerPlanScore * 0.005
  );
}

function scoreAgentExecutorSummary(summary: CliAgentSummary): number {
  return roundScore(average([
    summary.agentContractScore,
    summary.actionSchemaScore,
    summary.agentRoutingIntentScore,
    summary.agentContinuationModeScore,
    summary.agentNextScore,
    summary.agentExpectedOutcomeScore,
    summary.agentSignalScore,
    summary.agentReadTargetScore,
    summary.agentBrowserNeedScore,
    summary.agentCanContinueScore,
    summary.agentPrimaryExecutionScore,
    summary.agentPrimaryShortcutScore,
    summary.agentCitationScore,
    summary.agentAnswerPlanScore,
    summary.searchResultActionScore,
    summary.pageLinkCommandScore,
    summary.agentResponseMetadataScore,
    summary.agentDiagnosticCountScore,
    summary.agentVerificationCountScore,
  ]));
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
    averageAgentExecutorScore: average(included.map((comparison) => comparison.cliAgentSummary.agentExecutorScore)),
    averageAgentContractScore: average(included.map((comparison) => comparison.cliAgentSummary.agentContractScore)),
    averageActionSchemaScore: average(included.map((comparison) => comparison.cliAgentSummary.actionSchemaScore)),
    averageSearchResultActionScore: average(included.map((comparison) => comparison.cliAgentSummary.searchResultActionScore)),
    averageContentEvidenceMetadataScore: average(included.map((comparison) => comparison.cliAgentSummary.pageCheck.contentEvidenceMetadataScore)),
    averageReadabilityReasonScore: average(included.map((comparison) => comparison.cliAgentSummary.pageCheck.readabilityReasonScore)),
    averageAgentRoutingIntentScore: average(included.map((comparison) => comparison.cliAgentSummary.agentRoutingIntentScore)),
    averageAgentContinuationModeScore: average(included.map((comparison) => comparison.cliAgentSummary.agentContinuationModeScore)),
    averageAgentNextScore: average(included.map((comparison) => comparison.cliAgentSummary.agentNextScore)),
    averageAgentExpectedOutcomeScore: average(included.map((comparison) => comparison.cliAgentSummary.agentExpectedOutcomeScore)),
    averageAgentSignalScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSignalScore)),
    averagePageLinkCommandScore: average(included.map((comparison) => comparison.cliAgentSummary.pageLinkCommandScore)),
    averageAgentReadTargetScore: average(included.map((comparison) => comparison.cliAgentSummary.agentReadTargetScore)),
    averageAgentResultCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentResultCountScore)),
    averageAgentSourceLinkCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceLinkCountScore)),
    averageAgentBrowserNeedScore: average(included.map((comparison) => comparison.cliAgentSummary.agentBrowserNeedScore)),
    averageAgentPageKindScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPageKindScore)),
    averageAgentAlternativeActionCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentAlternativeActionCountScore)),
    averageAgentUsabilityScoreConsistency: average(included.map((comparison) => comparison.cliAgentSummary.agentUsabilityScoreConsistency)),
    averageAgentEvidenceQualityScoreConsistency: average(included.map((comparison) => comparison.cliAgentSummary.agentEvidenceQualityScoreConsistency)),
    averageAgentSourceQualityScoreConsistency: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceQualityScoreConsistency)),
    averageAgentBestReadTargetScore: average(included.map((comparison) => comparison.cliAgentSummary.agentBestReadTargetScore)),
    averageAgentDiagnosticCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentDiagnosticCountScore)),
    averageAgentVerificationCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentVerificationCountScore)),
    averageAgentResponseMetadataScore: average(included.map((comparison) => comparison.cliAgentSummary.agentResponseMetadataScore)),
    averageAgentReadabilityReasonScore: average(included.map((comparison) => comparison.cliAgentSummary.agentReadabilityReasonScore)),
    averageAgentSourceSearchProvenanceScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceSearchProvenanceScore)),
    averageAgentRecommendedMetadataScore: average(included.map((comparison) => comparison.cliAgentSummary.agentRecommendedMetadataScore)),
    averageAgentCanContinueScore: average(included.map((comparison) => comparison.cliAgentSummary.agentCanContinueScore)),
    averageAgentPrimaryExecutionScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPrimaryExecutionScore)),
    averageAgentPrimaryShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPrimaryShortcutScore)),
    averageAgentCitationScore: average(included.map((comparison) => comparison.cliAgentSummary.agentCitationScore)),
    averageAgentAnswerPlanScore: average(included.map((comparison) => comparison.cliAgentSummary.agentAnswerPlanScore)),
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

function averageSourceScore(links: Array<{ sourceScore?: number }>): number {
  return average(links.map((link) => typeof link.sourceScore === "number" ? link.sourceScore : 0));
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
