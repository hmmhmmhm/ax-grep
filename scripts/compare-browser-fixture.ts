import process from "node:process";
import { Readable } from "node:stream";
import puppeteer from "puppeteer";
import {
  createExtractorScript,
  flattenSemanticTree,
  summarizeSemanticTree,
  type AgentJsonEnvelope,
  type AgentSummary,
  type SemanticNode,
} from "../src/index";
import { runCli } from "../src/cli";

type Check = {
  id: string;
  browserEvidence: string;
  agentEvidence: string;
  decision: "covered" | "implement" | "browser-only" | "defer";
  pass: boolean;
};

const fixtureUrl = "https://fixture.local/browser-parity";
const fixtureHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Browser parity fixture</title>
  </head>
  <body>
    <header><h1>Agent report</h1></header>
    <nav aria-label="Primary"><a href="/docs">Docs</a></nav>
    <main>
      <form aria-label="Search reports" action="/search">
        <label for="query">Report query</label>
        <input
          id="query"
          name="q"
          required
          aria-describedby="query-help"
          aria-errormessage="query-error"
          autocomplete="off"
        >
        <p id="query-help">Search by release name.</p>
        <p id="query-error">Enter a report query.</p>
        <button type="submit" aria-pressed="false" aria-controls="results">Search</button>
      </form>
      <table aria-label="Release metrics">
        <thead>
          <tr><th scope="col" aria-sort="ascending">Version</th><th id="status" scope="col">Status</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">2026.06</th><td headers="status">Stable</td></tr>
        </tbody>
      </table>
      <ul aria-label="Release actions">
        <li><a href="/download">Download report</a></li>
      </ul>
      <button accesskey="s" aria-keyshortcuts="Alt+S">Save report</button>
      <figure>
        <img src="/chart.png" alt="Release chart" width="320" height="180">
        <figcaption>Release stability chart.</figcaption>
      </figure>
    </main>
  </body>
