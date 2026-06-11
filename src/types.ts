export type OutputFormat = "json" | "text";

export type ExtractMode = "full" | "compact" | "interactive";

export type SemanticTreeOptions = {
  mode?: ExtractMode;
  includeBounds?: boolean;
  includeAttributes?: boolean;
  includeTextNodes?: boolean;
  includeHidden?: boolean;
  includeSelectOptions?: boolean;
  excludeLikelyAds?: boolean;
  excludeLikelyBoilerplate?: boolean;
  pruneCustomElementWrappers?: boolean;
  pruneCollapsedSubtrees?: boolean;
  pruneLikelyClosedOverlays?: boolean;
  summarizeLargeSubtrees?: boolean;
  summarizeLikelyLinkFarms?: boolean;
  summarizeRepeatedSubtrees?: boolean;
  maxChildrenPerNode?: number;
  maxLinkFarmChildren?: number;
  maxRepeatedSubtreeInstances?: number;
  maxTextLength?: number;
};

export type SemanticTreeChange = {
  tree: SemanticNode;
  changedAt: number;
  mutationCount: number;
};

export type SemanticTreeObserverOptions = SemanticTreeOptions & {
  debounceMs?: number;
};

export type SemanticNodeState = {
  hidden?: boolean;
  disabled?: boolean;
  checked?: boolean | "mixed";
  selected?: boolean;
  expanded?: boolean;
  pressed?: boolean | "mixed";
  focused?: boolean;
  required?: boolean;
  invalid?: boolean | string;
  readonly?: boolean;
  current?: boolean | string;
  haspopup?: boolean | string;
  controls?: string;
  live?: string;
  modal?: boolean;
};

export type SemanticNodeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SemanticNode = {
  id: string;
  tag: string;
  role: string | null;
  name: string;
  description?: string;
  text?: string;
  value?: string;
  state?: SemanticNodeState;
  interactive: boolean;
  focusable: boolean;
  selector?: string;
  xpath?: string;
  bounds?: SemanticNodeBounds;
  attributes?: Record<string, string>;
  children: SemanticNode[];
  unavailableReason?: string;
};

export type ExtractorScriptOptions = SemanticTreeOptions & {
  format?: OutputFormat;
};

export type ObserverScriptOptions = SemanticTreeObserverOptions & {
  globalName?: string;
};

export type AgentStatus = "ready" | "choose-result" | "verify" | "needs-browser" | "error";

export type AgentRoutingIntent =
  | "read-current"
  | "open-url"
  | "search"
  | "browser-html"
  | "browser-interaction"
  | "inspect-output"
  | "none";

export type AgentContinuationMode = "command" | "read" | "browser" | "capture-html" | "inspect" | "stop";

export type AgentExecutionMode = "run-command" | "read-current" | "interact-browser" | "inspect-output";

export type AgentAction = {
  action?: string;
  execution?: AgentExecutionMode;
  priority?: "low" | "medium" | "high";
  priorityReason?: string;
  reason?: string;
  url?: string;
  rank?: number;
  openResult?: number | "best";
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  terminal?: boolean;
  readFrom?: string;
  sourceLinkRef?: string;
  requiresBrowserInteraction?: boolean;
  target?: AgentTarget;
  source?: string;
  primary?: boolean;
  index?: number;
  path?: string;
};

export type AgentNext = {
  mode: AgentContinuationMode;
  reason: string;
  loop: AgentLoopDirective;
  action?: string;
  execution?: AgentExecutionMode;
  priority?: "low" | "medium" | "high";
  priorityReason?: string;
  url?: string;
  rank?: number;
  openResult?: number | "best";
  readFrom?: string;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  requiresBrowserInteraction?: boolean;
  terminal?: boolean;
  sourceLinkRef?: string;
  readTarget?: AgentReadTarget;
  readValue?: AgentReadValue;
  target?: AgentTarget;
  browserHtml?: AgentBrowserHtmlCapture;
};

export type AgentLoopDecision = "return" | "execute" | "browser" | "inspect" | "stop";

export type AgentLoopDirective = {
  decision: AgentLoopDecision;
  shouldContinue: boolean;
  terminal: boolean;
  reason: string;
  maxSuggestedIterations: number;
};

export type AgentSignalKind =
  | "content"
  | "verification"
  | "search-results"
  | "source-links"
  | "browser"
  | "diagnostic"
  | "response";

export type AgentSignalSeverity = "info" | "warning" | "error";

export type AgentSignal = {
  kind: AgentSignalKind;
  severity: AgentSignalSeverity;
  message: string;
};

export type AgentQualityGateKind =
  | "fetch"
  | "content"
  | "source"
  | "search"
  | "verification"
  | "browser"
  | "diagnostic"
  | "status";

export type AgentQualityGate = {
  kind: AgentQualityGateKind;
  pass: boolean;
  severity: AgentSignalSeverity;
  message: string;
  score?: number;
  path?: string;
};

export type AgentExpectedOutcomeKind =
  | "read-evidence"
  | "open-result"
  | "retry-fetch"
  | "run-search"
  | "capture-html"
  | "browser-inspection"
  | "inspect-output"
  | "stop";

export type AgentExpectedOutcome = {
  kind: AgentExpectedOutcomeKind;
  message: string;
};

