import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1] ?? "");
}

const forbiddenReadmeFragments = [
  '"gateSummary"',
  '"comparisons"',
  '"generatedAt"',
  "Total output lines",
  "\uFFFD",
  "\u00EC",
  "\u00EB",
  "\u00ED",
  "\u00EA",
];

describe("README", () => {
  it("keeps JSON examples parseable and documents the agent continuation contract", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");
    const blocks = jsonBlocks(readme);

    const lines = readme.split(/\r?\n/);
    expect(lines.length).toBeLessThan(280);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(140);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.length).toBeLessThan(10_000);
      expect(() => JSON.parse(block)).not.toThrow();
    }
    for (const fragment of forbiddenReadmeFragments) {
      expect(readme).not.toContain(fragment);
    }

    const firstBlock = blocks[0];
    expect(firstBlock).toBeDefined();

    const exampleEnvelope = JSON.parse(firstBlock ?? "");

    expect(exampleEnvelope).toMatchObject({
      schemaVersion: 1,
      tool: "ax-grep",
      ok: true,
      kind: "content-page",
      page: {
        structuredDataTypes: expect.arrayContaining(["Article"]),
      },
      pageCheck: {
        contentEvidence: expect.arrayContaining([
          expect.objectContaining({
            id: "c1",
            path: "pageCheck.contentEvidence[0]",
            quality: "medium",
          }),
        ]),
      },
      verification: {
        status: "matched",
        bestEvidence: {
          path: "pageCheck.contentEvidence[0]",
        },
      },
    });
    expect(exampleEnvelope.agent).toMatchObject({
      contract: {
        version: 1,
        compact: true,
        featureCount: expect.any(Number),
      },
      status: "ready",
      continuationMode: "read",
      next: {
        mode: "read",
        loop: {
          decision: "return",
          shouldContinue: false,
          terminal: true,
        },
        readFrom: "verification.bestEvidence",
        readValue: {
          path: "verification.bestEvidence",
        },
      },
      handoff: {
        instruction: expect.stringContaining("Answer now"),
        decision: "return",
        mode: "read",
        operation: "return",
        action: "use-evidence",
        answerStatus: "ready",
        answerReady: true,
        readFrom: "verification.bestEvidence",
        answerEvidence: expect.arrayContaining([
          expect.objectContaining({
            id: "v1",
            path: "verification.bestEvidence",
          }),
        ]),
        qualityGates: expect.arrayContaining([
          expect.objectContaining({
            kind: "verification",
            pass: true,
            path: "verification.bestEvidence",
          }),
        ]),
      },
    });
    expect(readme).toContain("An agent executor can treat `agent.handoff.decision` as the only required switch");
    expect(readme).toContain("const step: AgentHandoff = payload.agent.handoff");
  });
});
