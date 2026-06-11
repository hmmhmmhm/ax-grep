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
    expect(report.gateSummary.averageCliAgentScore).toBeGreaterThanOrEqual(0.8);
    expect(report.gateSummary.averageAgentExecutorScore).toBeGreaterThanOrEqual(0.995);
    expect(report.gateSummary.averageActionSchemaScore).toBe(1);
    expect(report.gateSummary.averageSearchResultActionScore).toBe(1);
    expect(report.gateSummary.averageAgentHiddenSignalScore).toBe(1);
    expect(checkComparisonGateReport(report)).toEqual([]);
  });
});
