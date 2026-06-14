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
  busy?: boolean;
  multiselectable?: boolean;
  sort?: string;
  grabbed?: boolean;
  dropEffect?: string;
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
  orientation?: string;
  valueMin?: number;
  valueMax?: number;
  valueNow?: number;
  valueText?: string;
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
export type AgentBrowserHtmlReasonCode =
  | "no-inspectable-content"
  | "client-rendered"
  | "http-error"
  | "fetch-error"
  | "challenge"
  | "login-required"
  | "paywall"
  | "blocked-or-empty"
  | "retry-action"
  | "interaction-required"
  | "browser-interaction"
  | "unknown";
export type AgentStaticReadiness = "usable-content" | "usable-structured-data" | "usable-hidden-data" | "thin" | "needs-browser" | "error";
export type AgentStaticReadinessReasonCode =
  | "browser-required"
  | "client-rendered"
  | "interaction-required"
  | "extraction-error"
  | "hidden-data"
  | "source-link"
  | "form"
  | "action-target"
  | "structured-data"
  | "readable-content"
  | "limited-static-payload"
  | "thin-content";
export type AgentSourceSearchFailureKind =
  | "not-found"
  | "http-client-error"
  | "http-server-error"
  | "http-error"
  | "fetch-error"
  | "timeout"
  | "rate-limited"
  | "no-inspectable-content"
  | "unknown";

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
  expectedOutcome?: AgentExpectedOutcome["kind"];
  expectedOutcomeMessage?: string;
  target?: AgentTarget;
  source?: string;
  primary?: boolean;
  index?: number;
  path?: string;
};

export type AgentPageMetadata = {
  description?: string;
  lang?: string;
  dir?: string;
  siteName?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  structuredDataTypes?: string[];
};

export type AgentFindMatch = {
  field: string;
  text: string;
  rank?: number;
  url?: string;
  selector?: string;
  source?: "semantic" | "fallback";
  score?: number;
  quality?: "low" | "medium" | "high";
  qualityReason?: string;
};

export type AgentFindSummary = {
  query: string;
  found: boolean;
  matchCount: number;
  matches: AgentFindMatch[];
};

export type AgentPageEvidence = {
  id: string;
  path: string;
  rank: number;
  text: string;
  role: string;
  source: "semantic" | "fallback";
  score: number;
  quality: "low" | "medium" | "high";
  qualityReason: string;
  selector?: string;
};

export type AgentPageAction = {
  type: string;
  text: string;
  selector?: string;
};

export type AgentPageDataTable = {
  id: string;
  path: string;
  rank: number;
  rowCount: number;
  columnCount: number;
  headers: string[];
  sampleRows: string[][];
  text?: string;
  caption?: string;
  selector?: string;
};

export type AgentPageBarrier = {
  id: string;
  path: string;
  rank: number;
  kind: "challenge" | "login" | "paywall" | "cookie-consent" | "age-gate" | "geo-block";
  severity: "info" | "warning" | "error";
  text?: string;
  evidence: string;
  diagnosticCode?: string;
  source: "diagnostic" | "content" | "action";
  selector?: string;
};

export type AgentPageCodeBlock = {
  id: string;
  path: string;
  rank: number;
  text?: string;
  lineCount: number;
  source: "pre" | "code";
  language?: string;
  commandLike?: boolean;
  selector?: string;
};

export type AgentPageMedia = {
  id: string;
  path: string;
  rank: number;
  kind: "open-graph" | "figure" | "image";
  url: string;
  text?: string;
  alt?: string;
  caption?: string;
  title?: string;
  width?: number;
  height?: number;
  selector?: string;
};

export type AgentPageResource = {
  id: string;
  path: string;
  rank: number;
  kind: "feed" | "alternate" | "amp" | "license" | "manifest" | "sitemap" | "search" | "document" | "download";
  url: string;
  text?: string;
  title?: string;
  rel?: string;
  type?: string;
  hreflang?: string;
  selector?: string;
};

export type AgentPageCitation = {
  id: string;
  path: string;
  rank: number;
  source: "blockquote" | "cite" | "footnote" | "reference";
  text?: string;
  quote?: string;
  title?: string;
  url?: string;
  selector?: string;
};

export type AgentPageBreadcrumbItem = {
  label: string;
  url?: string;
  position?: number;
};

export type AgentPageBreadcrumb = {
  id: string;
  path: string;
  rank: number;
  source: "json-ld" | "html";
  items: AgentPageBreadcrumbItem[];
  text?: string;
  selector?: string;
};

export type AgentPageSection = {
  id: string;
  path: string;
  rank: number;
  heading: string;
  level: number;
  text?: string;
  excerpts: string[];
  selector?: string;
};

export type AgentPagePagination = {
  id: string;
  path: string;
  rank: number;
  kind: "next" | "prev" | "first" | "last" | "page";
  label: string;
  text?: string;
  source: "link" | "html";
  url?: string;
  current?: boolean;
  selector?: string;
};

export type AgentPageTocItem = {
  label: string;
  url?: string;
  level?: number;
};

export type AgentPageToc = {
  id: string;
  path: string;
  rank: number;
  items: AgentPageTocItem[];
  text?: string;
  title?: string;
  selector?: string;
};

export type AgentPageAuthorLink = {
  id: string;
  path: string;
  rank: number;
  url: string;
  text?: string;
  source: "json-ld" | "link" | "html";
  name?: string;
  rel?: string;
  selector?: string;
};

export type AgentPageOffer = {
  id: string;
  path: string;
  rank: number;
  name?: string;
  price?: string;
  priceAmount?: number;
  currency?: string;
  availability?: string;
  url?: string;
  brand?: string;
  sku?: string;
  rating?: string;
  reviewCount?: string;
  text?: string;
  source: "json-ld";
  selector?: string;
};

export type AgentPageIdentity = {
  id: string;
  path: string;
  rank: number;
  kind: "organization" | "person" | "website" | "brand" | "thing";
  name: string;
  text?: string;
  source: "json-ld" | "meta";
  url?: string;
  logoUrl?: string;
  sameAs?: string[];
  selector?: string;
};

export type AgentPageDataset = {
  id: string;
  path: string;
  rank: number;
  kind: "dataset" | "dataCatalog" | "dataDownload";
  name: string;
  text?: string;
  source: "json-ld" | "link";
  url?: string;
  distributionUrls?: string[];
  encodingFormat?: string;
  licenseUrl?: string;
  temporalCoverage?: string;
  spatialCoverage?: string;
  creator?: string;
  selector?: string;
};

export type AgentPageTimeline = {
  id: string;
  path: string;
  rank: number;
  kind: "published" | "modified" | "created" | "updated" | "start" | "end" | "date";
  label: string;
  value: string;
  isoDate?: string;
  unixMs?: number;
  text?: string;
  source: "meta" | "json-ld" | "time" | "page";
  selector?: string;
};

export type AgentPageContactPoint = {
  id: string;
  path: string;
  rank: number;
  kind: "email" | "phone" | "address" | "contact-url";
  label: string;
  value: string;
  text?: string;
  source: "json-ld" | "html" | "link";
  url?: string;
  selector?: string;
};

export type AgentPageFaq = {
  id: string;
  path: string;
  rank: number;
  question: string;
  answer: string;
  text?: string;
  source: "details" | "html";
  selector?: string;
};

export type AgentPageHydration = {
  id: string;
  path: string;
  rank: number;
  kind: "next-data" | "nuxt-data" | "gatsby-data" | "fetch-preload" | "json-script";
  label: string;
  text?: string;
  source: "script" | "link";
  framework?: string;
  route?: string;
  buildId?: string;
  url?: string;
  selector?: string;
};

export type AgentPageApiEndpoint = {
  id: string;
  path: string;
  rank: number;
  kind: "fetch" | "axios" | "xhr" | "graphql" | "event-stream";
  method?: string;
  url: string;
  text?: string;
  source: "script";
  selector?: string;
};

export type AgentPageClientState = {
  id: string;
  path: string;
  rank: number;
  kind: "local-storage" | "session-storage" | "cookie";
  operation: "read" | "write" | "delete";
  key: string;
  text?: string;
  source: "script";
  selector?: string;
};

export type AgentPageRuntime = {
  id: string;
  path: string;
  rank: number;
  kind: "service-worker" | "web-worker" | "shared-worker" | "worklet" | "dynamic-import" | "module-preload";
  url: string;
  text?: string;
  source: "script" | "link";
  selector?: string;
};

export type AgentPageConfig = {
  id: string;
  path: string;
  rank: number;
  kind: "app-config" | "initial-state" | "env" | "feature-flags" | "data-layer" | "config";
  name: string;
  keys: string[];
  keyCount: number;
  text?: string;
  source: "script";
  selector?: string;
};

export type AgentPageTopic = {
  id: string;
  path: string;
  rank: number;
  kind: "keyword" | "tag" | "section" | "category" | "about" | "mention";
  label: string;
  value: string;
  text?: string;
  source: "meta" | "json-ld";
  selector?: string;
};

export type AgentPageKeyValue = {
  id: string;
  path: string;
  rank: number;
  label: string;
  value: string;
  text?: string;
  source: "definition-list" | "time" | "text";
  datetime?: string;
  selector?: string;
};

export type AgentPageMetaFact = {
  id: string;
  path: string;
  rank: number;
  label: string;
  value: string;
  text?: string;
  source: "meta" | "link";
  url?: string;
  selector?: string;
};

export type AgentPageProvenance = {
  id: string;
  path: string;
  rank: number;
  kind: "doi" | "pmid" | "arxiv" | "isbn" | "publisher" | "journal" | "license" | "identifier";
  label: string;
  value: string;
  text?: string;
  source: "meta" | "link" | "json-ld";
  url?: string;
  selector?: string;
};

