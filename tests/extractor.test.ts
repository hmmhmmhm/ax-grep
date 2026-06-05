import { afterAll, beforeAll, describe, expect, it } from "vitest";
import puppeteer, { type Browser, type Page } from "puppeteer";
import {
  createObserverScript,
  createExtractorScript,
  flattenSemanticTree,
  formatSemanticTreeText,
  summarizeSemanticTree,
  type SemanticNode,
} from "../src/index";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser?.close();
});

describe("extractSemanticTree", () => {
  it("extracts headings, form controls, names, and state", async () => {
    await page.setContent(`
      <main>
        <h1>Checkout</h1>
        <label for="email">Email address</label>
        <input id="email" type="email" required placeholder="you@example.com" />
        <button aria-pressed="true">Continue</button>
        <a href="/terms">Terms</a>
      </main>
    `);

    const tree = await extract(page);
    const flat = flattenSemanticTree(tree);
    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("heading:Checkout");
    expect(namedRoles).toContain("textbox:Email address");
    expect(namedRoles).toContain("button:Continue");
    expect(namedRoles).toContain("link:Terms");
    expect(flat.find((node) => node.role === "textbox")?.state?.required).toBe(true);
    expect(flat.find((node) => node.role === "button")?.state?.pressed).toBe(true);
  });

  it("prunes hidden content and keeps aria-labelled controls", async () => {
    await page.setContent(`
      <section>
        <h2 id="search-title">Search docs</h2>
        <input aria-labelledby="search-title" />
        <button style="display:none">Hidden button</button>
        <button aria-hidden="true">Also hidden</button>
        <button style="opacity:0">Transparent button</button>
      </section>
    `);

    const tree = await extract(page);
    const text = formatSemanticTreeText(tree);

    expect(text).toContain("textbox 'Search docs'");
    expect(text).not.toContain("Hidden button");
    expect(text).not.toContain("Also hidden");
    expect(text).not.toContain("Transparent button");
  });

  it("unrolls select options", async () => {
    await page.setContent(`
      <label for="car">Choose a car</label>
      <select id="car">
        <option value="volvo">Volvo</option>
        <option value="audi" selected>Audi</option>
      </select>
    `);

    const tree = await extract(page);
    const flat = flattenSemanticTree(tree);
    const options = flat.filter((node) => node.role === "option");

    expect(flat.find((node) => node.role === "combobox")?.name).toBe("Choose a car");
    expect(options.map((node) => node.name)).toEqual(expect.arrayContaining(["Volvo", "Audi"]));
    expect(options.find((node) => node.name === "Audi")?.state?.selected).toBe(true);
  });

  it("can keep select controls compact without option unrolling", async () => {
    await page.setContent(`
      <label for="language">Language</label>
      <select id="language">
        <option value="en">English</option>
        <option value="ko">Korean</option>
      </select>
    `);

    const tree = (await page.evaluate(
      createExtractorScript({ mode: "compact", includeBounds: false, includeSelectOptions: false }),
    )) as SemanticNode;
    const flat = flattenSemanticTree(tree);

    expect(flat.find((node) => node.role === "combobox")?.name).toBe("Language");
    expect(flat.filter((node) => node.role === "option")).toHaveLength(0);
  });

  it("prunes custom element wrappers that only contain semantic descendants", async () => {
    await page.setContent(`
      <main>
        <mdn-button>
          <button>Save</button>
        </mdn-button>
      </main>
    `);

    const tree = await extract(page);
    const flat = flattenSemanticTree(tree);

    expect(flat.find((node) => node.tag === "mdn-button")).toBeUndefined();
    expect(flat.find((node) => node.role === "button")?.name).toBe("Save");
  });

  it("does not name structural landmarks from all descendant text", async () => {
    await page.setContent(`
      <main>
        <h1>Article title</h1>
        <p>Long article body that should not become the main landmark name.</p>
      </main>
      <ul>
        <li><a href="/a">First link</a></li>
      </ul>
    `);

    const tree = await extract(page);
    const flat = flattenSemanticTree(tree);

    expect(flat.find((node) => node.role === "main")?.name).toBe("");
    expect(flat.find((node) => node.role === "list")?.name).toBe("");
    expect(flat.find((node) => node.role === "listitem")?.name).toBe("");
    expect(flat.find((node) => node.role === "heading")?.name).toBe("Article title");
    expect(flat.find((node) => node.role === "link")?.name).toBe("First link");
  });

  it("uses link contents before title fallback for accessible names", async () => {
    await page.setContent(`
      <a href="/en" title="English — Wikipedia — The Free Encyclopedia">
        English <small>7,189,000+ articles</small>
      </a>
      <a href="/empty" title="Fallback title"></a>
    `);

    const tree = await extract(page);
    const links = flattenSemanticTree(tree).filter((node) => node.role === "link");

    expect(links[0]?.name).toBe("English 7,189,000+ articles");
    expect(links[1]?.name).toBe("Fallback title");
  });

  it("only exposes section and form landmarks when they have explicit names", async () => {
    await page.setContent(`
      <section>
        <h2>Unnamed section</h2>
      </section>
      <section aria-label="Named section">
        <p>Body</p>
      </section>
      <form>
        <button>Unnamed form button</button>
      </form>
      <form aria-label="Search">
        <button>Search</button>
      </form>
    `);

    const tree = await extract(page);
    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("region:Named section");
    expect(namedRoles).toContain("form:Search");
    expect(namedRoles).not.toContain("region:Unnamed section");
    expect(namedRoles).not.toContain("form:Unnamed form button");
  });

  it("can exclude likely ad placements when requested", async () => {
    await page.setContent(`
      <main>
        <a class="ad" href="/ad">Ad</a>
        <a href="/real">Real link</a>
      </main>
    `);

    const tree = (await page.evaluate(
      createExtractorScript({ mode: "compact", includeBounds: false, excludeLikelyAds: true }),
    )) as SemanticNode;
    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("link:Real link");
    expect(namedRoles).not.toContain("link:Ad");
  });

  it("extracts table cell names for layout-table comparison", async () => {
    await page.setContent(`
      <table>
        <tbody>
          <tr>
            <td><a href="/news">Story title</a></td>
            <td>12 comments</td>
          </tr>
        </tbody>
      </table>
    `);

    const tree = await extract(page);
    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("cell:Story title");
    expect(namedRoles).toContain("cell:12 comments");
    expect(namedRoles).toContain("link:Story title");
  });

  it("extracts semantic children from open shadow roots", async () => {
    await page.setContent(`<main><x-card></x-card></main>`);
    await page.evaluate(() => {
      const host = document.querySelector("x-card");
      const shadow = host?.attachShadow({ mode: "open" });
      if (shadow) shadow.innerHTML = `<button>Shadow action</button>`;
    });

    const tree = await extract(page);
    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("button:Shadow action");
  });

  it("extracts semantic children from same-origin iframes", async () => {
    await page.setContent(`
      <main>
        <iframe srcdoc="<button>Frame action</button>"></iframe>
      </main>
    `);
    await page.waitForFunction(() => {
      const iframe = document.querySelector("iframe");
      return iframe?.contentDocument?.body?.querySelector("button");
    });

    const tree = await extract(page);
    const namedRoles = summarizeSemanticTree(tree).namedRoles;

    expect(namedRoles).toContain("button:Frame action");
  });

  it("streams semantic tree changes from DOM mutations", async () => {
    await page.setContent(`<main id="root"></main>`);
    await page.evaluate(() => {
      (window as unknown as { __changes: unknown[] }).__changes = [];
      window.addEventListener("__AX_LITE_OBSERVER__:change", (event) => {
        (window as unknown as { __changes: unknown[] }).__changes.push((event as CustomEvent).detail);
      });
    });
    await page.evaluate(createObserverScript({ debounceMs: 10, includeBounds: false }));
    await page.evaluate(() => {
      const button = document.createElement("button");
      button.textContent = "Later action";
      document.getElementById("root")?.append(button);
    });
    await page.waitForFunction(() => (window as unknown as { __changes: unknown[] }).__changes.length > 0);

    const change = await page.evaluate(() => {
      return (window as unknown as { __changes: Array<{ tree: SemanticNode; mutationCount: number }> }).__changes[0];
    });
    if (!change) throw new Error("Expected a semantic tree mutation change");
    const namedRoles = summarizeSemanticTree(change.tree).namedRoles;

    expect(change.mutationCount).toBeGreaterThan(0);
    expect(namedRoles).toContain("button:Later action");
  });

  it("supports text output mode for prompt-sized inspection", async () => {
    await page.setContent(`
      <main>
        <h1>Example</h1>
        <button>Run</button>
      </main>
    `);

    const text = await page.evaluate(createExtractorScript({ format: "text", mode: "compact" }));

    expect(text).toContain("heading 'Example'");
    expect(text).toContain("[i] button 'Run'");
  });
});

async function extract(page: Page): Promise<SemanticNode> {
  return (await page.evaluate(createExtractorScript({ mode: "compact", includeBounds: false }))) as SemanticNode;
}
