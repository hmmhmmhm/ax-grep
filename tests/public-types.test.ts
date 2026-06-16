import { describe, expect, it } from "vitest";
import type {
  AgentAction,
  AgentActionTargetChoice,
  AgentAnswerPlan,
  AgentCitation,
  AgentContractFeature,
  AgentFormChoice,
  AgentHandoff,
  AgentJsonEnvelope,
  AgentReadValue,
  AgentResultChoice,
  AgentSourceChoice,
  AgentSourceSearchResult,
  AgentSummary,
  AgentTarget,
} from "../src/index";

describe("public agent types", () => {
  it("exposes browser fallback shortcut contract feature markers", () => {
    const features: AgentContractFeature[] = [
      "readValue.shortcuts",
      "readValue.referencePaths",
      "text.shortcuts",
      "semantic.shortcuts",
      "citation.shortcuts",
      "answerEvidence.shortcuts",
      "diagnostics.shortcuts",
      "browserHtml.shortcuts",
      "browserHtml.reasonCodes",
      "executor.browserHtml.shortcuts",
      "handoff.browserHtml.shortcuts",
    ];

    expect(features).toContain("browserHtml.reasonCodes");
    expect(features).toContain("readValue.referencePaths");
    expect(features).toContain("text.shortcuts");
    expect(features).toContain("semantic.shortcuts");
    expect(features).toContain("citation.shortcuts");
    expect(features).toContain("answerEvidence.shortcuts");
    expect(features).toContain("diagnostics.shortcuts");
  });

  it("exports detailed handoff choice and evidence shapes", () => {
    const target: AgentTarget = {
      title: "Challenge",
      url: "https://example.test/challenge",
      path: "pageCheck.barriers[0]",
      text: "Challenge: verify you are human",
      selector: "main > h1",
      snippet: "verify you are human",
    };
    const resultChoice: AgentResultChoice = {
      id: "r1",
      path: "searchResults[0]",
      title: "Example result",
      url: "https://example.test/result?tab=readme",
      host: "example.test",
      rank: 1,
      snippet: "Result summary",
      openResult: 1,
      recommended: true,
      primary: true,
      selectionReason: "High relevance.",
      commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent-brief"],
    };
    const sourceChoice: AgentSourceChoice = {
      id: "s1",
      path: "pageCheck.sourceLinks[0]",
      title: "Source",
      url: "https://source.example/report?ref=docs",
      host: "source.example",
      snippet: "Source summary",
      dateText: "2026-05-31",
      dateIso: "2026-05-31T00:00:00.000Z",
      dateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      datePrecision: "day",
      dateSource: "title",
      selector: "a:nth-of-type(1)",
      kind: "external",
      sourceScore: 0.91,
      selectionReason: "High-quality source link.",
      commandArgs: ["ax-grep", "https://source.example/report?ref=docs", "--agent-brief"],
    };
    const evidence: AgentCitation = {
      kind: "content",
      id: "e1",
      path: "pageCheck.contentEvidence[0]",
      confidence: "high",
      text: "Readable evidence",
      reason: "semantic content",
    };
    const answerPlan: AgentAnswerPlan = {
      status: "ready",
      confidence: "high",
      reason: "Evidence is ready.",
      gaps: [],
      useCitationIds: ["e1"],
      readFrom: "pageCheck.contentEvidence",
    };
    const sourceResult: AgentSourceSearchResult = {
      id: "selected",
      path: "sourceSearch.selectedResult",
      title: "Selected source",
      url: "https://source.example/report",
      snippet: "Source summary",
      commandArgs: ["ax-grep", "--search", "source", "--open-result", "1", "--agent-brief"],
    };
    const handoff: AgentHandoff = {
      instruction: "Answer now.",
      decision: "return",
      mode: "read",
      operation: "return",
      confidence: "high",
      answerStatus: answerPlan.status,
      answerReady: true,
      shouldContinue: false,
      terminal: true,
      maxSuggestedIterations: 0,
      expectedOutcome: "read-evidence",
      reason: "Use current evidence.",
      target,
      resultChoices: [resultChoice],
      sourceChoices: [sourceChoice],
      verificationFoundQueries: ["present"],
      verificationMissingQueries: ["missing"],
      answerEvidence: [evidence],
      sourceSearch: {
        query: "source",
        engine: "auto",
        searchUrl: "https://search.example/?q=source",
        selectedRank: 1,
        selectedTitle: "Selected source",
        selectedUrl: sourceResult.url,
        selectedResult: sourceResult,
      },
      browserHtml: {
        url: "https://example.test/challenge",
        htmlFile: "captured.html",
        captureScript: "document.documentElement.outerHTML",
        reason: "Browser-captured HTML is needed.",
        reasonCode: "challenge",
        command: "ax-grep 'https://example.test/challenge' --html-file captured.html --agent-brief",
        commandArgs: ["ax-grep", "https://example.test/challenge", "--html-file", "captured.html", "--agent-brief"],
      },
      readFrom: "pageCheck.contentEvidence",
      readValue: {
        path: "pageCheck.contentEvidence",
        value: [evidence],
      },
    };

    expect(handoff.target?.selector).toBe("main > h1");
    expect(handoff.resultChoices?.[0]?.snippet).toBe("Result summary");
    expect(handoff.sourceChoices?.[0]?.selector).toBe("a:nth-of-type(1)");
    expect(handoff.sourceChoices?.[0]?.dateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(handoff.verificationMissingQueries).toEqual(["missing"]);
    expect(handoff.answerEvidence?.[0]?.text).toBe("Readable evidence");
    expect(handoff.browserHtml?.reason).toContain("Browser-captured HTML");
    expect(handoff.browserHtml?.reasonCode).toBe("challenge");
    expect(handoff.browserHtml?.command).toContain("--html-file captured.html");
  });

  it("exports typed read value references for compact agent handoffs", () => {
    const readValue: AgentReadValue = {
      path: "pageCheck.resources",
      valuePath: "pageCheck.resources",
      valueType: "array",
      count: 4,
    };

    expect(readValue.valueType).toBe("array");
  });

  it("exports source-link action references for agent action lists", () => {
    const sourceAction: AgentAction = {
      action: "open-source-link",
      execution: "run-command",
      sourceLinkRef: "pageCheck.sourceLinks[0]",
      commandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      source: "pageCheck.nextSteps",
    };
    const summary: Pick<AgentSummary, "actions" | "primaryAction"> = {
      actions: [sourceAction],
      primaryAction: sourceAction,
    };

    expect(summary.actions?.[0]?.sourceLinkRef).toBe("pageCheck.sourceLinks[0]");
    expect(summary.primaryAction?.sourceLinkRef).toBe("pageCheck.sourceLinks[0]");
  });

  it("exports top-level agent count shortcuts", () => {
    const resultChoice: AgentResultChoice = {
      id: "r1",
      path: "searchResults[0]",
      title: "Example result",
      url: "https://example.test/result",
      host: "example.test",
      rank: 1,
      openResult: 1,
      recommended: true,
      primary: true,
      selectionReason: "High relevance.",
      commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent-brief"],
    };
    const formChoice: AgentFormChoice = {
      id: "f1",
      path: "pageCheck.forms[0]",
      rank: 1,
      method: "get",
      fieldCount: 1,
      hiddenFieldCount: 1,
      text: "GET https://example.test/find; query field: q",
      actionUrl: "https://example.test/find",
      actionUrlPath: "/find",
      formId: "archive-form",
      formName: "archive",
      formTarget: "_blank",
      formEncType: "multipart/form-data",
      formAcceptCharset: "UTF-8",
      formNoValidate: true,
      submitText: "Search",
      submitType: "submit",
      submitName: "submit-search",
      submitValue: "go",
      submitDisabled: true,
      submitSelector: "button[name=\"submit-search\"]",
      submitFormActionUrl: "https://example.test/find",
      submitFormActionUrlPath: "/find",
      submitFormMethod: "get",
      submitFormTarget: "_blank",
      submitFormEncType: "multipart/form-data",
      submitFormNoValidate: true,
      submitFormId: "remote-form",
      queryField: "q",
      urlTemplate: "https://example.test/find?q={query}",
      urlTemplatePath: "/find",
      urlTemplateQuery: "?q={query}",
      command: "ax-grep 'https://example.test/find?q=docs' --find docs --agent",
      commandArgs: ["ax-grep", "https://example.test/find?q=docs", "--find", "docs", "--agent"],
      selector: "form:nth-of-type(1)",
      hiddenFields: [{ name: "csrf", value: "secret", selector: "input[name=\"csrf\"]" }],
      fields: [{ name: "q", type: "search", label: "Search", placeholder: "Search docs", value: "initial", autocomplete: "off", inputMode: "search", pattern: "[A-Za-z ]+", min: "1", max: "99", step: "1", minLength: 2, maxLength: 80, required: true, checked: true, disabled: true, readonly: true, invalid: "spelling", selector: "input[name=\"q\"]", options: ["All", "Docs"], selectedOption: "Docs", selectedValue: "docs" }],
    };
    const secondFormChoice: AgentFormChoice = {
      id: "f2",
      path: "pageCheck.forms[1]",
      rank: 2,
      method: "post",
      fieldCount: 1,
      hiddenFieldCount: 0,
      text: "POST https://example.test/advanced; query field: term",
      actionUrl: "https://example.test/advanced?scope=docs",
      actionUrlPath: "/advanced",
      actionUrlQuery: "?scope=docs",
      submitText: "Advanced",
      submitType: "submit",
      submitName: "advanced",
      submitValue: "1",
      submitDisabled: false,
      submitSelector: "button[name=\"advanced\"]",
      queryField: "term",
      urlTemplate: "https://example.test/advanced?scope=docs&term={query}",
      urlTemplatePath: "/advanced",
      urlTemplateQuery: "?scope=docs&term={query}",
      command: "ax-grep 'https://example.test/advanced?scope=docs&term=docs' --find docs --agent",
      commandArgs: ["ax-grep", "https://example.test/advanced?scope=docs&term=docs", "--find", "docs", "--agent"],
      selector: "form:nth-of-type(2)",
      hiddenFields: [],
      fields: [{ name: "term", type: "search", label: "Advanced search", placeholder: "Advanced docs", required: true, invalid: "spelling", selector: "input[name=\"term\"]" }],
    };
    const actionTargetChoice: AgentActionTargetChoice = {
      id: "at1",
      path: "pageCheck.actionTargets[0]",
      rank: 1,
      kind: "search",
      name: "Search docs",
      text: "search: Search docs template=https://example.test/search?q={query}",
      source: "json-ld",
      targetUrl: "https://example.test/search",
      targetUrlPath: "/search",
      urlTemplate: "https://example.test/search?q={query}",
      urlTemplatePath: "/search",
      urlTemplateQuery: "?q={query}",
      queryInput: "required name=query",
      method: "GET",
      encodingType: "application/x-www-form-urlencoded",
      command: "ax-grep 'https://example.test/search?q=docs' --find docs --agent",
      commandArgs: ["ax-grep", "https://example.test/search?q=docs", "--find", "docs", "--agent"],
      disabled: true,
      pressed: false,
      expanded: true,
      haspopup: "dialog",
      controls: "search-dialog",
      selector: "script[type=\"application/ld+json\"]",
    };
    const secondActionTargetChoice: AgentActionTargetChoice = {
      id: "at2",
      path: "pageCheck.actionTargets[1]",
      rank: 2,
      kind: "search",
      name: "Docs OpenSearch",
      text: "search: Docs OpenSearch target=https://example.test/opensearch.xml type=application/opensearchdescription+xml source=link",
      source: "link",
      targetUrl: "https://example.test/opensearch.xml?profile=docs",
      targetUrlPath: "/opensearch.xml",
      targetUrlQuery: "?profile=docs",
      urlTemplate: "https://example.test/opensearch?q={query}",
      urlTemplatePath: "/opensearch",
      urlTemplateQuery: "?q={query}",
      queryInput: "required name=query",
      method: "GET",
      encodingType: "application/opensearchdescription+xml",
      command: "ax-grep 'https://example.test/opensearch?q=docs' --find docs --agent",
      commandArgs: ["ax-grep", "https://example.test/opensearch?q=docs", "--find", "docs", "--agent"],
      disabled: false,
      pressed: "mixed",
      expanded: false,
      haspopup: "dialog",
      controls: "docs-search-panel",
      selector: "link[rel=\"search\"]",
    };
    const summary: Pick<
      AgentSummary,
      | "resultCount"
      | "resultChoiceCount"
      | "resultChoices"
      | "topResultChoicePath"
      | "topResultChoiceTitle"
      | "topResultChoiceUrl"
      | "topResultChoiceHost"
      | "topResultChoiceUrlPath"
      | "topResultChoiceUrlQuery"
      | "topResultChoiceSnippet"
      | "topResultChoiceCommand"
      | "topResultChoiceCommandArgs"
      | "topResultChoiceRank"
      | "topResultChoiceOpenResult"
      | "topResultChoiceRecommended"
      | "topResultChoicePrimary"
      | "topResultChoiceSourceType"
      | "topResultChoiceSourceScore"
      | "topResultChoiceSourceHints"
      | "topResultChoiceDateText"
      | "topResultChoiceDateIso"
      | "topResultChoiceDateUnixMs"
      | "topResultChoiceDatePrecision"
      | "topResultChoiceDateSource"
      | "topResultChoiceRelevance"
      | "topResultChoiceMatchedTerm"
      | "topResultChoiceFindMatch"
      | "topResultChoiceLikelyOfficial"
      | "topResultChoiceSitelinkCount"
      | "topResultChoiceFirstSitelinkTitle"
      | "topResultChoiceFirstSitelinkUrl"
      | "topResultChoiceFirstSitelinkUrlPath"
      | "topResultChoiceFirstSitelinkUrlQuery"
      | "topResultChoiceFirstSitelinkSelector"
      | "topResultChoiceFirstSitelinkCommand"
      | "topResultChoiceFirstSitelinkCommandArgs"
      | "topResultChoiceReason"
      | "secondResultChoicePath"
      | "secondResultChoiceTitle"
      | "secondResultChoiceUrl"
      | "secondResultChoiceHost"
      | "secondResultChoiceUrlPath"
      | "secondResultChoiceUrlQuery"
      | "secondResultChoiceSnippet"
      | "secondResultChoiceCommand"
      | "secondResultChoiceCommandArgs"
      | "secondResultChoiceRank"
      | "secondResultChoiceOpenResult"
      | "secondResultChoiceRecommended"
      | "secondResultChoicePrimary"
      | "secondResultChoiceSourceType"
      | "secondResultChoiceSourceScore"
      | "secondResultChoiceSourceHints"
      | "secondResultChoiceDateText"
      | "secondResultChoiceDateIso"
      | "secondResultChoiceDateUnixMs"
      | "secondResultChoiceDatePrecision"
      | "secondResultChoiceDateSource"
      | "secondResultChoiceRelevance"
      | "secondResultChoiceMatchedTerm"
      | "secondResultChoiceFindMatch"
      | "secondResultChoiceLikelyOfficial"
      | "secondResultChoiceSitelinkCount"
      | "secondResultChoiceFirstSitelinkTitle"
      | "secondResultChoiceFirstSitelinkUrl"
      | "secondResultChoiceFirstSitelinkUrlPath"
      | "secondResultChoiceFirstSitelinkUrlQuery"
      | "secondResultChoiceFirstSitelinkSelector"
      | "secondResultChoiceFirstSitelinkCommand"
      | "secondResultChoiceFirstSitelinkCommandArgs"
      | "secondResultChoiceReason"
      | "evidenceCount"
      | "formCount"
      | "formChoiceCount"
      | "formChoices"
      | "topFormChoicePath"
      | "topFormChoiceMethod"
      | "topFormChoiceActionUrl"
      | "topFormChoiceActionUrlPath"
      | "topFormChoiceActionUrlQuery"
      | "topFormChoiceFormId"
      | "topFormChoiceFormName"
      | "topFormChoiceFormTarget"
      | "topFormChoiceFormEncType"
      | "topFormChoiceFormAcceptCharset"
      | "topFormChoiceFormNoValidate"
      | "topFormChoiceSubmitText"
      | "topFormChoiceSubmitType"
      | "topFormChoiceSubmitName"
      | "topFormChoiceSubmitValue"
      | "topFormChoiceSubmitDisabled"
      | "topFormChoiceSubmitSelector"
      | "topFormChoiceSubmitFormActionUrl"
      | "topFormChoiceSubmitFormActionUrlPath"
      | "topFormChoiceSubmitFormActionUrlQuery"
      | "topFormChoiceSubmitFormMethod"
      | "topFormChoiceSubmitFormTarget"
      | "topFormChoiceSubmitFormEncType"
      | "topFormChoiceSubmitFormNoValidate"
      | "topFormChoiceSubmitFormId"
      | "topFormChoiceQueryField"
      | "topFormChoiceUrlTemplate"
      | "topFormChoiceUrlTemplatePath"
      | "topFormChoiceUrlTemplateQuery"
      | "topFormChoiceCommand"
      | "topFormChoiceCommandArgs"
      | "topFormChoiceFieldCount"
      | "topFormChoiceHiddenFieldCount"
      | "topFormChoiceSelector"
      | "topFormChoiceFirstHiddenFieldName"
      | "topFormChoiceFirstHiddenFieldValue"
      | "topFormChoiceFirstHiddenFieldSelector"
      | "topFormChoiceFirstFieldName"
      | "topFormChoiceFirstFieldType"
      | "topFormChoiceFirstFieldLabel"
      | "topFormChoiceFirstFieldPlaceholder"
      | "topFormChoiceFirstFieldValue"
      | "topFormChoiceFirstFieldOptions"
      | "topFormChoiceFirstFieldSelectedOption"
      | "topFormChoiceFirstFieldSelectedValue"
      | "topFormChoiceFirstFieldAutocomplete"
      | "topFormChoiceFirstFieldInputMode"
      | "topFormChoiceFirstFieldPattern"
      | "topFormChoiceFirstFieldMin"
      | "topFormChoiceFirstFieldMax"
      | "topFormChoiceFirstFieldStep"
      | "topFormChoiceFirstFieldMinLength"
      | "topFormChoiceFirstFieldMaxLength"
      | "topFormChoiceFirstFieldRequired"
      | "topFormChoiceFirstFieldChecked"
      | "topFormChoiceFirstFieldDisabled"
      | "topFormChoiceFirstFieldReadonly"
      | "topFormChoiceFirstFieldInvalid"
      | "topFormChoiceFirstFieldSelector"
      | "topFormChoiceRequiredFieldName"
      | "topFormChoiceRequiredFieldType"
      | "topFormChoiceRequiredFieldLabel"
      | "topFormChoiceRequiredFieldPlaceholder"
      | "topFormChoiceRequiredFieldValue"
      | "topFormChoiceRequiredFieldOptions"
      | "topFormChoiceRequiredFieldSelectedOption"
      | "topFormChoiceRequiredFieldSelectedValue"
      | "topFormChoiceRequiredFieldAutocomplete"
      | "topFormChoiceRequiredFieldInputMode"
      | "topFormChoiceRequiredFieldPattern"
      | "topFormChoiceRequiredFieldMin"
      | "topFormChoiceRequiredFieldMax"
      | "topFormChoiceRequiredFieldStep"
      | "topFormChoiceRequiredFieldMinLength"
      | "topFormChoiceRequiredFieldMaxLength"
      | "topFormChoiceRequiredFieldRequired"
      | "topFormChoiceRequiredFieldChecked"
      | "topFormChoiceRequiredFieldDisabled"
      | "topFormChoiceRequiredFieldReadonly"
      | "topFormChoiceRequiredFieldInvalid"
      | "topFormChoiceRequiredFieldSelector"
      | "topFormChoiceInvalidFieldName"
      | "topFormChoiceInvalidFieldType"
      | "topFormChoiceInvalidFieldLabel"
      | "topFormChoiceInvalidFieldInvalid"
      | "topFormChoiceInvalidFieldSelector"
      | "secondFormChoicePath"
      | "secondFormChoiceMethod"
      | "secondFormChoiceActionUrl"
      | "secondFormChoiceActionUrlPath"
      | "secondFormChoiceActionUrlQuery"
      | "secondFormChoiceUrlTemplate"
      | "secondFormChoiceUrlTemplatePath"
      | "secondFormChoiceUrlTemplateQuery"
      | "secondFormChoiceQueryField"
      | "secondFormChoiceCommand"
      | "secondFormChoiceCommandArgs"
      | "secondFormChoiceFieldCount"
      | "secondFormChoiceHiddenFieldCount"
      | "secondFormChoiceSelector"
      | "secondFormChoiceSubmitText"
      | "secondFormChoiceSubmitType"
      | "secondFormChoiceSubmitName"
      | "secondFormChoiceSubmitValue"
      | "secondFormChoiceSubmitDisabled"
      | "secondFormChoiceSubmitSelector"
      | "secondFormChoiceFirstFieldName"
      | "secondFormChoiceFirstFieldType"
      | "secondFormChoiceFirstFieldLabel"
      | "secondFormChoiceFirstFieldPlaceholder"
      | "secondFormChoiceFirstFieldRequired"
      | "secondFormChoiceFirstFieldInvalid"
      | "secondFormChoiceFirstFieldSelector"
      | "actionTargetCount"
      | "actionTargetChoiceCount"
      | "actionTargetChoices"
      | "topActionTargetChoicePath"
      | "topActionTargetChoiceKind"
      | "topActionTargetChoiceName"
      | "topActionTargetChoiceSource"
      | "topActionTargetChoiceTargetUrl"
      | "topActionTargetChoiceTargetUrlPath"
      | "topActionTargetChoiceTargetUrlQuery"
      | "topActionTargetChoiceUrlTemplate"
      | "topActionTargetChoiceUrlTemplatePath"
      | "topActionTargetChoiceUrlTemplateQuery"
      | "topActionTargetChoiceQueryInput"
      | "topActionTargetChoiceMethod"
      | "topActionTargetChoiceEncodingType"
      | "topActionTargetChoiceCommand"
      | "topActionTargetChoiceCommandArgs"
      | "topActionTargetChoiceDisabled"
      | "topActionTargetChoicePressed"
      | "topActionTargetChoiceExpanded"
      | "topActionTargetChoiceHaspopup"
      | "topActionTargetChoiceControls"
      | "topActionTargetChoiceSelector"
      | "secondActionTargetChoicePath"
      | "secondActionTargetChoiceKind"
      | "secondActionTargetChoiceName"
      | "secondActionTargetChoiceSource"
      | "secondActionTargetChoiceTargetUrl"
      | "secondActionTargetChoiceTargetUrlPath"
      | "secondActionTargetChoiceTargetUrlQuery"
      | "secondActionTargetChoiceUrlTemplate"
      | "secondActionTargetChoiceUrlTemplatePath"
      | "secondActionTargetChoiceUrlTemplateQuery"
      | "secondActionTargetChoiceQueryInput"
      | "secondActionTargetChoiceMethod"
      | "secondActionTargetChoiceEncodingType"
      | "secondActionTargetChoiceCommand"
      | "secondActionTargetChoiceCommandArgs"
      | "secondActionTargetChoiceDisabled"
      | "secondActionTargetChoicePressed"
      | "secondActionTargetChoiceExpanded"
      | "secondActionTargetChoiceHaspopup"
      | "secondActionTargetChoiceControls"
      | "secondActionTargetChoiceSelector"
      | "barrierCount"
      | "topBarrierKind"
      | "topBarrierSeverity"
      | "topBarrierSource"
      | "topBarrierPath"
      | "topBarrierText"
      | "topBarrierSelector"
      | "topBarrierDiagnosticCode"
      | "secondBarrierKind"
      | "secondBarrierSeverity"
      | "secondBarrierSource"
      | "secondBarrierPath"
      | "secondBarrierText"
      | "secondBarrierSelector"
      | "secondBarrierDiagnosticCode"
      | "dataTableCount"
      | "faqCount"
      | "codeBlockCount"
      | "resourceCount"
      | "mediaCount"
      | "sectionCount"
      | "breadcrumbCount"
      | "paginationCount"
      | "tocCount"
      | "embedCount"
      | "transcriptCount"
      | "authorLinkCount"
      | "provenanceCount"
      | "offerCount"
      | "datasetCount"
      | "identityCount"
      | "timelineCount"
      | "contactPointCount"
      | "topDataTablePath"
      | "topDataTableCaption"
      | "topDataTableRowCount"
      | "topDataTableColumnCount"
      | "topDataTableHeaderCount"
      | "topDataTableHeaders"
      | "topDataTableFirstHeader"
      | "topDataTableFirstRow"
      | "topDataTableFirstCell"
      | "topDataTableSecondRow"
      | "topDataTableSecondCell"
      | "topDataTableSelector"
      | "secondDataTablePath"
      | "secondDataTableCaption"
      | "secondDataTableRowCount"
      | "secondDataTableColumnCount"
      | "secondDataTableHeaderCount"
      | "secondDataTableHeaders"
      | "secondDataTableFirstHeader"
      | "secondDataTableFirstRow"
      | "secondDataTableFirstCell"
      | "secondDataTableSecondRow"
      | "secondDataTableSecondCell"
      | "secondDataTableSelector"
      | "topFaqPath"
      | "topFaqQuestion"
      | "topFaqAnswer"
      | "topFaqSelector"
      | "secondFaqPath"
      | "secondFaqQuestion"
      | "secondFaqAnswer"
      | "secondFaqSelector"
      | "topCodeBlockPath"
      | "topCodeBlockLanguage"
      | "topCodeBlockLineCount"
      | "topCodeBlockText"
      | "topCodeBlockSelector"
      | "secondCodeBlockPath"
      | "secondCodeBlockLanguage"
      | "secondCodeBlockLineCount"
      | "secondCodeBlockText"
      | "secondCodeBlockSelector"
      | "topResourcePath"
      | "topResourceKind"
      | "topResourceUrl"
      | "topResourceUrlPath"
      | "topResourceUrlQuery"
      | "topResourceTitle"
      | "topResourceRel"
      | "topResourceType"
      | "topResourceHreflang"
      | "topResourceSelector"
      | "topResourceCommand"
      | "topResourceCommandArgs"
      | "secondResourcePath"
      | "secondResourceKind"
      | "secondResourceUrl"
      | "secondResourceUrlPath"
      | "secondResourceUrlQuery"
      | "secondResourceTitle"
      | "secondResourceRel"
      | "secondResourceType"
      | "secondResourceHreflang"
      | "secondResourceSelector"
      | "secondResourceCommand"
      | "secondResourceCommandArgs"
      | "topMediaPath"
      | "topMediaKind"
      | "topMediaUrl"
      | "topMediaUrlPath"
      | "topMediaUrlQuery"
      | "topMediaSelector"
      | "topMediaCommand"
      | "topMediaCommandArgs"
      | "topMediaText"
      | "topMediaAlt"
      | "topMediaCaption"
      | "topMediaTitle"
      | "topMediaWidth"
      | "topMediaHeight"
      | "secondMediaPath"
      | "secondMediaKind"
      | "secondMediaUrl"
      | "secondMediaUrlPath"
      | "secondMediaUrlQuery"
      | "secondMediaSelector"
      | "secondMediaCommand"
      | "secondMediaCommandArgs"
      | "secondMediaText"
      | "secondMediaAlt"
      | "secondMediaCaption"
      | "secondMediaTitle"
      | "secondMediaWidth"
      | "secondMediaHeight"
      | "topSectionPath"
      | "topSectionHeading"
      | "topSectionLevel"
      | "topSectionText"
      | "topSectionSelector"
      | "secondSectionPath"
      | "secondSectionHeading"
      | "secondSectionLevel"
      | "secondSectionText"
      | "secondSectionSelector"
      | "topBreadcrumbPath"
      | "topBreadcrumbText"
      | "topBreadcrumbSource"
      | "topBreadcrumbSelector"
      | "secondBreadcrumbPath"
      | "secondBreadcrumbText"
      | "secondBreadcrumbSource"
      | "secondBreadcrumbSelector"
      | "topPaginationPath"
      | "topPaginationKind"
      | "topPaginationLabel"
      | "topPaginationUrl"
      | "topPaginationUrlPath"
      | "topPaginationUrlQuery"
      | "topPaginationCommand"
      | "topPaginationCommandArgs"
      | "topPaginationCurrent"
      | "topPaginationSelector"
      | "secondPaginationPath"
      | "secondPaginationKind"
      | "secondPaginationLabel"
      | "secondPaginationUrl"
      | "secondPaginationUrlPath"
      | "secondPaginationUrlQuery"
      | "secondPaginationCommand"
      | "secondPaginationCommandArgs"
      | "secondPaginationCurrent"
      | "secondPaginationSelector"
      | "topTocPath"
      | "topTocTitle"
      | "topTocItemCount"
      | "topTocText"
      | "topTocFirstItemLabel"
      | "topTocFirstItemUrl"
      | "topTocFirstItemUrlPath"
      | "topTocFirstItemUrlQuery"
      | "topTocFirstItemCommand"
      | "topTocFirstItemCommandArgs"
      | "topTocSelector"
      | "secondTocPath"
      | "secondTocTitle"
      | "secondTocItemCount"
      | "secondTocText"
      | "secondTocFirstItemLabel"
      | "secondTocFirstItemUrl"
      | "secondTocFirstItemUrlPath"
      | "secondTocFirstItemUrlQuery"
      | "secondTocFirstItemCommand"
      | "secondTocFirstItemCommandArgs"
      | "secondTocSelector"
      | "topEmbedPath"
      | "topEmbedKind"
      | "topEmbedUrl"
      | "topEmbedUrlPath"
      | "topEmbedUrlQuery"
      | "topEmbedTitle"
      | "topEmbedSelector"
      | "topEmbedCommand"
      | "topEmbedCommandArgs"
      | "secondEmbedPath"
      | "secondEmbedKind"
      | "secondEmbedUrl"
      | "secondEmbedUrlPath"
      | "secondEmbedUrlQuery"
      | "secondEmbedTitle"
      | "secondEmbedSelector"
      | "secondEmbedCommand"
      | "secondEmbedCommandArgs"
      | "topTranscriptPath"
      | "topTranscriptKind"
      | "topTranscriptUrl"
      | "topTranscriptUrlPath"
      | "topTranscriptUrlQuery"
      | "topTranscriptLabel"
      | "topTranscriptLanguage"
      | "topTranscriptSelector"
      | "topTranscriptCommand"
      | "topTranscriptCommandArgs"
      | "secondTranscriptPath"
      | "secondTranscriptKind"
      | "secondTranscriptUrl"
      | "secondTranscriptUrlPath"
      | "secondTranscriptUrlQuery"
      | "secondTranscriptLabel"
      | "secondTranscriptLanguage"
      | "secondTranscriptSelector"
      | "secondTranscriptCommand"
      | "secondTranscriptCommandArgs"
      | "topAuthorLinkPath"
      | "topAuthorLinkName"
      | "topAuthorLinkUrl"
      | "topAuthorLinkUrlPath"
      | "topAuthorLinkUrlQuery"
      | "topAuthorLinkSource"
      | "topAuthorLinkSelector"
      | "topAuthorLinkCommand"
      | "topAuthorLinkCommandArgs"
      | "secondAuthorLinkPath"
      | "secondAuthorLinkName"
      | "secondAuthorLinkUrl"
      | "secondAuthorLinkUrlPath"
      | "secondAuthorLinkUrlQuery"
      | "secondAuthorLinkSource"
      | "secondAuthorLinkSelector"
      | "secondAuthorLinkCommand"
      | "secondAuthorLinkCommandArgs"
      | "topProvenancePath"
      | "topProvenanceKind"
      | "topProvenanceLabel"
      | "topProvenanceValue"
      | "topProvenanceUrl"
      | "topProvenanceUrlPath"
      | "topProvenanceUrlQuery"
      | "topProvenanceSource"
      | "topProvenanceSelector"
      | "topProvenanceCommand"
      | "topProvenanceCommandArgs"
      | "secondProvenancePath"
      | "secondProvenanceKind"
      | "secondProvenanceLabel"
      | "secondProvenanceValue"
      | "secondProvenanceUrl"
      | "secondProvenanceUrlPath"
      | "secondProvenanceUrlQuery"
      | "secondProvenanceSource"
      | "secondProvenanceSelector"
      | "secondProvenanceCommand"
      | "secondProvenanceCommandArgs"
      | "topOfferPath"
      | "topOfferName"
      | "topOfferPrice"
      | "topOfferPriceAmount"
      | "topOfferCurrency"
      | "topOfferAvailability"
      | "topOfferUrl"
      | "topOfferUrlPath"
      | "topOfferUrlQuery"
      | "topOfferCommand"
      | "topOfferCommandArgs"
      | "topOfferSelector"
      | "secondOfferPath"
      | "secondOfferName"
      | "secondOfferPrice"
      | "secondOfferPriceAmount"
      | "secondOfferCurrency"
      | "secondOfferAvailability"
      | "secondOfferUrl"
      | "secondOfferUrlPath"
      | "secondOfferUrlQuery"
      | "secondOfferCommand"
      | "secondOfferCommandArgs"
      | "secondOfferSelector"
      | "topDatasetPath"
      | "topDatasetKind"
      | "topDatasetName"
      | "topDatasetUrl"
      | "topDatasetUrlPath"
      | "topDatasetUrlQuery"
      | "topDatasetCommand"
      | "topDatasetCommandArgs"
      | "topDatasetDistributionUrl"
      | "topDatasetDistributionUrlPath"
      | "topDatasetDistributionUrlQuery"
      | "topDatasetDistributionCommand"
      | "topDatasetDistributionCommandArgs"
      | "topDatasetLicenseUrl"
      | "topDatasetLicenseUrlPath"
      | "topDatasetLicenseUrlQuery"
      | "topDatasetLicenseCommand"
      | "topDatasetLicenseCommandArgs"
      | "topDatasetEncodingFormat"
      | "topDatasetTemporalCoverage"
      | "topDatasetSpatialCoverage"
      | "topDatasetCreator"
      | "topDatasetSelector"
      | "secondDatasetPath"
      | "secondDatasetKind"
      | "secondDatasetName"
      | "secondDatasetUrl"
      | "secondDatasetUrlPath"
      | "secondDatasetUrlQuery"
      | "secondDatasetCommand"
      | "secondDatasetCommandArgs"
      | "secondDatasetDistributionUrl"
      | "secondDatasetDistributionUrlPath"
      | "secondDatasetDistributionUrlQuery"
      | "secondDatasetDistributionCommand"
      | "secondDatasetDistributionCommandArgs"
      | "secondDatasetLicenseUrl"
      | "secondDatasetLicenseUrlPath"
      | "secondDatasetLicenseUrlQuery"
      | "secondDatasetLicenseCommand"
      | "secondDatasetLicenseCommandArgs"
      | "secondDatasetEncodingFormat"
      | "secondDatasetTemporalCoverage"
      | "secondDatasetSpatialCoverage"
      | "secondDatasetCreator"
      | "secondDatasetSelector"
      | "topIdentityPath"
      | "topIdentityKind"
      | "topIdentityName"
      | "topIdentityUrl"
      | "topIdentityUrlPath"
      | "topIdentityUrlQuery"
      | "topIdentityCommand"
      | "topIdentityCommandArgs"
      | "topIdentityLogoUrl"
      | "topIdentityLogoUrlPath"
      | "topIdentityLogoUrlQuery"
      | "topIdentityLogoCommand"
      | "topIdentityLogoCommandArgs"
      | "topIdentitySameAsUrl"
      | "topIdentitySameAsUrlPath"
      | "topIdentitySameAsUrlQuery"
      | "topIdentitySameAsCommand"
      | "topIdentitySameAsCommandArgs"
      | "topIdentitySource"
      | "topIdentitySelector"
      | "secondIdentityPath"
      | "secondIdentityKind"
      | "secondIdentityName"
      | "secondIdentityUrl"
      | "secondIdentityUrlPath"
      | "secondIdentityUrlQuery"
      | "secondIdentityCommand"
      | "secondIdentityCommandArgs"
      | "secondIdentityLogoUrl"
      | "secondIdentityLogoUrlPath"
      | "secondIdentityLogoUrlQuery"
      | "secondIdentityLogoCommand"
      | "secondIdentityLogoCommandArgs"
      | "secondIdentitySameAsUrl"
      | "secondIdentitySameAsUrlPath"
      | "secondIdentitySameAsUrlQuery"
      | "secondIdentitySameAsCommand"
      | "secondIdentitySameAsCommandArgs"
      | "secondIdentitySource"
      | "secondIdentitySelector"
      | "topTimelinePath"
      | "topTimelineKind"
      | "topTimelineLabel"
      | "topTimelineValue"
      | "topTimelineIsoDate"
      | "topTimelineUnixMs"
      | "topTimelineSource"
      | "topTimelineSelector"
      | "secondTimelinePath"
      | "secondTimelineKind"
      | "secondTimelineLabel"
      | "secondTimelineValue"
      | "secondTimelineIsoDate"
      | "secondTimelineUnixMs"
      | "secondTimelineSource"
      | "secondTimelineSelector"
      | "topContactPointPath"
      | "topContactPointKind"
      | "topContactPointLabel"
      | "topContactPointValue"
      | "topContactPointUrl"
      | "topContactPointUrlPath"
      | "topContactPointUrlQuery"
      | "topContactPointCommand"
      | "topContactPointCommandArgs"
      | "topContactPointSource"
      | "topContactPointSelector"
      | "secondContactPointPath"
      | "secondContactPointKind"
      | "secondContactPointLabel"
      | "secondContactPointValue"
      | "secondContactPointUrl"
      | "secondContactPointUrlPath"
      | "secondContactPointUrlQuery"
      | "secondContactPointCommand"
      | "secondContactPointCommandArgs"
      | "secondContactPointSource"
      | "secondContactPointSelector"
      | "structuredReadTargetCount"
      | "bestStructuredReadTarget"
      | "bestStructuredReadTargetCount"
      | "bestStructuredReadTargetScore"
      | "bestStructuredReadTargetPrimary"
      | "bestStructuredReadTargetReason"
      | "hiddenSignalCount"
      | "hiddenHydrationCount"
      | "hiddenApiEndpointCount"
      | "hiddenClientStateCount"
      | "hiddenRuntimeCount"
      | "hiddenConfigCount"
      | "hiddenAppHintCount"
      | "hiddenMobileHintCount"
      | "hiddenTopicCount"
      | "hiddenKeyValueCount"
      | "hiddenMetaFactCount"
      | "hiddenHttpPolicyCount"
      | "hiddenSchemaFactCount"
      | "topHydrationPath"
      | "topHydrationKind"
      | "topHydrationLabel"
      | "topHydrationUrl"
      | "topHydrationUrlPath"
      | "topHydrationUrlQuery"
      | "topHydrationCommand"
      | "topHydrationCommandArgs"
      | "topHydrationSelector"
      | "secondHydrationPath"
      | "secondHydrationKind"
      | "secondHydrationLabel"
      | "secondHydrationUrl"
      | "secondHydrationUrlPath"
      | "secondHydrationUrlQuery"
      | "secondHydrationCommand"
      | "secondHydrationCommandArgs"
      | "secondHydrationSelector"
      | "topApiEndpointPath"
      | "topApiEndpointKind"
      | "topApiEndpointMethod"
      | "topApiEndpointUrl"
      | "topApiEndpointUrlPath"
      | "topApiEndpointUrlQuery"
      | "topApiEndpointCommand"
      | "topApiEndpointCommandArgs"
      | "topApiEndpointSelector"
      | "secondApiEndpointPath"
      | "secondApiEndpointKind"
      | "secondApiEndpointMethod"
      | "secondApiEndpointUrl"
      | "secondApiEndpointUrlPath"
      | "secondApiEndpointUrlQuery"
      | "secondApiEndpointCommand"
      | "secondApiEndpointCommandArgs"
      | "secondApiEndpointSelector"
      | "topClientStatePath"
      | "topClientStateKind"
      | "topClientStateOperation"
      | "topClientStateKey"
      | "topClientStateSelector"
      | "secondClientStatePath"
      | "secondClientStateKind"
      | "secondClientStateOperation"
      | "secondClientStateKey"
      | "secondClientStateSelector"
      | "topRuntimePath"
      | "topRuntimeKind"
      | "topRuntimeUrl"
      | "topRuntimeUrlPath"
      | "topRuntimeUrlQuery"
      | "topRuntimeCommand"
      | "topRuntimeCommandArgs"
      | "topRuntimeSelector"
      | "secondRuntimePath"
      | "secondRuntimeKind"
      | "secondRuntimeUrl"
      | "secondRuntimeUrlPath"
      | "secondRuntimeUrlQuery"
      | "secondRuntimeCommand"
      | "secondRuntimeCommandArgs"
      | "secondRuntimeSelector"
      | "topConfigPath"
      | "topConfigKind"
      | "topConfigName"
      | "topConfigKeys"
      | "topConfigKeyCount"
      | "topConfigSelector"
      | "secondConfigPath"
      | "secondConfigKind"
      | "secondConfigName"
      | "secondConfigKeys"
      | "secondConfigKeyCount"
      | "secondConfigSelector"
      | "topAppHintPath"
      | "topAppHintKind"
      | "topAppHintLabel"
      | "topAppHintUrl"
      | "topAppHintUrlPath"
      | "topAppHintUrlQuery"
      | "topAppHintCommand"
      | "topAppHintCommandArgs"
      | "topAppHintSelector"
      | "topMobileHintPath"
      | "topMobileHintKind"
      | "topMobileHintLabel"
      | "topMobileHintValue"
      | "topMobileHintPlatform"
      | "topMobileHintUrl"
      | "topMobileHintUrlPath"
      | "topMobileHintUrlQuery"
      | "topMobileHintSelector"
      | "topTopicPath"
      | "topTopicKind"
      | "topTopicLabel"
      | "topTopicValue"
      | "topTopicSource"
      | "topTopicSelector"
      | "topKeyValuePath"
      | "topKeyValueLabel"
      | "topKeyValueValue"
      | "topKeyValueDatetime"
      | "topKeyValueSource"
      | "topKeyValueSelector"
      | "topMetaFactPath"
      | "topMetaFactLabel"
      | "topMetaFactValue"
      | "topMetaFactUrl"
      | "topMetaFactSource"
      | "topMetaFactSelector"
      | "topHttpPolicyPath"
      | "topHttpPolicyName"
      | "topHttpPolicyValue"
      | "topHttpPolicySource"
      | "topHttpPolicySelector"
      | "topSchemaFactPath"
      | "topSchemaFactTypes"
      | "topSchemaFactFirstLabel"
      | "topSchemaFactFirstValue"
      | "topSchemaFactFactCount"
      | "topSchemaFactSelector"
      | "hiddenReadTargetCount"
      | "topHiddenSignalGroup"
      | "topHiddenSignalPath"
      | "topHiddenSignalKind"
      | "topHiddenSignalText"
      | "topHiddenSignalUrl"
      | "topHiddenSignalUrlPath"
      | "topHiddenSignalUrlQuery"
      | "topHiddenSignalSource"
      | "topHiddenSignalSelector"
      | "bestHiddenReadTarget"
      | "bestHiddenReadTargetCount"
      | "bestHiddenReadTargetScore"
      | "bestHiddenReadTargetPrimary"
      | "bestHiddenReadTargetReason"
      | "sourceLinkCount"
      | "sourceChoiceCount"
      | "topSourceChoicePath"
      | "topSourceChoiceTitle"
      | "topSourceChoiceUrl"
      | "topSourceChoiceHost"
      | "topSourceChoiceUrlPath"
      | "topSourceChoiceUrlQuery"
      | "topSourceChoiceKind"
      | "topSourceChoiceRank"
      | "topSourceChoiceText"
      | "topSourceChoiceSnippet"
      | "topSourceChoiceDateText"
      | "topSourceChoiceDateIso"
      | "topSourceChoiceDateUnixMs"
      | "topSourceChoiceDatePrecision"
      | "topSourceChoiceDateSource"
      | "topSourceChoiceCommand"
      | "topSourceChoiceCommandArgs"
      | "topSourceChoiceSourceType"
      | "topSourceChoiceSourceScore"
      | "topSourceChoiceSourceHints"
      | "topSourceChoiceRelevance"
      | "topSourceChoiceMatchedTerm"
      | "topSourceChoiceFindMatch"
      | "topSourceChoiceLikelyOfficial"
      | "topSourceChoicePrimary"
      | "topSourceChoiceSelector"
      | "topSourceChoiceReason"
      | "secondSourceChoicePath"
      | "secondSourceChoiceTitle"
      | "secondSourceChoiceUrl"
      | "secondSourceChoiceHost"
      | "secondSourceChoiceUrlPath"
      | "secondSourceChoiceUrlQuery"
      | "secondSourceChoiceKind"
      | "secondSourceChoiceRank"
      | "secondSourceChoiceText"
      | "secondSourceChoiceSnippet"
      | "secondSourceChoiceDateText"
      | "secondSourceChoiceDateIso"
      | "secondSourceChoiceDateUnixMs"
      | "secondSourceChoiceDatePrecision"
      | "secondSourceChoiceDateSource"
      | "secondSourceChoiceCommand"
      | "secondSourceChoiceCommandArgs"
      | "secondSourceChoiceSourceType"
      | "secondSourceChoiceSourceScore"
      | "secondSourceChoiceSourceHints"
      | "secondSourceChoiceRelevance"
      | "secondSourceChoiceMatchedTerm"
      | "secondSourceChoiceFindMatch"
      | "secondSourceChoiceLikelyOfficial"
      | "secondSourceChoicePrimary"
      | "secondSourceChoiceSelector"
      | "secondSourceChoiceReason"
      | "topChoiceKind"
      | "topChoicePath"
      | "topChoiceLabel"
      | "topChoiceUrl"
      | "topChoiceUrlPath"
      | "topChoiceUrlQuery"
      | "topChoiceActionUrl"
      | "topChoiceTargetUrl"
      | "topChoiceUrlTemplate"
      | "topChoiceQueryField"
      | "topChoiceQueryInput"
      | "topChoiceRequiredFieldName"
      | "topChoiceRequiredFieldSelector"
      | "topChoiceInvalidFieldName"
      | "topChoiceInvalidFieldInvalid"
      | "topChoiceInvalidFieldSelector"
      | "topChoiceHost"
      | "topChoiceSnippet"
      | "topChoiceDateText"
      | "topChoiceDateIso"
      | "topChoiceDateUnixMs"
      | "topChoiceDatePrecision"
      | "topChoiceDateSource"
      | "topChoiceCommand"
      | "topChoiceCommandArgs"
      | "topChoiceFirstSitelinkTitle"
      | "topChoiceFirstSitelinkUrl"
      | "topChoiceFirstSitelinkUrlPath"
      | "topChoiceFirstSitelinkUrlQuery"
      | "topChoiceFirstSitelinkSelector"
      | "topChoiceFirstSitelinkCommand"
      | "topChoiceFirstSitelinkCommandArgs"
      | "topChoiceRank"
      | "topChoiceOpenResult"
      | "topChoiceRecommended"
      | "topChoicePrimary"
      | "topChoiceSource"
      | "topChoiceSourceType"
      | "topChoiceSourceScore"
      | "topChoiceSourceHints"
      | "topChoiceRelevance"
      | "topChoiceMatchedTerm"
      | "topChoiceFindMatch"
      | "topChoiceSitelinkCount"
      | "topChoiceLikelyOfficial"
      | "topChoiceMethod"
      | "topChoiceEncodingType"
      | "topChoiceSubmitDisabled"
      | "topChoiceDisabled"
      | "topChoicePressed"
      | "topChoiceExpanded"
      | "topChoiceHaspopup"
      | "topChoiceControls"
      | "topChoiceSelector"
      | "topChoiceReason"
      | "sourceSearchQuery"
      | "sourceSearchEngine"
      | "sourceSearchSelectedEngine"
      | "sourceSearchEngineAttemptCount"
      | "sourceSearchEngineSuccessCount"
      | "sourceSearchEngineFailureCount"
      | "sourceSearchFirstOkEngine"
      | "sourceSearchFirstOkResultCount"
      | "sourceSearchFirstFailedEngine"
      | "sourceSearchFirstFailureCode"
      | "sourceSearchFirstFailureStatus"
      | "sourceSearchSearchUrl"
      | "sourceSearchLang"
      | "sourceSearchRegion"
      | "sourceSearchFindQueryCount"
      | "sourceSearchTopFindQuery"
      | "sourceSearchSelectedRank"
      | "sourceSearchSelectedTitle"
      | "sourceSearchSelectedUrl"
      | "sourceSearchSelectedUrlPath"
      | "sourceSearchSelectedUrlQuery"
      | "sourceSearchSelectedHost"
      | "sourceSearchSelectedSource"
      | "sourceSearchSelectedSourceType"
      | "sourceSearchSelectedSourceHints"
      | "sourceSearchSelectedPath"
      | "sourceSearchSelectedSnippet"
      | "sourceSearchSelectedDateText"
      | "sourceSearchSelectedDateIso"
      | "sourceSearchSelectedDateUnixMs"
      | "sourceSearchSelectedDatePrecision"
      | "sourceSearchSelectedDateSource"
      | "sourceSearchSelectedMatchedTerm"
      | "sourceSearchSelectedFindMatch"
      | "sourceSearchSelectedSitelinkCount"
      | "sourceSearchSelectedFirstSitelinkTitle"
      | "sourceSearchSelectedFirstSitelinkUrl"
      | "sourceSearchSelectedFirstSitelinkUrlPath"
      | "sourceSearchSelectedFirstSitelinkUrlQuery"
      | "sourceSearchSelectedFirstSitelinkSelector"
      | "sourceSearchSelectedFirstSitelinkCommand"
      | "sourceSearchSelectedFirstSitelinkCommandArgs"
      | "sourceSearchSelectedOpenResult"
      | "sourceSearchSelectedCommand"
      | "sourceSearchSelectedCommandArgs"
      | "sourceSearchSelectedSourceScore"
      | "sourceSearchSelectedRelevance"
      | "sourceSearchSelectedLikelyOfficial"
      | "sourceSearchSelectedReason"
      | "sourceSearchFailureCode"
      | "sourceSearchFailureStatus"
      | "sourceSearchFailureKind"
      | "sourceSearchFailureRetryable"
      | "sourceSearchFailureRetryAfter"
      | "sourceSearchFailurePath"
      | "sourceSearchFailureUrl"
      | "sourceSearchFailureUrlPath"
      | "sourceSearchFailureUrlQuery"
      | "sourceSearchFailureHost"
      | "sourceSearchFailureReason"
      | "sourceSearchFailureCommand"
      | "sourceSearchFailureCommandArgs"
      | "sourceSearchAlternateCount"
      | "sourceSearchAlternatePath"
      | "sourceSearchAlternateTitle"
      | "sourceSearchAlternateUrl"
      | "sourceSearchAlternateUrlPath"
      | "sourceSearchAlternateUrlQuery"
      | "sourceSearchAlternateHost"
      | "sourceSearchAlternateSource"
      | "sourceSearchAlternateSourceType"
      | "sourceSearchAlternateSourceHints"
      | "sourceSearchAlternateRank"
      | "sourceSearchAlternateSnippet"
      | "sourceSearchAlternateDateText"
      | "sourceSearchAlternateDateIso"
      | "sourceSearchAlternateDateUnixMs"
      | "sourceSearchAlternateDatePrecision"
      | "sourceSearchAlternateDateSource"
      | "sourceSearchAlternateMatchedTerm"
      | "sourceSearchAlternateFindMatch"
      | "sourceSearchAlternateSitelinkCount"
      | "sourceSearchAlternateFirstSitelinkTitle"
      | "sourceSearchAlternateFirstSitelinkUrl"
      | "sourceSearchAlternateFirstSitelinkUrlPath"
      | "sourceSearchAlternateFirstSitelinkUrlQuery"
      | "sourceSearchAlternateFirstSitelinkSelector"
      | "sourceSearchAlternateFirstSitelinkCommand"
      | "sourceSearchAlternateFirstSitelinkCommandArgs"
      | "sourceSearchAlternateOpenResult"
      | "sourceSearchAlternateCommand"
      | "sourceSearchAlternateCommandArgs"
      | "sourceSearchAlternateSourceScore"
      | "sourceSearchAlternateRelevance"
      | "sourceSearchAlternateLikelyOfficial"
      | "sourceSearchAlternateDifferentHost"
      | "sourceSearchAlternateReason"
      | "sourceSearchSecondAlternatePath"
      | "sourceSearchSecondAlternateTitle"
      | "sourceSearchSecondAlternateUrl"
      | "sourceSearchSecondAlternateUrlPath"
      | "sourceSearchSecondAlternateUrlQuery"
      | "sourceSearchSecondAlternateHost"
      | "sourceSearchSecondAlternateSource"
      | "sourceSearchSecondAlternateSourceType"
      | "sourceSearchSecondAlternateSourceHints"
      | "sourceSearchSecondAlternateRank"
      | "sourceSearchSecondAlternateSnippet"
      | "sourceSearchSecondAlternateDateText"
      | "sourceSearchSecondAlternateDateIso"
      | "sourceSearchSecondAlternateDateUnixMs"
      | "sourceSearchSecondAlternateDatePrecision"
      | "sourceSearchSecondAlternateDateSource"
      | "sourceSearchSecondAlternateMatchedTerm"
      | "sourceSearchSecondAlternateFindMatch"
      | "sourceSearchSecondAlternateSitelinkCount"
      | "sourceSearchSecondAlternateFirstSitelinkTitle"
      | "sourceSearchSecondAlternateFirstSitelinkUrl"
      | "sourceSearchSecondAlternateFirstSitelinkUrlPath"
      | "sourceSearchSecondAlternateFirstSitelinkUrlQuery"
      | "sourceSearchSecondAlternateFirstSitelinkSelector"
      | "sourceSearchSecondAlternateFirstSitelinkCommand"
      | "sourceSearchSecondAlternateFirstSitelinkCommandArgs"
      | "sourceSearchSecondAlternateOpenResult"
      | "sourceSearchSecondAlternateCommand"
      | "sourceSearchSecondAlternateCommandArgs"
      | "sourceSearchSecondAlternateSourceScore"
      | "sourceSearchSecondAlternateRelevance"
      | "sourceSearchSecondAlternateLikelyOfficial"
      | "sourceSearchSecondAlternateDifferentHost"
      | "sourceSearchSecondAlternateReason"
      | "sourceSearchAlternateChoices"
      | "verificationFoundQueries"
      | "verificationMissingQueries"
      | "topVerificationFoundQuery"
      | "topVerificationMissingQuery"
      | "citationCount"
      | "topCitationId"
      | "topCitationPath"
      | "topCitationKind"
      | "topCitationText"
      | "topCitationTitle"
      | "topCitationUrl"
      | "topCitationUrlPath"
      | "topCitationUrlQuery"
      | "topCitationCommand"
      | "topCitationCommandArgs"
      | "topCitationConfidence"
      | "topCitationReason"
      | "topCitationScore"
      | "secondCitationId"
      | "secondCitationPath"
      | "secondCitationKind"
      | "secondCitationText"
      | "secondCitationTitle"
      | "secondCitationUrl"
      | "secondCitationUrlPath"
      | "secondCitationUrlQuery"
      | "secondCitationCommand"
      | "secondCitationCommandArgs"
      | "secondCitationConfidence"
      | "secondCitationReason"
      | "secondCitationScore"
      | "answerEvidenceCount"
      | "topAnswerEvidenceId"
      | "topAnswerEvidencePath"
      | "topAnswerEvidenceKind"
      | "topAnswerEvidenceText"
      | "topAnswerEvidenceTitle"
      | "topAnswerEvidenceUrl"
      | "topAnswerEvidenceUrlPath"
      | "topAnswerEvidenceUrlQuery"
      | "topAnswerEvidenceCommand"
      | "topAnswerEvidenceCommandArgs"
      | "topAnswerEvidenceConfidence"
      | "topAnswerEvidenceReason"
      | "topAnswerEvidenceScore"
      | "secondAnswerEvidenceId"
      | "secondAnswerEvidencePath"
      | "secondAnswerEvidenceKind"
      | "secondAnswerEvidenceText"
      | "secondAnswerEvidenceTitle"
      | "secondAnswerEvidenceUrl"
      | "secondAnswerEvidenceUrlPath"
      | "secondAnswerEvidenceUrlQuery"
      | "secondAnswerEvidenceCommand"
      | "secondAnswerEvidenceCommandArgs"
      | "secondAnswerEvidenceConfidence"
      | "secondAnswerEvidenceReason"
      | "secondAnswerEvidenceScore"
      | "searchDecision"
      | "searchDecisionName"
      | "searchDecisionConfidence"
      | "searchDecisionReason"
      | "searchDecisionResultCount"
      | "searchDecisionHighRelevanceCount"
      | "searchDecisionMediumRelevanceCount"
      | "searchDecisionLowRelevanceCount"
      | "searchDecisionOfficialCount"
      | "searchDecisionFindMatchCount"
      | "searchDecisionRecommendedRank"
      | "searchDecisionRecommendedPath"
      | "searchDecisionRecommendedTitle"
      | "searchDecisionRecommendedUrl"
      | "searchDecisionRecommendedUrlPath"
      | "searchDecisionRecommendedUrlQuery"
      | "searchDecisionRecommendedSource"
      | "searchDecisionRecommendedSourceScore"
      | "searchDecisionRecommendedSourceType"
      | "searchDecisionRecommendedSourceHints"
      | "searchDecisionRecommendedDateText"
      | "searchDecisionRecommendedDateIso"
      | "searchDecisionRecommendedDateUnixMs"
      | "searchDecisionRecommendedDatePrecision"
      | "searchDecisionRecommendedDateSource"
      | "searchDecisionRecommendedRelevance"
      | "searchDecisionRecommendedLikelyOfficial"
      | "searchDecisionFirstOfficialRank"
      | "searchDecisionFirstOfficialPath"
      | "searchDecisionFirstOfficialTitle"
      | "searchDecisionFirstOfficialUrl"
      | "searchDecisionFirstOfficialSource"
      | "searchDecisionFirstOfficialSourceScore"
      | "searchDecisionFirstOfficialSourceType"
      | "searchDecisionFirstOfficialSourceHints"
      | "searchDecisionFirstOfficialDateText"
      | "searchDecisionFirstOfficialDateIso"
      | "searchDecisionFirstOfficialDateUnixMs"
      | "searchDecisionFirstOfficialDatePrecision"
      | "searchDecisionFirstOfficialDateSource"
      | "searchDecisionFirstOfficialRelevance"
      | "searchDecisionFirstOfficialCommand"
      | "searchDecisionFirstOfficialCommandArgs"
      | "searchDecisionCommand"
      | "searchDecisionCommandArgs"
      | "pageDecision"
      | "pageDecisionName"
      | "pageDecisionConfidence"
      | "pageDecisionReason"
      | "pageDecisionReadability"
      | "pageDecisionReadabilityScore"
      | "pageDecisionEvidenceCount"
      | "pageDecisionEvidenceQualityScore"
      | "pageDecisionSourceLinkCount"
      | "pageDecisionSourceQualityScore"
      | "pageDecisionReadFrom"
      | "pageDecisionReadTargetKind"
      | "pageDecisionReadTargetCount"
      | "pageDecisionReadTargetScore"
      | "pageDecisionReadTargetPrimary"
      | "pageDecisionReadTargetReason"
      | "pageDecisionUrl"
      | "pageDecisionCommand"
      | "pageDecisionCommandArgs"
      | "semanticSummary"
      | "semanticNodeCount"
      | "semanticNamedRoleCount"
      | "semanticInteractiveCount"
      | "semanticFocusableCount"
      | "semanticHeadingCount"
      | "semanticLandmarkCount"
      | "semanticLinkCount"
      | "semanticButtonCount"
      | "semanticImageCount"
      | "semanticTableCount"
      | "semanticListCount"
      | "semanticFieldCount"
      | "semanticDescriptionCount"
      | "semanticValueCount"
      | "semanticRelationCount"
      | "semanticChoiceCount"
      | "semanticStateCount"
      | "semanticUnavailableCount"
      | "semanticTopRole"
      | "semanticTopRoleCount"
      | "semanticOutlineCount"
      | "semanticTopOutlinePath"
      | "semanticTopOutlineKind"
      | "semanticTopOutlineRole"
      | "semanticTopOutlineText"
      | "semanticTopOutlineLevel"
      | "semanticTopOutlineDepth"
      | "semanticTopOutlineParentPath"
      | "semanticTopOutlineParentRole"
      | "semanticTopOutlineParentName"
      | "semanticTopOutlineSelector"
      | "semanticKeyboardShortcutCount"
      | "semanticTopKeyboardShortcutPath"
      | "semanticTopKeyboardShortcutRole"
      | "semanticTopKeyboardShortcutName"
      | "semanticTopKeyboardShortcutKeys"
      | "semanticTopKeyboardShortcutAccessKey"
      | "semanticTopKeyboardShortcutTabIndex"
      | "semanticTopKeyboardShortcutFocusable"
      | "semanticTopKeyboardShortcutSelector"
      | "semanticTopAriaKeyShortcutPath"
      | "semanticTopAriaKeyShortcutRole"
      | "semanticTopAriaKeyShortcutName"
      | "semanticTopAriaKeyShortcutKeys"
      | "semanticTopAriaKeyShortcutTabIndex"
      | "semanticTopAriaKeyShortcutFocusable"
      | "semanticTopAriaKeyShortcutSelector"
      | "semanticTopHeading"
      | "semanticTopHeadingPath"
      | "semanticTopHeadingLevel"
      | "semanticTopHeadingSelector"
      | "semanticTopLandmark"
      | "semanticTopLandmarkPath"
      | "semanticTopLandmarkRole"
      | "semanticTopLandmarkName"
      | "semanticTopLandmarkSelector"
      | "semanticTopNamedRole"
      | "semanticTopNamedRolePath"
      | "semanticTopNamedRoleRole"
      | "semanticTopNamedRoleName"
      | "semanticTopNamedRoleDescription"
      | "semanticTopNamedRoleSelector"
      | "semanticTopInteractiveRole"
      | "semanticTopInteractivePath"
      | "semanticTopInteractiveName"
      | "semanticTopInteractiveRoleDescription"
      | "semanticTopInteractiveDescription"
      | "semanticTopInteractiveValue"
      | "semanticTopInteractiveState"
      | "semanticTopInteractiveDisabled"
      | "semanticTopInteractivePressed"
      | "semanticTopInteractiveExpanded"
      | "semanticTopInteractiveHaspopup"
      | "semanticTopInteractiveControls"
      | "semanticTopInteractiveControlsTargetRole"
      | "semanticTopInteractiveControlsTargetName"
      | "semanticTopInteractiveControlsTargetSelector"
      | "semanticTopInteractiveSelector"
      | "semanticTopFocusableRole"
      | "semanticTopFocusablePath"
      | "semanticTopFocusableName"
      | "semanticTopFocusableRoleDescription"
      | "semanticTopFocusableState"
      | "semanticTopFocusableDisabled"
      | "semanticTopFocusablePressed"
      | "semanticTopFocusableExpanded"
      | "semanticTopFocusableHaspopup"
      | "semanticTopFocusableControls"
      | "semanticTopFocusableControlsTargetRole"
      | "semanticTopFocusableControlsTargetName"
      | "semanticTopFocusableControlsTargetSelector"
      | "semanticTopFocusableSelector"
      | "semanticTopLinkName"
      | "semanticTopLinkPath"
      | "semanticTopLinkUrl"
      | "semanticTopLinkUrlPath"
      | "semanticTopLinkUrlQuery"
      | "semanticTopLinkTarget"
      | "semanticTopLinkRel"
      | "semanticTopLinkType"
      | "semanticTopLinkHreflang"
      | "semanticTopLinkState"
      | "semanticTopLinkCurrent"
      | "semanticTopLinkDownload"
      | "semanticTopLinkSelector"
      | "semanticTopCurrentLinkName"
      | "semanticTopCurrentLinkPath"
      | "semanticTopCurrentLinkUrl"
      | "semanticTopCurrentLinkUrlPath"
      | "semanticTopCurrentLinkUrlQuery"
      | "semanticTopCurrentLinkTarget"
      | "semanticTopCurrentLinkRel"
      | "semanticTopCurrentLinkType"
      | "semanticTopCurrentLinkHreflang"
      | "semanticTopCurrentLinkState"
      | "semanticTopCurrentLinkCurrent"
      | "semanticTopCurrentLinkDownload"
      | "semanticTopCurrentLinkSelector"
      | "semanticInPageLinkCount"
      | "semanticTopInPageLinkPath"
      | "semanticTopInPageLinkKind"
      | "semanticTopInPageLinkName"
      | "semanticTopInPageLinkUrl"
      | "semanticTopInPageLinkUrlPath"
      | "semanticTopInPageLinkUrlQuery"
      | "semanticTopInPageLinkTargetId"
      | "semanticTopInPageLinkSelector"
      | "semanticTopButtonName"
      | "semanticTopButtonPath"
      | "semanticTopButtonRoleDescription"
      | "semanticTopButtonDescription"
      | "semanticTopButtonType"
      | "semanticTopButtonState"
      | "semanticTopButtonDisabled"
      | "semanticTopButtonPressed"
      | "semanticTopButtonExpanded"
      | "semanticTopButtonHaspopup"
      | "semanticTopButtonControls"
      | "semanticTopButtonControlsTargetRole"
      | "semanticTopButtonControlsTargetName"
      | "semanticTopButtonControlsTargetSelector"
      | "semanticTopButtonFormAction"
      | "semanticTopButtonFormMethod"
      | "semanticTopButtonFormTarget"
      | "semanticTopButtonFormEncType"
      | "semanticTopButtonFormNoValidate"
      | "semanticTopButtonFormId"
      | "semanticTopButtonSelector"
      | "semanticTopImagePath"
      | "semanticTopImageName"
      | "semanticTopImageUrl"
      | "semanticTopImageWidth"
      | "semanticTopImageHeight"
      | "semanticTopImageLoading"
      | "semanticTopImageDecoding"
      | "semanticTopImageSrcset"
      | "semanticTopImageSizes"
      | "semanticTopImageSelector"
      | "semanticTopTableRole"
      | "semanticTopTablePath"
      | "semanticTopTableName"
      | "semanticTopTableRowCount"
      | "semanticTopTableColumnCount"
      | "semanticTopTableCellCount"
      | "semanticTopTableDeclaredRowCount"
      | "semanticTopTableDeclaredColumnCount"
      | "semanticTopTableHeaders"
      | "semanticTopTableHeaderRefs"
      | "semanticTopTableOwnedCount"
      | "semanticTopTableOwnedRefs"
      | "semanticTopTableSampleCells"
      | "semanticTopTableSampleCellRefs"
      | "semanticTopTableFirstHeader"
      | "semanticTopTableFirstHeaderPath"
      | "semanticTopTableFirstHeaderRole"
      | "semanticTopTableFirstHeaderRowIndex"
      | "semanticTopTableFirstHeaderColumnIndex"
      | "semanticTopTableFirstHeaderSort"
      | "semanticTopTableFirstHeaderSelector"
      | "semanticTopTableSecondHeader"
      | "semanticTopTableSecondHeaderPath"
      | "semanticTopTableSecondHeaderRole"
      | "semanticTopTableSecondHeaderRowIndex"
      | "semanticTopTableSecondHeaderColumnIndex"
      | "semanticTopTableSecondHeaderSort"
      | "semanticTopTableSecondHeaderSelector"
      | "semanticTopTableFirstOwnedTarget"
      | "semanticTopTableFirstOwnedRole"
      | "semanticTopTableFirstOwnedName"
      | "semanticTopTableFirstOwnedSelector"
      | "semanticTopTableFirstSampleCellPath"
      | "semanticTopTableFirstSampleCellText"
      | "semanticTopTableFirstSampleCellRowIndex"
      | "semanticTopTableFirstSampleCellColumnIndex"
      | "semanticTopTableFirstSampleCellRowSpan"
      | "semanticTopTableFirstSampleCellColumnSpan"
      | "semanticTopTableFirstSampleCellHeaders"
      | "semanticTopTableFirstSampleCellRowHeaders"
      | "semanticTopTableFirstSampleCellColumnHeaders"
      | "semanticTopTableFirstSampleCellSelected"
      | "semanticTopTableFirstSampleCellCurrent"
      | "semanticTopTableFirstSampleCellSelector"
      | "semanticTopTableFirstSampleCellOwnedTarget"
      | "semanticTopTableSecondSampleCellPath"
      | "semanticTopTableSecondSampleCellText"
      | "semanticTopTableSecondSampleCellRowIndex"
      | "semanticTopTableSecondSampleCellColumnIndex"
      | "semanticTopTableSecondSampleCellRowSpan"
      | "semanticTopTableSecondSampleCellColumnSpan"
      | "semanticTopTableSecondSampleCellHeaders"
      | "semanticTopTableSecondSampleCellRowHeaders"
      | "semanticTopTableSecondSampleCellColumnHeaders"
      | "semanticTopTableSecondSampleCellSelected"
      | "semanticTopTableSecondSampleCellCurrent"
      | "semanticTopTableSecondSampleCellSelector"
      | "semanticTopTableSecondSampleCellOwnedTarget"
      | "semanticTopTableFirstOwnedSampleCellPath"
      | "semanticTopTableFirstOwnedSampleCellText"
      | "semanticTopTableFirstOwnedSampleCellRowIndex"
      | "semanticTopTableFirstOwnedSampleCellColumnIndex"
      | "semanticTopTableFirstOwnedSampleCellRowSpan"
      | "semanticTopTableFirstOwnedSampleCellColumnSpan"
      | "semanticTopTableFirstOwnedSampleCellHeaders"
      | "semanticTopTableFirstOwnedSampleCellRowHeaders"
      | "semanticTopTableFirstOwnedSampleCellColumnHeaders"
      | "semanticTopTableFirstOwnedSampleCellSelected"
      | "semanticTopTableFirstOwnedSampleCellCurrent"
      | "semanticTopTableFirstOwnedSampleCellSelector"
      | "semanticTopTableFirstOwnedSampleCellOwnedTarget"
      | "semanticTopTableSecondOwnedSampleCellPath"
      | "semanticTopTableSecondOwnedSampleCellText"
      | "semanticTopTableSecondOwnedSampleCellRowIndex"
      | "semanticTopTableSecondOwnedSampleCellColumnIndex"
      | "semanticTopTableSecondOwnedSampleCellRowSpan"
      | "semanticTopTableSecondOwnedSampleCellColumnSpan"
      | "semanticTopTableSecondOwnedSampleCellHeaders"
      | "semanticTopTableSecondOwnedSampleCellRowHeaders"
      | "semanticTopTableSecondOwnedSampleCellColumnHeaders"
      | "semanticTopTableSecondOwnedSampleCellSelected"
      | "semanticTopTableSecondOwnedSampleCellCurrent"
      | "semanticTopTableSecondOwnedSampleCellSelector"
      | "semanticTopTableSecondOwnedSampleCellOwnedTarget"
      | "semanticTopSelectedTableCellPath"
      | "semanticTopSelectedTableCellText"
      | "semanticTopSelectedTableCellRowIndex"
      | "semanticTopSelectedTableCellColumnIndex"
      | "semanticTopSelectedTableCellRowSpan"
      | "semanticTopSelectedTableCellColumnSpan"
      | "semanticTopSelectedTableCellHeaders"
      | "semanticTopSelectedTableCellRowHeaders"
      | "semanticTopSelectedTableCellColumnHeaders"
      | "semanticTopSelectedTableCellSelected"
      | "semanticTopSelectedTableCellCurrent"
      | "semanticTopSelectedTableCellSelector"
      | "semanticTopSelectedTableCellOwnedTarget"
      | "semanticTopTableSelector"
      | "semanticTopListRole"
      | "semanticTopListPath"
      | "semanticTopListName"
      | "semanticTopListItemCount"
      | "semanticTopListItems"
      | "semanticTopListItemRefs"
      | "semanticTopListFirstItemText"
      | "semanticTopListFirstItemRole"
      | "semanticTopListFirstItemLevel"
      | "semanticTopListFirstItemPosInSet"
      | "semanticTopListFirstItemSetSize"
      | "semanticTopListFirstItemSelected"
      | "semanticTopListFirstItemCurrent"
      | "semanticTopListFirstItemExpanded"
      | "semanticTopListFirstItemSelector"
      | "semanticTopListSecondItemText"
      | "semanticTopListSecondItemRole"
      | "semanticTopListSecondItemLevel"
      | "semanticTopListSecondItemPosInSet"
      | "semanticTopListSecondItemSetSize"
      | "semanticTopListSecondItemSelected"
      | "semanticTopListSecondItemCurrent"
      | "semanticTopListSecondItemExpanded"
      | "semanticTopListSecondItemSelector"
      | "semanticTopSelectedListItemText"
      | "semanticTopSelectedListItemRole"
      | "semanticTopSelectedListItemLevel"
      | "semanticTopSelectedListItemPosInSet"
      | "semanticTopSelectedListItemSetSize"
      | "semanticTopSelectedListItemSelected"
      | "semanticTopSelectedListItemCurrent"
      | "semanticTopSelectedListItemExpanded"
      | "semanticTopSelectedListItemSelector"
      | "semanticTopListSelector"
      | "semanticTopFieldRole"
      | "semanticTopFieldPath"
      | "semanticTopFieldName"
      | "semanticTopFieldDescription"
      | "semanticTopFieldValue"
      | "semanticTopFieldHtmlName"
      | "semanticTopFieldHtmlType"
      | "semanticTopFieldPlaceholder"
      | "semanticTopFieldAriaPlaceholder"
      | "semanticTopFieldAutocomplete"
      | "semanticTopFieldAriaAutocomplete"
      | "semanticTopFieldInputMode"
      | "semanticTopFieldPattern"
      | "semanticTopFieldMin"
      | "semanticTopFieldMax"
      | "semanticTopFieldStep"
      | "semanticTopFieldMinLength"
      | "semanticTopFieldMaxLength"
      | "semanticTopFieldLabelledBy"
      | "semanticTopFieldLabelledByText"
      | "semanticTopFieldLabelledBySelector"
      | "semanticTopFieldDescribedBy"
      | "semanticTopFieldDescribedByText"
      | "semanticTopFieldDescribedBySelector"
      | "semanticTopFieldDetails"
      | "semanticTopFieldDetailsText"
      | "semanticTopFieldDetailsSelector"
      | "semanticTopFieldErrorMessage"
      | "semanticTopFieldErrorMessageText"
      | "semanticTopFieldErrorMessageSelector"
      | "semanticTopFieldState"
      | "semanticTopFieldDisabled"
      | "semanticTopFieldRequired"
      | "semanticTopFieldReadonly"
      | "semanticTopFieldInvalid"
      | "semanticTopFieldChecked"
      | "semanticTopFieldExpanded"
      | "semanticTopFieldHaspopup"
      | "semanticTopFieldControls"
      | "semanticTopFieldControlsTargetRole"
      | "semanticTopFieldControlsTargetName"
      | "semanticTopFieldControlsTargetSelector"
      | "semanticTopFieldActiveDescendantTarget"
      | "semanticTopFieldActiveDescendantTargetRole"
      | "semanticTopFieldActiveDescendantTargetName"
      | "semanticTopFieldActiveDescendantTargetSelector"
      | "semanticTopFieldValueMin"
      | "semanticTopFieldValueMax"
      | "semanticTopFieldValueNow"
      | "semanticTopFieldValueText"
      | "semanticTopFieldSelector"
      | "semanticTopDescriptionRole"
      | "semanticTopDescriptionPath"
      | "semanticTopDescriptionName"
      | "semanticTopDescriptionText"
      | "semanticTopDescriptionSelector"
      | "semanticTopValueRole"
      | "semanticTopValuePath"
      | "semanticTopValueName"
      | "semanticTopValue"
      | "semanticTopValueSelector"
      | "semanticTopRelationRole"
      | "semanticTopRelationPath"
      | "semanticTopRelationName"
      | "semanticTopRelation"
      | "semanticTopRelationTarget"
      | "semanticTopRelationTargetRole"
      | "semanticTopRelationTargetName"
      | "semanticTopRelationTargetSelector"
      | "semanticTopRelationSelector"
      | "semanticTopOwnsRelationRole"
      | "semanticTopOwnsRelationPath"
      | "semanticTopOwnsRelationName"
      | "semanticTopOwnsRelationTarget"
      | "semanticTopOwnsRelationTargetRole"
      | "semanticTopOwnsRelationTargetName"
      | "semanticTopOwnsRelationTargetSelector"
      | "semanticTopOwnsRelationSelector"
      | "semanticTopFlowToRole"
      | "semanticTopFlowToPath"
      | "semanticTopFlowToName"
      | "semanticTopFlowToTarget"
      | "semanticTopFlowToTargetRole"
      | "semanticTopFlowToTargetName"
      | "semanticTopFlowToTargetSelector"
      | "semanticTopFlowToSelector"
      | "semanticTopActiveDescendantRelationRole"
      | "semanticTopActiveDescendantRelationPath"
      | "semanticTopActiveDescendantRelationName"
      | "semanticTopActiveDescendantRelationTarget"
      | "semanticTopActiveDescendantRelationTargetRole"
      | "semanticTopActiveDescendantRelationTargetName"
      | "semanticTopActiveDescendantRelationTargetSelector"
      | "semanticTopActiveDescendantRelationSelector"
      | "semanticTopDetailsRelationRole"
      | "semanticTopDetailsRelationPath"
      | "semanticTopDetailsRelationName"
      | "semanticTopDetailsRelationTarget"
      | "semanticTopDetailsRelationTargetRole"
      | "semanticTopDetailsRelationTargetName"
      | "semanticTopDetailsRelationTargetSelector"
      | "semanticTopDetailsRelationSelector"
      | "semanticTopErrorMessageRelationRole"
      | "semanticTopErrorMessageRelationPath"
      | "semanticTopErrorMessageRelationName"
      | "semanticTopErrorMessageRelationTarget"
      | "semanticTopErrorMessageRelationTargetRole"
      | "semanticTopErrorMessageRelationTargetName"
      | "semanticTopErrorMessageRelationTargetSelector"
      | "semanticTopErrorMessageRelationSelector"
      | "semanticTopDescribedByRelationRole"
      | "semanticTopDescribedByRelationPath"
      | "semanticTopDescribedByRelationName"
      | "semanticTopDescribedByRelationTarget"
      | "semanticTopDescribedByRelationTargetRole"
      | "semanticTopDescribedByRelationTargetName"
      | "semanticTopDescribedByRelationTargetSelector"
      | "semanticTopDescribedByRelationSelector"
      | "semanticTopLabelledByRelationRole"
      | "semanticTopLabelledByRelationPath"
      | "semanticTopLabelledByRelationName"
      | "semanticTopLabelledByRelationTarget"
      | "semanticTopLabelledByRelationTargetRole"
      | "semanticTopLabelledByRelationTargetName"
      | "semanticTopLabelledByRelationTargetSelector"
      | "semanticTopLabelledByRelationSelector"
      | "semanticTopChoiceRole"
      | "semanticTopChoicePath"
      | "semanticTopChoiceName"
      | "semanticTopChoiceState"
      | "semanticTopChoiceSelected"
      | "semanticTopChoiceCurrent"
      | "semanticTopChoiceLevel"
      | "semanticTopChoicePosInSet"
      | "semanticTopChoiceSetSize"
      | "semanticTopChoiceSelector"
      | "semanticTopSelectedChoiceRole"
      | "semanticTopSelectedChoicePath"
      | "semanticTopSelectedChoiceName"
      | "semanticTopSelectedChoiceState"
      | "semanticTopSelectedChoiceSelected"
      | "semanticTopSelectedChoiceCurrent"
      | "semanticTopSelectedChoiceLevel"
      | "semanticTopSelectedChoicePosInSet"
      | "semanticTopSelectedChoiceSetSize"
      | "semanticTopSelectedChoiceControls"
      | "semanticTopSelectedChoiceControlsTargetRole"
      | "semanticTopSelectedChoiceControlsTargetName"
      | "semanticTopSelectedChoiceControlsTargetSelector"
      | "semanticTopSelectedChoiceSelector"
      | "semanticTopStateRole"
      | "semanticTopStatePath"
      | "semanticTopStateName"
      | "semanticTopState"
      | "semanticTopStateHidden"
      | "semanticTopStateDisabled"
      | "semanticTopStateBusy"
      | "semanticTopStateMultiselectable"
      | "semanticTopStateSort"
      | "semanticTopStateGrabbed"
      | "semanticTopStateDropEffect"
      | "semanticTopStateChecked"
      | "semanticTopStateSelected"
      | "semanticTopStateExpanded"
      | "semanticTopStatePressed"
      | "semanticTopStateFocused"
      | "semanticTopStateRequired"
      | "semanticTopStateInvalid"
      | "semanticTopStateReadonly"
      | "semanticTopStateCurrent"
      | "semanticTopStateHaspopup"
      | "semanticTopStateControls"
      | "semanticTopStateControlsTargetRole"
      | "semanticTopStateControlsTargetName"
      | "semanticTopStateControlsTargetSelector"
      | "semanticTopStateLive"
      | "semanticTopStateModal"
      | "semanticTopStateOrientation"
      | "semanticTopStateValueMin"
      | "semanticTopStateValueMax"
      | "semanticTopStateValueNow"
      | "semanticTopStateValueText"
      | "semanticTopStateSelector"
      | "semanticTopModalStateRole"
      | "semanticTopModalStatePath"
      | "semanticTopModalStateName"
      | "semanticTopModalState"
      | "semanticTopModalStateSelector"
      | "semanticTopLiveStateRole"
      | "semanticTopLiveStatePath"
      | "semanticTopLiveStateName"
      | "semanticTopLiveState"
      | "semanticTopLiveStateLive"
      | "semanticTopLiveStateSelector"
      | "semanticTopUnavailablePath"
      | "semanticTopUnavailableTag"
      | "semanticTopUnavailableRole"
      | "semanticTopUnavailableName"
      | "semanticTopUnavailableReason"
      | "semanticTopUnavailableSelector"
      | "runbookDecision"
      | "runbookMode"
      | "runbookOperation"
      | "runbookActionName"
      | "runbookReason"
      | "runbookConfidence"
      | "runbookAnswerStatus"
      | "runbookAnswerReady"
      | "runbookShouldContinue"
      | "runbookTerminal"
      | "runbookMaxSuggestedIterations"
      | "runbookExpectedOutcome"
      | "runbookReadFrom"
      | "runbookReadTargetKind"
      | "runbookReadTargetCount"
      | "runbookReadTargetScore"
      | "runbookReadTargetPrimary"
      | "runbookReadTargetReason"
      | "runbookReadValuePath"
      | "runbookReadValueType"
      | "runbookReadValueCount"
      | "runbookReadValueReferencePath"
      | "runbookCommand"
      | "runbookCommandArgs"
      | "runbookUrl"
      | "nextActionName"
      | "nextExecution"
      | "nextCommand"
      | "nextCommandArgs"
      | "nextAfterInteractionCommand"
      | "nextAfterInteractionCommandArgs"
      | "nextReadFrom"
      | "nextReadTargetKind"
      | "nextReadTargetCount"
      | "nextReadTargetScore"
      | "nextReadTargetPrimary"
      | "nextReadTargetReason"
      | "nextReadValuePath"
      | "nextReadValueType"
      | "nextReadValueCount"
      | "nextReadValueReferencePath"
      | "nextUrl"
      | "expectedOutcomeKind"
      | "expectedOutcomeMessage"
      | "executionPlanOperation"
      | "executionPlanConfidence"
      | "executionPlanReason"
      | "executionPlanAnswerReady"
      | "executionPlanShouldContinue"
      | "executionPlanTerminal"
      | "executionPlanExpectedOutcome"
      | "executionPlanReadFrom"
      | "executionPlanReadTargetKind"
      | "executionPlanReadTargetCount"
      | "executionPlanReadTargetScore"
      | "executionPlanReadTargetPrimary"
      | "executionPlanReadTargetReason"
      | "executionPlanCommand"
      | "executionPlanCommandArgs"
      | "executionPlanAfterInteractionCommand"
      | "executionPlanAfterInteractionCommandArgs"
      | "executionPlanUrl"
      | "answerPlanStatus"
      | "answerPlanConfidence"
      | "answerPlanReason"
      | "answerPlanNextAction"
      | "answerGapCount"
      | "answerUseCitationCount"
      | "topAnswerUseCitationId"
      | "answerUseCitationIds"
      | "answerPlanReadFrom"
      | "answerPlanReadTargetKind"
      | "answerPlanReadTargetCount"
      | "answerPlanReadTargetScore"
      | "answerPlanReadTargetPrimary"
      | "answerPlanReadTargetReason"
      | "answerPlanCommand"
      | "answerPlanCommandArgs"
      | "answerPlanAfterInteractionCommand"
      | "answerPlanAfterInteractionCommandArgs"
      | "answerPlanUrl"
      | "readTargetCount"
      | "actionCount"
      | "pageTitle"
      | "pageCanonicalUrl"
      | "pageLang"
      | "pageDir"
      | "pageSiteName"
      | "pageAuthor"
      | "pagePublishedTime"
      | "pageModifiedTime"
      | "pageStructuredDataTypes"
      | "topReadTarget"
      | "topReadTargetKind"
      | "topReadTargetCount"
      | "topReadTargetScore"
      | "topReadTargetPrimary"
      | "topReadTargetReason"
      | "secondReadTarget"
      | "secondReadTargetKind"
      | "secondReadTargetCount"
      | "secondReadTargetScore"
      | "secondReadTargetPrimary"
      | "secondReadTargetReason"
      | "topActionName"
      | "topActionSource"
      | "topActionExecution"
      | "topActionPriority"
      | "topActionPriorityReason"
      | "topActionReason"
      | "topActionReadFrom"
      | "topActionReadTargetKind"
      | "topActionReadTargetCount"
      | "topActionReadTargetScore"
      | "topActionReadTargetPrimary"
      | "topActionReadTargetReason"
      | "topActionCommand"
      | "topActionCommandArgs"
      | "topActionAfterInteractionCommand"
      | "topActionAfterInteractionCommandArgs"
      | "topActionUrl"
      | "topActionSourceLinkRef"
      | "topActionRank"
      | "topActionOpenResult"
      | "topActionExpectedOutcome"
      | "topActionExpectedOutcomeMessage"
      | "topActionTargetUrl"
      | "topActionTargetUrlPath"
      | "topActionTargetUrlQuery"
      | "topActionTargetPath"
      | "topActionTargetTitle"
      | "topActionTargetHost"
      | "topActionTargetSource"
      | "topActionTargetRank"
      | "topActionTargetSourceScore"
      | "topActionTargetDateText"
      | "topActionTargetDateIso"
      | "topActionTargetDateUnixMs"
      | "topActionTargetDatePrecision"
      | "topActionTargetDateSource"
      | "topActionTargetRelevance"
      | "topActionTargetLikelyOfficial"
      | "topActionTargetSelector"
      | "topActionTargetText"
      | "topActionRequiresBrowserInteraction"
      | "topActionBrowserHtmlReason"
      | "topActionBrowserHtmlReasonCode"
      | "bestReadTarget"
      | "bestReadTargetKind"
      | "bestReadTargetCount"
      | "bestReadTargetScore"
      | "bestReadTargetPrimary"
      | "bestReadTargetReason"
      | "signalCount"
      | "signalWarningCount"
      | "signalErrorCount"
      | "qualityGateCount"
      | "qualityGateFailCount"
      | "topSignalKind"
      | "topSignalSeverity"
      | "topSignalMessage"
      | "topQualityGateKind"
      | "topQualityGatePass"
      | "topQualityGateSeverity"
      | "topQualityGateMessage"
      | "topQualityGatePath"
      | "topQualityGateScore"
      | "problemSignalKind"
      | "problemSignalSeverity"
      | "problemSignalMessage"
      | "failingQualityGateKind"
      | "failingQualityGateSeverity"
      | "failingQualityGateMessage"
      | "failingQualityGatePath"
      | "failingQualityGateScore"
      | "needsBrowserInteraction"
      | "staticReadiness"
      | "staticReadinessReasonCode"
      | "staticReadinessReason"
      | "staticReadinessReadFrom"
      | "staticReadinessReadTargetKind"
      | "staticReadinessReadTargetCount"
      | "staticReadinessReadTargetScore"
      | "staticReadinessReadTargetPrimary"
      | "staticReadinessReadTargetReason"
      | "browserHtmlReason"
      | "browserHtmlReasonCode"
      | "browserHtmlActionName"
      | "browserHtmlOperation"
      | "browserHtmlUrl"
      | "browserHtmlFile"
      | "browserHtmlCaptureScript"
      | "browserHtmlCommand"
      | "browserHtmlCommandArgs"
      | "browserHtmlAfterInteractionCommand"
      | "browserHtmlAfterInteractionCommandArgs"
      | "topDiagnosticCode"
      | "topDiagnosticSeverity"
      | "topDiagnosticMessage"
      | "executorDecision"
      | "executorMode"
      | "executorActionName"
      | "executorOperation"
      | "executorConfidence"
      | "executorAnswerReady"
      | "executorShouldContinue"
      | "executorTerminal"
      | "executorCommand"
      | "executorCommandArgs"
      | "executorAfterInteractionCommand"
      | "executorAfterInteractionCommandArgs"
      | "executorReadFrom"
      | "executorReadTargetKind"
      | "executorReadTargetCount"
      | "executorReadTargetScore"
      | "executorReadTargetPrimary"
      | "executorReadTargetReason"
      | "executorReadValuePath"
      | "executorReadValueType"
      | "executorReadValueCount"
      | "executorReadValueReferencePath"
      | "executorUrl"
      | "executorTargetUrl"
      | "executorTargetUrlPath"
      | "executorTargetUrlQuery"
      | "executorTargetPath"
      | "executorTargetTitle"
      | "executorTargetHost"
      | "executorTargetSource"
      | "executorTargetRank"
      | "executorTargetSourceScore"
      | "executorTargetDateText"
      | "executorTargetDateIso"
      | "executorTargetDateUnixMs"
      | "executorTargetDatePrecision"
      | "executorTargetDateSource"
      | "executorTargetRelevance"
      | "executorTargetLikelyOfficial"
      | "executorTargetSelector"
      | "executorTargetText"
      | "executorExpectedOutcome"
      | "executorBrowserHtmlReason"
      | "executorBrowserHtmlReasonCode"
      | "handoffDecision"
      | "handoffMode"
      | "handoffActionName"
      | "handoffOperation"
      | "handoffAnswerStatus"
      | "handoffConfidence"
      | "handoffAnswerReady"
      | "handoffShouldContinue"
      | "handoffTerminal"
      | "handoffPriority"
      | "handoffPriorityReason"
      | "handoffCommand"
      | "handoffCommandArgs"
      | "handoffAfterInteractionCommand"
      | "handoffAfterInteractionCommandArgs"
      | "handoffReadFrom"
      | "handoffReadTargetKind"
      | "handoffReadTargetCount"
      | "handoffReadTargetScore"
      | "handoffReadTargetPrimary"
      | "handoffReadTargetReason"
      | "handoffReadValuePath"
      | "handoffReadValueType"
      | "handoffReadValueCount"
      | "handoffReadValueReferencePath"
      | "handoffUrl"
      | "handoffTargetUrl"
      | "handoffTargetUrlPath"
      | "handoffTargetUrlQuery"
      | "handoffTargetPath"
      | "handoffTargetTitle"
      | "handoffTargetHost"
      | "handoffTargetSource"
      | "handoffTargetRank"
      | "handoffTargetSourceScore"
      | "handoffTargetDateText"
      | "handoffTargetDateIso"
      | "handoffTargetDateUnixMs"
      | "handoffTargetDatePrecision"
      | "handoffTargetDateSource"
      | "handoffTargetRelevance"
      | "handoffTargetLikelyOfficial"
      | "handoffTargetSelector"
      | "handoffTargetText"
      | "handoffExpectedOutcome"
      | "handoffBrowserHtmlReason"
      | "handoffBrowserHtmlReasonCode"
      | "primaryActionName"
      | "primaryReason"
      | "primaryPriority"
      | "primaryPriorityReason"
      | "primaryExpectedOutcome"
      | "primaryExpectedOutcomeMessage"
      | "primaryReadFrom"
      | "primaryReadTargetKind"
      | "primaryReadTargetCount"
      | "primaryReadTargetScore"
      | "primaryReadTargetPrimary"
      | "primaryReadTargetReason"
      | "primaryBrowserHtmlReason"
      | "primaryBrowserHtmlReasonCode"
      | "primaryAfterInteractionCommand"
      | "primaryAfterInteractionCommandArgs"
      | "primarySourceLinkRef"
      | "primaryTargetUrl"
      | "primaryTargetUrlPath"
      | "primaryTargetUrlQuery"
      | "primaryTargetPath"
      | "primaryTargetTitle"
      | "primaryTargetHost"
      | "primaryTargetSource"
      | "primaryTargetRank"
      | "primaryTargetSourceScore"
      | "primaryTargetDateText"
      | "primaryTargetDateIso"
      | "primaryTargetDateUnixMs"
      | "primaryTargetDatePrecision"
      | "primaryTargetDateSource"
      | "primaryTargetRelevance"
      | "primaryTargetLikelyOfficial"
      | "primaryTargetSelector"
      | "primaryTargetText"
      | "alternativeActionName"
      | "alternativeActionSource"
      | "alternativeActionExecution"
      | "alternativeActionExpectedOutcome"
      | "alternativeActionExpectedOutcomeMessage"
      | "alternativeActionPriority"
      | "alternativeActionPriorityReason"
      | "alternativeActionReason"
      | "alternativeActionReadFrom"
      | "alternativeActionReadTargetKind"
      | "alternativeActionReadTargetCount"
      | "alternativeActionReadTargetScore"
      | "alternativeActionReadTargetPrimary"
      | "alternativeActionReadTargetReason"
      | "alternativeActionCommand"
      | "alternativeActionCommandArgs"
      | "alternativeActionAfterInteractionCommand"
      | "alternativeActionAfterInteractionCommandArgs"
      | "alternativeActionUrl"
      | "alternativeActionSourceLinkRef"
      | "alternativeActionRank"
      | "alternativeActionOpenResult"
      | "alternativeActionTargetUrl"
      | "alternativeActionTargetPath"
      | "alternativeActionTargetTitle"
      | "alternativeActionTargetHost"
      | "alternativeActionTargetSource"
      | "alternativeActionTargetRank"
      | "alternativeActionTargetSourceScore"
      | "alternativeActionTargetDateText"
      | "alternativeActionTargetDateIso"
      | "alternativeActionTargetDateUnixMs"
      | "alternativeActionTargetDatePrecision"
      | "alternativeActionTargetDateSource"
      | "alternativeActionTargetRelevance"
      | "alternativeActionTargetLikelyOfficial"
      | "alternativeActionTargetSelector"
      | "alternativeActionTargetText"
      | "alternativeActionRequiresBrowserInteraction"
      | "alternativeActionBrowserHtmlReason"
      | "alternativeActionBrowserHtmlReasonCode"
      | "recommendedUrl"
      | "recommendedUrlPath"
      | "recommendedUrlQuery"
      | "recommendedPath"
      | "recommendedTitle"
      | "recommendedRank"
      | "recommendedSource"
      | "recommendedSourceScore"
      | "recommendedSourceType"
      | "recommendedSourceHints"
      | "recommendedDateText"
      | "recommendedDateIso"
      | "recommendedDateUnixMs"
      | "recommendedDatePrecision"
      | "recommendedDateSource"
      | "recommendedRelevance"
      | "recommendedLikelyOfficial"
      | "recommendedSelectionReason"
      | "recommendedCommand"
      | "recommendedCommandArgs"
    > = {
      resultCount: 2,
      resultChoiceCount: 2,
      resultChoices: [resultChoice],
      topResultChoicePath: "searchResults[0]",
      topResultChoiceTitle: "Example result",
      topResultChoiceUrl: "https://example.test/result?tab=readme",
      topResultChoiceHost: "example.test",
      topResultChoiceUrlPath: "/result",
      topResultChoiceUrlQuery: "?tab=readme",
      topResultChoiceSnippet: "Result summary",
      topResultChoiceCommand: "ax-grep --search example --open-result 1 --agent-brief",
      topResultChoiceCommandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent-brief"],
      topResultChoiceRank: 1,
      topResultChoiceOpenResult: 1,
      topResultChoiceRecommended: true,
      topResultChoicePrimary: true,
      topResultChoiceSourceType: "official",
      topResultChoiceSourceScore: 0.9,
      topResultChoiceSourceHints: ["package-registry"],
      topResultChoiceDateText: "2026-05-31",
      topResultChoiceDateIso: "2026-05-31T00:00:00.000Z",
      topResultChoiceDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      topResultChoiceDatePrecision: "day",
      topResultChoiceDateSource: "snippet",
      topResultChoiceRelevance: "high",
      topResultChoiceMatchedTerm: "example",
      topResultChoiceFindMatch: "Example result",
      topResultChoiceLikelyOfficial: true,
      topResultChoiceSitelinkCount: 1,
      topResultChoiceFirstSitelinkTitle: "Readme",
      topResultChoiceFirstSitelinkUrl: "https://example.test/result#readme",
      topResultChoiceFirstSitelinkUrlPath: "/result",
      topResultChoiceFirstSitelinkSelector: "a",
      topResultChoiceFirstSitelinkCommand: "ax-grep 'https://example.test/result#readme' --agent",
      topResultChoiceFirstSitelinkCommandArgs: ["ax-grep", "https://example.test/result#readme", "--agent"],
      topResultChoiceReason: "High relevance.",
      secondResultChoicePath: "searchResults[1]",
      secondResultChoiceTitle: "Backup result",
      secondResultChoiceUrl: "https://backup.example/result?tab=docs",
      secondResultChoiceHost: "backup.example",
      secondResultChoiceUrlPath: "/result",
      secondResultChoiceUrlQuery: "?tab=docs",
      secondResultChoiceSnippet: "Backup result summary",
      secondResultChoiceCommand: "ax-grep --search example --open-result 2 --agent-brief",
      secondResultChoiceCommandArgs: ["ax-grep", "--search", "example", "--open-result", "2", "--agent-brief"],
      secondResultChoiceRank: 2,
      secondResultChoiceOpenResult: 2,
      secondResultChoiceRecommended: false,
      secondResultChoicePrimary: false,
      secondResultChoiceSourceType: "docs",
      secondResultChoiceSourceScore: 0.8,
      secondResultChoiceSourceHints: ["documentation"],
      secondResultChoiceDateText: "2026-06-01",
      secondResultChoiceDateIso: "2026-06-01T00:00:00.000Z",
      secondResultChoiceDateUnixMs: Date.parse("2026-06-01T00:00:00.000Z"),
      secondResultChoiceDatePrecision: "day",
      secondResultChoiceDateSource: "title",
      secondResultChoiceRelevance: "medium",
      secondResultChoiceMatchedTerm: "backup",
      secondResultChoiceFindMatch: "Backup result",
      secondResultChoiceLikelyOfficial: false,
      secondResultChoiceSitelinkCount: 1,
      secondResultChoiceFirstSitelinkTitle: "Docs",
      secondResultChoiceFirstSitelinkUrl: "https://backup.example/result#docs",
      secondResultChoiceFirstSitelinkUrlPath: "/result",
      secondResultChoiceFirstSitelinkSelector: "a.backup",
      secondResultChoiceFirstSitelinkCommand: "ax-grep 'https://backup.example/result#docs' --agent",
      secondResultChoiceFirstSitelinkCommandArgs: ["ax-grep", "https://backup.example/result#docs", "--agent"],
      secondResultChoiceReason: "Backup relevance.",
      evidenceCount: 1,
      formCount: 2,
      formChoiceCount: 2,
      formChoices: [formChoice, secondFormChoice],
      topFormChoicePath: "pageCheck.forms[0]",
      topFormChoiceMethod: "get",
      topFormChoiceActionUrl: "https://example.test/find",
      topFormChoiceActionUrlPath: "/find",
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
      topFormChoiceSubmitFormActionUrl: "https://example.test/find",
      topFormChoiceSubmitFormActionUrlPath: "/find",
      topFormChoiceSubmitFormMethod: "get",
      topFormChoiceSubmitFormTarget: "_blank",
      topFormChoiceSubmitFormEncType: "multipart/form-data",
      topFormChoiceSubmitFormNoValidate: true,
      topFormChoiceSubmitFormId: "remote-form",
      topFormChoiceQueryField: "q",
      topFormChoiceUrlTemplate: "https://example.test/find?q={query}",
      topFormChoiceUrlTemplatePath: "/find",
      topFormChoiceUrlTemplateQuery: "?q={query}",
      topFormChoiceCommand: "ax-grep 'https://example.test/find?q=docs' --find docs --agent",
      topFormChoiceCommandArgs: ["ax-grep", "https://example.test/find?q=docs", "--find", "docs", "--agent"],
      topFormChoiceFieldCount: 1,
      topFormChoiceHiddenFieldCount: 1,
      topFormChoiceSelector: "form:nth-of-type(1)",
      topFormChoiceFirstHiddenFieldName: "csrf",
      topFormChoiceFirstHiddenFieldValue: "secret",
      topFormChoiceFirstHiddenFieldSelector: "input[name=\"csrf\"]",
      topFormChoiceFirstFieldName: "q",
      topFormChoiceFirstFieldType: "search",
      topFormChoiceFirstFieldLabel: "Search",
      topFormChoiceFirstFieldPlaceholder: "Search docs",
      topFormChoiceFirstFieldValue: "initial",
      topFormChoiceFirstFieldOptions: ["All", "Docs"],
      topFormChoiceFirstFieldSelectedOption: "Docs",
      topFormChoiceFirstFieldSelectedValue: "docs",
      topFormChoiceFirstFieldAutocomplete: "off",
      topFormChoiceFirstFieldInputMode: "search",
      topFormChoiceFirstFieldPattern: "[A-Za-z ]+",
      topFormChoiceFirstFieldMin: "1",
      topFormChoiceFirstFieldMax: "99",
      topFormChoiceFirstFieldStep: "1",
      topFormChoiceFirstFieldMinLength: 2,
      topFormChoiceFirstFieldMaxLength: 80,
      topFormChoiceFirstFieldRequired: true,
      topFormChoiceFirstFieldChecked: true,
      topFormChoiceFirstFieldDisabled: true,
      topFormChoiceFirstFieldReadonly: true,
      topFormChoiceFirstFieldInvalid: "spelling",
      topFormChoiceFirstFieldSelector: "input[name=\"q\"]",
      topFormChoiceRequiredFieldName: "q",
      topFormChoiceRequiredFieldType: "search",
      topFormChoiceRequiredFieldLabel: "Search",
      topFormChoiceRequiredFieldPlaceholder: "Search docs",
      topFormChoiceRequiredFieldValue: "initial",
      topFormChoiceRequiredFieldOptions: ["All", "Docs"],
      topFormChoiceRequiredFieldSelectedOption: "Docs",
      topFormChoiceRequiredFieldSelectedValue: "docs",
      topFormChoiceRequiredFieldAutocomplete: "off",
      topFormChoiceRequiredFieldInputMode: "search",
      topFormChoiceRequiredFieldPattern: "[A-Za-z ]+",
      topFormChoiceRequiredFieldMin: "1",
      topFormChoiceRequiredFieldMax: "99",
      topFormChoiceRequiredFieldStep: "1",
      topFormChoiceRequiredFieldMinLength: 2,
      topFormChoiceRequiredFieldMaxLength: 80,
      topFormChoiceRequiredFieldRequired: true,
      topFormChoiceRequiredFieldChecked: true,
      topFormChoiceRequiredFieldDisabled: true,
      topFormChoiceRequiredFieldReadonly: true,
      topFormChoiceRequiredFieldInvalid: "spelling",
      topFormChoiceRequiredFieldSelector: "input[name=\"q\"]",
      topFormChoiceInvalidFieldName: "q",
      topFormChoiceInvalidFieldType: "search",
      topFormChoiceInvalidFieldLabel: "Search",
      topFormChoiceInvalidFieldInvalid: "spelling",
      topFormChoiceInvalidFieldSelector: "input[name=\"q\"]",
      secondFormChoicePath: "pageCheck.forms[1]",
      secondFormChoiceMethod: "post",
      secondFormChoiceActionUrl: "https://example.test/advanced?scope=docs",
      secondFormChoiceActionUrlPath: "/advanced",
      secondFormChoiceActionUrlQuery: "?scope=docs",
      secondFormChoiceUrlTemplate: "https://example.test/advanced?scope=docs&term={query}",
      secondFormChoiceUrlTemplatePath: "/advanced",
      secondFormChoiceUrlTemplateQuery: "?scope=docs&term={query}",
      secondFormChoiceQueryField: "term",
      secondFormChoiceCommand: "ax-grep 'https://example.test/advanced?scope=docs&term=docs' --find docs --agent",
      secondFormChoiceCommandArgs: ["ax-grep", "https://example.test/advanced?scope=docs&term=docs", "--find", "docs", "--agent"],
      secondFormChoiceFieldCount: 1,
      secondFormChoiceHiddenFieldCount: 0,
      secondFormChoiceSelector: "form:nth-of-type(2)",
      secondFormChoiceSubmitText: "Advanced",
      secondFormChoiceSubmitType: "submit",
      secondFormChoiceSubmitName: "advanced",
      secondFormChoiceSubmitValue: "1",
      secondFormChoiceSubmitDisabled: false,
      secondFormChoiceSubmitSelector: "button[name=\"advanced\"]",
      secondFormChoiceFirstFieldName: "term",
      secondFormChoiceFirstFieldType: "search",
      secondFormChoiceFirstFieldLabel: "Advanced search",
      secondFormChoiceFirstFieldPlaceholder: "Advanced docs",
      secondFormChoiceFirstFieldRequired: true,
      secondFormChoiceFirstFieldInvalid: "spelling",
      secondFormChoiceFirstFieldSelector: "input[name=\"term\"]",
      actionTargetCount: 2,
      actionTargetChoiceCount: 2,
      actionTargetChoices: [actionTargetChoice, secondActionTargetChoice],
      topActionTargetChoicePath: "pageCheck.actionTargets[0]",
      topActionTargetChoiceKind: "search",
      topActionTargetChoiceName: "Search docs",
      topActionTargetChoiceSource: "json-ld",
      topActionTargetChoiceTargetUrl: "https://example.test/search",
      topActionTargetChoiceTargetUrlPath: "/search",
      topActionTargetChoiceUrlTemplate: "https://example.test/search?q={query}",
      topActionTargetChoiceUrlTemplatePath: "/search",
      topActionTargetChoiceUrlTemplateQuery: "?q={query}",
      topActionTargetChoiceQueryInput: "required name=query",
      topActionTargetChoiceMethod: "GET",
      topActionTargetChoiceEncodingType: "application/x-www-form-urlencoded",
      topActionTargetChoiceCommand: "ax-grep 'https://example.test/search?q=docs' --find docs --agent",
      topActionTargetChoiceCommandArgs: ["ax-grep", "https://example.test/search?q=docs", "--find", "docs", "--agent"],
      topActionTargetChoiceDisabled: true,
      topActionTargetChoicePressed: false,
      topActionTargetChoiceExpanded: true,
      topActionTargetChoiceHaspopup: "dialog",
      topActionTargetChoiceControls: "search-dialog",
      topActionTargetChoiceSelector: "script[type=\"application/ld+json\"]",
      secondActionTargetChoicePath: "pageCheck.actionTargets[1]",
      secondActionTargetChoiceKind: "search",
      secondActionTargetChoiceName: "Docs OpenSearch",
      secondActionTargetChoiceSource: "link",
      secondActionTargetChoiceTargetUrl: "https://example.test/opensearch.xml?profile=docs",
      secondActionTargetChoiceTargetUrlPath: "/opensearch.xml",
      secondActionTargetChoiceTargetUrlQuery: "?profile=docs",
      secondActionTargetChoiceUrlTemplate: "https://example.test/opensearch?q={query}",
      secondActionTargetChoiceUrlTemplatePath: "/opensearch",
      secondActionTargetChoiceUrlTemplateQuery: "?q={query}",
      secondActionTargetChoiceQueryInput: "required name=query",
      secondActionTargetChoiceMethod: "GET",
      secondActionTargetChoiceEncodingType: "application/opensearchdescription+xml",
      secondActionTargetChoiceCommand: "ax-grep 'https://example.test/opensearch?q=docs' --find docs --agent",
      secondActionTargetChoiceCommandArgs: ["ax-grep", "https://example.test/opensearch?q=docs", "--find", "docs", "--agent"],
      secondActionTargetChoiceDisabled: false,
      secondActionTargetChoicePressed: "mixed",
      secondActionTargetChoiceExpanded: false,
      secondActionTargetChoiceHaspopup: "dialog",
      secondActionTargetChoiceControls: "docs-search-panel",
      secondActionTargetChoiceSelector: "link[rel=\"search\"]",
      barrierCount: 1,
      topBarrierKind: "challenge",
      topBarrierSeverity: "warning",
      topBarrierSource: "diagnostic",
      topBarrierPath: "pageCheck.barriers[0]",
      topBarrierText: "Challenge: verify you are human",
      topBarrierSelector: "main > h1",
      topBarrierDiagnosticCode: "CHALLENGE_LIKELY",
      secondBarrierKind: "paywall",
      secondBarrierSeverity: "warning",
      secondBarrierSource: "diagnostic",
      secondBarrierPath: "pageCheck.barriers[1]",
      secondBarrierText: "Paywall: subscription required",
      secondBarrierSelector: "main > p",
      secondBarrierDiagnosticCode: "PAYWALL_LIKELY",
      dataTableCount: 2,
      faqCount: 1,
      codeBlockCount: 1,
      resourceCount: 2,
      mediaCount: 1,
      sectionCount: 1,
      breadcrumbCount: 1,
      paginationCount: 1,
      tocCount: 2,
      embedCount: 1,
      transcriptCount: 1,
      authorLinkCount: 1,
      provenanceCount: 1,
      offerCount: 1,
      datasetCount: 1,
      identityCount: 1,
      timelineCount: 1,
      contactPointCount: 1,
      topDataTablePath: "pageCheck.dataTables[0]",
      topDataTableCaption: "Plan comparison",
      topDataTableRowCount: 2,
      topDataTableColumnCount: 3,
      topDataTableHeaderCount: 3,
      topDataTableHeaders: ["Plan", "Monthly price", "Storage"],
      topDataTableFirstHeader: "Plan",
      topDataTableFirstRow: ["Starter", "$19.99", "10 GB"],
      topDataTableFirstCell: "Starter",
      topDataTableSecondRow: ["Team", "$49.99", "100 GB"],
      topDataTableSecondCell: "Team",
      topDataTableSelector: "table:nth-of-type(1)",
      secondDataTablePath: "pageCheck.dataTables[1]",
      secondDataTableCaption: "Usage limits",
      secondDataTableRowCount: 2,
      secondDataTableColumnCount: 2,
      secondDataTableHeaderCount: 2,
      secondDataTableHeaders: ["Tier", "Requests"],
      secondDataTableFirstHeader: "Tier",
      secondDataTableFirstRow: ["Free", "1,000"],
      secondDataTableFirstCell: "Free",
      secondDataTableSecondRow: ["Pro", "50,000"],
      secondDataTableSecondCell: "Pro",
      secondDataTableSelector: "table:nth-of-type(2)",
      topFaqPath: "pageCheck.faqs[0]",
      topFaqQuestion: "How do I install it?",
      topFaqAnswer: "Run pnpm install.",
      topFaqSelector: "details:nth-of-type(1)",
      secondFaqPath: "pageCheck.faqs[1]",
      secondFaqQuestion: "Can I use it in CI?",
      secondFaqAnswer: "Yes, use --agent-brief.",
      secondFaqSelector: "details:nth-of-type(2)",
      topCodeBlockPath: "pageCheck.codeBlocks[0]",
      topCodeBlockLanguage: "bash",
      topCodeBlockLineCount: 1,
      topCodeBlockText: "pnpm install",
      topCodeBlockSelector: "pre:nth-of-type(1)",
      secondCodeBlockPath: "pageCheck.codeBlocks[1]",
      secondCodeBlockLanguage: "bash",
      secondCodeBlockLineCount: 1,
      secondCodeBlockText: "pnpm test",
      secondCodeBlockSelector: "pre:nth-of-type(2)",
      topResourcePath: "pageCheck.resources[0]",
      topResourceKind: "download",
      topResourceUrl: "https://example.test/guide.pdf",
      topResourceUrlPath: "/guide.pdf",
      topResourceTitle: "Guide PDF",
      topResourceRel: "alternate",
      topResourceType: "application/pdf",
      topResourceHreflang: "en",
      topResourceSelector: "a[href=\"/guide.pdf\"]",
      topResourceCommand: "ax-grep 'https://example.test/guide.pdf' --agent",
      topResourceCommandArgs: ["ax-grep", "https://example.test/guide.pdf", "--agent"],
      secondResourcePath: "pageCheck.resources[1]",
      secondResourceKind: "feed",
      secondResourceUrl: "https://example.test/feed.xml?lang=en",
      secondResourceUrlPath: "/feed.xml",
      secondResourceUrlQuery: "?lang=en",
      secondResourceTitle: "Feed",
      secondResourceRel: "alternate",
      secondResourceType: "application/rss+xml",
      secondResourceHreflang: "en",
      secondResourceSelector: "link[rel=\"alternate\"]",
      secondResourceCommand: "ax-grep 'https://example.test/feed.xml?lang=en' --agent",
      secondResourceCommandArgs: ["ax-grep", "https://example.test/feed.xml?lang=en", "--agent"],
      topMediaPath: "pageCheck.media[0]",
      topMediaKind: "image",
      topMediaUrl: "https://example.test/diagram.png",
      topMediaUrlPath: "/diagram.png",
      topMediaSelector: "img:nth-of-type(1)",
      topMediaCommand: "ax-grep 'https://example.test/diagram.png' --agent",
      topMediaCommandArgs: ["ax-grep", "https://example.test/diagram.png", "--agent"],
      topMediaText: "Architecture diagram",
      topMediaAlt: "Architecture diagram",
      topMediaCaption: "System architecture overview",
      topMediaTitle: "Architecture",
      topMediaWidth: 1200,
      topMediaHeight: 800,
      secondMediaPath: "pageCheck.media[1]",
      secondMediaKind: "figure",
      secondMediaUrl: "https://example.test/chart.png?size=large",
      secondMediaUrlPath: "/chart.png",
      secondMediaUrlQuery: "?size=large",
      secondMediaSelector: "figure:nth-of-type(1)",
      secondMediaCommand: "ax-grep 'https://example.test/chart.png?size=large' --agent",
      secondMediaCommandArgs: ["ax-grep", "https://example.test/chart.png?size=large", "--agent"],
      secondMediaText: "Chart caption - Revenue chart - https://example.test/chart.png?size=large",
      secondMediaAlt: "Revenue chart",
      secondMediaCaption: "Chart caption",
      secondMediaTitle: "Revenue",
      secondMediaWidth: 640,
      secondMediaHeight: 480,
      topSectionPath: "pageCheck.sections[0]",
      topSectionHeading: "Install",
      topSectionLevel: 2,
      topSectionText: "Install the package.",
      topSectionSelector: "section:nth-of-type(1) > h2:nth-of-type(1)",
      secondSectionPath: "pageCheck.sections[1]",
      secondSectionHeading: "Configure",
      secondSectionLevel: 2,
      secondSectionText: "Configure the package.",
      secondSectionSelector: "section:nth-of-type(2) > h2:nth-of-type(1)",
      topBreadcrumbPath: "pageCheck.breadcrumbs[0]",
      topBreadcrumbText: "Docs > Install",
      topBreadcrumbSource: "html",
      topBreadcrumbSelector: "nav:nth-of-type(1)",
      secondBreadcrumbPath: "pageCheck.breadcrumbs[1]",
      secondBreadcrumbText: "Reference > Install",
      secondBreadcrumbSource: "html",
      secondBreadcrumbSelector: "nav:nth-of-type(2)",
      topPaginationPath: "pageCheck.pagination[0]",
      topPaginationKind: "next",
      topPaginationLabel: "Next",
      topPaginationUrl: "https://example.test/next",
      topPaginationUrlPath: "/next",
      topPaginationCommand: "ax-grep 'https://example.test/next' --agent",
      topPaginationCommandArgs: ["ax-grep", "https://example.test/next", "--agent"],
      topPaginationCurrent: false,
      topPaginationSelector: "a[rel=\"next\"]",
      secondPaginationPath: "pageCheck.pagination[1]",
      secondPaginationKind: "page",
      secondPaginationLabel: "2",
      secondPaginationUrl: "https://example.test/page/2?sort=top",
      secondPaginationUrlPath: "/page/2",
      secondPaginationUrlQuery: "?sort=top",
      secondPaginationCommand: "ax-grep 'https://example.test/page/2?sort=top' --agent",
      secondPaginationCommandArgs: ["ax-grep", "https://example.test/page/2?sort=top", "--agent"],
      secondPaginationCurrent: false,
      secondPaginationSelector: "a[href=\"/page/2\"]",
      topTocPath: "pageCheck.toc[0]",
      topTocTitle: "On this page",
      topTocItemCount: 2,
      topTocText: "Install; Configure",
      topTocFirstItemLabel: "Install",
      topTocFirstItemUrl: "https://example.test/install#install",
      topTocFirstItemUrlPath: "/install",
      topTocFirstItemCommand: "ax-grep 'https://example.test/install#install' --agent",
      topTocFirstItemCommandArgs: ["ax-grep", "https://example.test/install#install", "--agent"],
      topTocSelector: "nav[aria-label=\"On this page\"]",
      secondTocPath: "pageCheck.toc[1]",
      secondTocTitle: "Contents",
      secondTocItemCount: 2,
      secondTocText: "Overview; Methods",
      secondTocFirstItemLabel: "Overview",
      secondTocFirstItemUrl: "https://example.test/docs/api?view=full#overview",
      secondTocFirstItemUrlPath: "/docs/api",
      secondTocFirstItemUrlQuery: "?view=full",
      secondTocFirstItemCommand: "ax-grep 'https://example.test/docs/api?view=full#overview' --agent",
      secondTocFirstItemCommandArgs: ["ax-grep", "https://example.test/docs/api?view=full#overview", "--agent"],
      secondTocSelector: "nav[aria-label=\"Contents\"]",
      topEmbedPath: "pageCheck.embeds[0]",
      topEmbedKind: "iframe",
      topEmbedUrl: "https://example.test/embed",
      topEmbedUrlPath: "/embed",
      topEmbedTitle: "Dashboard",
      topEmbedSelector: "iframe:nth-of-type(1)",
      topEmbedCommand: "ax-grep 'https://example.test/embed' --agent",
      topEmbedCommandArgs: ["ax-grep", "https://example.test/embed", "--agent"],
      secondEmbedPath: "pageCheck.embeds[1]",
      secondEmbedKind: "video",
      secondEmbedUrl: "https://example.test/media/walkthrough.mp4?download=1",
      secondEmbedUrlPath: "/media/walkthrough.mp4",
      secondEmbedUrlQuery: "?download=1",
      secondEmbedTitle: "Product walkthrough",
      secondEmbedSelector: "video:nth-of-type(2)",
      secondEmbedCommand: "ax-grep 'https://example.test/media/walkthrough.mp4?download=1' --agent",
      secondEmbedCommandArgs: ["ax-grep", "https://example.test/media/walkthrough.mp4?download=1", "--agent"],
      topTranscriptPath: "pageCheck.transcripts[0]",
      topTranscriptKind: "transcript",
      topTranscriptUrl: "https://example.test/transcript.txt",
      topTranscriptUrlPath: "/transcript.txt",
      topTranscriptLabel: "Full transcript",
      topTranscriptLanguage: "en",
      topTranscriptSelector: "a[href=\"/transcript.txt\"]",
      topTranscriptCommand: "ax-grep 'https://example.test/transcript.txt' --agent",
      topTranscriptCommandArgs: ["ax-grep", "https://example.test/transcript.txt", "--agent"],
      secondTranscriptPath: "pageCheck.transcripts[1]",
      secondTranscriptKind: "subtitles",
      secondTranscriptUrl: "https://example.test/transcript.ko.vtt?download=1",
      secondTranscriptUrlPath: "/transcript.ko.vtt",
      secondTranscriptUrlQuery: "?download=1",
      secondTranscriptLabel: "Korean subtitles",
      secondTranscriptLanguage: "ko",
      secondTranscriptSelector: "track:nth-of-type(2)",
      secondTranscriptCommand: "ax-grep 'https://example.test/transcript.ko.vtt?download=1' --agent",
      secondTranscriptCommandArgs: ["ax-grep", "https://example.test/transcript.ko.vtt?download=1", "--agent"],
      topAuthorLinkPath: "pageCheck.authorLinks[0]",
      topAuthorLinkName: "Example Author",
      topAuthorLinkUrl: "https://example.test/author",
      topAuthorLinkUrlPath: "/author",
      topAuthorLinkSource: "html",
      topAuthorLinkSelector: "a[rel=\"author\"]",
      topAuthorLinkCommand: "ax-grep 'https://example.test/author' --agent",
      topAuthorLinkCommandArgs: ["ax-grep", "https://example.test/author", "--agent"],
      secondAuthorLinkPath: "pageCheck.authorLinks[1]",
      secondAuthorLinkName: "Second Author",
      secondAuthorLinkUrl: "https://example.test/second-author?profile=1",
      secondAuthorLinkUrlPath: "/second-author",
      secondAuthorLinkUrlQuery: "?profile=1",
      secondAuthorLinkSource: "html",
      secondAuthorLinkSelector: "a[rel=\"author\"]:nth-of-type(2)",
      secondAuthorLinkCommand: "ax-grep 'https://example.test/second-author?profile=1' --agent",
      secondAuthorLinkCommandArgs: ["ax-grep", "https://example.test/second-author?profile=1", "--agent"],
      topProvenancePath: "pageCheck.provenance[0]",
      topProvenanceKind: "doi",
      topProvenanceLabel: "DOI",
      topProvenanceValue: "10.5555/example.2026",
      topProvenanceUrl: "https://doi.org/10.5555/example.2026",
      topProvenanceUrlPath: "/10.5555/example.2026",
      topProvenanceSource: "meta",
      topProvenanceSelector: "meta:nth-of-type(1)",
      topProvenanceCommand: "ax-grep 'https://doi.org/10.5555/example.2026' --agent",
      topProvenanceCommandArgs: ["ax-grep", "https://doi.org/10.5555/example.2026", "--agent"],
      secondProvenancePath: "pageCheck.provenance[1]",
      secondProvenanceKind: "pmid",
      secondProvenanceLabel: "PMID",
      secondProvenanceValue: "12345678",
      secondProvenanceUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/?format=pubmed",
      secondProvenanceUrlPath: "/12345678/",
      secondProvenanceUrlQuery: "?format=pubmed",
      secondProvenanceSource: "meta",
      secondProvenanceSelector: "meta:nth-of-type(2)",
      secondProvenanceCommand: "ax-grep 'https://pubmed.ncbi.nlm.nih.gov/12345678/?format=pubmed' --agent",
      secondProvenanceCommandArgs: ["ax-grep", "https://pubmed.ncbi.nlm.nih.gov/12345678/?format=pubmed", "--agent"],
      topOfferPath: "pageCheck.offers[0]",
      topOfferName: "Agent Browser Pro",
      topOfferPrice: "19.99",
      topOfferPriceAmount: 19.99,
      topOfferCurrency: "USD",
      topOfferAvailability: "InStock",
      topOfferUrl: "https://example.test/buy",
      topOfferUrlPath: "/buy",
      topOfferCommand: "ax-grep 'https://example.test/buy' --agent",
      topOfferCommandArgs: ["ax-grep", "https://example.test/buy", "--agent"],
      topOfferSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      secondOfferPath: "pageCheck.offers[1]",
      secondOfferName: "Agent Browser Team",
      secondOfferPrice: "49.99",
      secondOfferPriceAmount: 49.99,
      secondOfferCurrency: "USD",
      secondOfferAvailability: "PreOrder",
      secondOfferUrl: "https://example.test/team?plan=annual",
      secondOfferUrlPath: "/team",
      secondOfferUrlQuery: "?plan=annual",
      secondOfferCommand: "ax-grep 'https://example.test/team?plan=annual' --agent",
      secondOfferCommandArgs: ["ax-grep", "https://example.test/team?plan=annual", "--agent"],
      secondOfferSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      topDatasetPath: "pageCheck.datasets[0]",
      topDatasetKind: "dataset",
      topDatasetName: "Example dataset",
      topDatasetUrl: "https://example.test/datasets/example",
      topDatasetUrlPath: "/datasets/example",
      topDatasetCommand: "ax-grep 'https://example.test/datasets/example' --agent",
      topDatasetCommandArgs: ["ax-grep", "https://example.test/datasets/example", "--agent"],
      topDatasetDistributionUrl: "https://example.test/downloads/example.csv",
      topDatasetDistributionUrlPath: "/downloads/example.csv",
      topDatasetDistributionCommand: "ax-grep 'https://example.test/downloads/example.csv' --agent",
      topDatasetDistributionCommandArgs: ["ax-grep", "https://example.test/downloads/example.csv", "--agent"],
      topDatasetLicenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      topDatasetLicenseUrlPath: "/licenses/by/4.0/",
      topDatasetLicenseCommand: "ax-grep 'https://creativecommons.org/licenses/by/4.0/' --agent",
      topDatasetLicenseCommandArgs: ["ax-grep", "https://creativecommons.org/licenses/by/4.0/", "--agent"],
      topDatasetEncodingFormat: "text/csv",
      topDatasetTemporalCoverage: "2020/2025",
      topDatasetSpatialCoverage: "United States",
      topDatasetCreator: "Example Lab",
      topDatasetSelector: "script[type=\"application/ld+json\"]:nth-of-type(2)",
      secondDatasetPath: "pageCheck.datasets[1]",
      secondDatasetKind: "dataDownload",
      secondDatasetName: "Population parquet data",
      secondDatasetUrl: "https://example.test/downloads/population.parquet",
      secondDatasetUrlPath: "/downloads/population.parquet",
      secondDatasetCommand: "ax-grep 'https://example.test/downloads/population.parquet' --agent",
      secondDatasetCommandArgs: ["ax-grep", "https://example.test/downloads/population.parquet", "--agent"],
      secondDatasetDistributionUrl: "https://example.test/downloads/population.parquet",
      secondDatasetDistributionUrlPath: "/downloads/population.parquet",
      secondDatasetDistributionCommand: "ax-grep 'https://example.test/downloads/population.parquet' --agent",
      secondDatasetDistributionCommandArgs: ["ax-grep", "https://example.test/downloads/population.parquet", "--agent"],
      secondDatasetEncodingFormat: "application/vnd.apache.parquet",
      secondDatasetSelector: "a[href=\"/downloads/population.parquet\"]",
      topIdentityPath: "pageCheck.identities[0]",
      topIdentityKind: "organization",
      topIdentityName: "Example Labs",
      topIdentityUrl: "https://example.test",
      topIdentityUrlPath: "/",
      topIdentityCommand: "ax-grep 'https://example.test' --agent",
      topIdentityCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      topIdentityLogoUrl: "https://example.test/logo.png",
      topIdentityLogoUrlPath: "/logo.png",
      topIdentityLogoCommand: "ax-grep 'https://example.test/logo.png' --agent",
      topIdentityLogoCommandArgs: ["ax-grep", "https://example.test/logo.png", "--agent"],
      topIdentitySameAsUrl: "https://github.com/example",
      topIdentitySameAsUrlPath: "/example",
      topIdentitySameAsCommand: "ax-grep 'https://github.com/example' --agent",
      topIdentitySameAsCommandArgs: ["ax-grep", "https://github.com/example", "--agent"],
      topIdentitySource: "json-ld",
      topIdentitySelector: "script[type=\"application/ld+json\"]:nth-of-type(3)",
      secondIdentityPath: "pageCheck.identities[1]",
      secondIdentityKind: "website",
      secondIdentityName: "Example Docs",
      secondIdentityUrl: "https://example.test/docs",
      secondIdentityUrlPath: "/docs",
      secondIdentityCommand: "ax-grep 'https://example.test/docs' --agent",
      secondIdentityCommandArgs: ["ax-grep", "https://example.test/docs", "--agent"],
      secondIdentityLogoUrl: "https://example.test/docs-logo.png",
      secondIdentityLogoUrlPath: "/docs-logo.png",
      secondIdentityLogoCommand: "ax-grep 'https://example.test/docs-logo.png' --agent",
      secondIdentityLogoCommandArgs: ["ax-grep", "https://example.test/docs-logo.png", "--agent"],
      secondIdentitySameAsUrl: "https://github.com/example/docs",
      secondIdentitySameAsUrlPath: "/example/docs",
      secondIdentitySameAsCommand: "ax-grep 'https://github.com/example/docs' --agent",
      secondIdentitySameAsCommandArgs: ["ax-grep", "https://github.com/example/docs", "--agent"],
      secondIdentitySource: "json-ld",
      secondIdentitySelector: "script[type=\"application/ld+json\"]:nth-of-type(4)",
      topTimelinePath: "pageCheck.timeline[0]",
      topTimelineKind: "published",
      topTimelineLabel: "Published",
      topTimelineValue: "2026-06-01T09:00:00Z",
      topTimelineIsoDate: "2026-06-01T09:00:00.000Z",
      topTimelineUnixMs: Date.parse("2026-06-01T09:00:00Z"),
      topTimelineSource: "meta",
      topTimelineSelector: "meta[property=\"article:published_time\"]",
      secondTimelinePath: "pageCheck.timeline[1]",
      secondTimelineKind: "modified",
      secondTimelineLabel: "Modified",
      secondTimelineValue: "2026-06-08T10:30:00Z",
      secondTimelineIsoDate: "2026-06-08T10:30:00.000Z",
      secondTimelineUnixMs: Date.parse("2026-06-08T10:30:00Z"),
      secondTimelineSource: "json-ld",
      secondTimelineSelector: "script[type=\"application/ld+json\"]:nth-of-type(4)",
      topContactPointPath: "pageCheck.contactPoints[0]",
      topContactPointKind: "contact-url",
      topContactPointLabel: "Press",
      topContactPointValue: "Press",
      topContactPointUrl: "https://example.test/contact/press",
      topContactPointUrlPath: "/contact/press",
      topContactPointCommand: "ax-grep 'https://example.test/contact/press' --agent",
      topContactPointCommandArgs: ["ax-grep", "https://example.test/contact/press", "--agent"],
      topContactPointSource: "html",
      topContactPointSelector: "a[href=\"/contact/press\"]",
      secondContactPointPath: "pageCheck.contactPoints[1]",
      secondContactPointKind: "contact-url",
      secondContactPointLabel: "Support",
      secondContactPointValue: "Support",
      secondContactPointUrl: "https://example.test/support",
      secondContactPointUrlPath: "/support",
      secondContactPointCommand: "ax-grep 'https://example.test/support' --agent",
      secondContactPointCommandArgs: ["ax-grep", "https://example.test/support", "--agent"],
      secondContactPointSource: "json-ld",
      secondContactPointSelector: "script[type=\"application/ld+json\"]:nth-of-type(5)",
      structuredReadTargetCount: 2,
      bestStructuredReadTarget: "pageCheck.dataTables",
      bestStructuredReadTargetCount: 1,
      bestStructuredReadTargetScore: 0.55,
      bestStructuredReadTargetPrimary: true,
      bestStructuredReadTargetReason: "Structured table captions, headers, and sample rows extracted from the page HTML.",
      hiddenSignalCount: 4,
      hiddenHydrationCount: 1,
      hiddenApiEndpointCount: 2,
      hiddenClientStateCount: 1,
      hiddenRuntimeCount: 1,
      hiddenConfigCount: 1,
      hiddenAppHintCount: 0,
      hiddenMobileHintCount: 1,
      hiddenTopicCount: 1,
      hiddenKeyValueCount: 1,
      hiddenMetaFactCount: 1,
      hiddenHttpPolicyCount: 1,
      hiddenSchemaFactCount: 1,
      topHydrationPath: "pageCheck.hydration[0]",
      topHydrationKind: "next-data",
      topHydrationLabel: "Next.js data",
      topHydrationUrl: "https://example.test/_next/data/build/index.json",
      topHydrationUrlPath: "/_next/data/build/index.json",
      topHydrationCommand: "ax-grep 'https://example.test/_next/data/build/index.json' --agent",
      topHydrationCommandArgs: ["ax-grep", "https://example.test/_next/data/build/index.json", "--agent"],
      topHydrationSelector: "script#__NEXT_DATA__",
      secondHydrationPath: "pageCheck.hydration[1]",
      secondHydrationKind: "fetch-preload",
      secondHydrationLabel: "Fetch preload",
      secondHydrationUrl: "https://example.test/api/bootstrap.json?locale=en",
      secondHydrationUrlPath: "/api/bootstrap.json",
      secondHydrationUrlQuery: "?locale=en",
      secondHydrationCommand: "ax-grep 'https://example.test/api/bootstrap.json?locale=en' --agent",
      secondHydrationCommandArgs: ["ax-grep", "https://example.test/api/bootstrap.json?locale=en", "--agent"],
      secondHydrationSelector: "link[rel=\"preload\"]",
      topApiEndpointPath: "pageCheck.apiEndpoints[0]",
      topApiEndpointKind: "graphql",
      topApiEndpointMethod: "GET",
      topApiEndpointUrl: "https://example.test/graphql",
      topApiEndpointUrlPath: "/graphql",
      topApiEndpointCommand: "ax-grep 'https://example.test/graphql' --agent",
      topApiEndpointCommandArgs: ["ax-grep", "https://example.test/graphql", "--agent"],
      topApiEndpointSelector: "script:nth-of-type(1)",
      secondApiEndpointPath: "pageCheck.apiEndpoints[1]",
      secondApiEndpointKind: "fetch",
      secondApiEndpointMethod: "GET",
      secondApiEndpointUrl: "https://example.test/api/status?format=json",
      secondApiEndpointUrlPath: "/api/status",
      secondApiEndpointUrlQuery: "?format=json",
      secondApiEndpointCommand: "ax-grep 'https://example.test/api/status?format=json' --agent",
      secondApiEndpointCommandArgs: ["ax-grep", "https://example.test/api/status?format=json", "--agent"],
      secondApiEndpointSelector: "script:nth-of-type(2)",
      topClientStatePath: "pageCheck.clientState[0]",
      topClientStateKind: "local-storage",
      topClientStateOperation: "read",
      topClientStateKey: "session",
      topClientStateSelector: "script:nth-of-type(2)",
      secondClientStatePath: "pageCheck.clientState[1]",
      secondClientStateKind: "session-storage",
      secondClientStateOperation: "write",
      secondClientStateKey: "returnTo",
      secondClientStateSelector: "script:nth-of-type(2)",
      topRuntimePath: "pageCheck.runtime[0]",
      topRuntimeKind: "service-worker",
      topRuntimeUrl: "https://example.test/sw.js",
      topRuntimeUrlPath: "/sw.js",
      topRuntimeCommand: "ax-grep 'https://example.test/sw.js' --agent",
      topRuntimeCommandArgs: ["ax-grep", "https://example.test/sw.js", "--agent"],
      topRuntimeSelector: "script:nth-of-type(3)",
      secondRuntimePath: "pageCheck.runtime[1]",
      secondRuntimeKind: "web-worker",
      secondRuntimeUrl: "https://example.test/workers/search.js?version=2",
      secondRuntimeUrlPath: "/workers/search.js",
      secondRuntimeUrlQuery: "?version=2",
      secondRuntimeCommand: "ax-grep 'https://example.test/workers/search.js?version=2' --agent",
      secondRuntimeCommandArgs: ["ax-grep", "https://example.test/workers/search.js?version=2", "--agent"],
      secondRuntimeSelector: "script:nth-of-type(3)",
      topConfigPath: "pageCheck.config[0]",
      topConfigKind: "env",
      topConfigName: "__APP_CONFIG__",
      topConfigKeys: ["apiBase", "featureFlags"],
      topConfigKeyCount: 2,
      topConfigSelector: "script:nth-of-type(4)",
      secondConfigPath: "pageCheck.config[1]",
      secondConfigKind: "feature-flags",
      secondConfigName: "__INITIAL_STATE__",
      secondConfigKeys: ["user", "route"],
      secondConfigKeyCount: 2,
      secondConfigSelector: "script:nth-of-type(4)",
      topAppHintPath: "pageCheck.appHints[0]",
      topAppHintKind: "manifest",
      topAppHintLabel: "manifest",
      topAppHintUrl: "https://example.test/manifest.json",
      topAppHintUrlPath: "/manifest.json",
      topAppHintCommand: "ax-grep 'https://example.test/manifest.json' --agent",
      topAppHintCommandArgs: ["ax-grep", "https://example.test/manifest.json", "--agent"],
      topAppHintSelector: "link[rel=\"manifest\"]",
      topMobileHintPath: "pageCheck.mobileHints[0]",
      topMobileHintKind: "viewport",
      topMobileHintLabel: "viewport",
      topMobileHintValue: "width=device-width, initial-scale=1",
      topMobileHintPlatform: "ios",
      topMobileHintUrl: "https://example.test/app",
      topMobileHintUrlPath: "/app",
      topMobileHintSelector: "meta[name=\"viewport\"]",
      topTopicPath: "pageCheck.topics[0]",
      topTopicKind: "keyword",
      topTopicLabel: "keywords",
      topTopicValue: "agent",
      topTopicSource: "meta",
      topTopicSelector: "meta[name=\"keywords\"]",
      topKeyValuePath: "pageCheck.keyValues[0]",
      topKeyValueLabel: "Version",
      topKeyValueValue: "1.2.3",
      topKeyValueDatetime: "2026-06-01",
      topKeyValueSource: "definition-list",
      topKeyValueSelector: "dl:nth-of-type(1)",
      topMetaFactPath: "pageCheck.metaFacts[0]",
      topMetaFactLabel: "generator",
      topMetaFactValue: "ax-grep",
      topMetaFactUrl: "https://example.test/generator",
      topMetaFactSource: "meta",
      topMetaFactSelector: "meta[name=\"generator\"]",
      topHttpPolicyPath: "pageCheck.httpPolicies[0]",
      topHttpPolicyName: "Content-Security-Policy",
      topHttpPolicyValue: "default-src 'self'",
      topHttpPolicySource: "header",
      topHttpPolicySelector: "meta[http-equiv=\"content-security-policy\"]",
      topSchemaFactPath: "pageCheck.schemaFacts[0]",
      topSchemaFactTypes: ["Product"],
      topSchemaFactFirstLabel: "Name",
      topSchemaFactFirstValue: "Agent Browser Pro",
      topSchemaFactFactCount: 2,
      topSchemaFactSelector: "script[type=\"application/ld+json\"]",
      hiddenReadTargetCount: 2,
      topHiddenSignalGroup: "apiEndpoints",
      topHiddenSignalPath: "pageCheck.apiEndpoints[0]",
      topHiddenSignalKind: "graphql",
      topHiddenSignalText: "graphql endpoint: https://example.test/graphql",
      topHiddenSignalUrl: "https://example.test/graphql",
      topHiddenSignalUrlPath: "/graphql",
      topHiddenSignalSource: "script",
      topHiddenSignalSelector: "script:nth-of-type(1)",
      bestHiddenReadTarget: "pageCheck.apiEndpoints",
      bestHiddenReadTargetCount: 4,
      bestHiddenReadTargetScore: 0.74,
      bestHiddenReadTargetPrimary: true,
      bestHiddenReadTargetReason: "Hidden API endpoints.",
      sourceLinkCount: 1,
      sourceChoiceCount: 1,
      topSourceChoicePath: "pageCheck.sourceLinks[0]",
      topSourceChoiceTitle: "Source",
      topSourceChoiceUrl: "https://source.example/report?ref=docs",
      topSourceChoiceHost: "source.example",
      topSourceChoiceUrlPath: "/report",
      topSourceChoiceUrlQuery: "?ref=docs",
      topSourceChoiceKind: "external",
      topSourceChoiceRank: 1,
      topSourceChoiceText: "Source",
      topSourceChoiceSnippet: "Source summary",
      topSourceChoiceDateText: "2026-05-31",
      topSourceChoiceDateIso: "2026-05-31T00:00:00.000Z",
      topSourceChoiceDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      topSourceChoiceDatePrecision: "day",
      topSourceChoiceDateSource: "title",
      topSourceChoiceCommand: "ax-grep https://source.example/report?ref=docs --agent-brief",
      topSourceChoiceCommandArgs: ["ax-grep", "https://source.example/report?ref=docs", "--agent-brief"],
      topSourceChoiceSourceType: "report",
      topSourceChoiceSourceScore: 0.91,
      topSourceChoiceSourceHints: ["report", "external"],
      topSourceChoiceRelevance: "high",
      topSourceChoiceMatchedTerm: "source",
      topSourceChoiceFindMatch: "Source",
      topSourceChoiceLikelyOfficial: true,
      topSourceChoicePrimary: true,
      topSourceChoiceSelector: "a:nth-of-type(1)",
      topSourceChoiceReason: "High-quality source link.",
      secondSourceChoicePath: "pageCheck.sourceLinks[1]",
      secondSourceChoiceTitle: "Backup source",
      secondSourceChoiceUrl: "https://backup.example/report?ref=docs",
      secondSourceChoiceHost: "backup.example",
      secondSourceChoiceUrlPath: "/report",
      secondSourceChoiceUrlQuery: "?ref=docs",
      secondSourceChoiceKind: "external",
      secondSourceChoiceRank: 2,
      secondSourceChoiceText: "Backup source",
      secondSourceChoiceSnippet: "Backup source summary",
      secondSourceChoiceDateText: "2026-06-01",
      secondSourceChoiceDateIso: "2026-06-01T00:00:00.000Z",
      secondSourceChoiceDateUnixMs: Date.parse("2026-06-01T00:00:00.000Z"),
      secondSourceChoiceDatePrecision: "day",
      secondSourceChoiceDateSource: "snippet",
      secondSourceChoiceCommand: "ax-grep https://backup.example/report?ref=docs --agent-brief",
      secondSourceChoiceCommandArgs: ["ax-grep", "https://backup.example/report?ref=docs", "--agent-brief"],
      secondSourceChoiceSourceType: "report",
      secondSourceChoiceSourceScore: 0.82,
      secondSourceChoiceSourceHints: ["report"],
      secondSourceChoiceRelevance: "medium",
      secondSourceChoiceMatchedTerm: "backup",
      secondSourceChoiceFindMatch: "Backup",
      secondSourceChoiceLikelyOfficial: false,
      secondSourceChoicePrimary: false,
      secondSourceChoiceSelector: "a:nth-of-type(2)",
      secondSourceChoiceReason: "Backup source link.",
      topChoiceKind: "source",
      topChoicePath: "pageCheck.sourceLinks[0]",
      topChoiceLabel: "Source",
      topChoiceUrl: "https://source.example/report?ref=docs",
      topChoiceUrlPath: "/report",
      topChoiceUrlQuery: "?ref=docs",
      topChoiceHost: "source.example",
      topChoiceSnippet: "Source summary",
      topChoiceDateText: "2026-05-31",
      topChoiceDateIso: "2026-05-31T00:00:00.000Z",
      topChoiceDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      topChoiceDatePrecision: "day",
      topChoiceDateSource: "snippet",
      topChoiceCommand: "ax-grep https://source.example/report?ref=docs --agent",
      topChoiceCommandArgs: ["ax-grep", "https://source.example/report?ref=docs", "--agent"],
      topChoiceRank: 1,
      topChoicePrimary: true,
      topChoiceSource: "source.example",
      topChoiceSourceType: "report",
      topChoiceSourceScore: 0.91,
      topChoiceRelevance: "high",
      topChoiceLikelyOfficial: true,
      topChoiceMethod: "GET",
      topChoiceRequiredFieldName: "q",
      topChoiceRequiredFieldSelector: "input[name=\"q\"]",
      topChoiceInvalidFieldName: "q",
      topChoiceInvalidFieldInvalid: "spelling",
      topChoiceInvalidFieldSelector: "input[name=\"q\"]",
      topChoiceSelector: "a:nth-of-type(1)",
      topChoiceReason: "High-quality source link.",
      sourceSearchQuery: "ax-grep docs",
      sourceSearchEngine: "auto",
      sourceSearchSelectedEngine: "duckduckgo",
      sourceSearchEngineAttemptCount: 3,
      sourceSearchEngineSuccessCount: 1,
      sourceSearchEngineFailureCount: 2,
      sourceSearchFirstOkEngine: "duckduckgo",
      sourceSearchFirstOkResultCount: 2,
      sourceSearchFirstFailedEngine: "bing",
      sourceSearchFirstFailureCode: "HTTP_ERROR",
      sourceSearchFirstFailureStatus: 403,
      sourceSearchSearchUrl: "https://duckduckgo.com/html/?q=ax-grep%20docs",
      sourceSearchLang: "en",
      sourceSearchRegion: "us",
      sourceSearchFindQueryCount: 1,
      sourceSearchTopFindQuery: "install",
      sourceSearchSelectedRank: 2,
      sourceSearchSelectedTitle: "ax-grep documentation",
      sourceSearchSelectedUrl: "https://source.example/result",
      sourceSearchSelectedUrlPath: "/result",
      sourceSearchSelectedHost: "source.example",
      sourceSearchSelectedSource: "source.example",
      sourceSearchSelectedSourceType: "official",
      sourceSearchSelectedSourceHints: ["documentation"],
      sourceSearchSelectedPath: "sourceSearch.selectedResult",
      sourceSearchSelectedSnippet: "Selected source summary",
      sourceSearchSelectedDateText: "2026-05-31",
      sourceSearchSelectedDateIso: "2026-05-31T00:00:00.000Z",
      sourceSearchSelectedDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      sourceSearchSelectedDatePrecision: "day",
      sourceSearchSelectedDateSource: "snippet",
      sourceSearchSelectedMatchedTerm: "ax-grep",
      sourceSearchSelectedFindMatch: "install",
      sourceSearchSelectedSitelinkCount: 1,
      sourceSearchSelectedFirstSitelinkTitle: "Install",
      sourceSearchSelectedFirstSitelinkUrl: "https://source.example/result#install",
      sourceSearchSelectedFirstSitelinkUrlPath: "/result",
      sourceSearchSelectedFirstSitelinkSelector: "a",
      sourceSearchSelectedFirstSitelinkCommand: "ax-grep 'https://source.example/result#install' --agent",
      sourceSearchSelectedFirstSitelinkCommandArgs: ["ax-grep", "https://source.example/result#install", "--agent"],
      sourceSearchSelectedOpenResult: 2,
      sourceSearchSelectedCommand: "ax-grep --search 'ax-grep docs' --open-result 2 --agent",
      sourceSearchSelectedCommandArgs: ["ax-grep", "--search", "ax-grep docs", "--open-result", "2", "--agent"],
      sourceSearchSelectedSourceScore: 0.91,
      sourceSearchSelectedRelevance: "high",
      sourceSearchSelectedLikelyOfficial: true,
      sourceSearchSelectedReason: "Selected source result.",
      sourceSearchFailureCode: "HTTP_ERROR",
      sourceSearchFailureStatus: 403,
      sourceSearchFailureKind: "http-client-error",
      sourceSearchFailureRetryable: false,
      sourceSearchFailureRetryAfter: "120",
      sourceSearchFailurePath: "sourceSearch.selectedResult",
      sourceSearchFailureUrl: "https://source.example/result",
      sourceSearchFailureUrlPath: "/result",
      sourceSearchFailureHost: "source.example",
      sourceSearchFailureReason: "Selected sourceSearch result failed with HTTP_ERROR status 403.",
      sourceSearchFailureCommand: "ax-grep --search 'ax-grep docs' --open-result 2 --agent",
      sourceSearchFailureCommandArgs: ["ax-grep", "--search", "ax-grep docs", "--open-result", "2", "--agent"],
      sourceSearchAlternateCount: 1,
      sourceSearchAlternatePath: "sourceSearch.alternateResults[0]",
      sourceSearchAlternateTitle: "ax-grep mirror",
      sourceSearchAlternateUrl: "https://mirror.example/result?ref=mirror",
      sourceSearchAlternateUrlPath: "/result",
      sourceSearchAlternateUrlQuery: "?ref=mirror",
      sourceSearchAlternateHost: "mirror.example",
      sourceSearchAlternateSource: "mirror.example",
      sourceSearchAlternateSourceType: "community",
      sourceSearchAlternateSourceHints: ["mirror"],
      sourceSearchAlternateRank: 3,
      sourceSearchAlternateSnippet: "Alternate source summary",
      sourceSearchAlternateDateText: "2026-05-30",
      sourceSearchAlternateDateIso: "2026-05-30T00:00:00.000Z",
      sourceSearchAlternateDateUnixMs: Date.parse("2026-05-30T00:00:00.000Z"),
      sourceSearchAlternateDatePrecision: "day",
      sourceSearchAlternateDateSource: "snippet",
      sourceSearchAlternateMatchedTerm: "docs",
      sourceSearchAlternateFindMatch: "mirror",
      sourceSearchAlternateSitelinkCount: 1,
      sourceSearchAlternateFirstSitelinkTitle: "Mirror",
      sourceSearchAlternateFirstSitelinkUrl: "https://mirror.example/result#mirror",
      sourceSearchAlternateFirstSitelinkUrlPath: "/result",
      sourceSearchAlternateFirstSitelinkSelector: "a",
      sourceSearchAlternateFirstSitelinkCommand: "ax-grep 'https://mirror.example/result#mirror' --agent",
      sourceSearchAlternateFirstSitelinkCommandArgs: ["ax-grep", "https://mirror.example/result#mirror", "--agent"],
      sourceSearchAlternateOpenResult: 3,
      sourceSearchAlternateCommand: "ax-grep --search 'ax-grep docs' --open-result 3 --agent",
      sourceSearchAlternateCommandArgs: ["ax-grep", "--search", "ax-grep docs", "--open-result", "3", "--agent"],
      sourceSearchAlternateSourceScore: 0.64,
      sourceSearchAlternateRelevance: "medium",
      sourceSearchAlternateLikelyOfficial: false,
      sourceSearchAlternateDifferentHost: true,
      sourceSearchAlternateReason: "Alternate source result.",
      sourceSearchSecondAlternatePath: "sourceSearch.alternateResults[1]",
      sourceSearchSecondAlternateTitle: "ax-grep backup mirror",
      sourceSearchSecondAlternateUrl: "https://backup.example/result?ref=backup",
      sourceSearchSecondAlternateUrlPath: "/result",
      sourceSearchSecondAlternateUrlQuery: "?ref=backup",
      sourceSearchSecondAlternateHost: "backup.example",
      sourceSearchSecondAlternateSource: "backup.example",
      sourceSearchSecondAlternateSourceType: "community",
      sourceSearchSecondAlternateSourceHints: ["backup"],
      sourceSearchSecondAlternateRank: 4,
      sourceSearchSecondAlternateSnippet: "Second alternate source summary",
      sourceSearchSecondAlternateDateText: "2026-05-31",
      sourceSearchSecondAlternateDateIso: "2026-05-31T00:00:00.000Z",
      sourceSearchSecondAlternateDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      sourceSearchSecondAlternateDatePrecision: "day",
      sourceSearchSecondAlternateDateSource: "snippet",
      sourceSearchSecondAlternateMatchedTerm: "docs",
      sourceSearchSecondAlternateFindMatch: "backup",
      sourceSearchSecondAlternateSitelinkCount: 1,
      sourceSearchSecondAlternateFirstSitelinkTitle: "Backup Docs",
      sourceSearchSecondAlternateFirstSitelinkUrl: "https://backup.example/result/docs?ref=backup",
      sourceSearchSecondAlternateFirstSitelinkUrlPath: "/result/docs",
      sourceSearchSecondAlternateFirstSitelinkUrlQuery: "?ref=backup",
      sourceSearchSecondAlternateFirstSitelinkSelector: "a",
      sourceSearchSecondAlternateFirstSitelinkCommand: "ax-grep 'https://backup.example/result/docs?ref=backup' --agent",
      sourceSearchSecondAlternateFirstSitelinkCommandArgs: ["ax-grep", "https://backup.example/result/docs?ref=backup", "--agent"],
      sourceSearchSecondAlternateOpenResult: 4,
      sourceSearchSecondAlternateCommand: "ax-grep --search 'ax-grep docs' --open-result 4 --agent",
      sourceSearchSecondAlternateCommandArgs: ["ax-grep", "--search", "ax-grep docs", "--open-result", "4", "--agent"],
      sourceSearchSecondAlternateSourceScore: 0.52,
      sourceSearchSecondAlternateRelevance: "low",
      sourceSearchSecondAlternateLikelyOfficial: false,
      sourceSearchSecondAlternateDifferentHost: true,
      sourceSearchSecondAlternateReason: "Second alternate source result.",
      sourceSearchAlternateChoices: [{
        id: "a3",
        path: "sourceSearch.alternateResults[0]",
        title: "ax-grep mirror",
        url: "https://mirror.example/result?ref=mirror",
        urlPath: "/result",
        urlQuery: "?ref=mirror",
        host: "mirror.example",
        source: "mirror.example",
        rank: 3,
        snippet: "Alternate source summary",
        dateText: "2026-05-30",
        datePrecision: "day",
        dateSource: "snippet",
        matchedTerms: ["docs"],
        findMatches: ["mirror"],
        sitelinks: [{
          title: "Mirror docs",
          url: "https://mirror.example/result#docs",
          selector: "a",
          command: "ax-grep 'https://mirror.example/result#docs' --agent",
          commandArgs: ["ax-grep", "https://mirror.example/result#docs", "--agent"],
        }],
        openResult: 3,
        command: "ax-grep --search 'ax-grep docs' --open-result 3 --agent",
        commandArgs: ["ax-grep", "--search", "ax-grep docs", "--open-result", "3", "--agent"],
        sourceScore: 0.64,
        relevance: "medium",
        isLikelyOfficial: false,
      }],
      verificationFoundQueries: ["present"],
      verificationMissingQueries: ["missing"],
      topVerificationFoundQuery: "present",
      topVerificationMissingQuery: "missing",
      citationCount: 2,
      topCitationId: "e1",
      topCitationPath: "pageCheck.contentEvidence[0]",
      topCitationKind: "content",
      topCitationText: "Readable evidence",
      topCitationTitle: "Example evidence",
      topCitationUrl: "https://example.test",
      topCitationUrlPath: "/",
      topCitationCommand: "ax-grep https://example.test --agent",
      topCitationCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      topCitationConfidence: "high",
      topCitationReason: "Primary citation.",
      topCitationScore: 0.9,
      secondCitationId: "s1",
      secondCitationPath: "pageCheck.sourceLinks[0]",
      secondCitationKind: "source-link",
      secondCitationText: "Source report",
      secondCitationTitle: "Report",
      secondCitationUrl: "https://source.example/report?ref=agent",
      secondCitationUrlPath: "/report",
      secondCitationUrlQuery: "?ref=agent",
      secondCitationCommand: "ax-grep https://source.example/report?ref=agent --agent",
      secondCitationCommandArgs: ["ax-grep", "https://source.example/report?ref=agent", "--agent"],
      secondCitationConfidence: "medium",
      secondCitationReason: "Source citation.",
      secondCitationScore: 0.58,
      answerEvidenceCount: 2,
      topAnswerEvidenceId: "e1",
      topAnswerEvidencePath: "pageCheck.contentEvidence[0]",
      topAnswerEvidenceKind: "content",
      topAnswerEvidenceText: "Readable evidence",
      topAnswerEvidenceTitle: "Example evidence",
      topAnswerEvidenceUrl: "https://example.test",
      topAnswerEvidenceUrlPath: "/",
      topAnswerEvidenceCommand: "ax-grep https://example.test --agent",
      topAnswerEvidenceCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      topAnswerEvidenceConfidence: "high",
      topAnswerEvidenceReason: "Primary answer evidence.",
      topAnswerEvidenceScore: 0.9,
      secondAnswerEvidenceId: "e2",
      secondAnswerEvidencePath: "pageCheck.contentEvidence[1]",
      secondAnswerEvidenceKind: "content",
      secondAnswerEvidenceText: "Additional evidence",
      secondAnswerEvidenceTitle: "Additional evidence title",
      secondAnswerEvidenceUrl: "https://example.test/evidence?ref=2",
      secondAnswerEvidenceUrlPath: "/evidence",
      secondAnswerEvidenceUrlQuery: "?ref=2",
      secondAnswerEvidenceCommand: "ax-grep https://example.test/evidence?ref=2 --agent",
      secondAnswerEvidenceCommandArgs: ["ax-grep", "https://example.test/evidence?ref=2", "--agent"],
      secondAnswerEvidenceConfidence: "medium",
      secondAnswerEvidenceReason: "Secondary answer evidence.",
      secondAnswerEvidenceScore: 0.72,
      searchDecision: {
        decision: "open-result",
        confidence: "high",
        reason: "Use the best result.",
        resultCount: 2,
        highRelevanceCount: 1,
        mediumRelevanceCount: 1,
        lowRelevanceCount: 0,
        officialCount: 1,
        findMatchCount: 1,
        recommendedRank: 1,
        recommendedPath: "recommendedResult",
        recommendedTitle: "Example result",
        recommendedUrl: "https://example.test",
        recommendedUrlPath: "/",
        recommendedSource: "example.test",
        recommendedSourceScore: 0.92,
        recommendedSourceType: "official",
        recommendedSourceHints: ["documentation"],
        recommendedDateText: "2026-05-31",
        recommendedDateIso: "2026-05-31T00:00:00.000Z",
        recommendedDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
        recommendedDatePrecision: "day",
        recommendedDateSource: "snippet",
        recommendedRelevance: "high",
        recommendedLikelyOfficial: true,
        firstOfficialRank: 1,
        firstOfficialPath: "searchResults[0]",
        firstOfficialTitle: "Example result",
        firstOfficialUrl: "https://example.test",
        firstOfficialSource: "example.test",
        firstOfficialSourceScore: 0.92,
        firstOfficialSourceType: "official",
        firstOfficialSourceHints: ["documentation"],
        firstOfficialDateText: "2026-05-31",
        firstOfficialDateIso: "2026-05-31T00:00:00.000Z",
        firstOfficialDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
        firstOfficialDatePrecision: "day",
        firstOfficialDateSource: "snippet",
        firstOfficialRelevance: "high",
        firstOfficialCommand: "ax-grep https://example.test --agent",
        firstOfficialCommandArgs: ["ax-grep", "https://example.test", "--agent"],
        command: "ax-grep --search example --open-result 1 --agent",
        commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent"],
      },
      searchDecisionName: "open-result",
      searchDecisionConfidence: "high",
      searchDecisionReason: "Use the best result.",
      searchDecisionResultCount: 2,
      searchDecisionHighRelevanceCount: 1,
      searchDecisionMediumRelevanceCount: 1,
      searchDecisionLowRelevanceCount: 0,
      searchDecisionOfficialCount: 1,
      searchDecisionFindMatchCount: 1,
      searchDecisionRecommendedRank: 1,
      searchDecisionRecommendedPath: "recommendedResult",
      searchDecisionRecommendedTitle: "Example result",
      searchDecisionRecommendedUrl: "https://example.test",
      searchDecisionRecommendedUrlPath: "/",
      searchDecisionRecommendedSource: "example.test",
      searchDecisionRecommendedSourceScore: 0.92,
      searchDecisionRecommendedSourceType: "official",
      searchDecisionRecommendedSourceHints: ["documentation"],
      searchDecisionRecommendedDateText: "2026-05-31",
      searchDecisionRecommendedDateIso: "2026-05-31T00:00:00.000Z",
      searchDecisionRecommendedDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      searchDecisionRecommendedDatePrecision: "day",
      searchDecisionRecommendedDateSource: "snippet",
      searchDecisionRecommendedRelevance: "high",
      searchDecisionRecommendedLikelyOfficial: true,
      searchDecisionFirstOfficialRank: 1,
      searchDecisionFirstOfficialPath: "searchResults[0]",
      searchDecisionFirstOfficialTitle: "Example result",
      searchDecisionFirstOfficialUrl: "https://example.test",
      searchDecisionFirstOfficialSource: "example.test",
      searchDecisionFirstOfficialSourceScore: 0.92,
      searchDecisionFirstOfficialSourceType: "official",
      searchDecisionFirstOfficialSourceHints: ["documentation"],
      searchDecisionFirstOfficialDateText: "2026-05-31",
      searchDecisionFirstOfficialDateIso: "2026-05-31T00:00:00.000Z",
      searchDecisionFirstOfficialDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      searchDecisionFirstOfficialDatePrecision: "day",
      searchDecisionFirstOfficialDateSource: "snippet",
      searchDecisionFirstOfficialRelevance: "high",
      searchDecisionFirstOfficialCommand: "ax-grep https://example.test --agent",
      searchDecisionFirstOfficialCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      searchDecisionCommand: "ax-grep --search example --open-result 1 --agent",
      searchDecisionCommandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent"],
      pageDecision: {
        decision: "read-content",
        confidence: "high",
        reason: "Readable content is available.",
        readability: "high",
        readabilityScore: 0.95,
        evidenceCount: 2,
        evidenceQualityScore: 0.9,
        sourceLinkCount: 1,
        sourceQualityScore: 0.92,
        readFrom: "pageCheck.contentEvidence",
        url: "https://example.test",
        commandArgs: ["ax-grep", "https://example.test", "--agent"],
      },
      pageDecisionName: "read-content",
      pageDecisionConfidence: "high",
      pageDecisionReason: "Readable content is available.",
      pageDecisionReadability: "high",
      pageDecisionReadabilityScore: 0.95,
      pageDecisionEvidenceCount: 2,
      pageDecisionEvidenceQualityScore: 0.9,
      pageDecisionSourceLinkCount: 1,
      pageDecisionSourceQualityScore: 0.92,
      pageDecisionReadFrom: "pageCheck.contentEvidence",
      pageDecisionReadTargetKind: "evidence",
      pageDecisionReadTargetCount: 1,
      pageDecisionReadTargetScore: 0.9,
      pageDecisionReadTargetPrimary: true,
      pageDecisionReadTargetReason: "Top evidence.",
      pageDecisionUrl: "https://example.test",
      pageDecisionCommand: "ax-grep https://example.test --agent",
      pageDecisionCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      semanticSummary: {
        nodeCount: 12,
        namedRoleCount: 4,
        interactiveCount: 2,
        focusableCount: 2,
        headingCount: 1,
        landmarkCount: 1,
        linkCount: 2,
        buttonCount: 1,
        imageCount: 1,
        tableCount: 1,
        listCount: 1,
        fieldCount: 1,
        descriptionCount: 1,
        valueCount: 1,
        relationCount: 1,
        choiceCount: 1,
        stateCount: 1,
        unavailableCount: 1,
        roleCounts: { link: 2, button: 1 },
        topRoles: [{ role: "link", count: 2 }],
        landmarks: ["main"],
        headings: ["Example"],
        namedRoles: ["button:Save"],
        semanticOutline: [{
          path: "agent.semanticSummary.semanticOutline[0]",
          kind: "heading",
          role: "heading",
          text: "Example",
          level: 1,
          depth: 1,
          selector: "h1",
        }],
        keyboardItems: [{
          path: "agent.semanticSummary.keyboardItems[0]",
          role: "button",
          name: "Save",
          shortcuts: ["Control+S"],
          focusable: true,
          selector: "button.save",
        }],
        headingItems: [{ path: "agent.semanticSummary.headingItems[0]", text: "Example", level: 1, selector: "h1" }],
        landmarkItems: [{ path: "agent.semanticSummary.landmarkItems[0]", role: "main", name: "Content", selector: "main" }],
        namedRoleItems: [{ path: "agent.semanticSummary.namedRoleItems[0]", role: "button", name: "Save", selector: "button.save" }],
        interactiveRoles: [{ path: "agent.semanticSummary.interactiveRoles[0]", role: "button", name: "Save", selector: "button.save", state: { disabled: false } }],
        focusableItems: [{ path: "agent.semanticSummary.focusableItems[0]", role: "button", name: "Save", selector: "button.save", state: { focused: true } }],
        links: [{ path: "agent.semanticSummary.links[0]", name: "Docs", url: "https://example.test/docs", rel: ["help"], selector: "a.docs" }],
        inPageLinks: [{ path: "agent.semanticSummary.inPageLinks[0]", kind: "anchor", name: "Skip", url: "#content", targetId: "content" }],
        buttons: [{ path: "agent.semanticSummary.buttons[0]", name: "Save", disabled: false, haspopup: false, selector: "button.save" }],
        imageItems: [{ path: "agent.semanticSummary.imageItems[0]", name: "Logo", url: "https://example.test/logo.png", width: 64, height: 64 }],
        tableItems: [{
          path: "agent.semanticSummary.tableItems[0]",
          role: "table",
          name: "Pricing",
          rowCount: 2,
          cellCount: 4,
          headers: ["Plan", "Price"],
          headerRefs: [{ path: "agent.semanticSummary.tableItems[0].headerRefs[0]", text: "Plan", role: "columnheader", columnIndex: 1 }],
          sampleCells: ["Pro"],
          sampleCellRefs: [{ path: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]", text: "Pro", rowIndex: 2, columnIndex: 1, headers: ["Plan"] }],
        }],
        listItems: [{ path: "agent.semanticSummary.listItems[0]", role: "list", itemCount: 2, sampleItems: ["One"] }],
        fieldItems: [{ path: "agent.semanticSummary.fieldItems[0]", role: "textbox", name: "Query", htmlName: "q", state: { required: true } }],
        descriptionItems: [{ path: "agent.semanticSummary.descriptionItems[0]", role: "button", name: "Save", description: "Save changes" }],
        valueItems: [{ path: "agent.semanticSummary.valueItems[0]", role: "textbox", name: "Query", value: "agent" }],
        relationItems: [{ path: "agent.semanticSummary.relationItems[0]", role: "button", name: "Menu", relation: "controls", target: "menu" }],
        choiceItems: [{ path: "agent.semanticSummary.choiceItems[0]", role: "option", name: "Pro", selected: true, state: { selected: true } }],
        stateItems: [{ path: "agent.semanticSummary.stateItems[0]", role: "button", name: "Save", state: "focused=true", stateRaw: { focused: true } }],
        unavailableItems: [{ path: "agent.semanticSummary.unavailableItems[0]", tag: "div", reason: "hidden" }],
      },
      semanticNodeCount: 12,
      semanticNamedRoleCount: 4,
      semanticInteractiveCount: 2,
      semanticFocusableCount: 2,
      semanticHeadingCount: 1,
      semanticLandmarkCount: 1,
      semanticLinkCount: 2,
      semanticButtonCount: 1,
      semanticImageCount: 1,
      semanticTableCount: 1,
      semanticListCount: 1,
      semanticFieldCount: 1,
      semanticDescriptionCount: 1,
      semanticValueCount: 1,
      semanticRelationCount: 1,
      semanticChoiceCount: 1,
      semanticStateCount: 1,
      semanticUnavailableCount: 1,
      semanticTopRole: "link",
      semanticTopRoleCount: 2,
      semanticOutlineCount: 2,
      semanticTopOutlinePath: "agent.semanticSummary.semanticOutline[0]",
      semanticTopOutlineKind: "heading",
      semanticTopOutlineRole: "heading",
      semanticTopOutlineText: "Example",
      semanticTopOutlineLevel: 1,
      semanticTopOutlineDepth: 2,
      semanticTopOutlineParentPath: "agent.semanticSummary.semanticOutline[0]",
      semanticTopOutlineParentRole: "main",
      semanticTopOutlineParentName: "main",
      semanticTopOutlineSelector: "h1",
      semanticKeyboardShortcutCount: 1,
      semanticTopKeyboardShortcutPath: "agent.semanticSummary.keyboardItems[0]",
      semanticTopKeyboardShortcutRole: "button",
      semanticTopKeyboardShortcutName: "Save",
      semanticTopKeyboardShortcutKeys: ["Control+S"],
      semanticTopKeyboardShortcutAccessKey: "s",
      semanticTopKeyboardShortcutTabIndex: 0,
      semanticTopKeyboardShortcutFocusable: true,
      semanticTopKeyboardShortcutSelector: "button",
      semanticTopAriaKeyShortcutPath: "agent.semanticSummary.keyboardItems[0]",
      semanticTopAriaKeyShortcutRole: "button",
      semanticTopAriaKeyShortcutName: "Save",
      semanticTopAriaKeyShortcutKeys: ["Control+S"],
      semanticTopAriaKeyShortcutTabIndex: 0,
      semanticTopAriaKeyShortcutFocusable: true,
      semanticTopAriaKeyShortcutSelector: "button",
      semanticTopHeading: "Example",
      semanticTopHeadingPath: "agent.semanticSummary.headingItems[0]",
      semanticTopHeadingLevel: 1,
      semanticTopHeadingSelector: "h1",
      semanticTopLandmark: "main",
      semanticTopLandmarkPath: "agent.semanticSummary.landmarkItems[0]",
      semanticTopLandmarkRole: "main",
      semanticTopLandmarkSelector: "main",
      semanticTopNamedRole: "heading:Example",
      semanticTopNamedRolePath: "agent.semanticSummary.namedRoleItems[0]",
      semanticTopNamedRoleRole: "heading",
      semanticTopNamedRoleName: "Example",
      semanticTopNamedRoleDescription: "article title",
      semanticTopNamedRoleSelector: "h1",
      semanticTopInteractiveRole: "link",
      semanticTopInteractivePath: "agent.semanticSummary.interactiveRoles[0]",
      semanticTopInteractiveName: "Read more",
      semanticTopInteractiveRoleDescription: "card link",
      semanticTopInteractiveDescription: "Opens the article",
      semanticTopInteractiveValue: "article",
      semanticTopInteractiveState: "expanded=false",
      semanticTopInteractiveDisabled: false,
      semanticTopInteractiveExpanded: false,
      semanticTopInteractiveSelector: "main a:nth-of-type(1)",
      semanticTopFocusableRole: "link",
      semanticTopFocusablePath: "agent.semanticSummary.focusableItems[0]",
      semanticTopFocusableName: "Read more",
      semanticTopFocusableRoleDescription: "card link",
      semanticTopFocusableState: "expanded=false",
      semanticTopFocusableExpanded: false,
      semanticTopFocusableSelector: "main a:nth-of-type(1)",
      semanticTopLinkName: "Read more",
      semanticTopLinkPath: "agent.semanticSummary.links[0]",
      semanticTopLinkUrl: "https://example.test/read-more",
      semanticTopLinkUrlPath: "/read-more",
      semanticTopLinkTarget: "_blank",
      semanticTopLinkRel: ["noopener", "external"],
      semanticTopLinkType: "text/html",
      semanticTopLinkHreflang: "en",
      semanticTopLinkState: "current=page",
      semanticTopLinkCurrent: "page",
      semanticTopLinkDownload: true,
      semanticTopLinkSelector: "main a:nth-of-type(1)",
      semanticTopCurrentLinkName: "Docs",
      semanticTopCurrentLinkPath: "agent.semanticSummary.links[1]",
      semanticTopCurrentLinkUrl: "https://example.test/docs",
      semanticTopCurrentLinkUrlPath: "/docs",
      semanticTopCurrentLinkTarget: "_self",
      semanticTopCurrentLinkRel: ["bookmark"],
      semanticTopCurrentLinkType: "text/html",
      semanticTopCurrentLinkHreflang: "en",
      semanticTopCurrentLinkState: "current=page",
      semanticTopCurrentLinkCurrent: "page",
      semanticTopCurrentLinkDownload: true,
      semanticTopCurrentLinkSelector: "main a:nth-of-type(2)",
      semanticInPageLinkCount: 1,
      semanticTopInPageLinkPath: "agent.semanticSummary.inPageLinks[0]",
      semanticTopInPageLinkKind: "skip",
      semanticTopInPageLinkName: "Skip to content",
      semanticTopInPageLinkUrl: "https://example.test/#content",
      semanticTopInPageLinkUrlPath: "/",
      semanticTopInPageLinkTargetId: "content",
      semanticTopInPageLinkSelector: "a.skip-link",
      semanticTopButtonName: "Subscribe",
      semanticTopButtonPath: "agent.semanticSummary.buttons[0]",
      semanticTopButtonRoleDescription: "subscription trigger",
      semanticTopButtonDescription: "Opens the subscription dialog",
      semanticTopButtonType: "submit",
      semanticTopButtonState: "pressed=false expanded=true haspopup=dialog controls=subscribe-dialog",
      semanticTopButtonDisabled: false,
      semanticTopButtonPressed: false,
      semanticTopButtonExpanded: true,
      semanticTopButtonHaspopup: "dialog",
      semanticTopButtonControls: "subscribe-dialog",
      semanticTopButtonControlsTargetRole: "dialog",
      semanticTopButtonControlsTargetName: "Subscribe dialog",
      semanticTopButtonControlsTargetSelector: "#subscribe-dialog",
      semanticTopButtonFormAction: "https://example.test/subscribe",
      semanticTopButtonFormMethod: "post",
      semanticTopButtonFormTarget: "_self",
      semanticTopButtonFormEncType: "multipart/form-data",
      semanticTopButtonFormNoValidate: true,
      semanticTopButtonFormId: "signup-form",
      semanticTopButtonSelector: "button:nth-of-type(1)",
      semanticTopImagePath: "agent.semanticSummary.imageItems[0]",
      semanticTopImageName: "Product screenshot",
      semanticTopImageUrl: "https://example.test/product.png",
      semanticTopImageWidth: 1280,
      semanticTopImageHeight: 720,
      semanticTopImageLoading: "lazy",
      semanticTopImageDecoding: "async",
      semanticTopImageSrcset: "/product.png 1x, /product@2x.png 2x",
      semanticTopImageSizes: "(min-width: 900px) 800px, 100vw",
      semanticTopImageSelector: "img:nth-of-type(1)",
      semanticTopTableRole: "table",
      semanticTopTablePath: "agent.semanticSummary.tableItems[0]",
      semanticTopTableName: "Pricing",
      semanticTopTableRowCount: 3,
      semanticTopTableColumnCount: 3,
      semanticTopTableCellCount: 6,
      semanticTopTableDeclaredRowCount: 100,
      semanticTopTableDeclaredColumnCount: 4,
      semanticTopTableHeaders: ["Plan", "Price"],
      semanticTopTableHeaderRefs: [
        { path: "agent.semanticSummary.tableItems[0].headerRefs[0]", text: "Plan", role: "columnheader", rowIndex: 1, columnIndex: 1, sort: "ascending", selector: "th:nth-of-type(1)" },
        { path: "agent.semanticSummary.tableItems[0].headerRefs[1]", text: "Price", role: "columnheader", rowIndex: 1, columnIndex: 2, sort: "descending", selector: "th:nth-of-type(2)" },
      ],
      semanticTopTableOwnedCount: 1,
      semanticTopTableOwnedRefs: [{ target: "virtual-rows", role: "rowgroup", name: "Virtual rows", selector: "#virtual-rows" }],
      semanticTopTableSampleCells: ["Pro", "$20"],
      semanticTopTableSampleCellRefs: [
        { path: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]", text: "Pro", rowIndex: 2, columnIndex: 1, rowSpan: 2, columnSpan: 3, headers: ["Plan", "Price"], rowHeaders: ["Plan"], columnHeaders: ["Price"], selected: true, current: "page", selector: "td:nth-of-type(1)", ownedTarget: "virtual-rows" },
        { path: "agent.semanticSummary.tableItems[0].sampleCellRefs[1]", text: "$20", rowIndex: 2, columnIndex: 2, rowSpan: 1, columnSpan: 1, headers: ["Price"], rowHeaders: ["Pro"], columnHeaders: ["Price"], selected: false, current: "false", selector: "td:nth-of-type(2)", ownedTarget: "virtual-rows" },
      ],
      semanticTopTableFirstHeader: "Plan",
      semanticTopTableFirstHeaderPath: "agent.semanticSummary.tableItems[0].headerRefs[0]",
      semanticTopTableFirstHeaderRole: "columnheader",
      semanticTopTableFirstHeaderRowIndex: 1,
      semanticTopTableFirstHeaderColumnIndex: 1,
      semanticTopTableFirstHeaderSort: "ascending",
      semanticTopTableFirstHeaderSelector: "th:nth-of-type(1)",
      semanticTopTableSecondHeader: "Price",
      semanticTopTableSecondHeaderPath: "agent.semanticSummary.tableItems[0].headerRefs[1]",
      semanticTopTableSecondHeaderRole: "columnheader",
      semanticTopTableSecondHeaderRowIndex: 1,
      semanticTopTableSecondHeaderColumnIndex: 2,
      semanticTopTableSecondHeaderSort: "descending",
      semanticTopTableSecondHeaderSelector: "th:nth-of-type(2)",
      semanticTopTableFirstOwnedTarget: "virtual-rows",
      semanticTopTableFirstOwnedRole: "rowgroup",
      semanticTopTableFirstOwnedName: "Virtual rows",
      semanticTopTableFirstOwnedSelector: "#virtual-rows",
      semanticTopTableFirstSampleCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]",
      semanticTopTableFirstSampleCellText: "Pro",
      semanticTopTableFirstSampleCellRowIndex: 2,
      semanticTopTableFirstSampleCellColumnIndex: 1,
      semanticTopTableFirstSampleCellRowSpan: 2,
      semanticTopTableFirstSampleCellColumnSpan: 3,
      semanticTopTableFirstSampleCellHeaders: ["Plan", "Price"],
      semanticTopTableFirstSampleCellRowHeaders: ["Plan"],
      semanticTopTableFirstSampleCellColumnHeaders: ["Price"],
      semanticTopTableFirstSampleCellSelected: true,
      semanticTopTableFirstSampleCellCurrent: "page",
      semanticTopTableFirstSampleCellSelector: "td:nth-of-type(1)",
      semanticTopTableFirstSampleCellOwnedTarget: "virtual-rows",
      semanticTopTableSecondSampleCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[1]",
      semanticTopTableSecondSampleCellText: "$20",
      semanticTopTableSecondSampleCellRowIndex: 2,
      semanticTopTableSecondSampleCellColumnIndex: 2,
      semanticTopTableSecondSampleCellRowSpan: 1,
      semanticTopTableSecondSampleCellColumnSpan: 1,
      semanticTopTableSecondSampleCellHeaders: ["Price"],
      semanticTopTableSecondSampleCellRowHeaders: ["Pro"],
      semanticTopTableSecondSampleCellColumnHeaders: ["Price"],
      semanticTopTableSecondSampleCellSelected: false,
      semanticTopTableSecondSampleCellCurrent: "false",
      semanticTopTableSecondSampleCellSelector: "td:nth-of-type(2)",
      semanticTopTableSecondSampleCellOwnedTarget: "virtual-rows",
      semanticTopTableFirstOwnedSampleCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]",
      semanticTopTableFirstOwnedSampleCellText: "Pro",
      semanticTopTableFirstOwnedSampleCellRowIndex: 2,
      semanticTopTableFirstOwnedSampleCellColumnIndex: 1,
      semanticTopTableFirstOwnedSampleCellRowSpan: 2,
      semanticTopTableFirstOwnedSampleCellColumnSpan: 3,
      semanticTopTableFirstOwnedSampleCellHeaders: ["Plan", "Price"],
      semanticTopTableFirstOwnedSampleCellRowHeaders: ["Plan"],
      semanticTopTableFirstOwnedSampleCellColumnHeaders: ["Price"],
      semanticTopTableFirstOwnedSampleCellSelected: true,
      semanticTopTableFirstOwnedSampleCellCurrent: "page",
      semanticTopTableFirstOwnedSampleCellSelector: "td:nth-of-type(1)",
      semanticTopTableFirstOwnedSampleCellOwnedTarget: "virtual-rows",
      semanticTopTableSecondOwnedSampleCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[1]",
      semanticTopTableSecondOwnedSampleCellText: "$20",
      semanticTopTableSecondOwnedSampleCellRowIndex: 2,
      semanticTopTableSecondOwnedSampleCellColumnIndex: 2,
      semanticTopTableSecondOwnedSampleCellRowSpan: 1,
      semanticTopTableSecondOwnedSampleCellColumnSpan: 1,
      semanticTopTableSecondOwnedSampleCellHeaders: ["Price"],
      semanticTopTableSecondOwnedSampleCellRowHeaders: ["Pro"],
      semanticTopTableSecondOwnedSampleCellColumnHeaders: ["Price"],
      semanticTopTableSecondOwnedSampleCellSelected: false,
      semanticTopTableSecondOwnedSampleCellCurrent: "false",
      semanticTopTableSecondOwnedSampleCellSelector: "td:nth-of-type(2)",
      semanticTopTableSecondOwnedSampleCellOwnedTarget: "virtual-rows",
      semanticTopSelectedTableCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]",
      semanticTopSelectedTableCellText: "Pro",
      semanticTopSelectedTableCellRowIndex: 2,
      semanticTopSelectedTableCellColumnIndex: 1,
      semanticTopSelectedTableCellRowSpan: 2,
      semanticTopSelectedTableCellColumnSpan: 3,
      semanticTopSelectedTableCellHeaders: ["Plan", "Price"],
      semanticTopSelectedTableCellRowHeaders: ["Plan"],
      semanticTopSelectedTableCellColumnHeaders: ["Price"],
      semanticTopSelectedTableCellSelected: true,
      semanticTopSelectedTableCellCurrent: "page",
      semanticTopSelectedTableCellSelector: "td:nth-of-type(1)",
      semanticTopSelectedTableCellOwnedTarget: "virtual-rows",
      semanticTopTableSelector: "table:nth-of-type(1)",
      semanticTopListRole: "list",
      semanticTopListPath: "agent.semanticSummary.listItems[0]",
      semanticTopListName: "Highlights",
      semanticTopListItemCount: 2,
      semanticTopListItems: ["Fast setup", "Clear output"],
      semanticTopListItemRefs: [{ text: "Fast setup", role: "listitem", posInSet: 1, setSize: 2, current: "page", selector: "li:nth-of-type(1)" }],
      semanticTopListFirstItemText: "Fast setup",
      semanticTopListFirstItemRole: "listitem",
      semanticTopListFirstItemPosInSet: 1,
      semanticTopListFirstItemSetSize: 2,
      semanticTopListFirstItemCurrent: "page",
      semanticTopListFirstItemSelector: "li:nth-of-type(1)",
      semanticTopListSecondItemText: "Clear output",
      semanticTopListSecondItemRole: "listitem",
      semanticTopListSecondItemPosInSet: 2,
      semanticTopListSecondItemSetSize: 2,
      semanticTopListSecondItemSelected: true,
      semanticTopListSecondItemCurrent: "page",
      semanticTopListSecondItemExpanded: false,
      semanticTopListSecondItemSelector: "li:nth-of-type(2)",
      semanticTopSelectedListItemText: "Clear output",
      semanticTopSelectedListItemRole: "listitem",
      semanticTopSelectedListItemPosInSet: 2,
      semanticTopSelectedListItemSetSize: 2,
      semanticTopSelectedListItemSelected: true,
      semanticTopSelectedListItemCurrent: "page",
      semanticTopSelectedListItemExpanded: false,
      semanticTopSelectedListItemSelector: "li:nth-of-type(2)",
      semanticTopListSelector: "ul:nth-of-type(1)",
      semanticTopFieldRole: "textbox",
      semanticTopFieldPath: "agent.semanticSummary.fieldItems[0]",
      semanticTopFieldName: "Email",
      semanticTopFieldDescription: "Used for updates",
      semanticTopFieldValue: "me@example.test",
      semanticTopFieldHtmlName: "email",
      semanticTopFieldHtmlType: "email",
      semanticTopFieldPlaceholder: "name@example.test",
      semanticTopFieldAriaPlaceholder: "Email address",
      semanticTopFieldAutocomplete: "email",
      semanticTopFieldAriaAutocomplete: "list",
      semanticTopFieldInputMode: "email",
      semanticTopFieldPattern: ".+@example\\.test",
      semanticTopFieldMin: "1",
      semanticTopFieldMax: "99",
      semanticTopFieldStep: "1",
      semanticTopFieldMinLength: 3,
      semanticTopFieldMaxLength: 120,
      semanticTopFieldLabelledBy: "email-label",
      semanticTopFieldLabelledByText: "Email",
      semanticTopFieldLabelledBySelector: "#email-label",
      semanticTopFieldDescribedBy: "email-help",
      semanticTopFieldDescribedByText: "Used for updates",
      semanticTopFieldDescribedBySelector: "#email-help",
      semanticTopFieldDetails: "email-details",
      semanticTopFieldDetailsText: "Used for account notifications",
      semanticTopFieldDetailsSelector: "#email-details",
      semanticTopFieldErrorMessage: "email-error",
      semanticTopFieldErrorMessageText: "Enter a valid email",
      semanticTopFieldErrorMessageSelector: "#email-error",
      semanticTopFieldState: "disabled=true required=true readonly=true checked=true expanded=true invalid=spelling haspopup=listbox controls=email-suggestions",
      semanticTopFieldDisabled: true,
      semanticTopFieldRequired: true,
      semanticTopFieldReadonly: true,
      semanticTopFieldInvalid: "spelling",
      semanticTopFieldChecked: true,
      semanticTopFieldExpanded: true,
      semanticTopFieldHaspopup: "listbox",
      semanticTopFieldControls: "email-suggestions",
      semanticTopFieldControlsTargetRole: "listbox",
      semanticTopFieldControlsTargetName: "Email suggestions",
      semanticTopFieldControlsTargetSelector: "#email-suggestions",
      semanticTopFieldActiveDescendantTarget: "email-option-1",
      semanticTopFieldActiveDescendantTargetRole: "option",
      semanticTopFieldActiveDescendantTargetName: "ada@example.test",
      semanticTopFieldActiveDescendantTargetSelector: "#email-option-1",
      semanticTopFieldValueMin: 0,
      semanticTopFieldValueMax: 100,
      semanticTopFieldValueNow: 40,
      semanticTopFieldValueText: "40 percent",
      semanticTopFieldSelector: "input[name=\"email\"]",
      semanticTopDescriptionRole: "textbox",
      semanticTopDescriptionPath: "agent.semanticSummary.descriptionItems[0]",
      semanticTopDescriptionName: "Email",
      semanticTopDescriptionText: "Used for updates",
      semanticTopDescriptionSelector: "input[name=\"email\"]",
      semanticTopValueRole: "textbox",
      semanticTopValuePath: "agent.semanticSummary.valueItems[0]",
      semanticTopValueName: "Email",
      semanticTopValue: "me@example.test",
      semanticTopValueSelector: "input[name=\"email\"]",
      semanticTopRelationRole: "button",
      semanticTopRelationPath: "agent.semanticSummary.relationItems[0]",
      semanticTopRelationName: "More filters",
      semanticTopRelation: "controls",
      semanticTopRelationTarget: "filters",
      semanticTopRelationTargetRole: "dialog",
      semanticTopRelationTargetName: "Filter reports",
      semanticTopRelationTargetSelector: "#filters",
      semanticTopRelationSelector: "button[aria-controls=\"filters\"]",
      semanticTopOwnsRelationRole: "button",
      semanticTopOwnsRelationPath: "agent.semanticSummary.relationItems[1]",
      semanticTopOwnsRelationName: "More filters",
      semanticTopOwnsRelationTarget: "owned-menu",
      semanticTopOwnsRelationTargetRole: "menu",
      semanticTopOwnsRelationTargetName: "Owned menu",
      semanticTopOwnsRelationTargetSelector: "#owned-menu",
      semanticTopOwnsRelationSelector: "button[aria-owns=\"owned-menu\"]",
      semanticTopFlowToRole: "button",
      semanticTopFlowToPath: "agent.semanticSummary.relationItems[2]",
      semanticTopFlowToName: "More filters",
      semanticTopFlowToTarget: "next-step",
      semanticTopFlowToTargetRole: "region",
      semanticTopFlowToTargetName: "Next step",
      semanticTopFlowToTargetSelector: "#next-step",
      semanticTopFlowToSelector: "button[aria-flowto=\"next-step\"]",
      semanticTopActiveDescendantRelationRole: "grid",
      semanticTopActiveDescendantRelationPath: "agent.semanticSummary.relationItems[3]",
      semanticTopActiveDescendantRelationName: "Result grid",
      semanticTopActiveDescendantRelationTarget: "active-cell",
      semanticTopActiveDescendantRelationTargetRole: "gridcell",
      semanticTopActiveDescendantRelationTargetName: "Active cell",
      semanticTopActiveDescendantRelationTargetSelector: "#active-cell",
      semanticTopActiveDescendantRelationSelector: "#result-grid",
      semanticTopDetailsRelationRole: "button",
      semanticTopDetailsRelationPath: "agent.semanticSummary.relationItems[4]",
      semanticTopDetailsRelationName: "More filters",
      semanticTopDetailsRelationTarget: "filter-help",
      semanticTopDetailsRelationTargetRole: "note",
      semanticTopDetailsRelationTargetName: "Filter help",
      semanticTopDetailsRelationTargetSelector: "#filter-help",
      semanticTopDetailsRelationSelector: "button[aria-details=\"filter-help\"]",
      semanticTopErrorMessageRelationRole: "button",
      semanticTopErrorMessageRelationPath: "agent.semanticSummary.relationItems[5]",
      semanticTopErrorMessageRelationName: "More filters",
      semanticTopErrorMessageRelationTarget: "filter-error",
      semanticTopErrorMessageRelationTargetRole: "alert",
      semanticTopErrorMessageRelationTargetName: "Filter error",
      semanticTopErrorMessageRelationTargetSelector: "#filter-error",
      semanticTopErrorMessageRelationSelector: "button[aria-errormessage=\"filter-error\"]",
      semanticTopDescribedByRelationRole: "button",
      semanticTopDescribedByRelationPath: "agent.semanticSummary.relationItems[6]",
      semanticTopDescribedByRelationName: "More filters",
      semanticTopDescribedByRelationTarget: "filter-help",
      semanticTopDescribedByRelationTargetRole: "note",
      semanticTopDescribedByRelationTargetName: "Filter help",
      semanticTopDescribedByRelationTargetSelector: "#filter-help",
      semanticTopDescribedByRelationSelector: "button[aria-describedby=\"filter-help\"]",
      semanticTopLabelledByRelationRole: "button",
      semanticTopLabelledByRelationPath: "agent.semanticSummary.relationItems[7]",
      semanticTopLabelledByRelationName: "More filters",
      semanticTopLabelledByRelationTarget: "filter-label",
      semanticTopLabelledByRelationTargetRole: "span",
      semanticTopLabelledByRelationTargetName: "More filters",
      semanticTopLabelledByRelationTargetSelector: "#filter-label",
      semanticTopLabelledByRelationSelector: "button[aria-labelledby=\"filter-label\"]",
      semanticTopChoiceRole: "option",
      semanticTopChoicePath: "agent.semanticSummary.choiceItems[0]",
      semanticTopChoiceName: "Reports",
      semanticTopChoiceState: "selected=true current=page",
      semanticTopChoiceSelected: true,
      semanticTopChoiceCurrent: "page",
      semanticTopChoiceLevel: 2,
      semanticTopChoicePosInSet: 2,
      semanticTopChoiceSetSize: 5,
      semanticTopChoiceSelector: "option:nth-of-type(2)",
      semanticTopSelectedChoiceRole: "option",
      semanticTopSelectedChoicePath: "agent.semanticSummary.choiceItems[1]",
      semanticTopSelectedChoiceName: "Reports",
      semanticTopSelectedChoiceState: "selected=true current=page",
      semanticTopSelectedChoiceSelected: true,
      semanticTopSelectedChoiceCurrent: "page",
      semanticTopSelectedChoiceLevel: 2,
      semanticTopSelectedChoicePosInSet: 2,
      semanticTopSelectedChoiceSetSize: 5,
      semanticTopSelectedChoiceControls: "reports-panel",
      semanticTopSelectedChoiceControlsTargetRole: "tabpanel",
      semanticTopSelectedChoiceControlsTargetName: "Reports",
      semanticTopSelectedChoiceControlsTargetSelector: "#reports-panel",
      semanticTopSelectedChoiceSelector: "option:nth-of-type(2)",
      semanticTopStateRole: "textbox",
      semanticTopStatePath: "agent.semanticSummary.stateItems[0]",
      semanticTopStateName: "Email",
      semanticTopState: "required=true",
      semanticTopStateHidden: false,
      semanticTopStateDisabled: false,
      semanticTopStateBusy: true,
      semanticTopStateMultiselectable: true,
      semanticTopStateSort: "ascending",
      semanticTopStateGrabbed: true,
      semanticTopStateDropEffect: "move",
      semanticTopStateChecked: "mixed",
      semanticTopStateSelected: true,
      semanticTopStateExpanded: false,
      semanticTopStatePressed: "mixed",
      semanticTopStateFocused: true,
      semanticTopStateRequired: true,
      semanticTopStateInvalid: "spelling",
      semanticTopStateReadonly: true,
      semanticTopStateCurrent: "page",
      semanticTopStateHaspopup: "dialog",
      semanticTopStateControls: "details-panel",
      semanticTopStateControlsTargetRole: "region",
      semanticTopStateControlsTargetName: "Details panel",
      semanticTopStateControlsTargetSelector: "#details-panel",
      semanticTopStateLive: "polite",
      semanticTopStateModal: true,
      semanticTopStateOrientation: "horizontal",
      semanticTopStateValueMin: 0,
      semanticTopStateValueMax: 100,
      semanticTopStateValueNow: 40,
      semanticTopStateValueText: "40 percent",
      semanticTopStateSelector: "input[name=\"email\"]",
      semanticTopModalStateRole: "dialog",
      semanticTopModalStatePath: "agent.semanticSummary.stateItems[1]",
      semanticTopModalStateName: "Details",
      semanticTopModalState: "modal=true",
      semanticTopModalStateSelector: "#details",
      semanticTopLiveStateRole: "status",
      semanticTopLiveStatePath: "agent.semanticSummary.stateItems[2]",
      semanticTopLiveStateName: "Sync status",
      semanticTopLiveState: "live=polite",
      semanticTopLiveStateLive: "polite",
      semanticTopLiveStateSelector: "#sync-status",
      semanticTopUnavailablePath: "agent.semanticSummary.unavailableItems[0]",
      semanticTopUnavailableTag: "iframe",
      semanticTopUnavailableRole: "iframe",
      semanticTopUnavailableName: "Remote frame",
      semanticTopUnavailableReason: "cross-origin iframe",
      semanticTopUnavailableSelector: "iframe:nth-of-type(1)",
      runbookDecision: "return",
      runbookMode: "read",
      runbookOperation: "return",
      runbookActionName: "read-content",
      runbookReason: "Return the resolved value.",
      runbookConfidence: "high",
      runbookAnswerStatus: "ready",
      runbookAnswerReady: true,
      runbookShouldContinue: false,
      runbookTerminal: true,
      runbookMaxSuggestedIterations: 0,
      runbookExpectedOutcome: "read-evidence",
      runbookReadFrom: "pageCheck.contentEvidence",
      runbookReadTargetKind: "evidence",
      runbookReadTargetCount: 1,
      runbookReadTargetScore: 0.9,
      runbookReadTargetPrimary: true,
      runbookReadTargetReason: "Top evidence.",
      runbookReadValuePath: "pageCheck.contentEvidence",
      runbookReadValueType: "array",
      runbookReadValueCount: 1,
      runbookReadValueReferencePath: "pageCheck.contentEvidence",
      runbookCommand: "ax-grep https://example.test --agent",
      runbookCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      runbookUrl: "https://example.test",
      nextActionName: "read-content",
      nextExecution: "read-current",
      nextCommand: "ax-grep https://example.test --agent",
      nextCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      nextAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      nextAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      nextReadFrom: "pageCheck.contentEvidence",
      nextReadTargetKind: "evidence",
      nextReadTargetCount: 1,
      nextReadTargetScore: 0.9,
      nextReadTargetPrimary: true,
      nextReadTargetReason: "Top evidence.",
      nextReadValuePath: "pageCheck.contentEvidence",
      nextReadValueType: "array",
      nextReadValueCount: 1,
      nextReadValueReferencePath: "pageCheck.contentEvidence",
      nextUrl: "https://example.test",
      expectedOutcomeKind: "read-evidence",
      expectedOutcomeMessage: "Read the current payload evidence.",
      executionPlanOperation: "return",
      executionPlanConfidence: "high",
      executionPlanReason: "Ready to answer.",
      executionPlanAnswerReady: true,
      executionPlanShouldContinue: false,
      executionPlanTerminal: true,
      executionPlanExpectedOutcome: "read-evidence",
      executionPlanReadFrom: "pageCheck.contentEvidence",
      executionPlanReadTargetKind: "evidence",
      executionPlanReadTargetCount: 1,
      executionPlanReadTargetScore: 0.9,
      executionPlanReadTargetPrimary: true,
      executionPlanReadTargetReason: "Top evidence.",
      executionPlanCommand: "ax-grep https://example.test --agent",
      executionPlanCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      executionPlanAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      executionPlanAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      executionPlanUrl: "https://example.test",
      answerPlanStatus: "ready",
      answerPlanConfidence: "high",
      answerPlanReason: "Ready to answer.",
      answerPlanNextAction: "read-content",
      answerGapCount: 0,
      answerUseCitationCount: 1,
      topAnswerUseCitationId: "e1",
      answerUseCitationIds: ["e1"],
      answerPlanReadFrom: "pageCheck.contentEvidence",
      answerPlanReadTargetKind: "evidence",
      answerPlanReadTargetCount: 1,
      answerPlanReadTargetScore: 0.9,
      answerPlanReadTargetPrimary: true,
      answerPlanReadTargetReason: "Top evidence.",
      answerPlanCommand: "ax-grep https://example.test --agent",
      answerPlanCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      answerPlanAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      answerPlanAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      answerPlanUrl: "https://example.test",
      readTargetCount: 3,
      actionCount: 2,
      pageTitle: "Example article",
      pageCanonicalUrl: "https://example.test/article",
      pageLang: "en",
      pageDir: "ltr",
      pageSiteName: "Example Site",
      pageAuthor: "Example Author",
      pagePublishedTime: "2026-02-03T04:05:06Z",
      pageModifiedTime: "2026-02-04T05:06:07Z",
      pageStructuredDataTypes: ["NewsArticle"],
      topReadTarget: "pageCheck.contentEvidence",
      topReadTargetKind: "evidence",
      topReadTargetCount: 1,
      topReadTargetScore: 0.9,
      topReadTargetPrimary: true,
      topReadTargetReason: "Top evidence.",
      secondReadTarget: "agent.semanticSummary",
      secondReadTargetKind: "semantic",
      secondReadTargetCount: 3,
      secondReadTargetScore: 0.7,
      secondReadTargetPrimary: false,
      secondReadTargetReason: "Semantic fallback.",
      topActionName: "read-content",
      topActionSource: "agent.primaryAction",
      topActionExecution: "read-current",
      topActionPriority: "high",
      topActionPriorityReason: "Readable content is available.",
      topActionReason: "Read current evidence.",
      topActionReadFrom: "pageCheck.contentEvidence",
      topActionReadTargetKind: "evidence",
      topActionReadTargetCount: 1,
      topActionReadTargetScore: 0.9,
      topActionReadTargetPrimary: true,
      topActionReadTargetReason: "Top evidence.",
      topActionCommand: "ax-grep https://example.test --agent",
      topActionCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      topActionAfterInteractionCommand: "ax-grep https://example.test --agent",
      topActionAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      topActionUrl: "https://example.test",
      topActionSourceLinkRef: "pageCheck.sourceLinks[0]",
      topActionRank: 1,
      topActionOpenResult: 1,
      topActionExpectedOutcome: "read-evidence",
      topActionExpectedOutcomeMessage: "Read pageCheck.contentEvidence from the current payload and treat it as the next evidence source.",
      topActionTargetUrl: "https://example.test/source?ref=docs",
      topActionTargetUrlPath: "/source",
      topActionTargetUrlQuery: "?ref=docs",
      topActionTargetPath: "pageCheck.links[0]",
      topActionTargetTitle: "Example target",
      topActionTargetHost: "example.test",
      topActionTargetSource: "source-link",
      topActionTargetRank: 1,
      topActionTargetSourceScore: 0.92,
      topActionTargetDateText: "2026-05-31",
      topActionTargetDateIso: "2026-05-31T00:00:00.000Z",
      topActionTargetDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      topActionTargetDatePrecision: "day",
      topActionTargetDateSource: "snippet",
      topActionTargetRelevance: "high",
      topActionTargetLikelyOfficial: true,
      topActionTargetSelector: "a.primary",
      topActionTargetText: "Read more",
      topActionRequiresBrowserInteraction: false,
      topActionBrowserHtmlReason: "Browser-captured HTML or browser inspection is needed.",
      topActionBrowserHtmlReasonCode: "challenge",
      bestReadTarget: "pageCheck.contentEvidence",
      bestReadTargetKind: "evidence",
      bestReadTargetCount: 1,
      bestReadTargetScore: 0.9,
      bestReadTargetPrimary: true,
      bestReadTargetReason: "Best evidence.",
      signalCount: 2,
      signalWarningCount: 1,
      signalErrorCount: 0,
      qualityGateCount: 4,
      qualityGateFailCount: 1,
      topSignalKind: "content",
      topSignalSeverity: "warning",
      topSignalMessage: "Readable content is thin.",
      topQualityGateKind: "fetch",
      topQualityGatePass: true,
      topQualityGateSeverity: "info",
      topQualityGateMessage: "Fetched response was converted into an agent payload.",
      topQualityGatePath: "agent.responseStatus",
      topQualityGateScore: 1,
      problemSignalKind: "content",
      problemSignalSeverity: "warning",
      problemSignalMessage: "Readable content is thin.",
      failingQualityGateKind: "content",
      failingQualityGateSeverity: "warning",
      failingQualityGateMessage: "Content evidence is too thin.",
      failingQualityGatePath: "pageCheck.contentEvidence",
      failingQualityGateScore: 0.4,
      needsBrowserInteraction: false,
      staticReadiness: "needs-browser",
      staticReadinessReasonCode: "browser-required",
      staticReadinessReason: "Static fetched HTML is not enough; browser-captured HTML or browser inspection is required.",
      staticReadinessReadFrom: "pageCheck.contentEvidence",
      staticReadinessReadTargetKind: "evidence",
      staticReadinessReadTargetCount: 1,
      staticReadinessReadTargetScore: 0.9,
      staticReadinessReadTargetPrimary: true,
      staticReadinessReadTargetReason: "Top evidence.",
      browserHtmlReason: "Browser-captured HTML or browser inspection is needed.",
      browserHtmlReasonCode: "challenge",
      browserHtmlActionName: "retry-with-browser-html",
      browserHtmlOperation: "capture-browser-html",
      browserHtmlUrl: "https://example.test",
      browserHtmlFile: "captured.html",
      browserHtmlCaptureScript: "document.documentElement.outerHTML",
      browserHtmlCommand: "ax-grep 'https://example.test' --html-file captured.html --agent",
      browserHtmlCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      browserHtmlAfterInteractionCommand: "ax-grep 'https://example.test' --html-file captured.html --agent",
      browserHtmlAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      topDiagnosticCode: "NO_USEFUL_LINKS",
      topDiagnosticSeverity: "warning",
      topDiagnosticMessage: "No useful outbound links were found.",
      executorDecision: "return",
      executorMode: "read",
      executorActionName: "read-content",
      executorOperation: "return",
      executorConfidence: "high",
      executorAnswerReady: true,
      executorShouldContinue: false,
      executorTerminal: true,
      executorCommand: "ax-grep https://example.test --agent",
      executorCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      executorAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      executorAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      executorReadFrom: "pageCheck.contentEvidence",
      executorReadTargetKind: "evidence",
      executorReadTargetCount: 1,
      executorReadTargetScore: 0.9,
      executorReadTargetPrimary: true,
      executorReadTargetReason: "Top evidence.",
      executorReadValuePath: "pageCheck.contentEvidence",
      executorReadValueType: "array",
      executorReadValueCount: 1,
      executorReadValueReferencePath: "pageCheck.contentEvidence",
      executorUrl: "https://example.test",
      executorTargetUrl: "https://example.test/docs?ref=executor",
      executorTargetUrlPath: "/docs",
      executorTargetUrlQuery: "?ref=executor",
      executorTargetPath: "pageCheck.links[0]",
      executorTargetTitle: "Example target",
      executorTargetHost: "example.test",
      executorTargetSource: "source-link",
      executorTargetRank: 1,
      executorTargetSourceScore: 0.92,
      executorTargetDateText: "2026-05-31",
      executorTargetDateIso: "2026-05-31T00:00:00.000Z",
      executorTargetDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      executorTargetDatePrecision: "day",
      executorTargetDateSource: "snippet",
      executorTargetRelevance: "high",
      executorTargetLikelyOfficial: true,
      executorTargetSelector: "a.primary",
      executorTargetText: "Read more",
      executorExpectedOutcome: "read-evidence",
      executorBrowserHtmlReason: "Browser-captured HTML or browser inspection is needed.",
      executorBrowserHtmlReasonCode: "challenge",
      handoffDecision: "return",
      handoffMode: "read",
      handoffActionName: "read-content",
      handoffOperation: "return",
      handoffAnswerStatus: "ready",
      handoffConfidence: "high",
      handoffAnswerReady: true,
      handoffShouldContinue: false,
      handoffTerminal: true,
      handoffPriority: "high",
      handoffPriorityReason: "Readable content is available.",
      handoffCommand: "ax-grep https://example.test --agent",
      handoffCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      handoffAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      handoffAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      handoffReadFrom: "pageCheck.contentEvidence",
      handoffReadTargetKind: "evidence",
      handoffReadTargetCount: 1,
      handoffReadTargetScore: 0.9,
      handoffReadTargetPrimary: true,
      handoffReadTargetReason: "Top evidence.",
      handoffReadValuePath: "pageCheck.contentEvidence",
      handoffReadValueType: "array",
      handoffReadValueCount: 1,
      handoffReadValueReferencePath: "pageCheck.contentEvidence",
      handoffUrl: "https://example.test",
      handoffTargetUrl: "https://example.test/docs?ref=handoff",
      handoffTargetUrlPath: "/docs",
      handoffTargetUrlQuery: "?ref=handoff",
      handoffTargetPath: "pageCheck.links[0]",
      handoffTargetTitle: "Example target",
      handoffTargetHost: "example.test",
      handoffTargetSource: "source-link",
      handoffTargetRank: 1,
      handoffTargetSourceScore: 0.92,
      handoffTargetDateText: "2026-05-31",
      handoffTargetDateIso: "2026-05-31T00:00:00.000Z",
      handoffTargetDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      handoffTargetDatePrecision: "day",
      handoffTargetDateSource: "snippet",
      handoffTargetRelevance: "high",
      handoffTargetLikelyOfficial: true,
      handoffTargetSelector: "a.primary",
      handoffTargetText: "Read more",
      handoffExpectedOutcome: "read-evidence",
      handoffBrowserHtmlReason: "Browser-captured HTML or browser inspection is needed.",
      handoffBrowserHtmlReasonCode: "challenge",
      primaryActionName: "read-content",
      primaryReason: "Read current evidence.",
      primaryPriority: "high",
      primaryPriorityReason: "Readable content is available.",
      primaryExpectedOutcome: "read-evidence",
      primaryExpectedOutcomeMessage: "Read pageCheck.contentEvidence from the current payload and treat it as the next evidence source.",
      primaryReadFrom: "pageCheck.contentEvidence",
      primaryReadTargetKind: "evidence",
      primaryReadTargetCount: 1,
      primaryReadTargetScore: 0.9,
      primaryReadTargetPrimary: true,
      primaryReadTargetReason: "Top evidence.",
      primaryBrowserHtmlReason: "Browser-captured HTML or browser inspection is needed.",
      primaryBrowserHtmlReasonCode: "challenge",
      primaryAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      primaryAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      primarySourceLinkRef: "pageCheck.sourceLinks[0]",
      primaryTargetUrl: "https://example.test/docs?ref=primary",
      primaryTargetUrlPath: "/docs",
      primaryTargetUrlQuery: "?ref=primary",
      primaryTargetPath: "pageCheck.links[0]",
      primaryTargetTitle: "Example target",
      primaryTargetHost: "example.test",
      primaryTargetSource: "source-link",
      primaryTargetRank: 1,
      primaryTargetSourceScore: 0.92,
      primaryTargetDateText: "2026-05-31",
      primaryTargetDateIso: "2026-05-31T00:00:00.000Z",
      primaryTargetDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      primaryTargetDatePrecision: "day",
      primaryTargetDateSource: "snippet",
      primaryTargetRelevance: "high",
      primaryTargetLikelyOfficial: true,
      primaryTargetSelector: "a.primary",
      primaryTargetText: "Read more",
      alternativeActionName: "open-source-link",
      alternativeActionSource: "pageCheck.nextSteps",
      alternativeActionExecution: "run-command",
      alternativeActionExpectedOutcome: "open-result",
      alternativeActionExpectedOutcomeMessage: "Open the target URL with the provided command and expect the resulting page check or verification payload.",
      alternativeActionPriority: "medium",
      alternativeActionPriorityReason: "External source-like link can improve verification.",
      alternativeActionReason: "Open the cited source.",
      alternativeActionReadFrom: "pageCheck.sourceLinks",
      alternativeActionReadTargetKind: "resource",
      alternativeActionReadTargetCount: 1,
      alternativeActionReadTargetScore: 0.72,
      alternativeActionReadTargetPrimary: false,
      alternativeActionReadTargetReason: "Openable source links.",
      alternativeActionCommand: "ax-grep https://source.example/report --agent",
      alternativeActionCommandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      alternativeActionAfterInteractionCommand: "ax-grep https://source.example/report --agent",
      alternativeActionAfterInteractionCommandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      alternativeActionUrl: "https://source.example/report",
      alternativeActionSourceLinkRef: "pageCheck.sourceLinks[0]",
      alternativeActionRank: 2,
      alternativeActionOpenResult: "best",
      alternativeActionTargetUrl: "https://source.example/report",
      alternativeActionTargetPath: "pageCheck.sourceLinks[0]",
      alternativeActionTargetTitle: "Source report",
      alternativeActionTargetHost: "source.example",
      alternativeActionTargetSource: "source-link",
      alternativeActionTargetRank: 1,
      alternativeActionTargetSourceScore: 0.84,
      alternativeActionTargetDateText: "2026-05-30",
      alternativeActionTargetDateIso: "2026-05-30T00:00:00.000Z",
      alternativeActionTargetDateUnixMs: Date.parse("2026-05-30T00:00:00.000Z"),
      alternativeActionTargetDatePrecision: "day",
      alternativeActionTargetDateSource: "snippet",
      alternativeActionTargetRelevance: "medium",
      alternativeActionTargetLikelyOfficial: false,
      alternativeActionTargetSelector: "a.source",
      alternativeActionTargetText: "Source report",
      alternativeActionRequiresBrowserInteraction: false,
      alternativeActionBrowserHtmlReason: "Browser interaction may expose additional content or controls.",
      alternativeActionBrowserHtmlReasonCode: "interaction-required",
      recommendedUrl: "https://example.test",
      recommendedUrlPath: "/",
      recommendedPath: "recommendedResult",
      recommendedTitle: "Example result",
      recommendedRank: 1,
      recommendedSource: "example.test",
      recommendedSourceScore: 0.92,
      recommendedSourceType: "official",
      recommendedSourceHints: ["documentation"],
      recommendedDateText: "2026-05-31",
      recommendedDateIso: "2026-05-31T00:00:00.000Z",
      recommendedDateUnixMs: Date.parse("2026-05-31T00:00:00.000Z"),
      recommendedDatePrecision: "day",
      recommendedDateSource: "snippet",
      recommendedRelevance: "high",
      recommendedLikelyOfficial: true,
      recommendedSelectionReason: "Best ranked result.",
      recommendedCommand: "ax-grep https://example.test --agent",
      recommendedCommandArgs: ["ax-grep", "https://example.test", "--agent"],
    };

    expect(summary.hiddenSignalCount).toBe(4);
    expect(summary.topHydrationUrlPath).toBe("/_next/data/build/index.json");
    expect(summary.topHydrationCommandArgs?.[1]).toBe("https://example.test/_next/data/build/index.json");
    expect(summary.secondHydrationPath).toBe("pageCheck.hydration[1]");
    expect(summary.secondHydrationUrlPath).toBe("/api/bootstrap.json");
    expect(summary.secondHydrationUrlQuery).toBe("?locale=en");
    expect(summary.secondHydrationCommandArgs?.[1]).toBe("https://example.test/api/bootstrap.json?locale=en");
    expect(summary.secondHydrationSelector).toBe("link[rel=\"preload\"]");
    expect(summary.hiddenApiEndpointCount).toBe(2);
    expect(summary.topApiEndpointUrl).toBe("https://example.test/graphql");
    expect(summary.topApiEndpointUrlPath).toBe("/graphql");
    expect(summary.topApiEndpointCommandArgs?.[1]).toBe("https://example.test/graphql");
    expect(summary.secondApiEndpointPath).toBe("pageCheck.apiEndpoints[1]");
    expect(summary.secondApiEndpointUrlPath).toBe("/api/status");
    expect(summary.secondApiEndpointUrlQuery).toBe("?format=json");
    expect(summary.secondApiEndpointCommandArgs?.[1]).toBe("https://example.test/api/status?format=json");
    expect(summary.secondApiEndpointSelector).toBe("script:nth-of-type(2)");
    expect(summary.topRuntimeUrlPath).toBe("/sw.js");
    expect(summary.secondRuntimePath).toBe("pageCheck.runtime[1]");
    expect(summary.secondRuntimeUrlPath).toBe("/workers/search.js");
    expect(summary.secondRuntimeUrlQuery).toBe("?version=2");
    expect(summary.secondRuntimeCommandArgs?.[1]).toBe("https://example.test/workers/search.js?version=2");
    expect(summary.secondRuntimeSelector).toBe("script:nth-of-type(3)");
    expect(summary.topAppHintUrlPath).toBe("/manifest.json");
    expect(summary.topAppHintCommandArgs?.[1]).toBe("https://example.test/manifest.json");
    expect(summary.topMobileHintUrlPath).toBe("/app");
    expect(summary.topClientStateKey).toBe("session");
    expect(summary.secondClientStatePath).toBe("pageCheck.clientState[1]");
    expect(summary.secondClientStateKind).toBe("session-storage");
    expect(summary.secondClientStateOperation).toBe("write");
    expect(summary.secondClientStateKey).toBe("returnTo");
    expect(summary.secondClientStateSelector).toBe("script:nth-of-type(2)");
    expect(summary.topHiddenSignalPath).toBe("pageCheck.apiEndpoints[0]");
    expect(summary.topHiddenSignalUrlPath).toBe("/graphql");
    expect(summary.bestHiddenReadTarget).toBe("pageCheck.apiEndpoints");
    expect(summary.actionTargetCount).toBe(2);
    expect(summary.actionTargetChoiceCount).toBe(2);
    expect(summary.topBarrierKind).toBe("challenge");
    expect(summary.topBarrierPath).toBe("pageCheck.barriers[0]");
    expect(summary.secondBarrierKind).toBe("paywall");
    expect(summary.secondBarrierPath).toBe("pageCheck.barriers[1]");
    expect(summary.secondBarrierText).toBe("Paywall: subscription required");
    expect(summary.secondBarrierSelector).toBe("main > p");
    expect(summary.secondBarrierDiagnosticCode).toBe("PAYWALL_LIKELY");
    expect(summary.dataTableCount).toBe(2);
    expect(summary.topDataTableFirstCell).toBe("Starter");
    expect(summary.topDataTableFirstRow?.[1]).toBe("$19.99");
    expect(summary.topDataTableSecondCell).toBe("Team");
    expect(summary.topDataTableSecondRow?.[1]).toBe("$49.99");
    expect(summary.secondDataTablePath).toBe("pageCheck.dataTables[1]");
    expect(summary.secondDataTableCaption).toBe("Usage limits");
    expect(summary.secondDataTableHeaders).toEqual(["Tier", "Requests"]);
    expect(summary.secondDataTableFirstCell).toBe("Free");
    expect(summary.secondDataTableFirstRow?.[1]).toBe("1,000");
    expect(summary.secondDataTableSecondCell).toBe("Pro");
    expect(summary.secondDataTableSecondRow?.[1]).toBe("50,000");
    expect(summary.secondDataTableSelector).toBe("table:nth-of-type(2)");
    expect(summary.topFaqPath).toBe("pageCheck.faqs[0]");
    expect(summary.topFaqQuestion).toBe("How do I install it?");
    expect(summary.topFaqSelector).toBe("details:nth-of-type(1)");
    expect(summary.secondFaqPath).toBe("pageCheck.faqs[1]");
    expect(summary.secondFaqQuestion).toBe("Can I use it in CI?");
    expect(summary.secondFaqSelector).toBe("details:nth-of-type(2)");
    expect(summary.topSectionPath).toBe("pageCheck.sections[0]");
    expect(summary.secondSectionPath).toBe("pageCheck.sections[1]");
    expect(summary.secondSectionHeading).toBe("Configure");
    expect(summary.secondSectionSelector).toBe("section:nth-of-type(2) > h2:nth-of-type(1)");
    expect(summary.topBreadcrumbPath).toBe("pageCheck.breadcrumbs[0]");
    expect(summary.secondBreadcrumbPath).toBe("pageCheck.breadcrumbs[1]");
    expect(summary.secondBreadcrumbText).toBe("Reference > Install");
    expect(summary.secondBreadcrumbSelector).toBe("nav:nth-of-type(2)");
    expect(summary.topCodeBlockPath).toBe("pageCheck.codeBlocks[0]");
    expect(summary.topCodeBlockSelector).toBe("pre:nth-of-type(1)");
    expect(summary.secondCodeBlockPath).toBe("pageCheck.codeBlocks[1]");
    expect(summary.secondCodeBlockText).toBe("pnpm test");
    expect(summary.secondCodeBlockSelector).toBe("pre:nth-of-type(2)");
    expect(summary.topResourcePath).toBe("pageCheck.resources[0]");
    expect(summary.topResourceUrl).toBe("https://example.test/guide.pdf");
    expect(summary.topResourceUrlPath).toBe("/guide.pdf");
    expect(summary.topResourceSelector).toBe("a[href=\"/guide.pdf\"]");
    expect(summary.topResourceCommandArgs?.[1]).toBe("https://example.test/guide.pdf");
    expect(summary.secondResourcePath).toBe("pageCheck.resources[1]");
    expect(summary.secondResourceUrlPath).toBe("/feed.xml");
    expect(summary.secondResourceCommandArgs?.[1]).toBe("https://example.test/feed.xml?lang=en");
    expect(summary.topMediaPath).toBe("pageCheck.media[0]");
    expect(summary.topMediaUrlPath).toBe("/diagram.png");
    expect(summary.topMediaSelector).toBe("img:nth-of-type(1)");
    expect(summary.topMediaCommandArgs?.[1]).toBe("https://example.test/diagram.png");
    expect(summary.secondMediaPath).toBe("pageCheck.media[1]");
    expect(summary.secondMediaUrlPath).toBe("/chart.png");
    expect(summary.secondMediaCommandArgs?.[1]).toBe("https://example.test/chart.png?size=large");
    expect(summary.secondMediaAlt).toBe("Revenue chart");
    expect(summary.topPaginationCommandArgs?.[1]).toBe("https://example.test/next");
    expect(summary.secondPaginationPath).toBe("pageCheck.pagination[1]");
    expect(summary.secondPaginationUrlPath).toBe("/page/2");
    expect(summary.secondPaginationCommandArgs?.[1]).toBe("https://example.test/page/2?sort=top");
    expect(summary.topTocFirstItemCommandArgs?.[1]).toBe("https://example.test/install#install");
    expect(summary.secondTocPath).toBe("pageCheck.toc[1]");
    expect(summary.secondTocFirstItemUrlPath).toBe("/docs/api");
    expect(summary.secondTocFirstItemUrlQuery).toBe("?view=full");
    expect(summary.secondTocFirstItemCommandArgs?.[1]).toBe("https://example.test/docs/api?view=full#overview");
    expect(summary.secondTocSelector).toBe("nav[aria-label=\"Contents\"]");
    expect(summary.topEmbedPath).toBe("pageCheck.embeds[0]");
    expect(summary.topEmbedUrlPath).toBe("/embed");
    expect(summary.topEmbedSelector).toBe("iframe:nth-of-type(1)");
    expect(summary.topEmbedCommandArgs?.[1]).toBe("https://example.test/embed");
    expect(summary.secondEmbedPath).toBe("pageCheck.embeds[1]");
    expect(summary.secondEmbedUrlPath).toBe("/media/walkthrough.mp4");
    expect(summary.secondEmbedCommandArgs?.[1]).toBe("https://example.test/media/walkthrough.mp4?download=1");
    expect(summary.topTranscriptPath).toBe("pageCheck.transcripts[0]");
    expect(summary.topTranscriptUrlPath).toBe("/transcript.txt");
    expect(summary.topTranscriptSelector).toBe("a[href=\"/transcript.txt\"]");
    expect(summary.topTranscriptCommandArgs?.[1]).toBe("https://example.test/transcript.txt");
    expect(summary.secondTranscriptPath).toBe("pageCheck.transcripts[1]");
    expect(summary.secondTranscriptUrlPath).toBe("/transcript.ko.vtt");
    expect(summary.secondTranscriptCommandArgs?.[1]).toBe("https://example.test/transcript.ko.vtt?download=1");
    expect(summary.topAuthorLinkPath).toBe("pageCheck.authorLinks[0]");
    expect(summary.topAuthorLinkUrlPath).toBe("/author");
    expect(summary.topAuthorLinkSelector).toBe("a[rel=\"author\"]");
    expect(summary.topAuthorLinkCommandArgs?.[1]).toBe("https://example.test/author");
    expect(summary.secondAuthorLinkPath).toBe("pageCheck.authorLinks[1]");
    expect(summary.secondAuthorLinkUrlPath).toBe("/second-author");
    expect(summary.secondAuthorLinkCommandArgs?.[1]).toBe("https://example.test/second-author?profile=1");
    expect(summary.topProvenanceUrlPath).toBe("/10.5555/example.2026");
    expect(summary.secondProvenancePath).toBe("pageCheck.provenance[1]");
    expect(summary.secondProvenanceUrlPath).toBe("/12345678/");
    expect(summary.secondProvenanceCommandArgs?.[1]).toBe("https://pubmed.ncbi.nlm.nih.gov/12345678/?format=pubmed");
    expect(summary.topOfferUrlPath).toBe("/buy");
    expect(summary.topOfferCommandArgs?.[1]).toBe("https://example.test/buy");
    expect(summary.secondOfferPath).toBe("pageCheck.offers[1]");
    expect(summary.secondOfferUrlPath).toBe("/team");
    expect(summary.secondOfferCommandArgs?.[1]).toBe("https://example.test/team?plan=annual");
    expect(summary.topDatasetUrlPath).toBe("/datasets/example");
    expect(summary.topDatasetDistributionUrlPath).toBe("/downloads/example.csv");
    expect(summary.topDatasetDistributionCommandArgs?.[1]).toBe("https://example.test/downloads/example.csv");
    expect(summary.topDatasetLicenseUrlPath).toBe("/licenses/by/4.0/");
    expect(summary.topDatasetLicenseCommandArgs?.[1]).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(summary.secondDatasetPath).toBe("pageCheck.datasets[1]");
    expect(summary.secondDatasetDistributionUrlPath).toBe("/downloads/population.parquet");
    expect(summary.secondDatasetDistributionCommandArgs?.[1]).toBe("https://example.test/downloads/population.parquet");
    expect(summary.topIdentityUrlPath).toBe("/");
    expect(summary.topIdentityLogoUrlPath).toBe("/logo.png");
    expect(summary.topIdentitySameAsUrlPath).toBe("/example");
    expect(summary.topIdentitySameAsCommandArgs?.[1]).toBe("https://github.com/example");
    expect(summary.secondIdentityPath).toBe("pageCheck.identities[1]");
    expect(summary.secondIdentityUrlPath).toBe("/docs");
    expect(summary.secondIdentityLogoUrlPath).toBe("/docs-logo.png");
    expect(summary.secondIdentitySameAsUrlPath).toBe("/example/docs");
    expect(summary.secondIdentitySameAsCommandArgs?.[1]).toBe("https://github.com/example/docs");
    expect(summary.secondTimelinePath).toBe("pageCheck.timeline[1]");
    expect(summary.secondTimelineIsoDate).toBe("2026-06-08T10:30:00.000Z");
    expect(summary.secondTimelineUnixMs).toBe(Date.parse("2026-06-08T10:30:00Z"));
    expect(summary.topContactPointUrlPath).toBe("/contact/press");
    expect(summary.topContactPointCommandArgs?.[1]).toBe("https://example.test/contact/press");
    expect(summary.secondContactPointUrlPath).toBe("/support");
    expect(summary.secondContactPointCommandArgs?.[1]).toBe("https://example.test/support");
    expect(summary.bestStructuredReadTarget).toBe("pageCheck.dataTables");
    expect(summary.bestStructuredReadTargetPrimary).toBe(true);
    expect(summary.formChoices?.[0]?.queryField).toBe("q");
    expect(summary.formChoices?.[0]?.command).toContain("find?q=docs");
    expect(summary.formChoices?.[0]?.fields[0]?.label).toBe("Search");
    expect(summary.formChoices?.[0]?.fields[0]?.placeholder).toBe("Search docs");
    expect(summary.formChoices?.[0]?.fields[0]?.invalid).toBe("spelling");
    expect(summary.formChoices?.[1]?.queryField).toBe("term");
    expect(summary.formChoices?.[1]?.command).toContain("advanced?scope=docs");
    expect(summary.actionTargetChoices?.[0]?.kind).toBe("search");
    expect(summary.actionTargetChoices?.[0]?.name).toBe("Search docs");
    expect(summary.actionTargetChoices?.[0]?.source).toBe("json-ld");
    expect(summary.actionTargetChoices?.[0]?.rank).toBe(1);
    expect(summary.actionTargetChoices?.[0]?.commandArgs?.[0]).toBe("ax-grep");
    expect(summary.topFormChoiceActionUrlPath).toBe("/find");
    expect(summary.topFormChoiceUrlTemplate).toBe("https://example.test/find?q={query}");
    expect(summary.topFormChoiceUrlTemplatePath).toBe("/find");
    expect(summary.topFormChoiceUrlTemplateQuery).toBe("?q={query}");
    expect(summary.topFormChoiceCommand).toContain("find?q=docs");
    expect(summary.topFormChoiceFirstFieldLabel).toBe("Search");
    expect(summary.topFormChoiceFirstFieldPlaceholder).toBe("Search docs");
    expect(summary.topFormChoiceFirstFieldInvalid).toBe("spelling");
    expect(summary.topFormChoiceRequiredFieldLabel).toBe("Search");
    expect(summary.topFormChoiceRequiredFieldPlaceholder).toBe("Search docs");
    expect(summary.topFormChoiceRequiredFieldInvalid).toBe("spelling");
    expect(summary.topFormChoiceInvalidFieldLabel).toBe("Search");
    expect(summary.topFormChoiceInvalidFieldInvalid).toBe("spelling");
    expect(summary.topFormChoiceInvalidFieldSelector).toBe("input[name=\"q\"]");
    expect(summary.secondFormChoicePath).toBe("pageCheck.forms[1]");
    expect(summary.secondFormChoiceActionUrlPath).toBe("/advanced");
    expect(summary.secondFormChoiceActionUrlQuery).toBe("?scope=docs");
    expect(summary.secondFormChoiceUrlTemplateQuery).toBe("?scope=docs&term={query}");
    expect(summary.secondFormChoiceQueryField).toBe("term");
    expect(summary.secondFormChoiceCommandArgs?.[1]).toBe("https://example.test/advanced?scope=docs&term=docs");
    expect(summary.secondFormChoiceFieldCount).toBe(1);
    expect(summary.secondFormChoiceHiddenFieldCount).toBe(0);
    expect(summary.secondFormChoiceSelector).toBe("form:nth-of-type(2)");
    expect(summary.secondFormChoiceSubmitText).toBe("Advanced");
    expect(summary.secondFormChoiceSubmitName).toBe("advanced");
    expect(summary.secondFormChoiceSubmitValue).toBe("1");
    expect(summary.secondFormChoiceSubmitDisabled).toBe(false);
    expect(summary.secondFormChoiceSubmitSelector).toBe("button[name=\"advanced\"]");
    expect(summary.secondFormChoiceFirstFieldName).toBe("term");
    expect(summary.secondFormChoiceFirstFieldLabel).toBe("Advanced search");
    expect(summary.secondFormChoiceFirstFieldPlaceholder).toBe("Advanced docs");
    expect(summary.secondFormChoiceFirstFieldRequired).toBe(true);
    expect(summary.secondFormChoiceFirstFieldInvalid).toBe("spelling");
    expect(summary.secondFormChoiceFirstFieldSelector).toBe("input[name=\"term\"]");
    expect(summary.topActionTargetChoiceName).toBe("Search docs");
    expect(summary.topActionTargetChoiceKind).toBe("search");
    expect(summary.topActionTargetChoiceSource).toBe("json-ld");
    expect(summary.topActionTargetChoiceUrlTemplate).toBe("https://example.test/search?q={query}");
    expect(summary.topActionTargetChoiceUrlTemplatePath).toBe("/search");
    expect(summary.topActionTargetChoiceUrlTemplateQuery).toBe("?q={query}");
    expect(summary.topActionTargetChoiceCommandArgs?.[1]).toBe("https://example.test/search?q=docs");
    expect(summary.actionTargetChoices?.[1]?.name).toBe("Docs OpenSearch");
    expect(summary.secondActionTargetChoicePath).toBe("pageCheck.actionTargets[1]");
    expect(summary.secondActionTargetChoiceName).toBe("Docs OpenSearch");
    expect(summary.secondActionTargetChoiceSource).toBe("link");
    expect(summary.secondActionTargetChoiceTargetUrlPath).toBe("/opensearch.xml");
    expect(summary.secondActionTargetChoiceTargetUrlQuery).toBe("?profile=docs");
    expect(summary.secondActionTargetChoiceUrlTemplatePath).toBe("/opensearch");
    expect(summary.secondActionTargetChoiceUrlTemplateQuery).toBe("?q={query}");
    expect(summary.secondActionTargetChoiceQueryInput).toBe("required name=query");
    expect(summary.secondActionTargetChoiceMethod).toBe("GET");
    expect(summary.secondActionTargetChoiceEncodingType).toBe("application/opensearchdescription+xml");
    expect(summary.secondActionTargetChoiceCommandArgs?.[1]).toBe("https://example.test/opensearch?q=docs");
    expect(summary.secondActionTargetChoiceDisabled).toBe(false);
    expect(summary.secondActionTargetChoicePressed).toBe("mixed");
    expect(summary.secondActionTargetChoiceExpanded).toBe(false);
    expect(summary.secondActionTargetChoiceHaspopup).toBe("dialog");
    expect(summary.secondActionTargetChoiceControls).toBe("docs-search-panel");
    expect(summary.secondActionTargetChoiceSelector).toBe("link[rel=\"search\"]");
    expect(summary.topChoiceKind).toBe("source");
    expect(summary.topChoiceHost).toBe("source.example");
    expect(summary.topChoiceUrlPath).toBe("/report");
    expect(summary.topChoiceUrlQuery).toBe("?ref=docs");
    expect(summary.topChoiceSnippet).toBe("Source summary");
    expect(summary.topChoiceSelector).toBe("a:nth-of-type(1)");
    expect(summary.topChoiceReason).toBe("High-quality source link.");
    expect(summary.topChoiceCommand).toContain("source.example/report");
    expect(summary.topChoiceRequiredFieldName).toBe("q");
    expect(summary.topChoiceInvalidFieldInvalid).toBe("spelling");
    expect(summary.topChoicePrimary).toBe(true);
    expect(summary.topChoiceSourceScore).toBe(0.91);
    expect(summary.topChoiceRelevance).toBe("high");
    expect(summary.topChoiceLikelyOfficial).toBe(true);
    expect(summary.topResultChoicePath).toBe("searchResults[0]");
    expect(summary.topResultChoiceUrlPath).toBe("/result");
    expect(summary.topResultChoiceUrlQuery).toBe("?tab=readme");
    expect(summary.topResultChoiceSnippet).toBe("Result summary");
    expect(summary.topResultChoiceCommand).toContain("--open-result 1");
    expect(summary.topResultChoiceCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.secondResultChoicePath).toBe("searchResults[1]");
    expect(summary.secondResultChoiceUrlPath).toBe("/result");
    expect(summary.secondResultChoiceUrlQuery).toBe("?tab=docs");
    expect(summary.secondResultChoiceSnippet).toBe("Backup result summary");
    expect(summary.secondResultChoiceCommand).toContain("--open-result 2");
    expect(summary.secondResultChoiceCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.secondResultChoiceRank).toBe(2);
    expect(summary.secondResultChoiceOpenResult).toBe(2);
    expect(summary.secondResultChoiceRecommended).toBe(false);
    expect(summary.secondResultChoicePrimary).toBe(false);
    expect(summary.secondResultChoiceSourceType).toBe("docs");
    expect(summary.secondResultChoiceSourceScore).toBe(0.8);
    expect(summary.secondResultChoiceSourceHints).toEqual(["documentation"]);
    expect(summary.secondResultChoiceDateText).toBe("2026-06-01");
    expect(summary.secondResultChoiceDateIso).toBe("2026-06-01T00:00:00.000Z");
    expect(summary.secondResultChoiceDateUnixMs).toBe(Date.parse("2026-06-01T00:00:00.000Z"));
    expect(summary.secondResultChoiceDatePrecision).toBe("day");
    expect(summary.secondResultChoiceDateSource).toBe("title");
    expect(summary.secondResultChoiceRelevance).toBe("medium");
    expect(summary.secondResultChoiceMatchedTerm).toBe("backup");
    expect(summary.secondResultChoiceFindMatch).toBe("Backup result");
    expect(summary.secondResultChoiceLikelyOfficial).toBe(false);
    expect(summary.secondResultChoiceSitelinkCount).toBe(1);
    expect(summary.secondResultChoiceFirstSitelinkTitle).toBe("Docs");
    expect(summary.secondResultChoiceFirstSitelinkUrlPath).toBe("/result");
    expect(summary.secondResultChoiceFirstSitelinkCommand).toContain("backup.example/result#docs");
    expect(summary.topSourceChoicePath).toBe("pageCheck.sourceLinks[0]");
    expect(summary.topSourceChoiceUrlPath).toBe("/report");
    expect(summary.topSourceChoiceUrlQuery).toBe("?ref=docs");
    expect(summary.topSourceChoiceSnippet).toBe("Source summary");
    expect(summary.topSourceChoiceDateText).toBe("2026-05-31");
    expect(summary.topSourceChoiceDateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(summary.topSourceChoiceDateUnixMs).toBe(Date.parse("2026-05-31T00:00:00.000Z"));
    expect(summary.topSourceChoiceDatePrecision).toBe("day");
    expect(summary.topSourceChoiceDateSource).toBe("title");
    expect(summary.topSourceChoiceRank).toBe(1);
    expect(summary.topSourceChoiceText).toBe("Source");
    expect(summary.topSourceChoiceSelector).toBe("a:nth-of-type(1)");
    expect(summary.topSourceChoiceRelevance).toBe("high");
    expect(summary.topSourceChoiceMatchedTerm).toBe("source");
    expect(summary.topSourceChoiceFindMatch).toBe("Source");
    expect(summary.topSourceChoiceLikelyOfficial).toBe(true);
    expect(summary.topSourceChoiceCommand).toContain("source.example/report");
    expect(summary.topSourceChoiceCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.secondSourceChoicePath).toBe("pageCheck.sourceLinks[1]");
    expect(summary.secondSourceChoiceUrlPath).toBe("/report");
    expect(summary.secondSourceChoiceUrlQuery).toBe("?ref=docs");
    expect(summary.secondSourceChoiceSnippet).toBe("Backup source summary");
    expect(summary.secondSourceChoiceDateText).toBe("2026-06-01");
    expect(summary.secondSourceChoiceDateIso).toBe("2026-06-01T00:00:00.000Z");
    expect(summary.secondSourceChoiceDateUnixMs).toBe(Date.parse("2026-06-01T00:00:00.000Z"));
    expect(summary.secondSourceChoiceDatePrecision).toBe("day");
    expect(summary.secondSourceChoiceDateSource).toBe("snippet");
    expect(summary.secondSourceChoiceRank).toBe(2);
    expect(summary.secondSourceChoiceText).toBe("Backup source");
    expect(summary.secondSourceChoiceSelector).toBe("a:nth-of-type(2)");
    expect(summary.secondSourceChoiceRelevance).toBe("medium");
    expect(summary.secondSourceChoiceMatchedTerm).toBe("backup");
    expect(summary.secondSourceChoiceFindMatch).toBe("Backup");
    expect(summary.secondSourceChoiceLikelyOfficial).toBe(false);
    expect(summary.secondSourceChoicePrimary).toBe(false);
    expect(summary.secondSourceChoiceCommand).toContain("backup.example/report");
    expect(summary.secondSourceChoiceCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.sourceSearchQuery).toBe("ax-grep docs");
    expect(summary.sourceSearchTopFindQuery).toBe("install");
    expect(summary.sourceSearchSelectedTitle).toBe("ax-grep documentation");
    expect(summary.sourceSearchSelectedSnippet).toBe("Selected source summary");
    expect(summary.sourceSearchSelectedDatePrecision).toBe("day");
    expect(summary.sourceSearchSelectedDateSource).toBe("snippet");
    expect(summary.sourceSearchSelectedMatchedTerm).toBe("ax-grep");
    expect(summary.sourceSearchSelectedFindMatch).toBe("install");
    expect(summary.sourceSearchSelectedFirstSitelinkTitle).toBe("Install");
    expect(summary.sourceSearchSelectedFirstSitelinkUrlPath).toBe("/result");
    expect(summary.sourceSearchSelectedFirstSitelinkSelector).toBe("a");
    expect(summary.sourceSearchSelectedFirstSitelinkCommandArgs).toEqual(["ax-grep", "https://source.example/result#install", "--agent"]);
    expect(summary.sourceSearchSelectedCommand).toContain("--open-result 2");
    expect(summary.sourceSearchSelectedSourceScore).toBe(0.91);
    expect(summary.sourceSearchSelectedRelevance).toBe("high");
    expect(summary.sourceSearchSelectedLikelyOfficial).toBe(true);
    expect(summary.sourceSearchSelectedCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.sourceSearchFailurePath).toBe("sourceSearch.selectedResult");
    expect(summary.sourceSearchFailureHost).toBe("source.example");
    expect(summary.sourceSearchFailureCommand).toContain("--open-result 2");
    expect(summary.sourceSearchFailureCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.sourceSearchAlternateCount).toBe(1);
    expect(summary.sourceSearchAlternatePath).toBe("sourceSearch.alternateResults[0]");
    expect(summary.sourceSearchAlternateSnippet).toBe("Alternate source summary");
    expect(summary.sourceSearchAlternateDatePrecision).toBe("day");
    expect(summary.sourceSearchAlternateDateSource).toBe("snippet");
    expect(summary.sourceSearchAlternateMatchedTerm).toBe("docs");
    expect(summary.sourceSearchAlternateFindMatch).toBe("mirror");
    expect(summary.sourceSearchAlternateFirstSitelinkTitle).toBe("Mirror");
    expect(summary.sourceSearchAlternateFirstSitelinkUrlPath).toBe("/result");
    expect(summary.sourceSearchAlternateFirstSitelinkSelector).toBe("a");
    expect(summary.sourceSearchAlternateFirstSitelinkCommandArgs).toEqual(["ax-grep", "https://mirror.example/result#mirror", "--agent"]);
    expect(summary.sourceSearchAlternateCommand).toContain("--open-result 3");
    expect(summary.sourceSearchAlternateSourceScore).toBe(0.64);
    expect(summary.sourceSearchAlternateRelevance).toBe("medium");
    expect(summary.sourceSearchAlternateLikelyOfficial).toBe(false);
    expect(summary.sourceSearchAlternateDifferentHost).toBe(true);
    expect(summary.sourceSearchSecondAlternatePath).toBe("sourceSearch.alternateResults[1]");
    expect(summary.sourceSearchSecondAlternateDatePrecision).toBe("day");
    expect(summary.sourceSearchSecondAlternateMatchedTerm).toBe("docs");
    expect(summary.sourceSearchSecondAlternateFindMatch).toBe("backup");
    expect(summary.sourceSearchSecondAlternateFirstSitelinkUrlPath).toBe("/result/docs");
    expect(summary.sourceSearchSecondAlternateFirstSitelinkCommandArgs).toEqual(["ax-grep", "https://backup.example/result/docs?ref=backup", "--agent"]);
    expect(summary.sourceSearchSecondAlternateCommand).toContain("--open-result 4");
    expect(summary.sourceSearchSecondAlternateSourceScore).toBe(0.52);
    expect(summary.sourceSearchSecondAlternateDifferentHost).toBe(true);
    expect(summary.sourceSearchAlternateChoices?.[0]?.path).toBe("sourceSearch.alternateResults[0]");
    expect(summary.sourceSearchAlternateChoices?.[0]?.urlPath).toBe("/result");
    expect(summary.sourceSearchAlternateChoices?.[0]?.urlQuery).toBe("?ref=mirror");
    expect(summary.sourceSearchAlternateChoices?.[0]?.command).toContain("--open-result 3");
    expect(summary.sourceSearchAlternateChoices?.[0]?.sourceScore).toBe(0.64);
    expect(summary.sourceSearchAlternateChoices?.[0]?.snippet).toBe("Alternate source summary");
    expect(summary.sourceSearchAlternateChoices?.[0]?.datePrecision).toBe("day");
    expect(summary.sourceSearchAlternateChoices?.[0]?.dateSource).toBe("snippet");
    expect(summary.sourceSearchAlternateChoices?.[0]?.matchedTerms?.[0]).toBe("docs");
    expect(summary.sourceSearchAlternateChoices?.[0]?.sitelinks?.[0]?.commandArgs).toEqual(["ax-grep", "https://mirror.example/result#docs", "--agent"]);
    expect(summary.sourceSearchAlternateChoices?.[0]?.relevance).toBe("medium");
    expect(summary.sourceSearchAlternateChoices?.[0]?.isLikelyOfficial).toBe(false);
    expect(summary.topActionName).toBe("read-content");
    expect(summary.topActionPriorityReason).toBe("Readable content is available.");
    expect(summary.runbookCommand).toBe("ax-grep https://example.test --agent");
    expect(summary.executionPlanCommand).toBe("ax-grep https://example.test --agent");
    expect(summary.executorCommand).toBe("ax-grep https://example.test --agent");
    expect(summary.executorAfterInteractionCommand).toBe("ax-grep https://example.test --html-file captured.html --agent");
    expect(summary.topActionCommand).toBe("ax-grep https://example.test --agent");
    expect(summary.topActionRank).toBe(1);
    expect(summary.topActionExpectedOutcome).toBe("read-evidence");
    expect(summary.topActionTargetTitle).toBe("Example target");
    expect(summary.topActionTargetSourceScore).toBe(0.92);
    expect(summary.topActionTargetDateText).toBe("2026-05-31");
    expect(summary.topActionTargetDateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(summary.topActionTargetDateUnixMs).toBe(Date.parse("2026-05-31T00:00:00.000Z"));
    expect(summary.topActionTargetDatePrecision).toBe("day");
    expect(summary.topActionTargetDateSource).toBe("snippet");
    expect(summary.topActionTargetLikelyOfficial).toBe(true);
    expect(summary.pagePublishedTime).toBe("2026-02-03T04:05:06Z");
    expect(summary.verificationMissingQueries).toEqual(["missing"]);
    expect(summary.topVerificationMissingQuery).toBe("missing");
    expect(summary.searchDecisionName).toBe("open-result");
    expect(summary.pageDecisionReadFrom).toBe("pageCheck.contentEvidence");
    expect(summary.pageDecisionReadTargetKind).toBe("evidence");
    expect(summary.pageDecisionReadTargetScore).toBe(0.9);
    expect(summary.pageDecisionReadTargetReason).toBe("Top evidence.");
    expect(summary.pageDecisionReadability).toBe("high");
    expect(summary.pageDecisionEvidenceQualityScore).toBe(0.9);
    expect(summary.pageDecisionSourceQualityScore).toBe(0.92);
    expect(summary.pageDecisionCommand).toContain("example.test");
    expect(summary.semanticTopHeading).toBe("Example");
    expect(summary.semanticTopHeadingPath).toBe("agent.semanticSummary.headingItems[0]");
    expect(summary.semanticTopHeadingSelector).toBe("h1");
    expect(summary.semanticTopLandmarkRole).toBe("main");
    expect(summary.semanticTopLandmarkSelector).toBe("main");
    expect(summary.semanticTopNamedRoleName).toBe("Example");
    expect(summary.semanticTopNamedRoleSelector).toBe("h1");
    expect(summary.readTargetCount).toBe(3);
    expect(summary.topReadTarget).toBe("pageCheck.contentEvidence");
    expect(summary.topReadTargetKind).toBe("evidence");
    expect(summary.secondReadTarget).toBe("agent.semanticSummary");
    expect(summary.secondReadTargetKind).toBe("semantic");
    expect(summary.secondReadTargetCount).toBe(3);
    expect(summary.secondReadTargetPrimary).toBe(false);
    expect(summary.bestReadTargetCount).toBe(1);
    expect(summary.bestReadTargetKind).toBe("evidence");
    expect(summary.bestReadTargetPrimary).toBe(true);
    expect(summary.qualityGateFailCount).toBe(1);
    expect(summary.topSignalKind).toBe("content");
    expect(summary.topQualityGatePass).toBe(true);
    expect(summary.problemSignalSeverity).toBe("warning");
    expect(summary.failingQualityGateKind).toBe("content");
    expect(summary.failingQualityGateSeverity).toBe("warning");
    expect(summary.failingQualityGateScore).toBe(0.4);
    expect(summary.staticReadinessReadTargetKind).toBe("evidence");
    expect(summary.staticReadinessReadTargetPrimary).toBe(true);
    expect(summary.browserHtmlReason).toContain("Browser-captured HTML");
    expect(summary.topDiagnosticCode).toBe("NO_USEFUL_LINKS");
    expect(summary.topCitationPath).toBe("pageCheck.contentEvidence[0]");
    expect(summary.topCitationUrlPath).toBe("/");
    expect(summary.topCitationCommandArgs?.[1]).toBe("https://example.test");
    expect(summary.secondCitationPath).toBe("pageCheck.sourceLinks[0]");
    expect(summary.secondCitationUrlPath).toBe("/report");
    expect(summary.secondCitationUrlQuery).toBe("?ref=agent");
    expect(summary.secondCitationCommandArgs?.[1]).toBe("https://source.example/report?ref=agent");
    expect(summary.topAnswerEvidencePath).toBe("pageCheck.contentEvidence[0]");
    expect(summary.topAnswerEvidenceUrlPath).toBe("/");
    expect(summary.topAnswerEvidenceCommandArgs?.[1]).toBe("https://example.test");
    expect(summary.topAnswerEvidenceScore).toBe(0.9);
    expect(summary.secondAnswerEvidencePath).toBe("pageCheck.contentEvidence[1]");
    expect(summary.secondAnswerEvidenceUrlPath).toBe("/evidence");
    expect(summary.secondAnswerEvidenceUrlQuery).toBe("?ref=2");
    expect(summary.secondAnswerEvidenceCommandArgs?.[1]).toBe("https://example.test/evidence?ref=2");
    expect(summary.secondAnswerEvidenceScore).toBe(0.72);
    expect(summary.answerPlanStatus).toBe("ready");
    expect(summary.answerPlanNextAction).toBe("read-content");
    expect(summary.answerPlanReadTargetKind).toBe("evidence");
    expect(summary.answerPlanReadTargetScore).toBe(0.9);
    expect(summary.answerPlanCommand).toBe("ax-grep https://example.test --agent");
    expect(summary.executionPlanReadTargetKind).toBe("evidence");
    expect(summary.executionPlanReadTargetReason).toBe("Top evidence.");
    expect(summary.runbookReadTargetKind).toBe("evidence");
    expect(summary.runbookReadTargetScore).toBe(0.9);
    expect(summary.runbookReadTargetReason).toBe("Top evidence.");
    expect(summary.runbookReadValueType).toBe("array");
    expect(summary.runbookReadValueReferencePath).toBe("pageCheck.contentEvidence");
    expect(summary.nextActionName).toBe("read-content");
    expect(summary.nextReadFrom).toBe("pageCheck.contentEvidence");
    expect(summary.nextReadTargetKind).toBe("evidence");
    expect(summary.nextReadTargetPrimary).toBe(true);
    expect(summary.nextReadValuePath).toBe("pageCheck.contentEvidence");
    expect(summary.nextReadValueType).toBe("array");
    expect(summary.nextReadValueCount).toBe(1);
    expect(summary.nextReadValueReferencePath).toBe("pageCheck.contentEvidence");
    expect(summary.executorOperation).toBe("return");
    expect(summary.executorTerminal).toBe(true);
    expect(summary.executorReadTargetKind).toBe("evidence");
    expect(summary.executorReadTargetCount).toBe(1);
    expect(summary.executorReadTargetReason).toBe("Top evidence.");
    expect(summary.executorReadValueType).toBe("array");
    expect(summary.executorReadValueReferencePath).toBe("pageCheck.contentEvidence");
    expect(summary.executorTargetSelector).toBe("a.primary");
    expect(summary.executorTargetSourceScore).toBe(0.92);
    expect(summary.executorTargetDateText).toBe("2026-05-31");
    expect(summary.executorTargetDateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(summary.executorTargetDateUnixMs).toBe(Date.parse("2026-05-31T00:00:00.000Z"));
    expect(summary.executorTargetDatePrecision).toBe("day");
    expect(summary.executorTargetDateSource).toBe("snippet");
    expect(summary.executorTargetLikelyOfficial).toBe(true);
    expect(summary.executorBrowserHtmlReasonCode).toBe("challenge");
    expect(summary.handoffAnswerStatus).toBe("ready");
    expect(summary.handoffShouldContinue).toBe(false);
    expect(summary.handoffCommand).toBe("ax-grep https://example.test --agent");
    expect(summary.handoffAfterInteractionCommand).toBe("ax-grep https://example.test --html-file captured.html --agent");
    expect(summary.handoffReadTargetKind).toBe("evidence");
    expect(summary.handoffReadTargetScore).toBe(0.9);
    expect(summary.handoffReadValuePath).toBe("pageCheck.contentEvidence");
    expect(summary.handoffReadValueCount).toBe(1);
    expect(summary.handoffTargetPath).toBe("pageCheck.links[0]");
    expect(summary.handoffTargetTitle).toBe("Example target");
    expect(summary.handoffTargetRelevance).toBe("high");
    expect(summary.handoffTargetDateText).toBe("2026-05-31");
    expect(summary.handoffTargetDateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(summary.handoffTargetDateUnixMs).toBe(Date.parse("2026-05-31T00:00:00.000Z"));
    expect(summary.handoffTargetDatePrecision).toBe("day");
    expect(summary.handoffTargetDateSource).toBe("snippet");
    expect(summary.handoffBrowserHtmlReasonCode).toBe("challenge");
    expect(summary.primaryActionName).toBe("read-content");
    expect(summary.primaryExpectedOutcome).toBe("read-evidence");
    expect(summary.primaryBrowserHtmlReasonCode).toBe("challenge");
    expect(summary.primaryAfterInteractionCommand).toBe("ax-grep https://example.test --html-file captured.html --agent");
    expect(summary.primaryAfterInteractionCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.topActionBrowserHtmlReasonCode).toBe("challenge");
    expect(summary.primarySourceLinkRef).toBe("pageCheck.sourceLinks[0]");
    expect(summary.primaryTargetTitle).toBe("Example target");
    expect(summary.primaryTargetSourceScore).toBe(0.92);
    expect(summary.primaryTargetDateText).toBe("2026-05-31");
    expect(summary.primaryTargetDateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(summary.primaryTargetDateUnixMs).toBe(Date.parse("2026-05-31T00:00:00.000Z"));
    expect(summary.primaryTargetDatePrecision).toBe("day");
    expect(summary.primaryTargetDateSource).toBe("snippet");
    expect(summary.primaryTargetLikelyOfficial).toBe(true);
    expect(summary.alternativeActionName).toBe("open-source-link");
    expect(summary.alternativeActionPriorityReason).toBe("External source-like link can improve verification.");
    expect(summary.alternativeActionCommand).toBe("ax-grep https://source.example/report --agent");
    expect(summary.alternativeActionOpenResult).toBe("best");
    expect(summary.alternativeActionExpectedOutcome).toBe("open-result");
    expect(summary.alternativeActionCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.alternativeActionTargetTitle).toBe("Source report");
    expect(summary.alternativeActionTargetSourceScore).toBe(0.84);
    expect(summary.alternativeActionTargetDateText).toBe("2026-05-30");
    expect(summary.alternativeActionTargetDateIso).toBe("2026-05-30T00:00:00.000Z");
    expect(summary.alternativeActionTargetDateUnixMs).toBe(Date.parse("2026-05-30T00:00:00.000Z"));
    expect(summary.alternativeActionTargetDatePrecision).toBe("day");
    expect(summary.alternativeActionTargetDateSource).toBe("snippet");
    expect(summary.alternativeActionTargetLikelyOfficial).toBe(false);
    expect(summary.recommendedPath).toBe("recommendedResult");
    expect(summary.recommendedSourceScore).toBe(0.92);
    expect(summary.recommendedDateText).toBe("2026-05-31");
    expect(summary.recommendedDatePrecision).toBe("day");
    expect(summary.recommendedDateSource).toBe("snippet");
    expect(summary.recommendedRelevance).toBe("high");
    expect(summary.recommendedLikelyOfficial).toBe(true);
    expect(summary.recommendedSelectionReason).toBe("Best ranked result.");
    expect(summary.searchDecisionRecommendedPath).toBe("recommendedResult");
    expect(summary.searchDecisionRecommendedSourceScore).toBe(0.92);
    expect(summary.searchDecisionRecommendedDateText).toBe("2026-05-31");
    expect(summary.searchDecisionRecommendedDateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(summary.searchDecisionRecommendedDateUnixMs).toBe(Date.parse("2026-05-31T00:00:00.000Z"));
    expect(summary.searchDecisionRecommendedDatePrecision).toBe("day");
    expect(summary.searchDecisionRecommendedDateSource).toBe("snippet");
    expect(summary.searchDecisionRecommendedLikelyOfficial).toBe(true);
    expect(summary.searchDecisionFirstOfficialPath).toBe("searchResults[0]");
    expect(summary.searchDecisionFirstOfficialSourceScore).toBe(0.92);
    expect(summary.searchDecisionFirstOfficialDateIso).toBe("2026-05-31T00:00:00.000Z");
    expect(summary.searchDecisionFirstOfficialDateUnixMs).toBe(Date.parse("2026-05-31T00:00:00.000Z"));
    expect(summary.searchDecisionFirstOfficialCommand).toContain("example.test");
    expect(summary.searchDecisionFirstOfficialCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.searchDecisionCommand).toContain("--open-result 1");
    expect(summary.searchDecision?.recommendedRelevance).toBe("high");
    expect(summary.searchDecision?.recommendedDateText).toBe("2026-05-31");
    expect(summary.searchDecision?.recommendedDatePrecision).toBe("day");
    expect(summary.searchDecision?.recommendedDateSource).toBe("snippet");
    expect(summary.pageDecision?.readability).toBe("high");
    expect(summary.semanticSummary?.tableItems[0]?.sampleCellRefs?.[0]?.headers?.[0]).toBe("Plan");
    expect(summary.semanticSummary?.fieldItems[0]?.state?.required).toBe(true);
    expect(summary.recommendedCommand).toContain("example.test");
    expect(summary.recommendedCommandArgs?.[0]).toBe("ax-grep");

    const envelopeRecommendation = {
      sourceSearch: {
        query: "example",
        engine: "auto",
        selectedEngine: "duckduckgo",
        searchUrl: "https://duckduckgo.com/?q=example",
        selectedRank: 1,
        selectedTitle: "Example result",
        selectedUrl: "https://example.test",
        selectedResult: {
          id: "selected",
          path: "sourceSearch.selectedResult",
          title: "Example result",
          url: "https://example.test",
          rank: 1,
          openResult: 1,
          commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent"],
        },
      },
      page: {
        description: "Example page",
        lang: "en",
        siteName: "Example",
        structuredDataTypes: ["Article"],
      },
      pageCheck: {
        contentEvidence: [{
          id: "e1",
          path: "pageCheck.contentEvidence[0]",
          rank: 1,
          text: "Example evidence",
          role: "main",
          source: "semantic",
          score: 0.9,
          quality: "high",
          qualityReason: "Readable semantic evidence.",
          selector: "main",
        }],
        contentLength: 1200,
        confidence: "high",
        readability: {
          level: "high",
          score: 0.95,
          reasons: ["Readable article body."],
        },
        sourceLinks: [{
          id: "s1",
          path: "pageCheck.sourceLinks[0]",
          kind: "external",
          title: "Source report",
          url: "https://source.example/report",
          rank: 1,
          command: "ax-grep 'https://source.example/report' --agent",
          commandArgs: ["ax-grep", "https://source.example/report", "--agent"],
        }],
        dataTables: [{
          id: "t1",
          path: "pageCheck.dataTables[0]",
          rank: 1,
          rowCount: 2,
          columnCount: 2,
          headers: ["Plan", "Price"],
          sampleRows: [["Starter", "$19"]],
          caption: "Pricing",
        }],
        barriers: [{
          id: "b1",
          path: "pageCheck.barriers[0]",
          rank: 1,
          kind: "cookie-consent",
          severity: "info",
          evidence: "Cookie banner detected.",
          source: "content",
        }],
        codeBlocks: [{
          id: "code1",
          path: "pageCheck.codeBlocks[0]",
          rank: 1,
          lineCount: 1,
          source: "pre",
          language: "bash",
          commandLike: true,
        }],
        citations: [{
          id: "cite1",
          path: "pageCheck.citations[0]",
          rank: 1,
          source: "reference",
          title: "Reference",
          url: "https://source.example/report",
          urlPath: "/report",
        }],
        media: [{
          id: "m1",
          path: "pageCheck.media[0]",
          rank: 1,
          kind: "image",
          url: "https://example.test/hero.png",
          urlPath: "/hero.png",
          alt: "Hero",
        }],
        resources: [{
          id: "rsc1",
          path: "pageCheck.resources[0]",
          rank: 1,
          kind: "document",
          url: "https://example.test/report.pdf",
          urlPath: "/report.pdf",
          title: "Report",
          type: "application/pdf",
        }],
        breadcrumbs: [{
          id: "bc1",
          path: "pageCheck.breadcrumbs[0]",
          rank: 1,
          source: "html",
          items: [{ label: "Home", url: "https://example.test", urlPath: "/", position: 1 }],
        }],
        sections: [{
          id: "sec1",
          path: "pageCheck.sections[0]",
          rank: 1,
          heading: "Overview",
          level: 2,
          excerpts: ["Example section excerpt."],
        }],
        pagination: [{
          id: "pg1",
          path: "pageCheck.pagination[0]",
          rank: 1,
          kind: "next",
          label: "Next",
          source: "link",
          url: "https://example.test/page/2",
          urlPath: "/page/2",
        }],
        toc: [{
          id: "toc1",
          path: "pageCheck.toc[0]",
          rank: 1,
          items: [{ label: "Overview", url: "https://example.test/docs#overview", urlPath: "/docs", level: 2 }],
          title: "Contents",
        }],
        authorLinks: [{
          id: "author1",
          path: "pageCheck.authorLinks[0]",
          rank: 1,
          url: "https://example.test/authors/ada",
          urlPath: "/authors/ada",
          source: "link",
          name: "Ada",
          rel: "author",
        }],
        contactPoints: [{
          id: "contact1",
          path: "pageCheck.contactPoints[0]",
          rank: 1,
          kind: "email",
          label: "Support",
          value: "support@example.test",
          source: "html",
          url: "https://example.test/support",
          urlPath: "/support",
        }],
        offers: [{
          id: "offer1",
          path: "pageCheck.offers[0]",
          rank: 1,
          name: "Starter",
          price: "19",
          priceAmount: 19,
          currency: "USD",
          url: "https://example.test/buy",
          urlPath: "/buy",
          source: "json-ld",
        }],
        identities: [{
          id: "identity1",
          path: "pageCheck.identities[0]",
          rank: 1,
          kind: "organization",
          name: "Example",
          source: "json-ld",
          url: "https://example.test",
          urlPath: "/",
          logoUrl: "https://example.test/logo.png",
          logoUrlPath: "/logo.png",
          sameAs: ["https://social.example/example"],
          sameAsUrlPaths: ["/example"],
        }],
        datasets: [{
          id: "dataset1",
          path: "pageCheck.datasets[0]",
          rank: 1,
          kind: "dataset",
          name: "Example dataset",
          source: "json-ld",
          url: "https://example.test/data",
          urlPath: "/data",
          distributionUrls: ["https://example.test/data.csv"],
          distributionUrlPaths: ["/data.csv"],
          licenseUrl: "https://example.test/license",
          licenseUrlPath: "/license",
          temporalCoverage: "2020/2025",
          spatialCoverage: "United States",
          creator: "Example Lab",
        }],
        timeline: [{
          id: "time1",
          path: "pageCheck.timeline[0]",
          rank: 1,
          kind: "published",
          label: "Published",
          value: "2026-01-02",
          source: "meta",
        }],
        faqs: [{
          id: "faq1",
          path: "pageCheck.faqs[0]",
          rank: 1,
          question: "How do I install it?",
          answer: "Run the installer.",
          source: "html",
        }],
        hydration: [{
          id: "h1",
          path: "pageCheck.hydration[0]",
          rank: 1,
          kind: "next-data",
          label: "__NEXT_DATA__",
          source: "script",
          framework: "next",
          route: "/docs",
          url: "https://example.test/_next/data/build/docs.json",
          urlPath: "/_next/data/build/docs.json",
        }],
        apiEndpoints: [{
          id: "api1",
          path: "pageCheck.apiEndpoints[0]",
          rank: 1,
          kind: "graphql",
          method: "POST",
          url: "https://example.test/graphql",
          urlPath: "/graphql",
          source: "script",
        }],
        clientState: [{
          id: "state1",
          path: "pageCheck.clientState[0]",
          rank: 1,
          kind: "local-storage",
          operation: "read",
          key: "session",
          source: "script",
        }],
        runtime: [{
          id: "runtime1",
          path: "pageCheck.runtime[0]",
          rank: 1,
          kind: "service-worker",
          url: "https://example.test/sw.js",
          urlPath: "/sw.js",
          source: "script",
        }],
        config: [{
          id: "config1",
          path: "pageCheck.config[0]",
          rank: 1,
          kind: "feature-flags",
          name: "flags",
          keys: ["beta"],
          keyCount: 1,
          source: "script",
        }],
        topics: [{
          id: "topic1",
          path: "pageCheck.topics[0]",
          rank: 1,
          kind: "keyword",
          label: "Keyword",
          value: "agent",
          source: "meta",
        }],
        keyValues: [{
          id: "kv1",
          path: "pageCheck.keyValues[0]",
          rank: 1,
          label: "Version",
          value: "1.0",
          source: "definition-list",
        }],
        metaFacts: [{
          id: "meta1",
          path: "pageCheck.metaFacts[0]",
          rank: 1,
          label: "Generator",
          value: "ax-grep",
          source: "meta",
          url: "https://example.test/generator",
          urlPath: "/generator",
        }],
        provenance: [{
          id: "prov1",
          path: "pageCheck.provenance[0]",
          rank: 1,
          kind: "doi",
          label: "DOI",
          value: "10.1000/example",
          source: "meta",
          url: "https://doi.org/10.1000/example",
          urlPath: "/10.1000/example",
        }],
        httpPolicies: [{
          id: "policy1",
          path: "pageCheck.httpPolicies[0]",
          rank: 1,
          name: "content-security-policy",
          value: "default-src 'self'",
          source: "header",
        }],
        schemaFacts: [{
          id: "schema1",
          path: "pageCheck.schemaFacts[0]",
          rank: 1,
          types: ["Article"],
          facts: [{ label: "headline", value: "Example" }],
          source: "json-ld",
        }],
        appHints: [{
          id: "app1",
          path: "pageCheck.appHints[0]",
          rank: 1,
          kind: "manifest",
          label: "Manifest",
          value: "/manifest.webmanifest",
          source: "link",
          url: "https://example.test/manifest.webmanifest",
          urlPath: "/manifest.webmanifest",
        }],
        mobileHints: [{
          id: "mobile1",
          path: "pageCheck.mobileHints[0]",
          rank: 1,
          kind: "viewport",
          label: "Viewport",
          value: "width=device-width",
          source: "meta",
          url: "https://example.test/app",
          urlPath: "/app",
        }],
        embeds: [{
          id: "embed1",
          path: "pageCheck.embeds[0]",
          rank: 1,
          kind: "iframe",
          url: "https://player.example/embed",
          urlPath: "/embed",
          title: "Player",
          posterUrl: "https://player.example/poster.jpg",
          posterUrlPath: "/poster.jpg",
          sourceUrls: ["https://player.example/video.mp4"],
          sourceUrlPaths: ["/video.mp4"],
          loading: "lazy",
        }],
        transcripts: [{
          id: "transcript1",
          path: "pageCheck.transcripts[0]",
          rank: 1,
          kind: "captions",
          url: "https://example.test/captions.vtt",
          urlPath: "/captions.vtt",
          mediaKind: "video",
          language: "en",
        }],
        forms: [{
          rank: 1,
          method: "GET",
          fieldCount: 1,
          hiddenFieldCount: 0,
          fields: [{
            name: "q",
            type: "search",
            label: "Search",
            required: true,
          }],
          actionUrl: "https://example.test/search",
          queryField: "q",
          urlTemplate: "https://example.test/search?q={query}",
        }],
        actionTargets: [{
          id: "at1",
          path: "pageCheck.actionTargets[0]",
          rank: 1,
          kind: "search",
          name: "Search",
          text: "Search example.test",
          source: "link",
          urlTemplate: "https://example.test/search?q={query}",
          queryInput: "q",
          method: "GET",
          selector: "link[rel='search']",
        }],
        recommendedAction: {
          action: "read-content",
          execution: "read-current",
          reason: "Readable content is available.",
          readFrom: "pageCheck.contentEvidence",
        },
        nextSteps: [{
          action: "open-source-link",
          execution: "run-command",
          reason: "Open source.",
          sourceLinkRef: "pageCheck.sourceLinks[0]",
        }],
        title: "Example result",
        canonicalUrl: "https://example.test",
        mainHeading: "Example result",
      },
      verification: {
        status: "matched",
        requestedCount: 1,
        foundCount: 1,
        missingCount: 0,
        evidenceCount: 1,
        foundQueries: ["example"],
        bestEvidence: {
          field: "content",
          text: "Example evidence",
          score: 0.9,
          quality: "high",
          qualityReason: "Matched requested query.",
        },
        recommendedAction: {
          action: "use-evidence",
          execution: "read-current",
          reason: "Verification matched.",
          readFrom: "verification.bestEvidence",
        },
      },
      finds: [{
        query: "example",
        found: true,
        matchCount: 1,
        matches: [{
          field: "content",
          text: "Example evidence",
          source: "semantic",
          score: 0.9,
          quality: "high",
          qualityReason: "Matched requested query.",
        }],
      }],
      searchResults: [{
        id: "r1",
        path: "searchResults[0]",
        title: "Example result",
        url: "https://example.test",
        rank: 1,
        recommended: true,
        recommendedPath: "recommendedResult",
        openResult: 1,
        commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent"],
      }],
      recommendedResult: {
        id: "r1",
        path: "recommendedResult",
        title: "Example result",
        url: "https://example.test",
        host: "example.test",
        source: "example.test",
        rank: 1,
        snippet: "Result summary",
        sourceScore: 0.92,
        relevance: "high",
        isLikelyOfficial: true,
        selectionReason: "Best ranked result.",
        openResult: 1,
        command: "ax-grep --search example --open-result 1 --agent",
        commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent"],
      },
      suggestedActions: [{
        action: "open-result",
        execution: "run-command",
        priority: "high",
        priorityReason: "Best ranked result.",
        reason: "Open the recommended result.",
        openResult: 1,
        command: "ax-grep --search example --open-result 1 --agent",
        commandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent"],
        target: {
          title: "Example result",
          url: "https://example.test",
          path: "recommendedResult",
          rank: 1,
          sourceScore: 0.92,
          relevance: "high",
          isLikelyOfficial: true,
        },
      }],
    } satisfies Pick<AgentJsonEnvelope, "sourceSearch" | "page" | "pageCheck" | "verification" | "finds" | "searchResults" | "recommendedResult" | "suggestedActions">;
    expect(envelopeRecommendation.sourceSearch.selectedResult?.commandArgs?.[4]).toBe("1");
    expect(envelopeRecommendation.page.structuredDataTypes?.[0]).toBe("Article");
    expect(envelopeRecommendation.pageCheck.contentEvidence[0]?.quality).toBe("high");
    expect(envelopeRecommendation.pageCheck.sourceLinks?.[0]?.command).toContain("source.example/report");
    expect(envelopeRecommendation.pageCheck.sourceLinks?.[0]?.commandArgs?.[0]).toBe("ax-grep");
    expect(envelopeRecommendation.pageCheck.dataTables?.[0]?.headers[1]).toBe("Price");
    expect(envelopeRecommendation.pageCheck.barriers?.[0]?.kind).toBe("cookie-consent");
    expect(envelopeRecommendation.pageCheck.codeBlocks?.[0]?.commandLike).toBe(true);
    expect(envelopeRecommendation.pageCheck.citations?.[0]?.url).toContain("source.example");
    expect(envelopeRecommendation.pageCheck.media?.[0]?.alt).toBe("Hero");
    expect(envelopeRecommendation.pageCheck.resources?.[0]?.type).toBe("application/pdf");
    expect(envelopeRecommendation.pageCheck.breadcrumbs?.[0]?.items[0]?.label).toBe("Home");
    expect(envelopeRecommendation.pageCheck.sections?.[0]?.heading).toBe("Overview");
    expect(envelopeRecommendation.pageCheck.pagination?.[0]?.kind).toBe("next");
    expect(envelopeRecommendation.pageCheck.toc?.[0]?.items[0]?.level).toBe(2);
    expect(envelopeRecommendation.pageCheck.authorLinks?.[0]?.rel).toBe("author");
    expect(envelopeRecommendation.pageCheck.contactPoints?.[0]?.value).toBe("support@example.test");
    expect(envelopeRecommendation.pageCheck.offers?.[0]?.currency).toBe("USD");
    expect(envelopeRecommendation.pageCheck.identities?.[0]?.kind).toBe("organization");
    expect(envelopeRecommendation.pageCheck.datasets?.[0]?.kind).toBe("dataset");
    expect(envelopeRecommendation.pageCheck.timeline?.[0]?.value).toBe("2026-01-02");
    expect(envelopeRecommendation.pageCheck.faqs?.[0]?.question).toContain("install");
    expect(envelopeRecommendation.pageCheck.hydration?.[0]?.framework).toBe("next");
    expect(envelopeRecommendation.pageCheck.apiEndpoints?.[0]?.kind).toBe("graphql");
    expect(envelopeRecommendation.pageCheck.clientState?.[0]?.key).toBe("session");
    expect(envelopeRecommendation.pageCheck.runtime?.[0]?.kind).toBe("service-worker");
    expect(envelopeRecommendation.pageCheck.config?.[0]?.keys[0]).toBe("beta");
    expect(envelopeRecommendation.pageCheck.topics?.[0]?.value).toBe("agent");
    expect(envelopeRecommendation.pageCheck.keyValues?.[0]?.label).toBe("Version");
    expect(envelopeRecommendation.pageCheck.metaFacts?.[0]?.value).toBe("ax-grep");
    expect(envelopeRecommendation.pageCheck.provenance?.[0]?.kind).toBe("doi");
    expect(envelopeRecommendation.pageCheck.httpPolicies?.[0]?.name).toBe("content-security-policy");
    expect(envelopeRecommendation.pageCheck.schemaFacts?.[0]?.facts[0]?.label).toBe("headline");
    expect(envelopeRecommendation.pageCheck.appHints?.[0]?.kind).toBe("manifest");
    expect(envelopeRecommendation.pageCheck.mobileHints?.[0]?.value).toContain("width");
    expect(envelopeRecommendation.pageCheck.embeds?.[0]?.loading).toBe("lazy");
    expect(envelopeRecommendation.pageCheck.transcripts?.[0]?.language).toBe("en");
    expect(envelopeRecommendation.pageCheck.forms?.[0]?.fields[0]?.name).toBe("q");
    expect(envelopeRecommendation.pageCheck.actionTargets?.[0]?.urlTemplate).toContain("{query}");
    expect(envelopeRecommendation.pageCheck.nextSteps?.[0]?.sourceLinkRef).toBe("pageCheck.sourceLinks[0]");
    expect(envelopeRecommendation.verification.bestEvidence?.quality).toBe("high");
    expect(envelopeRecommendation.finds[0]?.matches[0]?.source).toBe("semantic");
    expect(envelopeRecommendation.searchResults[0]?.recommendedPath).toBe("recommendedResult");
    expect(envelopeRecommendation.recommendedResult.commandArgs?.[4]).toBe("1");
    expect(envelopeRecommendation.suggestedActions[0]?.target?.sourceScore).toBe(0.92);
  });
});
