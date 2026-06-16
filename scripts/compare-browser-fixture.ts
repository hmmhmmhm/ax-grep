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
  ledgerId: string;
  browserEvidence: string;
  agentEvidence: string;
  decision: "covered" | "implement" | "browser-only" | "defer";
  pass: boolean;
};

type Fixture = {
  id: string;
  url: string;
  html: string;
  checks: (namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary) => Check[];
};

type FixtureResult = {
  fixture: string;
  browser: {
    nodeCount: number;
    namedRoleCount: number;
    namedRoles: string[];
  };
  agent: Record<string, unknown>;
  checks: Check[];
  gate: {
    pass: boolean;
    failed: string[];
  };
};

const fixtures: Fixture[] = [
  {
    id: "core-static-accessibility",
    url: "https://fixture.local/browser-parity/core",
    checks: buildCoreChecks,
    html: `<!doctype html>
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
</html>`,
  },
  {
    id: "stateful-overlay-links",
    url: "https://fixture.local/browser-parity/stateful-overlay",
    checks: buildStatefulOverlayChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Stateful overlay fixture</title>
  </head>
  <body>
    <main>
      <button aria-expanded="true" aria-haspopup="dialog" aria-controls="settings-panel">Settings</button>
      <section id="settings-panel" role="dialog" aria-label="Settings panel" aria-modal="true">
        <p aria-live="polite">Saved settings</p>
        <a href="/current" aria-current="page">Current page</a>
      </section>
    </main>
  </body>
</html>`,
  },
  {
    id: "combobox-active-descendant",
    url: "https://fixture.local/browser-parity/combobox-active-descendant",
    checks: buildComboboxActiveDescendantChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Combobox active descendant fixture</title>
  </head>
  <body>
    <main>
      <label for="report-search">Report search</label>
      <input
        id="report-search"
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-activedescendant="report-option-2"
        aria-describedby="report-help"
      >
      <p id="report-help">Choose a report destination.</p>
      <div role="listbox" aria-label="Report destinations">
        <div id="report-option-1" role="option" aria-posinset="1" aria-setsize="2">Archive</div>
        <div id="report-option-2" role="option" aria-selected="true" aria-current="page" aria-posinset="2" aria-setsize="2">Quarterly reports</div>
      </div>
    </main>
  </body>
</html>`,
  },
  {
    id: "tablist-selected-panel",
    url: "https://fixture.local/browser-parity/tablist-selected-panel",
    checks: buildTablistSelectedPanelChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Tablist selected panel fixture</title>
  </head>
  <body>
    <main>
      <div role="tablist" aria-label="Report sections">
        <button id="tab-overview" role="tab" aria-selected="false" aria-controls="panel-overview">Overview</button>
        <button id="tab-details" role="tab" aria-selected="true" aria-controls="panel-details">Details</button>
      </div>
      <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden>Overview content</section>
      <section id="panel-details" role="tabpanel" aria-labelledby="tab-details">Detailed report content</section>
    </main>
  </body>
</html>`,
  },
  {
    id: "grid-selected-cell",
    url: "https://fixture.local/browser-parity/grid-selected-cell",
    checks: buildGridSelectedCellChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Grid selected cell fixture</title>
  </head>
  <body>
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
  </body>
</html>`,
  },
  {
    id: "owned-grid-rowgroup",
    url: "https://fixture.local/browser-parity/owned-grid-rowgroup",
    checks: buildOwnedGridRowgroupChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Owned grid rowgroup fixture</title>
  </head>
  <body>
    <main>
      <div role="grid" aria-label="Virtual metrics" aria-rowcount="50" aria-colcount="4" aria-owns="virtual-rows">
        <div role="row" aria-rowindex="1">
          <span role="columnheader" aria-colindex="1">Metric</span>
          <span role="columnheader" aria-colindex="4">Value</span>
        </div>
      </div>
      <div id="virtual-rows" role="rowgroup" aria-label="Virtual rows">
        <div role="row" aria-rowindex="50">
          <span role="rowheader" aria-colindex="1">Queue</span>
          <span role="gridcell" aria-colindex="4">Queued</span>
        </div>
      </div>
    </main>
  </body>
</html>`,
  },
  {
    id: "range-value-state",
    url: "https://fixture.local/browser-parity/range-value-state",
    checks: buildRangeValueStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Range value state fixture</title>
  </head>
  <body>
    <main>
      <div
        role="slider"
        aria-label="Release progress"
        aria-orientation="horizontal"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="40"
        aria-valuetext="40 percent"
      ></div>
    </main>
  </body>
</html>`,
  },
  {
    id: "busy-status-state",
    url: "https://fixture.local/browser-parity/busy-status-state",
    checks: buildBusyStatusStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Busy status state fixture</title>
  </head>
  <body>
    <main>
      <div role="status" aria-label="Indexing status" aria-live="polite" aria-busy="true">Indexing complete</div>
    </main>
  </body>
</html>`,
  },
  {
    id: "invalid-field-state",
    url: "https://fixture.local/browser-parity/invalid-field-state",
    checks: buildInvalidFieldStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Invalid field state fixture</title>
  </head>
  <body>
    <main>
      <label for="report-code">Report code</label>
      <input id="report-code" name="code" aria-invalid="spelling" aria-errormessage="code-error">
      <p id="code-error">Use the report code format.</p>
    </main>
  </body>
</html>`,
  },
  {
    id: "sorted-header-state",
    url: "https://fixture.local/browser-parity/sorted-header-state",
    checks: buildSortedHeaderStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Sorted header state fixture</title>
  </head>
  <body>
    <main>
      <table aria-label="Quarterly reports">
        <thead>
          <tr><th scope="col" aria-sort="descending">Quarter</th><th scope="col">Revenue</th></tr>
        </thead>
        <tbody>
          <tr><td>Q2</td><td>42</td></tr>
        </tbody>
      </table>
    </main>
  </body>
</html>`,
  },
  {
    id: "multiselect-listbox-state",
    url: "https://fixture.local/browser-parity/multiselect-listbox-state",
    checks: buildMultiselectListboxStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Multiselect listbox state fixture</title>
  </head>
  <body>
    <main>
      <div role="listbox" aria-label="Report filters" aria-multiselectable="true">
        <div role="option" aria-selected="true" aria-posinset="1" aria-setsize="2">Open reports</div>
        <div role="option" aria-selected="false" aria-posinset="2" aria-setsize="2">Closed reports</div>
      </div>
    </main>
  </body>
</html>`,
  },
  {
    id: "drag-drop-state",
    url: "https://fixture.local/browser-parity/drag-drop-state",
    checks: buildDragDropStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Drag drop state fixture</title>
  </head>
  <body>
    <main>
      <button aria-label="Move report" aria-grabbed="true" aria-dropeffect="move">Move</button>
    </main>
  </body>
</html>`,
  },
  {
    id: "disabled-readonly-field-state",
    url: "https://fixture.local/browser-parity/disabled-readonly-field-state",
    checks: buildDisabledReadonlyFieldStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Disabled readonly field state fixture</title>
  </head>
  <body>
    <main>
      <label for="archive-code">Archive code</label>
      <input id="archive-code" value="AR-42" disabled readonly>
    </main>
  </body>
</html>`,
  },
  {
    id: "mixed-checkbox-state",
    url: "https://fixture.local/browser-parity/mixed-checkbox-state",
    checks: buildMixedCheckboxStateChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Mixed checkbox state fixture</title>
  </head>
  <body>
    <main>
      <div role="checkbox" aria-label="Include archived reports" aria-checked="mixed"></div>
    </main>
  </body>
</html>`,
  },
  {
    id: "field-details-relation",
    url: "https://fixture.local/browser-parity/field-details-relation",
    checks: buildFieldDetailsRelationChecks,
    html: `<!doctype html>
<html lang="en">
  <head>
    <title>Field details relation fixture</title>
  </head>
  <body>
    <main>
      <label for="archive-filter">Archive filter</label>
      <input id="archive-filter" type="search" aria-details="archive-filter-details">
      <p id="archive-filter-details">Includes restricted and historical report records.</p>
    </main>
  </body>
</html>`,
  },
];

const browser = await puppeteer.launch({ headless: true });

try {
  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    results.push(await runFixture(browser, fixture));
  }
  const failed = results.flatMap((result) => result.gate.failed.map((id) => `${result.fixture}:${id}`));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    fixtureCount: fixtures.length,
    results,
    gate: {
      pass: failed.length === 0,
      failed,
    },
  }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}

async function runFixture(activeBrowser: Awaited<ReturnType<typeof puppeteer.launch>>, fixture: Fixture): Promise<FixtureResult> {
  const page = await activeBrowser.newPage();
  try {
    await page.setContent(fixture.html, { waitUntil: "domcontentloaded" });
    const browserTree = await page.evaluate(
      createExtractorScript({
        mode: "compact",
        includeBounds: false,
        includeAttributes: true,
        includeTextNodes: false,
        includeSelectOptions: false,
        excludeLikelyAds: true,
      }),
    ) as SemanticNode;
    const browserSummary = summarizeSemanticTree(browserTree);
    const browserNodes = flattenSemanticTree(browserTree);
    const agent = await runAgentBrief(fixture);
    const checks = fixture.checks(browserSummary.namedRoles, browserNodes, agent);
    const failed = checks.filter((check) => !check.pass);
    return {
      fixture: fixture.id,
      browser: {
        nodeCount: browserSummary.nodeCount,
        namedRoleCount: browserSummary.namedRoles.length,
        namedRoles: browserSummary.namedRoles,
      },
      agent: summarizeAgent(agent),
      checks,
      gate: {
        pass: failed.length === 0,
        failed: failed.map((check) => check.id),
      },
    };
  } finally {
    await page.close();
  }
}

async function runAgentBrief(fixture: Fixture): Promise<AgentSummary> {
  const stdout = createMemoryWriter();
  const stderr = createMemoryWriter();
  const status = await runCli([fixture.url, "--stdin", "--agent-brief"], {
    stdout,
    stderr,
    stdin: Readable.from([fixture.html]) as NodeJS.ReadStream,
  });
  if (status !== 0) {
    throw new Error(`ax-grep --agent-brief exited ${status}: ${trim(stderr.output || stdout.output)}`);
  }
  const envelope = JSON.parse(stdout.output) as AgentJsonEnvelope;
  if (!envelope.agent) throw new Error("ax-grep output did not include agent summary");
  return envelope.agent;
}

function summarizeAgent(agent: AgentSummary): Record<string, unknown> {
  return {
    status: agent.status,
    semanticNodeCount: agent.semanticNodeCount,
    semanticNamedRoleCount: agent.semanticNamedRoleCount,
    semanticTopHeading: agent.semanticTopHeading,
    semanticTopTableName: agent.semanticTopTableName,
    semanticTopTableFirstHeader: agent.semanticTopTableFirstHeader,
    semanticTopTableFirstHeaderRole: agent.semanticTopTableFirstHeaderRole,
    semanticTopTableFirstHeaderSort: agent.semanticTopTableFirstHeaderSort,
    semanticTopTableFirstHeaderSelector: agent.semanticTopTableFirstHeaderSelector,
    semanticTopTableFirstSampleCellText: agent.semanticTopTableFirstSampleCellText,
    semanticTopTableFirstSampleCellHeaders: agent.semanticTopTableFirstSampleCellHeaders,
    semanticTopFieldRole: agent.semanticTopFieldRole,
    semanticTopFieldName: agent.semanticTopFieldName,
    semanticTopFieldValue: agent.semanticTopFieldValue,
    semanticTopFieldValueMin: agent.semanticTopFieldValueMin,
    semanticTopFieldValueMax: agent.semanticTopFieldValueMax,
    semanticTopFieldValueNow: agent.semanticTopFieldValueNow,
    semanticTopFieldValueText: agent.semanticTopFieldValueText,
    semanticTopFieldDisabled: agent.semanticTopFieldDisabled,
    semanticTopFieldReadonly: agent.semanticTopFieldReadonly,
    semanticTopFieldChecked: agent.semanticTopFieldChecked,
    semanticTopFieldDetails: agent.semanticTopFieldDetails,
    semanticTopFieldDetailsText: agent.semanticTopFieldDetailsText,
    semanticTopFieldRequired: agent.semanticTopFieldRequired,
    semanticTopFieldExpanded: agent.semanticTopFieldExpanded,
    semanticTopFieldHaspopup: agent.semanticTopFieldHaspopup,
    semanticTopFieldDescribedByText: agent.semanticTopFieldDescribedByText,
    semanticTopFieldInvalid: agent.semanticTopFieldInvalid,
    semanticTopFieldErrorMessage: agent.semanticTopFieldErrorMessage,
    semanticTopFieldErrorMessageText: agent.semanticTopFieldErrorMessageText,
    semanticTopButtonName: agent.semanticTopButtonName,
    semanticTopButtonPressed: agent.semanticTopButtonPressed,
    semanticTopButtonExpanded: agent.semanticTopButtonExpanded,
    semanticTopButtonHaspopup: agent.semanticTopButtonHaspopup,
    semanticTopButtonControls: agent.semanticTopButtonControls,
    semanticTopLinkName: agent.semanticTopLinkName,
    semanticTopLinkCurrent: agent.semanticTopLinkCurrent,
    semanticTopImageName: agent.semanticTopImageName,
    semanticTopListName: agent.semanticTopListName,
    semanticTopListItems: agent.semanticTopListItems,
    semanticTopStateRole: agent.semanticTopStateRole,
    semanticTopStateName: agent.semanticTopStateName,
    semanticTopStateExpanded: agent.semanticTopStateExpanded,
    semanticTopStateDisabled: agent.semanticTopStateDisabled,
    semanticTopStateReadonly: agent.semanticTopStateReadonly,
    semanticTopStateChecked: agent.semanticTopStateChecked,
    semanticTopStateHaspopup: agent.semanticTopStateHaspopup,
    semanticTopStateControls: agent.semanticTopStateControls,
    semanticTopStateCurrent: agent.semanticTopStateCurrent,
    semanticTopStateBusy: agent.semanticTopStateBusy,
    semanticTopStateMultiselectable: agent.semanticTopStateMultiselectable,
    semanticTopStateGrabbed: agent.semanticTopStateGrabbed,
    semanticTopStateDropEffect: agent.semanticTopStateDropEffect,
    semanticTopStateInvalid: agent.semanticTopStateInvalid,
    semanticTopStateSort: agent.semanticTopStateSort,
    semanticTopStateLive: agent.semanticTopStateLive,
    semanticTopStateModal: agent.semanticTopStateModal,
    semanticTopStateOrientation: agent.semanticTopStateOrientation,
    semanticTopStateValueMin: agent.semanticTopStateValueMin,
    semanticTopStateValueMax: agent.semanticTopStateValueMax,
    semanticTopStateValueNow: agent.semanticTopStateValueNow,
    semanticTopStateValueText: agent.semanticTopStateValueText,
    semanticTopStateSelector: agent.semanticTopStateSelector,
    semanticTopModalStateRole: agent.semanticTopModalStateRole,
    semanticTopModalStateName: agent.semanticTopModalStateName,
    semanticTopModalState: agent.semanticTopModalState,
    semanticTopModalStateSelector: agent.semanticTopModalStateSelector,
    semanticTopLiveStateRole: agent.semanticTopLiveStateRole,
    semanticTopLiveStateName: agent.semanticTopLiveStateName,
    semanticTopLiveState: agent.semanticTopLiveState,
    semanticTopLiveStateLive: agent.semanticTopLiveStateLive,
    semanticTopLiveStateSelector: agent.semanticTopLiveStateSelector,
    semanticTopRelationRole: agent.semanticTopRelationRole,
    semanticTopRelationName: agent.semanticTopRelationName,
    semanticTopRelation: agent.semanticTopRelation,
    semanticTopRelationTarget: agent.semanticTopRelationTarget,
    semanticTopRelationTargetRole: agent.semanticTopRelationTargetRole,
    semanticTopRelationTargetName: agent.semanticTopRelationTargetName,
    semanticTopRelationTargetSelector: agent.semanticTopRelationTargetSelector,
    semanticTopRelationSelector: agent.semanticTopRelationSelector,
    semanticTopValueRole: agent.semanticTopValueRole,
    semanticTopValueName: agent.semanticTopValueName,
    semanticTopValue: agent.semanticTopValue,
    semanticTopValueSelector: agent.semanticTopValueSelector,
    semanticTopChoiceRole: agent.semanticTopChoiceRole,
    semanticTopChoiceName: agent.semanticTopChoiceName,
    semanticTopChoiceSelected: agent.semanticTopChoiceSelected,
    semanticTopChoiceCurrent: agent.semanticTopChoiceCurrent,
    semanticTopChoicePosInSet: agent.semanticTopChoicePosInSet,
    semanticTopChoiceSetSize: agent.semanticTopChoiceSetSize,
    semanticTopSelectedChoiceRole: agent.semanticTopSelectedChoiceRole,
    semanticTopSelectedChoiceName: agent.semanticTopSelectedChoiceName,
    semanticTopSelectedChoiceSelected: agent.semanticTopSelectedChoiceSelected,
    semanticTopSelectedChoiceCurrent: agent.semanticTopSelectedChoiceCurrent,
    semanticTopSelectedChoicePosInSet: agent.semanticTopSelectedChoicePosInSet,
    semanticTopSelectedChoiceSetSize: agent.semanticTopSelectedChoiceSetSize,
    semanticTopSelectedChoiceControls: agent.semanticTopSelectedChoiceControls,
    semanticTopSelectedChoiceControlsTargetRole: agent.semanticTopSelectedChoiceControlsTargetRole,
    semanticTopSelectedChoiceControlsTargetName: agent.semanticTopSelectedChoiceControlsTargetName,
    semanticTopSelectedChoiceControlsTargetSelector: agent.semanticTopSelectedChoiceControlsTargetSelector,
    semanticTopSelectedTableCellText: agent.semanticTopSelectedTableCellText,
    semanticTopSelectedTableCellRowIndex: agent.semanticTopSelectedTableCellRowIndex,
    semanticTopSelectedTableCellColumnIndex: agent.semanticTopSelectedTableCellColumnIndex,
    semanticTopSelectedTableCellSelected: agent.semanticTopSelectedTableCellSelected,
    semanticTopSelectedTableCellCurrent: agent.semanticTopSelectedTableCellCurrent,
    semanticTopSelectedTableCellSelector: agent.semanticTopSelectedTableCellSelector,
    semanticTopKeyboardShortcutName: agent.semanticTopKeyboardShortcutName,
    semanticTopKeyboardShortcutKeys: agent.semanticTopKeyboardShortcutKeys,
    semanticTopKeyboardShortcutSelector: agent.semanticTopKeyboardShortcutSelector,
  };
}

function buildCoreChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  return [
    {
      id: "heading-link-button-field-image-parity",
      ledgerId: "G27",
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
      ledgerId: "G27",
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
      ledgerId: "G27",
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
      ledgerId: "G26",
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

function buildStatefulOverlayChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const button = nodes.find((node) => node.role === "button" && node.name === "Settings");
  const link = nodes.find((node) => node.role === "link" && node.name === "Current page");
  const dialog = nodes.find((node) => node.role === "dialog" && node.name === "Settings panel");
  const live = nodes.find((node) => node.state?.live === "polite");
  return [
    {
      id: "expanded-popup-controls-parity",
      ledgerId: "G28",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["button:Settings", "dialog:Settings panel"]),
        expanded: button?.state?.expanded,
        haspopup: button?.state?.haspopup,
        controls: button?.state?.controls,
      }),
      agentEvidence: JSON.stringify({
        button: agent.semanticTopButtonName,
        expanded: agent.semanticTopButtonExpanded,
        haspopup: agent.semanticTopButtonHaspopup,
        controls: agent.semanticTopButtonControls,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["button:Settings", "dialog:Settings panel"])
        && button?.state?.expanded === true
        && button?.state?.haspopup === "dialog"
        && button?.state?.controls === "settings-panel"
        && agent.semanticTopButtonName === "Settings"
        && agent.semanticTopButtonExpanded === true
        && agent.semanticTopButtonHaspopup === "dialog"
        && agent.semanticTopButtonControls === "settings-panel",
    },
    {
      id: "current-link-modal-live-state-parity",
      ledgerId: "G28",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["link:Current page", "dialog:Settings panel"]),
        current: link?.state?.current,
        modal: dialog?.state?.modal,
        live: live?.state?.live,
      }),
      agentEvidence: JSON.stringify({
        link: agent.semanticTopLinkName,
        current: agent.semanticTopLinkCurrent,
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateCurrent: agent.semanticTopStateCurrent,
        stateModal: agent.semanticTopStateModal,
        stateLive: agent.semanticTopStateLive,
        modalRole: agent.semanticTopModalStateRole,
        modalName: agent.semanticTopModalStateName,
        modalState: agent.semanticTopModalState,
        liveRole: agent.semanticTopLiveStateRole,
        liveState: agent.semanticTopLiveState,
        liveValue: agent.semanticTopLiveStateLive,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["link:Current page", "dialog:Settings panel"])
        && link?.state?.current === "page"
        && dialog?.state?.modal === true
        && live?.state?.live === "polite"
        && agent.semanticTopLinkName === "Current page"
        && agent.semanticTopLinkCurrent === "page"
        && agent.semanticTopModalStateRole === "dialog"
        && agent.semanticTopModalStateName === "Settings panel"
        && agent.semanticTopModalState === "modal=true"
        && agent.semanticTopLiveStateLive === "polite",
    },
  ];
}

function buildComboboxActiveDescendantChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const combobox = nodes.find((node) => node.role === "combobox" && node.name === "Report search");
  const selectedOption = nodes.find((node) => node.role === "option" && node.name === "Quarterly reports");
  return [
    {
      id: "combobox-state-relation-parity",
      ledgerId: "G29",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["combobox:Report search", "listbox:Report destinations", "option:Quarterly reports"]),
        expanded: combobox?.state?.expanded,
        haspopup: combobox?.state?.haspopup,
        activeDescendant: combobox?.attributes?.["aria-activedescendant"],
      }),
      agentEvidence: JSON.stringify({
        field: agent.semanticTopFieldName,
        expanded: agent.semanticTopFieldExpanded,
        haspopup: agent.semanticTopFieldHaspopup,
        relation: agent.semanticTopRelation,
        target: agent.semanticTopRelationTarget,
        targetRole: agent.semanticTopRelationTargetRole,
        targetName: agent.semanticTopRelationTargetName,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["combobox:Report search", "listbox:Report destinations", "option:Quarterly reports"])
        && combobox?.state?.expanded === true
        && combobox?.state?.haspopup === "listbox"
        && combobox?.attributes?.["aria-activedescendant"] === "report-option-2"
        && agent.semanticTopFieldName === "Report search"
        && agent.semanticTopFieldExpanded === true
        && agent.semanticTopFieldHaspopup === "listbox"
        && agent.semanticTopRelation === "activeDescendant"
        && agent.semanticTopRelationTarget === "report-option-2"
        && agent.semanticTopRelationTargetRole === "option"
        && agent.semanticTopRelationTargetName === "Quarterly reports",
    },
    {
      id: "selected-current-option-parity",
      ledgerId: "G29",
      browserEvidence: JSON.stringify({
        selected: selectedOption?.state?.selected,
        current: selectedOption?.state?.current,
        posInSet: selectedOption?.attributes?.["aria-posinset"],
        setSize: selectedOption?.attributes?.["aria-setsize"],
      }),
      agentEvidence: JSON.stringify({
        choiceRole: agent.semanticTopChoiceRole,
        choiceName: agent.semanticTopChoiceName,
        selected: agent.semanticTopChoiceSelected,
        current: agent.semanticTopChoiceCurrent,
        posInSet: agent.semanticTopChoicePosInSet,
        setSize: agent.semanticTopChoiceSetSize,
        selectedChoiceRole: agent.semanticTopSelectedChoiceRole,
        selectedChoiceName: agent.semanticTopSelectedChoiceName,
        selectedChoiceSelected: agent.semanticTopSelectedChoiceSelected,
        selectedChoiceCurrent: agent.semanticTopSelectedChoiceCurrent,
        selectedChoicePosInSet: agent.semanticTopSelectedChoicePosInSet,
        selectedChoiceSetSize: agent.semanticTopSelectedChoiceSetSize,
      }),
      decision: "covered",
      pass: selectedOption?.state?.selected === true
        && selectedOption?.state?.current === "page"
        && selectedOption?.attributes?.["aria-posinset"] === "2"
        && selectedOption?.attributes?.["aria-setsize"] === "2"
        && agent.semanticTopSelectedChoiceRole === "option"
        && agent.semanticTopSelectedChoiceName === "Quarterly reports"
        && agent.semanticTopSelectedChoiceSelected === true
        && agent.semanticTopSelectedChoiceCurrent === "page"
        && agent.semanticTopSelectedChoicePosInSet === 2
        && agent.semanticTopSelectedChoiceSetSize === 2,
    },
  ];
}

function buildTablistSelectedPanelChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const selectedTab = nodes.find((node) => node.role === "tab" && node.name === "Details");
  const selectedPanel = nodes.find((node) => node.role === "tabpanel" && node.name === "Details");
  return [
    {
      id: "selected-tab-panel-parity",
      ledgerId: "G30",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["tablist:Report sections", "tab:Details", "tabpanel:Details"]),
        selected: selectedTab?.state?.selected,
        controls: selectedTab?.state?.controls,
        panelName: selectedPanel?.name,
      }),
      agentEvidence: JSON.stringify({
        selectedChoiceRole: agent.semanticTopSelectedChoiceRole,
        selectedChoiceName: agent.semanticTopSelectedChoiceName,
        selected: agent.semanticTopSelectedChoiceSelected,
        controls: agent.semanticTopSelectedChoiceControls,
        targetRole: agent.semanticTopSelectedChoiceControlsTargetRole,
        targetName: agent.semanticTopSelectedChoiceControlsTargetName,
        targetSelector: agent.semanticTopSelectedChoiceControlsTargetSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["tablist:Report sections", "tab:Details", "tabpanel:Details"])
        && selectedTab?.state?.selected === true
        && selectedTab?.state?.controls === "panel-details"
        && selectedPanel?.name === "Details"
        && agent.semanticTopSelectedChoiceRole === "tab"
        && agent.semanticTopSelectedChoiceName === "Details"
        && agent.semanticTopSelectedChoiceSelected === true
        && agent.semanticTopSelectedChoiceControls === "panel-details"
        && agent.semanticTopSelectedChoiceControlsTargetRole === "tabpanel"
        && agent.semanticTopSelectedChoiceControlsTargetName === "Details"
        && agent.semanticTopSelectedChoiceControlsTargetSelector === "#panel-details",
    },
  ];
}

function buildGridSelectedCellChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const selectedCell = nodes.find((node) => node.role === "gridcell" && node.text === "Blocked" && node.state?.selected === true);
  return [
    {
      id: "selected-gridcell-parity",
      ledgerId: "G31",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["grid:Issue board", "columnheader:Status", "rowheader:BUG-1"]),
        selected: selectedCell?.state?.selected,
        columnIndex: selectedCell?.attributes?.["aria-colindex"],
        text: selectedCell?.text,
      }),
      agentEvidence: JSON.stringify({
        table: agent.semanticTopTableName,
        selectedText: agent.semanticTopSelectedTableCellText,
        selected: agent.semanticTopSelectedTableCellSelected,
        rowIndex: agent.semanticTopSelectedTableCellRowIndex,
        columnIndex: agent.semanticTopSelectedTableCellColumnIndex,
        selector: agent.semanticTopSelectedTableCellSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["grid:Issue board", "columnheader:Status", "rowheader:BUG-1"])
        && selectedCell?.state?.selected === true
        && selectedCell?.attributes?.["aria-colindex"] === "2"
        && selectedCell?.text === "Blocked"
        && agent.semanticTopTableName === "Issue board"
        && agent.semanticTopSelectedTableCellText === "Blocked"
        && agent.semanticTopSelectedTableCellSelected === true
        && agent.semanticTopSelectedTableCellRowIndex === 2
        && agent.semanticTopSelectedTableCellColumnIndex === 2
        && agent.semanticTopSelectedTableCellSelector === "span:nth-of-type(2)",
    },
  ];
}

function buildOwnedGridRowgroupChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const ownedRow = nodes.find((node) => node.role === "row" && node.attributes?.["aria-rowindex"] === "50");
  const ownedCell = nodes.find((node) => node.role === "gridcell" && node.text === "Queued");
  return [
    {
      id: "owned-grid-rowgroup-parity",
      ledgerId: "G80",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["grid:Virtual metrics", "rowgroup:Virtual rows", "rowheader:Queue"]),
        rowIndex: ownedRow?.attributes?.["aria-rowindex"],
        columnIndex: ownedCell?.attributes?.["aria-colindex"],
        text: ownedCell?.text,
      }),
      agentEvidence: JSON.stringify({
        table: agent.semanticTopTableName,
        ownedTarget: agent.semanticTopTableFirstOwnedTarget,
        ownedRole: agent.semanticTopTableFirstOwnedRole,
        ownedName: agent.semanticTopTableFirstOwnedName,
        cellText: agent.semanticTopTableFirstOwnedSampleCellText,
        rowIndex: agent.semanticTopTableFirstOwnedSampleCellRowIndex,
        columnIndex: agent.semanticTopTableFirstOwnedSampleCellColumnIndex,
        cellOwnedTarget: agent.semanticTopTableFirstOwnedSampleCellOwnedTarget,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["grid:Virtual metrics", "rowgroup:Virtual rows", "rowheader:Queue"])
        && ownedRow?.attributes?.["aria-rowindex"] === "50"
        && ownedCell?.attributes?.["aria-colindex"] === "4"
        && ownedCell?.text === "Queued"
        && agent.semanticTopTableName === "Virtual metrics"
        && agent.semanticTopTableFirstOwnedTarget === "virtual-rows"
        && agent.semanticTopTableFirstOwnedRole === "rowgroup"
        && agent.semanticTopTableFirstOwnedName === "Virtual rows"
        && agent.semanticTopTableFirstOwnedSampleCellText === "Queued"
        && agent.semanticTopTableFirstOwnedSampleCellRowIndex === 50
        && agent.semanticTopTableFirstOwnedSampleCellColumnIndex === 4
        && agent.semanticTopTableFirstOwnedSampleCellOwnedTarget === "virtual-rows",
    },
  ];
}

function buildRangeValueStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const slider = nodes.find((node) => node.role === "slider" && node.name === "Release progress");
  return [
    {
      id: "range-value-state-parity",
      ledgerId: "G38",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["slider:Release progress"]),
        orientation: slider?.state?.orientation,
        valueMin: slider?.state?.valueMin,
        valueMax: slider?.state?.valueMax,
        valueNow: slider?.state?.valueNow,
        valueText: slider?.state?.valueText,
      }),
      agentEvidence: JSON.stringify({
        fieldRole: agent.semanticTopFieldRole,
        fieldName: agent.semanticTopFieldName,
        fieldValue: agent.semanticTopFieldValue,
        fieldValueMin: agent.semanticTopFieldValueMin,
        fieldValueMax: agent.semanticTopFieldValueMax,
        fieldValueNow: agent.semanticTopFieldValueNow,
        fieldValueText: agent.semanticTopFieldValueText,
        valueRole: agent.semanticTopValueRole,
        valueName: agent.semanticTopValueName,
        value: agent.semanticTopValue,
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateOrientation: agent.semanticTopStateOrientation,
        stateValueMin: agent.semanticTopStateValueMin,
        stateValueMax: agent.semanticTopStateValueMax,
        stateValueNow: agent.semanticTopStateValueNow,
        stateValueText: agent.semanticTopStateValueText,
        stateSelector: agent.semanticTopStateSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["slider:Release progress"])
        && slider?.state?.orientation === "horizontal"
        && slider?.state?.valueMin === 0
        && slider?.state?.valueMax === 100
        && slider?.state?.valueNow === 40
        && slider?.state?.valueText === "40 percent"
        && agent.semanticTopFieldRole === "slider"
        && agent.semanticTopFieldName === "Release progress"
        && agent.semanticTopFieldValue === "40 percent"
        && agent.semanticTopFieldValueMin === 0
        && agent.semanticTopFieldValueMax === 100
        && agent.semanticTopFieldValueNow === 40
        && agent.semanticTopFieldValueText === "40 percent"
        && agent.semanticTopValueRole === "slider"
        && agent.semanticTopValueName === "Release progress"
        && agent.semanticTopValue === "40 percent"
        && agent.semanticTopStateRole === "slider"
        && agent.semanticTopStateName === "Release progress"
        && agent.semanticTopStateOrientation === "horizontal"
        && agent.semanticTopStateValueMin === 0
        && agent.semanticTopStateValueMax === 100
        && agent.semanticTopStateValueNow === 40
        && agent.semanticTopStateValueText === "40 percent"
        && typeof agent.semanticTopStateSelector === "string",
    },
  ];
}

function buildBusyStatusStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const status = nodes.find((node) => node.role === "status" && node.name === "Indexing status");
  return [
    {
      id: "busy-status-state-parity",
      ledgerId: "G39",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["status:Indexing status"]),
        busy: status?.state?.busy,
        live: status?.state?.live,
      }),
      agentEvidence: JSON.stringify({
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateBusy: agent.semanticTopStateBusy,
        stateLive: agent.semanticTopStateLive,
        stateSelector: agent.semanticTopStateSelector,
        liveRole: agent.semanticTopLiveStateRole,
        liveName: agent.semanticTopLiveStateName,
        liveValue: agent.semanticTopLiveStateLive,
        liveSelector: agent.semanticTopLiveStateSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["status:Indexing status"])
        && status?.state?.busy === true
        && status?.state?.live === "polite"
        && agent.semanticTopStateRole === "status"
        && agent.semanticTopStateName === "Indexing status"
        && agent.semanticTopStateBusy === true
        && agent.semanticTopStateLive === "polite"
        && typeof agent.semanticTopStateSelector === "string"
        && agent.semanticTopLiveStateRole === "status"
        && agent.semanticTopLiveStateName === "Indexing status"
        && agent.semanticTopLiveStateLive === "polite"
        && typeof agent.semanticTopLiveStateSelector === "string",
    },
  ];
}

function buildInvalidFieldStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const textbox = nodes.find((node) => node.role === "textbox" && node.name === "Report code");
  return [
    {
      id: "invalid-field-state-parity",
      ledgerId: "G40",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["textbox:Report code"]),
        invalid: textbox?.state?.invalid,
        errorMessage: textbox?.attributes?.["aria-errormessage"],
      }),
      agentEvidence: JSON.stringify({
        fieldRole: agent.semanticTopFieldRole,
        fieldName: agent.semanticTopFieldName,
        fieldInvalid: agent.semanticTopFieldInvalid,
        fieldErrorMessage: agent.semanticTopFieldErrorMessage,
        fieldErrorMessageText: agent.semanticTopFieldErrorMessageText,
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateInvalid: agent.semanticTopStateInvalid,
        stateSelector: agent.semanticTopStateSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["textbox:Report code"])
        && textbox?.state?.invalid === "spelling"
        && textbox?.attributes?.["aria-errormessage"] === "code-error"
        && agent.semanticTopFieldRole === "textbox"
        && agent.semanticTopFieldName === "Report code"
        && agent.semanticTopFieldInvalid === "spelling"
        && agent.semanticTopFieldErrorMessage === "code-error"
        && agent.semanticTopFieldErrorMessageText === "Use the report code format."
        && agent.semanticTopStateRole === "textbox"
        && agent.semanticTopStateName === "Report code"
        && agent.semanticTopStateInvalid === "spelling"
        && typeof agent.semanticTopStateSelector === "string",
    },
  ];
}

function buildSortedHeaderStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const header = nodes.find((node) => node.role === "columnheader" && node.name === "Quarter");
  return [
    {
      id: "sorted-header-state-parity",
      ledgerId: "G41",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["table:Quarterly reports", "columnheader:Quarter"]),
        sort: header?.state?.sort,
      }),
      agentEvidence: JSON.stringify({
        table: agent.semanticTopTableName,
        firstHeader: agent.semanticTopTableFirstHeader,
        firstHeaderRole: agent.semanticTopTableFirstHeaderRole,
        firstHeaderSort: agent.semanticTopTableFirstHeaderSort,
        firstHeaderSelector: agent.semanticTopTableFirstHeaderSelector,
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateSort: agent.semanticTopStateSort,
        stateSelector: agent.semanticTopStateSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["table:Quarterly reports", "columnheader:Quarter"])
        && header?.state?.sort === "descending"
        && agent.semanticTopTableName === "Quarterly reports"
        && agent.semanticTopTableFirstHeader === "Quarter"
        && agent.semanticTopTableFirstHeaderRole === "columnheader"
        && agent.semanticTopTableFirstHeaderSort === "descending"
        && typeof agent.semanticTopTableFirstHeaderSelector === "string"
        && agent.semanticTopStateRole === "columnheader"
        && agent.semanticTopStateName === "Quarter"
        && agent.semanticTopStateSort === "descending"
        && typeof agent.semanticTopStateSelector === "string",
    },
  ];
}

function buildMultiselectListboxStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const listbox = nodes.find((node) => node.role === "listbox" && node.name === "Report filters");
  const selectedOption = nodes.find((node) => node.role === "option" && node.name === "Open reports");
  return [
    {
      id: "multiselect-listbox-state-parity",
      ledgerId: "G42",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["listbox:Report filters", "option:Open reports", "option:Closed reports"]),
        multiselectable: listbox?.state?.multiselectable,
        selected: selectedOption?.state?.selected,
        posInSet: selectedOption?.attributes?.["aria-posinset"],
        setSize: selectedOption?.attributes?.["aria-setsize"],
      }),
      agentEvidence: JSON.stringify({
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateMultiselectable: agent.semanticTopStateMultiselectable,
        stateSelector: agent.semanticTopStateSelector,
        selectedChoiceRole: agent.semanticTopSelectedChoiceRole,
        selectedChoiceName: agent.semanticTopSelectedChoiceName,
        selectedChoiceSelected: agent.semanticTopSelectedChoiceSelected,
        selectedChoicePosInSet: agent.semanticTopSelectedChoicePosInSet,
        selectedChoiceSetSize: agent.semanticTopSelectedChoiceSetSize,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["listbox:Report filters", "option:Open reports", "option:Closed reports"])
        && listbox?.state?.multiselectable === true
        && selectedOption?.state?.selected === true
        && selectedOption?.attributes?.["aria-posinset"] === "1"
        && selectedOption?.attributes?.["aria-setsize"] === "2"
        && agent.semanticTopStateRole === "listbox"
        && agent.semanticTopStateName === "Report filters"
        && agent.semanticTopStateMultiselectable === true
        && typeof agent.semanticTopStateSelector === "string"
        && agent.semanticTopSelectedChoiceRole === "option"
        && agent.semanticTopSelectedChoiceName === "Open reports"
        && agent.semanticTopSelectedChoiceSelected === true
        && agent.semanticTopSelectedChoicePosInSet === 1
        && agent.semanticTopSelectedChoiceSetSize === 2,
    },
  ];
}

function buildDragDropStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const button = nodes.find((node) => node.role === "button" && node.name === "Move report");
  return [
    {
      id: "drag-drop-state-parity",
      ledgerId: "G43",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["button:Move report"]),
        grabbed: button?.state?.grabbed,
        dropEffect: button?.state?.dropEffect,
      }),
      agentEvidence: JSON.stringify({
        buttonName: agent.semanticTopButtonName,
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateGrabbed: agent.semanticTopStateGrabbed,
        stateDropEffect: agent.semanticTopStateDropEffect,
        stateSelector: agent.semanticTopStateSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["button:Move report"])
        && button?.state?.grabbed === true
        && button?.state?.dropEffect === "move"
        && agent.semanticTopButtonName === "Move report"
        && agent.semanticTopStateRole === "button"
        && agent.semanticTopStateName === "Move report"
        && agent.semanticTopStateGrabbed === true
        && agent.semanticTopStateDropEffect === "move"
        && typeof agent.semanticTopStateSelector === "string",
    },
  ];
}

function buildDisabledReadonlyFieldStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const textbox = nodes.find((node) => node.role === "textbox" && node.name === "Archive code");
  return [
    {
      id: "disabled-readonly-field-state-parity",
      ledgerId: "G44",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["textbox:Archive code"]),
        disabled: textbox?.state?.disabled,
        readonly: textbox?.state?.readonly,
        value: textbox?.value,
      }),
      agentEvidence: JSON.stringify({
        fieldRole: agent.semanticTopFieldRole,
        fieldName: agent.semanticTopFieldName,
        fieldValue: agent.semanticTopFieldValue,
        fieldDisabled: agent.semanticTopFieldDisabled,
        fieldReadonly: agent.semanticTopFieldReadonly,
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateDisabled: agent.semanticTopStateDisabled,
        stateReadonly: agent.semanticTopStateReadonly,
        stateSelector: agent.semanticTopStateSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["textbox:Archive code"])
        && textbox?.state?.disabled === true
        && textbox?.state?.readonly === true
        && textbox?.value === "AR-42"
        && agent.semanticTopFieldRole === "textbox"
        && agent.semanticTopFieldName === "Archive code"
        && agent.semanticTopFieldValue === "AR-42"
        && agent.semanticTopFieldDisabled === true
        && agent.semanticTopFieldReadonly === true
        && agent.semanticTopStateRole === "textbox"
        && agent.semanticTopStateName === "Archive code"
        && agent.semanticTopStateDisabled === true
        && agent.semanticTopStateReadonly === true
        && typeof agent.semanticTopStateSelector === "string",
    },
  ];
}

function buildMixedCheckboxStateChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const checkbox = nodes.find((node) => node.role === "checkbox" && node.name === "Include archived reports");
  return [
    {
      id: "mixed-checkbox-state-parity",
      ledgerId: "G45",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["checkbox:Include archived reports"]),
        checked: checkbox?.state?.checked,
      }),
      agentEvidence: JSON.stringify({
        fieldRole: agent.semanticTopFieldRole,
        fieldName: agent.semanticTopFieldName,
        fieldChecked: agent.semanticTopFieldChecked,
        stateRole: agent.semanticTopStateRole,
        stateName: agent.semanticTopStateName,
        stateChecked: agent.semanticTopStateChecked,
        stateSelector: agent.semanticTopStateSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["checkbox:Include archived reports"])
        && checkbox?.state?.checked === "mixed"
        && agent.semanticTopFieldRole === "checkbox"
        && agent.semanticTopFieldName === "Include archived reports"
        && agent.semanticTopFieldChecked === "mixed"
        && agent.semanticTopStateRole === "checkbox"
        && agent.semanticTopStateName === "Include archived reports"
        && agent.semanticTopStateChecked === "mixed"
        && typeof agent.semanticTopStateSelector === "string",
    },
  ];
}

function buildFieldDetailsRelationChecks(namedRoles: string[], nodes: SemanticNode[], agent: AgentSummary): Check[] {
  const field = nodes.find((node) => node.role === "searchbox" && node.name === "Archive filter");
  const details = nodes.find((node) => node.attributes?.id === "archive-filter-details");
  return [
    {
      id: "field-details-relation-parity",
      ledgerId: "G46",
      browserEvidence: JSON.stringify({
        namedRoles: evidence(namedRoles, ["searchbox:Archive filter"]),
        detailsId: field?.attributes?.["aria-details"],
        detailsText: details?.text,
        fieldSelector: field?.selector,
        detailsSelector: details?.selector,
      }),
      agentEvidence: JSON.stringify({
        fieldRole: agent.semanticTopFieldRole,
        fieldName: agent.semanticTopFieldName,
        fieldDetails: agent.semanticTopFieldDetails,
        fieldDetailsText: agent.semanticTopFieldDetailsText,
        relationRole: agent.semanticTopRelationRole,
        relationName: agent.semanticTopRelationName,
        relation: agent.semanticTopRelation,
        relationTarget: agent.semanticTopRelationTarget,
        relationTargetRole: agent.semanticTopRelationTargetRole,
        relationTargetSelector: agent.semanticTopRelationTargetSelector,
        relationSelector: agent.semanticTopRelationSelector,
      }),
      decision: "covered",
      pass: includesAll(namedRoles, ["searchbox:Archive filter"])
        && field?.attributes?.["aria-details"] === "archive-filter-details"
        && details?.text === "Includes restricted and historical report records."
        && typeof field?.selector === "string"
        && typeof details?.selector === "string"
        && agent.semanticTopFieldRole === "searchbox"
        && agent.semanticTopFieldName === "Archive filter"
        && agent.semanticTopFieldDetails === "archive-filter-details"
        && agent.semanticTopFieldDetailsText === "Includes restricted and historical report records."
        && agent.semanticTopRelationRole === "searchbox"
        && agent.semanticTopRelationName === "Archive filter"
        && agent.semanticTopRelation === "details"
        && agent.semanticTopRelationTarget === "archive-filter-details"
        && agent.semanticTopRelationTargetRole === "p"
        && agent.semanticTopRelationTargetSelector === "#archive-filter-details"
        && agent.semanticTopRelationSelector === "#archive-filter",
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