export type AgentPageHttpPolicy = {
  id: string;
  path: string;
  rank: number;
  name: string;
  value: string;
  text?: string;
  source: "header" | "meta";
  selector?: string;
};

export type AgentPageSchemaFactValue = {
  label: string;
  value: string;
};

export type AgentPageSchemaFact = {
  id: string;
  path: string;
  rank: number;
  types: string[];
  facts: AgentPageSchemaFactValue[];
  text?: string;
  source: "json-ld";
  selector?: string;
};

export type AgentPageAppHint = {
  id: string;
  path: string;
  rank: number;
  kind: "manifest" | "app-name" | "icon" | "theme" | "capability";
  label: string;
  value: string;
  text?: string;
  source: "link" | "meta";
  url?: string;
  sizes?: string;
  media?: string;
  selector?: string;
};

export type AgentPageMobileHint = {
  id: string;
  path: string;
  rank: number;
  kind: "viewport" | "format-detection" | "color-scheme" | "smart-app-banner" | "app-link";
  label: string;
  value: string;
  text?: string;
  source: "meta" | "link";
  platform?: string;
  url?: string;
  selector?: string;
};

export type AgentPageEmbed = {
  id: string;
  path: string;
  rank: number;
  kind: "iframe" | "video" | "audio" | "embed" | "object";
  url: string;
  text?: string;
  title?: string;
  type?: string;
  posterUrl?: string;
  sourceUrls?: string[];
  sandbox?: string;
  allow?: string;
  loading?: string;
  selector?: string;
};

export type AgentPageTranscript = {
  id: string;
  path: string;
  rank: number;
  kind: "captions" | "subtitles" | "descriptions" | "chapters" | "metadata" | "transcript";
  url: string;
  text?: string;
  mediaKind?: "video" | "audio";
  label?: string;
  language?: string;
  selector?: string;
};

export type AgentPageCheck = AgentPageMetadata & {
  contentEvidence: AgentPageEvidence[];
  contentLength: number;
  confidence: "low" | "medium" | "high";
  readability: {
    level: "low" | "medium" | "high";
    score: number;
    reasons: string[];
  };
  primaryLinks?: AgentSourceChoice[];
  sourceLinks?: AgentSourceChoice[];
  actions?: AgentPageAction[];
  recommendedAction?: AgentAction;
  nextSteps?: AgentAction[];
  title?: string;
  canonicalUrl?: string;
  mainHeading?: string;
  dataTables?: AgentPageDataTable[];
  barriers?: AgentPageBarrier[];
  forms?: AgentPageForm[];
  actionTargets?: AgentActionTargetChoice[];
  hydration?: AgentPageHydration[];
  apiEndpoints?: AgentPageApiEndpoint[];
  clientState?: AgentPageClientState[];
  runtime?: AgentPageRuntime[];
  config?: AgentPageConfig[];
  appHints?: AgentPageAppHint[];
  mobileHints?: AgentPageMobileHint[];
  topics?: AgentPageTopic[];
  contactPoints?: AgentPageContactPoint[];
  keyValues?: AgentPageKeyValue[];
  metaFacts?: AgentPageMetaFact[];
  provenance?: AgentPageProvenance[];
  httpPolicies?: AgentPageHttpPolicy[];
  schemaFacts?: AgentPageSchemaFact[];
  offers?: AgentPageOffer[];
  identities?: AgentPageIdentity[];
  datasets?: AgentPageDataset[];
  timeline?: AgentPageTimeline[];
  faqs?: AgentPageFaq[];
  breadcrumbs?: AgentPageBreadcrumb[];
  sections?: AgentPageSection[];
  pagination?: AgentPagePagination[];
  toc?: AgentPageToc[];
  codeBlocks?: AgentPageCodeBlock[];
  citations?: AgentPageCitation[];
  media?: AgentPageMedia[];
  resources?: AgentPageResource[];
  embeds?: AgentPageEmbed[];
  transcripts?: AgentPageTranscript[];
  authorLinks?: AgentPageAuthorLink[];
};

export type AgentVerification = {
  status: "matched" | "partial" | "missing";
  requestedCount: number;
  foundCount: number;
  missingCount: number;
  evidenceCount: number;
  foundQueries?: string[];
  missingQueries?: string[];
  bestEvidence?: AgentFindMatch;
  recommendedAction?: AgentAction;
};

export type AgentSearchDecision = {
  decision: "open-result" | "refine-search" | "none";
  confidence: "low" | "medium" | "high";
  reason: string;
  resultCount: number;
  highRelevanceCount: number;
  mediumRelevanceCount: number;
  lowRelevanceCount: number;
  officialCount: number;
  findMatchCount: number;
  recommendedRank?: number;
  recommendedPath?: string;
  recommendedTitle?: string;
  recommendedUrl?: string;
  recommendedSource?: string;
  recommendedSourceScore?: number;
  recommendedSourceType?: AgentTarget["sourceType"];
  recommendedSourceHints?: string[];
  recommendedDateText?: string;
  recommendedDateIso?: string;
  recommendedDateUnixMs?: number;
  recommendedDatePrecision?: "day" | "month" | "year";
  recommendedDateSource?: "title" | "snippet";
  recommendedRelevance?: "low" | "medium" | "high";
  recommendedLikelyOfficial?: boolean;
  firstOfficialRank?: number;
  firstOfficialPath?: string;
  firstOfficialTitle?: string;
  firstOfficialUrl?: string;
  firstOfficialSource?: string;
  firstOfficialSourceScore?: number;
  firstOfficialSourceType?: AgentTarget["sourceType"];
  firstOfficialSourceHints?: string[];
  firstOfficialDateText?: string;
  firstOfficialDateIso?: string;
  firstOfficialDateUnixMs?: number;
  firstOfficialDatePrecision?: "day" | "month" | "year";
  firstOfficialDateSource?: "title" | "snippet";
  firstOfficialRelevance?: "low" | "medium" | "high";
  firstOfficialCommand?: string;
  firstOfficialCommandArgs?: string[];
  command?: string;
  commandArgs?: string[];
};

export type AgentPageDecision = {
  decision: "read-content" | "open-source-link" | "open-site-search" | "retry-with-browser-html" | "inspect-actions" | "none";
  confidence: "low" | "medium" | "high";
  reason: string;
  readability: "low" | "medium" | "high";
  readabilityScore: number;
  evidenceCount: number;
  evidenceQualityScore: number;
  sourceLinkCount: number;
  sourceQualityScore: number;
  readFrom?: string;
  url?: string;
  command?: string;
  commandArgs?: string[];
};

export type AgentSemanticSummary = {
  nodeCount: number;
  namedRoleCount: number;
  interactiveCount: number;
  focusableCount: number;
  headingCount: number;
  landmarkCount: number;
  linkCount: number;
  buttonCount: number;
  imageCount: number;
  tableCount: number;
  listCount: number;
  fieldCount: number;
  descriptionCount: number;
  valueCount: number;
  relationCount: number;
  choiceCount: number;
  stateCount: number;
  unavailableCount: number;
  roleCounts: Record<string, number>;
  topRoles: Array<{ role: string; count: number }>;
  landmarks: string[];
  headings: string[];
  namedRoles: string[];
  semanticOutline: Array<{ path: string; kind: "heading" | "landmark"; role: string; text: string; level?: number; depth: number; parentPath?: string; parentRole?: string; parentName?: string; selector?: string }>;
  keyboardItems: Array<{ path: string; role: string; name?: string; shortcuts?: string[]; accessKey?: string; tabIndex?: number; focusable: boolean; selector?: string }>;
  headingItems: Array<{ path: string; text: string; level?: number; selector?: string }>;
  landmarkItems: Array<{ path: string; role: string; name?: string; selector?: string }>;
  namedRoleItems: Array<{ path: string; role: string; name: string; roleDescription?: string; selector?: string }>;
  interactiveRoles: Array<{ path: string; role: string; name: string; roleDescription?: string; description?: string; value?: string; selector?: string; state?: SemanticNodeState }>;
  focusableItems: Array<{ path: string; role: string; name?: string; roleDescription?: string; selector?: string; state?: SemanticNodeState }>;
  links: Array<{ path: string; name: string; url?: string; target?: string; rel?: string[]; type?: string; hreflang?: string; state?: string; current?: SemanticNodeState["current"]; download?: string | true; selector?: string }>;
  inPageLinks: Array<{ path: string; kind: "skip" | "anchor"; name: string; url: string; targetId?: string; selector?: string }>;
  buttons: Array<{ path: string; name: string; roleDescription?: string; description?: string; type?: string; state?: string; disabled?: boolean; pressed?: SemanticNodeState["pressed"]; expanded?: boolean; haspopup?: SemanticNodeState["haspopup"]; controls?: string; formAction?: string; formMethod?: string; formTarget?: string; formEncType?: string; formNoValidate?: boolean; formId?: string; selector?: string }>;
  imageItems: Array<{ path: string; name?: string; url?: string; width?: number; height?: number; loading?: string; decoding?: string; srcset?: string; sizes?: string; selector?: string }>;
  tableItems: Array<{ path: string; role: string; name?: string; rowCount: number; cellCount: number; declaredRowCount?: number; declaredColumnCount?: number; headers?: string[]; headerRefs?: Array<{ path?: string; text: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }>; ownedRefs?: Array<{ target: string; role?: string; name?: string; selector?: string }>; sampleCells?: string[]; sampleCellRefs?: Array<{ path?: string; text: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string; ownedTarget?: string }>; selector?: string }>;
  listItems: Array<{ path: string; role: string; name?: string; itemCount: number; sampleItems?: string[]; itemRefs?: Array<{ text: string; role?: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: SemanticNodeState["current"]; expanded?: boolean; selector?: string }>; selector?: string }>;
  fieldItems: Array<{ path: string; role: string; name?: string; description?: string; value?: string; htmlName?: string; htmlType?: string; placeholder?: string; ariaPlaceholder?: string; autocomplete?: string; ariaAutocomplete?: string; inputMode?: string; pattern?: string; min?: string; max?: string; step?: string; minLength?: number; maxLength?: number; labelledBy?: string; labelledByText?: string; labelledBySelector?: string; describedBy?: string; describedByText?: string; describedBySelector?: string; details?: string; detailsText?: string; detailsSelector?: string; errorMessage?: string; errorMessageText?: string; errorMessageSelector?: string; selector?: string; state?: SemanticNodeState }>;
  descriptionItems: Array<{ path: string; role: string; name?: string; description: string; selector?: string }>;
  valueItems: Array<{ path: string; role: string; name?: string; value: string; selector?: string }>;
  relationItems: Array<{ path: string; role: string; name?: string; relation: "controls" | "owns" | "flowto" | "activeDescendant" | "details" | "errorMessage"; target: string; targetRole?: string; targetName?: string; targetSelector?: string; selector?: string }>;
  choiceItems: Array<{ path: string; role: string; name: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string; state?: SemanticNodeState }>;
  stateItems: Array<{ path: string; role: string; name?: string; state: string; stateRaw?: SemanticNodeState; selector?: string }>;
  unavailableItems: Array<{ path: string; tag: string; role?: string; name?: string; reason: string; selector?: string }>;
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
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
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
  reason?: string;
  reasonCode?: AgentBrowserHtmlReasonCode;
  command?: string;
  commandArgs?: string[];
  afterInteractionCommand?: string;
  afterInteractionCommandArgs?: string[];
};

