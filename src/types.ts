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
  summary: string;
  routingIntent: AgentRoutingIntent;
  continuationMode: AgentContinuationMode;
  next: AgentNext;
  runbook: AgentRunbook;
  executor: AgentExecutorStep;
  handoff?: AgentHandoff;
  expectedOutcome: AgentExpectedOutcome;
  executionPlan: AgentExecutionPlan;
  answerPlan?: AgentAnswerPlan;
  searchDecision?: Record<string, unknown>;
  pageDecision?: Record<string, unknown>;
  semanticSummary?: Record<string, unknown>;
  signalCount?: number;
  signalWarningCount?: number;
  signalErrorCount?: number;
  signals?: AgentSignal[];
  qualityGateCount?: number;
  qualityGateFailCount?: number;
  qualityGates?: AgentQualityGate[];
  problemSignalKind?: AgentSignalKind;
  problemSignalSeverity?: AgentSignalSeverity;
  problemSignalMessage?: string;
  failingQualityGateKind?: AgentQualityGateKind;
  failingQualityGateMessage?: string;
  failingQualityGatePath?: string;
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
  resultCount?: number;
  resultChoiceCount?: number;
  resultChoices?: AgentResultChoice[];
  evidenceCount?: number;
  formCount?: number;
  formChoiceCount?: number;
  formChoices?: AgentFormChoice[];
  actionTargetCount?: number;
  actionTargetChoiceCount?: number;
  actionTargetChoices?: AgentActionTargetChoice[];
  hiddenSignalCount?: number;
  hiddenReadTargetCount?: number;
  sourceLinkCount?: number;
  sourceChoiceCount?: number;
  sourceChoices?: AgentSourceChoice[];
  topChoiceKind?: "result" | "source" | "form" | "action-target";
  topChoicePath?: string;
  topChoiceLabel?: string;
  topChoiceUrl?: string;
  topChoiceCommandArgs?: string[];
  sourceSearchSelectedRank?: number;
  sourceSearchSelectedUrl?: string;
  sourceSearchAlternateCount?: number;
  evidenceQualityScore?: number;
  sourceQualityScore?: number;
  alternativeActionCount?: number;
  diagnosticCodes?: string[];
  diagnosticErrorCount?: number;
  diagnosticWarningCount?: number;
  diagnosticInfoCount?: number;
  citationCount?: number;
  citations?: AgentCitation[];
  answerEvidenceCount?: number;
  answerEvidence?: AgentCitation[];
  answerPlanStatus?: AgentAnswerPlan["status"];
  answerPlanConfidence?: AgentAnswerPlan["confidence"];
  answerGapCount?: number;
  answerUseCitationIds?: string[];
  answerPlanReadFrom?: string;
  answerPlanCommandArgs?: string[];
  answerPlanUrl?: string;
  readTargetCount?: number;
  readTargets?: AgentReadTarget[];
  actionCount?: number;
  actions?: AgentAction[];
  bestReadTarget?: string;
  bestReadTargetScore?: number;
  bestReadTargetReason?: string;
  executorActionName?: string;
  executorOperation?: AgentExecutionPlan["operation"];
  executorCommandArgs?: string[];
  executorReadFrom?: string;
  executorUrl?: string;
  executorExpectedOutcome?: AgentExpectedOutcome["kind"];
  handoffActionName?: string;
  handoffOperation?: AgentExecutionPlan["operation"];
  handoffAnswerStatus?: AgentAnswerPlan["status"];
  handoffPriority?: "low" | "medium" | "high";
  handoffPriorityReason?: string;
  handoffCommandArgs?: string[];
  handoffReadFrom?: string;
  handoffUrl?: string;
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
  primaryRank?: number;
  primaryOpenResult?: number | "best";
  requiresBrowserInteraction?: boolean;
  primaryAction?: AgentAction;
  recommendedUrl?: string;
  recommendedTitle?: string;
  recommendedRank?: number;
  recommendedSource?: string;
  recommendedRelevance?: number;
  recommendedLikelyOfficial?: boolean;
  recommendedSelectionReason?: string;
};

export type AgentContractFeature =
  | "next.loop"
  | "next.readTarget"
  | "next.readValue"
  | "next.target"
  | "runbook"
  | "executor"
  | "handoff"
  | "handoff.answerEvidence"
  | "handoff.choices"
  | "handoff.sourceSearch"
  | "handoff.quality"
  | "executionPlan"
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
  | "resultChoices"
  | "sourceChoices"
  | "formChoices"
  | "actionTargetChoices"
  | "sourceSearch.shortcuts"
  | "pageDecision"
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
  | "afterInteractionCommand"
  | "browserHtml"
  | "primaryActionShortcuts";

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
