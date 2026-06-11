import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkComparisonGateReport } from "../scripts/check-comparison-gates";

type StaticGateSummary = Record<string, unknown> & {
  classifications: Record<string, number>;
};

function staticSummary(overrides: Partial<StaticGateSummary> = {}): StaticGateSummary {
  return {
    included: 4,
    excluded: 1,
    averageCliAgentScore: 1,
    minCliAgentScore: 1,
    averageAgentExecutorScore: 1,
    minAgentExecutorScore: 1,
    averageAgentContractScore: 1,
    averageActionSchemaScore: 1,
    averageSearchResultActionScore: 1,
    averagePageLinkCommandScore: 1,
    averageContentEvidenceMetadataScore: 1,
    averageReadabilityReasonScore: 1,
    averageAgentRoutingIntentScore: 1,
    averageAgentContinuationModeScore: 1,
    averageAgentNextScore: 1,
    averageAgentNextShortcutScore: 1,
    averageAgentRunbookScore: 1,
    averageAgentRunbookShortcutScore: 1,
    averageAgentExecutorStepScore: 1,
    averageAgentBriefExecutorStepScore: 1,
    averageAgentHandoffScore: 1,
    averageAgentExecutionPlanScore: 1,
    averageAgentExpectedOutcomeScore: 1,
    averageAgentSignalScore: 1,
    averageAgentQualityGateScore: 1,
    averageAgentBrowserAdvantageScore: 1,
    averageAgentReadTargetScore: 1,
    averageAgentTopReadTargetShortcutScore: 1,
    averageAgentResultCountScore: 1,
    averageAgentResultChoiceScore: 1,
    averageAgentTopResultChoiceShortcutScore: 1,
    averageAgentChoiceCountScore: 1,
    averageAgentTopChoiceShortcutScore: 1,
    averageAgentSourceLinkCountScore: 1,
    averageAgentFormActionCountScore: 1,
    averageAgentFormActionChoiceScore: 1,
    averageAgentTopFormActionChoiceShortcutScore: 1,
    averageAgentHiddenSignalCountScore: 1,
    averageAgentTopHiddenSignalShortcutScore: 1,
    averageAgentSourceChoiceScore: 1,
    averageAgentTopSourceChoiceShortcutScore: 1,
    averageAgentSourceSearchShortcutScore: 1,
    averageAgentSourceSearchProvenanceScore: 1,
    averageAgentRecommendedMetadataScore: 1,
    averageAgentCitationScore: 1,
    averageAgentTopCitationShortcutScore: 1,
    averageAgentAnswerPlanScore: 1,
    averageAgentAnswerEvidenceScore: 1,
    averageAgentBrowserNeedScore: 1,
    averageAgentBrowserHtmlScore: 1,
    averageAgentPageKindScore: 1,
    averageAgentPageMetadataShortcutScore: 1,
    averageAgentAlternativeActionCountScore: 1,
    averageAgentUsabilityScoreConsistency: 1,
    averageAgentEvidenceQualityScoreConsistency: 1,
    averageAgentSourceQualityScoreConsistency: 1,
    averageAgentBestReadTargetScore: 1,
    averageAgentDiagnosticCountScore: 1,
    averageAgentVerificationCountScore: 1,
    averageAgentVerificationQueryScore: 1,
    averageAgentEvidenceCountShortcutScore: 1,
    averageAgentSignalCountShortcutScore: 1,
    averageAgentTopQualityShortcutScore: 1,
    averageAgentProblemShortcutScore: 1,
    averageAgentResponseMetadataScore: 1,
    averageAgentHiddenSignalScore: 1,
    averageAgentReadabilityReasonScore: 1,
    averageAgentCanContinueScore: 1,
    averageAgentPrimaryExecutionScore: 1,
    averageAgentPrimaryShortcutScore: 1,
    averageAgentAlternativeActionShortcutScore: 1,
    averageAgentExecutorShortcutScore: 1,
    averageAgentHandoffShortcutScore: 1,
    averageAgentAnswerShortcutScore: 1,
    averageAgentPlanShortcutScore: 1,
    averageAgentActionListScore: 1,
    averageAgentTopActionShortcutScore: 1,
    averageAgentSearchDecisionScore: 1,
    averageAgentPageDecisionScore: 1,
    averageAgentSemanticSummaryScore: 1,
    averageAgentBarrierShortcutScore: 1,
    averageAgentStructuredShortcutScore: 1,
    weakAgentTargets: [],
    classifications: {
      usable: 4,
      "over-collected": 0,
      challenge: 0,
      shell: 0,
    },
    ...overrides,
  };
}

