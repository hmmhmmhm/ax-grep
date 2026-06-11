import { describe, expect, it } from "vitest";
import type {
  AgentAction,
  AgentActionTargetChoice,
  AgentAnswerPlan,
  AgentCitation,
  AgentFormChoice,
  AgentHandoff,
  AgentResultChoice,
  AgentSourceChoice,
  AgentSourceSearchResult,
  AgentSummary,
  AgentTarget,
} from "../src/index";

describe("public agent types", () => {
  it("exports detailed handoff choice and evidence shapes", () => {
    const target: AgentTarget = {
      title: "Challenge",
      url: "https://example.test/challenge",
      path: "pageCheck.barriers[0]",
      text: "Challenge: verify you are human",
      selector: "main > h1",
      snippet: "verify you are human",
    };
    const resultChoice: AgentResultChoice = {
      id: "r1",
      path: "searchResults[0]",
      title: "Example result",
      url: "https://example.test/result",
      rank: 1,
      snippet: "Result summary",
      commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent-brief"],
    };
    const sourceChoice: AgentSourceChoice = {
      id: "s1",
      path: "pageCheck.sourceLinks[0]",
      title: "Source",
      url: "https://source.example/report",
      selector: "a:nth-of-type(1)",
      kind: "external",
      commandArgs: ["ax-grep", "https://source.example/report", "--agent-brief"],
    };
    const evidence: AgentCitation = {
      kind: "content",
      id: "e1",
      path: "pageCheck.contentEvidence[0]",
      confidence: "high",
      text: "Readable evidence",
      reason: "semantic content",
    };
    const answerPlan: AgentAnswerPlan = {
      status: "ready",
      confidence: "high",
      reason: "Evidence is ready.",
      gaps: [],
      useCitationIds: ["e1"],
      readFrom: "pageCheck.contentEvidence",
    };
    const sourceResult: AgentSourceSearchResult = {
      id: "selected",
      path: "sourceSearch.selectedResult",
      title: "Selected source",
      url: "https://source.example/report",
      snippet: "Source summary",
      commandArgs: ["ax-grep", "--search", "source", "--open-result", "1", "--agent-brief"],
    };
    const handoff: AgentHandoff = {
      instruction: "Answer now.",
      decision: "return",
      mode: "read",
      operation: "return",
      confidence: "high",
      answerStatus: answerPlan.status,
      answerReady: true,
      shouldContinue: false,
      terminal: true,
      maxSuggestedIterations: 0,
      expectedOutcome: "read-evidence",
      reason: "Use current evidence.",
      target,
      resultChoices: [resultChoice],
      sourceChoices: [sourceChoice],
      verificationFoundQueries: ["present"],
      verificationMissingQueries: ["missing"],
      answerEvidence: [evidence],
      sourceSearch: {
        query: "source",
        engine: "auto",
        searchUrl: "https://search.example/?q=source",
        selectedRank: 1,
        selectedTitle: "Selected source",
        selectedUrl: sourceResult.url,
        selectedResult: sourceResult,
      },
      readFrom: "pageCheck.contentEvidence",
      readValue: {
        path: "pageCheck.contentEvidence",
        value: [evidence],
      },
    };

    expect(handoff.target?.selector).toBe("main > h1");
    expect(handoff.resultChoices?.[0]?.snippet).toBe("Result summary");
    expect(handoff.sourceChoices?.[0]?.selector).toBe("a:nth-of-type(1)");
    expect(handoff.verificationMissingQueries).toEqual(["missing"]);
    expect(handoff.answerEvidence?.[0]?.text).toBe("Readable evidence");
  });

  it("exports source-link action references for agent action lists", () => {
    const sourceAction: AgentAction = {
      action: "open-source-link",
      execution: "run-command",
      sourceLinkRef: "pageCheck.sourceLinks[0]",
      commandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      source: "pageCheck.nextSteps",
    };
    const summary: Pick<AgentSummary, "actions" | "primaryAction"> = {
      actions: [sourceAction],
      primaryAction: sourceAction,
    };

    expect(summary.actions?.[0]?.sourceLinkRef).toBe("pageCheck.sourceLinks[0]");
    expect(summary.primaryAction?.sourceLinkRef).toBe("pageCheck.sourceLinks[0]");
  });

  it("exports top-level agent count shortcuts", () => {
    const formChoice: AgentFormChoice = {
      id: "f1",
      path: "pageCheck.forms[0]",
      rank: 1,
      method: "get",
      fieldCount: 1,
      text: "GET https://example.test/find; query field: q",
      actionUrl: "https://example.test/find",
      queryField: "q",
      urlTemplate: "https://example.test/find?q={query}",
      fields: [{ name: "q", type: "search", selector: "input[name=\"q\"]" }],
    };
    const actionTargetChoice: AgentActionTargetChoice = {
      id: "at1",
      path: "pageCheck.actionTargets[0]",
      rank: 1,
      kind: "search",
      name: "Search docs",
      text: "search: Search docs template=https://example.test/search?q={query}",
      source: "json-ld",
      urlTemplate: "https://example.test/search?q={query}",
      queryInput: "required name=query",
    };
    const summary: Pick<
      AgentSummary,
      | "resultCount"
      | "resultChoiceCount"
      | "evidenceCount"
      | "formCount"
      | "formChoiceCount"
      | "formChoices"
      | "actionTargetCount"
      | "actionTargetChoiceCount"
      | "actionTargetChoices"
      | "hiddenSignalCount"
      | "hiddenReadTargetCount"
      | "bestHiddenReadTarget"
      | "bestHiddenReadTargetCount"
      | "bestHiddenReadTargetScore"
      | "bestHiddenReadTargetPrimary"
      | "bestHiddenReadTargetReason"
      | "sourceLinkCount"
      | "sourceChoiceCount"
      | "topChoiceKind"
      | "topChoicePath"
      | "topChoiceLabel"
      | "topChoiceUrl"
      | "topChoiceCommandArgs"
      | "sourceSearchQuery"
      | "sourceSearchEngine"
      | "sourceSearchSelectedEngine"
      | "sourceSearchSearchUrl"
      | "sourceSearchSelectedRank"
      | "sourceSearchSelectedTitle"
      | "sourceSearchSelectedUrl"
      | "sourceSearchAlternateCount"
      | "verificationFoundQueries"
      | "verificationMissingQueries"
      | "topVerificationFoundQuery"
      | "topVerificationMissingQuery"
      | "citationCount"
      | "answerEvidenceCount"
      | "topAnswerEvidenceId"
      | "topAnswerEvidencePath"
      | "topAnswerEvidenceKind"
      | "topAnswerEvidenceText"
      | "topAnswerEvidenceTitle"
      | "topAnswerEvidenceUrl"
      | "topAnswerEvidenceConfidence"
      | "topAnswerEvidenceReason"
      | "semanticNodeCount"
      | "semanticNamedRoleCount"
      | "semanticInteractiveCount"
      | "semanticTopRole"
      | "semanticTopRoleCount"
      | "semanticTopHeading"
      | "semanticTopLandmark"
      | "answerPlanStatus"
      | "answerPlanConfidence"
      | "answerGapCount"
      | "answerUseCitationIds"
      | "answerPlanReadFrom"
      | "answerPlanCommandArgs"
      | "answerPlanUrl"
      | "readTargetCount"
      | "actionCount"
      | "bestReadTarget"
      | "bestReadTargetCount"
      | "bestReadTargetScore"
      | "bestReadTargetPrimary"
      | "bestReadTargetReason"
      | "signalCount"
      | "signalWarningCount"
      | "signalErrorCount"
      | "qualityGateCount"
      | "qualityGateFailCount"
      | "problemSignalKind"
      | "problemSignalSeverity"
      | "problemSignalMessage"
      | "failingQualityGateKind"
      | "failingQualityGateSeverity"
      | "failingQualityGateMessage"
      | "failingQualityGatePath"
      | "failingQualityGateScore"
      | "topDiagnosticCode"
      | "topDiagnosticSeverity"
      | "topDiagnosticMessage"
      | "executorDecision"
      | "executorMode"
      | "executorActionName"
      | "executorOperation"
      | "executorConfidence"
      | "executorAnswerReady"
      | "executorShouldContinue"
      | "executorTerminal"
      | "executorCommandArgs"
      | "executorReadFrom"
      | "executorUrl"
      | "executorTargetUrl"
      | "executorTargetPath"
      | "executorTargetSelector"
      | "executorTargetText"
      | "executorExpectedOutcome"
      | "handoffDecision"
      | "handoffMode"
      | "handoffActionName"
      | "handoffOperation"
      | "handoffAnswerStatus"
      | "handoffConfidence"
      | "handoffAnswerReady"
      | "handoffShouldContinue"
      | "handoffTerminal"
      | "handoffPriority"
      | "handoffPriorityReason"
      | "handoffCommandArgs"
      | "handoffReadFrom"
      | "handoffUrl"
      | "handoffTargetUrl"
      | "handoffTargetPath"
      | "handoffTargetSelector"
      | "handoffTargetText"
      | "handoffExpectedOutcome"
      | "primaryActionName"
      | "primaryReason"
      | "primaryPriority"
      | "primaryPriorityReason"
      | "primarySourceLinkRef"
      | "recommendedUrl"
      | "recommendedTitle"
      | "recommendedCommandArgs"
    > = {
      resultCount: 2,
      resultChoiceCount: 2,
      evidenceCount: 1,
      formCount: 1,
      formChoiceCount: 1,
      formChoices: [formChoice],
      actionTargetCount: 2,
      actionTargetChoiceCount: 1,
      actionTargetChoices: [actionTargetChoice],
      hiddenSignalCount: 4,
      hiddenReadTargetCount: 2,
      bestHiddenReadTarget: "pageCheck.apiEndpoints",
      bestHiddenReadTargetCount: 4,
      bestHiddenReadTargetScore: 0.74,
      bestHiddenReadTargetPrimary: true,
      bestHiddenReadTargetReason: "Hidden API endpoints.",
      sourceLinkCount: 1,
      sourceChoiceCount: 1,
      topChoiceKind: "source",
      topChoicePath: "pageCheck.sourceLinks[0]",
      topChoiceLabel: "Source",
      topChoiceUrl: "https://source.example/report",
      topChoiceCommandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      sourceSearchQuery: "ax-grep docs",
      sourceSearchEngine: "auto",
      sourceSearchSelectedEngine: "duckduckgo",
      sourceSearchSearchUrl: "https://duckduckgo.com/html/?q=ax-grep%20docs",
      sourceSearchSelectedRank: 2,
      sourceSearchSelectedTitle: "ax-grep documentation",
      sourceSearchSelectedUrl: "https://source.example/result",
      sourceSearchAlternateCount: 1,
      verificationFoundQueries: ["present"],
      verificationMissingQueries: ["missing"],
      topVerificationFoundQuery: "present",
      topVerificationMissingQuery: "missing",
      citationCount: 2,
      answerEvidenceCount: 1,
      topAnswerEvidenceId: "e1",
      topAnswerEvidencePath: "pageCheck.contentEvidence[0]",
      topAnswerEvidenceKind: "content",
      topAnswerEvidenceText: "Readable evidence",
      topAnswerEvidenceTitle: "Example evidence",
      topAnswerEvidenceUrl: "https://example.test",
      topAnswerEvidenceConfidence: "high",
      topAnswerEvidenceReason: "Primary answer evidence.",
      semanticNodeCount: 12,
      semanticNamedRoleCount: 4,
      semanticInteractiveCount: 2,
      semanticTopRole: "link",
      semanticTopRoleCount: 2,
      semanticTopHeading: "Example",
      semanticTopLandmark: "main",
      answerPlanStatus: "ready",
      answerPlanConfidence: "high",
      answerGapCount: 0,
      answerUseCitationIds: ["e1"],
      answerPlanReadFrom: "pageCheck.contentEvidence",
      answerPlanCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      answerPlanUrl: "https://example.test",
      readTargetCount: 3,
      actionCount: 2,
      bestReadTarget: "pageCheck.contentEvidence",
      bestReadTargetCount: 1,
      bestReadTargetScore: 0.9,
      bestReadTargetPrimary: true,
      bestReadTargetReason: "Best evidence.",
      signalCount: 2,
      signalWarningCount: 1,
      signalErrorCount: 0,
      qualityGateCount: 4,
      qualityGateFailCount: 1,
      problemSignalKind: "content",
      problemSignalSeverity: "warning",
      problemSignalMessage: "Readable content is thin.",
      failingQualityGateKind: "content",
      failingQualityGateSeverity: "warning",
      failingQualityGateMessage: "Content evidence is too thin.",
      failingQualityGatePath: "pageCheck.contentEvidence",
      failingQualityGateScore: 0.4,
      topDiagnosticCode: "NO_USEFUL_LINKS",
      topDiagnosticSeverity: "warning",
      topDiagnosticMessage: "No useful outbound links were found.",
      executorDecision: "return",
      executorMode: "read",
      executorActionName: "read-content",
      executorOperation: "return",
      executorConfidence: "high",
      executorAnswerReady: true,
      executorShouldContinue: false,
      executorTerminal: true,
      executorCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      executorReadFrom: "pageCheck.contentEvidence",
      executorUrl: "https://example.test",
      executorTargetUrl: "https://example.test",
      executorTargetPath: "pageCheck.links[0]",
      executorTargetSelector: "a.primary",
      executorTargetText: "Read more",
      executorExpectedOutcome: "read-evidence",
      handoffDecision: "return",
      handoffMode: "read",
      handoffActionName: "read-content",
      handoffOperation: "return",
      handoffAnswerStatus: "ready",
      handoffConfidence: "high",
      handoffAnswerReady: true,
      handoffShouldContinue: false,
      handoffTerminal: true,
      handoffPriority: "high",
      handoffPriorityReason: "Readable content is available.",
      handoffCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      handoffReadFrom: "pageCheck.contentEvidence",
      handoffUrl: "https://example.test",
      handoffTargetUrl: "https://example.test",
      handoffTargetPath: "pageCheck.links[0]",
      handoffTargetSelector: "a.primary",
      handoffTargetText: "Read more",
      handoffExpectedOutcome: "read-evidence",
      primaryActionName: "read-content",
      primaryReason: "Read current evidence.",
      primaryPriority: "high",
      primaryPriorityReason: "Readable content is available.",
      primarySourceLinkRef: "pageCheck.sourceLinks[0]",
      recommendedUrl: "https://example.test",
      recommendedTitle: "Example result",
      recommendedCommandArgs: ["ax-grep", "https://example.test", "--agent"],
    };

    expect(summary.hiddenSignalCount).toBe(4);
    expect(summary.bestHiddenReadTarget).toBe("pageCheck.apiEndpoints");
    expect(summary.actionTargetCount).toBe(2);
    expect(summary.actionTargetChoiceCount).toBe(1);
    expect(summary.formChoices?.[0]?.queryField).toBe("q");
    expect(summary.actionTargetChoices?.[0]?.kind).toBe("search");
    expect(summary.topChoiceKind).toBe("source");
    expect(summary.sourceSearchQuery).toBe("ax-grep docs");
    expect(summary.sourceSearchSelectedTitle).toBe("ax-grep documentation");
    expect(summary.sourceSearchAlternateCount).toBe(1);
    expect(summary.verificationMissingQueries).toEqual(["missing"]);
    expect(summary.topVerificationMissingQuery).toBe("missing");
    expect(summary.semanticTopHeading).toBe("Example");
    expect(summary.readTargetCount).toBe(3);
    expect(summary.bestReadTargetCount).toBe(1);
    expect(summary.bestReadTargetPrimary).toBe(true);
    expect(summary.qualityGateFailCount).toBe(1);
    expect(summary.problemSignalSeverity).toBe("warning");
    expect(summary.failingQualityGateKind).toBe("content");
    expect(summary.failingQualityGateSeverity).toBe("warning");
    expect(summary.failingQualityGateScore).toBe(0.4);
    expect(summary.topDiagnosticCode).toBe("NO_USEFUL_LINKS");
    expect(summary.topAnswerEvidencePath).toBe("pageCheck.contentEvidence[0]");
    expect(summary.answerPlanStatus).toBe("ready");
    expect(summary.executorOperation).toBe("return");
    expect(summary.executorTerminal).toBe(true);
    expect(summary.executorTargetSelector).toBe("a.primary");
    expect(summary.handoffAnswerStatus).toBe("ready");
    expect(summary.handoffShouldContinue).toBe(false);
    expect(summary.handoffTargetPath).toBe("pageCheck.links[0]");
    expect(summary.primaryActionName).toBe("read-content");
    expect(summary.primarySourceLinkRef).toBe("pageCheck.sourceLinks[0]");
    expect(summary.recommendedCommandArgs?.[0]).toBe("ax-grep");
  });
});
