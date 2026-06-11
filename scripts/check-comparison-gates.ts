import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

type GateSummary = Record<string, unknown> & {
  included?: number;
  excluded?: number;
  averageCliAgentScore?: number;
  minCliAgentScore?: number;
  averageAgentExecutorScore?: number;
  minAgentExecutorScore?: number;
  averageAgentContractScore?: number;
  averageActionSchemaScore?: number;
  averageSearchResultActionScore?: number;
  averagePageLinkCommandScore?: number;
  averageContentEvidenceMetadataScore?: number;
  averageReadabilityReasonScore?: number;
  averageAgentRoutingIntentScore?: number;
  averageAgentContinuationModeScore?: number;
  averageAgentNextScore?: number;
  averageAgentRunbookScore?: number;
  averageAgentRunbookShortcutScore?: number;
  averageAgentExecutorStepScore?: number;
  averageAgentBriefExecutorStepScore?: number;
  averageAgentHandoffScore?: number;
  averageAgentExecutionPlanScore?: number;
  averageAgentExpectedOutcomeScore?: number;
  averageAgentSignalScore?: number;
  averageAgentQualityGateScore?: number;
  averageAgentBrowserAdvantageScore?: number;
  averageAgentReadTargetScore?: number;
  averageAgentResultChoiceScore?: number;
  averageAgentChoiceCountScore?: number;
  averageAgentTopChoiceShortcutScore?: number;
  averageAgentSourceChoiceScore?: number;
  averageAgentSourceSearchShortcutScore?: number;
  averageAgentSourceSearchProvenanceScore?: number;
  averageAgentRecommendedMetadataScore?: number;
  averageAgentCitationScore?: number;
  averageAgentAnswerPlanScore?: number;
  averageAgentAnswerEvidenceScore?: number;
  averageAgentBrowserNeedScore?: number;
  averageAgentBrowserHtmlScore?: number;
  averageAgentPageKindScore?: number;
  averageAgentAlternativeActionCountScore?: number;
  averageAgentUsabilityScoreConsistency?: number;
  averageAgentEvidenceQualityScoreConsistency?: number;
  averageAgentSourceQualityScoreConsistency?: number;
  averageAgentBestReadTargetScore?: number;
  averageAgentDiagnosticCountScore?: number;
  averageAgentVerificationCountScore?: number;
  averageAgentVerificationQueryScore?: number;
  averageAgentEvidenceCountShortcutScore?: number;
  averageAgentSignalCountShortcutScore?: number;
  averageAgentProblemShortcutScore?: number;
  averageAgentResponseMetadataScore?: number;
  averageAgentHiddenSignalScore?: number;
  averageAgentResultCountScore?: number;
  averageAgentSourceLinkCountScore?: number;
  averageAgentFormActionCountScore?: number;
  averageAgentFormActionChoiceScore?: number;
  averageAgentHiddenSignalCountScore?: number;
  averageAgentReadabilityReasonScore?: number;
  averageAgentCanContinueScore?: number;
  averageAgentPrimaryExecutionScore?: number;
  averageAgentPrimaryShortcutScore?: number;
  averageAgentAlternativeActionShortcutScore?: number;
  averageAgentExecutorShortcutScore?: number;
  averageAgentHandoffShortcutScore?: number;
  averageAgentAnswerShortcutScore?: number;
  averageAgentPlanShortcutScore?: number;
  averageAgentActionListScore?: number;
  averageAgentSearchDecisionScore?: number;
  averageAgentPageDecisionScore?: number;
  averageAgentSemanticSummaryScore?: number;
  averageAgentToBrowserTokenRatio?: number;
  excludedThinBrowserReference?: number;
  weakAgentTargets?: GateWeakAgentTarget[];
  classifications?: Record<string, number>;
};

type GateWeakAgentTarget = {
  category?: string;
  url?: string;
  cliAgentScore?: number;
  agentExecutorScore?: number;
  agentStatus?: string;
  primaryAction?: string;
};

