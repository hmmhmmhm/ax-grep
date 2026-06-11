import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { scoreActionSchema } from "../scripts/compare-static";

type ActionShape = {
  action?: string;
};

function collectActions(envelope: {
  agent?: { primaryAction?: ActionShape; actions?: ActionShape[] };
  pageCheck?: { recommendedAction?: ActionShape; nextSteps?: ActionShape[] };
  suggestedActions?: ActionShape[];
  verification?: { recommendedAction?: ActionShape };
}): ActionShape[] {
  return [
    envelope.agent?.primaryAction,
    ...(envelope.agent?.actions ?? []),
    envelope.pageCheck?.recommendedAction,
    ...(envelope.pageCheck?.nextSteps ?? []),
    envelope.verification?.recommendedAction,
    ...(envelope.suggestedActions ?? []),
  ].filter((action): action is ActionShape => Boolean(action?.action));
}

function memoryWriter(): Pick<NodeJS.WriteStream, "write"> & { output: string } {
  const writer = {
    output: "",
    write(chunk: string | Uint8Array): boolean {
      writer.output += chunk.toString();
      return true;
    },
  };
  return writer;
}

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

  it("scores real search, source-link, and browser-retry CLI action payloads as executable", async () => {
    const searchStdout = memoryWriter();
    const searchStatus = await runCli(["--search", "agent browser", "--engine", "bing", "--agent"], {
      stdout: searchStdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://result.example/">Agent browser result</a></h2>
              <p>agent browser comparison details</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const sourceStdout = memoryWriter();
    const sourceStatus = await runCli(["https://forum.example/thin", "--agent"], {
      stdout: sourceStdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <main>
              <h1>Thin page</h1>
              <a href="https://source.example/report">Original source report</a>
              <button>Load comments</button>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const browserStdout = memoryWriter();
    const browserStatus = await runCli(["https://example.test", "--agent"], {
      stdout: browserStdout,
      fetch: async () => new Response("", { headers: { "content-type": "text/html" } }),
    });

    expect(searchStatus).toBe(0);
    expect(sourceStatus).toBe(0);
    expect(browserStatus).toBe(20);

    for (const output of [searchStdout.output, sourceStdout.output, browserStdout.output]) {
      const envelope = JSON.parse(output);
      expect(scoreActionSchema(collectActions(envelope))).toBe(1);
    }
  });
});