export type AgentReadTarget = {
  path: string;
  kind?: "verification" | "evidence" | "semantic" | "structured" | "hidden-data" | "interaction" | "barrier" | "navigation" | "code" | "media" | "resource" | "source-search" | "page-check";
  reason: string;
  count?: number;
  score?: number;
  primary?: boolean;
};

export type AgentReadValueScalar = string | number | boolean | null;

export type AgentReadValueKind = "array" | "object" | "string" | "number" | "boolean" | "null";

export type AgentReadValueReference =
  | {
      path: string;
      valuePath: string;
      valueType: "array";
      count: number;
    }
  | {
      path: string;
      valuePath: string;
      valueType: "object";
    };

export type AgentReadValuePayload =
  | AgentReadValueScalar
  | AgentCitation
  | AgentFindMatch
  | AgentTarget
  | AgentSourceSearchResult
  | AgentSemanticSummary
  | AgentPageEvidence
  | AgentPageDataTable
  | AgentPageBarrier
  | AgentPageForm
  | AgentActionTargetChoice
  | AgentPageHydration
  | AgentPageApiEndpoint
  | AgentPageClientState
  | AgentPageRuntime
  | AgentPageConfig
  | AgentPageAppHint
  | AgentPageMobileHint
  | AgentPageTopic
  | AgentPageContactPoint
  | AgentPageKeyValue
  | AgentPageMetaFact
  | AgentPageProvenance
  | AgentPageHttpPolicy
  | AgentPageSchemaFact
  | AgentPageOffer
  | AgentPageIdentity
  | AgentPageDataset
  | AgentPageTimeline
  | AgentPageFaq
  | AgentPageBreadcrumb
  | AgentPageSection
  | AgentPagePagination
  | AgentPageToc
  | AgentPageCodeBlock
  | AgentPageCitation
  | AgentPageMedia
  | AgentPageResource
  | AgentPageEmbed
  | AgentPageTranscript
  | AgentPageAuthorLink;

export type AgentReadValueInline = {
  path: string;
  value: AgentReadValuePayload | AgentReadValuePayload[];
};

export type AgentReadValue = AgentReadValueInline | AgentReadValueReference;

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
  host?: string;
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
  dateIso?: string;
  dateUnixMs?: number;
  datePrecision?: "day" | "month" | "year";
  dateSource?: "title" | "snippet";
  sitelinks?: Array<{ title: string; url: string; selector?: string; command?: string; commandArgs?: string[] }>;
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

export type AgentFormHiddenField = {
  name?: string;
  value?: string;
  selector?: string;
};

export type AgentFormField = {
  name?: string;
  type: string;
  label?: string;
  placeholder?: string;
  value?: string;
  autocomplete?: string;
  inputMode?: string;
  pattern?: string;
  min?: string;
  max?: string;
  step?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  checked?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  invalid?: SemanticNodeState["invalid"];
  selector?: string;
  options?: string[];
  selectedOption?: string;
  selectedValue?: string;
};

export type AgentPageForm = {
  id?: string;
  path?: string;
  rank: number;
  method: string;
  fieldCount: number;
  hiddenFieldCount: number;
  text?: string;
  actionUrl?: string;
  formId?: string;
  formName?: string;
  formTarget?: string;
  formEncType?: string;
  formAcceptCharset?: string;
  formNoValidate?: boolean;
  submitText?: string;
  submitType?: string;
  submitName?: string;
  submitValue?: string;
  submitDisabled?: boolean;
  submitSelector?: string;
  submitFormActionUrl?: string;
  submitFormMethod?: string;
  submitFormTarget?: string;
  submitFormEncType?: string;
  submitFormNoValidate?: boolean;
  submitFormId?: string;
  queryField?: string;
  urlTemplate?: string;
  selector?: string;
  hiddenFields?: AgentFormHiddenField[];
  fields: AgentFormField[];
};

