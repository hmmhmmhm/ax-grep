import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("agent text output format", () => {
  it("keeps page-check locator rows on named id/path fields", async () => {
    const cli = await readFile(join(process.cwd(), "src", "cli.ts"), "utf8");

    const positionalRows = [
      "evidence",
      "dataTable",
      "barrier",
      "form",
      "actionTarget",
      "hydration",
      "apiEndpoint",
      "clientState",
      "runtime",
      "config",
      "appHint",
      "mobileHint",
      "topic",
      "keyValue",
      "metaFact",
      "provenance",
      "offer",
      "identity",
      "dataset",
      "timeline",
      "contactPoint",
      "faq",
      "breadcrumb",
      "section",
      "pagination",
      "toc",
      "codeBlock",
      "citation",
      "media",
      "resource",
      "embed",
      "transcript",
      "authorLink",
    ];

    for (const row of positionalRows) {
      const positionalPattern = new RegExp(
        "lines\\.push\\(`  " + row + ": \\$\\{[^}]+\\.id\\} \\$\\{[^}]+\\.path\\}",
      );
      const namedPattern = new RegExp(
        "lines\\.push\\(`  " + row + ": id=\\$\\{[^}]+\\.id\\} path=\\$\\{[^}]+\\.path\\}",
      );

      expect(cli).not.toMatch(positionalPattern);
      expect(cli).toMatch(namedPattern);
    }
  });

  it("keeps routing choice rows and top choice on named locator fields", async () => {
    const cli = await readFile(join(process.cwd(), "src", "cli.ts"), "utf8");

    expect(cli).not.toContain("`  ${prefix}: ${choice.id} ${choice.path}");
    expect(cli).toContain("`  ${prefix}: id=${choice.id} path=${choice.path}");
    expect(cli).not.toContain("`  topChoice: ${agent.topChoiceKind} ${agent.topChoicePath}");
    expect(cli).toContain("`  topChoice: kind=${agent.topChoiceKind} path=${agent.topChoicePath}");
    expect(cli).not.toContain("`  topAnswerEvidence: ${agent.topAnswerEvidenceId} ${agent.topAnswerEvidencePath}");
    expect(cli).toContain("`  topAnswerEvidence: id=${agent.topAnswerEvidenceId} path=${agent.topAnswerEvidencePath}");
  });
});
