import process from "node:process";
import { resolveBenchmarkTargets } from "./benchmark-targets";
import { checkComparisonGateReport } from "./check-comparison-gates";
import { runStaticComparisons } from "./compare-static";

async function main(): Promise<void> {
  const targets = resolveBenchmarkTargets(["--target-set", "agent-fixtures"], []);
  const report = await runStaticComparisons(targets);
  const failures = checkComparisonGateReport(report, "agent-fixtures");

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.file}: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log(`agent-fixtures: gate ok (${report.gateSummary.included} included)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
