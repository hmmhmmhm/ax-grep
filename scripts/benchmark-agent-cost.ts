import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { getEncoding } from "js-tiktoken";

type CaseResult = {
  name: string;
  axGrep: Measurement;
  agentBrowser: Measurement;
  savings: {
    memoryMultiple: number;
    tokenMultiple: number;
    memorySavedPercent: number;
    tokenSavedPercent: number;
  };
};

type Measurement = {
  command: string[];
  exitCode: number | null;
  peakRssKb: number;
  retainedProcessRssKb?: number;
  outputBytes: number;
  estimatedTokens: number;
  decisionTokens?: number;
  outputPreview: string;
  stderrPreview?: string;
};

const encoder = getEncoding("cl100k_base");
const root = process.cwd();
const outDir = resolve(root, "tmp", "benchmarks");
mkdirSync(outDir, { recursive: true });

const workspace = mkdtempSync(join(tmpdir(), "ax-grep-agent-cost-"));
const cases = [
  {
    name: "content-page",
    html: contentFixture(),
  },
  {
    name: "challenge-page",
    html: challengeFixture(),
  },
];

const results: CaseResult[] = [];

try {
  for (const item of cases) {
    const htmlFile = join(workspace, `${item.name}.html`);
    writeFileSync(htmlFile, item.html);
    const fileUrl = pathToFileURL(htmlFile).toString();
    const ax = measure([
      "node",
      "dist/cli.js",
      "https://benchmark.local/",
      "--html-file",
      htmlFile,
      "--agent-brief",
    ], { decisionPayload: true });
    const session = `ax-grep-benchmark-${process.pid}-${item.name}`;
    const beforeBrowserPids = browserProcessPids();
    const browser = measure([
      "node_modules/.bin/agent-browser",
      "--session",
      session,
      "--allow-file-access",
      "batch",
      "--bail",
      `open ${fileUrl}`,
      "snapshot --compact",
    ]);
    const retainedProcessRssKb = sumNewBrowserProcessRssKb(beforeBrowserPids);
    browser.retainedProcessRssKb = retainedProcessRssKb;
    browser.peakRssKb = Math.max(browser.peakRssKb, retainedProcessRssKb);
    spawnSync("node_modules/.bin/agent-browser", ["--session", session, "close", "--all"], { encoding: "utf8", timeout: 30_000 });
    results.push({
      name: item.name,
      axGrep: ax,
      agentBrowser: browser,
      savings: summarizeSavings(ax, browser),
    });
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
  spawnSync("node_modules/.bin/agent-browser", ["close", "--all"], { encoding: "utf8", timeout: 30_000 });
}

const summary = summarize(results);
const report = {
  generatedAt: new Date().toISOString(),
  note: "Runs are sequential. Memory is /usr/bin/time peak RSS for each command. Tokens use cl100k_base over each command's stdout.",
  summary,
  cases: results,
};
const outPath = join(outDir, "agent-cost.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function measure(command: string[], options: { decisionPayload?: boolean } = {}): Measurement {
  const timed = spawnSync("/usr/bin/time", ["-v", ...command], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120_000,
  });
  const stdout = timed.stdout ?? "";
  const stderr = timed.stderr ?? "";
  return {
    command,
    exitCode: timed.status,
    peakRssKb: parsePeakRss(stderr),
    outputBytes: Buffer.byteLength(stdout),
    estimatedTokens: encoder.encode(stdout).length,
    ...(options.decisionPayload ? { decisionTokens: estimateDecisionTokens(stdout) } : {}),
    outputPreview: stdout.slice(0, 240),
    ...(stderr.trim() ? { stderrPreview: stderr.slice(0, 240) } : {}),
  };
}