type ComparisonReport = {
  generatedAt?: string;
  gateSummary?: GateSummary;
  comparisons?: unknown[];
};

type GateFailure = {
  file: string;
  message: string;
};

if (isMainModule()) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: pnpm compare:gate <comparison-json> [...]");
    process.exit(2);
  }

  const failures = files.flatMap((file) => checkReport(file, readReport(file)));
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.file}: ${failure.message}`);
    }
    process.exit(1);
  }

  for (const file of files) {
    const summary = readReport(file).gateSummary;
    const included = typeof summary?.included === "number" ? summary.included : 0;
    console.log(`${file}: gate ok (${included} included)`);
  }
}

export function checkComparisonGateReport(report: ComparisonReport, file = "<report>"): GateFailure[] {
  return checkReport(file, report);
}

function readReport(file: string): ComparisonReport {
  const text = readFileSync(file, "utf8");
  const jsonStart = text.indexOf('{\n  "generatedAt"');
  const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
  return JSON.parse(jsonText) as ComparisonReport;
}

function checkReport(file: string, report: ComparisonReport): GateFailure[] {
  const summary = report.gateSummary;
  if (!summary) return [{ file, message: "missing gateSummary" }];
  if (typeof summary.averageAgentExecutorScore === "number") return checkStaticGate(file, summary);
  if (typeof summary.averageAgentToBrowserTokenRatio === "number") return checkTokenGate(file, summary);
  return [{ file, message: "unknown comparison report type" }];
}

function checkStaticGate(file: string, summary: GateSummary): GateFailure[] {
  const failures: GateFailure[] = [];
  requireAtLeast(file, failures, "included", summary.included, 1);
  requireAtLeast(file, failures, "averageCliAgentScore", summary.averageCliAgentScore, 0.8);
  requireAtLeast(file, failures, "minCliAgentScore", summary.minCliAgentScore, 0.8);
  requireAtLeast(file, failures, "averageAgentExecutorScore", summary.averageAgentExecutorScore, 0.995);
  requireAtLeast(file, failures, "minAgentExecutorScore", summary.minAgentExecutorScore, 0.995);
  requireAtLeast(file, failures, "averageAgentContractScore", summary.averageAgentContractScore, 0.995);
  requireAtLeast(file, failures, "averageActionSchemaScore", summary.averageActionSchemaScore, 0.995);
  requireAtLeast(file, failures, "averageSearchResultActionScore", summary.averageSearchResultActionScore, 0.995);
  requireAtLeast(file, failures, "averagePageLinkCommandScore", summary.averagePageLinkCommandScore, 0.995);
  requireAtLeast(file, failures, "averageContentEvidenceMetadataScore", summary.averageContentEvidenceMetadataScore, 0.995);
  requireAtLeast(file, failures, "averageReadabilityReasonScore", summary.averageReadabilityReasonScore, 0.995);
  requireAtLeast(file, failures, "averageAgentRoutingIntentScore", summary.averageAgentRoutingIntentScore, 0.995);
  requireAtLeast(file, failures, "averageAgentContinuationModeScore", summary.averageAgentContinuationModeScore, 0.995);
  requireAtLeast(file, failures, "averageAgentNextScore", summary.averageAgentNextScore, 0.995);
  requireAtLeast(file, failures, "averageAgentRunbookScore", summary.averageAgentRunbookScore, 0.995);
  requireAtLeast(file, failures, "averageAgentRunbookShortcutScore", summary.averageAgentRunbookShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentExecutorStepScore", summary.averageAgentExecutorStepScore, 0.995);
  requireAtLeast(file, failures, "averageAgentBriefExecutorStepScore", summary.averageAgentBriefExecutorStepScore, 0.995);
  requireAtLeast(file, failures, "averageAgentHandoffScore", summary.averageAgentHandoffScore, 0.995);
  requireAtLeast(file, failures, "averageAgentExecutionPlanScore", summary.averageAgentExecutionPlanScore, 0.995);
  requireAtLeast(file, failures, "averageAgentExpectedOutcomeScore", summary.averageAgentExpectedOutcomeScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSignalScore", summary.averageAgentSignalScore, 0.995);
  requireAtLeast(file, failures, "averageAgentQualityGateScore", summary.averageAgentQualityGateScore, 0.995);
  requireAtLeast(file, failures, "averageAgentBrowserAdvantageScore", summary.averageAgentBrowserAdvantageScore, 0.995);
  requireAtLeast(file, failures, "averageAgentReadTargetScore", summary.averageAgentReadTargetScore, 0.995);
  requireAtLeast(file, failures, "averageAgentResultChoiceScore", summary.averageAgentResultChoiceScore, 0.995);
  requireAtLeast(file, failures, "averageAgentChoiceCountScore", summary.averageAgentChoiceCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentTopChoiceShortcutScore", summary.averageAgentTopChoiceShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSourceChoiceScore", summary.averageAgentSourceChoiceScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSourceSearchShortcutScore", summary.averageAgentSourceSearchShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSourceSearchProvenanceScore", summary.averageAgentSourceSearchProvenanceScore, 0.995);
  requireAtLeast(file, failures, "averageAgentRecommendedMetadataScore", summary.averageAgentRecommendedMetadataScore, 0.995);
  requireAtLeast(file, failures, "averageAgentCitationScore", summary.averageAgentCitationScore, 0.995);
  requireAtLeast(file, failures, "averageAgentAnswerPlanScore", summary.averageAgentAnswerPlanScore, 0.995);
  requireAtLeast(file, failures, "averageAgentAnswerEvidenceScore", summary.averageAgentAnswerEvidenceScore, 0.995);
  requireAtLeast(file, failures, "averageAgentBrowserNeedScore", summary.averageAgentBrowserNeedScore, 0.995);
  requireAtLeast(file, failures, "averageAgentBrowserHtmlScore", summary.averageAgentBrowserHtmlScore, 0.995);
  requireAtLeast(file, failures, "averageAgentPageKindScore", summary.averageAgentPageKindScore, 0.995);
  requireAtLeast(file, failures, "averageAgentAlternativeActionCountScore", summary.averageAgentAlternativeActionCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentUsabilityScoreConsistency", summary.averageAgentUsabilityScoreConsistency, 0.995);
  requireAtLeast(file, failures, "averageAgentEvidenceQualityScoreConsistency", summary.averageAgentEvidenceQualityScoreConsistency, 0.995);
  requireAtLeast(file, failures, "averageAgentSourceQualityScoreConsistency", summary.averageAgentSourceQualityScoreConsistency, 0.995);
  requireAtLeast(file, failures, "averageAgentBestReadTargetScore", summary.averageAgentBestReadTargetScore, 0.995);
  requireAtLeast(file, failures, "averageAgentDiagnosticCountScore", summary.averageAgentDiagnosticCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentVerificationCountScore", summary.averageAgentVerificationCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentVerificationQueryScore", summary.averageAgentVerificationQueryScore, 0.995);
  requireAtLeast(file, failures, "averageAgentEvidenceCountShortcutScore", summary.averageAgentEvidenceCountShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSignalCountShortcutScore", summary.averageAgentSignalCountShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentProblemShortcutScore", summary.averageAgentProblemShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentResponseMetadataScore", summary.averageAgentResponseMetadataScore, 0.995);
  requireAtLeast(file, failures, "averageAgentHiddenSignalScore", summary.averageAgentHiddenSignalScore, 0.995);
  requireAtLeast(file, failures, "averageAgentResultCountScore", summary.averageAgentResultCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSourceLinkCountScore", summary.averageAgentSourceLinkCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentFormActionCountScore", summary.averageAgentFormActionCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentFormActionChoiceScore", summary.averageAgentFormActionChoiceScore, 0.995);
  requireAtLeast(file, failures, "averageAgentHiddenSignalCountScore", summary.averageAgentHiddenSignalCountScore, 0.995);
  requireAtLeast(file, failures, "averageAgentReadabilityReasonScore", summary.averageAgentReadabilityReasonScore, 0.995);
  requireAtLeast(file, failures, "averageAgentCanContinueScore", summary.averageAgentCanContinueScore, 0.995);
  requireAtLeast(file, failures, "averageAgentPrimaryExecutionScore", summary.averageAgentPrimaryExecutionScore, 0.995);
  requireAtLeast(file, failures, "averageAgentPrimaryShortcutScore", summary.averageAgentPrimaryShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentAlternativeActionShortcutScore", summary.averageAgentAlternativeActionShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentExecutorShortcutScore", summary.averageAgentExecutorShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentHandoffShortcutScore", summary.averageAgentHandoffShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentAnswerShortcutScore", summary.averageAgentAnswerShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentPlanShortcutScore", summary.averageAgentPlanShortcutScore, 0.995);
  requireAtLeast(file, failures, "averageAgentActionListScore", summary.averageAgentActionListScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSearchDecisionScore", summary.averageAgentSearchDecisionScore, 0.995);
  requireAtLeast(file, failures, "averageAgentPageDecisionScore", summary.averageAgentPageDecisionScore, 0.995);
  requireAtLeast(file, failures, "averageAgentSemanticSummaryScore", summary.averageAgentSemanticSummaryScore, 0.995);
  const classifications = summary.classifications ?? {};
  requireEqual(file, failures, "classifications.over-collected", classifications["over-collected"], 0);
  requireEqual(file, failures, "classifications.challenge", classifications.challenge, 0);
  requireEqual(file, failures, "classifications.shell", classifications.shell, 0);
  if (failures.some((failure) => failure.message.startsWith("minCliAgentScore ") || failure.message.startsWith("minAgentExecutorScore "))) {
    for (const detail of weakAgentTargetMessages(summary.weakAgentTargets)) {
      failures.push({ file, message: detail });
    }
  }
  return failures;
}

function checkTokenGate(file: string, summary: GateSummary): GateFailure[] {
  const failures: GateFailure[] = [];
  requireAtLeast(file, failures, "included", summary.included, 1);
  requireAtMost(file, failures, "averageAgentToBrowserTokenRatio", summary.averageAgentToBrowserTokenRatio, 1);
  if (typeof summary.excludedThinBrowserReference !== "number") {
    failures.push({ file, message: "missing excludedThinBrowserReference" });
  }
  return failures;
}

function requireAtLeast(file: string, failures: GateFailure[], field: string, value: unknown, minimum: number): void {
  if (typeof value === "number" && value >= minimum) return;
  failures.push({ file, message: `${field} expected >= ${minimum}, got ${formatValue(value)}` });
}

function requireAtMost(file: string, failures: GateFailure[], field: string, value: unknown, maximum: number): void {
  if (typeof value === "number" && value <= maximum) return;
  failures.push({ file, message: `${field} expected <= ${maximum}, got ${formatValue(value)}` });
}

function requireEqual(file: string, failures: GateFailure[], field: string, value: unknown, expected: number): void {
  if (value === expected) return;
  failures.push({ file, message: `${field} expected ${expected}, got ${formatValue(value)}` });
}

function formatValue(value: unknown): string {
  return typeof value === "undefined" ? "undefined" : JSON.stringify(value);
}

function weakAgentTargetMessages(targets: GateWeakAgentTarget[] | undefined): string[] {
  if (!Array.isArray(targets) || targets.length === 0) return ["weakAgentTargets missing or empty"];
  return targets.slice(0, 5).map((target) => {
    const label = [target.category, target.url].filter((item) => typeof item === "string" && item.length > 0).join(" ");
    const status = [target.agentStatus, target.primaryAction].filter((item) => typeof item === "string" && item.length > 0).join("/");
    return [
      "weakAgentTarget",
      label || "<unknown>",
      `cli=${formatValue(target.cliAgentScore)}`,
      `executor=${formatValue(target.agentExecutorScore)}`,
      status ? `status=${status}` : "",
    ].filter(Boolean).join(" ");
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  return import.meta.url === pathToFileURL(entrypoint).href;
}
