import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { extract } from "../src/static";
import { flattenSemanticTree, summarizeSemanticTree, type SemanticNode } from "../src/index";
import { runCli } from "../src/cli";
import { resolveBenchmarkTargets, type BenchmarkTarget } from "./benchmark-targets";

type NormalizedSummary = {
  roleCounts: Record<string, number>;
  namedRoles: string[];
};

export type StaticComparison = {
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
    source: "fetch" | "agent-browser-rendered" | "fixture";
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
    structuralContentRecall: number;
    textRecall: number;
    score: number;
  };
  agentBrowserAdvantageScore: number;
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
  agentNextShortcutScore: number;
  agentRunbookScore: number;
  agentRunbookShortcutScore: number;
  agentExecutorStepScore: number;
  agentBriefExecutorStepScore: number;
  agentHandoffScore: number;
  agentExecutionPlanScore: number;
  agentExpectedOutcomeScore: number;
  agentSignalScore: number;
  agentQualityGateScore: number;
  pageLinkCommandScore: number;
  agentPageKindScore: number;
  agentPageMetadataShortcutScore: number;
  agentAlternativeActionCountScore: number;
  agentUsabilityScoreConsistency: number;
  agentEvidenceQualityScoreConsistency: number;
  agentSourceQualityScoreConsistency: number;
  agentBestReadTargetScore: number;
  agentDiagnosticCountScore: number;
  agentVerificationCountScore: number;
  agentVerificationQueryScore: number;
  agentEvidenceCountShortcutScore: number;
  agentSignalCountShortcutScore: number;
  agentTopQualityShortcutScore: number;
  agentProblemShortcutScore: number;
  agentResponseMetadataScore: number;
  agentHiddenSignalScore: number;
  agentPrimaryAction?: string;
  agentPrimaryExecution?: ActionExecution;
  agentReadTargetScore: number;
  agentTopReadTargetShortcutScore: number;
  agentResultCountScore: number;
  agentChoiceCountScore: number;
  agentTopChoiceShortcutScore: number;
  agentResultChoiceScore: number;
  agentTopResultChoiceShortcutScore: number;
  agentSourceLinkCountScore: number;
  agentFormActionCountScore: number;
  agentFormActionChoiceScore: number;
  agentTopFormActionChoiceShortcutScore: number;
  agentHiddenSignalCountScore: number;
  agentTopHiddenSignalShortcutScore: number;
  agentSourceChoiceScore: number;
  agentTopSourceChoiceShortcutScore: number;
  agentSourceSearchShortcutScore: number;
  agentBrowserNeedScore: number;
  agentBrowserHtmlScore: number;
  agentReadabilityReasonScore: number;
  agentSourceSearchProvenanceScore: number;
  agentRecommendedMetadataScore: number;
  agentCanContinueScore: number;
  agentPrimaryExecutionScore: number;
  agentPrimaryShortcutScore: number;
  agentAlternativeActionShortcutScore: number;
  agentExecutorShortcutScore: number;
  agentHandoffShortcutScore: number;
  agentAnswerShortcutScore: number;
  agentPlanShortcutScore: number;
  agentCitationScore: number;
  agentTopCitationShortcutScore: number;
  agentAnswerPlanScore: number;
  agentAnswerEvidenceScore: number;
  agentActionListScore: number;
  agentTopActionShortcutScore: number;
  agentSearchDecisionScore: number;
  agentPageDecisionScore: number;
  agentSemanticSummaryScore: number;
  agentBarrierShortcutScore: number;
  agentStructuredShortcutScore: number;
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
    hiddenSignalCount: number;
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

const hiddenPageCheckPaths = [
  "hydration",
  "apiEndpoints",
  "clientState",
  "runtime",
  "config",
  "appHints",
  "mobileHints",
  "topics",
  "keyValues",
  "metaFacts",
  "provenance",
  "httpPolicies",
  "schemaFacts",
  "offers",
  "identities",
  "datasets",
  "timeline",
  "contactPoints",
  "authorLinks",
] as const;

type CliActionShape = {
  action?: string;
  path?: string;
  reason?: string;
  url?: string;
  urlRef?: string;
  rank?: number;
  openResult?: number | "best";
  execution?: ActionExecution;
  priority?: "low" | "medium" | "high";
  priorityReason?: string;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  readFrom?: string;
  sourceLinkRef?: string;
  requiresBrowserInteraction?: boolean;
  terminal?: boolean;
  source?: string;
  primary?: boolean;
  index?: number;
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
    valuePath?: string;
  };
  browserHtml?: CliAgentBrowserHtmlShape;
};

type CliAgentRunbookShape = {
  decision?: CliAgentLoopShape["decision"];
  mode?: AgentContinuationMode;
  operation?: CliAgentExecutionPlanShape["operation"];
  action?: string;
  reason?: string;
  confidence?: CliAgentExecutionPlanShape["confidence"];
  answerStatus?: CliAgentAnswerPlanShape["status"];
  answerReady?: boolean;
  shouldContinue?: boolean;
  terminal?: boolean;
  maxSuggestedIterations?: number;
  useFetchedHtml?: boolean;
  needsBrowserHtml?: boolean;
  expectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
  command?: string;
  commandArgs?: unknown[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: unknown[];
  readFrom?: string;
  readValue?: {
    path?: string;
    value?: unknown;
    valuePath?: string;
  };
  url?: string;
  urlRef?: string;
  target?: CliAgentTargetShape;
  browserHtml?: CliAgentBrowserHtmlShape;
};

type CliAgentExecutorShape = {
  instruction?: string;
  decision?: CliAgentLoopShape["decision"];
  mode?: AgentContinuationMode;
  operation?: CliAgentExecutionPlanShape["operation"];
  action?: string;
  status?: CliAgentAnswerPlanShape["status"];
  confidence?: CliAgentExecutionPlanShape["confidence"];
  answerReady?: boolean;
  shouldContinue?: boolean;
  terminal?: boolean;
  maxSuggestedIterations?: number;
  expectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
  useCitationIds?: unknown[];
  verificationFoundQueries?: unknown[];
  verificationMissingQueries?: unknown[];
  commandArgs?: unknown[];
  afterInteractionCommandArgs?: unknown[];
  readFrom?: string;
  readTarget?: CliReadTargetShape;
  readValue?: {
    path?: string;
    value?: unknown;
    valuePath?: string;
  };
  url?: string;
  urlRef?: string;
  target?: CliAgentTargetShape;
  browserHtml?: CliAgentBrowserHtmlShape;
};

type CliAgentHandoffShape = {
  instruction?: string;
  decision?: CliAgentLoopShape["decision"];
  mode?: AgentContinuationMode;
  operation?: CliAgentExecutionPlanShape["operation"];
  action?: string;
  confidence?: CliAgentExecutionPlanShape["confidence"];
  priority?: "low" | "medium" | "high";
  priorityReason?: string;
  answerStatus?: CliAgentAnswerPlanShape["status"];
  answerReady?: boolean;
  shouldContinue?: boolean;
  terminal?: boolean;
  maxSuggestedIterations?: number;
  expectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
  reason?: string;
  useCitationIds?: unknown[];
  verificationFoundQueries?: unknown[];
  verificationMissingQueries?: unknown[];
  answerEvidence?: CliAgentCitationShape[];
  resultChoices?: CliAgentResultChoiceShape[];
  sourceChoices?: CliAgentSourceChoiceShape[];
  sourceSearch?: unknown;
  signals?: unknown[];
  qualityGates?: unknown[];
  readTarget?: CliReadTargetShape;
  readFrom?: string;
  readValue?: {
    path?: string;
    value?: unknown;
  };
  command?: string;
  commandArgs?: unknown[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: unknown[];
  url?: string;
  urlRef?: string;
  target?: CliAgentTargetShape;
  browserHtml?: CliAgentBrowserHtmlShape;
};

type CliAgentBrowserHtmlShape = {
  url?: string;
  htmlFile?: string;
  captureScript?: string;
  command?: string;
  commandArgs?: unknown[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: unknown[];
};

type CliAgentResultChoiceShape = CliAgentTargetShape & {
  id?: string;
  path?: string;
  recommended?: boolean;
  primary?: boolean;
  recommendedPath?: string;
  openResult?: number | "best";
  command?: string;
  commandArgs?: unknown[];
};

type CliAgentSourceChoiceShape = CliAgentTargetShape & {
  id?: string;
  path?: string;
  kind?: "internal" | "external";
  primary?: boolean;
  command?: string;
  commandArgs?: string[];
};

type CliAgentSourceSearchResultShape = CliAgentTargetShape & {
  id?: string;
  path?: string;
  openResult?: number | "best";
  command?: string;
  commandArgs?: unknown[];
};

type CliAgentFormChoiceShape = {
  id?: string;
  path?: string;
  rank?: number;
  method?: string;
  fieldCount?: number;
  text?: string;
  actionUrl?: string;
  submitText?: string;
  queryField?: string;
  urlTemplate?: string;
  selector?: string;
  fields?: unknown[];
};

type CliAgentActionTargetChoiceShape = {
  id?: string;
  path?: string;
  rank?: number;
  kind?: string;
  name?: string;
  text?: string;
  source?: string;
  targetUrl?: string;
  urlTemplate?: string;
  queryInput?: string;
  method?: string;
  encodingType?: string;
  disabled?: boolean;
  pressed?: boolean | "mixed";
  expanded?: boolean;
  haspopup?: boolean | string;
  controls?: string;
  selector?: string;
};

type CliAgentQualityGateShape = {
  kind?: "fetch" | "content" | "source" | "search" | "verification" | "browser" | "diagnostic" | "status";
  pass?: boolean;
  severity?: "info" | "warning" | "error";
  message?: string;
  score?: number;
  path?: string;
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
  host?: string;
  path?: string;
  text?: string;
  source?: string;
  rank?: number;
  snippet?: string;
  selector?: string;
  sourceType?: string;
  sourceScore?: number;
  sourceHints?: string[];
  dateText?: string;
  date?: string;
  datePrecision?: "day" | "month" | "year";
  dateSource?: "title" | "snippet";
  sitelinks?: Array<{ title?: string; url?: string }>;
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

type CliBarrierShape = {
  kind?: "challenge" | "login" | "paywall" | "cookie-consent" | "age-gate" | "geo-block";
  severity?: "info" | "warning" | "error";
  source?: string;
  path?: string;
  text?: string;
  selector?: string;
  diagnosticCode?: string;
  rank?: number;
};

type CliAgentExpectedOutcomeShape = {
  kind?: "read-evidence" | "open-result" | "retry-fetch" | "run-search" | "capture-html" | "browser-inspection" | "inspect-output" | "stop";
  message?: string;
};

type CliAgentExecutionPlanShape = {
  operation?: "return" | "execute-command" | "capture-browser-html" | "inspect-browser" | "inspect-output" | "stop";
  confidence?: "low" | "medium" | "high";
  reason?: string;
  useFetchedHtml?: boolean;
  needsBrowserHtml?: boolean;
  answerReady?: boolean;
  terminal?: boolean;
  shouldContinue?: boolean;
  maxSuggestedIterations?: number;
  expectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
  readFrom?: string;
  command?: string;
  commandArgs?: unknown[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: unknown[];
  url?: string;
  urlRef?: string;
  browserHtml?: CliAgentBrowserHtmlShape;
};

type CliSearchResultShape = {
  id?: string;
  path?: string;
  title?: string;
  rank?: number;
  url?: string;
  source?: string;
  snippet?: string;
  dateText?: string;
  date?: string;
  datePrecision?: "day" | "month" | "year";
  dateSource?: "title" | "snippet";
  sitelinks?: Array<{ title?: string; url?: string }>;
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
  confidence?: string;
  reason?: string;
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
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: unknown[];
  url?: string;
  urlRef?: string;
  readFrom?: string;
};

type CliAgentSearchDecisionShape = {
  decision?: "open-result" | "refine-search" | "none";
  confidence?: "low" | "medium" | "high";
  reason?: string;
  resultCount?: number;
  highRelevanceCount?: number;
  mediumRelevanceCount?: number;
  lowRelevanceCount?: number;
  officialCount?: number;
  findMatchCount?: number;
  recommendedRank?: number;
  recommendedPath?: string;
  recommendedTitle?: string;
  recommendedUrl?: string;
  recommendedSource?: string;
  recommendedSourceScore?: number;
  recommendedRelevance?: CliSearchResultShape["relevance"];
  recommendedLikelyOfficial?: boolean;
  command?: string;
  commandArgs?: unknown[];
};

type CliAgentPageDecisionShape = {
  decision?: "read-content" | "open-source-link" | "open-site-search" | "retry-with-browser-html" | "inspect-actions" | "none";
  confidence?: "low" | "medium" | "high";
  reason?: string;
  readability?: "low" | "medium" | "high";
  readabilityScore?: number;
  evidenceCount?: number;
  evidenceQualityScore?: number;
  sourceLinkCount?: number;
  sourceQualityScore?: number;
  readFrom?: string;
  url?: string;
  urlRef?: string;
  command?: string;
  commandArgs?: unknown[];
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

export type GateSummary = {
  included: number;
  excluded: number;
  averageScore: number;
  averageCliAgentScore: number;
  minCliAgentScore: number;
  averageAgentExecutorScore: number;
  minAgentExecutorScore: number;
  averageAgentContractScore: number;
  averageActionSchemaScore: number;
  averageSearchResultActionScore: number;
  averageContentEvidenceMetadataScore: number;
  averageReadabilityReasonScore: number;
  averageAgentRoutingIntentScore: number;
  averageAgentContinuationModeScore: number;
  averageAgentNextScore: number;
  averageAgentNextShortcutScore: number;
  averageAgentRunbookScore: number;
  averageAgentRunbookShortcutScore: number;
  averageAgentExecutorStepScore: number;
  averageAgentBriefExecutorStepScore: number;
  averageAgentHandoffScore: number;
  averageAgentExecutionPlanScore: number;
  averageAgentExpectedOutcomeScore: number;
  averageAgentSignalScore: number;
  averageAgentQualityGateScore: number;
  averagePageLinkCommandScore: number;
  averageAgentReadTargetScore: number;
  averageAgentTopReadTargetShortcutScore: number;
  averageAgentResultCountScore: number;
  averageAgentChoiceCountScore: number;
  averageAgentTopChoiceShortcutScore: number;
  averageAgentResultChoiceScore: number;
  averageAgentTopResultChoiceShortcutScore: number;
  averageAgentSourceLinkCountScore: number;
  averageAgentFormActionCountScore: number;
  averageAgentFormActionChoiceScore: number;
  averageAgentTopFormActionChoiceShortcutScore: number;
  averageAgentHiddenSignalCountScore: number;
  averageAgentTopHiddenSignalShortcutScore: number;
  averageAgentSourceChoiceScore: number;
  averageAgentTopSourceChoiceShortcutScore: number;
  averageAgentSourceSearchShortcutScore: number;
  averageAgentBrowserNeedScore: number;
  averageAgentBrowserHtmlScore: number;
  averageAgentPageKindScore: number;
  averageAgentPageMetadataShortcutScore: number;
  averageAgentAlternativeActionCountScore: number;
  averageAgentUsabilityScoreConsistency: number;
  averageAgentEvidenceQualityScoreConsistency: number;
  averageAgentSourceQualityScoreConsistency: number;
  averageAgentBestReadTargetScore: number;
  averageAgentDiagnosticCountScore: number;
  averageAgentVerificationCountScore: number;
  averageAgentVerificationQueryScore: number;
  averageAgentEvidenceCountShortcutScore: number;
  averageAgentSignalCountShortcutScore: number;
  averageAgentTopQualityShortcutScore: number;
  averageAgentProblemShortcutScore: number;
  averageAgentResponseMetadataScore: number;
  averageAgentHiddenSignalScore: number;
  averageAgentBrowserAdvantageScore: number;
  averageAgentReadabilityReasonScore: number;
  averageAgentSourceSearchProvenanceScore: number;
  averageAgentRecommendedMetadataScore: number;
  averageAgentCanContinueScore: number;
  averageAgentPrimaryExecutionScore: number;
  averageAgentPrimaryShortcutScore: number;
  averageAgentAlternativeActionShortcutScore: number;
  averageAgentExecutorShortcutScore: number;
  averageAgentHandoffShortcutScore: number;
  averageAgentAnswerShortcutScore: number;
  averageAgentPlanShortcutScore: number;
  averageAgentCitationScore: number;
  averageAgentTopCitationShortcutScore: number;
  averageAgentAnswerPlanScore: number;
  averageAgentAnswerEvidenceScore: number;
  averageAgentActionListScore: number;
  averageAgentTopActionShortcutScore: number;
  averageAgentSearchDecisionScore: number;
  averageAgentPageDecisionScore: number;
  averageAgentSemanticSummaryScore: number;
  averageAgentBarrierShortcutScore: number;
  averageAgentStructuredShortcutScore: number;
  averagePrecision: number;
  averageReferenceRecall: number;
  weakAgentTargets: GateWeakAgentTarget[];
  classifications: Record<StaticClassification, number>;
};

type GateWeakAgentTarget = {
  category: string;
  url: string;
  cliAgentScore: number;
  agentExecutorScore: number;
  agentStatus: CliAgentSummary["agentStatus"];
  primaryAction?: string;
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
const structuralContentRoles = new Set([...contentRoles].filter((role) => role !== "text"));
const textRoles = new Set(["text"]);

if (isMainModule()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const targets = resolveBenchmarkTargets(process.argv.slice(2), ["https://example.com", "https://www.wikipedia.org"]);
  const report = await runStaticComparisons(targets, { printSamples: true });
  console.log(JSON.stringify(report, null, 2));
}

export async function runStaticComparisons(targets: BenchmarkTarget[], options: { printSamples?: boolean } = {}): Promise<{ generatedAt: string; gateSummary: GateSummary; comparisons: StaticComparison[] }> {
  const comparisons: StaticComparison[] = [];

  for (const [index, target] of targets.entries()) {
    const warnings: string[] = [];
    const { html, source, status, agentBrowser: renderedAgentBrowser } = await fetchOrRenderHtml(target, `ax-grep-static-html-${Date.now()}-${index}`, warnings);

    const tree = extract(html, {
      mode: "compact",
      excludeLikelyAds: true,
      excludeLikelyBoilerplate: target.excludeLikelyBoilerplate === true,
      includeAttributes: false,
      includeSelectOptions: false,
      includeTextNodes: true,
      ...(target.maxChildrenPerNode === undefined ? {} : { maxChildrenPerNode: target.maxChildrenPerNode }),
      ...(target.maxLinkFarmChildren === undefined ? {} : { maxLinkFarmChildren: target.maxLinkFarmChildren }),
    });
    const staticSummary = summarizeSemanticTree(tree);
    const staticNormalized = normalizeNamedRoles(staticSummary.namedRoles);
    const agentBrowser = renderedAgentBrowser ?? (source === "fixture" ? syntheticAgentBrowserReference(staticSummary) : runAgentBrowserSnapshot(target.url, `ax-grep-static-${Date.now()}-${index}`, warnings));
    const agentNamedRoles = new Set(agentBrowser?.normalized.namedRoles ?? []);
    const matches = staticNormalized.namedRoles.filter((item) => agentNamedRoles.has(item)).length;
    const namedRoleTotal = Math.max(staticNormalized.namedRoles.length, agentBrowser?.normalized.namedRoles.length ?? 0);

    const agentReadiness = scoreAgentReadiness(staticNormalized, agentBrowser?.normalized ?? emptyNormalizedSummary());
    const cliAgentSummary = await summarizeCliAgentOutput(target.url, html, source, status, warnings, target.findQueries ?? []);
    const agentBrowserAdvantageScore = scoreAgentBrowserAdvantage(cliAgentSummary);
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
      agentBrowserAdvantageScore,
      cliAgentSummary,
      warnings,
    };
    comparison.classification = classifyComparison(comparison);
    comparisons.push(comparison);

    if (options.printSamples) printTreeSample(target.url, tree);
  }

  return { generatedAt: new Date().toISOString(), gateSummary: summarizeGate(comparisons), comparisons };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return typeof entry === "string" && import.meta.url === pathToFileURL(entry).href;
}

async function fetchOrRenderHtml(
  target: BenchmarkTarget,
  session: string,
  warnings: string[],
): Promise<{ html: string; source: StaticComparison["fetch"]["source"]; status: number; agentBrowser?: StaticComparison["agentBrowser"] }> {
  if (typeof target.html === "string") {
    warnings.push("used fixture HTML");
    return { html: target.html, source: "fixture", status: target.status ?? 200 };
  }
  const url = target.url;
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
  return withAgentBrowserLock(warnings, () => runAgentBrowserSnapshotLocked(url, session, warnings));
}

function runAgentBrowserSnapshotLocked(
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
  return withAgentBrowserLock(warnings, () => runAgentBrowserHtmlLocked(url, session, warnings));
}

function runAgentBrowserHtmlLocked(url: string, session: string, warnings: string[]): { html: string; agentBrowser: StaticComparison["agentBrowser"] } | null {
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

function withAgentBrowserLock<T>(warnings: string[], run: () => T): T | null {
  const lockDir = join(tmpdir(), "ax-grep-agent-browser.lock");
  try {
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "pid"), `${process.pid}\n`, "utf8");
  } catch {
    try {
      const ageMs = Date.now() - statSync(lockDir).mtimeMs;
      if (ageMs > 10 * 60_000) {
        rmSync(lockDir, { recursive: true, force: true });
        mkdirSync(lockDir);
        writeFileSync(join(lockDir, "pid"), `${process.pid}\n`, "utf8");
      } else {
        warnings.push("agent-browser is already running for another comparison; skipped browser fallback to avoid overloading the host");
        return null;
      }
    } catch {
      warnings.push("agent-browser lock could not be acquired; skipped browser fallback to avoid overloading the host");
      return null;
    }
  }

  try {
    return run();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
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

function syntheticAgentBrowserReference(summary: ReturnType<typeof summarizeSemanticTree>): NonNullable<StaticComparison["agentBrowser"]> {
  return {
    lineCount: Math.max(1, summary.namedRoles.length),
    roleCounts: summary.roles,
    namedRoles: summary.namedRoles,
    normalized: normalizeNamedRoles(summary.namedRoles),
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
  const structuralContentRecall = categoryRecall(candidateSet, reference.namedRoles, structuralContentRoles);
  const textRecall = categoryRecall(candidateSet, reference.namedRoles, textRoles);

  return {
    referenceRecall: roundScore(referenceRecall),
    candidatePrecision: roundScore(candidatePrecision),
    f1: roundScore(f1),
    actionableRecall: roundScore(actionableRecall),
    navigationRecall: roundScore(navigationRecall),
    contentRecall: roundScore(contentRecall),
    structuralContentRecall: roundScore(structuralContentRecall),
    textRecall: roundScore(textRecall),
    score: roundScore(
      actionableRecall * 0.4
      + navigationRecall * 0.25
      + structuralContentRecall * 0.2
      + candidatePrecision * 0.15
    ),
  };
}

async function summarizeCliAgentOutput(
  url: string,
  html: string,
  source: StaticComparison["fetch"]["source"],
  status: number,
  warnings: string[],
  findQueries: string[] = [],
): Promise<CliAgentSummary> {
  const stdout = createMemoryWriter();
  const stderr = createMemoryWriter();
  const args = source === "agent-browser-rendered" ? [url, "--stdin", "--agent"] : [url, "--agent"];
  for (const query of findQueries) args.push("--find", query);
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
    const summary = summarizeCliEnvelope(JSON.parse(stdout.output));
    summary.agentBriefExecutorStepScore = await summarizeCliBriefExecutorScore(url, html, source, status, warnings, findQueries);
    summary.agentExecutorScore = scoreAgentExecutorSummary(summary);
    summary.score = scoreCliAgentSummary(summary);
    return summary;
  } catch (error) {
    warnings.push(`ax-grep CLI summary parse failed: ${trimError(error)}`);
    return emptyCliAgentSummary();
  }
}

async function summarizeCliBriefExecutorScore(
  url: string,
  html: string,
  source: StaticComparison["fetch"]["source"],
  status: number,
  warnings: string[],
  findQueries: string[] = [],
): Promise<number> {
  const stdout = createMemoryWriter();
  const stderr = createMemoryWriter();
  const args = source === "agent-browser-rendered" ? [url, "--stdin", "--agent-brief"] : [url, "--agent-brief"];
  for (const query of findQueries) args.push("--find", query);
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
  if (cliStatus !== 0) warnings.push(`ax-grep brief CLI summary exited ${cliStatus}: ${trimError(stderr.output || stdout.output)}`);
  try {
    return scoreBriefAgentExecutorEnvelope(JSON.parse(stdout.output));
  } catch (error) {
    warnings.push(`ax-grep brief CLI summary parse failed: ${trimError(error)}`);
    return 0;
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
    page?: {
      title?: string;
      canonicalUrl?: string;
      lang?: string;
      dir?: string;
      siteName?: string;
      author?: string;
      publishedTime?: string;
      modifiedTime?: string;
      structuredDataTypes?: unknown[];
    };
    agent?: {
      contract?: {
        version?: number;
        features?: unknown[];
      };
      status?: "ready" | "choose-result" | "verify" | "needs-browser" | "error";
      routingIntent?: AgentRoutingIntent;
      continuationMode?: AgentContinuationMode;
      next?: CliAgentNextShape;
      runbook?: CliAgentRunbookShape;
      runbookDecision?: CliAgentRunbookShape["decision"];
      runbookMode?: CliAgentRunbookShape["mode"];
      runbookOperation?: CliAgentRunbookShape["operation"];
      runbookActionName?: string;
      runbookReason?: string;
      runbookConfidence?: CliAgentRunbookShape["confidence"];
      runbookAnswerStatus?: CliAgentRunbookShape["answerStatus"];
      runbookAnswerReady?: boolean;
      runbookShouldContinue?: boolean;
      runbookTerminal?: boolean;
      runbookMaxSuggestedIterations?: number;
      runbookExpectedOutcome?: CliAgentRunbookShape["expectedOutcome"];
      runbookReadFrom?: string;
      runbookCommandArgs?: string[];
      runbookUrl?: string;
      nextActionName?: string;
      nextExecution?: ActionExecution;
      nextCommand?: string;
      nextCommandArgs?: string[];
      nextAfterInteractionCommand?: string;
      nextAfterInteractionCommandArgs?: string[];
      nextReadFrom?: string;
      nextUrl?: string;
      executor?: CliAgentExecutorShape;
      handoff?: CliAgentHandoffShape;
      expectedOutcome?: CliAgentExpectedOutcomeShape;
      executionPlan?: CliAgentExecutionPlanShape;
      expectedOutcomeKind?: CliAgentExpectedOutcomeShape["kind"];
      expectedOutcomeMessage?: string;
      executionPlanOperation?: CliAgentExecutionPlanShape["operation"];
      executionPlanConfidence?: CliAgentExecutionPlanShape["confidence"];
      executionPlanReason?: string;
      executionPlanAnswerReady?: boolean;
      executionPlanShouldContinue?: boolean;
      executionPlanTerminal?: boolean;
      executionPlanExpectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
      executionPlanReadFrom?: string;
      executionPlanCommandArgs?: string[];
      executionPlanAfterInteractionCommand?: string;
      executionPlanAfterInteractionCommandArgs?: string[];
      executionPlanUrl?: string;
      answerPlan?: CliAgentAnswerPlanShape;
      searchDecision?: CliAgentSearchDecisionShape;
      pageDecision?: CliAgentPageDecisionShape;
      searchDecisionName?: CliAgentSearchDecisionShape["decision"];
      searchDecisionConfidence?: CliAgentSearchDecisionShape["confidence"];
      searchDecisionReason?: string;
      searchDecisionResultCount?: number;
      searchDecisionHighRelevanceCount?: number;
      searchDecisionMediumRelevanceCount?: number;
      searchDecisionLowRelevanceCount?: number;
      searchDecisionOfficialCount?: number;
      searchDecisionFindMatchCount?: number;
      searchDecisionRecommendedRank?: number;
      searchDecisionRecommendedPath?: string;
      searchDecisionRecommendedTitle?: string;
      searchDecisionRecommendedUrl?: string;
      searchDecisionRecommendedSource?: string;
      searchDecisionRecommendedSourceScore?: number;
      searchDecisionRecommendedRelevance?: CliSearchResultShape["relevance"];
      searchDecisionRecommendedLikelyOfficial?: boolean;
      searchDecisionCommandArgs?: string[];
      pageDecisionName?: CliAgentPageDecisionShape["decision"];
      pageDecisionConfidence?: CliAgentPageDecisionShape["confidence"];
      pageDecisionReason?: string;
      pageDecisionReadability?: CliAgentPageDecisionShape["readability"];
      pageDecisionReadabilityScore?: number;
      pageDecisionEvidenceCount?: number;
      pageDecisionEvidenceQualityScore?: number;
      pageDecisionSourceLinkCount?: number;
      pageDecisionSourceQualityScore?: number;
      pageDecisionReadFrom?: string;
      pageDecisionUrl?: string;
      pageDecisionCommandArgs?: string[];
      signalCount?: number;
      signalWarningCount?: number;
      signalErrorCount?: number;
      signals?: CliAgentSignalShape[];
      qualityGateCount?: number;
      qualityGateFailCount?: number;
      qualityGates?: CliAgentQualityGateShape[];
      topSignalKind?: CliAgentSignalShape["kind"];
      topSignalSeverity?: CliAgentSignalShape["severity"];
      topSignalMessage?: string;
      topQualityGateKind?: CliAgentQualityGateShape["kind"];
      topQualityGatePass?: boolean;
      topQualityGateSeverity?: CliAgentQualityGateShape["severity"];
      topQualityGateMessage?: string;
      topQualityGatePath?: string;
      topQualityGateScore?: number;
      problemSignalKind?: CliAgentSignalShape["kind"];
      problemSignalSeverity?: CliAgentSignalShape["severity"];
      problemSignalMessage?: string;
      failingQualityGateKind?: CliAgentQualityGateShape["kind"];
      failingQualityGateSeverity?: CliAgentQualityGateShape["severity"];
      failingQualityGateMessage?: string;
      failingQualityGatePath?: string;
      failingQualityGateScore?: number;
      responseStatus?: number;
      responseOk?: boolean;
      responseContentType?: string;
      finalUrlChanged?: boolean;
      pageKind?: string;
      pageTitle?: string;
      pageCanonicalUrl?: string;
      pageLang?: string;
      pageDir?: string;
      pageSiteName?: string;
      pageAuthor?: string;
      pagePublishedTime?: string;
      pageModifiedTime?: string;
      pageStructuredDataTypes?: unknown[];
      usabilityScore?: number;
      evidenceQualityScore?: number;
      sourceQualityScore?: number;
      alternativeActionCount?: number;
      bestReadTarget?: string;
      bestReadTargetCount?: number;
      bestReadTargetScore?: number;
      bestReadTargetPrimary?: boolean;
      bestReadTargetReason?: string;
      diagnosticErrorCount?: number;
      diagnosticWarningCount?: number;
      diagnosticInfoCount?: number;
      topDiagnosticCode?: string;
      topDiagnosticSeverity?: "info" | "warning" | "error";
      topDiagnosticMessage?: string;
      verificationRequestedCount?: number;
      verificationFoundCount?: number;
      verificationMissingCount?: number;
      verificationFoundQueries?: unknown[];
      verificationMissingQueries?: unknown[];
      topVerificationFoundQuery?: string;
      topVerificationMissingQuery?: string;
      canContinue?: boolean;
      canUseFetchedHtml?: boolean;
      needsBrowserHtml?: boolean;
      staticReadiness?: string;
      staticReadinessReason?: string;
      staticReadinessReadFrom?: string;
      browserHtmlReason?: string;
      browserHtmlReasonCode?: string;
      browserHtmlActionName?: string;
      browserHtmlOperation?: string;
      browserHtmlUrl?: string;
      browserHtmlFile?: string;
      browserHtmlCaptureScript?: string;
      browserHtmlCommand?: string;
      browserHtmlCommandArgs?: unknown[];
      browserHtmlAfterInteractionCommand?: string;
      browserHtmlAfterInteractionCommandArgs?: unknown[];
      readabilityReasons?: unknown[];
      recommendedRank?: number;
      recommendedUrl?: string;
      recommendedPath?: string;
      recommendedTitle?: string;
      recommendedSource?: string;
      recommendedSourceScore?: number;
      recommendedRelevance?: "low" | "medium" | "high";
      recommendedLikelyOfficial?: boolean;
      recommendedCommandArgs?: string[];
      resultCount?: number;
      resultChoiceCount?: number;
      resultChoices?: CliAgentResultChoiceShape[];
      topResultChoicePath?: string;
      topResultChoiceTitle?: string;
      topResultChoiceUrl?: string;
      topResultChoiceHost?: string;
      topResultChoiceCommandArgs?: unknown[];
      topResultChoiceRank?: number;
      topResultChoiceOpenResult?: number | "best";
      topResultChoiceRecommended?: boolean;
      topResultChoicePrimary?: boolean;
      topResultChoiceSourceType?: string;
      topResultChoiceSourceScore?: number;
      topResultChoiceSourceHints?: string[];
      topResultChoiceDateText?: string;
      topResultChoiceRelevance?: "low" | "medium" | "high";
      topResultChoiceMatchedTerm?: string;
      topResultChoiceFindMatch?: string;
      topResultChoiceLikelyOfficial?: boolean;
      topResultChoiceSitelinkCount?: number;
      topResultChoiceFirstSitelinkTitle?: string;
      topResultChoiceFirstSitelinkUrl?: string;
      topResultChoiceReason?: string;
      formCount?: number;
      formChoiceCount?: number;
      formChoices?: CliAgentFormChoiceShape[];
      actionTargetCount?: number;
      actionTargetChoiceCount?: number;
      actionTargetChoices?: CliAgentActionTargetChoiceShape[];
      topFormChoicePath?: string;
      topFormChoiceMethod?: string;
      topFormChoiceActionUrl?: string;
      topFormChoiceSubmitText?: string;
      topFormChoiceQueryField?: string;
      topFormChoiceUrlTemplate?: string;
      topFormChoiceFieldCount?: number;
      topFormChoiceSelector?: string;
      topFormChoiceFirstFieldName?: string;
      topFormChoiceFirstFieldType?: string;
      topFormChoiceFirstFieldLabel?: string;
      topFormChoiceFirstFieldRequired?: boolean;
      topFormChoiceFirstFieldSelector?: string;
      topActionTargetChoicePath?: string;
      topActionTargetChoiceKind?: string;
      topActionTargetChoiceName?: string;
      topActionTargetChoiceSource?: string;
      topActionTargetChoiceTargetUrl?: string;
      topActionTargetChoiceUrlTemplate?: string;
      topActionTargetChoiceQueryInput?: string;
      topActionTargetChoiceMethod?: string;
      topActionTargetChoiceDisabled?: boolean;
      topActionTargetChoicePressed?: boolean | "mixed";
      topActionTargetChoiceExpanded?: boolean;
      topActionTargetChoiceHaspopup?: boolean | string;
      topActionTargetChoiceControls?: string;
      topActionTargetChoiceSelector?: string;
      barrierCount?: number;
      topBarrierKind?: CliBarrierShape["kind"];
      topBarrierSeverity?: CliBarrierShape["severity"];
      topBarrierSource?: string;
      topBarrierPath?: string;
      topBarrierText?: string;
      topBarrierSelector?: string;
      topBarrierDiagnosticCode?: string;
      dataTableCount?: number;
      faqCount?: number;
      codeBlockCount?: number;
      resourceCount?: number;
      mediaCount?: number;
      sectionCount?: number;
      breadcrumbCount?: number;
      paginationCount?: number;
      tocCount?: number;
      embedCount?: number;
      transcriptCount?: number;
      authorLinkCount?: number;
      provenanceCount?: number;
      offerCount?: number;
      datasetCount?: number;
      identityCount?: number;
      timelineCount?: number;
      contactPointCount?: number;
      topDataTablePath?: string;
      topDataTableCaption?: string;
      topDataTableRowCount?: number;
      topDataTableColumnCount?: number;
      topDataTableHeaderCount?: number;
      topDataTableFirstHeader?: string;
      topDataTableFirstRow?: string[];
      topDataTableFirstCell?: string;
      topDataTableSelector?: string;
      topFaqQuestion?: string;
      topFaqAnswer?: string;
      topCodeBlockLanguage?: string;
      topCodeBlockLineCount?: number;
      topCodeBlockText?: string;
      topResourceKind?: string;
      topResourceUrl?: string;
      topResourceTitle?: string;
      topMediaKind?: string;
      topMediaUrl?: string;
      topMediaText?: string;
      topSectionPath?: string;
      topSectionHeading?: string;
      topSectionLevel?: number;
      topSectionText?: string;
      topSectionSelector?: string;
      topBreadcrumbPath?: string;
      topBreadcrumbText?: string;
      topBreadcrumbSource?: string;
      topPaginationPath?: string;
      topPaginationKind?: string;
      topPaginationLabel?: string;
      topPaginationUrl?: string;
      topPaginationCurrent?: boolean;
      topPaginationSelector?: string;
      topTocPath?: string;
      topTocTitle?: string;
      topTocItemCount?: number;
      topTocText?: string;
      topTocFirstItemLabel?: string;
      topTocFirstItemUrl?: string;
      topTocSelector?: string;
      topEmbedKind?: string;
      topEmbedUrl?: string;
      topEmbedTitle?: string;
      topTranscriptKind?: string;
      topTranscriptUrl?: string;
      topTranscriptLabel?: string;
      topTranscriptLanguage?: string;
      topAuthorLinkName?: string;
      topAuthorLinkUrl?: string;
      topAuthorLinkSource?: string;
      topProvenancePath?: string;
      topProvenanceKind?: string;
      topProvenanceLabel?: string;
      topProvenanceValue?: string;
      topProvenanceUrl?: string;
      topProvenanceSource?: string;
      topProvenanceSelector?: string;
      topOfferPath?: string;
      topOfferName?: string;
      topOfferPrice?: string;
      topOfferCurrency?: string;
      topOfferAvailability?: string;
      topOfferUrl?: string;
      topOfferSelector?: string;
      topDatasetPath?: string;
      topDatasetKind?: string;
      topDatasetName?: string;
      topDatasetUrl?: string;
      topDatasetDistributionUrl?: string;
      topDatasetLicenseUrl?: string;
      topDatasetEncodingFormat?: string;
      topDatasetSelector?: string;
      topIdentityPath?: string;
      topIdentityKind?: string;
      topIdentityName?: string;
      topIdentityUrl?: string;
      topIdentityLogoUrl?: string;
      topIdentitySameAsUrl?: string;
      topIdentitySource?: string;
      topIdentitySelector?: string;
      topTimelinePath?: string;
      topTimelineKind?: string;
      topTimelineLabel?: string;
      topTimelineValue?: string;
      topTimelineSource?: string;
      topTimelineSelector?: string;
      topContactPointPath?: string;
      topContactPointKind?: string;
      topContactPointLabel?: string;
      topContactPointValue?: string;
      topContactPointUrl?: string;
      topContactPointSource?: string;
      topContactPointSelector?: string;
      structuredReadTargetCount?: number;
      bestStructuredReadTarget?: string;
      bestStructuredReadTargetCount?: number;
      bestStructuredReadTargetScore?: number;
      bestStructuredReadTargetPrimary?: boolean;
      bestStructuredReadTargetReason?: string;
      hiddenSignalCount?: number;
      hiddenHydrationCount?: number;
      hiddenApiEndpointCount?: number;
      hiddenClientStateCount?: number;
      hiddenAppHintCount?: number;
      topHydrationPath?: string;
      topHydrationKind?: string;
      topHydrationLabel?: string;
      topHydrationUrl?: string;
      topHydrationSelector?: string;
      topApiEndpointPath?: string;
      topApiEndpointKind?: string;
      topApiEndpointMethod?: string;
      topApiEndpointUrl?: string;
      topApiEndpointSelector?: string;
      topClientStatePath?: string;
      topClientStateKind?: string;
      topClientStateOperation?: string;
      topClientStateKey?: string;
      topClientStateSelector?: string;
      topAppHintPath?: string;
      topAppHintKind?: string;
      topAppHintLabel?: string;
      topAppHintUrl?: string;
      topAppHintSelector?: string;
      topHiddenSignalGroup?: string;
      topHiddenSignalPath?: string;
      topHiddenSignalKind?: string;
      topHiddenSignalText?: string;
      topHiddenSignalUrl?: string;
      topHiddenSignalSource?: string;
      topHiddenSignalSelector?: string;
      hiddenReadTargetCount?: number;
      bestHiddenReadTarget?: string;
      bestHiddenReadTargetCount?: number;
      bestHiddenReadTargetScore?: number;
      bestHiddenReadTargetPrimary?: boolean;
      bestHiddenReadTargetReason?: string;
      sourceLinkCount?: number;
      sourceChoiceCount?: number;
      sourceChoices?: CliAgentSourceChoiceShape[];
      topSourceChoicePath?: string;
      topSourceChoiceTitle?: string;
      topSourceChoiceUrl?: string;
      topSourceChoiceHost?: string;
      topSourceChoiceCommandArgs?: string[];
      topSourceChoiceSourceType?: string;
      topSourceChoiceSourceScore?: number;
      topSourceChoiceSourceHints?: string[];
      topSourceChoicePrimary?: boolean;
      topSourceChoiceReason?: string;
      topChoiceKind?: "result" | "source" | "form" | "action-target";
      topChoicePath?: string;
      topChoiceLabel?: string;
      topChoiceUrl?: string;
      topChoiceCommandArgs?: string[];
      sourceSearchQuery?: string;
      sourceSearchEngine?: string;
      sourceSearchSelectedEngine?: string;
      sourceSearchSearchUrl?: string;
      sourceSearchLang?: string;
      sourceSearchRegion?: string;
      sourceSearchFindQueryCount?: number;
      sourceSearchTopFindQuery?: string;
      sourceSearchSelectedRank?: number;
      sourceSearchSelectedTitle?: string;
      sourceSearchSelectedUrl?: string;
      sourceSearchSelectedHost?: string;
      sourceSearchSelectedPath?: string;
      sourceSearchSelectedOpenResult?: number | "best";
      sourceSearchSelectedCommandArgs?: unknown[];
      sourceSearchSelectedReason?: string;
      sourceSearchFailureCode?: string;
      sourceSearchFailureStatus?: number;
      sourceSearchFailureUrl?: string;
      sourceSearchFailureReason?: string;
      sourceSearchAlternateCount?: number;
      sourceSearchAlternatePath?: string;
      sourceSearchAlternateTitle?: string;
      sourceSearchAlternateUrl?: string;
      sourceSearchAlternateHost?: string;
      sourceSearchAlternateRank?: number;
      sourceSearchAlternateOpenResult?: number | "best";
      sourceSearchAlternateCommandArgs?: unknown[];
      sourceSearchAlternateReason?: string;
      executorDecision?: CliAgentLoopShape["decision"];
      executorMode?: AgentContinuationMode;
      executorActionName?: string;
      executorOperation?: CliAgentExecutionPlanShape["operation"];
      executorConfidence?: CliAgentExecutionPlanShape["confidence"];
      executorAnswerReady?: boolean;
      executorShouldContinue?: boolean;
      executorTerminal?: boolean;
      executorCommandArgs?: string[];
      executorReadFrom?: string;
      executorUrl?: string;
      executorTargetUrl?: string;
      executorTargetPath?: string;
      executorTargetTitle?: string;
      executorTargetHost?: string;
      executorTargetSource?: string;
      executorTargetRank?: number;
      executorTargetSourceScore?: number;
      executorTargetRelevance?: CliAgentTargetShape["relevance"];
      executorTargetLikelyOfficial?: boolean;
      executorTargetSelector?: string;
      executorTargetText?: string;
      executorExpectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
      handoffDecision?: CliAgentLoopShape["decision"];
      handoffMode?: AgentContinuationMode;
      handoffActionName?: string;
      handoffOperation?: CliAgentExecutionPlanShape["operation"];
      handoffAnswerStatus?: CliAgentAnswerPlanShape["status"];
      handoffConfidence?: CliAgentExecutionPlanShape["confidence"];
      handoffAnswerReady?: boolean;
      handoffShouldContinue?: boolean;
      handoffTerminal?: boolean;
      handoffPriority?: "low" | "medium" | "high";
      handoffPriorityReason?: string;
      handoffCommandArgs?: string[];
      handoffReadFrom?: string;
      handoffUrl?: string;
      handoffTargetUrl?: string;
      handoffTargetPath?: string;
      handoffTargetTitle?: string;
      handoffTargetHost?: string;
      handoffTargetSource?: string;
      handoffTargetRank?: number;
      handoffTargetSourceScore?: number;
      handoffTargetRelevance?: CliAgentTargetShape["relevance"];
      handoffTargetLikelyOfficial?: boolean;
      handoffTargetSelector?: string;
      handoffTargetText?: string;
      handoffExpectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
      answerPlanStatus?: CliAgentAnswerPlanShape["status"];
      answerPlanConfidence?: CliAgentAnswerPlanShape["confidence"];
      answerGapCount?: number;
      answerUseCitationCount?: number;
      topAnswerUseCitationId?: string;
      answerUseCitationIds?: string[];
      answerPlanReadFrom?: string;
      answerPlanCommandArgs?: string[];
      answerPlanUrl?: string;
      primaryActionName?: string;
      primaryReason?: string;
      primaryPriority?: "low" | "medium" | "high";
      primaryPriorityReason?: string;
      topReadTarget?: string;
      topReadTargetCount?: number;
      topReadTargetScore?: number;
      topReadTargetPrimary?: boolean;
      topReadTargetReason?: string;
      citationCount?: number;
      topCitationId?: string;
      topCitationPath?: string;
      topCitationKind?: CliAgentCitationShape["kind"];
      topCitationText?: string;
      topCitationTitle?: string;
      topCitationUrl?: string;
      topCitationConfidence?: CliAgentCitationShape["confidence"];
      topCitationReason?: string;
      topCitationScore?: number;
      answerEvidenceCount?: number;
      topAnswerEvidenceId?: string;
      topAnswerEvidencePath?: string;
      topAnswerEvidenceKind?: CliAgentCitationShape["kind"];
      topAnswerEvidenceText?: string;
      topAnswerEvidenceTitle?: string;
      topAnswerEvidenceUrl?: string;
      topAnswerEvidenceConfidence?: CliAgentCitationShape["confidence"];
      topAnswerEvidenceReason?: string;
      topAnswerEvidenceScore?: number;
      readTargetCount?: number;
      actionCount?: number;
      topActionName?: string;
      topActionSource?: string;
      topActionExecution?: ActionExecution;
      topActionPriority?: "low" | "medium" | "high";
      topActionReason?: string;
      topActionReadFrom?: string;
      topActionCommandArgs?: string[];
      topActionUrl?: string;
      topActionSourceLinkRef?: string;
      topActionRequiresBrowserInteraction?: boolean;
      primaryExecution?: ActionExecution;
      primaryReadFrom?: string;
      primaryCommand?: string;
      primaryCommandArgs?: string[];
      primaryAfterInteractionCommand?: string;
      primaryAfterInteractionCommandArgs?: string[];
      primaryUrl?: string;
      primaryRank?: number;
      primaryOpenResult?: number | "best";
      requiresBrowserInteraction?: boolean;
      primaryAction?: CliActionShape;
      alternativeActionName?: string;
      alternativeActionSource?: string;
      alternativeActionExecution?: ActionExecution;
      alternativeActionPriority?: "low" | "medium" | "high";
      alternativeActionReason?: string;
      alternativeActionReadFrom?: string;
      alternativeActionCommandArgs?: string[];
      alternativeActionUrl?: string;
      alternativeActionSourceLinkRef?: string;
      alternativeActionRequiresBrowserInteraction?: boolean;
      actions?: CliActionShape[];
      citations?: CliAgentCitationShape[];
      answerEvidence?: CliAgentCitationShape[];
      readTargets?: CliReadTargetShape[];
      semanticSummary?: unknown;
      semanticNodeCount?: number;
      semanticNamedRoleCount?: number;
      semanticInteractiveCount?: number;
      semanticFocusableCount?: number;
      semanticHeadingCount?: number;
      semanticLandmarkCount?: number;
      semanticLinkCount?: number;
      semanticButtonCount?: number;
      semanticImageCount?: number;
      semanticTableCount?: number;
      semanticListCount?: number;
      semanticFieldCount?: number;
      semanticDescriptionCount?: number;
      semanticValueCount?: number;
      semanticRelationCount?: number;
      semanticChoiceCount?: number;
      semanticStateCount?: number;
      semanticUnavailableCount?: number;
      semanticTopRole?: string;
      semanticTopRoleCount?: number;
      semanticOutlineCount?: number;
      semanticTopOutlinePath?: string;
      semanticTopOutlineKind?: "heading" | "landmark";
      semanticTopOutlineRole?: string;
      semanticTopOutlineText?: string;
      semanticTopOutlineLevel?: number;
      semanticTopOutlineDepth?: number;
      semanticTopOutlineParentPath?: string;
      semanticTopOutlineParentRole?: string;
      semanticTopOutlineParentName?: string;
      semanticTopOutlineSelector?: string;
      semanticKeyboardShortcutCount?: number;
      semanticTopKeyboardShortcutPath?: string;
      semanticTopKeyboardShortcutRole?: string;
      semanticTopKeyboardShortcutName?: string;
      semanticTopKeyboardShortcutKeys?: string[];
      semanticTopKeyboardShortcutAccessKey?: string;
      semanticTopKeyboardShortcutTabIndex?: number;
      semanticTopKeyboardShortcutFocusable?: boolean;
      semanticTopKeyboardShortcutSelector?: string;
      semanticTopHeading?: string;
      semanticTopHeadingPath?: string;
      semanticTopHeadingLevel?: number;
      semanticTopLandmark?: string;
      semanticTopLandmarkPath?: string;
      semanticTopLandmarkRole?: string;
      semanticTopLandmarkName?: string;
      semanticTopNamedRole?: string;
      semanticTopNamedRolePath?: string;
      semanticTopNamedRoleRole?: string;
      semanticTopNamedRoleName?: string;
      semanticTopNamedRoleDescription?: string;
      semanticTopInteractiveRole?: string;
      semanticTopInteractivePath?: string;
      semanticTopInteractiveName?: string;
      semanticTopInteractiveRoleDescription?: string;
      semanticTopInteractiveDescription?: string;
      semanticTopInteractiveValue?: string;
      semanticTopInteractiveState?: string;
      semanticTopInteractiveDisabled?: boolean;
      semanticTopInteractiveSelector?: string;
      semanticTopFocusableRole?: string;
      semanticTopFocusablePath?: string;
      semanticTopFocusableName?: string;
      semanticTopFocusableRoleDescription?: string;
      semanticTopFocusableState?: string;
      semanticTopFocusableSelector?: string;
      semanticTopLinkName?: string;
      semanticTopLinkPath?: string;
      semanticTopLinkUrl?: string;
      semanticTopLinkTarget?: string;
      semanticTopLinkRel?: string[];
      semanticTopLinkType?: string;
      semanticTopLinkHreflang?: string;
      semanticTopLinkState?: string;
      semanticTopLinkCurrent?: boolean | string;
      semanticTopLinkDownload?: string | true;
      semanticTopLinkSelector?: string;
      semanticInPageLinkCount?: number;
      semanticTopInPageLinkPath?: string;
      semanticTopInPageLinkKind?: "skip" | "anchor";
      semanticTopInPageLinkName?: string;
      semanticTopInPageLinkUrl?: string;
      semanticTopInPageLinkTargetId?: string;
      semanticTopInPageLinkSelector?: string;
      semanticTopButtonName?: string;
      semanticTopButtonPath?: string;
      semanticTopButtonRoleDescription?: string;
      semanticTopButtonDescription?: string;
      semanticTopButtonType?: string;
      semanticTopButtonState?: string;
      semanticTopButtonDisabled?: boolean;
      semanticTopButtonPressed?: boolean | "mixed";
      semanticTopButtonExpanded?: boolean;
      semanticTopButtonHaspopup?: boolean | string;
      semanticTopButtonControls?: string;
      semanticTopButtonFormAction?: string;
      semanticTopButtonFormMethod?: string;
      semanticTopButtonFormTarget?: string;
      semanticTopButtonFormEncType?: string;
      semanticTopButtonFormNoValidate?: boolean;
      semanticTopButtonFormId?: string;
      semanticTopButtonSelector?: string;
      semanticTopImagePath?: string;
      semanticTopImageName?: string;
      semanticTopImageUrl?: string;
      semanticTopImageWidth?: number;
      semanticTopImageHeight?: number;
      semanticTopImageLoading?: string;
      semanticTopImageDecoding?: string;
      semanticTopImageSrcset?: string;
      semanticTopImageSizes?: string;
      semanticTopImageSelector?: string;
      semanticTopTableRole?: string;
      semanticTopTablePath?: string;
      semanticTopTableName?: string;
      semanticTopTableRowCount?: number;
      semanticTopTableCellCount?: number;
      semanticTopTableDeclaredRowCount?: number;
      semanticTopTableDeclaredColumnCount?: number;
      semanticTopTableHeaders?: string[];
      semanticTopTableHeaderRefs?: Array<{ path?: string; text?: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }>;
      semanticTopTableOwnedCount?: number;
      semanticTopTableOwnedRefs?: Array<{ target?: string; role?: string; name?: string; selector?: string }>;
      semanticTopTableSampleCells?: string[];
      semanticTopTableSampleCellRefs?: Array<{ path?: string; text?: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selector?: string }>;
      semanticTopTableFirstHeader?: string;
      semanticTopTableFirstHeaderPath?: string;
      semanticTopTableFirstHeaderRole?: string;
      semanticTopTableFirstHeaderRowIndex?: number;
      semanticTopTableFirstHeaderColumnIndex?: number;
      semanticTopTableFirstHeaderSort?: string;
      semanticTopTableFirstHeaderSelector?: string;
      semanticTopTableFirstOwnedTarget?: string;
      semanticTopTableFirstOwnedRole?: string;
      semanticTopTableFirstOwnedName?: string;
      semanticTopTableFirstOwnedSelector?: string;
      semanticTopTableFirstSampleCellPath?: string;
      semanticTopTableFirstSampleCellText?: string;
      semanticTopTableFirstSampleCellRowIndex?: number;
      semanticTopTableFirstSampleCellColumnIndex?: number;
      semanticTopTableFirstSampleCellRowSpan?: number;
      semanticTopTableFirstSampleCellColumnSpan?: number;
      semanticTopTableFirstSampleCellHeaders?: string[];
      semanticTopTableFirstSampleCellRowHeaders?: string[];
      semanticTopTableFirstSampleCellColumnHeaders?: string[];
      semanticTopTableFirstSampleCellSelector?: string;
      semanticTopTableSelector?: string;
      semanticTopListRole?: string;
      semanticTopListPath?: string;
      semanticTopListName?: string;
      semanticTopListItemCount?: number;
      semanticTopListItems?: string[];
      semanticTopListItemRefs?: Array<{ text?: string; role?: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: boolean | string; expanded?: boolean; selector?: string }>;
      semanticTopListSelector?: string;
      semanticTopFieldRole?: string;
      semanticTopFieldPath?: string;
      semanticTopFieldName?: string;
      semanticTopFieldDescription?: string;
      semanticTopFieldValue?: string;
      semanticTopFieldHtmlName?: string;
      semanticTopFieldHtmlType?: string;
      semanticTopFieldPlaceholder?: string;
      semanticTopFieldAriaPlaceholder?: string;
      semanticTopFieldAutocomplete?: string;
      semanticTopFieldAriaAutocomplete?: string;
      semanticTopFieldInputMode?: string;
      semanticTopFieldPattern?: string;
      semanticTopFieldMin?: string;
      semanticTopFieldMax?: string;
      semanticTopFieldStep?: string;
      semanticTopFieldMinLength?: number;
      semanticTopFieldMaxLength?: number;
      semanticTopFieldLabelledBy?: string;
      semanticTopFieldLabelledByText?: string;
      semanticTopFieldDescribedBy?: string;
      semanticTopFieldDescribedByText?: string;
      semanticTopFieldDetails?: string;
      semanticTopFieldDetailsText?: string;
      semanticTopFieldErrorMessage?: string;
      semanticTopFieldErrorMessageText?: string;
      semanticTopFieldState?: string;
      semanticTopFieldDisabled?: boolean;
      semanticTopFieldRequired?: boolean;
      semanticTopFieldReadonly?: boolean;
      semanticTopFieldInvalid?: boolean | string;
      semanticTopFieldChecked?: boolean | "mixed";
      semanticTopFieldExpanded?: boolean;
      semanticTopFieldHaspopup?: boolean | string;
      semanticTopFieldControls?: string;
      semanticTopFieldValueMin?: number;
      semanticTopFieldValueMax?: number;
      semanticTopFieldValueNow?: number;
      semanticTopFieldValueText?: string;
      semanticTopFieldSelector?: string;
      semanticTopDescriptionRole?: string;
      semanticTopDescriptionPath?: string;
      semanticTopDescriptionName?: string;
      semanticTopDescriptionText?: string;
      semanticTopDescriptionSelector?: string;
      semanticTopValueRole?: string;
      semanticTopValuePath?: string;
      semanticTopValueName?: string;
      semanticTopValue?: string;
      semanticTopValueSelector?: string;
      semanticTopRelationRole?: string;
      semanticTopRelationPath?: string;
      semanticTopRelationName?: string;
      semanticTopRelation?: string;
      semanticTopRelationTarget?: string;
      semanticTopRelationTargetRole?: string;
      semanticTopRelationTargetName?: string;
      semanticTopRelationTargetSelector?: string;
      semanticTopRelationSelector?: string;
      semanticTopChoiceRole?: string;
      semanticTopChoicePath?: string;
      semanticTopChoiceName?: string;
      semanticTopChoiceState?: string;
      semanticTopChoiceSelected?: boolean;
      semanticTopChoiceCurrent?: boolean | string;
      semanticTopChoiceLevel?: number;
      semanticTopChoicePosInSet?: number;
      semanticTopChoiceSetSize?: number;
      semanticTopChoiceSelector?: string;
      semanticTopStateRole?: string;
      semanticTopStatePath?: string;
      semanticTopStateName?: string;
      semanticTopState?: string;
      semanticTopStateHidden?: boolean;
      semanticTopStateDisabled?: boolean;
      semanticTopStateBusy?: boolean;
      semanticTopStateMultiselectable?: boolean;
      semanticTopStateSort?: string;
      semanticTopStateGrabbed?: boolean;
      semanticTopStateDropEffect?: string;
      semanticTopStateChecked?: boolean | "mixed";
      semanticTopStateSelected?: boolean;
      semanticTopStateExpanded?: boolean;
      semanticTopStatePressed?: boolean | "mixed";
      semanticTopStateFocused?: boolean;
      semanticTopStateRequired?: boolean;
      semanticTopStateInvalid?: boolean | string;
      semanticTopStateReadonly?: boolean;
      semanticTopStateCurrent?: boolean | string;
      semanticTopStateHaspopup?: boolean | string;
      semanticTopStateControls?: string;
      semanticTopStateLive?: string;
      semanticTopStateModal?: boolean;
      semanticTopStateOrientation?: string;
      semanticTopStateValueMin?: number;
      semanticTopStateValueMax?: number;
      semanticTopStateValueNow?: number;
      semanticTopStateValueText?: string;
      semanticTopStateSelector?: string;
      semanticTopUnavailablePath?: string;
      semanticTopUnavailableTag?: string;
      semanticTopUnavailableRole?: string;
      semanticTopUnavailableName?: string;
      semanticTopUnavailableReason?: string;
      semanticTopUnavailableSelector?: string;
    };
    diagnostics?: Array<{ severity?: "info" | "warning" | "error" }>;
    sourceSearch?: {
      query?: string;
      engine?: string;
      selectedEngine?: string;
      searchUrl?: string;
      lang?: string;
      region?: string;
      findQueries?: unknown[];
      selectedRank?: number;
      selectedTitle?: string;
      selectedUrl?: string;
      selectedResult?: CliAgentSourceSearchResultShape;
      alternateResults?: CliAgentSourceSearchResultShape[];
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
      primaryLinks?: Array<{ id?: string; path?: string; title?: string; url?: string; sourceScore?: number; selectionReason?: string; command?: string; commandArgs?: string[] }>;
      sourceLinks?: Array<{ id?: string; path?: string; title?: string; url?: string; kind?: "internal" | "external"; sourceScore?: number; selectionReason?: string; command?: string; commandArgs?: string[] }>;
      barriers?: CliBarrierShape[];
      dataTables?: Array<{ path?: string; caption?: string; rowCount?: number; columnCount?: number }>;
      faqs?: Array<{ question?: string; answer?: string }>;
      codeBlocks?: Array<{ language?: string; lineCount?: number; text?: string }>;
      resources?: Array<{ kind?: string; url?: string; title?: string }>;
      media?: Array<{ kind?: string; url?: string; text?: string }>;
      sections?: Array<{ heading?: string; text?: string }>;
      forms?: unknown[];
      actionTargets?: unknown[];
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
      foundQueries?: unknown[];
      missingQueries?: unknown[];
      evidenceCount?: number;
      recommendedAction?: CliActionShape;
    };
  };
  const confidence = item.pageCheck?.confidence ?? "low";
  const readabilityLevel = item.pageCheck?.readability?.level ?? "low";
  const cliActions = collectCliActions(item);
  const hiddenSignalCount = countHiddenPageCheckSignals(item.pageCheck);
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
    hiddenSignalCount,
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
    agentNextShortcutScore: scoreAgentNextShortcuts(item.agent),
    agentRunbookScore: scoreAgentRunbook(item.agent?.runbook, item.agent?.next, item.agent?.executionPlan, item.agent?.answerPlan),
    agentRunbookShortcutScore: scoreAgentRunbookShortcuts(item.agent),
    agentExecutorStepScore: scoreAgentExecutorStep(item.agent?.executor, item.agent?.next, item.agent?.executionPlan, item.agent?.answerPlan),
    agentBriefExecutorStepScore: 0,
    agentHandoffScore: scoreAgentHandoff(
      item.agent?.handoff,
      item.agent?.next,
      item.agent?.executionPlan,
      item.agent?.answerPlan,
      item.agent?.answerEvidence ?? [],
      item.agent?.resultChoices ?? [],
      item.agent?.sourceChoices ?? [],
      item.sourceSearch,
      item.agent?.signals ?? [],
      item.agent?.qualityGates ?? [],
      item.agent?.verificationFoundQueries ?? [],
      item.agent?.verificationMissingQueries ?? [],
    ),
    agentExecutionPlanScore: scoreAgentExecutionPlan(item.agent?.executionPlan, item.agent?.next, item.agent?.answerPlan, item.agent?.canUseFetchedHtml, item.agent?.needsBrowserHtml, item.agent?.expectedOutcome),
    agentExpectedOutcomeScore: scoreAgentExpectedOutcome(item.agent?.expectedOutcome, item.agent?.primaryAction),
    agentSignalScore: scoreAgentSignals(item.agent?.signals, item),
    agentQualityGateScore: scoreAgentQualityGates(item.agent?.qualityGates, item),
    pageLinkCommandScore: scorePageLinkCommands(item.pageCheck?.primaryLinks ?? [], item.pageCheck?.sourceLinks ?? []),
    agentPageKindScore: scoreAgentPageKind(item.agent?.pageKind, item.kind),
    agentPageMetadataShortcutScore: scoreAgentPageMetadataShortcuts(item.agent, item.page),
    agentAlternativeActionCountScore: scoreAgentAlternativeActionCount(item.agent?.alternativeActionCount, item.agent?.actions),
    agentUsabilityScoreConsistency: scoreAgentUsabilityScore(item.agent?.usabilityScore, item),
    agentEvidenceQualityScoreConsistency: scoreAgentEvidenceQualityScore(item.agent?.evidenceQualityScore, item.pageCheck?.contentEvidence ?? []),
    agentSourceQualityScoreConsistency: scoreAgentSourceQualityScore(item.agent?.sourceQualityScore, item.kind, item.pageCheck?.sourceLinks ?? [], item.searchResults ?? []),
    agentBestReadTargetScore: scoreAgentBestReadTarget(item.agent),
    agentDiagnosticCountScore: scoreAgentDiagnosticCounts(item.agent, item.diagnostics ?? []),
    agentVerificationCountScore: scoreAgentVerificationCounts(item.agent, item.verification),
    agentVerificationQueryScore: scoreAgentVerificationQueries(item.agent, item.verification),
    agentEvidenceCountShortcutScore: scoreAgentEvidenceCountShortcuts(item.agent),
    agentSignalCountShortcutScore: scoreAgentSignalCountShortcuts(item.agent),
    agentTopQualityShortcutScore: scoreAgentTopQualityShortcuts(item.agent),
    agentProblemShortcutScore: scoreAgentProblemShortcuts(item.agent),
    agentResponseMetadataScore: scoreAgentResponseMetadata(item.agent, item),
    agentHiddenSignalScore: scoreAgentHiddenSignals(item.pageCheck, item.agent?.readTargets ?? [], item),
    agentReadTargetScore: scoreAgentReadTargets(item.agent?.readTargets ?? [], item.agent?.primaryAction, item),
    agentTopReadTargetShortcutScore: scoreAgentTopReadTargetShortcuts(item.agent),
    agentResultCountScore: scoreAgentResultCount(item.kind ?? "unknown", item.agent?.resultCount, item.searchResults ?? []),
    agentChoiceCountScore: scoreAgentChoiceCounts(item.agent),
    agentTopChoiceShortcutScore: scoreAgentTopChoiceShortcuts(item.agent),
    agentResultChoiceScore: scoreAgentResultChoices(item.agent?.resultChoices ?? [], item.searchResults ?? [], item.recommendedResult, item.agent?.primaryAction),
    agentTopResultChoiceShortcutScore: scoreAgentTopResultChoiceShortcuts(item.agent),
    agentSourceLinkCountScore: scoreAgentSourceLinkCount(item.kind ?? "unknown", item.agent?.sourceLinkCount, item.pageCheck?.sourceLinks ?? []),
    agentFormActionCountScore: scoreAgentFormActionCounts(item.agent?.formCount, item.agent?.actionTargetCount, item.pageCheck?.forms ?? [], item.pageCheck?.actionTargets ?? []),
    agentFormActionChoiceScore: scoreAgentFormActionChoices(item.agent?.formChoices ?? [], item.agent?.actionTargetChoices ?? [], item.pageCheck?.forms ?? [], item.pageCheck?.actionTargets ?? []),
    agentTopFormActionChoiceShortcutScore: scoreAgentTopFormActionChoiceShortcuts(item.agent),
    agentHiddenSignalCountScore: scoreAgentHiddenSignalCounts(item.agent, hiddenSignalCount, item.pageCheck),
    agentTopHiddenSignalShortcutScore: scoreAgentTopHiddenSignalShortcuts(item.agent, item.pageCheck),
    agentSourceChoiceScore: scoreAgentSourceChoices(item.kind ?? "unknown", item.agent?.sourceChoices ?? [], item.pageCheck?.sourceLinks ?? [], item.agent?.primaryAction),
    agentTopSourceChoiceShortcutScore: scoreAgentTopSourceChoiceShortcuts(item.agent),
    agentSourceSearchShortcutScore: scoreAgentSourceSearchShortcuts(item.agent, item.sourceSearch),
    agentBrowserNeedScore: scoreAgentBrowserNeed(item.agent?.needsBrowserHtml, item.agent?.browserHtmlReason, item.agent?.browserHtmlReasonCode, item.agent?.staticReadiness, item.agent?.staticReadinessReason, item.agent?.status, item.agent?.primaryAction),
    agentBrowserHtmlScore: scoreAgentBrowserHtml(item.agent, item.agent?.next, item.agent?.executionPlan, item.agent?.primaryAction),
    agentReadabilityReasonScore: scoreReadabilityReasons(item.agent?.readabilityReasons),
    agentSourceSearchProvenanceScore: scoreAgentSourceSearchProvenance(item.sourceSearch, item.agent?.readTargets ?? []),
    agentRecommendedMetadataScore: scoreAgentRecommendedMetadata(item.agent, item.recommendedResult),
    agentCanContinueScore: scoreAgentCanContinue(item.agent?.canContinue, item.agent?.primaryAction),
    agentPrimaryExecutionScore: scoreAgentPrimaryExecution(item.agent?.primaryExecution, item.agent?.primaryAction),
    agentPrimaryShortcutScore: scoreAgentPrimaryShortcuts(item.agent),
    agentAlternativeActionShortcutScore: scoreAgentAlternativeActionShortcuts(item.agent),
    agentExecutorShortcutScore: scoreAgentExecutorShortcuts(item.agent),
    agentHandoffShortcutScore: scoreAgentHandoffShortcuts(item.agent),
    agentAnswerShortcutScore: scoreAgentAnswerShortcuts(item.agent),
    agentPlanShortcutScore: scoreAgentPlanShortcuts(item.agent),
    agentCitationScore: scoreAgentCitations(item.agent?.citations ?? [], item, item.agent?.answerPlan, item.agent?.primaryAction, item.agent?.needsBrowserHtml),
    agentTopCitationShortcutScore: scoreAgentTopCitationShortcuts(item.agent),
    agentAnswerPlanScore: scoreAgentAnswerPlan(item.agent?.answerPlan, item.agent?.citations ?? [], item.agent?.primaryAction, item.agent?.needsBrowserHtml),
    agentAnswerEvidenceScore: scoreAgentAnswerEvidence(item.agent?.answerEvidence ?? [], item.agent?.answerPlan, item.agent?.citations ?? []),
    agentActionListScore: scoreAgentActionList(item.agent?.actions, item.agent?.primaryAction, item.agent?.alternativeActionCount),
    agentTopActionShortcutScore: scoreAgentTopActionShortcuts(item.agent),
    agentSearchDecisionScore: scoreAgentSearchDecision(item.agent, item.kind, item.agent?.primaryAction, item.searchResults ?? [], item.recommendedResult, item.agent?.resultCount),
    agentPageDecisionScore: scoreAgentPageDecision(item.agent, item.kind, item.agent?.primaryAction, item.pageCheck),
    agentSemanticSummaryScore: scoreAgentSemanticSummary(item.agent),
    agentBarrierShortcutScore: scoreAgentBarrierShortcuts(item.agent, item.pageCheck?.barriers ?? []),
    agentStructuredShortcutScore: scoreAgentStructuredShortcuts(item.agent, item.pageCheck),
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
    agentNextShortcutScore: 0,
    agentRunbookScore: 0,
    agentRunbookShortcutScore: 0,
    agentExecutorStepScore: 0,
    agentBriefExecutorStepScore: 0,
    agentHandoffScore: 0,
    agentExecutionPlanScore: 0,
    agentExpectedOutcomeScore: 0,
    agentSignalScore: 0,
    agentQualityGateScore: 0,
    pageLinkCommandScore: 0,
    agentPageKindScore: 0,
    agentPageMetadataShortcutScore: 0,
    agentAlternativeActionCountScore: 0,
    agentUsabilityScoreConsistency: 0,
    agentEvidenceQualityScoreConsistency: 0,
    agentSourceQualityScoreConsistency: 0,
    agentBestReadTargetScore: 0,
    agentDiagnosticCountScore: 0,
    agentVerificationCountScore: 0,
    agentVerificationQueryScore: 0,
    agentEvidenceCountShortcutScore: 0,
    agentSignalCountShortcutScore: 0,
    agentTopQualityShortcutScore: 0,
    agentProblemShortcutScore: 0,
    agentResponseMetadataScore: 0,
    agentHiddenSignalScore: 0,
    agentReadTargetScore: 0,
    agentTopReadTargetShortcutScore: 0,
    agentResultCountScore: 0,
    agentChoiceCountScore: 0,
    agentTopChoiceShortcutScore: 0,
    agentResultChoiceScore: 0,
    agentTopResultChoiceShortcutScore: 0,
    agentSourceLinkCountScore: 0,
    agentFormActionCountScore: 0,
    agentFormActionChoiceScore: 0,
    agentTopFormActionChoiceShortcutScore: 0,
    agentHiddenSignalCountScore: 0,
    agentTopHiddenSignalShortcutScore: 0,
    agentSourceChoiceScore: 0,
    agentTopSourceChoiceShortcutScore: 0,
    agentSourceSearchShortcutScore: 0,
    agentBrowserNeedScore: 0,
    agentBrowserHtmlScore: 0,
    agentReadabilityReasonScore: 0,
    agentSourceSearchProvenanceScore: 0,
    agentRecommendedMetadataScore: 0,
    agentCanContinueScore: 0,
    agentPrimaryExecutionScore: 0,
    agentPrimaryShortcutScore: 0,
    agentAlternativeActionShortcutScore: 0,
    agentExecutorShortcutScore: 0,
    agentHandoffShortcutScore: 0,
    agentAnswerShortcutScore: 0,
    agentPlanShortcutScore: 0,
    agentCitationScore: 0,
    agentTopCitationShortcutScore: 0,
    agentAnswerPlanScore: 0,
    agentAnswerEvidenceScore: 0,
    agentActionListScore: 0,
    agentTopActionShortcutScore: 0,
    agentSearchDecisionScore: 0,
    agentPageDecisionScore: 0,
    agentSemanticSummaryScore: 0,
    agentBarrierShortcutScore: 0,
    agentStructuredShortcutScore: 0,
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
      hiddenSignalCount: 0,
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
  agent?: { primaryAction?: CliActionShape; actions?: CliActionShape[] };
  pageCheck?: { recommendedAction?: CliActionShape; nextSteps?: CliActionShape[] };
  suggestedActions?: CliActionShape[];
  verification?: { recommendedAction?: CliActionShape };
}): CliActionShape[] {
  return [
    item.agent?.primaryAction,
    ...(item.agent?.actions ?? []),
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

export function scoreActionSchema(actions: CliActionShape[]): number {
  if (actions.length === 0) return 0;
  const validCount = actions.filter((action) => isExecutableActionSchema(action)).length;
  return roundScore(validCount / actions.length);
}

function isExecutableActionSchema(action: CliActionShape): boolean {
  if (!hasValidActionProvenance(action)) return false;
  if (!hasValidActionPriority(action)) return false;
  if (!hasValidSourceLinkRef(action)) return false;
  return hasValidActionExecutionFields(action);
}

function hasValidActionProvenance(action: CliActionShape): boolean {
  if (typeof action.source !== "undefined" && (typeof action.source !== "string" || action.source.length === 0)) return false;
  if (typeof action.path !== "undefined" && (typeof action.path !== "string" || action.path.length === 0)) return false;
  if (typeof action.index !== "undefined" && typeof action.index !== "number") return false;
  return true;
}

function hasValidActionPriority(action: CliActionShape): boolean {
  return (action.priority === "low" || action.priority === "medium" || action.priority === "high")
    && typeof action.priorityReason === "string"
    && action.priorityReason.length > 0;
}

function hasValidSourceLinkRef(action: CliActionShape): boolean {
  if (typeof action.sourceLinkRef === "undefined") return true;
  return action.action === "open-source-link"
    && normalizedActionExecution(action) === "run-command"
    && /^pageCheck\.sourceLinks\[\d+\]$/.test(action.sourceLinkRef);
}

function hasValidActionExecutionFields(action: CliActionShape): boolean {
  const execution = normalizedActionExecution(action);
  if (execution === "run-command") return Array.isArray(action.commandArgs) && action.commandArgs.length > 0;
  if (execution === "read-current") return Boolean(action.readFrom);
  if (execution === "interact-browser") return action.requiresBrowserInteraction === true || action.action === "inspect-browser-state";
  if (execution === "inspect-output") return !action.command;
  return false;
}

function scoreSearchResultActions(results: CliSearchResultShape[]): number {
  if (results.length === 0) return 1;
  const runnableCount = results.filter((result) => {
    return typeof result.id === "string"
      && result.id.length > 0
      && typeof result.path === "string"
      && result.path.length > 0
      && typeof result.openResult !== "undefined"
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

function scoreAgentContract(contract: { version?: number; features?: unknown[]; compact?: boolean; featureCount?: number } | undefined): number {
  if (!contract || contract.version !== 1) return 0;
  const required = [
    "next.loop",
    "next.readTarget",
    "next.readValue",
    "next.target",
    "runbook",
    "executor",
    "handoff",
    "handoff.answerEvidence",
    "handoff.choices",
    "handoff.sourceSearch",
    "handoff.quality",
    "executionPlan",
    "citations",
    "answerPlan",
    "answerEvidence",
    "verification.queries",
    "searchDecision",
    "choice.counts",
    "evidence.counts",
    "signal.counts",
    "quality.shortcuts",
    "resultChoices",
    "sourceChoices",
    "formChoices",
    "actionTargetChoices",
    "sourceSearch.shortcuts",
    "pageDecision",
    "pageMetadata.shortcuts",
    "semanticSummary",
    "readTargets",
    "action.sourceLinkRef",
    "actions",
    "signals",
    "qualityGates",
    "expectedOutcome",
    "responseMetadata",
    "hiddenSignal.shortcuts",
    "afterInteractionCommand",
    "browserHtml",
    "primaryActionShortcuts",
    "alternativeActionShortcuts",
    "barrierShortcuts",
  ];
  if (contract.compact === true && typeof contract.featureCount === "number") {
    return contract.featureCount >= required.length ? 1 : 0;
  }
  if (!Array.isArray(contract.features)) return 0;
  const features = new Set(contract.features.filter((feature): feature is string => typeof feature === "string"));
  return required.every((feature) => features.has(feature)) ? 1 : 0;
}

function scoreAgentCitations(
  citations: CliAgentCitationShape[],
  envelope: unknown,
  answerPlan: CliAgentAnswerPlanShape | undefined,
  primaryAction: CliActionShape | undefined,
  needsBrowserHtml: boolean | undefined,
): number {
  if (citations.length === 0) {
    return answerPlan?.status === "blocked"
      || needsBrowserHtml === true
      || primaryAction?.action === "retry-with-browser-html"
      ? 1
      : 0;
  }
  const validKinds = new Set(["content", "verification", "search-result", "source-link", "page-check"]);
  const validCount = citations.filter((citation) => {
    const hasReference = typeof citation.id === "string"
      && citation.id.length > 0
      && typeof citation.path === "string"
      && citation.path.length > 0
      && pathExists(envelope, citation.path);
    const hasResolvedPayload = citation.path ? pathHasCitationPayload(envelope, citation.path) : false;
    const hasPayload = typeof citation.text === "string"
      || typeof citation.title === "string"
      || typeof citation.url === "string"
      || hasResolvedPayload;
    const hasValidScore = typeof citation.score === "undefined"
      || (typeof citation.score === "number" && citation.score >= 0 && citation.score <= 1);
    const hasValidConfidence = citation.confidence === "low" || citation.confidence === "medium" || citation.confidence === "high";
    const hasReason = (typeof citation.reason === "string" && citation.reason.length > 0) || hasResolvedPayload;
    return hasReference
      && validKinds.has(String(citation.kind))
      && hasPayload
      && hasValidScore
      && hasValidConfidence
      && hasReason;
  }).length;
  return roundScore(validCount / citations.length);
}

function scoreAgentAnswerPlan(
  answerPlan: CliAgentAnswerPlanShape | undefined,
  citations: CliAgentCitationShape[],
  primaryAction: CliActionShape | undefined,
  needsBrowserHtml: boolean | undefined,
): number {
  if (!answerPlan) return 0;
  const validStatus = answerPlan.status === expectedAgentAnswerPlanStatus(answerPlan, primaryAction, needsBrowserHtml);
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
  const validAfterInteractionCommand = typeof primaryAction?.afterInteractionCommand === "string"
    ? answerPlan.afterInteractionCommand === primaryAction.afterInteractionCommand
    : typeof answerPlan.afterInteractionCommand === "undefined";
  const validAfterInteractionCommandArgs = Array.isArray(primaryAction?.afterInteractionCommandArgs)
    ? JSON.stringify(answerPlan.afterInteractionCommandArgs) === JSON.stringify(primaryAction.afterInteractionCommandArgs)
    : typeof answerPlan.afterInteractionCommandArgs === "undefined";
  const validUrl = typeof primaryAction?.url === "string"
    ? resolvedAgentUrl(answerPlan, primaryAction) === primaryAction.url
    : typeof answerPlan.url === "undefined";
  const validReadFrom = typeof primaryAction?.readFrom === "string"
    ? answerPlan.readFrom === primaryAction.readFrom
    : typeof answerPlan.readFrom === "undefined";
  return validStatus && validConfidence && validReason && validGaps && validCitations && validNextAction && validCommand && validCommandArgs && validAfterInteractionCommand && validAfterInteractionCommandArgs && validUrl && validReadFrom ? 1 : 0;
}

function resolvedAgentUrl(item: { url?: string; urlRef?: string } | undefined, primaryAction?: CliActionShape): string | undefined {
  if (!item) return undefined;
  if (typeof item.url === "string") return item.url;
  if (item.urlRef === "agent.primaryUrl") return primaryAction?.url;
  return undefined;
}

function sameAgentUrl(left: { url?: string; urlRef?: string } | undefined, right: { url?: string; urlRef?: string } | undefined): boolean {
  if (left?.urlRef && right?.urlRef) return left.urlRef === right.urlRef;
  return left?.url === right?.url;
}

function sameAgentBrowserHtml(
  left: CliAgentBrowserHtmlShape | undefined,
  right: CliAgentBrowserHtmlShape | undefined,
): boolean {
  if (!left || !right) return false;
  return (!right.url || left.url === right.url)
    && (!right.htmlFile || left.htmlFile === right.htmlFile)
    && (!right.captureScript || left.captureScript === right.captureScript)
    && (!right.afterInteractionCommand || left.afterInteractionCommand === right.afterInteractionCommand)
    && (!right.afterInteractionCommandArgs
      || JSON.stringify(left.afterInteractionCommandArgs) === JSON.stringify(right.afterInteractionCommandArgs));
}

function scoreAgentAnswerEvidence(
  answerEvidence: CliAgentCitationShape[],
  answerPlan: CliAgentAnswerPlanShape | undefined,
  citations: CliAgentCitationShape[],
): number {
  const ids = Array.isArray(answerPlan?.useCitationIds)
    ? answerPlan.useCitationIds.filter((id): id is string => typeof id === "string")
    : [];
  if (ids.length === 0) return answerEvidence.length === 0 ? 1 : 0.5;
  const citationById = new Map(citations.map((citation) => [citation.id, citation]));
  if (answerEvidence.length !== ids.length) return 0;
  const validCount = answerEvidence.filter((evidence, index) => {
    const id = ids[index];
    const source = id ? citationById.get(id) : undefined;
    return source
      && evidence.id === source.id
      && evidence.path === source.path
      && evidence.kind === source.kind;
  }).length;
  return roundScore(validCount / ids.length);
}

function pathHasCitationPayload(value: unknown, path: string): boolean {
  const target = valueAtPath(value, path);
  if (Array.isArray(target)) return target.some((item) => citationPayloadRecord(item));
  return citationPayloadRecord(target);
}

function citationPayloadRecord(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const record = target as Record<string, unknown>;
  return typeof record.text === "string"
    || typeof record.title === "string"
    || typeof record.url === "string"
    || typeof record.value === "string";
}

function valueAtPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!part) return undefined;
    const match = /^([^\[]+)(?:\[(\d+)\])?$/.exec(part);
    if (!match) return undefined;
    const key = match[1];
    if (!key) return undefined;
    const index = match[2] === undefined ? undefined : Number(match[2]);
    if (current === null || typeof current !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
    if (index !== undefined) {
      if (!Array.isArray(current) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    }
  }
  return current;
}

function expectedAgentAnswerPlanStatus(
  answerPlan: CliAgentAnswerPlanShape,
  primaryAction: CliActionShape | undefined,
  needsBrowserHtml: boolean | undefined,
): NonNullable<CliAgentAnswerPlanShape["status"]> {
  if (needsBrowserHtml === true || primaryAction?.action === "retry-with-browser-html") return "blocked";
  const execution = primaryAction ? normalizedActionExecution(primaryAction) : "unknown";
  if (execution === "run-command") return "needs-more";
  if (execution === "read-current") return "ready";
  if (execution === "interact-browser") return "needs-more";
  if (answerPlan.status === "ready" || answerPlan.status === "needs-more" || answerPlan.status === "blocked" || answerPlan.status === "error") return answerPlan.status;
  return "error";
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
    "priority",
    "priorityReason",
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
      if (field === "url"
        ? resolvedAgentUrl(next, primaryAction) === expected
        : JSON.stringify(actual) === JSON.stringify(expected)) matched += 1;
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
    if (next.readValue?.path === primaryAction.readFrom && (typeof next.readValue.value !== "undefined" || next.readValue.valuePath === primaryAction.readFrom)) matched += 1;
  } else if (typeof next.readTarget !== "undefined") {
    required += 1;
  } else if (typeof next.readValue !== "undefined") {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentNextShortcuts(agent: {
  next?: CliAgentNextShape;
  nextActionName?: string;
  nextExecution?: ActionExecution;
  nextCommand?: string;
  nextCommandArgs?: string[];
  nextAfterInteractionCommand?: string;
  nextAfterInteractionCommandArgs?: string[];
  nextReadFrom?: string;
  nextUrl?: string;
} | undefined): number {
  const next = agent?.next;
  if (!next) return 0;
  let required = 2;
  let matched = 0;
  if (next.action) {
    if (agent.nextActionName === next.action) matched += 1;
  } else if (typeof agent.nextActionName === "undefined") {
    matched += 1;
  }
  if (next.execution) {
    if (agent.nextExecution === next.execution) matched += 1;
  } else if (typeof agent.nextExecution === "undefined") {
    matched += 1;
  }
  if (next.command) {
    required += 1;
    if (agent.nextCommand === next.command) matched += 1;
  } else if (agent.nextCommand) {
    required += 1;
  }
  if (next.commandArgs) {
    required += 1;
    if (JSON.stringify(agent.nextCommandArgs) === JSON.stringify(next.commandArgs)) matched += 1;
  } else if (agent.nextCommandArgs) {
    required += 1;
  }
  if (next.afterInteractionCommand) {
    required += 1;
    if (agent.nextAfterInteractionCommand === next.afterInteractionCommand) matched += 1;
  } else if (agent.nextAfterInteractionCommand) {
    required += 1;
  }
  if (next.afterInteractionCommandArgs) {
    required += 1;
    if (JSON.stringify(agent.nextAfterInteractionCommandArgs) === JSON.stringify(next.afterInteractionCommandArgs)) matched += 1;
  } else if (agent.nextAfterInteractionCommandArgs) {
    required += 1;
  }
  if (next.readFrom) {
    required += 1;
    if (agent.nextReadFrom === next.readFrom) matched += 1;
  } else if (agent.nextReadFrom) {
    required += 1;
  }
  if (next.url || next.urlRef) {
    required += 1;
    if (agent.nextUrl === next.url || agent.nextUrl === next.urlRef) matched += 1;
  } else if (agent.nextUrl) {
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

function scoreAgentRunbook(
  runbook: CliAgentRunbookShape | undefined,
  next: CliAgentNextShape | undefined,
  plan: CliAgentExecutionPlanShape | undefined,
  answerPlan: CliAgentAnswerPlanShape | undefined,
): number {
  if (!runbook || !next?.loop || !plan) return 0;
  let required = 14;
  let matched = 0;
  if (runbook.decision === next.loop.decision) matched += 1;
  if (runbook.mode === next.mode) matched += 1;
  if (runbook.operation === plan.operation) matched += 1;
  if (runbook.action === next.action) matched += 1;
  if (typeof runbook.reason === "string" && runbook.reason.length > 0) matched += 1;
  if (runbook.confidence === plan.confidence) matched += 1;
  if (runbook.answerStatus === answerPlan?.status) matched += 1;
  if (runbook.answerReady === plan.answerReady) matched += 1;
  if (runbook.shouldContinue === next.loop.shouldContinue) matched += 1;
  if (runbook.terminal === next.loop.terminal) matched += 1;
  if (runbook.maxSuggestedIterations === next.loop.maxSuggestedIterations) matched += 1;
  if (runbook.useFetchedHtml === plan.useFetchedHtml) matched += 1;
  if (runbook.needsBrowserHtml === plan.needsBrowserHtml) matched += 1;
  if (runbook.expectedOutcome === plan.expectedOutcome) matched += 1;
  if (next.commandArgs) {
    required += 1;
    if (JSON.stringify(runbook.commandArgs) === JSON.stringify(next.commandArgs)) matched += 1;
  }
  if (next.readFrom) {
    required += 2;
    if (runbook.readFrom === next.readFrom) matched += 1;
    if (runbook.readValue?.path === next.readValue?.path) matched += 1;
  }
  if (next.browserHtml) {
    required += 1;
    if (JSON.stringify(runbook.browserHtml) === JSON.stringify(next.browserHtml)) matched += 1;
  }
  if (next.target) {
    required += 1;
    if (runbook.target?.url === next.target.url) matched += 1;
  }
  if (next.url || next.urlRef) {
    required += 1;
    if (sameAgentUrl(runbook, next)) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentRunbookShortcuts(agent: {
  runbook?: CliAgentRunbookShape;
  runbookDecision?: CliAgentRunbookShape["decision"];
  runbookMode?: CliAgentRunbookShape["mode"];
  runbookOperation?: CliAgentRunbookShape["operation"];
  runbookActionName?: string;
  runbookReason?: string;
  runbookConfidence?: CliAgentRunbookShape["confidence"];
  runbookAnswerStatus?: CliAgentRunbookShape["answerStatus"];
  runbookAnswerReady?: boolean;
  runbookShouldContinue?: boolean;
  runbookTerminal?: boolean;
  runbookMaxSuggestedIterations?: number;
  runbookExpectedOutcome?: CliAgentRunbookShape["expectedOutcome"];
  runbookReadFrom?: string;
  runbookCommandArgs?: string[];
  runbookUrl?: string;
} | undefined): number {
  const runbook = agent?.runbook;
  if (!runbook) return 0;
  let required = 11;
  let matched = 0;
  if (agent.runbookDecision === runbook.decision) matched += 1;
  if (agent.runbookMode === runbook.mode) matched += 1;
  if (agent.runbookOperation === runbook.operation) matched += 1;
  if (agent.runbookReason === runbook.reason) matched += 1;
  if (agent.runbookConfidence === runbook.confidence) matched += 1;
  if (agent.runbookAnswerStatus === runbook.answerStatus) matched += 1;
  if (agent.runbookAnswerReady === runbook.answerReady) matched += 1;
  if (agent.runbookShouldContinue === runbook.shouldContinue) matched += 1;
  if (agent.runbookTerminal === runbook.terminal) matched += 1;
  if (agent.runbookMaxSuggestedIterations === runbook.maxSuggestedIterations) matched += 1;
  if (agent.runbookExpectedOutcome === runbook.expectedOutcome) matched += 1;
  if (runbook.action) {
    required += 1;
    if (agent.runbookActionName === runbook.action) matched += 1;
  } else if (agent.runbookActionName) {
    required += 1;
  }
  if (runbook.readFrom) {
    required += 1;
    if (agent.runbookReadFrom === runbook.readFrom) matched += 1;
  } else if (agent.runbookReadFrom) {
    required += 1;
  }
  if (runbook.commandArgs) {
    required += 1;
    if (JSON.stringify(agent.runbookCommandArgs) === JSON.stringify(runbook.commandArgs)) matched += 1;
  } else if (agent.runbookCommandArgs) {
    required += 1;
  }
  if (runbook.url || runbook.urlRef) {
    required += 1;
    if (agent.runbookUrl === runbook.url || agent.runbookUrl === runbook.urlRef) matched += 1;
  } else if (agent.runbookUrl) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentExecutorStep(
  executor: CliAgentExecutorShape | undefined,
  next: CliAgentNextShape | undefined,
  plan: CliAgentExecutionPlanShape | undefined,
  answerPlan: CliAgentAnswerPlanShape | undefined,
): number {
  if (!executor || !next?.loop || !plan || !answerPlan) return 0;
  let required = 12;
  let matched = 0;
  if (typeof executor.instruction === "string" && executor.instruction.length > 0) matched += 1;
  if (executor.decision === next.loop.decision) matched += 1;
  if (executor.mode === next.mode) matched += 1;
  if (executor.operation === plan.operation) matched += 1;
  if (executor.action === next.action) matched += 1;
  if (executor.status === answerPlan.status) matched += 1;
  if (executor.confidence === plan.confidence) matched += 1;
  if (executor.answerReady === plan.answerReady) matched += 1;
  if (executor.shouldContinue === next.loop.shouldContinue) matched += 1;
  if (executor.terminal === next.loop.terminal) matched += 1;
  if (executor.maxSuggestedIterations === next.loop.maxSuggestedIterations) matched += 1;
  if (executor.expectedOutcome === plan.expectedOutcome) matched += 1;
  if (answerPlan.useCitationIds && answerPlan.useCitationIds.length > 0) {
    required += 1;
    if (JSON.stringify(executor.useCitationIds) === JSON.stringify(answerPlan.useCitationIds)) matched += 1;
  }
  if (next.commandArgs) {
    required += 1;
    if (JSON.stringify(executor.commandArgs) === JSON.stringify(next.commandArgs)) matched += 1;
  }
  if (next.afterInteractionCommandArgs) {
    required += 1;
    if (JSON.stringify(executor.afterInteractionCommandArgs) === JSON.stringify(next.afterInteractionCommandArgs)) matched += 1;
  }
  if (next.readFrom) {
    required += 3;
    if (executor.readFrom === next.readFrom) matched += 1;
    if (executor.readTarget?.path === next.readTarget?.path) matched += 1;
    if (executor.readValue?.path === next.readValue?.path) matched += 1;
  }
  if (next.url || next.urlRef) {
    required += 1;
    if (sameAgentUrl(executor, next)) matched += 1;
  }
  if (next.target) {
    required += 1;
    if (executor.target?.url === next.target.url) matched += 1;
  }
  if (next.browserHtml) {
    required += 1;
    if (JSON.stringify(executor.browserHtml) === JSON.stringify(next.browserHtml)) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreBriefAgentExecutorEnvelope(envelope: unknown): number {
  const item = envelope as {
    agent?: {
      contract?: { profile?: string; compact?: boolean };
      status?: string;
      needsBrowserHtml?: boolean;
      executor?: CliAgentExecutorShape;
      handoff?: CliAgentHandoffShape;
      primaryAction?: CliActionShape;
      next?: unknown;
      runbook?: unknown;
      executionPlan?: unknown;
      actions?: unknown;
    };
  };
  const agent = item.agent;
  const executor = agent?.executor;
  const handoff = agent?.handoff;
  if (!agent || !executor || !handoff) return 0;
  let required = 14;
  let matched = 0;
  if (agent.contract?.profile === "brief" && agent.contract.compact === true) matched += 1;
  if (typeof agent.next === "undefined") matched += 1;
  if (typeof agent.runbook === "undefined") matched += 1;
  if (typeof agent.executionPlan === "undefined") matched += 1;
  if (typeof agent.actions === "undefined") matched += 1;
  if (typeof executor.instruction === "string" && executor.instruction.length > 0) matched += 1;
  if (executor.decision === handoff.decision) matched += 1;
  if (executor.operation === handoff.operation) matched += 1;
  if (executor.action === handoff.action) matched += 1;
  if (executor.status === handoff.answerStatus) matched += 1;
  if (executor.answerReady === handoff.answerReady) matched += 1;
  if (executor.shouldContinue === handoff.shouldContinue) matched += 1;
  if (executor.terminal === handoff.terminal) matched += 1;
  if (executor.expectedOutcome === handoff.expectedOutcome) matched += 1;
  if (handoff.mode) {
    required += 1;
    if (executor.mode === handoff.mode) matched += 1;
  }
  if (typeof handoff.maxSuggestedIterations === "number") {
    required += 1;
    if (executor.maxSuggestedIterations === handoff.maxSuggestedIterations) matched += 1;
  }
  if (handoff.priority) {
    required += 1;
    if (handoff.priority === agent.primaryAction?.priority) matched += 1;
  }
  if (handoff.reason) {
    required += 1;
    if (typeof handoff.reason === "string" && handoff.reason.length > 0) matched += 1;
  }
  if (handoff.commandArgs) {
    required += 1;
    if (JSON.stringify(executor.commandArgs) === JSON.stringify(handoff.commandArgs)) matched += 1;
  }
  if (handoff.afterInteractionCommandArgs) {
    required += 1;
    if (JSON.stringify(executor.afterInteractionCommandArgs) === JSON.stringify(handoff.afterInteractionCommandArgs)) matched += 1;
  }
  if (handoff.readFrom) {
    required += 3;
    if (executor.readFrom === handoff.readFrom) matched += 1;
    if (executor.readValue?.path === handoff.readValue?.path) matched += 1;
    if (scoreHandoffReadValueDetails(handoff.readFrom, handoff.readValue) === 1) matched += 1;
  }
  if (handoff.url || handoff.urlRef) {
    required += 1;
    if (sameAgentUrl(executor, handoff)) matched += 1;
  }
  if (handoff.target) {
    required += 1;
    if (executor.target?.url === handoff.target.url) matched += 1;
  }
  if (handoff.browserHtml) {
    required += 1;
    if (sameAgentBrowserHtml(executor.browserHtml, handoff.browserHtml)) matched += 1;
  }
  if (agent.primaryAction) {
    required += 2;
    if (executor.action === agent.primaryAction.action) matched += 1;
    if (JSON.stringify(executor.commandArgs) === JSON.stringify(agent.primaryAction.commandArgs)) matched += 1;
  }
  if (Array.isArray(handoff.resultChoices) && handoff.resultChoices.length > 0) {
    required += 1;
    if (handoff.resultChoices.some((choice) => Array.isArray(choice.commandArgs))) matched += 1;
  }
  if (Array.isArray(handoff.sourceChoices) && handoff.sourceChoices.length > 0) {
    required += 1;
    if (handoff.sourceChoices.some((choice) => choice.url === agent.primaryAction?.url)) matched += 1;
  }
  if (agent.status === "error" || agent.needsBrowserHtml === true) {
    required += 2;
    if (scoreBriefHandoffSignals(handoff.signals) === 1) matched += 1;
    if (scoreBriefHandoffQualityGates(handoff.qualityGates, agent.needsBrowserHtml === true) === 1) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreBriefHandoffSignals(signals: unknown[] | undefined): number {
  if (!Array.isArray(signals) || signals.length === 0) return 0;
  const valid = signals.filter((signal): signal is CliAgentSignalShape => Boolean(signal) && typeof signal === "object");
  return valid.some((signal) => signal.kind === "diagnostic" && signal.severity === "error")
    && valid.every((signal) => typeof signal.message === "string" && signal.message.length > 0)
    ? 1
    : 0;
}

function scoreBriefHandoffQualityGates(gates: unknown[] | undefined, needsBrowserHtml: boolean): number {
  if (!Array.isArray(gates) || gates.length === 0) return 0;
  const valid = gates.filter((gate): gate is CliAgentQualityGateShape => Boolean(gate) && typeof gate === "object");
  const hasFetchFailure = valid.some((gate) => gate.kind === "fetch" && gate.pass === false && gate.severity === "error");
  const hasBrowserGate = valid.some((gate) => gate.kind === "browser" && gate.pass === !needsBrowserHtml);
  return hasFetchFailure && hasBrowserGate ? 1 : 0;
}

function scoreHandoffReadValueDetails(readFrom: string | undefined, readValue: { path?: string; value?: unknown } | undefined): number {
  if (!readFrom || !readValue) return 0;
  if (readFrom !== "pageCheck.forms" && readFrom !== "pageCheck.actionTargets") return 1;
  if (readValue.path !== readFrom || !Array.isArray(readValue.value) || readValue.value.length === 0) return 0;
  const items = readValue.value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (items.length === 0) return 0;
  if (readFrom === "pageCheck.forms") {
    return items.some((item) => {
      const fields = item.fields;
      return typeof item.path === "string"
        && (typeof item.actionUrl === "string" || typeof item.urlTemplate === "string")
        && Array.isArray(fields)
        && fields.some((field) => Boolean(field) && typeof field === "object" && typeof (field as Record<string, unknown>).name === "string");
    }) ? 1 : 0;
  }
  return items.some((item) => {
    return typeof item.path === "string"
      && typeof item.kind === "string"
      && typeof item.name === "string"
      && (typeof item.targetUrl === "string" || typeof item.urlTemplate === "string");
  }) ? 1 : 0;
}

function scoreAgentHandoff(
  handoff: CliAgentHandoffShape | undefined,
  next: CliAgentNextShape | undefined,
  plan: CliAgentExecutionPlanShape | undefined,
  answerPlan: CliAgentAnswerPlanShape | undefined,
  answerEvidence: CliAgentCitationShape[] = [],
  resultChoices: CliAgentResultChoiceShape[] = [],
  sourceChoices: CliAgentSourceChoiceShape[] = [],
  sourceSearch?: unknown,
  signals: unknown[] = [],
  qualityGates: unknown[] = [],
  verificationFoundQueries: unknown[] = [],
  verificationMissingQueries: unknown[] = [],
): number {
  if (!handoff || !next?.loop || !plan || !answerPlan) return 0;
  let required = 14;
  let matched = 0;
  if (typeof handoff.instruction === "string" && handoff.instruction.length > 0) matched += 1;
  if (handoff.decision === next.loop.decision) matched += 1;
  if (handoff.mode === next.mode) matched += 1;
  if (handoff.operation === plan.operation) matched += 1;
  if (handoff.action === next.action) matched += 1;
  if (handoff.confidence === plan.confidence) matched += 1;
  if (handoff.priority === next.priority) matched += 1;
  if (handoff.answerStatus === answerPlan.status) matched += 1;
  if (handoff.answerReady === plan.answerReady) matched += 1;
  if (handoff.shouldContinue === next.loop.shouldContinue) matched += 1;
  if (handoff.terminal === next.loop.terminal) matched += 1;
  if (handoff.maxSuggestedIterations === next.loop.maxSuggestedIterations) matched += 1;
  if (handoff.expectedOutcome === plan.expectedOutcome) matched += 1;
  if (typeof handoff.reason === "string" && handoff.reason.length > 0) matched += 1;
  if (next.priorityReason) {
    required += 1;
    if (handoff.priorityReason === next.priorityReason) matched += 1;
  }
  if (answerPlan.useCitationIds && answerPlan.useCitationIds.length > 0) {
    required += 2;
    if (JSON.stringify(handoff.useCitationIds) === JSON.stringify(answerPlan.useCitationIds)) matched += 1;
    if (scoreHandoffAnswerEvidence(handoff.answerEvidence, answerEvidence) === 1) matched += 1;
  }
  if (verificationFoundQueries.length > 0) {
    required += 1;
    if (JSON.stringify(handoff.verificationFoundQueries) === JSON.stringify(verificationFoundQueries)) matched += 1;
  }
  if (verificationMissingQueries.length > 0) {
    required += 1;
    if (JSON.stringify(handoff.verificationMissingQueries) === JSON.stringify(verificationMissingQueries)) matched += 1;
  }
  if (resultChoices.length > 0) {
    required += 1;
    if (JSON.stringify(handoff.resultChoices) === JSON.stringify(resultChoices)) matched += 1;
  }
  if (sourceChoices.length > 0) {
    required += 1;
    if (scoreHandoffSourceChoices(handoff.sourceChoices, sourceChoices) === 1) matched += 1;
  }
  if (sourceSearch) {
    required += 1;
    if (JSON.stringify(handoff.sourceSearch) === JSON.stringify(sourceSearch)) matched += 1;
  }
  if (signals.length > 0) {
    required += 1;
    if (JSON.stringify(handoff.signals) === JSON.stringify(signals) || typeof handoff.signals === "undefined") matched += 1;
  }
  if (qualityGates.length > 0) {
    required += 1;
    if (JSON.stringify(handoff.qualityGates) === JSON.stringify(qualityGates) || typeof handoff.qualityGates === "undefined") matched += 1;
  }
  if (next.command) {
    required += 2;
    if (handoff.command === next.command) matched += 1;
    if (JSON.stringify(handoff.commandArgs) === JSON.stringify(next.commandArgs)) matched += 1;
  }
  if (next.afterInteractionCommand) {
    required += 2;
    if (handoff.afterInteractionCommand === next.afterInteractionCommand) matched += 1;
    if (JSON.stringify(handoff.afterInteractionCommandArgs) === JSON.stringify(next.afterInteractionCommandArgs)) matched += 1;
  }
  if (next.readFrom) {
    required += 4;
    if (handoff.readFrom === next.readFrom) matched += 1;
    if (handoff.readTarget?.path === next.readTarget?.path) matched += 1;
    if (handoff.readValue?.path === next.readValue?.path) matched += 1;
    if (scoreHandoffReadValueDetails(handoff.readFrom, handoff.readValue) === 1) matched += 1;
    if (hasSmallInlineReadValue(next.readValue)) {
      required += 1;
      if (JSON.stringify(handoff.readValue?.value) === JSON.stringify(next.readValue?.value)) matched += 1;
    }
  }
  if (next.url || next.urlRef) {
    required += 1;
    if (sameAgentUrl(handoff, next)) matched += 1;
  }
  if (next.target) {
    required += 1;
    if (handoff.target?.url === next.target.url) matched += 1;
  }
  if (next.browserHtml) {
    required += 1;
    if (JSON.stringify(handoff.browserHtml) === JSON.stringify(next.browserHtml)) matched += 1;
  }
  return roundScore(matched / required);
}

function hasSmallInlineReadValue(readValue: CliAgentNextShape["readValue"]): boolean {
  if (!readValue || typeof readValue.value === "undefined") return false;
  return JSON.stringify(readValue.value).length <= 1_000;
}

function scoreHandoffAnswerEvidence(handoffEvidence: CliAgentCitationShape[] | undefined, answerEvidence: CliAgentCitationShape[]): number {
  if (!Array.isArray(handoffEvidence)) return 1;
  if (handoffEvidence.length !== answerEvidence.length) return 0;
  const valid = handoffEvidence.every((item, index) => {
    const expected = answerEvidence[index];
    return expected
      && item.id === expected.id
      && item.path === expected.path
      && item.kind === expected.kind
      && item.confidence === expected.confidence;
  });
  return valid ? 1 : 0;
}

function scoreHandoffSourceChoices(handoffChoices: CliAgentSourceChoiceShape[] | undefined, sourceChoices: CliAgentSourceChoiceShape[]): number {
  if (!Array.isArray(handoffChoices)) return sourceChoices.length === 0 ? 1 : 0;
  if (handoffChoices.length !== sourceChoices.length) return 0;
  const valid = handoffChoices.every((choice, index) => {
    const expected = sourceChoices[index];
    return expected
      && choice.id === expected.id
      && choice.path === expected.path
      && choice.rank === expected.rank
      && (typeof choice.title === "undefined" || choice.title === expected.title)
      && (typeof choice.url === "undefined" || choice.url === expected.url)
      && (typeof expected.text !== "string" || choice.text === expected.text)
      && (typeof expected.snippet !== "string" || choice.snippet === expected.snippet)
      && (typeof expected.selector !== "string" || choice.selector === expected.selector);
  });
  return valid ? 1 : 0;
}

function scoreAgentExecutionPlan(
  plan: CliAgentExecutionPlanShape | undefined,
  next: CliAgentNextShape | undefined,
  answerPlan: CliAgentAnswerPlanShape | undefined,
  canUseFetchedHtml: boolean | undefined,
  needsBrowserHtml: boolean | undefined,
  expectedOutcome: CliAgentExpectedOutcomeShape | undefined,
): number {
  if (!plan || !next?.loop) return 0;
  let required = 10;
  let matched = 0;
  if (plan.operation === expectedExecutionPlanOperation(next)) matched += 1;
  if (plan.confidence === "low" || plan.confidence === "medium" || plan.confidence === "high") matched += 1;
  if (typeof plan.reason === "string" && plan.reason.length > 0) matched += 1;
  if (plan.useFetchedHtml === canUseFetchedHtml) matched += 1;
  if (plan.needsBrowserHtml === needsBrowserHtml) matched += 1;
  if (plan.answerReady === (answerPlan?.status === "ready")) matched += 1;
  if (plan.terminal === next.loop.terminal) matched += 1;
  if (plan.shouldContinue === next.loop.shouldContinue) matched += 1;
  if (plan.maxSuggestedIterations === next.loop.maxSuggestedIterations) matched += 1;
  if (plan.expectedOutcome === expectedOutcome?.kind) matched += 1;
  if (next.readFrom) {
    required += 1;
    if (plan.readFrom === next.readFrom) matched += 1;
  }
  if (next.command) {
    required += 2;
    if (plan.command === next.command) matched += 1;
    if (JSON.stringify(plan.commandArgs) === JSON.stringify(next.commandArgs)) matched += 1;
  }
  if (next.afterInteractionCommand) {
    required += 2;
    if (plan.afterInteractionCommand === next.afterInteractionCommand) matched += 1;
    if (JSON.stringify(plan.afterInteractionCommandArgs) === JSON.stringify(next.afterInteractionCommandArgs)) matched += 1;
  }
  if (next.url || next.urlRef) {
    required += 1;
    if (sameAgentUrl(plan, next)) matched += 1;
  }
  return roundScore(matched / required);
}

function expectedExecutionPlanOperation(next: CliAgentNextShape): NonNullable<CliAgentExecutionPlanShape["operation"]> {
  if (next.loop?.decision === "return") return "return";
  if (next.loop?.decision === "execute") return "execute-command";
  if (next.loop?.decision === "browser") return next.mode === "capture-html" ? "capture-browser-html" : "inspect-browser";
  if (next.loop?.decision === "inspect") return "inspect-output";
  return "stop";
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

function scoreAgentQualityGates(gates: CliAgentQualityGateShape[] | undefined, envelope: {
  kind?: string;
  diagnostics?: unknown[];
  agent?: { needsBrowserHtml?: boolean };
  pageCheck?: { contentEvidence?: unknown[]; sourceLinks?: unknown[] };
  searchResults?: unknown[];
  verification?: { requestedCount?: number };
}): number {
  if (!Array.isArray(gates) || gates.length === 0) return 0;
  const validKinds = new Set(["fetch", "content", "source", "search", "verification", "browser", "diagnostic", "status"]);
  const validSeverities = new Set(["info", "warning", "error"]);
  const wellFormed = gates.filter((gate) => {
    const hasMessage = typeof gate.message === "string" && gate.message.length > 0;
    const hasCompactEvidence = typeof gate.path === "string" && gate.path.length > 0 || typeof gate.score === "number";
    return typeof gate.kind === "string"
      && validKinds.has(gate.kind)
      && typeof gate.pass === "boolean"
      && typeof gate.severity === "string"
      && validSeverities.has(gate.severity)
      && (hasMessage || hasCompactEvidence)
      && (typeof gate.score === "undefined" || (typeof gate.score === "number" && gate.score >= 0 && gate.score <= 1))
      && (typeof gate.path === "undefined" || (typeof gate.path === "string" && gate.path.length > 0));
  }).length / gates.length;
  const kinds = new Set(gates.map((gate) => gate.kind));
  let required = 5;
  let matched = wellFormed > 0 ? wellFormed : 0;
  if (kinds.has("fetch")) matched += 1;
  if (kinds.has("content")) matched += 1;
  if (kinds.has("browser")) matched += 1;
  if (kinds.has("status")) matched += 1;
  const expectKind = (condition: boolean, kind: NonNullable<CliAgentQualityGateShape["kind"]>): void => {
    if (!condition) return;
    required += 1;
    if (kinds.has(kind)) matched += 1;
  };
  expectKind(envelope.kind === "search-results" || (envelope.searchResults?.length ?? 0) > 0, "search");
  expectKind((envelope.pageCheck?.sourceLinks?.length ?? 0) > 0, "source");
  expectKind((envelope.verification?.requestedCount ?? 0) > 0, "verification");
  expectKind((envelope.diagnostics?.length ?? 0) > 0, "diagnostic");
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
  if (primaryAction.action === "retry-later") return "retry-fetch";
  if (primaryAction.action === "open-result" || primaryAction.action === "open-alternate-result" || primaryAction.action === "open-source-link" || primaryAction.url) return "open-result";
  if (normalizedActionExecution(primaryAction) === "inspect-output") return "inspect-output";
  return "inspect-output";
}

function scorePageLinkCommands(
  primaryLinks: Array<{ id?: string; path?: string; selectionReason?: string; sourceScore?: number; url?: string; command?: string; commandArgs?: string[] }>,
  sourceLinks: Array<{ id?: string; path?: string; selectionReason?: string; sourceScore?: number; url?: string; command?: string; commandArgs?: string[] }>,
): number {
  const links = [...primaryLinks, ...sourceLinks];
  if (links.length === 0) return 1;
  const validCount = links.filter((link) => {
    return typeof link.id === "string"
      && link.id.length > 0
      && typeof link.path === "string"
      && link.path.length > 0
      && (Array.isArray(link.commandArgs) && link.commandArgs.length > 0
        || typeof link.url === "string" && link.url.length > 0)
      && (typeof link.selectionReason === "string" && link.selectionReason.length > 0
        || typeof link.sourceScore === "number");
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

function countHiddenPageCheckSignals(pageCheck: unknown): number {
  if (!pageCheck || typeof pageCheck !== "object") return 0;
  const record = pageCheck as Record<string, unknown>;
  return hiddenPageCheckPaths.reduce((total, path) => {
    const value = record[path];
    return total + (Array.isArray(value) ? value.length : 0);
  }, 0);
}

function countPageCheckArray(pageCheck: unknown, key: string): number {
  if (!pageCheck || typeof pageCheck !== "object") return 0;
  const value = (pageCheck as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
}

function scoreAgentHiddenSignals(pageCheck: unknown, readTargets: CliReadTargetShape[], envelope: unknown): number {
  if (!pageCheck || typeof pageCheck !== "object") return 1;
  const record = pageCheck as Record<string, unknown>;
  const presentPaths = hiddenPageCheckPaths.filter((path) => {
    const value = record[path];
    return Array.isArray(value) && value.length > 0;
  });
  if (presentPaths.length === 0) return 1;

  const payloadPathScore = average(presentPaths.map((path) => pathExists(envelope, `pageCheck.${path}`) ? 1 : 0));
  const readTargetPaths = new Set(readTargets.map((target) => target.path));
  const readTargetCoverage = presentPaths.some((path) => readTargetPaths.has(`pageCheck.${path}`)) ? 1 : 0;
  const reasons = Array.isArray((record.readability as { reasons?: unknown[] } | undefined)?.reasons)
    ? (record.readability as { reasons?: unknown[] }).reasons ?? []
    : [];
  const reasonText = reasons.filter((reason): reason is string => typeof reason === "string").join("\n").toLowerCase();
  const reasonCoverage = presentPaths.some((path) => reasonText.includes(hiddenSignalReasonNeedle(path))) ? 1 : 0;

  return roundScore(payloadPathScore * 0.5 + readTargetCoverage * 0.35 + reasonCoverage * 0.15);
}

function scoreAgentBrowserAdvantage(summary: CliAgentSummary): number {
  const hiddenSignalCount = summary.pageCheck.hiddenSignalCount;
  if (hiddenSignalCount === 0) return 1;
  return summary.agentHiddenSignalScore;
}

function hiddenSignalReasonNeedle(path: string): string {
  const labels: Record<string, string> = {
    apiEndpoints: "api endpoint",
    clientState: "client state",
    appHints: "app hint",
    mobileHints: "mobile hint",
    keyValues: "key-value",
    metaFacts: "meta fact",
    httpPolicies: "http polic",
    schemaFacts: "schema fact",
    contactPoints: "contact point",
    authorLinks: "author link",
  };
  return labels[path] ?? path.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/s$/, "");
}

function scoreAgentBestReadTarget(agent: {
  readTargets?: CliReadTargetShape[];
  bestReadTarget?: string;
  bestReadTargetCount?: number;
  bestReadTargetScore?: number;
  bestReadTargetPrimary?: boolean;
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
  if (typeof best.count === "number") {
    required += 1;
    if (agent?.bestReadTargetCount === best.count) matched += 1;
  } else if (typeof agent?.bestReadTargetCount === "number") {
    required += 1;
  }
  if (typeof best.score === "number") {
    required += 1;
    if (agent?.bestReadTargetScore === best.score) matched += 1;
  } else if (typeof agent?.bestReadTargetScore === "number") {
    required += 1;
  }
  if (typeof best.primary === "boolean") {
    required += 1;
    if (agent?.bestReadTargetPrimary === best.primary) matched += 1;
  } else if (typeof agent?.bestReadTargetPrimary === "boolean") {
    required += 1;
  }
  if (best.reason) {
    required += 1;
    if (agent?.bestReadTargetReason === best.reason) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentTopReadTargetShortcuts(agent: {
  readTargets?: CliReadTargetShape[];
  topReadTarget?: string;
  topReadTargetCount?: number;
  topReadTargetScore?: number;
  topReadTargetPrimary?: boolean;
  topReadTargetReason?: string;
} | undefined): number {
  const top = agent?.readTargets?.[0];
  if (!top) {
    return agent?.topReadTarget
      || typeof agent?.topReadTargetCount === "number"
      || typeof agent?.topReadTargetScore === "number"
      || typeof agent?.topReadTargetPrimary === "boolean"
      || agent?.topReadTargetReason ? 0 : 1;
  }
  let required = 1;
  let matched = agent?.topReadTarget === top.path ? 1 : 0;
  if (typeof top.count === "number") {
    required += 1;
    if (agent?.topReadTargetCount === top.count) matched += 1;
  } else if (typeof agent?.topReadTargetCount === "number") {
    required += 1;
  }
  if (typeof top.score === "number") {
    required += 1;
    if (agent?.topReadTargetScore === top.score) matched += 1;
  } else if (typeof agent?.topReadTargetScore === "number") {
    required += 1;
  }
  if (typeof top.primary === "boolean") {
    required += 1;
    if (agent?.topReadTargetPrimary === top.primary) matched += 1;
  } else if (typeof agent?.topReadTargetPrimary === "boolean") {
    required += 1;
  }
  if (top.reason) {
    required += 1;
    if (agent?.topReadTargetReason === top.reason) matched += 1;
  } else if (agent?.topReadTargetReason) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentDiagnosticCounts(agent: {
  diagnosticCodes?: unknown[];
  diagnosticErrorCount?: number;
  diagnosticWarningCount?: number;
  diagnosticInfoCount?: number;
  topDiagnosticCode?: string;
  topDiagnosticSeverity?: "info" | "warning" | "error";
  topDiagnosticMessage?: string;
  signals?: CliAgentSignalShape[];
} | undefined, diagnostics: Array<{ severity?: "info" | "warning" | "error"; code?: string; message?: string }>): number {
  if (diagnostics.length === 0 && Array.isArray(agent?.diagnosticCodes)) {
    const total = (agent?.diagnosticErrorCount ?? 0) + (agent?.diagnosticWarningCount ?? 0) + (agent?.diagnosticInfoCount ?? 0);
    return total === agent.diagnosticCodes.length ? 1 : 0;
  }
  const source = diagnostics.length > 0
    ? diagnostics
    : (agent?.signals ?? []).filter((signal) => signal.kind === "diagnostic");
  const counts = source.reduce((summary, diagnostic) => {
    if (diagnostic.severity === "error" || diagnostic.severity === "warning" || diagnostic.severity === "info") {
      summary[diagnostic.severity] += 1;
    }
    return summary;
  }, { error: 0, warning: 0, info: 0 });
  let required = 3;
  let matched = 0;
  if (agent?.diagnosticErrorCount === counts.error) matched += 1;
  if (agent?.diagnosticWarningCount === counts.warning) matched += 1;
  if (agent?.diagnosticInfoCount === counts.info) matched += 1;
  const topDiagnostic = diagnostics[0];
  if (topDiagnostic) {
    required += 3;
    if (agent?.topDiagnosticCode === topDiagnostic.code) matched += 1;
    if (agent?.topDiagnosticSeverity === topDiagnostic.severity) matched += 1;
    if (agent?.topDiagnosticMessage === topDiagnostic.message) matched += 1;
  } else if (agent?.topDiagnosticCode || agent?.topDiagnosticSeverity || agent?.topDiagnosticMessage) {
    required += 3;
  }
  return roundScore(matched / required);
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

function scoreAgentVerificationQueries(agent: {
  verificationFoundQueries?: unknown[];
  verificationMissingQueries?: unknown[];
  topVerificationFoundQuery?: string;
  topVerificationMissingQuery?: string;
} | undefined, verification: {
  foundQueries?: unknown[];
  missingQueries?: unknown[];
} | undefined): number {
  const expectedFound = verification?.foundQueries ?? [];
  const expectedMissing = verification?.missingQueries ?? [];
  if (expectedFound.length === 0 && expectedMissing.length === 0) {
    return (agent?.verificationFoundQueries?.length ?? 0) === 0
      && (agent?.verificationMissingQueries?.length ?? 0) === 0
      && !agent?.topVerificationFoundQuery
      && !agent?.topVerificationMissingQuery ? 1 : 0;
  }
  let required = 2;
  let matched = 0;
  if (JSON.stringify(agent?.verificationFoundQueries ?? []) === JSON.stringify(expectedFound)) matched += 1;
  if (JSON.stringify(agent?.verificationMissingQueries ?? []) === JSON.stringify(expectedMissing)) matched += 1;
  if (expectedFound[0]) {
    required += 1;
    if (agent?.topVerificationFoundQuery === expectedFound[0]) matched += 1;
  } else if (agent?.topVerificationFoundQuery) {
    required += 1;
  }
  if (expectedMissing[0]) {
    required += 1;
    if (agent?.topVerificationMissingQuery === expectedMissing[0]) matched += 1;
  } else if (agent?.topVerificationMissingQuery) {
    required += 1;
  }
  return roundScore(matched / required);
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

function scoreAgentChoiceCounts(agent: {
  resultCount?: number;
  resultChoiceCount?: number;
  formCount?: number;
  formChoiceCount?: number;
  actionTargetCount?: number;
  actionTargetChoiceCount?: number;
  sourceLinkCount?: number;
  sourceChoiceCount?: number;
} | undefined): number {
  if (!agent) return 0;
  const checks = [
    [agent.resultChoiceCount, agent.resultCount],
    [agent.formChoiceCount, agent.formCount],
    [agent.actionTargetChoiceCount, agent.actionTargetCount],
    [agent.sourceChoiceCount, agent.sourceLinkCount],
  ] as const;
  const matched = checks.filter(([choiceCount, sourceCount]) => typeof choiceCount === "number" && choiceCount === (sourceCount ?? 0)).length;
  return roundScore(matched / checks.length);
}

function scoreAgentTopChoiceShortcuts(agent: {
  resultChoices?: CliAgentResultChoiceShape[];
  sourceChoices?: CliAgentSourceChoiceShape[];
  formChoices?: CliAgentFormChoiceShape[];
  actionTargetChoices?: CliAgentActionTargetChoiceShape[];
  topChoiceKind?: "result" | "source" | "form" | "action-target";
  topChoicePath?: string;
  topChoiceLabel?: string;
  topChoiceUrl?: string;
  topChoiceCommandArgs?: string[];
} | undefined): number {
  if (!agent) return 0;
  const result = agent.resultChoices?.[0];
  const source = agent.sourceChoices?.[0];
  const form = agent.formChoices?.[0];
  const actionTarget = agent.actionTargetChoices?.[0];
  const expected = result
    ? { kind: "result" as const, path: result.path, label: result.title, url: result.url, commandArgs: result.commandArgs }
    : source
      ? { kind: "source" as const, path: source.path, label: source.title || source.text, url: source.url, commandArgs: source.commandArgs }
      : form
        ? { kind: "form" as const, path: form.path, label: form.text, url: form.actionUrl ?? form.urlTemplate }
        : actionTarget
          ? { kind: "action-target" as const, path: actionTarget.path, label: actionTarget.name || actionTarget.text, url: actionTarget.targetUrl ?? actionTarget.urlTemplate }
          : undefined;
  if (!expected) {
    return !agent.topChoiceKind && !agent.topChoicePath && !agent.topChoiceLabel && !agent.topChoiceUrl && !agent.topChoiceCommandArgs ? 1 : 0;
  }
  let required = 2;
  let matched = 0;
  if (agent.topChoiceKind === expected.kind) matched += 1;
  if (agent.topChoicePath === expected.path) matched += 1;
  if (expected.label) {
    required += 1;
    if (agent.topChoiceLabel === expected.label) matched += 1;
  } else if (agent.topChoiceLabel) {
    required += 1;
  }
  if (expected.url) {
    required += 1;
    if (agent.topChoiceUrl === expected.url) matched += 1;
  } else if (agent.topChoiceUrl) {
    required += 1;
  }
  if (expected.commandArgs) {
    required += 1;
    if (JSON.stringify(agent.topChoiceCommandArgs) === JSON.stringify(expected.commandArgs)) matched += 1;
  } else if (agent.topChoiceCommandArgs) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentTopResultChoiceShortcuts(agent: {
  resultChoices?: CliAgentResultChoiceShape[];
  topResultChoicePath?: string;
  topResultChoiceTitle?: string;
  topResultChoiceUrl?: string;
  topResultChoiceHost?: string;
  topResultChoiceCommandArgs?: unknown[];
  topResultChoiceRank?: number;
  topResultChoiceOpenResult?: number | "best";
  topResultChoiceRecommended?: boolean;
  topResultChoicePrimary?: boolean;
  topResultChoiceSourceType?: string;
  topResultChoiceSourceScore?: number;
  topResultChoiceSourceHints?: string[];
  topResultChoiceDateText?: string;
  topResultChoiceRelevance?: "low" | "medium" | "high";
  topResultChoiceMatchedTerm?: string;
  topResultChoiceFindMatch?: string;
  topResultChoiceLikelyOfficial?: boolean;
  topResultChoiceSitelinkCount?: number;
  topResultChoiceFirstSitelinkTitle?: string;
  topResultChoiceFirstSitelinkUrl?: string;
  topResultChoiceReason?: string;
} | undefined): number {
  const top = agent?.resultChoices?.[0];
  if (!top) {
    return agent?.topResultChoicePath
      || agent?.topResultChoiceTitle
      || agent?.topResultChoiceUrl
      || agent?.topResultChoiceHost
      || agent?.topResultChoiceCommandArgs
      || typeof agent?.topResultChoiceRank === "number"
      || agent?.topResultChoiceOpenResult
      || typeof agent?.topResultChoiceRecommended === "boolean"
      || typeof agent?.topResultChoicePrimary === "boolean"
      || agent?.topResultChoiceSourceType
      || typeof agent?.topResultChoiceSourceScore === "number"
      || agent?.topResultChoiceSourceHints
      || agent?.topResultChoiceDateText
      || agent?.topResultChoiceRelevance
      || agent?.topResultChoiceMatchedTerm
      || agent?.topResultChoiceFindMatch
      || typeof agent?.topResultChoiceLikelyOfficial === "boolean"
      || typeof agent?.topResultChoiceSitelinkCount === "number"
      || agent?.topResultChoiceFirstSitelinkTitle
      || agent?.topResultChoiceFirstSitelinkUrl
      || agent?.topResultChoiceReason ? 0 : 1;
  }
  let required = 3;
  let matched = 0;
  if (agent?.topResultChoicePath === top.path) matched += 1;
  if (agent?.topResultChoiceUrl === top.url) matched += 1;
  if (agent?.topResultChoiceRank === top.rank) matched += 1;
  if (top.host) {
    required += 1;
    if (agent?.topResultChoiceHost === top.host) matched += 1;
  } else if (agent?.topResultChoiceHost) {
    required += 1;
  }
  if (top.commandArgs) {
    required += 1;
    if (JSON.stringify(agent?.topResultChoiceCommandArgs) === JSON.stringify(top.commandArgs)) matched += 1;
  } else if (agent?.topResultChoiceCommandArgs) {
    required += 1;
  }
  if (top.title) {
    required += 1;
    if (agent?.topResultChoiceTitle === top.title) matched += 1;
  } else if (agent?.topResultChoiceTitle) {
    required += 1;
  }
  if (top.openResult) {
    required += 1;
    if (agent?.topResultChoiceOpenResult === top.openResult) matched += 1;
  } else if (agent?.topResultChoiceOpenResult) {
    required += 1;
  }
  if (typeof top.recommended === "boolean") {
    required += 1;
    if (agent?.topResultChoiceRecommended === top.recommended) matched += 1;
  } else if (typeof agent?.topResultChoiceRecommended === "boolean") {
    required += 1;
  }
  if (typeof top.primary === "boolean") {
    required += 1;
    if (agent?.topResultChoicePrimary === top.primary) matched += 1;
  } else if (typeof agent?.topResultChoicePrimary === "boolean") {
    required += 1;
  }
  if (top.sourceType) {
    required += 1;
    if (agent?.topResultChoiceSourceType === top.sourceType) matched += 1;
  } else if (agent?.topResultChoiceSourceType) {
    required += 1;
  }
  if (typeof top.sourceScore === "number") {
    required += 1;
    if (agent?.topResultChoiceSourceScore === top.sourceScore) matched += 1;
  } else if (typeof agent?.topResultChoiceSourceScore === "number") {
    required += 1;
  }
  if (top.sourceHints?.length) {
    required += 1;
    if (JSON.stringify(agent?.topResultChoiceSourceHints) === JSON.stringify(top.sourceHints)) matched += 1;
  } else if (agent?.topResultChoiceSourceHints) {
    required += 1;
  }
  if (top.dateText) {
    required += 1;
    if (agent?.topResultChoiceDateText === top.dateText) matched += 1;
  } else if (agent?.topResultChoiceDateText) {
    required += 1;
  }
  if (top.relevance) {
    required += 1;
    if (agent?.topResultChoiceRelevance === top.relevance) matched += 1;
  } else if (agent?.topResultChoiceRelevance) {
    required += 1;
  }
  if (top.matchedTerms?.[0]) {
    required += 1;
    if (agent?.topResultChoiceMatchedTerm === top.matchedTerms[0]) matched += 1;
  } else if (agent?.topResultChoiceMatchedTerm) {
    required += 1;
  }
  if (top.findMatches?.[0]) {
    required += 1;
    if (agent?.topResultChoiceFindMatch === top.findMatches[0]) matched += 1;
  } else if (agent?.topResultChoiceFindMatch) {
    required += 1;
  }
  if (typeof top.isLikelyOfficial === "boolean") {
    required += 1;
    if (agent?.topResultChoiceLikelyOfficial === top.isLikelyOfficial) matched += 1;
  } else if (typeof agent?.topResultChoiceLikelyOfficial === "boolean") {
    required += 1;
  }
  if (top.sitelinks?.length) {
    required += 3;
    if (agent?.topResultChoiceSitelinkCount === top.sitelinks.length) matched += 1;
    if (agent?.topResultChoiceFirstSitelinkTitle === top.sitelinks[0]?.title) matched += 1;
    if (agent?.topResultChoiceFirstSitelinkUrl === top.sitelinks[0]?.url) matched += 1;
  } else if (typeof agent?.topResultChoiceSitelinkCount === "number" || agent?.topResultChoiceFirstSitelinkTitle || agent?.topResultChoiceFirstSitelinkUrl) {
    required += 1;
  }
  if (top.selectionReason) {
    required += 1;
    if (agent?.topResultChoiceReason === top.selectionReason) matched += 1;
  } else if (agent?.topResultChoiceReason) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentEvidenceCountShortcuts(agent: {
  citationCount?: number;
  citations?: unknown[];
  answerEvidenceCount?: number;
  answerEvidence?: unknown[];
  readTargetCount?: number;
  readTargets?: unknown[];
  actionCount?: number;
  actions?: unknown[];
} | undefined): number {
  if (!agent) return 0;
  const checks = [
    [agent.citationCount, agent.citations],
    [agent.answerEvidenceCount, agent.answerEvidence],
    [agent.readTargetCount, agent.readTargets],
    [agent.actionCount, agent.actions],
  ] as const;
  const matched = checks.filter(([count, items]) => typeof count === "number" && count === (items?.length ?? 0)).length;
  return roundScore(matched / checks.length);
}

function scoreAgentSignalCountShortcuts(agent: {
  signalCount?: number;
  signalWarningCount?: number;
  signalErrorCount?: number;
  signals?: CliAgentSignalShape[];
  qualityGateCount?: number;
  qualityGateFailCount?: number;
  qualityGates?: CliAgentQualityGateShape[];
} | undefined): number {
  if (!agent) return 0;
  const signals = agent.signals ?? [];
  const qualityGates = agent.qualityGates ?? [];
  const warningCount = signals.filter((signal) => signal.severity === "warning").length;
  const errorCount = signals.filter((signal) => signal.severity === "error").length;
  const failedGateCount = qualityGates.filter((gate) => gate.pass === false).length;
  const checks = [
    agent.signalCount === signals.length,
    agent.signalWarningCount === warningCount,
    agent.signalErrorCount === errorCount,
    agent.qualityGateCount === qualityGates.length,
    agent.qualityGateFailCount === failedGateCount,
  ];
  return roundScore(checks.filter(Boolean).length / checks.length);
}

function scoreAgentTopQualityShortcuts(agent: {
  signals?: CliAgentSignalShape[];
  qualityGates?: CliAgentQualityGateShape[];
  topSignalKind?: CliAgentSignalShape["kind"];
  topSignalSeverity?: CliAgentSignalShape["severity"];
  topSignalMessage?: string;
  topQualityGateKind?: CliAgentQualityGateShape["kind"];
  topQualityGatePass?: boolean;
  topQualityGateSeverity?: CliAgentQualityGateShape["severity"];
  topQualityGateMessage?: string;
  topQualityGatePath?: string;
  topQualityGateScore?: number;
} | undefined): number {
  if (!agent) return 0;
  const topSignal = agent.signals?.[0];
  const topGate = agent.qualityGates?.[0];
  let required = 0;
  let matched = 0;
  if (topSignal) {
    required += 3;
    if (agent.topSignalKind === topSignal.kind) matched += 1;
    if (agent.topSignalSeverity === topSignal.severity) matched += 1;
    if (agent.topSignalMessage === topSignal.message) matched += 1;
  } else if (!agent.topSignalKind && !agent.topSignalSeverity && !agent.topSignalMessage) {
    required += 1;
    matched += 1;
  }
  if (topGate) {
    required += 4 + (topGate.path ? 1 : 0) + (typeof topGate.score === "number" ? 1 : 0);
    if (agent.topQualityGateKind === topGate.kind) matched += 1;
    if (agent.topQualityGatePass === topGate.pass) matched += 1;
    if (agent.topQualityGateSeverity === topGate.severity) matched += 1;
    if (typeof topGate.message === "string") {
      if (agent.topQualityGateMessage === topGate.message) matched += 1;
    } else if (typeof agent.topQualityGateMessage === "string" && agent.topQualityGateMessage.length > 0) {
      matched += 1;
    }
    if (topGate.path && agent.topQualityGatePath === topGate.path) matched += 1;
    if (typeof topGate.score === "number" && agent.topQualityGateScore === topGate.score) matched += 1;
  } else if (!agent.topQualityGateKind && typeof agent.topQualityGatePass !== "boolean" && !agent.topQualityGateSeverity && !agent.topQualityGateMessage && !agent.topQualityGatePath && typeof agent.topQualityGateScore !== "number") {
    required += 1;
    matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentProblemShortcuts(agent: {
  signals?: CliAgentSignalShape[];
  qualityGates?: CliAgentQualityGateShape[];
  problemSignalKind?: CliAgentSignalShape["kind"];
  problemSignalSeverity?: CliAgentSignalShape["severity"];
  problemSignalMessage?: string;
  failingQualityGateKind?: CliAgentQualityGateShape["kind"];
  failingQualityGateSeverity?: CliAgentQualityGateShape["severity"];
  failingQualityGateMessage?: string;
  failingQualityGatePath?: string;
  failingQualityGateScore?: number;
} | undefined): number {
  if (!agent) return 0;
  const problemSignal = (agent.signals ?? []).find((signal) => signal.severity === "error" || signal.severity === "warning");
  const failingGate = (agent.qualityGates ?? []).find((gate) => gate.pass === false);
  let required = 0;
  let matched = 0;
  if (problemSignal) {
    required += 3;
    if (agent.problemSignalKind === problemSignal.kind) matched += 1;
    if (agent.problemSignalSeverity === problemSignal.severity) matched += 1;
    if (agent.problemSignalMessage === problemSignal.message) matched += 1;
  } else if (!agent.problemSignalKind && !agent.problemSignalSeverity && !agent.problemSignalMessage) {
    required += 1;
    matched += 1;
  }
  if (failingGate) {
    required += 4 + (failingGate.path ? 1 : 0);
    if (agent.failingQualityGateKind === failingGate.kind) matched += 1;
    if (agent.failingQualityGateSeverity === failingGate.severity) matched += 1;
    if (agent.failingQualityGateScore === failingGate.score) matched += 1;
    if (typeof failingGate.message === "string") {
      if (agent.failingQualityGateMessage === failingGate.message) matched += 1;
    } else if (typeof agent.failingQualityGateMessage === "string" && agent.failingQualityGateMessage.length > 0) {
      matched += 1;
    }
    if (failingGate.path && agent.failingQualityGatePath === failingGate.path) matched += 1;
  } else if (!agent.failingQualityGateKind && !agent.failingQualityGateSeverity && !agent.failingQualityGateMessage && !agent.failingQualityGatePath && typeof agent.failingQualityGateScore !== "number") {
    required += 1;
    matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentResultChoices(
  choices: CliAgentResultChoiceShape[],
  searchResults: CliSearchResultShape[],
  recommendedResult: CliSearchResultShape | undefined,
  primaryAction: CliActionShape | undefined,
): number {
  if (searchResults.length === 0) return choices.length === 0 ? 1 : 0;
  if (choices.length === 0) return 0;
  let required = 2;
  let matched = 0;
  if (choices.length <= Math.max(5, searchResults.length) && choices.length >= Math.min(searchResults.length, 1)) matched += 1;
  const resultByRank = new Map(searchResults.map((result) => [result.rank, result]));
  const validChoices = choices.filter((choice) => {
    const source = typeof choice.rank === "number" ? resultByRank.get(choice.rank) : undefined;
    return source
      && choice.id === `r${source.rank}`
      && typeof choice.path === "string"
      && choice.url === source.url
      && choice.title === source.title
      && typeof choice.selectionReason === "string"
      && choice.selectionReason.length > 0;
  }).length;
  if (validChoices === choices.length) matched += 1;
  if (recommendedResult) {
    required += 1;
    if (choices.some((choice) => choice.recommended === true && choice.recommendedPath === "recommendedResult" && choice.rank === recommendedResult.rank && choice.url === recommendedResult.url)) matched += 1;
  }
  const snippetSources = searchResults.filter((result) => typeof result.snippet === "string" && result.snippet.length > 0);
  if (snippetSources.length > 0) {
    required += 1;
    if (snippetSources.every((result) => choices.some((choice) => choice.rank === result.rank && choice.snippet === result.snippet))) matched += 1;
  }
  const datedSources = searchResults.filter((result) => typeof result.dateText === "string" && result.dateText.length > 0);
  if (datedSources.length > 0) {
    required += 1;
    if (datedSources.every((result) => choices.some((choice) => choice.rank === result.rank
      && choice.dateText === result.dateText
      && (typeof result.date !== "string" || choice.date === result.date)
      && (typeof result.datePrecision !== "string" || choice.datePrecision === result.datePrecision)
      && (typeof result.dateSource !== "string" || choice.dateSource === result.dateSource)))) matched += 1;
  }
  const sitelinkSources = searchResults.filter((result) => Array.isArray(result.sitelinks) && result.sitelinks.length > 0);
  if (sitelinkSources.length > 0) {
    required += 1;
    if (sitelinkSources.every((result) => choices.some((choice) => choice.rank === result.rank
      && JSON.stringify(choice.sitelinks) === JSON.stringify(result.sitelinks)))) matched += 1;
  }
  const runnableChoices = choices.filter((choice) => Array.isArray(choice.commandArgs) && choice.commandArgs.length > 0).length;
  required += 1;
  if (runnableChoices === choices.length) matched += 1;
  if (primaryAction?.url || primaryAction?.rank) {
    required += 1;
    if (choices.some((choice) => choice.primary === true && (choice.url === primaryAction.url || choice.rank === primaryAction.rank))) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentSourceLinkCount(kind: string, sourceLinkCount: number | undefined, sourceLinks: Array<{ sourceScore?: number }>): number {
  if (typeof sourceLinkCount !== "number") return 0;
  if (kind === "search-results") return sourceLinkCount === 0 ? 1 : 0;
  return sourceLinkCount === sourceLinks.length ? 1 : 0;
}

function scoreAgentFormActionCounts(
  formCount: number | undefined,
  actionTargetCount: number | undefined,
  forms: unknown[],
  actionTargets: unknown[],
): number {
  let matched = 0;
  if (typeof formCount === "number" && formCount === forms.length) matched += 1;
  if (typeof actionTargetCount === "number" && actionTargetCount === actionTargets.length) matched += 1;
  return roundScore(matched / 2);
}

function scoreAgentFormActionChoices(
  formChoices: CliAgentFormChoiceShape[],
  actionTargetChoices: CliAgentActionTargetChoiceShape[],
  forms: unknown[],
  actionTargets: unknown[],
): number {
  return roundScore((scoreAgentFormChoices(formChoices, forms) + scoreAgentActionTargetChoices(actionTargetChoices, actionTargets)) / 2);
}

function scoreAgentFormChoices(choices: CliAgentFormChoiceShape[], forms: unknown[]): number {
  if (forms.length === 0) return choices.length === 0 ? 1 : 0;
  if (choices.length === 0) return 0;
  const expected = forms.slice(0, Math.min(4, forms.length)) as Array<Record<string, unknown>>;
  let required = 2;
  let matched = 0;
  if (choices.length === expected.length) matched += 1;
  if (choices.every((choice, index) => {
    const form = expected[index];
    if (!form) return false;
    return optionalFieldMatches(choice.id, form.id)
      && optionalFieldMatches(choice.path, form.path)
      && choice.method === form.method
      && choice.fieldCount === form.fieldCount
      && Array.isArray(choice.fields);
  })) matched += 1;
  if (expected.some((form) => typeof (form as { urlTemplate?: unknown }).urlTemplate === "string")) {
    required += 1;
    if (choices.some((choice) => typeof choice.urlTemplate === "string" && choice.urlTemplate.length > 0 && typeof choice.queryField === "string" && choice.queryField.length > 0)) matched += 1;
  }
  if (expected.some((form) => typeof (form as { selector?: unknown }).selector === "string")) {
    required += 1;
    if (choices.every((choice, index) => {
      const form = expected[index];
      if (!form) return false;
      return choice.selector === form.selector;
    })) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentActionTargetChoices(choices: CliAgentActionTargetChoiceShape[], targets: unknown[]): number {
  if (targets.length === 0) return choices.length === 0 ? 1 : 0;
  if (choices.length === 0) return 0;
  const expected = targets.slice(0, Math.min(5, targets.length)) as Array<Record<string, unknown>>;
  let required = 2;
  let matched = 0;
  if (choices.length === expected.length) matched += 1;
  if (choices.every((choice, index) => {
    const target = expected[index];
    if (!target) return false;
    return optionalFieldMatches(choice.id, target.id)
      && optionalFieldMatches(choice.path, target.path)
      && choice.kind === target.kind
      && choice.name === target.name
      && choice.source === target.source;
  })) matched += 1;
  if (expected.some((target) => typeof (target as { urlTemplate?: unknown }).urlTemplate === "string" || typeof (target as { targetUrl?: unknown }).targetUrl === "string")) {
    required += 1;
    if (choices.every((choice, index) => {
      const target = expected[index];
      if (!target) return false;
      return choice.urlTemplate === target.urlTemplate && choice.targetUrl === target.targetUrl;
    })) matched += 1;
  }
  if (expected.some((target) => typeof (target as { selector?: unknown }).selector === "string")) {
    required += 1;
    if (choices.every((choice, index) => {
      const target = expected[index];
      if (!target) return false;
      return choice.selector === target.selector;
    })) matched += 1;
  }
  if (expected.some((target) => typeof (target as { disabled?: unknown }).disabled === "boolean" || typeof (target as { pressed?: unknown }).pressed !== "undefined" || typeof (target as { expanded?: unknown }).expanded === "boolean" || typeof (target as { haspopup?: unknown }).haspopup !== "undefined" || typeof (target as { controls?: unknown }).controls === "string")) {
    required += 1;
    if (choices.every((choice, index) => {
      const target = expected[index];
      if (!target) return false;
      return optionalFieldMatches(choice.disabled, target.disabled)
        && optionalFieldMatches(choice.pressed, target.pressed)
        && optionalFieldMatches(choice.expanded, target.expanded)
        && optionalFieldMatches(choice.haspopup, target.haspopup)
        && optionalFieldMatches(choice.controls, target.controls);
    })) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentTopFormActionChoiceShortcuts(agent: {
  formChoices?: CliAgentFormChoiceShape[];
  topFormChoicePath?: string;
  topFormChoiceMethod?: string;
  topFormChoiceActionUrl?: string;
  topFormChoiceSubmitText?: string;
  topFormChoiceQueryField?: string;
  topFormChoiceUrlTemplate?: string;
  topFormChoiceFieldCount?: number;
  topFormChoiceSelector?: string;
  topFormChoiceFirstFieldName?: string;
  topFormChoiceFirstFieldType?: string;
  topFormChoiceFirstFieldLabel?: string;
  topFormChoiceFirstFieldRequired?: boolean;
  topFormChoiceFirstFieldSelector?: string;
  actionTargetChoices?: CliAgentActionTargetChoiceShape[];
  topActionTargetChoicePath?: string;
  topActionTargetChoiceKind?: string;
  topActionTargetChoiceName?: string;
  topActionTargetChoiceSource?: string;
  topActionTargetChoiceTargetUrl?: string;
  topActionTargetChoiceUrlTemplate?: string;
  topActionTargetChoiceQueryInput?: string;
  topActionTargetChoiceMethod?: string;
  topActionTargetChoiceDisabled?: boolean;
  topActionTargetChoicePressed?: boolean | "mixed";
  topActionTargetChoiceExpanded?: boolean;
  topActionTargetChoiceHaspopup?: boolean | string;
  topActionTargetChoiceControls?: string;
  topActionTargetChoiceSelector?: string;
} | undefined): number {
  const form = agent?.formChoices?.[0];
  const actionTarget = agent?.actionTargetChoices?.[0];
  let required = 2;
  let matched = 0;
  if (form) {
    if (agent?.topFormChoicePath === form.path) matched += 1;
    required += 12;
    const firstField = Array.isArray(form.fields) ? form.fields[0] as { name?: unknown; type?: unknown; label?: unknown; required?: unknown; selector?: unknown } | undefined : undefined;
    if (agent?.topFormChoiceMethod === form.method) matched += 1;
    if (agent?.topFormChoiceActionUrl === form.actionUrl) matched += 1;
    if (agent?.topFormChoiceSubmitText === form.submitText) matched += 1;
    if (agent?.topFormChoiceQueryField === form.queryField) matched += 1;
    if (agent?.topFormChoiceUrlTemplate === form.urlTemplate) matched += 1;
    if (agent?.topFormChoiceFieldCount === form.fieldCount) matched += 1;
    if (agent?.topFormChoiceSelector === form.selector) matched += 1;
    if (agent?.topFormChoiceFirstFieldName === firstField?.name) matched += 1;
    if (agent?.topFormChoiceFirstFieldType === firstField?.type) matched += 1;
    if (agent?.topFormChoiceFirstFieldLabel === firstField?.label) matched += 1;
    if (agent?.topFormChoiceFirstFieldRequired === firstField?.required) matched += 1;
    if (agent?.topFormChoiceFirstFieldSelector === firstField?.selector) matched += 1;
  } else if (
    agent?.topFormChoicePath
    || agent?.topFormChoiceMethod
    || agent?.topFormChoiceActionUrl
    || agent?.topFormChoiceSubmitText
    || agent?.topFormChoiceQueryField
    || agent?.topFormChoiceUrlTemplate
    || typeof agent?.topFormChoiceFieldCount === "number"
    || agent?.topFormChoiceSelector
    || agent?.topFormChoiceFirstFieldName
    || agent?.topFormChoiceFirstFieldType
    || agent?.topFormChoiceFirstFieldLabel
    || typeof agent?.topFormChoiceFirstFieldRequired === "boolean"
    || agent?.topFormChoiceFirstFieldSelector
  ) {
    required += 1;
  } else {
    matched += 1;
  }
  if (actionTarget) {
    if (agent?.topActionTargetChoicePath === actionTarget.path) matched += 1;
    required += 13;
    if (agent?.topActionTargetChoiceKind === actionTarget.kind) matched += 1;
    if (agent?.topActionTargetChoiceName === actionTarget.name) matched += 1;
    if (agent?.topActionTargetChoiceSource === actionTarget.source) matched += 1;
    if (agent?.topActionTargetChoiceTargetUrl === actionTarget.targetUrl) matched += 1;
    if (agent?.topActionTargetChoiceUrlTemplate === actionTarget.urlTemplate) matched += 1;
    if (agent?.topActionTargetChoiceQueryInput === actionTarget.queryInput) matched += 1;
    if (agent?.topActionTargetChoiceMethod === actionTarget.method) matched += 1;
    if (agent?.topActionTargetChoiceDisabled === actionTarget.disabled) matched += 1;
    if (agent?.topActionTargetChoicePressed === actionTarget.pressed) matched += 1;
    if (agent?.topActionTargetChoiceExpanded === actionTarget.expanded) matched += 1;
    if (agent?.topActionTargetChoiceHaspopup === actionTarget.haspopup) matched += 1;
    if (agent?.topActionTargetChoiceControls === actionTarget.controls) matched += 1;
    if (agent?.topActionTargetChoiceSelector === actionTarget.selector) matched += 1;
  } else if (
    agent?.topActionTargetChoicePath
    || agent?.topActionTargetChoiceKind
    || agent?.topActionTargetChoiceName
    || agent?.topActionTargetChoiceSource
    || agent?.topActionTargetChoiceTargetUrl
    || agent?.topActionTargetChoiceUrlTemplate
    || agent?.topActionTargetChoiceQueryInput
    || agent?.topActionTargetChoiceMethod
    || typeof agent?.topActionTargetChoiceDisabled === "boolean"
    || typeof agent?.topActionTargetChoicePressed !== "undefined"
    || typeof agent?.topActionTargetChoiceExpanded === "boolean"
    || typeof agent?.topActionTargetChoiceHaspopup !== "undefined"
    || agent?.topActionTargetChoiceControls
    || agent?.topActionTargetChoiceSelector
  ) {
    required += 1;
  } else {
    matched += 1;
  }
  return roundScore(matched / required);
}

function optionalFieldMatches(actual: unknown, expected: unknown): boolean {
  return typeof expected === "undefined" || actual === expected;
}

function arraysEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function scoreAgentHiddenSignalCounts(
  agent: {
    hiddenSignalCount?: number;
    hiddenReadTargetCount?: number;
    bestHiddenReadTarget?: string;
    bestHiddenReadTargetCount?: number;
    bestHiddenReadTargetScore?: number;
    bestHiddenReadTargetPrimary?: boolean;
    bestHiddenReadTargetReason?: string;
    hiddenHydrationCount?: number;
    hiddenApiEndpointCount?: number;
    hiddenClientStateCount?: number;
    hiddenAppHintCount?: number;
    readTargets?: CliReadTargetShape[];
  } | undefined,
  expectedHiddenSignalCount: number,
  pageCheck: unknown,
): number {
  let matched = 0;
  let required = 6;
  const readTargets = agent?.readTargets ?? [];
  const expectedReadTargetCount = readTargets.filter((target) => {
    return typeof target.path === "string" && hiddenPageCheckPaths.some((path) => target.path === `pageCheck.${path}`);
  }).length;
  if (typeof agent?.hiddenSignalCount === "number" && agent.hiddenSignalCount === expectedHiddenSignalCount) matched += 1;
  if (typeof agent?.hiddenHydrationCount === "number" && agent.hiddenHydrationCount === countPageCheckArray(pageCheck, "hydration")) matched += 1;
  if (typeof agent?.hiddenApiEndpointCount === "number" && agent.hiddenApiEndpointCount === countPageCheckArray(pageCheck, "apiEndpoints")) matched += 1;
  if (typeof agent?.hiddenClientStateCount === "number" && agent.hiddenClientStateCount === countPageCheckArray(pageCheck, "clientState")) matched += 1;
  if (typeof agent?.hiddenAppHintCount === "number" && agent.hiddenAppHintCount === countPageCheckArray(pageCheck, "appHints")) matched += 1;
  if (typeof agent?.hiddenReadTargetCount === "number" && agent.hiddenReadTargetCount === expectedReadTargetCount) matched += 1;
  const best = [...readTargets.filter((target) => {
    return typeof target.path === "string" && hiddenPageCheckPaths.some((path) => target.path === `pageCheck.${path}`);
  })].sort((left, right) => {
    if (left.primary !== right.primary) return left.primary ? -1 : 1;
    return (right.score ?? 0) - (left.score ?? 0);
  })[0];
  if (best) {
    required += 1;
    if (agent?.bestHiddenReadTarget === best.path) matched += 1;
    if (typeof best.count === "number") {
      required += 1;
      if (agent?.bestHiddenReadTargetCount === best.count) matched += 1;
    } else if (typeof agent?.bestHiddenReadTargetCount === "number") {
      required += 1;
    }
    if (typeof best.score === "number") {
      required += 1;
      if (agent?.bestHiddenReadTargetScore === best.score) matched += 1;
    } else if (typeof agent?.bestHiddenReadTargetScore === "number") {
      required += 1;
    }
    if (typeof best.primary === "boolean") {
      required += 1;
      if (agent?.bestHiddenReadTargetPrimary === best.primary) matched += 1;
    } else if (typeof agent?.bestHiddenReadTargetPrimary === "boolean") {
      required += 1;
    }
    if (best.reason) {
      required += 1;
      if (agent?.bestHiddenReadTargetReason === best.reason) matched += 1;
    }
  } else if (agent?.bestHiddenReadTarget) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentTopHiddenSignalShortcuts(agent: {
  topHydrationPath?: string;
  topHydrationKind?: string;
  topHydrationLabel?: string;
  topHydrationUrl?: string;
  topHydrationSelector?: string;
  topApiEndpointPath?: string;
  topApiEndpointKind?: string;
  topApiEndpointMethod?: string;
  topApiEndpointUrl?: string;
  topApiEndpointSelector?: string;
  topClientStatePath?: string;
  topClientStateKind?: string;
  topClientStateOperation?: string;
  topClientStateKey?: string;
  topClientStateSelector?: string;
  topAppHintPath?: string;
  topAppHintKind?: string;
  topAppHintLabel?: string;
  topAppHintUrl?: string;
  topAppHintSelector?: string;
  topHiddenSignalGroup?: string;
  topHiddenSignalPath?: string;
  topHiddenSignalKind?: string;
  topHiddenSignalText?: string;
  topHiddenSignalUrl?: string;
  topHiddenSignalSource?: string;
  topHiddenSignalSelector?: string;
} | undefined, pageCheck: unknown): number {
  const top = firstHiddenPageCheckItem(pageCheck);
  if (!top) {
    return agent?.topHiddenSignalGroup
      || agent?.topHiddenSignalPath
      || agent?.topHiddenSignalKind
      || agent?.topHiddenSignalText
      || agent?.topHiddenSignalUrl
      || agent?.topHiddenSignalSource
      || agent?.topHiddenSignalSelector ? 0 : 1;
  }
  let required = 2;
  let matched = 0;
  if (agent?.topHiddenSignalGroup === top.group) matched += 1;
  if (agent?.topHiddenSignalPath === top.path) matched += 1;
  if (top.kind) {
    required += 1;
    if (agent?.topHiddenSignalKind === top.kind) matched += 1;
  } else if (agent?.topHiddenSignalKind) {
    required += 1;
  }
  if (top.text) {
    required += 1;
    if (agent?.topHiddenSignalText === top.text) matched += 1;
  } else if (agent?.topHiddenSignalText) {
    required += 1;
  }
  if (top.url) {
    required += 1;
    if (agent?.topHiddenSignalUrl === top.url) matched += 1;
  } else if (agent?.topHiddenSignalUrl) {
    required += 1;
  }
  if (top.source) {
    required += 1;
    if (agent?.topHiddenSignalSource === top.source) matched += 1;
  } else if (agent?.topHiddenSignalSource) {
    required += 1;
  }
  if (top.selector) {
    required += 1;
    if (agent?.topHiddenSignalSelector === top.selector) matched += 1;
  } else if (agent?.topHiddenSignalSelector) {
    required += 1;
  }
  const topHiddenScore = matched / required;
  const groupScores = [
    scoreTopPageCheckGroupShortcut(pageCheck, "hydration", agent, {
      path: "topHydrationPath",
      kind: "topHydrationKind",
      label: "topHydrationLabel",
      url: "topHydrationUrl",
      selector: "topHydrationSelector",
    }),
    scoreTopPageCheckGroupShortcut(pageCheck, "apiEndpoints", agent, {
      path: "topApiEndpointPath",
      kind: "topApiEndpointKind",
      method: "topApiEndpointMethod",
      url: "topApiEndpointUrl",
      selector: "topApiEndpointSelector",
    }),
    scoreTopPageCheckGroupShortcut(pageCheck, "clientState", agent, {
      path: "topClientStatePath",
      kind: "topClientStateKind",
      operation: "topClientStateOperation",
      key: "topClientStateKey",
      selector: "topClientStateSelector",
    }),
    scoreTopPageCheckGroupShortcut(pageCheck, "appHints", agent, {
      path: "topAppHintPath",
      kind: "topAppHintKind",
      label: "topAppHintLabel",
      url: "topAppHintUrl",
      selector: "topAppHintSelector",
    }),
  ];
  return roundScore(average([topHiddenScore, ...groupScores]));
}

function scoreTopPageCheckGroupShortcut(
  pageCheck: unknown,
  key: string,
  agent: Record<string, unknown> | undefined,
  fieldMap: Record<string, string>,
): number {
  const item = firstPageCheckArrayRecord(pageCheck, key);
  const agentValues = Object.values(fieldMap).map((field) => agent?.[field]);
  if (!item) return agentValues.some((value) => typeof value !== "undefined") ? 0 : 1;
  let matched = 0;
  let required = 0;
  for (const [sourceField, agentField] of Object.entries(fieldMap)) {
    const expected = item[sourceField];
    const actual = agent?.[agentField];
    if (typeof expected === "undefined" || expected === "") {
      if (typeof actual !== "undefined") required += 1;
      continue;
    }
    required += 1;
    if (actual === expected) matched += 1;
  }
  return required === 0 ? 1 : roundScore(matched / required);
}

function firstPageCheckArrayRecord(pageCheck: unknown, key: string): Record<string, unknown> | undefined {
  if (!pageCheck || typeof pageCheck !== "object") return undefined;
  const value = (pageCheck as Record<string, unknown>)[key];
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const item = value[0];
  return item && typeof item === "object" ? item as Record<string, unknown> : undefined;
}

function firstHiddenPageCheckItem(pageCheck: unknown): { group: string; path: string; kind?: string; text?: string; url?: string; source?: string; selector?: string } | undefined {
  if (!pageCheck || typeof pageCheck !== "object") return undefined;
  const record = pageCheck as Record<string, unknown>;
  for (const group of hiddenPageCheckPaths) {
    const value = record[group];
    if (!Array.isArray(value) || value.length === 0) continue;
    const item = value[0];
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    return {
      group,
      path: typeof itemRecord.path === "string" ? itemRecord.path : `pageCheck.${group}[0]`,
      ...(typeof itemRecord.kind === "string" ? { kind: itemRecord.kind } : {}),
      ...(typeof itemRecord.text === "string" ? { text: itemRecord.text } : {}),
      ...(typeof itemRecord.url === "string" ? { url: itemRecord.url } : {}),
      ...(typeof itemRecord.source === "string" ? { source: itemRecord.source } : {}),
      ...(typeof itemRecord.selector === "string" ? { selector: itemRecord.selector } : {}),
    };
  }
  return undefined;
}

function scoreAgentSourceChoices(
  kind: string,
  choices: CliAgentSourceChoiceShape[],
  sourceLinks: Array<{ title?: string; url?: string; text?: string; snippet?: string; selector?: string; kind?: "internal" | "external"; selectionReason?: string; sourceScore?: number; command?: string; commandArgs?: string[] }>,
  primaryAction: CliActionShape | undefined,
): number {
  if (kind === "search-results" || sourceLinks.length === 0) return choices.length === 0 ? 1 : 0;
  if (choices.length === 0) return 0;
  let required = 3;
  let matched = 0;
  if (choices.length <= Math.min(4, sourceLinks.length) && choices.length >= 1) matched += 1;
  const validChoices = choices.filter((choice, index) => {
    const source = sourceLinks[index];
    return source
      && choice.id === `s${index + 1}`
      && choice.path === `pageCheck.sourceLinks[${index}]`
      && (typeof choice.url === "undefined" || choice.url === source.url)
      && (typeof choice.title === "undefined" || choice.title === source.title)
      && (typeof source.text !== "string" || choice.text === source.text)
      && (typeof source.snippet !== "string" || choice.snippet === source.snippet)
      && (typeof source.selector !== "string" || choice.selector === source.selector)
      && (typeof choice.kind === "undefined" || choice.kind === source.kind)
      && (typeof choice.selectionReason === "string" && choice.selectionReason.length > 0
        || typeof source.selectionReason === "string" && source.selectionReason.length > 0
        || typeof source.sourceScore === "number");
  }).length;
  if (validChoices === choices.length) matched += 1;
  const runnableChoices = choices.filter((choice, index) => Array.isArray(choice.commandArgs) && choice.commandArgs.length > 0
    || Array.isArray(sourceLinks[index]?.commandArgs) && (sourceLinks[index]?.commandArgs?.length ?? 0) > 0).length;
  if (runnableChoices === choices.length) matched += 1;
  const sourcePrimaryAction = primaryAction?.action === "open-source-link"
    || sourceLinks.some((source) => primaryAction?.url && source.url === primaryAction.url);
  if (sourcePrimaryAction && primaryAction) {
    required += 1;
    if (choices.some((choice) => choice.primary === true && (choice.url === primaryAction.url || choice.rank === primaryAction.rank))) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentTopSourceChoiceShortcuts(agent: {
  sourceChoices?: CliAgentSourceChoiceShape[];
  topSourceChoicePath?: string;
  topSourceChoiceTitle?: string;
  topSourceChoiceUrl?: string;
  topSourceChoiceHost?: string;
  topSourceChoiceCommandArgs?: string[];
  topSourceChoiceSourceType?: string;
  topSourceChoiceSourceScore?: number;
  topSourceChoiceSourceHints?: string[];
  topSourceChoicePrimary?: boolean;
  topSourceChoiceReason?: string;
} | undefined): number {
  const top = agent?.sourceChoices?.[0];
  if (!top) {
    return agent?.topSourceChoicePath
      || agent?.topSourceChoiceTitle
      || agent?.topSourceChoiceUrl
      || agent?.topSourceChoiceHost
      || agent?.topSourceChoiceCommandArgs
      || agent?.topSourceChoiceSourceType
      || typeof agent?.topSourceChoiceSourceScore === "number"
      || agent?.topSourceChoiceSourceHints
      || typeof agent?.topSourceChoicePrimary === "boolean"
      || agent?.topSourceChoiceReason ? 0 : 1;
  }
  let required = 3;
  let matched = 0;
  if (agent?.topSourceChoicePath === top.path) matched += 1;
  if (agent?.topSourceChoiceUrl === top.url) matched += 1;
  if (JSON.stringify(agent?.topSourceChoiceCommandArgs) === JSON.stringify(top.commandArgs)) matched += 1;
  if (top.host) {
    required += 1;
    if (agent?.topSourceChoiceHost === top.host) matched += 1;
  } else if (agent?.topSourceChoiceHost) {
    required += 1;
  }
  if (top.title) {
    required += 1;
    if (agent?.topSourceChoiceTitle === top.title) matched += 1;
  } else if (agent?.topSourceChoiceTitle) {
    required += 1;
  }
  if (top.sourceType) {
    required += 1;
    if (agent?.topSourceChoiceSourceType === top.sourceType) matched += 1;
  } else if (agent?.topSourceChoiceSourceType) {
    required += 1;
  }
  if (typeof top.sourceScore === "number") {
    required += 1;
    if (agent?.topSourceChoiceSourceScore === top.sourceScore) matched += 1;
  } else if (typeof agent?.topSourceChoiceSourceScore === "number") {
    required += 1;
  }
  if (top.sourceHints?.length) {
    required += 1;
    if (JSON.stringify(agent?.topSourceChoiceSourceHints) === JSON.stringify(top.sourceHints)) matched += 1;
  } else if (agent?.topSourceChoiceSourceHints) {
    required += 1;
  }
  if (typeof top.primary === "boolean") {
    required += 1;
    if (agent?.topSourceChoicePrimary === top.primary) matched += 1;
  } else if (typeof agent?.topSourceChoicePrimary === "boolean") {
    required += 1;
  }
  if (top.selectionReason) {
    required += 1;
    if (agent?.topSourceChoiceReason === top.selectionReason) matched += 1;
  } else if (agent?.topSourceChoiceReason) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentSourceSearchShortcuts(agent: {
  sourceSearchQuery?: string;
  sourceSearchEngine?: string;
  sourceSearchSelectedEngine?: string;
  sourceSearchSearchUrl?: string;
  sourceSearchLang?: string;
  sourceSearchRegion?: string;
  sourceSearchFindQueryCount?: number;
  sourceSearchTopFindQuery?: string;
  sourceSearchSelectedRank?: number;
  sourceSearchSelectedTitle?: string;
  sourceSearchSelectedUrl?: string;
  sourceSearchSelectedHost?: string;
  sourceSearchSelectedPath?: string;
  sourceSearchSelectedOpenResult?: number | "best";
  sourceSearchSelectedCommandArgs?: unknown[];
  sourceSearchSelectedReason?: string;
  sourceSearchFailureCode?: string;
  sourceSearchFailureStatus?: number;
  sourceSearchFailureUrl?: string;
  sourceSearchFailureReason?: string;
  sourceSearchAlternateCount?: number;
  sourceSearchAlternatePath?: string;
  sourceSearchAlternateTitle?: string;
  sourceSearchAlternateUrl?: string;
  sourceSearchAlternateHost?: string;
  sourceSearchAlternateRank?: number;
  sourceSearchAlternateOpenResult?: number | "best";
  sourceSearchAlternateCommandArgs?: unknown[];
  sourceSearchAlternateReason?: string;
} | undefined, sourceSearch: {
  query?: string;
  engine?: string;
  selectedEngine?: string;
  searchUrl?: string;
  lang?: string;
  region?: string;
  findQueries?: unknown[];
  selectedRank?: number;
  selectedTitle?: string;
  selectedUrl?: string;
  selectedResult?: CliAgentSourceSearchResultShape;
  alternateResults?: CliAgentSourceSearchResultShape[];
} | undefined): number {
  if (!sourceSearch) {
    return typeof agent?.sourceSearchQuery === "undefined"
      && typeof agent?.sourceSearchEngine === "undefined"
      && typeof agent?.sourceSearchSelectedEngine === "undefined"
      && typeof agent?.sourceSearchSearchUrl === "undefined"
      && typeof agent?.sourceSearchLang === "undefined"
      && typeof agent?.sourceSearchRegion === "undefined"
      && typeof agent?.sourceSearchFindQueryCount === "undefined"
      && typeof agent?.sourceSearchTopFindQuery === "undefined"
      && typeof agent?.sourceSearchSelectedRank === "undefined"
      && typeof agent?.sourceSearchSelectedTitle === "undefined"
      && typeof agent?.sourceSearchSelectedUrl === "undefined"
      && typeof agent?.sourceSearchSelectedHost === "undefined"
      && typeof agent?.sourceSearchSelectedPath === "undefined"
      && typeof agent?.sourceSearchSelectedOpenResult === "undefined"
      && typeof agent?.sourceSearchSelectedCommandArgs === "undefined"
      && typeof agent?.sourceSearchSelectedReason === "undefined"
      && typeof agent?.sourceSearchFailureCode === "undefined"
      && typeof agent?.sourceSearchFailureStatus === "undefined"
      && typeof agent?.sourceSearchFailureUrl === "undefined"
      && typeof agent?.sourceSearchFailureReason === "undefined"
      && typeof agent?.sourceSearchAlternatePath === "undefined"
      && typeof agent?.sourceSearchAlternateTitle === "undefined"
      && typeof agent?.sourceSearchAlternateUrl === "undefined"
      && typeof agent?.sourceSearchAlternateHost === "undefined"
      && typeof agent?.sourceSearchAlternateRank === "undefined"
      && typeof agent?.sourceSearchAlternateOpenResult === "undefined"
      && typeof agent?.sourceSearchAlternateCommandArgs === "undefined"
      && typeof agent?.sourceSearchAlternateReason === "undefined"
      && agent?.sourceSearchAlternateCount === 0 ? 1 : 0;
  }
  const selected = sourceSearch.selectedResult;
  const alternate = sourceSearch.alternateResults?.[0];
  let matched = 0;
  let required = 7;
  if (agent?.sourceSearchQuery === sourceSearch.query) matched += 1;
  if (agent?.sourceSearchEngine === sourceSearch.engine) matched += 1;
  if (agent?.sourceSearchSearchUrl === sourceSearch.searchUrl) matched += 1;
  if (agent?.sourceSearchSelectedRank === sourceSearch.selectedRank) matched += 1;
  if (agent?.sourceSearchSelectedTitle === sourceSearch.selectedTitle) matched += 1;
  if (agent?.sourceSearchSelectedUrl === sourceSearch.selectedUrl) matched += 1;
  if (agent?.sourceSearchAlternateCount === (sourceSearch.alternateResults?.length ?? 0)) matched += 1;
  if (sourceSearch.lang) {
    required += 1;
    if (agent?.sourceSearchLang === sourceSearch.lang) matched += 1;
  } else if (agent?.sourceSearchLang) {
    required += 1;
  }
  if (sourceSearch.region) {
    required += 1;
    if (agent?.sourceSearchRegion === sourceSearch.region) matched += 1;
  } else if (agent?.sourceSearchRegion) {
    required += 1;
  }
  if (Array.isArray(sourceSearch.findQueries)) {
    required += 1;
    if (agent?.sourceSearchFindQueryCount === sourceSearch.findQueries.length) matched += 1;
    if (sourceSearch.findQueries[0]) {
      required += 1;
      if (agent?.sourceSearchTopFindQuery === sourceSearch.findQueries[0]) matched += 1;
    } else if (agent?.sourceSearchTopFindQuery) {
      required += 1;
    }
  } else if (typeof agent?.sourceSearchFindQueryCount === "number" || agent?.sourceSearchTopFindQuery) {
    required += 1;
  }
  if (sourceSearch.selectedEngine) {
    required += 1;
    if (agent?.sourceSearchSelectedEngine === sourceSearch.selectedEngine) matched += 1;
  } else if (agent?.sourceSearchSelectedEngine) {
    required += 1;
  }
  if (selected) {
    required += 5;
    if (agent?.sourceSearchSelectedPath === selected.path) matched += 1;
    if (agent?.sourceSearchSelectedHost === selected.host) matched += 1;
    if (JSON.stringify(agent?.sourceSearchSelectedCommandArgs) === JSON.stringify(selected.commandArgs)) matched += 1;
    if (agent?.sourceSearchSelectedOpenResult === selected.openResult) matched += 1;
    if (agent?.sourceSearchSelectedReason === selected.selectionReason) matched += 1;
  } else if (agent?.sourceSearchSelectedPath || agent?.sourceSearchSelectedHost || agent?.sourceSearchSelectedCommandArgs || agent?.sourceSearchSelectedOpenResult || agent?.sourceSearchSelectedReason) {
    required += 1;
  }
  if (alternate) {
    required += 8;
    if (agent?.sourceSearchAlternatePath === alternate.path) matched += 1;
    if (agent?.sourceSearchAlternateTitle === alternate.title) matched += 1;
    if (agent?.sourceSearchAlternateUrl === alternate.url) matched += 1;
    if (agent?.sourceSearchAlternateHost === alternate.host) matched += 1;
    if (agent?.sourceSearchAlternateRank === alternate.rank) matched += 1;
    if (agent?.sourceSearchAlternateOpenResult === alternate.openResult) matched += 1;
    if (JSON.stringify(agent?.sourceSearchAlternateCommandArgs) === JSON.stringify(alternate.commandArgs)) matched += 1;
    if (agent?.sourceSearchAlternateReason === alternate.selectionReason) matched += 1;
  } else if (agent?.sourceSearchAlternatePath || agent?.sourceSearchAlternateTitle || agent?.sourceSearchAlternateUrl || agent?.sourceSearchAlternateHost || typeof agent?.sourceSearchAlternateRank === "number" || agent?.sourceSearchAlternateOpenResult || agent?.sourceSearchAlternateCommandArgs || agent?.sourceSearchAlternateReason) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentPageKind(pageKind: string | undefined, rootKind: string | undefined): number {
  if (!rootKind || rootKind === "unknown") return typeof pageKind === "undefined" ? 1 : 0;
  return pageKind === rootKind ? 1 : 0;
}

function scoreAgentPageMetadataShortcuts(agent: {
  pageTitle?: string;
  pageCanonicalUrl?: string;
  pageLang?: string;
  pageDir?: string;
  pageSiteName?: string;
  pageAuthor?: string;
  pagePublishedTime?: string;
  pageModifiedTime?: string;
  pageStructuredDataTypes?: unknown[];
} | undefined, page: {
  title?: string;
  canonicalUrl?: string;
  lang?: string;
  dir?: string;
  siteName?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  structuredDataTypes?: unknown[];
} | undefined): number {
  if (!agent) return 0;
  const checks: boolean[] = [];
  const checkString = (agentValue: string | undefined, pageValue: string | undefined): void => {
    if (pageValue) checks.push(agentValue === pageValue);
  };
  checkString(agent.pageTitle, page?.title);
  checkString(agent.pageCanonicalUrl, page?.canonicalUrl);
  checkString(agent.pageLang, page?.lang);
  checkString(agent.pageDir, page?.dir);
  checkString(agent.pageSiteName, page?.siteName);
  checkString(agent.pageAuthor, page?.author);
  checkString(agent.pagePublishedTime, page?.publishedTime);
  checkString(agent.pageModifiedTime, page?.modifiedTime);
  const pageTypes = Array.isArray(page?.structuredDataTypes) ? page.structuredDataTypes : [];
  const agentTypes = Array.isArray(agent.pageStructuredDataTypes) ? agent.pageStructuredDataTypes : [];
  if (pageTypes.length > 0) checks.push(JSON.stringify(agentTypes) === JSON.stringify(pageTypes));
  return checks.length === 0 ? 1 : roundScore(checks.filter(Boolean).length / checks.length);
}

function scoreAgentAlternativeActionCount(alternativeActionCount: number | undefined, actions: CliActionShape[] | undefined): number {
  if (typeof alternativeActionCount !== "number") return 0;
  if (!Array.isArray(actions)) return alternativeActionCount === 0 ? 1 : 0;
  return alternativeActionCount === actions.filter((action) => action.primary !== true).length ? 1 : 0;
}

function scoreAgentActionList(actions: CliActionShape[] | undefined, primaryAction: CliActionShape | undefined, alternativeActionCount: number | undefined): number {
  if (!primaryAction) return Array.isArray(actions) && actions.length === 0 ? 1 : 0;
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  const firstAction = actions[0];
  if (!firstAction) return 0;
  let required = 5;
  let matched = 0;
  if (compactActionKey(firstAction, primaryAction) === compactActionKey(primaryAction)) matched += 1;
  if (firstAction.primary === true) matched += 1;
  if (typeof firstAction.source === "string" && firstAction.source.length > 0) matched += 1;
  if (scoreOpenActionTarget(firstAction) === 1) matched += 1;
  const expectedCount = typeof alternativeActionCount === "number" ? alternativeActionCount + 1 : undefined;
  if (typeof expectedCount === "number") {
    if (actions.length === expectedCount) matched += 1;
  } else {
    matched += 1;
  }
  required += 1;
  if (actions.every((action) => scoreActionSchema([action]) === 1 && typeof action.source === "string" && action.source.length > 0)) matched += 1;
  return roundScore(matched / required);
}

function scoreAgentTopActionShortcuts(agent: {
  actions?: CliActionShape[];
  topActionName?: string;
  topActionSource?: string;
  topActionExecution?: ActionExecution;
  topActionPriority?: "low" | "medium" | "high";
  topActionReason?: string;
  topActionReadFrom?: string;
  topActionCommandArgs?: string[];
  topActionUrl?: string;
  topActionSourceLinkRef?: string;
  topActionRequiresBrowserInteraction?: boolean;
} | undefined): number {
  const top = agent?.actions?.[0];
  if (!top) {
    return agent?.topActionName
      || agent?.topActionSource
      || agent?.topActionExecution
      || agent?.topActionPriority
      || agent?.topActionReason
      || agent?.topActionReadFrom
      || agent?.topActionCommandArgs
      || agent?.topActionUrl
      || agent?.topActionSourceLinkRef
      || agent?.topActionRequiresBrowserInteraction ? 0 : 1;
  }
  let required = 5;
  let matched = 0;
  if (agent?.topActionName === top.action) matched += 1;
  if (agent?.topActionSource === top.source) matched += 1;
  if (agent?.topActionExecution === normalizedActionExecution(top)) matched += 1;
  if (agent?.topActionPriority === top.priority) matched += 1;
  if (agent?.topActionReason === top.reason) matched += 1;
  if (top.readFrom) {
    required += 1;
    if (agent?.topActionReadFrom === top.readFrom) matched += 1;
  } else if (agent?.topActionReadFrom) {
    required += 1;
  }
  if (top.commandArgs) {
    required += 1;
    if (JSON.stringify(agent?.topActionCommandArgs) === JSON.stringify(top.commandArgs)) matched += 1;
  } else if (agent?.topActionCommandArgs) {
    required += 1;
  }
  if (top.url) {
    required += 1;
    if (agent?.topActionUrl === top.url) matched += 1;
  } else if (agent?.topActionUrl) {
    required += 1;
  }
  if (top.sourceLinkRef) {
    required += 1;
    if (agent?.topActionSourceLinkRef === top.sourceLinkRef) matched += 1;
  } else if (agent?.topActionSourceLinkRef) {
    required += 1;
  }
  if (top.requiresBrowserInteraction) {
    required += 1;
    if (agent?.topActionRequiresBrowserInteraction === true) matched += 1;
  } else if (agent?.topActionRequiresBrowserInteraction) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreOpenActionTarget(action: CliActionShape): number {
  if (
    action.action !== "open-result"
    && action.action !== "open-alternate-result"
    && action.action !== "open-source-link"
    && action.action !== "open-site-search"
  ) {
    if (typeof action.target === "undefined") return 1;
    if (action.action !== "inspect-browser-state" && action.action !== "inspect-actions") return 0;
    return actionTargetHasTitleAndUrl(action.target) ? 1 : 0;
  }
  if (typeof action.path === "string" && action.path.length > 0) return 1;
  if (!action.target || typeof action.target !== "object") return 0;
  if (typeof action.url === "string" && action.target.url !== action.url) return 0;
  if (typeof action.rank === "number" && action.target.rank !== action.rank) return 0;
  return typeof action.target.url === "string"
    && action.target.url.length > 0
    && typeof action.target.title === "string"
    && action.target.title.length > 0 ? 1 : 0;
}

function actionTargetHasTitleAndUrl(target: unknown): target is { title: string; url: string } {
  if (!target || typeof target !== "object") return false;
  const record = target as Record<string, unknown>;
  return typeof record.title === "string"
    && record.title.length > 0
    && typeof record.url === "string"
    && record.url.length > 0;
}

function scoreAgentSearchDecision(
  agent: {
    searchDecision?: CliAgentSearchDecisionShape;
    searchDecisionName?: CliAgentSearchDecisionShape["decision"];
    searchDecisionConfidence?: CliAgentSearchDecisionShape["confidence"];
    searchDecisionReason?: string;
    searchDecisionResultCount?: number;
    searchDecisionHighRelevanceCount?: number;
    searchDecisionMediumRelevanceCount?: number;
    searchDecisionLowRelevanceCount?: number;
    searchDecisionOfficialCount?: number;
    searchDecisionFindMatchCount?: number;
    searchDecisionRecommendedRank?: number;
    searchDecisionRecommendedPath?: string;
    searchDecisionRecommendedTitle?: string;
    searchDecisionRecommendedUrl?: string;
    searchDecisionRecommendedSource?: string;
    searchDecisionRecommendedSourceScore?: number;
    searchDecisionRecommendedRelevance?: CliSearchResultShape["relevance"];
    searchDecisionRecommendedLikelyOfficial?: boolean;
    searchDecisionCommandArgs?: string[];
  } | undefined,
  kind: string | undefined,
  primaryAction: CliActionShape | undefined,
  searchResults: CliSearchResultShape[],
  recommendedResult: CliSearchResultShape | undefined,
  agentResultCount: number | undefined,
): number {
  const decision = agent?.searchDecision;
  if (kind !== "search-results") return typeof decision === "undefined" ? 1 : 0;
  if (!decision) return 0;
  let required = 5;
  let matched = 0;
  if (decision.decision === expectedSearchDecision(primaryAction, recommendedResult)) matched += 1;
  if (decision.confidence === "low" || decision.confidence === "medium" || decision.confidence === "high") matched += 1;
  if (typeof decision.reason === "string" && decision.reason.length > 0) matched += 1;
  if (typeof agentResultCount === "number"
    ? decision.resultCount === agentResultCount
    : decision.resultCount === searchResults.length) matched += 1;
  if (typeof decision.highRelevanceCount === "number"
    && typeof decision.mediumRelevanceCount === "number"
    && typeof decision.lowRelevanceCount === "number"
    && typeof decision.officialCount === "number"
    && typeof decision.findMatchCount === "number") matched += 1;
  if (recommendedResult) {
    required += 2;
    if (decision.recommendedRank === recommendedResult.rank) matched += 1;
    if (decision.recommendedUrl === recommendedResult.url) matched += 1;
  }
  if (primaryAction?.command) {
    required += 2;
    if (decision.command === primaryAction.command) matched += 1;
    if (JSON.stringify(decision.commandArgs) === JSON.stringify(primaryAction.commandArgs)) matched += 1;
  } else if (typeof decision.commandArgs !== "undefined") {
    required += 1;
  }
  required += 9;
  if (agent?.searchDecisionName === decision.decision) matched += 1;
  if (agent?.searchDecisionConfidence === decision.confidence) matched += 1;
  if (agent?.searchDecisionReason === decision.reason) matched += 1;
  if (agent?.searchDecisionResultCount === decision.resultCount) matched += 1;
  if (agent?.searchDecisionHighRelevanceCount === decision.highRelevanceCount) matched += 1;
  if (agent?.searchDecisionMediumRelevanceCount === decision.mediumRelevanceCount) matched += 1;
  if (agent?.searchDecisionLowRelevanceCount === decision.lowRelevanceCount) matched += 1;
  if (agent?.searchDecisionOfficialCount === decision.officialCount) matched += 1;
  if (agent?.searchDecisionFindMatchCount === decision.findMatchCount) matched += 1;
  if (typeof decision.recommendedRank === "number") {
    required += 1;
    if (agent?.searchDecisionRecommendedRank === decision.recommendedRank) matched += 1;
  } else if (typeof agent?.searchDecisionRecommendedRank === "number") {
    required += 1;
  }
  if (decision.recommendedPath) {
    required += 1;
    if (agent?.searchDecisionRecommendedPath === decision.recommendedPath) matched += 1;
  } else if (agent?.searchDecisionRecommendedPath) {
    required += 1;
  }
  if (decision.recommendedTitle) {
    required += 1;
    if (agent?.searchDecisionRecommendedTitle === decision.recommendedTitle) matched += 1;
  } else if (agent?.searchDecisionRecommendedTitle) {
    required += 1;
  }
  if (decision.recommendedUrl) {
    required += 1;
    if (agent?.searchDecisionRecommendedUrl === decision.recommendedUrl) matched += 1;
  } else if (agent?.searchDecisionRecommendedUrl) {
    required += 1;
  }
  if (decision.recommendedSource) {
    required += 1;
    if (agent?.searchDecisionRecommendedSource === decision.recommendedSource) matched += 1;
  } else if (agent?.searchDecisionRecommendedSource) {
    required += 1;
  }
  if (typeof decision.recommendedSourceScore === "number") {
    required += 1;
    if (agent?.searchDecisionRecommendedSourceScore === decision.recommendedSourceScore) matched += 1;
  } else if (typeof agent?.searchDecisionRecommendedSourceScore === "number") {
    required += 1;
  }
  if (decision.recommendedRelevance) {
    required += 1;
    if (agent?.searchDecisionRecommendedRelevance === decision.recommendedRelevance) matched += 1;
  } else if (agent?.searchDecisionRecommendedRelevance) {
    required += 1;
  }
  if (typeof decision.recommendedLikelyOfficial === "boolean") {
    required += 1;
    if (agent?.searchDecisionRecommendedLikelyOfficial === decision.recommendedLikelyOfficial) matched += 1;
  } else if (typeof agent?.searchDecisionRecommendedLikelyOfficial === "boolean") {
    required += 1;
  }
  if (decision.commandArgs) {
    required += 1;
    if (JSON.stringify(agent?.searchDecisionCommandArgs) === JSON.stringify(decision.commandArgs)) matched += 1;
  } else if (agent?.searchDecisionCommandArgs) {
    required += 1;
  }
  return roundScore(matched / required);
}

function expectedSearchDecision(primaryAction: CliActionShape | undefined, recommendedResult: CliSearchResultShape | undefined): NonNullable<CliAgentSearchDecisionShape["decision"]> {
  if (primaryAction?.action === "open-result" && recommendedResult) return "open-result";
  if (primaryAction?.action === "refine-search") return "refine-search";
  return "none";
}

function scoreAgentPageDecision(
  agent: {
    pageDecision?: CliAgentPageDecisionShape;
    pageDecisionName?: CliAgentPageDecisionShape["decision"];
    pageDecisionConfidence?: CliAgentPageDecisionShape["confidence"];
    pageDecisionReason?: string;
    pageDecisionReadability?: CliAgentPageDecisionShape["readability"];
    pageDecisionReadabilityScore?: number;
    pageDecisionEvidenceCount?: number;
    pageDecisionEvidenceQualityScore?: number;
    pageDecisionSourceLinkCount?: number;
    pageDecisionSourceQualityScore?: number;
    pageDecisionReadFrom?: string;
    pageDecisionUrl?: string;
    pageDecisionCommandArgs?: string[];
  } | undefined,
  kind: string | undefined,
  primaryAction: CliActionShape | undefined,
  pageCheck: { contentEvidence?: CliContentEvidenceShape[]; sourceLinks?: Array<{ sourceScore?: number }>; readability?: { level?: "low" | "medium" | "high"; score?: number } } | undefined,
): number {
  const decision = agent?.pageDecision;
  if (kind === "search-results") return typeof decision === "undefined" ? 1 : 0;
  if (!decision) return 0;
  let required = 6;
  let matched = 0;
  if (decision.decision === expectedPageDecision(primaryAction)) matched += 1;
  if (decision.confidence === "low" || decision.confidence === "medium" || decision.confidence === "high") matched += 1;
  if (typeof decision.reason === "string" && decision.reason.length > 0) matched += 1;
  if (decision.readability === pageCheck?.readability?.level) matched += 1;
  if (decision.evidenceCount === (pageCheck?.contentEvidence?.length ?? 0)) matched += 1;
  if (decision.sourceLinkCount === (pageCheck?.sourceLinks?.length ?? 0)) matched += 1;
  if (primaryAction?.readFrom) {
    required += 1;
    if (decision.readFrom === primaryAction.readFrom) matched += 1;
  }
  if (primaryAction?.command) {
    required += 2;
    if (decision.command === primaryAction.command) matched += 1;
    if (JSON.stringify(decision.commandArgs) === JSON.stringify(primaryAction.commandArgs)) matched += 1;
  } else if (typeof decision.commandArgs !== "undefined") {
    required += 1;
  }
  if (primaryAction?.url) {
    required += 1;
    if (resolvedAgentUrl(decision, primaryAction) === primaryAction.url) matched += 1;
  } else if (decision.url || decision.urlRef) {
    required += 1;
  }
  required += 9;
  if (agent?.pageDecisionName === decision.decision) matched += 1;
  if (agent?.pageDecisionConfidence === decision.confidence) matched += 1;
  if (agent?.pageDecisionReason === decision.reason) matched += 1;
  if (agent?.pageDecisionReadability === decision.readability) matched += 1;
  if (agent?.pageDecisionReadabilityScore === decision.readabilityScore) matched += 1;
  if (agent?.pageDecisionEvidenceCount === decision.evidenceCount) matched += 1;
  if (agent?.pageDecisionEvidenceQualityScore === decision.evidenceQualityScore) matched += 1;
  if (agent?.pageDecisionSourceLinkCount === decision.sourceLinkCount) matched += 1;
  if (agent?.pageDecisionSourceQualityScore === decision.sourceQualityScore) matched += 1;
  if (decision.readFrom) {
    required += 1;
    if (agent?.pageDecisionReadFrom === decision.readFrom) matched += 1;
  } else if (agent?.pageDecisionReadFrom) {
    required += 1;
  }
  if (decision.url) {
    required += 1;
    if (agent?.pageDecisionUrl === decision.url) matched += 1;
  } else if (agent?.pageDecisionUrl) {
    required += 1;
  }
  if (decision.commandArgs) {
    required += 1;
    if (JSON.stringify(agent?.pageDecisionCommandArgs) === JSON.stringify(decision.commandArgs)) matched += 1;
  } else if (agent?.pageDecisionCommandArgs) {
    required += 1;
  }
  return roundScore(matched / required);
}

function expectedPageDecision(primaryAction: CliActionShape | undefined): NonNullable<CliAgentPageDecisionShape["decision"]> {
  if (primaryAction?.action === "use-evidence") return "read-content";
  if (primaryAction?.action === "read-content") return "read-content";
  if (primaryAction?.action === "open-source-link") return "open-source-link";
  if (primaryAction?.action === "open-site-search") return "open-site-search";
  if (primaryAction?.action === "retry-with-browser-html") return "retry-with-browser-html";
  if (primaryAction?.requiresBrowserInteraction || primaryAction?.execution === "interact-browser") return "inspect-actions";
  return "none";
}

function scoreAgentSemanticSummary(agent: {
  semanticSummary?: unknown;
  semanticNodeCount?: number;
  semanticNamedRoleCount?: number;
  semanticInteractiveCount?: number;
  semanticFocusableCount?: number;
  semanticHeadingCount?: number;
  semanticLandmarkCount?: number;
  semanticLinkCount?: number;
  semanticButtonCount?: number;
  semanticImageCount?: number;
  semanticTableCount?: number;
  semanticListCount?: number;
  semanticFieldCount?: number;
  semanticDescriptionCount?: number;
  semanticValueCount?: number;
  semanticRelationCount?: number;
  semanticChoiceCount?: number;
  semanticStateCount?: number;
  semanticUnavailableCount?: number;
  semanticTopRole?: string;
  semanticTopRoleCount?: number;
  semanticOutlineCount?: number;
  semanticTopOutlinePath?: string;
  semanticTopOutlineKind?: "heading" | "landmark";
  semanticTopOutlineRole?: string;
  semanticTopOutlineText?: string;
  semanticTopOutlineLevel?: number;
  semanticTopOutlineDepth?: number;
  semanticTopOutlineParentPath?: string;
  semanticTopOutlineParentRole?: string;
  semanticTopOutlineParentName?: string;
  semanticTopOutlineSelector?: string;
  semanticKeyboardShortcutCount?: number;
  semanticTopKeyboardShortcutPath?: string;
  semanticTopKeyboardShortcutRole?: string;
  semanticTopKeyboardShortcutName?: string;
  semanticTopKeyboardShortcutKeys?: string[];
  semanticTopKeyboardShortcutAccessKey?: string;
  semanticTopKeyboardShortcutTabIndex?: number;
  semanticTopKeyboardShortcutFocusable?: boolean;
  semanticTopKeyboardShortcutSelector?: string;
  semanticTopHeading?: string;
  semanticTopHeadingPath?: string;
  semanticTopHeadingLevel?: number;
  semanticTopLandmark?: string;
  semanticTopLandmarkPath?: string;
  semanticTopLandmarkRole?: string;
  semanticTopLandmarkName?: string;
  semanticTopNamedRole?: string;
  semanticTopNamedRolePath?: string;
  semanticTopNamedRoleRole?: string;
  semanticTopNamedRoleName?: string;
  semanticTopNamedRoleDescription?: string;
  semanticTopInteractiveRole?: string;
  semanticTopInteractivePath?: string;
  semanticTopInteractiveName?: string;
  semanticTopInteractiveRoleDescription?: string;
  semanticTopInteractiveDescription?: string;
  semanticTopInteractiveValue?: string;
  semanticTopInteractiveState?: string;
  semanticTopInteractiveDisabled?: boolean;
  semanticTopInteractiveSelector?: string;
  semanticTopFocusableRole?: string;
  semanticTopFocusablePath?: string;
  semanticTopFocusableName?: string;
  semanticTopFocusableRoleDescription?: string;
  semanticTopFocusableState?: string;
  semanticTopFocusableSelector?: string;
  semanticTopLinkName?: string;
  semanticTopLinkPath?: string;
  semanticTopLinkUrl?: string;
  semanticTopLinkTarget?: string;
  semanticTopLinkRel?: string[];
  semanticTopLinkType?: string;
  semanticTopLinkHreflang?: string;
  semanticTopLinkState?: string;
  semanticTopLinkCurrent?: boolean | string;
  semanticTopLinkDownload?: string | true;
  semanticTopLinkSelector?: string;
  semanticInPageLinkCount?: number;
  semanticTopInPageLinkPath?: string;
  semanticTopInPageLinkKind?: "skip" | "anchor";
  semanticTopInPageLinkName?: string;
  semanticTopInPageLinkUrl?: string;
  semanticTopInPageLinkTargetId?: string;
  semanticTopInPageLinkSelector?: string;
  semanticTopButtonName?: string;
  semanticTopButtonPath?: string;
  semanticTopButtonRoleDescription?: string;
  semanticTopButtonDescription?: string;
  semanticTopButtonType?: string;
  semanticTopButtonState?: string;
  semanticTopButtonDisabled?: boolean;
  semanticTopButtonPressed?: boolean | "mixed";
  semanticTopButtonExpanded?: boolean;
  semanticTopButtonHaspopup?: boolean | string;
  semanticTopButtonControls?: string;
  semanticTopButtonFormAction?: string;
  semanticTopButtonFormMethod?: string;
  semanticTopButtonFormTarget?: string;
  semanticTopButtonFormEncType?: string;
  semanticTopButtonFormNoValidate?: boolean;
  semanticTopButtonFormId?: string;
  semanticTopButtonSelector?: string;
  semanticTopImagePath?: string;
  semanticTopImageName?: string;
  semanticTopImageUrl?: string;
  semanticTopImageWidth?: number;
  semanticTopImageHeight?: number;
  semanticTopImageLoading?: string;
  semanticTopImageDecoding?: string;
  semanticTopImageSrcset?: string;
  semanticTopImageSizes?: string;
  semanticTopImageSelector?: string;
  semanticTopTableRole?: string;
  semanticTopTablePath?: string;
  semanticTopTableName?: string;
  semanticTopTableRowCount?: number;
  semanticTopTableCellCount?: number;
  semanticTopTableDeclaredRowCount?: number;
  semanticTopTableDeclaredColumnCount?: number;
  semanticTopTableHeaders?: string[];
  semanticTopTableHeaderRefs?: Array<{ path?: string; text?: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }>;
  semanticTopTableOwnedCount?: number;
  semanticTopTableOwnedRefs?: Array<{ target?: string; role?: string; name?: string; selector?: string }>;
  semanticTopTableSampleCells?: string[];
  semanticTopTableSampleCellRefs?: Array<{ path?: string; text?: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selector?: string }>;
  semanticTopTableFirstHeader?: string;
  semanticTopTableFirstHeaderPath?: string;
  semanticTopTableFirstHeaderRole?: string;
  semanticTopTableFirstHeaderRowIndex?: number;
  semanticTopTableFirstHeaderColumnIndex?: number;
  semanticTopTableFirstHeaderSort?: string;
  semanticTopTableFirstHeaderSelector?: string;
  semanticTopTableFirstOwnedTarget?: string;
  semanticTopTableFirstOwnedRole?: string;
  semanticTopTableFirstOwnedName?: string;
  semanticTopTableFirstOwnedSelector?: string;
  semanticTopTableFirstSampleCellPath?: string;
  semanticTopTableFirstSampleCellText?: string;
  semanticTopTableFirstSampleCellRowIndex?: number;
  semanticTopTableFirstSampleCellColumnIndex?: number;
  semanticTopTableFirstSampleCellRowSpan?: number;
  semanticTopTableFirstSampleCellColumnSpan?: number;
  semanticTopTableFirstSampleCellHeaders?: string[];
  semanticTopTableFirstSampleCellRowHeaders?: string[];
  semanticTopTableFirstSampleCellColumnHeaders?: string[];
  semanticTopTableFirstSampleCellSelector?: string;
  semanticTopTableSelector?: string;
  semanticTopListRole?: string;
  semanticTopListPath?: string;
  semanticTopListName?: string;
  semanticTopListItemCount?: number;
  semanticTopListItems?: string[];
  semanticTopListItemRefs?: Array<{ text?: string; role?: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: boolean | string; expanded?: boolean; selector?: string }>;
  semanticTopListSelector?: string;
  semanticTopFieldRole?: string;
  semanticTopFieldPath?: string;
  semanticTopFieldName?: string;
  semanticTopFieldDescription?: string;
  semanticTopFieldValue?: string;
  semanticTopFieldHtmlName?: string;
  semanticTopFieldHtmlType?: string;
  semanticTopFieldPlaceholder?: string;
  semanticTopFieldAriaPlaceholder?: string;
  semanticTopFieldAutocomplete?: string;
  semanticTopFieldAriaAutocomplete?: string;
  semanticTopFieldInputMode?: string;
  semanticTopFieldPattern?: string;
  semanticTopFieldMin?: string;
  semanticTopFieldMax?: string;
  semanticTopFieldStep?: string;
  semanticTopFieldMinLength?: number;
  semanticTopFieldMaxLength?: number;
  semanticTopFieldLabelledBy?: string;
  semanticTopFieldLabelledByText?: string;
  semanticTopFieldDescribedBy?: string;
  semanticTopFieldDescribedByText?: string;
  semanticTopFieldDetails?: string;
  semanticTopFieldDetailsText?: string;
  semanticTopFieldErrorMessage?: string;
  semanticTopFieldErrorMessageText?: string;
  semanticTopFieldState?: string;
  semanticTopFieldDisabled?: boolean;
  semanticTopFieldRequired?: boolean;
  semanticTopFieldReadonly?: boolean;
  semanticTopFieldInvalid?: boolean | string;
  semanticTopFieldChecked?: boolean | "mixed";
  semanticTopFieldExpanded?: boolean;
  semanticTopFieldHaspopup?: boolean | string;
  semanticTopFieldControls?: string;
  semanticTopFieldValueMin?: number;
  semanticTopFieldValueMax?: number;
  semanticTopFieldValueNow?: number;
  semanticTopFieldValueText?: string;
  semanticTopFieldSelector?: string;
  semanticTopDescriptionRole?: string;
  semanticTopDescriptionPath?: string;
  semanticTopDescriptionName?: string;
  semanticTopDescriptionText?: string;
  semanticTopDescriptionSelector?: string;
  semanticTopValueRole?: string;
  semanticTopValuePath?: string;
  semanticTopValueName?: string;
  semanticTopValue?: string;
  semanticTopValueSelector?: string;
  semanticTopRelationRole?: string;
  semanticTopRelationPath?: string;
  semanticTopRelationName?: string;
  semanticTopRelation?: string;
  semanticTopRelationTarget?: string;
  semanticTopRelationTargetRole?: string;
  semanticTopRelationTargetName?: string;
  semanticTopRelationTargetSelector?: string;
  semanticTopRelationSelector?: string;
  semanticTopChoiceRole?: string;
  semanticTopChoicePath?: string;
  semanticTopChoiceName?: string;
  semanticTopChoiceState?: string;
  semanticTopChoiceSelected?: boolean;
  semanticTopChoiceCurrent?: boolean | string;
  semanticTopChoiceLevel?: number;
  semanticTopChoicePosInSet?: number;
  semanticTopChoiceSetSize?: number;
  semanticTopChoiceSelector?: string;
  semanticTopStateRole?: string;
  semanticTopStatePath?: string;
  semanticTopStateName?: string;
  semanticTopState?: string;
  semanticTopStateHidden?: boolean;
  semanticTopStateDisabled?: boolean;
  semanticTopStateBusy?: boolean;
  semanticTopStateMultiselectable?: boolean;
  semanticTopStateSort?: string;
  semanticTopStateGrabbed?: boolean;
  semanticTopStateDropEffect?: string;
  semanticTopStateChecked?: boolean | "mixed";
  semanticTopStateSelected?: boolean;
  semanticTopStateExpanded?: boolean;
  semanticTopStatePressed?: boolean | "mixed";
  semanticTopStateFocused?: boolean;
  semanticTopStateRequired?: boolean;
  semanticTopStateInvalid?: boolean | string;
  semanticTopStateReadonly?: boolean;
  semanticTopStateCurrent?: boolean | string;
  semanticTopStateHaspopup?: boolean | string;
  semanticTopStateControls?: string;
  semanticTopStateLive?: string;
  semanticTopStateModal?: boolean;
  semanticTopStateOrientation?: string;
  semanticTopStateValueMin?: number;
  semanticTopStateValueMax?: number;
  semanticTopStateValueNow?: number;
  semanticTopStateValueText?: string;
  semanticTopStateSelector?: string;
  semanticTopUnavailablePath?: string;
  semanticTopUnavailableTag?: string;
  semanticTopUnavailableRole?: string;
  semanticTopUnavailableName?: string;
  semanticTopUnavailableReason?: string;
  semanticTopUnavailableSelector?: string;
} | undefined): number {
  const summary = agent?.semanticSummary;
  if (!summary || typeof summary !== "object") return 0;
  const item = summary as {
    nodeCount?: unknown;
    namedRoleCount?: unknown;
    interactiveCount?: unknown;
    focusableCount?: unknown;
    headingCount?: unknown;
    landmarkCount?: unknown;
    linkCount?: unknown;
    buttonCount?: unknown;
    imageCount?: unknown;
    tableCount?: unknown;
    listCount?: unknown;
    fieldCount?: unknown;
    descriptionCount?: unknown;
    valueCount?: unknown;
    relationCount?: unknown;
    choiceCount?: unknown;
    stateCount?: unknown;
    unavailableCount?: unknown;
    roleCounts?: unknown;
    topRoles?: unknown;
    landmarks?: unknown;
    headings?: unknown;
    namedRoles?: unknown;
    semanticOutline?: unknown;
    keyboardItems?: unknown;
    headingItems?: unknown;
    landmarkItems?: unknown;
    namedRoleItems?: unknown;
    interactiveRoles?: unknown;
    focusableItems?: unknown;
    links?: unknown;
    inPageLinks?: unknown;
    buttons?: unknown;
    imageItems?: unknown;
    tableItems?: unknown;
    listItems?: unknown;
    fieldItems?: unknown;
    descriptionItems?: unknown;
    valueItems?: unknown;
    relationItems?: unknown;
    choiceItems?: unknown;
    stateItems?: unknown;
    unavailableItems?: unknown;
  };
  let matched = 0;
  if (typeof item.nodeCount === "number" && item.nodeCount > 0) matched += 1;
  if (typeof item.namedRoleCount === "number" && item.namedRoleCount >= 0) matched += 1;
  if (typeof item.interactiveCount === "number" && item.interactiveCount >= 0) matched += 1;
  if (typeof item.focusableCount === "number" && item.focusableCount >= 0) matched += 1;
  if (typeof item.headingCount === "number" && item.headingCount >= 0) matched += 1;
  if (typeof item.landmarkCount === "number" && item.landmarkCount >= 0) matched += 1;
  if (typeof item.linkCount === "number" && item.linkCount >= 0) matched += 1;
  if (typeof item.buttonCount === "number" && item.buttonCount >= 0) matched += 1;
  if (typeof item.imageCount === "number" && item.imageCount >= 0) matched += 1;
  if (typeof item.tableCount === "number" && item.tableCount >= 0) matched += 1;
  if (typeof item.listCount === "number" && item.listCount >= 0) matched += 1;
  if (typeof item.fieldCount === "number" && item.fieldCount >= 0) matched += 1;
  if (typeof item.descriptionCount === "number" && item.descriptionCount >= 0) matched += 1;
  if (typeof item.valueCount === "number" && item.valueCount >= 0) matched += 1;
  if (typeof item.relationCount === "number" && item.relationCount >= 0) matched += 1;
  if (typeof item.choiceCount === "number" && item.choiceCount >= 0) matched += 1;
  if (typeof item.stateCount === "number" && item.stateCount >= 0) matched += 1;
  if (typeof item.unavailableCount === "number" && item.unavailableCount >= 0) matched += 1;
  if (item.roleCounts && typeof item.roleCounts === "object" && Object.keys(item.roleCounts).length > 0) matched += 1;
  if (Array.isArray(item.topRoles) && item.topRoles.length > 0 && item.topRoles.every((role) => {
    if (!role || typeof role !== "object") return false;
    const record = role as { role?: unknown; count?: unknown };
    return typeof record.role === "string" && record.role.length > 0 && typeof record.count === "number" && record.count > 0;
  })) matched += 1;
  if (Array.isArray(item.landmarks)) matched += 1;
  if (Array.isArray(item.headings)) matched += 1;
  if (Array.isArray(item.namedRoles)) matched += 1;
  if (Array.isArray(item.semanticOutline)) matched += 1;
  if (Array.isArray(item.keyboardItems)) matched += 1;
  if (Array.isArray(item.headingItems)) matched += 1;
  if (Array.isArray(item.landmarkItems)) matched += 1;
  if (Array.isArray(item.namedRoleItems)) matched += 1;
  if (Array.isArray(item.interactiveRoles)) matched += 1;
  if (Array.isArray(item.focusableItems)) matched += 1;
  if (Array.isArray(item.links)) matched += 1;
  if (Array.isArray(item.inPageLinks)) matched += 1;
  if (Array.isArray(item.buttons)) matched += 1;
  if (Array.isArray(item.imageItems)) matched += 1;
  if (Array.isArray(item.tableItems)) matched += 1;
  if (Array.isArray(item.listItems)) matched += 1;
  if (Array.isArray(item.fieldItems)) matched += 1;
  if (Array.isArray(item.descriptionItems)) matched += 1;
  if (Array.isArray(item.valueItems)) matched += 1;
  if (Array.isArray(item.relationItems)) matched += 1;
  if (Array.isArray(item.choiceItems)) matched += 1;
  if (Array.isArray(item.stateItems)) matched += 1;
  if (Array.isArray(item.unavailableItems)) matched += 1;
  let required = 43;
  if (typeof item.nodeCount === "number") {
    required += 1;
    if (agent?.semanticNodeCount === item.nodeCount) matched += 1;
  }
  if (typeof item.namedRoleCount === "number") {
    required += 1;
    if (agent?.semanticNamedRoleCount === item.namedRoleCount) matched += 1;
  }
  if (typeof item.interactiveCount === "number") {
    required += 1;
    if (agent?.semanticInteractiveCount === item.interactiveCount) matched += 1;
  }
  if (typeof item.focusableCount === "number") {
    required += 1;
    if (agent?.semanticFocusableCount === item.focusableCount) matched += 1;
  }
  if (typeof item.headingCount === "number") {
    required += 1;
    if (agent?.semanticHeadingCount === item.headingCount) matched += 1;
  }
  if (typeof item.landmarkCount === "number") {
    required += 1;
    if (agent?.semanticLandmarkCount === item.landmarkCount) matched += 1;
  }
  if (typeof item.linkCount === "number") {
    required += 1;
    if (agent?.semanticLinkCount === item.linkCount) matched += 1;
  }
  if (typeof item.buttonCount === "number") {
    required += 1;
    if (agent?.semanticButtonCount === item.buttonCount) matched += 1;
  }
  if (typeof item.imageCount === "number") {
    required += 1;
    if (agent?.semanticImageCount === item.imageCount) matched += 1;
  }
  if (typeof item.tableCount === "number") {
    required += 1;
    if (agent?.semanticTableCount === item.tableCount) matched += 1;
  }
  if (typeof item.listCount === "number") {
    required += 1;
    if (agent?.semanticListCount === item.listCount) matched += 1;
  }
  if (typeof item.fieldCount === "number") {
    required += 1;
    if (agent?.semanticFieldCount === item.fieldCount) matched += 1;
  }
  if (typeof item.descriptionCount === "number") {
    required += 1;
    if (agent?.semanticDescriptionCount === item.descriptionCount) matched += 1;
  }
  if (typeof item.valueCount === "number") {
    required += 1;
    if (agent?.semanticValueCount === item.valueCount) matched += 1;
  }
  if (typeof item.relationCount === "number") {
    required += 1;
    if (agent?.semanticRelationCount === item.relationCount) matched += 1;
  }
  if (typeof item.choiceCount === "number") {
    required += 1;
    if (agent?.semanticChoiceCount === item.choiceCount) matched += 1;
  }
  if (typeof item.stateCount === "number") {
    required += 1;
    if (agent?.semanticStateCount === item.stateCount) matched += 1;
  }
  if (typeof item.unavailableCount === "number") {
    required += 1;
    if (agent?.semanticUnavailableCount === item.unavailableCount) matched += 1;
  }
  const topRole = Array.isArray(item.topRoles) ? item.topRoles[0] as { role?: unknown; count?: unknown } | undefined : undefined;
  if (topRole && typeof topRole.role === "string") {
    required += 1;
    if (agent?.semanticTopRole === topRole.role) matched += 1;
  }
  if (topRole && typeof topRole.count === "number") {
    required += 1;
    if (agent?.semanticTopRoleCount === topRole.count) matched += 1;
  }
  if (Array.isArray(item.semanticOutline)) {
    required += 1;
    if (agent?.semanticOutlineCount === item.semanticOutline.length) matched += 1;
  }
  const outlineItem = Array.isArray(item.semanticOutline) ? item.semanticOutline[0] as { path?: unknown; kind?: unknown; role?: unknown; text?: unknown; level?: unknown; depth?: unknown; parentPath?: unknown; parentRole?: unknown; parentName?: unknown; selector?: unknown } | undefined : undefined;
  if (outlineItem && typeof outlineItem.path === "string") {
    required += 1;
    if (agent?.semanticTopOutlinePath === outlineItem.path) matched += 1;
  }
  if (outlineItem && typeof outlineItem.kind === "string") {
    required += 1;
    if (agent?.semanticTopOutlineKind === outlineItem.kind) matched += 1;
  }
  if (outlineItem && typeof outlineItem.role === "string") {
    required += 1;
    if (agent?.semanticTopOutlineRole === outlineItem.role) matched += 1;
  }
  if (outlineItem && typeof outlineItem.text === "string") {
    required += 1;
    if (agent?.semanticTopOutlineText === outlineItem.text) matched += 1;
  }
  if (outlineItem && typeof outlineItem.level === "number") {
    required += 1;
    if (agent?.semanticTopOutlineLevel === outlineItem.level) matched += 1;
  }
  if (outlineItem && typeof outlineItem.depth === "number") {
    required += 1;
    if (agent?.semanticTopOutlineDepth === outlineItem.depth) matched += 1;
  }
  if (outlineItem && typeof outlineItem.parentPath === "string") {
    required += 1;
    if (agent?.semanticTopOutlineParentPath === outlineItem.parentPath) matched += 1;
  }
  if (outlineItem && typeof outlineItem.parentRole === "string") {
    required += 1;
    if (agent?.semanticTopOutlineParentRole === outlineItem.parentRole) matched += 1;
  }
  if (outlineItem && typeof outlineItem.parentName === "string") {
    required += 1;
    if (agent?.semanticTopOutlineParentName === outlineItem.parentName) matched += 1;
  }
  if (outlineItem && typeof outlineItem.selector === "string") {
    required += 1;
    if (agent?.semanticTopOutlineSelector === outlineItem.selector) matched += 1;
  }
  if (Array.isArray(item.keyboardItems)) {
    required += 1;
    if (agent?.semanticKeyboardShortcutCount === item.keyboardItems.length) matched += 1;
  }
  const keyboardItem = Array.isArray(item.keyboardItems) ? item.keyboardItems[0] as { path?: unknown; role?: unknown; name?: unknown; shortcuts?: unknown; accessKey?: unknown; tabIndex?: unknown; focusable?: unknown; selector?: unknown } | undefined : undefined;
  if (keyboardItem && typeof keyboardItem.path === "string") {
    required += 1;
    if (agent?.semanticTopKeyboardShortcutPath === keyboardItem.path) matched += 1;
  }
  if (keyboardItem && typeof keyboardItem.role === "string") {
    required += 1;
    if (agent?.semanticTopKeyboardShortcutRole === keyboardItem.role) matched += 1;
  }
  if (keyboardItem && typeof keyboardItem.name === "string") {
    required += 1;
    if (agent?.semanticTopKeyboardShortcutName === keyboardItem.name) matched += 1;
  }
  if (keyboardItem && Array.isArray(keyboardItem.shortcuts)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopKeyboardShortcutKeys) === JSON.stringify(keyboardItem.shortcuts)) matched += 1;
  }
  if (keyboardItem && typeof keyboardItem.accessKey === "string") {
    required += 1;
    if (agent?.semanticTopKeyboardShortcutAccessKey === keyboardItem.accessKey) matched += 1;
  }
  if (keyboardItem && typeof keyboardItem.tabIndex === "number") {
    required += 1;
    if (agent?.semanticTopKeyboardShortcutTabIndex === keyboardItem.tabIndex) matched += 1;
  }
  if (keyboardItem && typeof keyboardItem.focusable === "boolean") {
    required += 1;
    if (agent?.semanticTopKeyboardShortcutFocusable === keyboardItem.focusable) matched += 1;
  }
  if (keyboardItem && typeof keyboardItem.selector === "string") {
    required += 1;
    if (agent?.semanticTopKeyboardShortcutSelector === keyboardItem.selector) matched += 1;
  }
  const heading = Array.isArray(item.headings) ? item.headings[0] : undefined;
  if (typeof heading === "string") {
    required += 1;
    if (agent?.semanticTopHeading === heading) matched += 1;
  }
  const headingItem = Array.isArray(item.headingItems) ? item.headingItems[0] as { path?: unknown; text?: unknown; level?: unknown } | undefined : undefined;
  if (headingItem && typeof headingItem.path === "string") {
    required += 1;
    if (agent?.semanticTopHeadingPath === headingItem.path) matched += 1;
  }
  if (headingItem && typeof headingItem.level === "number") {
    required += 1;
    if (agent?.semanticTopHeadingLevel === headingItem.level) matched += 1;
  }
  const landmark = Array.isArray(item.landmarks) ? item.landmarks[0] : undefined;
  if (typeof landmark === "string") {
    required += 1;
    if (agent?.semanticTopLandmark === landmark) matched += 1;
  }
  const landmarkItem = Array.isArray(item.landmarkItems) ? item.landmarkItems[0] as { path?: unknown; role?: unknown; name?: unknown } | undefined : undefined;
  if (landmarkItem && typeof landmarkItem.path === "string") {
    required += 1;
    if (agent?.semanticTopLandmarkPath === landmarkItem.path) matched += 1;
  }
  if (landmarkItem && typeof landmarkItem.role === "string") {
    required += 1;
    if (agent?.semanticTopLandmarkRole === landmarkItem.role) matched += 1;
  }
  if (landmarkItem && typeof landmarkItem.name === "string") {
    required += 1;
    if (agent?.semanticTopLandmarkName === landmarkItem.name) matched += 1;
  }
  const namedRole = Array.isArray(item.namedRoles) ? item.namedRoles[0] : undefined;
  if (typeof namedRole === "string") {
    required += 1;
    if (agent?.semanticTopNamedRole === namedRole) matched += 1;
  }
  const namedRoleItem = Array.isArray(item.namedRoleItems) ? item.namedRoleItems[0] as { path?: unknown; role?: unknown; name?: unknown; roleDescription?: unknown } | undefined : undefined;
  if (namedRoleItem && typeof namedRoleItem.path === "string") {
    required += 1;
    if (agent?.semanticTopNamedRolePath === namedRoleItem.path) matched += 1;
  }
  if (namedRoleItem && typeof namedRoleItem.role === "string") {
    required += 1;
    if (agent?.semanticTopNamedRoleRole === namedRoleItem.role) matched += 1;
  }
  if (namedRoleItem && typeof namedRoleItem.name === "string") {
    required += 1;
    if (agent?.semanticTopNamedRoleName === namedRoleItem.name) matched += 1;
  }
  if (namedRoleItem && typeof namedRoleItem.roleDescription === "string") {
    required += 1;
    if (agent?.semanticTopNamedRoleDescription === namedRoleItem.roleDescription) matched += 1;
  }
  const interactive = Array.isArray(item.interactiveRoles) ? item.interactiveRoles[0] as { path?: unknown; role?: unknown; name?: unknown; roleDescription?: unknown; description?: unknown; value?: unknown; state?: unknown; selector?: unknown } | undefined : undefined;
  if (interactive && typeof interactive.role === "string") {
    required += 1;
    if (agent?.semanticTopInteractiveRole === interactive.role) matched += 1;
  }
  if (interactive && typeof interactive.path === "string") {
    required += 1;
    if (agent?.semanticTopInteractivePath === interactive.path) matched += 1;
  }
  if (interactive && typeof interactive.name === "string") {
    required += 1;
    if (agent?.semanticTopInteractiveName === interactive.name) matched += 1;
  }
  if (interactive && typeof interactive.roleDescription === "string") {
    required += 1;
    if (agent?.semanticTopInteractiveRoleDescription === interactive.roleDescription) matched += 1;
  }
  if (interactive && typeof interactive.description === "string") {
    required += 1;
    if (agent?.semanticTopInteractiveDescription === interactive.description) matched += 1;
  }
  if (interactive && typeof interactive.value === "string") {
    required += 1;
    if (agent?.semanticTopInteractiveValue === interactive.value) matched += 1;
  }
  if (interactive?.state && typeof interactive.state === "object") {
    const state = Object.entries(interactive.state as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    if (state) {
      required += 1;
      if (agent?.semanticTopInteractiveState === state) matched += 1;
    }
    const disabled = (interactive.state as { disabled?: unknown }).disabled;
    if (typeof disabled === "boolean") {
      required += 1;
      if (agent?.semanticTopInteractiveDisabled === disabled) matched += 1;
    }
  }
  if (interactive && typeof interactive.selector === "string") {
    required += 1;
    if (agent?.semanticTopInteractiveSelector === interactive.selector) matched += 1;
  }
  const focusable = Array.isArray(item.focusableItems) ? item.focusableItems[0] as { path?: unknown; role?: unknown; name?: unknown; roleDescription?: unknown; state?: unknown; selector?: unknown } | undefined : undefined;
  if (focusable && typeof focusable.role === "string") {
    required += 1;
    if (agent?.semanticTopFocusableRole === focusable.role) matched += 1;
  }
  if (focusable && typeof focusable.path === "string") {
    required += 1;
    if (agent?.semanticTopFocusablePath === focusable.path) matched += 1;
  }
  if (focusable && typeof focusable.name === "string") {
    required += 1;
    if (agent?.semanticTopFocusableName === focusable.name) matched += 1;
  }
  if (focusable && typeof focusable.roleDescription === "string") {
    required += 1;
    if (agent?.semanticTopFocusableRoleDescription === focusable.roleDescription) matched += 1;
  }
  if (focusable?.state && typeof focusable.state === "object") {
    const state = Object.entries(focusable.state as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    if (state) {
      required += 1;
      if (agent?.semanticTopFocusableState === state) matched += 1;
    }
  }
  if (focusable && typeof focusable.selector === "string") {
    required += 1;
    if (agent?.semanticTopFocusableSelector === focusable.selector) matched += 1;
  }
  const link = Array.isArray(item.links) ? item.links[0] as { path?: unknown; name?: unknown; url?: unknown; target?: unknown; rel?: unknown; type?: unknown; hreflang?: unknown; state?: unknown; current?: unknown; download?: unknown; selector?: unknown } | undefined : undefined;
  if (link && typeof link.name === "string") {
    required += 1;
    if (agent?.semanticTopLinkName === link.name) matched += 1;
  }
  if (link && typeof link.path === "string") {
    required += 1;
    if (agent?.semanticTopLinkPath === link.path) matched += 1;
  }
  if (link && typeof link.url === "string") {
    required += 1;
    if (agent?.semanticTopLinkUrl === link.url) matched += 1;
  }
  if (link && typeof link.target === "string") {
    required += 1;
    if (agent?.semanticTopLinkTarget === link.target) matched += 1;
  }
  if (link && Array.isArray(link.rel)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopLinkRel) === JSON.stringify(link.rel)) matched += 1;
  }
  if (link && typeof link.type === "string") {
    required += 1;
    if (agent?.semanticTopLinkType === link.type) matched += 1;
  }
  if (link && typeof link.hreflang === "string") {
    required += 1;
    if (agent?.semanticTopLinkHreflang === link.hreflang) matched += 1;
  }
  if (link && typeof link.state === "string") {
    required += 1;
    if (agent?.semanticTopLinkState === link.state) matched += 1;
  }
  if (link && (typeof link.current === "string" || typeof link.current === "boolean")) {
    required += 1;
    if (agent?.semanticTopLinkCurrent === link.current) matched += 1;
  }
  if (link && (typeof link.download === "string" || link.download === true)) {
    required += 1;
    if (agent?.semanticTopLinkDownload === link.download) matched += 1;
  }
  if (link && typeof link.selector === "string") {
    required += 1;
    if (agent?.semanticTopLinkSelector === link.selector) matched += 1;
  }
  if (Array.isArray(item.inPageLinks)) {
    required += 1;
    if (agent?.semanticInPageLinkCount === item.inPageLinks.length) matched += 1;
  }
  const inPageLink = Array.isArray(item.inPageLinks) ? item.inPageLinks[0] as { path?: unknown; kind?: unknown; name?: unknown; url?: unknown; targetId?: unknown; selector?: unknown } | undefined : undefined;
  if (inPageLink && typeof inPageLink.path === "string") {
    required += 1;
    if (agent?.semanticTopInPageLinkPath === inPageLink.path) matched += 1;
  }
  if (inPageLink && typeof inPageLink.kind === "string") {
    required += 1;
    if (agent?.semanticTopInPageLinkKind === inPageLink.kind) matched += 1;
  }
  if (inPageLink && typeof inPageLink.name === "string") {
    required += 1;
    if (agent?.semanticTopInPageLinkName === inPageLink.name) matched += 1;
  }
  if (inPageLink && typeof inPageLink.url === "string") {
    required += 1;
    if (agent?.semanticTopInPageLinkUrl === inPageLink.url) matched += 1;
  }
  if (inPageLink && typeof inPageLink.targetId === "string") {
    required += 1;
    if (agent?.semanticTopInPageLinkTargetId === inPageLink.targetId) matched += 1;
  }
  if (inPageLink && typeof inPageLink.selector === "string") {
    required += 1;
    if (agent?.semanticTopInPageLinkSelector === inPageLink.selector) matched += 1;
  }
  const button = Array.isArray(item.buttons) ? item.buttons[0] as { path?: unknown; name?: unknown; roleDescription?: unknown; description?: unknown; type?: unknown; state?: unknown; disabled?: unknown; pressed?: unknown; expanded?: unknown; haspopup?: unknown; controls?: unknown; formAction?: unknown; formMethod?: unknown; formTarget?: unknown; formEncType?: unknown; formNoValidate?: unknown; formId?: unknown; selector?: unknown } | undefined : undefined;
  if (button && typeof button.name === "string") {
    required += 1;
    if (agent?.semanticTopButtonName === button.name) matched += 1;
  }
  if (button && typeof button.path === "string") {
    required += 1;
    if (agent?.semanticTopButtonPath === button.path) matched += 1;
  }
  if (button && typeof button.roleDescription === "string") {
    required += 1;
    if (agent?.semanticTopButtonRoleDescription === button.roleDescription) matched += 1;
  }
  if (button && typeof button.description === "string") {
    required += 1;
    if (agent?.semanticTopButtonDescription === button.description) matched += 1;
  }
  if (button && typeof button.type === "string") {
    required += 1;
    if (agent?.semanticTopButtonType === button.type) matched += 1;
  }
  if (button && typeof button.state === "string") {
    required += 1;
    if (agent?.semanticTopButtonState === button.state) matched += 1;
  }
  if (button && typeof button.disabled === "boolean") {
    required += 1;
    if (agent?.semanticTopButtonDisabled === button.disabled) matched += 1;
  }
  if (button && (typeof button.pressed === "boolean" || button.pressed === "mixed")) {
    required += 1;
    if (agent?.semanticTopButtonPressed === button.pressed) matched += 1;
  }
  if (button && typeof button.expanded === "boolean") {
    required += 1;
    if (agent?.semanticTopButtonExpanded === button.expanded) matched += 1;
  }
  if (button && (typeof button.haspopup === "string" || typeof button.haspopup === "boolean")) {
    required += 1;
    if (agent?.semanticTopButtonHaspopup === button.haspopup) matched += 1;
  }
  if (button && typeof button.controls === "string") {
    required += 1;
    if (agent?.semanticTopButtonControls === button.controls) matched += 1;
  }
  if (button && typeof button.formAction === "string") {
    required += 1;
    if (agent?.semanticTopButtonFormAction === button.formAction) matched += 1;
  }
  if (button && typeof button.formMethod === "string") {
    required += 1;
    if (agent?.semanticTopButtonFormMethod === button.formMethod) matched += 1;
  }
  if (button && typeof button.formTarget === "string") {
    required += 1;
    if (agent?.semanticTopButtonFormTarget === button.formTarget) matched += 1;
  }
  if (button && typeof button.formEncType === "string") {
    required += 1;
    if (agent?.semanticTopButtonFormEncType === button.formEncType) matched += 1;
  }
  if (button && typeof button.formNoValidate === "boolean") {
    required += 1;
    if (agent?.semanticTopButtonFormNoValidate === button.formNoValidate) matched += 1;
  }
  if (button && typeof button.formId === "string") {
    required += 1;
    if (agent?.semanticTopButtonFormId === button.formId) matched += 1;
  }
  if (button && typeof button.selector === "string") {
    required += 1;
    if (agent?.semanticTopButtonSelector === button.selector) matched += 1;
  }
  const image = Array.isArray(item.imageItems) ? item.imageItems[0] as { path?: unknown; name?: unknown; url?: unknown; width?: unknown; height?: unknown; loading?: unknown; decoding?: unknown; srcset?: unknown; sizes?: unknown; selector?: unknown } | undefined : undefined;
  if (image && typeof image.path === "string") {
    required += 1;
    if (agent?.semanticTopImagePath === image.path) matched += 1;
  }
  if (image && typeof image.name === "string") {
    required += 1;
    if (agent?.semanticTopImageName === image.name) matched += 1;
  }
  if (image && typeof image.url === "string") {
    required += 1;
    if (agent?.semanticTopImageUrl === image.url) matched += 1;
  }
  if (image && typeof image.width === "number") {
    required += 1;
    if (agent?.semanticTopImageWidth === image.width) matched += 1;
  }
  if (image && typeof image.height === "number") {
    required += 1;
    if (agent?.semanticTopImageHeight === image.height) matched += 1;
  }
  if (image && typeof image.loading === "string") {
    required += 1;
    if (agent?.semanticTopImageLoading === image.loading) matched += 1;
  }
  if (image && typeof image.decoding === "string") {
    required += 1;
    if (agent?.semanticTopImageDecoding === image.decoding) matched += 1;
  }
  if (image && typeof image.srcset === "string") {
    required += 1;
    if (agent?.semanticTopImageSrcset === image.srcset) matched += 1;
  }
  if (image && typeof image.sizes === "string") {
    required += 1;
    if (agent?.semanticTopImageSizes === image.sizes) matched += 1;
  }
  if (image && typeof image.selector === "string") {
    required += 1;
    if (agent?.semanticTopImageSelector === image.selector) matched += 1;
  }
  const table = Array.isArray(item.tableItems) ? item.tableItems[0] as { path?: unknown; role?: unknown; name?: unknown; rowCount?: unknown; cellCount?: unknown; declaredRowCount?: unknown; declaredColumnCount?: unknown; headers?: unknown; headerRefs?: unknown; ownedRefs?: unknown; sampleCells?: unknown; sampleCellRefs?: unknown; selector?: unknown } | undefined : undefined;
  if (table && typeof table.role === "string") {
    required += 1;
    if (agent?.semanticTopTableRole === table.role) matched += 1;
  }
  if (table && typeof table.path === "string") {
    required += 1;
    if (agent?.semanticTopTablePath === table.path) matched += 1;
  }
  if (table && typeof table.name === "string") {
    required += 1;
    if (agent?.semanticTopTableName === table.name) matched += 1;
  }
  if (table && typeof table.rowCount === "number") {
    required += 1;
    if (agent?.semanticTopTableRowCount === table.rowCount) matched += 1;
  }
  if (table && typeof table.cellCount === "number") {
    required += 1;
    if (agent?.semanticTopTableCellCount === table.cellCount) matched += 1;
  }
  if (table && typeof table.declaredRowCount === "number") {
    required += 1;
    if (agent?.semanticTopTableDeclaredRowCount === table.declaredRowCount) matched += 1;
  }
  if (table && typeof table.declaredColumnCount === "number") {
    required += 1;
    if (agent?.semanticTopTableDeclaredColumnCount === table.declaredColumnCount) matched += 1;
  }
  if (table && Array.isArray(table.headers)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopTableHeaders) === JSON.stringify(table.headers)) matched += 1;
  }
  if (table && Array.isArray(table.headerRefs)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopTableHeaderRefs) === JSON.stringify(table.headerRefs)) matched += 1;
  }
  if (table && Array.isArray(table.ownedRefs)) {
    required += 2;
    if (agent?.semanticTopTableOwnedCount === table.ownedRefs.length) matched += 1;
    if (JSON.stringify(agent?.semanticTopTableOwnedRefs) === JSON.stringify(table.ownedRefs)) matched += 1;
  }
  if (table && Array.isArray(table.sampleCells)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopTableSampleCells) === JSON.stringify(table.sampleCells)) matched += 1;
  }
  if (table && Array.isArray(table.sampleCellRefs)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopTableSampleCellRefs) === JSON.stringify(table.sampleCellRefs)) matched += 1;
  }
  if (table && Array.isArray(table.headers) && typeof table.headers[0] === "string") {
    required += 1;
    if (agent?.semanticTopTableFirstHeader === table.headers[0]) matched += 1;
  }
  const firstHeaderRef = Array.isArray(table?.headerRefs) ? table.headerRefs[0] as { path?: unknown; text?: unknown; role?: unknown; rowIndex?: unknown; columnIndex?: unknown; sort?: unknown; selector?: unknown } | undefined : undefined;
  if (firstHeaderRef) {
    required += 7;
    if (agent?.semanticTopTableFirstHeaderPath === firstHeaderRef.path) matched += 1;
    if (agent?.semanticTopTableFirstHeader === firstHeaderRef.text) matched += 1;
    if (agent?.semanticTopTableFirstHeaderRole === firstHeaderRef.role) matched += 1;
    if (agent?.semanticTopTableFirstHeaderRowIndex === firstHeaderRef.rowIndex) matched += 1;
    if (agent?.semanticTopTableFirstHeaderColumnIndex === firstHeaderRef.columnIndex) matched += 1;
    if (agent?.semanticTopTableFirstHeaderSort === firstHeaderRef.sort) matched += 1;
    if (agent?.semanticTopTableFirstHeaderSelector === firstHeaderRef.selector) matched += 1;
  }
  const firstOwnedRef = Array.isArray(table?.ownedRefs) ? table.ownedRefs[0] as { target?: unknown; role?: unknown; name?: unknown; selector?: unknown } | undefined : undefined;
  if (firstOwnedRef) {
    required += 4;
    if (agent?.semanticTopTableFirstOwnedTarget === firstOwnedRef.target) matched += 1;
    if (agent?.semanticTopTableFirstOwnedRole === firstOwnedRef.role) matched += 1;
    if (agent?.semanticTopTableFirstOwnedName === firstOwnedRef.name) matched += 1;
    if (agent?.semanticTopTableFirstOwnedSelector === firstOwnedRef.selector) matched += 1;
  }
  const firstSampleCellRef = Array.isArray(table?.sampleCellRefs) ? table.sampleCellRefs[0] as { path?: unknown; text?: unknown; rowIndex?: unknown; columnIndex?: unknown; rowSpan?: unknown; columnSpan?: unknown; headers?: unknown; rowHeaders?: unknown; columnHeaders?: unknown; selector?: unknown } | undefined : undefined;
  if (firstSampleCellRef) {
    required += 11;
    if (agent?.semanticTopTableFirstSampleCellPath === firstSampleCellRef.path) matched += 1;
    if (agent?.semanticTopTableFirstSampleCellText === firstSampleCellRef.text) matched += 1;
    if (agent?.semanticTopTableFirstSampleCellRowIndex === firstSampleCellRef.rowIndex) matched += 1;
    if (agent?.semanticTopTableFirstSampleCellColumnIndex === firstSampleCellRef.columnIndex) matched += 1;
    if (agent?.semanticTopTableFirstSampleCellRowSpan === firstSampleCellRef.rowSpan) matched += 1;
    if (agent?.semanticTopTableFirstSampleCellColumnSpan === firstSampleCellRef.columnSpan) matched += 1;
    if (JSON.stringify(agent?.semanticTopTableFirstSampleCellHeaders) === JSON.stringify(firstSampleCellRef.headers)) matched += 1;
    if (JSON.stringify(agent?.semanticTopTableFirstSampleCellRowHeaders) === JSON.stringify(firstSampleCellRef.rowHeaders)) matched += 1;
    if (JSON.stringify(agent?.semanticTopTableFirstSampleCellColumnHeaders) === JSON.stringify(firstSampleCellRef.columnHeaders)) matched += 1;
    if (agent?.semanticTopTableFirstSampleCellSelector === firstSampleCellRef.selector) matched += 1;
    if (typeof agent?.semanticTopTableFirstSampleCellText === "string" && agent.semanticTopTableFirstSampleCellText.length > 0) matched += 1;
  }
  if (table && typeof table.selector === "string") {
    required += 1;
    if (agent?.semanticTopTableSelector === table.selector) matched += 1;
  }
  const list = Array.isArray(item.listItems) ? item.listItems[0] as { path?: unknown; role?: unknown; name?: unknown; itemCount?: unknown; sampleItems?: unknown; itemRefs?: unknown; selector?: unknown } | undefined : undefined;
  if (list && typeof list.role === "string") {
    required += 1;
    if (agent?.semanticTopListRole === list.role) matched += 1;
  }
  if (list && typeof list.path === "string") {
    required += 1;
    if (agent?.semanticTopListPath === list.path) matched += 1;
  }
  if (list && typeof list.name === "string") {
    required += 1;
    if (agent?.semanticTopListName === list.name) matched += 1;
  }
  if (list && typeof list.itemCount === "number") {
    required += 1;
    if (agent?.semanticTopListItemCount === list.itemCount) matched += 1;
  }
  if (list && Array.isArray(list.sampleItems)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopListItems) === JSON.stringify(list.sampleItems)) matched += 1;
  }
  if (list && Array.isArray(list.itemRefs)) {
    required += 1;
    if (JSON.stringify(agent?.semanticTopListItemRefs) === JSON.stringify(list.itemRefs)) matched += 1;
  }
  if (list && typeof list.selector === "string") {
    required += 1;
    if (agent?.semanticTopListSelector === list.selector) matched += 1;
  }
  const field = Array.isArray(item.fieldItems) ? item.fieldItems[0] as { path?: unknown; role?: unknown; name?: unknown; description?: unknown; value?: unknown; htmlName?: unknown; htmlType?: unknown; placeholder?: unknown; ariaPlaceholder?: unknown; autocomplete?: unknown; ariaAutocomplete?: unknown; inputMode?: unknown; pattern?: unknown; min?: unknown; max?: unknown; step?: unknown; minLength?: unknown; maxLength?: unknown; labelledBy?: unknown; labelledByText?: unknown; describedBy?: unknown; describedByText?: unknown; details?: unknown; detailsText?: unknown; errorMessage?: unknown; errorMessageText?: unknown; state?: unknown; selector?: unknown } | undefined : undefined;
  if (field && typeof field.role === "string") {
    required += 1;
    if (agent?.semanticTopFieldRole === field.role) matched += 1;
  }
  if (field && typeof field.path === "string") {
    required += 1;
    if (agent?.semanticTopFieldPath === field.path) matched += 1;
  }
  if (field && typeof field.name === "string") {
    required += 1;
    if (agent?.semanticTopFieldName === field.name) matched += 1;
  }
  if (field && typeof field.description === "string") {
    required += 1;
    if (agent?.semanticTopFieldDescription === field.description) matched += 1;
  }
  if (field && typeof field.value === "string") {
    required += 1;
    if (agent?.semanticTopFieldValue === field.value) matched += 1;
  }
  if (field && typeof field.htmlName === "string") {
    required += 1;
    if (agent?.semanticTopFieldHtmlName === field.htmlName) matched += 1;
  }
  if (field && typeof field.htmlType === "string") {
    required += 1;
    if (agent?.semanticTopFieldHtmlType === field.htmlType) matched += 1;
  }
  if (field && typeof field.placeholder === "string") {
    required += 1;
    if (agent?.semanticTopFieldPlaceholder === field.placeholder) matched += 1;
  }
  if (field && typeof field.ariaPlaceholder === "string") {
    required += 1;
    if (agent?.semanticTopFieldAriaPlaceholder === field.ariaPlaceholder) matched += 1;
  }
  if (field && typeof field.autocomplete === "string") {
    required += 1;
    if (agent?.semanticTopFieldAutocomplete === field.autocomplete) matched += 1;
  }
  if (field && typeof field.ariaAutocomplete === "string") {
    required += 1;
    if (agent?.semanticTopFieldAriaAutocomplete === field.ariaAutocomplete) matched += 1;
  }
  if (field && typeof field.inputMode === "string") {
    required += 1;
    if (agent?.semanticTopFieldInputMode === field.inputMode) matched += 1;
  }
  if (field && typeof field.pattern === "string") {
    required += 1;
    if (agent?.semanticTopFieldPattern === field.pattern) matched += 1;
  }
  if (field && typeof field.min === "string") {
    required += 1;
    if (agent?.semanticTopFieldMin === field.min) matched += 1;
  }
  if (field && typeof field.max === "string") {
    required += 1;
    if (agent?.semanticTopFieldMax === field.max) matched += 1;
  }
  if (field && typeof field.step === "string") {
    required += 1;
    if (agent?.semanticTopFieldStep === field.step) matched += 1;
  }
  if (field && typeof field.minLength === "number") {
    required += 1;
    if (agent?.semanticTopFieldMinLength === field.minLength) matched += 1;
  }
  if (field && typeof field.maxLength === "number") {
    required += 1;
    if (agent?.semanticTopFieldMaxLength === field.maxLength) matched += 1;
  }
  if (field && typeof field.labelledBy === "string") {
    required += 1;
    if (agent?.semanticTopFieldLabelledBy === field.labelledBy) matched += 1;
  }
  if (field && typeof field.labelledByText === "string") {
    required += 1;
    if (agent?.semanticTopFieldLabelledByText === field.labelledByText) matched += 1;
  }
  if (field && typeof field.describedBy === "string") {
    required += 1;
    if (agent?.semanticTopFieldDescribedBy === field.describedBy) matched += 1;
  }
  if (field && typeof field.describedByText === "string") {
    required += 1;
    if (agent?.semanticTopFieldDescribedByText === field.describedByText) matched += 1;
  }
  if (field && typeof field.details === "string") {
    required += 1;
    if (agent?.semanticTopFieldDetails === field.details) matched += 1;
  }
  if (field && typeof field.detailsText === "string") {
    required += 1;
    if (agent?.semanticTopFieldDetailsText === field.detailsText) matched += 1;
  }
  if (field && typeof field.errorMessage === "string") {
    required += 1;
    if (agent?.semanticTopFieldErrorMessage === field.errorMessage) matched += 1;
  }
  if (field && typeof field.errorMessageText === "string") {
    required += 1;
    if (agent?.semanticTopFieldErrorMessageText === field.errorMessageText) matched += 1;
  }
  if (field?.state && typeof field.state === "object") {
    const state = Object.entries(field.state as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    if (state) {
      required += 1;
      if (agent?.semanticTopFieldState === state) matched += 1;
    }
    const disabledState = (field.state as { disabled?: unknown }).disabled;
    if (typeof disabledState === "boolean") {
      required += 1;
      if (agent?.semanticTopFieldDisabled === disabledState) matched += 1;
    }
    const requiredState = (field.state as { required?: unknown }).required;
    if (typeof requiredState === "boolean") {
      required += 1;
      if (agent?.semanticTopFieldRequired === requiredState) matched += 1;
    }
    const readonlyState = (field.state as { readonly?: unknown }).readonly;
    if (typeof readonlyState === "boolean") {
      required += 1;
      if (agent?.semanticTopFieldReadonly === readonlyState) matched += 1;
    }
    const invalidState = (field.state as { invalid?: unknown }).invalid;
    if (typeof invalidState !== "undefined") {
      required += 1;
      if (agent?.semanticTopFieldInvalid === invalidState) matched += 1;
    }
    const checkedState = (field.state as { checked?: unknown }).checked;
    if (typeof checkedState === "boolean" || checkedState === "mixed") {
      required += 1;
      if (agent?.semanticTopFieldChecked === checkedState) matched += 1;
    }
    const expandedState = (field.state as { expanded?: unknown }).expanded;
    if (typeof expandedState === "boolean") {
      required += 1;
      if (agent?.semanticTopFieldExpanded === expandedState) matched += 1;
    }
    const haspopupState = (field.state as { haspopup?: unknown }).haspopup;
    if (typeof haspopupState === "string" || typeof haspopupState === "boolean") {
      required += 1;
      if (agent?.semanticTopFieldHaspopup === haspopupState) matched += 1;
    }
    const controlsState = (field.state as { controls?: unknown }).controls;
    if (typeof controlsState === "string") {
      required += 1;
      if (agent?.semanticTopFieldControls === controlsState) matched += 1;
    }
    const valueMin = (field.state as { valueMin?: unknown }).valueMin;
    if (typeof valueMin === "number") {
      required += 1;
      if (agent?.semanticTopFieldValueMin === valueMin) matched += 1;
    }
    const valueMax = (field.state as { valueMax?: unknown }).valueMax;
    if (typeof valueMax === "number") {
      required += 1;
      if (agent?.semanticTopFieldValueMax === valueMax) matched += 1;
    }
    const valueNow = (field.state as { valueNow?: unknown }).valueNow;
    if (typeof valueNow === "number") {
      required += 1;
      if (agent?.semanticTopFieldValueNow === valueNow) matched += 1;
    }
    const valueText = (field.state as { valueText?: unknown }).valueText;
    if (typeof valueText === "string") {
      required += 1;
      if (agent?.semanticTopFieldValueText === valueText) matched += 1;
    }
  }
  if (field && typeof field.selector === "string") {
    required += 1;
    if (agent?.semanticTopFieldSelector === field.selector) matched += 1;
  }
  const descriptionItem = Array.isArray(item.descriptionItems) ? item.descriptionItems[0] as { path?: unknown; role?: unknown; name?: unknown; description?: unknown; selector?: unknown } | undefined : undefined;
  if (descriptionItem && typeof descriptionItem.role === "string") {
    required += 1;
    if (agent?.semanticTopDescriptionRole === descriptionItem.role) matched += 1;
  }
  if (descriptionItem && typeof descriptionItem.path === "string") {
    required += 1;
    if (agent?.semanticTopDescriptionPath === descriptionItem.path) matched += 1;
  }
  if (descriptionItem && typeof descriptionItem.name === "string") {
    required += 1;
    if (agent?.semanticTopDescriptionName === descriptionItem.name) matched += 1;
  }
  if (descriptionItem && typeof descriptionItem.description === "string") {
    required += 1;
    if (agent?.semanticTopDescriptionText === descriptionItem.description) matched += 1;
  }
  if (descriptionItem && typeof descriptionItem.selector === "string") {
    required += 1;
    if (agent?.semanticTopDescriptionSelector === descriptionItem.selector) matched += 1;
  }
  const valueItem = Array.isArray(item.valueItems) ? item.valueItems[0] as { path?: unknown; role?: unknown; name?: unknown; value?: unknown; selector?: unknown } | undefined : undefined;
  if (valueItem && typeof valueItem.role === "string") {
    required += 1;
    if (agent?.semanticTopValueRole === valueItem.role) matched += 1;
  }
  if (valueItem && typeof valueItem.path === "string") {
    required += 1;
    if (agent?.semanticTopValuePath === valueItem.path) matched += 1;
  }
  if (valueItem && typeof valueItem.name === "string") {
    required += 1;
    if (agent?.semanticTopValueName === valueItem.name) matched += 1;
  }
  if (valueItem && typeof valueItem.value === "string") {
    required += 1;
    if (agent?.semanticTopValue === valueItem.value) matched += 1;
  }
  if (valueItem && typeof valueItem.selector === "string") {
    required += 1;
    if (agent?.semanticTopValueSelector === valueItem.selector) matched += 1;
  }
  const relationItem = Array.isArray(item.relationItems) ? item.relationItems[0] as { path?: unknown; role?: unknown; name?: unknown; relation?: unknown; target?: unknown; targetRole?: unknown; targetName?: unknown; targetSelector?: unknown; selector?: unknown } | undefined : undefined;
  if (relationItem && typeof relationItem.role === "string") {
    required += 1;
    if (agent?.semanticTopRelationRole === relationItem.role) matched += 1;
  }
  if (relationItem && typeof relationItem.path === "string") {
    required += 1;
    if (agent?.semanticTopRelationPath === relationItem.path) matched += 1;
  }
  if (relationItem && typeof relationItem.name === "string") {
    required += 1;
    if (agent?.semanticTopRelationName === relationItem.name) matched += 1;
  }
  if (relationItem && typeof relationItem.relation === "string") {
    required += 1;
    if (agent?.semanticTopRelation === relationItem.relation) matched += 1;
  }
  if (relationItem && typeof relationItem.target === "string") {
    required += 1;
    if (agent?.semanticTopRelationTarget === relationItem.target) matched += 1;
  }
  if (relationItem && typeof relationItem.targetRole === "string") {
    required += 1;
    if (agent?.semanticTopRelationTargetRole === relationItem.targetRole) matched += 1;
  }
  if (relationItem && typeof relationItem.targetName === "string") {
    required += 1;
    if (agent?.semanticTopRelationTargetName === relationItem.targetName) matched += 1;
  }
  if (relationItem && typeof relationItem.targetSelector === "string") {
    required += 1;
    if (agent?.semanticTopRelationTargetSelector === relationItem.targetSelector) matched += 1;
  }
  if (relationItem && typeof relationItem.selector === "string") {
    required += 1;
    if (agent?.semanticTopRelationSelector === relationItem.selector) matched += 1;
  }
  const choice = Array.isArray(item.choiceItems) ? item.choiceItems[0] as { path?: unknown; role?: unknown; name?: unknown; state?: unknown; selected?: unknown; current?: unknown; level?: unknown; posInSet?: unknown; setSize?: unknown; selector?: unknown } | undefined : undefined;
  if (choice && typeof choice.role === "string") {
    required += 1;
    if (agent?.semanticTopChoiceRole === choice.role) matched += 1;
  }
  if (choice && typeof choice.path === "string") {
    required += 1;
    if (agent?.semanticTopChoicePath === choice.path) matched += 1;
  }
  if (choice && typeof choice.name === "string") {
    required += 1;
    if (agent?.semanticTopChoiceName === choice.name) matched += 1;
  }
  if (choice?.state && typeof choice.state === "object") {
    const state = Object.entries(choice.state as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    if (state) {
      required += 1;
      if (agent?.semanticTopChoiceState === state) matched += 1;
    }
    const selected = (choice.state as { selected?: unknown }).selected;
    if (typeof selected === "boolean") {
      required += 1;
      if (agent?.semanticTopChoiceSelected === selected) matched += 1;
    }
    const current = (choice.state as { current?: unknown }).current;
    if (typeof current === "string" || typeof current === "boolean") {
      required += 1;
      if (agent?.semanticTopChoiceCurrent === current) matched += 1;
    }
  }
  if (choice && typeof choice.selected === "boolean") {
    required += 1;
    if (agent?.semanticTopChoiceSelected === choice.selected) matched += 1;
  }
  if (choice && (typeof choice.current === "string" || typeof choice.current === "boolean")) {
    required += 1;
    if (agent?.semanticTopChoiceCurrent === choice.current) matched += 1;
  }
  if (choice && typeof choice.level === "number") {
    required += 1;
    if (agent?.semanticTopChoiceLevel === choice.level) matched += 1;
  }
  if (choice && typeof choice.posInSet === "number") {
    required += 1;
    if (agent?.semanticTopChoicePosInSet === choice.posInSet) matched += 1;
  }
  if (choice && typeof choice.setSize === "number") {
    required += 1;
    if (agent?.semanticTopChoiceSetSize === choice.setSize) matched += 1;
  }
  if (choice && typeof choice.selector === "string") {
    required += 1;
    if (agent?.semanticTopChoiceSelector === choice.selector) matched += 1;
  }
  const stateItem = Array.isArray(item.stateItems) ? item.stateItems[0] as { path?: unknown; role?: unknown; name?: unknown; state?: unknown; stateRaw?: Record<string, unknown>; selector?: unknown } | undefined : undefined;
  if (stateItem && typeof stateItem.role === "string") {
    required += 1;
    if (agent?.semanticTopStateRole === stateItem.role) matched += 1;
  }
  if (stateItem && typeof stateItem.path === "string") {
    required += 1;
    if (agent?.semanticTopStatePath === stateItem.path) matched += 1;
  }
  if (stateItem && typeof stateItem.name === "string") {
    required += 1;
    if (agent?.semanticTopStateName === stateItem.name) matched += 1;
  }
  if (stateItem && typeof stateItem.state === "string") {
    required += 1;
    if (agent?.semanticTopState === stateItem.state) matched += 1;
  }
  if (stateItem?.stateRaw && typeof stateItem.stateRaw === "object") {
    const checks: Array<[unknown, unknown]> = [
      [agent?.semanticTopStateHidden, stateItem.stateRaw.hidden],
      [agent?.semanticTopStateDisabled, stateItem.stateRaw.disabled],
      [agent?.semanticTopStateBusy, stateItem.stateRaw.busy],
      [agent?.semanticTopStateMultiselectable, stateItem.stateRaw.multiselectable],
      [agent?.semanticTopStateSort, stateItem.stateRaw.sort],
      [agent?.semanticTopStateGrabbed, stateItem.stateRaw.grabbed],
      [agent?.semanticTopStateDropEffect, stateItem.stateRaw.dropEffect],
      [agent?.semanticTopStateChecked, stateItem.stateRaw.checked],
      [agent?.semanticTopStateSelected, stateItem.stateRaw.selected],
      [agent?.semanticTopStateExpanded, stateItem.stateRaw.expanded],
      [agent?.semanticTopStatePressed, stateItem.stateRaw.pressed],
      [agent?.semanticTopStateFocused, stateItem.stateRaw.focused],
      [agent?.semanticTopStateRequired, stateItem.stateRaw.required],
      [agent?.semanticTopStateInvalid, stateItem.stateRaw.invalid],
      [agent?.semanticTopStateReadonly, stateItem.stateRaw.readonly],
      [agent?.semanticTopStateCurrent, stateItem.stateRaw.current],
      [agent?.semanticTopStateHaspopup, stateItem.stateRaw.haspopup],
      [agent?.semanticTopStateControls, stateItem.stateRaw.controls],
      [agent?.semanticTopStateLive, stateItem.stateRaw.live],
      [agent?.semanticTopStateModal, stateItem.stateRaw.modal],
      [agent?.semanticTopStateOrientation, stateItem.stateRaw.orientation],
      [agent?.semanticTopStateValueMin, stateItem.stateRaw.valueMin],
      [agent?.semanticTopStateValueMax, stateItem.stateRaw.valueMax],
      [agent?.semanticTopStateValueNow, stateItem.stateRaw.valueNow],
      [agent?.semanticTopStateValueText, stateItem.stateRaw.valueText],
    ];
    for (const [actual, expected] of checks) {
      if (typeof expected === "undefined") continue;
      required += 1;
      if (actual === expected) matched += 1;
    }
  }
  if (stateItem && typeof stateItem.selector === "string") {
    required += 1;
    if (agent?.semanticTopStateSelector === stateItem.selector) matched += 1;
  }
  const unavailable = Array.isArray(item.unavailableItems) ? item.unavailableItems[0] as { path?: unknown; tag?: unknown; role?: unknown; name?: unknown; reason?: unknown; selector?: unknown } | undefined : undefined;
  if (unavailable && typeof unavailable.path === "string") {
    required += 1;
    if (agent?.semanticTopUnavailablePath === unavailable.path) matched += 1;
  }
  if (unavailable && typeof unavailable.tag === "string") {
    required += 1;
    if (agent?.semanticTopUnavailableTag === unavailable.tag) matched += 1;
  }
  if (unavailable && typeof unavailable.role === "string") {
    required += 1;
    if (agent?.semanticTopUnavailableRole === unavailable.role) matched += 1;
  }
  if (unavailable && typeof unavailable.name === "string") {
    required += 1;
    if (agent?.semanticTopUnavailableName === unavailable.name) matched += 1;
  }
  if (unavailable && typeof unavailable.reason === "string") {
    required += 1;
    if (agent?.semanticTopUnavailableReason === unavailable.reason) matched += 1;
  }
  if (unavailable && typeof unavailable.selector === "string") {
    required += 1;
    if (agent?.semanticTopUnavailableSelector === unavailable.selector) matched += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentBarrierShortcuts(agent: {
  barrierCount?: number;
  topBarrierKind?: CliBarrierShape["kind"];
  topBarrierSeverity?: CliBarrierShape["severity"];
  topBarrierSource?: string;
  topBarrierPath?: string;
  topBarrierText?: string;
  topBarrierSelector?: string;
  topBarrierDiagnosticCode?: string;
} | undefined, barriers: CliBarrierShape[]): number {
  if (!agent) return 0;
  const top = selectTopCliBarrier(barriers);
  let required = 1;
  let matched = agent.barrierCount === barriers.length ? 1 : 0;
  if (!top) {
    return agent.topBarrierKind
      || agent.topBarrierSeverity
      || agent.topBarrierSource
      || agent.topBarrierPath
      || agent.topBarrierText
      || agent.topBarrierSelector
      || agent.topBarrierDiagnosticCode ? 0 : matched;
  }
  required += 5;
  if (agent.topBarrierKind === top.kind) matched += 1;
  if (agent.topBarrierSeverity === top.severity) matched += 1;
  if (agent.topBarrierSource === top.source) matched += 1;
  if (agent.topBarrierPath === top.path) matched += 1;
  if (agent.topBarrierText === top.text) matched += 1;
  if (top.selector) {
    required += 1;
    if (agent.topBarrierSelector === top.selector) matched += 1;
  } else if (agent.topBarrierSelector) {
    required += 1;
  }
  if (top.diagnosticCode) {
    required += 1;
    if (agent.topBarrierDiagnosticCode === top.diagnosticCode) matched += 1;
  } else if (agent.topBarrierDiagnosticCode) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentStructuredShortcuts(agent: {
  dataTableCount?: number;
  faqCount?: number;
  codeBlockCount?: number;
  resourceCount?: number;
  mediaCount?: number;
  sectionCount?: number;
  breadcrumbCount?: number;
  paginationCount?: number;
  tocCount?: number;
  embedCount?: number;
  transcriptCount?: number;
  authorLinkCount?: number;
  provenanceCount?: number;
  offerCount?: number;
  datasetCount?: number;
  identityCount?: number;
  timelineCount?: number;
  contactPointCount?: number;
  topDataTablePath?: string;
  topDataTableCaption?: string;
  topDataTableRowCount?: number;
  topDataTableColumnCount?: number;
  topDataTableHeaderCount?: number;
  topDataTableFirstHeader?: string;
  topDataTableFirstRow?: string[];
  topDataTableFirstCell?: string;
  topDataTableSelector?: string;
  topFaqQuestion?: string;
  topFaqAnswer?: string;
  topCodeBlockLanguage?: string;
  topCodeBlockLineCount?: number;
  topCodeBlockText?: string;
  topResourceKind?: string;
  topResourceUrl?: string;
  topResourceTitle?: string;
  topMediaKind?: string;
  topMediaUrl?: string;
  topMediaText?: string;
  topSectionPath?: string;
  topSectionHeading?: string;
  topSectionLevel?: number;
  topSectionText?: string;
  topSectionSelector?: string;
  topBreadcrumbPath?: string;
  topBreadcrumbText?: string;
  topBreadcrumbSource?: string;
  topPaginationPath?: string;
  topPaginationKind?: string;
  topPaginationLabel?: string;
  topPaginationUrl?: string;
  topPaginationCurrent?: boolean;
  topPaginationSelector?: string;
  topTocPath?: string;
  topTocTitle?: string;
  topTocItemCount?: number;
  topTocText?: string;
  topTocFirstItemLabel?: string;
  topTocFirstItemUrl?: string;
  topTocSelector?: string;
  topEmbedKind?: string;
  topEmbedUrl?: string;
  topEmbedTitle?: string;
  topTranscriptKind?: string;
  topTranscriptUrl?: string;
  topTranscriptLabel?: string;
  topTranscriptLanguage?: string;
  topAuthorLinkName?: string;
  topAuthorLinkUrl?: string;
  topAuthorLinkSource?: string;
  topProvenancePath?: string;
  topProvenanceKind?: string;
  topProvenanceLabel?: string;
  topProvenanceValue?: string;
  topProvenanceUrl?: string;
  topProvenanceSource?: string;
  topProvenanceSelector?: string;
  topOfferPath?: string;
  topOfferName?: string;
  topOfferPrice?: string;
  topOfferCurrency?: string;
  topOfferAvailability?: string;
  topOfferUrl?: string;
  topOfferSelector?: string;
  topDatasetPath?: string;
  topDatasetKind?: string;
  topDatasetName?: string;
  topDatasetUrl?: string;
  topDatasetDistributionUrl?: string;
  topDatasetLicenseUrl?: string;
  topDatasetEncodingFormat?: string;
  topDatasetSelector?: string;
  topIdentityPath?: string;
  topIdentityKind?: string;
  topIdentityName?: string;
  topIdentityUrl?: string;
  topIdentityLogoUrl?: string;
  topIdentitySameAsUrl?: string;
  topIdentitySource?: string;
  topIdentitySelector?: string;
  topTimelinePath?: string;
  topTimelineKind?: string;
  topTimelineLabel?: string;
  topTimelineValue?: string;
  topTimelineSource?: string;
  topTimelineSelector?: string;
  topContactPointPath?: string;
  topContactPointKind?: string;
  topContactPointLabel?: string;
  topContactPointValue?: string;
  topContactPointUrl?: string;
  topContactPointSource?: string;
  topContactPointSelector?: string;
  structuredReadTargetCount?: number;
  bestStructuredReadTarget?: string;
  bestStructuredReadTargetCount?: number;
  bestStructuredReadTargetScore?: number;
  bestStructuredReadTargetPrimary?: boolean;
  bestStructuredReadTargetReason?: string;
  readTargets?: CliReadTargetShape[];
} | undefined, pageCheck: {
  dataTables?: Array<{ path?: string; caption?: string; rowCount?: number; columnCount?: number; headers?: string[]; sampleRows?: string[][]; selector?: string }>;
  faqs?: Array<{ question?: string; answer?: string }>;
  codeBlocks?: Array<{ language?: string; lineCount?: number; text?: string }>;
  resources?: Array<{ kind?: string; url?: string; title?: string }>;
  media?: Array<{ kind?: string; url?: string; text?: string }>;
  sections?: Array<{ path?: string; heading?: string; level?: number; text?: string; selector?: string }>;
  breadcrumbs?: Array<{ path?: string; text?: string; source?: string }>;
  pagination?: Array<{ path?: string; kind?: string; label?: string; url?: string; current?: boolean; selector?: string }>;
  toc?: Array<{ path?: string; title?: string; items?: Array<{ label?: string; url?: string }>; text?: string; selector?: string }>;
  embeds?: Array<{ kind?: string; url?: string; title?: string }>;
  transcripts?: Array<{ kind?: string; url?: string; label?: string; language?: string }>;
  authorLinks?: Array<{ name?: string; url?: string; source?: string }>;
  provenance?: Array<{ path?: string; kind?: string; label?: string; value?: string; url?: string; source?: string; selector?: string }>;
  offers?: Array<{ path?: string; name?: string; price?: string; currency?: string; availability?: string; url?: string; selector?: string }>;
  datasets?: Array<{ path?: string; kind?: string; name?: string; url?: string; distributionUrls?: string[]; licenseUrl?: string; encodingFormat?: string; selector?: string }>;
  identities?: Array<{ path?: string; kind?: string; name?: string; url?: string; logoUrl?: string; sameAs?: string[]; source?: string; selector?: string }>;
  timeline?: Array<{ path?: string; kind?: string; label?: string; value?: string; source?: string; selector?: string }>;
  contactPoints?: Array<{ path?: string; kind?: string; label?: string; value?: string; url?: string; source?: string; selector?: string }>;
} | undefined): number {
  if (!agent) return 0;
  let required = 12;
  let matched = 0;
  const dataTables = pageCheck?.dataTables ?? [];
  const faqs = pageCheck?.faqs ?? [];
  const codeBlocks = pageCheck?.codeBlocks ?? [];
  const resources = pageCheck?.resources ?? [];
  const media = pageCheck?.media ?? [];
  const sections = pageCheck?.sections ?? [];
  const breadcrumbs = pageCheck?.breadcrumbs ?? [];
  const pagination = pageCheck?.pagination ?? [];
  const toc = pageCheck?.toc ?? [];
  const embeds = pageCheck?.embeds ?? [];
  const transcripts = pageCheck?.transcripts ?? [];
  const authorLinks = pageCheck?.authorLinks ?? [];
  const provenance = pageCheck?.provenance ?? [];
  const offers = pageCheck?.offers ?? [];
  const datasets = pageCheck?.datasets ?? [];
  const identities = pageCheck?.identities ?? [];
  const timeline = pageCheck?.timeline ?? [];
  const contactPoints = pageCheck?.contactPoints ?? [];
  required += 6;
  if (agent.dataTableCount === dataTables.length) matched += 1;
  if (agent.faqCount === faqs.length) matched += 1;
  if (agent.codeBlockCount === codeBlocks.length) matched += 1;
  if (agent.resourceCount === resources.length) matched += 1;
  if (agent.mediaCount === media.length) matched += 1;
  if (agent.sectionCount === sections.length) matched += 1;
  if (agent.breadcrumbCount === breadcrumbs.length) matched += 1;
  if (agent.paginationCount === pagination.length) matched += 1;
  if (agent.tocCount === toc.length) matched += 1;
  if (agent.embedCount === embeds.length) matched += 1;
  if (agent.transcriptCount === transcripts.length) matched += 1;
  if (agent.authorLinkCount === authorLinks.length) matched += 1;
  if (agent.provenanceCount === provenance.length) matched += 1;
  if (agent.offerCount === offers.length) matched += 1;
  if (agent.datasetCount === datasets.length) matched += 1;
  if (agent.identityCount === identities.length) matched += 1;
  if (agent.timelineCount === timeline.length) matched += 1;
  if (agent.contactPointCount === contactPoints.length) matched += 1;

  const topDataTable = dataTables[0];
  if (topDataTable) {
    required += 9;
    if (agent.topDataTablePath === topDataTable.path) matched += 1;
    if (agent.topDataTableCaption === topDataTable.caption) matched += 1;
    if (agent.topDataTableRowCount === topDataTable.rowCount) matched += 1;
    if (agent.topDataTableColumnCount === topDataTable.columnCount) matched += 1;
    if (agent.topDataTableHeaderCount === (topDataTable.headers?.length ?? 0)) matched += 1;
    if (agent.topDataTableFirstHeader === topDataTable.headers?.[0]) matched += 1;
    if (arraysEqual(agent.topDataTableFirstRow, topDataTable.sampleRows?.[0])) matched += 1;
    if (agent.topDataTableFirstCell === topDataTable.sampleRows?.[0]?.[0]) matched += 1;
    if (agent.topDataTableSelector === topDataTable.selector) matched += 1;
  } else if (agent.topDataTablePath || agent.topDataTableCaption || typeof agent.topDataTableRowCount === "number" || typeof agent.topDataTableColumnCount === "number" || typeof agent.topDataTableHeaderCount === "number" || agent.topDataTableFirstHeader || agent.topDataTableFirstRow || agent.topDataTableFirstCell || agent.topDataTableSelector) {
    required += 1;
  }

  const topFaq = faqs[0];
  if (topFaq) {
    required += 2;
    if (agent.topFaqQuestion === topFaq.question) matched += 1;
    if (agent.topFaqAnswer === topFaq.answer) matched += 1;
  } else if (agent.topFaqQuestion || agent.topFaqAnswer) {
    required += 1;
  }

  const topCodeBlock = codeBlocks[0];
  if (topCodeBlock) {
    required += 3;
    if (agent.topCodeBlockLanguage === topCodeBlock.language) matched += 1;
    if (agent.topCodeBlockLineCount === topCodeBlock.lineCount) matched += 1;
    if (agent.topCodeBlockText === topCodeBlock.text) matched += 1;
  } else if (agent.topCodeBlockLanguage || typeof agent.topCodeBlockLineCount === "number" || agent.topCodeBlockText) {
    required += 1;
  }

  const topResource = resources[0];
  if (topResource) {
    required += 3;
    if (agent.topResourceKind === topResource.kind) matched += 1;
    if (agent.topResourceUrl === topResource.url) matched += 1;
    if (agent.topResourceTitle === topResource.title) matched += 1;
  } else if (agent.topResourceKind || agent.topResourceUrl || agent.topResourceTitle) {
    required += 1;
  }

  const topMedia = media[0];
  if (topMedia) {
    required += 3;
    if (agent.topMediaKind === topMedia.kind) matched += 1;
    if (agent.topMediaUrl === topMedia.url) matched += 1;
    if (agent.topMediaText === topMedia.text) matched += 1;
  } else if (agent.topMediaKind || agent.topMediaUrl || agent.topMediaText) {
    required += 1;
  }

  const topSection = sections[0];
  if (topSection) {
    required += 5;
    if (agent.topSectionPath === topSection.path) matched += 1;
    if (agent.topSectionHeading === topSection.heading) matched += 1;
    if (agent.topSectionLevel === topSection.level) matched += 1;
    if (agent.topSectionText === topSection.text) matched += 1;
    if (agent.topSectionSelector === topSection.selector) matched += 1;
  } else if (agent.topSectionPath || agent.topSectionHeading || typeof agent.topSectionLevel === "number" || agent.topSectionText || agent.topSectionSelector) {
    required += 1;
  }

  const topBreadcrumb = breadcrumbs[0];
  if (topBreadcrumb) {
    required += 3;
    if (agent.topBreadcrumbPath === topBreadcrumb.path) matched += 1;
    if (agent.topBreadcrumbText === topBreadcrumb.text) matched += 1;
    if (agent.topBreadcrumbSource === topBreadcrumb.source) matched += 1;
  } else if (agent.topBreadcrumbPath || agent.topBreadcrumbText || agent.topBreadcrumbSource) {
    required += 1;
  }

  const topPagination = pagination[0];
  if (topPagination) {
    required += 6;
    if (agent.topPaginationPath === topPagination.path) matched += 1;
    if (agent.topPaginationKind === topPagination.kind) matched += 1;
    if (agent.topPaginationLabel === topPagination.label) matched += 1;
    if (agent.topPaginationUrl === topPagination.url) matched += 1;
    if (agent.topPaginationCurrent === topPagination.current) matched += 1;
    if (agent.topPaginationSelector === topPagination.selector) matched += 1;
  } else if (agent.topPaginationPath || agent.topPaginationKind || agent.topPaginationLabel || agent.topPaginationUrl || typeof agent.topPaginationCurrent === "boolean" || agent.topPaginationSelector) {
    required += 1;
  }

  const topToc = toc[0];
  if (topToc) {
    required += 7;
    if (agent.topTocPath === topToc.path) matched += 1;
    if (agent.topTocTitle === topToc.title) matched += 1;
    if (agent.topTocItemCount === (topToc.items ?? []).length) matched += 1;
    if (agent.topTocText === topToc.text) matched += 1;
    if (agent.topTocFirstItemLabel === topToc.items?.[0]?.label) matched += 1;
    if (agent.topTocFirstItemUrl === topToc.items?.[0]?.url) matched += 1;
    if (agent.topTocSelector === topToc.selector) matched += 1;
  } else if (agent.topTocPath || agent.topTocTitle || typeof agent.topTocItemCount === "number" || agent.topTocText || agent.topTocFirstItemLabel || agent.topTocFirstItemUrl || agent.topTocSelector) {
    required += 1;
  }

  const topEmbed = embeds[0];
  if (topEmbed) {
    required += 3;
    if (agent.topEmbedKind === topEmbed.kind) matched += 1;
    if (agent.topEmbedUrl === topEmbed.url) matched += 1;
    if (agent.topEmbedTitle === topEmbed.title) matched += 1;
  } else if (agent.topEmbedKind || agent.topEmbedUrl || agent.topEmbedTitle) {
    required += 1;
  }

  const topTranscript = transcripts[0];
  if (topTranscript) {
    required += 4;
    if (agent.topTranscriptKind === topTranscript.kind) matched += 1;
    if (agent.topTranscriptUrl === topTranscript.url) matched += 1;
    if (agent.topTranscriptLabel === topTranscript.label) matched += 1;
    if (agent.topTranscriptLanguage === topTranscript.language) matched += 1;
  } else if (agent.topTranscriptKind || agent.topTranscriptUrl || agent.topTranscriptLabel || agent.topTranscriptLanguage) {
    required += 1;
  }

  const topAuthorLink = authorLinks[0];
  if (topAuthorLink) {
    required += 3;
    if (agent.topAuthorLinkName === topAuthorLink.name) matched += 1;
    if (agent.topAuthorLinkUrl === topAuthorLink.url) matched += 1;
    if (agent.topAuthorLinkSource === topAuthorLink.source) matched += 1;
  } else if (agent.topAuthorLinkName || agent.topAuthorLinkUrl || agent.topAuthorLinkSource) {
    required += 1;
  }

  const topProvenance = provenance[0];
  if (topProvenance) {
    required += 7;
    if (agent.topProvenancePath === topProvenance.path) matched += 1;
    if (agent.topProvenanceKind === topProvenance.kind) matched += 1;
    if (agent.topProvenanceLabel === topProvenance.label) matched += 1;
    if (agent.topProvenanceValue === topProvenance.value) matched += 1;
    if (agent.topProvenanceUrl === topProvenance.url) matched += 1;
    if (agent.topProvenanceSource === topProvenance.source) matched += 1;
    if (agent.topProvenanceSelector === topProvenance.selector) matched += 1;
  } else if (agent.topProvenancePath || agent.topProvenanceKind || agent.topProvenanceValue || agent.topProvenanceUrl || agent.topProvenanceSource || agent.topProvenanceSelector) {
    required += 1;
  }

  const topOffer = offers[0];
  if (topOffer) {
    required += 7;
    if (agent.topOfferPath === topOffer.path) matched += 1;
    if (agent.topOfferName === topOffer.name) matched += 1;
    if (agent.topOfferPrice === topOffer.price) matched += 1;
    if (agent.topOfferCurrency === topOffer.currency) matched += 1;
    if (agent.topOfferAvailability === topOffer.availability) matched += 1;
    if (agent.topOfferUrl === topOffer.url) matched += 1;
    if (agent.topOfferSelector === topOffer.selector) matched += 1;
  } else if (agent.topOfferPath || agent.topOfferName || agent.topOfferPrice || agent.topOfferCurrency || agent.topOfferAvailability || agent.topOfferUrl || agent.topOfferSelector) {
    required += 1;
  }

  const topDataset = datasets[0];
  if (topDataset) {
    required += 8;
    if (agent.topDatasetPath === topDataset.path) matched += 1;
    if (agent.topDatasetKind === topDataset.kind) matched += 1;
    if (agent.topDatasetName === topDataset.name) matched += 1;
    if (agent.topDatasetUrl === topDataset.url) matched += 1;
    if (agent.topDatasetDistributionUrl === topDataset.distributionUrls?.[0]) matched += 1;
    if (agent.topDatasetLicenseUrl === topDataset.licenseUrl) matched += 1;
    if (agent.topDatasetEncodingFormat === topDataset.encodingFormat) matched += 1;
    if (agent.topDatasetSelector === topDataset.selector) matched += 1;
  } else if (agent.topDatasetPath || agent.topDatasetKind || agent.topDatasetName || agent.topDatasetUrl || agent.topDatasetDistributionUrl || agent.topDatasetLicenseUrl || agent.topDatasetEncodingFormat || agent.topDatasetSelector) {
    required += 1;
  }

  const topIdentity = identities[0];
  if (topIdentity) {
    required += 8;
    if (agent.topIdentityPath === topIdentity.path) matched += 1;
    if (agent.topIdentityKind === topIdentity.kind) matched += 1;
    if (agent.topIdentityName === topIdentity.name) matched += 1;
    if (agent.topIdentityUrl === topIdentity.url) matched += 1;
    if (agent.topIdentityLogoUrl === topIdentity.logoUrl) matched += 1;
    if (agent.topIdentitySameAsUrl === topIdentity.sameAs?.[0]) matched += 1;
    if (agent.topIdentitySource === topIdentity.source) matched += 1;
    if (agent.topIdentitySelector === topIdentity.selector) matched += 1;
  } else if (agent.topIdentityPath || agent.topIdentityKind || agent.topIdentityName || agent.topIdentityUrl || agent.topIdentityLogoUrl || agent.topIdentitySameAsUrl || agent.topIdentitySource || agent.topIdentitySelector) {
    required += 1;
  }

  const topTimeline = timeline[0];
  if (topTimeline) {
    required += 6;
    if (agent.topTimelinePath === topTimeline.path) matched += 1;
    if (agent.topTimelineKind === topTimeline.kind) matched += 1;
    if (agent.topTimelineLabel === topTimeline.label) matched += 1;
    if (agent.topTimelineValue === topTimeline.value) matched += 1;
    if (agent.topTimelineSource === topTimeline.source) matched += 1;
    if (agent.topTimelineSelector === topTimeline.selector) matched += 1;
  } else if (agent.topTimelinePath || agent.topTimelineKind || agent.topTimelineLabel || agent.topTimelineValue || agent.topTimelineSource || agent.topTimelineSelector) {
    required += 1;
  }

  const topContactPoint = contactPoints[0];
  if (topContactPoint) {
    required += 7;
    if (agent.topContactPointPath === topContactPoint.path) matched += 1;
    if (agent.topContactPointKind === topContactPoint.kind) matched += 1;
    if (agent.topContactPointLabel === topContactPoint.label) matched += 1;
    if (agent.topContactPointValue === topContactPoint.value) matched += 1;
    if (agent.topContactPointUrl === topContactPoint.url) matched += 1;
    if (agent.topContactPointSource === topContactPoint.source) matched += 1;
    if (agent.topContactPointSelector === topContactPoint.selector) matched += 1;
  } else if (agent.topContactPointPath || agent.topContactPointKind || agent.topContactPointLabel || agent.topContactPointValue || agent.topContactPointUrl || agent.topContactPointSource || agent.topContactPointSelector) {
    required += 1;
  }

  const structuredTargets = (agent.readTargets ?? []).filter(isStructuredCliReadTarget);
  const bestStructuredTarget = selectBestCliReadTarget(structuredTargets);
  required += 1;
  if (agent.structuredReadTargetCount === structuredTargets.length) matched += 1;
  if (bestStructuredTarget) {
    required += 5;
    if (agent.bestStructuredReadTarget === bestStructuredTarget.path) matched += 1;
    if (agent.bestStructuredReadTargetCount === bestStructuredTarget.count) matched += 1;
    if (agent.bestStructuredReadTargetScore === bestStructuredTarget.score) matched += 1;
    if (agent.bestStructuredReadTargetPrimary === bestStructuredTarget.primary) matched += 1;
    if (bestStructuredTarget.reason
      ? agent.bestStructuredReadTargetReason === bestStructuredTarget.reason
      : typeof agent.bestStructuredReadTargetReason === "string" && agent.bestStructuredReadTargetReason.length > 0) matched += 1;
  } else if (
    agent.bestStructuredReadTarget
    || typeof agent.bestStructuredReadTargetCount === "number"
    || typeof agent.bestStructuredReadTargetScore === "number"
    || typeof agent.bestStructuredReadTargetPrimary === "boolean"
    || agent.bestStructuredReadTargetReason
  ) {
    required += 1;
  }
  return roundScore(matched / required);
}

function selectBestCliReadTarget(readTargets: CliReadTargetShape[]): CliReadTargetShape | undefined {
  return [...readTargets].sort((left, right) => {
    if (left.primary !== right.primary) return left.primary ? -1 : 1;
    return (right.score ?? 0) - (left.score ?? 0);
  })[0];
}

function isStructuredCliReadTarget(target: CliReadTargetShape): boolean {
  return typeof target.path === "string" && structuredCliReadTargetPaths.has(target.path);
}

const structuredCliReadTargetPaths = new Set<string>([
  "pageCheck.dataTables",
  "pageCheck.faqs",
  "pageCheck.sections",
  "pageCheck.toc",
  "pageCheck.codeBlocks",
  "pageCheck.citations",
  "pageCheck.media",
  "pageCheck.resources",
  "pageCheck.embeds",
  "pageCheck.transcripts",
  "pageCheck.breadcrumbs",
  "pageCheck.pagination",
]);

function selectTopCliBarrier(barriers: CliBarrierShape[]): CliBarrierShape | undefined {
  const candidates = barriers.filter((barrier) => barrier.kind !== "cookie-consent");
  return (candidates.length > 0 ? candidates : barriers)
    .slice()
    .sort((left, right) => cliBarrierPriority(right) - cliBarrierPriority(left) || (left.rank ?? 0) - (right.rank ?? 0))[0];
}

function cliBarrierPriority(barrier: CliBarrierShape): number {
  if (barrier.kind === "challenge") return 6;
  if (barrier.kind === "login") return 5;
  if (barrier.kind === "paywall") return 4;
  if (barrier.kind === "age-gate") return 3;
  if (barrier.kind === "geo-block") return 2;
  return 1;
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

function compactActionKey(action: CliActionShape, primaryAction?: CliActionShape): string {
  return [
    action.action ?? "",
    resolvedAgentUrl(action, primaryAction) ?? "",
    action.sourceLinkRef ?? "",
    Array.isArray(action.commandArgs) ? JSON.stringify(action.commandArgs) : action.command ?? "",
    action.rank ?? "",
    action.openResult ?? "",
    action.readFrom ?? "",
    action.requiresBrowserInteraction === true ? "browser" : "",
    normalizedActionExecution(action),
  ].join(":");
}

function scoreAgentBrowserNeed(
  needsBrowserHtml: boolean | undefined,
  browserHtmlReason: string | undefined,
  browserHtmlReasonCode: string | undefined,
  staticReadiness: string | undefined,
  staticReadinessReason: string | undefined,
  status: CliAgentSummary["agentStatus"] | undefined,
  primaryAction: CliActionShape | undefined,
): number {
  if (typeof needsBrowserHtml !== "boolean") return 0;
  const validReasonCodes = new Set(["no-inspectable-content", "http-error", "fetch-error", "challenge", "login-required", "paywall", "blocked-or-empty", "retry-action", "browser-interaction", "unknown"]);
  const validStaticReadiness = new Set(["usable-content", "usable-structured-data", "usable-hidden-data", "thin", "needs-browser", "error"]);
  const reasonScore = needsBrowserHtml
    ? typeof browserHtmlReason === "string" && /browser/i.test(browserHtmlReason) ? 0.15 : 0
    : typeof browserHtmlReason === "undefined" ? 0.15 : 0;
  const reasonCodeScore = needsBrowserHtml
    ? typeof browserHtmlReasonCode === "string" && validReasonCodes.has(browserHtmlReasonCode) ? 0.1 : 0
    : typeof browserHtmlReasonCode === "undefined" ? 0.1 : 0;
  const staticReadinessScore = typeof staticReadiness === "string" && validStaticReadiness.has(staticReadiness) ? 0.07 : 0;
  const staticReasonScore = typeof staticReadinessReason === "string" && staticReadinessReason.length > 12 ? 0.03 : 0;
  const metadataScore = reasonScore + reasonCodeScore + staticReadinessScore + staticReasonScore;
  if (primaryAction?.action === "retry-with-browser-html") return (needsBrowserHtml ? 0.65 : 0) + metadataScore;
  if (status === "needs-browser") return (needsBrowserHtml ? 0.65 : 0) + metadataScore;
  if (primaryAction?.action && ["check-url-or-search", "retry-later", "open-alternate-result"].includes(primaryAction.action)) {
    return (needsBrowserHtml ? 0 : 0.65) + metadataScore;
  }
  if (primaryAction?.execution === "read-current" || primaryAction?.execution === "interact-browser") return (needsBrowserHtml ? 0 : 0.65) + metadataScore;
  return (needsBrowserHtml ? 0.4 : 0.65) + metadataScore;
}

function scoreAgentBrowserHtml(
  agent: {
    browserHtmlActionName?: string;
    browserHtmlOperation?: string;
    browserHtmlUrl?: string;
    browserHtmlFile?: string;
    browserHtmlCaptureScript?: string;
    browserHtmlCommand?: string;
    browserHtmlCommandArgs?: unknown[];
    browserHtmlAfterInteractionCommand?: string;
    browserHtmlAfterInteractionCommandArgs?: unknown[];
  } | undefined,
  next: CliAgentNextShape | undefined,
  plan: CliAgentExecutionPlanShape | undefined,
  primaryAction: CliActionShape | undefined,
): number {
  const requiresCapture = primaryAction?.action === "retry-with-browser-html" || Boolean(primaryAction?.afterInteractionCommandArgs);
  if (!requiresCapture) {
    const hasShortcut = agent?.browserHtmlActionName
      || agent?.browserHtmlOperation
      || agent?.browserHtmlUrl
      || agent?.browserHtmlFile
      || agent?.browserHtmlCaptureScript
      || agent?.browserHtmlCommand
      || agent?.browserHtmlCommandArgs
      || agent?.browserHtmlAfterInteractionCommand
      || agent?.browserHtmlAfterInteractionCommandArgs;
    return next?.browserHtml || plan?.browserHtml || hasShortcut ? 0.5 : 1;
  }
  if (!next?.browserHtml || !plan?.browserHtml) return 0;
  let required = 10;
  let matched = 0;
  if (next.browserHtml.htmlFile === "captured.html") matched += 1;
  if (next.browserHtml.captureScript === "document.documentElement.outerHTML") matched += 1;
  if (plan.browserHtml.htmlFile === next.browserHtml.htmlFile) matched += 1;
  if (plan.browserHtml.captureScript === next.browserHtml.captureScript) matched += 1;
  if (agent?.browserHtmlActionName === primaryAction?.action) matched += 1;
  if (agent?.browserHtmlOperation === plan.operation) matched += 1;
  if (agent?.browserHtmlFile === next.browserHtml.htmlFile) matched += 1;
  if (agent?.browserHtmlCaptureScript === next.browserHtml.captureScript) matched += 1;
  if (agent?.browserHtmlCommand === next.browserHtml.command) matched += 1;
  if (JSON.stringify(agent?.browserHtmlCommandArgs) === JSON.stringify(next.browserHtml.commandArgs)) matched += 1;
  if (primaryAction?.commandArgs) {
    required += 2;
    if (JSON.stringify(next.browserHtml.commandArgs) === JSON.stringify(primaryAction.commandArgs)) matched += 1;
    if (JSON.stringify(plan.browserHtml.commandArgs) === JSON.stringify(primaryAction.commandArgs)) matched += 1;
  }
  if (primaryAction?.afterInteractionCommandArgs) {
    required += 4;
    if (JSON.stringify(next.browserHtml.afterInteractionCommandArgs) === JSON.stringify(primaryAction.afterInteractionCommandArgs)) matched += 1;
    if (JSON.stringify(plan.browserHtml.afterInteractionCommandArgs) === JSON.stringify(primaryAction.afterInteractionCommandArgs)) matched += 1;
    if (agent?.browserHtmlAfterInteractionCommand === next.browserHtml.afterInteractionCommand) matched += 1;
    if (JSON.stringify(agent?.browserHtmlAfterInteractionCommandArgs) === JSON.stringify(next.browserHtml.afterInteractionCommandArgs)) matched += 1;
  }
  if (primaryAction?.url) {
    required += 2;
    if (next.browserHtml.url === primaryAction.url) matched += 1;
    if (agent?.browserHtmlUrl === primaryAction.url) matched += 1;
  }
  if (primaryAction?.action === "inspect-browser-state") {
    const target = primaryAction.target;
    required += 2;
    if (target) {
      if (target.url === primaryAction.url && typeof target.title === "string" && target.title.length > 0) matched += 1;
      if (typeof target.source === "string" && typeof target.rank === "number") matched += 1;
    }
  }
  return roundScore(matched / required);
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
  primaryActionName?: string;
  primaryReason?: string;
  primaryPriority?: "low" | "medium" | "high";
  primaryPriorityReason?: string;
  primaryReadFrom?: string;
  primaryCommand?: string;
  primaryCommandArgs?: string[];
  primaryAfterInteractionCommand?: string;
  primaryAfterInteractionCommandArgs?: string[];
  primaryUrl?: string;
  primarySourceLinkRef?: string;
  primaryRank?: number;
  primaryOpenResult?: number | "best";
  requiresBrowserInteraction?: boolean;
  primaryAction?: CliActionShape;
} | undefined): number {
  const action = agent?.primaryAction;
  if (!action) {
    return agent?.primaryReadFrom
      || agent?.primaryActionName
      || agent?.primaryReason
      || agent?.primaryPriority
      || agent?.primaryPriorityReason
      || agent?.primaryCommand
      || agent?.primaryCommandArgs
      || agent?.primaryAfterInteractionCommand
      || agent?.primaryAfterInteractionCommandArgs
      || agent?.primaryUrl
      || agent?.primarySourceLinkRef
      || agent?.primaryRank
      || agent?.primaryOpenResult
      || agent?.requiresBrowserInteraction ? 0 : 1;
  }
  let required = 0;
  let matched = 0;
  required += 4;
  if (agent?.primaryActionName === action.action) matched += 1;
  if (agent?.primaryReason === action.reason) matched += 1;
  if (agent?.primaryPriority === action.priority) matched += 1;
  if (agent?.primaryPriorityReason === action.priorityReason) matched += 1;
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
  if (action.afterInteractionCommand) {
    required += 1;
    if (agent?.primaryAfterInteractionCommand === action.afterInteractionCommand) matched += 1;
  } else if (agent?.primaryAfterInteractionCommand) {
    required += 1;
  }
  if (action.afterInteractionCommandArgs) {
    required += 1;
    if (JSON.stringify(agent?.primaryAfterInteractionCommandArgs) === JSON.stringify(action.afterInteractionCommandArgs)) matched += 1;
  } else if (agent?.primaryAfterInteractionCommandArgs) {
    required += 1;
  }
  if (action.url) {
    required += 1;
    if (agent?.primaryUrl === action.url) matched += 1;
  } else if (agent?.primaryUrl) {
    required += 1;
  }
  if (action.sourceLinkRef) {
    required += 1;
    if (agent?.primarySourceLinkRef === action.sourceLinkRef) matched += 1;
  } else if (agent?.primarySourceLinkRef) {
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

function scoreAgentAlternativeActionShortcuts(agent: {
  actions?: CliActionShape[];
  alternativeActionName?: string;
  alternativeActionSource?: string;
  alternativeActionExecution?: ActionExecution;
  alternativeActionPriority?: "low" | "medium" | "high";
  alternativeActionReason?: string;
  alternativeActionReadFrom?: string;
  alternativeActionCommandArgs?: string[];
  alternativeActionUrl?: string;
  alternativeActionSourceLinkRef?: string;
  alternativeActionRequiresBrowserInteraction?: boolean;
} | undefined): number {
  const action = agent?.actions?.find((item) => item.primary !== true);
  if (!action) {
    return agent?.alternativeActionName
      || agent?.alternativeActionSource
      || agent?.alternativeActionExecution
      || agent?.alternativeActionPriority
      || agent?.alternativeActionReason
      || agent?.alternativeActionReadFrom
      || agent?.alternativeActionCommandArgs
      || agent?.alternativeActionUrl
      || agent?.alternativeActionSourceLinkRef
      || agent?.alternativeActionRequiresBrowserInteraction ? 0 : 1;
  }
  let required = 5;
  let matched = 0;
  if (agent?.alternativeActionName === action.action) matched += 1;
  if (agent?.alternativeActionSource === action.source) matched += 1;
  if (agent?.alternativeActionExecution === normalizedActionExecution(action)) matched += 1;
  if (agent?.alternativeActionPriority === action.priority) matched += 1;
  if (agent?.alternativeActionReason === action.reason) matched += 1;
  if (action.readFrom) {
    required += 1;
    if (agent?.alternativeActionReadFrom === action.readFrom) matched += 1;
  } else if (agent?.alternativeActionReadFrom) {
    required += 1;
  }
  if (action.commandArgs) {
    required += 1;
    if (JSON.stringify(agent?.alternativeActionCommandArgs) === JSON.stringify(action.commandArgs)) matched += 1;
  } else if (agent?.alternativeActionCommandArgs) {
    required += 1;
  }
  if (action.url) {
    required += 1;
    if (agent?.alternativeActionUrl === action.url) matched += 1;
  } else if (agent?.alternativeActionUrl) {
    required += 1;
  }
  if (action.sourceLinkRef) {
    required += 1;
    if (agent?.alternativeActionSourceLinkRef === action.sourceLinkRef) matched += 1;
  } else if (agent?.alternativeActionSourceLinkRef) {
    required += 1;
  }
  if (action.requiresBrowserInteraction) {
    required += 1;
    if (agent?.alternativeActionRequiresBrowserInteraction === true) matched += 1;
  } else if (agent?.alternativeActionRequiresBrowserInteraction) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentExecutorShortcuts(agent: {
  executor?: CliAgentExecutorShape;
  executorDecision?: CliAgentLoopShape["decision"];
  executorMode?: AgentContinuationMode;
  executorActionName?: string;
  executorOperation?: CliAgentExecutionPlanShape["operation"];
  executorConfidence?: CliAgentExecutionPlanShape["confidence"];
  executorAnswerReady?: boolean;
  executorShouldContinue?: boolean;
  executorTerminal?: boolean;
  executorCommandArgs?: string[];
  executorReadFrom?: string;
  executorUrl?: string;
  executorTargetUrl?: string;
  executorTargetPath?: string;
  executorTargetTitle?: string;
  executorTargetHost?: string;
  executorTargetSource?: string;
  executorTargetRank?: number;
  executorTargetSourceScore?: number;
  executorTargetRelevance?: CliAgentTargetShape["relevance"];
  executorTargetLikelyOfficial?: boolean;
  executorTargetSelector?: string;
  executorTargetText?: string;
  executorExpectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
} | undefined): number {
  const executor = agent?.executor;
  if (!executor) return 0;
  let required = 9;
  let matched = 0;
  if (agent.executorDecision === executor.decision) matched += 1;
  if (agent.executorMode === executor.mode) matched += 1;
  if (agent.executorActionName === executor.action) matched += 1;
  if (agent.executorOperation === executor.operation) matched += 1;
  if (agent.executorConfidence === executor.confidence) matched += 1;
  if (agent.executorAnswerReady === executor.answerReady) matched += 1;
  if (agent.executorShouldContinue === executor.shouldContinue) matched += 1;
  if (agent.executorTerminal === executor.terminal) matched += 1;
  if (agent.executorExpectedOutcome === executor.expectedOutcome) matched += 1;
  if (executor.commandArgs) {
    required += 1;
    if (JSON.stringify(agent.executorCommandArgs) === JSON.stringify(executor.commandArgs)) matched += 1;
  } else if (agent.executorCommandArgs) {
    required += 1;
  }
  if (executor.readFrom) {
    required += 1;
    if (agent.executorReadFrom === executor.readFrom) matched += 1;
  } else if (agent.executorReadFrom) {
    required += 1;
  }
  if (executor.url) {
    required += 1;
    if (agent.executorUrl === executor.url) matched += 1;
  } else if (agent.executorUrl) {
    required += 1;
  }
  if (executor.target?.url) {
    required += 1;
    if (agent.executorTargetUrl === executor.target.url) matched += 1;
  } else if (agent.executorTargetUrl) {
    required += 1;
  }
  if (executor.target?.path) {
    required += 1;
    if (agent.executorTargetPath === executor.target.path) matched += 1;
  } else if (agent.executorTargetPath) {
    required += 1;
  }
  if (executor.target?.title) {
    required += 1;
    if (agent.executorTargetTitle === executor.target.title) matched += 1;
  } else if (agent.executorTargetTitle) {
    required += 1;
  }
  if (executor.target?.host) {
    required += 1;
    if (agent.executorTargetHost === executor.target.host) matched += 1;
  } else if (agent.executorTargetHost) {
    required += 1;
  }
  if (executor.target?.source) {
    required += 1;
    if (agent.executorTargetSource === executor.target.source) matched += 1;
  } else if (agent.executorTargetSource) {
    required += 1;
  }
  if (typeof executor.target?.rank === "number") {
    required += 1;
    if (agent.executorTargetRank === executor.target.rank) matched += 1;
  } else if (typeof agent.executorTargetRank === "number") {
    required += 1;
  }
  if (typeof executor.target?.sourceScore === "number") {
    required += 1;
    if (agent.executorTargetSourceScore === executor.target.sourceScore) matched += 1;
  } else if (typeof agent.executorTargetSourceScore === "number") {
    required += 1;
  }
  if (executor.target?.relevance) {
    required += 1;
    if (agent.executorTargetRelevance === executor.target.relevance) matched += 1;
  } else if (agent.executorTargetRelevance) {
    required += 1;
  }
  if (typeof executor.target?.isLikelyOfficial === "boolean") {
    required += 1;
    if (agent.executorTargetLikelyOfficial === executor.target.isLikelyOfficial) matched += 1;
  } else if (typeof agent.executorTargetLikelyOfficial === "boolean") {
    required += 1;
  }
  if (executor.target?.selector) {
    required += 1;
    if (agent.executorTargetSelector === executor.target.selector) matched += 1;
  } else if (agent.executorTargetSelector) {
    required += 1;
  }
  if (executor.target?.text) {
    required += 1;
    if (agent.executorTargetText === executor.target.text) matched += 1;
  } else if (agent.executorTargetText) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentHandoffShortcuts(agent: {
  handoff?: CliAgentHandoffShape;
  handoffDecision?: CliAgentLoopShape["decision"];
  handoffMode?: AgentContinuationMode;
  handoffActionName?: string;
  handoffOperation?: CliAgentExecutionPlanShape["operation"];
  handoffAnswerStatus?: CliAgentAnswerPlanShape["status"];
  handoffConfidence?: CliAgentExecutionPlanShape["confidence"];
  handoffAnswerReady?: boolean;
  handoffShouldContinue?: boolean;
  handoffTerminal?: boolean;
  handoffPriority?: "low" | "medium" | "high";
  handoffPriorityReason?: string;
  handoffCommandArgs?: string[];
  handoffReadFrom?: string;
  handoffUrl?: string;
  handoffTargetUrl?: string;
  handoffTargetPath?: string;
  handoffTargetTitle?: string;
  handoffTargetHost?: string;
  handoffTargetSource?: string;
  handoffTargetRank?: number;
  handoffTargetSourceScore?: number;
  handoffTargetRelevance?: CliAgentTargetShape["relevance"];
  handoffTargetLikelyOfficial?: boolean;
  handoffTargetSelector?: string;
  handoffTargetText?: string;
  handoffExpectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
} | undefined): number {
  const handoff = agent?.handoff;
  if (!handoff) return 0;
  let required = 10;
  let matched = 0;
  if (agent.handoffDecision === handoff.decision) matched += 1;
  if (agent.handoffMode === handoff.mode) matched += 1;
  if (agent.handoffActionName === handoff.action) matched += 1;
  if (agent.handoffOperation === handoff.operation) matched += 1;
  if (agent.handoffAnswerStatus === handoff.answerStatus) matched += 1;
  if (agent.handoffConfidence === handoff.confidence) matched += 1;
  if (agent.handoffAnswerReady === handoff.answerReady) matched += 1;
  if (agent.handoffShouldContinue === handoff.shouldContinue) matched += 1;
  if (agent.handoffTerminal === handoff.terminal) matched += 1;
  if (agent.handoffExpectedOutcome === handoff.expectedOutcome) matched += 1;
  if (handoff.priority) {
    required += 1;
    if (agent.handoffPriority === handoff.priority) matched += 1;
  } else if (agent.handoffPriority) {
    required += 1;
  }
  if (handoff.priorityReason) {
    required += 1;
    if (agent.handoffPriorityReason === handoff.priorityReason) matched += 1;
  } else if (agent.handoffPriorityReason) {
    required += 1;
  }
  if (handoff.commandArgs) {
    required += 1;
    if (JSON.stringify(agent.handoffCommandArgs) === JSON.stringify(handoff.commandArgs)) matched += 1;
  } else if (agent.handoffCommandArgs) {
    required += 1;
  }
  if (handoff.readFrom) {
    required += 1;
    if (agent.handoffReadFrom === handoff.readFrom) matched += 1;
  } else if (agent.handoffReadFrom) {
    required += 1;
  }
  if (handoff.url) {
    required += 1;
    if (agent.handoffUrl === handoff.url) matched += 1;
  } else if (agent.handoffUrl) {
    required += 1;
  }
  if (handoff.target?.url) {
    required += 1;
    if (agent.handoffTargetUrl === handoff.target.url) matched += 1;
  } else if (agent.handoffTargetUrl) {
    required += 1;
  }
  if (handoff.target?.path) {
    required += 1;
    if (agent.handoffTargetPath === handoff.target.path) matched += 1;
  } else if (agent.handoffTargetPath) {
    required += 1;
  }
  if (handoff.target?.title) {
    required += 1;
    if (agent.handoffTargetTitle === handoff.target.title) matched += 1;
  } else if (agent.handoffTargetTitle) {
    required += 1;
  }
  if (handoff.target?.host) {
    required += 1;
    if (agent.handoffTargetHost === handoff.target.host) matched += 1;
  } else if (agent.handoffTargetHost) {
    required += 1;
  }
  if (handoff.target?.source) {
    required += 1;
    if (agent.handoffTargetSource === handoff.target.source) matched += 1;
  } else if (agent.handoffTargetSource) {
    required += 1;
  }
  if (typeof handoff.target?.rank === "number") {
    required += 1;
    if (agent.handoffTargetRank === handoff.target.rank) matched += 1;
  } else if (typeof agent.handoffTargetRank === "number") {
    required += 1;
  }
  if (typeof handoff.target?.sourceScore === "number") {
    required += 1;
    if (agent.handoffTargetSourceScore === handoff.target.sourceScore) matched += 1;
  } else if (typeof agent.handoffTargetSourceScore === "number") {
    required += 1;
  }
  if (handoff.target?.relevance) {
    required += 1;
    if (agent.handoffTargetRelevance === handoff.target.relevance) matched += 1;
  } else if (agent.handoffTargetRelevance) {
    required += 1;
  }
  if (typeof handoff.target?.isLikelyOfficial === "boolean") {
    required += 1;
    if (agent.handoffTargetLikelyOfficial === handoff.target.isLikelyOfficial) matched += 1;
  } else if (typeof agent.handoffTargetLikelyOfficial === "boolean") {
    required += 1;
  }
  if (handoff.target?.selector) {
    required += 1;
    if (agent.handoffTargetSelector === handoff.target.selector) matched += 1;
  } else if (agent.handoffTargetSelector) {
    required += 1;
  }
  if (handoff.target?.text) {
    required += 1;
    if (agent.handoffTargetText === handoff.target.text) matched += 1;
  } else if (agent.handoffTargetText) {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentAnswerShortcuts(agent: {
  answerPlan?: CliAgentAnswerPlanShape;
  answerEvidence?: CliAgentCitationShape[];
  topAnswerEvidenceId?: string;
  topAnswerEvidencePath?: string;
  topAnswerEvidenceKind?: CliAgentCitationShape["kind"];
  topAnswerEvidenceText?: string;
  topAnswerEvidenceTitle?: string;
  topAnswerEvidenceUrl?: string;
  topAnswerEvidenceConfidence?: CliAgentCitationShape["confidence"];
  topAnswerEvidenceReason?: string;
  topAnswerEvidenceScore?: number;
  answerPlanStatus?: CliAgentAnswerPlanShape["status"];
  answerPlanConfidence?: CliAgentAnswerPlanShape["confidence"];
  answerPlanReason?: string;
  answerPlanNextAction?: string;
  answerGapCount?: number;
  answerUseCitationCount?: number;
  topAnswerUseCitationId?: string;
  answerUseCitationIds?: string[];
  answerPlanReadFrom?: string;
  answerPlanCommandArgs?: string[];
  answerPlanAfterInteractionCommand?: string;
  answerPlanAfterInteractionCommandArgs?: string[];
  answerPlanUrl?: string;
} | undefined): number {
  const plan = agent?.answerPlan;
  if (!plan) return 0;
  let required = 3;
  let matched = 0;
  if (agent.answerPlanStatus === plan.status) matched += 1;
  if (agent.answerPlanConfidence === plan.confidence) matched += 1;
  if (agent.answerGapCount === (plan.gaps?.length ?? 0)) matched += 1;
  required += 1;
  if (agent.answerPlanReason === plan.reason) matched += 1;
  if (plan.nextAction) {
    required += 1;
    if (agent.answerPlanNextAction === plan.nextAction) matched += 1;
  } else if (agent.answerPlanNextAction) {
    required += 1;
  }
  if (plan.useCitationIds && plan.useCitationIds.length > 0) {
    required += 3;
    if (agent.answerUseCitationCount === plan.useCitationIds.length) matched += 1;
    if (agent.topAnswerUseCitationId === plan.useCitationIds[0]) matched += 1;
    if (JSON.stringify(agent.answerUseCitationIds) === JSON.stringify(plan.useCitationIds)) matched += 1;
  } else if (agent.answerUseCitationIds) {
    required += 1;
  } else {
    required += 1;
    if (agent.answerUseCitationCount === 0) matched += 1;
  }
  if (plan.readFrom) {
    required += 1;
    if (agent.answerPlanReadFrom === plan.readFrom) matched += 1;
  } else if (agent.answerPlanReadFrom) {
    required += 1;
  }
  if (plan.commandArgs) {
    required += 1;
    if (JSON.stringify(agent.answerPlanCommandArgs) === JSON.stringify(plan.commandArgs)) matched += 1;
  } else if (agent.answerPlanCommandArgs) {
    required += 1;
  }
  if (plan.afterInteractionCommand) {
    required += 1;
    if (agent.answerPlanAfterInteractionCommand === plan.afterInteractionCommand) matched += 1;
  } else if (agent.answerPlanAfterInteractionCommand) {
    required += 1;
  }
  if (plan.afterInteractionCommandArgs) {
    required += 1;
    if (JSON.stringify(agent.answerPlanAfterInteractionCommandArgs) === JSON.stringify(plan.afterInteractionCommandArgs)) matched += 1;
  } else if (agent.answerPlanAfterInteractionCommandArgs) {
    required += 1;
  }
  if (plan.url) {
    required += 1;
    if (agent.answerPlanUrl === plan.url) matched += 1;
  } else if (agent.answerPlanUrl) {
    required += 1;
  }
  const topEvidence = agent.answerEvidence?.[0];
  if (topEvidence) {
    required += 3;
    if (agent.topAnswerEvidenceId === topEvidence.id) matched += 1;
    if (agent.topAnswerEvidencePath === topEvidence.path) matched += 1;
    if (agent.topAnswerEvidenceKind === topEvidence.kind) matched += 1;
    if (topEvidence.text) {
      required += 1;
      if (agent.topAnswerEvidenceText === topEvidence.text) matched += 1;
    } else if (agent.topAnswerEvidenceText) {
      required += 1;
    }
    if (topEvidence.title) {
      required += 1;
      if (agent.topAnswerEvidenceTitle === topEvidence.title) matched += 1;
    } else if (agent.topAnswerEvidenceTitle) {
      required += 1;
    }
    if (topEvidence.url) {
      required += 1;
      if (agent.topAnswerEvidenceUrl === topEvidence.url) matched += 1;
    } else if (agent.topAnswerEvidenceUrl) {
      required += 1;
    }
    if (topEvidence.confidence) {
      required += 1;
      if (agent.topAnswerEvidenceConfidence === topEvidence.confidence) matched += 1;
    } else if (agent.topAnswerEvidenceConfidence) {
      required += 1;
    }
    if (topEvidence.reason) {
      required += 1;
      if (agent.topAnswerEvidenceReason === topEvidence.reason) matched += 1;
    } else if (agent.topAnswerEvidenceReason) {
      required += 1;
    }
    if (typeof topEvidence.score === "number") {
      required += 1;
      if (agent.topAnswerEvidenceScore === topEvidence.score) matched += 1;
    } else if (typeof agent.topAnswerEvidenceScore === "number") {
      required += 1;
    }
  } else if (agent.topAnswerEvidenceId || agent.topAnswerEvidencePath || agent.topAnswerEvidenceKind) {
    required += 3;
  }
  return roundScore(matched / required);
}

function scoreAgentTopCitationShortcuts(agent: {
  citations?: CliAgentCitationShape[];
  topCitationId?: string;
  topCitationPath?: string;
  topCitationKind?: CliAgentCitationShape["kind"];
  topCitationText?: string;
  topCitationTitle?: string;
  topCitationUrl?: string;
  topCitationConfidence?: CliAgentCitationShape["confidence"];
  topCitationReason?: string;
  topCitationScore?: number;
} | undefined): number {
  const top = agent?.citations?.[0];
  if (!top) {
    return agent?.topCitationId
      || agent?.topCitationPath
      || agent?.topCitationKind
      || agent?.topCitationText
      || agent?.topCitationTitle
      || agent?.topCitationUrl
      || agent?.topCitationConfidence
      || agent?.topCitationReason
      || typeof agent?.topCitationScore === "number" ? 0 : 1;
  }
  let required = 3;
  let matched = 0;
  if (agent?.topCitationId === top.id) matched += 1;
  if (agent?.topCitationPath === top.path) matched += 1;
  if (agent?.topCitationKind === top.kind) matched += 1;
  if (top.text) {
    required += 1;
    if (agent?.topCitationText === top.text) matched += 1;
  } else if (agent?.topCitationText) {
    required += 1;
  }
  if (top.title) {
    required += 1;
    if (agent?.topCitationTitle === top.title) matched += 1;
  } else if (agent?.topCitationTitle) {
    required += 1;
  }
  if (top.url) {
    required += 1;
    if (agent?.topCitationUrl === top.url) matched += 1;
  } else if (agent?.topCitationUrl) {
    required += 1;
  }
  if (top.confidence) {
    required += 1;
    if (agent?.topCitationConfidence === top.confidence) matched += 1;
  } else if (agent?.topCitationConfidence) {
    required += 1;
  }
  if (top.reason) {
    required += 1;
    if (agent?.topCitationReason === top.reason) matched += 1;
  } else if (agent?.topCitationReason) {
    required += 1;
  }
  if (typeof top.score === "number") {
    required += 1;
    if (agent?.topCitationScore === top.score) matched += 1;
  } else if (typeof agent?.topCitationScore === "number") {
    required += 1;
  }
  return roundScore(matched / required);
}

function scoreAgentPlanShortcuts(agent: {
  expectedOutcome?: CliAgentExpectedOutcomeShape;
  executionPlan?: CliAgentExecutionPlanShape;
  expectedOutcomeKind?: CliAgentExpectedOutcomeShape["kind"];
  expectedOutcomeMessage?: string;
  executionPlanOperation?: CliAgentExecutionPlanShape["operation"];
  executionPlanConfidence?: CliAgentExecutionPlanShape["confidence"];
  executionPlanReason?: string;
  executionPlanAnswerReady?: boolean;
  executionPlanShouldContinue?: boolean;
  executionPlanTerminal?: boolean;
  executionPlanExpectedOutcome?: CliAgentExpectedOutcomeShape["kind"];
  executionPlanReadFrom?: string;
  executionPlanCommandArgs?: string[];
  executionPlanAfterInteractionCommand?: string;
  executionPlanAfterInteractionCommandArgs?: string[];
  executionPlanUrl?: string;
} | undefined): number {
  const outcome = agent?.expectedOutcome;
  const plan = agent?.executionPlan;
  if (!outcome || !plan) return 0;
  let required = 9;
  let matched = 0;
  if (agent.expectedOutcomeKind === outcome.kind) matched += 1;
  if (agent.expectedOutcomeMessage === outcome.message) matched += 1;
  if (agent.executionPlanOperation === plan.operation) matched += 1;
  if (agent.executionPlanConfidence === plan.confidence) matched += 1;
  if (agent.executionPlanReason === plan.reason) matched += 1;
  if (agent.executionPlanAnswerReady === plan.answerReady) matched += 1;
  if (agent.executionPlanShouldContinue === plan.shouldContinue) matched += 1;
  if (agent.executionPlanTerminal === plan.terminal) matched += 1;
  if (agent.executionPlanExpectedOutcome === plan.expectedOutcome) matched += 1;
  if (plan.readFrom) {
    required += 1;
    if (agent.executionPlanReadFrom === plan.readFrom) matched += 1;
  } else if (agent.executionPlanReadFrom) {
    required += 1;
  }
  if (plan.commandArgs) {
    required += 1;
    if (JSON.stringify(agent.executionPlanCommandArgs) === JSON.stringify(plan.commandArgs)) matched += 1;
  } else if (agent.executionPlanCommandArgs) {
    required += 1;
  }
  if (plan.afterInteractionCommand) {
    required += 1;
    if (agent.executionPlanAfterInteractionCommand === plan.afterInteractionCommand) matched += 1;
  } else if (agent.executionPlanAfterInteractionCommand) {
    required += 1;
  }
  if (plan.afterInteractionCommandArgs) {
    required += 1;
    if (JSON.stringify(agent.executionPlanAfterInteractionCommandArgs) === JSON.stringify(plan.afterInteractionCommandArgs)) matched += 1;
  } else if (agent.executionPlanAfterInteractionCommandArgs) {
    required += 1;
  }
  if (plan.url || plan.urlRef) {
    required += 1;
    if (agent.executionPlanUrl === plan.url || agent.executionPlanUrl === plan.urlRef) matched += 1;
  } else if (agent.executionPlanUrl) {
    required += 1;
  }
  return roundScore(matched / required);
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
    recommendedUrl?: string;
    recommendedPath?: string;
    recommendedTitle?: string;
    recommendedSource?: string;
    recommendedSourceScore?: number;
    recommendedRelevance?: "low" | "medium" | "high";
    recommendedLikelyOfficial?: boolean;
    recommendedCommandArgs?: string[];
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
  if (recommendedResult.url) {
    required += 1;
    if (agent?.recommendedUrl === recommendedResult.url) matched += 1;
  }
  if (recommendedResult.path) {
    required += 1;
    if (agent?.recommendedPath === recommendedResult.path) matched += 1;
  }
  if (recommendedResult.title) {
    required += 1;
    if (agent?.recommendedTitle === recommendedResult.title) matched += 1;
  }
  if (recommendedResult.source) {
    required += 1;
    if (agent?.recommendedSource === recommendedResult.source) matched += 1;
  }
  if (typeof recommendedResult.sourceScore === "number") {
    required += 1;
    if (agent?.recommendedSourceScore === recommendedResult.sourceScore) matched += 1;
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
  if (recommendedResult.commandArgs) {
    required += 1;
    if (JSON.stringify(agent?.recommendedCommandArgs) === JSON.stringify(recommendedResult.commandArgs)) matched += 1;
  } else if (agent?.recommendedCommandArgs) {
    required += 1;
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
  const hiddenSignalScore = Math.min(1, summary.pageCheck.hiddenSignalCount / 4);
  const recoverableBrowserRetry = summary.agentStatus === "needs-browser"
    && summary.agentPrimaryAction === "retry-with-browser-html"
    && summary.agentPrimaryExecution === "run-command"
    && summary.agentBrowserNeedScore === 1
    && summary.agentBrowserHtmlScore === 1;
  const recoverableCommandContinuation = summary.agentPrimaryExecution === "run-command"
    && summary.agentCanContinueScore === 1
    && summary.actionSchemaScore === 1
    && ["refine-search", "open-site-search", "open-source-link", "open-alternate-result", "open-result", "broaden-search"].includes(summary.agentPrimaryAction ?? "");
  const evidenceScore = Math.max(
    Math.min(1, effectivePreviewCount / expectedEvidenceCount),
    hiddenSignalScore * 0.85,
  );
  const lengthScore = Math.max(summary.pageCheck.contentLength <= 160
    ? (summary.pageCheck.contentLength > 0 ? 1 : 0)
    : Math.min(1, summary.pageCheck.contentLength / 600), hiddenSignalScore * 0.75);
  const contentScore = Math.max(recoverableBrowserRetry ? 0.45 : 0, evidenceScore * 0.65
    + lengthScore * 0.18
    + Math.min(1, summary.pageCheck.contentEvidenceCount / expectedEvidenceCount) * 0.12
    + Math.max(summary.pageCheck.contentEvidenceMetadataScore, hiddenSignalScore) * 0.05);
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
        ? (recoverableBrowserRetry ? 0.75 : 0.25)
        : 0;
  const agentActionScore = summary.agentPrimaryAction ? 1 : 0;
  const score = roundScore(Math.min(1,
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
    + summary.agentTopReadTargetShortcutScore * 0.005
    + summary.agentResultCountScore * 0.005
    + summary.agentChoiceCountScore * 0.005
    + summary.agentTopChoiceShortcutScore * 0.005
    + summary.agentResultChoiceScore * 0.005
    + summary.agentTopResultChoiceShortcutScore * 0.005
    + summary.agentSourceLinkCountScore * 0.005
    + summary.agentSourceChoiceScore * 0.005
    + summary.agentTopSourceChoiceShortcutScore * 0.005
    + summary.agentSourceSearchShortcutScore * 0.005
    + summary.agentFormActionChoiceScore * 0.005
    + summary.agentTopFormActionChoiceShortcutScore * 0.005
    + summary.agentBrowserNeedScore * 0.005
    + summary.agentBrowserHtmlScore * 0.005
    + summary.agentPageKindScore * 0.005
    + summary.agentPageMetadataShortcutScore * 0.005
    + summary.agentAlternativeActionCountScore * 0.005
    + summary.agentUsabilityScoreConsistency * 0.005
    + summary.agentEvidenceQualityScoreConsistency * 0.005
    + summary.agentSourceQualityScoreConsistency * 0.005
    + summary.agentBestReadTargetScore * 0.005
    + summary.agentDiagnosticCountScore * 0.005
    + summary.agentVerificationCountScore * 0.005
    + summary.agentVerificationQueryScore * 0.005
    + summary.agentEvidenceCountShortcutScore * 0.005
    + summary.agentSignalCountShortcutScore * 0.005
    + summary.agentTopQualityShortcutScore * 0.005
    + summary.agentProblemShortcutScore * 0.005
    + summary.agentResponseMetadataScore * 0.005
    + summary.agentHiddenSignalScore * 0.005
    + summary.agentTopHiddenSignalShortcutScore * 0.005
    + summary.agentRoutingIntentScore * 0.005
    + summary.agentContinuationModeScore * 0.005
    + summary.agentNextScore * 0.005
    + summary.agentNextShortcutScore * 0.005
    + summary.agentRunbookScore * 0.005
    + summary.agentRunbookShortcutScore * 0.005
    + summary.agentExecutorStepScore * 0.005
    + summary.agentBriefExecutorStepScore * 0.005
    + summary.agentHandoffScore * 0.005
    + summary.agentExecutionPlanScore * 0.005
    + summary.agentExpectedOutcomeScore * 0.005
    + summary.agentSignalScore * 0.005
    + summary.agentQualityGateScore * 0.005
    + summary.pageLinkCommandScore * 0.005
    + summary.agentPrimaryShortcutScore * 0.005
    + summary.agentAlternativeActionShortcutScore * 0.005
    + summary.agentExecutorShortcutScore * 0.005
    + summary.agentHandoffShortcutScore * 0.005
    + summary.agentAnswerShortcutScore * 0.005
    + summary.agentPlanShortcutScore * 0.005
    + summary.agentCitationScore * 0.005
    + summary.agentTopCitationShortcutScore * 0.005
    + summary.agentAnswerPlanScore * 0.005
    + summary.agentAnswerEvidenceScore * 0.005
    + summary.agentActionListScore * 0.005
    + summary.agentTopActionShortcutScore * 0.005
    + summary.agentSearchDecisionScore * 0.005
    + summary.agentPageDecisionScore * 0.005
    + summary.agentSemanticSummaryScore * 0.005
    + summary.agentBarrierShortcutScore * 0.005
    + summary.agentStructuredShortcutScore * 0.005,
  ));
  return recoverableBrowserRetry || recoverableCommandContinuation ? Math.max(score, 0.8) : score;
}

function scoreAgentExecutorSummary(summary: CliAgentSummary): number {
  return roundScore(average([
    summary.agentContractScore,
    summary.actionSchemaScore,
    summary.agentRoutingIntentScore,
    summary.agentContinuationModeScore,
    summary.agentNextScore,
    summary.agentNextShortcutScore,
    summary.agentRunbookScore,
    summary.agentRunbookShortcutScore,
    summary.agentExecutorStepScore,
    summary.agentBriefExecutorStepScore,
    summary.agentHandoffScore,
    summary.agentExecutionPlanScore,
    summary.agentExpectedOutcomeScore,
    summary.agentSignalScore,
    summary.agentQualityGateScore,
    summary.agentReadTargetScore,
    summary.agentTopReadTargetShortcutScore,
    summary.agentResultChoiceScore,
    summary.agentTopResultChoiceShortcutScore,
    summary.agentChoiceCountScore,
    summary.agentFormActionCountScore,
    summary.agentFormActionChoiceScore,
    summary.agentTopFormActionChoiceShortcutScore,
    summary.agentHiddenSignalCountScore,
    summary.agentSourceChoiceScore,
    summary.agentTopSourceChoiceShortcutScore,
    summary.agentSourceSearchShortcutScore,
    summary.agentBrowserNeedScore,
    summary.agentBrowserHtmlScore,
    summary.agentPageMetadataShortcutScore,
    summary.agentCanContinueScore,
    summary.agentPrimaryExecutionScore,
    summary.agentPrimaryShortcutScore,
    summary.agentAlternativeActionShortcutScore,
    summary.agentPlanShortcutScore,
    summary.agentCitationScore,
    summary.agentTopCitationShortcutScore,
    summary.agentAnswerPlanScore,
    summary.agentAnswerEvidenceScore,
    summary.agentActionListScore,
    summary.agentTopActionShortcutScore,
    summary.agentSearchDecisionScore,
    summary.agentPageDecisionScore,
    summary.agentSemanticSummaryScore,
    summary.agentBarrierShortcutScore,
    summary.agentStructuredShortcutScore,
    summary.searchResultActionScore,
    summary.pageLinkCommandScore,
    summary.agentResponseMetadataScore,
    summary.agentDiagnosticCountScore,
    summary.agentVerificationCountScore,
    summary.agentVerificationQueryScore,
    summary.agentEvidenceCountShortcutScore,
    summary.agentSignalCountShortcutScore,
    summary.agentTopQualityShortcutScore,
    summary.agentTopHiddenSignalShortcutScore,
    summary.agentHiddenSignalScore,
  ]));
}

function classifyComparison(comparison: StaticComparison): StaticClassification {
  if (comparison.fetch.source === "fetch" && (comparison.fetch.status === 401 || comparison.fetch.status === 403 || comparison.fetch.status === 429)) return "challenge";
  if (!comparison.agentBrowser) return "reference-missing";
  if (isChallengeSnapshot(comparison.agentBrowser.normalized)) return "reference-challenge";
  if (comparison.fetch.htmlBytes > 10_000 && comparison.static.nodeCount <= 5 && comparison.agentBrowser.lineCount <= 5) return "shell";
  const hasUsableAgentPayload = hasAgentUsablePayload(comparison);
  if (comparison.agentBrowser.lineCount <= 2 && comparison.static.nodeCount > 100 && !hasUsableAgentPayload) return "challenge";
  if (hasUsableAgentPayload) return "usable";
  if (isVolatileDiagnostic(comparison)) return "volatile";
  if (comparison.static.nodeCount > Math.max(1_500, comparison.agentBrowser.lineCount * 3)) return "over-collected";
  if (comparison.agentReadiness.score < 0.45) return "needs-browser";
  return "usable";
}

function hasAgentUsablePayload(comparison: StaticComparison): boolean {
  const summary = comparison.cliAgentSummary;
  return summary.ok
    && summary.agentStatus === "ready"
    && summary.agentExecutorScore >= 0.99
    && summary.score >= 0.8
    && summary.pageCheck.contentEvidenceCount > 0;
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
    minCliAgentScore: minimum(included.map((comparison) => comparison.cliAgentSummary.score)),
    averageAgentExecutorScore: average(included.map((comparison) => comparison.cliAgentSummary.agentExecutorScore)),
    minAgentExecutorScore: minimum(included.map((comparison) => comparison.cliAgentSummary.agentExecutorScore)),
    averageAgentContractScore: average(included.map((comparison) => comparison.cliAgentSummary.agentContractScore)),
    averageActionSchemaScore: average(included.map((comparison) => comparison.cliAgentSummary.actionSchemaScore)),
    averageSearchResultActionScore: average(included.map((comparison) => comparison.cliAgentSummary.searchResultActionScore)),
    averageContentEvidenceMetadataScore: average(included.map((comparison) => comparison.cliAgentSummary.pageCheck.contentEvidenceMetadataScore)),
    averageReadabilityReasonScore: average(included.map((comparison) => comparison.cliAgentSummary.pageCheck.readabilityReasonScore)),
    averageAgentRoutingIntentScore: average(included.map((comparison) => comparison.cliAgentSummary.agentRoutingIntentScore)),
    averageAgentContinuationModeScore: average(included.map((comparison) => comparison.cliAgentSummary.agentContinuationModeScore)),
    averageAgentNextScore: average(included.map((comparison) => comparison.cliAgentSummary.agentNextScore)),
    averageAgentNextShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentNextShortcutScore)),
    averageAgentRunbookScore: average(included.map((comparison) => comparison.cliAgentSummary.agentRunbookScore)),
    averageAgentRunbookShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentRunbookShortcutScore)),
    averageAgentExecutorStepScore: average(included.map((comparison) => comparison.cliAgentSummary.agentExecutorStepScore)),
    averageAgentBriefExecutorStepScore: average(included.map((comparison) => comparison.cliAgentSummary.agentBriefExecutorStepScore)),
    averageAgentHandoffScore: average(included.map((comparison) => comparison.cliAgentSummary.agentHandoffScore)),
    averageAgentExecutionPlanScore: average(included.map((comparison) => comparison.cliAgentSummary.agentExecutionPlanScore)),
    averageAgentExpectedOutcomeScore: average(included.map((comparison) => comparison.cliAgentSummary.agentExpectedOutcomeScore)),
    averageAgentSignalScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSignalScore)),
    averageAgentQualityGateScore: average(included.map((comparison) => comparison.cliAgentSummary.agentQualityGateScore)),
    averagePageLinkCommandScore: average(included.map((comparison) => comparison.cliAgentSummary.pageLinkCommandScore)),
    averageAgentReadTargetScore: average(included.map((comparison) => comparison.cliAgentSummary.agentReadTargetScore)),
    averageAgentTopReadTargetShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopReadTargetShortcutScore)),
    averageAgentResultCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentResultCountScore)),
    averageAgentChoiceCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentChoiceCountScore)),
    averageAgentTopChoiceShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopChoiceShortcutScore)),
    averageAgentResultChoiceScore: average(included.map((comparison) => comparison.cliAgentSummary.agentResultChoiceScore)),
    averageAgentTopResultChoiceShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopResultChoiceShortcutScore)),
    averageAgentSourceLinkCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceLinkCountScore)),
    averageAgentFormActionCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentFormActionCountScore)),
    averageAgentFormActionChoiceScore: average(included.map((comparison) => comparison.cliAgentSummary.agentFormActionChoiceScore)),
    averageAgentTopFormActionChoiceShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopFormActionChoiceShortcutScore)),
    averageAgentHiddenSignalCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentHiddenSignalCountScore)),
    averageAgentTopHiddenSignalShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopHiddenSignalShortcutScore)),
    averageAgentSourceChoiceScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceChoiceScore)),
    averageAgentTopSourceChoiceShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopSourceChoiceShortcutScore)),
    averageAgentSourceSearchShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceSearchShortcutScore)),
    averageAgentBrowserNeedScore: average(included.map((comparison) => comparison.cliAgentSummary.agentBrowserNeedScore)),
    averageAgentBrowserHtmlScore: average(included.map((comparison) => comparison.cliAgentSummary.agentBrowserHtmlScore)),
    averageAgentPageKindScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPageKindScore)),
    averageAgentPageMetadataShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPageMetadataShortcutScore)),
    averageAgentAlternativeActionCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentAlternativeActionCountScore)),
    averageAgentUsabilityScoreConsistency: average(included.map((comparison) => comparison.cliAgentSummary.agentUsabilityScoreConsistency)),
    averageAgentEvidenceQualityScoreConsistency: average(included.map((comparison) => comparison.cliAgentSummary.agentEvidenceQualityScoreConsistency)),
    averageAgentSourceQualityScoreConsistency: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceQualityScoreConsistency)),
    averageAgentBestReadTargetScore: average(included.map((comparison) => comparison.cliAgentSummary.agentBestReadTargetScore)),
    averageAgentDiagnosticCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentDiagnosticCountScore)),
    averageAgentVerificationCountScore: average(included.map((comparison) => comparison.cliAgentSummary.agentVerificationCountScore)),
    averageAgentVerificationQueryScore: average(included.map((comparison) => comparison.cliAgentSummary.agentVerificationQueryScore)),
    averageAgentEvidenceCountShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentEvidenceCountShortcutScore)),
    averageAgentSignalCountShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSignalCountShortcutScore)),
    averageAgentTopQualityShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopQualityShortcutScore)),
    averageAgentProblemShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentProblemShortcutScore)),
    averageAgentResponseMetadataScore: average(included.map((comparison) => comparison.cliAgentSummary.agentResponseMetadataScore)),
    averageAgentHiddenSignalScore: average(included.map((comparison) => comparison.cliAgentSummary.agentHiddenSignalScore)),
    averageAgentBrowserAdvantageScore: average(included.map((comparison) => comparison.agentBrowserAdvantageScore)),
    averageAgentReadabilityReasonScore: average(included.map((comparison) => comparison.cliAgentSummary.agentReadabilityReasonScore)),
    averageAgentSourceSearchProvenanceScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSourceSearchProvenanceScore)),
    averageAgentRecommendedMetadataScore: average(included.map((comparison) => comparison.cliAgentSummary.agentRecommendedMetadataScore)),
    averageAgentCanContinueScore: average(included.map((comparison) => comparison.cliAgentSummary.agentCanContinueScore)),
    averageAgentPrimaryExecutionScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPrimaryExecutionScore)),
    averageAgentPrimaryShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPrimaryShortcutScore)),
    averageAgentAlternativeActionShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentAlternativeActionShortcutScore)),
    averageAgentExecutorShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentExecutorShortcutScore)),
    averageAgentHandoffShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentHandoffShortcutScore)),
    averageAgentAnswerShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentAnswerShortcutScore)),
    averageAgentPlanShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPlanShortcutScore)),
    averageAgentCitationScore: average(included.map((comparison) => comparison.cliAgentSummary.agentCitationScore)),
    averageAgentTopCitationShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopCitationShortcutScore)),
    averageAgentAnswerPlanScore: average(included.map((comparison) => comparison.cliAgentSummary.agentAnswerPlanScore)),
    averageAgentAnswerEvidenceScore: average(included.map((comparison) => comparison.cliAgentSummary.agentAnswerEvidenceScore)),
    averageAgentActionListScore: average(included.map((comparison) => comparison.cliAgentSummary.agentActionListScore)),
    averageAgentTopActionShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentTopActionShortcutScore)),
    averageAgentSearchDecisionScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSearchDecisionScore)),
    averageAgentPageDecisionScore: average(included.map((comparison) => comparison.cliAgentSummary.agentPageDecisionScore)),
    averageAgentSemanticSummaryScore: average(included.map((comparison) => comparison.cliAgentSummary.agentSemanticSummaryScore)),
    averageAgentBarrierShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentBarrierShortcutScore)),
    averageAgentStructuredShortcutScore: average(included.map((comparison) => comparison.cliAgentSummary.agentStructuredShortcutScore)),
    averagePrecision: average(included.map((comparison) => comparison.agentReadiness.candidatePrecision)),
    averageReferenceRecall: average(included.map((comparison) => comparison.agentReadiness.referenceRecall)),
    weakAgentTargets: weakAgentTargets(included),
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

function minimum(values: number[]): number {
  if (values.length === 0) return 0;
  return roundScore(Math.min(...values));
}

function weakAgentTargets(comparisons: StaticComparison[]): GateWeakAgentTarget[] {
  return comparisons
    .filter((comparison) => comparison.cliAgentSummary.score < 0.8 || comparison.cliAgentSummary.agentExecutorScore < 0.995)
    .map((comparison) => {
      const item: GateWeakAgentTarget = {
        category: comparison.category,
        url: comparison.url,
        cliAgentScore: comparison.cliAgentSummary.score,
        agentExecutorScore: comparison.cliAgentSummary.agentExecutorScore,
        agentStatus: comparison.cliAgentSummary.agentStatus,
      };
      if (comparison.cliAgentSummary.agentPrimaryAction) item.primaryAction = comparison.cliAgentSummary.agentPrimaryAction;
      return item;
    });
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
    .replace(/(?<=\d)\s+(?=\p{L})/gu, "")
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
