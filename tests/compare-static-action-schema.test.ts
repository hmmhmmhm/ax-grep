import { describe, expect, it } from "vitest";
import { scoreActionSchema } from "../scripts/compare-static";

describe("compare-static action schema scoring", () => {
  it("requires executable command args for source-link actions", () => {
    expect(scoreActionSchema([{
      action: "open-source-link",
      execution: "run-command",
      priority: "medium",
      priorityReason: "External source-like link can improve verification.",
      url: "https://source.example/report",
      sourceLinkRef: "pageCheck.sourceLinks[0]",
    }])).toBe(0);

    expect(scoreActionSchema([{
      action: "open-source-link",
      execution: "run-command",
      priority: "medium",
      priorityReason: "External source-like link can improve verification.",
      url: "https://source.example/report",
      sourceLinkRef: "pageCheck.sourceLinks[0]",
      commandArgs: ["ax-grep", "https://source.example/report", "--agent"],
    }])).toBe(1);
  });

  it("does not treat action provenance as a substitute for execution fields", () => {
    expect(scoreActionSchema([{
      action: "retry-with-browser-html",
      execution: "run-command",
      priority: "high",
      priorityReason: "Browser-captured HTML is required to make progress.",
      source: "pageCheck.nextSteps",
      path: "pageCheck.nextSteps[0]",
      index: 0,
    }])).toBe(0);

    expect(scoreActionSchema([{
      action: "retry-with-browser-html",
      execution: "run-command",
      priority: "high",
      priorityReason: "Browser-captured HTML is required to make progress.",
      source: "pageCheck.nextSteps",
      path: "pageCheck.nextSteps[0]",
      index: 0,
      commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
    }])).toBe(1);
  });
});
