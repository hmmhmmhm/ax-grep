import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runCli } from "../src/cli";

describe("cli", () => {
  it("fetches a URL and prints the text tree by default", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test"], {
      stdout,
      fetch: async () => new Response(`
        <html lang="en">
          <head><title>Example page</title><meta name="description" content="Useful description"></head>
          <body><main><h1>Example</h1><button>Run</button><a href="/docs">Docs</a></main></body>
        </html>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("links\n  1. Docs <https://example.test/docs>");
    expect(stdout.output).toContain("page\n  title: Example page\n  description: Useful description\n  lang: en");
    expect(stdout.output).toContain("analysis\n  kind: page");
    expect(stdout.output).toContain("outline\n  1. h1 Example");
    expect(stdout.output).toContain("actions\n  1. button Run");
    expect(stdout.output).toContain("main");
    expect(stdout.output).toContain("heading 'Example'");
    expect(stdout.output).toContain("[i] link 'Docs' <https://example.test/docs>");
  });

  it("unwraps known search redirect links in text output", async () => {
    const stdout = new MemoryWriter();
    const bingTarget = `a1${Buffer.from("https://target.example/article", "utf8").toString("base64url")}`;
    const status = await runCli(["https://www.bing.com/search?q=test"], {
      stdout,
      fetch: async () => new Response(`<main><a href="/ck/a?u=${bingTarget}">Result</a></main>`),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("[i] link 'Result' <https://target.example/article>");
  });

  it("can print JSON for agent tooling", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json", "--mode", "interactive", "--no-attributes"], {
      stdout,
      fetch: async () => new Response(`<main><button>Run</button><p>Ignore</p></main>`),
    });

    const envelope = JSON.parse(stdout.output);
    const button = findRole(envelope.tree, "button");

    expect(status).toBe(0);
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      tool: "ax-grep",
      ok: true,
      url: "https://example.test",
      finalUrl: "https://example.test",
      status: 200,
      mode: "interactive",
    });
    expect(envelope.links).toEqual([]);
    expect(envelope.results).toEqual([]);
    expect(button?.name).toBe("Run");
    expect(button?.attributes).toBeUndefined();
  });

  it("includes a deduplicated links summary in JSON output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <html lang="ko">
          <head>
            <title>Docs page</title>
            <meta name="description" content="Docs description">
            <link rel="canonical" href="/canonical">
          </head>
          <body>
            <main>
              <h2>Docs heading</h2>
              <button>Save</button>
              <a href="/docs">Docs</a>
              <a href="/docs">Docs duplicate</a>
              <a href="javascript:void(0)">Ignored</a>
              <a href="/proxy">Visit in Anonymous View</a>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.links).toEqual([
      {
        text: "Docs duplicate",
        url: "https://example.test/docs",
        role: "link",
        selector: "a:nth-of-type(2)",
      },
    ]);
    expect(envelope.results).toEqual([
      expect.objectContaining({
        title: "Docs duplicate",
        url: "https://example.test/docs",
        source: "example.test",
        rank: 1,
        sourceType: "documentation",
        sourceScore: 0.78,
        sourceHints: ["documentation"],
      }),
    ]);
    expect(envelope.page).toMatchObject({
      title: "Docs page",
      description: "Docs description",
      canonicalUrl: "https://example.test/canonical",
      lang: "ko",
    });
    expect(envelope.kind).toBe("page");
    expect(envelope.diagnostics).toEqual([]);
    expect(envelope.suggestedActions).toEqual([]);
    expect(envelope.outline).toEqual([{ text: "Docs heading", level: 2 }]);
    expect(envelope.actions).toEqual([{ type: "button", text: "Save", selector: "button" }]);
  });

  it("classifies search-like pages and suggests opening the first result", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://search.example/search?q=agent", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li><a href="https://one.example">First useful result</a><p>First result snippet helps choose the page.</p></li>
            <li><a href="https://two.example">Second result</a><p>Second result snippet.</p></li>
          </ol>
        </main>
      `),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("search-results");
    expect(envelope.suggestedActions[0]).toMatchObject({
      action: "open-result",
      url: "https://one.example/",
      rank: 1,
    });
    expect(envelope.searchResults[0]).toMatchObject({
      title: "First useful result",
      url: "https://one.example/",
      rank: 1,
    });
  });

  it("can build a search URL from a query", async () => {
    const stdout = new MemoryWriter();
    let requestedUrl = "";
    const status = await runCli(["--search", "agent browser", "--engine", "bing", "--json"], {
      stdout,
      fetch: async (input) => {
        requestedUrl = String(input);
        return new Response(`
          <main>
            <ol>
              <li><a href="https://result.example">Agent browser result</a><p>Search result snippet.</p></li>
            </ol>
          </main>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrl).toBe("https://www.bing.com/search?q=agent+browser");
    expect(envelope).toMatchObject({
      searchQuery: "agent browser",
      searchEngine: "bing",
      kind: "search-results",
    });
    expect(envelope.results[0].url).toBe("https://result.example/");
  });

  it("can omit the raw tree from JSON output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`<main><h1>Example</h1><a href="https://target.example/">Target</a></main>`, {
        headers: { "content-type": "text/html" },
      }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.tree).toBeUndefined();
    expect(envelope.treeOmitted).toBe(true);
    expect(envelope.links[0]).toMatchObject({
      text: "Target",
      url: "https://target.example/",
    });
    expect(envelope.pageLinks[0]).toMatchObject({
      title: "Target",
      url: "https://target.example/",
      source: "target.example",
      rank: 1,
    });
  });

  it("can print a compact agent JSON envelope", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--agent", "--find", "Example"], {
      stdout,
      fetch: async () => new Response(`<main><h1>Example</h1><p>Example content for agent routing.</p><a href="https://target.example/">Target</a></main>`, {
        headers: { "content-type": "text/html" },
      }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(stdout.output).not.toContain("\n  \"");
    expect(envelope).toMatchObject({
      tool: "ax-grep",
      ok: true,
      url: "https://example.test",
      kind: "page",
      treeOmitted: true,
      agent: {
        contract: {
          version: 1,
          features: expect.arrayContaining([
            "next.loop",
            "next.readValue",
            "next.target",
            "citations",
            "answerPlan",
            "readTargets",
            "signals",
          ]),
        },
        status: "ready",
        routingIntent: "read-current",
        continuationMode: "read",
        next: {
          mode: "read",
          action: "use-evidence",
          execution: "read-current",
          readFrom: "verification.bestEvidence",
          terminal: true,
          loop: {
            decision: "return",
            shouldContinue: false,
            terminal: true,
            reason: "Return the resolved value for verification.bestEvidence.",
            maxSuggestedIterations: 0,
          },
          readTarget: {
            path: "verification.bestEvidence",
            reason: "Best matching evidence for the requested --find text.",
            count: 1,
            primary: true,
          },
          readValue: {
            path: "verification.bestEvidence",
            value: expect.objectContaining({
              field: "mainHeading",
              text: "Example",
            }),
          },
        },
        expectedOutcome: {
          kind: "read-evidence",
          message: expect.stringContaining("verification.bestEvidence"),
        },
        answerPlan: {
          status: "ready",
          useCitationIds: expect.arrayContaining(["v1"]),
          nextAction: "use-evidence",
        },
        signals: expect.arrayContaining([
          expect.objectContaining({ kind: "content", severity: "info" }),
          expect.objectContaining({ kind: "verification", severity: "info" }),
        ]),
        pageKind: "page",
        canContinue: true,
        canUseFetchedHtml: true,
        needsBrowserHtml: false,
        responseStatus: 200,
        responseOk: true,
        responseContentType: "text/html",
        finalUrlChanged: false,
        usabilityScore: expect.any(Number),
        evidenceQualityScore: expect.any(Number),
        sourceQualityScore: expect.any(Number),
        readabilityScore: expect.any(Number),
        bestReadTarget: "verification.bestEvidence",
        bestReadTargetReason: "Best matching evidence for the requested --find text.",
        diagnosticErrorCount: 0,
        diagnosticWarningCount: 0,
        diagnosticInfoCount: 0,
        citations: expect.arrayContaining([
          expect.objectContaining({
            kind: "verification",
            id: "v1",
            path: "verification.bestEvidence",
            text: "Example",
          }),
        ]),
        verificationRequestedCount: 1,
        verificationFoundCount: 1,
        verificationMissingCount: 0,
        readabilityReasons: expect.arrayContaining([
          "1 content evidence item",
        ]),
        verificationStatus: "matched",
        primaryExecution: "read-current",
      },
      verification: {
        status: "matched",
        requestedCount: 1,
        foundCount: 1,
      },
      pageCheck: {
        mainHeading: "Example",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      execution: "read-current",
      url: "https://example.test",
      terminal: true,
      readFrom: "verification.bestEvidence",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "verification.bestEvidence",
      count: 1,
      primary: true,
    }));
    expect(envelope.agent.next.readTarget).toEqual(
      expect.objectContaining({
        path: "verification.bestEvidence",
        reason: "Best matching evidence for the requested --find text.",
      }),
    );
    expect(envelope.agent.next.readValue).toEqual({
      path: "verification.bestEvidence",
      value: expect.objectContaining({
        field: "mainHeading",
        text: "Example",
      }),
    });
    expect(envelope.pageCheck.recommendedAction).toBeUndefined();
    expect(envelope.pageCheck.nextSteps).toBeUndefined();
    expect(envelope.tree).toBeUndefined();
    expect(envelope.links).toBeUndefined();
    expect(envelope.results).toBeUndefined();
    expect(envelope.outline).toBeUndefined();
    expect(envelope.content).toBeUndefined();
  });

  it("keeps agent mode in page and verification commands", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--agent", "--find", "missing claim"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Example</h1>
          <p>Thin page.</p>
          <a href="https://source.example/report">Source report</a>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.nextSteps).toContainEqual(expect.objectContaining({
      action: "retry-with-browser-html",
      command: "ax-grep 'https://example.test' --html-file captured.html --agent",
      commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
    }));
    expect(envelope.agent.primaryAction.command).toBe("ax-grep 'https://source.example/report' --find 'missing claim' --agent");
    expect(envelope.agent.primaryAction.commandArgs).toEqual(["ax-grep", "https://source.example/report", "--find", "missing claim", "--agent"]);
    expect(envelope.verification.recommendedAction).toBeUndefined();
  });

  it("keeps agent mode in generated search result commands", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "bing", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://result.example/">Agent browser result</a></h2>
              <p>agent browser result</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "open-result",
      url: "https://result.example/",
      rank: 1,
      openResult: "best",
      reason: "The page looks like search results; open the highest-ranked relevant result.",
      command: "ax-grep --search 'agent browser' --engine bing --open-result best --agent",
      commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
      target: {
        title: "Agent browser result",
        url: "https://result.example/",
        source: "result.example",
        rank: 1,
      },
    });
    expect(envelope.agent).toMatchObject({
      pageKind: "search-results",
      routingIntent: "open-url",
      continuationMode: "command",
      next: {
        mode: "command",
        action: "open-result",
        loop: {
          decision: "execute",
          shouldContinue: true,
          terminal: false,
          reason: "Run the provided command and inspect the next agent payload.",
          maxSuggestedIterations: 1,
        },
        execution: "run-command",
        url: "https://result.example/",
        rank: 1,
        openResult: "best",
        command: "ax-grep --search 'agent browser' --engine bing --open-result best --agent",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
        target: {
          title: "Agent browser result",
          url: "https://result.example/",
          source: "result.example",
          rank: 1,
        },
      },
      expectedOutcome: {
        kind: "open-result",
      },
      signals: expect.arrayContaining([
        expect.objectContaining({ kind: "search-results", severity: "info" }),
        expect.objectContaining({ kind: "content", severity: "warning" }),
      ]),
      responseStatus: 200,
      responseOk: true,
      responseContentType: "text/html",
      finalUrlChanged: false,
      alternativeActionCount: 0,
      usabilityScore: expect.any(Number),
      evidenceQualityScore: expect.any(Number),
      sourceQualityScore: expect.any(Number),
      bestReadTarget: "pageCheck.contentEvidence",
      bestReadTargetScore: expect.any(Number),
      bestReadTargetReason: "Structured page excerpts suitable for source checking.",
      diagnosticErrorCount: 0,
      diagnosticWarningCount: 0,
      diagnosticInfoCount: 0,
      verificationRequestedCount: 0,
      verificationFoundCount: 0,
      verificationMissingCount: 0,
      primaryUrl: "https://result.example/",
      primaryRank: 1,
      primaryOpenResult: "best",
      primaryCommand: "ax-grep --search 'agent browser' --engine bing --open-result best --agent",
      primaryCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "searchResults",
      count: 1,
    }));
    expect(envelope.agent.readTargets).not.toContainEqual(expect.objectContaining({
      path: "pageCheck.sourceLinks",
    }));
    expect(envelope.searchResults[0]).toMatchObject({
      id: "r1",
      path: "searchResults[0]",
      title: "Agent browser result",
      openResult: 1,
      command: "ax-grep --search 'agent browser' --engine bing --open-result 1 --agent",
      commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent"],
    });
    expect(envelope.recommendedResult).toMatchObject({
      id: "r1",
      path: "recommendedResult",
      openResult: 1,
      command: "ax-grep --search 'agent browser' --engine bing --open-result 1 --agent",
      commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent"],
    });
    expect(envelope.agent.canUseFetchedHtml).toBe(true);
    expect(envelope.agent.needsBrowserHtml).toBe(false);
    expect(envelope.suggestedActions).toBeUndefined();
  });

  it("preserves custom timeout and user agent in generated agent commands", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli([
      "--search",
      "agent browser",
      "--engine",
      "bing",
      "--timeout",
      "30000",
      "--user-agent",
      "custom-agent/1.0",
      "--agent",
    ], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://result.example/">Agent browser result</a></h2>
              <p>agent browser result</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.primaryAction.command).toBe("ax-grep --search 'agent browser' --engine bing --timeout 30000 --user-agent 'custom-agent/1.0' --open-result best --agent");
    expect(envelope.agent.primaryAction.commandArgs).toEqual([
      "ax-grep",
      "--search",
      "agent browser",
      "--engine",
      "bing",
      "--timeout",
      "30000",
      "--user-agent",
      "custom-agent/1.0",
      "--open-result",
      "best",
      "--agent",
    ]);
  });

  it("omits duplicate pageCheck result links from compact agent search output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "bing", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://result.example/">Agent browser result</a></h2>
              <p>agent browser result</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults).toHaveLength(1);
    expect(envelope.pageCheck.primaryLinks).toBeUndefined();
    expect(envelope.pageCheck.sourceLinks).toBeUndefined();
    expect(envelope.pageCheck.actions).toBeUndefined();
    expect(envelope.pageCheck.nextSteps).toBeUndefined();
    expect(envelope.agent.sourceLinkCount).toBe(0);
    expect(envelope.agent.resultCount).toBe(1);
    expect(envelope.agent.readabilityReasons).toContain("1 search result source");
    expect(envelope.pageCheck.readability.reasons).toContain("1 search result source");
  });

  it("limits compact agent search results while keeping an out-of-window recommendation", async () => {
    const stdout = new MemoryWriter();
    const items = Array.from({ length: 7 }, (_, index) => {
      const rank = index + 1;
      const snippet = rank === 7 ? "This result contains the target claim for verification." : `General result ${rank}.`;
      return `
        <li class="b_algo">
          <h2><a href="https://result-${rank}.example/">Result ${rank}</a></h2>
          <p>${snippet}</p>
        </li>
      `;
    }).join("");
    const status = await runCli(["--search", "agent browser", "--engine", "bing", "--find", "target claim", "--agent"], {
      stdout,
      fetch: async () => new Response(`<main><ol>${items}</ol></main>`, {
        headers: { "content-type": "text/html" },
      }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.resultCount).toBe(7);
    expect(envelope.searchResults.map((result: { rank: number }) => result.rank)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(envelope.recommendedResult).toMatchObject({
      rank: 7,
      url: "https://result-7.example/",
      findMatches: ["target claim"],
    });
    expect(envelope.agent).toMatchObject({
      recommendedRank: 7,
      recommendedSource: "result-7.example",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      rank: 7,
      openResult: "best",
    });
    expect(envelope.verification).toMatchObject({
      status: "matched",
      foundQueries: ["target claim"],
    });
    expect(envelope.verification.recommendedAction).toBeUndefined();
    expect(envelope.suggestedActions).toBeUndefined();
  });

  it("can set search language and region hints", async () => {
    const stdout = new MemoryWriter();
    let requestedUrl = "";
    let acceptLanguage = "";
    const status = await runCli(["--search", "agent browser", "--engine", "bing", "--lang", "en", "--region", "US", "--json"], {
      stdout,
      fetch: async (input, init) => {
        requestedUrl = String(input);
        acceptLanguage = String((init?.headers as Record<string, string>)["accept-language"]);
        return new Response(`
          <main>
            <ol>
              <li><a href="https://result.example">Agent browser result</a><p>Search result snippet.</p></li>
            </ol>
          </main>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrl).toBe("https://www.bing.com/search?q=agent+browser&setlang=en&cc=US&mkt=en-US");
    expect(acceptLanguage).toBe("en-US,en;q=0.9");
    expect(envelope).toMatchObject({
      searchLang: "en",
      searchRegion: "US",
    });
    expect(envelope.suggestedActions[0]).toMatchObject({
      command: "ax-grep --search 'agent browser' --engine bing --lang en --region US --open-result best --json --summary",
    });
  });

  it("uses auto search by default for agent-friendly search", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "agent browser", "--json", "--summary"], {
      stdout,
      fetch: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("bing.com")) {
          return new Response(`
            <main>
              <ol>
                <li class="b_algo"><h2><a href="https://best.example/">Best default result</a></h2><p>agent browser result</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`<main><p>No result cards.</p></main>`, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls).toEqual([
      "https://duckduckgo.com/html/?q=agent+browser",
      "https://www.bing.com/search?q=agent+browser",
      "https://www.startpage.com/sp/search?query=agent+browser",
    ]);
    expect(envelope).toMatchObject({
      searchEngine: "auto",
      selectedSearchEngine: "bing",
      treeOmitted: true,
      kind: "search-results",
    });
    expect(envelope.tree).toBeUndefined();
    expect(envelope.searchResults[0]).toMatchObject({
      title: "Best default result",
      relevance: "high",
    });
  });

  it("auto search prefers exact package-like query matches over generic package registry results", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "ax-grep npm", "--engine", "auto", "--json", "--no-tree"], {
      stdout,
      fetch: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <div class="result">
                <a class="result__a" href="https://www.npmjs.com/package/axios">axios - npm</a>
                <div class="result__snippet">Start using axios by running npm i axios.</div>
              </div>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        if (url.includes("bing.com")) {
          return new Response(`
            <main>
              <ol>
                <li class="b_algo">
                  <h2><a href="https://www.npmjs.com/package/ax-grep">ax-grep - npm</a></h2>
                  <p>Install ax-grep from npm.</p>
                </li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`<main><p>Startpage blocked.</p></main>`, {
          headers: { "content-type": "text/html" },
        });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls).toEqual([
      "https://duckduckgo.com/html/?q=ax-grep+npm",
      "https://www.bing.com/search?q=ax-grep+npm",
      "https://www.startpage.com/sp/search?query=ax-grep+npm",
    ]);
    expect(envelope.selectedSearchEngine).toBe("bing");
    expect(envelope.recommendedResult).toMatchObject({
      title: "ax-grep - npm",
      url: "https://www.npmjs.com/package/ax-grep",
      relevance: "high",
      isLikelyOfficial: true,
    });
  });

  it("auto search picks the engine with usable result cards", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "agent browser", "--engine", "auto", "--json"], {
      stdout,
      fetch: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("duckduckgo.com")) {
          return new Response(`<html><title>Just a moment</title><body>captcha challenge</body></html>`, {
            headers: { "content-type": "text/html" },
          });
        }
        if (url.includes("bing.com")) {
          return new Response(`
            <main>
              <ol>
                <li class="b_algo"><h2><a href="https://first.example/">First auto result</a></h2><p>First snippet.</p></li>
                <li class="b_algo"><h2><a href="https://second.example/">Second auto result</a></h2><p>Second snippet.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <main>
            <div class="w-gl__result">
              <a class="w-gl__result-title" href="https://start.example/">StartPage result</a>
            </div>
          </main>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls).toEqual([
      "https://duckduckgo.com/html/?q=agent+browser",
      "https://www.bing.com/search?q=agent+browser",
      "https://www.startpage.com/sp/search?query=agent+browser",
    ]);
    expect(envelope).toMatchObject({
      searchQuery: "agent browser",
      searchEngine: "auto",
      selectedSearchEngine: "bing",
      kind: "search-results",
    });
    expect(envelope.searchEngines).toEqual([
      expect.objectContaining({ engine: "duckduckgo", ok: false, resultCount: 0 }),
      expect.objectContaining({ engine: "bing", ok: true, resultCount: 2 }),
      expect.objectContaining({ engine: "startpage", ok: true, resultCount: 1 }),
    ]);
    expect(envelope.searchResults).toHaveLength(2);
    expect(envelope.searchResults[0]).toMatchObject({
      title: "First auto result",
      url: "https://first.example/",
      rank: 1,
    });
  });

  it("compacts auto search engine attempts for agent output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "auto", "--agent"], {
      stdout,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <div class="result">
                <a class="result__a" href="https://result.example/">Agent browser result</a>
                <div class="result__snippet">agent browser result</div>
              </div>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response("blocked", { status: 403, statusText: "Forbidden" });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchEngines[0]).toMatchObject({
      engine: "duckduckgo",
      ok: true,
      resultCount: 1,
      kind: "search-results",
      status: 200,
      topResult: {
        title: "Agent browser result",
        url: "https://result.example/",
        relevance: "high",
      },
    });
    expect(envelope.searchEngines[0].url).toBeUndefined();
    expect(envelope.searchEngines[0].diagnostics).toBeUndefined();
    expect(envelope.searchEngines[1].error).toEqual({ code: "HTTP_ERROR", status: 403 });
  });

  it("auto search applies locale hints to every candidate engine", async () => {
    const stdout = new MemoryWriter();
    const requested: Array<{ url: string; acceptLanguage: string }> = [];
    const status = await runCli(["--search", "agent browser", "--engine", "auto", "--lang", "ko", "--region", "KR", "--json"], {
      stdout,
      fetch: async (input, init) => {
        requested.push({
          url: String(input),
          acceptLanguage: String((init?.headers as Record<string, string>)["accept-language"]),
        });
        return new Response(`
          <main>
            <ol>
              <li class="b_algo"><h2><a href="https://result.example/">Result</a></h2><p>Snippet.</p></li>
            </ol>
          </main>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    expect(status).toBe(0);
    expect(requested).toEqual([
      { url: "https://duckduckgo.com/html/?q=agent+browser&kl=kr-ko", acceptLanguage: "ko-KR,ko;q=0.9" },
      { url: "https://www.bing.com/search?q=agent+browser&setlang=ko&cc=KR&mkt=ko-KR", acceptLanguage: "ko-KR,ko;q=0.9" },
      { url: "https://www.startpage.com/sp/search?query=agent+browser&language=ko&region=KR", acceptLanguage: "ko-KR,ko;q=0.9" },
    ]);
  });

  it("extracts search result cards in SERP order", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://duckduckgo.com/html/?q=ax-grep", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <a href="/settings">Settings</a>
          <div class="result">
            <a class="result__a" href="/l/?uddg=${encodeURIComponent("https://first.example/short")}">First</a>
            <a href="https://noise.example/a-very-long-link-title-that-would-score-higher">Noisy secondary link with a long title</a>
            <a class="result__snippet" href="https://snippet.example">Snippet link should not become the result title.</a>
          </div>
          <div class="result">
            <a class="result__a" href="https://second.example/article">A much longer second result title</a>
            <div class="result__snippet">Second snippet explains the result.</div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults).toEqual([
      {
        title: "First",
        url: "https://first.example/short",
        source: "first.example",
        rank: 1,
        snippet: "Snippet link should not become the result title.",
      },
      {
        title: "A much longer second result title",
        url: "https://second.example/article",
        source: "second.example",
        rank: 2,
        snippet: "Second snippet explains the result.",
      },
    ]);
    expect(envelope.results).toEqual(envelope.searchResults);
    expect(envelope.pageLinks).toHaveLength(4);
    expect(envelope.pageLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "First",
        url: "https://first.example/short",
      }),
    ]));
    expect(envelope.pageLinks.map((link: { url: string }) => link.url)).toContain("https://snippet.example/");
  });

  it("does not warn about query relevance for direct search result URLs", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://duckduckgo.com/html/?q=ax-grep", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div class="result">
            <a class="result__a" href="https://first.example/">First</a>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("search-results");
    expect(envelope.diagnostics).not.toContainEqual(expect.objectContaining({ code: "SEARCH_LOW_CONFIDENCE" }));
  });

  it("adds query relevance hints to search results", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "ax-grep npm", "--engine", "bing", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://www.npmjs.com/package/ax-grep">ax-grep - npm</a></h2>
              <p>Install ax-grep from npm.</p>
            </li>
            <li class="b_algo">
              <h2><a href="https://unrelated.example/">Enterprise AI transformation</a></h2>
              <p>General consulting page.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults[0]).toMatchObject({
      title: "ax-grep - npm",
      sourceType: "official",
      sourceScore: 0.9,
      sourceHints: ["package-registry"],
      relevance: "high",
      matchedTerms: ["ax-grep", "npm"],
      isLikelyOfficial: true,
    });
    expect(envelope.searchResults[1]).toMatchObject({
      sourceType: "unknown",
      sourceScore: 0.35,
      relevance: "low",
      matchedTerms: [],
      isLikelyOfficial: false,
    });
    expect(envelope.tree).toBeUndefined();
  });

  it("does not treat generic package registry results as relevant when a package-like query term is missing", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "ax-grep npm", "--engine", "duckduckgo", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div class="result">
            <a class="result__a" href="https://www.npmjs.com/package/axios">axios - npm</a>
            <div class="result__snippet">Start using axios by running npm i axios.</div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults[0]).toMatchObject({
      title: "axios - npm",
      relevance: "low",
      matchedTerms: ["npm"],
      isLikelyOfficial: false,
    });
    expect(envelope.diagnostics).toContainEqual(expect.objectContaining({
      code: "SEARCH_LOW_CONFIDENCE",
    }));
    expect(envelope.agent.canUseFetchedHtml).toBe(true);
    expect(envelope.agent.needsBrowserHtml).toBe(false);
    expect(envelope.recommendedResult).toBeUndefined();
    expect(envelope.suggestedActions[0]).toMatchObject({
      action: "refine-search",
      command: "ax-grep --search '\"ax-grep\" npm' --engine duckduckgo --json --summary",
    });
    expect(envelope.pageCheck.recommendedAction).toMatchObject({
      action: "refine-search",
    });
    expect(envelope.pageCheck.nextSteps).not.toContainEqual(expect.objectContaining({
      url: "https://www.npmjs.com/package/axios",
    }));
  });

  it("does not satisfy --find from the search page title alone", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "ax-grep npm", "--engine", "duckduckgo", "--find", "ax-grep", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>ax-grep npm at DuckDuckGo</title></head>
          <body>
            <main>
              <div class="result">
                <a class="result__a" href="https://www.npmjs.com/package/axios">axios - npm</a>
                <div class="result__snippet">Start using axios by running npm i axios.</div>
              </div>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.finds[0]).toMatchObject({
      query: "ax-grep",
      found: false,
      matchCount: 0,
    });
    expect(envelope.verification).toMatchObject({
      status: "missing",
      missingQueries: ["ax-grep"],
    });
    expect(envelope.agent).toMatchObject({
      status: "choose-result",
      verificationStatus: "missing",
      primaryAction: {
        action: "refine-search",
        command: "ax-grep --search '\"ax-grep\" npm' --engine duckduckgo --find 'ax-grep' --json --summary",
      },
    });
    expect(envelope.suggestedActions[0]).toMatchObject({
      action: "refine-search",
      command: "ax-grep --search '\"ax-grep\" npm' --engine duckduckgo --find 'ax-grep' --json --summary",
    });
  });

  it("suggests the strongest matching search result instead of always rank one", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "ax-grep npm", "--engine", "bing", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://unrelated.example/">Enterprise AI transformation</a></h2>
              <p>General consulting page.</p>
            </li>
            <li class="b_algo">
              <h2><a href="https://www.npmjs.com/package/ax-grep">ax-grep - npm</a></h2>
              <p>Install ax-grep from npm.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.suggestedActions[0]).toMatchObject({
      action: "open-result",
      url: "https://www.npmjs.com/package/ax-grep",
      rank: 2,
      openResult: "best",
      command: "ax-grep --search 'ax-grep npm' --engine bing --open-result best --json --summary",
    });
    expect(envelope.recommendedResult).toMatchObject({
      title: "ax-grep - npm",
      url: "https://www.npmjs.com/package/ax-grep",
      rank: 2,
      sourceType: "official",
      relevance: "high",
      isLikelyOfficial: true,
    });
  });

  it("uses --find matches when recommending a search result", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli([
      "--search",
      "agent browser",
      "--engine",
      "bing",
      "--find",
      "target claim",
      "--json",
      "--no-tree",
    ], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://first.example/">Agent browser overview</a></h2>
              <p>General overview for agent browser tools.</p>
            </li>
            <li class="b_algo">
              <h2><a href="https://source.example/article">Independent source</a></h2>
              <p>This result contains the target claim for verification.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults[1]).toMatchObject({
      title: "Independent source",
      rank: 2,
      findMatches: ["target claim"],
    });
    expect(envelope.recommendedResult).toMatchObject({
      title: "Independent source",
      url: "https://source.example/article",
      rank: 2,
      findMatches: ["target claim"],
    });
    expect(envelope.suggestedActions[0]).toMatchObject({
      action: "open-result",
      url: "https://source.example/article",
      rank: 2,
      openResult: "best",
      command: "ax-grep --search 'agent browser' --engine bing --find 'target claim' --open-result best --json --summary",
    });
    expect(envelope.suggestedActions[0].reason).toContain("matching --find: target claim");
    expect(envelope.agent).toMatchObject({
      status: "choose-result",
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      verificationStatus: "matched",
      recommendedUrl: "https://source.example/article",
      recommendedTitle: "Independent source",
      recommendedRank: 2,
      recommendedSource: "source.example",
      primaryAction: {
        action: "open-result",
        url: "https://source.example/article",
        openResult: "best",
      },
    });
    expect(envelope.pageCheck.nextSteps[0]).toMatchObject({
      action: "open-result",
      url: "https://source.example/article",
      rank: 2,
      openResult: "best",
    });
  });

  it("warns when search results weakly match the query", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "ax-grep npm", "--engine", "bing", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://consulting.example/">Enterprise AI transformation</a></h2>
              <p>General consulting page.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "SEARCH_LOW_CONFIDENCE",
      }),
    ]);
    expect(envelope.searchResults[0]).toMatchObject({
      relevance: "low",
      matchedTerms: [],
      isLikelyOfficial: false,
    });
  });

  it("refines search instead of opening a relevant result when --find is missing from all result cards", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "OpenAI API docs", "--engine", "bing", "--find", "Responses API", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://developers.openai.com/api/docs">OpenAI API Platform Documentation</a></h2>
              <p>Explore guides, API docs, and examples for the OpenAI API.</p>
            </li>
            <li class="b_algo">
              <h2><a href="https://github.com/openai/openai-python">OpenAI Python API library</a></h2>
              <p>The official Python library for the OpenAI API.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      status: "choose-result",
      verificationStatus: "missing",
      primaryAction: {
        action: "refine-search",
        reason: "No result card matched the requested --find text; refine the query before opening a result.",
        command: "ax-grep --search '\"Responses API\" OpenAI API docs' --engine bing --find 'Responses API' --agent",
      },
    });
    expect(envelope.recommendedResult).toBeUndefined();
    expect(envelope.suggestedActions).toBeUndefined();
    expect(envelope.verification.recommendedAction).toBeUndefined();
  });

  it("does not treat hostile substring domains as official results", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "openai api docs", "--engine", "bing", "--json", "--no-tree"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://not-openai-example.com/api-docs">OpenAI API docs mirror</a></h2>
              <p>Unofficial mirror mentioning OpenAI API docs.</p>
            </li>
            <li class="b_algo">
              <h2><a href="https://platform.openai.com/docs">OpenAI API documentation</a></h2>
              <p>Official OpenAI API docs.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults[0]).toMatchObject({
      source: "not-openai-example.com",
      relevance: "high",
      isLikelyOfficial: false,
    });
    expect(envelope.searchResults[1]).toMatchObject({
      source: "platform.openai.com",
      relevance: "high",
      isLikelyOfficial: true,
    });
    expect(envelope.recommendedResult).toMatchObject({
      url: "https://platform.openai.com/docs",
      isLikelyOfficial: true,
    });
  });

  it("ignores style text inside search result titles", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://www.startpage.com/sp/search?query=example", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div class="w-gl__result">
            <a class="w-gl__result-title" href="https://example.com/">
              <style>.title{color:red}</style>
              Example Domain
            </a>
            <p class="w-gl__description">Example snippet.</p>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults[0]).toMatchObject({
      title: "Example Domain",
      url: "https://example.com/",
      snippet: "Example snippet.",
    });
  });

  it("extracts Baidu search result cards", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://www.baidu.com/s?wd=ax-lite", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <a href="https://passport.baidu.com/">登录</a>
          <div class="result" tpl="se_com_default">
            <h3><a href="https://target.example/first">Baidu First Result</a></h3>
            <div class="c-abstract">First Baidu snippet for agent search result checking.</div>
          </div>
          <div class="result">
            <h3><a href="https://target.example/second">Baidu Second Result</a></h3>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("search-results");
    expect(envelope.searchResults).toEqual([
      expect.objectContaining({
        title: "Baidu First Result",
        url: "https://target.example/first",
        rank: 1,
      }),
      expect.objectContaining({
        title: "Baidu Second Result",
        url: "https://target.example/second",
        rank: 2,
      }),
    ]);
  });

  it("opens search results using SERP order instead of generic link score", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "agent browser", "--engine", "duckduckgo", "--open-result", "1", "--json"], {
      stdout,
      fetch: async (input) => {
        requestedUrls.push(String(input));
        if (requestedUrls.length === 1) {
          return new Response(`
            <main>
              <div class="result">
                <a class="result__a" href="https://first.example/short">First</a>
              </div>
              <div class="result">
                <a class="result__a" href="https://second.example/a-much-longer-title-that-would-score-higher">A much longer second result title</a>
              </div>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <html>
            <head><title>First target</title></head>
            <body><main><h1>First target</h1><p>This opened the first SERP result.</p></main></body>
          </html>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls[1]).toBe("https://first.example/short");
    expect(envelope.sourceSearch).toMatchObject({
      selectedRank: 1,
      selectedTitle: "First",
      selectedUrl: "https://first.example/short",
    });
  });

  it("can open the best matching search result", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "ax-grep npm", "--engine", "duckduckgo", "--open-result", "best", "--json"], {
      stdout,
      fetch: async (input) => {
        requestedUrls.push(String(input));
        if (requestedUrls.length === 1) {
          return new Response(`
            <main>
              <div class="result">
                <a class="result__a" href="https://unrelated.example/">Enterprise AI transformation</a>
                <div class="result__snippet">General consulting page.</div>
              </div>
              <div class="result">
                <a class="result__a" href="https://www.npmjs.com/package/ax-grep">ax-grep - npm</a>
                <div class="result__snippet">Install ax-grep from npm.</div>
              </div>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <html>
            <head><title>ax-grep - npm</title></head>
            <body><main><h1>ax-grep</h1><p>Package page opened by best result selection.</p></main></body>
          </html>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls[1]).toBe("https://www.npmjs.com/package/ax-grep");
    expect(envelope.sourceSearch).toMatchObject({
      selectedRank: 2,
      selectedTitle: "ax-grep - npm",
      selectedUrl: "https://www.npmjs.com/package/ax-grep",
      selectedResult: {
        id: "selected",
        path: "sourceSearch.selectedResult",
        title: "ax-grep - npm",
        url: "https://www.npmjs.com/package/ax-grep",
        source: "npmjs.com",
        rank: 2,
        snippet: "Install ax-grep from npm.",
        sourceType: "official",
        relevance: "high",
        matchedTerms: ["ax-grep", "npm"],
        isLikelyOfficial: true,
      },
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "sourceSearch.selectedResult",
      count: 1,
    }));
  });

  it("can open the best search result using --find matches", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli([
      "--search",
      "agent browser",
      "--engine",
      "duckduckgo",
      "--find",
      "target claim",
      "--open-result",
      "best",
      "--json",
    ], {
      stdout,
      fetch: async (input) => {
        requestedUrls.push(String(input));
        if (requestedUrls.length === 1) {
          return new Response(`
            <main>
              <div class="result">
                <a class="result__a" href="https://first.example/">Agent browser overview</a>
                <div class="result__snippet">General overview for agent browser tools.</div>
              </div>
              <div class="result">
                <a class="result__a" href="https://source.example/article">Independent source</a>
                <div class="result__snippet">This result contains the target claim for verification.</div>
              </div>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <html>
            <head><title>Independent source</title></head>
            <body><main><h1>Independent source</h1><p>Opened by --find-aware best result selection.</p></main></body>
          </html>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls[1]).toBe("https://source.example/article");
    expect(envelope.sourceSearch).toMatchObject({
      selectedRank: 2,
      selectedTitle: "Independent source",
      selectedUrl: "https://source.example/article",
    });
  });

  it("auto search opens results from the selected engine", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "agent browser", "--engine", "auto", "--open-result", "2", "--json"], {
      stdout,
      fetch: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("duckduckgo.com")) {
          return new Response(`<main><p>No results here.</p></main>`, { headers: { "content-type": "text/html" } });
        }
        if (url.includes("bing.com")) {
          return new Response(`
            <main>
              <ol>
                <li class="b_algo"><h2><a href="https://first.example/">First</a></h2><p>First snippet.</p></li>
                <li class="b_algo"><h2><a href="https://target.example/article">Target</a></h2><p>Target snippet.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        if (url.includes("startpage.com")) {
          return new Response(`
            <main><div class="w-gl__result"><a class="w-gl__result-title" href="https://start.example/">Start</a></div></main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <html><head><title>Target</title></head><body><main><h1>Target page</h1><p>Opened from auto search.</p></main></body></html>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls).toEqual([
      "https://duckduckgo.com/html/?q=agent+browser",
      "https://www.bing.com/search?q=agent+browser",
      "https://www.startpage.com/sp/search?query=agent+browser",
      "https://target.example/article",
    ]);
    expect(envelope).toMatchObject({
      url: "https://target.example/article",
      searchEngine: "auto",
      selectedSearchEngine: "bing",
      sourceSearch: {
        query: "agent browser",
        engine: "bing",
        selectedEngine: "bing",
        selectedRank: 2,
        selectedTitle: "Target",
        selectedUrl: "https://target.example/article",
      },
    });
  });

  it("can open a selected search result and analyze the target page", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "agent browser", "--engine", "duckduckgo", "--open-result", "2", "--json"], {
      stdout,
      fetch: async (input) => {
        requestedUrls.push(String(input));
        if (requestedUrls.length === 1) {
          return new Response(`
            <main>
              <ol>
                <li><a href="https://first.example/page">A Much Stronger First Result Title</a><p>First result snippet.</p></li>
                <li><a href="https://target.example/article">Target Result</a><p>Target result snippet for the selected page.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <html>
            <head><title>Target page</title></head>
            <body>
              <main>
                <article>
                  <h1>Target heading</h1>
                  <p>This target page has enough article text for source checking.</p>
                  <p>Agents can inspect this second paragraph after opening the search result.</p>
                  <a href="/next">Next source</a>
                </article>
              </main>
            </body>
          </html>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(requestedUrls).toEqual([
      "https://duckduckgo.com/html/?q=agent+browser",
      "https://target.example/article",
    ]);
    expect(envelope).toMatchObject({
      url: "https://target.example/article",
      finalUrl: "https://target.example/article",
      searchQuery: "agent browser",
      searchEngine: "duckduckgo",
      kind: "content-page",
      page: {
        title: "Target page",
      },
      sourceSearch: {
        query: "agent browser",
        engine: "duckduckgo",
        searchUrl: "https://duckduckgo.com/html/?q=agent+browser",
        selectedRank: 2,
        selectedTitle: "Target Result",
        selectedUrl: "https://target.example/article",
      },
    });
    expect(envelope.outline).toEqual([{ text: "Target heading", level: 1 }]);
    expect(envelope.results[0]).toMatchObject({
      title: "Next source",
      url: "https://target.example/next",
    });
  });

  it("compacts opened search result provenance for agent output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "duckduckgo", "--open-result", "1", "--timeout", "30000", "--user-agent", "custom-agent/1.0", "--agent"], {
      stdout,
      fetch: async (input) => {
        if (String(input).includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <ol>
                <li><a href="https://target.example/article">Target Result</a><p>Target result snippet.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <html>
            <head><title>Target page</title></head>
            <body>
              <main>
                <article>
                  <h1>Target heading</h1>
                  <p>This target page has enough article text for source checking and agent routing.</p>
                  <a href="https://source.example/report">Source report</a>
                </article>
              </main>
            </body>
          </html>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.sourceSearch).toMatchObject({
      query: "agent browser",
      selectedRank: 1,
      selectedUrl: "https://target.example/article",
      selectedResult: {
        title: "Target Result",
        url: "https://target.example/article",
        rank: 1,
        command: "ax-grep --search 'agent browser' --engine duckduckgo --timeout 30000 --user-agent 'custom-agent/1.0' --open-result 1 --agent",
        commandArgs: [
          "ax-grep",
          "--search",
          "agent browser",
          "--engine",
          "duckduckgo",
          "--timeout",
          "30000",
          "--user-agent",
          "custom-agent/1.0",
          "--open-result",
          "1",
          "--agent",
        ],
      },
    });
    expect(envelope.searchEngines).toBeUndefined();
    expect(envelope.suggestedActions).toBeUndefined();
    expect(envelope.pageCheck.primaryLinks).toBeUndefined();
    expect(envelope.pageCheck.sourceLinks).toEqual([
      expect.objectContaining({
        id: "s1",
        path: "pageCheck.sourceLinks[0]",
        url: "https://source.example/report",
        command: "ax-grep 'https://source.example/report' --timeout 30000 --user-agent 'custom-agent/1.0' --agent",
        commandArgs: [
          "ax-grep",
          "https://source.example/report",
          "--timeout",
          "30000",
          "--user-agent",
          "custom-agent/1.0",
          "--agent",
        ],
      }),
    ]);
  });

  it("rejects opening a result without search mode", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--open-result", "1", "--json"], { stdout });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(2);
    expect(envelope.error).toMatchObject({
      code: "USAGE",
      message: "--open-result requires --search",
    });
  });

  it("returns a structured error when the selected search result is missing", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--open-result", "3", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li><a href="https://first.example/page">First Result</a><p>First result snippet.</p></li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(21);
    expect(envelope.error).toMatchObject({
      code: "NO_RESULT",
      message: "search result 3 is not available; found 1",
    });
  });

  it("returns candidate metadata when auto search finds no usable results", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "auto", "--json"], {
      stdout,
      fetch: async (input) => {
        if (String(input).includes("bing.com")) return new Response("forbidden", { status: 403, statusText: "Forbidden" });
        return new Response(`<main><p>No usable search result cards.</p></main>`, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(21);
    expect(envelope).toMatchObject({
      ok: false,
      searchQuery: "agent browser",
      searchEngine: "auto",
      selectedSearchEngine: expect.any(String),
      kind: "empty",
      searchResults: [],
      error: {
        code: "NO_RESULT",
        message: "auto search found no usable results",
      },
    });
    expect(envelope.searchEngines).toEqual([
      expect.objectContaining({ engine: "duckduckgo", ok: false, resultCount: 0 }),
      expect.objectContaining({ engine: "bing", ok: false, resultCount: 0, error: expect.objectContaining({ code: "HTTP_ERROR", status: 403 }) }),
      expect.objectContaining({ engine: "startpage", ok: false, resultCount: 0 }),
    ]);
  });

  it("keeps selected search metadata when opening a result fails", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "duckduckgo", "--open-result", "1", "--json"], {
      stdout,
      fetch: async (input) => {
        if (String(input).includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <ol>
                <li><a href="https://target.example/article">Target Result</a><p>Target result snippet.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response("forbidden", { status: 403, statusText: "Forbidden" });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(12);
    expect(envelope).toMatchObject({
      ok: false,
      url: "https://target.example/article",
      searchQuery: "agent browser",
      searchEngine: "duckduckgo",
      sourceSearch: {
        query: "agent browser",
        engine: "duckduckgo",
        searchUrl: "https://duckduckgo.com/html/?q=agent+browser",
        selectedRank: 1,
        selectedTitle: "Target Result",
        selectedUrl: "https://target.example/article",
      },
      error: {
        code: "HTTP_ERROR",
        status: 403,
      },
    });
  });

  it("routes missing opened search results to alternate SERP candidates", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "duckduckgo", "--open-result", "1", "--agent"], {
      stdout,
      fetch: async (input) => {
        if (String(input).includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <ol>
                <li><a class="result__a" href="https://missing.example/article">Missing Result</a><p>Missing result snippet.</p></li>
                <li><a class="result__a" href="https://alternate.example/article">Alternate Result</a><p>Alternate result snippet.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response("not found", { status: 404, statusText: "Not Found" });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(12);
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "open-alternate-result",
      reason: "The selected search result was missing; open the next available result from the original SERP.",
      url: "https://alternate.example/article",
      rank: 2,
      command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 2 --agent",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "sourceSearch.selectedResult",
      count: 1,
    }));
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "sourceSearch.alternateResults",
      count: 1,
    }));
    expect(envelope.sourceSearch).toMatchObject({
      selectedRank: 1,
      selectedUrl: "https://missing.example/article",
      alternateResults: [
        expect.objectContaining({
          title: "Alternate Result",
          url: "https://alternate.example/article",
          rank: 2,
          command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 2 --agent",
        }),
      ],
    });
  });

  it("routes failed opened-result verification to an alternate matching SERP result", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli([
      "--search",
      "agent browser",
      "--engine",
      "duckduckgo",
      "--find",
      "target claim",
      "--open-result",
      "1",
      "--agent",
    ], {
      stdout,
      fetch: async (input) => {
        if (String(input).includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <div class="result">
                <a class="result__a" href="https://first.example/article">Agent browser overview</a>
                <div class="result__snippet">General overview without the requested claim.</div>
              </div>
              <div class="result">
                <a class="result__a" href="https://alternate.example/article">Independent source</a>
                <div class="result__snippet">This result contains the target claim for verification.</div>
              </div>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response(`
          <main>
            <article>
              <h1>Agent browser overview</h1>
              <p>This opened page is readable but does not contain the requested phrase.</p>
            </article>
          </main>
        `, { headers: { "content-type": "text/html" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      status: "verify",
      verificationStatus: "missing",
      primaryAction: {
        action: "open-alternate-result",
        reason: "The opened result did not verify the requested text; an alternate original SERP result matches the missing query.",
        url: "https://alternate.example/article",
        rank: 2,
        command: "ax-grep --search 'agent browser' --engine duckduckgo --find 'target claim' --open-result 2 --agent",
      },
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "sourceSearch.alternateResults",
      count: 1,
    }));
    expect(envelope.sourceSearch.alternateResults[0]).toMatchObject({
      title: "Independent source",
      url: "https://alternate.example/article",
      findMatches: ["target claim"],
      command: "ax-grep --search 'agent browser' --engine duckduckgo --find 'target claim' --open-result 2 --agent",
    });
    expect(envelope.verification.recommendedAction).toBeUndefined();
  });

  it("rejects search with an explicit URL", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--search", "agent", "--json"], { stdout });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(2);
    expect(envelope.error).toMatchObject({
      code: "USAGE",
      message: "--search cannot be used with an explicit URL",
    });
  });

  it("keeps the best duplicate link text and strips trailing URL punctuation", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <a href="https://target.example/article">target.example</a>
          <h2><a href="https://target.example/article">Useful result title</a></h2>
          <p><a href="https://other.example/post),">Other result</a></p>
        </main>
      `),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.links[0]).toMatchObject({
      text: "Useful result title",
      url: "https://target.example/article",
    });
    expect(envelope.links[1]).toMatchObject({
      text: "Other result",
      url: "https://other.example/post",
    });
  });

  it("adds result snippets and content excerpts for page checking", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <article>
            <h1>Research guide</h1>
            <p>This page explains how to compare sources, inspect claims, and choose the best next result for an agent.</p>
            <ul>
              <li>
                <a href="/result">Result Title</a>
                <p>Snippet text explains why this result is useful for the current investigation.</p>
              </li>
            </ul>
          </article>
        </main>
      `),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.results[0]).toMatchObject({
      title: "Result Title",
      url: "https://example.test/result",
      snippet: "Snippet text explains why this result is useful for the current investigation.",
    });
    expect(envelope.content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: "This page explains how to compare sources, inspect claims, and choose the best next result for an agent.",
        role: "p",
      }),
    ]));
  });

  it("includes a pageCheck summary for article and forum pages", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://forum.example/post/123", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <html lang="en">
          <head>
            <title>Forum post title</title>
            <link rel="canonical" href="/post/123">
          </head>
          <body>
            <header><a href="/login">Login</a><a href="/privacy">Privacy</a></header>
            <main>
              <article>
                <h1>Forum post title</h1>
                <p>This post explains the primary claim, gives enough surrounding context, and includes source details for checking.</p>
                <p>The second paragraph adds discussion context so an agent can inspect whether the page is useful before reading the full tree.</p>
                <a href="https://source.example/report">Original source report</a>
                <a href="/comments/123">Comments</a>
                <button>Reply</button>
              </article>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck).toMatchObject({
      title: "Forum post title",
      canonicalUrl: "https://forum.example/post/123",
      mainHeading: "Forum post title",
      lang: "en",
      confidence: "high",
      readability: {
        level: "high",
        score: expect.any(Number),
        reasons: expect.arrayContaining([
          "2 content evidence items",
          "some extracted text",
          "1 external source link",
        ]),
      },
      recommendedAction: {
        action: "read-content",
        execution: "read-current",
        url: "https://forum.example/post/123",
        terminal: true,
        readFrom: "pageCheck.contentEvidence",
      },
      nextSteps: [
        expect.objectContaining({
          action: "read-content",
          execution: "read-current",
          url: "https://forum.example/post/123",
          terminal: true,
          readFrom: "pageCheck.contentEvidence",
        }),
        expect.objectContaining({
          action: "open-source-link",
          execution: "run-command",
          url: "https://source.example/report",
        }),
        expect.objectContaining({
          action: "inspect-actions",
          execution: "interact-browser",
          url: "https://forum.example/post/123",
          requiresBrowserInteraction: true,
        }),
      ],
    });
    expect(envelope.pageCheck.contentPreview).toEqual([
      "This post explains the primary claim, gives enough surrounding context, and includes source details for checking.",
      "The second paragraph adds discussion context so an agent can inspect whether the page is useful before reading the full tree.",
    ]);
    expect(envelope.pageCheck.contentEvidence).toEqual([
      expect.objectContaining({
        id: "e1",
        path: "pageCheck.contentEvidence[0]",
        rank: 1,
        role: "p",
        source: "semantic",
        score: expect.any(Number),
        text: "This post explains the primary claim, gives enough surrounding context, and includes source details for checking.",
      }),
      expect.objectContaining({
        id: "e2",
        path: "pageCheck.contentEvidence[1]",
        rank: 2,
        role: "p",
        source: "semantic",
        score: expect.any(Number),
        text: "The second paragraph adds discussion context so an agent can inspect whether the page is useful before reading the full tree.",
      }),
    ]);
    expect(envelope.pageCheck.primaryLinks).toEqual([
      expect.objectContaining({
        title: "Original source report",
        url: "https://source.example/report",
        kind: "external",
      }),
      expect.objectContaining({
        title: "Comments",
        url: "https://forum.example/comments/123",
        kind: "internal",
      }),
    ]);
    expect(envelope.pageCheck.sourceLinks).toEqual([
      expect.objectContaining({
        title: "Original source report",
        url: "https://source.example/report",
        kind: "external",
        sourceType: "unknown",
        sourceScore: 0.35,
      }),
    ]);
    expect(envelope.pageCheck.primaryLinks.map((link: { title: string }) => link.title)).not.toContain("Login");
    expect(envelope.pageCheck.actions).toEqual([
      expect.objectContaining({ type: "button", text: "Reply" }),
    ]);
  });

  it("falls back to headings and primary links for forum pages without paragraph roles", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://forum.example/post/456", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>Forum post title : Forum</title></head>
          <body>
            <main>
              <h1>Forum</h1>
              <h2>Board name</h2>
              <h3>Forum post title</h3>
              <a href="https://facebook.com/sharer/sharer.php?u=https://forum.example/post/456">Facebook</a>
              <a href="#div_content">본문 바로가기</a>
              <a href="/post/456/comments">Useful comments</a>
              <a href="https://source.example/report">Original source report</a>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.contentPreview).toEqual([
      "Board name",
      "Original source report",
      "Useful comments",
    ]);
    expect(envelope.pageCheck.primaryLinks).toEqual([
      expect.objectContaining({
        title: "Original source report",
        kind: "external",
      }),
      expect.objectContaining({
        title: "Useful comments",
        kind: "internal",
      }),
    ]);
    expect(envelope.pageCheck.primaryLinks.map((link: { title: string }) => link.title)).not.toContain("Facebook");
  });

  it("prefers content headings and links over global navigation in pageCheck", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://github.com/example/project", "--agent", "--find", "project"], {
      stdout,
      fetch: async () => new Response(`
        <html lang="en">
          <head><title>GitHub - example/project: Project documentation</title></head>
          <body>
            <nav>
              <h2>Navigation Menu</h2>
              <button>Toggle navigation</button>
              <button>Open Source</button>
              <button>Enterprise</button>
              <button>Open Sidebar</button>
              <button>Get started</button>
              <button>Concepts</button>
              <button>How-tos</button>
              <button>Reference</button>
              <button>Search or jump to…</button>
              <button>검색하기</button>
              <button>로그인</button>
              <button>close</button>
              <button>나중에 하기</button>
              <input role="searchbox" aria-label="통합검색">
              <section>
                <h3>EXPLORE</h3>
                <a href="https://docs.github.com/">Documentation</a>
                <a href="https://skills.github.com/">GitHub Skills</a>
              </section>
              <section>
                <h3>SUPPORT & SERVICES</h3>
                <a href="https://support.github.com/">Customer support</a>
              </section>
              <section>
                <h3>PROGRAMS</h3>
                <a href="https://archiveprogram.github.com/">Archive Program</a>
              </section>
            </nav>
            <main>
              <article>
                <h1>example/project</h1>
                <p>Project documentation explains installation, configuration, and source verification for agents.</p>
                <a href="https://project.example/docs">Project documentation</a>
                <a href="https://project.example/security">Security documentation</a>
              </article>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.mainHeading).toBe("example/project");
    expect(envelope.pageCheck.sourceLinks.map((link: { url: string }) => link.url)).toEqual([
      "https://project.example/docs",
      "https://project.example/security",
    ]);
    expect(envelope.pageCheck.sourceLinks.map((link: { url: string }) => link.url)).not.toContain("https://docs.github.com/");
    expect(envelope.pageCheck.actions).toBeUndefined();
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      execution: "read-current",
      terminal: true,
      readFrom: "verification.bestEvidence",
    });
  });

  it("preserves listing link order while filtering low-value actions", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://news.example/list", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>News list</title></head>
          <body>
            <main>
              <h1>News list</h1>
              <p>Current stories for agents to inspect and open.</p>
              <input>
              <button>button</button>
              <button>upvote</button>
              <a href="https://first.example/story">First ordinary story</a>
              <a href="https://github.com/example/project/issues/1">Second code issue</a>
              <a href="https://third.example/story">Third ordinary story</a>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.sourceLinks.map((link: { url: string }) => link.url)).toEqual([
      "https://first.example/story",
      "https://github.com/example/project/issues/1",
      "https://third.example/story",
    ]);
    expect(envelope.pageCheck.actions).toBeUndefined();
  });

  it("recommends opening a source link when page content is thin", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://forum.example/thin", "--json"], {
      stdout,
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

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.readability.level).toBe("low");
    expect(envelope.pageCheck.recommendedAction).toMatchObject({
      action: "open-source-link",
      url: "https://source.example/report",
      rank: 1,
      command: "ax-grep 'https://source.example/report' --json --summary",
      target: {
        title: "Original source report",
        url: "https://source.example/report",
        source: "source.example",
        rank: 1,
      },
    });
    expect(envelope.pageCheck.nextSteps).toEqual([
      expect.objectContaining({
        action: "open-source-link",
        url: "https://source.example/report",
      }),
      expect.objectContaining({
        action: "inspect-actions",
        url: "https://forum.example/thin",
        requiresBrowserInteraction: true,
      }),
      expect.objectContaining({
        action: "retry-with-browser-html",
        url: "https://forum.example/thin",
      }),
    ]);
  });

  it("uses forum HTML content blocks when semantic paragraph content is absent", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://forum.example/post/789", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>Forum discussion</title></head>
          <body>
            <main>
              <h1>Forum</h1>
              <h2>Discussion board</h2>
              <div class="comment_view">
                First useful comment has enough text for the page checking preview.
                <input type="hidden" value="duplicate hidden text should not appear">
              </div>
              <div class="comment_view">Second useful comment gives the agent more context.</div>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.contentPreview).toEqual([
      "First useful comment has enough text for the page checking preview.",
      "Second useful comment gives the agent more context.",
      "Discussion board",
    ]);
    expect(envelope.pageCheck.contentEvidence).toEqual([
      expect.objectContaining({
        rank: 1,
        role: "fallback",
        source: "fallback",
        score: expect.any(Number),
        text: "First useful comment has enough text for the page checking preview.",
      }),
      expect.objectContaining({
        rank: 2,
        role: "fallback",
        source: "fallback",
        score: expect.any(Number),
        text: "Second useful comment gives the agent more context.",
      }),
      expect.objectContaining({
        rank: 3,
        role: "fallback",
        source: "fallback",
        score: expect.any(Number),
        text: "Discussion board",
      }),
    ]);
  });

  it("prints pageCheck details in text output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <article>
            <h1>Article heading</h1>
            <p>This article paragraph is long enough to appear in the page checking summary for agents.</p>
            <a href="https://source.example/report">Source report</a>
          </article>
        </main>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("agent\n  status: ready");
    expect(stdout.output).toContain("  pageKind: content-page");
    expect(stdout.output).toContain("  routingIntent: read-current");
    expect(stdout.output).toContain("  continuationMode: read");
    expect(stdout.output).toContain("  nextMode: read");
    expect(stdout.output).toContain("  loopDecision: return");
    expect(stdout.output).toContain("  loopContinue: false");
    expect(stdout.output).toContain("  loopTerminal: true");
    expect(stdout.output).toContain("  loopMaxIterations: 0");
    expect(stdout.output).toContain("  loopReason: Return the resolved value for pageCheck.contentEvidence.");
    expect(stdout.output).toContain("  expectedOutcome: read-evidence - ");
    expect(stdout.output).toContain("  answerPlan: ready - Readable page evidence is available; answer from the listed citations.");
    expect(stdout.output).toContain("  answerCitations: e1");
    expect(stdout.output).toContain("  signal: content/info - ");
    expect(stdout.output).toContain("  canContinue: true");
    expect(stdout.output).toContain("  responseStatus: 200");
    expect(stdout.output).toContain("  responseOk: true");
    expect(stdout.output).toContain("  responseContentType: text/plain;charset=UTF-8");
    expect(stdout.output).toContain("  finalUrlChanged: false");
    expect(stdout.output).toContain("  alternativeActionCount: 1");
    expect(stdout.output).toContain("  usabilityScore:");
    expect(stdout.output).toContain("  evidenceQualityScore:");
    expect(stdout.output).toContain("  sourceQualityScore:");
    expect(stdout.output).toContain("  diagnosticErrors: 0");
    expect(stdout.output).toContain("  diagnosticWarnings: 1");
    expect(stdout.output).toContain("  diagnosticInfo: 0");
    expect(stdout.output).toContain("  verification: 0/0 found, 0 missing");
    expect(stdout.output).toContain("  readability: medium");
    expect(stdout.output).toContain("  citation: e1 pageCheck.contentEvidence[0] content score=");
    expect(stdout.output).toContain("This article paragraph is long enough to appear in the page checking summary for agents.");
    expect(stdout.output).toContain("  citation: s1 pageCheck.sourceLinks[0] source-link score=");
    expect(stdout.output).toContain("  bestReadTarget: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  bestReadTargetReason: Structured page excerpts suitable for source checking.");
    expect(stdout.output).toContain("  readabilityReason: 1 content evidence item");
    expect(stdout.output).toContain("  recommendedUrl: https://example.test/article");
    expect(stdout.output).toContain("pageCheck\n  confidence: medium");
    expect(stdout.output).toContain("  readability: medium");
    expect(stdout.output).toContain("  mainHeading: Article heading");
    expect(stdout.output).toContain("  excerpt: This article paragraph is long enough to appear in the page checking summary for agents.");
    expect(stdout.output).toContain("  evidence: e1 pageCheck.contentEvidence[0] 1. p (p) This article paragraph is long enough to appear in the page checking summary for agents.");
    expect(stdout.output).toContain("  link: external Source report <https://source.example/report>");
    expect(stdout.output).toContain("  sourceLink: Source report <https://source.example/report>");
    expect(stdout.output).toContain("  next: read-content [terminal] - The page has enough structured evidence for source checking.");
    expect(stdout.output).toContain("  execution: read-current");
    expect(stdout.output).toContain("  readFrom: pageCheck.contentEvidence");
    expect(stdout.output).not.toContain("  command: ax-grep 'https://example.test/article' --json --summary");
    expect(stdout.output).toContain("  step: 1. read-content [terminal] <https://example.test/article> - The page has enough structured evidence for source checking.");
    expect(stdout.output).toContain("    readFrom: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  step: 2. open-source-link <https://source.example/report> - Inspect an external source link referenced by the page.");
    expect(stdout.output).toContain("    execution: run-command");
    expect(stdout.output).toContain("    command: ax-grep 'https://source.example/report' --json --summary");
  });

  it("checks requested text against page summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli([
      "https://example.test/article",
      "--json",
      "--summary",
      "--find",
      "page checking summary",
      "--find",
      "not present",
    ], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <article>
            <h1>Article heading</h1>
            <p>This article paragraph is long enough to appear in the page checking summary for agents.</p>
            <a href="https://source.example/report">Source report</a>
          </article>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.tree).toBeUndefined();
    expect(envelope.finds[0]).toMatchObject({
      query: "page checking summary",
      found: true,
      matchCount: 3,
    });
    expect(envelope.finds[0].matches).toContainEqual(expect.objectContaining({
      field: "contentEvidence",
      rank: 1,
      text: "This article paragraph is long enough to appear in the page checking summary for agents.",
      selector: "p",
      source: "semantic",
      score: expect.any(Number),
    }));
    expect(envelope.finds[1]).toEqual({
      query: "not present",
      found: false,
      matchCount: 0,
      matches: [],
    });
    expect(envelope.verification).toMatchObject({
      status: "partial",
      requestedCount: 2,
      foundCount: 1,
      missingCount: 1,
      evidenceCount: 3,
      foundQueries: ["page checking summary"],
      missingQueries: ["not present"],
      bestEvidence: expect.objectContaining({
        field: "contentEvidence",
        rank: 1,
        source: "semantic",
        score: expect.any(Number),
      }),
      recommendedAction: {
        action: "open-source-link",
        reason: "Some requested text was not found; inspect the strongest external source link.",
        url: "https://source.example/report",
        rank: 1,
        command: "ax-grep 'https://source.example/report' --find 'not present' --json --summary",
      },
    });
    expect(envelope.agent).toMatchObject({
      status: "verify",
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      verificationStatus: "partial",
      primaryAction: {
        action: "open-source-link",
        url: "https://source.example/report",
      },
    });
  });

  it("prints find checks in text output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--find", "source report"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <article>
            <h1>Article heading</h1>
            <p>This article paragraph is long enough to appear in the page checking summary for agents.</p>
            <a href="https://source.example/report">Source report</a>
          </article>
        </main>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("agent\n  status: ready");
    expect(stdout.output).toContain("  canUseFetchedHtml: true");
    expect(stdout.output).toContain("verification\n  status: matched\n  found: 1/1");
    expect(stdout.output).toContain("  next: use-evidence - All requested text was found in the page summaries.");
    expect(stdout.output).toContain("finds\n  found: source report");
    expect(stdout.output).toContain("sourceLink: Source report <https://source.example/report>");
  });

  it("prints ranked result details in text output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://search.example/search?q=agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li>
              <a href="https://result.example/article">Result Title</a>
              <p>Snippet text explains why this result is useful for the current investigation.</p>
            </li>
          </ol>
        </main>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("agent\n  status: choose-result");
    expect(stdout.output).toContain("  canContinue: true");
    expect(stdout.output).toContain("  recommendedUrl: https://result.example/article");
    expect(stdout.output).toContain("  recommendedTitle: Result Title");
    expect(stdout.output).toContain("  recommendedRank: 1");
    expect(stdout.output).toContain("  recommendedSource: result.example");
    expect(stdout.output).toContain("  next: open-result <https://result.example/article>");
    expect(stdout.output).toContain("  execution: run-command");
    expect(stdout.output).toContain("  url: https://result.example/article");
    expect(stdout.output).toContain("  rank: 1");
    expect(stdout.output).toContain("  openResult: 1");
    expect(stdout.output).toContain("  command: ax-grep 'https://result.example/article' --json --summary");
    expect(stdout.output).toContain("  commandArgs: [\"ax-grep\",\"https://result.example/article\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("results\n  1. Result Title");
    expect(stdout.output).toContain("     url: https://result.example/article");
    expect(stdout.output).toContain("     source: result.example");
    expect(stdout.output).toContain("     snippet: Snippet text explains why this result is useful for the current investigation.");
  });

  it("returns a structured warning when the page has no inspectable content", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json"], {
      stdout,
      fetch: async () => new Response("", { status: 200, headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(20);
    expect(envelope.ok).toBe(false);
    expect(envelope.warnings[0].code).toBe("NO_INSPECTABLE_CONTENT");
    expect(envelope.kind).toBe("empty");
    expect(envelope.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "NO_INSPECTABLE_CONTENT",
    });
    expect(envelope.suggestedActions[0].action).toBe("retry-with-browser-html");
    expect(envelope.links).toEqual([]);
    expect(envelope.results).toEqual([]);
    expect(envelope.pageCheck.contentEvidence).toEqual([]);
    expect(envelope.pageCheck.sourceLinks).toEqual([]);
    expect(envelope.pageCheck.readability).toEqual({
      level: "low",
      score: 0,
      reasons: ["no page content extracted"],
    });
    expect(envelope.pageCheck.recommendedAction).toMatchObject({
      action: "retry-with-browser-html",
      url: "https://example.test",
      command: "ax-grep 'https://example.test' --html-file captured.html --json --summary",
    });
    expect(envelope.pageCheck.nextSteps[0]).toMatchObject({
      action: "retry-with-browser-html",
      url: "https://example.test",
      command: "ax-grep 'https://example.test' --html-file captured.html --json --summary",
    });
    expect(envelope.agent).toMatchObject({
      status: "needs-browser",
      continuationMode: "capture-html",
      next: {
        mode: "capture-html",
        action: "retry-with-browser-html",
        execution: "run-command",
      },
      expectedOutcome: {
        kind: "capture-html",
      },
      signals: expect.arrayContaining([
        expect.objectContaining({ kind: "browser", severity: "warning" }),
        expect.objectContaining({ kind: "diagnostic", severity: "error" }),
      ]),
      canUseFetchedHtml: false,
      needsBrowserHtml: true,
      primaryAction: {
        action: "retry-with-browser-html",
      },
    });
    expect(envelope.verification).toMatchObject({
      status: "not-requested",
      requestedCount: 0,
    });
    expect(envelope.error).toMatchObject({
      code: "NO_INSPECTABLE_CONTENT",
      status: 200,
    });
  });

  it("detects challenged pages and suggests browser-captured HTML", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://challenge.example", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>Just a moment...</title></head>
          <body><main><h1>Checking your browser</h1><p>Verify you are human before continuing.</p></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("blocked-page");
    expect(envelope.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CHALLENGE_LIKELY" }),
    ]));
    expect(envelope.suggestedActions[0]).toMatchObject({
      action: "retry-with-browser-html",
    });
    expect(envelope.pageCheck.recommendedAction).toMatchObject({
      action: "retry-with-browser-html",
      url: "https://challenge.example",
      command: "ax-grep 'https://challenge.example' --html-file captured.html --json --summary",
    });
  });

  it("detects login and paywall barriers", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://news.example/article", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Premium article</h1>
          <p>Log in to continue reading this premium article. Subscription required.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("blocked-page");
    expect(envelope.diagnostics.map((item: { code: string }) => item.code)).toEqual(expect.arrayContaining([
      "LOGIN_REQUIRED",
      "PAYWALL_LIKELY",
    ]));
  });

  it("does not treat search result pages as login-gated because of header login links", async () => {
    const stdout = new MemoryWriter();
    const items = Array.from({ length: 6 }, (_, index) => `
      <li><a href="https://result-${index}.example">Useful result ${index}</a><p>Result snippet ${index}.</p></li>
    `).join("");
    const status = await runCli(["https://search.example/search?q=login", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <header><a href="/login">Login</a></header>
        <main><ol>${items}</ol></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("search-results");
    expect(envelope.diagnostics.map((item: { code: string }) => item.code)).not.toContain("LOGIN_REQUIRED");
  });

  it("does not classify ordinary link-heavy pages as search results", async () => {
    const stdout = new MemoryWriter();
    const links = Array.from({ length: 8 }, (_, index) => `
      <li><a href="https://external-${index}.example/article">External article ${index}</a></li>
    `).join("");
    const status = await runCli(["https://forum.example/board", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Forum board</h1>
          <ul>${links}</ul>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.results).toHaveLength(8);
    expect(envelope.searchResults).toEqual([]);
    expect(envelope.kind).toBe("page");
    expect(envelope.suggestedActions.map((item: { action: string }) => item.action)).not.toContain("open-result");
  });

  it("treats verification wait pages as challenge-like", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://social.example/thread", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>Please wait for verification</title></head>
          <body><main><p>Please wait while we verify your browser. Enable JavaScript to continue.</p></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("blocked-page");
    expect(envelope.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CHALLENGE_LIKELY" }),
    ]));
    expect(envelope.suggestedActions[0]).toMatchObject({
      action: "retry-with-browser-html",
    });
  });

  it("reports fetch failures to stderr", async () => {
    const stderr = new MemoryWriter();
    const status = await runCli(["https://example.test"], {
      stderr,
      fetch: async () => new Response("blocked", { status: 403, statusText: "Forbidden" }),
    });

    expect(status).toBe(12);
    expect(stderr.output).toContain("HTTP 403 Forbidden");
  });

  it("returns stable JSON fields for HTTP errors", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json"], {
      stdout,
      fetch: async () => new Response("blocked", { status: 403, statusText: "Forbidden" }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(12);
    expect(envelope).toMatchObject({
      ok: false,
      url: "https://example.test",
      mode: "compact",
      warnings: [],
      page: {},
      links: [],
      results: [],
      outline: [],
      actions: [],
      error: {
        code: "HTTP_ERROR",
        status: 403,
      },
    });
  });

  it("prints executable browser HTML retry commands for agent HTTP errors", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/package", "--agent", "--find", "target claim"], {
      stdout,
      fetch: async () => new Response("blocked", { status: 403, statusText: "Forbidden" }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(12);
    expect(envelope.agent).toMatchObject({
      status: "error",
      canContinue: true,
      needsBrowserHtml: true,
      primaryAction: {
        action: "retry-with-browser-html",
        url: "https://example.test/package",
        command: "ax-grep 'https://example.test/package' --html-file captured.html --find 'target claim' --agent",
      },
    });
    expect(envelope.pageCheck.recommendedAction).toBeUndefined();
    expect(envelope.pageCheck.nextSteps).toBeUndefined();
  });

  it("preserves custom fetch options in agent HTTP retry commands", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli([
      "https://example.test/package",
      "--agent",
      "--find",
      "target claim",
      "--timeout",
      "30000",
      "--user-agent",
      "custom-agent/1.0",
    ], {
      stdout,
      fetch: async () => new Response("blocked", { status: 403, statusText: "Forbidden" }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(12);
    expect(envelope.agent.primaryAction.command).toBe("ax-grep 'https://example.test/package' --html-file captured.html --timeout 30000 --user-agent 'custom-agent/1.0' --find 'target claim' --agent");
  });

  it("classifies JSON usage errors separately from fetch errors", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--json"], { stdout });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(2);
    expect(envelope).toMatchObject({
      ok: false,
      mode: "compact",
      warnings: [],
      links: [],
      results: [],
      error: {
        code: "USAGE",
      },
    });
  });

  it("prints compact agent JSON for usage errors in agent mode", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--agent"], { stdout });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(2);
    expect(stdout.output).not.toContain("\n  \"");
    expect(envelope).toMatchObject({
      ok: false,
      kind: "empty",
      treeOmitted: true,
      agent: {
        status: "error",
        pageKind: "empty",
        routingIntent: "none",
        continuationMode: "stop",
        next: {
          mode: "stop",
        },
        expectedOutcome: {
          kind: "stop",
        },
        signals: expect.arrayContaining([
          expect.objectContaining({ kind: "diagnostic", severity: "error" }),
        ]),
        summary: "missing URL",
        canContinue: false,
        needsBrowserHtml: false,
        responseStatus: 0,
        responseOk: false,
        responseContentType: "",
        finalUrlChanged: false,
        alternativeActionCount: 0,
        usabilityScore: 0,
        evidenceQualityScore: 0,
        sourceQualityScore: 0,
        diagnosticErrorCount: 1,
        diagnosticWarningCount: 0,
        diagnosticInfoCount: 0,
        verificationRequestedCount: 0,
        verificationFoundCount: 0,
        verificationMissingCount: 0,
        diagnosticCodes: ["USAGE"],
      },
      error: {
        code: "USAGE",
      },
    });
    expect(envelope.links).toBeUndefined();
    expect(envelope.results).toBeUndefined();
    expect(envelope.tree).toBeUndefined();
  });

  it("rejects conflicting output format flags", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json", "--text"], { stdout });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(2);
    expect(envelope.error).toMatchObject({
      code: "USAGE",
      message: "--json and --text cannot be used together",
    });
  });

  it("can print only the ranked links summary", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--links-only"], {
      stdout,
      fetch: async () => new Response(`<main><a href="/docs">Docs</a><p>Body text</p></main>`),
    });

    expect(status).toBe(0);
    expect(stdout.output.trim()).toBe("links\n  1. Docs <https://example.test/docs>");
  });

  it("can cap tree lines after the links summary", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--max-tree-lines", "2"], {
      stdout,
      fetch: async () => new Response(`<main><a href="/docs">Docs</a><section><p>Body text</p></section></main>`),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("tree\n  main\n    [i] link 'Docs'");
    expect(stdout.output).toContain("tree lines omitted");
    expect(stdout.output).not.toContain("Body text");
  });

  it("caps search page tree output by default", async () => {
    const stdout = new MemoryWriter();
    const paragraphs = Array.from({ length: 120 }, (_, index) => `<p>Search page noise ${index}</p>`).join("");
    const status = await runCli(["https://search.example/search?q=agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol><li><a href="https://result.example">Result</a><p>Snippet text for result.</p></li></ol>
          <section>${paragraphs}</section>
        </main>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("tree lines omitted");
    expect(stdout.output).not.toContain("Search page noise 119");
  });

  it("can extract browser-captured HTML from a file with a URL base", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ax-grep-"));
    const htmlFile = join(dir, "page.html");
    await writeFile(htmlFile, `<main><a href="/captured">Captured</a></main>`, "utf8");

    const stdout = new MemoryWriter();
    const status = await runCli(["https://captured.example/page", "--html-file", htmlFile, "--links-only"], {
      stdout,
      fetch: async () => {
        throw new Error("fetch should not run for --html-file");
      },
    });

    expect(status).toBe(0);
    expect(stdout.output.trim()).toBe("links\n  1. Captured <https://captured.example/captured>");
  });

  it("can extract browser-captured HTML from stdin", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://captured.example/page", "--stdin", "--json"], {
      stdout,
      stdin: Readable.from([`<main><a href="/stdin">From stdin</a></main>`]) as NodeJS.ReadStream,
      fetch: async () => {
        throw new Error("fetch should not run for --stdin");
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.links[0]).toMatchObject({
      text: "From stdin",
      url: "https://captured.example/stdin",
    });
    expect(envelope.status).toBe(0);
  });

  it("does not ask for browser HTML again when captured HTML is already supplied", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ax-grep-"));
    const htmlFile = join(dir, "captured.html");
    await writeFile(htmlFile, `
      <html lang="ko">
        <head><title>Captured Article</title></head>
        <body>
          <nav><button>로그인</button></nav>
          <main>
            <article>
              <h1>Captured Heading</h1>
              <p>Captured browser HTML exposes the article body and target claim for verification.</p>
              <a href="/source">Original source</a>
            </article>
          </main>
        </body>
      </html>
    `, "utf8");

    const stdout = new MemoryWriter();
    const status = await runCli(["https://captured.example/article/123", "--html-file", htmlFile, "--agent", "--find", "target claim"], {
      stdout,
      fetch: async () => {
        throw new Error("fetch should not run for --html-file");
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      status: "ready",
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      verificationStatus: "matched",
      primaryExecution: "read-current",
      primaryReadFrom: "verification.bestEvidence",
      primaryAction: {
        action: "use-evidence",
        execution: "read-current",
        terminal: true,
        readFrom: "verification.bestEvidence",
      },
    });
    expect(envelope.agent.diagnosticCodes).toBeUndefined();
    expect(envelope.pageCheck.recommendedAction).toBeUndefined();
    expect(envelope.pageCheck.nextSteps).toBeUndefined();
  });

  it("does not retry browser HTML when captured HTML is missing requested evidence", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://captured.example/page", "--stdin", "--agent", "--find", "missing claim"], {
      stdout,
      stdin: Readable.from([`
        <main>
          <article>
            <h1>Captured Page</h1>
            <p>Browser captured content is readable but does not include the requested phrase.</p>
          </article>
        </main>
      `]) as NodeJS.ReadStream,
      fetch: async () => {
        throw new Error("fetch should not run for --stdin");
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      status: "verify",
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      verificationStatus: "missing",
      primaryExecution: "run-command",
      primaryCommand: "ax-grep --search 'missing claim' --find 'missing claim' --agent",
      primaryCommandArgs: ["ax-grep", "--search", "missing claim", "--find", "missing claim", "--agent"],
      primaryAction: {
        action: "broaden-search",
        execution: "run-command",
        command: "ax-grep --search 'missing claim' --find 'missing claim' --agent",
      },
    });
    expect(JSON.stringify(envelope)).not.toContain("retry-with-browser-html");
  });

  it("keeps blocker diagnostics for captured challenge HTML without asking for another capture", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://captured.example/challenge", "--stdin", "--agent"], {
      stdout,
      stdin: Readable.from([`
        <html>
          <head><title>Just a moment</title></head>
          <body><main><h1>Verify you are human</h1><p>Please wait for verification.</p></main></body>
        </html>
      `]) as NodeJS.ReadStream,
      fetch: async () => {
        throw new Error("fetch should not run for --stdin");
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("blocked-page");
    expect(envelope.agent).toMatchObject({
      status: "verify",
      continuationMode: "browser",
      next: {
        mode: "browser",
        action: "inspect-browser-state",
        execution: "interact-browser",
        requiresBrowserInteraction: true,
      },
      expectedOutcome: {
        kind: "browser-inspection",
      },
      signals: expect.arrayContaining([
        expect.objectContaining({ kind: "diagnostic", severity: "warning" }),
      ]),
      canUseFetchedHtml: false,
      needsBrowserHtml: false,
      primaryExecution: "interact-browser",
      requiresBrowserInteraction: true,
      primaryAction: {
        action: "inspect-browser-state",
        execution: "interact-browser",
        requiresBrowserInteraction: true,
      },
    });
    expect(envelope.agent.primaryAction.command).toBeUndefined();
    expect(envelope.agent.diagnosticCodes).toEqual(expect.arrayContaining(["CHALLENGE_LIKELY"]));
    expect(JSON.stringify(envelope)).not.toContain("retry-with-browser-html");
  });

  it("does not classify ordinary content pages as search results only because they have q params", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://docs.example/install?q=ax-grep", "--stdin", "--agent"], {
      stdout,
      stdin: Readable.from([`
        <main>
          <article>
            <h1>Install Guide</h1>
            <p>This documentation page explains installation details with enough text for source checking and agent routing.</p>
            <p>The second paragraph confirms this is content, not a search result page, despite a query parameter.</p>
            <a href="https://source.example/reference">Reference source</a>
          </article>
        </main>
      `]) as NodeJS.ReadStream,
      fetch: async () => {
        throw new Error("fetch should not run for --stdin");
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("content-page");
    expect(envelope.agent).toMatchObject({
      status: "ready",
      resultCount: 0,
      sourceLinkCount: 1,
      readabilityScore: expect.any(Number),
      readabilityReasons: expect.arrayContaining([
        "2 content evidence items",
        "some extracted text",
        "1 external source link",
      ]),
      primaryExecution: "read-current",
      primaryAction: {
        action: "read-content",
        execution: "read-current",
        terminal: true,
        readFrom: "pageCheck.contentEvidence",
      },
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.contentEvidence",
      count: 2,
      primary: true,
    }));
    expect(envelope.agent.readTargets).not.toContainEqual(expect.objectContaining({
      path: "searchResults",
    }));
    expect(envelope.pageCheck.readability).toMatchObject({
      reasons: expect.arrayContaining([
        "2 content evidence items",
        "some extracted text",
        "1 external source link",
      ]),
    });
    expect(envelope.searchResults).toBeUndefined();
  });

  it("does not classify generic site search URLs as SERPs without result-card evidence", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://docs.example/search?q=ax-grep", "--stdin", "--agent"], {
      stdout,
      stdin: Readable.from([`
        <main>
          <article>
            <h1>Search API Guide</h1>
            <p>This content page documents how a search API works and should be read as documentation.</p>
            <p>It has a URL path named search, but the body is an article rather than a ranked results page.</p>
            <a href="https://docs.example/reference">Reference</a>
          </article>
        </main>
      `]) as NodeJS.ReadStream,
      fetch: async () => {
        throw new Error("fetch should not run for --stdin");
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("content-page");
    expect(envelope.agent.status).toBe("ready");
    expect(envelope.agent.primaryAction.action).toBe("read-content");
    expect(envelope.agent.primaryAction.execution).toBe("read-current");
    expect(envelope.agent.primaryAction.terminal).toBe(true);
    expect(envelope.agent.primaryAction.readFrom).toBe("pageCheck.contentEvidence");
    expect(envelope.agent.primaryAction.command).toBeUndefined();
    expect(envelope.agent.primaryAction.commandArgs).toBeUndefined();
    expect(envelope.searchResults).toBeUndefined();
  });

  it("pins selected auto search engine in follow-up commands", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "auto", "--agent"], {
      stdout,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <div class="result">
                <a class="result__a" href="https://result.example/">Agent browser result</a>
                <div class="result__snippet">agent browser result</div>
              </div>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response("blocked", { status: 403, statusText: "Forbidden" });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.selectedSearchEngine).toBe("duckduckgo");
    expect(envelope.agent.primaryAction.command).toBe("ax-grep --search 'agent browser' --engine duckduckgo --open-result best --agent");
  });

  it("can drive a search-to-read executor loop from agent.next.loop", async () => {
    const requestedUrls: string[] = [];
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("duckduckgo.com")) {
        return new Response(`
          <main>
            <div class="result">
              <a class="result__a" href="https://result.example/guide">Agent Browser Guide</a>
              <div class="result__snippet">agent browser guide with extraction details</div>
            </div>
          </main>
        `, { headers: { "content-type": "text/html" } });
      }
      if (url === "https://result.example/guide") {
        return new Response(`
          <main>
            <article>
              <h1>Agent Browser Guide</h1>
              <p>Agent browser extraction details explain how to continue from search to evidence.</p>
              <p>After opening the best result, the executor should return semantic content evidence directly instead of requiring browser inspection.</p>
              <p>This page includes enough readable body text for ax-grep to treat it as a content page that an agent can summarize and cite.</p>
            </article>
          </main>
        `, { headers: { "content-type": "text/html" } });
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    let args = ["--search", "agent browser", "--engine", "duckduckgo", "--agent"];
    let payload: any;
    for (let step = 0; step < 3; step += 1) {
      const stdout = new MemoryWriter();
      const status = await runCli(args, { stdout, fetch });
      expect(status).toBe(0);
      payload = JSON.parse(stdout.output);
      const next = payload.agent.next;
      if (next.loop.decision === "return") {
        expect(next.readValue.path).toBe("pageCheck.contentEvidence");
        expect(next.readValue.value).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              text: "Agent browser extraction details explain how to continue from search to evidence.",
            }),
          ]),
        );
        break;
      }
      expect(next.loop.decision).toBe("execute");
      expect(next.commandArgs[0]).toBe("ax-grep");
      args = next.commandArgs.slice(1);
    }

    expect(payload.agent.next.loop.decision).toBe("return");
    expect(requestedUrls).toContain("https://result.example/guide");
  });

  it("branches HTTP error actions by status", async () => {
    const missingStdout = new MemoryWriter();
    const missingStatus = await runCli(["https://missing.example/page", "--agent"], {
      stdout: missingStdout,
      fetch: async () => new Response("not found", { status: 404, statusText: "Not Found" }),
    });
    const serverStdout = new MemoryWriter();
    const serverStatus = await runCli(["https://server.example/page", "--agent"], {
      stdout: serverStdout,
      fetch: async () => new Response("error", { status: 503, statusText: "Service Unavailable" }),
    });

    const missingEnvelope = JSON.parse(missingStdout.output);
    const serverEnvelope = JSON.parse(serverStdout.output);

    expect(missingStatus).toBe(12);
    expect(missingEnvelope.agent.canContinue).toBe(true);
    expect(missingEnvelope.agent.needsBrowserHtml).toBe(false);
    expect(missingEnvelope.agent.primaryAction).toMatchObject({
      action: "check-url-or-search",
      command: "ax-grep --search 'https://missing.example/page' --agent",
    });
    expect(serverStatus).toBe(12);
    expect(serverEnvelope.agent.canContinue).toBe(true);
    expect(serverEnvelope.agent.needsBrowserHtml).toBe(false);
    expect(serverEnvelope.agent.primaryAction).toMatchObject({
      action: "retry-later",
      command: "ax-grep 'https://server.example/page' --agent",
    });
  });
});

class MemoryWriter {
  output = "";

  write(chunk: string | Uint8Array): boolean {
    this.output += chunk.toString();
    return true;
  }
}

type CliNode = {
  role: string | null;
  name?: string;
  attributes?: unknown;
  children: CliNode[];
};

function findRole(node: CliNode, role: string): CliNode | undefined {
  if (node.role === role) return node;
  for (const child of node.children) {
    const match = findRole(child, role);
    if (match) return match;
  }
  return undefined;
}
