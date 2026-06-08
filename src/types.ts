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

export type AgentNext = {
  mode: AgentContinuationMode;
  reason: string;
  loop: AgentLoopDirective;
  action?: string;
  execution?: AgentExecutionMode;
  url?: string;
  rank?: number;
  openResult?: number | "best";
  readFrom?: string;
  command?: string;
  commandArgs?: string[];
  requiresBrowserInteraction?: boolean;
  terminal?: boolean;
  readTarget?: AgentReadTarget;
  readValue?: AgentReadValue;
  target?: AgentTarget;
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

export type AgentExpectedOutcomeKind =
  | "read-evidence"
  | "open-result"
  | "run-search"
  | "capture-html"
  | "browser-inspection"
  | "inspect-output"
  | "stop";

export type AgentExpectedOutcome = {
  kind: AgentExpectedOutcomeKind;
  message: string;
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

export type AgentTarget = {
  title?: string;
  url: string;
  source?: string;
  rank?: number;
  sourceType?: string;
  sourceScore?: number;
  sourceHints?: string[];
  relevance?: "low" | "medium" | "high";
  matchedTerms?: string[];
  findMatches?: string[];
  isLikelyOfficial?: boolean;
};

export type AgentSummary = {
  contract: AgentContract;
  status: AgentStatus;
  pageKind: string;
  summary: string;
  routingIntent: AgentRoutingIntent;
  continuationMode: AgentContinuationMode;
  next: AgentNext;
  expectedOutcome: AgentExpectedOutcome;
  signals?: AgentSignal[];
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
  resultCount?: number;
  evidenceCount?: number;
  sourceLinkCount?: number;
  evidenceQualityScore?: number;
  sourceQualityScore?: number;
  alternativeActionCount?: number;
  diagnosticCodes?: string[];
  diagnosticErrorCount?: number;
  diagnosticWarningCount?: number;
  diagnosticInfoCount?: number;
  readTargets?: AgentReadTarget[];
  bestReadTarget?: string;
  bestReadTargetScore?: number;
  bestReadTargetReason?: string;
  primaryExecution?: AgentExecutionMode;
  primaryReadFrom?: string;
  primaryCommand?: string;
  primaryCommandArgs?: string[];
  primaryUrl?: string;
  primaryRank?: number;
  primaryOpenResult?: number | "best";
  requiresBrowserInteraction?: boolean;
  primaryAction?: Record<string, unknown>;
  recommendedUrl?: string;
  recommendedTitle?: string;
  recommendedRank?: number;
  recommendedSource?: string;
  recommendedRelevance?: number;
  recommendedLikelyOfficial?: boolean;
};

export type AgentContractFeature =
  | "next.loop"
  | "next.readTarget"
  | "next.readValue"
  | "next.target"
  | "readTargets"
  | "signals"
  | "expectedOutcome"
  | "responseMetadata"
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
