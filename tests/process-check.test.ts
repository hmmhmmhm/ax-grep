import { describe, expect, it } from "vitest";
import { findProjectProcesses } from "../scripts/check-project-processes";

describe("project process checker", () => {
  it("finds browser, comparison, and test processes", () => {
    const matches = findProjectProcesses([
      " 100 1 node scripts/check-project-processes.ts",
      " 101 1 agent-browser --session abc open https://example.test",
      " 102 1 pnpm compare:static:fixtures:gate",
      " 103 1 tsx scripts/compare-static.ts --target-set agent-executor",
      " 104 1 vitest run tests/cli.test.ts",
      " 105 1 chrome-headless-shell --headless --remote-debugging-pipe",
      " 106 1 node unrelated.js",
    ], 100);

    expect(matches.map((item) => item.pid)).toEqual([101, 102, 103, 104]);
  });

  it("ignores the current checker process and unrelated commands", () => {
    const matches = findProjectProcesses([
      " 200 1 tsx scripts/check-project-processes.ts",
      " 201 1 node unrelated.js",
      " 202 1 pnpm compare:tokens:korea-social",
    ], 200);

    expect(matches).toEqual([]);
  });
});