export type AgentExecutionPlan = {
  operation: "return" | "execute-command" | "capture-browser-html" | "inspect-browser" | "inspect-output" | "stop";
  confidence: "low" | "medium" | "high";
  reason: string;
  useFetchedHtml: boolean;
  needsBrowserHtml: boolean;
  answerReady: boolean;
  terminal: boolean;
  shouldContinue: boolean;
  maxSuggestedIterations: number;
  expectedOutcome: AgentExpectedOutcomeKind;
  readFrom?: string;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  url?: string;
  browserHtml?: AgentBrowserHtmlCapture;
};

export type AgentRunbook = {
  decision: AgentLoopDecision;
  mode: AgentContinuationMode;
  operation: AgentExecutionPlan["operation"];
  action?: string;
  reason: string;
  confidence: AgentExecutionPlan["confidence"];
  answerStatus: AgentAnswerPlan["status"];
  answerReady: boolean;
  shouldContinue: boolean;
  terminal: boolean;
  maxSuggestedIterations: number;
  useFetchedHtml: boolean;
  needsBrowserHtml: boolean;
  expectedOutcome: AgentExpectedOutcomeKind;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  readFrom?: string;
  readValue?: AgentReadValue;
  url?: string;
  sourceLinkRef?: string;
  target?: AgentTarget;
  browserHtml?: AgentBrowserHtmlCapture;
};

export type AgentExecutorStep = {
  instruction: string;
  decision: AgentLoopDecision;
  mode: AgentContinuationMode;
  operation: AgentExecutionPlan["operation"];
  action?: string;
  status: AgentAnswerPlan["status"];
  confidence: AgentExecutionPlan["confidence"];
  answerReady: boolean;
  shouldContinue: boolean;
  terminal: boolean;
  maxSuggestedIterations: number;
  expectedOutcome: AgentExpectedOutcomeKind;
  useCitationIds?: string[];
  verificationFoundQueries?: string[];
  verificationMissingQueries?: string[];
  commandArgs?: string[];
  afterInteractionCommandArgs?: string[];
  readFrom?: string;
  readTarget?: AgentReadTarget;
  readValue?: AgentReadValue;
  url?: string;
  sourceLinkRef?: string;
  target?: AgentTarget;
  browserHtml?: AgentBrowserHtmlCapture;
};

export type AgentHandoff = {
  instruction: string;
  decision: AgentLoopDecision;
  mode: AgentContinuationMode;
  operation: AgentExecutionPlan["operation"];
  action?: string;
  confidence: AgentExecutionPlan["confidence"];
  priority?: "low" | "medium" | "high";
  priorityReason?: string;
  answerStatus: AgentAnswerPlan["status"];
  answerReady: boolean;
  shouldContinue: boolean;
  terminal: boolean;
  maxSuggestedIterations: number;
  expectedOutcome: AgentExpectedOutcomeKind;
  reason: string;
  useCitationIds?: string[];
  verificationFoundQueries?: string[];
  verificationMissingQueries?: string[];
  answerEvidence?: AgentCitation[];
  resultChoices?: AgentResultChoice[];
  sourceChoices?: AgentSourceChoice[];
  sourceSearch?: AgentSourceSearch;
  signals?: AgentSignal[];
  qualityGates?: AgentQualityGate[];
  readTarget?: AgentReadTarget;
  readFrom?: string;
  readValue?: AgentReadValue;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  url?: string;
  sourceLinkRef?: string;
  target?: AgentTarget;
  browserHtml?: AgentBrowserHtmlCapture;
};

export type AgentBrowserHtmlCapture = {
  url?: string;
  htmlFile: string;
  captureScript: string;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
};

export type AgentReadTarget = {
  path: string;
  reason: string;
  count?: number;
  score?: number;
  primary?: boolean;
};

export type AgentReadValue = {
  path: string;
  value: unknown;
};

export type AgentCitation = {
  kind: "content" | "verification" | "search-result" | "source-link" | "page-check";
  id: string;
  path: string;
  confidence?: "low" | "medium" | "high";
  reason?: string;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
};

export type AgentAnswerPlan = {
  status: "ready" | "needs-more" | "blocked" | "error";
  confidence: "low" | "medium" | "high";
  reason: string;
  gaps: string[];
  useCitationIds: string[];
  nextAction?: string;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
  url?: string;
  readFrom?: string;
};

export type AgentTarget = {
  title?: string;
  url: string;
  path?: string;
  text?: string;
  source?: string;
  rank?: number;
  snippet?: string;
  selector?: string;
  sourceType?: string;
  sourceScore?: number;
  sourceHints?: string[];
  dateText?: string;
  date?: string;
  datePrecision?: "day" | "month" | "year";
  dateSource?: "title" | "snippet";
  sitelinks?: Array<{ title: string; url: string }>;
  relevance?: "low" | "medium" | "high";
  matchedTerms?: string[];
  findMatches?: string[];
  isLikelyOfficial?: boolean;
  selectionReason?: string;
};

export type AgentResultChoice = AgentTarget & {
  id: string;
  path: string;
  recommended?: boolean;
  primary?: boolean;
  recommendedPath?: string;
  openResult?: number | "best";
  command?: string;
  commandArgs?: string[];
};

export type AgentSourceChoice = AgentTarget & {
  id: string;
  path: string;
  kind?: "internal" | "external";
  primary?: boolean;
  command?: string;
  commandArgs?: string[];
};