function estimateDecisionTokens(stdout: string): number {
  try {
    const payload = JSON.parse(stdout) as {
      kind?: string;
      agent?: {
        status?: string;
        summary?: string;
        handoff?: unknown;
        browserHtmlReasonCode?: string;
        diagnosticCodes?: string[];
        topDiagnosticCode?: string;
        topDiagnosticMessage?: string;
      };
      pageCheck?: {
        barriers?: unknown[];
        recommendedAction?: unknown;
      };
    };
    const decision = {
      kind: payload.kind,
      status: payload.agent?.status,
      summary: payload.agent?.summary,
      browserHtmlReasonCode: payload.agent?.browserHtmlReasonCode,
      diagnosticCodes: payload.agent?.diagnosticCodes,
      topDiagnosticCode: payload.agent?.topDiagnosticCode,
      topDiagnosticMessage: payload.agent?.topDiagnosticMessage,
      handoff: payload.agent?.handoff,
      barriers: payload.pageCheck?.barriers?.slice(0, 2),
      recommendedAction: payload.pageCheck?.recommendedAction,
    };
    return encoder.encode(JSON.stringify(decision)).length;
  } catch {
    return encoder.encode(stdout).length;
  }
}

function parsePeakRss(stderr: string): number {
  const match = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function summarizeSavings(ax: Measurement, browser: Measurement): CaseResult["savings"] {
  const memoryMultiple = round(browser.peakRssKb / Math.max(ax.peakRssKb, 1));
  const axTokens = ax.decisionTokens ?? ax.estimatedTokens;
  const tokenMultiple = round(browser.estimatedTokens / Math.max(axTokens, 1));
  return {
    memoryMultiple,
    tokenMultiple,
    memorySavedPercent: round((1 - ax.peakRssKb / Math.max(browser.peakRssKb, 1)) * 100),
    tokenSavedPercent: round((1 - axTokens / Math.max(browser.estimatedTokens, 1)) * 100),
  };
}

function summarize(items: CaseResult[]) {
  const averageMemoryMultiple = average(items.map((item) => item.savings.memoryMultiple));
  const averageTokenMultiple = average(items.map((item) => item.savings.tokenMultiple));
  return {
    averageMemoryMultiple,
    averageTokenMultiple,
    bestMemoryMultiple: Math.max(...items.map((item) => item.savings.memoryMultiple)),
    bestTokenMultiple: Math.max(...items.map((item) => item.savings.tokenMultiple)),
    averageMemorySavedPercent: average(items.map((item) => item.savings.memorySavedPercent)),
    averageTokenSavedPercent: average(items.map((item) => item.savings.tokenSavedPercent)),
  };
}

function average(values: number[]): number {
  return round(values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function browserProcessPids(): Set<number> {
  return new Set(browserProcesses().map((item) => item.pid));
}

function sumNewBrowserProcessRssKb(before: Set<number>): number {
  return browserProcesses()
    .filter((item) => !before.has(item.pid))
    .reduce((total, item) => total + item.rssKb, 0);
}

function browserProcesses(): Array<{ pid: number; rssKb: number }> {
  const ps = spawnSync("ps", ["-eo", "pid=,rss=,args="], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return (ps.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /agent-browser|chrome|chromium/i.test(line))
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+/);
      return match ? { pid: Number(match[1]), rssKb: Number(match[2]) } : undefined;
    })
    .filter((item): item is { pid: number; rssKb: number } => Boolean(item));
}

function contentFixture(): string {
  const cards = Array.from({ length: 36 }, (_, index) => `
    <article>
      <h2>Research note ${index + 1}</h2>
      <p>Agent workflows need compact semantic evidence, direct action targets, and source links before opening a browser.</p>
      <a href="/notes/${index + 1}">Read note ${index + 1}</a>
      <button type="button">Queue note ${index + 1}</button>
    </article>
  `).join("\n");
  return `
    <!doctype html>
    <html lang="en">
      <head><title>Agent Research Fixture</title><meta name="description" content="Benchmark fixture"></head>
      <body>
        <main>
          <h1>Agent Research Fixture</h1>
          <p>Static extraction should give agents enough structure without starting a browser.</p>
          <form action="/search"><label>Search <input name="q" type="search" placeholder="Topic"></label><button>Search</button></form>
          <section>${cards}</section>
        </main>
      </body>
    </html>
  `;
}

function challengeFixture(): string {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <title>Human check</title>
        <script src="https://js.hcaptcha.com/1/api.js"></script>
      </head>
      <body>
        <main>
          <h1>Verify you are human</h1>
          <p>Complete this hCaptcha challenge to continue.</p>
          <form><div class="h-captcha" data-sitekey="site-key"></div></form>
        </main>
      </body>
    </html>
  `;
}
