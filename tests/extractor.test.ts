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
  await browser.close();
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
