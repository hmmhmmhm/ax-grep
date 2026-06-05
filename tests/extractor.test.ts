import { afterAll, beforeAll, describe, expect, it } from "vitest";
import puppeteer, { type Browser, type Page } from "puppeteer";
import {
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
      </section>
    `);

    const tree = await extract(page);
    const text = formatSemanticTreeText(tree);

    expect(text).toContain("textbox 'Search docs'");
    expect(text).not.toContain("Hidden button");
    expect(text).not.toContain("Also hidden");
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
