import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";

describe("cli", () => {
  it("fetches a URL and prints the text tree by default", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test"], {
      stdout,
      fetch: async () => new Response(`<main><h1>Example</h1><a href="/docs">Docs</a></main>`),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("links\n  1. Docs <https://example.test/docs>");
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
        <main>
          <a href="/docs">Docs</a>
          <a href="/docs">Docs duplicate</a>
          <a href="javascript:void(0)">Ignored</a>
          <a href="/proxy">Visit in Anonymous View</a>
        </main>
      `),
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

  it("returns a structured warning when the page has no inspectable content", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--json"], {
      stdout,
      fetch: async () => new Response("", { status: 200 }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(20);
    expect(envelope.ok).toBe(false);
    expect(envelope.warnings[0].code).toBe("NO_INSPECTABLE_CONTENT");
    expect(envelope.links).toEqual([]);
    expect(envelope.results).toEqual([]);
    expect(envelope.error).toMatchObject({
      code: "NO_INSPECTABLE_CONTENT",
      status: 200,
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
      links: [],
      results: [],
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
