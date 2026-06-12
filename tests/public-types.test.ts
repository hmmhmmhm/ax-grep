import { describe, expect, it } from "vitest";
import type {
  AgentAction,
  AgentActionTargetChoice,
  AgentAnswerPlan,
  AgentCitation,
  AgentFormChoice,
  AgentHandoff,
  AgentResultChoice,
  AgentSourceChoice,
  AgentSourceSearchResult,
  AgentSummary,
  AgentTarget,
} from "../src/index";

describe("public agent types", () => {
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
      url: "https://example.test/result",
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
      url: "https://source.example/report",
      selector: "a:nth-of-type(1)",
      kind: "external",
      sourceScore: 0.91,
      selectionReason: "High-quality source link.",
      commandArgs: ["ax-grep", "https://source.example/report", "--agent-brief"],
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
      readFrom: "pageCheck.contentEvidence",
      readValue: {
        path: "pageCheck.contentEvidence",
        value: [evidence],
      },
    };

    expect(handoff.target?.selector).toBe("main > h1");
    expect(handoff.resultChoices?.[0]?.snippet).toBe("Result summary");
    expect(handoff.sourceChoices?.[0]?.selector).toBe("a:nth-of-type(1)");
    expect(handoff.verificationMissingQueries).toEqual(["missing"]);
    expect(handoff.answerEvidence?.[0]?.text).toBe("Readable evidence");
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
      text: "GET https://example.test/find; query field: q",
      actionUrl: "https://example.test/find",
      queryField: "q",
      urlTemplate: "https://example.test/find?q={query}",
      selector: "form:nth-of-type(1)",
      fields: [{ name: "q", type: "search", selector: "input[name=\"q\"]" }],
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
      urlTemplate: "https://example.test/search?q={query}",
      queryInput: "required name=query",
      method: "GET",
      disabled: true,
      pressed: false,
      expanded: true,
      haspopup: "dialog",
      controls: "search-dialog",
      selector: "script[type=\"application/ld+json\"]",
    };
    const summary: Pick<
      AgentSummary,
      | "resultCount"
      | "resultChoiceCount"
      | "resultChoices"
      | "topResultChoicePath"
      | "topResultChoiceTitle"
      | "topResultChoiceUrl"
      | "topResultChoiceCommandArgs"
      | "topResultChoiceRank"
      | "topResultChoiceOpenResult"
      | "topResultChoiceRecommended"
      | "topResultChoicePrimary"
      | "topResultChoiceSourceType"
      | "topResultChoiceSourceScore"
      | "topResultChoiceSourceHints"
      | "topResultChoiceDateText"
      | "topResultChoiceRelevance"
      | "topResultChoiceMatchedTerm"
      | "topResultChoiceFindMatch"
      | "topResultChoiceLikelyOfficial"
      | "topResultChoiceSitelinkCount"
      | "topResultChoiceFirstSitelinkTitle"
      | "topResultChoiceFirstSitelinkUrl"
      | "topResultChoiceReason"
      | "evidenceCount"
      | "formCount"
      | "formChoiceCount"
      | "formChoices"
      | "topFormChoicePath"
      | "topFormChoiceMethod"
      | "topFormChoiceActionUrl"
      | "topFormChoiceSubmitText"
      | "topFormChoiceQueryField"
      | "topFormChoiceUrlTemplate"
      | "topFormChoiceFieldCount"
      | "topFormChoiceSelector"
      | "topFormChoiceFirstFieldName"
      | "topFormChoiceFirstFieldType"
      | "topFormChoiceFirstFieldLabel"
      | "topFormChoiceFirstFieldRequired"
      | "topFormChoiceFirstFieldSelector"
      | "actionTargetCount"
      | "actionTargetChoiceCount"
      | "actionTargetChoices"
      | "topActionTargetChoicePath"
      | "topActionTargetChoiceKind"
      | "topActionTargetChoiceName"
      | "topActionTargetChoiceSource"
      | "topActionTargetChoiceTargetUrl"
      | "topActionTargetChoiceUrlTemplate"
      | "topActionTargetChoiceQueryInput"
      | "topActionTargetChoiceMethod"
      | "topActionTargetChoiceDisabled"
      | "topActionTargetChoicePressed"
      | "topActionTargetChoiceExpanded"
      | "topActionTargetChoiceHaspopup"
      | "topActionTargetChoiceControls"
      | "topActionTargetChoiceSelector"
      | "barrierCount"
      | "topBarrierKind"
      | "topBarrierSeverity"
      | "topBarrierSource"
      | "topBarrierPath"
      | "topBarrierText"
      | "topBarrierSelector"
      | "topBarrierDiagnosticCode"
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
      | "topDataTableFirstHeader"
      | "topDataTableFirstRow"
      | "topDataTableFirstCell"
      | "topDataTableSelector"
      | "topFaqQuestion"
      | "topFaqAnswer"
      | "topCodeBlockLanguage"
      | "topCodeBlockLineCount"
      | "topCodeBlockText"
      | "topResourceKind"
      | "topResourceUrl"
      | "topResourceTitle"
      | "topMediaKind"
      | "topMediaUrl"
      | "topMediaText"
      | "topSectionPath"
      | "topSectionHeading"
      | "topSectionLevel"
      | "topSectionText"
      | "topSectionSelector"
      | "topBreadcrumbPath"
      | "topBreadcrumbText"
      | "topBreadcrumbSource"
      | "topPaginationPath"
      | "topPaginationKind"
      | "topPaginationLabel"
      | "topPaginationUrl"
      | "topPaginationCurrent"
      | "topPaginationSelector"
      | "topTocPath"
      | "topTocTitle"
      | "topTocItemCount"
      | "topTocText"
      | "topTocFirstItemLabel"
      | "topTocFirstItemUrl"
      | "topTocSelector"
      | "topEmbedKind"
      | "topEmbedUrl"
      | "topEmbedTitle"
      | "topTranscriptKind"
      | "topTranscriptUrl"
      | "topTranscriptLabel"
      | "topTranscriptLanguage"
      | "topAuthorLinkName"
      | "topAuthorLinkUrl"
      | "topAuthorLinkSource"
      | "topProvenancePath"
      | "topProvenanceKind"
      | "topProvenanceLabel"
      | "topProvenanceValue"
      | "topProvenanceUrl"
      | "topProvenanceSource"
      | "topProvenanceSelector"
      | "topOfferPath"
      | "topOfferName"
      | "topOfferPrice"
      | "topOfferCurrency"
      | "topOfferAvailability"
      | "topOfferUrl"
      | "topOfferSelector"
      | "topDatasetPath"
      | "topDatasetKind"
      | "topDatasetName"
      | "topDatasetUrl"
      | "topDatasetDistributionUrl"
      | "topDatasetLicenseUrl"
      | "topDatasetEncodingFormat"
      | "topDatasetSelector"
      | "topIdentityPath"
      | "topIdentityKind"
      | "topIdentityName"
      | "topIdentityUrl"
      | "topIdentityLogoUrl"
      | "topIdentitySameAsUrl"
      | "topIdentitySource"
      | "topIdentitySelector"
      | "topTimelinePath"
      | "topTimelineKind"
      | "topTimelineLabel"
      | "topTimelineValue"
      | "topTimelineSource"
      | "topTimelineSelector"
      | "topContactPointPath"
      | "topContactPointKind"
      | "topContactPointLabel"
      | "topContactPointValue"
      | "topContactPointUrl"
      | "topContactPointSource"
      | "topContactPointSelector"
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
      | "hiddenAppHintCount"
      | "topHydrationPath"
      | "topHydrationKind"
      | "topHydrationLabel"
      | "topHydrationUrl"
      | "topHydrationSelector"
      | "topApiEndpointPath"
      | "topApiEndpointKind"
      | "topApiEndpointMethod"
      | "topApiEndpointUrl"
      | "topApiEndpointSelector"
      | "topClientStatePath"
      | "topClientStateKind"
      | "topClientStateOperation"
      | "topClientStateKey"
      | "topClientStateSelector"
      | "topAppHintPath"
      | "topAppHintKind"
      | "topAppHintLabel"
      | "topAppHintUrl"
      | "topAppHintSelector"
      | "hiddenReadTargetCount"
      | "topHiddenSignalGroup"
      | "topHiddenSignalPath"
      | "topHiddenSignalKind"
      | "topHiddenSignalText"
      | "topHiddenSignalUrl"
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
      | "topSourceChoiceCommandArgs"
      | "topSourceChoiceSourceType"
      | "topSourceChoiceSourceScore"
      | "topSourceChoiceSourceHints"
      | "topSourceChoicePrimary"
      | "topSourceChoiceReason"
      | "topChoiceKind"
      | "topChoicePath"
      | "topChoiceLabel"
      | "topChoiceUrl"
      | "topChoiceCommandArgs"
      | "sourceSearchQuery"
      | "sourceSearchEngine"
      | "sourceSearchSelectedEngine"
      | "sourceSearchSearchUrl"
      | "sourceSearchLang"
      | "sourceSearchRegion"
      | "sourceSearchFindQueryCount"
      | "sourceSearchTopFindQuery"
      | "sourceSearchSelectedRank"
      | "sourceSearchSelectedTitle"
      | "sourceSearchSelectedUrl"
      | "sourceSearchSelectedPath"
      | "sourceSearchSelectedOpenResult"
      | "sourceSearchSelectedCommandArgs"
      | "sourceSearchSelectedReason"
      | "sourceSearchAlternateCount"
      | "sourceSearchAlternatePath"
      | "sourceSearchAlternateTitle"
      | "sourceSearchAlternateUrl"
      | "sourceSearchAlternateRank"
      | "sourceSearchAlternateOpenResult"
      | "sourceSearchAlternateCommandArgs"
      | "sourceSearchAlternateReason"
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
      | "topCitationConfidence"
      | "topCitationReason"
      | "topCitationScore"
      | "answerEvidenceCount"
      | "topAnswerEvidenceId"
      | "topAnswerEvidencePath"
      | "topAnswerEvidenceKind"
      | "topAnswerEvidenceText"
      | "topAnswerEvidenceTitle"
      | "topAnswerEvidenceUrl"
      | "topAnswerEvidenceConfidence"
      | "topAnswerEvidenceReason"
      | "searchDecisionName"
      | "searchDecisionConfidence"
      | "searchDecisionReason"
      | "searchDecisionResultCount"
      | "searchDecisionRecommendedRank"
      | "searchDecisionRecommendedUrl"
      | "searchDecisionCommandArgs"
      | "pageDecisionName"
      | "pageDecisionConfidence"
      | "pageDecisionReason"
      | "pageDecisionReadFrom"
      | "pageDecisionUrl"
      | "pageDecisionCommandArgs"
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
      | "semanticTopHeading"
      | "semanticTopHeadingPath"
      | "semanticTopHeadingLevel"
      | "semanticTopLandmark"
      | "semanticTopLandmarkPath"
      | "semanticTopLandmarkRole"
      | "semanticTopLandmarkName"
      | "semanticTopNamedRole"
      | "semanticTopNamedRolePath"
      | "semanticTopNamedRoleRole"
      | "semanticTopNamedRoleName"
      | "semanticTopNamedRoleDescription"
      | "semanticTopInteractiveRole"
      | "semanticTopInteractivePath"
      | "semanticTopInteractiveName"
      | "semanticTopInteractiveRoleDescription"
      | "semanticTopInteractiveDescription"
      | "semanticTopInteractiveValue"
      | "semanticTopInteractiveState"
      | "semanticTopInteractiveDisabled"
      | "semanticTopInteractiveSelector"
      | "semanticTopFocusableRole"
      | "semanticTopFocusablePath"
      | "semanticTopFocusableName"
      | "semanticTopFocusableRoleDescription"
      | "semanticTopFocusableState"
      | "semanticTopFocusableSelector"
      | "semanticTopLinkName"
      | "semanticTopLinkPath"
      | "semanticTopLinkUrl"
      | "semanticTopLinkTarget"
      | "semanticTopLinkRel"
      | "semanticTopLinkType"
      | "semanticTopLinkHreflang"
      | "semanticTopLinkState"
      | "semanticTopLinkCurrent"
      | "semanticTopLinkDownload"
      | "semanticTopLinkSelector"
      | "semanticInPageLinkCount"
      | "semanticTopInPageLinkPath"
      | "semanticTopInPageLinkKind"
      | "semanticTopInPageLinkName"
      | "semanticTopInPageLinkUrl"
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
      | "semanticTopTableCellCount"
      | "semanticTopTableDeclaredRowCount"
      | "semanticTopTableDeclaredColumnCount"
      | "semanticTopTableHeaders"
      | "semanticTopTableSampleCells"
      | "semanticTopTableSampleCellRefs"
      | "semanticTopTableFirstHeader"
      | "semanticTopTableFirstSampleCellPath"
      | "semanticTopTableFirstSampleCellText"
      | "semanticTopTableFirstSampleCellRowIndex"
      | "semanticTopTableFirstSampleCellColumnIndex"
      | "semanticTopTableFirstSampleCellRowSpan"
      | "semanticTopTableFirstSampleCellColumnSpan"
      | "semanticTopTableFirstSampleCellHeaders"
      | "semanticTopTableFirstSampleCellRowHeaders"
      | "semanticTopTableFirstSampleCellColumnHeaders"
      | "semanticTopTableFirstSampleCellSelector"
      | "semanticTopTableSelector"
      | "semanticTopListRole"
      | "semanticTopListPath"
      | "semanticTopListName"
      | "semanticTopListItemCount"
      | "semanticTopListItems"
      | "semanticTopListItemRefs"
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
      | "semanticTopFieldDescribedBy"
      | "semanticTopFieldDescribedByText"
      | "semanticTopFieldDetails"
      | "semanticTopFieldDetailsText"
      | "semanticTopFieldErrorMessage"
      | "semanticTopFieldErrorMessageText"
      | "semanticTopFieldState"
      | "semanticTopFieldDisabled"
      | "semanticTopFieldRequired"
      | "semanticTopFieldReadonly"
      | "semanticTopFieldInvalid"
      | "semanticTopFieldChecked"
      | "semanticTopFieldExpanded"
      | "semanticTopFieldHaspopup"
      | "semanticTopFieldControls"
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
      | "semanticTopStateLive"
      | "semanticTopStateModal"
      | "semanticTopStateOrientation"
      | "semanticTopStateValueMin"
      | "semanticTopStateValueMax"
      | "semanticTopStateValueNow"
      | "semanticTopStateValueText"
      | "semanticTopStateSelector"
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
      | "runbookCommandArgs"
      | "runbookUrl"
      | "nextActionName"
      | "nextExecution"
      | "nextCommand"
      | "nextCommandArgs"
      | "nextAfterInteractionCommand"
      | "nextAfterInteractionCommandArgs"
      | "nextReadFrom"
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
      | "executionPlanCommandArgs"
      | "executionPlanAfterInteractionCommand"
      | "executionPlanAfterInteractionCommandArgs"
      | "executionPlanUrl"
      | "answerPlanStatus"
      | "answerPlanConfidence"
      | "answerPlanReason"
      | "answerPlanNextAction"
      | "answerGapCount"
      | "answerUseCitationIds"
      | "answerPlanReadFrom"
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
      | "topReadTargetCount"
      | "topReadTargetScore"
      | "topReadTargetPrimary"
      | "topReadTargetReason"
      | "topActionName"
      | "topActionSource"
      | "topActionExecution"
      | "topActionPriority"
      | "topActionReason"
      | "topActionReadFrom"
      | "topActionCommandArgs"
      | "topActionUrl"
      | "topActionSourceLinkRef"
      | "topActionRequiresBrowserInteraction"
      | "bestReadTarget"
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
      | "browserHtmlReason"
      | "browserHtmlReasonCode"
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
      | "executorCommandArgs"
      | "executorReadFrom"
      | "executorUrl"
      | "executorTargetUrl"
      | "executorTargetPath"
      | "executorTargetSelector"
      | "executorTargetText"
      | "executorExpectedOutcome"
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
      | "handoffCommandArgs"
      | "handoffReadFrom"
      | "handoffUrl"
      | "handoffTargetUrl"
      | "handoffTargetPath"
      | "handoffTargetSelector"
      | "handoffTargetText"
      | "handoffExpectedOutcome"
      | "primaryActionName"
      | "primaryReason"
      | "primaryPriority"
      | "primaryPriorityReason"
      | "primarySourceLinkRef"
      | "alternativeActionName"
      | "alternativeActionSource"
      | "alternativeActionExecution"
      | "alternativeActionPriority"
      | "alternativeActionReason"
      | "alternativeActionReadFrom"
      | "alternativeActionCommandArgs"
      | "alternativeActionUrl"
      | "alternativeActionSourceLinkRef"
      | "alternativeActionRequiresBrowserInteraction"
      | "recommendedUrl"
      | "recommendedTitle"
      | "recommendedCommandArgs"
    > = {
      resultCount: 2,
      resultChoiceCount: 2,
      resultChoices: [resultChoice],
      topResultChoicePath: "searchResults[0]",
      topResultChoiceTitle: "Example result",
      topResultChoiceUrl: "https://example.test/result",
      topResultChoiceCommandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent-brief"],
      topResultChoiceRank: 1,
      topResultChoiceOpenResult: 1,
      topResultChoiceRecommended: true,
      topResultChoicePrimary: true,
      topResultChoiceSourceType: "official",
      topResultChoiceSourceScore: 0.9,
      topResultChoiceSourceHints: ["package-registry"],
      topResultChoiceDateText: "2026-05-31",
      topResultChoiceRelevance: "high",
      topResultChoiceMatchedTerm: "example",
      topResultChoiceFindMatch: "Example result",
      topResultChoiceLikelyOfficial: true,
      topResultChoiceSitelinkCount: 1,
      topResultChoiceFirstSitelinkTitle: "Readme",
      topResultChoiceFirstSitelinkUrl: "https://example.test/result#readme",
      topResultChoiceReason: "High relevance.",
      evidenceCount: 1,
      formCount: 1,
      formChoiceCount: 1,
      formChoices: [formChoice],
      topFormChoicePath: "pageCheck.forms[0]",
      topFormChoiceMethod: "get",
      topFormChoiceActionUrl: "https://example.test/find",
      topFormChoiceSubmitText: "Search",
      topFormChoiceQueryField: "q",
      topFormChoiceUrlTemplate: "https://example.test/find?q={query}",
      topFormChoiceFieldCount: 1,
      topFormChoiceSelector: "form:nth-of-type(1)",
      topFormChoiceFirstFieldName: "q",
      topFormChoiceFirstFieldType: "search",
      topFormChoiceFirstFieldLabel: "Search",
      topFormChoiceFirstFieldRequired: true,
      topFormChoiceFirstFieldSelector: "input[name=\"q\"]",
      actionTargetCount: 2,
      actionTargetChoiceCount: 1,
      actionTargetChoices: [actionTargetChoice],
      topActionTargetChoicePath: "pageCheck.actionTargets[0]",
      topActionTargetChoiceKind: "search",
      topActionTargetChoiceName: "Search docs",
      topActionTargetChoiceSource: "json-ld",
      topActionTargetChoiceTargetUrl: "https://example.test/search",
      topActionTargetChoiceUrlTemplate: "https://example.test/search?q={query}",
      topActionTargetChoiceQueryInput: "required name=query",
      topActionTargetChoiceMethod: "GET",
      topActionTargetChoiceDisabled: true,
      topActionTargetChoicePressed: false,
      topActionTargetChoiceExpanded: true,
      topActionTargetChoiceHaspopup: "dialog",
      topActionTargetChoiceControls: "search-dialog",
      topActionTargetChoiceSelector: "script[type=\"application/ld+json\"]",
      barrierCount: 1,
      topBarrierKind: "challenge",
      topBarrierSeverity: "warning",
      topBarrierSource: "diagnostic",
      topBarrierPath: "pageCheck.barriers[0]",
      topBarrierText: "Challenge: verify you are human",
      topBarrierSelector: "main > h1",
      topBarrierDiagnosticCode: "CHALLENGE_LIKELY",
      dataTableCount: 1,
      faqCount: 1,
      codeBlockCount: 1,
      resourceCount: 2,
      mediaCount: 1,
      sectionCount: 1,
      breadcrumbCount: 1,
      paginationCount: 1,
      tocCount: 1,
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
      topDataTableFirstHeader: "Plan",
      topDataTableFirstRow: ["Starter", "$19.99", "10 GB"],
      topDataTableFirstCell: "Starter",
      topDataTableSelector: "table:nth-of-type(1)",
      topFaqQuestion: "How do I install it?",
      topFaqAnswer: "Run pnpm install.",
      topCodeBlockLanguage: "bash",
      topCodeBlockLineCount: 1,
      topCodeBlockText: "pnpm install",
      topResourceKind: "download",
      topResourceUrl: "https://example.test/guide.pdf",
      topResourceTitle: "Guide PDF",
      topMediaKind: "image",
      topMediaUrl: "https://example.test/diagram.png",
      topMediaText: "Architecture diagram",
      topSectionPath: "pageCheck.sections[0]",
      topSectionHeading: "Install",
      topSectionLevel: 2,
      topSectionText: "Install the package.",
      topSectionSelector: "h2:nth-of-type(1)",
      topBreadcrumbPath: "pageCheck.breadcrumbs[0]",
      topBreadcrumbText: "Docs > Install",
      topBreadcrumbSource: "html",
      topPaginationPath: "pageCheck.pagination[0]",
      topPaginationKind: "next",
      topPaginationLabel: "Next",
      topPaginationUrl: "https://example.test/next",
      topPaginationCurrent: false,
      topPaginationSelector: "a[rel=\"next\"]",
      topTocPath: "pageCheck.toc[0]",
      topTocTitle: "On this page",
      topTocItemCount: 2,
      topTocText: "Install; Configure",
      topTocFirstItemLabel: "Install",
      topTocFirstItemUrl: "https://example.test/install#install",
      topTocSelector: "nav[aria-label=\"On this page\"]",
      topEmbedKind: "iframe",
      topEmbedUrl: "https://example.test/embed",
      topEmbedTitle: "Dashboard",
      topTranscriptKind: "transcript",
      topTranscriptUrl: "https://example.test/transcript.txt",
      topTranscriptLabel: "Full transcript",
      topTranscriptLanguage: "en",
      topAuthorLinkName: "Example Author",
      topAuthorLinkUrl: "https://example.test/author",
      topAuthorLinkSource: "html",
      topProvenancePath: "pageCheck.provenance[0]",
      topProvenanceKind: "doi",
      topProvenanceLabel: "DOI",
      topProvenanceValue: "10.5555/example.2026",
      topProvenanceUrl: "https://doi.org/10.5555/example.2026",
      topProvenanceSource: "meta",
      topProvenanceSelector: "meta:nth-of-type(1)",
      topOfferPath: "pageCheck.offers[0]",
      topOfferName: "Agent Browser Pro",
      topOfferPrice: "19.99",
      topOfferCurrency: "USD",
      topOfferAvailability: "InStock",
      topOfferUrl: "https://example.test/buy",
      topOfferSelector: "script[type=\"application/ld+json\"]:nth-of-type(1)",
      topDatasetPath: "pageCheck.datasets[0]",
      topDatasetKind: "dataset",
      topDatasetName: "Example dataset",
      topDatasetUrl: "https://example.test/datasets/example",
      topDatasetDistributionUrl: "https://example.test/downloads/example.csv",
      topDatasetLicenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      topDatasetEncodingFormat: "text/csv",
      topDatasetSelector: "script[type=\"application/ld+json\"]:nth-of-type(2)",
      topIdentityPath: "pageCheck.identities[0]",
      topIdentityKind: "organization",
      topIdentityName: "Example Labs",
      topIdentityUrl: "https://example.test",
      topIdentityLogoUrl: "https://example.test/logo.png",
      topIdentitySameAsUrl: "https://github.com/example",
      topIdentitySource: "json-ld",
      topIdentitySelector: "script[type=\"application/ld+json\"]:nth-of-type(3)",
      topTimelinePath: "pageCheck.timeline[0]",
      topTimelineKind: "published",
      topTimelineLabel: "Published",
      topTimelineValue: "2026-06-01T09:00:00Z",
      topTimelineSource: "meta",
      topTimelineSelector: "meta[property=\"article:published_time\"]",
      topContactPointPath: "pageCheck.contactPoints[0]",
      topContactPointKind: "email",
      topContactPointLabel: "Press",
      topContactPointValue: "press@example.test",
      topContactPointUrl: "mailto:press@example.test",
      topContactPointSource: "link",
      topContactPointSelector: "a[href^=\"mailto:\"]",
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
      hiddenAppHintCount: 0,
      topHydrationPath: "pageCheck.hydration[0]",
      topHydrationKind: "next-data",
      topHydrationLabel: "Next.js data",
      topHydrationUrl: "https://example.test/_next/data/build/index.json",
      topHydrationSelector: "script#__NEXT_DATA__",
      topApiEndpointPath: "pageCheck.apiEndpoints[0]",
      topApiEndpointKind: "graphql",
      topApiEndpointMethod: "POST",
      topApiEndpointUrl: "https://example.test/graphql",
      topApiEndpointSelector: "script:nth-of-type(1)",
      topClientStatePath: "pageCheck.clientState[0]",
      topClientStateKind: "local-storage",
      topClientStateOperation: "read",
      topClientStateKey: "session",
      topClientStateSelector: "script:nth-of-type(2)",
      topAppHintPath: "pageCheck.appHints[0]",
      topAppHintKind: "manifest",
      topAppHintLabel: "manifest",
      topAppHintUrl: "https://example.test/manifest.json",
      topAppHintSelector: "link[rel=\"manifest\"]",
      hiddenReadTargetCount: 2,
      topHiddenSignalGroup: "apiEndpoints",
      topHiddenSignalPath: "pageCheck.apiEndpoints[0]",
      topHiddenSignalKind: "graphql",
      topHiddenSignalText: "graphql endpoint: https://example.test/graphql",
      topHiddenSignalUrl: "https://example.test/graphql",
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
      topSourceChoiceUrl: "https://source.example/report",
      topSourceChoiceCommandArgs: ["ax-grep", "https://source.example/report", "--agent-brief"],
      topSourceChoiceSourceType: "report",
      topSourceChoiceSourceScore: 0.91,
      topSourceChoiceSourceHints: ["report", "external"],
      topSourceChoicePrimary: true,
      topSourceChoiceReason: "High-quality source link.",
      topChoiceKind: "source",
      topChoicePath: "pageCheck.sourceLinks[0]",
      topChoiceLabel: "Source",
      topChoiceUrl: "https://source.example/report",
      topChoiceCommandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      sourceSearchQuery: "ax-grep docs",
      sourceSearchEngine: "auto",
      sourceSearchSelectedEngine: "duckduckgo",
      sourceSearchSearchUrl: "https://duckduckgo.com/html/?q=ax-grep%20docs",
      sourceSearchLang: "en",
      sourceSearchRegion: "us",
      sourceSearchFindQueryCount: 1,
      sourceSearchTopFindQuery: "install",
      sourceSearchSelectedRank: 2,
      sourceSearchSelectedTitle: "ax-grep documentation",
      sourceSearchSelectedUrl: "https://source.example/result",
      sourceSearchSelectedPath: "sourceSearch.selectedResult",
      sourceSearchSelectedOpenResult: 2,
      sourceSearchSelectedCommandArgs: ["ax-grep", "--search", "ax-grep docs", "--open-result", "2", "--agent"],
      sourceSearchSelectedReason: "Selected source result.",
      sourceSearchAlternateCount: 1,
      sourceSearchAlternatePath: "sourceSearch.alternateResults[0]",
      sourceSearchAlternateTitle: "ax-grep mirror",
      sourceSearchAlternateUrl: "https://mirror.example/result",
      sourceSearchAlternateRank: 3,
      sourceSearchAlternateOpenResult: 3,
      sourceSearchAlternateCommandArgs: ["ax-grep", "--search", "ax-grep docs", "--open-result", "3", "--agent"],
      sourceSearchAlternateReason: "Alternate source result.",
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
      topCitationConfidence: "high",
      topCitationReason: "Primary citation.",
      topCitationScore: 0.9,
      answerEvidenceCount: 1,
      topAnswerEvidenceId: "e1",
      topAnswerEvidencePath: "pageCheck.contentEvidence[0]",
      topAnswerEvidenceKind: "content",
      topAnswerEvidenceText: "Readable evidence",
      topAnswerEvidenceTitle: "Example evidence",
      topAnswerEvidenceUrl: "https://example.test",
      topAnswerEvidenceConfidence: "high",
      topAnswerEvidenceReason: "Primary answer evidence.",
      searchDecisionName: "open-result",
      searchDecisionConfidence: "high",
      searchDecisionReason: "Use the best result.",
      searchDecisionResultCount: 2,
      searchDecisionRecommendedRank: 1,
      searchDecisionRecommendedUrl: "https://example.test",
      searchDecisionCommandArgs: ["ax-grep", "--search", "example", "--open-result", "1", "--agent"],
      pageDecisionName: "read-content",
      pageDecisionConfidence: "high",
      pageDecisionReason: "Readable content is available.",
      pageDecisionReadFrom: "pageCheck.contentEvidence",
      pageDecisionUrl: "https://example.test",
      pageDecisionCommandArgs: ["ax-grep", "https://example.test", "--agent"],
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
      semanticTopInteractiveRole: "link",
      semanticTopInteractivePath: "agent.semanticSummary.interactiveRoles[0]",
      semanticTopInteractiveName: "Read more",
      semanticTopInteractiveRoleDescription: "card link",
      semanticTopInteractiveDescription: "Opens the article",
      semanticTopInteractiveValue: "article",
      semanticTopInteractiveState: "expanded=false",
      semanticTopInteractiveDisabled: false,
      semanticTopInteractiveSelector: "main a:nth-of-type(1)",
      semanticTopFocusableRole: "link",
      semanticTopFocusablePath: "agent.semanticSummary.focusableItems[0]",
      semanticTopFocusableName: "Read more",
      semanticTopFocusableRoleDescription: "card link",
      semanticTopFocusableState: "expanded=false",
      semanticTopFocusableSelector: "main a:nth-of-type(1)",
      semanticTopLinkName: "Read more",
      semanticTopLinkPath: "agent.semanticSummary.links[0]",
      semanticTopLinkUrl: "https://example.test/read-more",
      semanticTopLinkTarget: "_blank",
      semanticTopLinkRel: ["noopener", "external"],
      semanticTopLinkType: "text/html",
      semanticTopLinkHreflang: "en",
      semanticTopLinkState: "current=page",
      semanticTopLinkCurrent: "page",
      semanticTopLinkDownload: true,
      semanticTopLinkSelector: "main a:nth-of-type(1)",
      semanticInPageLinkCount: 1,
      semanticTopInPageLinkPath: "agent.semanticSummary.inPageLinks[0]",
      semanticTopInPageLinkKind: "skip",
      semanticTopInPageLinkName: "Skip to content",
      semanticTopInPageLinkUrl: "https://example.test/#content",
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
      semanticTopTableCellCount: 6,
      semanticTopTableDeclaredRowCount: 100,
      semanticTopTableDeclaredColumnCount: 4,
      semanticTopTableHeaders: ["Plan", "Price"],
      semanticTopTableSampleCells: ["Pro", "$20"],
      semanticTopTableSampleCellRefs: [{ path: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]", text: "Pro", rowIndex: 2, columnIndex: 1, rowSpan: 2, columnSpan: 3, headers: ["Plan", "Price"], rowHeaders: ["Plan"], columnHeaders: ["Price"], selector: "td:nth-of-type(1)" }],
      semanticTopTableFirstHeader: "Plan",
      semanticTopTableFirstSampleCellPath: "agent.semanticSummary.tableItems[0].sampleCellRefs[0]",
      semanticTopTableFirstSampleCellText: "Pro",
      semanticTopTableFirstSampleCellRowIndex: 2,
      semanticTopTableFirstSampleCellColumnIndex: 1,
      semanticTopTableFirstSampleCellRowSpan: 2,
      semanticTopTableFirstSampleCellColumnSpan: 3,
      semanticTopTableFirstSampleCellHeaders: ["Plan", "Price"],
      semanticTopTableFirstSampleCellRowHeaders: ["Plan"],
      semanticTopTableFirstSampleCellColumnHeaders: ["Price"],
      semanticTopTableFirstSampleCellSelector: "td:nth-of-type(1)",
      semanticTopTableSelector: "table:nth-of-type(1)",
      semanticTopListRole: "list",
      semanticTopListPath: "agent.semanticSummary.listItems[0]",
      semanticTopListName: "Highlights",
      semanticTopListItemCount: 2,
      semanticTopListItems: ["Fast setup", "Clear output"],
      semanticTopListItemRefs: [{ text: "Fast setup", role: "listitem", posInSet: 1, setSize: 2, current: "page", selector: "li:nth-of-type(1)" }],
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
      semanticTopFieldDescribedBy: "email-help",
      semanticTopFieldDescribedByText: "Used for updates",
      semanticTopFieldDetails: "email-details",
      semanticTopFieldDetailsText: "Used for account notifications",
      semanticTopFieldErrorMessage: "email-error",
      semanticTopFieldErrorMessageText: "Enter a valid email",
      semanticTopFieldState: "disabled=true required=true readonly=true checked=true expanded=true invalid=spelling haspopup=listbox controls=email-suggestions",
      semanticTopFieldDisabled: true,
      semanticTopFieldRequired: true,
      semanticTopFieldReadonly: true,
      semanticTopFieldInvalid: "spelling",
      semanticTopFieldChecked: true,
      semanticTopFieldExpanded: true,
      semanticTopFieldHaspopup: "listbox",
      semanticTopFieldControls: "email-suggestions",
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
      semanticTopStateLive: "polite",
      semanticTopStateModal: true,
      semanticTopStateOrientation: "horizontal",
      semanticTopStateValueMin: 0,
      semanticTopStateValueMax: 100,
      semanticTopStateValueNow: 40,
      semanticTopStateValueText: "40 percent",
      semanticTopStateSelector: "input[name=\"email\"]",
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
      runbookCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      runbookUrl: "https://example.test",
      nextActionName: "read-content",
      nextExecution: "read-current",
      nextCommand: "ax-grep https://example.test --agent",
      nextCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      nextAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      nextAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      nextReadFrom: "pageCheck.contentEvidence",
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
      executionPlanCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      executionPlanAfterInteractionCommand: "ax-grep https://example.test --html-file captured.html --agent",
      executionPlanAfterInteractionCommandArgs: ["ax-grep", "https://example.test", "--html-file", "captured.html", "--agent"],
      executionPlanUrl: "https://example.test",
      answerPlanStatus: "ready",
      answerPlanConfidence: "high",
      answerPlanReason: "Ready to answer.",
      answerPlanNextAction: "read-content",
      answerGapCount: 0,
      answerUseCitationIds: ["e1"],
      answerPlanReadFrom: "pageCheck.contentEvidence",
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
      topReadTargetCount: 1,
      topReadTargetScore: 0.9,
      topReadTargetPrimary: true,
      topReadTargetReason: "Top evidence.",
      topActionName: "read-content",
      topActionSource: "agent.primaryAction",
      topActionExecution: "read-current",
      topActionPriority: "high",
      topActionReason: "Read current evidence.",
      topActionReadFrom: "pageCheck.contentEvidence",
      topActionCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      topActionUrl: "https://example.test",
      topActionSourceLinkRef: "pageCheck.sourceLinks[0]",
      topActionRequiresBrowserInteraction: false,
      bestReadTarget: "pageCheck.contentEvidence",
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
      browserHtmlReason: "Browser-captured HTML or browser inspection is needed.",
      browserHtmlReasonCode: "blocked-or-empty",
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
      executorCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      executorReadFrom: "pageCheck.contentEvidence",
      executorUrl: "https://example.test",
      executorTargetUrl: "https://example.test",
      executorTargetPath: "pageCheck.links[0]",
      executorTargetSelector: "a.primary",
      executorTargetText: "Read more",
      executorExpectedOutcome: "read-evidence",
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
      handoffCommandArgs: ["ax-grep", "https://example.test", "--agent"],
      handoffReadFrom: "pageCheck.contentEvidence",
      handoffUrl: "https://example.test",
      handoffTargetUrl: "https://example.test",
      handoffTargetPath: "pageCheck.links[0]",
      handoffTargetSelector: "a.primary",
      handoffTargetText: "Read more",
      handoffExpectedOutcome: "read-evidence",
      primaryActionName: "read-content",
      primaryReason: "Read current evidence.",
      primaryPriority: "high",
      primaryPriorityReason: "Readable content is available.",
      primarySourceLinkRef: "pageCheck.sourceLinks[0]",
      alternativeActionName: "open-source-link",
      alternativeActionSource: "pageCheck.nextSteps",
      alternativeActionExecution: "run-command",
      alternativeActionPriority: "medium",
      alternativeActionReason: "Open the cited source.",
      alternativeActionReadFrom: "pageCheck.sourceLinks",
      alternativeActionCommandArgs: ["ax-grep", "https://source.example/report", "--agent"],
      alternativeActionUrl: "https://source.example/report",
      alternativeActionSourceLinkRef: "pageCheck.sourceLinks[0]",
      alternativeActionRequiresBrowserInteraction: false,
      recommendedUrl: "https://example.test",
      recommendedTitle: "Example result",
      recommendedCommandArgs: ["ax-grep", "https://example.test", "--agent"],
    };

    expect(summary.hiddenSignalCount).toBe(4);
    expect(summary.hiddenApiEndpointCount).toBe(2);
    expect(summary.topApiEndpointUrl).toBe("https://example.test/graphql");
    expect(summary.topClientStateKey).toBe("session");
    expect(summary.topHiddenSignalPath).toBe("pageCheck.apiEndpoints[0]");
    expect(summary.bestHiddenReadTarget).toBe("pageCheck.apiEndpoints");
    expect(summary.actionTargetCount).toBe(2);
    expect(summary.actionTargetChoiceCount).toBe(1);
    expect(summary.topBarrierKind).toBe("challenge");
    expect(summary.topBarrierPath).toBe("pageCheck.barriers[0]");
    expect(summary.dataTableCount).toBe(1);
    expect(summary.topDataTableFirstCell).toBe("Starter");
    expect(summary.topDataTableFirstRow?.[1]).toBe("$19.99");
    expect(summary.topFaqQuestion).toBe("How do I install it?");
    expect(summary.topResourceUrl).toBe("https://example.test/guide.pdf");
    expect(summary.bestStructuredReadTarget).toBe("pageCheck.dataTables");
    expect(summary.bestStructuredReadTargetPrimary).toBe(true);
    expect(summary.formChoices?.[0]?.queryField).toBe("q");
    expect(summary.actionTargetChoices?.[0]?.kind).toBe("search");
    expect(summary.topFormChoiceUrlTemplate).toBe("https://example.test/find?q={query}");
    expect(summary.topActionTargetChoiceUrlTemplate).toBe("https://example.test/search?q={query}");
    expect(summary.topChoiceKind).toBe("source");
    expect(summary.topResultChoicePath).toBe("searchResults[0]");
    expect(summary.topResultChoiceCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.topSourceChoicePath).toBe("pageCheck.sourceLinks[0]");
    expect(summary.topSourceChoiceCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.sourceSearchQuery).toBe("ax-grep docs");
    expect(summary.sourceSearchTopFindQuery).toBe("install");
    expect(summary.sourceSearchSelectedTitle).toBe("ax-grep documentation");
    expect(summary.sourceSearchSelectedCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.sourceSearchAlternateCount).toBe(1);
    expect(summary.sourceSearchAlternatePath).toBe("sourceSearch.alternateResults[0]");
    expect(summary.topActionName).toBe("read-content");
    expect(summary.pagePublishedTime).toBe("2026-02-03T04:05:06Z");
    expect(summary.verificationMissingQueries).toEqual(["missing"]);
    expect(summary.topVerificationMissingQuery).toBe("missing");
    expect(summary.searchDecisionName).toBe("open-result");
    expect(summary.pageDecisionReadFrom).toBe("pageCheck.contentEvidence");
    expect(summary.semanticTopHeading).toBe("Example");
    expect(summary.semanticTopHeadingPath).toBe("agent.semanticSummary.headingItems[0]");
    expect(summary.semanticTopLandmarkRole).toBe("main");
    expect(summary.semanticTopNamedRoleName).toBe("Example");
    expect(summary.readTargetCount).toBe(3);
    expect(summary.topReadTarget).toBe("pageCheck.contentEvidence");
    expect(summary.bestReadTargetCount).toBe(1);
    expect(summary.bestReadTargetPrimary).toBe(true);
    expect(summary.qualityGateFailCount).toBe(1);
    expect(summary.topSignalKind).toBe("content");
    expect(summary.topQualityGatePass).toBe(true);
    expect(summary.problemSignalSeverity).toBe("warning");
    expect(summary.failingQualityGateKind).toBe("content");
    expect(summary.failingQualityGateSeverity).toBe("warning");
    expect(summary.failingQualityGateScore).toBe(0.4);
    expect(summary.browserHtmlReason).toContain("Browser-captured HTML");
    expect(summary.topDiagnosticCode).toBe("NO_USEFUL_LINKS");
    expect(summary.topCitationPath).toBe("pageCheck.contentEvidence[0]");
    expect(summary.topAnswerEvidencePath).toBe("pageCheck.contentEvidence[0]");
    expect(summary.answerPlanStatus).toBe("ready");
    expect(summary.answerPlanNextAction).toBe("read-content");
    expect(summary.nextActionName).toBe("read-content");
    expect(summary.nextReadFrom).toBe("pageCheck.contentEvidence");
    expect(summary.executorOperation).toBe("return");
    expect(summary.executorTerminal).toBe(true);
    expect(summary.executorTargetSelector).toBe("a.primary");
    expect(summary.handoffAnswerStatus).toBe("ready");
    expect(summary.handoffShouldContinue).toBe(false);
    expect(summary.handoffTargetPath).toBe("pageCheck.links[0]");
    expect(summary.primaryActionName).toBe("read-content");
    expect(summary.primarySourceLinkRef).toBe("pageCheck.sourceLinks[0]");
    expect(summary.alternativeActionName).toBe("open-source-link");
    expect(summary.alternativeActionCommandArgs?.[0]).toBe("ax-grep");
    expect(summary.recommendedCommandArgs?.[0]).toBe("ax-grep");
  });
});
