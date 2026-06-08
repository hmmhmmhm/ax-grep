import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1] ?? "");
}

describe("README", () => {
  it("keeps JSON examples parseable and documents the agent continuation contract", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");
    const blocks = jsonBlocks(readme);

    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(() => JSON.parse(block)).not.toThrow();
    }

    const firstBlock = blocks[0];
    expect(firstBlock).toBeDefined();

    const exampleEnvelope = JSON.parse(firstBlock ?? "");

    expect(exampleEnvelope.agent).toMatchObject({
      contract: {
        version: 1,
        features: expect.arrayContaining([
          "next.loop",
          "next.readValue",
          "next.target",
          "runbook",
          "executionPlan",
          "citations",
          "citation.reason",
          "answerPlan",
          "answerEvidence",
          "answerPlan.actionFields",
          "answerPlan.confidence",
          "searchDecision",
          "resultChoices",
          "sourceChoices",
          "pageDecision",
          "searchResult.selectionReason",
          "sourceLink.selectionReason",
          "action.priority",
          "afterInteractionCommand",
          "browserHtml",
          "qualityGates",
          "actions",
          "contentEvidence.quality",
        ]),
      },
      continuationMode: "read",
      next: {
        mode: "read",
        loop: {
          decision: "return",
        },
        readFrom: "verification.bestEvidence",
        readTarget: {
          path: "verification.bestEvidence",
        },
        readValue: {
          path: "verification.bestEvidence",
        },
      },
      runbook: {
        decision: "return",
        mode: "read",
        operation: "return",
        action: "use-evidence",
        answerStatus: "ready",
        answerReady: true,
        readFrom: "verification.bestEvidence",
        readValue: {
          path: "verification.bestEvidence",
        },
      },
      expectedOutcome: {
        kind: "read-evidence",
      },
      executionPlan: {
        operation: "return",
        useFetchedHtml: true,
        needsBrowserHtml: false,
        answerReady: true,
        expectedOutcome: "read-evidence",
        readFrom: "verification.bestEvidence",
      },
      answerPlan: {
        status: "ready",
        useCitationIds: expect.arrayContaining(["v1"]),
      },
      answerEvidence: expect.arrayContaining([
        expect.objectContaining({
          id: "v1",
          path: "verification.bestEvidence",
        }),
      ]),
    });
    expect(exampleEnvelope.agent.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "content",
          severity: "info",
        }),
      ]),
    );
    expect(readme).toContain("An agent executor can treat `agent.runbook.decision` as the only required switch");
  });
});