export type AgentFormChoice = {
  id: string;
  path: string;
  rank: number;
  method: string;
  fieldCount: number;
  text: string;
  actionUrl?: string;
  submitText?: string;
  queryField?: string;
  urlTemplate?: string;
  selector?: string;
  fields: Array<{
    name?: string;
    type: string;
    label?: string;
    placeholder?: string;
    value?: string;
    required?: boolean;
    selector?: string;
    options?: string[];
  }>;
};

export type AgentActionTargetChoice = {
  id: string;
  path: string;
  rank: number;
  kind: "search" | "read" | "download" | "subscribe" | "action";
  name: string;
  text: string;
  source: "json-ld" | "link";
  targetUrl?: string;
  urlTemplate?: string;
  queryInput?: string;
  method?: string;
  encodingType?: string;
  selector?: string;
};

export type AgentSourceSearchResult = AgentTarget & {
  id: string;
  path: string;
  openResult?: number | "best";
  command?: string;
  commandArgs?: string[];
};

export type AgentSourceSearch = {
  query: string;
  engine: string;
  selectedEngine?: string;
  searchUrl: string;
  lang?: string;
  region?: string;
  findQueries?: string[];
  selectedRank: number;
  selectedTitle: string;
  selectedUrl: string;
  selectedResult?: AgentSourceSearchResult;
  alternateResults?: AgentSourceSearchResult[];
};

