import { describe, expect, it } from "vitest";
import type {
  AgentAnswerPlan,
  AgentCitation,
  AgentHandoff,
  AgentResultChoice,
  AgentSourceChoice,
  AgentSourceSearchResult,
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
    expect(handoff.answerEvidence?.[0]?.text).toBe("Readable evidence");
  });
});
