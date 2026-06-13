import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runCli } from "../src/cli";

describe("cli", () => {
  it("documents agent handoff routing in help output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--help"], { stdout });

    expect(status).toBe(0);
    expect(stdout.output).toContain("--agent                    Print compact JSON for agent routing; read agent.handoff first.");
    expect(stdout.output).toContain("--agent-brief              Print smaller executor JSON for subagent loops.");
    expect(stdout.output).toContain("--agent and --agent-brief imply --json --no-tree and expose agent.handoff for the next executor step.");
  });

  it("fetches a URL and prints the text tree by default", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test"], {
      stdout,
      fetch: async () => new Response(`
        <html lang="en" dir="ltr">
          <head><title>Example page</title><meta name="description" content="Useful description"></head>
          <body><main><h1>Example</h1><button>Run</button><a href="/docs">Docs</a></main></body>
        </html>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("links\n  1. Docs <https://example.test/docs>");
    expect(stdout.output).toContain("page\n  title: Example page\n  description: Useful description\n  lang: en");
    expect(stdout.output).toContain("  dir: ltr");
    expect(stdout.output).toContain("analysis\n  kind: page");
    expect(stdout.output).toContain("outline\n  1. h1 Example");
    expect(stdout.output).toContain("actions\n  1. button Run");
    expect(stdout.output).toContain("main");
    expect(stdout.output).toContain("heading 'Example'");
    expect(stdout.output).toContain("[i] link 'Docs' <https://example.test/docs>");
  });

  it("prints disabled state for the top interactive target in text output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <button aria-disabled="true" aria-pressed="false">Archive</button>
        </main>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("semanticTopInteractive: agent.semanticSummary.interactiveRoles[0] button:Archive");
    expect(stdout.output).toContain("disabled=true");
    expect(stdout.output).toContain("pressed=false");
  });

  it("prints top accessibility state scalars in text output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <input id="q" type="search" aria-label="Archive search" disabled required readonly aria-invalid="spelling" aria-haspopup="listbox" aria-controls="suggestions">
          <div id="suggestions" role="listbox"></div>
        </main>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("semanticTopState: agent.semanticSummary.stateItems[0] searchbox:Archive search");
    expect(stdout.output).toContain("disabled=true");
    expect(stdout.output).toContain("required=true");
    expect(stdout.output).toContain("readonly=true");
    expect(stdout.output).toContain("invalid=spelling");
    expect(stdout.output).toContain("haspopup=listbox");
    expect(stdout.output).toContain("controls=suggestions");
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
        <html lang="ko" dir="rtl">
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
      dir: "rtl",
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
      fetch: async () => new Response(`
        <html dir="ltr">
          <head>
            <title>Example</title>
            <meta name="description" content="Example description">
            <meta property="og:site_name" content="Example Site">
            <meta name="author" content="Example Author">
            <link rel="author" href="/authors/reporter" title="Reporter Profile">
            <meta property="article:published_time" content="2026-03-04T05:06:07Z">
            <meta property="article:modified_time" content="2026-03-05T06:07:08Z">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "NewsArticle",
                "headline": "Example",
                "author": {"@type": "Person", "name": "Structured Author", "url": "https://profiles.example/structured-author"},
                "datePublished": "2026-03-04T05:06:07Z",
                "dateModified": "2026-03-05T06:07:08Z"
              }
            </script>
          </head>
          <body>
            <main>
              <h1 id="content" aria-roledescription="article title">Example</h1>
              <p id="toggle-desc">Shows extra context</p>
              <button type="submit" formaction="/details" formmethod="post" formtarget="_blank" formenctype="multipart/form-data" formnovalidate form="details-form" aria-roledescription="disclosure toggle" aria-pressed="false" aria-haspopup="dialog" aria-valuetext="details off" aria-describedby="toggle-desc" aria-controls="details-panel">Toggle details</button>
              <a href="#content" class="skip-link" target="_self" rel="bookmark" type="text/html" hreflang="en" aria-current="location" download="content.html">Skip to content</a>
              <section id="details-panel" aria-label="Details panel">Extra details</section>
              <img src="/hero.png" srcset="/hero.png 1x, /hero@2x.png 2x" sizes="(min-width: 800px) 720px, 100vw" width="720" height="360" loading="lazy" decoding="async" alt="Hero chart">
              <p class="byline">By <a href="/authors/reporter">Reporter Profile</a></p>
              <p>Example content for agent routing.</p>
              <table aria-label="Metrics" aria-rowcount="100" aria-colcount="4" aria-owns="owned-rows">
                <thead>
                  <tr aria-rowindex="1"><th id="metric-header" aria-colindex="1" aria-sort="ascending">Metric</th><th id="value-header" aria-colindex="2">Value</th></tr>
                </thead>
                <tbody>
                  <tr aria-rowindex="2"><th id="latency-row" scope="row" aria-colindex="1" rowspan="2" headers="metric-header">Latency</th><td aria-colindex="2" rowspan="2" colspan="2" headers="latency-row value-header" aria-selected="true" aria-current="page">120 ms</td></tr>
                </tbody>
              </table>
              <div id="owned-rows" role="rowgroup" aria-label="Virtual rows">
                <div role="row" aria-rowindex="50"><span role="rowheader" aria-colindex="1">Virtual metric</span><span role="gridcell" aria-colindex="4" headers="value-header">Queued</span></div>
              </div>
              <ul aria-label="Highlights">
                <li>Fast setup</li>
                <li>Clear output</li>
              </ul>
              <a href="https://target.example/">Target</a>
            </main>
          </body>
        </html>
      `, {
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
      page: {
        description: "Example description",
        dir: "ltr",
        siteName: "Example Site",
        author: "Example Author",
        publishedTime: "2026-03-04T05:06:07Z",
        modifiedTime: "2026-03-05T06:07:08Z",
        structuredDataTypes: ["NewsArticle"],
      },
      agent: {
        contract: {
          version: 1,
          compact: true,
          featureCount: expect.any(Number),
        },
        status: "ready",
        pageDir: "ltr",
        semanticSummary: {
          nodeCount: expect.any(Number),
          namedRoleCount: expect.any(Number),
          interactiveCount: 4,
          focusableCount: 4,
          headingCount: 1,
          landmarkCount: 2,
          linkCount: 3,
          buttonCount: 1,
          imageCount: 1,
          tableCount: 1,
          listCount: 1,
          descriptionCount: 1,
          valueCount: 1,
          relationCount: 2,
          topRoles: expect.arrayContaining([
            expect.objectContaining({ role: "p", count: 3 }),
            expect.objectContaining({ role: "link", count: 3 }),
          ]),
          landmarks: expect.arrayContaining(["main"]),
          headings: ["Example"],
          namedRoles: expect.arrayContaining(["heading:Example", "button:Toggle details", "link:Skip to content", "region:Details panel"]),
          semanticOutline: expect.arrayContaining([
            expect.objectContaining({
              path: "agent.semanticSummary.semanticOutline[0]",
              kind: "landmark",
              role: "main",
              text: "main",
              depth: expect.any(Number),
              selector: "main",
            }),
            expect.objectContaining({
              path: "agent.semanticSummary.semanticOutline[1]",
              kind: "heading",
              role: "heading",
              text: "Example",
              level: 1,
              depth: expect.any(Number),
              parentPath: "agent.semanticSummary.semanticOutline[0]",
              parentRole: "main",
              parentName: "main",
              selector: "#content",
            }),
          ]),
          headingItems: [
            expect.objectContaining({
              path: "agent.semanticSummary.headingItems[0]",
              text: "Example",
              level: 1,
            }),
          ],
          landmarkItems: expect.arrayContaining([
            expect.objectContaining({
              path: "agent.semanticSummary.landmarkItems[0]",
              role: "main",
            }),
            expect.objectContaining({
              path: "agent.semanticSummary.landmarkItems[1]",
              role: "region",
              name: "Details panel",
              selector: "#details-panel",
            }),
          ]),
          namedRoleItems: expect.arrayContaining([
            expect.objectContaining({
              path: "agent.semanticSummary.namedRoleItems[0]",
              role: "heading",
              name: "Example",
              roleDescription: "article title",
            }),
          ]),
          focusableItems: expect.arrayContaining([
            expect.objectContaining({
              path: "agent.semanticSummary.focusableItems[0]",
              role: "button",
              name: "Toggle details",
              roleDescription: "disclosure toggle",
              selector: "button",
              state: expect.objectContaining({ pressed: false }),
            }),
            expect.objectContaining({
              path: "agent.semanticSummary.focusableItems[1]",
              role: "link",
              name: "Skip to content",
              selector: "a",
            }),
            expect.objectContaining({
              role: "link",
              name: "Reporter Profile",
            }),
          ]),
          links: [
            expect.objectContaining({
              path: "agent.semanticSummary.links[0]",
              name: "Skip to content",
              url: "https://example.test/#content",
              target: "_self",
              rel: ["bookmark"],
              type: "text/html",
              hreflang: "en",
              state: "current=location",
              current: "location",
              download: "content.html",
              selector: "a",
            }),
            expect.objectContaining({
              name: "Reporter Profile",
            }),
            expect.objectContaining({
              name: "Target",
            }),
          ],
          inPageLinks: [
            {
              path: "agent.semanticSummary.inPageLinks[0]",
              kind: "skip",
              name: "Skip to content",
              url: "https://example.test/#content",
              targetId: "content",
              selector: "a",
            },
          ],
          imageItems: [
            expect.objectContaining({
              path: "agent.semanticSummary.imageItems[0]",
              name: "Hero chart",
              url: "https://example.test/hero.png",
              width: 720,
              height: 360,
              loading: "lazy",
              decoding: "async",
              srcset: "/hero.png 1x, /hero@2x.png 2x",
              sizes: "(min-width: 800px) 720px, 100vw",
              selector: "img",
            }),
          ],
          tableItems: [
            expect.objectContaining({
              path: "agent.semanticSummary.tableItems[0]",
              role: "table",
              name: "Metrics",
              rowCount: 3,
              cellCount: 6,
              declaredRowCount: 100,
              declaredColumnCount: 4,
              headers: ["Metric", "Value", "Latency", "Virtual metric"],
              headerRefs: [
                { path: "agent.semanticSummary.tableItems[0].headerRefs[0]", text: "Metric", role: "columnheader", rowIndex: 1, columnIndex: 1, sort: "ascending", selector: "#metric-header" },
                { path: "agent.semanticSummary.tableItems[0].headerRefs[1]", text: "Value", role: "columnheader", rowIndex: 1, columnIndex: 2, selector: "#value-header" },
                { path: "agent.semanticSummary.tableItems[0].headerRefs[2]", text: "Latency", role: "rowheader", rowIndex: 2, columnIndex: 1, selector: "#latency-row" },
                { path: "agent.semanticSummary.tableItems[0].headerRefs[3]", text: "Virtual metric", role: "rowheader", rowIndex: 50, columnIndex: 1, selector: "span" },
              ],
              ownedRefs: [
                { target: "owned-rows", role: "rowgroup", name: "Virtual rows", selector: "#owned-rows" },
              ],
              sampleCells: ["120 ms", "Queued"],
              sampleCellRefs: [
                { path: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]", text: "120 ms", rowIndex: 2, columnIndex: 2, rowSpan: 2, columnSpan: 2, headers: ["Latency", "Value"], rowHeaders: ["Latency"], columnHeaders: ["Value"], selected: true, current: "page", selector: "td" },
                { path: "agent.semanticSummary.tableItems[0].sampleCellRefs[1]", text: "Queued", rowIndex: 50, columnIndex: 4, headers: ["Value"], columnHeaders: ["Value"], selector: "span:nth-of-type(2)", ownedTarget: "owned-rows" },
              ],
              selector: "table",
            }),
          ],
          listItems: [
            expect.objectContaining({
              path: "agent.semanticSummary.listItems[0]",
              role: "list",
              name: "Highlights",
              itemCount: 2,
              sampleItems: ["Fast setup", "Clear output"],
              selector: "ul",
            }),
          ],
          descriptionItems: [
            expect.objectContaining({
              path: "agent.semanticSummary.descriptionItems[0]",
              role: "button",
              name: "Toggle details",
              description: "Shows extra context",
              selector: "button",
            }),
          ],
          valueItems: [
            expect.objectContaining({
              path: "agent.semanticSummary.valueItems[0]",
              role: "button",
              name: "Toggle details",
              value: "details off",
              selector: "button",
            }),
          ],
          relationItems: [
            expect.objectContaining({
              path: "agent.semanticSummary.relationItems[0]",
              role: "button",
              name: "Toggle details",
              relation: "controls",
              target: "details-panel",
              targetRole: "region",
              targetName: "Details panel",
              targetSelector: "#details-panel",
              selector: "button",
            }),
            expect.objectContaining({
              path: "agent.semanticSummary.relationItems[1]",
              role: "table",
              name: "Metrics",
              relation: "owns",
              target: "owned-rows",
              targetRole: "rowgroup",
              targetName: "Virtual rows",
              targetSelector: "#owned-rows",
              selector: "table",
            }),
          ],
          buttons: [
            expect.objectContaining({
              path: "agent.semanticSummary.buttons[0]",
              name: "Toggle details",
              roleDescription: "disclosure toggle",
              description: "Shows extra context",
              type: "submit",
              state: "pressed=false haspopup=dialog controls=details-panel valueText=details off",
              disabled: false,
              pressed: false,
              haspopup: "dialog",
              controls: "details-panel",
              formAction: "https://example.test/details",
              formMethod: "post",
              formTarget: "_blank",
              formEncType: "multipart/form-data",
              formNoValidate: true,
              formId: "details-form",
              selector: "button",
            }),
          ],
        },
        semanticNodeCount: expect.any(Number),
        semanticNamedRoleCount: expect.any(Number),
        semanticInteractiveCount: 4,
        semanticFocusableCount: 4,
        semanticHeadingCount: 1,
        semanticLandmarkCount: 2,
        semanticLinkCount: 3,
        semanticButtonCount: 1,
        semanticImageCount: 1,
        semanticTableCount: 1,
        semanticListCount: 1,
        semanticDescriptionCount: 1,
        semanticValueCount: 1,
        semanticRelationCount: 2,
        semanticTopRole: "link",
        semanticTopRoleCount: 3,
        semanticOutlineCount: 3,
        semanticTopOutlinePath: "agent.semanticSummary.semanticOutline[0]",
        semanticTopOutlineKind: "landmark",
        semanticTopOutlineRole: "main",
        semanticTopOutlineText: "main",
        semanticTopOutlineDepth: expect.any(Number),
        semanticTopOutlineSelector: "main",
        semanticTopHeading: "Example",
        semanticTopHeadingPath: "agent.semanticSummary.headingItems[0]",
        semanticTopHeadingLevel: 1,
        semanticTopLandmark: "main",
        semanticTopLandmarkPath: "agent.semanticSummary.landmarkItems[0]",
        semanticTopLandmarkRole: "main",
        semanticTopNamedRole: "heading:Example",
        semanticTopNamedRolePath: "agent.semanticSummary.namedRoleItems[0]",
        semanticTopNamedRoleRole: "heading",
        semanticTopNamedRoleName: "Example",
        semanticTopNamedRoleDescription: "article title",
        semanticTopInteractiveRole: "button",
        semanticTopInteractivePath: "agent.semanticSummary.interactiveRoles[0]",
        semanticTopInteractiveName: "Toggle details",
        semanticTopInteractiveRoleDescription: "disclosure toggle",
        semanticTopInteractiveDescription: "Shows extra context",
        semanticTopInteractiveValue: "details off",
        semanticTopInteractiveState: "pressed=false haspopup=dialog controls=details-panel valueText=details off",
        semanticTopInteractivePressed: false,
        semanticTopInteractiveHaspopup: "dialog",
        semanticTopInteractiveControls: "details-panel",
        semanticTopStatePressed: false,
        semanticTopStateHaspopup: "dialog",
        semanticTopStateControls: "details-panel",
        semanticTopStateValueText: "details off",
        semanticTopFocusableRole: "button",
        semanticTopFocusablePath: "agent.semanticSummary.focusableItems[0]",
        semanticTopFocusableName: "Toggle details",
        semanticTopFocusableRoleDescription: "disclosure toggle",
        semanticTopFocusableState: "pressed=false haspopup=dialog controls=details-panel valueText=details off",
        semanticTopFocusablePressed: false,
        semanticTopFocusableHaspopup: "dialog",
        semanticTopFocusableControls: "details-panel",
        semanticTopFocusableSelector: "button",
        semanticTopLinkPath: "agent.semanticSummary.links[0]",
        semanticTopLinkUrl: "https://example.test/#content",
        semanticTopLinkTarget: "_self",
        semanticTopLinkRel: ["bookmark"],
        semanticTopLinkType: "text/html",
        semanticTopLinkHreflang: "en",
        semanticTopLinkState: "current=location",
        semanticTopLinkCurrent: "location",
        semanticTopLinkDownload: "content.html",
        semanticTopLinkSelector: "a",
        semanticInPageLinkCount: 1,
        semanticTopInPageLinkPath: "agent.semanticSummary.inPageLinks[0]",
        semanticTopInPageLinkKind: "skip",
        semanticTopInPageLinkName: "Skip to content",
        semanticTopInPageLinkUrl: "https://example.test/#content",
        semanticTopInPageLinkTargetId: "content",
        semanticTopInPageLinkSelector: "a",
        semanticTopButtonName: "Toggle details",
        semanticTopButtonPath: "agent.semanticSummary.buttons[0]",
        semanticTopButtonRoleDescription: "disclosure toggle",
        semanticTopButtonDescription: "Shows extra context",
        semanticTopButtonType: "submit",
        semanticTopButtonState: "pressed=false haspopup=dialog controls=details-panel valueText=details off",
        semanticTopButtonDisabled: false,
        semanticTopButtonPressed: false,
        semanticTopButtonHaspopup: "dialog",
        semanticTopButtonControls: "details-panel",
        semanticTopButtonFormAction: "https://example.test/details",
        semanticTopButtonFormMethod: "post",
        semanticTopButtonFormTarget: "_blank",
        semanticTopButtonFormEncType: "multipart/form-data",
        semanticTopButtonFormNoValidate: true,
        semanticTopButtonFormId: "details-form",
        semanticTopImagePath: "agent.semanticSummary.imageItems[0]",
        semanticTopImageName: "Hero chart",
        semanticTopImageUrl: "https://example.test/hero.png",
        semanticTopImageWidth: 720,
        semanticTopImageHeight: 360,
        semanticTopImageLoading: "lazy",
        semanticTopImageDecoding: "async",
        semanticTopImageSrcset: "/hero.png 1x, /hero@2x.png 2x",
        semanticTopImageSizes: "(min-width: 800px) 720px, 100vw",
        semanticTopImageSelector: "img",
        semanticTopTableRole: "table",
        semanticTopTablePath: "agent.semanticSummary.tableItems[0]",
        semanticTopTableName: "Metrics",
        semanticTopTableRowCount: 3,
        semanticTopTableColumnCount: 4,
        semanticTopTableCellCount: 6,
        semanticTopTableDeclaredRowCount: 100,
        semanticTopTableDeclaredColumnCount: 4,
        semanticTopTableHeaders: ["Metric", "Value", "Latency", "Virtual metric"],
        semanticTopTableHeaderRefs: [
          { path: "agent.semanticSummary.tableItems[0].headerRefs[0]", text: "Metric", role: "columnheader", rowIndex: 1, columnIndex: 1, sort: "ascending", selector: "#metric-header" },
          { path: "agent.semanticSummary.tableItems[0].headerRefs[1]", text: "Value", role: "columnheader", rowIndex: 1, columnIndex: 2, selector: "#value-header" },
          { path: "agent.semanticSummary.tableItems[0].headerRefs[2]", text: "Latency", role: "rowheader", rowIndex: 2, columnIndex: 1, selector: "#latency-row" },
          { path: "agent.semanticSummary.tableItems[0].headerRefs[3]", text: "Virtual metric", role: "rowheader", rowIndex: 50, columnIndex: 1, selector: "span" },
        ],
        semanticTopTableOwnedCount: 1,
        semanticTopTableOwnedRefs: [
          { target: "owned-rows", role: "rowgroup", name: "Virtual rows", selector: "#owned-rows" },
        ],
        semanticTopTableSampleCells: ["120 ms", "Queued"],
        semanticTopTableSampleCellRefs: [
          { path: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]", text: "120 ms", rowIndex: 2, columnIndex: 2, rowSpan: 2, columnSpan: 2, headers: ["Latency", "Value"], rowHeaders: ["Latency"], columnHeaders: ["Value"], selected: true, current: "page", selector: "td" },
          { path: "agent.semanticSummary.tableItems[0].sampleCellRefs[1]", text: "Queued", rowIndex: 50, columnIndex: 4, headers: ["Value"], columnHeaders: ["Value"], selector: "span:nth-of-type(2)", ownedTarget: "owned-rows" },
        ],
        semanticTopTableFirstHeader: "Metric",
        semanticTopTableFirstHeaderPath: "agent.semanticSummary.tableItems[0].headerRefs[0]",
        semanticTopTableFirstHeaderRole: "columnheader",
        semanticTopTableFirstHeaderRowIndex: 1,
        semanticTopTableFirstHeaderColumnIndex: 1,
        semanticTopTableFirstHeaderSort: "ascending",
        semanticTopTableFirstHeaderSelector: "#metric-header",
        semanticTopTableFirstOwnedTarget: "owned-rows",
        semanticTopTableFirstOwnedRole: "rowgroup",
        semanticTopTableFirstOwnedName: "Virtual rows",
        semanticTopTableFirstOwnedSelector: "#owned-rows",
        semanticTopTableFirstSampleCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]",
        semanticTopTableFirstSampleCellText: "120 ms",
        semanticTopTableFirstSampleCellRowIndex: 2,
        semanticTopTableFirstSampleCellColumnIndex: 2,
        semanticTopTableFirstSampleCellRowSpan: 2,
        semanticTopTableFirstSampleCellColumnSpan: 2,
        semanticTopTableFirstSampleCellHeaders: ["Latency", "Value"],
        semanticTopTableFirstSampleCellRowHeaders: ["Latency"],
        semanticTopTableFirstSampleCellColumnHeaders: ["Value"],
        semanticTopTableFirstSampleCellSelected: true,
        semanticTopTableFirstSampleCellCurrent: "page",
        semanticTopTableFirstSampleCellSelector: "td",
        semanticTopTableFirstOwnedSampleCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[1]",
        semanticTopTableFirstOwnedSampleCellText: "Queued",
        semanticTopTableFirstOwnedSampleCellRowIndex: 50,
        semanticTopTableFirstOwnedSampleCellColumnIndex: 4,
        semanticTopTableFirstOwnedSampleCellHeaders: ["Value"],
        semanticTopTableFirstOwnedSampleCellColumnHeaders: ["Value"],
        semanticTopTableFirstOwnedSampleCellSelector: "span:nth-of-type(2)",
        semanticTopTableFirstOwnedSampleCellOwnedTarget: "owned-rows",
        semanticTopSelectedTableCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]",
        semanticTopSelectedTableCellText: "120 ms",
        semanticTopSelectedTableCellRowIndex: 2,
        semanticTopSelectedTableCellColumnIndex: 2,
        semanticTopSelectedTableCellRowSpan: 2,
        semanticTopSelectedTableCellColumnSpan: 2,
        semanticTopSelectedTableCellHeaders: ["Latency", "Value"],
        semanticTopSelectedTableCellRowHeaders: ["Latency"],
        semanticTopSelectedTableCellColumnHeaders: ["Value"],
        semanticTopSelectedTableCellSelected: true,
        semanticTopSelectedTableCellCurrent: "page",
        semanticTopSelectedTableCellSelector: "td",
        semanticTopTableSelector: "table",
        semanticTopListRole: "list",
        semanticTopListPath: "agent.semanticSummary.listItems[0]",
        semanticTopListName: "Highlights",
        semanticTopListItemCount: 2,
        semanticTopListItems: ["Fast setup", "Clear output"],
        semanticTopListFirstItemText: "Fast setup",
        semanticTopListFirstItemRole: "listitem",
        semanticTopListFirstItemSelector: "li",
        semanticTopListSelector: "ul",
        semanticTopDescriptionRole: "button",
        semanticTopDescriptionPath: "agent.semanticSummary.descriptionItems[0]",
        semanticTopDescriptionName: "Toggle details",
        semanticTopDescriptionText: "Shows extra context",
        semanticTopDescriptionSelector: "button",
        semanticTopValueRole: "button",
        semanticTopValuePath: "agent.semanticSummary.valueItems[0]",
        semanticTopValueName: "Toggle details",
        semanticTopValue: "details off",
        semanticTopValueSelector: "button",
        semanticTopRelationRole: "button",
        semanticTopRelationPath: "agent.semanticSummary.relationItems[0]",
        semanticTopRelationName: "Toggle details",
        semanticTopRelation: "controls",
        semanticTopRelationTarget: "details-panel",
        semanticTopRelationTargetRole: "region",
        semanticTopRelationTargetName: "Details panel",
        semanticTopRelationTargetSelector: "#details-panel",
        semanticTopRelationSelector: "button",
        routingIntent: "read-current",
        continuationMode: "read",
        next: {
          mode: "read",
          action: "use-evidence",
          execution: "read-current",
          priority: "high",
          priorityReason: "Confirmed evidence can be returned from the current payload.",
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
              field: "title",
              text: "Example",
            }),
          },
        },
        runbook: {
          decision: "return",
          mode: "read",
          operation: "return",
          action: "use-evidence",
          answerStatus: "ready",
          answerReady: true,
          shouldContinue: false,
          terminal: true,
          maxSuggestedIterations: 0,
          useFetchedHtml: true,
          needsBrowserHtml: false,
          expectedOutcome: "read-evidence",
          readFrom: "verification.bestEvidence",
          readValue: {
            path: "verification.bestEvidence",
            value: expect.objectContaining({
              field: "title",
              text: "Example",
            }),
          },
        },
        executor: {
          instruction: "Answer now from verification.bestEvidence using citations v1, e1.",
          decision: "return",
          mode: "read",
          operation: "return",
          action: "use-evidence",
          status: "ready",
          answerReady: true,
          shouldContinue: false,
          terminal: true,
          maxSuggestedIterations: 0,
          expectedOutcome: "read-evidence",
          readFrom: "verification.bestEvidence",
          readTarget: {
            path: "verification.bestEvidence",
            reason: "Best matching evidence for the requested --find text.",
            count: 1,
            primary: true,
          },
          readValue: {
            path: "verification.bestEvidence",
            value: expect.objectContaining({
              field: "title",
              text: "Example",
            }),
          },
          useCitationIds: expect.arrayContaining(["v1"]),
        },
        handoff: {
          instruction: "Answer now from verification.bestEvidence using citations v1, e1.",
          decision: "return",
          mode: "read",
          operation: "return",
          action: "use-evidence",
          confidence: "high",
          priority: "high",
          answerStatus: "ready",
          answerReady: true,
          shouldContinue: false,
          terminal: true,
          maxSuggestedIterations: 0,
          expectedOutcome: "read-evidence",
          readTarget: {
            path: "verification.bestEvidence",
            reason: "Best matching evidence for the requested --find text.",
            count: 1,
            primary: true,
          },
          readFrom: "verification.bestEvidence",
          readValue: {
            path: "verification.bestEvidence",
            value: expect.objectContaining({
              field: "title",
              text: "Example",
            }),
          },
          useCitationIds: expect.arrayContaining(["v1"]),
          answerEvidence: expect.arrayContaining([
            expect.objectContaining({
              id: "v1",
              path: "verification.bestEvidence",
              kind: "verification",
              text: "Example",
              reason: "Best matching evidence for the requested verification text.",
            }),
          ]),
          signals: expect.arrayContaining([
            expect.objectContaining({ kind: "content", severity: "info" }),
            expect.objectContaining({ kind: "verification", severity: "info" }),
          ]),
          qualityGates: expect.arrayContaining([
            expect.objectContaining({
              kind: "verification",
              pass: true,
              path: "verification.bestEvidence",
            }),
          ]),
          sourceChoices: [
            expect.objectContaining({
              id: "s1",
              path: "pageCheck.sourceLinks[0]",
              title: "Target",
              url: "https://target.example/",
              host: "target.example",
              text: "Target",
              kind: "external",
              selector: expect.any(String),
              selectionReason: expect.any(String),
              commandArgs: ["ax-grep", "https://target.example/", "--find", "Example", "--agent"],
            }),
          ],
        },
        expectedOutcome: {
          kind: "read-evidence",
          message: expect.stringContaining("verification.bestEvidence"),
        },
        executionPlan: {
          operation: "return",
          confidence: "high",
          useFetchedHtml: true,
          needsBrowserHtml: false,
          answerReady: true,
          terminal: true,
          shouldContinue: false,
          maxSuggestedIterations: 0,
          expectedOutcome: "read-evidence",
          readFrom: "verification.bestEvidence",
          url: "https://example.test",
        },
        answerPlan: {
          status: "ready",
          confidence: "high",
          gaps: [],
          useCitationIds: expect.arrayContaining(["v1"]),
          nextAction: "use-evidence",
          url: "https://example.test",
          readFrom: "verification.bestEvidence",
        },
        answerEvidence: expect.arrayContaining([
          expect.objectContaining({
            id: "v1",
            path: "verification.bestEvidence",
            text: "Example",
          }),
        ]),
        pageDecision: {
          decision: "read-content",
          confidence: "high",
          readFrom: "pageCheck.contentEvidence",
          readability: "high",
          evidenceCount: 1,
          sourceLinkCount: 1,
        },
        pageDecisionName: "read-content",
        pageDecisionConfidence: "high",
        pageDecisionReadability: "high",
        pageDecisionReadabilityScore: expect.any(Number),
        pageDecisionEvidenceCount: 1,
        pageDecisionEvidenceQualityScore: expect.any(Number),
        pageDecisionSourceLinkCount: 1,
        pageDecisionSourceQualityScore: expect.any(Number),
        pageDecisionReadFrom: "pageCheck.contentEvidence",
        pageDecisionReadTargetKind: "evidence",
        pageDecisionReadTargetCount: expect.any(Number),
        pageDecisionReadTargetScore: expect.any(Number),
        pageDecisionReadTargetReason: expect.any(String),
        signals: expect.arrayContaining([
          expect.objectContaining({ kind: "content", severity: "info" }),
          expect.objectContaining({ kind: "verification", severity: "info" }),
        ]),
        qualityGates: expect.arrayContaining([
          expect.objectContaining({
            kind: "fetch",
            pass: true,
            severity: "info",
            path: "agent.responseStatus",
          }),
          expect.objectContaining({
            kind: "verification",
            pass: true,
            severity: "info",
            path: "verification.bestEvidence",
          }),
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
        sourceChoices: [
          expect.objectContaining({
            id: "s1",
            path: "pageCheck.sourceLinks[0]",
            title: "Target",
            url: "https://target.example/",
            host: "target.example",
            text: "Target",
            kind: "external",
            selector: expect.any(String),
            selectionReason: expect.any(String),
            command: "ax-grep 'https://target.example/' --find 'Example' --agent",
            commandArgs: ["ax-grep", "https://target.example/", "--find", "Example", "--agent"],
          }),
        ],
        readabilityScore: expect.any(Number),
        bestReadTarget: "verification.bestEvidence",
        bestReadTargetCount: 1,
        bestReadTargetPrimary: true,
        bestReadTargetReason: "Best matching evidence for the requested --find text.",
        diagnosticErrorCount: 0,
        diagnosticWarningCount: 0,
        diagnosticInfoCount: 0,
        citations: expect.arrayContaining([
          expect.objectContaining({
            kind: "verification",
            id: "v1",
            path: "verification.bestEvidence",
            confidence: "high",
            reason: "Best matching evidence for the requested verification text.",
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
        actions: [
          expect.objectContaining({
            action: "use-evidence",
            source: "agent.primaryAction",
            primary: true,
            priority: "high",
          }),
        ],
      },
      verification: {
        status: "matched",
        requestedCount: 1,
        foundCount: 1,
      },
      pageCheck: {
        mainHeading: "Example",
        siteName: "Example Site",
        author: "Example Author",
        publishedTime: "2026-03-04T05:06:07Z",
        modifiedTime: "2026-03-05T06:07:08Z",
        structuredDataTypes: ["NewsArticle"],
        authorLinks: [
          expect.objectContaining({
            id: "au1",
            path: "pageCheck.authorLinks[0]",
            name: "Structured Author",
            url: "https://profiles.example/structured-author",
            source: "json-ld",
          }),
          expect.objectContaining({
            name: "Reporter Profile",
            url: "https://example.test/authors/reporter",
          }),
        ],
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      execution: "read-current",
      priority: "high",
      priorityReason: "Confirmed evidence can be returned from the current payload.",
      url: "https://example.test",
      terminal: true,
      readFrom: "verification.bestEvidence",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "verification.bestEvidence",
      count: 1,
      primary: true,
    }));
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.dataTables",
      count: 1,
    }));
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "agent.semanticSummary",
      count: envelope.agent.semanticSummary.namedRoleCount,
      reason: "Compact semantic tree overview with role counts, top roles, landmarks, headings, and named role samples.",
    }));
    expect(envelope.agent.semanticNamedRoleCount).toBe(envelope.agent.semanticSummary.namedRoleCount);
    expect(envelope.agent.semanticTopHeading).toBe(envelope.agent.semanticSummary.headings[0]);
    expect(envelope.agent.semanticTopHeadingPath).toBe(envelope.agent.semanticSummary.headingItems[0].path);
    expect(envelope.agent.semanticTopLandmarkPath).toBe(envelope.agent.semanticSummary.landmarkItems[0].path);
    expect(envelope.agent.semanticTopNamedRolePath).toBe(envelope.agent.semanticSummary.namedRoleItems[0].path);
    expect(envelope.agent.semanticTopOutlineParentPath).toBeUndefined();
    expect(envelope.agent.semanticTopOutlineParentRole).toBeUndefined();
    expect(envelope.agent.next.readTarget).toEqual(
      expect.objectContaining({
        path: "verification.bestEvidence",
        reason: "Best matching evidence for the requested --find text.",
      }),
    );
    expect(envelope.agent.next.readValue).toEqual({
      path: "verification.bestEvidence",
      value: expect.objectContaining({
        field: "title",
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

  it("can print a smaller brief agent JSON envelope", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test", "--agent-brief", "--find", "missing claim"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>Example</title></head>
          <body>
            <main>
              <h1>Example</h1>
              <p>Thin page.</p>
              <a href="https://source.example/report">Source report</a>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(stdout.output).not.toContain("--agent-brief-brief");
    expect(envelope.agent).toMatchObject({
      contract: {
        version: 1,
        compact: true,
        profile: "brief",
        featureCount: expect.any(Number),
      },
      status: "verify",
      executor: {
        instruction: "Run ax-grep 'https://source.example/report' --find 'missing claim' --agent-brief and continue with its output.",
        decision: "execute",
        mode: "command",
        operation: "execute-command",
        action: "open-source-link",
        status: "needs-more",
        shouldContinue: true,
        terminal: false,
        commandArgs: ["ax-grep", "https://source.example/report", "--find", "missing claim", "--agent-brief"],
      },
      handoff: {
        instruction: "Run ax-grep 'https://source.example/report' --find 'missing claim' --agent-brief and continue with its output.",
        decision: "execute",
        mode: "command",
        maxSuggestedIterations: 1,
        priority: "medium",
        priorityReason: "External source-like link can improve verification.",
        reason: "Run the provided command and inspect the next agent payload.",
        commandArgs: ["ax-grep", "https://source.example/report", "--find", "missing claim", "--agent-brief"],
        target: {
          title: "Source report",
          url: "https://source.example/report",
          path: "pageCheck.sourceLinks[0]",
          text: "Source report",
          source: "source.example",
          rank: 1,
          selector: expect.any(String),
        },
      },
      primaryAction: {
        commandArgs: ["ax-grep", "https://source.example/report", "--find", "missing claim", "--agent-brief"],
      },
    });
    expect(envelope.agent.next).toBeUndefined();
    expect(envelope.agent.runbook).toBeUndefined();
    expect(envelope.agent.executionPlan).toBeUndefined();
    expect(envelope.agent.actions).toBeUndefined();
    expect(envelope.pageCheck.nextSteps).toBeUndefined();
    expect(envelope.tree).toBeUndefined();
    expect(envelope.links).toBeUndefined();
    expect(envelope.results).toBeUndefined();
  });

  it("keeps brief handoff aligned with executor for common agent actions", async () => {
    const cases = [
      {
        args: ["--search", "agent browser", "--engine", "bing", "--agent-brief"],
        html: `
          <main>
            <ol>
              <li class="b_algo">
                <h2><a href="https://result.example/">Agent browser result</a></h2>
                <p>agent browser comparison details</p>
              </li>
            </ol>
          </main>
        `,
      },
      {
        args: ["https://example.test", "--agent-brief", "--find", "missing claim"],
        html: `
          <main>
            <h1>Example</h1>
            <p>Thin page.</p>
            <a href="https://source.example/report">Source report</a>
            <a href="https://source.example/backup">Backup source</a>
          </main>
        `,
      },
      {
        args: ["https://example.test/search", "--agent-brief", "--find", "target report"],
        html: `
          <main>
            <form method="GET" action="/find">
              <input name="query" type="search" aria-label="Archive search">
              <button>Search</button>
            </form>
          </main>
        `,
      },
      {
        args: ["https://example.test", "--agent-brief", "--find", "Example"],
        html: `
          <main>
            <h1>Example</h1>
            <p>Enough readable content Example to answer directly from the page with confidence.</p>
          </main>
        `,
      },
      {
        args: ["https://blocked.example/app", "--agent-brief"],
        html: "",
      },
    ];

    for (const item of cases) {
      const stdout = new MemoryWriter();
      await runCli(item.args, {
        stdout,
        fetch: async () => new Response(item.html, { headers: { "content-type": "text/html" } }),
      });
      const envelope = JSON.parse(stdout.output);
      const executor = envelope.agent.executor;
      const handoff = envelope.agent.handoff;

      expect(stdout.output).not.toContain("--agent-brief-brief");
      expect(envelope.agent.contract.profile).toBe("brief");
      expect(envelope.agent.routingIntent).toEqual(expect.any(String));
      expect(envelope.agent.continuationMode).toEqual(expect.any(String));
      expect(handoff).toMatchObject({
        decision: executor.decision,
        mode: executor.mode,
        operation: executor.operation,
        action: executor.action,
        answerReady: executor.answerReady,
        shouldContinue: executor.shouldContinue,
        terminal: executor.terminal,
        maxSuggestedIterations: executor.maxSuggestedIterations,
        expectedOutcome: executor.expectedOutcome,
      });
      expect(handoff.answerStatus).toBe(executor.status);
      expect(envelope.agent.runbookDecision).toBe(executor.decision);
      expect(envelope.agent.runbookMode).toBe(executor.mode);
      expect(envelope.agent.runbookOperation).toBe(executor.operation);
      expect(envelope.agent.runbookActionName).toBe(executor.action);
      expect(envelope.agent.runbookConfidence).toBe(executor.confidence);
      expect(envelope.agent.runbookReason).toEqual(expect.any(String));
      expect(envelope.agent.runbookAnswerStatus).toBe(executor.status);
      expect(envelope.agent.runbookAnswerReady).toBe(executor.answerReady);
      expect(envelope.agent.runbookShouldContinue).toBe(executor.shouldContinue);
      expect(envelope.agent.runbookTerminal).toBe(executor.terminal);
      expect(envelope.agent.runbookMaxSuggestedIterations).toBe(executor.maxSuggestedIterations);
      expect(envelope.agent.runbookExpectedOutcome).toBe(executor.expectedOutcome);
      if (executor.commandArgs) expect(envelope.agent.runbookCommandArgs).toEqual(executor.commandArgs);
      if (executor.readFrom) expect(envelope.agent.runbookReadFrom).toBe(executor.readFrom);
      if (executor.readTarget?.kind) expect(envelope.agent.runbookReadTargetKind).toBe(executor.readTarget.kind);
      if (typeof executor.readTarget?.count === "number") expect(envelope.agent.runbookReadTargetCount).toBe(executor.readTarget.count);
      if (typeof executor.readTarget?.score === "number") expect(envelope.agent.runbookReadTargetScore).toBe(executor.readTarget.score);
      if (typeof executor.readTarget?.primary === "boolean") expect(envelope.agent.runbookReadTargetPrimary).toBe(executor.readTarget.primary);
      if (executor.readTarget?.reason) expect(envelope.agent.runbookReadTargetReason).toBe(executor.readTarget.reason);
      if (executor.url) expect(envelope.agent.runbookUrl).toBe(executor.url);
      expect(envelope.agent.executorDecision).toBe(executor.decision);
      expect(envelope.agent.executorMode).toBe(executor.mode);
      expect(envelope.agent.executorActionName).toBe(executor.action);
      expect(envelope.agent.executorOperation).toBe(executor.operation);
      expect(envelope.agent.executorConfidence).toBe(executor.confidence);
      expect(envelope.agent.executorAnswerReady).toBe(executor.answerReady);
      expect(envelope.agent.executorShouldContinue).toBe(executor.shouldContinue);
      expect(envelope.agent.executorTerminal).toBe(executor.terminal);
      expect(envelope.agent.executorExpectedOutcome).toBe(executor.expectedOutcome);
      expect(envelope.agent.expectedOutcomeKind).toBe(handoff.expectedOutcome);
      expect(envelope.agent.expectedOutcomeMessage).toEqual(expect.any(String));
      expect(envelope.agent.executionPlanOperation).toBe(executor.operation);
      expect(envelope.agent.executionPlanConfidence).toBe(executor.confidence);
      expect(envelope.agent.executionPlanReason).toEqual(expect.any(String));
      expect(envelope.agent.executionPlanAnswerReady).toBe(executor.answerReady);
      expect(envelope.agent.executionPlanShouldContinue).toBe(executor.shouldContinue);
      expect(envelope.agent.executionPlanTerminal).toBe(executor.terminal);
      expect(envelope.agent.executionPlanExpectedOutcome).toBe(executor.expectedOutcome);
      if (executor.commandArgs) expect(envelope.agent.executionPlanCommandArgs).toEqual(executor.commandArgs);
      if (executor.readFrom) expect(envelope.agent.executionPlanReadFrom).toBe(executor.readFrom);
      if (executor.readTarget?.kind) expect(envelope.agent.executionPlanReadTargetKind).toBe(executor.readTarget.kind);
      if (typeof executor.readTarget?.count === "number") expect(envelope.agent.executionPlanReadTargetCount).toBe(executor.readTarget.count);
      if (typeof executor.readTarget?.score === "number") expect(envelope.agent.executionPlanReadTargetScore).toBe(executor.readTarget.score);
      if (typeof executor.readTarget?.primary === "boolean") expect(envelope.agent.executionPlanReadTargetPrimary).toBe(executor.readTarget.primary);
      if (executor.readTarget?.reason) expect(envelope.agent.executionPlanReadTargetReason).toBe(executor.readTarget.reason);
      if (executor.url) expect(envelope.agent.executionPlanUrl).toBe(executor.url);
      if (executor.commandArgs) expect(envelope.agent.executorCommandArgs).toEqual(executor.commandArgs);
      if (executor.readFrom) expect(envelope.agent.executorReadFrom).toBe(executor.readFrom);
      if (executor.readTarget?.kind) expect(envelope.agent.executorReadTargetKind).toBe(executor.readTarget.kind);
      if (typeof executor.readTarget?.count === "number") expect(envelope.agent.executorReadTargetCount).toBe(executor.readTarget.count);
      if (typeof executor.readTarget?.score === "number") expect(envelope.agent.executorReadTargetScore).toBe(executor.readTarget.score);
      if (typeof executor.readTarget?.primary === "boolean") expect(envelope.agent.executorReadTargetPrimary).toBe(executor.readTarget.primary);
      if (executor.readTarget?.reason) expect(envelope.agent.executorReadTargetReason).toBe(executor.readTarget.reason);
      if (executor.url) expect(envelope.agent.executorUrl).toBe(executor.url);
      if (item.args[0] === "--search") expect(envelope.agent.searchDecisionReason).toEqual(expect.any(String));
      if (envelope.agent.primaryAction?.target?.url) expect(envelope.agent.primaryTargetUrl).toBe(envelope.agent.primaryAction.target.url);
      if (envelope.agent.primaryAction?.target?.path) expect(envelope.agent.primaryTargetPath).toBe(envelope.agent.primaryAction.target.path);
      if (envelope.agent.primaryAction?.target?.title) expect(envelope.agent.primaryTargetTitle).toBe(envelope.agent.primaryAction.target.title);
      if (envelope.agent.primaryAction?.target?.host) expect(envelope.agent.primaryTargetHost).toBe(envelope.agent.primaryAction.target.host);
      if (envelope.agent.primaryAction?.target?.source) expect(envelope.agent.primaryTargetSource).toBe(envelope.agent.primaryAction.target.source);
      if (typeof envelope.agent.primaryAction?.target?.rank === "number") expect(envelope.agent.primaryTargetRank).toBe(envelope.agent.primaryAction.target.rank);
      if (typeof envelope.agent.primaryAction?.target?.sourceScore === "number") expect(envelope.agent.primaryTargetSourceScore).toBe(envelope.agent.primaryAction.target.sourceScore);
      if (envelope.agent.primaryAction?.target?.relevance) expect(envelope.agent.primaryTargetRelevance).toBe(envelope.agent.primaryAction.target.relevance);
      if (typeof envelope.agent.primaryAction?.target?.isLikelyOfficial === "boolean") expect(envelope.agent.primaryTargetLikelyOfficial).toBe(envelope.agent.primaryAction.target.isLikelyOfficial);
      if (envelope.agent.primaryAction?.target?.selector) expect(envelope.agent.primaryTargetSelector).toBe(envelope.agent.primaryAction.target.selector);
      if (envelope.agent.primaryAction?.target?.text) expect(envelope.agent.primaryTargetText).toBe(envelope.agent.primaryAction.target.text);
      if (executor.target?.url) expect(envelope.agent.executorTargetUrl).toBe(executor.target.url);
      if (executor.target?.path) expect(envelope.agent.executorTargetPath).toBe(executor.target.path);
      if (executor.target?.title) expect(envelope.agent.executorTargetTitle).toBe(executor.target.title);
      if (executor.target?.host) expect(envelope.agent.executorTargetHost).toBe(executor.target.host);
      if (executor.target?.source) expect(envelope.agent.executorTargetSource).toBe(executor.target.source);
      if (typeof executor.target?.rank === "number") expect(envelope.agent.executorTargetRank).toBe(executor.target.rank);
      if (typeof executor.target?.sourceScore === "number") expect(envelope.agent.executorTargetSourceScore).toBe(executor.target.sourceScore);
      if (executor.target?.relevance) expect(envelope.agent.executorTargetRelevance).toBe(executor.target.relevance);
      if (typeof executor.target?.isLikelyOfficial === "boolean") expect(envelope.agent.executorTargetLikelyOfficial).toBe(executor.target.isLikelyOfficial);
      if (executor.target?.selector) expect(envelope.agent.executorTargetSelector).toBe(executor.target.selector);
      if (executor.target?.text) expect(envelope.agent.executorTargetText).toBe(executor.target.text);
      expect(envelope.agent.handoffDecision).toBe(handoff.decision);
      expect(envelope.agent.handoffMode).toBe(handoff.mode);
      expect(envelope.agent.handoffActionName).toBe(handoff.action);
      expect(envelope.agent.handoffOperation).toBe(handoff.operation);
      expect(envelope.agent.handoffAnswerStatus).toBe(handoff.answerStatus);
      expect(envelope.agent.handoffConfidence).toBe(handoff.confidence);
      expect(envelope.agent.handoffAnswerReady).toBe(handoff.answerReady);
      expect(envelope.agent.handoffShouldContinue).toBe(handoff.shouldContinue);
      expect(envelope.agent.handoffTerminal).toBe(handoff.terminal);
      expect(envelope.agent.handoffExpectedOutcome).toBe(handoff.expectedOutcome);
      if (handoff.priority) expect(envelope.agent.handoffPriority).toBe(handoff.priority);
      if (handoff.priorityReason) expect(envelope.agent.handoffPriorityReason).toBe(handoff.priorityReason);
      if (handoff.commandArgs) expect(envelope.agent.handoffCommandArgs).toEqual(handoff.commandArgs);
      if (handoff.readFrom) expect(envelope.agent.handoffReadFrom).toBe(handoff.readFrom);
      if (handoff.readTarget?.kind) expect(envelope.agent.handoffReadTargetKind).toBe(handoff.readTarget.kind);
      if (typeof handoff.readTarget?.count === "number") expect(envelope.agent.handoffReadTargetCount).toBe(handoff.readTarget.count);
      if (typeof handoff.readTarget?.score === "number") expect(envelope.agent.handoffReadTargetScore).toBe(handoff.readTarget.score);
      if (typeof handoff.readTarget?.primary === "boolean") expect(envelope.agent.handoffReadTargetPrimary).toBe(handoff.readTarget.primary);
      if (handoff.readTarget?.reason) expect(envelope.agent.handoffReadTargetReason).toBe(handoff.readTarget.reason);
      if (handoff.url) expect(envelope.agent.handoffUrl).toBe(handoff.url);
      if (handoff.target?.url) expect(envelope.agent.handoffTargetUrl).toBe(handoff.target.url);
      if (handoff.target?.path) expect(envelope.agent.handoffTargetPath).toBe(handoff.target.path);
      if (handoff.target?.title) expect(envelope.agent.handoffTargetTitle).toBe(handoff.target.title);
      if (handoff.target?.host) expect(envelope.agent.handoffTargetHost).toBe(handoff.target.host);
      if (handoff.target?.source) expect(envelope.agent.handoffTargetSource).toBe(handoff.target.source);
      if (typeof handoff.target?.rank === "number") expect(envelope.agent.handoffTargetRank).toBe(handoff.target.rank);
      if (typeof handoff.target?.sourceScore === "number") expect(envelope.agent.handoffTargetSourceScore).toBe(handoff.target.sourceScore);
      if (handoff.target?.relevance) expect(envelope.agent.handoffTargetRelevance).toBe(handoff.target.relevance);
      if (typeof handoff.target?.isLikelyOfficial === "boolean") expect(envelope.agent.handoffTargetLikelyOfficial).toBe(handoff.target.isLikelyOfficial);
      if (handoff.target?.selector) expect(envelope.agent.handoffTargetSelector).toBe(handoff.target.selector);
      if (handoff.target?.text) expect(envelope.agent.handoffTargetText).toBe(handoff.target.text);
      expect(envelope.agent.answerPlanStatus).toBe(handoff.answerStatus);
      expect(envelope.agent.answerPlanConfidence).toEqual(expect.stringMatching(/^(low|medium|high)$/));
      if (envelope.agent.answerPlan?.reason) expect(envelope.agent.answerPlanReason).toBe(envelope.agent.answerPlan.reason);
      if (envelope.agent.answerPlan?.nextAction) expect(envelope.agent.answerPlanNextAction).toBe(envelope.agent.answerPlan.nextAction);
      expect(envelope.agent.answerGapCount).toEqual(expect.any(Number));
      expect(envelope.agent.alternativeActionCount).toEqual(expect.any(Number));
      const topAction = envelope.agent.actions?.[0];
      if (topAction?.priorityReason) expect(envelope.agent.topActionPriorityReason).toBe(topAction.priorityReason);
      if (topAction?.command) expect(envelope.agent.topActionCommand).toBe(topAction.command);
      if (topAction?.commandArgs) expect(envelope.agent.topActionCommandArgs).toEqual(topAction.commandArgs);
      if (topAction?.afterInteractionCommand) expect(envelope.agent.topActionAfterInteractionCommand).toBe(topAction.afterInteractionCommand);
      if (topAction?.afterInteractionCommandArgs) expect(envelope.agent.topActionAfterInteractionCommandArgs).toEqual(topAction.afterInteractionCommandArgs);
      if (typeof topAction?.rank === "number") expect(envelope.agent.topActionRank).toBe(topAction.rank);
      if (topAction?.openResult) expect(envelope.agent.topActionOpenResult).toBe(topAction.openResult);
      if (topAction?.expectedOutcome) expect(envelope.agent.topActionExpectedOutcome).toBe(topAction.expectedOutcome);
      if (topAction?.expectedOutcomeMessage) expect(envelope.agent.topActionExpectedOutcomeMessage).toBe(topAction.expectedOutcomeMessage);
      if (topAction?.target?.url) expect(envelope.agent.topActionTargetUrl).toBe(topAction.target.url);
      if (topAction?.target?.path) expect(envelope.agent.topActionTargetPath).toBe(topAction.target.path);
      if (topAction?.target?.title) expect(envelope.agent.topActionTargetTitle).toBe(topAction.target.title);
      if (topAction?.target?.host) expect(envelope.agent.topActionTargetHost).toBe(topAction.target.host);
      if (topAction?.target?.source) expect(envelope.agent.topActionTargetSource).toBe(topAction.target.source);
      if (typeof topAction?.target?.rank === "number") expect(envelope.agent.topActionTargetRank).toBe(topAction.target.rank);
      if (typeof topAction?.target?.sourceScore === "number") expect(envelope.agent.topActionTargetSourceScore).toBe(topAction.target.sourceScore);
      if (topAction?.target?.relevance) expect(envelope.agent.topActionTargetRelevance).toBe(topAction.target.relevance);
      if (typeof topAction?.target?.isLikelyOfficial === "boolean") expect(envelope.agent.topActionTargetLikelyOfficial).toBe(topAction.target.isLikelyOfficial);
      if (topAction?.target?.selector) expect(envelope.agent.topActionTargetSelector).toBe(topAction.target.selector);
      if (topAction?.target?.text) expect(envelope.agent.topActionTargetText).toBe(topAction.target.text);
      if (envelope.agent.primaryAction?.expectedOutcome) expect(envelope.agent.primaryExpectedOutcome).toBe(envelope.agent.primaryAction.expectedOutcome);
      if (envelope.agent.primaryAction?.expectedOutcomeMessage) expect(envelope.agent.primaryExpectedOutcomeMessage).toBe(envelope.agent.primaryAction.expectedOutcomeMessage);
      const alternativeAction = envelope.agent.actions?.find((action: { primary?: boolean }) => action.primary !== true);
      if (alternativeAction?.priorityReason) expect(envelope.agent.alternativeActionPriorityReason).toBe(alternativeAction.priorityReason);
      if (alternativeAction?.command) expect(envelope.agent.alternativeActionCommand).toBe(alternativeAction.command);
      if (alternativeAction?.commandArgs) expect(envelope.agent.alternativeActionCommandArgs).toEqual(alternativeAction.commandArgs);
      if (alternativeAction?.afterInteractionCommand) expect(envelope.agent.alternativeActionAfterInteractionCommand).toBe(alternativeAction.afterInteractionCommand);
      if (alternativeAction?.afterInteractionCommandArgs) expect(envelope.agent.alternativeActionAfterInteractionCommandArgs).toEqual(alternativeAction.afterInteractionCommandArgs);
      if (typeof alternativeAction?.rank === "number") expect(envelope.agent.alternativeActionRank).toBe(alternativeAction.rank);
      if (alternativeAction?.openResult) expect(envelope.agent.alternativeActionOpenResult).toBe(alternativeAction.openResult);
      if (alternativeAction?.expectedOutcome) expect(envelope.agent.alternativeActionExpectedOutcome).toBe(alternativeAction.expectedOutcome);
      if (alternativeAction?.expectedOutcomeMessage) expect(envelope.agent.alternativeActionExpectedOutcomeMessage).toBe(alternativeAction.expectedOutcomeMessage);
      expect(envelope.agent.diagnosticInfoCount).toEqual(expect.any(Number));
      if (envelope.agent.diagnosticCodes?.length) expect(envelope.agent.diagnosticCodes[0]).toEqual(expect.any(String));
      const topAnswerEvidence = envelope.agent.answerEvidence?.[0] ?? handoff.answerEvidence?.[0];
      if (topAnswerEvidence) {
        expect(envelope.agent.topAnswerEvidenceId).toBe(topAnswerEvidence.id);
        expect(envelope.agent.topAnswerEvidencePath).toBe(topAnswerEvidence.path);
        expect(envelope.agent.topAnswerEvidenceKind).toBe(topAnswerEvidence.kind);
        if (topAnswerEvidence.text) expect(envelope.agent.topAnswerEvidenceText).toBe(topAnswerEvidence.text);
        if (topAnswerEvidence.url) expect(envelope.agent.topAnswerEvidenceUrl).toBe(topAnswerEvidence.url);
        if (typeof topAnswerEvidence.score === "number") expect(envelope.agent.topAnswerEvidenceScore).toBe(topAnswerEvidence.score);
      }
      if (handoff.useCitationIds?.length) expect(envelope.agent.answerUseCitationIds).toEqual(handoff.useCitationIds);
      if (handoff.readFrom) expect(envelope.agent.answerPlanReadFrom).toBe(handoff.readFrom);
      if (handoff.readTarget?.kind) expect(envelope.agent.answerPlanReadTargetKind).toBe(handoff.readTarget.kind);
      if (typeof handoff.readTarget?.count === "number") expect(envelope.agent.answerPlanReadTargetCount).toBe(handoff.readTarget.count);
      if (typeof handoff.readTarget?.score === "number") expect(envelope.agent.answerPlanReadTargetScore).toBe(handoff.readTarget.score);
      if (typeof handoff.readTarget?.primary === "boolean") expect(envelope.agent.answerPlanReadTargetPrimary).toBe(handoff.readTarget.primary);
      if (handoff.readTarget?.reason) expect(envelope.agent.answerPlanReadTargetReason).toBe(handoff.readTarget.reason);
      if (handoff.commandArgs) expect(envelope.agent.answerPlanCommandArgs).toEqual(handoff.commandArgs);
      if (handoff.url) expect(envelope.agent.answerPlanUrl).toBe(handoff.url);
      if (envelope.agent.alternativeActionCount > 0) {
        expect(envelope.agent.alternativeActionName).toEqual(expect.any(String));
        expect(envelope.agent.alternativeActionSource).toEqual(expect.any(String));
        expect(envelope.agent.alternativeActionExecution).toEqual(expect.stringMatching(/^(run-command|read-current|interact-browser|inspect-output)$/));
        expect(envelope.agent.alternativeActionPriority).toEqual(expect.stringMatching(/^(low|medium|high)$/));
        const alternativeAction = envelope.agent.actions?.find((action: { primary?: boolean }) => action.primary !== true);
        if (alternativeAction?.target?.url) expect(envelope.agent.alternativeActionTargetUrl).toBe(alternativeAction.target.url);
        if (alternativeAction?.target?.path) expect(envelope.agent.alternativeActionTargetPath).toBe(alternativeAction.target.path);
        if (alternativeAction?.target?.title) expect(envelope.agent.alternativeActionTargetTitle).toBe(alternativeAction.target.title);
        if (alternativeAction?.target?.host) expect(envelope.agent.alternativeActionTargetHost).toBe(alternativeAction.target.host);
        if (alternativeAction?.target?.source) expect(envelope.agent.alternativeActionTargetSource).toBe(alternativeAction.target.source);
        if (typeof alternativeAction?.target?.rank === "number") expect(envelope.agent.alternativeActionTargetRank).toBe(alternativeAction.target.rank);
        if (typeof alternativeAction?.target?.sourceScore === "number") expect(envelope.agent.alternativeActionTargetSourceScore).toBe(alternativeAction.target.sourceScore);
        if (alternativeAction?.target?.relevance) expect(envelope.agent.alternativeActionTargetRelevance).toBe(alternativeAction.target.relevance);
        if (typeof alternativeAction?.target?.isLikelyOfficial === "boolean") expect(envelope.agent.alternativeActionTargetLikelyOfficial).toBe(alternativeAction.target.isLikelyOfficial);
        if (alternativeAction?.target?.selector) expect(envelope.agent.alternativeActionTargetSelector).toBe(alternativeAction.target.selector);
        if (alternativeAction?.target?.text) expect(envelope.agent.alternativeActionTargetText).toBe(alternativeAction.target.text);
      }
      const topResultChoice = envelope.agent.resultChoices?.[0] ?? handoff.resultChoices?.[0];
      const topSourceChoice = envelope.agent.sourceChoices?.[0] ?? handoff.sourceChoices?.[0];
      const topFormChoice = envelope.agent.formChoices?.[0];
      const topActionTargetChoice = envelope.agent.actionTargetChoices?.[0];
      if (topResultChoice) {
        expect(envelope.agent.topChoiceKind).toBe("result");
        expect(envelope.agent.topChoicePath).toBe(topResultChoice.path);
        if (topResultChoice.command) expect(envelope.agent.topChoiceCommand).toBe(topResultChoice.command);
        expect(envelope.agent.topChoiceCommandArgs).toEqual(topResultChoice.commandArgs);
        if (typeof topResultChoice.rank === "number") expect(envelope.agent.topChoiceRank).toBe(topResultChoice.rank);
        if (topResultChoice.openResult) expect(envelope.agent.topChoiceOpenResult).toBe(topResultChoice.openResult);
        if (typeof topResultChoice.recommended === "boolean") expect(envelope.agent.topChoiceRecommended).toBe(topResultChoice.recommended);
        if (typeof topResultChoice.primary === "boolean") expect(envelope.agent.topChoicePrimary).toBe(topResultChoice.primary);
        if (topResultChoice.host) expect(envelope.agent.topChoiceHost).toBe(topResultChoice.host);
        if (topResultChoice.snippet) expect(envelope.agent.topChoiceSnippet).toBe(topResultChoice.snippet);
        if (topResultChoice.source) expect(envelope.agent.topChoiceSource).toBe(topResultChoice.source);
        if (topResultChoice.sourceType) expect(envelope.agent.topChoiceSourceType).toBe(topResultChoice.sourceType);
        if (typeof topResultChoice.sourceScore === "number") expect(envelope.agent.topChoiceSourceScore).toBe(topResultChoice.sourceScore);
        if (topResultChoice.relevance) expect(envelope.agent.topChoiceRelevance).toBe(topResultChoice.relevance);
        if (typeof topResultChoice.isLikelyOfficial === "boolean") expect(envelope.agent.topChoiceLikelyOfficial).toBe(topResultChoice.isLikelyOfficial);
        if (topResultChoice.selectionReason) expect(envelope.agent.topChoiceReason).toBe(topResultChoice.selectionReason);
        expect(envelope.agent.topResultChoicePath).toBe(topResultChoice.path);
        expect(envelope.agent.topResultChoiceUrl).toBe(topResultChoice.url);
        if (topResultChoice.command) expect(envelope.agent.topResultChoiceCommand).toBe(topResultChoice.command);
        expect(envelope.agent.topResultChoiceCommandArgs).toEqual(topResultChoice.commandArgs);
        if (topResultChoice.title) expect(envelope.agent.topResultChoiceTitle).toBe(topResultChoice.title);
        if (topResultChoice.snippet) expect(envelope.agent.topResultChoiceSnippet).toBe(topResultChoice.snippet);
        if (typeof topResultChoice.rank === "number") expect(envelope.agent.topResultChoiceRank).toBe(topResultChoice.rank);
        if (topResultChoice.sourceHints?.length) expect(envelope.agent.topResultChoiceSourceHints).toEqual(topResultChoice.sourceHints);
        if (topResultChoice.sitelinks?.[0]?.title) expect(envelope.agent.topResultChoiceFirstSitelinkTitle).toBe(topResultChoice.sitelinks[0].title);
        if (topResultChoice.sitelinks?.[0]?.url) expect(envelope.agent.topResultChoiceFirstSitelinkUrl).toBe(topResultChoice.sitelinks[0].url);
      } else if (topSourceChoice) {
        expect(envelope.agent.topChoiceKind).toBe("source");
        expect(envelope.agent.topChoicePath).toBe(topSourceChoice.path);
        if (topSourceChoice.command) expect(envelope.agent.topChoiceCommand).toBe(topSourceChoice.command);
        expect(envelope.agent.topChoiceCommandArgs).toEqual(topSourceChoice.commandArgs);
        if (topSourceChoice.command) expect(envelope.agent.topSourceChoiceCommand).toBe(topSourceChoice.command);
        if (topSourceChoice.kind) expect(envelope.agent.topSourceChoiceKind).toBe(topSourceChoice.kind);
        if (typeof topSourceChoice.rank === "number") expect(envelope.agent.topChoiceRank).toBe(topSourceChoice.rank);
        if (typeof topSourceChoice.rank === "number") expect(envelope.agent.topSourceChoiceRank).toBe(topSourceChoice.rank);
        if (topSourceChoice.text) expect(envelope.agent.topSourceChoiceText).toBe(topSourceChoice.text);
        if (typeof topSourceChoice.primary === "boolean") expect(envelope.agent.topChoicePrimary).toBe(topSourceChoice.primary);
        if (topSourceChoice.host) expect(envelope.agent.topChoiceHost).toBe(topSourceChoice.host);
        if (topSourceChoice.snippet) expect(envelope.agent.topChoiceSnippet).toBe(topSourceChoice.snippet);
        if (topSourceChoice.source) expect(envelope.agent.topChoiceSource).toBe(topSourceChoice.source);
        if (topSourceChoice.sourceType) expect(envelope.agent.topChoiceSourceType).toBe(topSourceChoice.sourceType);
        if (typeof topSourceChoice.sourceScore === "number") expect(envelope.agent.topChoiceSourceScore).toBe(topSourceChoice.sourceScore);
        if (topSourceChoice.relevance) expect(envelope.agent.topChoiceRelevance).toBe(topSourceChoice.relevance);
        if (topSourceChoice.relevance) expect(envelope.agent.topSourceChoiceRelevance).toBe(topSourceChoice.relevance);
        if (topSourceChoice.matchedTerms?.[0]) expect(envelope.agent.topSourceChoiceMatchedTerm).toBe(topSourceChoice.matchedTerms[0]);
        if (topSourceChoice.findMatches?.[0]) expect(envelope.agent.topSourceChoiceFindMatch).toBe(topSourceChoice.findMatches[0]);
        if (typeof topSourceChoice.isLikelyOfficial === "boolean") expect(envelope.agent.topChoiceLikelyOfficial).toBe(topSourceChoice.isLikelyOfficial);
        if (topSourceChoice.selector) expect(envelope.agent.topChoiceSelector).toBe(topSourceChoice.selector);
        if (topSourceChoice.selector) expect(envelope.agent.topSourceChoiceSelector).toBe(topSourceChoice.selector);
        if (topSourceChoice.selectionReason) expect(envelope.agent.topChoiceReason).toBe(topSourceChoice.selectionReason);
        if (topSourceChoice.snippet) expect(envelope.agent.topSourceChoiceSnippet).toBe(topSourceChoice.snippet);
        if (topSourceChoice.selectionReason) expect(envelope.agent.topSourceChoiceReason).toBe(topSourceChoice.selectionReason);
      } else if (topFormChoice) {
        expect(envelope.agent.topChoiceKind).toBe("form");
        expect(envelope.agent.topChoicePath).toBe(topFormChoice.path);
        expect(envelope.agent.topChoiceRank).toBe(topFormChoice.rank);
        expect(envelope.agent.topChoiceMethod).toBe(topFormChoice.method);
        if (topFormChoice.selector) expect(envelope.agent.topChoiceSelector).toBe(topFormChoice.selector);
      } else if (topActionTargetChoice) {
        expect(envelope.agent.topChoiceKind).toBe("action-target");
        expect(envelope.agent.topChoicePath).toBe(topActionTargetChoice.path);
        expect(envelope.agent.topChoiceRank).toBe(topActionTargetChoice.rank);
        expect(envelope.agent.topChoiceSource).toBe(topActionTargetChoice.source);
        if (topActionTargetChoice.method) expect(envelope.agent.topChoiceMethod).toBe(topActionTargetChoice.method);
        if (topActionTargetChoice.selector) expect(envelope.agent.topChoiceSelector).toBe(topActionTargetChoice.selector);
      }
      if (executor.commandArgs) expect(handoff.commandArgs).toEqual(executor.commandArgs);
      if (executor.readFrom) expect(handoff.readFrom).toBe(executor.readFrom);
      if (executor.url) expect(handoff.url).toBe(executor.url);
      if (executor.target) expect(handoff.target.url).toBe(executor.target.url);
      if (executor.action === "open-result") {
        expect(handoff.resultChoices).toEqual([
          expect.objectContaining({
            path: "searchResults[0]",
            url: "https://result.example/",
            snippet: "agent browser comparison details",
            primary: true,
            commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent-brief"],
          }),
        ]);
      }
      if (executor.action === "open-source-link") {
        expect(handoff.sourceChoices).toEqual([
          expect.objectContaining({
            path: "pageCheck.sourceLinks[0]",
            url: "https://source.example/report",
            text: "Source report",
            selector: expect.any(String),
            primary: true,
            commandArgs: ["ax-grep", "https://source.example/report", "--find", "missing claim", "--agent-brief"],
          }),
          expect.objectContaining({
            path: "pageCheck.sourceLinks[1]",
            url: "https://source.example/backup",
            text: "Backup source",
            selector: expect.any(String),
            commandArgs: ["ax-grep", "https://source.example/backup", "--find", "missing claim", "--agent-brief"],
          }),
        ]);
      }
      if (executor.browserHtml?.commandArgs) expect(handoff.browserHtml.commandArgs).toEqual(executor.browserHtml.commandArgs);
    }
  });

  it("checks requested text against author and profile links", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/report", "--agent", "--find", "authors jane"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <title>Report</title>
            <link rel="author" href="/authors/jane" title="Jane Doe">
          </head>
          <body>
            <main>
              <h1>Report</h1>
              <p>Brief report summary.</p>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.authorLinks).toEqual([
      expect.objectContaining({
        id: "au1",
        path: "pageCheck.authorLinks[0]",
        name: "Jane Doe",
        url: "https://example.test/authors/jane",
        source: "link",
      }),
    ]);
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "authorLink",
      text: expect.stringContaining("https://example.test/authors/jane"),
      url: "https://example.test/authors/jane",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
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
              <p>agent browser comparison details</p>
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
        selectionReason: "High relevance: matched agent, browser.",
      },
    });
    expect(envelope.agent).toMatchObject({
      pageKind: "search-results",
      routingIntent: "open-url",
      continuationMode: "command",
      nextActionName: "open-result",
      nextExecution: "run-command",
      nextCommand: "ax-grep --search 'agent browser' --engine bing --open-result best --agent",
      nextCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
      nextUrl: "https://result.example/",
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
          selectionReason: "High relevance: matched agent, browser.",
        },
      },
      expectedOutcome: {
        kind: "open-result",
      },
      runbook: {
        decision: "execute",
        mode: "command",
        operation: "execute-command",
        action: "open-result",
        answerStatus: "needs-more",
        answerReady: false,
        shouldContinue: true,
        terminal: false,
        maxSuggestedIterations: 1,
        expectedOutcome: "open-result",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
        url: "https://result.example/",
        target: {
          title: "Agent browser result",
          url: "https://result.example/",
          rank: 1,
        },
      },
      executor: {
        decision: "execute",
        mode: "command",
        operation: "execute-command",
        action: "open-result",
        status: "needs-more",
        answerReady: false,
        shouldContinue: true,
        terminal: false,
        maxSuggestedIterations: 1,
        expectedOutcome: "open-result",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
        url: "https://result.example/",
        target: {
          title: "Agent browser result",
          url: "https://result.example/",
          rank: 1,
        },
      },
      handoff: {
        decision: "execute",
        mode: "command",
        operation: "execute-command",
        action: "open-result",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
        url: "https://result.example/",
        target: {
          title: "Agent browser result",
          url: "https://result.example/",
          rank: 1,
        },
        resultChoices: [
          expect.objectContaining({
            id: "r1",
            path: "searchResults[0]",
            title: "Agent browser result",
            url: "https://result.example/",
            host: "result.example",
            rank: 1,
            snippet: "agent browser comparison details",
            recommended: true,
            primary: true,
            recommendedPath: "recommendedResult",
            selectionReason: "High relevance: matched agent, browser.",
            commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent"],
          }),
        ],
      },
      answerPlan: {
        status: "needs-more",
        confidence: "medium",
        gaps: expect.arrayContaining(["A follow-up action is required before final answering."]),
        nextAction: "open-result",
        command: "ax-grep --search 'agent browser' --engine bing --open-result best --agent",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
        url: "https://result.example/",
      },
      answerPlanReason: "Follow the next action before producing a final answer.",
      answerPlanNextAction: "open-result",
      signals: expect.arrayContaining([
        expect.objectContaining({ kind: "search-results", severity: "info" }),
        expect.objectContaining({ kind: "content", severity: "info" }),
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
      bestReadTargetCount: 1,
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
      searchDecision: {
        decision: "open-result",
        recommendedPath: "recommendedResult",
        recommendedTitle: "Agent browser result",
        recommendedUrl: "https://result.example/",
        recommendedSource: "result.example",
        recommendedRelevance: "high",
        recommendedLikelyOfficial: false,
        command: "ax-grep --search 'agent browser' --engine bing --open-result best --agent",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
      },
      searchDecisionName: "open-result",
      searchDecisionConfidence: "high",
      searchDecisionResultCount: 1,
      searchDecisionHighRelevanceCount: 1,
      searchDecisionMediumRelevanceCount: 0,
      searchDecisionLowRelevanceCount: 0,
      searchDecisionOfficialCount: 0,
      searchDecisionFindMatchCount: 0,
      searchDecisionRecommendedRank: 1,
      searchDecisionRecommendedPath: "recommendedResult",
      searchDecisionRecommendedTitle: "Agent browser result",
      searchDecisionRecommendedUrl: "https://result.example/",
      searchDecisionRecommendedSource: "result.example",
      searchDecisionRecommendedSourceScore: expect.any(Number),
      searchDecisionRecommendedRelevance: "high",
      searchDecisionRecommendedLikelyOfficial: false,
      searchDecisionCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "best", "--agent"],
      topResultChoicePath: "searchResults[0]",
      topResultChoiceTitle: "Agent browser result",
      topResultChoiceUrl: "https://result.example/",
      topResultChoiceHost: "result.example",
      topResultChoiceSnippet: "agent browser comparison details",
      topResultChoiceCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent"],
      topResultChoiceRank: 1,
      topResultChoiceOpenResult: 1,
      topResultChoiceRecommended: true,
      topResultChoicePrimary: true,
      topResultChoiceReason: "High relevance: matched agent, browser.",
      resultChoices: [
        expect.objectContaining({
          id: "r1",
          path: "searchResults[0]",
          title: "Agent browser result",
          url: "https://result.example/",
          host: "result.example",
          rank: 1,
          recommended: true,
          primary: true,
          recommendedPath: "recommendedResult",
          selectionReason: "High relevance: matched agent, browser.",
          commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent"],
        }),
      ],
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

  it("prints result choices in text search output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://www.bing.com/search?q=agent+browser"], {
      stdout,
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

    expect(status).toBe(0);
    expect(stdout.output).toContain("  searchDecision: open-result/low - Ranked result 1 from result.example.");
    expect(stdout.output).toContain("  searchDecisionName: open-result");
    expect(stdout.output).toContain("  searchDecisionResultCount: 1");
    expect(stdout.output).toContain("  searchDecisionHighRelevanceCount: 0");
    expect(stdout.output).toContain("  searchDecisionMediumRelevanceCount: 0");
    expect(stdout.output).toContain("  searchDecisionLowRelevanceCount: 0");
    expect(stdout.output).toContain("  executor: execute/execute-command/medium action=open-result status=needs-more - Run ax-grep 'https://result.example/' --json --summary and continue with its output.");
    expect(stdout.output).toContain("  executorCommandArgs: [\"ax-grep\",\"https://result.example/\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  handoffCommandArgs: [\"ax-grep\",\"https://result.example/\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  handoffResultChoice: r1 searchResults[0] rank=1 recommended primary via=recommendedResult");
    expect(stdout.output).toContain("    snippet: agent browser comparison details");
    expect(stdout.output).toContain("  topResultChoiceSnippet: agent browser comparison details");
    expect(stdout.output).toContain("  resultChoice: r1 searchResults[0] rank=1 recommended primary via=recommendedResult");
    expect(stdout.output).toContain("source=result.example <https://result.example/> - Ranked result 1 from result.example. Agent browser result");
  });

  it("keeps direct search page result choices executable in agent JSON", async () => {
    for (const flag of ["--agent", "--agent-brief"]) {
      const stdout = new MemoryWriter();
      const status = await runCli(["https://www.baidu.com/s?wd=ax-lite", flag], {
        stdout,
        fetch: async () => new Response(`
          <main>
            <ol>
              <li class="b_algo">
                <h2><a href="https://result.example/">Agent browser result</a></h2>
                <p>agent browser comparison details</p>
              </li>
              <li class="b_algo">
                <h2><a href="https://backup.example/">Backup result</a></h2>
                <p>backup comparison details</p>
              </li>
            </ol>
          </main>
        `, { headers: { "content-type": "text/html" } }),
      });

      const envelope = JSON.parse(stdout.output);
      const choice = envelope.agent.resultChoices?.[0] ?? envelope.agent.handoff.resultChoices?.[0];

      expect(status).toBe(0);
      expect(choice).toMatchObject({
        id: "r1",
        path: "searchResults[0]",
        url: "https://result.example/",
        snippet: expect.stringContaining("agent browser comparison details"),
        commandArgs: ["ax-grep", "https://result.example/", flag],
      });
      expect(envelope.agent.handoff.resultChoices[0]).toMatchObject({
        commandArgs: ["ax-grep", "https://result.example/", flag],
      });
      expect(envelope.agent.resultChoiceCount).toBe(2);
    }
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
    expect(envelope.agent.resultChoiceCount).toBe(1);
    expect(envelope.agent.sourceChoiceCount).toBe(0);
    expect(envelope.agent.citations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "source-link" }),
      ]),
    );
    expect(envelope.agent.readabilityReasons).toContain("1 search result source");
    expect(envelope.pageCheck.readability.reasons).toContain("1 search result source");
  });

  it("adds result open commands for direct search result URLs in agent output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://www.bing.com/search?q=agent+browser", "--agent"], {
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
    expect(envelope.kind).toBe("search-results");
    expect(envelope.searchResults).toEqual([
      expect.objectContaining({
        id: "r1",
        path: "searchResults[0]",
        rank: 1,
        openResult: 1,
        command: "ax-grep --search 'agent browser' --engine bing --open-result 1 --agent",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent"],
      }),
    ]);
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
      selectionReason: "Matches --find: target claim.",
    });
    expect(envelope.agent).toMatchObject({
      recommendedRank: 7,
      recommendedUrl: "https://result-7.example/",
      recommendedPath: "recommendedResult",
      recommendedTitle: "Result 7",
      recommendedSource: "result-7.example",
      recommendedSourceScore: envelope.recommendedResult.sourceScore,
      recommendedSelectionReason: "Matches --find: target claim.",
      searchDecisionRecommendedRank: 7,
      searchDecisionRecommendedUrl: "https://result-7.example/",
      searchDecisionRecommendedPath: "recommendedResult",
      searchDecisionRecommendedTitle: "Result 7",
      searchDecisionRecommendedSource: "result-7.example",
      searchDecisionRecommendedSourceScore: envelope.recommendedResult.sourceScore,
      searchDecisionRecommendedRelevance: "low",
      searchDecisionRecommendedLikelyOfficial: false,
      recommendedCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--find", "target claim", "--open-result", "7", "--agent"],
    });
    const visibleSourceAverage = envelope.searchResults.reduce((total: number, result: { sourceScore?: number }) => total + (result.sourceScore ?? 0), 0) / envelope.searchResults.length;
    expect(envelope.agent.sourceQualityScore).toBeCloseTo(visibleSourceAverage, 3);
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

  it("keeps generic top choice and recommended command in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "bing", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://result.example/article">Agent browser guide</a></h2>
              <p>Agent browser comparison details for static handoff.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      topChoiceKind: "result",
      topChoicePath: "searchResults[0]",
      topChoiceUrl: "https://result.example/article",
      topChoiceHost: "result.example",
      topChoiceCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent-brief"],
      topChoiceRank: 1,
      topChoiceOpenResult: 1,
      topChoiceRecommended: true,
      recommendedUrl: "https://result.example/article",
      recommendedPath: "recommendedResult",
      recommendedTitle: "Agent browser guide",
      recommendedRank: 1,
      recommendedCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "bing", "--open-result", "1", "--agent-brief"],
    });
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
              <p>2026-05-31 - Install ax-grep from npm.</p>
              <div>
                <a href="https://www.npmjs.com/package/ax-grep?activeTab=readme">Readme</a>
                <a href="https://www.npmjs.com/package/ax-grep?activeTab=versions">Versions</a>
              </div>
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
      dateText: "2026-05-31",
      date: "2026-05-31",
      datePrecision: "day",
      dateSource: "snippet",
      sitelinks: [
        {
          title: "Readme",
          url: "https://www.npmjs.com/package/ax-grep?activeTab=readme",
        },
        {
          title: "Versions",
          url: "https://www.npmjs.com/package/ax-grep?activeTab=versions",
        },
      ],
      relevance: "high",
      matchedTerms: ["ax-grep", "npm"],
      isLikelyOfficial: true,
      selectionReason: "Likely official source for the query.",
    });
    expect(envelope.searchResults[1]).toMatchObject({
      sourceType: "unknown",
      sourceScore: 0.35,
      relevance: "low",
      matchedTerms: [],
      isLikelyOfficial: false,
      selectionReason: "Ranked result 2 from unrelated.example.",
    });
    expect(envelope.tree).toBeUndefined();
    expect(envelope.agent.resultChoices[0]).toMatchObject({
      dateText: "2026-05-31",
      date: "2026-05-31",
      datePrecision: "day",
      dateSource: "snippet",
      sitelinks: [
        expect.objectContaining({ title: "Readme" }),
        expect.objectContaining({ title: "Versions" }),
      ],
    });
    expect(envelope.agent).toMatchObject({
      topResultChoiceSourceType: "official",
      topResultChoiceSourceScore: 0.9,
      topResultChoiceSourceHints: ["package-registry"],
      topResultChoiceDateText: "2026-05-31",
      topResultChoiceRelevance: "high",
      topResultChoiceMatchedTerm: "ax-grep",
      topResultChoiceLikelyOfficial: true,
      topResultChoiceSitelinkCount: 2,
      topResultChoiceFirstSitelinkTitle: "Readme",
      topResultChoiceFirstSitelinkUrl: "https://www.npmjs.com/package/ax-grep?activeTab=readme",
    });
    expect(envelope.agent.primaryAction.target).toMatchObject({
      title: "ax-grep - npm",
      url: "https://www.npmjs.com/package/ax-grep",
      dateText: "2026-05-31",
      date: "2026-05-31",
      datePrecision: "day",
      dateSource: "snippet",
      sitelinks: [
        expect.objectContaining({ title: "Readme" }),
        expect.objectContaining({ title: "Versions" }),
      ],
      isLikelyOfficial: true,
    });
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
      selectionReason: "Low relevance: only matched npm.",
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

  it("prefers freshness-matching search results for dated queries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "ax-grep release 2026", "--engine", "bing", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://ax-grep.example/docs">ax-grep release notes</a></h2>
              <p>Official ax-grep release notes and installation guide.</p>
            </li>
            <li class="b_algo">
              <h2><a href="https://news.example/ax-grep-2026-release">ax-grep release 2026</a></h2>
              <p>Updated 2026-05-31 with the latest ax-grep release details.</p>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.recommendedResult).toMatchObject({
      rank: 2,
      url: "https://news.example/ax-grep-2026-release",
      matchedTerms: ["ax-grep", "release", "2026"],
      selectionReason: "Freshness match: 2026 (2026-05-31).",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "open-result",
      rank: 2,
      url: "https://news.example/ax-grep-2026-release",
      reason: "The page looks like search results; open the result matching freshness terms: 2026.",
    });
  });

  it("matches requested text against search result sitelinks", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "bing", "--find", "API reference", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ol>
            <li class="b_algo">
              <h2><a href="https://docs.example/agent-browser">Agent browser docs</a></h2>
              <p>Documentation overview.</p>
              <a href="https://docs.example/agent-browser/api">API reference</a>
            </li>
          </ol>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults[0]).toMatchObject({
      findMatches: ["API reference"],
      sitelinks: [
        {
          title: "API reference",
          url: "https://docs.example/agent-browser/api",
        },
      ],
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "open-result",
      openResult: "best",
    });
    expect(envelope.agent).toMatchObject({
      topResultChoiceFindMatch: "API reference",
      topResultChoiceSitelinkCount: 1,
      topResultChoiceFirstSitelinkTitle: "API reference",
      topResultChoiceFirstSitelinkUrl: "https://docs.example/agent-browser/api",
    });
  });

  it("does not treat URL slug fragments as exact package-like query matches", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "ax-grep", "--engine", "duckduckgo", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div class="result">
            <a class="result__a" href="https://unix.stackexchange.com/questions/639269/what-does-ps-ax-grep-catch-do">What does ps -ax | grep $$ &gt; catch do?</a>
            <div class="result__snippet">Discussion about process listing and grep usage.</div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.searchResults[0]).toMatchObject({
      title: "What does ps -ax | grep $$ > catch do?",
      relevance: "low",
      isLikelyOfficial: false,
    });
    expect(envelope.searchResults[0].matchedTerms).toBeUndefined();
    expect(envelope.recommendedResult).toBeUndefined();
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "refine-search",
      priority: "medium",
      command: "ax-grep --search '\"ax-grep\"' --engine duckduckgo --agent",
    });
    expect(envelope.agent.searchDecision).toMatchObject({
      decision: "refine-search",
      confidence: "low",
      resultCount: 1,
      highRelevanceCount: 0,
      mediumRelevanceCount: 0,
      lowRelevanceCount: 1,
      officialCount: 0,
      findMatchCount: 0,
      command: "ax-grep --search '\"ax-grep\"' --engine duckduckgo --agent",
      commandArgs: ["ax-grep", "--search", "\"ax-grep\"", "--engine", "duckduckgo", "--agent"],
    });
    expect(envelope.agent).toMatchObject({
      searchDecisionName: "refine-search",
      searchDecisionConfidence: "low",
      searchDecisionResultCount: 1,
      searchDecisionHighRelevanceCount: 0,
      searchDecisionMediumRelevanceCount: 0,
      searchDecisionLowRelevanceCount: 1,
      searchDecisionOfficialCount: 0,
      searchDecisionFindMatchCount: 0,
      searchDecisionCommandArgs: ["ax-grep", "--search", "\"ax-grep\"", "--engine", "duckduckgo", "--agent"],
    });
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
      selectionReason: "Matches --find: target claim.",
    });
    expect(envelope.recommendedResult).toMatchObject({
      title: "Independent source",
      url: "https://source.example/article",
      rank: 2,
      findMatches: ["target claim"],
      selectionReason: "Matches --find: target claim.",
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

  it("adds direct open commands for unsupported direct search result URLs in agent output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://www.baidu.com/s?wd=ax-lite", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div class="result" tpl="se_com_default">
            <h3><a href="https://target.example/first">Baidu First Result</a></h3>
            <div class="c-abstract">First Baidu snippet for agent search result checking.</div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("search-results");
    expect(envelope.searchResults).toEqual([
      expect.objectContaining({
        id: "r1",
        path: "searchResults[0]",
        rank: 1,
        openResult: 1,
        command: "ax-grep 'https://target.example/first' --agent",
        commandArgs: ["ax-grep", "https://target.example/first", "--agent"],
      }),
    ]);
  });

  it("recovers direct search URL queries when refining unsupported SERPs", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://www.baidu.com/s?wd=ax-lite", "--find", "target claim", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div class="result" tpl="se_com_default">
            <h3><a href="https://target.example/first">Unrelated Baidu Result</a></h3>
            <div class="c-abstract">This result does not contain the requested text.</div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "refine-search",
      commandArgs: ["ax-grep", "--search", "\"target claim\" \"ax-lite\"", "--find", "target claim", "--agent"],
    });
    expect(envelope.agent.answerPlan).toMatchObject({
      status: "needs-more",
      nextAction: "refine-search",
      commandArgs: ["ax-grep", "--search", "\"target claim\" \"ax-lite\"", "--find", "target claim", "--agent"],
    });
    expect(envelope.agent.executionPlan).toMatchObject({
      operation: "execute-command",
      expectedOutcome: "run-search",
      commandArgs: ["ax-grep", "--search", "\"target claim\" \"ax-lite\"", "--find", "target claim", "--agent"],
    });
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
    expect(envelope.agent).toMatchObject({
      sourceSearchQuery: "ax-grep npm",
      sourceSearchEngine: "duckduckgo",
      sourceSearchSearchUrl: envelope.sourceSearch.searchUrl,
      sourceSearchSelectedRank: 2,
      sourceSearchSelectedTitle: "ax-grep - npm",
      sourceSearchSelectedUrl: "https://www.npmjs.com/package/ax-grep",
      sourceSearchSelectedHost: "npmjs.com",
      sourceSearchSelectedSource: "npmjs.com",
      sourceSearchSelectedPath: "sourceSearch.selectedResult",
      sourceSearchSelectedOpenResult: 2,
      sourceSearchSelectedCommand: "ax-grep --search 'ax-grep npm' --engine duckduckgo --open-result 2 --agent",
      sourceSearchSelectedCommandArgs: ["ax-grep", "--search", "ax-grep npm", "--engine", "duckduckgo", "--open-result", "2", "--agent"],
      sourceSearchSelectedSnippet: "Install ax-grep from npm.",
      sourceSearchSelectedMatchedTerm: "ax-grep",
      sourceSearchSelectedRelevance: "high",
      sourceSearchSelectedLikelyOfficial: true,
      sourceSearchSelectedReason: "Likely official source for the query.",
      sourceSearchAlternateCount: 1,
      sourceSearchAlternatePath: "sourceSearch.alternateResults[0]",
      sourceSearchAlternateTitle: "Enterprise AI transformation",
      sourceSearchAlternateUrl: "https://unrelated.example/",
      sourceSearchAlternateHost: "unrelated.example",
      sourceSearchAlternateSource: "unrelated.example",
      sourceSearchAlternateRank: 1,
      sourceSearchAlternateOpenResult: 1,
      sourceSearchAlternateCommand: "ax-grep --search 'ax-grep npm' --engine duckduckgo --open-result 1 --agent",
      sourceSearchAlternateCommandArgs: ["ax-grep", "--search", "ax-grep npm", "--engine", "duckduckgo", "--open-result", "1", "--agent"],
      sourceSearchAlternateRelevance: "low",
      sourceSearchAlternateLikelyOfficial: false,
      sourceSearchAlternateDifferentHost: true,
    });
    expect(envelope.agent.sourceSearchSelectedSourceScore).toBe(envelope.sourceSearch.selectedResult.sourceScore);
    expect(envelope.agent.sourceSearchAlternateSourceScore).toBe(envelope.sourceSearch.alternateResults[0].sourceScore);
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
              <div class="result">
                  <a class="result__a" href="https://target.example/article">Target Result</a>
                  <p>May 31, 2026 - Target result snippet.</p>
                  <a href="https://target.example/article/api">API reference</a>
              </div>
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
        dateText: "May 31, 2026",
        date: "2026-05-31",
        datePrecision: "day",
        dateSource: "snippet",
        sitelinks: [
          {
            title: "API reference",
            url: "https://target.example/article/api",
          },
        ],
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
        selectionReason: "Possible source candidate: news-like.",
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
      agent: {
        sourceSearchFailureCode: "HTTP_ERROR",
        sourceSearchFailureStatus: 403,
        sourceSearchFailureKind: "http-client-error",
        sourceSearchFailureRetryable: false,
        sourceSearchFailureUrl: "https://target.example/article",
        sourceSearchFailureHost: "target.example",
        sourceSearchFailureReason: "Selected sourceSearch result failed with HTTP_ERROR status 403.",
      },
      error: {
        code: "HTTP_ERROR",
        status: 403,
      },
    });
  });

  it("classifies rate limited opened search results as retryable", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "duckduckgo", "--open-result", "1", "--agent-brief"], {
      stdout,
      fetch: async (input) => {
        if (String(input).includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <ol>
                <li><a href="https://target.example/rate-limited">Target Result</a><p>Target result snippet.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response("rate limited", { status: 429, statusText: "Too Many Requests", headers: { "retry-after": "120" } });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(12);
    expect(envelope.agent).toMatchObject({
      sourceSearchFailureCode: "HTTP_ERROR",
      sourceSearchFailureStatus: 429,
      sourceSearchFailureKind: "rate-limited",
      sourceSearchFailureRetryable: true,
      sourceSearchFailureRetryAfter: "120",
      sourceSearchFailureUrl: "https://target.example/rate-limited",
      sourceSearchFailureHost: "target.example",
      sourceSearchFailureReason: "Selected sourceSearch result failed with HTTP_ERROR status 429.",
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
                <li><a class="result__a" href="https://backup.example/article">Backup Result</a><p>Backup result snippet.</p></li>
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
      target: {
        title: "Alternate Result",
        url: "https://alternate.example/article",
        source: "alternate.example",
        rank: 2,
      },
      command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 2 --agent",
    });
    expect(envelope.agent.answerPlan).toMatchObject({
      status: "needs-more",
      nextAction: "open-alternate-result",
      command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 2 --agent",
      url: "https://alternate.example/article",
    });
    expect(envelope.agent.handoff).toMatchObject({
      decision: "execute",
      action: "open-alternate-result",
      url: "https://alternate.example/article",
      sourceSearch: {
        query: "agent browser",
        engine: "duckduckgo",
        selectedRank: 1,
        selectedUrl: "https://missing.example/article",
        alternateResults: [
          expect.objectContaining({
            path: "sourceSearch.alternateResults[0]",
            title: "Alternate Result",
            url: "https://alternate.example/article",
            rank: 2,
            commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "2", "--agent"],
          }),
          expect.objectContaining({
            path: "sourceSearch.alternateResults[1]",
            title: "Backup Result",
            url: "https://backup.example/article",
            rank: 3,
            commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "3", "--agent"],
          }),
        ],
      },
    });
    expect(envelope.agent).toMatchObject({
      sourceSearchQuery: "agent browser",
      sourceSearchEngine: "duckduckgo",
      sourceSearchSearchUrl: envelope.sourceSearch.searchUrl,
      sourceSearchSelectedRank: 1,
      sourceSearchSelectedTitle: "Missing Result",
      sourceSearchSelectedUrl: "https://missing.example/article",
      sourceSearchSelectedHost: "missing.example",
      sourceSearchSelectedSource: envelope.sourceSearch.selectedResult.source,
      sourceSearchSelectedPath: "sourceSearch.selectedResult",
      sourceSearchSelectedOpenResult: 1,
      sourceSearchSelectedCommand: envelope.sourceSearch.selectedResult.command,
      sourceSearchSelectedCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "1", "--agent"],
      sourceSearchSelectedSourceScore: envelope.sourceSearch.selectedResult.sourceScore,
      sourceSearchSelectedRelevance: envelope.sourceSearch.selectedResult.relevance,
      sourceSearchSelectedLikelyOfficial: envelope.sourceSearch.selectedResult.isLikelyOfficial,
      sourceSearchAlternateCount: 2,
      sourceSearchAlternatePath: "sourceSearch.alternateResults[0]",
      sourceSearchAlternateTitle: "Alternate Result",
      sourceSearchAlternateUrl: "https://alternate.example/article",
      sourceSearchAlternateHost: "alternate.example",
      sourceSearchAlternateSource: envelope.sourceSearch.alternateResults[0].source,
      sourceSearchAlternateRank: 2,
      sourceSearchAlternateSnippet: "Alternate result snippet.",
      sourceSearchAlternateOpenResult: 2,
      sourceSearchAlternateCommand: envelope.sourceSearch.alternateResults[0].command,
      sourceSearchAlternateCommandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "2", "--agent"],
      sourceSearchAlternateSourceScore: envelope.sourceSearch.alternateResults[0].sourceScore,
      sourceSearchAlternateRelevance: envelope.sourceSearch.alternateResults[0].relevance,
      sourceSearchAlternateLikelyOfficial: envelope.sourceSearch.alternateResults[0].isLikelyOfficial,
      sourceSearchAlternateDifferentHost: true,
      sourceSearchAlternateChoices: [
        expect.objectContaining({
          path: "sourceSearch.alternateResults[0]",
          title: "Alternate Result",
          url: "https://alternate.example/article",
          host: "alternate.example",
          source: "alternate.example",
          rank: 2,
          snippet: "Alternate result snippet.",
          openResult: 2,
          command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 2 --agent",
          commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "2", "--agent"],
          sourceScore: envelope.sourceSearch.alternateResults[0].sourceScore,
          relevance: envelope.sourceSearch.alternateResults[0].relevance,
          isLikelyOfficial: envelope.sourceSearch.alternateResults[0].isLikelyOfficial,
        }),
        expect.objectContaining({
          path: "sourceSearch.alternateResults[1]",
          title: "Backup Result",
          url: "https://backup.example/article",
          host: "backup.example",
          source: "backup.example",
          rank: 3,
          openResult: 3,
          command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 3 --agent",
          commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "3", "--agent"],
          sourceScore: envelope.sourceSearch.alternateResults[1].sourceScore,
          relevance: envelope.sourceSearch.alternateResults[1].relevance,
          isLikelyOfficial: envelope.sourceSearch.alternateResults[1].isLikelyOfficial,
        }),
      ],
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "sourceSearch.selectedResult",
      count: 1,
    }));
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "sourceSearch.alternateResults",
      count: 2,
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
        expect.objectContaining({
          title: "Backup Result",
          url: "https://backup.example/article",
          rank: 3,
          command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 3 --agent",
        }),
      ],
    });
  });

  it("keeps multiple alternate source-search choices in brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["--search", "agent browser", "--engine", "duckduckgo", "--open-result", "1", "--agent-brief"], {
      stdout,
      fetch: async (input) => {
        if (String(input).includes("duckduckgo.com")) {
          return new Response(`
            <main>
              <ol>
                <li><a class="result__a" href="https://missing.example/article">Missing Result</a><p>Missing result snippet.</p></li>
                <li><a class="result__a" href="https://alternate.example/article">Alternate Result</a><p>Alternate result snippet.</p></li>
                <li><a class="result__a" href="https://backup.example/article">Backup Result</a><p>Backup result snippet.</p></li>
              </ol>
            </main>
          `, { headers: { "content-type": "text/html" } });
        }
        return new Response("not found", { status: 404, statusText: "Not Found" });
      },
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(12);
    expect(envelope.agent.sourceSearchAlternateCount).toBe(2);
    expect(envelope.agent.sourceSearchAlternateChoices).toEqual([
      expect.objectContaining({
        path: "sourceSearch.alternateResults[0]",
        title: "Alternate Result",
        url: "https://alternate.example/article",
        host: "alternate.example",
        source: "alternate.example",
        snippet: "Alternate result snippet.",
        openResult: 2,
        command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 2 --agent-brief",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "2", "--agent-brief"],
        sourceScore: expect.any(Number),
        relevance: expect.any(String),
        isLikelyOfficial: false,
      }),
      expect.objectContaining({
        path: "sourceSearch.alternateResults[1]",
        title: "Backup Result",
        url: "https://backup.example/article",
        host: "backup.example",
        source: "backup.example",
        openResult: 3,
        command: "ax-grep --search 'agent browser' --engine duckduckgo --open-result 3 --agent-brief",
        commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--open-result", "3", "--agent-brief"],
        sourceScore: expect.any(Number),
        relevance: expect.any(String),
        isLikelyOfficial: false,
      }),
    ]);
  });

  it("routes missing opened search results to matching alternate candidates", async () => {
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
              <ol>
                <li><a class="result__a" href="https://missing.example/article">Missing Result</a><p>Missing result snippet.</p></li>
                <li><a class="result__a" href="https://weak.example/article">Weak Alternate</a><p>General agent browser overview.</p></li>
                <li><a class="result__a" href="https://match.example/article">Matching Alternate</a><p>This alternate includes the target claim.</p></li>
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
      url: "https://match.example/article",
      rank: 3,
      target: {
        title: "Matching Alternate",
        url: "https://match.example/article",
        source: "match.example",
        rank: 3,
      },
      command: "ax-grep --search 'agent browser' --engine duckduckgo --find 'target claim' --open-result 3 --agent",
      commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--find", "target claim", "--open-result", "3", "--agent"],
    });
    expect(envelope.agent.handoff.sourceSearch.alternateResults).toEqual([
      expect.objectContaining({
        rank: 2,
        url: "https://weak.example/article",
      }),
      expect.objectContaining({
        rank: 3,
        url: "https://match.example/article",
        findMatches: ["target claim"],
      }),
    ]);
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
      handoff: {
        decision: "execute",
        action: "open-alternate-result",
        sourceSearch: {
          query: "agent browser",
          engine: "duckduckgo",
          findQueries: ["target claim"],
          selectedRank: 1,
          selectedUrl: "https://first.example/article",
          alternateResults: [
            expect.objectContaining({
              path: "sourceSearch.alternateResults[0]",
              title: "Independent source",
              url: "https://alternate.example/article",
              rank: 2,
              findMatches: ["target claim"],
              commandArgs: ["ax-grep", "--search", "agent browser", "--engine", "duckduckgo", "--find", "target claim", "--open-result", "2", "--agent"],
            }),
          ],
        },
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

  it("prints source search recovery handoff details in text output", async () => {
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

    expect(status).toBe(0);
    expect(stdout.output).toContain("agent\n  status: verify");
    expect(stdout.output).toContain("  sourceSearchQuery: agent browser");
    expect(stdout.output).toContain("  sourceSearchEngine: duckduckgo");
    expect(stdout.output).toContain("  sourceSearchFindQueryCount: 1");
    expect(stdout.output).toContain("  sourceSearchTopFindQuery: target claim");
    expect(stdout.output).toContain("  sourceSearchSelectedRank: 1");
    expect(stdout.output).toContain("  sourceSearchSelectedTitle: Agent browser overview");
    expect(stdout.output).toContain("  sourceSearchSelectedHost: first.example");
    expect(stdout.output).toContain("  sourceSearchSelectedSource: first.example");
    expect(stdout.output).toContain("  sourceSearchSelectedPath: sourceSearch.selectedResult");
    expect(stdout.output).toContain("  sourceSearchSelectedCommand: ax-grep --search 'agent browser' --engine duckduckgo --find 'target claim' --open-result 1 --agent");
    expect(stdout.output).toContain("  sourceSearchSelectedCommandArgs: [\"ax-grep\",\"--search\",\"agent browser\",\"--engine\",\"duckduckgo\",\"--find\",\"target claim\",\"--open-result\",\"1\",\"--agent\"]");
    expect(stdout.output).toContain("  sourceSearchAlternateCount: 1");
    expect(stdout.output).toContain("  sourceSearchAlternatePath: sourceSearch.alternateResults[0]");
    expect(stdout.output).toContain("  sourceSearchAlternateHost: alternate.example");
    expect(stdout.output).toContain("  sourceSearchAlternateSource: alternate.example");
    expect(stdout.output).toContain("  sourceSearchAlternateCommand: ax-grep --search 'agent browser' --engine duckduckgo --find 'target claim' --open-result 2 --agent");
    expect(stdout.output).toContain("  sourceSearchAlternateCommandArgs: [\"ax-grep\",\"--search\",\"agent browser\",\"--engine\",\"duckduckgo\",\"--find\",\"target claim\",\"--open-result\",\"2\",\"--agent\"]");
    expect(stdout.output).toContain("  handoff: execute/execute-command/low action=open-alternate-result");
    expect(stdout.output).toContain("  handoffSourceSearch: agent browser engine=duckduckgo selected=1 alternates=1 <https://first.example/article>");
    expect(stdout.output).toContain("  handoffSourceSearchQuery: agent browser");
    expect(stdout.output).toContain("  handoffSourceSearchEngine: duckduckgo");
    expect(stdout.output).toContain("  handoffSourceSearchSearchUrl: https://duckduckgo.com/html/?q=agent+browser");
    expect(stdout.output).toContain("  handoffSourceSearchFindQueries: target claim");
    expect(stdout.output).toContain("  handoffSourceSearchSelectedRank: 1");
    expect(stdout.output).toContain("  handoffSourceSearchSelectedUrl: https://first.example/article");
    expect(stdout.output).toContain("  handoffSourceSearchResult: selected sourceSearch.selectedResult rank=1");
    expect(stdout.output).toContain("  handoffSourceSearchAlternate: a2 sourceSearch.alternateResults[0] rank=2");
    expect(stdout.output).toContain("find=target claim <https://alternate.example/article>");
    expect(stdout.output).toContain("  handoffSourceSearchAlternateCommandArgs: [\"ax-grep\",\"--search\",\"agent browser\",\"--engine\",\"duckduckgo\",\"--find\",\"target claim\",\"--open-result\",\"2\",\"--agent\"]");
    expect(stdout.output).toContain("  handoffCommandArgs: [\"ax-grep\",\"--search\",\"agent browser\",\"--engine\",\"duckduckgo\",\"--find\",\"target claim\",\"--open-result\",\"2\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  readTarget: sourceSearch.alternateResults count=1");
    expect(stdout.output).toContain("source\n  search: agent browser via duckduckgo");
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
            <meta property="og:site_name" content="Forum Example">
            <meta name="author" content="Reporter Name">
            <meta property="article:published_time" content="2026-01-02T03:04:05Z">
            <meta property="article:modified_time" content="2026-01-03T04:05:06Z">
            <script type="application/ld+json">
              [
                {
                  "@context": "https://schema.org",
                  "@type": "Article",
                  "headline": "Forum post title",
                  "author": {"@type": "Person", "name": "Structured Reporter"},
                  "datePublished": "2026-01-02T03:04:05Z",
                  "dateModified": "2026-01-03T04:05:06Z"
                },
                {
                  "@context": "https://schema.org",
                  "@type": "BreadcrumbList"
                }
              ]
            </script>
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
      siteName: "Forum Example",
      author: "Reporter Name",
      publishedTime: "2026-01-02T03:04:05Z",
      modifiedTime: "2026-01-03T04:05:06Z",
      structuredDataTypes: ["Article", "BreadcrumbList"],
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
          sourceLinkRef: "pageCheck.sourceLinks[0]",
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
        selectionReason: "External link from source.example.",
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
        selectionReason: "External link from source.example.",
      }),
    ]);
    expect(envelope.agent.actions).toContainEqual(expect.objectContaining({
      action: "open-source-link",
      source: "pageCheck.nextSteps",
      sourceLinkRef: "pageCheck.sourceLinks[0]",
      url: "https://source.example/report",
    }));
    expect(envelope.agent).toEqual(expect.objectContaining({
      semanticTopNamedRole: expect.any(String),
      semanticTopInteractiveName: expect.any(String),
      semanticTopLinkName: expect.any(String),
      semanticTopButtonName: "Reply",
      topSourceChoicePath: "pageCheck.sourceLinks[0]",
      topSourceChoiceUrl: "https://source.example/report",
      topSourceChoiceCommand: "ax-grep https://source.example/report --agent-brief",
      topSourceChoiceSourceType: "unknown",
      topSourceChoiceSourceScore: 0.35,
      topSourceChoiceReason: "External link from source.example.",
    }));
    expect(envelope.pageCheck.primaryLinks.map((link: { title: string }) => link.title)).not.toContain("Login");
    expect(envelope.pageCheck.actions).toEqual([
      expect.objectContaining({ type: "button", text: "Reply" }),
    ]);
  });

  it("counts all focused content in pageCheck contentLength even when previews are capped", async () => {
    const paragraphs = [
      "The first research paragraph gives agents enough context to identify the subject and decide whether the fetched document is worth reading.",
      "The second research paragraph adds claims, dates, and qualifiers so a direct page check can support a grounded answer without opening a browser.",
      "The third research paragraph provides supporting details and a source-like explanation that should contribute to the total extracted text length.",
      "The fourth research paragraph preserves the existing compact preview behavior because only the top evidence snippets should be inlined.",
      "The fifth research paragraph must still count toward contentLength so text-heavy documents are not mistaken for thin fetched pages.",
    ];
    const stdout = new MemoryWriter();
    const status = await runCli(["https://docs.example/research", "--json"], {
      stdout,
      fetch: async () => new Response(`
        <html lang="en">
          <head><title>Research memo</title></head>
          <body>
            <main>
              <article>
                <h1>Research memo</h1>
                ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n")}
              </article>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.contentPreview).toEqual(paragraphs.slice(0, 4));
    expect(envelope.pageCheck.contentEvidence).toHaveLength(4);
    expect(envelope.pageCheck.contentLength).toBe(paragraphs.reduce((total, paragraph) => total + paragraph.length, 0));
    expect(envelope.pageCheck.readability.reasons).toContain("substantial extracted text");
  });

  it("exposes likely official source choice hints without requiring nested source choices", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--stdin", "--agent-brief"], {
      stdout,
      stdin: Readable.from([`
        <main>
          <article>
            <h1>Research note</h1>
            <p>This note has enough readable context for an agent to decide whether it should open an official source.</p>
            <p>The official source link below gives the agent a direct follow-up target without using a browser.</p>
            <a href="https://openai.com/research">OpenAI research source</a>
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
      topSourceChoicePath: "pageCheck.sourceLinks[0]",
      topSourceChoiceUrl: "https://openai.com/research",
      topSourceChoiceCommand: "ax-grep 'https://openai.com/research' --agent-brief",
      topSourceChoiceSourceType: "official",
      topSourceChoiceLikelyOfficial: true,
    });
    expect(envelope.pageCheck.sourceLinks[0]).toMatchObject({
      url: "https://openai.com/research",
      isLikelyOfficial: true,
    });
  });

  it("summarizes data tables as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/pricing", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>Pricing table</title></head>
          <body>
            <main>
              <h1>Pricing</h1>
              <table>
                <caption>Plan comparison</caption>
                <thead>
                  <tr><th>Plan</th><th>Monthly price</th><th>Storage</th></tr>
                </thead>
                <tbody>
                  <tr><td>Starter</td><td>$19.99</td><td>10 GB</td></tr>
                  <tr><td>Team</td><td>$49.99</td><td>100 GB</td></tr>
                </tbody>
              </table>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.dataTables).toEqual([
      {
        id: "t1",
        path: "pageCheck.dataTables[0]",
        rank: 1,
        rowCount: 2,
        columnCount: 3,
        caption: "Plan comparison",
        headers: ["Plan", "Monthly price", "Storage"],
        sampleRows: [
          ["Starter", "$19.99", "10 GB"],
          ["Team", "$49.99", "100 GB"],
        ],
        text: "Plan comparison; Headers: Plan | Monthly price | Storage; Starter | $19.99 | 10 GB; Team | $49.99 | 100 GB",
        selector: "table:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 data table");
    expect(envelope.agent).toMatchObject({
      dataTableCount: 1,
      faqCount: 0,
      codeBlockCount: 0,
      resourceCount: 0,
      mediaCount: 0,
      sectionCount: 0,
      topDataTablePath: "pageCheck.dataTables[0]",
      topDataTableCaption: "Plan comparison",
      topDataTableRowCount: 2,
      topDataTableColumnCount: 3,
      topDataTableHeaderCount: 3,
      topDataTableFirstHeader: "Plan",
      topDataTableFirstRow: ["Starter", "$19.99", "10 GB"],
      topDataTableFirstCell: "Starter",
      topDataTableSelector: "table:nth-of-type(1)",
      structuredReadTargetCount: 1,
      bestStructuredReadTarget: "pageCheck.dataTables",
      bestStructuredReadTargetCount: 1,
      bestStructuredReadTargetScore: 0.55,
      bestStructuredReadTargetPrimary: true,
      bestStructuredReadTargetReason: "Structured table captions, headers, and sample rows extracted from the page HTML.",
    });
    expect(envelope.pageCheck.recommendedAction).toBeUndefined();
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.dataTables",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.dataTables",
      count: 1,
      primary: true,
      reason: "Structured table captions, headers, and sample rows extracted from the page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.dataTables",
      value: [
        expect.objectContaining({
          id: "t1",
          path: "pageCheck.dataTables[0]",
          text: expect.stringContaining("$19.99"),
        }),
      ],
    });
  });

  it("checks requested text against page data table summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/pricing", "--agent", "--find", "$49.99"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Pricing</h1>
          <table>
            <tr><th>Plan</th><th>Monthly price</th></tr>
            <tr><td>Team</td><td>$49.99</td></tr>
          </table>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "dataTable",
        rank: 1,
        selector: "table:nth-of-type(1)",
        text: "Headers: Plan | Monthly price; Team | $49.99",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
    expect(envelope.agent.handoff.answerEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "v1",
        path: "verification.bestEvidence",
        kind: "verification",
      }),
    ]));
  });

  it("keeps data table path and selector in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/pricing", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Pricing</h1>
          <table>
            <caption>Plan comparison</caption>
            <tr><th>Plan</th><th>Monthly price</th></tr>
            <tr><td>Team</td><td>$49.99</td></tr>
          </table>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      dataTableCount: 1,
      topDataTablePath: "pageCheck.dataTables[0]",
      topDataTableCaption: "Plan comparison",
      topDataTableFirstHeader: "Plan",
      topDataTableFirstCell: "Team",
      topDataTableSelector: "table:nth-of-type(1)",
      bestStructuredReadTarget: "pageCheck.dataTables",
      bestStructuredReadTargetReason: "Structured table captions, headers, and sample rows extracted from the page HTML.",
    });
  });

  it("exposes advanced aria state shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <nav><a href="/reports" aria-current="page" accesskey="r">Reports</a></nav>
          <button aria-expanded="true" aria-haspopup="dialog" aria-controls="filters" aria-keyshortcuts="Alt+F" tabindex="0">Filters</button>
          <dialog id="filters" open aria-label="Filter reports" aria-modal="true">
            <button>Apply</button>
          </dialog>
          <div role="status" aria-live="polite">Saved</div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.semanticSummary.focusableCount).toBe(3);
    expect(envelope.agent.semanticSummary.focusableItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.focusableItems[0]",
        role: "link",
        name: "Reports",
        state: expect.objectContaining({ current: "page" }),
        selector: "a",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.focusableItems[1]",
        role: "button",
        name: "Filters",
        state: expect.objectContaining({ expanded: true, haspopup: "dialog", controls: "filters" }),
        selector: "button",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.focusableItems[2]",
        role: "button",
        name: "Apply",
        selector: "button",
      }),
    ]);
    expect(envelope.agent.semanticSummary.keyboardItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.keyboardItems[0]",
        role: "link",
        name: "Reports",
        accessKey: "r",
        focusable: true,
        selector: "a",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.keyboardItems[1]",
        role: "button",
        name: "Filters",
        shortcuts: ["Alt+F"],
        tabIndex: 0,
        focusable: true,
        selector: "button",
      }),
    ]);
    expect(envelope.agent.semanticSummary.stateCount).toBe(4);
    expect(envelope.agent.semanticSummary.stateItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.stateItems[0]",
        role: "link",
        name: "Reports",
        state: "current=page",
        stateRaw: { current: "page" },
        selector: "a",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.stateItems[1]",
        role: "button",
        name: "Filters",
        state: "expanded=true haspopup=dialog controls=filters",
        stateRaw: { expanded: true, haspopup: "dialog", controls: "filters" },
        selector: "button",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.stateItems[2]",
        role: "dialog",
        name: "Filter reports",
        state: "modal=true",
        stateRaw: { modal: true },
        selector: "#filters",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.stateItems[3]",
        role: "status",
        state: "live=polite",
        stateRaw: { live: "polite" },
        selector: "div",
      }),
    ]);
    expect(envelope.agent).toMatchObject({
      semanticFocusableCount: 3,
      semanticTopFocusableRole: "link",
      semanticTopFocusablePath: "agent.semanticSummary.focusableItems[0]",
      semanticTopFocusableName: "Reports",
      semanticTopFocusableState: "current=page",
      semanticTopFocusableSelector: "a",
      semanticKeyboardShortcutCount: 2,
      semanticTopKeyboardShortcutPath: "agent.semanticSummary.keyboardItems[0]",
      semanticTopKeyboardShortcutRole: "link",
      semanticTopKeyboardShortcutName: "Reports",
      semanticTopKeyboardShortcutAccessKey: "r",
      semanticTopKeyboardShortcutFocusable: true,
      semanticTopKeyboardShortcutSelector: "a",
      semanticTopButtonName: "Filters",
      semanticTopButtonState: "expanded=true haspopup=dialog controls=filters",
      semanticTopButtonDisabled: false,
      semanticTopButtonExpanded: true,
      semanticTopButtonHaspopup: "dialog",
      semanticTopButtonControls: "filters",
      semanticStateCount: 4,
      semanticTopStateRole: "link",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopStateName: "Reports",
      semanticTopState: "current=page",
      semanticTopStateCurrent: "page",
      semanticTopStateSelector: "a",
      semanticTopModalStateRole: "dialog",
      semanticTopModalStatePath: "agent.semanticSummary.stateItems[2]",
      semanticTopModalStateName: "Filter reports",
      semanticTopModalState: "modal=true",
      semanticTopModalStateSelector: "#filters",
      semanticTopLiveStateRole: "status",
      semanticTopLiveStatePath: "agent.semanticSummary.stateItems[3]",
      semanticTopLiveState: "live=polite",
      semanticTopLiveStateLive: "polite",
      semanticTopLiveStateSelector: "div",
    });
  });

  it("keeps keyboard shortcut selectors in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <nav><a href="/reports" accesskey="r">Reports</a></nav>
          <button aria-keyshortcuts="Alt+F" tabindex="0">Filters</button>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      semanticKeyboardShortcutCount: 2,
      semanticTopKeyboardShortcutPath: "agent.semanticSummary.keyboardItems[0]",
      semanticTopKeyboardShortcutRole: "link",
      semanticTopKeyboardShortcutName: "Reports",
      semanticTopKeyboardShortcutAccessKey: "r",
      semanticTopKeyboardShortcutFocusable: true,
      semanticTopKeyboardShortcutSelector: "a",
      semanticTopAriaKeyShortcutPath: "agent.semanticSummary.keyboardItems[1]",
      semanticTopAriaKeyShortcutRole: "button",
      semanticTopAriaKeyShortcutName: "Filters",
      semanticTopAriaKeyShortcutKeys: ["Alt+F"],
      semanticTopAriaKeyShortcutTabIndex: 0,
      semanticTopAriaKeyShortcutFocusable: true,
      semanticTopAriaKeyShortcutSelector: "button",
    });
  });

  it("exposes parsed live semantic top-state shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/live", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div role="status" aria-live="polite" aria-busy="true">Indexing complete</div>
          <p>Readable page content for live state routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      semanticTopStateRole: "status",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopState: "busy=true live=polite",
      semanticTopStateBusy: true,
      semanticTopStateLive: "polite",
      semanticTopStateSelector: "div",
    });
  });

  it("exposes parsed multiselectable semantic top-state shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/multiselect", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div role="listbox" aria-label="Reports" aria-multiselectable="true">
            <div role="option">Q1</div>
            <div role="option">Q2</div>
          </div>
          <p>Readable page content for multiselect state routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      semanticTopStateRole: "listbox",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopStateName: "Reports",
      semanticTopState: "multiselectable=true",
      semanticTopStateMultiselectable: true,
      semanticTopStateSelector: "div",
    });
  });

  it("exposes parsed sort semantic top-state shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/sort", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <table aria-label="Revenue">
            <thead>
              <tr>
                <th aria-sort="descending">Quarter</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Q2</td><td>$20</td></tr>
            </tbody>
          </table>
          <p>Readable page content for sorted table routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      semanticTopStateRole: "columnheader",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopStateName: "Quarter",
      semanticTopState: "sort=descending",
      semanticTopStateSort: "descending",
      semanticTopStateSelector: "th",
    });
  });

  it("exposes parsed drag and drop semantic top-state shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/drag", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <button aria-label="Move report" aria-grabbed="true" aria-dropeffect="move">Move</button>
          <p>Readable page content for drag and drop state routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      semanticTopStateRole: "button",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopStateName: "Move report",
      semanticTopState: "grabbed=true dropEffect=move",
      semanticTopStateGrabbed: true,
      semanticTopStateDropEffect: "move",
      semanticTopStateSelector: "button",
    });
  });

  it("exposes parsed range and orientation semantic top-state shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/range", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div role="slider" aria-label="Progress" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40" aria-valuetext="40 percent"></div>
          <p>Readable page content for range state routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.semanticSummary.fieldItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.fieldItems[0]",
        role: "slider",
        name: "Progress",
        state: expect.objectContaining({
          orientation: "horizontal",
          valueMin: 0,
          valueMax: 100,
          valueNow: 40,
          valueText: "40 percent",
        }),
        selector: "div",
      }),
    ]);
    expect(envelope.agent.semanticSummary.stateItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.stateItems[0]",
        role: "slider",
        name: "Progress",
        state: "orientation=horizontal valueMin=0 valueMax=100 valueNow=40 valueText=40 percent",
        stateRaw: {
          orientation: "horizontal",
          valueMin: 0,
          valueMax: 100,
          valueNow: 40,
          valueText: "40 percent",
        },
        selector: "div",
      }),
    ]);
    expect(envelope.agent).toMatchObject({
      semanticTopFieldRole: "slider",
      semanticTopFieldPath: "agent.semanticSummary.fieldItems[0]",
      semanticTopFieldName: "Progress",
      semanticTopFieldState: "orientation=horizontal valueMin=0 valueMax=100 valueNow=40 valueText=40 percent",
      semanticTopFieldValueMin: 0,
      semanticTopFieldValueMax: 100,
      semanticTopFieldValueNow: 40,
      semanticTopFieldValueText: "40 percent",
      semanticTopFieldSelector: "div",
      semanticTopStateRole: "slider",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopStateName: "Progress",
      semanticTopState: "orientation=horizontal valueMin=0 valueMax=100 valueNow=40 valueText=40 percent",
      semanticTopStateOrientation: "horizontal",
      semanticTopStateValueMin: 0,
      semanticTopStateValueMax: 100,
      semanticTopStateValueNow: 40,
      semanticTopStateValueText: "40 percent",
      semanticTopStateSelector: "div",
    });
  });

  it("exposes idref semantic relation shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/relations", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <input id="q" type="search" aria-label="Archive search" aria-activedescendant="suggestion-1" aria-details="q-details" aria-errormessage="q-error">
          <p id="q-details">Search across public and private archive records.</p>
          <p id="q-error">Use at least two letters.</p>
          <div id="suggestion-1" role="option" aria-selected="true" aria-current="page" aria-level="2">Quarterly reports</div>
          <dialog id="filters" open aria-label="Filter reports" aria-modal="true"></dialog>
          <div role="status" aria-live="polite">Saved</div>
          <p>Readable page content for relation routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.semanticSummary.relationCount).toBe(3);
    expect(envelope.agent.semanticSummary.fieldItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.fieldItems[0]",
        role: "searchbox",
        name: "Archive search",
        details: "q-details",
        detailsText: "Search across public and private archive records.",
        errorMessage: "q-error",
        errorMessageText: "Use at least two letters.",
        selector: "#q",
      }),
    ]);
    expect(envelope.agent.semanticSummary.relationItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.relationItems[0]",
        role: "searchbox",
        name: "Archive search",
        relation: "activeDescendant",
        target: "suggestion-1",
        targetRole: "option",
        targetName: "Quarterly reports",
        targetSelector: "#suggestion-1",
        selector: "#q",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.relationItems[1]",
        role: "searchbox",
        name: "Archive search",
        relation: "details",
        target: "q-details",
        targetRole: "p",
        targetSelector: "#q-details",
        selector: "#q",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.relationItems[2]",
        role: "searchbox",
        name: "Archive search",
        relation: "errorMessage",
        target: "q-error",
        targetRole: "p",
        targetSelector: "#q-error",
        selector: "#q",
      }),
    ]);
    expect(envelope.agent.semanticSummary.choiceItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.choiceItems[0]",
        role: "option",
        name: "Quarterly reports",
        selected: true,
        current: "page",
        state: expect.objectContaining({ selected: true, current: "page" }),
        level: 2,
        selector: "#suggestion-1",
      }),
    ]);
    expect(envelope.agent).toMatchObject({
      semanticFieldCount: 1,
      semanticRelationCount: 3,
      semanticTopFieldRole: "searchbox",
      semanticTopFieldPath: "agent.semanticSummary.fieldItems[0]",
      semanticTopFieldName: "Archive search",
      semanticTopFieldDetails: "q-details",
      semanticTopFieldDetailsText: "Search across public and private archive records.",
      semanticTopFieldErrorMessage: "q-error",
      semanticTopFieldErrorMessageText: "Use at least two letters.",
      semanticTopChoiceRole: "option",
      semanticTopChoicePath: "agent.semanticSummary.choiceItems[0]",
      semanticTopChoiceName: "Quarterly reports",
      semanticTopChoiceState: "selected=true current=page",
      semanticTopChoiceSelected: true,
      semanticTopChoiceCurrent: "page",
      semanticTopChoiceLevel: 2,
      semanticTopChoiceSelector: "#suggestion-1",
      semanticTopSelectedChoiceRole: "option",
      semanticTopSelectedChoicePath: "agent.semanticSummary.choiceItems[0]",
      semanticTopSelectedChoiceName: "Quarterly reports",
      semanticTopSelectedChoiceState: "selected=true current=page",
      semanticTopSelectedChoiceSelected: true,
      semanticTopSelectedChoiceCurrent: "page",
      semanticTopSelectedChoiceLevel: 2,
      semanticTopSelectedChoiceSelector: "#suggestion-1",
      semanticTopRelationRole: "searchbox",
      semanticTopRelationPath: "agent.semanticSummary.relationItems[0]",
      semanticTopRelationName: "Archive search",
      semanticTopRelation: "activeDescendant",
      semanticTopRelationTarget: "suggestion-1",
      semanticTopRelationTargetRole: "option",
      semanticTopRelationTargetName: "Quarterly reports",
      semanticTopRelationTargetSelector: "#suggestion-1",
      semanticTopRelationSelector: "#q",
    });
  });

  it("keeps selected grid cell state in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/grid", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div role="grid" aria-label="Issue board" aria-rowcount="3" aria-colcount="3">
            <div role="row" aria-rowindex="1">
              <span role="columnheader" aria-colindex="1">ID</span>
              <span role="columnheader" aria-colindex="2">Status</span>
              <span role="columnheader" aria-colindex="3">Owner</span>
            </div>
            <div role="row" aria-rowindex="2">
              <span role="rowheader" aria-colindex="1">BUG-1</span>
              <span role="gridcell" aria-colindex="2" aria-selected="true">Blocked</span>
              <span role="gridcell" aria-colindex="3">Mina</span>
            </div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      status: "ready",
      runbookDecision: "return",
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      staticReadiness: "usable-structured-data",
      staticReadinessReasonCode: "structured-data",
      staticReadinessReadFrom: "agent.semanticSummary",
      primaryExecution: "read-current",
      primaryReadFrom: "agent.semanticSummary",
      primaryAction: {
        action: "read-content",
        execution: "read-current",
        terminal: true,
        readFrom: "agent.semanticSummary",
      },
      semanticTopTableRole: "grid",
      semanticTopTableName: "Issue board",
      semanticTopTableFirstSampleCellText: "Blocked",
      semanticTopTableFirstSampleCellRowIndex: 2,
      semanticTopTableFirstSampleCellColumnIndex: 2,
      semanticTopTableFirstSampleCellSelected: true,
      semanticTopSelectedTableCellText: "Blocked",
      semanticTopSelectedTableCellRowIndex: 2,
      semanticTopSelectedTableCellColumnIndex: 2,
      semanticTopSelectedTableCellSelected: true,
      semanticTopSelectedTableCellSelector: "span:nth-of-type(2)",
    });
  });

  it("keeps selected owned table cell target in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/grid", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <table aria-label="Issue board" aria-owns="owned-rows">
            <tr><th id="id">ID</th><th id="status">Status</th></tr>
          </table>
          <div id="owned-rows" role="rowgroup" aria-label="Virtual rows">
            <div role="row" aria-rowindex="50"><span role="rowheader" aria-colindex="1">BUG-9</span><span role="gridcell" aria-colindex="2" headers="status" aria-selected="true">Blocked</span></div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      semanticTopSelectedTableCellText: "Blocked",
      semanticTopSelectedTableCellRowIndex: 50,
      semanticTopSelectedTableCellColumnIndex: 2,
      semanticTopSelectedTableCellSelected: true,
      semanticTopSelectedTableCellOwnedTarget: "owned-rows",
    });
  });

  it("keeps semantic selectors and core states in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/relations", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <input id="q" type="search" aria-label="Archive search" aria-activedescendant="suggestion-1" aria-details="q-details" aria-errormessage="q-error" aria-required="true" aria-readonly="true" aria-haspopup="listbox" aria-controls="category">
          <div id="category" role="listbox" aria-label="Categories"></div>
          <p id="q-details">Search across public and private archive records.</p>
          <p id="q-error">Use at least two letters.</p>
          <div id="suggestion-1" role="option" aria-selected="true" aria-current="page" aria-level="2">Quarterly reports</div>
          <dialog id="filters" open aria-label="Filter reports" aria-modal="true"></dialog>
          <div role="status" aria-live="polite">Saved</div>
          <p>Readable page content for relation routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      semanticDescriptionCount: expect.any(Number),
      semanticValueCount: expect.any(Number),
      semanticRelationCount: expect.any(Number),
      semanticChoiceCount: expect.any(Number),
      semanticStateCount: expect.any(Number),
      semanticTopOutlineSelector: "main",
      semanticTopFieldRole: "searchbox",
      semanticTopFieldSelector: "#q",
      semanticTopRelation: "controls",
      semanticTopRelationTargetSelector: "#category",
      semanticTopRelationSelector: "#q",
      semanticTopChoiceRole: "option",
      semanticTopChoiceSelected: true,
      semanticTopChoiceCurrent: "page",
      semanticTopChoiceLevel: 2,
      semanticTopChoiceSelector: "#suggestion-1",
      semanticTopSelectedChoiceRole: "option",
      semanticTopSelectedChoiceName: "Quarterly reports",
      semanticTopSelectedChoiceState: "selected=true current=page",
      semanticTopSelectedChoiceSelected: true,
      semanticTopSelectedChoiceCurrent: "page",
      semanticTopSelectedChoiceLevel: 2,
      semanticTopSelectedChoiceSelector: "#suggestion-1",
      semanticTopStateRole: "searchbox",
      semanticTopStateRequired: true,
      semanticTopStateReadonly: true,
      semanticTopStateHaspopup: "listbox",
      semanticTopStateControls: "category",
      semanticTopStateSelector: "#q",
      semanticTopModalStateRole: "dialog",
      semanticTopModalStateName: "Filter reports",
      semanticTopModalState: "modal=true",
      semanticTopModalStateSelector: "#filters",
      semanticTopLiveStateRole: "status",
      semanticTopLiveState: "live=polite",
      semanticTopLiveStateLive: "polite",
      semanticTopLiveStateSelector: "div:nth-of-type(3)",
    });
  });

  it("keeps selected tab panel targets in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/tabs", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <div role="tablist" aria-label="Report sections">
            <button id="tab-overview" role="tab" aria-selected="false" aria-controls="panel-overview">Overview</button>
            <button id="tab-details" role="tab" aria-selected="true" aria-controls="panel-details">Details</button>
          </div>
          <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden>Overview content</section>
          <section id="panel-details" role="tabpanel" aria-labelledby="tab-details">Detailed report content</section>
          <p>Readable report tab content.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      semanticTopSelectedChoiceRole: "tab",
      semanticTopSelectedChoiceName: "Details",
      semanticTopSelectedChoiceState: "selected=true controls=panel-details",
      semanticTopSelectedChoiceSelected: true,
      semanticTopSelectedChoiceControls: "panel-details",
      semanticTopSelectedChoiceControlsTargetRole: "tabpanel",
      semanticTopSelectedChoiceControlsTargetName: "Details",
      semanticTopSelectedChoiceControlsTargetSelector: "#panel-details",
    });
  });

  it("keeps top actionable semantic selectors in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/actions", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <a href="#content" aria-current="location">Skip to content</a>
          <button type="button" aria-label="Open filters" aria-haspopup="dialog">Filters</button>
          <img src="/chart.png" alt="Revenue chart" width="640" height="320">
          <section id="content"><h1>Report</h1><p>Readable report content.</p></section>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      semanticTopInteractiveName: "Skip to content",
      semanticTopInteractiveSelector: "a",
      semanticTopFocusableName: "Skip to content",
      semanticTopFocusableSelector: "a",
      semanticTopLinkName: "Skip to content",
      semanticTopLinkSelector: "a",
      semanticTopInPageLinkName: "Skip to content",
      semanticTopInPageLinkSelector: "a",
      semanticTopButtonName: "Open filters",
      semanticTopButtonSelector: "button",
      semanticTopImageName: "Revenue chart",
      semanticTopImageSelector: "img",
    });
  });

  it("exposes semantic table and list shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/report", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Quarterly report</h1>
          <table aria-label="Revenue by quarter">
            <tr><th>Quarter</th><th>Revenue</th></tr>
            <tr><td>Q1</td><td>$10</td></tr>
            <tr><td>Q2</td><td>$12</td></tr>
          </table>
          <ul aria-label="Highlights">
            <li aria-posinset="1" aria-setsize="2" aria-current="page">North region grew</li>
            <li aria-posinset="2" aria-setsize="2" aria-expanded="false">Renewals improved</li>
          </ul>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.semanticSummary).toMatchObject({
      tableCount: 1,
      listCount: 1,
      tableItems: [
        expect.objectContaining({
          path: "agent.semanticSummary.tableItems[0]",
          role: "table",
          name: "Revenue by quarter",
          rowCount: 3,
          cellCount: 6,
          selector: "table",
        }),
      ],
      listItems: [
        expect.objectContaining({
          path: "agent.semanticSummary.listItems[0]",
          role: "list",
          name: "Highlights",
          itemCount: 2,
          sampleItems: ["North region grew", "Renewals improved"],
          itemRefs: [
            { text: "North region grew", role: "listitem", posInSet: 1, setSize: 2, current: "page", selector: "li" },
            { text: "Renewals improved", role: "listitem", posInSet: 2, setSize: 2, expanded: false, selector: "li:nth-of-type(2)" },
          ],
          selector: "ul",
        }),
      ],
    });
    expect(envelope.agent).toMatchObject({
      semanticTableCount: 1,
      semanticListCount: 1,
      semanticTopTableRole: "table",
      semanticTopTablePath: "agent.semanticSummary.tableItems[0]",
      semanticTopTableName: "Revenue by quarter",
      semanticTopTableRowCount: 3,
      semanticTopTableColumnCount: 2,
      semanticTopTableCellCount: 6,
      semanticTopTableSelector: "table",
      semanticTopListRole: "list",
      semanticTopListPath: "agent.semanticSummary.listItems[0]",
      semanticTopListName: "Highlights",
      semanticTopListItemCount: 2,
      semanticTopListItems: ["North region grew", "Renewals improved"],
      semanticTopListItemRefs: [
        { text: "North region grew", role: "listitem", posInSet: 1, setSize: 2, current: "page", selector: "li" },
        { text: "Renewals improved", role: "listitem", posInSet: 2, setSize: 2, expanded: false, selector: "li:nth-of-type(2)" },
      ],
      semanticTopListFirstItemText: "North region grew",
      semanticTopListFirstItemRole: "listitem",
      semanticTopListFirstItemPosInSet: 1,
      semanticTopListFirstItemSetSize: 2,
      semanticTopListFirstItemCurrent: "page",
      semanticTopListFirstItemSelector: "li",
      semanticTopListSelector: "ul",
    });
  });

  it("keeps semantic table and list container selectors in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/report", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Quarterly report</h1>
          <table aria-label="Revenue by quarter">
            <tr><th>Quarter</th><th>Revenue</th></tr>
            <tr><td rowspan="2" colspan="2">Q1 combined</td></tr>
            <tr></tr>
          </table>
          <ul aria-label="Highlights">
            <li aria-posinset="1" aria-setsize="2" aria-current="page">North region grew</li>
            <li aria-posinset="2" aria-setsize="2">Renewals improved</li>
          </ul>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      semanticTopTableRole: "table",
      semanticTopTablePath: "agent.semanticSummary.tableItems[0]",
      semanticTopTableName: "Revenue by quarter",
      semanticTopTableFirstSampleCellText: "Q1 combined",
      semanticTopTableFirstSampleCellRowSpan: 2,
      semanticTopTableFirstSampleCellColumnSpan: 2,
      semanticTopTableSelector: "table",
      semanticTopListRole: "list",
      semanticTopListPath: "agent.semanticSummary.listItems[0]",
      semanticTopListName: "Highlights",
      semanticTopListFirstItemSelector: "li",
      semanticTopListSelector: "ul",
    });
  });

  it("prints first table sample cell spans in text agent output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/report"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Quarterly report</h1>
          <table aria-label="Revenue by quarter">
            <tr><th>Quarter</th><th>Revenue</th></tr>
            <tr><td rowspan="2" colspan="2">Q1 combined</td></tr>
            <tr></tr>
          </table>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("agent\n");
    expect(stdout.output).toContain("  semanticTopTableFirstSampleCell: agent.semanticSummary.tableItems[0].sampleCellRefs[0] Q1 combined rowSpan=2 columnSpan=2");
  });

  it("prints first owned table sample cell in text agent output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/report"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Queue report</h1>
          <table aria-label="Metrics" aria-owns="owned-rows">
            <tr><th id="metric">Metric</th><th id="value">Value</th></tr>
          </table>
          <div id="owned-rows" role="rowgroup" aria-label="Virtual rows">
            <div role="row" aria-rowindex="50"><span role="rowheader" aria-colindex="1">Virtual metric</span><span role="gridcell" aria-colindex="4" headers="value" aria-selected="true">Queued</span></div>
          </div>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("agent\n");
    expect(stdout.output).toContain("  semanticTopTableFirstSampleCell:");
    expect(stdout.output).toContain("ownedTarget=owned-rows");
    expect(stdout.output).toContain("  semanticTopTableFirstOwnedSampleCell:");
    expect(stdout.output).toContain("Queued");
    expect(stdout.output).toContain("ownedTarget=owned-rows");
    expect(stdout.output).toContain("  semanticTopSelectedTableCell:");
    expect(stdout.output).toContain("selected=true");
    expect(stdout.output).toContain("ownedTarget=owned-rows");
  });

  it("keeps list sample text when list items compact to links in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/releases", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <ul aria-label="Release actions">
            <li><a href="/download">Download report</a></li>
          </ul>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      semanticTopListRole: "list",
      semanticTopListName: "Release actions",
      semanticTopListItems: ["Download report"],
      semanticTopListSelector: "ul",
    });
  });

  it("summarizes forms with action fields and query URL templates for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/search", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Search archive</h1>
          <form id="archive-form" name="archive" method="GET" action="/find" target="_blank" enctype="multipart/form-data" accept-charset="UTF-8" novalidate>
            <label id="q-label" for="q">Archive search</label>
            <p id="q-help">Use product or report keywords.</p>
            <input id="q" name="query" type="search" placeholder="Search reports" aria-placeholder="Report keyword" autocomplete="off" aria-autocomplete="list" inputmode="search" pattern="[A-Za-z0-9 ]+" min="1" max="99" step="1" minlength="2" maxlength="80" required readonly aria-disabled="true" aria-invalid="spelling" aria-expanded="true" aria-haspopup="listbox" aria-controls="category" aria-labelledby="q-label" aria-describedby="q-help">
            <select name="category"><option aria-posinset="1" aria-setsize="2">All</option><option>Reports</option></select>
            <input type="hidden" name="csrf" value="secret">
            <button type="submit" name="submit-search" value="go" disabled>Search</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.forms).toEqual([
      {
        id: "f1",
        path: "pageCheck.forms[0]",
        rank: 1,
        method: "get",
        actionUrl: "https://example.test/find",
        formId: "archive-form",
        formName: "archive",
        formTarget: "_blank",
        formEncType: "multipart/form-data",
        formAcceptCharset: "UTF-8",
        formNoValidate: true,
        fieldCount: 2,
        hiddenFieldCount: 1,
        submitText: "Search",
        submitType: "submit",
        submitName: "submit-search",
        submitValue: "go",
        submitDisabled: true,
        submitSelector: "button[name=\"submit-search\"]",
        queryField: "query",
        urlTemplate: "https://example.test/find?query=%7Bquery%7D",
        selector: "form:nth-of-type(1)",
        text: "GET https://example.test/find; query field: query; hidden fields: 1; submit: Search; query:search required Archive search; category:select options=All|Reports selected=All",
        hiddenFields: [
          {
            name: "csrf",
            value: "secret",
            selector: "input[name=\"csrf\"]",
          },
        ],
        fields: [
          {
            name: "query",
            type: "search",
            label: "Archive search",
            placeholder: "Search reports",
            autocomplete: "off",
            inputMode: "search",
            pattern: "[A-Za-z0-9 ]+",
            min: "1",
            max: "99",
            step: "1",
            minLength: 2,
            maxLength: 80,
            required: true,
            disabled: true,
            readonly: true,
            invalid: "spelling",
            selector: "input[name=\"query\"]",
          },
          {
            name: "category",
            type: "select",
            selector: "select[name=\"category\"]",
            options: ["All", "Reports"],
            selectedOption: "All",
            selectedValue: "All",
          },
        ],
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 form");
    expect(envelope.agent.semanticSummary.fieldCount).toBe(2);
    expect(envelope.agent.semanticSummary.choiceCount).toBe(2);
    expect(envelope.agent.semanticSummary.stateCount).toBe(2);
    expect(envelope.agent.semanticSummary.fieldItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.fieldItems[0]",
        role: "searchbox",
        name: "Archive search",
        description: "Use product or report keywords.",
        htmlName: "query",
        htmlType: "search",
        placeholder: "Search reports",
        ariaPlaceholder: "Report keyword",
        autocomplete: "off",
        ariaAutocomplete: "list",
        inputMode: "search",
        pattern: "[A-Za-z0-9 ]+",
        min: "1",
        max: "99",
        step: "1",
        minLength: 2,
        maxLength: 80,
        labelledBy: "q-label",
        labelledByText: "Archive search",
        describedBy: "q-help",
        describedByText: "Use product or report keywords.",
        selector: "#q",
        state: expect.objectContaining({ disabled: true, required: true, readonly: true, invalid: "spelling", expanded: true, haspopup: "listbox", controls: "category" }),
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.fieldItems[1]",
        role: "combobox",
        htmlName: "category",
        selector: "select",
      }),
    ]);
    expect(envelope.agent.semanticSummary.choiceItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.choiceItems[0]",
        role: "option",
        name: "All",
        posInSet: 1,
        setSize: 2,
        selector: "option",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.choiceItems[1]",
        role: "option",
        name: "Reports",
        selector: "option:nth-of-type(2)",
      }),
    ]);
    expect(envelope.agent.semanticSummary.stateItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.stateItems[0]",
        role: "searchbox",
        name: "Archive search",
        state: "disabled=true required=true readonly=true expanded=true invalid=spelling haspopup=listbox controls=category",
        stateRaw: { disabled: true, required: true, readonly: true, invalid: "spelling", expanded: true, haspopup: "listbox", controls: "category" },
        selector: "#q",
      }),
      expect.objectContaining({
        path: "agent.semanticSummary.stateItems[1]",
        role: "button",
        name: "Search",
        state: "disabled=true",
        stateRaw: { disabled: true },
        selector: "button",
      }),
    ]);
    expect(envelope.agent).toMatchObject({
      semanticFieldCount: 2,
      semanticChoiceCount: 2,
      semanticStateCount: 2,
      semanticTopFieldRole: "searchbox",
      semanticTopFieldPath: "agent.semanticSummary.fieldItems[0]",
      semanticTopFieldName: "Archive search",
      semanticTopFieldDescription: "Use product or report keywords.",
      semanticTopFieldHtmlName: "query",
      semanticTopFieldHtmlType: "search",
      semanticTopFieldPlaceholder: "Search reports",
      semanticTopFieldAriaPlaceholder: "Report keyword",
      semanticTopFieldAutocomplete: "off",
      semanticTopFieldAriaAutocomplete: "list",
      semanticTopFieldInputMode: "search",
      semanticTopFieldPattern: "[A-Za-z0-9 ]+",
      semanticTopFieldMin: "1",
      semanticTopFieldMax: "99",
      semanticTopFieldStep: "1",
      semanticTopFieldMinLength: 2,
      semanticTopFieldMaxLength: 80,
      semanticTopFieldLabelledBy: "q-label",
      semanticTopFieldLabelledByText: "Archive search",
      semanticTopFieldDescribedBy: "q-help",
      semanticTopFieldDescribedByText: "Use product or report keywords.",
      semanticTopFieldState: "disabled=true required=true readonly=true expanded=true invalid=spelling haspopup=listbox controls=category",
      semanticTopFieldDisabled: true,
      semanticTopFieldRequired: true,
      semanticTopFieldReadonly: true,
      semanticTopFieldInvalid: "spelling",
      semanticTopFieldExpanded: true,
      semanticTopFieldHaspopup: "listbox",
      semanticTopFieldControls: "category",
      semanticTopFieldSelector: "#q",
      semanticTopChoiceRole: "option",
      semanticTopChoicePath: "agent.semanticSummary.choiceItems[0]",
      semanticTopChoiceName: "All",
      semanticTopChoicePosInSet: 1,
      semanticTopChoiceSetSize: 2,
      semanticTopChoiceSelector: "option",
      semanticTopStateRole: "searchbox",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopStateName: "Archive search",
      semanticTopState: "disabled=true required=true readonly=true expanded=true invalid=spelling haspopup=listbox controls=category",
      semanticTopStateDisabled: true,
      semanticTopStateRequired: true,
      semanticTopStateReadonly: true,
      semanticTopStateExpanded: true,
      semanticTopStateInvalid: "spelling",
      semanticTopStateHaspopup: "listbox",
      semanticTopStateControls: "category",
      semanticTopStateSelector: "#q",
    });
    expect(envelope.agent.formCount).toBe(1);
    expect(envelope.agent.formChoiceCount).toBe(1);
    expect(envelope.agent).toMatchObject({
      topFormChoicePath: "pageCheck.forms[0]",
      topFormChoiceMethod: "get",
      topFormChoiceActionUrl: "https://example.test/find",
      topFormChoiceFormId: "archive-form",
      topFormChoiceFormName: "archive",
      topFormChoiceFormTarget: "_blank",
      topFormChoiceFormEncType: "multipart/form-data",
      topFormChoiceFormAcceptCharset: "UTF-8",
      topFormChoiceFormNoValidate: true,
      topFormChoiceSubmitText: "Search",
      topFormChoiceSubmitType: "submit",
      topFormChoiceSubmitName: "submit-search",
      topFormChoiceSubmitValue: "go",
      topFormChoiceSubmitDisabled: true,
      topFormChoiceSubmitSelector: "button[name=\"submit-search\"]",
      topFormChoiceQueryField: "query",
      topFormChoiceUrlTemplate: "https://example.test/find?query=%7Bquery%7D",
      topFormChoiceFieldCount: 2,
      topFormChoiceHiddenFieldCount: 1,
      topFormChoiceSelector: "form:nth-of-type(1)",
      topFormChoiceFirstHiddenFieldName: "csrf",
      topFormChoiceFirstHiddenFieldValue: "secret",
      topFormChoiceFirstHiddenFieldSelector: "input[name=\"csrf\"]",
      topFormChoiceFirstFieldName: "query",
      topFormChoiceFirstFieldType: "search",
      topFormChoiceFirstFieldLabel: "Archive search",
      topFormChoiceFirstFieldPlaceholder: "Search reports",
      topFormChoiceFirstFieldAutocomplete: "off",
      topFormChoiceFirstFieldInputMode: "search",
      topFormChoiceFirstFieldPattern: "[A-Za-z0-9 ]+",
      topFormChoiceFirstFieldMin: "1",
      topFormChoiceFirstFieldMax: "99",
      topFormChoiceFirstFieldStep: "1",
      topFormChoiceFirstFieldMinLength: 2,
      topFormChoiceFirstFieldMaxLength: 80,
      topFormChoiceFirstFieldRequired: true,
      topFormChoiceFirstFieldDisabled: true,
      topFormChoiceFirstFieldReadonly: true,
      topFormChoiceFirstFieldInvalid: "spelling",
      topFormChoiceFirstFieldSelector: "input[name=\"query\"]",
    });
    expect(envelope.agent.formChoices).toEqual([
      expect.objectContaining({
        id: "f1",
        path: "pageCheck.forms[0]",
        method: "get",
        actionUrl: "https://example.test/find",
        formId: "archive-form",
        formName: "archive",
        formTarget: "_blank",
        formEncType: "multipart/form-data",
        formAcceptCharset: "UTF-8",
        formNoValidate: true,
        hiddenFieldCount: 1,
        submitType: "submit",
        submitName: "submit-search",
        submitValue: "go",
        submitDisabled: true,
        submitSelector: "button[name=\"submit-search\"]",
        urlTemplate: "https://example.test/find?query=%7Bquery%7D",
        queryField: "query",
        selector: "form:nth-of-type(1)",
        hiddenFields: expect.arrayContaining([
          expect.objectContaining({
            name: "csrf",
            value: "secret",
            selector: "input[name=\"csrf\"]",
          }),
        ]),
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: "query",
            type: "search",
            selector: "input[name=\"query\"]",
          }),
        ]),
      }),
    ]);
    expect(envelope.agent.actionTargetCount).toBe(0);
    expect(envelope.agent.actionTargetChoiceCount).toBe(0);
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.forms",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.forms",
      count: 1,
      primary: true,
      reason: "Form action, method, field names, labels, and query URL templates extracted from the page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.forms",
      value: [
        expect.objectContaining({
          id: "f1",
          urlTemplate: "https://example.test/find?query=%7Bquery%7D",
          queryField: "query",
        }),
      ],
    });
  });

  it("uses a matching selector for implicit submit buttons", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/search", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="GET" action="/find">
            <label for="q">Query</label>
            <input id="q" name="q" type="search">
            <button>Search</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.forms[0]).toMatchObject({
      submitText: "Search",
      submitType: "submit",
      submitSelector: "button:nth-of-type(1)",
    });
    expect(envelope.agent).toMatchObject({
      topFormChoiceSubmitText: "Search",
      topFormChoiceSubmitType: "submit",
      topFormChoiceSubmitSelector: "button:nth-of-type(1)",
    });
    expect(envelope.agent.formChoices[0]).toMatchObject({
      submitText: "Search",
      submitType: "submit",
      submitSelector: "button:nth-of-type(1)",
    });
  });

  it("applies submit button form overrides to form handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/search", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="POST" action="/default">
            <label for="q">Query</label>
            <input id="q" name="q" type="search">
            <button type="submit" formaction="/override" formmethod="GET" formtarget="_blank" formenctype="multipart/form-data" formnovalidate form="remote-form">Search archive</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.forms[0]).toMatchObject({
      method: "get",
      actionUrl: "https://example.test/override",
      submitText: "Search archive",
      submitType: "submit",
      submitSelector: "button[type=\"submit\"]:nth-of-type(1)",
      submitFormActionUrl: "https://example.test/override",
      submitFormMethod: "get",
      submitFormTarget: "_blank",
      submitFormEncType: "multipart/form-data",
      submitFormNoValidate: true,
      submitFormId: "remote-form",
      queryField: "q",
      urlTemplate: "https://example.test/override?q=%7Bquery%7D",
    });
    expect(envelope.agent).toMatchObject({
      topFormChoiceMethod: "get",
      topFormChoiceActionUrl: "https://example.test/override",
      topFormChoiceSubmitFormActionUrl: "https://example.test/override",
      topFormChoiceSubmitFormMethod: "get",
      topFormChoiceSubmitFormTarget: "_blank",
      topFormChoiceSubmitFormEncType: "multipart/form-data",
      topFormChoiceSubmitFormNoValidate: true,
      topFormChoiceSubmitFormId: "remote-form",
      topFormChoiceUrlTemplate: "https://example.test/override?q=%7Bquery%7D",
    });
    expect(envelope.agent.formChoices[0]).toMatchObject({
      method: "get",
      actionUrl: "https://example.test/override",
      submitFormActionUrl: "https://example.test/override",
      submitFormMethod: "get",
      submitFormTarget: "_blank",
      submitFormEncType: "multipart/form-data",
      submitFormNoValidate: true,
      submitFormId: "remote-form",
      urlTemplate: "https://example.test/override?q=%7Bquery%7D",
    });
  });

  it("exposes checked semantic field shortcuts for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/consent", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <label><input id="consent" name="consent" type="checkbox" checked> Email me updates</label>
          <p>Readable page content for consent routing.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.semanticSummary.fieldItems).toEqual([
      expect.objectContaining({
        path: "agent.semanticSummary.fieldItems[0]",
        role: "checkbox",
        name: "Email me updates",
        htmlName: "consent",
        htmlType: "checkbox",
        state: expect.objectContaining({ checked: true }),
        selector: "#consent",
      }),
    ]);
    expect(envelope.agent).toMatchObject({
      semanticTopFieldRole: "checkbox",
      semanticTopFieldPath: "agent.semanticSummary.fieldItems[0]",
      semanticTopFieldName: "Email me updates",
      semanticTopFieldHtmlName: "consent",
      semanticTopFieldHtmlType: "checkbox",
      semanticTopFieldState: "checked=true",
      semanticTopFieldChecked: true,
      semanticTopFieldSelector: "#consent",
    });
  });

  it("preserves checked form fields for submission handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/preferences", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="POST" action="/prefs">
            <label><input name="subscribe" type="checkbox" value="yes" checked> Email updates</label>
            <button>Save</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.forms[0].fields[0]).toMatchObject({
      name: "subscribe",
      type: "checkbox",
      label: "Email updates",
      value: "yes",
      checked: true,
      selector: "input[name=\"subscribe\"]",
    });
    expect(envelope.agent).toMatchObject({
      topFormChoiceFirstFieldName: "subscribe",
      topFormChoiceFirstFieldType: "checkbox",
      topFormChoiceFirstFieldValue: "yes",
      topFormChoiceFirstFieldChecked: true,
      topFormChoiceFirstFieldSelector: "input[name=\"subscribe\"]",
    });
    expect(envelope.agent.formChoices[0].fields[0]).toMatchObject({
      name: "subscribe",
      type: "checkbox",
      value: "yes",
      checked: true,
    });
  });

  it("preserves selected select option values for submission handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/filter", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="GET" action="/reports">
            <label for="category">Category</label>
            <select id="category" name="category">
              <option value="all">All</option>
              <option value="reports" selected>Reports</option>
            </select>
            <button>Apply</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.forms[0].fields[0]).toMatchObject({
      name: "category",
      type: "select",
      label: "Category",
      options: ["All", "Reports"],
      selectedOption: "Reports",
      selectedValue: "reports",
      selector: "select[name=\"category\"]",
    });
    expect(envelope.agent).toMatchObject({
      topFormChoiceFirstFieldName: "category",
      topFormChoiceFirstFieldType: "select",
      topFormChoiceFirstFieldOptions: ["All", "Reports"],
      topFormChoiceFirstFieldSelectedOption: "Reports",
      topFormChoiceFirstFieldSelectedValue: "reports",
      topFormChoiceFirstFieldSelector: "select[name=\"category\"]",
    });
    expect(envelope.agent.formChoices[0].fields[0]).toMatchObject({
      name: "category",
      type: "select",
      options: ["All", "Reports"],
      selectedOption: "Reports",
      selectedValue: "reports",
    });
  });

  it("preserves textarea default text for submission handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/contact", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="POST" action="/contact">
            <label for="message">Message</label>
            <textarea id="message" name="message">Existing draft</textarea>
            <button>Send</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.forms[0].fields[0]).toMatchObject({
      name: "message",
      type: "textarea",
      label: "Message",
      value: "Existing draft",
      selector: "textarea[name=\"message\"]",
    });
    expect(envelope.agent).toMatchObject({
      topFormChoiceFirstFieldName: "message",
      topFormChoiceFirstFieldType: "textarea",
      topFormChoiceFirstFieldValue: "Existing draft",
      topFormChoiceFirstFieldSelector: "textarea[name=\"message\"]",
    });
    expect(envelope.agent.formChoices[0].fields[0]).toMatchObject({
      name: "message",
      type: "textarea",
      value: "Existing draft",
    });
  });

  it("preserves image submit controls for submission handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/image-search", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="GET" action="/image-search">
            <label for="q">Query</label>
            <input id="q" name="q" type="search">
            <input type="image" name="go" value="1" alt="Search with image button" src="/search.png">
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.forms[0]).toMatchObject({
      submitText: "Search with image button",
      submitType: "image",
      submitName: "go",
      submitValue: "1",
      submitSelector: "input[name=\"go\"]",
    });
    expect(envelope.agent).toMatchObject({
      topFormChoiceSubmitText: "Search with image button",
      topFormChoiceSubmitType: "image",
      topFormChoiceSubmitName: "go",
      topFormChoiceSubmitValue: "1",
      topFormChoiceSubmitSelector: "input[name=\"go\"]",
    });
    expect(envelope.agent.formChoices[0]).toMatchObject({
      submitText: "Search with image button",
      submitType: "image",
      submitName: "go",
      submitValue: "1",
      submitSelector: "input[name=\"go\"]",
    });
  });

  it("keeps executable form details in brief read handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/search", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="GET" action="/find">
            <label for="q">Archive search</label>
            <input id="q" name="query" type="search" placeholder="Search reports" required>
            <select name="category"><option>All</option><option>Reports</option></select>
            <button type="submit">Search</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.contract.profile).toBe("brief");
    expect(envelope.agent.formCount).toBe(1);
    expect(envelope.agent.formChoiceCount).toBe(1);
    expect(envelope.agent.formChoices).toEqual([
      expect.objectContaining({
        id: "f1",
        path: "pageCheck.forms[0]",
        actionUrl: "https://example.test/find",
        urlTemplate: "https://example.test/find?query=%7Bquery%7D",
        queryField: "query",
        selector: "form:nth-of-type(1)",
      }),
    ]);
    expect(envelope.agent).toMatchObject({
      topChoiceKind: "form",
      topChoicePath: "pageCheck.forms[0]",
      topChoiceRank: 1,
      topChoiceMethod: "get",
      topChoiceSelector: "form:nth-of-type(1)",
    });
    expect(envelope.agent.actionTargetCount).toBe(0);
    expect(envelope.agent.actionTargetChoiceCount).toBe(0);
    expect(envelope.agent.executor).toMatchObject({
      decision: "return",
      readFrom: "pageCheck.forms",
      readValue: {
        path: "pageCheck.forms",
        value: [
          expect.objectContaining({
            id: "f1",
            path: "pageCheck.forms[0]",
            method: "get",
            actionUrl: "https://example.test/find",
            urlTemplate: "https://example.test/find?query=%7Bquery%7D",
            queryField: "query",
            selector: "form:nth-of-type(1)",
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: "query",
                type: "search",
                selector: "input[name=\"query\"]",
                required: true,
              }),
            ]),
          }),
        ],
      },
    });
    expect(envelope.agent.handoff.readValue).toMatchObject({
      path: "pageCheck.forms",
      value: [
        expect.objectContaining({
          id: "f1",
          text: expect.stringContaining("query field: query"),
          urlTemplate: "https://example.test/find?query=%7Bquery%7D",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "query",
              selector: "input[name=\"query\"]",
            }),
          ]),
        }),
      ],
    });
    expect(envelope.agent.next).toBeUndefined();
    expect(envelope.pageCheck.forms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        urlTemplate: "https://example.test/find?query=%7Bquery%7D",
      }),
    ]));
  });

  it("checks requested text against page form summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/search", "--agent", "--find", "Archive search"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form action="/find">
            <label><span>Archive search</span><input name="q" type="search"></label>
            <button>Go</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "form",
        rank: 1,
        url: "https://example.test/find",
        selector: "form:nth-of-type(1)",
        text: "GET https://example.test/find; query field: q; submit: Go; q:search Archive search",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("uses site search forms before broadening missing verification searches", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/search", "--agent", "--find", "target report"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Search archive</h1>
          <form method="GET" action="/find">
            <label for="q">Archive search</label>
            <input id="q" name="query" type="search" placeholder="Search reports">
            <button type="submit">Search</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "missing",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "open-site-search",
      execution: "run-command",
      url: "https://example.test/find?query=target%20report",
      command: "ax-grep 'https://example.test/find?query=target%20report' --find 'target report' --agent",
      commandArgs: ["ax-grep", "https://example.test/find?query=target%20report", "--find", "target report", "--agent"],
    });
    expect(envelope.agent.handoff).toMatchObject({
      decision: "execute",
      operation: "execute-command",
      action: "open-site-search",
      commandArgs: ["ax-grep", "https://example.test/find?query=target%20report", "--find", "target report", "--agent"],
    });
    expect(envelope.agent.pageDecision).toMatchObject({
      decision: "open-site-search",
      commandArgs: ["ax-grep", "https://example.test/find?query=target%20report", "--find", "target report", "--agent"],
      url: "https://example.test/find?query=target%20report",
    });
    expect(envelope.agent).toMatchObject({
      pageDecisionName: "open-site-search",
      pageDecisionConfidence: expect.stringMatching(/^(low|medium|high)$/),
      pageDecisionUrl: "https://example.test/find?query=target%20report",
      pageDecisionCommandArgs: ["ax-grep", "https://example.test/find?query=target%20report", "--find", "target report", "--agent"],
    });
  });

  it("keeps brief mode when using site search form recovery", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/search", "--agent-brief", "--find", "target report"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <form method="GET" action="/find">
            <input name="query" type="search" aria-label="Archive search">
            <button type="submit">Search</button>
          </form>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(stdout.output).not.toContain("--agent-brief-brief");
    expect(envelope.agent).toMatchObject({
      contract: {
        profile: "brief",
      },
      primaryAction: {
        action: "open-site-search",
        commandArgs: ["ax-grep", "https://example.test/find?query=target%20report", "--find", "target report", "--agent-brief"],
      },
      handoff: {
        instruction: "Run ax-grep 'https://example.test/find?query=target%20report' --find 'target report' --agent-brief and continue with its output.",
        mode: "command",
        action: "open-site-search",
        maxSuggestedIterations: 1,
        priority: "medium",
        reason: "Run the provided command and inspect the next agent payload.",
        commandArgs: ["ax-grep", "https://example.test/find?query=target%20report", "--find", "target report", "--agent-brief"],
      },
    });
    expect(envelope.agent.actions).toBeUndefined();
    expect(envelope.pageCheck.nextSteps).toBeUndefined();
  });

  it("summarizes JSON-LD and OpenSearch action targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <link rel="search" type="application/opensearchdescription+xml" title="Docs OpenSearch" href="/opensearch.xml" aria-disabled="true" aria-expanded="false" aria-haspopup="dialog" aria-controls="docs-search-panel">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "name": "Example Docs",
                "potentialAction": {
                  "@type": "SearchAction",
                  "name": "Search docs",
                  "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": "/search?q={search_term_string}",
                    "httpMethod": "GET",
                    "encodingType": "application/x-www-form-urlencoded"
                  },
                  "query-input": "required name=search_term_string"
                }
              }
            </script>
          </head>
          <body><main><h1>Docs</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.actionTargets).toEqual([
      {
        id: "at1",
        path: "pageCheck.actionTargets[0]",
        rank: 1,
        kind: "search",
        name: "Search docs",
        text: "search: Search docs template=https://example.test/search?q={search_term_string} queryInput=required name=search_term_string method=GET type=application/x-www-form-urlencoded source=json-ld",
        source: "json-ld",
        urlTemplate: "https://example.test/search?q={search_term_string}",
        queryInput: "required name=search_term_string",
        method: "GET",
        encodingType: "application/x-www-form-urlencoded",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "at2",
        path: "pageCheck.actionTargets[1]",
        rank: 2,
        kind: "search",
        name: "Docs OpenSearch",
        text: "search: Docs OpenSearch target=https://example.test/opensearch.xml type=application/opensearchdescription+xml disabled=true expanded=false haspopup=dialog controls=docs-search-panel source=link",
        source: "link",
        targetUrl: "https://example.test/opensearch.xml",
        encodingType: "application/opensearchdescription+xml",
        disabled: true,
        expanded: false,
        haspopup: "dialog",
        controls: "docs-search-panel",
        selector: "link[rel=\"search\"]:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("2 action targets");
    expect(envelope.agent.formCount).toBe(0);
    expect(envelope.agent.actionTargetCount).toBe(2);
    expect(envelope.agent).toMatchObject({
      topActionTargetChoicePath: "pageCheck.actionTargets[0]",
      topActionTargetChoiceKind: "search",
      topActionTargetChoiceName: "Search docs",
      topActionTargetChoiceSource: "json-ld",
      topActionTargetChoiceUrlTemplate: "https://example.test/search?q={search_term_string}",
      topActionTargetChoiceQueryInput: "required name=search_term_string",
      topActionTargetChoiceMethod: "GET",
      topActionTargetChoiceEncodingType: "application/x-www-form-urlencoded",
      topActionTargetChoiceSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
    expect(envelope.agent.actionTargetChoices).toEqual([
      expect.objectContaining({
        id: "at1",
        path: "pageCheck.actionTargets[0]",
        kind: "search",
        name: "Search docs",
        source: "json-ld",
        urlTemplate: "https://example.test/search?q={search_term_string}",
        queryInput: "required name=search_term_string",
        method: "GET",
      }),
      expect.objectContaining({
        id: "at2",
        path: "pageCheck.actionTargets[1]",
        kind: "search",
        name: "Docs OpenSearch",
        source: "link",
        targetUrl: "https://example.test/opensearch.xml",
        disabled: true,
        expanded: false,
        haspopup: "dialog",
        controls: "docs-search-panel",
      }),
    ]);
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.actionTargets",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.actionTargets",
      count: 2,
      primary: true,
      reason: "JSON-LD and OpenSearch action targets with URL templates, query inputs, and methods.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.actionTargets",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "at1",
          urlTemplate: "https://example.test/search?q={search_term_string}",
        }),
      ]),
    });
  });

  it("keeps executable action target details in brief read handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <link rel="search" type="application/opensearchdescription+xml" title="Docs OpenSearch" href="/opensearch.xml" aria-pressed="mixed" aria-haspopup="menu" aria-controls="docs-search-menu">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "name": "Example Docs",
                "potentialAction": {
                  "@type": "SearchAction",
                  "name": "Search docs",
                  "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": "/search?q={search_term_string}",
                    "httpMethod": "GET",
                    "encodingType": "application/x-www-form-urlencoded"
                  },
                  "query-input": "required name=search_term_string"
                }
              }
            </script>
          </head>
          <body><main><h1>Docs</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.contract.profile).toBe("brief");
    expect(envelope.agent.formCount).toBe(0);
    expect(envelope.agent.actionTargetCount).toBe(2);
    expect(envelope.agent.actionTargetChoices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "at1",
        path: "pageCheck.actionTargets[0]",
        kind: "search",
        urlTemplate: "https://example.test/search?q={search_term_string}",
      }),
    ]));
    expect(envelope.agent).toMatchObject({
      topChoiceKind: "action-target",
      topChoicePath: "pageCheck.actionTargets[0]",
      topChoiceRank: 1,
      topChoiceSource: "json-ld",
      topChoiceMethod: "GET",
      topChoiceSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
    expect(envelope.agent.executor).toMatchObject({
      decision: "return",
      readFrom: "pageCheck.actionTargets",
    });
    expect(envelope.agent.handoff.readValue).toMatchObject({
      path: "pageCheck.actionTargets",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "at1",
          path: "pageCheck.actionTargets[0]",
          kind: "search",
          name: "Search docs",
          text: expect.stringContaining("template=https://example.test/search?q={search_term_string}"),
          source: "json-ld",
          urlTemplate: "https://example.test/search?q={search_term_string}",
          queryInput: "required name=search_term_string",
          method: "GET",
          encodingType: "application/x-www-form-urlencoded",
          selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
        }),
        expect.objectContaining({
          id: "at2",
          path: "pageCheck.actionTargets[1]",
          kind: "search",
          targetUrl: "https://example.test/opensearch.xml",
          pressed: "mixed",
          haspopup: "menu",
          controls: "docs-search-menu",
          selector: "link[rel=\"search\"]:nth-of-type(1)",
        }),
      ]),
    });
    expect(envelope.agent.next).toBeUndefined();
    expect(envelope.pageCheck.actionTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        urlTemplate: "https://example.test/search?q={search_term_string}",
      }),
    ]));
  });

  it("checks requested text against structured action targets", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs", "--agent", "--find", "search_term_string"], {
      stdout,
      fetch: async () => new Response(`
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Example Docs",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "/search?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          }
        </script>
        <main><h1>Docs</h1></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "actionTarget",
        rank: 1,
        url: "https://example.test/search?q={search_term_string}",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
        text: "search: Example Docs template=https://example.test/search?q={search_term_string} queryInput=required name=search_term_string source=json-ld",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes hydration data and JSON data endpoints for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script id="__NEXT_DATA__" type="application/json">
              { "buildId": "build-123", "page": "/docs", "props": { "pageProps": { "title": "Docs" } } }
            </script>
            <link rel="preload" as="fetch" href="/api/bootstrap.json" type="application/json">
            <link rel="prefetch" href="/page-data/docs/page-data.json" as="fetch">
          </head>
          <body><main><h1>Docs shell</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.hydration).toEqual([
      {
        id: "hd1",
        path: "pageCheck.hydration[0]",
        rank: 1,
        kind: "next-data",
        label: "Next.js data",
        text: "Next.js data: kind=next-data framework=next route=/docs buildId=build-123 url=https://example.test/_next/data/build-123/docs.json source=script",
        source: "script",
        framework: "next",
        route: "/docs",
        buildId: "build-123",
        url: "https://example.test/_next/data/build-123/docs.json",
        selector: "script#__NEXT_DATA__:nth-of-type(1)",
      },
      {
        id: "hd2",
        path: "pageCheck.hydration[1]",
        rank: 2,
        kind: "fetch-preload",
        label: "Fetch preload",
        text: "Fetch preload: kind=fetch-preload url=https://example.test/api/bootstrap.json source=link",
        source: "link",
        url: "https://example.test/api/bootstrap.json",
        selector: "link[rel=\"preload\"]:nth-of-type(1)",
      },
      {
        id: "hd3",
        path: "pageCheck.hydration[2]",
        rank: 3,
        kind: "gatsby-data",
        label: "Gatsby page data",
        text: "Gatsby page data: kind=gatsby-data url=https://example.test/page-data/docs/page-data.json source=link",
        source: "link",
        url: "https://example.test/page-data/docs/page-data.json",
        selector: "link[rel=\"prefetch\"]:nth-of-type(2)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 hydration hints");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.hydration",
    });
    expect(envelope.agent).toMatchObject({
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      staticReadiness: "usable-hidden-data",
      staticReadinessReasonCode: "hidden-data",
      staticReadinessReadFrom: "pageCheck.hydration",
      staticReadinessReason: expect.stringContaining("hidden app data"),
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.hydration",
      count: 3,
      primary: true,
      reason: "Hydration scripts and preloaded JSON data endpoints extracted from app-shell HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.hydration",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "hd1",
          buildId: "build-123",
        }),
      ]),
    });
  });

  it("keeps fetched-html usability in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script id="__NEXT_DATA__" type="application/json">
              { "buildId": "build-123", "page": "/docs", "props": { "pageProps": { "title": "Docs" } } }
            </script>
          </head>
          <body><main><h1>Docs shell</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      staticReadiness: "usable-hidden-data",
      staticReadinessReasonCode: "hidden-data",
      staticReadinessReadFrom: "pageCheck.hydration",
    });
  });

  it("checks requested text against hydration hints", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs", "--agent", "--find", "build-123"], {
      stdout,
      fetch: async () => new Response(`
        <head>
          <script id="__NEXT_DATA__" type="application/json">
            { "buildId": "build-123", "page": "/docs" }
          </script>
        </head>
        <main><h1>Docs shell</h1></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "hydration",
        rank: 1,
        url: "https://example.test/_next/data/build-123/docs.json",
        selector: "script#__NEXT_DATA__:nth-of-type(1)",
        text: "Next.js data: kind=next-data framework=next route=/docs buildId=build-123 url=https://example.test/_next/data/build-123/docs.json source=script",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes inline script API endpoints for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script>
              fetch("/api/search?q=agent", { method: "POST" });
              axios.get("/v1/users");
              xhr.open("DELETE", "/rest/items/42");
              const stream = new EventSource("/events/live");
              fetch("/graphql", { method: "POST" });
            </script>
          </head>
          <body><main><h1>App shell</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.apiEndpoints).toEqual([
      {
        id: "api1",
        path: "pageCheck.apiEndpoints[0]",
        rank: 1,
        kind: "fetch",
        method: "POST",
        url: "https://example.test/api/search?q=agent",
        text: "fetch POST https://example.test/api/search?q=agent",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "api2",
        path: "pageCheck.apiEndpoints[1]",
        rank: 2,
        kind: "graphql",
        method: "POST",
        url: "https://example.test/graphql",
        text: "graphql POST https://example.test/graphql",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "api3",
        path: "pageCheck.apiEndpoints[2]",
        rank: 3,
        kind: "axios",
        method: "GET",
        url: "https://example.test/v1/users",
        text: "axios GET https://example.test/v1/users",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "api4",
        path: "pageCheck.apiEndpoints[3]",
        rank: 4,
        kind: "xhr",
        method: "DELETE",
        url: "https://example.test/rest/items/42",
        text: "xhr DELETE https://example.test/rest/items/42",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "api5",
        path: "pageCheck.apiEndpoints[4]",
        rank: 5,
        kind: "event-stream",
        method: "GET",
        url: "https://example.test/events/live",
        text: "event-stream GET https://example.test/events/live",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("5 API endpoints");
    expect(envelope.agent.hiddenSignalCount).toBe(5);
    expect(envelope.agent.hiddenHydrationCount).toBe(0);
    expect(envelope.agent.hiddenApiEndpointCount).toBe(5);
    expect(envelope.agent.hiddenClientStateCount).toBe(0);
    expect(envelope.agent.hiddenAppHintCount).toBe(0);
    expect(envelope.agent.hiddenReadTargetCount).toBe(1);
    expect(envelope.agent).toMatchObject({
      topHiddenSignalGroup: "apiEndpoints",
      topHiddenSignalPath: "pageCheck.apiEndpoints[0]",
      topHiddenSignalKind: "fetch",
      topHiddenSignalText: "fetch POST https://example.test/api/search?q=agent",
      topHiddenSignalUrl: "https://example.test/api/search?q=agent",
      topHiddenSignalSource: "script",
      topHiddenSignalSelector: "script:nth-of-type(1)",
      topApiEndpointPath: "pageCheck.apiEndpoints[0]",
      topApiEndpointKind: "fetch",
      topApiEndpointMethod: "POST",
      topApiEndpointUrl: "https://example.test/api/search?q=agent",
      topApiEndpointSelector: "script:nth-of-type(1)",
      bestHiddenReadTarget: "pageCheck.apiEndpoints",
      bestHiddenReadTargetCount: 5,
      bestHiddenReadTargetPrimary: true,
      bestHiddenReadTargetReason: "Inline script API, GraphQL, XHR, and event-stream endpoint hints extracted from page HTML.",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.apiEndpoints",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.apiEndpoints",
      count: 5,
      primary: true,
      reason: "Inline script API, GraphQL, XHR, and event-stream endpoint hints extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.apiEndpoints",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "api2",
          url: "https://example.test/graphql",
        }),
      ]),
    });
  });

  it("inlines small hidden read values in agent handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script>fetch("/api/agent-report");</script>
          </head>
          <body><main><h1>App shell</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      readFrom: "pageCheck.apiEndpoints",
    });
    expect(envelope.agent.handoff.readValue).toMatchObject({
      path: "pageCheck.apiEndpoints",
      value: [
        expect.objectContaining({
          id: "api1",
          url: "https://example.test/api/agent-report",
        }),
      ],
    });
  });

  it("keeps author and hidden read target reasons in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <title>App shell</title>
            <link rel="author" href="/authors/jane" title="Jane Doe">
            <script>
              fetch("/api/search?q=agent", { method: "POST" });
              fetch("/graphql", { method: "POST" });
            </script>
          </head>
          <body><main><h1>App shell</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      authorLinkCount: 1,
      topAuthorLinkName: "Jane Doe",
      topAuthorLinkUrl: "https://example.test/authors/jane",
      topAuthorLinkSource: "link",
      bestHiddenReadTarget: "pageCheck.apiEndpoints",
      bestHiddenReadTargetCount: 2,
      bestHiddenReadTargetPrimary: true,
      bestHiddenReadTargetReason: "Inline script API, GraphQL, XHR, and event-stream endpoint hints extracted from page HTML.",
    });
  });

  it("checks requested text against API endpoint hints", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent", "--find", "/api/search"], {
      stdout,
      fetch: async () => new Response(`
        <script>
          fetch("/api/search?q=agent", { method: "POST" });
        </script>
        <main><h1>App shell</h1></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "apiEndpoint",
        rank: 1,
        url: "https://example.test/api/search?q=agent",
        selector: "script:nth-of-type(1)",
        text: "fetch POST https://example.test/api/search?q=agent",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes inline script client state hints for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script>
              localStorage.setItem("feature:beta", "1");
              sessionStorage.getItem("returnTo");
              localStorage.removeItem("draft-id");
              window.localStorage["theme"] = "dark";
              document.cookie = "locale=en; path=/";
              if (document.cookie.includes("consent=")) {}
              Cookies.get("auth_hint");
            </script>
          </head>
          <body><main><h1>App shell</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.clientState).toEqual([
      {
        id: "cs1",
        path: "pageCheck.clientState[0]",
        rank: 1,
        kind: "local-storage",
        operation: "write",
        key: "feature:beta",
        text: "local-storage write feature:beta",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cs2",
        path: "pageCheck.clientState[1]",
        rank: 2,
        kind: "session-storage",
        operation: "read",
        key: "returnTo",
        text: "session-storage read returnTo",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cs3",
        path: "pageCheck.clientState[2]",
        rank: 3,
        kind: "local-storage",
        operation: "delete",
        key: "draft-id",
        text: "local-storage delete draft-id",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cs4",
        path: "pageCheck.clientState[3]",
        rank: 4,
        kind: "local-storage",
        operation: "write",
        key: "theme",
        text: "local-storage write theme",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cs5",
        path: "pageCheck.clientState[4]",
        rank: 5,
        kind: "cookie",
        operation: "write",
        key: "locale",
        text: "cookie write locale",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cs6",
        path: "pageCheck.clientState[5]",
        rank: 6,
        kind: "cookie",
        operation: "read",
        key: "consent",
        text: "cookie read consent",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cs7",
        path: "pageCheck.clientState[6]",
        rank: 7,
        kind: "cookie",
        operation: "read",
        key: "auth_hint",
        text: "cookie read auth_hint",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("7 client state hints");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.clientState",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.clientState",
      count: 7,
      primary: true,
      reason: "Inline script localStorage, sessionStorage, and cookie key hints extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.clientState",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "cs2",
          key: "returnTo",
        }),
      ]),
    });
  });

  it("checks requested text against client state hints", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent", "--find", "returnTo"], {
      stdout,
      fetch: async () => new Response(`
        <script>
          sessionStorage.getItem("returnTo");
        </script>
        <main><h1>App shell</h1></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "clientState",
        rank: 1,
        selector: "script:nth-of-type(1)",
        text: "session-storage read returnTo",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes runtime script hints for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <link rel="modulepreload" href="/assets/app-shell.js">
            <script>
              navigator.serviceWorker.register("/sw.js");
              const worker = new Worker("/workers/search.js");
              const shared = new SharedWorker("/workers/shared.js");
              audioWorklet.addModule("/worklets/audio.js");
              import("/chunks/settings.js");
            </script>
          </head>
          <body><main></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.runtime).toEqual([
      {
        id: "rt1",
        path: "pageCheck.runtime[0]",
        rank: 1,
        kind: "service-worker",
        url: "https://example.test/sw.js",
        text: "service-worker https://example.test/sw.js",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "rt2",
        path: "pageCheck.runtime[1]",
        rank: 2,
        kind: "web-worker",
        url: "https://example.test/workers/search.js",
        text: "web-worker https://example.test/workers/search.js",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "rt3",
        path: "pageCheck.runtime[2]",
        rank: 3,
        kind: "shared-worker",
        url: "https://example.test/workers/shared.js",
        text: "shared-worker https://example.test/workers/shared.js",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "rt4",
        path: "pageCheck.runtime[3]",
        rank: 4,
        kind: "worklet",
        url: "https://example.test/worklets/audio.js",
        text: "worklet https://example.test/worklets/audio.js",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "rt5",
        path: "pageCheck.runtime[4]",
        rank: 5,
        kind: "dynamic-import",
        url: "https://example.test/chunks/settings.js",
        text: "dynamic-import https://example.test/chunks/settings.js",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "rt6",
        path: "pageCheck.runtime[5]",
        rank: 6,
        kind: "module-preload",
        url: "https://example.test/assets/app-shell.js",
        text: "module-preload https://example.test/assets/app-shell.js",
        source: "link",
        selector: "link[rel=\"modulepreload\"]:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("6 runtime hints");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.runtime",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.runtime",
      count: 6,
      primary: true,
      reason: "Service worker, worker, worklet, dynamic import, and modulepreload runtime URLs extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.runtime",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "rt1",
          url: "https://example.test/sw.js",
        }),
      ]),
    });
  });

  it("checks requested text against runtime hints", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent", "--find", "sw.js"], {
      stdout,
      fetch: async () => new Response(`
        <script>
          navigator.serviceWorker.register("/sw.js");
        </script>
        <main></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "runtime",
        rank: 1,
        url: "https://example.test/sw.js",
        selector: "script:nth-of-type(1)",
        text: "service-worker https://example.test/sw.js",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes inline app config keys for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script>
              window.__APP_CONFIG__ = {
                apiBase: "/api",
                locale: "en",
                featureFlags: { betaSearch: true },
                release: "2026.06"
              };
              __INITIAL_STATE__ = {
                user: null,
                route: "/docs",
                experiments: ["search-v2"]
              };
              dataLayer.push({
                event: "page_view",
                pageType: "docs",
                section: "reference"
              });
            </script>
          </head>
          <body><main></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.config).toEqual([
      {
        id: "cfg1",
        path: "pageCheck.config[0]",
        rank: 1,
        kind: "env",
        name: "__APP_CONFIG__",
        keys: ["apiBase", "locale", "featureFlags", "release"],
        keyCount: 4,
        text: "env __APP_CONFIG__ keys=apiBase, locale, featureFlags, release",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cfg2",
        path: "pageCheck.config[1]",
        rank: 2,
        kind: "feature-flags",
        name: "__INITIAL_STATE__",
        keys: ["user", "route", "experiments"],
        keyCount: 3,
        text: "feature-flags __INITIAL_STATE__ keys=user, route, experiments",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
      {
        id: "cfg3",
        path: "pageCheck.config[2]",
        rank: 3,
        kind: "data-layer",
        name: "dataLayer.push",
        keys: ["event", "pageType", "section"],
        keyCount: 3,
        text: "data-layer dataLayer.push keys=event, pageType, section",
        source: "script",
        selector: "script:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 config hints");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.config",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.config",
      count: 3,
      primary: true,
      reason: "Inline app config, initial state, env, feature flag, and dataLayer keys extracted from page scripts.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.config",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "cfg1",
          keys: expect.arrayContaining(["apiBase", "featureFlags"]),
        }),
      ]),
    });
  });

  it("checks requested text against config hints", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent", "--find", "featureFlags"], {
      stdout,
      fetch: async () => new Response(`
        <script>
          window.__APP_CONFIG__ = { apiBase: "/api", featureFlags: { betaSearch: true } };
        </script>
        <main></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "config",
        rank: 1,
        selector: "script:nth-of-type(1)",
        text: "env __APP_CONFIG__ keys=apiBase, featureFlags",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes app installability hints from hidden head metadata", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <meta name="application-name" content="Example Console">
            <meta name="theme-color" content="#0f172a">
            <meta name="apple-mobile-web-app-capable" content="yes">
            <link rel="manifest" href="/site.webmanifest">
            <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple.png">
          </head>
          <body><main><h1>Console</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.appHints).toEqual([
      {
        id: "ah1",
        path: "pageCheck.appHints[0]",
        rank: 1,
        kind: "manifest",
        label: "Web app manifest",
        value: "/site.webmanifest",
        text: "Web app manifest: /site.webmanifest kind=manifest url=https://example.test/site.webmanifest source=link",
        source: "link",
        url: "https://example.test/site.webmanifest",
        selector: "link[rel=\"manifest\"]:nth-of-type(1)",
      },
      {
        id: "ah2",
        path: "pageCheck.appHints[1]",
        rank: 2,
        kind: "icon",
        label: "Apple touch icon",
        value: "/icons/apple.png",
        text: "Apple touch icon: /icons/apple.png kind=icon url=https://example.test/icons/apple.png sizes=180x180 source=link",
        source: "link",
        url: "https://example.test/icons/apple.png",
        sizes: "180x180",
        selector: "link[rel=\"apple-touch-icon\"]:nth-of-type(2)",
      },
      {
        id: "ah3",
        path: "pageCheck.appHints[2]",
        rank: 3,
        kind: "app-name",
        label: "Application name",
        value: "Example Console",
        text: "Application name: Example Console kind=app-name source=meta",
        source: "meta",
        selector: "meta[name=\"application-name\"]:nth-of-type(1)",
      },
      {
        id: "ah4",
        path: "pageCheck.appHints[3]",
        rank: 4,
        kind: "theme",
        label: "Theme color",
        value: "#0f172a",
        text: "Theme color: #0f172a kind=theme source=meta",
        source: "meta",
        selector: "meta[name=\"theme-color\"]:nth-of-type(2)",
      },
      {
        id: "ah5",
        path: "pageCheck.appHints[4]",
        rank: 5,
        kind: "capability",
        label: "Apple standalone capable",
        value: "yes",
        text: "Apple standalone capable: yes kind=capability source=meta",
        source: "meta",
        selector: "meta[name=\"apple-mobile-web-app-capable\"]:nth-of-type(3)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("5 app hints");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.appHints",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.appHints",
      count: 5,
      primary: true,
      reason: "Web app manifest, icon, theme, and installability hints extracted from hidden head metadata.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.appHints",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "ah3",
          value: "Example Console",
        }),
      ]),
    });
  });

  it("promotes hidden read-current pageCheck targets to answer evidence", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/hidden", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script>
              window.__APP_CONFIG__ = {
                apiBase: "https://example.test/api",
                featureFlags: { agentMode: true }
              };
            </script>
          </head>
          <body><main><h1>Hidden config</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.config",
    });
    expect(envelope.agent.citations).toContainEqual(expect.objectContaining({
      id: "pc1",
      kind: "page-check",
      path: "pageCheck.config",
      text: expect.stringContaining("__APP_CONFIG__"),
    }));
    expect(envelope.agent.answerPlan).toMatchObject({
      status: "ready",
      readFrom: "pageCheck.config",
      useCitationIds: expect.arrayContaining(["pc1"]),
    });
    expect(envelope.agent).toMatchObject({
      answerUseCitationCount: 2,
      topAnswerUseCitationId: "e1",
      answerUseCitationIds: expect.arrayContaining(["pc1"]),
    });
    expect(envelope.agent.answerEvidence).toContainEqual(expect.objectContaining({
      id: "pc1",
      kind: "page-check",
      path: "pageCheck.config",
    }));
    expect(envelope.agent.handoff).toMatchObject({
      decision: "return",
      answerReady: true,
      readFrom: "pageCheck.config",
      useCitationIds: expect.arrayContaining(["pc1"]),
    });
    expect(envelope.agent.handoff.answerEvidence).toContainEqual(expect.objectContaining({
      id: "pc1",
      kind: "page-check",
    }));
  });

  it("uses hidden page-check metadata before browser retry on empty pages", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/hidden-empty", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <meta name="application-name" content="Hidden Console">
            <meta name="theme-color" content="#0f766e">
            <link rel="manifest" href="/site.webmanifest">
          </head>
          <body></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).toBe("empty");
    expect(envelope.agent).toMatchObject({
      status: "ready",
      needsBrowserHtml: false,
      canUseFetchedHtml: true,
      primaryAction: {
        action: "read-content",
        execution: "read-current",
        readFrom: "pageCheck.appHints",
      },
      bestHiddenReadTarget: "pageCheck.appHints",
      bestHiddenReadTargetCount: 3,
      bestHiddenReadTargetPrimary: true,
      answerPlan: {
        status: "ready",
        readFrom: "pageCheck.appHints",
        useCitationIds: expect.arrayContaining(["pc1"]),
      },
    });
    expect(envelope.agent.citations).toContainEqual(expect.objectContaining({
      id: "pc1",
      kind: "page-check",
      path: "pageCheck.appHints",
      text: expect.stringContaining("Hidden Console"),
    }));
  });

  it("checks requested text against app hints", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent", "--find", "Example Console"], {
      stdout,
      fetch: async () => new Response(`
        <head>
          <meta name="application-name" content="Example Console">
          <link rel="manifest" href="/site.webmanifest">
        </head>
        <main><h1>App shell</h1></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "appHint",
        rank: 2,
        selector: "meta[name=\"application-name\"]:nth-of-type(1)",
        text: "Application name: Example Console kind=app-name source=meta",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes mobile viewport and app-link hints from hidden head metadata", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/mobile", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
            <meta name="format-detection" content="telephone=no">
            <meta name="apple-itunes-app" content="app-id=123456789, app-argument=https://example.test/open">
            <meta name="al:ios:url" content="example://article/42">
            <meta name="al:android:package" content="com.example.reader">
            <link rel="alternate" href="android-app://com.example.reader/https/example.test/article/42">
          </head>
          <body><main><h1>Mobile Article</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.mobileHints).toEqual([
      {
        id: "mh1",
        path: "pageCheck.mobileHints[0]",
        rank: 1,
        kind: "viewport",
        label: "Viewport",
        value: "width=device-width, initial-scale=1, viewport-fit=cover",
        text: "Viewport: width=device-width, initial-scale=1, viewport-fit=cover kind=viewport source=meta",
        source: "meta",
        selector: "meta[name=\"viewport\"]:nth-of-type(1)",
      },
      {
        id: "mh2",
        path: "pageCheck.mobileHints[1]",
        rank: 2,
        kind: "format-detection",
        label: "Format detection",
        value: "telephone=no",
        text: "Format detection: telephone=no kind=format-detection source=meta",
        source: "meta",
        selector: "meta[name=\"format-detection\"]:nth-of-type(2)",
      },
      {
        id: "mh3",
        path: "pageCheck.mobileHints[2]",
        rank: 3,
        kind: "smart-app-banner",
        label: "Apple Smart App Banner",
        value: "app-id=123456789, app-argument=https://example.test/open",
        text: "Apple Smart App Banner: app-id=123456789, app-argument=https://example.test/open kind=smart-app-banner platform=ios url=https://example.test/open source=meta",
        source: "meta",
        platform: "ios",
        url: "https://example.test/open",
        selector: "meta[name=\"apple-itunes-app\"]:nth-of-type(3)",
      },
      {
        id: "mh4",
        path: "pageCheck.mobileHints[3]",
        rank: 4,
        kind: "app-link",
        label: "iOS app URL",
        value: "example://article/42",
        text: "iOS app URL: example://article/42 kind=app-link platform=ios url=example://article/42 source=meta",
        source: "meta",
        platform: "ios",
        url: "example://article/42",
        selector: "meta[name=\"al:ios:url\"]:nth-of-type(4)",
      },
      {
        id: "mh5",
        path: "pageCheck.mobileHints[4]",
        rank: 5,
        kind: "app-link",
        label: "Android package",
        value: "com.example.reader",
        text: "Android package: com.example.reader kind=app-link platform=android source=meta",
        source: "meta",
        platform: "android",
        selector: "meta[name=\"al:android:package\"]:nth-of-type(5)",
      },
      {
        id: "mh6",
        path: "pageCheck.mobileHints[5]",
        rank: 6,
        kind: "app-link",
        label: "android alternate app link",
        value: "android-app://com.example.reader/https/example.test/article/42",
        text: "android alternate app link: android-app://com.example.reader/https/example.test/article/42 kind=app-link platform=android url=android-app://com.example.reader/https/example.test/article/42 source=link",
        source: "link",
        platform: "android",
        url: "android-app://com.example.reader/https/example.test/article/42",
        selector: "link[rel=\"alternate\"]:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("6 mobile hints");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.mobileHints",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.mobileHints",
      count: 6,
      primary: true,
      reason: "Mobile viewport, format detection, color scheme, smart app banner, and app-link hints extracted from hidden head metadata.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.mobileHints",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "mh4",
          url: "example://article/42",
        }),
      ]),
    });
  });

  it("summarizes hidden topic metadata for relevance checks", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/topic", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <meta name="keywords" content="retrieval, agent search">
            <meta property="article:tag" content="CLI tooling">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Article",
                "headline": "Agent page checks",
                "keywords": ["accessibility tree", "static extraction"],
                "articleSection": "Engineering",
                "about": { "@type": "Thing", "name": "Subagent page checking" },
                "mentions": [{ "@type": "Thing", "name": "browser automation" }]
              }
            </script>
          </head>
          <body><main><h1>Topic page</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.topics).toEqual([
      {
        id: "tp1",
        path: "pageCheck.topics[0]",
        rank: 1,
        kind: "keyword",
        label: "Keyword",
        value: "retrieval",
        text: "Keyword: retrieval kind=keyword source=meta",
        source: "meta",
        selector: "meta[name=\"keywords\"]:nth-of-type(1)",
      },
      {
        id: "tp2",
        path: "pageCheck.topics[1]",
        rank: 2,
        kind: "keyword",
        label: "Keyword",
        value: "agent search",
        text: "Keyword: agent search kind=keyword source=meta",
        source: "meta",
        selector: "meta[name=\"keywords\"]:nth-of-type(1)",
      },
      {
        id: "tp3",
        path: "pageCheck.topics[2]",
        rank: 3,
        kind: "tag",
        label: "Article tag",
        value: "CLI tooling",
        text: "Article tag: CLI tooling kind=tag source=meta",
        source: "meta",
        selector: "meta[property=\"article:tag\"]:nth-of-type(2)",
      },
      {
        id: "tp4",
        path: "pageCheck.topics[3]",
        rank: 4,
        kind: "keyword",
        label: "Keyword",
        value: "accessibility tree",
        text: "Keyword: accessibility tree kind=keyword source=json-ld",
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "tp5",
        path: "pageCheck.topics[4]",
        rank: 5,
        kind: "keyword",
        label: "Keyword",
        value: "static extraction",
        text: "Keyword: static extraction kind=keyword source=json-ld",
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "tp6",
        path: "pageCheck.topics[5]",
        rank: 6,
        kind: "section",
        label: "Article section",
        value: "Engineering",
        text: "Article section: Engineering kind=section source=json-ld",
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "tp7",
        path: "pageCheck.topics[6]",
        rank: 7,
        kind: "about",
        label: "About",
        value: "Subagent page checking",
        text: "About: Subagent page checking kind=about source=json-ld",
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "tp8",
        path: "pageCheck.topics[7]",
        rank: 8,
        kind: "mention",
        label: "Mention",
        value: "browser automation",
        text: "Mention: browser automation kind=mention source=json-ld",
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("8 topics");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.topics",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.topics",
      count: 8,
      primary: true,
      reason: "Keywords, tags, categories, about, and mention topics extracted from hidden metadata and JSON-LD.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.topics",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "tp7",
          value: "Subagent page checking",
        }),
      ]),
    });
  });

  it("checks requested text against topic metadata", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/topic", "--agent", "--find", "browser automation"], {
      stdout,
      fetch: async () => new Response(`
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "mentions": [{ "@type": "Thing", "name": "browser automation" }]
            }
          </script>
        </head>
        <main><h1>Topic page</h1></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "topic",
        rank: 1,
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
        text: "Mention: browser automation kind=mention source=json-ld",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes key-value facts from definition lists and time metadata", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/package", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Package facts</h1>
          <dl>
            <dt>Version</dt><dd>2.4.1</dd>
            <dt>License</dt><dd>MIT</dd>
          </dl>
          <p>Maintainer: Example Team</p>
          <p>Updated <time datetime="2026-06-01T12:00:00Z" class="updated">June 1, 2026</time></p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.keyValues).toEqual([
      expect.objectContaining({
        id: "kv1",
        path: "pageCheck.keyValues[0]",
        rank: 1,
        label: "Version",
        value: "2.4.1",
        text: "Version: 2.4.1",
        source: "definition-list",
        selector: "dl:nth-of-type(1)",
      }),
      expect.objectContaining({
        id: "kv2",
        path: "pageCheck.keyValues[1]",
        label: "License",
        value: "MIT",
        text: "License: MIT",
        source: "definition-list",
      }),
      expect.objectContaining({
        id: "kv3",
        label: "Modified",
        value: "June 1, 2026",
        text: "Modified: June 1, 2026",
        source: "time",
        datetime: "2026-06-01T12:00:00Z",
      }),
      expect.objectContaining({
        id: "kv4",
        label: "Maintainer",
        value: "Example Team",
        text: "Maintainer: Example Team",
        source: "text",
      }),
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("4 key-value facts");
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.keyValues",
      count: 4,
      reason: "Compact label/value facts extracted from definition lists, time elements, and short metadata text.",
    }));
  });

  it("checks requested text against page key-value summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/package", "--agent", "--find", "MIT"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Package facts</h1>
          <dl><dt>License</dt><dd>MIT</dd></dl>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "keyValue",
        rank: 1,
        selector: "dl:nth-of-type(1)",
        text: "License: MIT",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes head metadata facts as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <link rel="canonical" href="/canonical-article">
            <meta name="robots" content="noindex, noarchive">
            <meta property="og:type" content="article">
          </head>
          <body><main></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.metaFacts).toEqual([
      {
        id: "mf1",
        path: "pageCheck.metaFacts[0]",
        rank: 1,
        label: "Canonical URL",
        value: "https://example.test/canonical-article",
        text: "Canonical URL: https://example.test/canonical-article",
        source: "link",
        url: "https://example.test/canonical-article",
        selector: "link[rel=\"canonical\"]:nth-of-type(1)",
      },
      {
        id: "mf2",
        path: "pageCheck.metaFacts[1]",
        rank: 2,
        label: "robots directives",
        value: "noindex, noarchive",
        text: "robots directives: noindex, noarchive",
        source: "meta",
        selector: "meta:nth-of-type(1)",
      },
      {
        id: "mf3",
        path: "pageCheck.metaFacts[2]",
        rank: 3,
        label: "Open Graph type",
        value: "article",
        text: "Open Graph type: article",
        source: "meta",
        selector: "meta:nth-of-type(2)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 meta facts");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.metaFacts",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.metaFacts",
      count: 3,
      primary: true,
      reason: "Head metadata directives and canonical/alternate links extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.metaFacts",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "mf1",
          label: "Canonical URL",
        }),
        expect.objectContaining({
          id: "mf2",
          value: "noindex, noarchive",
        }),
      ]),
    });
  });

  it("checks requested text against head metadata summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--agent", "--find", "noindex"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><meta name="robots" content="noindex, noarchive"></head>
          <body><main><h1>Article</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "metaFact",
        rank: 1,
        selector: "meta:nth-of-type(1)",
        text: "robots directives: noindex, noarchive",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes hidden provenance identifiers for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/paper", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <meta name="citation_doi" content="10.5555/example.2026">
            <meta name="citation_pmid" content="12345678">
            <meta name="citation_arxiv_id" content="2606.01234">
            <meta name="citation_journal_title" content="Journal of Agent Tests">
          </head>
          <body><main></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.provenance).toEqual([
      {
        id: "pv1",
        path: "pageCheck.provenance[0]",
        rank: 1,
        kind: "doi",
        label: "DOI",
        value: "10.5555/example.2026",
        text: "DOI: 10.5555/example.2026 kind=doi url=https://doi.org/10.5555/example.2026 source=meta",
        source: "meta",
        url: "https://doi.org/10.5555/example.2026",
        selector: "meta:nth-of-type(1)",
      },
      {
        id: "pv2",
        path: "pageCheck.provenance[1]",
        rank: 2,
        kind: "pmid",
        label: "PMID",
        value: "12345678",
        text: "PMID: 12345678 kind=pmid url=https://pubmed.ncbi.nlm.nih.gov/12345678/ source=meta",
        source: "meta",
        url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
        selector: "meta:nth-of-type(2)",
      },
      {
        id: "pv3",
        path: "pageCheck.provenance[2]",
        rank: 3,
        kind: "arxiv",
        label: "arXiv",
        value: "2606.01234",
        text: "arXiv: 2606.01234 kind=arxiv url=https://arxiv.org/abs/2606.01234 source=meta",
        source: "meta",
        url: "https://arxiv.org/abs/2606.01234",
        selector: "meta:nth-of-type(3)",
      },
      {
        id: "pv4",
        path: "pageCheck.provenance[3]",
        rank: 4,
        kind: "journal",
        label: "Journal",
        value: "Journal of Agent Tests",
        text: "Journal: Journal of Agent Tests kind=journal source=meta",
        source: "meta",
        selector: "meta:nth-of-type(4)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("4 provenance facts");
    expect(envelope.agent).toMatchObject({
      provenanceCount: 4,
      topProvenancePath: "pageCheck.provenance[0]",
      topProvenanceKind: "doi",
      topProvenanceLabel: "DOI",
      topProvenanceValue: "10.5555/example.2026",
      topProvenanceUrl: "https://doi.org/10.5555/example.2026",
      topProvenanceSource: "meta",
      topProvenanceSelector: "meta:nth-of-type(1)",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.provenance",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.provenance",
      count: 4,
      primary: true,
      reason: "DOI, PMID, arXiv, ISBN, publisher, journal, license, and citation identifiers extracted from hidden metadata.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.provenance",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "pv1",
          url: "https://doi.org/10.5555/example.2026",
        }),
      ]),
    });
  });

  it("checks requested text against provenance identifiers", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/paper", "--agent", "--find", "10.5555/example.2026"], {
      stdout,
      fetch: async () => new Response(`
        <meta name="citation_doi" content="10.5555/example.2026">
        <main></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "provenance",
        rank: 1,
        url: "https://doi.org/10.5555/example.2026",
        selector: "meta:nth-of-type(1)",
        text: "DOI: 10.5555/example.2026 kind=doi url=https://doi.org/10.5555/example.2026 source=meta",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("keeps top provenance labels and selectors in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/paper", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <meta name="citation_doi" content="10.5555/example.2026">
        <main></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      provenanceCount: 1,
      topProvenancePath: "pageCheck.provenance[0]",
      topProvenanceKind: "doi",
      topProvenanceLabel: "DOI",
      topProvenanceValue: "10.5555/example.2026",
      topProvenanceUrl: "https://doi.org/10.5555/example.2026",
      topProvenanceSource: "meta",
      topProvenanceSelector: "meta:nth-of-type(1)",
    });
  });

  it("summarizes HTTP policy headers and meta directives as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/policy", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <meta http-equiv="referrer-policy" content="strict-origin-when-cross-origin">
          </head>
          <body><main></main></body>
        </html>
      `, {
        headers: {
          "content-type": "text/html",
          "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
          "x-robots-tag": "noindex, noarchive",
        },
      }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.httpPolicies).toEqual([
      {
        id: "hp1",
        path: "pageCheck.httpPolicies[0]",
        rank: 1,
        name: "Content-Security-Policy",
        value: "default-src 'self'; frame-ancestors 'none'",
        text: "Content-Security-Policy: default-src 'self'; frame-ancestors 'none' source=header",
        source: "header",
      },
      {
        id: "hp2",
        path: "pageCheck.httpPolicies[1]",
        rank: 2,
        name: "X-Robots-Tag",
        value: "noindex, noarchive",
        text: "X-Robots-Tag: noindex, noarchive source=header",
        source: "header",
      },
      {
        id: "hp3",
        path: "pageCheck.httpPolicies[2]",
        rank: 3,
        name: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
        text: "Referrer-Policy: strict-origin-when-cross-origin source=meta",
        source: "meta",
        selector: "meta[http-equiv=\"referrer-policy\"]:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 HTTP policies");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.httpPolicies",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.httpPolicies",
      count: 3,
      primary: true,
      reason: "HTTP and meta policy directives for indexing, security, embedding, referrer, and cache handling.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.httpPolicies",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "hp1",
          name: "Content-Security-Policy",
        }),
      ]),
    });
  });

  it("checks requested text against HTTP policy summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/policy", "--agent", "--find", "frame-ancestors"], {
      stdout,
      fetch: async () => new Response(`
        <main><h1>Policy</h1></main>
      `, {
        headers: {
          "content-type": "text/html",
          "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
        },
      }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "httpPolicy",
        rank: 1,
        text: "Content-Security-Policy: default-src 'self'; frame-ancestors 'none' source=header",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes JSON-LD schema facts as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/product", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <title>Product</title>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Agent Browser Pro",
                "sku": "ABP-2026",
                "brand": { "@type": "Brand", "name": "Example Labs" },
                "offers": {
                  "@type": "Offer",
                  "price": "19.99",
                  "priceCurrency": "USD",
                  "availability": "https://schema.org/InStock",
                  "url": "https://example.test/product"
                },
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": "4.8",
                  "reviewCount": "128"
                }
              }
            </script>
          </head>
          <body><main></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.schemaFacts).toEqual([
      {
        id: "sf1",
        path: "pageCheck.schemaFacts[0]",
        rank: 1,
        types: ["Product"],
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
        facts: [
          { label: "Name", value: "Agent Browser Pro" },
          { label: "SKU", value: "ABP-2026" },
          { label: "Brand", value: "Example Labs" },
          { label: "Offer price", value: "USD 19.99" },
          { label: "Offer availability", value: "InStock" },
          { label: "Offer URL", value: "https://example.test/product" },
          { label: "Rating", value: "4.8" },
          { label: "Review count", value: "128" },
        ],
        text: "Types: Product; Name: Agent Browser Pro; SKU: ABP-2026; Brand: Example Labs; Offer price: USD 19.99; Offer availability: InStock; Offer URL: https://example.test/product; Rating: 4.8; Review count: 128",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 schema fact group");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.schemaFacts",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.schemaFacts",
      count: 1,
      primary: true,
      reason: "Compact JSON-LD schema.org facts extracted from hidden structured data.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.schemaFacts",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "sf1",
          types: ["Product"],
        }),
      ]),
    });
  });

  it("checks requested text against JSON-LD schema fact summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/product", "--agent", "--find", "USD 19.99"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Agent Browser Pro",
                "offers": { "@type": "Offer", "price": "19.99", "priceCurrency": "USD" }
              }
            </script>
          </head>
          <body><main><h1>Product</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "schemaFact",
        rank: 1,
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
        text: "Types: Product; Name: Agent Browser Pro; Offer price: USD 19.99",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes JSON-LD offers as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/product", "--agent", "--find", "source=json-ld"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Agent Browser Pro",
                "sku": "ABP-2026",
                "brand": { "@type": "Brand", "name": "Example Labs" },
                "offers": {
                  "@type": "Offer",
                  "price": "19.99",
                  "priceCurrency": "USD",
                  "availability": "https://schema.org/InStock",
                  "url": "/buy"
                },
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": "4.8",
                  "bestRating": "5",
                  "reviewCount": "128"
                }
              }
            </script>
          </head>
          <body><main><h1>Product</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.offers).toEqual([
      {
        id: "of1",
        path: "pageCheck.offers[0]",
        rank: 1,
        name: "Agent Browser Pro",
        price: "19.99",
        currency: "USD",
        availability: "InStock",
        url: "https://example.test/buy",
        brand: "Example Labs",
        sku: "ABP-2026",
        rating: "4.8 / 5",
        reviewCount: "128",
        text: "Name: Agent Browser Pro; Price: USD 19.99; Availability: InStock; Brand: Example Labs; SKU: ABP-2026; Rating: 4.8 / 5; Review count: 128; URL: https://example.test/buy; source=json-ld",
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 offer");
    expect(envelope.agent).toMatchObject({
      offerCount: 1,
      topOfferPath: "pageCheck.offers[0]",
      topOfferName: "Agent Browser Pro",
      topOfferPrice: "19.99",
      topOfferCurrency: "USD",
      topOfferAvailability: "InStock",
      topOfferUrl: "https://example.test/buy",
      topOfferSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.offers",
      count: 1,
      reason: "Structured price, availability, rating, and offer URLs extracted from JSON-LD.",
    }));
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "offer",
      rank: 1,
      text: "Name: Agent Browser Pro; Price: USD 19.99; Availability: InStock; Brand: Example Labs; SKU: ABP-2026; Rating: 4.8 / 5; Review count: 128; URL: https://example.test/buy; source=json-ld",
      url: "https://example.test/buy",
      selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("keeps top offer labels and selectors in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/product", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Agent Browser Pro",
            "offers": {
              "@type": "Offer",
              "price": "19.99",
              "priceCurrency": "USD",
              "availability": "https://schema.org/InStock",
              "url": "/buy"
            }
          }
        </script>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      offerCount: 1,
      topOfferPath: "pageCheck.offers[0]",
      topOfferName: "Agent Browser Pro",
      topOfferPrice: "19.99",
      topOfferCurrency: "USD",
      topOfferAvailability: "InStock",
      topOfferUrl: "https://example.test/buy",
      topOfferSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
  });

  it("summarizes JSON-LD identities and sameAs links as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/about", "--agent", "--find", "github.com/example"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <meta property="og:site_name" content="Example Labs">
            <script type="application/ld+json">
              [
                {
                  "@context": "https://schema.org",
                  "@type": "Organization",
                  "name": "Example Labs",
                  "url": "https://example.test",
                  "logo": "/logo.png",
                  "sameAs": [
                    "https://github.com/example",
                    "https://www.linkedin.com/company/example-labs"
                  ]
                },
                {
                  "@context": "https://schema.org",
                  "@type": "WebSite",
                  "name": "Example Docs",
                  "url": "/docs"
                }
              ]
            </script>
          </head>
          <body><main><h1>About</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.identities).toEqual([
      {
        id: "id1",
        path: "pageCheck.identities[0]",
        rank: 1,
        kind: "website",
        name: "Example Labs",
        text: "website: Example Labs url=https://example.test/about source=meta",
        source: "meta",
        url: "https://example.test/about",
        selector: "meta[property=\"og:site_name\"], meta[name=\"application-name\"]",
      },
      {
        id: "id2",
        path: "pageCheck.identities[1]",
        rank: 2,
        kind: "organization",
        name: "Example Labs",
        text: "organization: Example Labs url=https://example.test/ logo=https://example.test/logo.png sameAs=https://github.com/example|https://www.linkedin.com/company/example-labs source=json-ld",
        source: "json-ld",
        url: "https://example.test/",
        logoUrl: "https://example.test/logo.png",
        sameAs: [
          "https://github.com/example",
          "https://www.linkedin.com/company/example-labs",
        ],
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "id3",
        path: "pageCheck.identities[2]",
        rank: 3,
        kind: "website",
        name: "Example Docs",
        text: "website: Example Docs url=https://example.test/docs source=json-ld",
        source: "json-ld",
        url: "https://example.test/docs",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 identity entries");
    expect(envelope.agent).toMatchObject({
      identityCount: 3,
      topIdentityPath: "pageCheck.identities[0]",
      topIdentityKind: "website",
      topIdentityName: "Example Labs",
      topIdentityUrl: "https://example.test/about",
      topIdentitySource: "meta",
      topIdentitySelector: "meta[property=\"og:site_name\"], meta[name=\"application-name\"]",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.identities",
      count: 3,
      reason: "Organization, website, person, brand, and sameAs identity facts extracted from JSON-LD and metadata.",
    }));
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "identity",
      rank: 2,
      text: "organization: Example Labs url=https://example.test/ logo=https://example.test/logo.png sameAs=https://github.com/example|https://www.linkedin.com/company/example-labs source=json-ld",
      url: "https://example.test/",
      selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("keeps top identity logo and source details in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/about", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Example Labs",
            "url": "https://example.test",
            "logo": "/logo.png",
            "sameAs": "https://github.com/example"
          }
        </script>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      identityCount: 1,
      topIdentityPath: "pageCheck.identities[0]",
      topIdentityKind: "organization",
      topIdentityName: "Example Labs",
      topIdentityUrl: "https://example.test/",
      topIdentityLogoUrl: "https://example.test/logo.png",
      topIdentitySameAsUrl: "https://github.com/example",
      topIdentitySource: "json-ld",
      topIdentitySelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
  });

  it("summarizes dataset and data download provenance as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/data", "--agent", "--find", "creativecommons.org/licenses/by/4.0"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Dataset",
                "name": "Example emissions dataset",
                "url": "/datasets/emissions",
                "creator": { "@type": "Organization", "name": "Example Lab" },
                "license": "https://creativecommons.org/licenses/by/4.0/",
                "temporalCoverage": "2020/2025",
                "spatialCoverage": { "@type": "Place", "name": "United States" },
                "distribution": [
                  {
                    "@type": "DataDownload",
                    "contentUrl": "/downloads/emissions.csv",
                    "encodingFormat": "text/csv"
                  }
                ]
              }
            </script>
          </head>
          <body>
            <main>
              <h1>Data</h1>
              <a href="/downloads/population.parquet">Population parquet data</a>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.datasets).toEqual([
      {
        id: "ds1",
        path: "pageCheck.datasets[0]",
        rank: 1,
        kind: "dataset",
        name: "Example emissions dataset",
        text: "dataset: Example emissions dataset url=https://example.test/datasets/emissions distributions=https://example.test/downloads/emissions.csv format=text/csv license=https://creativecommons.org/licenses/by/4.0/ temporal=2020/2025 spatial=United States creator=Example Lab source=json-ld",
        source: "json-ld",
        url: "https://example.test/datasets/emissions",
        distributionUrls: ["https://example.test/downloads/emissions.csv"],
        encodingFormat: "text/csv",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        temporalCoverage: "2020/2025",
        spatialCoverage: "United States",
        creator: "Example Lab",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "ds2",
        path: "pageCheck.datasets[1]",
        rank: 2,
        kind: "dataDownload",
        name: "Population parquet data",
        text: "dataDownload: Population parquet data url=https://example.test/downloads/population.parquet distributions=https://example.test/downloads/population.parquet format=application/vnd.apache.parquet source=link",
        source: "link",
        url: "https://example.test/downloads/population.parquet",
        distributionUrls: ["https://example.test/downloads/population.parquet"],
        encodingFormat: "application/vnd.apache.parquet",
        selector: "a:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("2 datasets");
    expect(envelope.agent).toMatchObject({
      datasetCount: 2,
      topDatasetPath: "pageCheck.datasets[0]",
      topDatasetKind: "dataset",
      topDatasetName: "Example emissions dataset",
      topDatasetUrl: "https://example.test/datasets/emissions",
      topDatasetDistributionUrl: "https://example.test/downloads/emissions.csv",
      topDatasetLicenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      topDatasetEncodingFormat: "text/csv",
      topDatasetSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.datasets",
      count: 2,
      reason: "Dataset, data catalog, and data download provenance extracted from JSON-LD and data file links.",
    }));
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "dataset",
      rank: 1,
      url: "https://example.test/datasets/emissions",
      selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      text: "dataset: Example emissions dataset url=https://example.test/datasets/emissions distributions=https://example.test/downloads/emissions.csv format=text/csv license=https://creativecommons.org/licenses/by/4.0/ temporal=2020/2025 spatial=United States creator=Example Lab source=json-ld",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("keeps top dataset distribution details in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/data", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Dataset",
            "name": "Example emissions dataset",
            "url": "/datasets/emissions",
            "license": "https://creativecommons.org/licenses/by/4.0/",
            "distribution": [
              {
                "@type": "DataDownload",
                "contentUrl": "/downloads/emissions.csv",
                "encodingFormat": "text/csv"
              }
            ]
          }
        </script>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      datasetCount: 1,
      topDatasetPath: "pageCheck.datasets[0]",
      topDatasetKind: "dataset",
      topDatasetName: "Example emissions dataset",
      topDatasetUrl: "https://example.test/datasets/emissions",
      topDatasetDistributionUrl: "https://example.test/downloads/emissions.csv",
      topDatasetLicenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      topDatasetEncodingFormat: "text/csv",
      topDatasetSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
  });

  it("summarizes publication and update dates as pageCheck timeline read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/release", "--agent", "--find", "source=time"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <title>Release Notes</title>
            <meta property="article:published_time" content="2026-06-01T09:00:00Z">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "NewsArticle",
                "headline": "Release Notes",
                "dateModified": "2026-06-08T10:30:00Z"
              }
            </script>
          </head>
          <body>
            <main>
              <h1>Release Notes</h1>
              <time class="updated" datetime="2026-06-08">Updated June 8 2026</time>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.timeline).toEqual([
      {
        id: "tl1",
        path: "pageCheck.timeline[0]",
        rank: 1,
        kind: "published",
        label: "Published",
        value: "2026-06-01T09:00:00Z",
        text: "Published: 2026-06-01T09:00:00Z source=page",
        source: "page",
      },
      {
        id: "tl2",
        path: "pageCheck.timeline[1]",
        rank: 2,
        kind: "modified",
        label: "Modified",
        value: "2026-06-08T10:30:00Z",
        text: "Modified: 2026-06-08T10:30:00Z source=page",
        source: "page",
      },
      {
        id: "tl3",
        path: "pageCheck.timeline[2]",
        rank: 3,
        kind: "modified",
        label: "updated",
        value: "2026-06-08",
        text: "updated: 2026-06-08 source=time",
        source: "time",
        selector: "time:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 timeline facts");
    expect(envelope.agent).toMatchObject({
      timelineCount: 3,
      topTimelinePath: "pageCheck.timeline[0]",
      topTimelineKind: "published",
      topTimelineLabel: "Published",
      topTimelineValue: "2026-06-01T09:00:00Z",
      topTimelineSource: "page",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.timeline",
      count: 3,
      reason: "Publication, modification, event, and visible time metadata extracted from page HTML and JSON-LD.",
    }));
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "timeline",
      rank: 3,
      text: "updated: 2026-06-08 source=time",
      selector: "time:nth-of-type(1)",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("keeps top timeline labels and selectors in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/release", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <time class="updated" datetime="2026-06-08">Updated June 8 2026</time>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      timelineCount: 1,
      topTimelinePath: "pageCheck.timeline[0]",
      topTimelineKind: "modified",
      topTimelineLabel: "updated",
      topTimelineValue: "2026-06-08",
      topTimelineSource: "time",
      topTimelineSelector: "time:nth-of-type(1)",
    });
  });

  it("summarizes contact points as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/contact", "--agent", "--find", "press@example.test"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <title>Contact</title>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": "Example Labs",
                "contactPoint": {
                  "@type": "ContactPoint",
                  "contactType": "Support",
                  "telephone": "+1-555-0100",
                  "url": "/support"
                }
              }
            </script>
          </head>
          <body>
            <main>
              <h1>Contact</h1>
              <a href="mailto:press@example.test">Press team</a>
              <address>Example Labs, 1 Agent Way, Seoul 04524</address>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.contactPoints).toEqual([
      {
        id: "cp1",
        path: "pageCheck.contactPoints[0]",
        rank: 1,
        kind: "phone",
        label: "Support",
        value: "+1-555-0100",
        text: "Support: phone +1-555-0100 source=json-ld",
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "cp2",
        path: "pageCheck.contactPoints[1]",
        rank: 2,
        kind: "contact-url",
        label: "Support",
        value: "https://example.test/support",
        text: "Support: contact-url https://example.test/support https://example.test/support source=json-ld",
        source: "json-ld",
        url: "https://example.test/support",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      },
      {
        id: "cp3",
        path: "pageCheck.contactPoints[2]",
        rank: 3,
        kind: "email",
        label: "Press team",
        value: "press@example.test",
        text: "Press team: email press@example.test mailto:press@example.test source=link",
        source: "link",
        url: "mailto:press@example.test",
        selector: "a:nth-of-type(1)",
      },
      {
        id: "cp4",
        path: "pageCheck.contactPoints[3]",
        rank: 4,
        kind: "address",
        label: "Address",
        value: "Example Labs, 1 Agent Way, Seoul 04524",
        text: "Address: address Example Labs, 1 Agent Way, Seoul 04524 source=html",
        source: "html",
        selector: "address:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("4 contact points");
    expect(envelope.agent).toMatchObject({
      contactPointCount: 4,
      topContactPointPath: "pageCheck.contactPoints[0]",
      topContactPointKind: "phone",
      topContactPointLabel: "Support",
      topContactPointValue: "+1-555-0100",
      topContactPointSource: "json-ld",
      topContactPointSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.contactPoints",
      count: 4,
      reason: "Email, phone, address, and contact URL facts extracted from HTML links, address tags, and JSON-LD.",
    }));
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "contactPoint",
      rank: 3,
      text: "Press team: email press@example.test mailto:press@example.test source=link",
      url: "mailto:press@example.test",
      selector: "a:nth-of-type(1)",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("keeps top contact labels and selectors in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/contact", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <a href="mailto:press@example.test">Press team</a>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      contactPointCount: 1,
      topContactPointPath: "pageCheck.contactPoints[0]",
      topContactPointKind: "email",
      topContactPointLabel: "Press team",
      topContactPointValue: "press@example.test",
      topContactPointUrl: "mailto:press@example.test",
      topContactPointSource: "link",
      topContactPointSelector: "a:nth-of-type(1)",
    });
  });

  it("summarizes visible FAQ question-answer pairs as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/help", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <main>
              <details>
                <summary>How do I install ax-grep?</summary>
                <p>Run pnpm add ax-grep and then call the CLI with --agent.</p>
              </details>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.faqs).toEqual([
      {
        id: "faq1",
        path: "pageCheck.faqs[0]",
        rank: 1,
        question: "How do I install ax-grep?",
        answer: "Run pnpm add ax-grep and then call the CLI with --agent.",
        text: "Q: How do I install ax-grep? A: Run pnpm add ax-grep and then call the CLI with --agent.",
        source: "details",
        selector: "details:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 FAQ item");
    expect(envelope.agent).toMatchObject({
      faqCount: 1,
      topFaqQuestion: "How do I install ax-grep?",
      topFaqAnswer: "Run pnpm add ax-grep and then call the CLI with --agent.",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.faqs",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.faqs",
      count: 1,
      primary: true,
      reason: "FAQ question-answer pairs extracted from details, accordion, and FAQ HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.faqs",
      value: [
        expect.objectContaining({
          id: "faq1",
          source: "details",
        }),
      ],
    });
  });

  it("keeps top FAQ answers in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/help", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <details>
            <summary>How do I install ax-grep?</summary>
            <p>Run pnpm add ax-grep and then call the CLI with --agent.</p>
          </details>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      faqCount: 1,
      topFaqQuestion: "How do I install ax-grep?",
      topFaqAnswer: "Run pnpm add ax-grep and then call the CLI with --agent.",
      bestStructuredReadTarget: "pageCheck.faqs",
    });
  });

  it("checks requested text against visible FAQ summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/help", "--agent", "--find", "Run pnpm add ax-grep"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <section class="faq">
              <div class="faq-item">
                <h2>How do I install ax-grep?</h2>
                <div class="faq-answer">Run pnpm add ax-grep and then call the CLI with --agent.</div>
              </div>
            </section>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "faq",
        rank: 1,
        selector: "section:nth-of-type(1)",
        text: "Q: How do I install ax-grep? A: Run pnpm add ax-grep and then call the CLI with --agent.",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes JSON-LD and HTML breadcrumbs as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/api/responses", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                  { "@type": "ListItem", "position": 1, "name": "Docs", "item": "https://example.test/docs" },
                  { "@type": "ListItem", "position": 2, "name": "API", "item": { "@id": "https://example.test/docs/api", "name": "API" } },
                  { "@type": "ListItem", "position": 3, "name": "Responses", "item": "/docs/api/responses" }
                ]
              }
            </script>
          </head>
          <body>
            <nav aria-label="Breadcrumb">
              <ol>
                <li><a href="/docs">Docs</a></li>
                <li><a href="/docs/api">API</a></li>
                <li>Responses</li>
              </ol>
            </nav>
            <main></main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.breadcrumbs).toEqual([
      {
        id: "bc1",
        path: "pageCheck.breadcrumbs[0]",
        rank: 1,
        source: "json-ld",
        selector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
        items: [
          { label: "Docs", url: "https://example.test/docs", position: 1 },
          { label: "API", url: "https://example.test/docs/api", position: 2 },
          { label: "Responses", url: "https://example.test/docs/api/responses", position: 3 },
        ],
        text: "Docs > API > Responses",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 breadcrumb trail");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.breadcrumbs",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.breadcrumbs",
      count: 1,
      primary: true,
      reason: "Structured breadcrumb trails extracted from JSON-LD and breadcrumb navigation.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.breadcrumbs",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "bc1",
          text: "Docs > API > Responses",
        }),
      ]),
    });
  });

  it("checks requested text against breadcrumb summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/api/responses", "--agent", "--find", "Docs > API > Responses"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <nav aria-label="Breadcrumb">
              <ol>
                <li><a href="/docs">Docs</a></li>
                <li><a href="/docs/api">API</a></li>
                <li>Responses</li>
              </ol>
            </nav>
            <main><h1>Reference</h1></main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "breadcrumb",
        rank: 1,
        selector: "nav:nth-of-type(1)",
        text: "Docs > API > Responses",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes heading-grouped sections for pageCheck and verification", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/runtime", "--agent", "--find", "Latency budgets timeout ceilings"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <main>
              <h1>Runtime guide</h1>
              <section>
                <h2>Latency budgets</h2>
                <p>Production agents should compare timeout ceilings before retrying a browser capture.</p>
                <p>Keep follow-up checks short when the current payload already has enough evidence.</p>
              </section>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.sections).toEqual([
      expect.objectContaining({
        id: "sec1",
        path: "pageCheck.sections[0]",
        rank: 1,
        heading: "Latency budgets",
        level: 2,
        excerpts: [
          "Production agents should compare timeout ceilings before retrying a browser capture.",
          "Keep follow-up checks short when the current payload already has enough evidence.",
        ],
        text: "Latency budgets; Production agents should compare timeout ceilings before retrying a browser capture.; Keep follow-up checks short when the current payload already has enough evidence.",
      }),
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 content section");
    expect(envelope.agent).toMatchObject({
      sectionCount: 1,
      topSectionPath: "pageCheck.sections[0]",
      topSectionHeading: "Latency budgets",
      topSectionLevel: 2,
      topSectionText: "Latency budgets; Production agents should compare timeout ceilings before retrying a browser capture.; Keep follow-up checks short when the current payload already has enough evidence.",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.sections",
      count: 1,
      reason: "Heading-grouped section summaries extracted from nearby page text.",
    }));
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "section",
      rank: 1,
      text: expect.stringContaining("Latency budgets"),
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("keeps top section text in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/runtime", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <section>
            <h2>Latency budgets</h2>
            <p>Production agents should compare timeout ceilings before retrying a browser capture.</p>
          </section>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      sectionCount: 1,
      topSectionPath: "pageCheck.sections[0]",
      topSectionHeading: "Latency budgets",
      topSectionLevel: 2,
      topSectionText: "Latency budgets; Production agents should compare timeout ceilings before retrying a browser capture.",
      topSectionSelector: "h2:nth-of-type(1)",
    });
  });

  it("summarizes pagination navigation as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/blog?page=2", "--agent", "--find", "next Page 3"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <link rel="prev" href="/blog?page=1" title="Previous page">
            <link rel="next" href="/blog?page=3" title="Next page">
          </head>
          <body>
            <main>
              <h1>Blog archive</h1>
              <p>Short archive listing.</p>
              <nav aria-label="Pagination">
                <a href="/blog?page=1" rel="prev">Previous</a>
                <span aria-current="page">2</span>
                <a href="/blog?page=3" rel="next">Page 3</a>
              </nav>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.pagination).toEqual([
      expect.objectContaining({
        id: "pg1",
        path: "pageCheck.pagination[0]",
        kind: "prev",
        label: "Previous page",
        source: "link",
        url: "https://example.test/blog?page=1",
      }),
      expect.objectContaining({
        id: "pg2",
        path: "pageCheck.pagination[1]",
        kind: "next",
        label: "Next page",
        source: "link",
        url: "https://example.test/blog?page=3",
      }),
      expect.objectContaining({
        kind: "page",
        label: "2",
        source: "html",
        current: true,
      }),
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 pagination links");
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.pagination",
      count: 3,
      reason: "Pagination and next/previous links extracted from rel metadata and page navigation.",
    }));
    expect(envelope.agent).toMatchObject({
      paginationCount: 3,
      topPaginationPath: "pageCheck.pagination[0]",
      topPaginationKind: "prev",
      topPaginationLabel: "Previous page",
      topPaginationUrl: "https://example.test/blog?page=1",
    });
    expect(envelope.verification.bestEvidence).toMatchObject({
      field: "pagination",
      rank: 2,
      text: "next Next page https://example.test/blog?page=3",
      url: "https://example.test/blog?page=3",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes table-of-contents navigation as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/guide", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <nav aria-label="On this page">
              <a class="toc-level-2" href="#install">Installation</a>
              <a class="toc-level-2" href="#config">Configuration</a>
              <a class="toc-level-3" href="#api">API reference</a>
            </nav>
            <main></main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.toc).toEqual([
      {
        id: "toc1",
        path: "pageCheck.toc[0]",
        rank: 1,
        title: "On this page",
        selector: "nav:nth-of-type(1)",
        items: [
          { label: "Installation", url: "https://example.test/docs/guide#install", level: 2 },
          { label: "Configuration", url: "https://example.test/docs/guide#config", level: 2 },
          { label: "API reference", url: "https://example.test/docs/guide#api", level: 3 },
        ],
        text: "Installation; Configuration; API reference",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 table of contents");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.toc",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.toc",
      count: 1,
      primary: true,
      reason: "Table-of-contents and in-page section links extracted from document navigation.",
    }));
    expect(envelope.agent).toMatchObject({
      tocCount: 1,
      topTocPath: "pageCheck.toc[0]",
      topTocTitle: "On this page",
      topTocItemCount: 3,
      topTocText: "Installation; Configuration; API reference",
      topTocFirstItemLabel: "Installation",
      topTocFirstItemUrl: "https://example.test/docs/guide#install",
      topTocSelector: "nav:nth-of-type(1)",
    });
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.toc",
      value: [
        expect.objectContaining({
          id: "toc1",
          text: "Installation; Configuration; API reference",
        }),
      ],
    });
  });

  it("checks requested text against table-of-contents summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/guide", "--agent", "--find", "Installation; Configuration; API reference"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <aside class="table-of-contents">
              <a href="#install">Installation</a>
              <a href="#config">Configuration</a>
              <a href="#api">API reference</a>
            </aside>
            <main><p>This guide introduces the package for documentation readers.</p></main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "toc",
        rank: 1,
        selector: "aside:nth-of-type(1)",
        text: "Installation; Configuration; API reference",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes code blocks as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/install", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <main>
              <pre><code class="language-bash">pnpm add ax-grep
npx ax-grep https://example.test --agent</code></pre>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.codeBlocks).toEqual([
      {
        id: "cb1",
        path: "pageCheck.codeBlocks[0]",
        rank: 1,
        text: "pnpm add ax-grep\nnpx ax-grep https://example.test --agent",
        lineCount: 2,
        source: "pre",
        language: "bash",
        commandLike: true,
        selector: "pre:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("1 code block");
    expect(envelope.agent).toMatchObject({
      codeBlockCount: 1,
      topCodeBlockLanguage: "bash",
      topCodeBlockLineCount: 2,
      topCodeBlockText: "pnpm add ax-grep\nnpx ax-grep https://example.test --agent",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.codeBlocks",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.codeBlocks",
      count: 1,
      primary: true,
      reason: "Code examples and command snippets extracted from pre/code blocks.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.codeBlocks",
      value: [
        expect.objectContaining({
          id: "cb1",
          language: "bash",
          commandLike: true,
        }),
      ],
    });
  });

  it("keeps top code block text in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/install", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <pre><code class="language-bash">pnpm add ax-grep
npx ax-grep https://example.test --agent</code></pre>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      codeBlockCount: 1,
      topCodeBlockLanguage: "bash",
      topCodeBlockLineCount: 2,
      topCodeBlockText: "pnpm add ax-grep\nnpx ax-grep https://example.test --agent",
      bestStructuredReadTarget: "pageCheck.codeBlocks",
    });
  });

  it("checks requested text against code block summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/docs/install", "--agent", "--find", "npx ax-grep https://example.test --agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <main>
              <pre><code class="language-bash">pnpm add ax-grep
npx ax-grep https://example.test --agent</code></pre>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "codeBlock",
        rank: 1,
        selector: "pre:nth-of-type(1)",
        text: "pnpm add ax-grep\nnpx ax-grep https://example.test --agent",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes citations and references as pageCheck read targets for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <body>
            <main>
              <cite><a href="/papers/audit">Audit Report 2026</a></cite>
              <ol class="references">
                <li id="ref-1">Journal of Tests, 2026. Independent verification of the audited result.</li>
              </ol>
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.citations).toEqual([
      {
        id: "ct1",
        path: "pageCheck.citations[0]",
        rank: 1,
        source: "cite",
        text: "Citation: Audit Report 2026 - https://example.test/papers/audit",
        title: "Audit Report 2026",
        url: "https://example.test/papers/audit",
        selector: "cite:nth-of-type(1)",
      },
      {
        id: "ct2",
        path: "pageCheck.citations[1]",
        rank: 2,
        source: "reference",
        text: "Reference: Journal of Tests, 2026. Independent verification of the audited result.",
        quote: "Journal of Tests, 2026. Independent verification of the audited result.",
        selector: "li:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("2 citations");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.citations",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.citations",
      count: 2,
      primary: true,
      reason: "Citations, blockquotes, footnotes, and reference-list snippets extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.citations",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "ct1",
          url: "https://example.test/papers/audit",
        }),
      ]),
    });
  });

  it("checks requested text against citation summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--agent", "--find", "https://example.test/papers/audit"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <cite><a href="/papers/audit">Audit Report 2026</a></cite>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "citation",
        rank: 1,
        selector: "cite:nth-of-type(1)",
        text: "Citation: Audit Report 2026 - https://example.test/papers/audit",
        url: "https://example.test/papers/audit",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes page media with resolved image urls and captions for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/gallery", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <title>Gallery</title>
            <meta property="og:image" content="/share.png">
            <meta property="og:image:alt" content="Share preview chart">
          </head>
          <body>
            <main>
              <h1>Gallery</h1>
              <figure>
                <img src="/chart.png" alt="Revenue chart" width="640" height="480">
                <figcaption>Revenue grew 42 percent in 2026.</figcaption>
              </figure>
              <img src="/logo.svg" alt="Logo">
            </main>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.media).toEqual([
      {
        id: "m1",
        path: "pageCheck.media[0]",
        rank: 1,
        kind: "open-graph",
        url: "https://example.test/share.png",
        alt: "Share preview chart",
        text: "Share preview chart - https://example.test/share.png",
        selector: "meta[property=\"og:image\"]",
      },
      {
        id: "m2",
        path: "pageCheck.media[1]",
        rank: 2,
        kind: "figure",
        url: "https://example.test/chart.png",
        alt: "Revenue chart",
        caption: "Revenue grew 42 percent in 2026.",
        width: 640,
        height: 480,
        text: "Revenue grew 42 percent in 2026. - Revenue chart - https://example.test/chart.png",
        selector: "figure:nth-of-type(1)",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("2 media items");
    expect(envelope.agent).toMatchObject({
      mediaCount: 2,
      topMediaKind: "open-graph",
      topMediaUrl: "https://example.test/share.png",
      topMediaText: "Share preview chart - https://example.test/share.png",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.media",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.media",
      count: 2,
      primary: true,
      reason: "Image URLs, alt text, captions, and social preview media extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.media",
      value: [
        expect.objectContaining({
          id: "m1",
          url: "https://example.test/share.png",
        }),
        expect.objectContaining({
          id: "m2",
          caption: "Revenue grew 42 percent in 2026.",
        }),
      ],
    });
  });

  it("keeps top media text in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/gallery", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <head>
          <meta property="og:image" content="/share.png">
          <meta property="og:image:alt" content="Share preview chart">
        </head>
        <main></main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      mediaCount: 1,
      topMediaKind: "open-graph",
      topMediaUrl: "https://example.test/share.png",
      topMediaText: "Share preview chart - https://example.test/share.png",
    });
  });

  it("checks requested text against page media summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/gallery", "--agent", "--find", "Revenue grew 42 percent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <figure>
            <img src="/chart.png" alt="Revenue chart">
            <figcaption>Revenue grew 42 percent in 2026.</figcaption>
          </figure>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "media",
        rank: 1,
        url: "https://example.test/chart.png",
        selector: "figure:nth-of-type(1)",
        text: "Revenue grew 42 percent in 2026. - Revenue chart - https://example.test/chart.png",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes page resource links from head metadata and downloads for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <title>Article resources</title>
            <link rel="alternate" type="application/rss+xml" title="Example feed" href="/feed.xml">
            <link rel="amphtml" href="/amp/article">
            <link rel="license" href="https://creativecommons.org/licenses/by/4.0/">
            <link rel="stylesheet" href="/site.css">
          </head>
          <body>
            <a href="/files/report.pdf">Annual report PDF</a>
            <a href="/site.css">Stylesheet</a>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.resources).toEqual([
      expect.objectContaining({
        id: "rs1",
        path: "pageCheck.resources[0]",
        rank: 1,
        kind: "feed",
        url: "https://example.test/feed.xml",
        title: "Example feed",
        rel: "alternate",
        type: "application/rss+xml",
        text: "feed: Example feed rel=alternate type=application/rss+xml https://example.test/feed.xml",
        selector: "link[rel=\"alternate\"]",
      }),
      expect.objectContaining({
        id: "rs2",
        path: "pageCheck.resources[1]",
        kind: "amp",
        url: "https://example.test/amp/article",
        rel: "amphtml",
        selector: "link[rel=\"amphtml\"]",
      }),
      expect.objectContaining({
        id: "rs3",
        path: "pageCheck.resources[2]",
        kind: "license",
        url: "https://creativecommons.org/licenses/by/4.0/",
        rel: "license",
      }),
      expect.objectContaining({
        id: "rs4",
        path: "pageCheck.resources[3]",
        kind: "document",
        url: "https://example.test/files/report.pdf",
        title: "Annual report PDF",
        type: "application/pdf",
        selector: "a:nth-of-type(1)",
      }),
    ]);
    expect(envelope.pageCheck.resources).toHaveLength(4);
    expect(envelope.pageCheck.readability.reasons).toContain("4 resource links");
    expect(envelope.agent).toMatchObject({
      resourceCount: 4,
      topResourceKind: "feed",
      topResourceUrl: "https://example.test/feed.xml",
      topResourceTitle: "Example feed",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.resources",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.resources",
      count: 4,
      primary: true,
      reason: "Feed, alternate, license, manifest, sitemap, and document resource links extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.resources",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "rs1",
          kind: "feed",
          url: "https://example.test/feed.xml",
        }),
      ]),
    });
  });

  it("keeps top resource titles in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head>
            <link rel="alternate" type="application/rss+xml" title="Example feed" href="/feed.xml">
          </head>
          <body><main><h1>Article</h1></main></body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      contract: { profile: "brief" },
      resourceCount: 1,
      topResourceKind: "feed",
      topResourceUrl: "https://example.test/feed.xml",
      topResourceTitle: "Example feed",
      bestStructuredReadTarget: "pageCheck.resources",
    });
  });

  it("checks requested text against page resource summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/article", "--agent", "--find", "application/pdf"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <a href="/files/report.pdf">Annual report PDF</a>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "resource",
        rank: 1,
        url: "https://example.test/files/report.pdf",
        selector: "a:nth-of-type(1)",
        text: "document: Annual report PDF type=application/pdf https://example.test/files/report.pdf",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes embedded frames and media sources for agents", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/dashboard", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <iframe
            title="Interactive revenue dashboard"
            src="/embed/dashboard?region=us"
            sandbox="allow-scripts allow-same-origin"
            allow="fullscreen"
            loading="lazy"></iframe>
          <video title="Product walkthrough" poster="/media/walkthrough.jpg" controls>
            <source src="/media/walkthrough.mp4" type="video/mp4">
            <source src="/media/walkthrough.webm" type="video/webm">
          </video>
          <object data="/reports/appendix.pdf" type="application/pdf">Appendix PDF</object>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.embeds).toEqual([
      expect.objectContaining({
        id: "em1",
        path: "pageCheck.embeds[0]",
        rank: 1,
        kind: "iframe",
        url: "https://example.test/embed/dashboard?region=us",
        title: "Interactive revenue dashboard",
        sandbox: "allow-scripts allow-same-origin",
        allow: "fullscreen",
        loading: "lazy",
        selector: "iframe:nth-of-type(1)",
      }),
      expect.objectContaining({
        id: "em2",
        path: "pageCheck.embeds[1]",
        rank: 2,
        kind: "video",
        url: "https://example.test/media/walkthrough.mp4",
        title: "Product walkthrough",
        type: "video/mp4",
        posterUrl: "https://example.test/media/walkthrough.jpg",
        sourceUrls: [
          "https://example.test/media/walkthrough.mp4",
          "https://example.test/media/walkthrough.webm",
        ],
        selector: "video:nth-of-type(2)",
      }),
      expect.objectContaining({
        id: "em3",
        path: "pageCheck.embeds[2]",
        rank: 3,
        kind: "object",
        url: "https://example.test/reports/appendix.pdf",
        type: "application/pdf",
        selector: "object:nth-of-type(3)",
      }),
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 embeds");
    expect(envelope.agent.semanticSummary).toMatchObject({
      unavailableCount: 1,
      unavailableItems: [
        expect.objectContaining({
          path: "agent.semanticSummary.unavailableItems[0]",
          tag: "iframe",
          reason: "iframe content unavailable in static HTML",
        }),
      ],
    });
    expect(envelope.agent).toMatchObject({
      semanticUnavailableCount: 1,
      semanticTopUnavailablePath: "agent.semanticSummary.unavailableItems[0]",
      semanticTopUnavailableTag: "iframe",
      semanticTopUnavailableReason: "iframe content unavailable in static HTML",
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.embeds",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.embeds",
      count: 3,
      primary: true,
      reason: "Iframe, object, embed, audio, and video URLs with titles and source metadata extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.embeds",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "em1",
          url: "https://example.test/embed/dashboard?region=us",
        }),
      ]),
    });
  });

  it("keeps unavailable semantic target details in agent brief output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/dashboard", "--agent-brief"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <iframe title="Interactive revenue dashboard" src="/embed/dashboard"></iframe>
          <p>Readable dashboard summary.</p>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.agent).toMatchObject({
      semanticUnavailableCount: 1,
      semanticTopUnavailablePath: "agent.semanticSummary.unavailableItems[0]",
      semanticTopUnavailableTag: "iframe",
      semanticTopUnavailableReason: "iframe content unavailable in static HTML",
    });
  });

  it("checks requested text against embedded content summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/dashboard", "--agent", "--find", "allow-same-origin"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <iframe title="Interactive revenue dashboard" src="/embed/dashboard" sandbox="allow-scripts allow-same-origin"></iframe>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "embed",
        rank: 1,
        url: "https://example.test/embed/dashboard",
        selector: "iframe:nth-of-type(1)",
        text: "iframe: Interactive revenue dashboard https://example.test/embed/dashboard sandbox=allow-scripts allow-same-origin",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes caption and transcript resources for media checks", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/watch", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <video title="Product walkthrough" controls>
            <source src="/media/walkthrough.mp4" type="video/mp4">
            <track kind="captions" src="/media/walkthrough.en.vtt" srclang="en" label="English captions">
          </video>
          <audio controls src="/audio/interview.mp3">
            <track kind="subtitles" src="/audio/interview.ko.vtt" srclang="ko" label="Korean subtitles">
          </audio>
          <a href="/media/walkthrough-transcript.txt">Full transcript</a>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.pageCheck.transcripts).toEqual([
      {
        id: "tr1",
        path: "pageCheck.transcripts[0]",
        rank: 1,
        kind: "captions",
        url: "https://example.test/media/walkthrough.en.vtt",
        mediaKind: "video",
        label: "English captions",
        language: "en",
        selector: "track:nth-of-type(1)",
        text: "captions: English captions lang=en media=video https://example.test/media/walkthrough.en.vtt",
      },
      {
        id: "tr2",
        path: "pageCheck.transcripts[1]",
        rank: 2,
        kind: "subtitles",
        url: "https://example.test/audio/interview.ko.vtt",
        mediaKind: "audio",
        label: "Korean subtitles",
        language: "ko",
        selector: "track:nth-of-type(2)",
        text: "subtitles: Korean subtitles lang=ko media=audio https://example.test/audio/interview.ko.vtt",
      },
      {
        id: "tr3",
        path: "pageCheck.transcripts[2]",
        rank: 3,
        kind: "transcript",
        url: "https://example.test/media/walkthrough-transcript.txt",
        label: "Full transcript",
        selector: "a:nth-of-type(1)",
        text: "transcript: Full transcript https://example.test/media/walkthrough-transcript.txt",
      },
    ]);
    expect(envelope.pageCheck.readability.reasons).toContain("3 transcripts");
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "read-content",
      execution: "read-current",
      readFrom: "pageCheck.transcripts",
    });
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.transcripts",
      count: 3,
      primary: true,
      reason: "Caption, subtitle, and transcript URLs with labels and language hints extracted from page HTML.",
    }));
    expect(envelope.agent.next.readValue).toMatchObject({
      path: "pageCheck.transcripts",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: "tr1",
          url: "https://example.test/media/walkthrough.en.vtt",
        }),
      ]),
    });
  });

  it("checks requested text against caption and transcript resources", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/watch", "--agent", "--find", "Korean subtitles"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <audio controls src="/audio/interview.mp3">
            <track kind="subtitles" src="/audio/interview.ko.vtt" srclang="ko" label="Korean subtitles">
          </audio>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "transcript",
        rank: 1,
        url: "https://example.test/audio/interview.ko.vtt",
        selector: "track:nth-of-type(1)",
        text: "subtitles: Korean subtitles lang=ko media=audio https://example.test/audio/interview.ko.vtt",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
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
        sourceLinkRef: "pageCheck.sourceLinks[0]",
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
    expect(envelope.agent).toMatchObject({
      staticReadiness: "usable-structured-data",
      staticReadinessReasonCode: "source-link",
      staticReadinessReadFrom: "pageCheck.sourceLinks[0]",
    });
  });

  it("prints the source link reference for a primary source-link action", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://forum.example/thin"], {
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

    expect(status).toBe(0);
    expect(stdout.output).toContain("  next: open-source-link - The page has limited readable content, but an external source link is available.");
    expect(stdout.output).toContain("  url: https://source.example/report");
    expect(stdout.output).toContain("  primarySourceLinkRef: pageCheck.sourceLinks[0]");
    expect(stdout.output).toContain("  sourceLinkRef: pageCheck.sourceLinks[0]");
    expect(stdout.output).toMatch(
      /pageCheck[\s\S]*  next: open-source-link - The page has limited readable content, but an external source link is available\.[\s\S]*  url: https:\/\/source\.example\/report[\s\S]*  sourceLinkRef: pageCheck\.sourceLinks\[0\]/,
    );
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
        <html>
          <head>
            <title>Article title</title>
            <meta property="og:site_name" content="Example News">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": ["NewsArticle", "ReportageNewsArticle"],
                "headline": "Article title",
                "author": [{"@type": "Person", "name": "Article Author"}],
                "datePublished": "2026-02-03T04:05:06Z",
                "dateModified": "2026-02-04T05:06:07Z"
              }
            </script>
          </head>
          <body>
            <main>
              <article>
                <h1>Article heading</h1>
                <p>This article paragraph is long enough to appear in the page checking summary for agents.</p>
                <a href="https://source.example/report">Source report</a>
              </article>
            </main>
          </body>
        </html>
      `),
    });

    expect(status).toBe(0);
    expect(stdout.output).toContain("agent\n  status: ready");
    expect(stdout.output).toContain("  pageKind: content-page");
    expect(stdout.output).toContain("  routingIntent: read-current");
    expect(stdout.output).toContain("  continuationMode: read");
    expect(stdout.output).toContain("  nextMode: read");
    expect(stdout.output).toContain("  pageDecisionReadTargetKind: evidence");
    expect(stdout.output).toContain("  pageDecisionReadTargetReason: Content evidence is ready.");
    expect(stdout.output).toContain("  staticReadinessReadTargetKind: evidence");
    expect(stdout.output).toContain("  executor: return/return/medium action=read-content status=ready - Answer now from pageCheck.contentEvidence using citations e1.");
    expect(stdout.output).toContain("  executorReadFrom: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  executorReadTargetKind: evidence");
    expect(stdout.output).toContain("  executorReadTargetCount: 1");
    expect(stdout.output).toContain("  executorReadTargetReason: Content evidence is ready.");
    expect(stdout.output).toContain("  executorReadValue: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  executorReadTarget: pageCheck.contentEvidence kind=evidence count=1");
    expect(stdout.output).toContain("  loopDecision: return");
    expect(stdout.output).toContain("  loopContinue: false");
    expect(stdout.output).toContain("  loopTerminal: true");
    expect(stdout.output).toContain("  loopMaxIterations: 0");
    expect(stdout.output).toContain("  loopReason: Return the resolved value for pageCheck.contentEvidence.");
    expect(stdout.output).toContain("  runbookDecision: return");
    expect(stdout.output).toContain("  runbookOperation: return");
    expect(stdout.output).toContain("  runbookExpectedOutcome: read-evidence");
    expect(stdout.output).toContain("  executionPlanReadTargetKind: evidence");
    expect(stdout.output).toContain("  executionPlanReadTargetReason: Content evidence is ready.");
    expect(stdout.output).toContain("  handoff: return/return/medium action=read-content priority=high - Answer now from pageCheck.contentEvidence using citations e1.");
    expect(stdout.output).toContain("  handoffReadFrom: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  handoffReadTargetKind: evidence");
    expect(stdout.output).toContain("  handoffReadTargetCount: 1");
    expect(stdout.output).toContain("  handoffReadTargetReason: Content evidence is ready.");
    expect(stdout.output).toContain("  answerPlanReadTargetKind: evidence");
    expect(stdout.output).toContain("  answerPlanReadTargetReason: Content evidence is ready.");
    expect(stdout.output).toContain("  handoffReadValue: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  handoffReadValueType: array count=1");
    expect(stdout.output).toContain("  handoffReadValueItem: pageCheck.contentEvidence[0] e1 rank=1 role=p score=");
    expect(stdout.output).toContain(" - This article paragraph is long enough to appear in the page checking summary for agents.");
    expect(stdout.output).toContain("  handoffReadTarget: pageCheck.contentEvidence kind=evidence count=1");
    expect(stdout.output).toContain("  handoffEvidence: e1 pageCheck.contentEvidence[0] content high score=");
    expect(stdout.output).toContain("  handoffSourceChoice: s1 pageCheck.sourceLinks[0] rank=1");
    const sourceChoiceCommandArgs =
      stdout.output.match(/    commandArgs: \["ax-grep","https:\/\/source\.example\/report","--json","--summary"\]/g)?.length ?? 0;
    expect(sourceChoiceCommandArgs).toBeGreaterThanOrEqual(2);
    expect(stdout.output).toContain("  handoffSignal: content/info - ");
    expect(stdout.output).toContain("  handoffQualityGate: fetch pass/info score=1 path=agent.responseStatus - Fetched response was converted into an agent payload.");
    expect(stdout.output).toContain("  executionPlanOperation: return");
    expect(stdout.output).toContain("  executionPlanExpectedOutcome: read-evidence");
    expect(stdout.output).toContain("  expectedOutcome: read-evidence - ");
    expect(stdout.output).toContain("  expectedOutcomeKind: read-evidence");
    expect(stdout.output).toContain("  answerPlan: ready - Readable page evidence is available; answer from the listed citations.");
    expect(stdout.output).toContain("  answerConfidence: medium");
    expect(stdout.output).toContain("  answerGaps: Page readability is medium.");
    expect(stdout.output).toContain("  answerCitations: e1");
    expect(stdout.output).toContain("  answerReadFrom: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  answerUrl: https://example.test/article");
    expect(stdout.output).toContain("  signal: content/info - ");
    expect(stdout.output).toContain("  semanticSummary: nodes=");
    expect(stdout.output).toContain(" named=");
    expect(stdout.output).toContain(" interactive=");
    expect(stdout.output).toContain("  semanticTopRoles:");
    expect(stdout.output).toContain("  semanticOutline: agent.semanticSummary.semanticOutline[0] landmark:main role=main");
    expect(stdout.output).toContain("  semanticHeading: agent.semanticSummary.headingItems[0] Article heading");
    expect(stdout.output).toContain("  semanticLandmark: agent.semanticSummary.landmarkItems[0] main");
    expect(stdout.output).toContain("  semanticNodeCount:");
    expect(stdout.output).toContain("  semanticNamedRoleCount:");
    expect(stdout.output).toContain("  semanticTopHeading: agent.semanticSummary.headingItems[0] Article heading");
    expect(stdout.output).toContain("  qualityGate: fetch pass/info score=1 path=agent.responseStatus - Fetched response was converted into an agent payload.");
    expect(stdout.output).toContain("  qualityGate: content pass/info score=");
    expect(stdout.output).toContain("  qualityGate: source pass/info score=");
    expect(stdout.output).toContain("  signalCount: 3");
    expect(stdout.output).toContain("  signalWarnings: 1");
    expect(stdout.output).toContain("  signalErrors: 0");
    expect(stdout.output).toContain("  qualityGateCount: 6");
    expect(stdout.output).toContain("  qualityGateFailures: 0");
    expect(stdout.output).toContain("  problemSignal: warning/diagnostic - ");
    expect(stdout.output).toContain("  canContinue: true");
    expect(stdout.output).toContain("  responseStatus: 200");
    expect(stdout.output).toContain("  responseOk: true");
    expect(stdout.output).toContain("  responseContentType: text/plain;charset=UTF-8");
    expect(stdout.output).toContain("  finalUrlChanged: false");
    expect(stdout.output).toContain("  resultCount: 0");
    expect(stdout.output).toContain("  resultChoiceCount: 0");
    expect(stdout.output).toContain("  evidenceCount: 1");
    expect(stdout.output).toContain("  formCount: 0");
    expect(stdout.output).toContain("  formChoiceCount: 0");
    expect(stdout.output).toContain("  actionTargetCount: 0");
    expect(stdout.output).toContain("  actionTargetChoiceCount: 0");
    expect(stdout.output).toContain("  hiddenSignalCount: 4");
    expect(stdout.output).toContain("  hiddenHydrationCount:");
    expect(stdout.output).toContain("  hiddenApiEndpointCount:");
    expect(stdout.output).toContain("  hiddenClientStateCount:");
    expect(stdout.output).toContain("  hiddenAppHintCount:");
    expect(stdout.output).not.toContain("  topApiEndpoint:");
    expect(stdout.output).toContain("  hiddenReadTargetCount: 2");
    expect(stdout.output).toContain("  bestHiddenReadTarget:");
    expect(stdout.output).toContain("  bestHiddenReadTargetCount:");
    expect(stdout.output).toContain("  sourceLinkCount: 1");
    expect(stdout.output).toContain("  sourceChoiceCount: 1");
    expect(stdout.output).toContain("  alternativeActionCount: 1");
    expect(stdout.output).toContain("  alternativeActionName:");
    expect(stdout.output).toContain("  alternativeActionExecution:");
    expect(stdout.output).toContain("  alternativeActionCommandArgs:");
    expect(stdout.output).toContain("  usabilityScore:");
    expect(stdout.output).toContain("  evidenceQualityScore:");
    expect(stdout.output).toContain("  sourceQualityScore:");
    expect(stdout.output).toContain("  diagnosticErrors: 0");
    expect(stdout.output).toContain("  diagnosticWarnings: 1");
    expect(stdout.output).toContain("  diagnosticInfo: 0");
    expect(stdout.output).toContain("  citationCount: 2");
    expect(stdout.output).toContain("  answerEvidenceCount: 1");
    expect(stdout.output).toContain("  readTargetCount: 5");
    expect(stdout.output).toContain("  actionCount: 2");
    expect(stdout.output).toContain("  verification: 0/0 found, 0 missing");
    expect(stdout.output).toContain("  readability: medium");
    expect(stdout.output).toContain("  citation: e1 pageCheck.contentEvidence[0] content high score=");
    expect(stdout.output).toContain("high evidence from semantic extraction");
    expect(stdout.output).toContain("This article paragraph is long enough to appear in the page checking summary for agents.");
    expect(stdout.output).toContain("  citation: s1 pageCheck.sourceLinks[0] source-link medium score=");
    expect(stdout.output).toContain("Possible source candidate: news-like.");
    expect(stdout.output).toContain("  sourceChoice: s1 pageCheck.sourceLinks[0] rank=1");
    expect(stdout.output).toContain("source=source.example type=news kind=external <https://source.example/report> - Possible source candidate: news-like. Source report");
    expect(stdout.output).toContain("    command: ax-grep 'https://source.example/report' --json --summary");
    expect(stdout.output).toContain("    commandArgs: [\"ax-grep\",\"https://source.example/report\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  actionCandidate: pageCheck.nextSteps open-source-link <https://source.example/report>");
    expect(stdout.output).toContain("    sourceLinkRef: pageCheck.sourceLinks[0]");
    expect(stdout.output).toContain("  bestReadTarget: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  bestReadTargetCount: 1");
    expect(stdout.output).toContain("  bestReadTargetPrimary: true");
    expect(stdout.output).toContain("  bestReadTargetReason: Structured page excerpts suitable for source checking.");
    expect(stdout.output).toContain("  primaryActionName: read-content");
    expect(stdout.output).toContain("  primaryReason: The page has enough structured evidence for source checking.");
    expect(stdout.output).toContain("  primaryPriority: high");
    expect(stdout.output).toContain("  primaryPriorityReason: Readable content evidence is available in the current payload.");
    expect(stdout.output).toContain("  readabilityReason: 1 content evidence item");
    expect(stdout.output).toContain("  recommendedUrl: https://example.test/article");
    expect(stdout.output).toContain("pageCheck\n  confidence: medium");
    expect(stdout.output).toContain("  readability: medium");
    expect(stdout.output).toContain("page\n  title: Article title");
    expect(stdout.output).toContain("  site: Example News");
    expect(stdout.output).toContain("  author: Article Author");
    expect(stdout.output).toContain("  published: 2026-02-03T04:05:06Z");
    expect(stdout.output).toContain("  modified: 2026-02-04T05:06:07Z");
    expect(stdout.output).toContain("  schemaTypes: NewsArticle, ReportageNewsArticle");
    expect(stdout.output).toContain("  title: Article title");
    expect(stdout.output).toContain("  site: Example News");
    expect(stdout.output).toContain("  author: Article Author");
    expect(stdout.output).toContain("  published: 2026-02-03T04:05:06Z");
    expect(stdout.output).toContain("  modified: 2026-02-04T05:06:07Z");
    expect(stdout.output).toContain("  schemaTypes: NewsArticle, ReportageNewsArticle");
    expect(stdout.output).toContain("  mainHeading: Article heading");
    expect(stdout.output).toContain("  excerpt: This article paragraph is long enough to appear in the page checking summary for agents.");
    expect(stdout.output).toContain("  evidence: e1 pageCheck.contentEvidence[0] 1. p (p) high - high evidence from semantic extraction, 88 chars, p content, selector available. This article paragraph is long enough to appear in the page checking summary for agents.");
    expect(stdout.output).toContain("  link: external Source report <https://source.example/report> - Possible source candidate: news-like.");
    expect(stdout.output).toContain("  sourceLink: Source report <https://source.example/report> - Possible source candidate: news-like.");
    expect(stdout.output).toContain("  next: read-content [terminal] - The page has enough structured evidence for source checking.");
    expect(stdout.output).toContain("  execution: read-current");
    expect(stdout.output).toContain("  readFrom: pageCheck.contentEvidence");
    expect(stdout.output).not.toContain("  command: ax-grep 'https://example.test/article' --json --summary");
    expect(stdout.output).toContain("  step: 1. read-content [terminal] <https://example.test/article> - The page has enough structured evidence for source checking.");
    expect(stdout.output).toContain("    readFrom: pageCheck.contentEvidence");
    expect(stdout.output).toContain("  step: 2. open-source-link <https://source.example/report> - Inspect an external source link referenced by the page.");
    expect(stdout.output).toContain("    execution: run-command");
    expect(stdout.output).toContain("    sourceLinkRef: pageCheck.sourceLinks[0]");
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
        target: {
          title: "Source report",
          url: "https://source.example/report",
          source: "source.example",
          rank: 1,
        },
        command: "ax-grep 'https://source.example/report' --find 'not present' --json --summary",
      },
    });
    expect(envelope.agent).toMatchObject({
      status: "verify",
      canUseFetchedHtml: true,
      needsBrowserHtml: false,
      verificationStatus: "partial",
      verificationFoundQueries: ["page checking summary"],
      verificationMissingQueries: ["not present"],
      topVerificationFoundQuery: "page checking summary",
      topVerificationMissingQuery: "not present",
      executor: {
        verificationFoundQueries: ["page checking summary"],
        verificationMissingQueries: ["not present"],
      },
      handoff: {
        verificationFoundQueries: ["page checking summary"],
        verificationMissingQueries: ["not present"],
      },
      primaryAction: {
        action: "open-source-link",
        url: "https://source.example/report",
        target: {
          title: "Source report",
          url: "https://source.example/report",
          source: "source.example",
          rank: 1,
        },
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
    expect(stdout.output).toContain("  verificationFoundQueries: source report");
    expect(stdout.output).toContain("  topVerificationFoundQuery: source report");
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
    expect(stdout.output).toContain("  recommendedCommandArgs: [\"ax-grep\",\"https://result.example/article\",\"--json\",\"--summary\"]");
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
        command: "ax-grep 'https://example.test' --html-file captured.html --json --summary",
        commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
        browserHtml: {
          url: "https://example.test",
          htmlFile: "captured.html",
          captureScript: "document.documentElement.outerHTML",
          command: "ax-grep 'https://example.test' --html-file captured.html --json --summary",
          commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
        },
      },
      expectedOutcome: {
        kind: "capture-html",
      },
      runbook: {
        decision: "browser",
        mode: "capture-html",
        operation: "capture-browser-html",
        action: "retry-with-browser-html",
        answerStatus: "blocked",
        answerReady: false,
        shouldContinue: true,
        terminal: false,
        maxSuggestedIterations: 1,
        useFetchedHtml: false,
        needsBrowserHtml: true,
        expectedOutcome: "capture-html",
        commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
        browserHtml: {
          htmlFile: "captured.html",
          captureScript: "document.documentElement.outerHTML",
          commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
        },
      },
      answerPlan: {
        status: "blocked",
        nextAction: "retry-with-browser-html",
        command: "ax-grep 'https://example.test' --html-file captured.html --json --summary",
        commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
        gaps: expect.arrayContaining(["Extraction failed with NO_INSPECTABLE_CONTENT.", "Browser-captured HTML or browser inspection is needed."]),
      },
      answerPlanNextAction: "retry-with-browser-html",
      executionPlan: {
        operation: "capture-browser-html",
        expectedOutcome: "capture-html",
        command: "ax-grep 'https://example.test' --html-file captured.html --json --summary",
        commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
        needsBrowserHtml: true,
        browserHtml: {
          htmlFile: "captured.html",
          captureScript: "document.documentElement.outerHTML",
          commandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
        },
        answerReady: false,
      },
      signals: expect.arrayContaining([
        expect.objectContaining({ kind: "browser", severity: "warning" }),
        expect.objectContaining({ kind: "diagnostic", severity: "error" }),
      ]),
      canUseFetchedHtml: false,
      needsBrowserHtml: true,
      needsBrowserInteraction: false,
      staticReadinessReasonCode: "browser-required",
      browserHtmlReason: "Browser-captured HTML or browser inspection is needed.",
      browserHtmlReasonCode: "no-inspectable-content",
      browserHtmlActionName: "retry-with-browser-html",
      browserHtmlOperation: "capture-browser-html",
      browserHtmlUrl: "https://example.test",
      browserHtmlFile: "captured.html",
      browserHtmlCaptureScript: "document.documentElement.outerHTML",
      browserHtmlCommand: "ax-grep 'https://example.test' --html-file captured.html --json --summary",
      browserHtmlCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--json", "--summary"],
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

  it("prints browser capture handoff details in text output", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test"], {
      stdout,
      fetch: async () => new Response("", { status: 200, headers: { "content-type": "text/html" } }),
    });

    expect(status).toBe(20);
    expect(stdout.output).toContain("agent\n  status: needs-browser");
    expect(stdout.output).toContain("  continuationMode: capture-html");
    expect(stdout.output).toContain("  browserHtmlReason: Browser-captured HTML or browser inspection is needed.");
    expect(stdout.output).toContain("  browserHtmlReasonCode: no-inspectable-content");
    expect(stdout.output).toContain("  browserHtmlActionName: retry-with-browser-html");
    expect(stdout.output).toContain("  browserHtmlOperation: capture-browser-html");
    expect(stdout.output).toContain("  browserHtmlUrl: https://example.test");
    expect(stdout.output).toContain("  browserHtmlFile: captured.html");
    expect(stdout.output).toContain("  browserHtmlCaptureScript: document.documentElement.outerHTML");
    expect(stdout.output).toContain("  browserHtmlCommandArgs: [\"ax-grep\",\"https://example.test\",\"--html-file\",\"captured.html\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  executor: browser/capture-browser-html/low action=retry-with-browser-html status=blocked - ");
    expect(stdout.output).toContain("  executorCommandArgs: [\"ax-grep\",\"https://example.test\",\"--html-file\",\"captured.html\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  executorBrowserHtml: captured.html capture=document.documentElement.outerHTML");
    expect(stdout.output).toContain("  executorBrowserHtmlUrl: https://example.test");
    expect(stdout.output).toContain("  executorBrowserHtmlCommandArgs: [\"ax-grep\",\"https://example.test\",\"--html-file\",\"captured.html\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  handoff: browser/capture-browser-html/low action=retry-with-browser-html priority=high - ");
    expect(stdout.output).toContain("  handoffCommandArgs: [\"ax-grep\",\"https://example.test\",\"--html-file\",\"captured.html\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  handoffUrl: https://example.test");
    expect(stdout.output).toContain("  handoffBrowserHtml: captured.html capture=document.documentElement.outerHTML");
    expect(stdout.output).toContain("  handoffBrowserHtmlUrl: https://example.test");
    expect(stdout.output).toContain("  handoffBrowserHtmlFile: captured.html");
    expect(stdout.output).toContain("  handoffBrowserHtmlCaptureScript: document.documentElement.outerHTML");
    expect(stdout.output).toContain("  handoffBrowserHtmlCommandArgs: [\"ax-grep\",\"https://example.test\",\"--html-file\",\"captured.html\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("  handoffSignal: browser/warning - Browser-captured HTML is recommended before trusting page content.");
    expect(stdout.output).toContain("  handoffQualityGate: browser fail/warning score=0 path=agent.needsBrowserHtml - Browser-captured HTML or browser inspection is needed.");
    expect(stdout.output).toContain("  next: retry-with-browser-html - The page is not reliably readable from fetched HTML.");
    expect(stdout.output).toContain("  commandArgs: [\"ax-grep\",\"https://example.test\",\"--html-file\",\"captured.html\",\"--json\",\"--summary\"]");
    expect(stdout.output).toContain("pageCheck\n  confidence: low");
    expect(stdout.output).toContain("  next: retry-with-browser-html - The page is not reliably readable from fetched HTML.");
    expect(stdout.output).toContain("  step: 1. retry-with-browser-html <https://example.test> - The page is not reliably readable from fetched HTML.");
  });

  it("classifies JavaScript app shells as client-rendered browser handoff", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://example.test/app", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <html>
          <head><title>Client App</title></head>
          <body>
            <div id="root"></div>
            <script src="/assets/app.js"></script>
          </body>
        </html>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(20);
    expect(envelope.agent.diagnosticCodes).toEqual(expect.arrayContaining(["CLIENT_RENDERED"]));
    expect(envelope.agent.topDiagnosticCode).toBe("CLIENT_RENDERED");
    expect(envelope.agent.topDiagnosticSeverity).toBe("warning");
    expect(envelope.agent).toMatchObject({
      status: "needs-browser",
      needsBrowserHtml: true,
      staticReadiness: "needs-browser",
      staticReadinessReasonCode: "client-rendered",
      browserHtmlReasonCode: "client-rendered",
      browserHtmlActionName: "retry-with-browser-html",
      browserHtmlOperation: "capture-browser-html",
      primaryAction: {
        action: "retry-with-browser-html",
      },
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
    expect(envelope.agent).toMatchObject({
      needsBrowserHtml: true,
      staticReadinessReasonCode: "browser-required",
      browserHtmlReasonCode: "challenge",
      browserHtmlActionName: "retry-with-browser-html",
    });
  });

  it("detects login and paywall barriers", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://news.example/article", "--agent"], {
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
    expect(envelope.agent.diagnosticCodes).toEqual(expect.arrayContaining([
      "LOGIN_REQUIRED",
      "PAYWALL_LIKELY",
    ]));
    expect(envelope.agent).toMatchObject({
      topDiagnosticCode: "LOGIN_REQUIRED",
      topDiagnosticSeverity: "warning",
      topDiagnosticMessage: expect.stringContaining("login"),
      barrierCount: 3,
      topBarrierKind: "login",
      topBarrierSeverity: "warning",
      topBarrierSource: "diagnostic",
      topBarrierPath: "pageCheck.barriers[0]",
      topBarrierText: "Login: The page appears to require login or account access.",
      topBarrierDiagnosticCode: "LOGIN_REQUIRED",
      needsBrowserHtml: true,
      staticReadinessReasonCode: "browser-required",
      browserHtmlReasonCode: "login-required",
      browserHtmlActionName: "retry-with-browser-html",
    });
    expect(envelope.pageCheck.barriers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "br1",
        path: "pageCheck.barriers[0]",
        kind: "login",
        source: "diagnostic",
        diagnosticCode: "LOGIN_REQUIRED",
        text: "Login: The page appears to require login or account access.",
      }),
      expect.objectContaining({
        id: "br2",
        path: "pageCheck.barriers[1]",
        kind: "paywall",
        source: "diagnostic",
        diagnosticCode: "PAYWALL_LIKELY",
        text: "Paywall: The page appears to be paywalled or subscription-gated.",
      }),
    ]));
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.barriers",
      count: expect.any(Number),
      reason: "Login, paywall, challenge, consent, or regional barrier signals extracted for browser-handling decisions.",
    }));
  });

  it("checks requested text against page barrier summaries", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://news.example/article", "--agent", "--find", "paywalled or subscription-gated"], {
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
    expect(envelope.verification).toMatchObject({
      status: "matched",
      bestEvidence: {
        field: "barrier",
        rank: 2,
        text: "Paywall: The page appears to be paywalled or subscription-gated.",
      },
    });
    expect(envelope.agent.primaryAction).toMatchObject({
      action: "use-evidence",
      readFrom: "verification.bestEvidence",
    });
  });

  it("summarizes consent actions as non-blocking page barriers", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://shop.example/product", "--agent"], {
      stdout,
      fetch: async () => new Response(`
        <main>
          <h1>Product details</h1>
          <p>This product page includes enough public content for reading.</p>
          <button>Accept all cookies</button>
        </main>
      `, { headers: { "content-type": "text/html" } }),
    });

    const envelope = JSON.parse(stdout.output);

    expect(status).toBe(0);
    expect(envelope.kind).not.toBe("blocked-page");
    expect(envelope.pageCheck.barriers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "cookie-consent",
        severity: "info",
        source: "action",
        evidence: "Accept all cookies",
        text: "Cookie consent: Accept all cookies",
      }),
    ]));
    expect(envelope.agent.readTargets).toContainEqual(expect.objectContaining({
      path: "pageCheck.barriers",
    }));
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
      staticReadinessReasonCode: "browser-required",
      browserHtmlReason: "Browser-captured HTML is needed.",
      browserHtmlReasonCode: "http-error",
      primaryAction: {
        action: "retry-with-browser-html",
        url: "https://example.test/package",
        command: "ax-grep 'https://example.test/package' --html-file captured.html --find 'target claim' --agent",
        commandArgs: ["ax-grep", "https://example.test/package", "--html-file", "captured.html", "--find", "target claim", "--agent"],
      },
      next: {
        mode: "capture-html",
        action: "retry-with-browser-html",
        browserHtml: {
          url: "https://example.test/package",
          htmlFile: "captured.html",
          captureScript: "document.documentElement.outerHTML",
          command: "ax-grep 'https://example.test/package' --html-file captured.html --find 'target claim' --agent",
          commandArgs: ["ax-grep", "https://example.test/package", "--html-file", "captured.html", "--find", "target claim", "--agent"],
        },
      },
      answerPlan: {
        status: "blocked",
        confidence: "low",
        nextAction: "retry-with-browser-html",
        url: "https://example.test/package",
        command: "ax-grep 'https://example.test/package' --html-file captured.html --find 'target claim' --agent",
        commandArgs: ["ax-grep", "https://example.test/package", "--html-file", "captured.html", "--find", "target claim", "--agent"],
        gaps: expect.arrayContaining(["Extraction failed with HTTP_ERROR.", "Browser-captured HTML is needed."]),
      },
      executionPlan: {
        operation: "capture-browser-html",
        needsBrowserHtml: true,
        shouldContinue: true,
        answerReady: false,
        browserHtml: {
          htmlFile: "captured.html",
          captureScript: "document.documentElement.outerHTML",
          commandArgs: ["ax-grep", "https://example.test/package", "--html-file", "captured.html", "--find", "target claim", "--agent"],
        },
      },
    });
    expect(envelope.pageCheck.recommendedAction).toBeUndefined();
    expect(envelope.pageCheck.nextSteps).toBeUndefined();
  });

  it("keeps brief mode in HTTP error recovery commands", async () => {
    const missingStdout = new MemoryWriter();
    const missingStatus = await runCli(["https://missing.example/page", "--agent-brief"], {
      stdout: missingStdout,
      fetch: async () => new Response("not found", { status: 404, statusText: "Not Found" }),
    });
    const blockedStdout = new MemoryWriter();
    const blockedStatus = await runCli(["https://blocked.example/package", "--agent-brief", "--find", "target claim"], {
      stdout: blockedStdout,
      fetch: async () => new Response("blocked", { status: 403, statusText: "Forbidden" }),
    });

    const missingEnvelope = JSON.parse(missingStdout.output);
    const blockedEnvelope = JSON.parse(blockedStdout.output);

    expect(missingStatus).toBe(12);
    expect(missingStdout.output).not.toContain("--agent-brief-brief");
    expect(missingEnvelope.agent).toMatchObject({
      contract: { profile: "brief" },
      executor: {
        instruction: "Run ax-grep --search 'https://missing.example/page' --agent-brief and continue with its output.",
        action: "check-url-or-search",
        commandArgs: ["ax-grep", "--search", "https://missing.example/page", "--agent-brief"],
      },
      handoff: {
        instruction: "Run ax-grep --search 'https://missing.example/page' --agent-brief and continue with its output.",
        action: "check-url-or-search",
        commandArgs: ["ax-grep", "--search", "https://missing.example/page", "--agent-brief"],
        signals: expect.arrayContaining([
          expect.objectContaining({ kind: "diagnostic", severity: "error" }),
        ]),
        qualityGates: expect.arrayContaining([
          expect.objectContaining({ kind: "fetch", pass: false, severity: "error" }),
          expect.objectContaining({ kind: "browser", pass: true }),
        ]),
      },
      problemSignalKind: "diagnostic",
      problemSignalSeverity: "error",
      failingQualityGateKind: "fetch",
      failingQualityGateSeverity: "error",
      failingQualityGateScore: 0,
      primaryAction: {
        command: "ax-grep --search 'https://missing.example/page' --agent-brief",
        commandArgs: ["ax-grep", "--search", "https://missing.example/page", "--agent-brief"],
      },
    });

    expect(blockedStatus).toBe(12);
    expect(blockedStdout.output).not.toContain("--agent-brief-brief");
    expect(blockedEnvelope.agent).toMatchObject({
      contract: { profile: "brief" },
      executor: {
        instruction: "Capture rendered HTML into captured.html, then run ax-grep 'https://blocked.example/package' --html-file captured.html --find 'target claim' --agent-brief.",
        action: "retry-with-browser-html",
        commandArgs: ["ax-grep", "https://blocked.example/package", "--html-file", "captured.html", "--find", "target claim", "--agent-brief"],
        browserHtml: {
          commandArgs: ["ax-grep", "https://blocked.example/package", "--html-file", "captured.html", "--find", "target claim", "--agent-brief"],
        },
      },
      handoff: {
        instruction: "Capture rendered HTML into captured.html, then run ax-grep 'https://blocked.example/package' --html-file captured.html --find 'target claim' --agent-brief.",
        action: "retry-with-browser-html",
        commandArgs: ["ax-grep", "https://blocked.example/package", "--html-file", "captured.html", "--find", "target claim", "--agent-brief"],
        browserHtml: {
          commandArgs: ["ax-grep", "https://blocked.example/package", "--html-file", "captured.html", "--find", "target claim", "--agent-brief"],
        },
        signals: expect.arrayContaining([
          expect.objectContaining({ kind: "diagnostic", severity: "error" }),
          expect.objectContaining({ kind: "browser", severity: "warning" }),
        ]),
        qualityGates: expect.arrayContaining([
          expect.objectContaining({ kind: "fetch", pass: false, severity: "error" }),
          expect.objectContaining({ kind: "browser", pass: false, severity: "warning" }),
        ]),
      },
      primaryAction: {
        command: "ax-grep 'https://blocked.example/package' --html-file captured.html --find 'target claim' --agent-brief",
        commandArgs: ["ax-grep", "https://blocked.example/package", "--html-file", "captured.html", "--find", "target claim", "--agent-brief"],
      },
    });
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
        topDiagnosticCode: "USAGE",
        topDiagnosticSeverity: "error",
        topDiagnosticMessage: "missing URL",
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
      nextActionName: "broaden-search",
      nextExecution: "run-command",
      nextCommandArgs: ["ax-grep", "--search", "missing claim", "--find", "missing claim", "--agent"],
      primaryAction: {
        action: "broaden-search",
        execution: "run-command",
        command: "ax-grep --search 'missing claim' --find 'missing claim' --agent",
      },
    });
    expect(JSON.stringify(envelope)).not.toContain("retry-with-browser-html");
  });

  it("preserves brief primary command shortcuts for missing captured evidence", async () => {
    const stdout = new MemoryWriter();
    const status = await runCli(["https://captured.example/page", "--stdin", "--agent-brief", "--find", "missing claim"], {
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
      primaryExecution: "run-command",
      primaryCommand: "ax-grep --search 'missing claim' --find 'missing claim' --agent",
      primaryCommandArgs: ["ax-grep", "--search", "missing claim", "--find", "missing claim", "--agent-brief"],
      nextCommandArgs: ["ax-grep", "--search", "missing claim", "--find", "missing claim", "--agent-brief"],
      responseStatus: expect.any(Number),
      responseOk: expect.any(Boolean),
      responseContentType: expect.any(String),
      finalUrlChanged: expect.any(Boolean),
      verificationRequestedCount: 1,
      verificationFoundCount: 0,
      verificationMissingCount: 1,
    });
  });

  it("preserves brief read-target reasons and browser follow-up shortcuts", async () => {
    const matched = new MemoryWriter();
    const matchedStatus = await runCli(["https://captured.example/page", "--stdin", "--agent-brief", "--find", "needle"], {
      stdout: matched,
      stdin: Readable.from([`
        <main>
          <article>
            <h1>Captured Page</h1>
            <p>The static page contains a needle and enough readable context for direct evidence use.</p>
          </article>
        </main>
      `]) as NodeJS.ReadStream,
      fetch: async () => {
        throw new Error("fetch should not run for --stdin");
      },
    });
    const matchedEnvelope = JSON.parse(matched.output);

    expect(matchedStatus).toBe(0);
    expect(matchedEnvelope.agent).toMatchObject({
      primaryExecution: "read-current",
      primaryReadFrom: "verification.bestEvidence",
      primaryReadTargetKind: "evidence",
      primaryReadTargetCount: 1,
      primaryReadTargetPrimary: true,
      primaryReadTargetReason: "Best matching evidence for the requested --find text.",
      topActionReadFrom: "verification.bestEvidence",
      topActionReadTargetKind: "evidence",
      topActionReadTargetCount: 1,
      topActionReadTargetPrimary: true,
      topActionReadTargetReason: "Best matching evidence for the requested --find text.",
      bestReadTargetReason: "Best matching evidence for the requested --find text.",
      readabilityReasons: expect.arrayContaining(["1 content evidence item"]),
      responseStatus: expect.any(Number),
      responseOk: expect.any(Boolean),
      responseContentType: expect.any(String),
      finalUrlChanged: expect.any(Boolean),
      verificationRequestedCount: 1,
      verificationFoundCount: 1,
      verificationMissingCount: 0,
      pageDecisionReason: expect.any(String),
      pageDecisionReadability: expect.stringMatching(/^(low|medium|high)$/),
      pageDecisionEvidenceCount: expect.any(Number),
      pageDecisionEvidenceQualityScore: expect.any(Number),
      pageDecisionSourceLinkCount: expect.any(Number),
      pageDecisionSourceQualityScore: expect.any(Number),
    });

    const blocked = new MemoryWriter();
    const blockedStatus = await runCli(["https://captured.example/challenge", "--stdin", "--agent-brief"], {
      stdout: blocked,
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
    const blockedEnvelope = JSON.parse(blocked.output);

    expect(blockedStatus).toBe(0);
    expect(blockedEnvelope.agent).toMatchObject({
      primaryExecution: "interact-browser",
      needsBrowserInteraction: true,
      primaryAfterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
      primaryAfterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent-brief"],
      requiresBrowserInteraction: true,
      browserHtmlReasonCode: "challenge",
      responseStatus: expect.any(Number),
      responseOk: expect.any(Boolean),
      responseContentType: expect.any(String),
      finalUrlChanged: expect.any(Boolean),
      topBarrierSource: "diagnostic",
      topBarrierDiagnosticCode: "CHALLENGE_LIKELY",
    });
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
        afterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
        afterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
        browserHtml: {
          url: "https://captured.example/challenge",
          htmlFile: "captured.html",
          captureScript: "document.documentElement.outerHTML",
          afterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
          afterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
        },
      },
      expectedOutcome: {
        kind: "browser-inspection",
      },
      answerPlan: {
        status: "needs-more",
        nextAction: "inspect-browser-state",
        afterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
        afterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
      },
      answerPlanNextAction: "inspect-browser-state",
      answerPlanAfterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
      answerPlanAfterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
      executionPlan: {
        operation: "inspect-browser",
        expectedOutcome: "browser-inspection",
        afterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
        afterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
        browserHtml: {
          htmlFile: "captured.html",
          captureScript: "document.documentElement.outerHTML",
          afterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
        },
      },
      signals: expect.arrayContaining([
        expect.objectContaining({ kind: "diagnostic", severity: "warning" }),
      ]),
      canUseFetchedHtml: false,
      needsBrowserHtml: false,
      needsBrowserInteraction: true,
      browserHtmlReasonCode: "challenge",
      primaryExecution: "interact-browser",
      primaryAfterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
      primaryAfterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
      requiresBrowserInteraction: true,
      primaryAction: {
        action: "inspect-browser-state",
        execution: "interact-browser",
        reason: "Browser-captured HTML still shows a challenge barrier; handle it in the live browser, then capture HTML again.",
        target: {
          title: "Challenge",
          url: "https://captured.example/challenge",
          path: "pageCheck.barriers[0]",
          text: "Challenge: The page appears to contain a bot check, CAPTCHA, or access challenge.",
          source: "diagnostic",
          rank: 1,
        },
        requiresBrowserInteraction: true,
        afterInteractionCommand: "ax-grep 'https://captured.example/challenge' --html-file captured.html --agent",
        afterInteractionCommandArgs: ["ax-grep", "https://captured.example/challenge", "--html-file", "captured.html", "--agent"],
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
      sourceChoiceCount: 1,
      topSourceChoicePath: "pageCheck.sourceLinks[0]",
      topSourceChoiceUrl: "https://source.example/reference",
      topSourceChoiceCommand: "ax-grep https://source.example/reference --agent",
      topSourceChoiceCommandArgs: ["ax-grep", "https://source.example/reference", "--agent"],
      topSourceChoiceReason: expect.any(String),
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
      expect(stdout.output).not.toContain("--agent-brief-brief");
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

  it("can drive a search-to-read executor loop from agent.executor", async () => {
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
      const executor = payload.agent.executor;
      if (executor.decision === "return") {
        expect(executor.readFrom).toBe("pageCheck.contentEvidence");
        expect(executor.readTarget).toMatchObject({
          path: "pageCheck.contentEvidence",
          reason: "Structured page excerpts suitable for source checking.",
          primary: true,
        });
        expect(payload.agent.handoff.readTarget).toMatchObject({
          path: "pageCheck.contentEvidence",
          reason: "Structured page excerpts suitable for source checking.",
          primary: true,
        });
        expect(payload.agent.handoff.answerEvidence).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "content",
              id: "e1",
              path: "pageCheck.contentEvidence[0]",
              text: "Agent browser extraction details explain how to continue from search to evidence.",
              reason: expect.stringContaining("high evidence from semantic extraction"),
            }),
          ]),
        );
        expect(executor.readValue.path).toBe("pageCheck.contentEvidence");
        expect(executor.readValue.value).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              text: "Agent browser extraction details explain how to continue from search to evidence.",
            }),
          ]),
        );
        break;
      }
      expect(executor.decision).toBe("execute");
      expect(executor.commandArgs[0]).toBe("ax-grep");
      args = executor.commandArgs.slice(1);
    }

    expect(payload.agent.executor.decision).toBe("return");
    expect(payload.agent.executor.terminal).toBe(true);
    expect(requestedUrls).toContain("https://result.example/guide");
  });

  it("can drive a search-to-read brief executor loop from agent.executor", async () => {
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

    let args = ["--search", "agent browser", "--engine", "duckduckgo", "--agent-brief"];
    let payload: any;
    for (let step = 0; step < 3; step += 1) {
      const stdout = new MemoryWriter();
      const status = await runCli(args, { stdout, fetch });
      expect(status).toBe(0);
      payload = JSON.parse(stdout.output);
      const executor = payload.agent.executor;
      if (executor.decision === "return") {
        expect(executor.readFrom).toBe("pageCheck.contentEvidence");
        expect(executor.readValue.path).toBe("pageCheck.contentEvidence");
        expect(executor.readValue.value).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              text: "Agent browser extraction details explain how to continue from search to evidence.",
            }),
          ]),
        );
        break;
      }
      expect(executor.decision).toBe("execute");
      expect(executor.instruction).toContain("--agent-brief");
      expect(executor.instruction).not.toContain("--agent and continue");
      expect(executor.commandArgs).toContain("--agent-brief");
      expect(payload.agent.handoff.instruction).toContain("--agent-brief");
      expect(payload.agent.handoff.target).toMatchObject({
        title: "Agent Browser Guide",
        url: "https://result.example/guide",
        rank: 1,
      });
      expect(payload.agent.handoff.target.url).toBe(executor.target.url);
      args = executor.commandArgs.slice(1);
    }

    expect(payload.agent.contract.profile).toBe("brief");
    expect(payload.agent.executor.decision).toBe("return");
    expect(payload.agent.executor.terminal).toBe(true);
    expect(payload.agent.next).toBeUndefined();
    expect(payload.agent.runbook).toBeUndefined();
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
      commandArgs: ["ax-grep", "--search", "https://missing.example/page", "--agent"],
    });
    expect(missingEnvelope.agent.answerPlan).toMatchObject({
      status: "needs-more",
      nextAction: "check-url-or-search",
      command: "ax-grep --search 'https://missing.example/page' --agent",
      commandArgs: ["ax-grep", "--search", "https://missing.example/page", "--agent"],
    });
    expect(missingEnvelope.agent.next).toMatchObject({
      mode: "command",
      action: "check-url-or-search",
      execution: "run-command",
      command: "ax-grep --search 'https://missing.example/page' --agent",
      commandArgs: ["ax-grep", "--search", "https://missing.example/page", "--agent"],
      loop: {
        decision: "execute",
        shouldContinue: true,
        terminal: false,
      },
    });
    expect(missingEnvelope.agent.expectedOutcome).toMatchObject({
      kind: "run-search",
    });
    expect(missingEnvelope.agent.executionPlan).toMatchObject({
      operation: "execute-command",
      expectedOutcome: "run-search",
      command: "ax-grep --search 'https://missing.example/page' --agent",
      commandArgs: ["ax-grep", "--search", "https://missing.example/page", "--agent"],
      answerReady: false,
    });
    expect(serverStatus).toBe(12);
    expect(serverEnvelope.agent.canContinue).toBe(true);
    expect(serverEnvelope.agent.needsBrowserHtml).toBe(false);
    expect(serverEnvelope.agent.primaryAction).toMatchObject({
      action: "retry-later",
      command: "ax-grep 'https://server.example/page' --agent",
      commandArgs: ["ax-grep", "https://server.example/page", "--agent"],
    });
    expect(serverEnvelope.agent.answerPlan).toMatchObject({
      status: "needs-more",
      nextAction: "retry-later",
      command: "ax-grep 'https://server.example/page' --agent",
      commandArgs: ["ax-grep", "https://server.example/page", "--agent"],
    });
    expect(serverEnvelope.agent.next).toMatchObject({
      mode: "command",
      action: "retry-later",
      execution: "run-command",
      command: "ax-grep 'https://server.example/page' --agent",
      commandArgs: ["ax-grep", "https://server.example/page", "--agent"],
      loop: {
        decision: "execute",
        shouldContinue: true,
        terminal: false,
      },
    });
    expect(serverEnvelope.agent.expectedOutcome).toMatchObject({
      kind: "retry-fetch",
    });
    expect(serverEnvelope.agent.executionPlan).toMatchObject({
      operation: "execute-command",
      expectedOutcome: "retry-fetch",
      command: "ax-grep 'https://server.example/page' --agent",
      commandArgs: ["ax-grep", "https://server.example/page", "--agent"],
      answerReady: false,
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