export type AgentSummary = {
  contract: AgentContract;
  status: AgentStatus;
  pageKind: string;
  pageTitle?: string;
  pageCanonicalUrl?: string;
  pageLang?: string;
  pageSiteName?: string;
  pageAuthor?: string;
  pagePublishedTime?: string;
  pageModifiedTime?: string;
  pageStructuredDataTypes?: string[];
  summary: string;
  routingIntent: AgentRoutingIntent;
  continuationMode: AgentContinuationMode;
  next: AgentNext;
  runbook: AgentRunbook;
  runbookDecision?: AgentRunbook["decision"];
  runbookMode?: AgentRunbook["mode"];
  runbookOperation?: AgentRunbook["operation"];
  runbookActionName?: string;
  runbookReason?: string;
  runbookConfidence?: AgentRunbook["confidence"];
  runbookAnswerStatus?: AgentRunbook["answerStatus"];
  runbookAnswerReady?: boolean;
  runbookShouldContinue?: boolean;
  runbookTerminal?: boolean;
  runbookMaxSuggestedIterations?: number;
  runbookExpectedOutcome?: AgentRunbook["expectedOutcome"];
  runbookReadFrom?: string;
  runbookCommandArgs?: string[];
  runbookUrl?: string;
  nextActionName?: string;
  nextExecution?: AgentExecutionMode;
  nextCommand?: string;
  nextCommandArgs?: string[];
  nextAfterInteractionCommand?: string;
  nextAfterInteractionCommandArgs?: string[];
  nextReadFrom?: string;
  nextUrl?: string;
  executor: AgentExecutorStep;
  handoff?: AgentHandoff;
  expectedOutcome: AgentExpectedOutcome;
  executionPlan: AgentExecutionPlan;
  expectedOutcomeKind?: AgentExpectedOutcome["kind"];
  expectedOutcomeMessage?: string;
  executionPlanOperation?: AgentExecutionPlan["operation"];
  executionPlanConfidence?: AgentExecutionPlan["confidence"];
  executionPlanReason?: string;
  executionPlanAnswerReady?: boolean;
  executionPlanShouldContinue?: boolean;
  executionPlanTerminal?: boolean;
  executionPlanExpectedOutcome?: AgentExpectedOutcome["kind"];
  executionPlanReadFrom?: string;
  executionPlanCommandArgs?: string[];
  executionPlanAfterInteractionCommand?: string;
  executionPlanAfterInteractionCommandArgs?: string[];
  executionPlanUrl?: string;
  answerPlan?: AgentAnswerPlan;
  searchDecision?: Record<string, unknown>;
  pageDecision?: Record<string, unknown>;
  searchDecisionName?: string;
  searchDecisionConfidence?: "low" | "medium" | "high";
  searchDecisionReason?: string;
  searchDecisionResultCount?: number;
  searchDecisionRecommendedRank?: number;
  searchDecisionRecommendedUrl?: string;
  searchDecisionCommandArgs?: string[];
  pageDecisionName?: string;
  pageDecisionConfidence?: "low" | "medium" | "high";
  pageDecisionReason?: string;
  pageDecisionReadFrom?: string;
  pageDecisionUrl?: string;
  pageDecisionCommandArgs?: string[];
  semanticSummary?: Record<string, unknown>;
  semanticNodeCount?: number;
  semanticNamedRoleCount?: number;
  semanticInteractiveCount?: number;
  semanticFocusableCount?: number;
  semanticHeadingCount?: number;
  semanticLandmarkCount?: number;
  semanticLinkCount?: number;
  semanticButtonCount?: number;
  semanticImageCount?: number;
  semanticTableCount?: number;
  semanticListCount?: number;
  semanticFieldCount?: number;
  semanticDescriptionCount?: number;
  semanticValueCount?: number;
  semanticRelationCount?: number;
  semanticChoiceCount?: number;
  semanticStateCount?: number;
  semanticUnavailableCount?: number;
  semanticTopRole?: string;
  semanticTopRoleCount?: number;
  semanticOutlineCount?: number;
  semanticTopOutlinePath?: string;
  semanticTopOutlineKind?: "heading" | "landmark";
  semanticTopOutlineRole?: string;
  semanticTopOutlineText?: string;
  semanticTopOutlineLevel?: number;
  semanticTopOutlineDepth?: number;
  semanticTopOutlineParentPath?: string;
  semanticTopOutlineParentRole?: string;
  semanticTopOutlineParentName?: string;
  semanticTopOutlineSelector?: string;
  semanticKeyboardShortcutCount?: number;
  semanticTopKeyboardShortcutPath?: string;
  semanticTopKeyboardShortcutRole?: string;
  semanticTopKeyboardShortcutName?: string;
  semanticTopKeyboardShortcutKeys?: string[];
  semanticTopKeyboardShortcutAccessKey?: string;
  semanticTopKeyboardShortcutTabIndex?: number;
  semanticTopKeyboardShortcutFocusable?: boolean;
  semanticTopKeyboardShortcutSelector?: string;
  semanticTopHeading?: string;
  semanticTopHeadingPath?: string;
  semanticTopHeadingLevel?: number;
  semanticTopLandmark?: string;
  semanticTopLandmarkPath?: string;
  semanticTopLandmarkRole?: string;
  semanticTopLandmarkName?: string;
  semanticTopNamedRole?: string;
  semanticTopNamedRolePath?: string;
  semanticTopNamedRoleRole?: string;
  semanticTopNamedRoleName?: string;
  semanticTopInteractiveRole?: string;
  semanticTopInteractivePath?: string;
  semanticTopInteractiveName?: string;
  semanticTopInteractiveDescription?: string;
  semanticTopInteractiveValue?: string;
  semanticTopInteractiveState?: string;
  semanticTopInteractiveDisabled?: boolean;
  semanticTopInteractiveSelector?: string;
  semanticTopFocusableRole?: string;
  semanticTopFocusablePath?: string;
  semanticTopFocusableName?: string;
  semanticTopFocusableState?: string;
  semanticTopFocusableSelector?: string;
  semanticTopLinkName?: string;
  semanticTopLinkPath?: string;
  semanticTopLinkUrl?: string;
  semanticTopLinkSelector?: string;
  semanticInPageLinkCount?: number;
  semanticTopInPageLinkPath?: string;
  semanticTopInPageLinkKind?: "skip" | "anchor";
  semanticTopInPageLinkName?: string;
  semanticTopInPageLinkUrl?: string;
  semanticTopInPageLinkTargetId?: string;
  semanticTopInPageLinkSelector?: string;
  semanticTopButtonName?: string;
  semanticTopButtonPath?: string;
  semanticTopButtonDescription?: string;
  semanticTopButtonSelector?: string;
  semanticTopImagePath?: string;
  semanticTopImageName?: string;
  semanticTopImageUrl?: string;
  semanticTopImageSelector?: string;
  semanticTopTableRole?: string;
  semanticTopTablePath?: string;
  semanticTopTableName?: string;
  semanticTopTableRowCount?: number;
  semanticTopTableCellCount?: number;
  semanticTopTableSelector?: string;
  semanticTopListRole?: string;
  semanticTopListPath?: string;
  semanticTopListName?: string;
  semanticTopListItemCount?: number;
  semanticTopListSelector?: string;
  semanticTopFieldRole?: string;
  semanticTopFieldPath?: string;
  semanticTopFieldName?: string;
  semanticTopFieldDescription?: string;
  semanticTopFieldValue?: string;
  semanticTopFieldPlaceholder?: string;
  semanticTopFieldAutocomplete?: string;
  semanticTopFieldInputMode?: string;
  semanticTopFieldLabelledBy?: string;
  semanticTopFieldDescribedBy?: string;
  semanticTopFieldState?: string;
  semanticTopFieldRequired?: boolean;
  semanticTopFieldSelector?: string;
  semanticTopDescriptionRole?: string;
  semanticTopDescriptionPath?: string;
  semanticTopDescriptionName?: string;
  semanticTopDescriptionText?: string;
  semanticTopDescriptionSelector?: string;
  semanticTopValueRole?: string;
  semanticTopValuePath?: string;
  semanticTopValueName?: string;
  semanticTopValue?: string;
  semanticTopValueSelector?: string;
  semanticTopRelationRole?: string;
  semanticTopRelationPath?: string;
  semanticTopRelationName?: string;
  semanticTopRelation?: string;
  semanticTopRelationTarget?: string;
  semanticTopRelationTargetRole?: string;
  semanticTopRelationTargetName?: string;
  semanticTopRelationTargetSelector?: string;
  semanticTopRelationSelector?: string;
  semanticTopChoiceRole?: string;
  semanticTopChoicePath?: string;
  semanticTopChoiceName?: string;
  semanticTopChoiceState?: string;
  semanticTopChoiceSelected?: boolean;
  semanticTopChoiceSelector?: string;
  semanticTopStateRole?: string;
  semanticTopStatePath?: string;
  semanticTopStateName?: string;
  semanticTopState?: string;
  semanticTopStateHidden?: boolean;
  semanticTopStateDisabled?: boolean;
  semanticTopStateChecked?: boolean | "mixed";
  semanticTopStateSelected?: boolean;
  semanticTopStateExpanded?: boolean;
  semanticTopStatePressed?: boolean | "mixed";
  semanticTopStateFocused?: boolean;
  semanticTopStateRequired?: boolean;
  semanticTopStateInvalid?: boolean | string;
  semanticTopStateReadonly?: boolean;
  semanticTopStateCurrent?: boolean | string;
  semanticTopStateHaspopup?: boolean | string;
  semanticTopStateControls?: string;
  semanticTopStateLive?: string;
  semanticTopStateModal?: boolean;
  semanticTopStateSelector?: string;
  semanticTopUnavailablePath?: string;
  semanticTopUnavailableTag?: string;
  semanticTopUnavailableRole?: string;
  semanticTopUnavailableName?: string;
  semanticTopUnavailableReason?: string;
  semanticTopUnavailableSelector?: string;
  signalCount?: number;
  signalWarningCount?: number;
  signalErrorCount?: number;
  signals?: AgentSignal[];
  qualityGateCount?: number;
  qualityGateFailCount?: number;
  qualityGates?: AgentQualityGate[];
  topSignalKind?: AgentSignalKind;
  topSignalSeverity?: AgentSignalSeverity;
  topSignalMessage?: string;
  topQualityGateKind?: AgentQualityGateKind;
  topQualityGatePass?: boolean;
  topQualityGateSeverity?: AgentSignalSeverity;
  topQualityGateMessage?: string;
  topQualityGatePath?: string;
  topQualityGateScore?: number;
  problemSignalKind?: AgentSignalKind;
  problemSignalSeverity?: AgentSignalSeverity;
  problemSignalMessage?: string;
  failingQualityGateKind?: AgentQualityGateKind;
  failingQualityGateSeverity?: AgentSignalSeverity;
  failingQualityGateMessage?: string;
  failingQualityGatePath?: string;
  failingQualityGateScore?: number;
  canContinue: boolean;
  canUseFetchedHtml: boolean;
  needsBrowserHtml: boolean;
  responseStatus?: number;
  responseOk?: boolean;
  responseContentType?: string;
  finalUrlChanged?: boolean;
  confidence?: "low" | "medium" | "high";
  usabilityScore?: number;
  readability?: "low" | "medium" | "high";
  readabilityScore?: number;
  readabilityReasons?: string[];
  verificationStatus?: "not-requested" | "matched" | "partial" | "missing";
  verificationRequestedCount?: number;
  verificationFoundCount?: number;
  verificationMissingCount?: number;
  verificationFoundQueries?: string[];
  verificationMissingQueries?: string[];
  topVerificationFoundQuery?: string;
  topVerificationMissingQuery?: string;
  resultCount?: number;
  resultChoiceCount?: number;
  resultChoices?: AgentResultChoice[];
  topResultChoicePath?: string;
  topResultChoiceTitle?: string;
  topResultChoiceUrl?: string;
  topResultChoiceCommandArgs?: string[];
  topResultChoiceRank?: number;
  topResultChoiceOpenResult?: number | "best";
  topResultChoiceRecommended?: boolean;
  topResultChoicePrimary?: boolean;
  topResultChoiceSourceType?: string;
  topResultChoiceSourceScore?: number;
  topResultChoiceSourceHints?: string[];
  topResultChoiceDateText?: string;
  topResultChoiceRelevance?: "low" | "medium" | "high";
  topResultChoiceMatchedTerm?: string;
  topResultChoiceFindMatch?: string;
  topResultChoiceLikelyOfficial?: boolean;
  topResultChoiceSitelinkCount?: number;
  topResultChoiceFirstSitelinkTitle?: string;
  topResultChoiceFirstSitelinkUrl?: string;
  topResultChoiceReason?: string;
  evidenceCount?: number;
  formCount?: number;
  formChoiceCount?: number;
  formChoices?: AgentFormChoice[];
  topFormChoicePath?: string;
  topFormChoiceMethod?: string;
  topFormChoiceActionUrl?: string;
  topFormChoiceSubmitText?: string;
  topFormChoiceQueryField?: string;
  topFormChoiceUrlTemplate?: string;
  topFormChoiceFieldCount?: number;
  topFormChoiceSelector?: string;
  topFormChoiceFirstFieldName?: string;
  topFormChoiceFirstFieldType?: string;
  topFormChoiceFirstFieldLabel?: string;
  topFormChoiceFirstFieldRequired?: boolean;
  topFormChoiceFirstFieldSelector?: string;
  actionTargetCount?: number;
  actionTargetChoiceCount?: number;
  actionTargetChoices?: AgentActionTargetChoice[];
  topActionTargetChoicePath?: string;
  topActionTargetChoiceKind?: string;
  topActionTargetChoiceName?: string;
  topActionTargetChoiceSource?: string;
  topActionTargetChoiceTargetUrl?: string;
  topActionTargetChoiceUrlTemplate?: string;
  topActionTargetChoiceQueryInput?: string;
  topActionTargetChoiceMethod?: string;
  topActionTargetChoiceSelector?: string;
  barrierCount?: number;
  topBarrierKind?: string;
  topBarrierSeverity?: "info" | "warning" | "error";
  topBarrierSource?: string;
  topBarrierPath?: string;
  topBarrierText?: string;
  topBarrierSelector?: string;
  topBarrierDiagnosticCode?: string;
  dataTableCount?: number;
  faqCount?: number;
  codeBlockCount?: number;
  resourceCount?: number;
  mediaCount?: number;
  sectionCount?: number;
  breadcrumbCount?: number;
  paginationCount?: number;
  tocCount?: number;
  embedCount?: number;
  transcriptCount?: number;
  authorLinkCount?: number;
  provenanceCount?: number;
  offerCount?: number;
  datasetCount?: number;
  identityCount?: number;
  timelineCount?: number;
  contactPointCount?: number;
  topDataTablePath?: string;
  topDataTableCaption?: string;
  topDataTableRowCount?: number;
  topDataTableColumnCount?: number;
  topFaqQuestion?: string;
  topFaqAnswer?: string;
  topCodeBlockLanguage?: string;
  topCodeBlockLineCount?: number;
  topCodeBlockText?: string;
  topResourceKind?: string;
  topResourceUrl?: string;
  topResourceTitle?: string;
  topMediaKind?: string;
  topMediaUrl?: string;
  topMediaText?: string;
  topSectionPath?: string;
  topSectionHeading?: string;
  topSectionLevel?: number;
  topSectionText?: string;
  topSectionSelector?: string;
  topBreadcrumbPath?: string;
  topBreadcrumbText?: string;
  topBreadcrumbSource?: string;
  topPaginationPath?: string;
  topPaginationKind?: string;
  topPaginationLabel?: string;
  topPaginationUrl?: string;
  topPaginationCurrent?: boolean;
  topPaginationSelector?: string;
  topTocPath?: string;
  topTocTitle?: string;
  topTocItemCount?: number;
  topTocText?: string;
  topTocFirstItemLabel?: string;
  topTocFirstItemUrl?: string;
  topTocSelector?: string;
  topEmbedKind?: string;
  topEmbedUrl?: string;
  topEmbedTitle?: string;
  topTranscriptKind?: string;
  topTranscriptUrl?: string;
  topTranscriptLabel?: string;
  topTranscriptLanguage?: string;
  topAuthorLinkName?: string;
  topAuthorLinkUrl?: string;
  topAuthorLinkSource?: string;
  topProvenancePath?: string;
  topProvenanceKind?: string;
  topProvenanceLabel?: string;
  topProvenanceValue?: string;
  topProvenanceUrl?: string;
  topProvenanceSource?: string;
  topProvenanceSelector?: string;
  topOfferPath?: string;
  topOfferName?: string;
  topOfferPrice?: string;
  topOfferCurrency?: string;
  topOfferAvailability?: string;
  topOfferUrl?: string;
  topOfferSelector?: string;
  topDatasetPath?: string;
  topDatasetKind?: string;
  topDatasetName?: string;
  topDatasetUrl?: string;
  topDatasetDistributionUrl?: string;
  topDatasetLicenseUrl?: string;
  topDatasetEncodingFormat?: string;
  topDatasetSelector?: string;
  topIdentityPath?: string;
  topIdentityKind?: string;
  topIdentityName?: string;
  topIdentityUrl?: string;
  topIdentityLogoUrl?: string;
  topIdentitySameAsUrl?: string;
  topIdentitySource?: string;
  topIdentitySelector?: string;
  topTimelinePath?: string;
  topTimelineKind?: string;
  topTimelineLabel?: string;
  topTimelineValue?: string;
  topTimelineSource?: string;
  topTimelineSelector?: string;
  topContactPointPath?: string;
  topContactPointKind?: string;
  topContactPointLabel?: string;
  topContactPointValue?: string;
  topContactPointUrl?: string;
  topContactPointSource?: string;
  topContactPointSelector?: string;
  structuredReadTargetCount?: number;
  bestStructuredReadTarget?: string;
  bestStructuredReadTargetCount?: number;
  bestStructuredReadTargetScore?: number;
  bestStructuredReadTargetPrimary?: boolean;
  bestStructuredReadTargetReason?: string;
  hiddenSignalCount?: number;
  topHiddenSignalGroup?: string;
  topHiddenSignalPath?: string;
  topHiddenSignalKind?: string;
  topHiddenSignalText?: string;
  topHiddenSignalUrl?: string;
  topHiddenSignalSource?: string;
  hiddenReadTargetCount?: number;
  bestHiddenReadTarget?: string;
  bestHiddenReadTargetCount?: number;
  bestHiddenReadTargetScore?: number;
  bestHiddenReadTargetPrimary?: boolean;
  bestHiddenReadTargetReason?: string;
  sourceLinkCount?: number;
  sourceChoiceCount?: number;
  sourceChoices?: AgentSourceChoice[];
  topSourceChoicePath?: string;
  topSourceChoiceTitle?: string;
  topSourceChoiceUrl?: string;
  topSourceChoiceCommandArgs?: string[];
  topSourceChoiceSourceType?: string;
  topSourceChoiceSourceScore?: number;
  topSourceChoiceSourceHints?: string[];
  topSourceChoicePrimary?: boolean;
  topSourceChoiceReason?: string;
  topChoiceKind?: "result" | "source" | "form" | "action-target";
  topChoicePath?: string;
  topChoiceLabel?: string;
  topChoiceUrl?: string;
  topChoiceCommandArgs?: string[];
  sourceSearchQuery?: string;
  sourceSearchEngine?: string;
  sourceSearchSelectedEngine?: string;
  sourceSearchSearchUrl?: string;
  sourceSearchLang?: string;
  sourceSearchRegion?: string;
  sourceSearchFindQueryCount?: number;
  sourceSearchTopFindQuery?: string;
  sourceSearchSelectedRank?: number;
  sourceSearchSelectedTitle?: string;
  sourceSearchSelectedUrl?: string;
  sourceSearchSelectedPath?: string;
  sourceSearchSelectedOpenResult?: number | "best";
  sourceSearchSelectedCommandArgs?: string[];
  sourceSearchSelectedReason?: string;
  sourceSearchAlternateCount?: number;
  sourceSearchAlternatePath?: string;
  sourceSearchAlternateTitle?: string;
  sourceSearchAlternateUrl?: string;
  sourceSearchAlternateRank?: number;
  sourceSearchAlternateOpenResult?: number | "best";
  sourceSearchAlternateCommandArgs?: string[];
  sourceSearchAlternateReason?: string;
  evidenceQualityScore?: number;
  sourceQualityScore?: number;
  alternativeActionCount?: number;
  diagnosticCodes?: string[];
  diagnosticErrorCount?: number;
  diagnosticWarningCount?: number;
  diagnosticInfoCount?: number;
  topDiagnosticCode?: string;
  topDiagnosticSeverity?: "info" | "warning" | "error";
  topDiagnosticMessage?: string;
  citationCount?: number;
  citations?: AgentCitation[];
  topCitationId?: string;
  topCitationPath?: string;
  topCitationKind?: AgentCitation["kind"];
  topCitationText?: string;
  topCitationTitle?: string;
  topCitationUrl?: string;
  topCitationConfidence?: AgentCitation["confidence"];
  topCitationReason?: string;
  topCitationScore?: number;
  answerEvidenceCount?: number;
  answerEvidence?: AgentCitation[];
  topAnswerEvidenceId?: string;
  topAnswerEvidencePath?: string;
  topAnswerEvidenceKind?: AgentCitation["kind"];
  topAnswerEvidenceText?: string;
  topAnswerEvidenceTitle?: string;
  topAnswerEvidenceUrl?: string;
  topAnswerEvidenceConfidence?: AgentCitation["confidence"];
  topAnswerEvidenceReason?: string;
  answerPlanStatus?: AgentAnswerPlan["status"];
  answerPlanConfidence?: AgentAnswerPlan["confidence"];
  answerPlanReason?: string;
  answerPlanNextAction?: string;
  answerGapCount?: number;
  answerUseCitationIds?: string[];
  answerPlanReadFrom?: string;
  answerPlanCommandArgs?: string[];
  answerPlanAfterInteractionCommand?: string;
  answerPlanAfterInteractionCommandArgs?: string[];
  answerPlanUrl?: string;
  readTargetCount?: number;
  readTargets?: AgentReadTarget[];
  topReadTarget?: string;
  topReadTargetCount?: number;
  topReadTargetScore?: number;
  topReadTargetPrimary?: boolean;
  topReadTargetReason?: string;
  actionCount?: number;
  actions?: AgentAction[];
  topActionName?: string;
  topActionSource?: string;
  topActionExecution?: AgentAction["execution"];
  topActionPriority?: AgentAction["priority"];
  topActionReason?: string;
  topActionReadFrom?: string;
  topActionCommandArgs?: string[];
  topActionUrl?: string;
  topActionSourceLinkRef?: string;
  topActionRequiresBrowserInteraction?: boolean;
  bestReadTarget?: string;
  bestReadTargetCount?: number;
  bestReadTargetScore?: number;
  bestReadTargetPrimary?: boolean;
  bestReadTargetReason?: string;
  executorDecision?: AgentNext["loop"]["decision"];
  executorMode?: AgentContinuationMode;
  executorActionName?: string;
  executorOperation?: AgentExecutionPlan["operation"];
  executorConfidence?: AgentExecutionPlan["confidence"];
  executorAnswerReady?: boolean;
  executorShouldContinue?: boolean;
  executorTerminal?: boolean;
  executorCommandArgs?: string[];
  executorReadFrom?: string;
  executorUrl?: string;
  executorTargetUrl?: string;
  executorTargetPath?: string;
  executorTargetSelector?: string;
  executorTargetText?: string;
  executorExpectedOutcome?: AgentExpectedOutcome["kind"];
  handoffDecision?: AgentNext["loop"]["decision"];
  handoffMode?: AgentContinuationMode;
  handoffActionName?: string;
  handoffOperation?: AgentExecutionPlan["operation"];
  handoffAnswerStatus?: AgentAnswerPlan["status"];
  handoffConfidence?: AgentExecutionPlan["confidence"];
  handoffAnswerReady?: boolean;
  handoffShouldContinue?: boolean;
  handoffTerminal?: boolean;
  handoffPriority?: "low" | "medium" | "high";
  handoffPriorityReason?: string;
  handoffCommandArgs?: string[];
  handoffReadFrom?: string;
  handoffUrl?: string;
  handoffTargetUrl?: string;
  handoffTargetPath?: string;
  handoffTargetSelector?: string;
  handoffTargetText?: string;
  handoffExpectedOutcome?: AgentExpectedOutcome["kind"];
  primaryActionName?: string;
  primaryReason?: string;
  primaryPriority?: "low" | "medium" | "high";
  primaryPriorityReason?: string;
  primaryExecution?: AgentExecutionMode;
  primaryReadFrom?: string;
  primaryCommand?: string;
  primaryCommandArgs?: string[];
  primaryAfterInteractionCommand?: string;
  primaryAfterInteractionCommandArgs?: string[];
  primaryUrl?: string;
  primarySourceLinkRef?: string;
  primaryRank?: number;
  primaryOpenResult?: number | "best";
  requiresBrowserInteraction?: boolean;
  primaryAction?: AgentAction;
  alternativeActionName?: string;
  alternativeActionSource?: string;
  alternativeActionExecution?: AgentExecutionMode;
  alternativeActionPriority?: "low" | "medium" | "high";
  alternativeActionReason?: string;
  alternativeActionReadFrom?: string;
  alternativeActionCommandArgs?: string[];
  alternativeActionUrl?: string;
  alternativeActionSourceLinkRef?: string;
  alternativeActionRequiresBrowserInteraction?: boolean;
  recommendedUrl?: string;
  recommendedTitle?: string;
  recommendedRank?: number;
  recommendedSource?: string;
  recommendedRelevance?: number;
  recommendedLikelyOfficial?: boolean;
  recommendedSelectionReason?: string;
  recommendedCommand?: string;
  recommendedCommandArgs?: string[];
};