</html>`;

const browser = await puppeteer.launch({ headless: true });

try {
  const page = await browser.newPage();
  try {
    await page.setContent(fixtureHtml, { waitUntil: "domcontentloaded" });
    const browserTree = await page.evaluate(
      createExtractorScript({
        mode: "compact",
        includeBounds: false,
        includeTextNodes: false,
        includeSelectOptions: false,
        excludeLikelyAds: true,
      }),
    ) as SemanticNode;
    const browserSummary = summarizeSemanticTree(browserTree);
    const browserNodes = flattenSemanticTree(browserTree);
    const agent = await runAgentBrief();
    const checks = buildChecks(browserSummary.namedRoles, browserNodes, agent);
    const failed = checks.filter((check) => !check.pass);
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      fixture: fixtureUrl,
      browser: {
        nodeCount: browserSummary.nodeCount,
        namedRoleCount: browserSummary.namedRoles.length,
        namedRoles: browserSummary.namedRoles,
      },
      agent: {
        status: agent.status,
        semanticNodeCount: agent.semanticNodeCount,
        semanticNamedRoleCount: agent.semanticNamedRoleCount,
        semanticTopTableName: agent.semanticTopTableName,
        semanticTopFieldName: agent.semanticTopFieldName,
        semanticTopButtonName: agent.semanticTopButtonName,
        semanticTopKeyboardShortcutName: agent.semanticTopKeyboardShortcutName,
      },
      checks,
      gate: {
        pass: failed.length === 0,
        failed: failed.map((check) => check.id),
      },
    }, null, 2));
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await page.close();
  }
} finally {
  await browser.close();
}

async function runAgentBrief(): Promise<AgentSummary> {
  const stdout = createMemoryWriter();
  const stderr = createMemoryWriter();
  const status = await runCli([fixtureUrl, "--stdin", "--agent-brief"], {
    stdout,
    stderr,
    stdin: Readable.from([fixtureHtml]) as NodeJS.ReadStream,
  });
  if (status !== 0) {
    throw new Error(`ax-grep --agent-brief exited ${status}: ${trim(stderr.output || stdout.output)}`);
  }
  const envelope = JSON.parse(stdout.output) as AgentJsonEnvelope;
  if (!envelope.agent) throw new Error("ax-grep output did not include agent summary");
  return envelope.agent;
}

function buildChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  return [
    {
      id: "heading-link-button-field-image-parity",
      browserEvidence: evidence(namedRoles, ["heading:Agent report", "link:Docs", "button:Search", "textbox:Report query", "img:Release chart"]),
      agentEvidence: evidence([
        agent.semanticTopHeading ?? "",
        agent.semanticTopLinkName ? `link:${agent.semanticTopLinkName}` : "",
        agent.semanticTopButtonName ? `button:${agent.semanticTopButtonName}` : "",
        agent.semanticTopFieldName ? `textbox:${agent.semanticTopFieldName}` : "",
        agent.semanticTopImageName ? `img:${agent.semanticTopImageName}` : "",
      ], ["Agent report", "link:Docs", "button:Search", "textbox:Report query", "img:Release chart"]),
      decision: "covered",
      pass: includesAll(namedRoles, ["heading:Agent report", "link:Docs", "button:Search", "textbox:Report query", "img:Release chart"])
        && agent.semanticTopHeading === "Agent report"
        && agent.semanticTopLinkName === "Docs"
        && agent.semanticTopButtonName === "Search"
        && agent.semanticTopFieldName === "Report query"
        && agent.semanticTopImageName === "Release chart",
    },
    {
      id: "table-header-cell-context",
      browserEvidence: evidence(namedRoles, ["table:Release metrics", "columnheader:Version", "rowheader:2026.06", "cell:Stable"]),
      agentEvidence: JSON.stringify({
        table: agent.semanticTopTableName,
        firstHeader: agent.semanticTopTableFirstHeader,
        firstHeaderRole: agent.semanticTopTableFirstHeaderRole,
        firstHeaderSort: agent.semanticTopTableFirstHeaderSort,
        firstSampleCellText: agent.semanticTopTableFirstSampleCellText,
        firstSampleCellHeaders: agent.semanticTopTableFirstSampleCellHeaders,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["table:Release metrics", "columnheader:Version", "rowheader:2026.06", "cell:Stable"])
        && agent.semanticTopTableName === "Release metrics"
        && agent.semanticTopTableFirstHeader === "Version"
        && agent.semanticTopTableFirstHeaderRole === "columnheader"
        && agent.semanticTopTableFirstHeaderSort === "ascending"
        && agent.semanticTopTableFirstSampleCellText === "Stable"
        && Array.isArray(agent.semanticTopTableFirstSampleCellHeaders)
        && agent.semanticTopTableFirstSampleCellHeaders.includes("Status"),
    },
    {
      id: "form-relation-state-context",
      browserEvidence: evidence(namedRoles, ["form:Search reports", "textbox:Report query", "button:Search"]),
      agentEvidence: JSON.stringify({
        field: agent.semanticTopFieldName,
        required: agent.semanticTopFieldRequired,
        describedByText: agent.semanticTopFieldDescribedByText,
        errorMessageText: agent.semanticTopFieldErrorMessageText,
        buttonPressed: agent.semanticTopButtonPressed,
        buttonControls: agent.semanticTopButtonControls,
      }),
      decision: "covered",
      pass: nodes.some((node) => node.role === "textbox" && node.name === "Report query" && node.state?.required === true)
        && agent.semanticTopFieldName === "Report query"
        && agent.semanticTopFieldRequired === true
        && agent.semanticTopFieldDescribedByText === "Search by release name."
        && agent.semanticTopFieldErrorMessageText === "Enter a report query."
        && agent.semanticTopButtonPressed === false
        && agent.semanticTopButtonControls === "results",
    },
    {
      id: "list-keyboard-target-context",
      browserEvidence: evidence(namedRoles, ["list:Release actions", "link:Download report", "button:Save report"]),
      agentEvidence: JSON.stringify({
        list: agent.semanticTopListName,
        sampleItems: agent.semanticTopListItems,
        shortcutName: agent.semanticTopKeyboardShortcutName,
        shortcutKeys: agent.semanticTopKeyboardShortcutKeys,
        shortcutSelector: agent.semanticTopKeyboardShortcutSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["list:Release actions", "link:Download report", "button:Save report"])
        && agent.semanticTopListName === "Release actions"
        && Array.isArray(agent.semanticTopListItems)
        && agent.semanticTopListItems.includes("Download report")
        && agent.semanticTopKeyboardShortcutName === "Save report"
        && Array.isArray(agent.semanticTopKeyboardShortcutKeys)
        && agent.semanticTopKeyboardShortcutKeys.includes("Alt+S")
        && typeof agent.semanticTopKeyboardShortcutSelector === "string",
    },
  ];
}

function includesAll(values: string[], expected: string[]): boolean {
  return expected.every((item) => values.includes(item));
}

function evidence(values: string[], expected: string[]): string {
  return expected.map((item) => `${item}=${values.includes(item) ? "yes" : "no"}`).join("; ");
}

function createMemoryWriter(): Pick<NodeJS.WriteStream, "write"> & { output: string } {
  const writer = {
    output: "",
    write(chunk: string | Uint8Array): boolean {
      writer.output += chunk.toString();
      return true;
    },
  };
  return writer;
}

function trim(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
