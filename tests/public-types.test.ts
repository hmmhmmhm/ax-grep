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
      | "sourceLinkCount"
      | "sourceChoiceCount"
      | "topChoiceKind"
      | "topChoicePath"
      | "topChoiceLabel"
      | "topChoiceUrl"
      | "topChoiceCommandArgs"
      | "sourceSearchSelectedRank"
      | "sourceSearchSelectedUrl"
      | "sourceSearchAlternateCount"
      | "verificationFoundQueries"
      | "verificationMissingQueries"
      | "citationCount"
      | "answerEvidenceCount"
      | "answerPlanStatus"
      | "answerPlanConfidence"
      | "answerGapCount"
      | "answerUseCitationIds"
      | "answerPlanReadFrom"
      | "answerPlanCommandArgs"
      | "answerPlanUrl"
      | "readTargetCount"
      | "actionCount"
      | "signalCount"
      | "signalWarningCount"
      | "signalErrorCount"
      | "qualityGateCount"
      | "qualityGateFailCount"
      | "problemSignalKind"
      | "problemSignalSeverity"
      | "problemSignalMessage"
      | "failingQualityGateKind"
      | "failingQualityGateMessage"
      | "failingQualityGatePath"
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
      | "handoffExpectedOutcome"
      | "primaryActionName"
      | "primaryReason"
      | "primaryPriority"
      | "primaryPriorityReason"
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
      sourceLinkCount: 1,
      sourceChoiceCount: 1,
      topChoiceKind: "source",
      topChoicePath: "pageCheck.sourceLinks[0]",
      topChoiceLabel: "Source",
      topChoiceUrl: "https://source.example/report",
      topChoiceCommandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      sourceSearchSelectedRank: 2,
      sourceSearchSelectedUrl: "https://source.example/result",
      sourceSearchAlternateCount: 1,
      verificationFoundQueries: ["present"],
      verificationMissingQueries: ["missing"],
      citationCount: 2,
      answerEvidenceCount: 1,
      answerPlanStatus: "ready",
      answerPlanConfidence: "high",
      answerGapCount: 0,
      answerUseCitationIds: ["e1"],
      answerPlanReadFrom: "pageCheck.contentEvidence",
      answerPlanCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      answerPlanUrl: "https://example.test",
      readTargetCount: 3,
      actionCount: 2,
      signalCount: 2,
      signalWarningCount: 1,
      signalErrorCount: 0,
      qualityGateCount: 4,
      qualityGateFailCount: 1,
      problemSignalKind: "content",
      problemSignalSeverity: "warning",
      problemSignalMessage: "Readable content is thin.",
      failingQualityGateKind: "content",
      failingQualityGateMessage: "Content evidence is too thin.",
      failingQualityGatePath: "pageCheck.contentEvidence",
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
      handoffExpectedOutcome: "read-evidence",
      primaryActionName: "read-content",
      primaryReason: "Read current evidence.",
      primaryPriority: "high",
      primaryPriorityReason: "Readable content is available.",
    };

    expect(summary.hiddenSignalCount).toBe(4);
    expect(summary.actionTargetCount).toBe(2);
    expect(summary.actionTargetChoiceCount).toBe(1);
    expect(summary.formChoices?.[0]?.queryField).toBe("q");
    expect(summary.actionTargetChoices?.[0]?.kind).toBe("search");
    expect(summary.topChoiceKind).toBe("source");
    expect(summary.sourceSearchAlternateCount).toBe(1);
    expect(summary.verificationMissingQueries).toEqual(["missing"]);
    expect(summary.readTargetCount).toBe(3);
    expect(summary.qualityGateFailCount).toBe(1);
    expect(summary.problemSignalSeverity).toBe("warning");
    expect(summary.failingQualityGateKind).toBe("content");
    expect(summary.answerPlanStatus).toBe("ready");
    expect(summary.executorOperation).toBe("return");
    expect(summary.executorTerminal).toBe(true);
    expect(summary.handoffAnswerStatus).toBe("ready");
    expect(summary.handoffShouldContinue).toBe(false);
    expect(summary.primaryActionName).toBe("read-content");
  });
});
