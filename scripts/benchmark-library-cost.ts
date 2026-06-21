import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { getEncoding } from "js-tiktoken";
import { extract, formatSemanticTreeText, summarizeSemanticTree } from "../src/index";

type CaseResult = {
  name: string;
  htmlBytes: number;
  beforeRssKb: number;
  afterRssKb: number;
  incrementalRssKb: number;
  outputBytes: number;
  estimatedTokens: number;
  summary: ReturnType<typeof summarizeSemanticTree>;
};

const encoder = getEncoding("cl100k_base");
const outDir = resolve(process.cwd(), "tmp", "benchmarks");
mkdirSync(outDir, { recursive: true });

const cases = [
  { name: "content-page", html: contentFixture() },
  { name: "challenge-page", html: challengeFixture() },
  { name: "large-list-page", html: largeListFixture() },
];

const results: CaseResult[] = [];

for (const item of cases) {
  runGc();
  extract(item.html);
  runGc();

  const beforeRssKb = rssKb();
  const tree = extract(item.html);
  const text = formatSemanticTreeText(tree);
  const afterRssKb = rssKb();

  results.push({
    name: item.name,
    htmlBytes: Buffer.byteLength(item.html),
    beforeRssKb,
    afterRssKb,
    incrementalRssKb: Math.max(0, afterRssKb - beforeRssKb),
    outputBytes: Buffer.byteLength(text),
    estimatedTokens: encoder.encode(text).length,
    summary: summarizeSemanticTree(tree),
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  note: "Measures warm in-process library extraction only. Run with node --expose-gc for steadier RSS deltas. No browser or network work is launched.",
  node: process.version,
  exposedGc: typeof (globalThis as typeof globalThis & { gc?: () => void }).gc === "function",
  summary: summarize(results),
  cases: results,
};

const outPath = join(outDir, "library-cost.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function rssKb(): number {
  return Math.round(process.memoryUsage().rss / 1024);
}

function runGc(): void {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  if (typeof gc === "function") gc();
}

function summarize(items: CaseResult[]) {
  return {
    maxIncrementalRssKb: Math.max(...items.map((item) => item.incrementalRssKb)),
    averageIncrementalRssKb: round(average(items.map((item) => item.incrementalRssKb))),
    averageTokens: round(average(items.map((item) => item.estimatedTokens))),
    averageNodeCount: round(average(items.map((item) => item.summary.nodeCount))),
  };
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function contentFixture(): string {
  return `<!doctype html>
    <html>
      <head><title>Agent Research Example</title><meta name="description" content="Fixture for library memory measurement"></head>
      <body>
        <header><nav><a href="/docs">Docs</a><a href="/api">API</a><a href="/pricing">Pricing</a></nav></header>
        <main>
          <article>
            <h1>Agent Research Example</h1>
            <p>Use semantic extraction before opening a browser.</p>
            <section><h2>Evidence</h2><p>Static HTML contains useful links, headings, forms, and article text.</p></section>
            <form action="/search"><label for="q">Search</label><input id="q" name="q"><button>Search</button></form>
          </article>
        </main>
      </body>
    </html>`;
}

function challengeFixture(): string {
  return `<!doctype html>
    <html>
      <head><title>Just a moment...</title><script src="https://js.hcaptcha.com/1/api.js"></script></head>
      <body><main><h1>Human check</h1><div class="h-captcha" data-sitekey="site-key"></div></main></body>
    </html>`;
}

function largeListFixture(): string {
  const items = Array.from({ length: 400 }, (_, index) => `<li><a href="/items/${index}">Research item ${index}</a><p>Snippet ${index} for semantic extraction.</p></li>`).join("");
  return `<!doctype html><html><head><title>Large list</title></head><body><main><h1>Large list</h1><ul>${items}</ul></main></body></html>`;
}
