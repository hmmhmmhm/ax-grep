import { describe, expect, it } from "vitest";
import { resolveBenchmarkTargets } from "../scripts/benchmark-targets";
import { checkComparisonGateReport } from "../scripts/check-comparison-gates";
import { runStaticComparisons } from "../scripts/compare-static";

describe("compare-static fixture comparisons", () => {
  it("produces gate-ready agent metrics without browser-backed targets", async () => {
    const targets = resolveBenchmarkTargets(["--target-set", "agent-fixtures"], []);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((target) => typeof target.html === "string")).toBe(true);

    const report = await runStaticComparisons(targets);

    expect(report.gateSummary.included).toBe(targets.length);
    expect(report.comparisons.every((comparison) => comparison.fetch.source === "fixture")).toBe(true);
    expect(report.comparisons.every((comparison) => comparison.warnings.includes("used fixture HTML"))).toBe(true);
    expect(report.comparisons.every((comparison) => comparison.warnings.every((warning) => !warning.includes("agent-browser")))).toBe(true);
    expect(report.comparisons.map((comparison) => comparison.category).sort()).toEqual([
      "Synthetic action target gate",
      "Synthetic browser HTML retry gate",
      "Synthetic hidden metadata gate",
      "Synthetic search open gate",
      "Synthetic search refine gate",
      "Synthetic site search recovery gate",
    ]);
    expect(report.gateSummary.averageCliAgentScore).toBeGreaterThanOrEqual(0.8);
    expect(report.gateSummary.minCliAgentScore).toBeGreaterThanOrEqual(0.8);
    expect(report.gateSummary.averageAgentExecutorScore).toBeGreaterThanOrEqual(0.995);
    expect(report.gateSummary.minAgentExecutorScore).toBeGreaterThanOrEqual(0.995);
    expect(report.gateSummary.weakAgentTargets).toEqual([]);
    expect(report.gateSummary.averageActionSchemaScore).toBe(1);
    expect(report.gateSummary.averageSearchResultActionScore).toBe(1);
    expect(report.gateSummary.averageAgentFormActionCountScore).toBe(1);
    expect(report.gateSummary.averageAgentFormActionChoiceScore).toBe(1);
    expect(report.gateSummary.averageAgentTopFormActionChoiceShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentChoiceCountScore).toBe(1);
    expect(report.gateSummary.averageAgentTopChoiceShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentEvidenceCountShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentSignalCountShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentProblemShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentExecutorShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentHandoffShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentAnswerShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentNextShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentHiddenSignalCountScore).toBe(1);
    expect(report.gateSummary.averageAgentVerificationQueryScore).toBe(1);
    expect(report.gateSummary.averageAgentTopSourceChoiceShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentSourceSearchShortcutScore).toBe(1);
    expect(report.gateSummary.averageAgentHiddenSignalScore).toBe(1);
    expect(report.gateSummary.averageAgentStructuredShortcutScore).toBe(1);
    expect(checkComparisonGateReport(report)).toEqual([]);

    expect(summaryFor(report, "Synthetic search open gate")?.agentPrimaryAction).toBe("open-result");
    expect(summaryFor(report, "Synthetic search refine gate")?.agentPrimaryAction).toBe("refine-search");
    expect(summaryFor(report, "Synthetic site search recovery gate")?.agentPrimaryAction).toBe("open-site-search");
    expect(summaryFor(report, "Synthetic browser HTML retry gate")?.agentPrimaryAction).toBe("retry-with-browser-html");
    expect(summaryFor(report, "Synthetic browser HTML retry gate")?.score).toBeGreaterThanOrEqual(0.8);
    expect(summaryFor(report, "Synthetic action target gate")?.pageCheck.hiddenSignalCount).toBeGreaterThan(0);
    expect(summaryFor(report, "Synthetic action target gate")?.actionExecutionCounts["read-current"]).toBeGreaterThan(0);
  });
});

function summaryFor(report: Awaited<ReturnType<typeof runStaticComparisons>>, category: string) {
  return report.comparisons.find((comparison) => comparison.category === category)?.cliAgentSummary;
}