export type AgentFormChoice = AgentPageForm & {
  id: string;
  path: string;
  text: string;
  formAcceptCharset?: string;
  hiddenFields: AgentFormHiddenField[];
  command?: string;
  commandArgs?: string[];
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
  disabled?: boolean;
  pressed?: SemanticNodeState["pressed"];
  expanded?: boolean;
  haspopup?: SemanticNodeState["haspopup"];
  controls?: string;
  selector?: string;
  command?: string;
  commandArgs?: string[];
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
  pageDir?: string;
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
  runbookReadTargetKind?: AgentReadTarget["kind"];
  runbookReadTargetCount?: number;
  runbookReadTargetScore?: number;
  runbookReadTargetPrimary?: boolean;
  runbookReadTargetReason?: string;
  runbookReadValuePath?: string;
  runbookReadValueType?: AgentReadValueKind;
  runbookReadValueCount?: number;
  runbookReadValueReferencePath?: string;
  runbookCommand?: string;
  runbookCommandArgs?: string[];
  runbookUrl?: string;
  nextActionName?: string;
  nextExecution?: AgentExecutionMode;
  nextCommand?: string;
  nextCommandArgs?: string[];
  nextAfterInteractionCommand?: string;
  nextAfterInteractionCommandArgs?: string[];
  nextReadFrom?: string;
  nextReadTargetKind?: AgentReadTarget["kind"];
  nextReadTargetCount?: number;
  nextReadTargetScore?: number;
  nextReadTargetPrimary?: boolean;
  nextReadTargetReason?: string;
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
  executionPlanReadTargetKind?: AgentReadTarget["kind"];
  executionPlanReadTargetCount?: number;
  executionPlanReadTargetScore?: number;
  executionPlanReadTargetPrimary?: boolean;
  executionPlanReadTargetReason?: string;
  executionPlanCommand?: string;
  executionPlanCommandArgs?: string[];
  executionPlanAfterInteractionCommand?: string;
  executionPlanAfterInteractionCommandArgs?: string[];
  executionPlanUrl?: string;
  answerPlan?: AgentAnswerPlan;
  searchDecision?: AgentSearchDecision;
  pageDecision?: AgentPageDecision;
  searchDecisionName?: string;
  searchDecisionConfidence?: "low" | "medium" | "high";
  searchDecisionReason?: string;
  searchDecisionResultCount?: number;
  searchDecisionHighRelevanceCount?: number;
  searchDecisionMediumRelevanceCount?: number;
  searchDecisionLowRelevanceCount?: number;
  searchDecisionOfficialCount?: number;
  searchDecisionFindMatchCount?: number;
  searchDecisionRecommendedRank?: number;
  searchDecisionRecommendedPath?: string;
  searchDecisionRecommendedTitle?: string;
  searchDecisionRecommendedUrl?: string;
  searchDecisionRecommendedSource?: string;
  searchDecisionRecommendedSourceScore?: number;
  searchDecisionRecommendedSourceType?: AgentTarget["sourceType"];
  searchDecisionRecommendedSourceHints?: string[];
  searchDecisionRecommendedDateText?: string;
  searchDecisionRecommendedDateIso?: string;
  searchDecisionRecommendedDateUnixMs?: number;
  searchDecisionRecommendedDatePrecision?: "day" | "month" | "year";
  searchDecisionRecommendedDateSource?: "title" | "snippet";
  searchDecisionRecommendedRelevance?: "low" | "medium" | "high";
  searchDecisionRecommendedLikelyOfficial?: boolean;
  searchDecisionFirstOfficialRank?: number;
  searchDecisionFirstOfficialPath?: string;
  searchDecisionFirstOfficialTitle?: string;
  searchDecisionFirstOfficialUrl?: string;
  searchDecisionFirstOfficialSource?: string;
  searchDecisionFirstOfficialSourceScore?: number;
  searchDecisionFirstOfficialSourceType?: AgentTarget["sourceType"];
  searchDecisionFirstOfficialSourceHints?: string[];
  searchDecisionFirstOfficialDateText?: string;
  searchDecisionFirstOfficialDateIso?: string;
  searchDecisionFirstOfficialDateUnixMs?: number;
  searchDecisionFirstOfficialDatePrecision?: "day" | "month" | "year";
  searchDecisionFirstOfficialDateSource?: "title" | "snippet";
  searchDecisionFirstOfficialRelevance?: "low" | "medium" | "high";
  searchDecisionFirstOfficialCommand?: string;
  searchDecisionFirstOfficialCommandArgs?: string[];
  searchDecisionCommand?: string;
  searchDecisionCommandArgs?: string[];
  pageDecisionName?: string;
  pageDecisionConfidence?: "low" | "medium" | "high";
  pageDecisionReason?: string;
  pageDecisionReadability?: "low" | "medium" | "high";
  pageDecisionReadabilityScore?: number;
  pageDecisionEvidenceCount?: number;
  pageDecisionEvidenceQualityScore?: number;
  pageDecisionSourceLinkCount?: number;
  pageDecisionSourceQualityScore?: number;
  pageDecisionReadFrom?: string;
  pageDecisionReadTargetKind?: AgentReadTarget["kind"];
  pageDecisionReadTargetCount?: number;
  pageDecisionReadTargetScore?: number;
  pageDecisionReadTargetPrimary?: boolean;
  pageDecisionReadTargetReason?: string;
  pageDecisionUrl?: string;
  pageDecisionCommand?: string;
  pageDecisionCommandArgs?: string[];
  semanticSummary?: AgentSemanticSummary;
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
  semanticTopAriaKeyShortcutPath?: string;
  semanticTopAriaKeyShortcutRole?: string;
  semanticTopAriaKeyShortcutName?: string;
  semanticTopAriaKeyShortcutKeys?: string[];
  semanticTopAriaKeyShortcutTabIndex?: number;
  semanticTopAriaKeyShortcutFocusable?: boolean;
  semanticTopAriaKeyShortcutSelector?: string;
  semanticTopHeading?: string;
  semanticTopHeadingPath?: string;
  semanticTopHeadingLevel?: number;
  semanticTopHeadingSelector?: string;
  semanticTopLandmark?: string;
  semanticTopLandmarkPath?: string;
  semanticTopLandmarkRole?: string;
  semanticTopLandmarkName?: string;
  semanticTopLandmarkSelector?: string;
  semanticTopNamedRole?: string;
  semanticTopNamedRolePath?: string;
  semanticTopNamedRoleRole?: string;
  semanticTopNamedRoleName?: string;
  semanticTopNamedRoleDescription?: string;
  semanticTopNamedRoleSelector?: string;
  semanticTopInteractiveRole?: string;
  semanticTopInteractivePath?: string;
  semanticTopInteractiveName?: string;
  semanticTopInteractiveRoleDescription?: string;
  semanticTopInteractiveDescription?: string;
  semanticTopInteractiveValue?: string;
  semanticTopInteractiveState?: string;
  semanticTopInteractiveDisabled?: boolean;
  semanticTopInteractivePressed?: SemanticNodeState["pressed"];
  semanticTopInteractiveExpanded?: boolean;
  semanticTopInteractiveHaspopup?: SemanticNodeState["haspopup"];
  semanticTopInteractiveControls?: string;
  semanticTopInteractiveControlsTargetRole?: string;
  semanticTopInteractiveControlsTargetName?: string;
  semanticTopInteractiveControlsTargetSelector?: string;
  semanticTopInteractiveSelector?: string;
  semanticTopFocusableRole?: string;
  semanticTopFocusablePath?: string;
  semanticTopFocusableName?: string;
  semanticTopFocusableRoleDescription?: string;
  semanticTopFocusableState?: string;
  semanticTopFocusableDisabled?: boolean;
  semanticTopFocusablePressed?: SemanticNodeState["pressed"];
  semanticTopFocusableExpanded?: boolean;
  semanticTopFocusableHaspopup?: SemanticNodeState["haspopup"];
  semanticTopFocusableControls?: string;
  semanticTopFocusableControlsTargetRole?: string;
  semanticTopFocusableControlsTargetName?: string;
  semanticTopFocusableControlsTargetSelector?: string;
  semanticTopFocusableSelector?: string;
  semanticTopLinkName?: string;
  semanticTopLinkPath?: string;
  semanticTopLinkUrl?: string;
  semanticTopLinkTarget?: string;
  semanticTopLinkRel?: string[];
  semanticTopLinkType?: string;
  semanticTopLinkHreflang?: string;
  semanticTopLinkState?: string;
  semanticTopLinkCurrent?: SemanticNodeState["current"];
  semanticTopLinkDownload?: string | true;
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
  semanticTopButtonRoleDescription?: string;
  semanticTopButtonDescription?: string;
  semanticTopButtonType?: string;
  semanticTopButtonState?: string;
  semanticTopButtonDisabled?: boolean;
  semanticTopButtonPressed?: SemanticNodeState["pressed"];
  semanticTopButtonExpanded?: boolean;
  semanticTopButtonHaspopup?: SemanticNodeState["haspopup"];
  semanticTopButtonControls?: string;
  semanticTopButtonControlsTargetRole?: string;
  semanticTopButtonControlsTargetName?: string;
  semanticTopButtonControlsTargetSelector?: string;
  semanticTopButtonFormAction?: string;
  semanticTopButtonFormMethod?: string;
  semanticTopButtonFormTarget?: string;
  semanticTopButtonFormEncType?: string;
  semanticTopButtonFormNoValidate?: boolean;
  semanticTopButtonFormId?: string;
  semanticTopButtonSelector?: string;
  semanticTopImagePath?: string;
  semanticTopImageName?: string;
  semanticTopImageUrl?: string;
  semanticTopImageWidth?: number;
  semanticTopImageHeight?: number;
  semanticTopImageLoading?: string;
  semanticTopImageDecoding?: string;
  semanticTopImageSrcset?: string;
  semanticTopImageSizes?: string;
  semanticTopImageSelector?: string;
  semanticTopTableRole?: string;
  semanticTopTablePath?: string;
  semanticTopTableName?: string;
  semanticTopTableRowCount?: number;
  semanticTopTableColumnCount?: number;
  semanticTopTableCellCount?: number;
  semanticTopTableDeclaredRowCount?: number;
  semanticTopTableDeclaredColumnCount?: number;
  semanticTopTableHeaders?: string[];
  semanticTopTableHeaderRefs?: Array<{ path?: string; text: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }>;
  semanticTopTableOwnedCount?: number;
  semanticTopTableOwnedRefs?: Array<{ target: string; role?: string; name?: string; selector?: string }>;
  semanticTopTableSampleCells?: string[];
  semanticTopTableSampleCellRefs?: Array<{ path?: string; text: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string; ownedTarget?: string }>;
  semanticTopTableFirstHeader?: string;
  semanticTopTableFirstHeaderPath?: string;
  semanticTopTableFirstHeaderRole?: string;
  semanticTopTableFirstHeaderRowIndex?: number;
  semanticTopTableFirstHeaderColumnIndex?: number;
  semanticTopTableFirstHeaderSort?: string;
  semanticTopTableFirstHeaderSelector?: string;
  semanticTopTableSecondHeader?: string;
  semanticTopTableSecondHeaderPath?: string;
  semanticTopTableSecondHeaderRole?: string;
  semanticTopTableSecondHeaderRowIndex?: number;
  semanticTopTableSecondHeaderColumnIndex?: number;
  semanticTopTableSecondHeaderSort?: string;
  semanticTopTableSecondHeaderSelector?: string;
  semanticTopTableFirstOwnedTarget?: string;
  semanticTopTableFirstOwnedRole?: string;
  semanticTopTableFirstOwnedName?: string;
  semanticTopTableFirstOwnedSelector?: string;
  semanticTopTableFirstSampleCellPath?: string;
  semanticTopTableFirstSampleCellText?: string;
  semanticTopTableFirstSampleCellRowIndex?: number;
  semanticTopTableFirstSampleCellColumnIndex?: number;
  semanticTopTableFirstSampleCellRowSpan?: number;
  semanticTopTableFirstSampleCellColumnSpan?: number;
  semanticTopTableFirstSampleCellHeaders?: string[];
  semanticTopTableFirstSampleCellRowHeaders?: string[];
  semanticTopTableFirstSampleCellColumnHeaders?: string[];
  semanticTopTableFirstSampleCellSelected?: boolean;
  semanticTopTableFirstSampleCellCurrent?: SemanticNodeState["current"];
  semanticTopTableFirstSampleCellSelector?: string;
  semanticTopTableFirstSampleCellOwnedTarget?: string;
  semanticTopTableSecondSampleCellPath?: string;
  semanticTopTableSecondSampleCellText?: string;
  semanticTopTableSecondSampleCellRowIndex?: number;
  semanticTopTableSecondSampleCellColumnIndex?: number;
  semanticTopTableSecondSampleCellRowSpan?: number;
  semanticTopTableSecondSampleCellColumnSpan?: number;
  semanticTopTableSecondSampleCellHeaders?: string[];
  semanticTopTableSecondSampleCellRowHeaders?: string[];
  semanticTopTableSecondSampleCellColumnHeaders?: string[];
  semanticTopTableSecondSampleCellSelected?: boolean;
  semanticTopTableSecondSampleCellCurrent?: SemanticNodeState["current"];
  semanticTopTableSecondSampleCellSelector?: string;
  semanticTopTableSecondSampleCellOwnedTarget?: string;
  semanticTopTableFirstOwnedSampleCellPath?: string;
  semanticTopTableFirstOwnedSampleCellText?: string;
  semanticTopTableFirstOwnedSampleCellRowIndex?: number;
  semanticTopTableFirstOwnedSampleCellColumnIndex?: number;
  semanticTopTableFirstOwnedSampleCellRowSpan?: number;
  semanticTopTableFirstOwnedSampleCellColumnSpan?: number;
  semanticTopTableFirstOwnedSampleCellHeaders?: string[];
  semanticTopTableFirstOwnedSampleCellRowHeaders?: string[];
  semanticTopTableFirstOwnedSampleCellColumnHeaders?: string[];
  semanticTopTableFirstOwnedSampleCellSelected?: boolean;
  semanticTopTableFirstOwnedSampleCellCurrent?: SemanticNodeState["current"];
  semanticTopTableFirstOwnedSampleCellSelector?: string;
  semanticTopTableFirstOwnedSampleCellOwnedTarget?: string;
  semanticTopSelectedTableCellPath?: string;
  semanticTopSelectedTableCellText?: string;
  semanticTopSelectedTableCellRowIndex?: number;
  semanticTopSelectedTableCellColumnIndex?: number;
  semanticTopSelectedTableCellRowSpan?: number;
  semanticTopSelectedTableCellColumnSpan?: number;
  semanticTopSelectedTableCellHeaders?: string[];
  semanticTopSelectedTableCellRowHeaders?: string[];
  semanticTopSelectedTableCellColumnHeaders?: string[];
  semanticTopSelectedTableCellSelected?: boolean;
  semanticTopSelectedTableCellCurrent?: SemanticNodeState["current"];
  semanticTopSelectedTableCellSelector?: string;
  semanticTopSelectedTableCellOwnedTarget?: string;
  semanticTopTableSelector?: string;
  semanticTopListRole?: string;
  semanticTopListPath?: string;
  semanticTopListName?: string;
  semanticTopListItemCount?: number;
  semanticTopListItems?: string[];
  semanticTopListItemRefs?: Array<{ text: string; role?: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: SemanticNodeState["current"]; expanded?: boolean; selector?: string }>;
  semanticTopListFirstItemText?: string;
  semanticTopListFirstItemRole?: string;
  semanticTopListFirstItemLevel?: number;
  semanticTopListFirstItemPosInSet?: number;
  semanticTopListFirstItemSetSize?: number;
  semanticTopListFirstItemSelected?: boolean;
  semanticTopListFirstItemCurrent?: SemanticNodeState["current"];
  semanticTopListFirstItemExpanded?: boolean;
  semanticTopListFirstItemSelector?: string;
  semanticTopListSelector?: string;
  semanticTopFieldRole?: string;
  semanticTopFieldPath?: string;
  semanticTopFieldName?: string;
  semanticTopFieldDescription?: string;
  semanticTopFieldValue?: string;
  semanticTopFieldHtmlName?: string;
  semanticTopFieldHtmlType?: string;
  semanticTopFieldPlaceholder?: string;
  semanticTopFieldAriaPlaceholder?: string;
  semanticTopFieldAutocomplete?: string;
  semanticTopFieldAriaAutocomplete?: string;
  semanticTopFieldInputMode?: string;
  semanticTopFieldPattern?: string;
  semanticTopFieldMin?: string;
  semanticTopFieldMax?: string;
  semanticTopFieldStep?: string;
  semanticTopFieldMinLength?: number;
  semanticTopFieldMaxLength?: number;
  semanticTopFieldLabelledBy?: string;
  semanticTopFieldLabelledByText?: string;
  semanticTopFieldLabelledBySelector?: string;
  semanticTopFieldDescribedBy?: string;
  semanticTopFieldDescribedByText?: string;
  semanticTopFieldDescribedBySelector?: string;
  semanticTopFieldDetails?: string;
  semanticTopFieldDetailsText?: string;
  semanticTopFieldDetailsSelector?: string;
  semanticTopFieldErrorMessage?: string;
  semanticTopFieldErrorMessageText?: string;
  semanticTopFieldErrorMessageSelector?: string;
  semanticTopFieldState?: string;
  semanticTopFieldDisabled?: boolean;
  semanticTopFieldRequired?: boolean;
  semanticTopFieldReadonly?: boolean;
  semanticTopFieldInvalid?: boolean | string;
  semanticTopFieldChecked?: SemanticNodeState["checked"];
  semanticTopFieldExpanded?: boolean;
  semanticTopFieldHaspopup?: SemanticNodeState["haspopup"];
  semanticTopFieldControls?: string;
  semanticTopFieldControlsTargetRole?: string;
  semanticTopFieldControlsTargetName?: string;
  semanticTopFieldControlsTargetSelector?: string;
  semanticTopFieldValueMin?: number;
  semanticTopFieldValueMax?: number;
  semanticTopFieldValueNow?: number;
  semanticTopFieldValueText?: string;
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
  semanticTopChoiceCurrent?: SemanticNodeState["current"];
  semanticTopChoiceLevel?: number;
  semanticTopChoicePosInSet?: number;
  semanticTopChoiceSetSize?: number;
  semanticTopChoiceSelector?: string;
  semanticTopSelectedChoiceRole?: string;
  semanticTopSelectedChoicePath?: string;
  semanticTopSelectedChoiceName?: string;
  semanticTopSelectedChoiceState?: string;
  semanticTopSelectedChoiceSelected?: boolean;
  semanticTopSelectedChoiceCurrent?: SemanticNodeState["current"];
  semanticTopSelectedChoiceLevel?: number;
  semanticTopSelectedChoicePosInSet?: number;
  semanticTopSelectedChoiceSetSize?: number;
  semanticTopSelectedChoiceControls?: string;
  semanticTopSelectedChoiceControlsTargetRole?: string;
  semanticTopSelectedChoiceControlsTargetName?: string;
  semanticTopSelectedChoiceControlsTargetSelector?: string;
  semanticTopSelectedChoiceSelector?: string;
  semanticTopStateRole?: string;
  semanticTopStatePath?: string;
  semanticTopStateName?: string;
  semanticTopState?: string;
  semanticTopStateHidden?: boolean;
  semanticTopStateDisabled?: boolean;
  semanticTopStateBusy?: boolean;
  semanticTopStateMultiselectable?: boolean;
  semanticTopStateSort?: string;
  semanticTopStateGrabbed?: boolean;
  semanticTopStateDropEffect?: string;
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
  semanticTopStateControlsTargetRole?: string;
  semanticTopStateControlsTargetName?: string;
  semanticTopStateControlsTargetSelector?: string;
  semanticTopStateLive?: string;
  semanticTopStateModal?: boolean;
  semanticTopStateOrientation?: string;
  semanticTopStateValueMin?: number;
  semanticTopStateValueMax?: number;
  semanticTopStateValueNow?: number;
  semanticTopStateValueText?: string;
  semanticTopStateSelector?: string;
  semanticTopModalStateRole?: string;
  semanticTopModalStatePath?: string;
  semanticTopModalStateName?: string;
  semanticTopModalState?: string;
  semanticTopModalStateSelector?: string;
  semanticTopLiveStateRole?: string;
  semanticTopLiveStatePath?: string;
  semanticTopLiveStateName?: string;
  semanticTopLiveState?: string;
  semanticTopLiveStateLive?: string;
  semanticTopLiveStateSelector?: string;
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
  needsBrowserInteraction: boolean;
  staticReadiness?: AgentStaticReadiness;
  staticReadinessReasonCode?: AgentStaticReadinessReasonCode;
  staticReadinessReason?: string;
  staticReadinessReadFrom?: string;
  staticReadinessReadTargetKind?: AgentReadTarget["kind"];
  staticReadinessReadTargetCount?: number;
  staticReadinessReadTargetScore?: number;
  staticReadinessReadTargetPrimary?: boolean;
  staticReadinessReadTargetReason?: string;
  browserHtmlReason?: string;
  browserHtmlReasonCode?: AgentBrowserHtmlReasonCode;
  browserHtmlActionName?: string;
  browserHtmlOperation?: AgentExecutionPlan["operation"];
  browserHtmlUrl?: string;
  browserHtmlFile?: AgentBrowserHtmlCapture["htmlFile"];
  browserHtmlCaptureScript?: AgentBrowserHtmlCapture["captureScript"];
  browserHtmlCommand?: string;
  browserHtmlCommandArgs?: string[];
  browserHtmlAfterInteractionCommand?: string;
  browserHtmlAfterInteractionCommandArgs?: string[];
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
  topResultChoiceHost?: string;
  topResultChoiceSnippet?: string;
  topResultChoiceCommand?: string;
  topResultChoiceCommandArgs?: string[];
  topResultChoiceRank?: number;
  topResultChoiceOpenResult?: number | "best";
  topResultChoiceRecommended?: boolean;
  topResultChoicePrimary?: boolean;
  topResultChoiceSourceType?: string;
  topResultChoiceSourceScore?: number;
  topResultChoiceSourceHints?: string[];
  topResultChoiceDateText?: string;
  topResultChoiceDateIso?: string;
  topResultChoiceDateUnixMs?: number;
  topResultChoiceDatePrecision?: "day" | "month" | "year";
  topResultChoiceDateSource?: "title" | "snippet";
  topResultChoiceRelevance?: "low" | "medium" | "high";
  topResultChoiceMatchedTerm?: string;
  topResultChoiceFindMatch?: string;
  topResultChoiceLikelyOfficial?: boolean;
  topResultChoiceSitelinkCount?: number;
  topResultChoiceFirstSitelinkTitle?: string;
  topResultChoiceFirstSitelinkUrl?: string;
  topResultChoiceFirstSitelinkSelector?: string;
  topResultChoiceFirstSitelinkCommand?: string;
  topResultChoiceFirstSitelinkCommandArgs?: string[];
  topResultChoiceReason?: string;
  evidenceCount?: number;
  formCount?: number;
  formChoiceCount?: number;
  formChoices?: AgentFormChoice[];
  topFormChoicePath?: string;
  topFormChoiceMethod?: string;
  topFormChoiceActionUrl?: string;
  topFormChoiceFormId?: string;
  topFormChoiceFormName?: string;
  topFormChoiceFormTarget?: string;
  topFormChoiceFormEncType?: string;
  topFormChoiceFormAcceptCharset?: string;
  topFormChoiceFormNoValidate?: boolean;
  topFormChoiceSubmitText?: string;
  topFormChoiceSubmitType?: string;
  topFormChoiceSubmitName?: string;
  topFormChoiceSubmitValue?: string;
  topFormChoiceSubmitDisabled?: boolean;
  topFormChoiceSubmitSelector?: string;
  topFormChoiceSubmitFormActionUrl?: string;
  topFormChoiceSubmitFormMethod?: string;
  topFormChoiceSubmitFormTarget?: string;
  topFormChoiceSubmitFormEncType?: string;
  topFormChoiceSubmitFormNoValidate?: boolean;
  topFormChoiceSubmitFormId?: string;
  topFormChoiceQueryField?: string;
  topFormChoiceUrlTemplate?: string;
  topFormChoiceCommand?: string;
  topFormChoiceCommandArgs?: string[];
  topFormChoiceFieldCount?: number;
  topFormChoiceHiddenFieldCount?: number;
  topFormChoiceSelector?: string;
  topFormChoiceFirstHiddenFieldName?: string;
  topFormChoiceFirstHiddenFieldValue?: string;
  topFormChoiceFirstHiddenFieldSelector?: string;
  topFormChoiceFirstFieldName?: string;
  topFormChoiceFirstFieldType?: string;
  topFormChoiceFirstFieldLabel?: string;
  topFormChoiceFirstFieldPlaceholder?: string;
  topFormChoiceFirstFieldValue?: string;
  topFormChoiceFirstFieldOptions?: string[];
  topFormChoiceFirstFieldSelectedOption?: string;
  topFormChoiceFirstFieldSelectedValue?: string;
  topFormChoiceFirstFieldAutocomplete?: string;
  topFormChoiceFirstFieldInputMode?: string;
  topFormChoiceFirstFieldPattern?: string;
  topFormChoiceFirstFieldMin?: string;
  topFormChoiceFirstFieldMax?: string;
  topFormChoiceFirstFieldStep?: string;
  topFormChoiceFirstFieldMinLength?: number;
  topFormChoiceFirstFieldMaxLength?: number;
  topFormChoiceFirstFieldRequired?: boolean;
  topFormChoiceFirstFieldChecked?: boolean;
  topFormChoiceFirstFieldDisabled?: boolean;
  topFormChoiceFirstFieldReadonly?: boolean;
  topFormChoiceFirstFieldInvalid?: SemanticNodeState["invalid"];
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
  topActionTargetChoiceEncodingType?: string;
  topActionTargetChoiceCommand?: string;
  topActionTargetChoiceCommandArgs?: string[];
  topActionTargetChoiceDisabled?: boolean;
  topActionTargetChoicePressed?: SemanticNodeState["pressed"];
  topActionTargetChoiceExpanded?: boolean;
  topActionTargetChoiceHaspopup?: SemanticNodeState["haspopup"];
  topActionTargetChoiceControls?: string;
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
  topDataTableHeaderCount?: number;
  topDataTableFirstHeader?: string;
  topDataTableFirstRow?: string[];
  topDataTableFirstCell?: string;
  topDataTableSelector?: string;
  topFaqPath?: string;
  topFaqQuestion?: string;
  topFaqAnswer?: string;
  topFaqSelector?: string;
  topCodeBlockPath?: string;
  topCodeBlockLanguage?: string;
  topCodeBlockLineCount?: number;
  topCodeBlockText?: string;
  topCodeBlockSelector?: string;
  topResourcePath?: string;
  topResourceKind?: string;
  topResourceUrl?: string;
  topResourceTitle?: string;
  topResourceSelector?: string;
  topResourceCommand?: string;
  topResourceCommandArgs?: string[];
  topMediaPath?: string;
  topMediaKind?: string;
  topMediaUrl?: string;
  topMediaSelector?: string;
  topMediaCommand?: string;
  topMediaCommandArgs?: string[];
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
  topPaginationCommand?: string;
  topPaginationCommandArgs?: string[];
  topPaginationCurrent?: boolean;
  topPaginationSelector?: string;
  topTocPath?: string;
  topTocTitle?: string;
  topTocItemCount?: number;
  topTocText?: string;
  topTocFirstItemLabel?: string;
  topTocFirstItemUrl?: string;
  topTocFirstItemCommand?: string;
  topTocFirstItemCommandArgs?: string[];
  topTocSelector?: string;
  topEmbedPath?: string;
  topEmbedKind?: string;
  topEmbedUrl?: string;
  topEmbedTitle?: string;
  topEmbedSelector?: string;
  topEmbedCommand?: string;
  topEmbedCommandArgs?: string[];
  topTranscriptPath?: string;
  topTranscriptKind?: string;
  topTranscriptUrl?: string;
  topTranscriptLabel?: string;
  topTranscriptLanguage?: string;
  topTranscriptSelector?: string;
  topTranscriptCommand?: string;
  topTranscriptCommandArgs?: string[];
  topAuthorLinkPath?: string;
  topAuthorLinkName?: string;
  topAuthorLinkUrl?: string;
  topAuthorLinkSource?: string;
  topAuthorLinkSelector?: string;
  topAuthorLinkCommand?: string;
  topAuthorLinkCommandArgs?: string[];
  topProvenancePath?: string;
  topProvenanceKind?: string;
  topProvenanceLabel?: string;
  topProvenanceValue?: string;
  topProvenanceUrl?: string;
  topProvenanceSource?: string;
  topProvenanceSelector?: string;
  topProvenanceCommand?: string;
  topProvenanceCommandArgs?: string[];
  topOfferPath?: string;
  topOfferName?: string;
  topOfferPrice?: string;
  topOfferPriceAmount?: number;
  topOfferCurrency?: string;
  topOfferAvailability?: string;
  topOfferUrl?: string;
  topOfferCommand?: string;
  topOfferCommandArgs?: string[];
  topOfferSelector?: string;
  topDatasetPath?: string;
  topDatasetKind?: string;
  topDatasetName?: string;
  topDatasetUrl?: string;
  topDatasetCommand?: string;
  topDatasetCommandArgs?: string[];
  topDatasetDistributionUrl?: string;
  topDatasetDistributionCommand?: string;
  topDatasetDistributionCommandArgs?: string[];
  topDatasetLicenseUrl?: string;
  topDatasetLicenseCommand?: string;
  topDatasetLicenseCommandArgs?: string[];
  topDatasetEncodingFormat?: string;
  topDatasetTemporalCoverage?: string;
  topDatasetSpatialCoverage?: string;
  topDatasetCreator?: string;
  topDatasetSelector?: string;
  topIdentityPath?: string;
  topIdentityKind?: string;
  topIdentityName?: string;
  topIdentityUrl?: string;
  topIdentityCommand?: string;
  topIdentityCommandArgs?: string[];
  topIdentityLogoUrl?: string;
  topIdentityLogoCommand?: string;
  topIdentityLogoCommandArgs?: string[];
  topIdentitySameAsUrl?: string;
  topIdentitySameAsCommand?: string;
  topIdentitySameAsCommandArgs?: string[];
  topIdentitySource?: string;
  topIdentitySelector?: string;
  topTimelinePath?: string;
  topTimelineKind?: string;
  topTimelineLabel?: string;
  topTimelineValue?: string;
  topTimelineIsoDate?: string;
  topTimelineUnixMs?: number;
  topTimelineSource?: string;
  topTimelineSelector?: string;
  topContactPointPath?: string;
  topContactPointKind?: string;
  topContactPointLabel?: string;
  topContactPointValue?: string;
  topContactPointUrl?: string;
  topContactPointCommand?: string;
  topContactPointCommandArgs?: string[];
  topContactPointSource?: string;
  topContactPointSelector?: string;
  structuredReadTargetCount?: number;
  bestStructuredReadTarget?: string;
  bestStructuredReadTargetCount?: number;
  bestStructuredReadTargetScore?: number;
  bestStructuredReadTargetPrimary?: boolean;
  bestStructuredReadTargetReason?: string;
  hiddenSignalCount?: number;
  hiddenHydrationCount?: number;
  hiddenApiEndpointCount?: number;
  hiddenClientStateCount?: number;
  hiddenAppHintCount?: number;
  topHydrationPath?: string;
  topHydrationKind?: string;
  topHydrationLabel?: string;
  topHydrationUrl?: string;
  topHydrationCommand?: string;
  topHydrationCommandArgs?: string[];
  topHydrationSelector?: string;
  topApiEndpointPath?: string;
  topApiEndpointKind?: string;
  topApiEndpointMethod?: string;
  topApiEndpointUrl?: string;
  topApiEndpointCommand?: string;
  topApiEndpointCommandArgs?: string[];
  topApiEndpointSelector?: string;
  topClientStatePath?: string;
  topClientStateKind?: string;
  topClientStateOperation?: string;
  topClientStateKey?: string;
  topClientStateSelector?: string;
  topAppHintPath?: string;
  topAppHintKind?: string;
  topAppHintLabel?: string;
  topAppHintUrl?: string;
  topAppHintCommand?: string;
  topAppHintCommandArgs?: string[];
  topAppHintSelector?: string;
  topHiddenSignalGroup?: string;
  topHiddenSignalPath?: string;
  topHiddenSignalKind?: string;
  topHiddenSignalText?: string;
  topHiddenSignalUrl?: string;
  topHiddenSignalSource?: string;
  topHiddenSignalSelector?: string;
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
  topSourceChoiceHost?: string;
  topSourceChoiceKind?: "internal" | "external";
  topSourceChoiceRank?: number;
  topSourceChoiceText?: string;
  topSourceChoiceSnippet?: string;
  topSourceChoiceDateText?: string;
  topSourceChoiceDateIso?: string;
  topSourceChoiceDateUnixMs?: number;
  topSourceChoiceDatePrecision?: "day" | "month" | "year";
  topSourceChoiceDateSource?: "title" | "snippet";
  topSourceChoiceCommand?: string;
  topSourceChoiceCommandArgs?: string[];
  topSourceChoiceSourceType?: string;
  topSourceChoiceSourceScore?: number;
  topSourceChoiceSourceHints?: string[];
  topSourceChoiceRelevance?: "low" | "medium" | "high";
  topSourceChoiceMatchedTerm?: string;
  topSourceChoiceFindMatch?: string;
  topSourceChoiceLikelyOfficial?: boolean;
  topSourceChoicePrimary?: boolean;
  topSourceChoiceSelector?: string;
  topSourceChoiceReason?: string;
  topChoiceKind?: "result" | "source" | "form" | "action-target";
  topChoicePath?: string;
  topChoiceLabel?: string;
  topChoiceUrl?: string;
  topChoiceActionUrl?: string;
  topChoiceTargetUrl?: string;
  topChoiceUrlTemplate?: string;
  topChoiceQueryField?: string;
  topChoiceQueryInput?: string;
  topChoiceHost?: string;
  topChoiceSnippet?: string;
  topChoiceDateText?: string;
  topChoiceDateIso?: string;
  topChoiceDateUnixMs?: number;
  topChoiceDatePrecision?: "day" | "month" | "year";
  topChoiceDateSource?: "title" | "snippet";
  topChoiceCommand?: string;
  topChoiceCommandArgs?: string[];
  topChoiceFirstSitelinkTitle?: string;
  topChoiceFirstSitelinkUrl?: string;
  topChoiceFirstSitelinkSelector?: string;
  topChoiceFirstSitelinkCommand?: string;
  topChoiceFirstSitelinkCommandArgs?: string[];
  topChoiceRank?: number;
  topChoiceOpenResult?: number | "best";
  topChoiceRecommended?: boolean;
  topChoicePrimary?: boolean;
  topChoiceSource?: string;
  topChoiceSourceType?: string;
  topChoiceSourceScore?: number;
  topChoiceSourceHints?: string[];
  topChoiceRelevance?: AgentTarget["relevance"];
  topChoiceMatchedTerm?: string;
  topChoiceFindMatch?: string;
  topChoiceSitelinkCount?: number;
  topChoiceLikelyOfficial?: boolean;
  topChoiceMethod?: string;
  topChoiceEncodingType?: string;
  topChoiceSubmitDisabled?: boolean;
  topChoiceDisabled?: boolean;
  topChoicePressed?: SemanticNodeState["pressed"];
  topChoiceExpanded?: boolean;
  topChoiceHaspopup?: SemanticNodeState["haspopup"];
  topChoiceControls?: string;
  topChoiceSelector?: string;
  topChoiceReason?: string;
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
  sourceSearchSelectedHost?: string;
  sourceSearchSelectedSource?: string;
  sourceSearchSelectedSourceType?: AgentSourceSearchResult["sourceType"];
  sourceSearchSelectedSourceHints?: string[];
  sourceSearchSelectedPath?: string;
  sourceSearchSelectedSnippet?: string;
  sourceSearchSelectedDateText?: string;
  sourceSearchSelectedDateIso?: string;
  sourceSearchSelectedDateUnixMs?: number;
  sourceSearchSelectedDatePrecision?: AgentSourceSearchResult["datePrecision"];
  sourceSearchSelectedDateSource?: AgentSourceSearchResult["dateSource"];
  sourceSearchSelectedMatchedTerm?: string;
  sourceSearchSelectedFindMatch?: string;
  sourceSearchSelectedSitelinkCount?: number;
  sourceSearchSelectedFirstSitelinkTitle?: string;
  sourceSearchSelectedFirstSitelinkUrl?: string;
  sourceSearchSelectedFirstSitelinkSelector?: string;
  sourceSearchSelectedFirstSitelinkCommand?: string;
  sourceSearchSelectedFirstSitelinkCommandArgs?: string[];
  sourceSearchSelectedOpenResult?: number | "best";
  sourceSearchSelectedCommand?: string;
  sourceSearchSelectedCommandArgs?: string[];
  sourceSearchSelectedSourceScore?: number;
  sourceSearchSelectedRelevance?: AgentSourceSearchResult["relevance"];
  sourceSearchSelectedLikelyOfficial?: boolean;
  sourceSearchSelectedReason?: string;
  sourceSearchFailureCode?: string;
  sourceSearchFailureStatus?: number;
  sourceSearchFailureKind?: AgentSourceSearchFailureKind;
  sourceSearchFailureRetryable?: boolean;
  sourceSearchFailureRetryAfter?: string;
  sourceSearchFailurePath?: string;
  sourceSearchFailureUrl?: string;
  sourceSearchFailureHost?: string;
  sourceSearchFailureReason?: string;
  sourceSearchFailureCommand?: string;
  sourceSearchFailureCommandArgs?: string[];
  sourceSearchAlternateCount?: number;
  sourceSearchAlternatePath?: string;
  sourceSearchAlternateTitle?: string;
  sourceSearchAlternateUrl?: string;
  sourceSearchAlternateHost?: string;
  sourceSearchAlternateSource?: string;
  sourceSearchAlternateSourceType?: AgentSourceSearchResult["sourceType"];
  sourceSearchAlternateSourceHints?: string[];
  sourceSearchAlternateRank?: number;
  sourceSearchAlternateSnippet?: string;
  sourceSearchAlternateDateText?: string;
  sourceSearchAlternateDateIso?: string;
  sourceSearchAlternateDateUnixMs?: number;
  sourceSearchAlternateDatePrecision?: AgentSourceSearchResult["datePrecision"];
  sourceSearchAlternateDateSource?: AgentSourceSearchResult["dateSource"];
  sourceSearchAlternateMatchedTerm?: string;
  sourceSearchAlternateFindMatch?: string;
  sourceSearchAlternateSitelinkCount?: number;
  sourceSearchAlternateFirstSitelinkTitle?: string;
  sourceSearchAlternateFirstSitelinkUrl?: string;
  sourceSearchAlternateFirstSitelinkSelector?: string;
  sourceSearchAlternateFirstSitelinkCommand?: string;
  sourceSearchAlternateFirstSitelinkCommandArgs?: string[];
  sourceSearchAlternateOpenResult?: number | "best";
  sourceSearchAlternateCommand?: string;
  sourceSearchAlternateCommandArgs?: string[];
  sourceSearchAlternateSourceScore?: number;
  sourceSearchAlternateRelevance?: AgentSourceSearchResult["relevance"];
  sourceSearchAlternateLikelyOfficial?: boolean;
  sourceSearchAlternateDifferentHost?: boolean;
  sourceSearchAlternateReason?: string;
  sourceSearchAlternateChoices?: AgentSourceSearchResult[];
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
  topCitationCommand?: string;
  topCitationCommandArgs?: string[];
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
  topAnswerEvidenceCommand?: string;
  topAnswerEvidenceCommandArgs?: string[];
  topAnswerEvidenceConfidence?: AgentCitation["confidence"];
  topAnswerEvidenceReason?: string;
  topAnswerEvidenceScore?: number;
  answerPlanStatus?: AgentAnswerPlan["status"];
  answerPlanConfidence?: AgentAnswerPlan["confidence"];
  answerPlanReason?: string;
  answerPlanNextAction?: string;
  answerGapCount?: number;
  answerUseCitationCount?: number;
  topAnswerUseCitationId?: string;
  answerUseCitationIds?: string[];
  answerPlanReadFrom?: string;
  answerPlanReadTargetKind?: AgentReadTarget["kind"];
  answerPlanReadTargetCount?: number;
  answerPlanReadTargetScore?: number;
  answerPlanReadTargetPrimary?: boolean;
  answerPlanReadTargetReason?: string;
  answerPlanCommand?: string;
  answerPlanCommandArgs?: string[];
  answerPlanAfterInteractionCommand?: string;
  answerPlanAfterInteractionCommandArgs?: string[];
  answerPlanUrl?: string;
  readTargetCount?: number;
  readTargets?: AgentReadTarget[];
  topReadTarget?: string;
  topReadTargetKind?: AgentReadTarget["kind"];
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
  topActionPriorityReason?: string;
  topActionReason?: string;
  topActionReadFrom?: string;
  topActionReadTargetKind?: AgentReadTarget["kind"];
  topActionReadTargetCount?: number;
  topActionReadTargetScore?: number;
  topActionReadTargetPrimary?: boolean;
  topActionReadTargetReason?: string;
  topActionCommand?: string;
  topActionCommandArgs?: string[];
  topActionAfterInteractionCommand?: string;
  topActionAfterInteractionCommandArgs?: string[];
  topActionUrl?: string;
  topActionSourceLinkRef?: string;
  topActionRank?: number;
  topActionOpenResult?: number | "best";
  topActionExpectedOutcome?: AgentExpectedOutcome["kind"];
  topActionExpectedOutcomeMessage?: string;
  topActionTargetUrl?: string;
  topActionTargetPath?: string;
  topActionTargetTitle?: string;
  topActionTargetHost?: string;
  topActionTargetSource?: string;
  topActionTargetRank?: number;
  topActionTargetSourceScore?: number;
  topActionTargetDateText?: string;
  topActionTargetDateIso?: string;
  topActionTargetDateUnixMs?: number;
  topActionTargetDatePrecision?: "day" | "month" | "year";
  topActionTargetDateSource?: "title" | "snippet";
  topActionTargetRelevance?: AgentTarget["relevance"];
  topActionTargetLikelyOfficial?: boolean;
  topActionTargetSelector?: string;
  topActionTargetText?: string;
  topActionRequiresBrowserInteraction?: boolean;
  topActionBrowserHtmlReason?: string;
  topActionBrowserHtmlReasonCode?: AgentBrowserHtmlReasonCode;
  bestReadTarget?: string;
  bestReadTargetKind?: AgentReadTarget["kind"];
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
  executorCommand?: string;
  executorCommandArgs?: string[];
  executorAfterInteractionCommand?: string;
  executorAfterInteractionCommandArgs?: string[];
  executorReadFrom?: string;
  executorReadTargetKind?: AgentReadTarget["kind"];
  executorReadTargetCount?: number;
  executorReadTargetScore?: number;
  executorReadTargetPrimary?: boolean;
  executorReadTargetReason?: string;
  executorReadValuePath?: string;
  executorReadValueType?: AgentReadValueKind;
  executorReadValueCount?: number;
  executorReadValueReferencePath?: string;
  executorUrl?: string;
  executorTargetUrl?: string;
  executorTargetPath?: string;
  executorTargetTitle?: string;
  executorTargetHost?: string;
  executorTargetSource?: string;
  executorTargetRank?: number;
  executorTargetSourceScore?: number;
  executorTargetDateText?: string;
  executorTargetDateIso?: string;
  executorTargetDateUnixMs?: number;
  executorTargetDatePrecision?: "day" | "month" | "year";
  executorTargetDateSource?: "title" | "snippet";
  executorTargetRelevance?: AgentTarget["relevance"];
  executorTargetLikelyOfficial?: boolean;
  executorTargetSelector?: string;
  executorTargetText?: string;
  executorExpectedOutcome?: AgentExpectedOutcome["kind"];
  executorBrowserHtmlReason?: string;
  executorBrowserHtmlReasonCode?: AgentBrowserHtmlReasonCode;
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
  handoffCommand?: string;
  handoffCommandArgs?: string[];
  handoffAfterInteractionCommand?: string;
  handoffAfterInteractionCommandArgs?: string[];
  handoffReadFrom?: string;
  handoffReadTargetKind?: AgentReadTarget["kind"];
  handoffReadTargetCount?: number;
  handoffReadTargetScore?: number;
  handoffReadTargetPrimary?: boolean;
  handoffReadTargetReason?: string;
  handoffReadValuePath?: string;
  handoffReadValueType?: AgentReadValueKind;
  handoffReadValueCount?: number;
  handoffReadValueReferencePath?: string;
  handoffUrl?: string;
  handoffTargetUrl?: string;
  handoffTargetPath?: string;
  handoffTargetTitle?: string;
  handoffTargetHost?: string;
  handoffTargetSource?: string;
  handoffTargetRank?: number;
  handoffTargetSourceScore?: number;
  handoffTargetDateText?: string;
  handoffTargetDateIso?: string;
  handoffTargetDateUnixMs?: number;
  handoffTargetDatePrecision?: "day" | "month" | "year";
  handoffTargetDateSource?: "title" | "snippet";
  handoffTargetRelevance?: AgentTarget["relevance"];
  handoffTargetLikelyOfficial?: boolean;
  handoffTargetSelector?: string;
  handoffTargetText?: string;
  handoffExpectedOutcome?: AgentExpectedOutcome["kind"];
  handoffBrowserHtmlReason?: string;
  handoffBrowserHtmlReasonCode?: AgentBrowserHtmlReasonCode;
  primaryActionName?: string;
  primaryReason?: string;
  primaryPriority?: "low" | "medium" | "high";
  primaryPriorityReason?: string;
  primaryExecution?: AgentExecutionMode;
  primaryExpectedOutcome?: AgentExpectedOutcome["kind"];
  primaryExpectedOutcomeMessage?: string;
  primaryReadFrom?: string;
  primaryReadTargetKind?: AgentReadTarget["kind"];
  primaryReadTargetCount?: number;
  primaryReadTargetScore?: number;
  primaryReadTargetPrimary?: boolean;
  primaryReadTargetReason?: string;
  primaryCommand?: string;
  primaryCommandArgs?: string[];
  primaryAfterInteractionCommand?: string;
  primaryAfterInteractionCommandArgs?: string[];
  primaryBrowserHtmlReason?: string;
  primaryBrowserHtmlReasonCode?: AgentBrowserHtmlReasonCode;
  primaryUrl?: string;
  primarySourceLinkRef?: string;
  primaryRank?: number;
  primaryOpenResult?: number | "best";
  primaryTargetUrl?: string;
  primaryTargetPath?: string;
  primaryTargetTitle?: string;
  primaryTargetHost?: string;
  primaryTargetSource?: string;
  primaryTargetRank?: number;
  primaryTargetSourceScore?: number;
  primaryTargetDateText?: string;
  primaryTargetDateIso?: string;
  primaryTargetDateUnixMs?: number;
  primaryTargetDatePrecision?: "day" | "month" | "year";
  primaryTargetDateSource?: "title" | "snippet";
  primaryTargetRelevance?: AgentTarget["relevance"];
  primaryTargetLikelyOfficial?: boolean;
  primaryTargetSelector?: string;
  primaryTargetText?: string;
  requiresBrowserInteraction?: boolean;
  primaryAction?: AgentAction;
  alternativeActionName?: string;
  alternativeActionSource?: string;
  alternativeActionExecution?: AgentExecutionMode;
  alternativeActionExpectedOutcome?: AgentExpectedOutcome["kind"];
  alternativeActionExpectedOutcomeMessage?: string;
  alternativeActionPriority?: "low" | "medium" | "high";
  alternativeActionPriorityReason?: string;
  alternativeActionReason?: string;
  alternativeActionReadFrom?: string;
  alternativeActionReadTargetKind?: AgentReadTarget["kind"];
  alternativeActionReadTargetCount?: number;
  alternativeActionReadTargetScore?: number;
  alternativeActionReadTargetPrimary?: boolean;
  alternativeActionReadTargetReason?: string;
  alternativeActionCommand?: string;
  alternativeActionCommandArgs?: string[];
  alternativeActionAfterInteractionCommand?: string;
  alternativeActionAfterInteractionCommandArgs?: string[];
  alternativeActionUrl?: string;
  alternativeActionSourceLinkRef?: string;
  alternativeActionRank?: number;
  alternativeActionOpenResult?: number | "best";
  alternativeActionTargetUrl?: string;
  alternativeActionTargetPath?: string;
  alternativeActionTargetTitle?: string;
  alternativeActionTargetHost?: string;
  alternativeActionTargetSource?: string;
  alternativeActionTargetRank?: number;
  alternativeActionTargetSourceScore?: number;
  alternativeActionTargetDateText?: string;
  alternativeActionTargetDateIso?: string;
  alternativeActionTargetDateUnixMs?: number;
  alternativeActionTargetDatePrecision?: "day" | "month" | "year";
  alternativeActionTargetDateSource?: "title" | "snippet";
  alternativeActionTargetRelevance?: AgentTarget["relevance"];
  alternativeActionTargetLikelyOfficial?: boolean;
  alternativeActionTargetSelector?: string;
  alternativeActionTargetText?: string;
  alternativeActionRequiresBrowserInteraction?: boolean;
  alternativeActionBrowserHtmlReason?: string;
  alternativeActionBrowserHtmlReasonCode?: AgentBrowserHtmlReasonCode;
  recommendedUrl?: string;
  recommendedPath?: string;
  recommendedTitle?: string;
  recommendedRank?: number;
  recommendedSource?: string;
  recommendedSourceScore?: number;
  recommendedSourceType?: AgentTarget["sourceType"];
  recommendedSourceHints?: string[];
  recommendedDateText?: string;
  recommendedDateIso?: string;
  recommendedDateUnixMs?: number;
  recommendedDatePrecision?: "day" | "month" | "year";
  recommendedDateSource?: "title" | "snippet";
  recommendedRelevance?: AgentTarget["relevance"];
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
  | "browserHtml.shortcuts"
  | "browserHtml.reasonCodes"
  | "executor.browserHtml.shortcuts"
  | "handoff.browserHtml.shortcuts"
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
  sourceSearch?: AgentSourceSearch;
  warnings?: Array<{ code: string; message: string }>;
  agent: AgentSummary;
  page?: AgentPageMetadata;
  pageCheck?: AgentPageCheck;
  verification?: AgentVerification;
  finds?: AgentFindSummary[];
  searchResults?: AgentResultChoice[];
  recommendedResult?: AgentResultChoice;
  suggestedActions?: AgentAction[];
  error?: { code: string; message: string; status?: number };
  treeOmitted?: boolean;
};
