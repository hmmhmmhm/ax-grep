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
      {
        title: "Docs duplicate",
        url: "https://example.test/docs",
        source: "example.test",
        rank: 1,
      },
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
    expect(requestedUrl).toBe("https://www.bing.com/search?q=agent%20browser");
    expect(envelope).toMatchObject({
      searchQuery: "agent browser",
      searchEngine: "bing",
      kind: "search-results",
    });
    expect(envelope.results[0].url).toBe("https://result.example/");
  });

  it("can open a selected search result and analyze the target page", async () => {
    const stdout = new MemoryWriter();
    const requestedUrls: string[] = [];
    const status = await runCli(["--search", "agent browser", "--open-result", "2", "--json"], {
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
      "https://duckduckgo.com/html/?q=agent%20browser",
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
        searchUrl: "https://duckduckgo.com/html/?q=agent%20browser",
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

  it("keeps selected search metadata when opening a result fails", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--open-result", "1", "--json"], {
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
        searchUrl: "https://duckduckgo.com/html/?q=agent%20browser",
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