function staticReport(summary: StaticGateSummary = staticSummary()) {
  return {
    generatedAt: "2026-06-10T00:00:00.000Z",
    gateSummary: summary,
    comparisons: [],
  };
}

describe("comparison gate checker", () => {
  it("accepts static reports with complete agent executor signals", () => {
    expect(checkComparisonGateReport(staticReport())).toEqual([]);
  });

  it("rejects static reports that regress executor handoff quality", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      averageAgentNextScore: 0.75,
      averageAgentNextShortcutScore: 0.74,
      averageAgentExecutorStepScore: 0.8,
      averageAgentBriefExecutorStepScore: 0.7,
      averageAgentHandoffScore: 0.9,
      averageAgentSourceSearchProvenanceScore: 0.75,
      classifications: {
        usable: 3,
        "over-collected": 1,
        challenge: 0,
        shell: 0,
      },
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageAgentNextScore expected >= 0.995, got 0.75",
      "averageAgentNextShortcutScore expected >= 0.995, got 0.74",
      "averageAgentExecutorStepScore expected >= 0.995, got 0.8",
      "averageAgentBriefExecutorStepScore expected >= 0.995, got 0.7",
      "averageAgentHandoffScore expected >= 0.995, got 0.9",
      "averageAgentSourceSearchProvenanceScore expected >= 0.995, got 0.75",
      "classifications.over-collected expected 0, got 1",
    ]);
  });

  it("rejects static reports with incomplete agent contract features", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      averageAgentContractScore: 0.75,
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageAgentContractScore expected >= 0.995, got 0.75",
    ]);
  });

  it("rejects static reports below the aggregate CLI agent usefulness floor", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      averageCliAgentScore: 0.79,
      minCliAgentScore: 0.79,
      weakAgentTargets: [
        {
          category: "Weak search",
          url: "https://search.example/",
          cliAgentScore: 0.79,
          agentExecutorScore: 1,
          agentStatus: "choose-result",
          primaryAction: "refine-search",
        },
      ],
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageCliAgentScore expected >= 0.8, got 0.79",
      "minCliAgentScore expected >= 0.8, got 0.79",
      "weakAgentTarget Weak search https://search.example/ cli=0.79 executor=1 status=choose-result/refine-search",
    ]);
  });

  it("rejects static reports with weak per-target agent floors", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      minCliAgentScore: 0.79,
      minAgentExecutorScore: 0.99,
      weakAgentTargets: [
        {
          category: "Weak page",
          url: "https://page.example/",
          cliAgentScore: 0.79,
          agentExecutorScore: 0.99,
          agentStatus: "verify",
          primaryAction: "open-site-search",
        },
      ],
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "minCliAgentScore expected >= 0.8, got 0.79",
      "minAgentExecutorScore expected >= 0.995, got 0.99",
      "weakAgentTarget Weak page https://page.example/ cli=0.79 executor=0.99 status=verify/open-site-search",
    ]);
  });

  it("rejects static reports that drop result, source, or action detail gates", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      averageAgentResultChoiceScore: 0.9,
      averageAgentTopResultChoiceShortcutScore: 0.36,
      averageAgentChoiceCountScore: 0.85,
      averageAgentTopChoiceShortcutScore: 0.65,
      averageAgentSourceChoiceScore: 0.8,
      averageAgentActionListScore: 0.75,
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageAgentResultChoiceScore expected >= 0.995, got 0.9",
      "averageAgentTopResultChoiceShortcutScore expected >= 0.995, got 0.36",
      "averageAgentChoiceCountScore expected >= 0.995, got 0.85",
      "averageAgentTopChoiceShortcutScore expected >= 0.995, got 0.65",
      "averageAgentSourceChoiceScore expected >= 0.995, got 0.8",
      "averageAgentActionListScore expected >= 0.995, got 0.75",
    ]);
  });

  it("rejects static reports that drop executable action pointers", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      averageActionSchemaScore: 0.75,
      averageSearchResultActionScore: 0.8,
      averagePageLinkCommandScore: 0.9,
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageActionSchemaScore expected >= 0.995, got 0.75",
      "averageSearchResultActionScore expected >= 0.995, got 0.8",
      "averagePageLinkCommandScore expected >= 0.995, got 0.9",
    ]);
  });

  it("rejects static reports that drop page-check metadata and hidden-signal gates", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      averageContentEvidenceMetadataScore: 0.9,
      averageReadabilityReasonScore: 0.8,
      averageAgentHiddenSignalScore: 0.75,
      averageAgentResponseMetadataScore: 0.7,
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageContentEvidenceMetadataScore expected >= 0.995, got 0.9",
      "averageReadabilityReasonScore expected >= 0.995, got 0.8",
      "averageAgentResponseMetadataScore expected >= 0.995, got 0.7",
      "averageAgentHiddenSignalScore expected >= 0.995, got 0.75",
    ]);
  });

  it("rejects static reports that drop top-level agent consistency gates", () => {
    const failures = checkComparisonGateReport(staticReport(staticSummary({
      averageAgentPageKindScore: 0.9,
      averageAgentPageMetadataShortcutScore: 0.88,
      averageAgentAlternativeActionCountScore: 0.8,
      averageAgentUsabilityScoreConsistency: 0.7,
      averageAgentEvidenceQualityScoreConsistency: 0.6,
      averageAgentSourceQualityScoreConsistency: 0.5,
      averageAgentBestReadTargetScore: 0.4,
      averageAgentDiagnosticCountScore: 0.3,
      averageAgentVerificationCountScore: 0.2,
      averageAgentVerificationQueryScore: 0.15,
      averageAgentEvidenceCountShortcutScore: 0.12,
      averageAgentSignalCountShortcutScore: 0.11,
      averageAgentTopQualityShortcutScore: 0.14,
      averageAgentProblemShortcutScore: 0.13,
      averageAgentResultCountScore: 0.1,
      averageAgentSourceLinkCountScore: 0,
      averageAgentFormActionCountScore: 0.5,
      averageAgentFormActionChoiceScore: 0.4,
      averageAgentTopFormActionChoiceShortcutScore: 0.33,
      averageAgentHiddenSignalCountScore: 0.25,
      averageAgentTopHiddenSignalShortcutScore: 0.31,
      averageAgentTopSourceChoiceShortcutScore: 0.34,
      averageAgentSourceSearchShortcutScore: 0.35,
      averageAgentTopReadTargetShortcutScore: 0.36,
      averageAgentRunbookShortcutScore: 0.42,
      averageAgentAlternativeActionShortcutScore: 0.43,
      averageAgentExecutorShortcutScore: 0.45,
      averageAgentHandoffShortcutScore: 0.55,
      averageAgentAnswerShortcutScore: 0.65,
      averageAgentPlanShortcutScore: 0.75,
      averageAgentTopCitationShortcutScore: 0.74,
      averageAgentTopActionShortcutScore: 0.73,
      averageAgentBarrierShortcutScore: 0.78,
      averageAgentStructuredShortcutScore: 0.79,
      averageAgentReadabilityReasonScore: 0.85,
    })), "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageAgentRunbookShortcutScore expected >= 0.995, got 0.42",
      "averageAgentTopReadTargetShortcutScore expected >= 0.995, got 0.36",
      "averageAgentTopSourceChoiceShortcutScore expected >= 0.995, got 0.34",
      "averageAgentSourceSearchShortcutScore expected >= 0.995, got 0.35",
      "averageAgentTopCitationShortcutScore expected >= 0.995, got 0.74",
      "averageAgentPageKindScore expected >= 0.995, got 0.9",
      "averageAgentPageMetadataShortcutScore expected >= 0.995, got 0.88",
      "averageAgentAlternativeActionCountScore expected >= 0.995, got 0.8",
      "averageAgentUsabilityScoreConsistency expected >= 0.995, got 0.7",
      "averageAgentEvidenceQualityScoreConsistency expected >= 0.995, got 0.6",
      "averageAgentSourceQualityScoreConsistency expected >= 0.995, got 0.5",
      "averageAgentBestReadTargetScore expected >= 0.995, got 0.4",
      "averageAgentDiagnosticCountScore expected >= 0.995, got 0.3",
      "averageAgentVerificationCountScore expected >= 0.995, got 0.2",
      "averageAgentVerificationQueryScore expected >= 0.995, got 0.15",
      "averageAgentEvidenceCountShortcutScore expected >= 0.995, got 0.12",
      "averageAgentSignalCountShortcutScore expected >= 0.995, got 0.11",
      "averageAgentTopQualityShortcutScore expected >= 0.995, got 0.14",
      "averageAgentProblemShortcutScore expected >= 0.995, got 0.13",
      "averageAgentResultCountScore expected >= 0.995, got 0.1",
      "averageAgentSourceLinkCountScore expected >= 0.995, got 0",
      "averageAgentFormActionCountScore expected >= 0.995, got 0.5",
      "averageAgentFormActionChoiceScore expected >= 0.995, got 0.4",
      "averageAgentTopFormActionChoiceShortcutScore expected >= 0.995, got 0.33",
      "averageAgentHiddenSignalCountScore expected >= 0.995, got 0.25",
      "averageAgentTopHiddenSignalShortcutScore expected >= 0.995, got 0.31",
      "averageAgentReadabilityReasonScore expected >= 0.995, got 0.85",
      "averageAgentAlternativeActionShortcutScore expected >= 0.995, got 0.43",
      "averageAgentExecutorShortcutScore expected >= 0.995, got 0.45",
      "averageAgentHandoffShortcutScore expected >= 0.995, got 0.55",
      "averageAgentAnswerShortcutScore expected >= 0.995, got 0.65",
      "averageAgentPlanShortcutScore expected >= 0.995, got 0.75",
      "averageAgentTopActionShortcutScore expected >= 0.995, got 0.73",
      "averageAgentBarrierShortcutScore expected >= 0.995, got 0.78",
      "averageAgentStructuredShortcutScore expected >= 0.995, got 0.79",
    ]);
  });

  it("accepts token reports after thin browser references are tracked", () => {
    const failures = checkComparisonGateReport({
      generatedAt: "2026-06-10T00:00:00.000Z",
      gateSummary: {
        included: 6,
        excluded: 1,
        excludedThinBrowserReference: 1,
        averageAgentToBrowserTokenRatio: 0.559,
      },
      comparisons: [],
    });

    expect(failures).toEqual([]);
  });

  it("rejects token reports without thin-reference accounting", () => {
    const failures = checkComparisonGateReport({
      generatedAt: "2026-06-10T00:00:00.000Z",
      gateSummary: {
        included: 7,
        excluded: 0,
        averageAgentToBrowserTokenRatio: 4.838,
      },
      comparisons: [],
    }, "tokens.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageAgentToBrowserTokenRatio expected <= 1, got 4.838",
      "missing excludedThinBrowserReference",
    ]);
  });

  it("keeps produced agent gate metrics wired into compare:gate", () => {
    const compareStatic = readFileSync(join(process.cwd(), "scripts", "compare-static.ts"), "utf8");
    const gateChecker = readFileSync(join(process.cwd(), "scripts", "check-comparison-gates.ts"), "utf8");
    const produced = [...compareStatic.matchAll(/(average[A-Za-z0-9]+): average\(/g)]
      .map((match) => match[1])
      .filter((field): field is string => Boolean(field));
    const required = [...gateChecker.matchAll(/requireAt(?:Least|Most)\([^,]+, [^,]+, "(average[A-Za-z0-9]+)"/g)]
      .map((match) => match[1])
      .filter((field): field is string => Boolean(field));
    const intentionallyDiagnosticOnly = new Set([
      "averagePrecision",
      "averageReferenceRecall",
      "averageScore",
    ]);

    expect(produced.filter((field) => !required.includes(field) && !intentionallyDiagnosticOnly.has(field)).sort()).toEqual([]);
  });
});
