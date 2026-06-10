import { describe, expect, it } from "vitest";
import { checkComparisonGateReport } from "../scripts/check-comparison-gates";

describe("comparison gate checker", () => {
  it("accepts static reports with complete agent executor signals", () => {
    const failures = checkComparisonGateReport({
      generatedAt: "2026-06-10T00:00:00.000Z",
      gateSummary: {
        included: 4,
        excluded: 1,
        averageAgentExecutorScore: 1,
        averageAgentHandoffScore: 1,
        averageAgentBrowserAdvantageScore: 1,
        averageAgentActionListScore: 1,
        averageAgentSearchDecisionScore: 1,
        averageAgentPageDecisionScore: 1,
        classifications: {
          usable: 4,
          "over-collected": 0,
          challenge: 0,
          shell: 0,
        },
      },
      comparisons: [],
    });

    expect(failures).toEqual([]);
  });

  it("rejects static reports that regress executor handoff quality", () => {
    const failures = checkComparisonGateReport({
      generatedAt: "2026-06-10T00:00:00.000Z",
      gateSummary: {
        included: 4,
        excluded: 1,
        averageAgentExecutorScore: 1,
        averageAgentHandoffScore: 0.9,
        averageAgentBrowserAdvantageScore: 1,
        averageAgentActionListScore: 1,
        averageAgentSearchDecisionScore: 1,
        averageAgentPageDecisionScore: 1,
        classifications: {
          usable: 3,
          "over-collected": 1,
          challenge: 0,
          shell: 0,
        },
      },
      comparisons: [],
    }, "static.json");

    expect(failures.map((failure) => failure.message)).toEqual([
      "averageAgentHandoffScore expected >= 0.995, got 0.9",
      "classifications.over-collected expected 0, got 1",
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
});
