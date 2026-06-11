import { describe, expect, it } from "vitest";
import { extract as extractRoot, flattenSemanticTree, formatSemanticTreeText, summarizeSemanticTree } from "../src/index";
import { extract } from "../src/static";

describe("static extract", () => {
  it("is available from the package root for HTML strings", () => {
    const tree = extractRoot(`<main><a href="/docs">Docs</a></main>`);
    const link = flattenSemanticTree(tree).find((node) => node.role === "link");

    expect(link?.name).toBe("Docs");
  });

  it("extracts semantic roles from an HTML string without a browser", () => {
    const tree = extract(`
      <!doctype html>
      <html>
        <body>
          <main>
            <h1>Checkout</h1>
            <label for="email">Email address</label>
            <input id="email" type="email" required value="user@example.com">
            <button aria-pressed="true">Continue</button>
            <a href="/terms" title="Fallback">Terms</a>
            <img alt="Product preview" src="/preview.png">
          </main>
        </body>
      </html>
    `);

    const flat = flattenSemanticTree(tree);
    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("heading:Checkout");
    expect(namedRoles).toContain("textbox:Email address");
    expect(namedRoles).toContain("button:Continue");
    expect(namedRoles).toContain("link:Terms");
    expect(namedRoles).toContain("img:Product preview");
    expect(flat.find((node) => node.role === "textbox")?.state?.required).toBe(true);
    expect(flat.find((node) => node.role === "button")?.state?.pressed).toBe(true);
  });

  it("keeps static extraction deterministic without computed rendering state", () => {
    const tree = extract(`
      <main>
        <button hidden>Hidden</button>
        <button style="display:none">Also hidden</button>
        <button style="opacity:0">Transparent</button>
        <button class="visually-hidden">Class-only hidden cannot be inferred</button>
      </main>
    `);
    const text = formatSemanticTreeText(tree);

    expect(text).not.toContain("Hidden");
    expect(text).not.toContain("Also hidden");
    expect(text).not.toContain("Transparent");
    expect(text).toContain("Class-only hidden cannot be inferred");
  });

  it("can compact select controls for agent-browser comparison", () => {
    const full = extract(`
      <label for="language">Language</label>
      <select id="language">
        <option>English</option>
        <option selected>Korean</option>
      </select>
    `);
    const compact = extract(`
      <label for="language">Language</label>
      <select id="language">
        <option>English</option>
        <option selected>Korean</option>
      </select>
    `, { includeSelectOptions: false });

    expect(summarizeSemanticTree(full).namedRoles).toEqual(expect.arrayContaining([
      "combobox:Language",
      "option:English",
      "option:Korean",
    ]));
    expect(summarizeSemanticTree(compact).namedRoles).toContain("combobox:Language");
    expect(flattenSemanticTree(compact).filter((node) => node.role === "option")).toHaveLength(0);
  });

  it("prunes collapsed static disclosure subtrees while keeping the control", () => {
    const pruned = extract(`
      <main>
        <button aria-expanded="false">Menu
          <span><a href="/hidden">Hidden item</a></span>
        </button>
        <button aria-expanded="false" aria-controls="drawer">Drawer</button>
        <nav id="drawer">
          <a href="/drawer-hidden">Drawer hidden</a>
        </nav>
        <details>
          <summary>More</summary>
          <a href="/details-hidden">Details hidden</a>
        </details>
        <button aria-expanded="true">Open menu
          <span><a href="/visible">Visible item</a></span>
        </button>
      </main>
    `);
    const full = extract(`
      <main>
        <button aria-expanded="false">Menu
          <span><a href="/hidden">Hidden item</a></span>
        </button>
      </main>
    `, { pruneCollapsedSubtrees: false });

    const namedRoles = summarizeSemanticTree(pruned).namedRoles;

    expect(namedRoles).toContain("button:Menu Hidden item");
    expect(namedRoles).toContain("button:Drawer");
    expect(flattenSemanticTree(pruned).find((node) => node.role === "group" && node.tag === "details")).toBeDefined();
    expect(namedRoles).toContain("button:Open menu Visible item");
    expect(namedRoles).toContain("link:Visible item");
    expect(namedRoles).not.toContain("link:Hidden item");
    expect(namedRoles).not.toContain("link:Drawer hidden");
    expect(namedRoles).not.toContain("link:Details hidden");
    expect(summarizeSemanticTree(full).namedRoles).toContain("link:Hidden item");
  });

  it("skips non-semantic payload tags in compact static mode", () => {
    const tree = extract(`
      <html>
        <head>
          <title>Document title</title>
          <script type="application/json">{"large":"payload"}</script>
          <style>.hidden { display: none }</style>
        </head>
        <body>
          <template><a href="/template">Template link</a></template>
          <noscript><a href="/noscript">Noscript link</a></noscript>
          <main><a href="/real">Real link</a></main>
        </body>
      </html>
    `);
    const namedRoles = summarizeSemanticTree(tree).namedRoles;
    const flat = flattenSemanticTree(tree);

    expect(namedRoles).toContain("link:Real link");
    expect(namedRoles).not.toContain("link:Template link");
    expect(namedRoles).not.toContain("link:Noscript link");
    expect(flat.find((node) => node.tag === "script")).toBeUndefined();
    expect(flat.find((node) => node.tag === "style")).toBeUndefined();
  });

  it("excludes embedded style text from static names", () => {
    const tree = extract(`
      <main>
        <a href="/home">
          <style>.css-logo{width:104px}.css-logo:hover{text-decoration:none}</style>
          <span>Startpage home page</span>
        </a>
        <button>
          <style>.css-button{display:flex}</style>
          Search
        </button>
      </main>
    `);

    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("link:Startpage home page");
    expect(namedRoles).toContain("button:Search");
    expect(namedRoles.some((item) => item.includes(".css-"))).toBe(false);
  });

  it("prunes likely closed offscreen overlay menus without dropping skip links", () => {
    const tree = extract(`
      <main>
        <a href="#main" style="position:absolute;left:-9999px">Skip to main content</a>
        <button aria-expanded="true" aria-controls="open-menu">Open menu</button>
        <nav id="open-menu" class="drawer" style="right:0">
          <a href="/visible">Visible item</a>
        </nav>
        <div class="hamburger-drawer" style="position:fixed;right:-330px">
          <a href="/closed">Closed drawer item</a>
        </div>
        <aside class="sidebar closed">
          <a href="/collapsed">Collapsed sidebar item</a>
        </aside>
      </main>
    `);

    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("link:Skip to main content");
    expect(namedRoles).toContain("link:Visible item");
    expect(namedRoles).not.toContain("link:Closed drawer item");
    expect(namedRoles).not.toContain("link:Collapsed sidebar item");
  });

  it("can exclude likely static ad and promotion regions", () => {
    const html = `
      <main>
        <a href="/article">Article link</a>
        <aside class="powerlink ads">
          <a href="/ad">Sponsored placement</a>
        </aside>
        <section aria-label="광고">
          <a href="/promo">Promoted link</a>
        </section>
      </main>
    `;

    const included = extract(html);
    const excluded = extract(html, { excludeLikelyAds: true });

    expect(summarizeSemanticTree(included).namedRoles).toContain("link:Sponsored placement");
    expect(summarizeSemanticTree(excluded).namedRoles).toContain("link:Article link");
    expect(summarizeSemanticTree(excluded).namedRoles).not.toContain("link:Sponsored placement");
    expect(summarizeSemanticTree(excluded).namedRoles).not.toContain("link:Promoted link");
  });

  it("can exclude likely static boilerplate regions", () => {
    const html = `
      <main>
        <article>
          <h1>Article title</h1>
          <a href="/primary">Primary action</a>
        </article>
        <section class="related-list">
          <a href="/related">Related story</a>
        </section>
        <table class="gall_list">
          <tr><td><a href="/older">Older board item</a></td></tr>
        </table>
      </main>
      <footer>
        <a href="/terms">Terms</a>
      </footer>
    `;

    const included = extract(html);
    const excluded = extract(html, { excludeLikelyBoilerplate: true });

    const excludedSummary = summarizeSemanticTree(excluded);
    const excludedFlat = flattenSemanticTree(excluded);

    expect(summarizeSemanticTree(included).namedRoles).toContain("link:Related story");
    expect(summarizeSemanticTree(excluded).namedRoles).toContain("heading:Article title");
    expect(summarizeSemanticTree(excluded).namedRoles).toContain("link:Primary action");
    expect(summarizeSemanticTree(excluded).namedRoles).toContain("link:Related story");
    expect(excludedSummary.namedRoles).toContain("link:Older board item");
    expect(excludedFlat.some((node) => node.role === "table")).toBe(false);
    expect(excludedFlat.some((node) => node.role === "cell")).toBe(false);
    expect(summarizeSemanticTree(excluded).namedRoles).not.toContain("link:Terms");
  });

  it("prunes unnamed static leaf wrappers while preserving ancestor names", () => {
    const tree = extract(`
      <main>
        <a href="/post"><span>Post</span> <em>title</em><br></a>
        <span>decorative counter</span>
        <p>Body text</p>
      </main>
    `);

    const summary = summarizeSemanticTree(tree);
    const flat = flattenSemanticTree(tree);

    expect(summary.namedRoles).toContain("link:Post title");
    expect(flat.some((node) => node.tag === "span" && node.name === "")).toBe(false);
    expect(flat.some((node) => node.tag === "em" && node.name === "")).toBe(false);
    expect(flat.some((node) => node.tag === "br")).toBe(false);
    expect(flat.some((node) => node.role === "p")).toBe(true);
  });

  it("prunes listitem wrappers around actionable children", () => {
    const tree = extract(`
      <ul>
        <li><a href="/thread">Thread title</a></li>
        <li><button>Open menu</button></li>
        <li>Plain item</li>
      </ul>
    `);

    const summary = summarizeSemanticTree(tree);
    const flat = flattenSemanticTree(tree);

    expect(summary.namedRoles).toContain("link:Thread title");
    expect(summary.namedRoles).toContain("button:Open menu");
    expect(summary.namedRoles).toContain("listitem:Plain item");
    expect(flat.filter((node) => node.role === "listitem")).toHaveLength(1);
  });

  it("summarizes very large repeated static subtrees", () => {
    const items = Array.from({ length: 8 }, (_, index) => `<li><a href="/${index}">Item ${index}</a></li>`).join("");
    const summarized = extract(`<ul>${items}</ul>`, { maxChildrenPerNode: 3 });
    const full = extract(`<ul>${items}</ul>`, {
      maxChildrenPerNode: 3,
      summarizeLargeSubtrees: false,
    });

    const summarizedRoles = summarizeSemanticTree(summarized).namedRoles;
    const fullRoles = summarizeSemanticTree(full).namedRoles;

    expect(summarizedRoles).toContain("link:Item 0");
    expect(summarizedRoles).toContain("link:Item 2");
    expect(summarizedRoles).not.toContain("link:Item 7");
    expect(summarizedRoles.some((item) => item.startsWith("note:"))).toBe(true);
    expect(fullRoles).toContain("link:Item 7");
  });

  it("summarizes repeated template-like static subtrees", () => {
    const repeated = Array.from({ length: 6 }, () => `
      <section>
        <h2>Loading</h2>
        <p>Placeholder content</p>
      </section>
    `).join("");
    const unique = Array.from({ length: 6 }, (_, index) => `
      <section>
        <h2>Article ${index}</h2>
        <p>Placeholder content</p>
      </section>
    `).join("");

    const summarized = extract(`<main>${repeated}</main>`, {
      maxRepeatedSubtreeInstances: 2,
    });
    const unsummarized = extract(`<main>${repeated}</main>`, {
      maxRepeatedSubtreeInstances: 2,
      summarizeRepeatedSubtrees: false,
    });
    const uniqueTree = extract(`<main>${unique}</main>`, {
      maxRepeatedSubtreeInstances: 2,
    });

    const summarizedRoles = summarizeSemanticTree(summarized).namedRoles;
    const unsummarizedHeadings = flattenSemanticTree(unsummarized).filter((node) => node.role === "heading");
    const uniqueHeadings = flattenSemanticTree(uniqueTree).filter((node) => node.role === "heading");

    expect(flattenSemanticTree(summarized).filter((node) => node.role === "heading")).toHaveLength(2);
    expect(summarizedRoles.some((item) => item.startsWith("note:"))).toBe(true);
    expect(unsummarizedHeadings).toHaveLength(6);
    expect(uniqueHeadings).toHaveLength(6);
  });

  it("summarizes dense static link farms without dropping early links", () => {
    const items = Array.from({ length: 12 }, (_, index) => `<li><a href="/${index}">Board item ${index}</a></li>`).join("");
    const summarized = extract(`<aside class="popular-list"><ul>${items}</ul></aside>`, {
      maxLinkFarmChildren: 4,
      summarizeLargeSubtrees: false,
      summarizeRepeatedSubtrees: false,
    });
    const full = extract(`<aside class="popular-list"><ul>${items}</ul></aside>`, {
      maxLinkFarmChildren: 4,
      summarizeLargeSubtrees: false,
      summarizeLikelyLinkFarms: false,
      summarizeRepeatedSubtrees: false,
    });

    const summarizedRoles = summarizeSemanticTree(summarized).namedRoles;
    const fullRoles = summarizeSemanticTree(full).namedRoles;

    expect(summarizedRoles).toContain("link:Board item 0");
    expect(summarizedRoles).toContain("link:Board item 3");
    expect(summarizedRoles).not.toContain("link:Board item 11");
    expect(summarizedRoles.some((item) => item.startsWith("note:"))).toBe(true);
    expect(fullRoles).toContain("link:Board item 11");
  });

  it("does not summarize content-rich static lists as link farms", () => {
    const items = Array.from({ length: 8 }, (_, index) => `
      <li>
        <a href="/article-${index}">Article ${index}</a>
        <p>Lead paragraph ${index}</p>
        <p>Second paragraph ${index}</p>
      </li>
    `).join("");
    const tree = extract(`<section class="article-list"><ul>${items}</ul></section>`, {
      maxLinkFarmChildren: 3,
      summarizeLargeSubtrees: false,
      summarizeRepeatedSubtrees: false,
    });

    const roles = summarizeSemanticTree(tree).namedRoles;

    expect(roles).toContain("link:Article 0");
    expect(roles).toContain("link:Article 7");
    expect(roles.some((item) => item.startsWith("note:"))).toBe(false);
  });

  it("automatically relaxes large-subtree caps for wiki-like documents", () => {
    const items = Array.from({ length: 120 }, (_, index) => `
      <section>
        <h2>Topic ${index}</h2>
        <p>Article paragraph ${index}</p>
      </section>
    `).join("");
    const tree = extract(`
      <html class="client-js vector-feature-language-in-header-enabled">
        <head><meta name="generator" content="MediaWiki 1.43.0"></head>
        <body>
          <main id="content" class="mw-body">
            <div class="mw-parser-output">${items}</div>
          </main>
        </body>
      </html>
    `);

    const roles = summarizeSemanticTree(tree).namedRoles;

    expect(roles).toContain("heading:Topic 0");
    expect(roles).toContain("heading:Topic 119");
    expect(roles.some((item) => item.startsWith("note:"))).toBe(false);
  });

  it("automatically tightens dense link-farm caps for forum-like documents", () => {
    const items = Array.from({ length: 30 }, (_, index) => `<li><a href="/thread-${index}">Thread ${index}</a></li>`).join("");
    const tree = extract(`
      <html>
        <body class="bbs board">
          <main>
            <ul class="thread-list">${items}</ul>
          </main>
        </body>
      </html>
    `, {
      summarizeLargeSubtrees: false,
      summarizeRepeatedSubtrees: false,
    });

    const roles = summarizeSemanticTree(tree).namedRoles;

    expect(roles).toContain("link:Thread 0");
    expect(roles).toContain("link:Thread 18");
    expect(roles).not.toContain("link:Thread 19");
    expect(roles.some((item) => item.startsWith("note:"))).toBe(true);
  });

  it("covers static role, state, and naming edge cases", () => {
    const tree = extract(`
      <html class="site">
        <head>
          <meta name="application-name" content="Forum App">
          <meta property="twitter:site" content="@forum">
        </head>
        <body id="page">
          <main>
            leading text
            <section aria-label="Named section">
              <form aria-label="Search form">
                <label id="query-label">Query</label>
                <input id="query" aria-labelledby="query-label" type="search" aria-invalid="spelling" aria-controls="results">
                <input type="button" value="Input button">
                <input type="submit" value="Submit search">
                <input type="reset" value="Reset search">
                <input type="image" value="Image input">
                <input type="checkbox" checked>
                <input type="radio" aria-checked="false">
                <input type="radio" aria-checked="mixed">
                <input type="range" disabled>
                <input type="number" readonly required>
                <input type="hidden" value="Hidden">
                <select multiple><option selected>One</option></select>
                <textarea aria-required="true">Draft</textarea>
                <progress value="1"></progress>
              </form>
              <fieldset><button aria-pressed="false" aria-haspopup="dialog">Toggle</button></fieldset>
              <nav><a href="/page/2" aria-current="page">Page 2</a></nav>
              <div role="status" aria-live="polite">Saved</div>
              <dialog open><button>Open dialog button</button></dialog>
              <dialog><button>Closed dialog button</button></dialog>
              <div popover open><button>Open popover button</button></div>
              <div popover><button>Closed popover button</button></div>
              <div class="modal" role="dialog" aria-label="Modal" aria-modal="true"><button>Modal button</button></div>
              <div class="drawer" data-open="true"><button>Drawer button</button></div>
              <div class="sheet" data-state="open"><button>Sheet button</button></div>
              <div class="overlay" tabindex="0"><button>Focusable overlay button</button></div>
              <div class="dropdown" inert><button>Inert dropdown button</button></div>
              <div class="flyout" style="transform: translateX(-100%)"><button>Offscreen transform button</button></div>
              <div class="sheet" style="height: 0"><button>Zero height button</button></div>
              <div class="drawer" style="pointer-events: none"><button>No pointer button</button></div>
              <a>Anchor without href</a>
              <area href="/map" title="Map area">
              <figure title="Figure title"></figure>
              <img src="/missing-name.png" title="Titled image">
              <p id="dupe">First paragraph</p>
              <p>Second paragraph</p>
              <table class="bottom_list">
                <tr><th scope="row">Row head</th><td><img alt="Inline image"></td></tr>
              </table>
            </section>
            <div role="presentation"><span>Presented text</span></div>
            <div role="none"><span>None text</span></div>
          </main>
        </body>
      </html>
    `, {
      excludeLikelyBoilerplate: true,
      includeTextNodes: true,
      maxTextLength: 16,
    });

    const flat = flattenSemanticTree(tree);
    const roles = summarizeSemanticTree(tree).namedRoles;

    expect(roles).toEqual(expect.arrayContaining([
      "text:leading text",
      "region:Named section",
      "form:Search form",
      "text:Query",
      "searchbox:Query",
      "button:Input button",
      "button:Submit search",
      "button:Reset search",
      "option:One",
      "text:One",
      "text:Draft",
      "button:Toggle",
      "button:Open dialog but...",
      "button:Open popover bu...",
      "dialog:Modal",
      "button:Modal button",
      "button:Drawer button",
      "button:Sheet button",
      "button:Focusable overl...",
      "link:Map area",
      "figure:Figure title",
      "img:Titled image",
      "text:First paragraph",
      "text:Second paragraph",
      "img:Inline image",
      "text:Presented text",
      "text:None text",
    ]));
    expect(roles).not.toContain("button:Closed dialog button");
    expect(roles).not.toContain("button:Closed popover button");
    expect(roles).not.toContain("button:Inert dropdown button");
    expect(roles).not.toContain("button:Offscreen transform button");
    expect(roles).not.toContain("button:Zero height button");
    expect(roles).not.toContain("button:No pointer button");

    expect(flat.find((node) => node.role === "searchbox")?.state).toMatchObject({ invalid: "spelling", controls: "results" });
    expect(flat.some((node) => node.role === "button" && node.name === "")).toBe(true);
    expect(flat.find((node) => node.role === "checkbox")?.state?.checked).toBe(true);
    expect(flat.filter((node) => node.role === "radio").map((node) => node.state?.checked)).toEqual([false, "mixed"]);
    expect(flat.find((node) => node.role === "slider")?.state?.disabled).toBe(true);
    expect(flat.find((node) => node.role === "spinbutton")?.state).toMatchObject({ readonly: true, required: true });
    expect(flat.find((node) => node.role === "button" && node.name === "Toggle")?.state).toMatchObject({ pressed: false, haspopup: "dialog" });
    expect(flat.find((node) => node.role === "link" && node.name === "Page 2")?.state?.current).toBe("page");
    expect(flat.find((node) => node.role === "status")?.state?.live).toBe("polite");
    expect(flat.find((node) => node.role === "dialog" && node.name === "Modal")?.state?.modal).toBe(true);
    expect(flat.some((node) => node.role === "listbox")).toBe(true);
    expect(flat.some((node) => node.role === "textbox")).toBe(true);
    expect(flat.some((node) => node.role === "progressbar")).toBe(true);
    expect(flat.some((node) => node.role === "text" && node.name === "leading text")).toBe(true);
    expect(flat.find((node) => node.role === "radio" && node.state?.checked === "mixed")?.selector).toBe("input:nth-of-type(8)");
    expect(flat.some((node) => node.role === "table")).toBe(false);
  });

  it("covers static pruning, summarization, and selector edge cases", () => {
    const interactiveTree = extract(`
      <main>
        <section><button id="needs:escape">Keep button</button></section>
        <span>Drop text</span>
      </main>
    `, { mode: "interactive" });
    const interactiveFlat = flattenSemanticTree(interactiveTree);

    expect(interactiveFlat.some((node) => node.role === "button" && node.name === "Keep button")).toBe(true);
    expect(interactiveFlat.find((node) => node.role === "button")?.selector).toBe("#needs\\:escape");

    const cappedTextTree = extract(`
      <main>first <span>middle</span> second</main>
    `, {
      includeTextNodes: true,
      maxChildrenPerNode: 1,
      summarizeLargeSubtrees: true,
    });

    expect(summarizeSemanticTree(cappedTextTree).namedRoles).toEqual(expect.arrayContaining([
      "text:first",
      "note:2 static nodes omitted",
    ]));

    const linkItems = Array.from({ length: 12 }, (_, index) => `<a href="/${index}">Link ${index}</a>`).join("");
    const linkFarmTree = extract(`
      <nav>
        <h2>Useful links</h2>
        <ul>${linkItems}</ul>
      </nav>
    `, {
      maxLinkFarmChildren: 3,
      summarizeLargeSubtrees: false,
      summarizeRepeatedSubtrees: false,
    });
    const linkFarmRoles = summarizeSemanticTree(linkFarmTree).namedRoles;

    expect(linkFarmRoles).toContain("heading:Useful links");
    expect(linkFarmRoles).toContain("link:Link 0");
    expect(linkFarmRoles).not.toContain("link:Link 4");
    expect(linkFarmRoles.some((item) => item.startsWith("note:"))).toBe(true);
  });
});