export type AgentContractFeature =
  | "next.loop"
  | "next.readTarget"
  | "next.readValue"
  | "next.target"
  | "runbook"
  | "runbook.shortcuts"
  | "executor"
  | "handoff"
  | "handoff.answerEvidence"
  | "handoff.choices"
  | "handoff.sourceSearch"
  | "handoff.quality"
  | "executionPlan"
  | "executionPlan.shortcuts"
  | "citations"
  | "citation.reason"
  | "answerPlan"
  | "answerEvidence"
  | "answerPlan.actionFields"
  | "answerPlan.confidence"
  | "verification.queries"
  | "searchDecision"
  | "choice.counts"
  | "evidence.counts"
  | "signal.counts"
  | "quality.shortcuts"
  | "resultChoices"
  | "sourceChoices"
  | "formChoices"
  | "actionTargetChoices"
  | "sourceSearch.shortcuts"
  | "pageDecision"
  | "pageMetadata.shortcuts"
  | "semanticSummary"
  | "searchResult.selectionReason"
  | "sourceLink.selectionReason"
  | "action.priority"
  | "action.sourceLinkRef"
  | "actions"
  | "contentEvidence.quality"
  | "pageCheck.dataTables"
  | "pageCheck.barriers"
  | "pageCheck.forms"
  | "pageCheck.actionTargets"
  | "pageCheck.hydration"
  | "pageCheck.apiEndpoints"
  | "pageCheck.clientState"
  | "pageCheck.runtime"
  | "pageCheck.config"
  | "pageCheck.appHints"
  | "pageCheck.mobileHints"
  | "pageCheck.topics"
  | "pageCheck.keyValues"
  | "pageCheck.metaFacts"
  | "pageCheck.provenance"
  | "pageCheck.httpPolicies"
  | "pageCheck.schemaFacts"
  | "pageCheck.offers"
  | "pageCheck.identities"
  | "pageCheck.datasets"
  | "pageCheck.timeline"
  | "pageCheck.contactPoints"
  | "pageCheck.faqs"
  | "pageCheck.breadcrumbs"
  | "pageCheck.sections"
  | "pageCheck.pagination"
  | "pageCheck.toc"
  | "pageCheck.codeBlocks"
  | "pageCheck.citations"
  | "pageCheck.media"
  | "pageCheck.resources"
  | "pageCheck.embeds"
  | "pageCheck.transcripts"
  | "pageCheck.authorLinks"
  | "readTargets"
  | "signals"
  | "qualityGates"
  | "expectedOutcome"
  | "responseMetadata"
  | "hiddenSignal.shortcuts"
  | "afterInteractionCommand"
  | "browserHtml"
  | "primaryActionShortcuts"
  | "alternativeActionShortcuts"
  | "barrierShortcuts";

export type AgentContract = {
  version: number;
  features: AgentContractFeature[];
};

export type AgentJsonEnvelope = {
  schemaVersion: number;
  tool: "ax-grep";
  ok: boolean;
  url?: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  fetchedAt?: string;
  mode?: string;
  kind?: string;
  searchQuery?: string;
  searchEngine?: string;
  selectedSearchEngine?: string;
  searchLang?: string;
  searchRegion?: string;
  sourceSearch?: Record<string, unknown>;
  warnings?: Array<{ code: string; message: string }>;
  agent: AgentSummary;
  page?: Record<string, unknown>;
  pageCheck?: Record<string, unknown>;
  verification?: Record<string, unknown>;
  finds?: Array<Record<string, unknown>>;
  searchResults?: Array<Record<string, unknown>>;
  recommendedResult?: Record<string, unknown>;
  suggestedActions?: Array<Record<string, unknown>>;
  error?: { code: string; message: string; status?: number };
  treeOmitted?: boolean;
};
