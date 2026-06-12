#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseDocument } from "htmlparser2";
import { Element as DomElement } from "domhandler";
import type { AnyNode, Element } from "domhandler";
import { extract, type StaticSemanticTreeOptions } from "./static";
import type {
  AgentActionTargetChoice,
  AgentAnswerPlan,
  AgentBrowserHtmlCapture,
  AgentBrowserHtmlReasonCode,
  AgentCitation,
  AgentContract,
  AgentContinuationMode,
  AgentExecutorStep,
  AgentExecutionPlan,
  AgentExpectedOutcome,
  AgentFormChoice,
  AgentHandoff,
  AgentLoopDirective,
  AgentNext,
  AgentQualityGate,
  AgentReadTarget,
  AgentReadValue,
  AgentResultChoice,
  AgentRoutingIntent,
  AgentRunbook,
  AgentSignal,
  AgentSourceChoice,
  AgentSourceSearch,
  AgentSourceSearchResult,
  AgentStaticReadiness,
  AgentStaticReadinessReasonCode,
  AgentStatus,
  AgentTarget,
  SemanticNode,
  SemanticNodeState,
} from "./types";

type CliFormat = "text" | "json";
type SearchEngine = "bing" | "duckduckgo" | "startpage";
type SearchEngineOption = SearchEngine | "auto";
type SearchResultEngine = SearchEngine | "baidu" | "yahoo-japan" | "generic";

type CliOptions = {
  url?: string;
  baseUrl: string;
  format: CliFormat;
  linksOnly: boolean;
  omitTree: boolean;
  agentMode: boolean;
  agentBrief: boolean;
  maxTreeLines?: number;
  input: "fetch" | "html-file" | "stdin";
  htmlFile?: string;
  searchQuery?: string;
  searchEngine?: SearchEngineOption;
  selectedSearchEngine?: SearchEngine;
  searchAttempts?: SearchAttemptSummary[];
  searchLang?: string;
  searchRegion?: string;
  openResult?: number | "best";
  findQueries?: string[];
  sourceSearch?: SourceSearchSummary;
  timeoutMs: number;
  userAgent: string;
  extractOptions: StaticSemanticTreeOptions;
};

type SourceSearchSummary = {
  query: string;
  engine: SearchEngineOption;
  selectedEngine?: SearchEngine;
  searchUrl: string;
  lang?: string;
  region?: string;
  timeoutMs?: number;
  userAgent?: string;
  findQueries?: string[];
  selectedRank: number;
  selectedTitle: string;
  selectedUrl: string;
  selectedResult?: ResultSummary;
  alternateResults?: ResultSummary[];
};

type FetchResult = {
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
  responseHeaders: Record<string, string>;
  page: PageSummary;
};

type SearchAttemptSummary = {
  engine: SearchEngine;
  url: string;
  ok: boolean;
  resultCount: number;
  kind?: ContentKind;
  status?: number;
  finalUrl?: string;
  diagnostics?: DiagnosticSummary[];
  topResult?: {
    title: string;
    url: string;
    relevance?: "low" | "medium" | "high";
    isLikelyOfficial?: boolean;
  };
  error?: {
    code: CliErrorCode;
    message: string;
    status?: number;
  };
};

type AgentSearchDecision = {
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
  recommendedUrl?: string;
  command?: string;
  commandArgs?: string[];
};

type AgentPageDecision = {
  decision: "read-content" | "open-source-link" | "open-site-search" | "retry-with-browser-html" | "inspect-actions" | "none";
  confidence: "low" | "medium" | "high";
  reason: string;
  readability: PageReadabilitySummary["level"];
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

type AgentSemanticSummary = {
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
  tableItems: Array<{ path: string; role: string; name?: string; rowCount: number; cellCount: number; declaredRowCount?: number; declaredColumnCount?: number; headers?: string[]; headerRefs?: Array<{ path?: string; text: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }>; ownedRefs?: Array<{ target: string; role?: string; name?: string; selector?: string }>; sampleCells?: string[]; sampleCellRefs?: Array<{ path?: string; text: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string }>; selector?: string }>;
  listItems: Array<{ path: string; role: string; name?: string; itemCount: number; sampleItems?: string[]; itemRefs?: Array<{ text: string; role?: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: SemanticNodeState["current"]; expanded?: boolean; selector?: string }>; selector?: string }>;
  fieldItems: Array<{ path: string; role: string; name?: string; description?: string; value?: string; htmlName?: string; htmlType?: string; placeholder?: string; ariaPlaceholder?: string; autocomplete?: string; ariaAutocomplete?: string; inputMode?: string; pattern?: string; min?: string; max?: string; step?: string; minLength?: number; maxLength?: number; labelledBy?: string; labelledByText?: string; describedBy?: string; describedByText?: string; details?: string; detailsText?: string; errorMessage?: string; errorMessageText?: string; selector?: string; state?: SemanticNodeState }>;
  descriptionItems: Array<{ path: string; role: string; name?: string; description: string; selector?: string }>;
  valueItems: Array<{ path: string; role: string; name?: string; value: string; selector?: string }>;
  relationItems: Array<{ path: string; role: string; name?: string; relation: "controls" | "owns" | "flowto" | "activeDescendant" | "details" | "errorMessage"; target: string; targetRole?: string; targetName?: string; targetSelector?: string; selector?: string }>;
  choiceItems: Array<{ path: string; role: string; name: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string; state?: SemanticNodeState }>;
  stateItems: Array<{ path: string; role: string; name?: string; state: string; stateRaw?: SemanticNodeState; selector?: string }>;
  unavailableItems: Array<{ path: string; tag: string; role?: string; name?: string; reason: string; selector?: string }>;
};

type CliErrorCode = "FETCH_FAILED" | "HTTP_ERROR" | "NO_INSPECTABLE_CONTENT" | "NO_RESULT" | "TIMEOUT" | "USAGE";

type LinkSummary = {
  text: string;
  url: string;
  role: string;
  snippet?: string;
  selector?: string;
};

type ResultSummary = {
  id?: string;
  path?: string;
  title: string;
  url: string;
  host?: string;
  source: string;
  rank: number;
  text?: string;
  snippet?: string;
  selector?: string;
  sourceType?: SourceType;
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

type SourceType = "official" | "government" | "education" | "documentation" | "code" | "wiki" | "news" | "forum" | "social" | "commerce" | "unknown";

type PageSummary = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  lang?: string;
  dir?: string;
  siteName?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  structuredDataTypes?: string[];
};

type OutlineSummary = {
  text: string;
  level?: number;
};

type ActionSummary = {
  type: string;
  text: string;
  selector?: string;
};

type ContentSummary = {
  text: string;
  role: string;
  selector?: string;
};

type ContentKind = "empty" | "blocked-page" | "search-results" | "content-page" | "interactive-page" | "page";

type DiagnosticSummary = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
};

type SuggestedAction = {
  action: string;
  reason: string;
  priority?: "low" | "medium" | "high";
  priorityReason?: string;
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
  execution?: "run-command" | "read-current" | "interact-browser" | "inspect-output";
  target?: AgentTarget;
};

type AgentActionSource = "agent.primaryAction" | "analysis.suggestedActions" | "pageCheck.recommendedAction" | "pageCheck.nextSteps" | "verification.recommendedAction";

type AgentActionSummary = SuggestedAction & {
  source: AgentActionSource;
  primary?: boolean;
  index?: number;
};

type CommandSpec = {
  command: string;
  commandArgs: string[];
};

type SearchResultCommandContext = {
  query: string;
  engine?: SearchEngineOption;
  findQueries: string[];
  agentMode: boolean;
  lang?: string;
  region?: string;
  timeoutMs?: number;
  userAgent?: string;
};

type PageLinkCommandContext = {
  agentMode: boolean;
  findQueries: string[];
  timeoutMs?: number;
  userAgent?: string;
};

type AnalysisSummary = {
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
};

type PageLinkSummary = ResultSummary & {
  kind: "internal" | "external";
};

type PageEvidenceSummary = {
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

type PageDataTableSummary = {
  id: string;
  path: string;
  rank: number;
  rowCount: number;
  columnCount: number;
  headers: string[];
  sampleRows: string[][];
  text: string;
  caption?: string;
  selector?: string;
};

type PageBarrierSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "challenge" | "login" | "paywall" | "cookie-consent" | "age-gate" | "geo-block";
  severity: "info" | "warning" | "error";
  text: string;
  evidence: string;
  diagnosticCode?: string;
  source: "diagnostic" | "content" | "action";
  selector?: string;
};

type PageFormFieldSummary = {
  name?: string;
  type: string;
  label?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  selector?: string;
  options?: string[];
};

type PageFormSummary = {
  id: string;
  path: string;
  rank: number;
  method: string;
  fieldCount: number;
  fields: PageFormFieldSummary[];
  text: string;
  actionUrl?: string;
  submitText?: string;
  queryField?: string;
  urlTemplate?: string;
  selector?: string;
};

type PageActionTargetSummary = {
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
};

type PageHydrationSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "next-data" | "nuxt-data" | "gatsby-data" | "fetch-preload" | "json-script";
  label: string;
  text: string;
  source: "script" | "link";
  framework?: string;
  route?: string;
  buildId?: string;
  url?: string;
  selector?: string;
};

type PageApiEndpointSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "fetch" | "axios" | "xhr" | "graphql" | "event-stream";
  method?: string;
  url: string;
  text: string;
  source: "script";
  selector?: string;
};

type PageClientStateSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "local-storage" | "session-storage" | "cookie";
  operation: "read" | "write" | "delete";
  key: string;
  text: string;
  source: "script";
  selector?: string;
};

type PageRuntimeSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "service-worker" | "web-worker" | "shared-worker" | "worklet" | "dynamic-import" | "module-preload";
  url: string;
  text: string;
  source: "script" | "link";
  selector?: string;
};

type PageConfigSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "app-config" | "initial-state" | "env" | "feature-flags" | "data-layer" | "config";
  name: string;
  keys: string[];
  keyCount: number;
  text: string;
  source: "script";
  selector?: string;
};

type PageAppHintSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "manifest" | "app-name" | "icon" | "theme" | "capability";
  label: string;
  value: string;
  text: string;
  source: "link" | "meta";
  url?: string;
  sizes?: string;
  media?: string;
  selector?: string;
};

type PageMobileHintSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "viewport" | "format-detection" | "color-scheme" | "smart-app-banner" | "app-link";
  label: string;
  value: string;
  text: string;
  source: "meta" | "link";
  platform?: string;
  url?: string;
  selector?: string;
};

type PageTopicSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "keyword" | "tag" | "section" | "category" | "about" | "mention";
  label: string;
  value: string;
  text: string;
  source: "meta" | "json-ld";
  selector?: string;
};

type PageKeyValueSummary = {
  id: string;
  path: string;
  rank: number;
  label: string;
  value: string;
  text: string;
  source: "definition-list" | "time" | "text";
  datetime?: string;
  selector?: string;
};

type PageMetaFactSummary = {
  id: string;
  path: string;
  rank: number;
  label: string;
  value: string;
  text: string;
  source: "meta" | "link";
  url?: string;
  selector?: string;
};

type PageProvenanceSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "doi" | "pmid" | "arxiv" | "isbn" | "publisher" | "journal" | "license" | "identifier";
  label: string;
  value: string;
  text: string;
  source: "meta" | "link" | "json-ld";
  url?: string;
  selector?: string;
};

type PageHttpPolicySummary = {
  id: string;
  path: string;
  rank: number;
  name: string;
  value: string;
  text: string;
  source: "header" | "meta";
  selector?: string;
};

type PageSchemaFact = {
  label: string;
  value: string;
};

type PageSchemaFactSummary = {
  id: string;
  path: string;
  rank: number;
  types: string[];
  facts: PageSchemaFact[];
  text: string;
  source: "json-ld";
  selector?: string;
};

type PageOfferSummary = {
  id: string;
  path: string;
  rank: number;
  name?: string;
  price?: string;
  currency?: string;
  availability?: string;
  url?: string;
  brand?: string;
  sku?: string;
  rating?: string;
  reviewCount?: string;
  text: string;
  source: "json-ld";
  selector?: string;
};

type PageIdentitySummary = {
  id: string;
  path: string;
  rank: number;
  kind: "organization" | "person" | "website" | "brand" | "thing";
  name: string;
  text: string;
  source: "json-ld" | "meta";
  url?: string;
  logoUrl?: string;
  sameAs?: string[];
  selector?: string;
};

type PageDatasetSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "dataset" | "dataCatalog" | "dataDownload";
  name: string;
  text: string;
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

type PageTimelineSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "published" | "modified" | "created" | "updated" | "start" | "end" | "date";
  label: string;
  value: string;
  text: string;
  source: "meta" | "json-ld" | "time" | "page";
  selector?: string;
};

type PageContactPointSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "email" | "phone" | "address" | "contact-url";
  label: string;
  value: string;
  text: string;
  source: "json-ld" | "html" | "link";
  url?: string;
  selector?: string;
};

type PageFaqSummary = {
  id: string;
  path: string;
  rank: number;
  question: string;
  answer: string;
  text: string;
  source: "details" | "html";
  selector?: string;
};

type PageBreadcrumbItem = {
  label: string;
  url?: string;
  position?: number;
};

type PageBreadcrumbSummary = {
  id: string;
  path: string;
  rank: number;
  source: "json-ld" | "html";
  items: PageBreadcrumbItem[];
  text: string;
  selector?: string;
};

type PageSectionSummary = {
  id: string;
  path: string;
  rank: number;
  heading: string;
  level: number;
  text: string;
  excerpts: string[];
  selector?: string;
};

type PagePaginationSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "next" | "prev" | "first" | "last" | "page";
  label: string;
  text: string;
  source: "link" | "html";
  url?: string;
  current?: boolean;
  selector?: string;
};

type PageTocItem = {
  label: string;
  url?: string;
  level?: number;
};

type PageTocSummary = {
  id: string;
  path: string;
  rank: number;
  items: PageTocItem[];
  text: string;
  title?: string;
  selector?: string;
};

type PageCodeBlockSummary = {
  id: string;
  path: string;
  rank: number;
  text: string;
  lineCount: number;
  source: "pre" | "code";
  language?: string;
  commandLike?: boolean;
  selector?: string;
};

type PageMediaSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "open-graph" | "figure" | "image";
  url: string;
  text: string;
  alt?: string;
  caption?: string;
  title?: string;
  width?: number;
  height?: number;
  selector?: string;
};

type PageResourceSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "feed" | "alternate" | "amp" | "license" | "manifest" | "sitemap" | "search" | "document" | "download";
  url: string;
  text: string;
  title?: string;
  rel?: string;
  type?: string;
  hreflang?: string;
  selector?: string;
};

type PageCitationSummary = {
  id: string;
  path: string;
  rank: number;
  source: "blockquote" | "cite" | "footnote" | "reference";
  text: string;
  quote?: string;
  title?: string;
  url?: string;
  selector?: string;
};

type PageEmbedSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "iframe" | "video" | "audio" | "embed" | "object";
  url: string;
  text: string;
  title?: string;
  type?: string;
  posterUrl?: string;
  sourceUrls?: string[];
  sandbox?: string;
  allow?: string;
  loading?: string;
  selector?: string;
};

type PageTranscriptSummary = {
  id: string;
  path: string;
  rank: number;
  kind: "captions" | "subtitles" | "descriptions" | "chapters" | "metadata" | "transcript";
  url: string;
  text: string;
  mediaKind?: "video" | "audio";
  label?: string;
  language?: string;
  selector?: string;
};

type PageAuthorLinkSummary = {
  id: string;
  path: string;
  rank: number;
  url: string;
  text: string;
  source: "json-ld" | "link" | "html";
  name?: string;
  rel?: string;
  selector?: string;
};

type PageReadabilitySummary = {
  level: "low" | "medium" | "high";
  score: number;
  reasons: string[];
};

type FindMatchSummary = {
  field: string;
  text: string;
  rank?: number;
  url?: string;
  selector?: string;
  source?: PageEvidenceSummary["source"];
  score?: number;
  quality?: PageEvidenceSummary["quality"];
  qualityReason?: string;
};

type FindSummary = {
  query: string;
  found: boolean;
  matchCount: number;
  matches: FindMatchSummary[];
};

type VerificationSummary = {
  status: "not-requested" | "matched" | "partial" | "missing";
  requestedCount: number;
  foundCount: number;
  missingCount: number;
  evidenceCount: number;
  foundQueries: string[];
  missingQueries: string[];
  bestEvidence?: FindMatchSummary;
  recommendedAction?: SuggestedAction;
};

type AgentSummary = {
  contract: AgentContract;
  status: AgentStatus;
  pageKind: ContentKind;
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
  runbookCommandArgs?: string[];
  runbookUrl?: string;
  nextActionName?: string;
  nextExecution?: NonNullable<SuggestedAction["execution"]>;
  nextCommand?: string;
  nextCommandArgs?: string[];
  nextAfterInteractionCommand?: string;
  nextAfterInteractionCommandArgs?: string[];
  nextReadFrom?: string;
  nextUrl?: string;
  executor: AgentExecutorStep;
  handoff: AgentHandoff;
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
  answerPlan: AgentAnswerPlan;
  searchDecision?: AgentSearchDecision;
  pageDecision?: AgentPageDecision;
  searchDecisionName?: AgentSearchDecision["decision"];
  searchDecisionConfidence?: AgentSearchDecision["confidence"];
  searchDecisionReason?: string;
  searchDecisionResultCount?: number;
  searchDecisionHighRelevanceCount?: number;
  searchDecisionMediumRelevanceCount?: number;
  searchDecisionLowRelevanceCount?: number;
  searchDecisionOfficialCount?: number;
  searchDecisionFindMatchCount?: number;
  searchDecisionRecommendedRank?: number;
  searchDecisionRecommendedUrl?: string;
  searchDecisionCommandArgs?: string[];
  pageDecisionName?: AgentPageDecision["decision"];
  pageDecisionConfidence?: AgentPageDecision["confidence"];
  pageDecisionReason?: string;
  pageDecisionReadFrom?: string;
  pageDecisionUrl?: string;
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
  semanticTopNamedRoleDescription?: string;
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
  semanticTopTableCellCount?: number;
  semanticTopTableDeclaredRowCount?: number;
  semanticTopTableDeclaredColumnCount?: number;
  semanticTopTableHeaders?: string[];
  semanticTopTableHeaderRefs?: Array<{ path?: string; text: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }>;
  semanticTopTableOwnedCount?: number;
  semanticTopTableOwnedRefs?: Array<{ target: string; role?: string; name?: string; selector?: string }>;
  semanticTopTableSampleCells?: string[];
  semanticTopTableSampleCellRefs?: Array<{ path?: string; text: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string }>;
  semanticTopTableFirstHeader?: string;
  semanticTopTableFirstHeaderPath?: string;
  semanticTopTableFirstHeaderRole?: string;
  semanticTopTableFirstHeaderRowIndex?: number;
  semanticTopTableFirstHeaderColumnIndex?: number;
  semanticTopTableFirstHeaderSort?: string;
  semanticTopTableFirstHeaderSelector?: string;
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
  semanticTopSelectedTableCellPath?: string;
  semanticTopSelectedTableCellText?: string;
  semanticTopSelectedTableCellRowIndex?: number;
  semanticTopSelectedTableCellColumnIndex?: number;
  semanticTopSelectedTableCellSelected?: boolean;
  semanticTopSelectedTableCellCurrent?: SemanticNodeState["current"];
  semanticTopSelectedTableCellSelector?: string;
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
  semanticTopFieldDescribedBy?: string;
  semanticTopFieldDescribedByText?: string;
  semanticTopFieldDetails?: string;
  semanticTopFieldDetailsText?: string;
  semanticTopFieldErrorMessage?: string;
  semanticTopFieldErrorMessageText?: string;
  semanticTopFieldState?: string;
  semanticTopFieldDisabled?: boolean;
  semanticTopFieldRequired?: boolean;
  semanticTopFieldReadonly?: boolean;
  semanticTopFieldInvalid?: SemanticNodeState["invalid"];
  semanticTopFieldChecked?: SemanticNodeState["checked"];
  semanticTopFieldExpanded?: boolean;
  semanticTopFieldHaspopup?: SemanticNodeState["haspopup"];
  semanticTopFieldControls?: string;
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
  semanticTopStateChecked?: SemanticNodeState["checked"];
  semanticTopStateSelected?: boolean;
  semanticTopStateExpanded?: boolean;
  semanticTopStatePressed?: SemanticNodeState["pressed"];
  semanticTopStateFocused?: boolean;
  semanticTopStateRequired?: boolean;
  semanticTopStateInvalid?: SemanticNodeState["invalid"];
  semanticTopStateReadonly?: boolean;
  semanticTopStateCurrent?: SemanticNodeState["current"];
  semanticTopStateHaspopup?: SemanticNodeState["haspopup"];
  semanticTopStateControls?: string;
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
  signalCount: number;
  signalWarningCount: number;
  signalErrorCount: number;
  signals: AgentSignal[];
  qualityGateCount: number;
  qualityGateFailCount: number;
  qualityGates: AgentQualityGate[];
  topSignalKind?: AgentSignal["kind"];
  topSignalSeverity?: AgentSignal["severity"];
  topSignalMessage?: string;
  topQualityGateKind?: AgentQualityGate["kind"];
  topQualityGatePass?: boolean;
  topQualityGateSeverity?: AgentQualityGate["severity"];
  topQualityGateMessage?: string;
  topQualityGatePath?: string;
  topQualityGateScore?: number;
  problemSignalKind?: AgentSignal["kind"];
  problemSignalSeverity?: AgentSignal["severity"];
  problemSignalMessage?: string;
  failingQualityGateKind?: AgentQualityGate["kind"];
  failingQualityGateSeverity?: AgentQualityGate["severity"];
  failingQualityGateMessage?: string;
  failingQualityGatePath?: string;
  failingQualityGateScore?: number;
  canContinue: boolean;
  canUseFetchedHtml: boolean;
  needsBrowserHtml: boolean;
  staticReadiness?: AgentStaticReadiness;
  staticReadinessReasonCode?: AgentStaticReadinessReasonCode;
  staticReadinessReason?: string;
  staticReadinessReadFrom?: string;
  browserHtmlReason?: string;
  browserHtmlReasonCode?: AgentBrowserHtmlReasonCode;
  browserHtmlActionName?: SuggestedAction["action"];
  browserHtmlOperation?: AgentExecutionPlan["operation"];
  browserHtmlUrl?: string;
  browserHtmlFile?: string;
  browserHtmlCaptureScript?: string;
  browserHtmlCommand?: string;
  browserHtmlCommandArgs?: string[];
  browserHtmlAfterInteractionCommand?: string;
  browserHtmlAfterInteractionCommandArgs?: string[];
  responseStatus: number;
  responseOk: boolean;
  responseContentType: string;
  finalUrlChanged: boolean;
  confidence: PageCheckSummary["confidence"];
  usabilityScore: number;
  readability: PageReadabilitySummary["level"];
  readabilityScore: number;
  readabilityReasons: string[];
  verificationStatus: VerificationSummary["status"];
  verificationRequestedCount: number;
  verificationFoundCount: number;
  verificationMissingCount: number;
  verificationFoundQueries: string[];
  verificationMissingQueries: string[];
  topVerificationFoundQuery?: string;
  topVerificationMissingQuery?: string;
  resultCount: number;
  resultChoiceCount: number;
  resultChoices: AgentResultChoice[];
  topResultChoicePath?: string;
  topResultChoiceTitle?: string;
  topResultChoiceUrl?: string;
  topResultChoiceHost?: string;
  topResultChoiceSnippet?: string;
  topResultChoiceCommandArgs?: string[];
  topResultChoiceRank?: number;
  topResultChoiceOpenResult?: AgentResultChoice["openResult"];
  topResultChoiceRecommended?: boolean;
  topResultChoicePrimary?: boolean;
  topResultChoiceSourceType?: string;
  topResultChoiceSourceScore?: number;
  topResultChoiceSourceHints?: string[];
  topResultChoiceDateText?: string;
  topResultChoiceRelevance?: AgentResultChoice["relevance"];
  topResultChoiceMatchedTerm?: string;
  topResultChoiceFindMatch?: string;
  topResultChoiceLikelyOfficial?: boolean;
  topResultChoiceSitelinkCount?: number;
  topResultChoiceFirstSitelinkTitle?: string;
  topResultChoiceFirstSitelinkUrl?: string;
  topResultChoiceReason?: string;
  evidenceCount: number;
  formCount: number;
  formChoiceCount: number;
  formChoices: AgentFormChoice[];
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
  actionTargetCount: number;
  actionTargetChoiceCount: number;
  actionTargetChoices: AgentActionTargetChoice[];
  topActionTargetChoicePath?: string;
  topActionTargetChoiceKind?: string;
  topActionTargetChoiceName?: string;
  topActionTargetChoiceSource?: string;
  topActionTargetChoiceTargetUrl?: string;
  topActionTargetChoiceUrlTemplate?: string;
  topActionTargetChoiceQueryInput?: string;
  topActionTargetChoiceMethod?: string;
  topActionTargetChoiceDisabled?: boolean;
  topActionTargetChoicePressed?: SemanticNodeState["pressed"];
  topActionTargetChoiceExpanded?: boolean;
  topActionTargetChoiceHaspopup?: SemanticNodeState["haspopup"];
  topActionTargetChoiceControls?: string;
  topActionTargetChoiceSelector?: string;
  barrierCount: number;
  topBarrierKind?: PageBarrierSummary["kind"];
  topBarrierSeverity?: PageBarrierSummary["severity"];
  topBarrierSource?: PageBarrierSummary["source"];
  topBarrierPath?: string;
  topBarrierText?: string;
  topBarrierSelector?: string;
  topBarrierDiagnosticCode?: string;
  dataTableCount: number;
  faqCount: number;
  codeBlockCount: number;
  resourceCount: number;
  mediaCount: number;
  sectionCount: number;
  breadcrumbCount: number;
  paginationCount: number;
  tocCount: number;
  embedCount: number;
  transcriptCount: number;
  authorLinkCount: number;
  provenanceCount: number;
  offerCount: number;
  datasetCount: number;
  identityCount: number;
  timelineCount: number;
  contactPointCount: number;
  topDataTablePath?: string;
  topDataTableCaption?: string;
  topDataTableRowCount?: number;
  topDataTableColumnCount?: number;
  topDataTableHeaderCount?: number;
  topDataTableFirstHeader?: string;
  topDataTableFirstRow?: string[];
  topDataTableFirstCell?: string;
  topDataTableSelector?: string;
  topFaqQuestion?: string;
  topFaqAnswer?: string;
  topCodeBlockLanguage?: string;
  topCodeBlockLineCount?: number;
  topCodeBlockText?: string;
  topResourceKind?: PageResourceSummary["kind"];
  topResourceUrl?: string;
  topResourceTitle?: string;
  topMediaKind?: PageMediaSummary["kind"];
  topMediaUrl?: string;
  topMediaText?: string;
  topSectionPath?: string;
  topSectionHeading?: string;
  topSectionLevel?: number;
  topSectionText?: string;
  topSectionSelector?: string;
  topBreadcrumbPath?: string;
  topBreadcrumbText?: string;
  topBreadcrumbSource?: PageBreadcrumbSummary["source"];
  topPaginationPath?: string;
  topPaginationKind?: PagePaginationSummary["kind"];
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
  topEmbedKind?: PageEmbedSummary["kind"];
  topEmbedUrl?: string;
  topEmbedTitle?: string;
  topTranscriptKind?: PageTranscriptSummary["kind"];
  topTranscriptUrl?: string;
  topTranscriptLabel?: string;
  topTranscriptLanguage?: string;
  topAuthorLinkName?: string;
  topAuthorLinkUrl?: string;
  topAuthorLinkSource?: PageAuthorLinkSummary["source"];
  topProvenancePath?: string;
  topProvenanceKind?: PageProvenanceSummary["kind"];
  topProvenanceLabel?: string;
  topProvenanceValue?: string;
  topProvenanceUrl?: string;
  topProvenanceSource?: PageProvenanceSummary["source"];
  topProvenanceSelector?: string;
  topOfferPath?: string;
  topOfferName?: string;
  topOfferPrice?: string;
  topOfferCurrency?: string;
  topOfferAvailability?: string;
  topOfferUrl?: string;
  topOfferSelector?: string;
  topDatasetPath?: string;
  topDatasetKind?: PageDatasetSummary["kind"];
  topDatasetName?: string;
  topDatasetUrl?: string;
  topDatasetDistributionUrl?: string;
  topDatasetLicenseUrl?: string;
  topDatasetEncodingFormat?: string;
  topDatasetSelector?: string;
  topIdentityPath?: string;
  topIdentityKind?: PageIdentitySummary["kind"];
  topIdentityName?: string;
  topIdentityUrl?: string;
  topIdentityLogoUrl?: string;
  topIdentitySameAsUrl?: string;
  topIdentitySource?: PageIdentitySummary["source"];
  topIdentitySelector?: string;
  topTimelinePath?: string;
  topTimelineKind?: PageTimelineSummary["kind"];
  topTimelineLabel?: string;
  topTimelineValue?: string;
  topTimelineSource?: PageTimelineSummary["source"];
  topTimelineSelector?: string;
  topContactPointPath?: string;
  topContactPointKind?: PageContactPointSummary["kind"];
  topContactPointLabel?: string;
  topContactPointValue?: string;
  topContactPointUrl?: string;
  topContactPointSource?: PageContactPointSummary["source"];
  topContactPointSelector?: string;
  structuredReadTargetCount: number;
  bestStructuredReadTarget?: string;
  bestStructuredReadTargetCount?: number;
  bestStructuredReadTargetScore?: number;
  bestStructuredReadTargetPrimary?: boolean;
  bestStructuredReadTargetReason?: string;
  hiddenSignalCount: number;
  hiddenHydrationCount: number;
  hiddenApiEndpointCount: number;
  hiddenClientStateCount: number;
  hiddenAppHintCount: number;
  topHydrationPath?: string;
  topHydrationKind?: string;
  topHydrationLabel?: string;
  topHydrationUrl?: string;
  topHydrationSelector?: string;
  topApiEndpointPath?: string;
  topApiEndpointKind?: string;
  topApiEndpointMethod?: string;
  topApiEndpointUrl?: string;
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
  topAppHintSelector?: string;
  topHiddenSignalGroup?: string;
  topHiddenSignalPath?: string;
  topHiddenSignalKind?: string;
  topHiddenSignalText?: string;
  topHiddenSignalUrl?: string;
  topHiddenSignalSource?: string;
  topHiddenSignalSelector?: string;
  hiddenReadTargetCount: number;
  bestHiddenReadTarget?: string;
  bestHiddenReadTargetCount?: number;
  bestHiddenReadTargetScore?: number;
  bestHiddenReadTargetPrimary?: boolean;
  bestHiddenReadTargetReason?: string;
  sourceLinkCount: number;
  sourceChoiceCount: number;
  sourceChoices: AgentSourceChoice[];
  topSourceChoicePath?: string;
  topSourceChoiceTitle?: string;
  topSourceChoiceUrl?: string;
  topSourceChoiceHost?: string;
  topSourceChoiceSnippet?: string;
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
  sourceSearchSelectedHost?: string;
  sourceSearchSelectedPath?: string;
  sourceSearchSelectedOpenResult?: AgentSourceSearchResult["openResult"];
  sourceSearchSelectedCommandArgs?: string[];
  sourceSearchSelectedReason?: string;
  sourceSearchFailureCode?: string;
  sourceSearchFailureStatus?: number;
  sourceSearchFailureUrl?: string;
  sourceSearchFailureReason?: string;
  sourceSearchAlternateCount: number;
  sourceSearchAlternatePath?: string;
  sourceSearchAlternateTitle?: string;
  sourceSearchAlternateUrl?: string;
  sourceSearchAlternateHost?: string;
  sourceSearchAlternateRank?: number;
  sourceSearchAlternateOpenResult?: AgentSourceSearchResult["openResult"];
  sourceSearchAlternateCommandArgs?: string[];
  sourceSearchAlternateReason?: string;
  evidenceQualityScore: number;
  sourceQualityScore: number;
  alternativeActionCount: number;
  diagnosticCodes: string[];
  diagnosticErrorCount: number;
  diagnosticWarningCount: number;
  diagnosticInfoCount: number;
  topDiagnosticCode?: string;
  topDiagnosticSeverity?: DiagnosticSummary["severity"];
  topDiagnosticMessage?: string;
  citationCount: number;
  citations: AgentCitation[];
  topCitationId?: string;
  topCitationPath?: string;
  topCitationKind?: AgentCitation["kind"];
  topCitationText?: string;
  topCitationTitle?: string;
  topCitationUrl?: string;
  topCitationConfidence?: AgentCitation["confidence"];
  topCitationReason?: string;
  topCitationScore?: number;
  answerEvidenceCount: number;
  answerEvidence: AgentCitation[];
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
  answerUseCitationCount?: number;
  topAnswerUseCitationId?: string;
  answerUseCitationIds?: string[];
  answerPlanReadFrom?: string;
  answerPlanCommandArgs?: string[];
  answerPlanAfterInteractionCommand?: string;
  answerPlanAfterInteractionCommandArgs?: string[];
  answerPlanUrl?: string;
  readTargetCount: number;
  readTargets: AgentReadTarget[];
  topReadTarget?: string;
  topReadTargetCount?: number;
  topReadTargetScore?: number;
  topReadTargetPrimary?: boolean;
  topReadTargetReason?: string;
  actionCount: number;
  actions: AgentActionSummary[];
  topActionName?: string;
  topActionSource?: string;
  topActionExecution?: NonNullable<SuggestedAction["execution"]>;
  topActionPriority?: NonNullable<SuggestedAction["priority"]>;
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
  handoffPriority?: AgentHandoff["priority"];
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
  primaryPriority?: NonNullable<SuggestedAction["priority"]>;
  primaryPriorityReason?: string;
  primaryExecution?: NonNullable<SuggestedAction["execution"]>;
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
  primaryAction?: SuggestedAction;
  alternativeActionName?: string;
  alternativeActionSource?: string;
  alternativeActionExecution?: NonNullable<SuggestedAction["execution"]>;
  alternativeActionPriority?: NonNullable<SuggestedAction["priority"]>;
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
  recommendedRelevance?: ResultSummary["relevance"];
  recommendedLikelyOfficial?: boolean;
  recommendedSelectionReason?: string;
  recommendedCommand?: string;
  recommendedCommandArgs?: string[];
};

const agentContract: AgentContract = {
  version: 1,
  features: [
    "next.loop",
    "next.readTarget",
    "next.readValue",
    "next.target",
    "runbook",
    "runbook.shortcuts",
    "executor",
    "handoff",
    "handoff.answerEvidence",
    "handoff.choices",
    "handoff.sourceSearch",
    "handoff.quality",
    "executionPlan",
    "executionPlan.shortcuts",
    "citations",
    "citation.reason",
    "answerPlan",
    "answerEvidence",
    "answerPlan.actionFields",
    "answerPlan.confidence",
    "verification.queries",
    "searchDecision",
    "choice.counts",
    "evidence.counts",
    "signal.counts",
    "quality.shortcuts",
    "resultChoices",
    "sourceChoices",
    "formChoices",
    "actionTargetChoices",
    "sourceSearch.shortcuts",
    "pageDecision",
    "pageMetadata.shortcuts",
    "semanticSummary",
    "searchResult.selectionReason",
    "sourceLink.selectionReason",
    "action.priority",
    "action.sourceLinkRef",
    "actions",
    "alternativeActionShortcuts",
    "barrierShortcuts",
    "contentEvidence.quality",
    "pageCheck.dataTables",
    "pageCheck.barriers",
    "pageCheck.forms",
    "pageCheck.actionTargets",
    "pageCheck.hydration",
    "pageCheck.apiEndpoints",
    "pageCheck.clientState",
    "pageCheck.runtime",
    "pageCheck.config",
    "pageCheck.appHints",
    "pageCheck.mobileHints",
    "pageCheck.topics",
    "pageCheck.keyValues",
    "pageCheck.metaFacts",
    "pageCheck.provenance",
    "pageCheck.httpPolicies",
    "pageCheck.schemaFacts",
    "pageCheck.offers",
    "pageCheck.identities",
    "pageCheck.datasets",
    "pageCheck.timeline",
    "pageCheck.contactPoints",
    "pageCheck.faqs",
    "pageCheck.breadcrumbs",
    "pageCheck.sections",
    "pageCheck.pagination",
    "pageCheck.toc",
    "pageCheck.codeBlocks",
    "pageCheck.citations",
    "pageCheck.media",
    "pageCheck.resources",
    "pageCheck.embeds",
    "pageCheck.transcripts",
    "pageCheck.authorLinks",
    "readTargets",
    "signals",
    "qualityGates",
    "expectedOutcome",
    "responseMetadata",
    "hiddenSignal.shortcuts",
    "afterInteractionCommand",
    "browserHtml",
    "primaryActionShortcuts",
  ],
};

type PageCheckSummary = {
  title?: string;
  canonicalUrl?: string;
  mainHeading?: string;
  lang?: string;
  dir?: string;
  siteName?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  structuredDataTypes?: string[];
  contentPreview: string[];
  contentEvidence: PageEvidenceSummary[];
  dataTables: PageDataTableSummary[];
  barriers: PageBarrierSummary[];
  forms: PageFormSummary[];
  actionTargets: PageActionTargetSummary[];
  hydration: PageHydrationSummary[];
  apiEndpoints: PageApiEndpointSummary[];
  clientState: PageClientStateSummary[];
  runtime: PageRuntimeSummary[];
  config: PageConfigSummary[];
  appHints: PageAppHintSummary[];
  mobileHints: PageMobileHintSummary[];
  topics: PageTopicSummary[];
  keyValues: PageKeyValueSummary[];
  metaFacts: PageMetaFactSummary[];
  provenance: PageProvenanceSummary[];
  httpPolicies: PageHttpPolicySummary[];
  schemaFacts: PageSchemaFactSummary[];
  offers: PageOfferSummary[];
  identities: PageIdentitySummary[];
  datasets: PageDatasetSummary[];
  timeline: PageTimelineSummary[];
  contactPoints: PageContactPointSummary[];
  faqs: PageFaqSummary[];
  breadcrumbs: PageBreadcrumbSummary[];
  sections: PageSectionSummary[];
  pagination: PagePaginationSummary[];
  toc: PageTocSummary[];
  codeBlocks: PageCodeBlockSummary[];
  citations: PageCitationSummary[];
  media: PageMediaSummary[];
  resources: PageResourceSummary[];
  embeds: PageEmbedSummary[];
  transcripts: PageTranscriptSummary[];
  authorLinks: PageAuthorLinkSummary[];
  contentLength: number;
  primaryLinks: PageLinkSummary[];
  sourceLinks: PageLinkSummary[];
  actions: ActionSummary[];
  confidence: "low" | "medium" | "high";
  readability: PageReadabilitySummary;
  recommendedAction: SuggestedAction;
  nextSteps: SuggestedAction[];
};

const hiddenAgentPageCheckPaths: Array<keyof PageCheckSummary> = [
  "hydration",
  "apiEndpoints",
  "clientState",
  "runtime",
  "config",
  "appHints",
  "mobileHints",
  "topics",
  "keyValues",
  "metaFacts",
  "provenance",
  "httpPolicies",
  "schemaFacts",
  "offers",
  "identities",
  "datasets",
  "timeline",
  "contactPoints",
  "authorLinks",
];

type CliIO = {
  fetch?: typeof fetch;
  stdin?: NodeJS.ReadStream;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

const defaultTimeoutMs = 15_000;
const defaultUserAgent = "ax-grep/0.1 (+https://github.com/hmmhmmhm/ax-grep)";
const autoSearchEngines: SearchEngine[] = ["duckduckgo", "bing", "startpage"];

function envelopeAgentCanReadCurrentPayload(envelope: object): boolean {
  const agent = (envelope as { agent?: Partial<AgentSummary> }).agent;
  return agent?.needsBrowserHtml === false
    && agent.primaryAction?.action === "read-content"
    && actionExecution(agent.primaryAction) === "read-current";
}

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const fetchImpl = io.fetch ?? globalThis.fetch;
  const stdin = io.stdin ?? process.stdin;

  try {
    const parsedOptions = parseArgs(argv);
    const resolved = await resolveCliInput(parsedOptions, fetchImpl, stdin);
    const options = resolved.options;
    const fetched = resolved.fetched;
    const tree = resolved.tree;
    if (options.openResult) {
      const opened = await openSearchResult(options, fetched, tree, fetchImpl);
      const openedTree = extract(opened.fetched.html, opened.options.extractOptions);
      if (isUnavailableTree(openedTree)) {
        const message = "no inspectable content; if the page is challenged or JavaScript-rendered, pass browser-captured HTML to the library API";
        if (opened.options.format === "json") {
          const errorEnvelope = jsonEnvelope(opened.options, opened.fetched, openedTree, [{ code: "NO_INSPECTABLE_CONTENT", message }], {
            code: "NO_INSPECTABLE_CONTENT",
            message,
            status: opened.fetched.status,
          });
          const canReadCurrentPayload = envelopeAgentCanReadCurrentPayload(errorEnvelope);
          const outputEnvelope = canReadCurrentPayload ? jsonEnvelope(opened.options, opened.fetched, openedTree) : errorEnvelope;
          stdout.write(`${formatJsonOutput(outputEnvelope, opened.options.agentMode)}\n`);
          if (canReadCurrentPayload) return 0;
        } else {
          stderr.write(`ax-grep: warning: ${message}\n`);
          stdout.write(`${formatCliText(openedTree, opened.fetched, opened.options)}\n`);
        }
        return 20;
      }
      const output = opened.options.format === "json"
        ? `${formatJsonOutput(jsonEnvelope(opened.options, opened.fetched, openedTree), opened.options.agentMode)}\n`
        : `${formatCliText(openedTree, opened.fetched, opened.options)}\n`;
      stdout.write(output);
      return 0;
    }
    if (isUnavailableTree(tree)) {
      const message = "no inspectable content; if the page is challenged or JavaScript-rendered, pass browser-captured HTML to the library API";
      if (options.format === "json") {
        const errorEnvelope = jsonEnvelope(options, fetched, tree, [{ code: "NO_INSPECTABLE_CONTENT", message }], {
          code: "NO_INSPECTABLE_CONTENT",
          message,
          status: fetched.status,
        });
        const canReadCurrentPayload = envelopeAgentCanReadCurrentPayload(errorEnvelope);
        const outputEnvelope = canReadCurrentPayload ? jsonEnvelope(options, fetched, tree) : errorEnvelope;
        stdout.write(`${formatJsonOutput(outputEnvelope, options.agentMode)}\n`);
        if (canReadCurrentPayload) return 0;
      } else {
        stderr.write(`ax-grep: warning: ${message}\n`);
        stdout.write(`${formatCliText(tree, fetched, options)}\n`);
      }
      return 20;
    }
    const output = options.format === "json"
      ? `${formatJsonOutput(jsonEnvelope(options, fetched, tree), options.agentMode)}\n`
      : `${formatCliText(tree, fetched, options)}\n`;
    stdout.write(output);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      if (wantsJsonOutput(argv)) {
        const cliError = toCliError(error);
        stdout.write(`${formatJsonOutput(jsonErrorEnvelope(cliError, { ...parseArgMetadata(argv), ...cliError.metadata }), argv.includes("--agent") || argv.includes("--agent-brief"))}\n`);
      } else if (error.exitCode === 0) {
        stdout.write(`${error.message}\n`);
      } else {
        stderr.write(`ax-grep: ${error.message}\n`);
      }
      return error.exitCode;
    }
    if (wantsJsonOutput(argv)) {
      const cliError = toCliError(error);
      stdout.write(`${formatJsonOutput(jsonErrorEnvelope(cliError, { ...parseArgMetadata(argv), ...cliError.metadata }), argv.includes("--agent") || argv.includes("--agent-brief"))}\n`);
      return cliError.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`ax-grep: ${message}\n`);
    return toCliError(error).exitCode;
  }
}

function wantsJsonOutput(argv: string[]): boolean {
  return argv.includes("--json") || argv.includes("--agent") || argv.includes("--agent-brief");
}

function formatJsonOutput(value: object, compact: boolean): string {
  return compact ? JSON.stringify(value) : JSON.stringify(value, null, 2);
}

function parseArgs(argv: string[]): CliOptions {
  const extractOptions: StaticSemanticTreeOptions = {};
  let format: CliFormat = "text";
  let formatOption: CliFormat | undefined;
  let linksOnly = false;
  let omitTree = false;
  let agentMode = false;
  let agentBrief = false;
  let maxTreeLines: number | undefined;
  let input: CliOptions["input"] = "fetch";
  let htmlFile: string | undefined;
  let searchQuery: string | undefined;
  let searchEngine: SearchEngineOption = "auto";
  let searchLang: string | undefined;
  let searchRegion: string | undefined;
  let openResult: CliOptions["openResult"];
  const findQueries: string[] = [];
  let timeoutMs = defaultTimeoutMs;
  let userAgent = defaultUserAgent;
  let url = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      throw new UsageError(usage(), 0);
    }
    if (arg === "--json") {
      if (formatOption && formatOption !== "json") throw new UsageError(`--json and --text cannot be used together`);
      format = "json";
      formatOption = "json";
      continue;
    }
    if (arg === "--agent") {
      if (formatOption && formatOption !== "json") throw new UsageError(`--agent and --text cannot be used together`);
      agentMode = true;
      format = "json";
      formatOption = "json";
      omitTree = true;
      continue;
    }
    if (arg === "--agent-brief") {
      if (formatOption && formatOption !== "json") throw new UsageError(`--agent-brief and --text cannot be used together`);
      agentMode = true;
      agentBrief = true;
      format = "json";
      formatOption = "json";
      omitTree = true;
      continue;
    }
    if (arg === "--text") {
      if (formatOption && formatOption !== "text") throw new UsageError(`--json and --text cannot be used together`);
      format = "text";
      formatOption = "text";
      continue;
    }
    if (arg === "--links-only" || arg === "--summary") {
      linksOnly = true;
      continue;
    }
    if (arg === "--no-tree") {
      omitTree = true;
      continue;
    }
    if (arg === "--html-file") {
      if (input === "stdin") throw new UsageError(`--html-file and --stdin cannot be used together`);
      input = "html-file";
      htmlFile = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--stdin") {
      if (input === "html-file") throw new UsageError(`--html-file and --stdin cannot be used together`);
      input = "stdin";
      continue;
    }
    if (arg === "--search") {
      if (input !== "fetch") throw new UsageError(`--search cannot be used with --html-file or --stdin`);
      searchQuery = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--engine") {
      searchEngine = parseSearchEngine(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--lang") {
      searchLang = parseSearchLang(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--region") {
      searchRegion = parseSearchRegion(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--open-result" || arg === "--open") {
      openResult = parseOpenResult(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--find") {
      findQueries.push(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--include-hidden") {
      extractOptions.includeHidden = true;
      continue;
    }
    if (arg === "--include-text") {
      extractOptions.includeTextNodes = true;
      continue;
    }
    if (arg === "--no-attributes") {
      extractOptions.includeAttributes = false;
      continue;
    }
    if (arg === "--exclude-ads") {
      extractOptions.excludeLikelyAds = true;
      continue;
    }
    if (arg === "--exclude-boilerplate") {
      extractOptions.excludeLikelyBoilerplate = true;
      continue;
    }
    if (arg === "--mode") {
      extractOptions.mode = parseMode(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--max-text-length") {
      extractOptions.maxTextLength = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--max-tree-lines") {
      maxTreeLines = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      timeoutMs = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--user-agent") {
      userAgent = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new UsageError(`unknown option: ${arg}\n\n${usage()}`);
    }
    if (url) {
      throw new UsageError(`expected one URL, got extra argument: ${arg}\n\n${usage()}`);
    }
    url = arg;
  }

  if (searchQuery && url) throw new UsageError(`--search cannot be used with an explicit URL`);
  if (openResult && !searchQuery) throw new UsageError(`--open-result requires --search`);
  if (searchQuery) url = searchUrl(searchQuery, searchEngine === "auto" ? "duckduckgo" : searchEngine, searchLang, searchRegion);
  if (input === "fetch" && !url) throw new UsageError(`missing URL\n\n${usage()}`);
  if (url) validateUrl(url);
  if (input === "html-file" && !htmlFile) throw new UsageError(`--html-file requires a value`);
  const baseUrl = url || (htmlFile ? pathToFileURL(resolve(htmlFile)).toString() : "stdin://ax-grep");
  if (format === "json" && linksOnly) omitTree = true;
  const options: CliOptions = { baseUrl, format, linksOnly, omitTree, agentMode, agentBrief, input, timeoutMs, userAgent, extractOptions };
  if (url) options.url = url;
  if (htmlFile) options.htmlFile = htmlFile;
  if (searchQuery) options.searchQuery = searchQuery;
  if (searchQuery) options.searchEngine = searchEngine;
  if (searchLang) options.searchLang = searchLang;
  if (searchRegion) options.searchRegion = searchRegion;
  if (openResult) options.openResult = openResult;
  if (findQueries.length > 0) options.findQueries = findQueries;
  if (maxTreeLines) options.maxTreeLines = maxTreeLines;
  return options;
}

async function resolveCliInput(
  options: CliOptions,
  fetchImpl: typeof fetch,
  stdin: NodeJS.ReadStream,
): Promise<{ options: CliOptions; fetched: FetchResult; tree: SemanticNode }> {
  if (options.searchQuery && options.searchEngine === "auto") {
    return resolveAutoSearch(options, fetchImpl);
  }
  const fetched = await loadHtml(options, fetchImpl, stdin);
  return { options, fetched, tree: extract(fetched.html, options.extractOptions) };
}

async function resolveAutoSearch(
  options: CliOptions,
  fetchImpl: typeof fetch,
): Promise<{ options: CliOptions; fetched: FetchResult; tree: SemanticNode }> {
  if (!options.searchQuery) throw new UsageError(`--engine auto requires --search`);
  const attempts: SearchAttemptSummary[] = [];
  let best: { options: CliOptions; fetched: FetchResult; tree: SemanticNode; score: number } | undefined;

  for (const engine of autoSearchEngines) {
    const url = searchUrl(options.searchQuery, engine, options.searchLang, options.searchRegion);
    const engineOptions: CliOptions = {
      ...options,
      url,
      baseUrl: url,
      searchEngine: "auto",
      selectedSearchEngine: engine,
    };
    try {
      const fetched = await fetchHtml(engineOptions, fetchImpl);
      const tree = extract(fetched.html, engineOptions.extractOptions);
      const links = summarizeLinks(tree, fetched.finalUrl);
      const outline = summarizeOutline(tree);
      const actions = summarizeActions(tree);
      const content = summarizeContent(tree);
      const results = annotateResults(summarizeSearchResults(fetched, links), options.searchQuery, options.findQueries ?? []);
      const analysis = analyzePage(fetched, tree, links, results, outline, actions, content, engineOptions);
      const unavailable = isUnavailableTree(tree);
      const attempt: SearchAttemptSummary = {
        engine,
        url,
        ok: !unavailable && analysis.kind === "search-results" && results.length > 0,
        resultCount: results.length,
        kind: analysis.kind,
        status: fetched.status,
        finalUrl: fetched.finalUrl,
        diagnostics: analysis.diagnostics,
        ...(results[0] ? {
          topResult: {
            title: results[0].title,
            url: results[0].url,
            ...(results[0].relevance ? { relevance: results[0].relevance } : {}),
            ...(typeof results[0].isLikelyOfficial === "boolean" ? { isLikelyOfficial: results[0].isLikelyOfficial } : {}),
          },
        } : {}),
      };
      attempts.push(attempt);
      const score = scoreAutoSearchAttempt(attempt, unavailable, results);
      if (!best || score > best.score) {
        best = { options: engineOptions, fetched, tree, score };
      }
    } catch (error) {
      const cliError = toCliError(error);
      attempts.push({
        engine,
        url,
        ok: false,
        resultCount: 0,
        error: {
          code: cliError.code,
          message: cliError.message,
          ...(cliError.status ? { status: cliError.status } : {}),
        },
      });
    }
  }

  if (!best) {
    throw new CliError("FETCH_FAILED", "all auto search engines failed", 10, undefined, {
      ...errorMetadataFromOptions(options),
      searchAttempts: attempts,
    });
  }
  if (!attempts.some((attempt) => attempt.ok)) {
    throw new CliError("NO_RESULT", "auto search found no usable results", 21, undefined, {
      ...errorMetadataFromOptions(options),
      ...(best.options.selectedSearchEngine ? { selectedSearchEngine: best.options.selectedSearchEngine } : {}),
      searchAttempts: attempts,
    });
  }

  return {
    options: {
      ...best.options,
      searchAttempts: attempts,
    },
    fetched: best.fetched,
    tree: best.tree,
  };
}

function scoreAutoSearchAttempt(attempt: SearchAttemptSummary, unavailable: boolean, results: ResultSummary[]): number {
  let score = 0;
  if (!attempt.error) score += 100;
  if (!unavailable) score += 25;
  if (attempt.kind === "search-results") score += 500;
  score += Math.min(attempt.resultCount, 20) * 20;
  score += resultQualityScore(results);
  for (const diagnostic of attempt.diagnostics ?? []) {
    if (diagnostic.severity === "error") score -= 100;
    if (/CAPTCHA|CHALLENGE|BLOCK|LOGIN|NO_INSPECTABLE_CONTENT/i.test(diagnostic.code)) score -= 250;
  }
  return score;
}

function resultQualityScore(results: ResultSummary[]): number {
  let score = 0;
  for (const [index, result] of results.entries()) {
    const rankWeight = Math.max(1, 10 - index);
    if (result.relevance === "high") score += 25 * rankWeight;
    else if (result.relevance === "medium") score += 8 * rankWeight;
    score += (result.findMatches?.length ?? 0) * 18 * rankWeight;
    if (result.isLikelyOfficial) score += 30 * rankWeight;
    score += (result.matchedTerms?.length ?? 0) * rankWeight;
  }
  return score;
}

function recommendedSearchResult(results: ResultSummary[], findQueries: string[] = []): ResultSummary | undefined {
  if (findQueries.length > 0 && !results.some((result) => matchedFindQueriesForResult(result, findQueries).length > 0 || (result.findMatches?.length ?? 0) > 0)) {
    return undefined;
  }
  const recommended = [...results].sort((left, right) => {
    const scoreDelta = singleResultRecommendationScore(right, findQueries) - singleResultRecommendationScore(left, findQueries);
    if (scoreDelta !== 0) return scoreDelta;
    return left.rank - right.rank;
  })[0];
  if (!recommended) return undefined;
  if ((recommended.findMatches?.length ?? 0) > 0 || matchedFindQueriesForResult(recommended, findQueries).length > 0) return recommended;
  if (recommended.isLikelyOfficial || recommended.relevance === "high" || recommended.relevance === "medium" || recommended.relevance === undefined) return recommended;
  return undefined;
}

function searchOpenCommand(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  openResult: number | "best" = "best",
  timeoutMs?: number,
  userAgent?: string,
): string | undefined {
  return searchOpenCommandSpec(query, engine, findQueries, agentMode, lang, region, openResult, timeoutMs, userAgent)?.command;
}

function searchOpenCommandSpec(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  openResult: number | "best" = "best",
  timeoutMs?: number,
  userAgent?: string,
): CommandSpec | undefined {
  if (!query) return undefined;
  const commandArgs = ["ax-grep", "--search", query];
  const shellArgs = ["ax-grep", "--search", shellQuote(query)];
  if (engine && engine !== "auto") pushCommandOption(commandArgs, shellArgs, "--engine", engine);
  if (lang) pushCommandOption(commandArgs, shellArgs, "--lang", lang);
  if (region) pushCommandOption(commandArgs, shellArgs, "--region", region);
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  pushCommandOption(commandArgs, shellArgs, "--open-result", String(openResult));
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function searchCommand(query: string, agentMode = false, timeoutMs?: number, userAgent?: string): string {
  return searchCommandSpec(query, agentMode, timeoutMs, userAgent).command;
}

function searchCommandSpec(query: string, agentMode = false, timeoutMs?: number, userAgent?: string): CommandSpec {
  const commandArgs = ["ax-grep", "--search", query];
  const shellArgs = ["ax-grep", "--search", shellQuote(query)];
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function verificationSearchCommand(findQueries: string[], agentMode = false, timeoutMs?: number, userAgent?: string): string {
  return verificationSearchCommandSpec(findQueries, agentMode, timeoutMs, userAgent).command;
}

function verificationSearchCommandSpec(findQueries: string[], agentMode = false, timeoutMs?: number, userAgent?: string): CommandSpec {
  const query = findQueries.length > 0 ? findQueries.join(" ") : "missing evidence";
  const commandArgs = ["ax-grep", "--search", query];
  const shellArgs = ["ax-grep", "--search", shellQuote(query)];
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function refineSearchCommand(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  timeoutMs?: number,
  userAgent?: string,
): string | undefined {
  return refineSearchCommandSpec(query, engine, findQueries, agentMode, lang, region, timeoutMs, userAgent)?.command;
}

function refineSearchCommandSpec(
  query: string | undefined,
  engine?: SearchEngineOption,
  findQueries: string[] = [],
  agentMode = false,
  lang?: string,
  region?: string,
  timeoutMs?: number,
  userAgent?: string,
): CommandSpec | undefined {
  if (!query) return undefined;
  const terms = queryTerms(query);
  const essentialTerms = essentialQueryTerms(terms);
  const baseQuery = essentialTerms.length > 0
    ? [essentialTerms.map((term) => `"${term}"`).join(" "), ...terms.filter((term) => !essentialTerms.includes(term))].filter(Boolean).join(" ")
    : query;
  const refinedQuery = addMissingFindTextToQuery(baseQuery, findQueries);
  const commandArgs = ["ax-grep", "--search", refinedQuery];
  const shellArgs = ["ax-grep", "--search", shellQuote(refinedQuery)];
  if (engine && engine !== "auto") pushCommandOption(commandArgs, shellArgs, "--engine", engine);
  if (lang) pushCommandOption(commandArgs, shellArgs, "--lang", lang);
  if (region) pushCommandOption(commandArgs, shellArgs, "--region", region);
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function addMissingFindTextToQuery(query: string, findQueries: string[]): string {
  if (findQueries.length === 0) return query;
  const queryTermsSet = new Set(queryTerms(query).map(normalizeForMatch));
  const additions = findQueries.filter((findQuery) => {
    const missingTerms = queryTerms(findQuery)
      .map(normalizeForMatch)
      .filter((term) => !queryTermsSet.has(term));
    return missingTerms.length > 0;
  });
  if (additions.length === 0) return query;
  return [...additions.map((item) => `"${item}"`), query].join(" ");
}

function pageCommand(url: string, agentMode: boolean, browserHtml = false, findQueries: string[] = [], timeoutMs?: number, userAgent?: string): string {
  return pageCommandSpec(url, agentMode, browserHtml, findQueries, timeoutMs, userAgent).command;
}

function pageCommandSpec(url: string, agentMode: boolean, browserHtml = false, findQueries: string[] = [], timeoutMs?: number, userAgent?: string): CommandSpec {
  const commandArgs = ["ax-grep", url];
  const shellArgs = ["ax-grep", shellQuote(url)];
  if (browserHtml) pushCommandOption(commandArgs, shellArgs, "--html-file", "captured.html");
  appendCommandFetchOptions(commandArgs, shellArgs, timeoutMs, userAgent);
  for (const findQuery of findQueries) pushCommandOption(commandArgs, shellArgs, "--find", findQuery, true);
  if (agentMode) pushCommandFlag(commandArgs, shellArgs, "--agent");
  else pushCommandFlag(commandArgs, shellArgs, "--json", "--summary");
  return { command: shellArgs.join(" "), commandArgs };
}

function siteSearchCommandSpec(form: PageFormSummary | undefined, findQueries: string[], agentMode: boolean, timeoutMs?: number, userAgent?: string): (CommandSpec & { url: string }) | undefined {
  if (!form?.urlTemplate || findQueries.length === 0) return undefined;
  const query = findQueries.join(" ");
  const url = fillSearchUrlTemplate(form.urlTemplate, query);
  if (!url) return undefined;
  return { ...pageCommandSpec(url, agentMode, false, findQueries, timeoutMs, userAgent), url };
}

function fillSearchUrlTemplate(template: string, query: string): string | undefined {
  if (!template || !query) return undefined;
  const encoded = encodeURIComponent(query);
  const replaced = template
    .replaceAll("%7Bquery%7D", encoded)
    .replaceAll("{query}", encoded)
    .replaceAll("%7Bsearch_term_string%7D", encoded)
    .replaceAll("{search_term_string}", encoded);
  if (replaced === template) return undefined;
  try {
    return new URL(replaced).toString();
  } catch {
    return undefined;
  }
}

function appendCommandFetchOptions(commandArgs: string[], shellArgs: string[], timeoutMs?: number, userAgent?: string): void {
  if (typeof timeoutMs === "number" && timeoutMs !== defaultTimeoutMs) pushCommandOption(commandArgs, shellArgs, "--timeout", String(timeoutMs));
  if (userAgent && userAgent !== defaultUserAgent) pushCommandOption(commandArgs, shellArgs, "--user-agent", userAgent, true);
}

function pushCommandFlag(commandArgs: string[], shellArgs: string[], ...flags: string[]): void {
  commandArgs.push(...flags);
  shellArgs.push(...flags);
}

function pushCommandOption(commandArgs: string[], shellArgs: string[], flag: string, value: string, quoteValue = false): void {
  commandArgs.push(flag, value);
  shellArgs.push(flag, quoteValue ? shellQuote(value) : value);
}

function commandFields(spec: CommandSpec | undefined): Pick<SuggestedAction, "command" | "commandArgs"> {
  return spec ? { command: spec.command, commandArgs: spec.commandArgs } : {};
}

function afterInteractionCommandFields(spec: CommandSpec | undefined): Pick<SuggestedAction, "afterInteractionCommand" | "afterInteractionCommandArgs"> {
  return spec ? { afterInteractionCommand: spec.command, afterInteractionCommandArgs: spec.commandArgs } : {};
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function singleResultRecommendationScore(result: ResultSummary, findQueries: string[] = []): number {
  let score = 0;
  score += resultFindMatchScore(result, findQueries);
  score += resultFreshnessMatchScore(result);
  if (result.isLikelyOfficial) score += 100;
  const sourceWeight = result.relevance === "low" && !result.isLikelyOfficial ? 8 : 35;
  score += (result.sourceScore ?? 0) * sourceWeight;
  if (result.relevance === "high") score += 75;
  else if (result.relevance === "medium") score += 30;
  score += (result.matchedTerms?.length ?? 0) * 12;
  score += Math.max(0, 10 - result.rank);
  return score;
}

function resultFreshnessMatchScore(result: Pick<ResultSummary, "matchedTerms" | "dateText">): number {
  const matched = result.matchedTerms?.filter(isFreshnessQueryTerm) ?? [];
  if (matched.length > 0) return 90 + matched.length * 20;
  return result.dateText && result.matchedTerms?.some((term) => /latest|current|recent|new|update/i.test(term)) ? 45 : 0;
}

function isFreshnessQueryTerm(term: string): boolean {
  return /^(?:20\d{2}|latest|current|recent|new|newest|updated?|today|이번|최신|최근)$/.test(term.toLowerCase());
}

function searchResultActionReason(recommended: ResultSummary, first: ResultSummary): string {
  if ((recommended.findMatches?.length ?? 0) > 0) {
    return `The page looks like search results; open the result matching --find: ${recommended.findMatches?.join(", ")}.`;
  }
  const freshnessTerms = recommended.matchedTerms?.filter(isFreshnessQueryTerm) ?? [];
  if (freshnessTerms.length > 0) {
    return `The page looks like search results; open the result matching freshness terms: ${freshnessTerms.join(", ")}.`;
  }
  if (recommended.rank === first.rank) {
    return "The page looks like search results; open the highest-ranked relevant result.";
  }
  return "The page looks like search results; open the result with the strongest query match.";
}

function resultFindMatchScore(result: ResultSummary, findQueries: string[]): number {
  const explicitMatches = result.findMatches?.length ?? 0;
  if (explicitMatches > 0) return explicitMatches * 120;
  const matches = matchedFindQueriesForResult(result, findQueries);
  return matches.length * 120;
}

async function openSearchResult(
  options: CliOptions,
  searchFetched: FetchResult,
  searchTree: SemanticNode,
  fetchImpl: typeof fetch,
): Promise<{ options: CliOptions; fetched: FetchResult }> {
  if (isUnavailableTree(searchTree)) {
    return { options, fetched: searchFetched };
  }
  const requested = options.openResult;
  if (!requested || !options.searchQuery || !options.searchEngine) {
    throw new UsageError(`--open-result requires --search`);
  }
  const links = summarizeLinks(searchTree, searchFetched.finalUrl);
  const results = annotateResults(summarizeSearchResults(searchFetched, links), options.searchQuery, options.findQueries ?? []);
  const selected = requested === "best" ? recommendedSearchResult(results, options.findQueries ?? []) : results[requested - 1];
  if (!selected) {
    throw new CliError("NO_RESULT", `search result ${requested} is not available; found ${results.length}`, 21);
  }
  const alternateResults = results.filter((result) => result.url !== selected.url).slice(0, 4)
    .map((result, index) => withResultReference(result, `a${result.rank}`, `sourceSearch.alternateResults[${index}]`));
  const openedOptions: CliOptions = {
    ...options,
    url: selected.url,
    baseUrl: selected.url,
    input: "fetch",
    sourceSearch: {
      query: options.searchQuery,
      engine: options.selectedSearchEngine ?? options.searchEngine,
      ...(options.searchEngine === "auto" && options.selectedSearchEngine ? { selectedEngine: options.selectedSearchEngine } : {}),
      searchUrl: searchFetched.finalUrl,
      ...(options.searchLang ? { lang: options.searchLang } : {}),
      ...(options.searchRegion ? { region: options.searchRegion } : {}),
      ...(options.timeoutMs !== defaultTimeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== defaultUserAgent ? { userAgent: options.userAgent } : {}),
      ...(options.findQueries?.length ? { findQueries: options.findQueries } : {}),
      selectedRank: selected.rank,
      selectedTitle: selected.title,
      selectedUrl: selected.url,
      selectedResult: withResultReference(selected, "selected", "sourceSearch.selectedResult"),
      alternateResults,
    },
  };
  let openedFetched: FetchResult;
  try {
    openedFetched = await fetchHtml(openedOptions, fetchImpl);
  } catch (error) {
    const cliError = toCliError(error);
    throw new CliError(cliError.code, cliError.message, cliError.exitCode, cliError.status, errorMetadataFromOptions(openedOptions));
  }
  return { options: openedOptions, fetched: openedFetched };
}

function withResultReference(result: ResultSummary, id: string, path: string): ResultSummary {
  return { ...result, id, path };
}

function errorMetadataFromOptions(options: CliOptions): Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "findQueries" | "timeoutMs" | "userAgent">> {
  const metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "findQueries" | "timeoutMs" | "userAgent">> = {
    extractOptions: options.extractOptions,
  };
  if (options.url) metadata.url = options.url;
  if (options.searchQuery) metadata.searchQuery = options.searchQuery;
  if (options.searchEngine) metadata.searchEngine = options.searchEngine;
  if (options.selectedSearchEngine) metadata.selectedSearchEngine = options.selectedSearchEngine;
  if (options.searchAttempts) metadata.searchAttempts = options.searchAttempts;
  if (options.searchLang) metadata.searchLang = options.searchLang;
  if (options.searchRegion) metadata.searchRegion = options.searchRegion;
  if (options.sourceSearch) metadata.sourceSearch = options.sourceSearch;
  if (options.findQueries?.length) metadata.findQueries = options.findQueries;
  if (options.timeoutMs !== defaultTimeoutMs) metadata.timeoutMs = options.timeoutMs;
  if (options.userAgent !== defaultUserAgent) metadata.userAgent = options.userAgent;
  return metadata;
}

async function loadHtml(options: CliOptions, fetchImpl: typeof fetch, stdin: NodeJS.ReadStream): Promise<FetchResult> {
  if (options.input === "fetch") return fetchHtml(options, fetchImpl);
  if (options.input === "html-file") {
    const htmlFile = options.htmlFile;
    if (!htmlFile) throw new UsageError(`--html-file requires a value`);
    const html = await readFile(htmlFile, "utf8");
    return {
      html,
      finalUrl: options.baseUrl,
      status: 0,
      contentType: "text/html",
      responseHeaders: {},
      page: extractPageSummary(html, options.baseUrl),
    };
  }
  const html = await readStdin(stdin);
  return {
    html,
    finalUrl: options.baseUrl,
    status: 0,
    contentType: "text/html",
    responseHeaders: {},
    page: extractPageSummary(html, options.baseUrl),
  };
}

async function fetchHtml(options: CliOptions, fetchImpl: typeof fetch): Promise<FetchResult> {
  if (!options.url) throw new UsageError(`missing URL\n\n${usage()}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(options.url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(options.searchLang || options.searchRegion ? { "accept-language": acceptLanguageHeader(options.searchLang, options.searchRegion) } : {}),
        "user-agent": options.userAgent,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CliError("HTTP_ERROR", `fetch failed with HTTP ${response.status} ${response.statusText}`.trim(), 12, response.status);
    }
    const html = await response.text();
    const finalUrl = response.url || options.url;
    return {
      html,
      finalUrl: response.url || options.url,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      responseHeaders: selectedResponseHeaders(response.headers),
      page: extractPageSummary(html, finalUrl),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CliError("TIMEOUT", `fetch timed out after ${options.timeoutMs}ms`, 11);
    }
    if (!(error instanceof CliError)) {
      throw new CliError("FETCH_FAILED", error instanceof Error ? error.message : String(error), 10);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const responseHeaderAllowlist = [
  "cache-control",
  "content-security-policy",
  "permissions-policy",
  "referrer-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "x-robots-tag",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
] as const;

function selectedResponseHeaders(headers: Headers): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const name of responseHeaderAllowlist) {
    const value = cleanLinkText(headers.get(name) ?? "");
    if (value) selected[name] = value.slice(0, 320);
  }
  return selected;
}

function acceptLanguageHeader(lang?: string, region?: string): string {
  if (lang && region) return `${lang}-${region},${lang};q=0.9`;
  if (lang) return lang;
  if (region) return `en-${region},en;q=0.9`;
  return "";
}

async function readStdin(stdin: NodeJS.ReadStream): Promise<string> {
  stdin.setEncoding("utf8");
  let html = "";
  for await (const chunk of stdin) {
    html += chunk;
  }
  return html;
}

function readValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new UsageError(`${option} requires a value`);
  return value;
}

function parseMode(value: string): NonNullable<StaticSemanticTreeOptions["mode"]> {
  if (value === "compact" || value === "interactive" || value === "full") return value;
  throw new UsageError(`--mode must be compact, interactive, or full`);
}

function parseSearchEngine(value: string): SearchEngineOption {
  if (value === "auto" || value === "bing" || value === "duckduckgo" || value === "startpage") return value;
  throw new UsageError(`--engine must be auto, bing, duckduckgo, or startpage`);
}

function parseSearchLang(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z]{2})?$/.test(normalized)) throw new UsageError(`--lang must be a language code like en, ko, ja, or zh-cn`);
  return normalized;
}

function parseSearchRegion(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new UsageError(`--region must be a two-letter region code like US, KR, JP, or CN`);
  return normalized;
}

function searchUrl(query: string, engine: SearchEngine, lang?: string, region?: string): string {
  if (engine === "bing") {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", query);
    if (lang) url.searchParams.set("setlang", lang);
    if (region) url.searchParams.set("cc", region);
    if (lang && region) url.searchParams.set("mkt", `${lang}-${region}`);
    return url.toString();
  }
  if (engine === "startpage") {
    const url = new URL("https://www.startpage.com/sp/search");
    url.searchParams.set("query", query);
    if (lang) url.searchParams.set("language", lang);
    if (region) url.searchParams.set("region", region);
    return url.toString();
  }
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  if (lang && region) url.searchParams.set("kl", `${region.toLowerCase()}-${lang}`);
  else if (region) url.searchParams.set("kl", `${region.toLowerCase()}-${region.toLowerCase()}`);
  return url.toString();
}

function parseOpenResult(value: string, option: string): number | "best" {
  if (value.trim().toLowerCase() === "best") return "best";
  return parsePositiveInteger(value, option);
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new UsageError(`${option} must be a positive integer`);
  return parsed;
}

function validateUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UsageError(`URL must be absolute`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UsageError(`URL must use http or https`);
  }
}

function usage(): string {
  return `Usage: ax-grep <url> [options]

Fetch a page and print a compact semantic accessibility-like tree.

Options:
  --search <query>           Search the web and analyze the result page.
  --engine <name>            Search engine for --search: auto, duckduckgo, bing, or startpage. Default: auto.
  --lang <code>              Search language hint, e.g. en, ko, ja, zh-cn.
  --region <code>            Search region hint, e.g. US, KR, JP, CN.
  --open-result <n|best>     With --search, fetch and analyze the selected result.
  --find <text>              Check whether page summaries contain text. Repeatable.
  --agent                    Print compact JSON for agent routing; read agent.handoff first.
  --agent-brief              Print smaller executor JSON for subagent loops.
  --json                     Print the SemanticNode tree as JSON.
  --text                     Print the compact text tree. This is the default.
  --mode <compact|interactive|full>
  --include-hidden           Include hidden and collapsed content.
  --include-text             Include static text nodes.
  --no-attributes            Omit element attributes from JSON output.
  --exclude-ads              Prune likely ad and promotion regions.
  --exclude-boilerplate      Prune likely forum/search boilerplate.
  --links-only, --summary    Print only the ranked links summary in text mode; omit tree in JSON mode.
  --no-tree                  Omit the raw tree from JSON output.
  --max-tree-lines <n>       Limit tree lines after the links summary.
  --html-file <path>         Extract from browser-captured HTML instead of fetch.
  --stdin                    Read HTML from stdin instead of fetch.
  --max-text-length <n>      Limit direct text/name fragments.
  --timeout <ms>             Fetch timeout. Default: ${defaultTimeoutMs}.
  --user-agent <value>       Override the request User-Agent.
  -h, --help                 Show this help.

Notes:
  The CLI uses fetch only. It does not run JavaScript or bypass bot checks.
  Use --html-file or --stdin with a URL argument for browser-captured HTML.
  Text output starts with a deduplicated links summary for agent navigation.
  --agent and --agent-brief imply --json --no-tree and expose agent.handoff for the next executor step.
  JSON output is an envelope with fetch metadata, analysis, links, results, warnings, and tree unless --no-tree is set.`;
}

class UsageError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message);
  }
}

class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
    readonly exitCode: number,
    readonly status?: number,
    readonly metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "findQueries" | "timeoutMs" | "userAgent">> = {},
  ) {
    super(message);
  }
}

function formatCliText(
  node: SemanticNode,
  fetched: FetchResult,
  options: Pick<CliOptions, "linksOnly" | "maxTreeLines" | "sourceSearch" | "findQueries" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchLang" | "searchRegion" | "agentMode" | "timeoutMs" | "userAgent">,
): string {
  const baseUrl = fetched.finalUrl;
  const links = summarizeLinks(node, baseUrl);
  const lines: string[] = links.length > 0 ? formatLinksText(links) : [];
  if (options.linksOnly) return lines.join("\n");
  appendSection(lines, formatSourceSearchText(options.sourceSearch));
  appendSection(lines, formatPageText(fetched.page));
  const outline = summarizeOutline(node);
  const actions = summarizeActions(node);
  const content = summarizeContent(node);
  const results = annotateResults(summarizeSearchResults(fetched, links), options.searchQuery, options.findQueries ?? []);
  const analysis = analyzePage(fetched, node, links, results, outline, actions, content, options);
  const pageCheck = summarizePageCheck(fetched, links, outline, actions, content, analysis, options.agentMode, false, options.timeoutMs, options.userAgent);
  const finds = summarizeFinds(options.findQueries ?? [], fetched.page, pageCheck, links, results, outline, content, analysis.kind);
  const verification = summarizeVerification(finds, pageCheck, fetched.finalUrl, analysis, options.agentMode, false, options.sourceSearch, options.timeoutMs, options.userAgent);
  const recommendedResult = analysis.kind === "search-results" ? recommendedSearchResult(results, options.findQueries ?? []) : undefined;
  const agent = summarizeAgent(
    analysis,
    pageCheck,
    verification,
    results,
    recommendedResult,
    undefined,
    false,
    options.sourceSearch,
    fetched,
    undefined,
    options.agentMode,
    options.findQueries ?? [],
    options.timeoutMs,
    options.userAgent,
    summarizeAgentSemanticSummary(node, fetched.finalUrl),
  );
  appendSection(lines, formatAgentText(agent));
  appendSection(lines, formatAnalysisText(analysis));
  appendSection(lines, formatPageCheckText(pageCheck));
  appendSection(lines, formatVerificationText(verification));
  appendSection(lines, formatFindsText(finds));
  appendSection(lines, formatResultsText(results));
  appendSection(lines, formatOutlineText(outline));
  appendSection(lines, formatActionsText(actions));
  appendSection(lines, formatContentText(content));
  const treeLines: string[] = [];
  function visit(current: SemanticNode, depth: number): void {
    const prefix = lines.length > 0 ? `  ${"  ".repeat(depth)}` : "  ".repeat(depth);
    const role = current.role || current.tag;
    const marker = current.interactive ? "[i] " : "";
    const name = current.name ? ` '${current.name}'` : "";
    const href = current.role === "link" ? formatHref(current, baseUrl) : "";
    const state = formatState(current);
    const unavailable = current.unavailableReason ? ` (${current.unavailableReason})` : "";
    treeLines.push(`${prefix}${marker}${role}${name}${href}${state}${unavailable}`);
    for (const child of current.children) visit(child, depth + 1);
  }
  visit(node, 0);
  if (lines.length > 0) lines.push("", "tree");
  const maxTreeLines = options.maxTreeLines ?? (looksLikeKnownSearchUrl(fetched.finalUrl) || looksLikeGenericSearchUrl(fetched.finalUrl) ? 80 : undefined);
  if (maxTreeLines && treeLines.length > maxTreeLines) {
    lines.push(...treeLines.slice(0, maxTreeLines));
    lines.push(`  ... ${treeLines.length - maxTreeLines} tree lines omitted`);
  } else {
    lines.push(...treeLines);
  }
  return lines.join("\n");
}

function formatLinksText(links: LinkSummary[]): string[] {
  return [
    "links",
    ...links.map((link, index) => `  ${index + 1}. ${link.text || link.role} <${link.url}>`),
  ];
}

function appendSection(lines: string[], section: string[]): void {
  if (section.length === 0) return;
  if (lines.length > 0) lines.push("");
  lines.push(...section);
}

function formatPageText(page: PageSummary): string[] {
  const lines = [];
  if (page.title) lines.push(`  title: ${page.title}`);
  if (page.description) lines.push(`  description: ${page.description}`);
  if (page.canonicalUrl) lines.push(`  canonical: ${page.canonicalUrl}`);
  if (page.lang) lines.push(`  lang: ${page.lang}`);
  if (page.dir) lines.push(`  dir: ${page.dir}`);
  if (page.siteName) lines.push(`  site: ${page.siteName}`);
  if (page.author) lines.push(`  author: ${page.author}`);
  if (page.publishedTime) lines.push(`  published: ${page.publishedTime}`);
  if (page.modifiedTime) lines.push(`  modified: ${page.modifiedTime}`);
  if (page.structuredDataTypes?.length) lines.push(`  schemaTypes: ${page.structuredDataTypes.join(", ")}`);
  return lines.length > 0 ? ["page", ...lines] : [];
}

function formatSourceSearchText(sourceSearch?: SourceSearchSummary): string[] {
  if (!sourceSearch) return [];
  const locale = [sourceSearch.lang, sourceSearch.region].filter(Boolean).join("/");
  return [
    "source",
    `  search: ${sourceSearch.query} via ${sourceSearch.engine}`,
    ...(locale ? [`  locale: ${locale}`] : []),
    `  selected: ${sourceSearch.selectedRank}. ${sourceSearch.selectedTitle} <${sourceSearch.selectedUrl}>`,
    `  result page: ${sourceSearch.searchUrl}`,
  ];
}

function formatOutlineText(outline: OutlineSummary[]): string[] {
  if (outline.length === 0) return [];
  return [
    "outline",
    ...outline.map((item, index) => {
      const level = item.level ? `h${item.level}` : "heading";
      return `  ${index + 1}. ${level} ${item.text}`;
    }),
  ];
}

function formatActionsText(actions: ActionSummary[]): string[] {
  if (actions.length === 0) return [];
  return [
    "actions",
    ...actions.map((action, index) => `  ${index + 1}. ${action.type} ${action.text}`),
  ];
}

function formatAnalysisText(analysis: AnalysisSummary): string[] {
  const lines = [`  kind: ${analysis.kind}`];
  for (const diagnostic of analysis.diagnostics) {
    lines.push(`  ${diagnostic.severity}: ${diagnostic.code} - ${diagnostic.message}`);
  }
  for (const action of analysis.suggestedActions) {
    const url = action.url ? ` <${action.url}>` : "";
    lines.push(`  next: ${action.action}${url} - ${action.reason}`);
  }
  return ["analysis", ...lines];
}

function formatAgentSignalText(signal: AgentSignal, prefix = "signal"): string {
  return `  ${prefix}: ${signal.kind}/${signal.severity} - ${signal.message}`;
}

function formatAgentQualityGateText(gate: AgentQualityGate, prefix = "qualityGate"): string {
  const score = typeof gate.score === "number" ? ` score=${gate.score}` : "";
  const path = gate.path ? ` path=${gate.path}` : "";
  return `  ${prefix}: ${gate.kind} ${gate.pass ? "pass" : "fail"}/${gate.severity}${score}${path} - ${gate.message}`;
}

function formatAgentCitationText(citation: AgentCitation, prefix = "citation"): string {
  const score = typeof citation.score === "number" ? ` score=${citation.score}` : "";
  const target = citation.url ? ` <${citation.url}>` : "";
  const label = citation.text ?? citation.title ?? citation.url ?? "";
  const confidence = citation.confidence ? ` ${citation.confidence}` : "";
  const reason = citation.reason ? ` - ${citation.reason}` : "";
  return `  ${prefix}: ${citation.id} ${citation.path} ${citation.kind}${confidence}${score}${reason} ${label}${target}`;
}

function formatAgentReadValueText(readValue: AgentReadValue, prefix = "handoffReadValue"): string[] {
  const lines = [`  ${prefix}: ${readValue.path}`];
  if (Array.isArray(readValue.value)) {
    lines.push(`  ${prefix}Type: array count=${readValue.value.length}`);
    for (const [index, item] of readValue.value.slice(0, 3).entries()) {
      lines.push(`  ${prefix}Item: ${formatAgentReadValueItemText(item, `${readValue.path}[${index}]`)}`);
    }
    if (readValue.value.length > 3) lines.push(`  ${prefix}Omitted: ${readValue.value.length - 3}`);
    return lines;
  }
  if (readValue.value && typeof readValue.value === "object") {
    lines.push(`  ${prefix}Type: object`);
    lines.push(`  ${prefix}Item: ${formatAgentReadValueItemText(readValue.value, readValue.path)}`);
    return lines;
  }
  lines.push(`  ${prefix}Type: ${typeof readValue.value}`);
  lines.push(`  ${prefix}Value: ${String(readValue.value)}`);
  return lines;
}

function formatAgentReadValueItemText(value: unknown, fallbackPath: string): string {
  if (!value || typeof value !== "object") return `${fallbackPath} - ${String(value)}`;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "string" ? ` ${item.id}` : "";
  const path = typeof item.path === "string" ? item.path : fallbackPath;
  const rank = typeof item.rank === "number" ? ` rank=${item.rank}` : "";
  const role = typeof item.role === "string" ? ` role=${item.role}` : "";
  const kind = typeof item.kind === "string" ? ` kind=${item.kind}` : "";
  const score = typeof item.score === "number" ? ` score=${item.score}` : typeof item.sourceScore === "number" ? ` score=${item.sourceScore}` : "";
  const confidence = typeof item.confidence === "string" ? ` confidence=${item.confidence}` : "";
  const url = typeof item.url === "string" ? ` <${item.url}>` : "";
  const label = [item.title, item.text, item.snippet, item.selectionReason, item.reason]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0) ?? "";
  return `${path}${id}${rank}${role}${kind}${score}${confidence}${url}${label ? ` - ${label}` : ""}`;
}

function formatAgentResultChoiceText(choice: AgentResultChoice, prefix = "resultChoice"): string[] {
  const rank = typeof choice.rank === "number" ? ` rank=${choice.rank}` : "";
  const flags = [
    choice.recommended ? "recommended" : "",
    choice.primary ? "primary" : "",
    choice.recommendedPath ? `via=${choice.recommendedPath}` : "",
  ].filter(Boolean).join(" ");
  const flagText = flags ? ` ${flags}` : "";
  const score = typeof choice.sourceScore === "number" ? ` score=${choice.sourceScore}` : "";
  const relevance = choice.relevance ? ` relevance=${choice.relevance}` : "";
  const date = choice.date ? ` date=${choice.date}` : "";
  const source = choice.source ? ` source=${choice.source}` : "";
  const sourceType = choice.sourceType ? ` type=${choice.sourceType}` : "";
  const official = typeof choice.isLikelyOfficial === "boolean" ? ` official=${choice.isLikelyOfficial}` : "";
  const matchedTerms = choice.matchedTerms?.length ? ` terms=${choice.matchedTerms.join(",")}` : "";
  const findMatches = choice.findMatches?.length ? ` find=${choice.findMatches.join(",")}` : "";
  const sitelinks = choice.sitelinks?.length ? ` sitelinks=${choice.sitelinks.length}` : "";
  const target = choice.url ? ` <${choice.url}>` : "";
  const reason = choice.selectionReason ? ` - ${choice.selectionReason}` : "";
  const title = choice.title ? ` ${choice.title}` : "";
  const lines = [`  ${prefix}: ${choice.id} ${choice.path}${rank}${flagText}${score}${relevance}${date}${source}${sourceType}${official}${matchedTerms}${findMatches}${sitelinks}${target}${reason}${title}`];
  if (choice.snippet) lines.push(`    snippet: ${choice.snippet}`);
  if (choice.command) lines.push(`    command: ${choice.command}`);
  if (choice.commandArgs) lines.push(`    commandArgs: ${formatCommandArgsText(choice.commandArgs)}`);
  return lines;
}

function formatAgentSourceChoiceText(choice: AgentSourceChoice, prefix = "sourceChoice"): string[] {
  const rank = typeof choice.rank === "number" ? ` rank=${choice.rank}` : "";
  const primary = choice.primary ? " primary" : "";
  const score = typeof choice.sourceScore === "number" ? ` score=${choice.sourceScore}` : "";
  const source = choice.source ? ` source=${choice.source}` : "";
  const sourceType = choice.sourceType ? ` type=${choice.sourceType}` : "";
  const kind = choice.kind ? ` kind=${choice.kind}` : "";
  const official = typeof choice.isLikelyOfficial === "boolean" ? ` official=${choice.isLikelyOfficial}` : "";
  const target = choice.url ? ` <${choice.url}>` : "";
  const reason = choice.selectionReason ? ` - ${choice.selectionReason}` : "";
  const title = choice.title ? ` ${choice.title}` : "";
  const lines = [`  ${prefix}: ${choice.id} ${choice.path}${rank}${primary}${score}${source}${sourceType}${kind}${official}${target}${reason}${title}`];
  if (choice.command) lines.push(`    command: ${choice.command}`);
  if (choice.commandArgs) lines.push(`    commandArgs: ${formatCommandArgsText(choice.commandArgs)}`);
  return lines;
}

function formatAgentFormChoiceText(choice: AgentFormChoice, prefix = "formChoice"): string[] {
  const action = choice.actionUrl ? ` <${choice.actionUrl}>` : "";
  const query = choice.queryField ? ` query=${choice.queryField}` : "";
  const template = choice.urlTemplate ? ` template=${choice.urlTemplate}` : "";
  const selector = choice.selector ? ` selector=${choice.selector}` : "";
  const submit = choice.submitText ? ` submit=${choice.submitText}` : "";
  return [`  ${prefix}: ${choice.id} ${choice.path} rank=${choice.rank} method=${choice.method} fields=${choice.fieldCount}${query}${template}${selector}${action}${submit} - ${choice.text}`];
}

function formatAgentActionTargetChoiceText(choice: AgentActionTargetChoice, prefix = "actionTargetChoice"): string[] {
  const target = choice.targetUrl ? ` <${choice.targetUrl}>` : "";
  const template = choice.urlTemplate ? ` template=${choice.urlTemplate}` : "";
  const query = choice.queryInput ? ` queryInput=${choice.queryInput}` : "";
  const method = choice.method ? ` method=${choice.method}` : "";
  const disabled = typeof choice.disabled === "boolean" ? ` disabled=${choice.disabled}` : "";
  const pressed = typeof choice.pressed !== "undefined" ? ` pressed=${choice.pressed}` : "";
  const expanded = typeof choice.expanded === "boolean" ? ` expanded=${choice.expanded}` : "";
  const haspopup = typeof choice.haspopup !== "undefined" ? ` haspopup=${choice.haspopup}` : "";
  const controls = choice.controls ? ` controls=${choice.controls}` : "";
  const selector = choice.selector ? ` selector=${choice.selector}` : "";
  return [`  ${prefix}: ${choice.id} ${choice.path} rank=${choice.rank} kind=${choice.kind} source=${choice.source}${template}${query}${method}${disabled}${pressed}${expanded}${haspopup}${controls}${selector}${target} - ${choice.name}`];
}

function formatAgentSourceSearchResultText(result: AgentSourceSearchResult, prefix: string): string[] {
  const rank = typeof result.rank === "number" ? ` rank=${result.rank}` : "";
  const openResult = result.openResult ? ` openResult=${result.openResult}` : "";
  const score = typeof result.sourceScore === "number" ? ` score=${result.sourceScore}` : "";
  const relevance = result.relevance ? ` relevance=${result.relevance}` : "";
  const date = result.date ? ` date=${result.date}` : "";
  const source = result.source ? ` source=${result.source}` : "";
  const sourceType = result.sourceType ? ` type=${result.sourceType}` : "";
  const official = typeof result.isLikelyOfficial === "boolean" ? ` official=${result.isLikelyOfficial}` : "";
  const matchedTerms = result.matchedTerms?.length ? ` terms=${result.matchedTerms.join(",")}` : "";
  const findMatches = result.findMatches?.length ? ` find=${result.findMatches.join(",")}` : "";
  const sitelinks = result.sitelinks?.length ? ` sitelinks=${result.sitelinks.length}` : "";
  const target = result.url ? ` <${result.url}>` : "";
  const reason = result.selectionReason ? ` - ${result.selectionReason}` : "";
  const title = result.title ? ` ${result.title}` : "";
  const lines = [`  ${prefix}: ${result.id} ${result.path}${rank}${openResult}${score}${relevance}${date}${source}${sourceType}${official}${matchedTerms}${findMatches}${sitelinks}${target}${reason}${title}`];
  if (result.command) lines.push(`    command: ${result.command}`);
  if (result.commandArgs) lines.push(`    commandArgs: ${formatCommandArgsText(result.commandArgs)}`);
  if (result.command) lines.push(`  ${prefix}Command: ${result.command}`);
  if (result.commandArgs) lines.push(`  ${prefix}CommandArgs: ${formatCommandArgsText(result.commandArgs)}`);
  return lines;
}

function formatAgentText(agent: AgentSummary): string[] {
  const lines = [
    "agent",
    `  status: ${agent.status}`,
    `  pageKind: ${agent.pageKind}`,
    ...(agent.pageTitle ? [`  pageTitle: ${agent.pageTitle}`] : []),
    ...(agent.pageCanonicalUrl ? [`  pageCanonicalUrl: ${agent.pageCanonicalUrl}`] : []),
    ...(agent.pageLang ? [`  pageLang: ${agent.pageLang}`] : []),
    ...(agent.pageDir ? [`  pageDir: ${agent.pageDir}`] : []),
    ...(agent.pageSiteName ? [`  pageSiteName: ${agent.pageSiteName}`] : []),
    ...(agent.pageAuthor ? [`  pageAuthor: ${agent.pageAuthor}`] : []),
    ...(agent.pagePublishedTime ? [`  pagePublishedTime: ${agent.pagePublishedTime}`] : []),
    ...(agent.pageModifiedTime ? [`  pageModifiedTime: ${agent.pageModifiedTime}`] : []),
    ...(agent.pageStructuredDataTypes?.length ? [`  pageStructuredDataTypes: ${agent.pageStructuredDataTypes.join(", ")}`] : []),
    `  routingIntent: ${agent.routingIntent}`,
    `  continuationMode: ${agent.continuationMode}`,
    `  nextMode: ${agent.next.mode}`,
    `  runbookDecision: ${agent.runbook.decision}`,
    `  runbookMode: ${agent.runbook.mode}`,
    `  runbookOperation: ${agent.runbook.operation}`,
    ...(agent.runbook.action ? [`  runbookActionName: ${agent.runbook.action}`] : []),
    `  runbookReason: ${agent.runbook.reason}`,
    `  runbookConfidence: ${agent.runbook.confidence}`,
    `  runbookAnswerStatus: ${agent.runbook.answerStatus}`,
    `  runbookAnswerReady: ${agent.runbook.answerReady}`,
    `  runbookShouldContinue: ${agent.runbook.shouldContinue}`,
    `  runbookTerminal: ${agent.runbook.terminal}`,
    `  runbookMaxSuggestedIterations: ${agent.runbook.maxSuggestedIterations}`,
    `  runbookExpectedOutcome: ${agent.runbook.expectedOutcome}`,
    ...(agent.runbook.readFrom ? [`  runbookReadFrom: ${agent.runbook.readFrom}`] : []),
    ...(agent.runbook.commandArgs ? [`  runbookCommandArgs: ${JSON.stringify(agent.runbook.commandArgs)}`] : []),
    ...(agent.runbook.url ? [`  runbookUrl: ${agent.runbook.url}`] : []),
    `  executor: ${agent.executor.decision}/${agent.executor.operation}/${agent.executor.confidence}${agent.executor.action ? ` action=${agent.executor.action}` : ""} status=${agent.executor.status} - ${agent.executor.instruction}`,
    `  handoff: ${agent.handoff.decision}/${agent.handoff.operation}/${agent.handoff.confidence}${agent.handoff.action ? ` action=${agent.handoff.action}` : ""}${agent.handoff.priority ? ` priority=${agent.handoff.priority}` : ""} - ${agent.handoff.instruction}`,
    `  executionPlan: ${agent.executionPlan.operation}/${agent.executionPlan.confidence} - ${agent.executionPlan.reason}`,
    `  executionPlanOperation: ${agent.executionPlan.operation}`,
    `  executionPlanConfidence: ${agent.executionPlan.confidence}`,
    `  executionPlanReason: ${agent.executionPlan.reason}`,
    `  executionPlanAnswerReady: ${agent.executionPlan.answerReady}`,
    `  executionPlanShouldContinue: ${agent.executionPlan.shouldContinue}`,
    `  executionPlanTerminal: ${agent.executionPlan.terminal}`,
    `  executionPlanExpectedOutcome: ${agent.executionPlan.expectedOutcome}`,
    ...(agent.executionPlan.readFrom ? [`  executionPlanReadFrom: ${agent.executionPlan.readFrom}`] : []),
    ...(agent.executionPlan.commandArgs ? [`  executionPlanCommandArgs: ${JSON.stringify(agent.executionPlan.commandArgs)}`] : []),
    ...(agent.executionPlan.afterInteractionCommand ? [`  executionPlanAfterInteractionCommand: ${agent.executionPlan.afterInteractionCommand}`] : []),
    ...(agent.executionPlan.afterInteractionCommandArgs ? [`  executionPlanAfterInteractionCommandArgs: ${JSON.stringify(agent.executionPlan.afterInteractionCommandArgs)}`] : []),
    ...(agent.executionPlan.url ? [`  executionPlanUrl: ${agent.executionPlan.url}`] : []),
    `  loopDecision: ${agent.next.loop.decision}`,
    `  loopContinue: ${agent.next.loop.shouldContinue}`,
    `  loopTerminal: ${agent.next.loop.terminal}`,
    `  loopMaxIterations: ${agent.next.loop.maxSuggestedIterations}`,
    `  loopReason: ${agent.next.loop.reason}`,
    `  expectedOutcome: ${agent.expectedOutcome.kind} - ${agent.expectedOutcome.message}`,
    `  expectedOutcomeKind: ${agent.expectedOutcome.kind}`,
    `  expectedOutcomeMessage: ${agent.expectedOutcome.message}`,
    `  answerPlan: ${agent.answerPlan.status} - ${agent.answerPlan.reason}`,
    `  answerConfidence: ${agent.answerPlan.confidence}`,
    `  answerGaps: ${agent.answerPlan.gaps.join("; ") || "none"}`,
    `  answerCitations: ${agent.answerPlan.useCitationIds.join(", ") || "none"}`,
    ...(agent.answerPlan.readFrom ? [`  answerReadFrom: ${agent.answerPlan.readFrom}`] : []),
    ...(agent.answerPlan.url ? [`  answerUrl: ${agent.answerPlan.url}`] : []),
    ...(agent.answerPlan.command ? [`  answerCommand: ${agent.answerPlan.command}`] : []),
    ...(agent.answerPlan.commandArgs ? [`  answerCommandArgs: ${JSON.stringify(agent.answerPlan.commandArgs)}`] : []),
    ...(agent.answerPlan.afterInteractionCommand ? [`  answerAfterInteractionCommand: ${agent.answerPlan.afterInteractionCommand}`] : []),
    ...(agent.answerPlan.afterInteractionCommandArgs ? [`  answerAfterInteractionCommandArgs: ${JSON.stringify(agent.answerPlan.afterInteractionCommandArgs)}`] : []),
    ...(agent.searchDecision ? [`  searchDecision: ${agent.searchDecision.decision}/${agent.searchDecision.confidence} - ${agent.searchDecision.reason}`] : []),
    ...(agent.searchDecisionName ? [`  searchDecisionName: ${agent.searchDecisionName}`] : []),
    ...(agent.searchDecisionConfidence ? [`  searchDecisionConfidence: ${agent.searchDecisionConfidence}`] : []),
    ...(agent.searchDecisionReason ? [`  searchDecisionReason: ${agent.searchDecisionReason}`] : []),
    ...(typeof agent.searchDecisionResultCount === "number" ? [`  searchDecisionResultCount: ${agent.searchDecisionResultCount}`] : []),
    ...(typeof agent.searchDecisionHighRelevanceCount === "number" ? [`  searchDecisionHighRelevanceCount: ${agent.searchDecisionHighRelevanceCount}`] : []),
    ...(typeof agent.searchDecisionMediumRelevanceCount === "number" ? [`  searchDecisionMediumRelevanceCount: ${agent.searchDecisionMediumRelevanceCount}`] : []),
    ...(typeof agent.searchDecisionLowRelevanceCount === "number" ? [`  searchDecisionLowRelevanceCount: ${agent.searchDecisionLowRelevanceCount}`] : []),
    ...(typeof agent.searchDecisionOfficialCount === "number" ? [`  searchDecisionOfficialCount: ${agent.searchDecisionOfficialCount}`] : []),
    ...(typeof agent.searchDecisionFindMatchCount === "number" ? [`  searchDecisionFindMatchCount: ${agent.searchDecisionFindMatchCount}`] : []),
    ...(typeof agent.searchDecisionRecommendedRank === "number" ? [`  searchDecisionRecommendedRank: ${agent.searchDecisionRecommendedRank}`] : []),
    ...(agent.searchDecisionRecommendedUrl ? [`  searchDecisionRecommendedUrl: ${agent.searchDecisionRecommendedUrl}`] : []),
    ...(agent.pageDecision ? [`  pageDecision: ${agent.pageDecision.decision}/${agent.pageDecision.confidence} - ${agent.pageDecision.reason}`] : []),
    ...(agent.pageDecisionName ? [`  pageDecisionName: ${agent.pageDecisionName}`] : []),
    ...(agent.pageDecisionConfidence ? [`  pageDecisionConfidence: ${agent.pageDecisionConfidence}`] : []),
    ...(agent.pageDecisionReason ? [`  pageDecisionReason: ${agent.pageDecisionReason}`] : []),
    ...(agent.pageDecisionReadFrom ? [`  pageDecisionReadFrom: ${agent.pageDecisionReadFrom}`] : []),
    ...(agent.pageDecisionUrl ? [`  pageDecisionUrl: ${agent.pageDecisionUrl}`] : []),
    `  summary: ${agent.summary}`,
    `  signalCount: ${agent.signalCount}`,
    `  signalWarnings: ${agent.signalWarningCount}`,
    `  signalErrors: ${agent.signalErrorCount}`,
    `  qualityGateCount: ${agent.qualityGateCount}`,
    `  qualityGateFailures: ${agent.qualityGateFailCount}`,
    ...(agent.topSignalKind ? [`  topSignal: ${agent.topSignalSeverity}/${agent.topSignalKind} - ${agent.topSignalMessage}`] : []),
    ...(agent.topQualityGateKind ? [`  topQualityGate: ${agent.topQualityGateKind}${typeof agent.topQualityGatePass === "boolean" ? ` pass=${agent.topQualityGatePass}` : ""}${agent.topQualityGateSeverity ? `/${agent.topQualityGateSeverity}` : ""}${agent.topQualityGatePath ? ` path=${agent.topQualityGatePath}` : ""}${typeof agent.topQualityGateScore === "number" ? ` score=${agent.topQualityGateScore}` : ""} - ${agent.topQualityGateMessage}`] : []),
    ...(agent.problemSignalKind ? [`  problemSignal: ${agent.problemSignalSeverity}/${agent.problemSignalKind} - ${agent.problemSignalMessage}`] : []),
    ...(agent.failingQualityGateKind ? [`  failingQualityGate: ${agent.failingQualityGateKind}${agent.failingQualityGateSeverity ? `/${agent.failingQualityGateSeverity}` : ""}${agent.failingQualityGatePath ? ` path=${agent.failingQualityGatePath}` : ""}${typeof agent.failingQualityGateScore === "number" ? ` score=${agent.failingQualityGateScore}` : ""} - ${agent.failingQualityGateMessage}`] : []),
    `  canContinue: ${agent.canContinue}`,
    `  canUseFetchedHtml: ${agent.canUseFetchedHtml}`,
    `  needsBrowserHtml: ${agent.needsBrowserHtml}`,
    ...(agent.staticReadiness ? [`  staticReadiness: ${agent.staticReadiness}`] : []),
    ...(agent.staticReadinessReasonCode ? [`  staticReadinessReasonCode: ${agent.staticReadinessReasonCode}`] : []),
    ...(agent.staticReadinessReason ? [`  staticReadinessReason: ${agent.staticReadinessReason}`] : []),
    ...(agent.staticReadinessReadFrom ? [`  staticReadinessReadFrom: ${agent.staticReadinessReadFrom}`] : []),
    ...(agent.browserHtmlReason ? [`  browserHtmlReason: ${agent.browserHtmlReason}`] : []),
    ...(agent.browserHtmlReasonCode ? [`  browserHtmlReasonCode: ${agent.browserHtmlReasonCode}`] : []),
    ...(agent.browserHtmlActionName ? [`  browserHtmlActionName: ${agent.browserHtmlActionName}`] : []),
    ...(agent.browserHtmlOperation ? [`  browserHtmlOperation: ${agent.browserHtmlOperation}`] : []),
    ...(agent.browserHtmlUrl ? [`  browserHtmlUrl: ${agent.browserHtmlUrl}`] : []),
    ...(agent.browserHtmlFile ? [`  browserHtmlFile: ${agent.browserHtmlFile}`] : []),
    ...(agent.browserHtmlCaptureScript ? [`  browserHtmlCaptureScript: ${agent.browserHtmlCaptureScript}`] : []),
    ...(agent.browserHtmlCommand ? [`  browserHtmlCommand: ${agent.browserHtmlCommand}`] : []),
    ...(agent.browserHtmlCommandArgs ? [`  browserHtmlCommandArgs: ${formatCommandArgsText(agent.browserHtmlCommandArgs)}`] : []),
    ...(agent.browserHtmlAfterInteractionCommand ? [`  browserHtmlAfterInteractionCommand: ${agent.browserHtmlAfterInteractionCommand}`] : []),
    ...(agent.browserHtmlAfterInteractionCommandArgs ? [`  browserHtmlAfterInteractionCommandArgs: ${formatCommandArgsText(agent.browserHtmlAfterInteractionCommandArgs)}`] : []),
    `  responseStatus: ${agent.responseStatus}`,
    `  responseOk: ${agent.responseOk}`,
    `  responseContentType: ${agent.responseContentType || "unknown"}`,
    `  finalUrlChanged: ${agent.finalUrlChanged}`,
    `  resultCount: ${agent.resultCount}`,
    `  resultChoiceCount: ${agent.resultChoiceCount}`,
    ...(agent.topResultChoicePath ? [`  topResultChoicePath: ${agent.topResultChoicePath}`] : []),
    ...(agent.topResultChoiceUrl ? [`  topResultChoiceUrl: ${agent.topResultChoiceUrl}`] : []),
    ...(agent.topResultChoiceHost ? [`  topResultChoiceHost: ${agent.topResultChoiceHost}`] : []),
    ...(agent.topResultChoiceTitle ? [`  topResultChoiceTitle: ${agent.topResultChoiceTitle}`] : []),
    ...(agent.topResultChoiceSnippet ? [`  topResultChoiceSnippet: ${agent.topResultChoiceSnippet}`] : []),
    ...(agent.topResultChoiceCommandArgs ? [`  topResultChoiceCommandArgs: ${JSON.stringify(agent.topResultChoiceCommandArgs)}`] : []),
    ...(typeof agent.topResultChoiceRank === "number" ? [`  topResultChoiceRank: ${agent.topResultChoiceRank}`] : []),
    ...(agent.topResultChoiceOpenResult ? [`  topResultChoiceOpenResult: ${agent.topResultChoiceOpenResult}`] : []),
    ...(typeof agent.topResultChoiceRecommended === "boolean" ? [`  topResultChoiceRecommended: ${agent.topResultChoiceRecommended}`] : []),
    ...(typeof agent.topResultChoicePrimary === "boolean" ? [`  topResultChoicePrimary: ${agent.topResultChoicePrimary}`] : []),
    ...(agent.topResultChoiceSourceType ? [`  topResultChoiceSourceType: ${agent.topResultChoiceSourceType}`] : []),
    ...(typeof agent.topResultChoiceSourceScore === "number" ? [`  topResultChoiceSourceScore: ${agent.topResultChoiceSourceScore}`] : []),
    ...(agent.topResultChoiceSourceHints?.length ? [`  topResultChoiceSourceHints: ${agent.topResultChoiceSourceHints.join(",")}`] : []),
    ...(agent.topResultChoiceDateText ? [`  topResultChoiceDateText: ${agent.topResultChoiceDateText}`] : []),
    ...(agent.topResultChoiceRelevance ? [`  topResultChoiceRelevance: ${agent.topResultChoiceRelevance}`] : []),
    ...(agent.topResultChoiceMatchedTerm ? [`  topResultChoiceMatchedTerm: ${agent.topResultChoiceMatchedTerm}`] : []),
    ...(agent.topResultChoiceFindMatch ? [`  topResultChoiceFindMatch: ${agent.topResultChoiceFindMatch}`] : []),
    ...(typeof agent.topResultChoiceLikelyOfficial === "boolean" ? [`  topResultChoiceLikelyOfficial: ${agent.topResultChoiceLikelyOfficial}`] : []),
    ...(typeof agent.topResultChoiceSitelinkCount === "number" ? [`  topResultChoiceSitelinkCount: ${agent.topResultChoiceSitelinkCount}`] : []),
    ...(agent.topResultChoiceFirstSitelinkTitle ? [`  topResultChoiceFirstSitelinkTitle: ${agent.topResultChoiceFirstSitelinkTitle}`] : []),
    ...(agent.topResultChoiceFirstSitelinkUrl ? [`  topResultChoiceFirstSitelinkUrl: ${agent.topResultChoiceFirstSitelinkUrl}`] : []),
    ...(agent.topResultChoiceReason ? [`  topResultChoiceReason: ${agent.topResultChoiceReason}`] : []),
    `  evidenceCount: ${agent.evidenceCount}`,
    `  formCount: ${agent.formCount}`,
    `  formChoiceCount: ${agent.formChoiceCount}`,
    `  actionTargetCount: ${agent.actionTargetCount}`,
    `  actionTargetChoiceCount: ${agent.actionTargetChoiceCount}`,
    ...(agent.topFormChoicePath ? [`  topFormChoicePath: ${agent.topFormChoicePath}`] : []),
    ...(agent.topFormChoiceUrlTemplate ? [`  topFormChoiceUrlTemplate: ${agent.topFormChoiceUrlTemplate}`] : []),
    ...(agent.topFormChoiceQueryField ? [`  topFormChoiceQueryField: ${agent.topFormChoiceQueryField}`] : []),
    ...(agent.topFormChoiceSubmitText ? [`  topFormChoiceSubmitText: ${agent.topFormChoiceSubmitText}`] : []),
    ...(agent.topFormChoiceFirstFieldName || agent.topFormChoiceFirstFieldType ? [`  topFormChoiceFirstField: ${agent.topFormChoiceFirstFieldName ?? ""}${agent.topFormChoiceFirstFieldType ? ` type=${agent.topFormChoiceFirstFieldType}` : ""}${agent.topFormChoiceFirstFieldLabel ? ` label=${agent.topFormChoiceFirstFieldLabel}` : ""}${typeof agent.topFormChoiceFirstFieldRequired === "boolean" ? ` required=${agent.topFormChoiceFirstFieldRequired}` : ""}${agent.topFormChoiceFirstFieldSelector ? ` selector=${agent.topFormChoiceFirstFieldSelector}` : ""}`] : []),
    ...(agent.topActionTargetChoicePath ? [`  topActionTargetChoicePath: ${agent.topActionTargetChoicePath}`] : []),
    ...(agent.topActionTargetChoiceUrlTemplate ? [`  topActionTargetChoiceUrlTemplate: ${agent.topActionTargetChoiceUrlTemplate}`] : []),
    ...(agent.topActionTargetChoiceQueryInput ? [`  topActionTargetChoiceQueryInput: ${agent.topActionTargetChoiceQueryInput}`] : []),
    `  barrierCount: ${agent.barrierCount}`,
    ...(agent.topBarrierKind ? [`  topBarrier: ${agent.topBarrierSeverity}/${agent.topBarrierKind} ${agent.topBarrierPath} - ${agent.topBarrierText}`] : []),
    ...(agent.topBarrierSource ? [`  topBarrierSource: ${agent.topBarrierSource}`] : []),
    ...(agent.topBarrierSelector ? [`  topBarrierSelector: ${agent.topBarrierSelector}`] : []),
    ...(agent.topBarrierDiagnosticCode ? [`  topBarrierDiagnosticCode: ${agent.topBarrierDiagnosticCode}`] : []),
    `  dataTableCount: ${agent.dataTableCount}`,
    ...(agent.topDataTablePath ? [`  topDataTable: ${agent.topDataTablePath}${agent.topDataTableCaption ? ` "${agent.topDataTableCaption}"` : ""} ${agent.topDataTableRowCount ?? 0}x${agent.topDataTableColumnCount ?? 0}`] : []),
    ...(agent.topDataTableFirstHeader ? [`  topDataTableFirstHeader: ${agent.topDataTableFirstHeader}`] : []),
    ...(agent.topDataTableFirstRow?.length ? [`  topDataTableFirstRow: ${agent.topDataTableFirstRow.join(" | ")}`] : []),
    ...(agent.topDataTableFirstCell ? [`  topDataTableFirstCell: ${agent.topDataTableFirstCell}`] : []),
    ...(agent.topDataTableSelector ? [`  topDataTableSelector: ${agent.topDataTableSelector}`] : []),
    `  faqCount: ${agent.faqCount}`,
    `  codeBlockCount: ${agent.codeBlockCount}`,
    `  resourceCount: ${agent.resourceCount}`,
    `  mediaCount: ${agent.mediaCount}`,
    `  sectionCount: ${agent.sectionCount}`,
    `  breadcrumbCount: ${agent.breadcrumbCount}`,
    `  paginationCount: ${agent.paginationCount}`,
    `  tocCount: ${agent.tocCount}`,
    `  embedCount: ${agent.embedCount}`,
    `  transcriptCount: ${agent.transcriptCount}`,
    `  authorLinkCount: ${agent.authorLinkCount}`,
    `  provenanceCount: ${agent.provenanceCount}`,
    `  offerCount: ${agent.offerCount}`,
    `  datasetCount: ${agent.datasetCount}`,
    `  identityCount: ${agent.identityCount}`,
    `  timelineCount: ${agent.timelineCount}`,
    `  contactPointCount: ${agent.contactPointCount}`,
    ...(agent.topFaqQuestion ? [`  topFaqQuestion: ${agent.topFaqQuestion}`] : []),
    ...(agent.topCodeBlockText ? [`  topCodeBlockText: ${agent.topCodeBlockText}`] : []),
    ...(agent.topResourceUrl ? [`  topResourceUrl: ${agent.topResourceUrl}`] : []),
    ...(agent.topMediaUrl ? [`  topMediaUrl: ${agent.topMediaUrl}`] : []),
    ...(agent.topSectionPath ? [`  topSectionPath: ${agent.topSectionPath}`] : []),
    ...(agent.topSectionHeading ? [`  topSectionHeading: ${agent.topSectionHeading}`] : []),
    ...(typeof agent.topSectionLevel === "number" ? [`  topSectionLevel: ${agent.topSectionLevel}`] : []),
    ...(agent.topBreadcrumbText ? [`  topBreadcrumbText: ${agent.topBreadcrumbText}`] : []),
    ...(agent.topPaginationPath ? [`  topPaginationPath: ${agent.topPaginationPath}`] : []),
    ...(agent.topPaginationUrl ? [`  topPaginationUrl: ${agent.topPaginationUrl}`] : []),
    ...(agent.topTocPath ? [`  topTocPath: ${agent.topTocPath}`] : []),
    ...(agent.topTocText ? [`  topTocText: ${agent.topTocText}`] : []),
    ...(agent.topProvenanceValue ? [`  topProvenance: ${agent.topProvenancePath ?? ""} ${agent.topProvenanceKind ?? ""}=${agent.topProvenanceValue}${agent.topProvenanceUrl ? ` <${agent.topProvenanceUrl}>` : ""}`] : []),
    ...(agent.topOfferPrice ? [`  topOffer: ${agent.topOfferPath ?? ""} ${agent.topOfferCurrency ?? ""} ${agent.topOfferPrice}${agent.topOfferAvailability ? ` availability=${agent.topOfferAvailability}` : ""}${agent.topOfferUrl ? ` <${agent.topOfferUrl}>` : ""}`] : []),
    ...(agent.topDatasetName ? [`  topDataset: ${agent.topDatasetPath ?? ""} ${agent.topDatasetKind ?? ""}:${agent.topDatasetName}${agent.topDatasetUrl ? ` <${agent.topDatasetUrl}>` : ""}`] : []),
    ...(agent.topIdentityName ? [`  topIdentity: ${agent.topIdentityPath ?? ""} ${agent.topIdentityKind ?? ""}:${agent.topIdentityName}${agent.topIdentityUrl ? ` <${agent.topIdentityUrl}>` : ""}`] : []),
    ...(agent.topTimelineValue ? [`  topTimeline: ${agent.topTimelinePath ?? ""} ${agent.topTimelineKind ?? ""}:${agent.topTimelineValue}`] : []),
    ...(agent.topContactPointValue ? [`  topContactPoint: ${agent.topContactPointPath ?? ""} ${agent.topContactPointKind ?? ""}:${agent.topContactPointValue}${agent.topContactPointUrl ? ` <${agent.topContactPointUrl}>` : ""}`] : []),
    ...(agent.topEmbedUrl ? [`  topEmbedUrl: ${agent.topEmbedUrl}`] : []),
    ...(agent.topTranscriptUrl ? [`  topTranscriptUrl: ${agent.topTranscriptUrl}`] : []),
    ...(agent.topAuthorLinkUrl ? [`  topAuthorLinkUrl: ${agent.topAuthorLinkUrl}`] : []),
    `  structuredReadTargetCount: ${agent.structuredReadTargetCount}`,
    ...(agent.bestStructuredReadTarget ? [`  bestStructuredReadTarget: ${agent.bestStructuredReadTarget}`] : []),
    ...(typeof agent.bestStructuredReadTargetCount === "number" ? [`  bestStructuredReadTargetCount: ${agent.bestStructuredReadTargetCount}`] : []),
    ...(typeof agent.bestStructuredReadTargetScore === "number" ? [`  bestStructuredReadTargetScore: ${agent.bestStructuredReadTargetScore}`] : []),
    ...(typeof agent.bestStructuredReadTargetPrimary === "boolean" ? [`  bestStructuredReadTargetPrimary: ${agent.bestStructuredReadTargetPrimary}`] : []),
    ...(agent.bestStructuredReadTargetReason ? [`  bestStructuredReadTargetReason: ${agent.bestStructuredReadTargetReason}`] : []),
    `  hiddenSignalCount: ${agent.hiddenSignalCount}`,
    `  hiddenHydrationCount: ${agent.hiddenHydrationCount}`,
    `  hiddenApiEndpointCount: ${agent.hiddenApiEndpointCount}`,
    `  hiddenClientStateCount: ${agent.hiddenClientStateCount}`,
    `  hiddenAppHintCount: ${agent.hiddenAppHintCount}`,
    ...(agent.topHydrationPath ? [`  topHydration: ${agent.topHydrationPath} ${agent.topHydrationKind ?? ""}${agent.topHydrationUrl ? ` <${agent.topHydrationUrl}>` : ""}`] : []),
    ...(agent.topHydrationSelector ? [`  topHydrationSelector: ${agent.topHydrationSelector}`] : []),
    ...(agent.topApiEndpointPath ? [`  topApiEndpoint: ${agent.topApiEndpointPath} ${agent.topApiEndpointKind ?? ""}${agent.topApiEndpointMethod ? ` ${agent.topApiEndpointMethod}` : ""}${agent.topApiEndpointUrl ? ` <${agent.topApiEndpointUrl}>` : ""}`] : []),
    ...(agent.topApiEndpointSelector ? [`  topApiEndpointSelector: ${agent.topApiEndpointSelector}`] : []),
    ...(agent.topClientStatePath ? [`  topClientState: ${agent.topClientStatePath} ${agent.topClientStateKind ?? ""}${agent.topClientStateOperation ? ` ${agent.topClientStateOperation}` : ""}${agent.topClientStateKey ? ` ${agent.topClientStateKey}` : ""}`] : []),
    ...(agent.topClientStateSelector ? [`  topClientStateSelector: ${agent.topClientStateSelector}`] : []),
    ...(agent.topAppHintPath ? [`  topAppHint: ${agent.topAppHintPath} ${agent.topAppHintKind ?? ""}${agent.topAppHintUrl ? ` <${agent.topAppHintUrl}>` : ""}`] : []),
    ...(agent.topAppHintSelector ? [`  topAppHintSelector: ${agent.topAppHintSelector}`] : []),
    ...(agent.topHiddenSignalGroup ? [`  topHiddenSignalGroup: ${agent.topHiddenSignalGroup}`] : []),
    ...(agent.topHiddenSignalPath ? [`  topHiddenSignalPath: ${agent.topHiddenSignalPath}`] : []),
    ...(agent.topHiddenSignalKind ? [`  topHiddenSignalKind: ${agent.topHiddenSignalKind}`] : []),
    ...(agent.topHiddenSignalText ? [`  topHiddenSignalText: ${agent.topHiddenSignalText}`] : []),
    ...(agent.topHiddenSignalUrl ? [`  topHiddenSignalUrl: ${agent.topHiddenSignalUrl}`] : []),
    ...(agent.topHiddenSignalSource ? [`  topHiddenSignalSource: ${agent.topHiddenSignalSource}`] : []),
    ...(agent.topHiddenSignalSelector ? [`  topHiddenSignalSelector: ${agent.topHiddenSignalSelector}`] : []),
    `  hiddenReadTargetCount: ${agent.hiddenReadTargetCount}`,
    ...(agent.bestHiddenReadTarget ? [`  bestHiddenReadTarget: ${agent.bestHiddenReadTarget}`] : []),
    ...(typeof agent.bestHiddenReadTargetCount === "number" ? [`  bestHiddenReadTargetCount: ${agent.bestHiddenReadTargetCount}`] : []),
    ...(typeof agent.bestHiddenReadTargetScore === "number" ? [`  bestHiddenReadTargetScore: ${agent.bestHiddenReadTargetScore}`] : []),
    ...(typeof agent.bestHiddenReadTargetPrimary === "boolean" ? [`  bestHiddenReadTargetPrimary: ${agent.bestHiddenReadTargetPrimary}`] : []),
    ...(agent.bestHiddenReadTargetReason ? [`  bestHiddenReadTargetReason: ${agent.bestHiddenReadTargetReason}`] : []),
    `  sourceLinkCount: ${agent.sourceLinkCount}`,
    `  sourceChoiceCount: ${agent.sourceChoiceCount}`,
    ...(agent.topSourceChoicePath ? [`  topSourceChoicePath: ${agent.topSourceChoicePath}`] : []),
    ...(agent.topSourceChoiceUrl ? [`  topSourceChoiceUrl: ${agent.topSourceChoiceUrl}`] : []),
    ...(agent.topSourceChoiceHost ? [`  topSourceChoiceHost: ${agent.topSourceChoiceHost}`] : []),
    ...(agent.topSourceChoiceTitle ? [`  topSourceChoiceTitle: ${agent.topSourceChoiceTitle}`] : []),
    ...(agent.topSourceChoiceSnippet ? [`  topSourceChoiceSnippet: ${agent.topSourceChoiceSnippet}`] : []),
    ...(agent.topSourceChoiceCommandArgs ? [`  topSourceChoiceCommandArgs: ${JSON.stringify(agent.topSourceChoiceCommandArgs)}`] : []),
    ...(agent.topSourceChoiceSourceType ? [`  topSourceChoiceSourceType: ${agent.topSourceChoiceSourceType}`] : []),
    ...(typeof agent.topSourceChoiceSourceScore === "number" ? [`  topSourceChoiceSourceScore: ${agent.topSourceChoiceSourceScore}`] : []),
    ...(agent.topSourceChoiceSourceHints?.length ? [`  topSourceChoiceSourceHints: ${agent.topSourceChoiceSourceHints.join(",")}`] : []),
    ...(typeof agent.topSourceChoicePrimary === "boolean" ? [`  topSourceChoicePrimary: ${agent.topSourceChoicePrimary}`] : []),
    ...(agent.topSourceChoiceReason ? [`  topSourceChoiceReason: ${agent.topSourceChoiceReason}`] : []),
    ...(agent.topChoiceKind ? [`  topChoice: ${agent.topChoiceKind} ${agent.topChoicePath}${agent.topChoiceUrl ? ` <${agent.topChoiceUrl}>` : ""}${agent.topChoiceLabel ? ` - ${agent.topChoiceLabel}` : ""}`] : []),
    ...(agent.sourceSearchQuery ? [`  sourceSearchQuery: ${agent.sourceSearchQuery}`] : []),
    ...(agent.sourceSearchEngine ? [`  sourceSearchEngine: ${agent.sourceSearchEngine}`] : []),
    ...(agent.sourceSearchSelectedEngine ? [`  sourceSearchSelectedEngine: ${agent.sourceSearchSelectedEngine}`] : []),
    ...(agent.sourceSearchSearchUrl ? [`  sourceSearchSearchUrl: ${agent.sourceSearchSearchUrl}`] : []),
    ...(agent.sourceSearchLang ? [`  sourceSearchLang: ${agent.sourceSearchLang}`] : []),
    ...(agent.sourceSearchRegion ? [`  sourceSearchRegion: ${agent.sourceSearchRegion}`] : []),
    ...(typeof agent.sourceSearchFindQueryCount === "number" ? [`  sourceSearchFindQueryCount: ${agent.sourceSearchFindQueryCount}`] : []),
    ...(agent.sourceSearchTopFindQuery ? [`  sourceSearchTopFindQuery: ${agent.sourceSearchTopFindQuery}`] : []),
    ...(typeof agent.sourceSearchSelectedRank === "number" ? [`  sourceSearchSelectedRank: ${agent.sourceSearchSelectedRank}`] : []),
    ...(agent.sourceSearchSelectedTitle ? [`  sourceSearchSelectedTitle: ${agent.sourceSearchSelectedTitle}`] : []),
    ...(agent.sourceSearchSelectedUrl ? [`  sourceSearchSelectedUrl: ${agent.sourceSearchSelectedUrl}`] : []),
    ...(agent.sourceSearchSelectedHost ? [`  sourceSearchSelectedHost: ${agent.sourceSearchSelectedHost}`] : []),
    ...(agent.sourceSearchSelectedPath ? [`  sourceSearchSelectedPath: ${agent.sourceSearchSelectedPath}`] : []),
    ...(agent.sourceSearchSelectedOpenResult ? [`  sourceSearchSelectedOpenResult: ${agent.sourceSearchSelectedOpenResult}`] : []),
    ...(agent.sourceSearchSelectedCommandArgs ? [`  sourceSearchSelectedCommandArgs: ${JSON.stringify(agent.sourceSearchSelectedCommandArgs)}`] : []),
    ...(agent.sourceSearchSelectedReason ? [`  sourceSearchSelectedReason: ${agent.sourceSearchSelectedReason}`] : []),
    ...(agent.sourceSearchFailureCode ? [`  sourceSearchFailureCode: ${agent.sourceSearchFailureCode}`] : []),
    ...(typeof agent.sourceSearchFailureStatus === "number" ? [`  sourceSearchFailureStatus: ${agent.sourceSearchFailureStatus}`] : []),
    ...(agent.sourceSearchFailureUrl ? [`  sourceSearchFailureUrl: ${agent.sourceSearchFailureUrl}`] : []),
    ...(agent.sourceSearchFailureReason ? [`  sourceSearchFailureReason: ${agent.sourceSearchFailureReason}`] : []),
    `  sourceSearchAlternateCount: ${agent.sourceSearchAlternateCount}`,
    ...(agent.sourceSearchAlternatePath ? [`  sourceSearchAlternatePath: ${agent.sourceSearchAlternatePath}`] : []),
    ...(agent.sourceSearchAlternateUrl ? [`  sourceSearchAlternateUrl: ${agent.sourceSearchAlternateUrl}`] : []),
    ...(agent.sourceSearchAlternateHost ? [`  sourceSearchAlternateHost: ${agent.sourceSearchAlternateHost}`] : []),
    ...(agent.sourceSearchAlternateTitle ? [`  sourceSearchAlternateTitle: ${agent.sourceSearchAlternateTitle}`] : []),
    ...(typeof agent.sourceSearchAlternateRank === "number" ? [`  sourceSearchAlternateRank: ${agent.sourceSearchAlternateRank}`] : []),
    ...(agent.sourceSearchAlternateOpenResult ? [`  sourceSearchAlternateOpenResult: ${agent.sourceSearchAlternateOpenResult}`] : []),
    ...(agent.sourceSearchAlternateCommandArgs ? [`  sourceSearchAlternateCommandArgs: ${JSON.stringify(agent.sourceSearchAlternateCommandArgs)}`] : []),
    ...(agent.sourceSearchAlternateReason ? [`  sourceSearchAlternateReason: ${agent.sourceSearchAlternateReason}`] : []),
    `  alternativeActionCount: ${agent.alternativeActionCount}`,
    ...(agent.alternativeActionName ? [`  alternativeActionName: ${agent.alternativeActionName}`] : []),
    ...(agent.alternativeActionSource ? [`  alternativeActionSource: ${agent.alternativeActionSource}`] : []),
    ...(agent.alternativeActionExecution ? [`  alternativeActionExecution: ${agent.alternativeActionExecution}`] : []),
    ...(agent.alternativeActionPriority ? [`  alternativeActionPriority: ${agent.alternativeActionPriority}`] : []),
    ...(agent.alternativeActionReason ? [`  alternativeActionReason: ${agent.alternativeActionReason}`] : []),
    ...(agent.alternativeActionReadFrom ? [`  alternativeActionReadFrom: ${agent.alternativeActionReadFrom}`] : []),
    ...(agent.alternativeActionCommandArgs ? [`  alternativeActionCommandArgs: ${JSON.stringify(agent.alternativeActionCommandArgs)}`] : []),
    ...(agent.alternativeActionUrl ? [`  alternativeActionUrl: ${agent.alternativeActionUrl}`] : []),
    ...(agent.alternativeActionSourceLinkRef ? [`  alternativeActionSourceLinkRef: ${agent.alternativeActionSourceLinkRef}`] : []),
    ...(agent.alternativeActionRequiresBrowserInteraction ? ["  alternativeActionRequiresBrowserInteraction: true"] : []),
    `  usabilityScore: ${agent.usabilityScore}`,
    `  evidenceQualityScore: ${agent.evidenceQualityScore}`,
    `  sourceQualityScore: ${agent.sourceQualityScore}`,
    `  diagnosticErrors: ${agent.diagnosticErrorCount}`,
    `  diagnosticWarnings: ${agent.diagnosticWarningCount}`,
    `  diagnosticInfo: ${agent.diagnosticInfoCount}`,
    ...(agent.topDiagnosticCode ? [`  topDiagnostic: ${agent.topDiagnosticSeverity}/${agent.topDiagnosticCode} - ${agent.topDiagnosticMessage}`] : []),
    `  citationCount: ${agent.citationCount}`,
    ...(agent.topCitationId ? [`  topCitation: ${agent.topCitationId} ${agent.topCitationPath} ${agent.topCitationKind}${agent.topCitationConfidence ? ` ${agent.topCitationConfidence}` : ""}${typeof agent.topCitationScore === "number" ? ` score=${agent.topCitationScore}` : ""}${agent.topCitationText ? ` - ${agent.topCitationText}` : ""}`] : []),
    ...(agent.topCitationTitle ? [`  topCitationTitle: ${agent.topCitationTitle}`] : []),
    ...(agent.topCitationUrl ? [`  topCitationUrl: ${agent.topCitationUrl}`] : []),
    ...(agent.topCitationReason ? [`  topCitationReason: ${agent.topCitationReason}`] : []),
    `  answerEvidenceCount: ${agent.answerEvidenceCount}`,
    ...(agent.topAnswerEvidenceId ? [`  topAnswerEvidence: ${agent.topAnswerEvidenceId} ${agent.topAnswerEvidencePath}${agent.topAnswerEvidenceText ? ` - ${agent.topAnswerEvidenceText}` : ""}`] : []),
    `  readTargetCount: ${agent.readTargetCount}`,
    ...(agent.topReadTarget ? [`  topReadTarget: ${agent.topReadTarget}`] : []),
    ...(typeof agent.topReadTargetCount === "number" ? [`  topReadTargetCount: ${agent.topReadTargetCount}`] : []),
    ...(typeof agent.topReadTargetScore === "number" ? [`  topReadTargetScore: ${agent.topReadTargetScore}`] : []),
    ...(typeof agent.topReadTargetPrimary === "boolean" ? [`  topReadTargetPrimary: ${agent.topReadTargetPrimary}`] : []),
    ...(agent.topReadTargetReason ? [`  topReadTargetReason: ${agent.topReadTargetReason}`] : []),
    `  actionCount: ${agent.actionCount}`,
    ...(agent.topActionName ? [`  topActionName: ${agent.topActionName}`] : []),
    ...(agent.topActionSource ? [`  topActionSource: ${agent.topActionSource}`] : []),
    ...(agent.topActionExecution ? [`  topActionExecution: ${agent.topActionExecution}`] : []),
    ...(agent.topActionPriority ? [`  topActionPriority: ${agent.topActionPriority}`] : []),
    ...(agent.topActionReason ? [`  topActionReason: ${agent.topActionReason}`] : []),
    ...(agent.topActionReadFrom ? [`  topActionReadFrom: ${agent.topActionReadFrom}`] : []),
    ...(agent.topActionCommandArgs ? [`  topActionCommandArgs: ${JSON.stringify(agent.topActionCommandArgs)}`] : []),
    ...(agent.topActionUrl ? [`  topActionUrl: ${agent.topActionUrl}`] : []),
    ...(agent.topActionSourceLinkRef ? [`  topActionSourceLinkRef: ${agent.topActionSourceLinkRef}`] : []),
    ...(agent.topActionRequiresBrowserInteraction ? ["  topActionRequiresBrowserInteraction: true"] : []),
    `  verification: ${agent.verificationFoundCount}/${agent.verificationRequestedCount} found, ${agent.verificationMissingCount} missing`,
    ...(agent.verificationFoundQueries.length > 0 ? [`  verificationFoundQueries: ${agent.verificationFoundQueries.join("; ")}`] : []),
    ...(agent.verificationMissingQueries.length > 0 ? [`  verificationMissingQueries: ${agent.verificationMissingQueries.join("; ")}`] : []),
    ...(agent.topVerificationFoundQuery ? [`  topVerificationFoundQuery: ${agent.topVerificationFoundQuery}`] : []),
    ...(agent.topVerificationMissingQuery ? [`  topVerificationMissingQuery: ${agent.topVerificationMissingQuery}`] : []),
    `  readability: ${agent.readability} (${agent.readabilityScore})`,
  ];
  if (agent.nextActionName) lines.push(`  nextActionName: ${agent.nextActionName}`);
  if (agent.nextExecution) lines.push(`  nextExecution: ${agent.nextExecution}`);
  if (agent.nextReadFrom) lines.push(`  nextReadFrom: ${agent.nextReadFrom}`);
  if (agent.nextCommand) lines.push(`  nextCommand: ${agent.nextCommand}`);
  if (agent.nextCommandArgs) lines.push(`  nextCommandArgs: ${formatCommandArgsText(agent.nextCommandArgs)}`);
  if (agent.nextAfterInteractionCommand) lines.push(`  nextAfterInteractionCommand: ${agent.nextAfterInteractionCommand}`);
  if (agent.nextAfterInteractionCommandArgs) lines.push(`  nextAfterInteractionCommandArgs: ${formatCommandArgsText(agent.nextAfterInteractionCommandArgs)}`);
  if (agent.nextUrl) lines.push(`  nextUrl: ${agent.nextUrl}`);
  if (agent.executorDecision) lines.push(`  executorDecision: ${agent.executorDecision}`);
  if (agent.executorMode) lines.push(`  executorMode: ${agent.executorMode}`);
  if (agent.executorActionName) lines.push(`  executorActionName: ${agent.executorActionName}`);
  if (agent.executorOperation) lines.push(`  executorOperation: ${agent.executorOperation}`);
  if (agent.executorConfidence) lines.push(`  executorConfidence: ${agent.executorConfidence}`);
  if (typeof agent.executorAnswerReady === "boolean") lines.push(`  executorAnswerReady: ${agent.executorAnswerReady}`);
  if (typeof agent.executorShouldContinue === "boolean") lines.push(`  executorShouldContinue: ${agent.executorShouldContinue}`);
  if (typeof agent.executorTerminal === "boolean") lines.push(`  executorTerminal: ${agent.executorTerminal}`);
  if (agent.executorExpectedOutcome) lines.push(`  executorExpectedOutcome: ${agent.executorExpectedOutcome}`);
  if (agent.executorTargetUrl) lines.push(`  executorTargetUrl: ${agent.executorTargetUrl}`);
  if (agent.executorTargetPath) lines.push(`  executorTargetPath: ${agent.executorTargetPath}`);
  if (agent.executorTargetSelector) lines.push(`  executorTargetSelector: ${agent.executorTargetSelector}`);
  if (agent.executorTargetText) lines.push(`  executorTargetText: ${agent.executorTargetText}`);
  if (agent.handoffDecision) lines.push(`  handoffDecision: ${agent.handoffDecision}`);
  if (agent.handoffMode) lines.push(`  handoffMode: ${agent.handoffMode}`);
  if (agent.handoffActionName) lines.push(`  handoffActionName: ${agent.handoffActionName}`);
  if (agent.handoffOperation) lines.push(`  handoffOperation: ${agent.handoffOperation}`);
  if (agent.handoffAnswerStatus) lines.push(`  handoffAnswerStatus: ${agent.handoffAnswerStatus}`);
  if (agent.handoffConfidence) lines.push(`  handoffConfidence: ${agent.handoffConfidence}`);
  if (typeof agent.handoffAnswerReady === "boolean") lines.push(`  handoffAnswerReady: ${agent.handoffAnswerReady}`);
  if (typeof agent.handoffShouldContinue === "boolean") lines.push(`  handoffShouldContinue: ${agent.handoffShouldContinue}`);
  if (typeof agent.handoffTerminal === "boolean") lines.push(`  handoffTerminal: ${agent.handoffTerminal}`);
  if (agent.handoffPriority) lines.push(`  handoffPriority: ${agent.handoffPriority}`);
  if (agent.handoffPriorityReason) lines.push(`  handoffPriorityReason: ${agent.handoffPriorityReason}`);
  if (agent.handoffExpectedOutcome) lines.push(`  handoffExpectedOutcome: ${agent.handoffExpectedOutcome}`);
  if (agent.handoffTargetUrl) lines.push(`  handoffTargetUrl: ${agent.handoffTargetUrl}`);
  if (agent.handoffTargetPath) lines.push(`  handoffTargetPath: ${agent.handoffTargetPath}`);
  if (agent.handoffTargetSelector) lines.push(`  handoffTargetSelector: ${agent.handoffTargetSelector}`);
  if (agent.handoffTargetText) lines.push(`  handoffTargetText: ${agent.handoffTargetText}`);
  if (agent.answerPlanStatus) lines.push(`  answerPlanStatus: ${agent.answerPlanStatus}`);
  if (agent.answerPlanConfidence) lines.push(`  answerPlanConfidence: ${agent.answerPlanConfidence}`);
  if (agent.answerPlanReason) lines.push(`  answerPlanReason: ${agent.answerPlanReason}`);
  if (agent.answerPlanNextAction) lines.push(`  answerPlanNextAction: ${agent.answerPlanNextAction}`);
  if (typeof agent.answerGapCount === "number") lines.push(`  answerGapCount: ${agent.answerGapCount}`);
  if (typeof agent.answerUseCitationCount === "number") lines.push(`  answerUseCitationCount: ${agent.answerUseCitationCount}`);
  if (agent.topAnswerUseCitationId) lines.push(`  topAnswerUseCitationId: ${agent.topAnswerUseCitationId}`);
  if (agent.answerUseCitationIds?.length) lines.push(`  answerUseCitationIds: ${agent.answerUseCitationIds.join(", ")}`);
  if (agent.answerPlanAfterInteractionCommand) lines.push(`  answerPlanAfterInteractionCommand: ${agent.answerPlanAfterInteractionCommand}`);
  if (agent.answerPlanAfterInteractionCommandArgs?.length) lines.push(`  answerPlanAfterInteractionCommandArgs: ${JSON.stringify(agent.answerPlanAfterInteractionCommandArgs)}`);
  if (agent.executor.readFrom) lines.push(`  executorReadFrom: ${agent.executor.readFrom}`);
  if (agent.executor.readValue) lines.push(...formatAgentReadValueText(agent.executor.readValue, "executorReadValue"));
  if (agent.executor.commandArgs) lines.push(`  executorCommandArgs: ${formatCommandArgsText(agent.executor.commandArgs)}`);
  if (agent.executor.afterInteractionCommandArgs) lines.push(`  executorAfterInteractionCommandArgs: ${formatCommandArgsText(agent.executor.afterInteractionCommandArgs)}`);
  if (agent.executor.url) lines.push(`  executorUrl: ${agent.executor.url}`);
  if (agent.executor.readTarget) {
    const count = typeof agent.executor.readTarget.count === "number" ? ` count=${agent.executor.readTarget.count}` : "";
    const score = typeof agent.executor.readTarget.score === "number" ? ` score=${agent.executor.readTarget.score}` : "";
    const primary = agent.executor.readTarget.primary ? " primary" : "";
    lines.push(`  executorReadTarget: ${agent.executor.readTarget.path}${count}${score}${primary} - ${agent.executor.readTarget.reason}`);
  }
  if (agent.executor.browserHtml) {
    lines.push(`  executorBrowserHtml: ${agent.executor.browserHtml.htmlFile} capture=${agent.executor.browserHtml.captureScript}`);
    if (agent.executor.browserHtml.url) lines.push(`  executorBrowserHtmlUrl: ${agent.executor.browserHtml.url}`);
    if (agent.executor.browserHtml.commandArgs) lines.push(`  executorBrowserHtmlCommandArgs: ${formatCommandArgsText(agent.executor.browserHtml.commandArgs)}`);
  }
  if (agent.handoff.readFrom) lines.push(`  handoffReadFrom: ${agent.handoff.readFrom}`);
  if (agent.handoff.readValue) lines.push(...formatAgentReadValueText(agent.handoff.readValue));
  if (agent.handoff.command) lines.push(`  handoffCommand: ${agent.handoff.command}`);
  if (agent.handoff.commandArgs) lines.push(`  handoffCommandArgs: ${formatCommandArgsText(agent.handoff.commandArgs)}`);
  if (agent.handoff.afterInteractionCommand) lines.push(`  handoffAfterInteractionCommand: ${agent.handoff.afterInteractionCommand}`);
  if (agent.handoff.afterInteractionCommandArgs) lines.push(`  handoffAfterInteractionCommandArgs: ${formatCommandArgsText(agent.handoff.afterInteractionCommandArgs)}`);
  if (agent.handoff.url) lines.push(`  handoffUrl: ${agent.handoff.url}`);
  if (agent.handoff.readTarget) {
    const count = typeof agent.handoff.readTarget.count === "number" ? ` count=${agent.handoff.readTarget.count}` : "";
    const score = typeof agent.handoff.readTarget.score === "number" ? ` score=${agent.handoff.readTarget.score}` : "";
    const primary = agent.handoff.readTarget.primary ? " primary" : "";
    lines.push(`  handoffReadTarget: ${agent.handoff.readTarget.path}${count}${score}${primary} - ${agent.handoff.readTarget.reason}`);
  }
  if (agent.handoff.browserHtml) {
    lines.push(`  handoffBrowserHtml: ${agent.handoff.browserHtml.htmlFile} capture=${agent.handoff.browserHtml.captureScript}`);
    if (agent.handoff.browserHtml.url) lines.push(`  handoffBrowserHtmlUrl: ${agent.handoff.browserHtml.url}`);
    lines.push(`  handoffBrowserHtmlFile: ${agent.handoff.browserHtml.htmlFile}`);
    lines.push(`  handoffBrowserHtmlCaptureScript: ${agent.handoff.browserHtml.captureScript}`);
    if (agent.handoff.browserHtml.command) lines.push(`    command: ${agent.handoff.browserHtml.command}`);
    if (agent.handoff.browserHtml.commandArgs) lines.push(`    commandArgs: ${formatCommandArgsText(agent.handoff.browserHtml.commandArgs)}`);
    if (agent.handoff.browserHtml.command) lines.push(`  handoffBrowserHtmlCommand: ${agent.handoff.browserHtml.command}`);
    if (agent.handoff.browserHtml.commandArgs) lines.push(`  handoffBrowserHtmlCommandArgs: ${formatCommandArgsText(agent.handoff.browserHtml.commandArgs)}`);
  }
  if (agent.handoff.sourceSearch) {
    const search = agent.handoff.sourceSearch;
    const selectedEngine = search.selectedEngine ? ` selectedEngine=${search.selectedEngine}` : "";
    const alternates = search.alternateResults?.length ? ` alternates=${search.alternateResults.length}` : "";
    lines.push(`  handoffSourceSearch: ${search.query} engine=${search.engine}${selectedEngine} selected=${search.selectedRank}${alternates} <${search.selectedUrl}>`);
    lines.push(`  handoffSourceSearchQuery: ${search.query}`);
    lines.push(`  handoffSourceSearchEngine: ${search.engine}`);
    if (search.selectedEngine) lines.push(`  handoffSourceSearchSelectedEngine: ${search.selectedEngine}`);
    lines.push(`  handoffSourceSearchSearchUrl: ${search.searchUrl}`);
    if (search.findQueries?.length) lines.push(`  handoffSourceSearchFindQueries: ${search.findQueries.join("; ")}`);
    lines.push(`  handoffSourceSearchSelectedRank: ${search.selectedRank}`);
    lines.push(`  handoffSourceSearchSelectedUrl: ${search.selectedUrl}`);
    if (search.selectedResult) lines.push(...formatAgentSourceSearchResultText(search.selectedResult, "handoffSourceSearchResult"));
    for (const result of search.alternateResults ?? []) lines.push(...formatAgentSourceSearchResultText(result, "handoffSourceSearchAlternate"));
  }
  for (const citation of agent.handoff.answerEvidence ?? []) lines.push(formatAgentCitationText(citation, "handoffEvidence"));
  for (const choice of agent.handoff.resultChoices ?? []) lines.push(...formatAgentResultChoiceText(choice, "handoffResultChoice"));
  for (const choice of agent.handoff.sourceChoices ?? []) lines.push(...formatAgentSourceChoiceText(choice, "handoffSourceChoice"));
  for (const signal of agent.handoff.signals ?? []) lines.push(formatAgentSignalText(signal, "handoffSignal"));
  for (const gate of agent.handoff.qualityGates ?? []) lines.push(formatAgentQualityGateText(gate, "handoffQualityGate"));
  for (const signal of agent.signals) lines.push(formatAgentSignalText(signal));
  if (agent.semanticSummary) {
    lines.push(`  semanticSummary: nodes=${agent.semanticSummary.nodeCount} named=${agent.semanticSummary.namedRoleCount} interactive=${agent.semanticSummary.interactiveCount}`);
    if (agent.semanticSummary.topRoles.length > 0) lines.push(`  semanticTopRoles: ${agent.semanticSummary.topRoles.map((item) => `${item.role}=${item.count}`).join(", ")}`);
    for (const item of agent.semanticSummary.semanticOutline.slice(0, 4)) lines.push(`  semanticOutline: ${item.path} ${item.kind}:${item.text} role=${item.role}${typeof item.level === "number" ? ` level=${item.level}` : ""} depth=${item.depth}${item.parentPath ? ` parent=${item.parentPath}` : ""}${item.parentRole ? ` parentRole=${item.parentRole}` : ""}${item.selector ? ` selector=${item.selector}` : ""}`);
    for (const item of agent.semanticSummary.keyboardItems.slice(0, 3)) lines.push(`  semanticKeyboard: ${item.path} ${item.role}${item.name ? `:${item.name}` : ""}${item.shortcuts?.length ? ` shortcuts=${item.shortcuts.join(",")}` : ""}${item.accessKey ? ` accessKey=${item.accessKey}` : ""}${typeof item.tabIndex === "number" ? ` tabIndex=${item.tabIndex}` : ""} focusable=${item.focusable}${item.selector ? ` selector=${item.selector}` : ""}`);
    for (const heading of agent.semanticSummary.headingItems.slice(0, 3)) lines.push(`  semanticHeading: ${heading.path} ${heading.text}${typeof heading.level === "number" ? ` level=${heading.level}` : ""}${heading.selector ? ` selector=${heading.selector}` : ""}`);
    for (const landmark of agent.semanticSummary.landmarkItems.slice(0, 3)) lines.push(`  semanticLandmark: ${landmark.path} ${landmark.role}${landmark.name ? `:${landmark.name}` : ""}${landmark.selector ? ` selector=${landmark.selector}` : ""}`);
    for (const interactive of agent.semanticSummary.interactiveRoles.slice(0, 3)) lines.push(`  semanticInteractive: ${interactive.path} ${interactive.role}:${interactive.name}${interactive.roleDescription ? ` roleDescription=${interactive.roleDescription}` : ""}${interactive.description ? ` description=${interactive.description}` : ""}${interactive.value ? ` value=${interactive.value}` : ""}${interactive.state ? ` state=${formatSemanticState(interactive.state) ?? ""}` : ""}${interactive.selector ? ` selector=${interactive.selector}` : ""}`);
  }
  if (typeof agent.semanticNodeCount === "number") lines.push(`  semanticNodeCount: ${agent.semanticNodeCount}`);
  if (typeof agent.semanticNamedRoleCount === "number") lines.push(`  semanticNamedRoleCount: ${agent.semanticNamedRoleCount}`);
  if (typeof agent.semanticInteractiveCount === "number") lines.push(`  semanticInteractiveCount: ${agent.semanticInteractiveCount}`);
  if (typeof agent.semanticFocusableCount === "number") lines.push(`  semanticFocusableCount: ${agent.semanticFocusableCount}`);
  if (typeof agent.semanticHeadingCount === "number") lines.push(`  semanticHeadingCount: ${agent.semanticHeadingCount}`);
  if (typeof agent.semanticLandmarkCount === "number") lines.push(`  semanticLandmarkCount: ${agent.semanticLandmarkCount}`);
  if (typeof agent.semanticLinkCount === "number") lines.push(`  semanticLinkCount: ${agent.semanticLinkCount}`);
  if (typeof agent.semanticButtonCount === "number") lines.push(`  semanticButtonCount: ${agent.semanticButtonCount}`);
  if (typeof agent.semanticImageCount === "number") lines.push(`  semanticImageCount: ${agent.semanticImageCount}`);
  if (typeof agent.semanticTableCount === "number") lines.push(`  semanticTableCount: ${agent.semanticTableCount}`);
  if (typeof agent.semanticListCount === "number") lines.push(`  semanticListCount: ${agent.semanticListCount}`);
  if (typeof agent.semanticFieldCount === "number") lines.push(`  semanticFieldCount: ${agent.semanticFieldCount}`);
  if (typeof agent.semanticDescriptionCount === "number") lines.push(`  semanticDescriptionCount: ${agent.semanticDescriptionCount}`);
  if (typeof agent.semanticValueCount === "number") lines.push(`  semanticValueCount: ${agent.semanticValueCount}`);
  if (typeof agent.semanticRelationCount === "number") lines.push(`  semanticRelationCount: ${agent.semanticRelationCount}`);
  if (typeof agent.semanticChoiceCount === "number") lines.push(`  semanticChoiceCount: ${agent.semanticChoiceCount}`);
  if (typeof agent.semanticStateCount === "number") lines.push(`  semanticStateCount: ${agent.semanticStateCount}`);
  if (typeof agent.semanticUnavailableCount === "number") lines.push(`  semanticUnavailableCount: ${agent.semanticUnavailableCount}`);
  if (agent.semanticTopRole) lines.push(`  semanticTopRole: ${agent.semanticTopRole}${typeof agent.semanticTopRoleCount === "number" ? `=${agent.semanticTopRoleCount}` : ""}`);
  if (agent.semanticTopHeading) lines.push(`  semanticTopHeading: ${agent.semanticTopHeadingPath ?? ""} ${agent.semanticTopHeading}${typeof agent.semanticTopHeadingLevel === "number" ? ` level=${agent.semanticTopHeadingLevel}` : ""}`);
  if (agent.semanticTopLandmark) lines.push(`  semanticTopLandmark: ${agent.semanticTopLandmarkPath ?? ""} ${agent.semanticTopLandmark}`);
  if (agent.semanticTopNamedRole) lines.push(`  semanticTopNamedRole: ${agent.semanticTopNamedRolePath ?? ""} ${agent.semanticTopNamedRole}${agent.semanticTopNamedRoleDescription ? ` roleDescription=${agent.semanticTopNamedRoleDescription}` : ""}`);
  if (agent.semanticTopInteractiveRole) lines.push(`  semanticTopInteractive: ${agent.semanticTopInteractivePath ?? ""} ${agent.semanticTopInteractiveRole}:${agent.semanticTopInteractiveName ?? ""}${agent.semanticTopInteractiveRoleDescription ? ` roleDescription=${agent.semanticTopInteractiveRoleDescription}` : ""}${agent.semanticTopInteractiveDescription ? ` description=${agent.semanticTopInteractiveDescription}` : ""}${agent.semanticTopInteractiveValue ? ` value=${agent.semanticTopInteractiveValue}` : ""}${agent.semanticTopInteractiveState ? ` state=${agent.semanticTopInteractiveState}` : ""}${typeof agent.semanticTopInteractivePressed !== "undefined" ? ` pressed=${agent.semanticTopInteractivePressed}` : ""}${typeof agent.semanticTopInteractiveExpanded === "boolean" ? ` expanded=${agent.semanticTopInteractiveExpanded}` : ""}${agent.semanticTopInteractiveHaspopup ? ` haspopup=${agent.semanticTopInteractiveHaspopup}` : ""}${agent.semanticTopInteractiveControls ? ` controls=${agent.semanticTopInteractiveControls}` : ""}${agent.semanticTopInteractiveSelector ? ` selector=${agent.semanticTopInteractiveSelector}` : ""}`);
  if (agent.semanticTopFocusableRole) lines.push(`  semanticTopFocusable: ${agent.semanticTopFocusablePath ?? ""} ${agent.semanticTopFocusableRole}${agent.semanticTopFocusableName ? `:${agent.semanticTopFocusableName}` : ""}${agent.semanticTopFocusableRoleDescription ? ` roleDescription=${agent.semanticTopFocusableRoleDescription}` : ""}${agent.semanticTopFocusableState ? ` state=${agent.semanticTopFocusableState}` : ""}${typeof agent.semanticTopFocusableDisabled === "boolean" ? ` disabled=${agent.semanticTopFocusableDisabled}` : ""}${typeof agent.semanticTopFocusablePressed !== "undefined" ? ` pressed=${agent.semanticTopFocusablePressed}` : ""}${typeof agent.semanticTopFocusableExpanded === "boolean" ? ` expanded=${agent.semanticTopFocusableExpanded}` : ""}${agent.semanticTopFocusableHaspopup ? ` haspopup=${agent.semanticTopFocusableHaspopup}` : ""}${agent.semanticTopFocusableControls ? ` controls=${agent.semanticTopFocusableControls}` : ""}${agent.semanticTopFocusableSelector ? ` selector=${agent.semanticTopFocusableSelector}` : ""}`);
  if (agent.semanticTopLinkName) lines.push(`  semanticTopLink: ${agent.semanticTopLinkPath ?? ""} ${agent.semanticTopLinkName}${agent.semanticTopLinkUrl ? ` <${agent.semanticTopLinkUrl}>` : ""}${agent.semanticTopLinkTarget ? ` target=${agent.semanticTopLinkTarget}` : ""}${agent.semanticTopLinkRel?.length ? ` rel=${agent.semanticTopLinkRel.join(",")}` : ""}${agent.semanticTopLinkType ? ` type=${agent.semanticTopLinkType}` : ""}${agent.semanticTopLinkHreflang ? ` hreflang=${agent.semanticTopLinkHreflang}` : ""}${agent.semanticTopLinkState ? ` state=${agent.semanticTopLinkState}` : ""}${typeof agent.semanticTopLinkCurrent !== "undefined" ? ` current=${agent.semanticTopLinkCurrent}` : ""}${agent.semanticTopLinkDownload ? ` download=${agent.semanticTopLinkDownload === true ? "true" : agent.semanticTopLinkDownload}` : ""}${agent.semanticTopLinkSelector ? ` selector=${agent.semanticTopLinkSelector}` : ""}`);
  if (agent.semanticTopInPageLinkName) lines.push(`  semanticTopInPageLink: ${agent.semanticTopInPageLinkPath ?? ""} ${agent.semanticTopInPageLinkKind ?? "anchor"}:${agent.semanticTopInPageLinkName}${agent.semanticTopInPageLinkTargetId ? ` target=${agent.semanticTopInPageLinkTargetId}` : ""}${agent.semanticTopInPageLinkUrl ? ` <${agent.semanticTopInPageLinkUrl}>` : ""}${agent.semanticTopInPageLinkSelector ? ` selector=${agent.semanticTopInPageLinkSelector}` : ""}`);
  if (agent.semanticTopButtonName) lines.push(`  semanticTopButton: ${agent.semanticTopButtonPath ?? ""} ${agent.semanticTopButtonName}${agent.semanticTopButtonRoleDescription ? ` roleDescription=${agent.semanticTopButtonRoleDescription}` : ""}${agent.semanticTopButtonDescription ? ` description=${agent.semanticTopButtonDescription}` : ""}${agent.semanticTopButtonType ? ` type=${agent.semanticTopButtonType}` : ""}${agent.semanticTopButtonState ? ` state=${agent.semanticTopButtonState}` : ""}${typeof agent.semanticTopButtonDisabled === "boolean" ? ` disabled=${agent.semanticTopButtonDisabled}` : ""}${typeof agent.semanticTopButtonPressed !== "undefined" ? ` pressed=${agent.semanticTopButtonPressed}` : ""}${typeof agent.semanticTopButtonExpanded === "boolean" ? ` expanded=${agent.semanticTopButtonExpanded}` : ""}${agent.semanticTopButtonHaspopup ? ` haspopup=${agent.semanticTopButtonHaspopup}` : ""}${agent.semanticTopButtonControls ? ` controls=${agent.semanticTopButtonControls}` : ""}${agent.semanticTopButtonFormAction ? ` formAction=${agent.semanticTopButtonFormAction}` : ""}${agent.semanticTopButtonFormMethod ? ` formMethod=${agent.semanticTopButtonFormMethod}` : ""}${agent.semanticTopButtonFormTarget ? ` formTarget=${agent.semanticTopButtonFormTarget}` : ""}${agent.semanticTopButtonFormEncType ? ` formEncType=${agent.semanticTopButtonFormEncType}` : ""}${typeof agent.semanticTopButtonFormNoValidate === "boolean" ? ` formNoValidate=${agent.semanticTopButtonFormNoValidate}` : ""}${agent.semanticTopButtonFormId ? ` form=${agent.semanticTopButtonFormId}` : ""}${agent.semanticTopButtonSelector ? ` selector=${agent.semanticTopButtonSelector}` : ""}`);
  if (agent.semanticTopImagePath) lines.push(`  semanticTopImage: ${agent.semanticTopImagePath} ${agent.semanticTopImageName ?? ""}${agent.semanticTopImageUrl ? ` <${agent.semanticTopImageUrl}>` : ""}${typeof agent.semanticTopImageWidth === "number" ? ` width=${agent.semanticTopImageWidth}` : ""}${typeof agent.semanticTopImageHeight === "number" ? ` height=${agent.semanticTopImageHeight}` : ""}${agent.semanticTopImageLoading ? ` loading=${agent.semanticTopImageLoading}` : ""}${agent.semanticTopImageDecoding ? ` decoding=${agent.semanticTopImageDecoding}` : ""}${agent.semanticTopImageSrcset ? ` srcset=${agent.semanticTopImageSrcset}` : ""}${agent.semanticTopImageSizes ? ` sizes=${agent.semanticTopImageSizes}` : ""}${agent.semanticTopImageSelector ? ` selector=${agent.semanticTopImageSelector}` : ""}`);
  if (agent.semanticTopTableRole) lines.push(`  semanticTopTable: ${agent.semanticTopTablePath ?? ""} ${agent.semanticTopTableRole}${agent.semanticTopTableName ? `:${agent.semanticTopTableName}` : ""} rows=${agent.semanticTopTableRowCount ?? 0} cells=${agent.semanticTopTableCellCount ?? 0}${typeof agent.semanticTopTableDeclaredRowCount === "number" ? ` declaredRows=${agent.semanticTopTableDeclaredRowCount}` : ""}${typeof agent.semanticTopTableDeclaredColumnCount === "number" ? ` declaredColumns=${agent.semanticTopTableDeclaredColumnCount}` : ""}${agent.semanticTopTableHeaders?.length ? ` headers=${agent.semanticTopTableHeaders.join(", ")}` : ""}${agent.semanticTopTableHeaderRefs?.length ? ` headerRefs=${agent.semanticTopTableHeaderRefs.map((header) => `${header.text}${header.role ? `:${header.role}` : ""}${typeof header.rowIndex === "number" ? `@r${header.rowIndex}` : ""}${typeof header.columnIndex === "number" ? `c${header.columnIndex}` : ""}${header.sort ? ` sort=${header.sort}` : ""}`).join(", ")}` : ""}${typeof agent.semanticTopTableOwnedCount === "number" ? ` owned=${agent.semanticTopTableOwnedCount}` : ""}${agent.semanticTopTableOwnedRefs?.length ? ` ownedRefs=${agent.semanticTopTableOwnedRefs.map((owned) => `${owned.target}${owned.role ? `:${owned.role}` : ""}${owned.name ? `:${owned.name}` : ""}`).join(", ")}` : ""}${agent.semanticTopTableSampleCells?.length ? ` samples=${agent.semanticTopTableSampleCells.join(", ")}` : ""}${agent.semanticTopTableSampleCellRefs?.length ? ` sampleRefs=${agent.semanticTopTableSampleCellRefs.map((cell) => `${cell.text}${typeof cell.rowIndex === "number" ? `@r${cell.rowIndex}` : ""}${typeof cell.columnIndex === "number" ? `c${cell.columnIndex}` : ""}${typeof cell.rowSpan === "number" ? ` rowSpan=${cell.rowSpan}` : ""}${typeof cell.columnSpan === "number" ? ` columnSpan=${cell.columnSpan}` : ""}${cell.headers?.length ? ` headers=${cell.headers.join("|")}` : ""}${cell.rowHeaders?.length ? ` rowHeaders=${cell.rowHeaders.join("|")}` : ""}${cell.columnHeaders?.length ? ` columnHeaders=${cell.columnHeaders.join("|")}` : ""}${typeof cell.selected === "boolean" ? ` selected=${cell.selected}` : ""}${typeof cell.current !== "undefined" ? ` current=${cell.current}` : ""}`).join(", ")}` : ""}${agent.semanticTopTableSelector ? ` selector=${agent.semanticTopTableSelector}` : ""}`);
  if (agent.semanticTopTableFirstHeaderPath) lines.push(`  semanticTopTableFirstHeader: ${agent.semanticTopTableFirstHeaderPath} ${agent.semanticTopTableFirstHeader ?? ""}${agent.semanticTopTableFirstHeaderRole ? ` role=${agent.semanticTopTableFirstHeaderRole}` : ""}${typeof agent.semanticTopTableFirstHeaderRowIndex === "number" ? ` row=${agent.semanticTopTableFirstHeaderRowIndex}` : ""}${typeof agent.semanticTopTableFirstHeaderColumnIndex === "number" ? ` column=${agent.semanticTopTableFirstHeaderColumnIndex}` : ""}${agent.semanticTopTableFirstHeaderSort ? ` sort=${agent.semanticTopTableFirstHeaderSort}` : ""}${agent.semanticTopTableFirstHeaderSelector ? ` selector=${agent.semanticTopTableFirstHeaderSelector}` : ""}`);
  if (agent.semanticTopTableFirstSampleCellText) lines.push(`  semanticTopTableFirstSampleCell: ${agent.semanticTopTableFirstSampleCellPath ?? ""} ${agent.semanticTopTableFirstSampleCellText}${typeof agent.semanticTopTableFirstSampleCellRowIndex === "number" ? ` row=${agent.semanticTopTableFirstSampleCellRowIndex}` : ""}${typeof agent.semanticTopTableFirstSampleCellColumnIndex === "number" ? ` column=${agent.semanticTopTableFirstSampleCellColumnIndex}` : ""}${agent.semanticTopTableFirstSampleCellHeaders?.length ? ` headers=${agent.semanticTopTableFirstSampleCellHeaders.join("|")}` : ""}${agent.semanticTopTableFirstSampleCellRowHeaders?.length ? ` rowHeaders=${agent.semanticTopTableFirstSampleCellRowHeaders.join("|")}` : ""}${agent.semanticTopTableFirstSampleCellColumnHeaders?.length ? ` columnHeaders=${agent.semanticTopTableFirstSampleCellColumnHeaders.join("|")}` : ""}${typeof agent.semanticTopTableFirstSampleCellSelected === "boolean" ? ` selected=${agent.semanticTopTableFirstSampleCellSelected}` : ""}${typeof agent.semanticTopTableFirstSampleCellCurrent !== "undefined" ? ` current=${agent.semanticTopTableFirstSampleCellCurrent}` : ""}${agent.semanticTopTableFirstSampleCellSelector ? ` selector=${agent.semanticTopTableFirstSampleCellSelector}` : ""}`);
  if (agent.semanticTopSelectedTableCellText) lines.push(`  semanticTopSelectedTableCell: ${agent.semanticTopSelectedTableCellPath ?? ""} ${agent.semanticTopSelectedTableCellText}${typeof agent.semanticTopSelectedTableCellRowIndex === "number" ? ` row=${agent.semanticTopSelectedTableCellRowIndex}` : ""}${typeof agent.semanticTopSelectedTableCellColumnIndex === "number" ? ` column=${agent.semanticTopSelectedTableCellColumnIndex}` : ""}${typeof agent.semanticTopSelectedTableCellSelected === "boolean" ? ` selected=${agent.semanticTopSelectedTableCellSelected}` : ""}${typeof agent.semanticTopSelectedTableCellCurrent !== "undefined" ? ` current=${agent.semanticTopSelectedTableCellCurrent}` : ""}${agent.semanticTopSelectedTableCellSelector ? ` selector=${agent.semanticTopSelectedTableCellSelector}` : ""}`);
  if (agent.semanticTopListRole) lines.push(`  semanticTopList: ${agent.semanticTopListPath ?? ""} ${agent.semanticTopListRole}${agent.semanticTopListName ? `:${agent.semanticTopListName}` : ""} items=${agent.semanticTopListItemCount ?? 0}${agent.semanticTopListItems?.length ? ` samples=${agent.semanticTopListItems.join(", ")}` : ""}${agent.semanticTopListItemRefs?.length ? ` itemRefs=${agent.semanticTopListItemRefs.map((item) => `${item.text}${item.role ? ` role=${item.role}` : ""}${typeof item.level === "number" ? ` level=${item.level}` : ""}${typeof item.posInSet === "number" ? ` pos=${item.posInSet}` : ""}${typeof item.setSize === "number" ? ` size=${item.setSize}` : ""}${typeof item.selected === "boolean" ? ` selected=${item.selected}` : ""}${typeof item.current !== "undefined" ? ` current=${item.current}` : ""}${typeof item.expanded === "boolean" ? ` expanded=${item.expanded}` : ""}`).join(", ")}` : ""}${agent.semanticTopListFirstItemText ? ` firstItem=${agent.semanticTopListFirstItemText}${agent.semanticTopListFirstItemRole ? ` role=${agent.semanticTopListFirstItemRole}` : ""}${typeof agent.semanticTopListFirstItemLevel === "number" ? ` level=${agent.semanticTopListFirstItemLevel}` : ""}${typeof agent.semanticTopListFirstItemPosInSet === "number" ? ` pos=${agent.semanticTopListFirstItemPosInSet}` : ""}${typeof agent.semanticTopListFirstItemSetSize === "number" ? ` size=${agent.semanticTopListFirstItemSetSize}` : ""}${typeof agent.semanticTopListFirstItemSelected === "boolean" ? ` selected=${agent.semanticTopListFirstItemSelected}` : ""}${typeof agent.semanticTopListFirstItemCurrent !== "undefined" ? ` current=${agent.semanticTopListFirstItemCurrent}` : ""}${typeof agent.semanticTopListFirstItemExpanded === "boolean" ? ` expanded=${agent.semanticTopListFirstItemExpanded}` : ""}${agent.semanticTopListFirstItemSelector ? ` selector=${agent.semanticTopListFirstItemSelector}` : ""}` : ""}${agent.semanticTopListSelector ? ` selector=${agent.semanticTopListSelector}` : ""}`);
  if (agent.semanticTopFieldRole) lines.push(`  semanticTopField: ${agent.semanticTopFieldPath ?? ""} ${agent.semanticTopFieldRole}${agent.semanticTopFieldName ? `:${agent.semanticTopFieldName}` : ""}${agent.semanticTopFieldDescription ? ` description=${agent.semanticTopFieldDescription}` : ""}${agent.semanticTopFieldValue ? ` value=${agent.semanticTopFieldValue}` : ""}${agent.semanticTopFieldHtmlName ? ` htmlName=${agent.semanticTopFieldHtmlName}` : ""}${agent.semanticTopFieldHtmlType ? ` htmlType=${agent.semanticTopFieldHtmlType}` : ""}${agent.semanticTopFieldPlaceholder ? ` placeholder=${agent.semanticTopFieldPlaceholder}` : ""}${agent.semanticTopFieldAriaPlaceholder ? ` ariaPlaceholder=${agent.semanticTopFieldAriaPlaceholder}` : ""}${agent.semanticTopFieldAutocomplete ? ` autocomplete=${agent.semanticTopFieldAutocomplete}` : ""}${agent.semanticTopFieldAriaAutocomplete ? ` ariaAutocomplete=${agent.semanticTopFieldAriaAutocomplete}` : ""}${agent.semanticTopFieldInputMode ? ` inputMode=${agent.semanticTopFieldInputMode}` : ""}${agent.semanticTopFieldPattern ? ` pattern=${agent.semanticTopFieldPattern}` : ""}${agent.semanticTopFieldMin ? ` min=${agent.semanticTopFieldMin}` : ""}${agent.semanticTopFieldMax ? ` max=${agent.semanticTopFieldMax}` : ""}${agent.semanticTopFieldStep ? ` step=${agent.semanticTopFieldStep}` : ""}${typeof agent.semanticTopFieldMinLength === "number" ? ` minLength=${agent.semanticTopFieldMinLength}` : ""}${typeof agent.semanticTopFieldMaxLength === "number" ? ` maxLength=${agent.semanticTopFieldMaxLength}` : ""}${agent.semanticTopFieldLabelledBy ? ` labelledBy=${agent.semanticTopFieldLabelledBy}` : ""}${agent.semanticTopFieldLabelledByText ? ` labelledByText=${agent.semanticTopFieldLabelledByText}` : ""}${agent.semanticTopFieldDescribedBy ? ` describedBy=${agent.semanticTopFieldDescribedBy}` : ""}${agent.semanticTopFieldDescribedByText ? ` describedByText=${agent.semanticTopFieldDescribedByText}` : ""}${agent.semanticTopFieldDetails ? ` details=${agent.semanticTopFieldDetails}` : ""}${agent.semanticTopFieldDetailsText ? ` detailsText=${agent.semanticTopFieldDetailsText}` : ""}${agent.semanticTopFieldErrorMessage ? ` errorMessage=${agent.semanticTopFieldErrorMessage}` : ""}${agent.semanticTopFieldErrorMessageText ? ` errorMessageText=${agent.semanticTopFieldErrorMessageText}` : ""}${agent.semanticTopFieldState ? ` state=${agent.semanticTopFieldState}` : ""}${typeof agent.semanticTopFieldDisabled === "boolean" ? ` disabled=${agent.semanticTopFieldDisabled}` : ""}${typeof agent.semanticTopFieldRequired === "boolean" ? ` required=${agent.semanticTopFieldRequired}` : ""}${typeof agent.semanticTopFieldReadonly === "boolean" ? ` readonly=${agent.semanticTopFieldReadonly}` : ""}${agent.semanticTopFieldInvalid ? ` invalid=${agent.semanticTopFieldInvalid}` : ""}${typeof agent.semanticTopFieldChecked !== "undefined" ? ` checked=${agent.semanticTopFieldChecked}` : ""}${typeof agent.semanticTopFieldExpanded === "boolean" ? ` expanded=${agent.semanticTopFieldExpanded}` : ""}${agent.semanticTopFieldHaspopup ? ` haspopup=${agent.semanticTopFieldHaspopup}` : ""}${agent.semanticTopFieldControls ? ` controls=${agent.semanticTopFieldControls}` : ""}${typeof agent.semanticTopFieldValueMin === "number" ? ` valueMin=${agent.semanticTopFieldValueMin}` : ""}${typeof agent.semanticTopFieldValueMax === "number" ? ` valueMax=${agent.semanticTopFieldValueMax}` : ""}${typeof agent.semanticTopFieldValueNow === "number" ? ` valueNow=${agent.semanticTopFieldValueNow}` : ""}${agent.semanticTopFieldValueText ? ` valueText=${agent.semanticTopFieldValueText}` : ""}${agent.semanticTopFieldSelector ? ` selector=${agent.semanticTopFieldSelector}` : ""}`);
  if (agent.semanticTopDescriptionText) lines.push(`  semanticTopDescription: ${agent.semanticTopDescriptionPath ?? ""} ${agent.semanticTopDescriptionRole ?? ""}${agent.semanticTopDescriptionName ? `:${agent.semanticTopDescriptionName}` : ""} description=${agent.semanticTopDescriptionText}${agent.semanticTopDescriptionSelector ? ` selector=${agent.semanticTopDescriptionSelector}` : ""}`);
  if (agent.semanticTopValue) lines.push(`  semanticTopValue: ${agent.semanticTopValuePath ?? ""} ${agent.semanticTopValueRole ?? ""}${agent.semanticTopValueName ? `:${agent.semanticTopValueName}` : ""} value=${agent.semanticTopValue}${agent.semanticTopValueSelector ? ` selector=${agent.semanticTopValueSelector}` : ""}`);
  if (agent.semanticTopRelation) lines.push(`  semanticTopRelation: ${agent.semanticTopRelationPath ?? ""} ${agent.semanticTopRelationRole ?? ""}${agent.semanticTopRelationName ? `:${agent.semanticTopRelationName}` : ""} ${agent.semanticTopRelation}=${agent.semanticTopRelationTarget ?? ""}${agent.semanticTopRelationTargetRole ? ` targetRole=${agent.semanticTopRelationTargetRole}` : ""}${agent.semanticTopRelationTargetName ? ` targetName=${agent.semanticTopRelationTargetName}` : ""}${agent.semanticTopRelationTargetSelector ? ` targetSelector=${agent.semanticTopRelationTargetSelector}` : ""}${agent.semanticTopRelationSelector ? ` selector=${agent.semanticTopRelationSelector}` : ""}`);
  if (agent.semanticTopChoiceRole) lines.push(`  semanticTopChoice: ${agent.semanticTopChoicePath ?? ""} ${agent.semanticTopChoiceRole}:${agent.semanticTopChoiceName ?? ""}${agent.semanticTopChoiceState ? ` state=${agent.semanticTopChoiceState}` : ""}${typeof agent.semanticTopChoiceSelected === "boolean" ? ` selected=${agent.semanticTopChoiceSelected}` : ""}${typeof agent.semanticTopChoiceCurrent !== "undefined" ? ` current=${agent.semanticTopChoiceCurrent}` : ""}${typeof agent.semanticTopChoiceLevel === "number" ? ` level=${agent.semanticTopChoiceLevel}` : ""}${typeof agent.semanticTopChoicePosInSet === "number" ? ` posInSet=${agent.semanticTopChoicePosInSet}` : ""}${typeof agent.semanticTopChoiceSetSize === "number" ? ` setSize=${agent.semanticTopChoiceSetSize}` : ""}${agent.semanticTopChoiceSelector ? ` selector=${agent.semanticTopChoiceSelector}` : ""}`);
  if (agent.semanticTopSelectedChoiceRole) lines.push(`  semanticTopSelectedChoice: ${agent.semanticTopSelectedChoicePath ?? ""} ${agent.semanticTopSelectedChoiceRole}:${agent.semanticTopSelectedChoiceName ?? ""}${agent.semanticTopSelectedChoiceState ? ` state=${agent.semanticTopSelectedChoiceState}` : ""}${typeof agent.semanticTopSelectedChoiceSelected === "boolean" ? ` selected=${agent.semanticTopSelectedChoiceSelected}` : ""}${typeof agent.semanticTopSelectedChoiceCurrent !== "undefined" ? ` current=${agent.semanticTopSelectedChoiceCurrent}` : ""}${typeof agent.semanticTopSelectedChoiceLevel === "number" ? ` level=${agent.semanticTopSelectedChoiceLevel}` : ""}${typeof agent.semanticTopSelectedChoicePosInSet === "number" ? ` posInSet=${agent.semanticTopSelectedChoicePosInSet}` : ""}${typeof agent.semanticTopSelectedChoiceSetSize === "number" ? ` setSize=${agent.semanticTopSelectedChoiceSetSize}` : ""}${agent.semanticTopSelectedChoiceControls ? ` controls=${agent.semanticTopSelectedChoiceControls}` : ""}${agent.semanticTopSelectedChoiceControlsTargetRole ? ` controlsTargetRole=${agent.semanticTopSelectedChoiceControlsTargetRole}` : ""}${agent.semanticTopSelectedChoiceControlsTargetName ? ` controlsTargetName=${agent.semanticTopSelectedChoiceControlsTargetName}` : ""}${agent.semanticTopSelectedChoiceControlsTargetSelector ? ` controlsTargetSelector=${agent.semanticTopSelectedChoiceControlsTargetSelector}` : ""}${agent.semanticTopSelectedChoiceSelector ? ` selector=${agent.semanticTopSelectedChoiceSelector}` : ""}`);
  if (agent.semanticTopState) lines.push(`  semanticTopState: ${agent.semanticTopStatePath ?? ""} ${agent.semanticTopStateRole ?? ""}${agent.semanticTopStateName ? `:${agent.semanticTopStateName}` : ""} state=${agent.semanticTopState}${typeof agent.semanticTopStateBusy === "boolean" ? ` busy=${agent.semanticTopStateBusy}` : ""}${typeof agent.semanticTopStateMultiselectable === "boolean" ? ` multiselectable=${agent.semanticTopStateMultiselectable}` : ""}${agent.semanticTopStateSort ? ` sort=${agent.semanticTopStateSort}` : ""}${typeof agent.semanticTopStateGrabbed === "boolean" ? ` grabbed=${agent.semanticTopStateGrabbed}` : ""}${agent.semanticTopStateDropEffect ? ` dropEffect=${agent.semanticTopStateDropEffect}` : ""}${agent.semanticTopStateCurrent ? ` current=${agent.semanticTopStateCurrent}` : ""}${agent.semanticTopStateControls ? ` controls=${agent.semanticTopStateControls}` : ""}${agent.semanticTopStateHaspopup ? ` haspopup=${agent.semanticTopStateHaspopup}` : ""}${typeof agent.semanticTopStateExpanded === "boolean" ? ` expanded=${agent.semanticTopStateExpanded}` : ""}${typeof agent.semanticTopStatePressed !== "undefined" ? ` pressed=${agent.semanticTopStatePressed}` : ""}${agent.semanticTopStateInvalid ? ` invalid=${agent.semanticTopStateInvalid}` : ""}${agent.semanticTopStateLive ? ` live=${agent.semanticTopStateLive}` : ""}${typeof agent.semanticTopStateModal === "boolean" ? ` modal=${agent.semanticTopStateModal}` : ""}${agent.semanticTopStateOrientation ? ` orientation=${agent.semanticTopStateOrientation}` : ""}${typeof agent.semanticTopStateValueMin === "number" ? ` valueMin=${agent.semanticTopStateValueMin}` : ""}${typeof agent.semanticTopStateValueMax === "number" ? ` valueMax=${agent.semanticTopStateValueMax}` : ""}${typeof agent.semanticTopStateValueNow === "number" ? ` valueNow=${agent.semanticTopStateValueNow}` : ""}${agent.semanticTopStateValueText ? ` valueText=${agent.semanticTopStateValueText}` : ""}${agent.semanticTopStateSelector ? ` selector=${agent.semanticTopStateSelector}` : ""}`);
  if (agent.semanticTopModalState) lines.push(`  semanticTopModalState: ${agent.semanticTopModalStatePath ?? ""} ${agent.semanticTopModalStateRole ?? ""}${agent.semanticTopModalStateName ? `:${agent.semanticTopModalStateName}` : ""} state=${agent.semanticTopModalState}${agent.semanticTopModalStateSelector ? ` selector=${agent.semanticTopModalStateSelector}` : ""}`);
  if (agent.semanticTopLiveState) lines.push(`  semanticTopLiveState: ${agent.semanticTopLiveStatePath ?? ""} ${agent.semanticTopLiveStateRole ?? ""}${agent.semanticTopLiveStateName ? `:${agent.semanticTopLiveStateName}` : ""} state=${agent.semanticTopLiveState}${agent.semanticTopLiveStateLive ? ` live=${agent.semanticTopLiveStateLive}` : ""}${agent.semanticTopLiveStateSelector ? ` selector=${agent.semanticTopLiveStateSelector}` : ""}`);
  if (agent.semanticTopUnavailableReason) lines.push(`  semanticTopUnavailable: ${agent.semanticTopUnavailablePath ?? ""} ${agent.semanticTopUnavailableTag ?? ""}${agent.semanticTopUnavailableRole ? ` role=${agent.semanticTopUnavailableRole}` : ""}${agent.semanticTopUnavailableName ? ` name=${agent.semanticTopUnavailableName}` : ""} reason=${agent.semanticTopUnavailableReason}${agent.semanticTopUnavailableSelector ? ` selector=${agent.semanticTopUnavailableSelector}` : ""}`);
  for (const reason of agent.readabilityReasons) lines.push(`  readabilityReason: ${reason}`);
  for (const gate of agent.qualityGates) lines.push(formatAgentQualityGateText(gate));
  for (const citation of agent.citations) lines.push(formatAgentCitationText(citation));
  if (agent.bestReadTarget) lines.push(`  bestReadTarget: ${agent.bestReadTarget}`);
  if (typeof agent.bestReadTargetCount === "number") lines.push(`  bestReadTargetCount: ${agent.bestReadTargetCount}`);
  if (typeof agent.bestReadTargetScore === "number") lines.push(`  bestReadTargetScore: ${agent.bestReadTargetScore}`);
  if (typeof agent.bestReadTargetPrimary === "boolean") lines.push(`  bestReadTargetPrimary: ${agent.bestReadTargetPrimary}`);
  if (agent.bestReadTargetReason) lines.push(`  bestReadTargetReason: ${agent.bestReadTargetReason}`);
  if (agent.primaryActionName) lines.push(`  primaryActionName: ${agent.primaryActionName}`);
  if (agent.primaryReason) lines.push(`  primaryReason: ${agent.primaryReason}`);
  if (agent.primaryPriority) lines.push(`  primaryPriority: ${agent.primaryPriority}`);
  if (agent.primaryPriorityReason) lines.push(`  primaryPriorityReason: ${agent.primaryPriorityReason}`);
  if (agent.primarySourceLinkRef) lines.push(`  primarySourceLinkRef: ${agent.primarySourceLinkRef}`);
  if (agent.recommendedUrl) lines.push(`  recommendedUrl: ${agent.recommendedUrl}`);
  if (agent.recommendedTitle) lines.push(`  recommendedTitle: ${agent.recommendedTitle}`);
  if (agent.recommendedRank) lines.push(`  recommendedRank: ${agent.recommendedRank}`);
  if (agent.recommendedSource) lines.push(`  recommendedSource: ${agent.recommendedSource}`);
  if (agent.recommendedRelevance) lines.push(`  recommendedRelevance: ${agent.recommendedRelevance}`);
  if (typeof agent.recommendedLikelyOfficial === "boolean") lines.push(`  recommendedLikelyOfficial: ${agent.recommendedLikelyOfficial}`);
  if (agent.recommendedSelectionReason) lines.push(`  recommendedSelectionReason: ${agent.recommendedSelectionReason}`);
  if (agent.recommendedCommand) lines.push(`  recommendedCommand: ${agent.recommendedCommand}`);
  if (agent.recommendedCommandArgs) lines.push(`  recommendedCommandArgs: ${formatCommandArgsText(agent.recommendedCommandArgs)}`);
  for (const choice of agent.resultChoices) lines.push(...formatAgentResultChoiceText(choice));
  for (const choice of agent.sourceChoices) lines.push(...formatAgentSourceChoiceText(choice));
  for (const choice of agent.formChoices) lines.push(...formatAgentFormChoiceText(choice));
  for (const choice of agent.actionTargetChoices) lines.push(...formatAgentActionTargetChoiceText(choice));
  for (const target of agent.readTargets) {
    const count = typeof target.count === "number" ? ` count=${target.count}` : "";
    const score = typeof target.score === "number" ? ` score=${target.score}` : "";
    const primary = target.primary ? " primary" : "";
    lines.push(`  readTarget: ${target.path}${count}${score}${primary} - ${target.reason}`);
  }
  for (const action of agent.actions) {
    const primary = action.primary ? " primary" : "";
    const target = action.url ? ` <${action.url}>` : "";
    lines.push(`  actionCandidate: ${action.source}${primary} ${formatActionLabel(action)}${target} - ${action.priority ?? actionPriority(action)} - ${action.reason}`);
    if (action.sourceLinkRef) lines.push(`    sourceLinkRef: ${action.sourceLinkRef}`);
  }
  if (agent.primaryAction) {
    lines.push(`  next: ${formatActionLabel(agent.primaryAction)} - ${agent.primaryAction.reason}`);
    lines.push(`  execution: ${actionExecution(agent.primaryAction)}`);
    lines.push(`  priority: ${agent.primaryAction.priority ?? actionPriority(agent.primaryAction)} - ${agent.primaryAction.priorityReason ?? actionPriorityReason(agent.primaryAction)}`);
    if (agent.primaryAction.url) lines.push(`  url: ${agent.primaryAction.url}`);
    if (agent.primaryAction.rank) lines.push(`  rank: ${agent.primaryAction.rank}`);
    if (agent.primaryAction.openResult) lines.push(`  openResult: ${agent.primaryAction.openResult}`);
    if (agent.primaryAction.readFrom) lines.push(`  readFrom: ${agent.primaryAction.readFrom}`);
    if (agent.primaryAction.sourceLinkRef) lines.push(`  sourceLinkRef: ${agent.primaryAction.sourceLinkRef}`);
    if (agent.primaryAction.requiresBrowserInteraction) lines.push("  requiresBrowserInteraction: true");
    if (agent.primaryAction.command) lines.push(`  command: ${agent.primaryAction.command}`);
    if (agent.primaryAction.commandArgs) lines.push(`  commandArgs: ${formatCommandArgsText(agent.primaryAction.commandArgs)}`);
    if (agent.primaryAction.afterInteractionCommand) lines.push(`  afterInteractionCommand: ${agent.primaryAction.afterInteractionCommand}`);
    if (agent.primaryAction.afterInteractionCommandArgs) lines.push(`  afterInteractionCommandArgs: ${formatCommandArgsText(agent.primaryAction.afterInteractionCommandArgs)}`);
  }
  return lines;
}

function formatPageCheckText(pageCheck: PageCheckSummary): string[] {
  const lines = [
    `  confidence: ${pageCheck.confidence}`,
    `  readability: ${pageCheck.readability.level} (${pageCheck.readability.score})`,
    `  contentLength: ${pageCheck.contentLength}`,
  ];
  if (pageCheck.title) lines.push(`  title: ${pageCheck.title}`);
  if (pageCheck.mainHeading) lines.push(`  mainHeading: ${pageCheck.mainHeading}`);
  if (pageCheck.canonicalUrl) lines.push(`  canonical: ${pageCheck.canonicalUrl}`);
  if (pageCheck.lang) lines.push(`  lang: ${pageCheck.lang}`);
  if (pageCheck.dir) lines.push(`  dir: ${pageCheck.dir}`);
  if (pageCheck.siteName) lines.push(`  site: ${pageCheck.siteName}`);
  if (pageCheck.author) lines.push(`  author: ${pageCheck.author}`);
  if (pageCheck.publishedTime) lines.push(`  published: ${pageCheck.publishedTime}`);
  if (pageCheck.modifiedTime) lines.push(`  modified: ${pageCheck.modifiedTime}`);
  if (pageCheck.structuredDataTypes?.length) lines.push(`  schemaTypes: ${pageCheck.structuredDataTypes.join(", ")}`);
  for (const excerpt of pageCheck.contentPreview) lines.push(`  excerpt: ${excerpt}`);
  for (const evidence of pageCheck.contentEvidence) {
    const selector = evidence.selector ? ` (${evidence.selector})` : "";
    lines.push(`  evidence: ${evidence.id} ${evidence.path} ${evidence.rank}. ${evidence.role}${selector} ${evidence.quality} - ${evidence.qualityReason} ${evidence.text}`);
  }
  for (const table of pageCheck.dataTables) {
    const caption = table.caption ? ` caption="${table.caption}"` : "";
    lines.push(`  dataTable: ${table.id} ${table.path} ${table.rowCount}x${table.columnCount}${caption} - ${table.text}`);
  }
  for (const barrier of pageCheck.barriers) {
    const selector = barrier.selector ? ` (${barrier.selector})` : "";
    lines.push(`  barrier: ${barrier.id} ${barrier.path} ${barrier.kind} ${barrier.severity}${selector} - ${barrier.text}`);
  }
  for (const form of pageCheck.forms) {
    const template = form.urlTemplate ? ` template=${form.urlTemplate}` : "";
    lines.push(`  form: ${form.id} ${form.path} ${form.method.toUpperCase()} fields=${form.fieldCount}${template} - ${form.text}`);
  }
  for (const target of pageCheck.actionTargets) {
    const url = target.targetUrl ? ` <${target.targetUrl}>` : "";
    const template = target.urlTemplate ? ` template=${target.urlTemplate}` : "";
    const selector = target.selector ? ` (${target.selector})` : "";
    lines.push(`  actionTarget: ${target.id} ${target.path} ${target.kind}${template}${selector}${url} - ${target.text}`);
  }
  for (const item of pageCheck.hydration) {
    const url = item.url ? ` <${item.url}>` : "";
    const selector = item.selector ? ` (${item.selector})` : "";
    lines.push(`  hydration: ${item.id} ${item.path} ${item.kind}${selector}${url} - ${item.text}`);
  }
  for (const endpoint of pageCheck.apiEndpoints) {
    const method = endpoint.method ? ` ${endpoint.method}` : "";
    const selector = endpoint.selector ? ` (${endpoint.selector})` : "";
    lines.push(`  apiEndpoint: ${endpoint.id} ${endpoint.path} ${endpoint.kind}${method}${selector} <${endpoint.url}> - ${endpoint.text}`);
  }
  for (const state of pageCheck.clientState) {
    const selector = state.selector ? ` (${state.selector})` : "";
    lines.push(`  clientState: ${state.id} ${state.path} ${state.kind} ${state.operation}${selector} - ${state.text}`);
  }
  for (const runtime of pageCheck.runtime) {
    const selector = runtime.selector ? ` (${runtime.selector})` : "";
    lines.push(`  runtime: ${runtime.id} ${runtime.path} ${runtime.kind}${selector} <${runtime.url}> - ${runtime.text}`);
  }
  for (const config of pageCheck.config) {
    const selector = config.selector ? ` (${config.selector})` : "";
    lines.push(`  config: ${config.id} ${config.path} ${config.kind}${selector} - ${config.text}`);
  }
  for (const hint of pageCheck.appHints) {
    const url = hint.url ? ` <${hint.url}>` : "";
    const selector = hint.selector ? ` (${hint.selector})` : "";
    lines.push(`  appHint: ${hint.id} ${hint.path} ${hint.kind}${selector}${url} - ${hint.text}`);
  }
  for (const hint of pageCheck.mobileHints) {
    const url = hint.url ? ` <${hint.url}>` : "";
    const platform = hint.platform ? ` ${hint.platform}` : "";
    const selector = hint.selector ? ` (${hint.selector})` : "";
    lines.push(`  mobileHint: ${hint.id} ${hint.path} ${hint.kind}${platform}${selector}${url} - ${hint.text}`);
  }
  for (const topic of pageCheck.topics) {
    const selector = topic.selector ? ` (${topic.selector})` : "";
    lines.push(`  topic: ${topic.id} ${topic.path} ${topic.kind}${selector} - ${topic.text}`);
  }
  for (const fact of pageCheck.keyValues) {
    const datetime = fact.datetime ? ` datetime=${fact.datetime}` : "";
    lines.push(`  keyValue: ${fact.id} ${fact.path} ${fact.source}${datetime} - ${fact.text}`);
  }
  for (const fact of pageCheck.metaFacts) {
    const url = fact.url ? ` <${fact.url}>` : "";
    const selector = fact.selector ? ` (${fact.selector})` : "";
    lines.push(`  metaFact: ${fact.id} ${fact.path} ${fact.source}${selector}${url} - ${fact.text}`);
  }
  for (const fact of pageCheck.provenance) {
    const url = fact.url ? ` <${fact.url}>` : "";
    const selector = fact.selector ? ` (${fact.selector})` : "";
    lines.push(`  provenance: ${fact.id} ${fact.path} ${fact.kind}${selector}${url} - ${fact.text}`);
  }
  for (const policy of pageCheck.httpPolicies) {
    const selector = policy.selector ? ` (${policy.selector})` : "";
    lines.push(`  httpPolicy: ${policy.id} ${policy.path} ${policy.source}${selector} - ${policy.text}`);
  }
  for (const fact of pageCheck.schemaFacts) {
    lines.push(`  schemaFact: ${fact.id} ${fact.path} ${fact.types.join(",") || "unknown"} - ${fact.text}`);
  }
  for (const offer of pageCheck.offers) {
    const url = offer.url ? ` <${offer.url}>` : "";
    const selector = offer.selector ? ` (${offer.selector})` : "";
    lines.push(`  offer: ${offer.id} ${offer.path}${selector}${url} - ${offer.text}`);
  }
  for (const identity of pageCheck.identities) {
    const url = identity.url ? ` <${identity.url}>` : "";
    const selector = identity.selector ? ` (${identity.selector})` : "";
    lines.push(`  identity: ${identity.id} ${identity.path} ${identity.kind}${selector}${url} - ${identity.text}`);
  }
  for (const dataset of pageCheck.datasets) {
    const url = dataset.url ? ` <${dataset.url}>` : "";
    const selector = dataset.selector ? ` (${dataset.selector})` : "";
    lines.push(`  dataset: ${dataset.id} ${dataset.path} ${dataset.kind}${selector}${url} - ${dataset.text}`);
  }
  for (const item of pageCheck.timeline) {
    const selector = item.selector ? ` (${item.selector})` : "";
    lines.push(`  timeline: ${item.id} ${item.path} ${item.kind} ${item.source}${selector} - ${item.text}`);
  }
  for (const contact of pageCheck.contactPoints) {
    const url = contact.url ? ` <${contact.url}>` : "";
    const selector = contact.selector ? ` (${contact.selector})` : "";
    lines.push(`  contactPoint: ${contact.id} ${contact.path} ${contact.kind} ${contact.source}${selector}${url} - ${contact.text}`);
  }
  for (const faq of pageCheck.faqs) {
    const selector = faq.selector ? ` (${faq.selector})` : "";
    lines.push(`  faq: ${faq.id} ${faq.path} ${faq.source}${selector} - ${faq.text}`);
  }
  for (const breadcrumb of pageCheck.breadcrumbs) {
    const selector = breadcrumb.selector ? ` (${breadcrumb.selector})` : "";
    lines.push(`  breadcrumb: ${breadcrumb.id} ${breadcrumb.path} ${breadcrumb.source}${selector} - ${breadcrumb.text}`);
  }
  for (const section of pageCheck.sections) {
    const selector = section.selector ? ` (${section.selector})` : "";
    lines.push(`  section: ${section.id} ${section.path} h${section.level}${selector} - ${section.text}`);
  }
  for (const pagination of pageCheck.pagination) {
    const current = pagination.current ? " current" : "";
    const url = pagination.url ? ` <${pagination.url}>` : "";
    const selector = pagination.selector ? ` (${pagination.selector})` : "";
    lines.push(`  pagination: ${pagination.id} ${pagination.path} ${pagination.kind}${current}${selector}${url} - ${pagination.text}`);
  }
  for (const toc of pageCheck.toc) {
    const title = toc.title ? ` title="${toc.title}"` : "";
    const selector = toc.selector ? ` (${toc.selector})` : "";
    lines.push(`  toc: ${toc.id} ${toc.path}${title} items=${toc.items.length}${selector} - ${toc.text}`);
  }
  for (const codeBlock of pageCheck.codeBlocks) {
    const language = codeBlock.language ? ` language=${codeBlock.language}` : "";
    const commandLike = codeBlock.commandLike ? " commandLike" : "";
    const selector = codeBlock.selector ? ` (${codeBlock.selector})` : "";
    lines.push(`  codeBlock: ${codeBlock.id} ${codeBlock.path}${language}${commandLike} lines=${codeBlock.lineCount}${selector} - ${codeBlock.text}`);
  }
  for (const citation of pageCheck.citations) {
    const url = citation.url ? ` <${citation.url}>` : "";
    const selector = citation.selector ? ` (${citation.selector})` : "";
    lines.push(`  citation: ${citation.id} ${citation.path} ${citation.source}${selector}${url} - ${citation.text}`);
  }
  for (const media of pageCheck.media) {
    const dimensions = media.width && media.height ? ` ${media.width}x${media.height}` : "";
    const selector = media.selector ? ` (${media.selector})` : "";
    lines.push(`  media: ${media.id} ${media.path} ${media.kind}${dimensions}${selector} <${media.url}> - ${media.text}`);
  }
  for (const resource of pageCheck.resources) {
    const rel = resource.rel ? ` rel=${resource.rel}` : "";
    const type = resource.type ? ` type=${resource.type}` : "";
    lines.push(`  resource: ${resource.id} ${resource.path} ${resource.kind}${rel}${type} <${resource.url}> - ${resource.text}`);
  }
  for (const embed of pageCheck.embeds) {
    const type = embed.type ? ` type=${embed.type}` : "";
    lines.push(`  embed: ${embed.id} ${embed.path} ${embed.kind}${type} <${embed.url}> - ${embed.text}`);
  }
  for (const transcript of pageCheck.transcripts) {
    const language = transcript.language ? ` lang=${transcript.language}` : "";
    const label = transcript.label ? ` label=${transcript.label}` : "";
    const selector = transcript.selector ? ` (${transcript.selector})` : "";
    lines.push(`  transcript: ${transcript.id} ${transcript.path} ${transcript.kind}${language}${label}${selector} <${transcript.url}> - ${transcript.text}`);
  }
  for (const authorLink of pageCheck.authorLinks) {
    const name = authorLink.name ? ` ${authorLink.name}` : "";
    const rel = authorLink.rel ? ` rel=${authorLink.rel}` : "";
    const selector = authorLink.selector ? ` (${authorLink.selector})` : "";
    lines.push(`  authorLink: ${authorLink.id} ${authorLink.path} ${authorLink.source}${rel}${selector}${name} <${authorLink.url}> - ${authorLink.text}`);
  }
  for (const link of pageCheck.primaryLinks) lines.push(`  link: ${link.kind} ${link.title} <${link.url}> - ${link.selectionReason ?? sourceLinkSelectionReason(link)}`);
  for (const link of pageCheck.sourceLinks) lines.push(`  sourceLink: ${link.title} <${link.url}> - ${link.selectionReason ?? sourceLinkSelectionReason(link)}`);
  for (const action of pageCheck.actions) lines.push(`  action: ${action.type} ${action.text}`);
  lines.push(`  next: ${formatActionLabel(pageCheck.recommendedAction)} - ${pageCheck.recommendedAction.reason}`);
  lines.push(`  execution: ${actionExecution(pageCheck.recommendedAction)}`);
  lines.push(`  priority: ${pageCheck.recommendedAction.priority ?? actionPriority(pageCheck.recommendedAction)} - ${pageCheck.recommendedAction.priorityReason ?? actionPriorityReason(pageCheck.recommendedAction)}`);
  if (pageCheck.recommendedAction.url) lines.push(`  url: ${pageCheck.recommendedAction.url}`);
  if (pageCheck.recommendedAction.rank) lines.push(`  rank: ${pageCheck.recommendedAction.rank}`);
  if (pageCheck.recommendedAction.openResult) lines.push(`  openResult: ${pageCheck.recommendedAction.openResult}`);
  if (pageCheck.recommendedAction.readFrom) lines.push(`  readFrom: ${pageCheck.recommendedAction.readFrom}`);
  if (pageCheck.recommendedAction.sourceLinkRef) lines.push(`  sourceLinkRef: ${pageCheck.recommendedAction.sourceLinkRef}`);
  if (pageCheck.recommendedAction.requiresBrowserInteraction) lines.push("  requiresBrowserInteraction: true");
  if (pageCheck.recommendedAction.command) lines.push(`  command: ${pageCheck.recommendedAction.command}`);
  if (pageCheck.recommendedAction.commandArgs) lines.push(`  commandArgs: ${formatCommandArgsText(pageCheck.recommendedAction.commandArgs)}`);
  if (pageCheck.recommendedAction.afterInteractionCommand) lines.push(`  afterInteractionCommand: ${pageCheck.recommendedAction.afterInteractionCommand}`);
  if (pageCheck.recommendedAction.afterInteractionCommandArgs) lines.push(`  afterInteractionCommandArgs: ${formatCommandArgsText(pageCheck.recommendedAction.afterInteractionCommandArgs)}`);
  for (const [index, step] of pageCheck.nextSteps.entries()) {
    const target = step.url ? ` <${step.url}>` : "";
    lines.push(`  step: ${index + 1}. ${formatActionLabel(step)}${target} - ${step.reason}`);
    lines.push(`    execution: ${actionExecution(step)}`);
    lines.push(`    priority: ${step.priority ?? actionPriority(step)} - ${step.priorityReason ?? actionPriorityReason(step)}`);
    if (step.readFrom) lines.push(`    readFrom: ${step.readFrom}`);
    if (step.sourceLinkRef) lines.push(`    sourceLinkRef: ${step.sourceLinkRef}`);
    if (step.requiresBrowserInteraction) lines.push("    requiresBrowserInteraction: true");
    if (step.command) lines.push(`    command: ${step.command}`);
    if (step.commandArgs) lines.push(`    commandArgs: ${formatCommandArgsText(step.commandArgs)}`);
  }
  return ["pageCheck", ...lines];
}

function formatActionLabel(action: SuggestedAction): string {
  return `${action.action}${action.terminal ? " [terminal]" : ""}`;
}

function formatCommandArgsText(commandArgs: string[]): string {
  return JSON.stringify(commandArgs);
}

function formatFindsText(finds: FindSummary[]): string[] {
  if (finds.length === 0) return [];
  const lines = ["finds"];
  for (const item of finds) {
    lines.push(`  ${item.found ? "found" : "missing"}: ${item.query} (${item.matchCount})`);
    for (const match of item.matches.slice(0, 3)) {
      const rank = match.rank ? `${match.rank}. ` : "";
      const url = match.url ? ` <${match.url}>` : "";
      const selector = match.selector ? ` (${match.selector})` : "";
      lines.push(`    ${rank}${match.field}${selector}: ${match.text}${url}`);
    }
  }
  return lines;
}

function formatVerificationText(verification: VerificationSummary): string[] {
  if (verification.status === "not-requested") return [];
  const lines = [
    "verification",
    `  status: ${verification.status}`,
    `  found: ${verification.foundCount}/${verification.requestedCount}`,
  ];
  if (verification.missingQueries.length > 0) lines.push(`  missing: ${verification.missingQueries.join(", ")}`);
  if (verification.bestEvidence) {
    const rank = verification.bestEvidence.rank ? `${verification.bestEvidence.rank}. ` : "";
    const url = verification.bestEvidence.url ? ` <${verification.bestEvidence.url}>` : "";
    lines.push(`  evidence: ${rank}${verification.bestEvidence.field}: ${verification.bestEvidence.text}${url}`);
  }
  if (verification.recommendedAction) {
    lines.push(`  next: ${verification.recommendedAction.action} - ${verification.recommendedAction.reason}`);
    if (verification.recommendedAction.command) lines.push(`  command: ${verification.recommendedAction.command}`);
    if (verification.recommendedAction.commandArgs) lines.push(`  commandArgs: ${formatCommandArgsText(verification.recommendedAction.commandArgs)}`);
  }
  return lines;
}

function formatResultsText(results: ResultSummary[]): string[] {
  if (results.length === 0) return [];
  const lines = ["results"];
  for (const result of results) {
    lines.push(`  ${result.rank}. ${result.title}`);
    lines.push(`     url: ${result.url}`);
    if (result.source) lines.push(`     source: ${result.source}`);
    if (result.sourceType) {
      const hints = result.sourceHints?.length ? ` (${result.sourceHints.join(", ")})` : "";
      lines.push(`     sourceType: ${result.sourceType} ${result.sourceScore ?? 0}${hints}`);
    }
    if (result.date) lines.push(`     date: ${result.date}${result.dateText ? ` (${result.dateText})` : ""}`);
    if (result.snippet) lines.push(`     snippet: ${result.snippet}`);
    for (const sitelink of result.sitelinks ?? []) lines.push(`     sitelink: ${sitelink.title} <${sitelink.url}>`);
  }
  return lines;
}

function formatContentText(content: ContentSummary[]): string[] {
  if (content.length === 0) return [];
  return [
    "content",
    ...content.map((item, index) => `  ${index + 1}. ${item.text}`),
  ];
}

function formatHref(node: SemanticNode, baseUrl: string): string {
  const href = node.attributes?.href;
  if (!href) return "";
  try {
    const normalized = normalizeHref(href, baseUrl);
    return normalized ? ` <${normalized}>` : "";
  } catch {
    return ` <${href}>`;
  }
}

function unwrapKnownRedirect(url: URL): URL {
  if (url.hostname.endsWith("bing.com") && url.pathname === "/ck/a") {
    const encoded = url.searchParams.get("u");
    const decoded = decodeBingTarget(encoded);
    if (decoded) return decoded;
  }
  if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") {
    const target = url.searchParams.get("uddg");
    if (target) return new URL(target);
  }
  return url;
}

function decodeBingTarget(value: string | null): URL | null {
  if (!value) return null;
  const payload = value.startsWith("a1") ? value.slice(2) : value;
  try {
    return new URL(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function formatState(node: SemanticNode): string {
  if (!node.state || Object.keys(node.state).length === 0) return "";
  const parts = formatSemanticStateParts(node.state);
  return ` [${parts.join(" ")}]`;
}

function formatSemanticStateParts(state: SemanticNodeState): string[] {
  return Object.entries(state)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
}

function formatSemanticState(state: SemanticNodeState | undefined): string | undefined {
  if (!state) return undefined;
  const parts = formatSemanticStateParts(state);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function summarizeLinks(node: SemanticNode, baseUrl: string): LinkSummary[] {
  const candidates: Array<LinkSummary & { score: number; index: number }> = [];
  let index = 0;
  function visit(current: SemanticNode, ancestors: SemanticNode[]): void {
    if (current.role === "link") {
      const href = current.attributes?.href;
      const url = href ? normalizeHref(href, baseUrl) : null;
      if (url && isUsefulLink(current, url, baseUrl)) {
        const snippet = linkContextSnippet(current, ancestors);
        const candidate: LinkSummary & { score: number; index: number } = {
          text: cleanLinkText(current.name || current.text || url),
          url,
          role: current.role,
          score: linkScore(current, url, baseUrl, snippet),
          index,
        };
        if (snippet) candidate.snippet = snippet;
        if (current.selector) candidate.selector = current.selector;
        candidates.push(candidate);
      }
      index += 1;
    }
    for (const child of current.children) visit(child, [...ancestors, current]);
  }
  visit(node, []);

  const byUrl = new Map<string, LinkSummary & { score: number; index: number }>();
  for (const candidate of candidates) {
    const previous = byUrl.get(candidate.url);
    if (!previous || candidate.score > previous.score || (candidate.score === previous.score && candidate.index < previous.index)) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return [...byUrl.values()]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 10)
    .map(({ score: _score, index: _index, ...link }) => link);
}

function normalizeHref(href: string, baseUrl: string): string | null {
  try {
    const normalized = unwrapKnownRedirect(new URL(stripTrailingUrlPunctuation(href), baseUrl));
    if (normalized.protocol !== "http:" && normalized.protocol !== "https:") return null;
    return normalized.toString();
  } catch {
    return null;
  }
}

function isUsefulLink(node: SemanticNode, url: string, baseUrl: string): boolean {
  const text = (node.name || node.text || "").trim().toLowerCase();
  if (!text && samePageOrSameHost(url, baseUrl)) return false;
  if (/^(skip to|콘텐츠로|접근성|settings|설정|hamburger menu|startpage home page|duckduckgo|english|login|로그인|visit in anonymous view)$/i.test(text)) return false;
  if (url.includes("javascript:")) return false;
  return true;
}

function linkScore(node: SemanticNode, url: string, baseUrl: string, snippet = ""): number {
  const text = node.name || node.text || "";
  let score = 0;
  if (!samePageOrSameHost(url, baseUrl)) score += 100;
  if (text.length > 12) score += 20;
  if (text.length > 50) score += 10;
  if (/^https?:\/\//i.test(text)) score -= 15;
  if (new URL(url).hostname.replace(/^www\./, "") === text.trim().toLowerCase()) score -= 20;
  if (node.selector?.includes("result") || node.selector?.includes("article")) score += 10;
  if (/^(all|images|videos|maps|news|전체|이미지|동영상|지도|뉴스)$/i.test(text)) score -= 60;
  if (/search|login|settings|home|skip|hamburger|필터|검색|로그인|설정/i.test(text)) score -= 40;
  if (isLikelyGlobalNavigationText(text, snippet)) score -= 120;
  return score;
}

function cleanLinkText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingUrlPunctuation(href: string): string {
  let stripped = href.trim();
  while (/[),.\]]$/.test(stripped)) stripped = stripped.slice(0, -1);
  return stripped;
}

function summarizeResults(links: LinkSummary[]): ResultSummary[] {
  return links.map((link, index) => {
    const source = sourceFromUrl(link.url);
    const sourceProfile = summarizeSourceProfile(link.url, link.text, link.snippet);
    const result: ResultSummary = {
      title: link.text,
      url: link.url,
      source,
      rank: index + 1,
      sourceType: sourceProfile.type,
      sourceScore: sourceProfile.score,
      sourceHints: sourceProfile.hints,
    };
    if (link.snippet) result.snippet = link.snippet;
    return withResultDateHint(result);
  });
}

function summarizeSearchResults(fetched: Pick<FetchResult, "html" | "finalUrl">, links: LinkSummary[]): ResultSummary[] {
  const linkResults = summarizeResults(links);
  if (!looksLikeKnownSearchUrl(fetched.finalUrl) && !looksLikeGenericSearchUrl(fetched.finalUrl)) return linkResults;
  const extracted = extractSearchResults(fetched.html, fetched.finalUrl);
  if (extracted.length > 0) return extracted;
  return looksLikeKnownSearchUrl(fetched.finalUrl) ? linkResults : [];
}

function annotateResults(results: ResultSummary[], query?: string, findQueries: string[] = []): ResultSummary[] {
  const terms = queryTerms(query);
  if (terms.length === 0 && findQueries.length === 0) return results;
  return results.map((result) => {
    const sourceProfile = summarizeSourceProfile(result.url, result.title, result.snippet);
    const annotated: ResultSummary = {
      ...result,
      sourceType: result.sourceType ?? sourceProfile.type,
      sourceScore: result.sourceScore ?? sourceProfile.score,
      sourceHints: result.sourceHints ?? sourceProfile.hints,
    };
    if (terms.length > 0) {
      const essentialTerms = essentialQueryTerms(terms);
      const matchedTerms = terms.filter((term) => queryTermMatchesResult(term, result, essentialTerms.includes(term)) || queryFreshnessTermMatchesResult(term, result));
      const matchedEssentialTerms = essentialTerms.filter((term) => matchedTerms.includes(term));
      const isLikelyOfficial = likelyOfficialResult(result, terms);
      let relevance: ResultSummary["relevance"] = "low";
      if (matchedTerms.length === terms.length || isLikelyOfficial) relevance = "high";
      else if (matchedTerms.length > 0 && (essentialTerms.length === 0 || matchedEssentialTerms.length > 0)) relevance = "medium";
      annotated.relevance = relevance;
      annotated.matchedTerms = matchedTerms;
      annotated.isLikelyOfficial = isLikelyOfficial;
    }
    const findMatches = matchedFindQueriesForResult(result, findQueries);
    if (!annotated.dateText) Object.assign(annotated, resultDateHint(annotated.title, annotated.snippet));
    if (findMatches.length > 0) annotated.findMatches = findMatches;
    annotated.selectionReason = searchResultSelectionReason(annotated);
    return annotated;
  });
}

function queryTermMatchesResult(term: string, result: ResultSummary, exactNameRequired = false): boolean {
  if (!exactNameRequired) {
    return normalizeForMatch(resultSearchText(result)).includes(normalizeForMatch(term));
  }
  return exactNameMatchesText(term, result.title)
    || exactNameMatchesText(term, result.snippet ?? "")
    || result.sitelinks?.some((link) => exactNameMatchesText(term, link.title) || exactNameMatchesUrl(term, link.url))
    || exactNameMatchesSource(term, result.source)
    || exactNameMatchesUrl(term, result.url);
}

function queryFreshnessTermMatchesResult(term: string, result: ResultSummary): boolean {
  if (!isFreshnessQueryTerm(term)) return false;
  const normalizedTerm = normalizeForMatch(term);
  return [result.date, result.dateText, result.title, result.snippet]
    .filter(Boolean)
    .some((value) => normalizeForMatch(String(value)).includes(normalizedTerm));
}

function exactNameMatchesText(term: string, text: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  const normalizedText = normalizeForMatch(text);
  const escaped = escapeRegExp(normalizedTerm).replace(/\\-/g, "[-\\s]+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(normalizedText);
}

function exactNameMatchesSource(term: string, source: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  const normalizedSource = normalizeForMatch(source.replace(/^www\./, ""));
  return normalizedSource === normalizedTerm || normalizedSource.startsWith(`${normalizedTerm}-`) || normalizedSource.startsWith(`${normalizedTerm}.`);
}

function exactNameMatchesUrl(term: string, url: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  try {
    const parsed = new URL(url);
    if (exactNameMatchesSource(term, parsed.hostname)) return true;
    const parts = parsed.pathname.split("/").map((part) => normalizeForMatch(decodeURIComponent(part))).filter(Boolean);
    return parts.some((part) => part === normalizedTerm);
  } catch {
    return exactNameMatchesText(term, url);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchResultSelectionReason(result: Pick<ResultSummary, "rank" | "source" | "sourceHints" | "relevance" | "matchedTerms" | "findMatches" | "isLikelyOfficial" | "dateText">): string {
  if (result.findMatches?.length) return `Matches --find: ${result.findMatches.join(", ")}.`;
  const freshnessTerms = result.matchedTerms?.filter(isFreshnessQueryTerm) ?? [];
  if (freshnessTerms.length > 0) return `Freshness match: ${freshnessTerms.join(", ")}${result.dateText ? ` (${result.dateText})` : ""}.`;
  if (result.isLikelyOfficial) return "Likely official source for the query.";
  if (result.relevance === "high" && result.matchedTerms?.length) return `High relevance: matched ${result.matchedTerms.join(", ")}.`;
  if (result.relevance === "medium" && result.matchedTerms?.length) return `Medium relevance: matched ${result.matchedTerms.join(", ")}.`;
  if (result.relevance === "low" && result.matchedTerms?.length) return `Low relevance: only matched ${result.matchedTerms.join(", ")}.`;
  if (result.sourceHints?.length) return `Source profile: ${result.sourceHints.join(", ")}.`;
  return `Ranked result ${result.rank} from ${result.source}.`;
}

function sourceLinkSelectionReason(link: Pick<ResultSummary, "source" | "sourceScore" | "sourceHints" | "sourceType"> & { kind?: PageLinkSummary["kind"] }): string {
  const score = typeof link.sourceScore === "number" ? link.sourceScore : 0;
  if (score >= 0.78 && link.sourceHints?.length) return `Strong source candidate: ${link.sourceHints.join(", ")}.`;
  if (score >= 0.5 && link.sourceHints?.length) return `Possible source candidate: ${link.sourceHints.join(", ")}.`;
  if (link.sourceType && link.sourceType !== "unknown") return `Source profile is ${link.sourceType}.`;
  return `${link.kind === "external" ? "External" : "Page"} link from ${link.source}.`;
}

function matchedFindQueriesForResult(result: ResultSummary, findQueries: string[]): string[] {
  if (findQueries.length === 0) return [];
  const haystack = normalizeFindValue(resultSearchText(result));
  return findQueries.filter((query) => {
    const normalizedQuery = normalizeFindValue(query);
    if (!normalizedQuery) return false;
    if (haystack.includes(normalizedQuery)) return true;
    const terms = queryTerms(query).map(normalizeFindValue).filter(Boolean);
    return terms.length > 0 && terms.every((term) => haystack.includes(term));
  });
}

function resultSearchText(result: ResultSummary): string {
  const sitelinks = result.sitelinks?.flatMap((link) => [link.title, link.url]) ?? [];
  return [result.title, result.url, result.source, result.snippet, ...sitelinks].filter(Boolean).join(" ");
}

function resultEvidenceText(result: ResultSummary): string {
  const sitelinks = result.sitelinks?.map((link) => link.title) ?? [];
  return [result.title, result.snippet, ...sitelinks].filter(Boolean).join(" ");
}

function queryTerms(query?: string): string[] {
  if (!query) return [];
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, ""))
    .filter((term) => term.length >= 2);
  return Array.from(new Set(terms));
}

function essentialQueryTerms(terms: string[]): string[] {
  return terms.filter((term) => /[a-z0-9]-[a-z0-9]/i.test(term));
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[._/]+/g, "-");
}

function likelyOfficialResult(result: ResultSummary, terms: string[]): boolean {
  const source = result.source.replace(/^www\./, "").toLowerCase();
  const url = result.url.toLowerCase();
  const title = result.title.toLowerCase();
  const packageLike = terms.find((term) => /[a-z0-9]-[a-z0-9]/i.test(term)) ?? terms[0];
  if (!packageLike) return false;
  const normalizedPackage = normalizeForMatch(packageLike);
  if (source === "npmjs.com" && url.includes(`/package/${normalizedPackage}`)) return true;
  if (source === "github.com" && (url.includes(`/${normalizedPackage}`) || title.includes(normalizedPackage))) return true;
  if (source === `${normalizedPackage}.com` || source === `${normalizedPackage}.org` || source === `${normalizedPackage}.dev`) return true;
  if (source.startsWith(`${normalizedPackage}.`) || source.startsWith(`docs.${normalizedPackage}.`) || source.startsWith(`platform.${normalizedPackage}.`)) return true;
  return false;
}

function summarizeSourceProfile(url: string, title?: string, snippet?: string): { type: SourceType; score: number; hints: string[] } {
  const hints: string[] = [];
  let type: SourceType = "unknown";
  let score = 0.35;
  let hostname = "";
  let pathname = "";
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return { type, score: 0, hints: ["invalid-url"] };
  }
  const text = `${title ?? ""} ${snippet ?? ""}`.toLowerCase();
  const hostAndPath = `${hostname}${pathname}`;

  const set = (nextType: SourceType, nextScore: number, hint: string): void => {
    if (nextScore >= score) {
      type = nextType;
      score = nextScore;
    }
    hints.push(hint);
  };

  if (/\.(?:gov|go|gob|gouv|go\.kr|gov\.cn|go\.jp)(?:\.|$)/i.test(hostname) || /(?:^|\.)gov\.uk$/.test(hostname)) {
    set("government", 0.95, "government-domain");
  }
  if (/\.(?:edu|ac)(?:\.|$)/i.test(hostname) || /\.(?:ac\.kr|ac\.jp|edu\.cn)$/i.test(hostname)) {
    set("education", 0.86, "education-domain");
  }
  if (/(?:^|\.)wikipedia\.org$|(?:^|\.)wikidata\.org$/.test(hostname)) set("wiki", 0.62, "wiki");
  if (/(?:^|\.)github\.com$|(?:^|\.)gitlab\.com$|(?:^|\.)bitbucket\.org$/.test(hostname)) set("code", 0.72, "code-host");
  if (/(?:^|\.)npmjs\.com$|(?:^|\.)pypi\.org$|(?:^|\.)crates\.io$|(?:^|\.)packagist\.org$/.test(hostname)) set("official", 0.9, "package-registry");
  if (/(?:^|\.)developer\.mozilla\.org$|(?:^|\.)docs\.[^/]+|\/docs?\/|\/documentation\//.test(hostAndPath) || /\b(documentation|docs|api reference)\b/.test(text)) {
    set("documentation", 0.78, "documentation");
  }
  if (/(?:^|\.)x\.com$|(?:^|\.)twitter\.com$|(?:^|\.)instagram\.com$|(?:^|\.)facebook\.com$|(?:^|\.)threads\.net$|(?:^|\.)tiktok\.com$/.test(hostname)) {
    set("social", 0.42, "social-platform");
  }
  if (/(?:^|\.)reddit\.com$|(?:^|\.)dcinside\.com$|(?:^|\.)clien\.net$|(?:^|\.)ruliweb\.com$|(?:^|\.)stackoverflow\.com$|(?:^|\.)news\.ycombinator\.com$/.test(hostname)) {
    set("forum", 0.5, "community");
  }
  if (/(?:news|press|journal|times|일보|신문)/i.test(hostname) || /\b(news|breaking|article)\b/.test(text)) {
    set("news", 0.58, "news-like");
  }
  if (/(?:shop|store|product|pricing|cart|checkout|buy|commerce)/i.test(hostAndPath)) set("commerce", 0.38, "commerce-like");
  if (/(?:^|\.)iana\.org$|(?:^|\.)ietf\.org$|(?:^|\.)w3\.org$|(?:^|\.)whatwg\.org$|(?:^|\.)openai\.com$/.test(hostname)) {
    set("official", 0.92, "official-organization");
  }

  return {
    type,
    score: roundMetric(Math.max(0, Math.min(1, score))),
    hints: Array.from(new Set(hints)).slice(0, 4),
  };
}

function extractSearchResults(html: string, baseUrl: string): ResultSummary[] {
  const engine = detectSearchEngine(baseUrl);
  if (!engine) return [];
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const cards = collectResultCards(document.children, engine);
  const results: ResultSummary[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const result = resultFromCard(card, baseUrl, engine, results.length + 1);
    if (!result || seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
    if (results.length >= 10) break;
  }
  return results;
}

function detectSearchEngine(url: string): SearchResultEngine | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.endsWith("baidu.com")) return "baidu";
    if (hostname.endsWith("bing.com")) return "bing";
    if (hostname.endsWith("duckduckgo.com")) return "duckduckgo";
    if (hostname.endsWith("startpage.com")) return "startpage";
    if (hostname.endsWith("search.yahoo.co.jp")) return "yahoo-japan";
    if (looksLikeGenericSearchUrl(url)) return "generic";
    return null;
  } catch {
    return null;
  }
}

function collectResultCards(nodes: AnyNode[], engine: SearchResultEngine): Element[] {
  const cards: Element[] = [];
  function visit(nodeList: AnyNode[]): void {
    for (const node of nodeList) {
      if (!(node instanceof DomElement)) continue;
      if (isResultCard(node, engine)) {
        cards.push(node);
        continue;
      }
      visit(node.children);
    }
  }
  visit(nodes);
  return cards;
}

function isResultCard(element: Element, engine: SearchResultEngine): boolean {
  if (engine === "baidu") return hasClass(element, "result") || hasClass(element, "c-container");
  if (engine === "bing") return element.name === "li" && hasClass(element, "b_algo");
  if (engine === "duckduckgo") {
    return hasClass(element, "result")
      || hasClass(element, "web-result")
      || hasClass(element, "result__body");
  }
  if (engine === "yahoo-japan") return hasClass(element, "sw-Card") || hasClass(element, "algo") || hasClass(element, "SearchResult");
  if (engine === "generic") {
    return hasClass(element, "result")
      || hasClass(element, "search-result")
      || (element.name === "li" && findElement(element.children, (child) => child.name === "a") !== undefined && findElement(element.children, (child) => child.name === "p") !== undefined);
  }
  return hasClass(element, "w-gl__result")
    || hasClass(element, "result")
    || hasClass(element, "search-result");
}

function resultFromCard(card: Element, baseUrl: string, engine: SearchResultEngine, rank: number): ResultSummary | null {
  const link = resultTitleLink(card, engine) ?? firstUsefulAnchor(card, baseUrl);
  if (!link) return null;
  const href = attr(link, "href");
  const url = href ? normalizeHref(href, baseUrl) : null;
  if (!url) return null;
  const title = cleanLinkText(descendantText(link));
  if (!title || isSearchNavigationText(title)) return null;
  const result: ResultSummary = {
    title,
    url,
    source: sourceFromUrl(url),
    rank,
  };
  const snippet = resultSnippet(card, title);
  if (snippet) result.snippet = snippet;
  const sitelinks = resultSitelinks(card, link, url, baseUrl);
  if (sitelinks.length > 0) result.sitelinks = sitelinks;
  return withResultDateHint(result);
}

function resultTitleLink(card: Element, engine: SearchResultEngine): Element | undefined {
  if (engine === "baidu" || engine === "bing" || engine === "yahoo-japan") {
    const heading = findElement(card.children, (element) => /^h[1-6]$/.test(element.name));
    const headingLink = heading ? firstUsefulAnchor(heading, "https://example.invalid") : undefined;
    if (headingLink) return headingLink;
  }
  const classMatch = findElement(card.children, (element) => {
    if (element.name !== "a") return false;
    return hasClass(element, "result__a")
      || hasClass(element, "result-title")
      || hasClass(element, "w-gl__result-title")
      || hasClass(element, "c-title")
      || hasClass(element, "result-link");
  });
  if (classMatch) return classMatch;
  const heading = findElement(card.children, (element) => /^h[1-6]$/.test(element.name));
  return heading ? firstUsefulAnchor(heading, "https://example.invalid") : undefined;
}

function firstUsefulAnchor(root: Element, baseUrl: string): Element | undefined {
  return findElement(root.children, (element) => {
    if (element.name !== "a") return false;
    const href = attr(element, "href");
    if (!href || !normalizeHref(href, baseUrl)) return false;
    const text = cleanLinkText(descendantText(element));
    return Boolean(text) && !isSearchNavigationText(text);
  });
}

function resultSnippet(card: Element, title: string): string {
  const snippetElement = findElement(card.children, (element) => {
    return hasClass(element, "result__snippet")
      || hasClass(element, "b_caption")
      || hasClass(element, "b_snippet")
      || hasClass(element, "w-gl__description")
      || hasClass(element, "description")
      || hasClass(element, "snippet")
      || hasClass(element, "excerpt");
  });
  const raw = snippetElement ? descendantText(snippetElement) : descendantText(card).replace(title, " ");
  const snippet = cleanContentText(raw.replace(title, " ").replace(/^[\s,.;:!?-]+/, ""));
  if (!snippet || snippet.toLowerCase() === title.toLowerCase()) return "";
  return snippet;
}

function resultSitelinks(card: Element, titleLink: Element, resultUrl: string, baseUrl: string): Array<{ title: string; url: string }> {
  const items: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>([resultUrl]);
  for (const anchor of findElements(card.children, (item) => item.name === "a")) {
    if (anchor === titleLink) continue;
    const href = attr(anchor, "href");
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url || seen.has(url)) continue;
    const title = cleanLinkText(descendantText(anchor));
    if (!isUsefulResultSitelink(title, url, resultUrl)) continue;
    seen.add(url);
    items.push({ title, url });
    if (items.length >= 4) break;
  }
  return items;
}

function isUsefulResultSitelink(title: string, url: string, resultUrl: string): boolean {
  if (!title || title.length > 120) return false;
  if (/^\d+$/.test(title.trim())) return false;
  if (isSearchNavigationText(title)) return false;
  if (/^(cached|similar|translate|feedback|more|menu|share|copy link)$/i.test(title.trim())) return false;
  try {
    const resultHost = new URL(resultUrl).hostname.replace(/^www\./, "");
    const targetHost = new URL(url).hostname.replace(/^www\./, "");
    return targetHost === resultHost || targetHost.endsWith(`.${resultHost}`) || resultHost.endsWith(`.${targetHost}`);
  } catch {
    return false;
  }
}

function withResultDateHint(result: ResultSummary): ResultSummary {
  return {
    ...result,
    ...resultDateHint(result.title, result.snippet),
  };
}

function resultDateHint(title: string, snippet?: string): Pick<ResultSummary, "dateText" | "date" | "datePrecision" | "dateSource"> {
  const snippetHint = snippet ? extractDateHint(snippet) : null;
  if (snippetHint) return { ...snippetHint, dateSource: "snippet" };
  const titleHint = extractDateHint(title);
  return titleHint ? { ...titleHint, dateSource: "title" } : {};
}

function extractDateHint(text: string): Pick<ResultSummary, "dateText" | "date" | "datePrecision"> | null {
  const compact = cleanContentText(text);
  const numeric = /\b((?:19|20)\d{2})[./-]\s*(\d{1,2})(?:[./-]\s*(\d{1,2}))?\b/.exec(compact);
  if (numeric) {
    const year = Number(numeric[1]);
    const month = Number(numeric[2]);
    const day = numeric[3] ? Number(numeric[3]) : 1;
    const date = normalizedDate(year, month, day);
    if (date) {
      return {
        dateText: numeric[0],
        date,
        datePrecision: numeric[3] ? "day" : "month",
      };
    }
  }

  const monthName = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,)?\s+((?:19|20)\d{2})\b/i.exec(compact);
  if (monthName?.[1] && monthName[2] && monthName[3]) {
    const month = monthNumber(monthName[1]);
    const day = Number(monthName[2]);
    const year = Number(monthName[3]);
    const date = normalizedDate(year, month, day);
    if (date) return { dateText: monthName[0], date, datePrecision: "day" };
  }

  const dayMonthName = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+((?:19|20)\d{2})\b/i.exec(compact);
  if (dayMonthName?.[1] && dayMonthName[2] && dayMonthName[3]) {
    const day = Number(dayMonthName[1]);
    const month = monthNumber(dayMonthName[2]);
    const year = Number(dayMonthName[3]);
    const date = normalizedDate(year, month, day);
    if (date) return { dateText: dayMonthName[0], date, datePrecision: "day" };
  }

  return null;
}

function monthNumber(name: string): number {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .findIndex((month) => name.toLowerCase().startsWith(month)) + 1;
}

function normalizedDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function isSearchNavigationText(text: string): boolean {
  return /^(all|images|videos|maps|news|shopping|전체|이미지|동영상|지도|뉴스|검색|설정|로그인)$/i.test(text.trim());
}

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractPageSummary(html: string, baseUrl: string): PageSummary {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const htmlElement = findElement(document.children, (element) => element.name === "html");
  const titleElement = findElement(document.children, (element) => element.name === "title");
  const description = firstMetaContent(document.children, "description")
    || firstMetaContent(document.children, "og:description")
    || firstMetaContent(document.children, "twitter:description");
  const canonicalHref = firstLinkHref(document.children, "canonical");
  const siteName = firstMetaContent(document.children, "og:site_name")
    || firstMetaContent(document.children, "application-name");
  const author = firstMetaContentOf(document.children, [
    "author",
    "article:author",
    "parsely-author",
    "twitter:creator",
    "dc.creator",
    "dcterms.creator",
  ]);
  const publishedTime = firstMetaContentOf(document.children, [
    "article:published_time",
    "og:published_time",
    "pubdate",
    "publishdate",
    "date",
    "dc.date",
    "dcterms.issued",
  ]);
  const modifiedTime = firstMetaContentOf(document.children, [
    "article:modified_time",
    "og:updated_time",
    "last-modified",
    "modified",
    "date.modified",
    "dcterms.modified",
  ]);
  const structuredData = extractJsonLdSummary(document.children);
  const summary: PageSummary = {};
  const title = titleElement ? cleanLinkText(descendantText(titleElement)) : "";
  const resolvedTitle = title || structuredData.headline || "";
  const resolvedAuthor = author || structuredData.author || "";
  const resolvedPublishedTime = publishedTime || structuredData.publishedTime || "";
  const resolvedModifiedTime = modifiedTime || structuredData.modifiedTime || "";
  if (resolvedTitle) summary.title = resolvedTitle;
  if (description) summary.description = description;
  if (canonicalHref) summary.canonicalUrl = normalizeHref(canonicalHref, baseUrl) ?? canonicalHref;
  const lang = htmlElement ? attr(htmlElement, "lang") : "";
  if (lang) summary.lang = lang;
  const dir = htmlElement ? attr(htmlElement, "dir") : "";
  if (dir) summary.dir = cleanContentText(dir).slice(0, 12);
  if (siteName) summary.siteName = siteName;
  if (resolvedAuthor) summary.author = resolvedAuthor;
  if (resolvedPublishedTime) summary.publishedTime = resolvedPublishedTime;
  if (resolvedModifiedTime) summary.modifiedTime = resolvedModifiedTime;
  if (structuredData.types.length > 0) summary.structuredDataTypes = structuredData.types;
  return summary;
}

function summarizeOutline(node: SemanticNode): OutlineSummary[] {
  const outline: OutlineSummary[] = [];
  function visit(current: SemanticNode): void {
    if (current.role === "heading" && current.name) {
      const item: OutlineSummary = { text: current.name };
      const match = /^h([1-6])$/.exec(current.tag);
      if (match?.[1]) item.level = Number(match[1]);
      outline.push(item);
    }
    if (outline.length >= 20) return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return outline.slice(0, 20);
}

function summarizeActions(node: SemanticNode): ActionSummary[] {
  const actions: ActionSummary[] = [];
  function visit(current: SemanticNode): void {
    const type = current.role || current.tag;
    if (current.interactive && type !== "link") {
      const text = cleanLinkText(current.name || current.value || current.text || type);
      if (text) {
        const action: ActionSummary = { type, text };
        if (current.selector) action.selector = current.selector;
        actions.push(action);
      }
    }
    if (actions.length >= 12) return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return actions.slice(0, 12);
}

function summarizeContent(node: SemanticNode): ContentSummary[] {
  const content: ContentSummary[] = [];
  const seen = new Set<string>();
  function visit(current: SemanticNode): void {
    const role = current.role || current.tag;
    if (role === "p" || role === "text" || role === "article") {
      const text = cleanContentText(current.text || current.name || descendantSemanticText(current));
      if (text && text.length >= 24 && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        const item: ContentSummary = { text, role };
        if (current.selector) item.selector = current.selector;
        content.push(item);
      }
    }
    if (content.length >= 12) return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return content.slice(0, 12);
}

function summarizePageCheck(
  fetched: FetchResult,
  links: LinkSummary[],
  outline: OutlineSummary[],
  actions: ActionSummary[],
  content: ContentSummary[],
  analysis: AnalysisSummary,
  agentMode = false,
  capturedHtml = false,
  timeoutMs?: number,
  userAgent?: string,
): PageCheckSummary {
  const focusedContent = pageCheckContent(content);
  const primaryLinks = summarizePrimaryPageLinks(links, fetched.finalUrl);
  const fallbackPreview = focusedContent.length > 0
    ? []
    : htmlContentPreview(fetched.html).concat(fallbackPageCheckPreview(fetched, outline, primaryLinks)).slice(0, 4);
  const contentPreview = focusedContent.length > 0
    ? focusedContent.slice(0, 4).map((item) => item.text)
    : fallbackPreview;
  const contentEvidence = focusedContent.length > 0
    ? summarizeContentEvidence(focusedContent)
    : summarizeFallbackEvidence(fallbackPreview);
  const contentLength = contentPreview.reduce((total, text) => total + text.length, 0);
  const dataTables = summarizeDataTables(fetched.html);
  const barriers = summarizeBarriers(analysis.diagnostics, content, actions);
  const forms = summarizeForms(fetched.html, fetched.finalUrl);
  const actionTargets = summarizeActionTargets(fetched.html, fetched.finalUrl);
  const hydration = summarizeHydration(fetched.html, fetched.finalUrl);
  const apiEndpoints = summarizeApiEndpoints(fetched.html, fetched.finalUrl);
  const clientState = summarizeClientState(fetched.html);
  const runtime = summarizeRuntime(fetched.html, fetched.finalUrl);
  const config = summarizeConfig(fetched.html);
  const appHints = summarizeAppHints(fetched.html, fetched.finalUrl);
  const mobileHints = summarizeMobileHints(fetched.html, fetched.finalUrl);
  const topics = summarizeTopics(fetched.html);
  const keyValues = summarizeKeyValues(fetched.html);
  const metaFacts = summarizeMetaFacts(fetched.html, fetched.finalUrl);
  const provenance = summarizeProvenance(fetched.html, fetched.finalUrl);
  const httpPolicies = summarizeHttpPolicies(fetched.html, fetched.responseHeaders);
  const schemaFacts = summarizeSchemaFacts(fetched.html);
  const offers = summarizeOffers(fetched.html, fetched.finalUrl);
  const identities = summarizeIdentities(fetched.html, fetched.finalUrl);
  const datasets = summarizeDatasets(fetched.html, fetched.finalUrl);
  const timeline = summarizeTimeline(fetched.html, fetched.page);
  const contactPoints = summarizeContactPoints(fetched.html, fetched.finalUrl);
  const faqs = summarizeFaqs(fetched.html);
  const breadcrumbs = summarizeBreadcrumbs(fetched.html, fetched.finalUrl);
  const sections = summarizeSections(fetched.html);
  const pagination = summarizePagination(fetched.html, fetched.finalUrl);
  const toc = summarizeToc(fetched.html, fetched.finalUrl);
  const codeBlocks = summarizeCodeBlocks(fetched.html);
  const citations = summarizeCitations(fetched.html, fetched.finalUrl);
  const media = summarizeMedia(fetched.html, fetched.finalUrl);
  const resources = summarizeResources(fetched.html, fetched.finalUrl);
  const embeds = summarizeEmbeds(fetched.html, fetched.finalUrl);
  const transcripts = summarizeTranscripts(fetched.html, fetched.finalUrl);
  const authorLinks = summarizeAuthorLinks(fetched.html, fetched.finalUrl);
  const sourceLinks = summarizeSourcePageLinks(primaryLinks);
  const pageActions = summarizePageCheckActions(actions);
  const confidence = pageCheckConfidence(contentLength, outline, dataTables, analysis);
  const readability = summarizeReadability(confidence, contentEvidence, dataTables, forms, actionTargets, hydration, apiEndpoints, clientState, runtime, config, appHints, mobileHints, topics, keyValues, metaFacts, provenance, httpPolicies, schemaFacts, offers, identities, datasets, timeline, contactPoints, faqs, breadcrumbs, sections, pagination, toc, codeBlocks, citations, media, resources, embeds, transcripts, authorLinks, contentLength, sourceLinks, pageActions, analysis);
  const recommendedAction = recommendedPageCheckAction(readability, analysis, fetched.finalUrl, sourceLinks, dataTables, barriers, forms, actionTargets, hydration, apiEndpoints, clientState, runtime, config, appHints, mobileHints, topics, keyValues, metaFacts, provenance, httpPolicies, schemaFacts, offers, identities, datasets, timeline, contactPoints, faqs, breadcrumbs, sections, pagination, toc, codeBlocks, citations, media, resources, embeds, transcripts, authorLinks, contentEvidence, agentMode, capturedHtml, timeoutMs, userAgent);
  const pageCheck: PageCheckSummary = {
    contentPreview,
    contentEvidence,
    dataTables,
    barriers,
    forms,
    actionTargets,
    hydration,
    apiEndpoints,
    clientState,
    runtime,
    config,
    appHints,
    mobileHints,
    topics,
    keyValues,
    metaFacts,
    provenance,
    httpPolicies,
    schemaFacts,
    offers,
    identities,
    datasets,
    timeline,
    contactPoints,
    faqs,
    breadcrumbs,
    sections,
    pagination,
    toc,
    codeBlocks,
    citations,
    media,
    resources,
    embeds,
    transcripts,
    authorLinks,
    contentLength,
    primaryLinks,
    sourceLinks,
    actions: pageActions,
    confidence,
    readability,
    recommendedAction,
    nextSteps: summarizePageCheckNextSteps(recommendedAction, readability, analysis, fetched.finalUrl, sourceLinks, pageActions, agentMode, capturedHtml, timeoutMs, userAgent),
  };
  if (fetched.page.title) pageCheck.title = fetched.page.title;
  if (fetched.page.canonicalUrl) pageCheck.canonicalUrl = fetched.page.canonicalUrl;
  if (fetched.page.lang) pageCheck.lang = fetched.page.lang;
  if (fetched.page.dir) pageCheck.dir = fetched.page.dir;
  if (fetched.page.siteName) pageCheck.siteName = fetched.page.siteName;
  if (fetched.page.author) pageCheck.author = fetched.page.author;
  if (fetched.page.publishedTime) pageCheck.publishedTime = fetched.page.publishedTime;
  if (fetched.page.modifiedTime) pageCheck.modifiedTime = fetched.page.modifiedTime;
  if (fetched.page.structuredDataTypes?.length) pageCheck.structuredDataTypes = fetched.page.structuredDataTypes;
  const mainHeading = pageMainHeading(outline);
  if (mainHeading) pageCheck.mainHeading = mainHeading;
  return pageCheck;
}

function pageMainHeading(outline: OutlineSummary[]): string | undefined {
  const meaningful = outline.filter((item) => !isLowValueHeadingText(item.text));
  return meaningful.find((item) => item.level === 1)?.text ?? meaningful[0]?.text;
}

function summarizeReadability(
  confidence: PageCheckSummary["confidence"],
  contentEvidence: PageEvidenceSummary[],
  dataTables: PageDataTableSummary[],
  forms: PageFormSummary[],
  actionTargets: PageActionTargetSummary[],
  hydration: PageHydrationSummary[],
  apiEndpoints: PageApiEndpointSummary[],
  clientState: PageClientStateSummary[],
  runtime: PageRuntimeSummary[],
  config: PageConfigSummary[],
  appHints: PageAppHintSummary[],
  mobileHints: PageMobileHintSummary[],
  topics: PageTopicSummary[],
  keyValues: PageKeyValueSummary[],
  metaFacts: PageMetaFactSummary[],
  provenance: PageProvenanceSummary[],
  httpPolicies: PageHttpPolicySummary[],
  schemaFacts: PageSchemaFactSummary[],
  offers: PageOfferSummary[],
  identities: PageIdentitySummary[],
  datasets: PageDatasetSummary[],
  timeline: PageTimelineSummary[],
  contactPoints: PageContactPointSummary[],
  faqs: PageFaqSummary[],
  breadcrumbs: PageBreadcrumbSummary[],
  sections: PageSectionSummary[],
  pagination: PagePaginationSummary[],
  toc: PageTocSummary[],
  codeBlocks: PageCodeBlockSummary[],
  citations: PageCitationSummary[],
  media: PageMediaSummary[],
  resources: PageResourceSummary[],
  embeds: PageEmbedSummary[],
  transcripts: PageTranscriptSummary[],
  authorLinks: PageAuthorLinkSummary[],
  contentLength: number,
  sourceLinks: PageLinkSummary[],
  actions: ActionSummary[],
  analysis: AnalysisSummary,
): PageReadabilitySummary {
  const reasons: string[] = [];
  let score = confidence === "high" ? 0.35 : confidence === "medium" ? 0.22 : 0.08;
  if (contentEvidence.length > 0) {
    const semanticEvidenceCount = contentEvidence.filter((item) => item.role !== "fallback").length;
    const fallbackEvidenceCount = contentEvidence.length - semanticEvidenceCount;
    score += Math.min(0.25, semanticEvidenceCount * 0.08 + fallbackEvidenceCount * 0.02);
    reasons.push(`${contentEvidence.length} content evidence item${contentEvidence.length === 1 ? "" : "s"}`);
  }
  if (dataTables.length > 0) {
    score += Math.min(0.12, dataTables.length * 0.06);
    reasons.push(`${dataTables.length} data table${dataTables.length === 1 ? "" : "s"}`);
  }
  if (analysis.kind === "blocked-page") {
    reasons.push("barrier signals detected");
  }
  if (forms.length > 0 && contentLength < 120) {
    reasons.push(`${forms.length} form${forms.length === 1 ? "" : "s"}`);
  }
  if (actionTargets.length > 0) {
    score += Math.min(0.08, actionTargets.length * 0.03);
    reasons.push(`${actionTargets.length} action target${actionTargets.length === 1 ? "" : "s"}`);
  }
  if (hydration.length > 0) {
    score += Math.min(0.08, hydration.length * 0.03);
    reasons.push(`${hydration.length} hydration hint${hydration.length === 1 ? "" : "s"}`);
  }
  if (apiEndpoints.length > 0) {
    score += Math.min(0.08, apiEndpoints.length * 0.03);
    reasons.push(`${apiEndpoints.length} API endpoint${apiEndpoints.length === 1 ? "" : "s"}`);
  }
  if (clientState.length > 0) {
    score += Math.min(0.08, clientState.length * 0.03);
    reasons.push(`${clientState.length} client state hint${clientState.length === 1 ? "" : "s"}`);
  }
  if (runtime.length > 0) {
    score += Math.min(0.08, runtime.length * 0.03);
    reasons.push(`${runtime.length} runtime hint${runtime.length === 1 ? "" : "s"}`);
  }
  if (config.length > 0) {
    score += Math.min(0.08, config.length * 0.03);
    reasons.push(`${config.length} config hint${config.length === 1 ? "" : "s"}`);
  }
  if (appHints.length > 0) {
    score += Math.min(0.06, appHints.length * 0.02);
    reasons.push(`${appHints.length} app hint${appHints.length === 1 ? "" : "s"}`);
  }
  if (mobileHints.length > 0) {
    score += Math.min(0.06, mobileHints.length * 0.02);
    reasons.push(`${mobileHints.length} mobile hint${mobileHints.length === 1 ? "" : "s"}`);
  }
  if (topics.length > 0) {
    score += Math.min(0.08, topics.length * 0.02);
    reasons.push(`${topics.length} topic${topics.length === 1 ? "" : "s"}`);
  }
  if (keyValues.length > 0) {
    score += Math.min(0.08, keyValues.length * 0.02);
    reasons.push(`${keyValues.length} key-value fact${keyValues.length === 1 ? "" : "s"}`);
  }
  if (metaFacts.length > 0) {
    score += Math.min(0.06, metaFacts.length * 0.02);
    reasons.push(`${metaFacts.length} meta fact${metaFacts.length === 1 ? "" : "s"}`);
  }
  if (provenance.length > 0) {
    score += Math.min(0.1, provenance.length * 0.04);
    reasons.push(`${provenance.length} provenance fact${provenance.length === 1 ? "" : "s"}`);
  }
  if (httpPolicies.length > 0) {
    score += Math.min(0.08, httpPolicies.length * 0.025);
    reasons.push(`${httpPolicies.length} HTTP polic${httpPolicies.length === 1 ? "y" : "ies"}`);
  }
  if (schemaFacts.length > 0) {
    score += Math.min(0.1, schemaFacts.length * 0.04);
    reasons.push(`${schemaFacts.length} schema fact group${schemaFacts.length === 1 ? "" : "s"}`);
  }
  if (offers.length > 0) {
    score += Math.min(0.09, offers.length * 0.04);
    reasons.push(`${offers.length} offer${offers.length === 1 ? "" : "s"}`);
  }
  if (identities.length > 0) {
    score += Math.min(0.08, identities.length * 0.03);
    reasons.push(`${identities.length} identity${identities.length === 1 ? "" : " entries"}`);
  }
  if (datasets.length > 0) {
    score += Math.min(0.1, datasets.length * 0.04);
    reasons.push(`${datasets.length} dataset${datasets.length === 1 ? "" : "s"}`);
  }
  if (timeline.length > 0) {
    score += Math.min(0.08, timeline.length * 0.03);
    reasons.push(`${timeline.length} timeline fact${timeline.length === 1 ? "" : "s"}`);
  }
  if (contactPoints.length > 0) {
    score += Math.min(0.08, contactPoints.length * 0.03);
    reasons.push(`${contactPoints.length} contact point${contactPoints.length === 1 ? "" : "s"}`);
  }
  if (faqs.length > 0) {
    score += Math.min(0.08, faqs.length * 0.03);
    reasons.push(`${faqs.length} FAQ item${faqs.length === 1 ? "" : "s"}`);
  }
  if (breadcrumbs.length > 0) {
    score += Math.min(0.06, breadcrumbs.length * 0.03);
    reasons.push(`${breadcrumbs.length} breadcrumb trail${breadcrumbs.length === 1 ? "" : "s"}`);
  }
  if (toc.length > 0) {
    score += Math.min(0.06, toc.length * 0.03);
    reasons.push(`${toc.length} table of contents${toc.length === 1 ? "" : " entries"}`);
  }
  if (codeBlocks.length > 0) {
    score += Math.min(0.08, codeBlocks.length * 0.04);
    reasons.push(`${codeBlocks.length} code block${codeBlocks.length === 1 ? "" : "s"}`);
  }
  if (citations.length > 0) {
    score += Math.min(0.08, citations.length * 0.03);
    reasons.push(`${citations.length} citation${citations.length === 1 ? "" : "s"}`);
  }
  if (media.length > 0) {
    score += Math.min(0.06, media.length * 0.02);
    reasons.push(`${media.length} media item${media.length === 1 ? "" : "s"}`);
  }
  if (resources.length > 0) {
    score += Math.min(0.06, resources.length * 0.02);
    reasons.push(`${resources.length} resource link${resources.length === 1 ? "" : "s"}`);
  }
  if (embeds.length > 0) {
    score += Math.min(0.06, embeds.length * 0.02);
    reasons.push(`${embeds.length} embed${embeds.length === 1 ? "" : "s"}`);
  }
  if (transcripts.length > 0) {
    score += Math.min(0.1, transcripts.length * 0.04);
    reasons.push(`${transcripts.length} transcript${transcripts.length === 1 ? "" : "s"}`);
  }
  if (authorLinks.length > 0) {
    score += Math.min(0.05, authorLinks.length * 0.025);
    reasons.push(`${authorLinks.length} author link${authorLinks.length === 1 ? "" : "s"}`);
  }
  if (contentLength >= 400) {
    score += 0.18;
    reasons.push("substantial extracted text");
  } else if (contentLength >= 120) {
    score += 0.1;
    reasons.push("some extracted text");
  }
  if (sourceLinks.length > 0) {
    score += 0.12;
    reasons.push(analysis.kind === "search-results"
      ? `${sourceLinks.length} search result source${sourceLinks.length === 1 ? "" : "s"}`
      : `${sourceLinks.length} external source link${sourceLinks.length === 1 ? "" : "s"}`);
  }
  if (sections.length > 0) {
    score += Math.min(0.08, sections.length * 0.03);
    reasons.push(`${sections.length} content section${sections.length === 1 ? "" : "s"}`);
  }
  if (pagination.length > 0 && contentLength < 160) {
    score += Math.min(0.05, pagination.length * 0.015);
    reasons.push(`${pagination.length} pagination link${pagination.length === 1 ? "" : "s"}`);
  }
  if (actions.length > 0 && contentLength < 120) {
    score -= 0.08;
    reasons.push("interaction may be required");
  }
  if (analysis.kind === "blocked-page" || analysis.kind === "empty") {
    if (analysis.kind === "empty" && contentEvidence.length === 0 && contentLength === 0) {
      return {
        level: "low",
        score: 0,
        reasons: ["no page content extracted"],
      };
    }
    score = Math.min(score, 0.18);
    reasons.push("page appears blocked or empty");
  }
  const bounded = Math.max(0, Math.min(1, score));
  return {
    level: bounded >= 0.7 ? "high" : bounded >= 0.4 ? "medium" : "low",
    score: roundMetric(bounded),
    reasons,
  };
}

function summarizeSourcePageLinks(primaryLinks: PageLinkSummary[]): PageLinkSummary[] {
  return primaryLinks
    .filter((link) => link.kind === "external")
    .sort((left, right) => sourceLinkPriority(right) - sourceLinkPriority(left) || left.rank - right.rank)
    .slice(0, 4)
    .map((link, index) => ({ ...link, path: `pageCheck.sourceLinks[${index}]`, rank: index + 1 }));
}

function sourceLinkPriority(link: PageLinkSummary): number {
  return (link.sourceScore ?? 0) >= 0.78 ? 1 : 0;
}

function summarizePageCheckActions(actions: ActionSummary[]): ActionSummary[] {
  return actions.filter((action) => !isLowValueAction(action)).slice(0, 5);
}

function isLowValueAction(action: ActionSummary): boolean {
  return /^(toggle navigation|navigation menu|appearance settings|platform|solutions|resources|open source|enterprise|open sidebar|get started|concepts|how-tos|reference|search or ask copilot|search or jump to…|search or jump to|select language:.*|version:.*|resetting focus|textbox|input|button|upvote|downvote|limit my search to .+|t5_[a-z0-9]+|open menu|close menu|hamburger menu|close|검색하기|통합검색|로그인|나중에 하기|메뉴|내비게이션)$/i.test(action.text.trim());
}

function recommendedPageCheckAction(
  readability: PageReadabilitySummary,
  analysis: AnalysisSummary,
  pageUrl: string,
  sourceLinks: PageLinkSummary[],
  dataTables: PageDataTableSummary[],
  barriers: PageBarrierSummary[],
  forms: PageFormSummary[],
  actionTargets: PageActionTargetSummary[],
  hydration: PageHydrationSummary[],
  apiEndpoints: PageApiEndpointSummary[],
  clientState: PageClientStateSummary[],
  runtime: PageRuntimeSummary[],
  config: PageConfigSummary[],
  appHints: PageAppHintSummary[],
  mobileHints: PageMobileHintSummary[],
  topics: PageTopicSummary[],
  keyValues: PageKeyValueSummary[],
  metaFacts: PageMetaFactSummary[],
  provenance: PageProvenanceSummary[],
  httpPolicies: PageHttpPolicySummary[],
  schemaFacts: PageSchemaFactSummary[],
  offers: PageOfferSummary[],
  identities: PageIdentitySummary[],
  datasets: PageDatasetSummary[],
  timeline: PageTimelineSummary[],
  contactPoints: PageContactPointSummary[],
  faqs: PageFaqSummary[],
  breadcrumbs: PageBreadcrumbSummary[],
  sections: PageSectionSummary[],
  pagination: PagePaginationSummary[],
  toc: PageTocSummary[],
  codeBlocks: PageCodeBlockSummary[],
  citations: PageCitationSummary[],
  media: PageMediaSummary[],
  resources: PageResourceSummary[],
  embeds: PageEmbedSummary[],
  transcripts: PageTranscriptSummary[],
  authorLinks: PageAuthorLinkSummary[],
  contentEvidence: PageEvidenceSummary[],
  agentMode = false,
  capturedHtml = false,
  timeoutMs?: number,
  userAgent?: string,
): SuggestedAction {
  const searchAction = analysis.suggestedActions.find((action) => action.action === "refine-search" || action.action === "open-result");
  if (searchAction) return searchAction;
  if (analysis.kind === "blocked-page" && !capturedHtml) {
    return {
      action: "retry-with-browser-html",
      reason: "The page is not reliably readable from fetched HTML.",
      url: pageUrl,
      ...commandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    };
  }
  if (analysis.kind === "blocked-page" && capturedHtml) {
    const barrier = primaryBlockingBarrier(barriers);
    return {
      action: "inspect-browser-state",
      reason: barrier
        ? `Browser-captured HTML still shows a ${barrier.kind} barrier; handle it in the live browser, then capture HTML again.`
        : "Browser-captured HTML still appears blocked or empty; inspect the browser state or capture after interacting.",
      url: pageUrl,
      requiresBrowserInteraction: true,
      ...(barrier ? { target: barrierAgentTarget(barrier, pageUrl) } : {}),
      ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    };
  }
  if (readability.level === "high" || readability.level === "medium") {
    const hasSemanticEvidence = contentEvidence.some((item) => item.source === "semantic");
    const readFrom = hasSemanticEvidence
      ? "pageCheck.contentEvidence"
      : dataTables.length > 0
        ? "pageCheck.dataTables"
        : actionTargets.length > 0
          ? "pageCheck.actionTargets"
          : hydration.length > 0
            ? "pageCheck.hydration"
            : apiEndpoints.length > 0
              ? "pageCheck.apiEndpoints"
              : clientState.length > 0
                ? "pageCheck.clientState"
                : runtime.length > 0
                  ? "pageCheck.runtime"
                  : config.length > 0
                    ? "pageCheck.config"
          : appHints.length > 0
            ? "pageCheck.appHints"
            : mobileHints.length > 0
              ? "pageCheck.mobileHints"
              : topics.length > 0
              ? "pageCheck.topics"
        : keyValues.length > 0
          ? "pageCheck.keyValues"
          : httpPolicies.length > 0
            ? "pageCheck.httpPolicies"
          : schemaFacts.length > 0
            ? "pageCheck.schemaFacts"
            : offers.length > 0
              ? "pageCheck.offers"
              : identities.length > 0
                ? "pageCheck.identities"
                : datasets.length > 0
                  ? "pageCheck.datasets"
                  : timeline.length > 0
              ? "pageCheck.timeline"
              : faqs.length > 0
              ? "pageCheck.faqs"
              : breadcrumbs.length > 0
                ? "pageCheck.breadcrumbs"
                : sections.length > 0
                  ? "pageCheck.sections"
                  : pagination.length > 0
                    ? "pageCheck.pagination"
                    : toc.length > 0
                  ? "pageCheck.toc"
                  : codeBlocks.length > 0
                    ? "pageCheck.codeBlocks"
                    : citations.length > 0
                      ? "pageCheck.citations"
                      : media.length > 0
                        ? "pageCheck.media"
                        : transcripts.length > 0
                          ? "pageCheck.transcripts"
                          : resources.length > 0
                            ? "pageCheck.resources"
                            : embeds.length > 0
                              ? "pageCheck.embeds"
                              : authorLinks.length > 0
                                ? "pageCheck.authorLinks"
                                : contactPoints.length > 0
                                  ? "pageCheck.contactPoints"
                                  : provenance.length > 0
                                    ? "pageCheck.provenance"
                                  : metaFacts.length > 0
                              ? "pageCheck.metaFacts"
                              : forms.length > 0 ? "pageCheck.forms" : "pageCheck.contentEvidence";
    return {
      action: "read-content",
      reason: "The page has enough structured evidence for source checking.",
      url: pageUrl,
      terminal: true,
      readFrom,
    };
  }
  if (forms.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but form metadata is available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.forms",
    };
  }
  if (actionTargets.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but structured action targets are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.actionTargets",
    };
  }
  if (hydration.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but hydration and data endpoint hints are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.hydration",
    };
  }
  if (apiEndpoints.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but API endpoint hints are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.apiEndpoints",
    };
  }
  if (clientState.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but client state keys are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.clientState",
    };
  }
  if (runtime.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but runtime script hints are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.runtime",
    };
  }
  if (config.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but inline app config keys are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.config",
    };
  }
  if (appHints.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but app metadata hints are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.appHints",
    };
  }
  if (mobileHints.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but mobile viewport and app-link hints are available for agent planning.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.mobileHints",
    };
  }
  if (topics.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but topic metadata is available for relevance checking.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.topics",
    };
  }
  if (keyValues.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but key-value facts are available for agent verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.keyValues",
    };
  }
  if (httpPolicies.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but HTTP policy headers and meta directives are available for agent handling.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.httpPolicies",
    };
  }
  if (schemaFacts.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but JSON-LD schema facts are available for agent verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.schemaFacts",
    };
  }
  if (offers.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but structured offer facts are available for price and availability checks.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.offers",
    };
  }
  if (identities.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but identity and official profile facts are available for provenance checks.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.identities",
    };
  }
  if (datasets.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but dataset and data download provenance is available for verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.datasets",
    };
  }
  if (timeline.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but publication and update dates are available for agent freshness checks.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.timeline",
    };
  }
  if (faqs.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but FAQ question-answer pairs are available for agent verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.faqs",
    };
  }
  if (breadcrumbs.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but breadcrumb trails are available for agent context.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.breadcrumbs",
    };
  }
  if (sections.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but heading-grouped sections are available for source checking.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.sections",
    };
  }
  if (pagination.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but pagination links are available for continuing the source check.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.pagination",
    };
  }
  if (toc.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but table-of-contents links are available for agent navigation.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.toc",
    };
  }
  if (codeBlocks.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but code blocks are available for agent verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.codeBlocks",
    };
  }
  if (citations.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but citation and reference snippets are available for agent verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.citations",
    };
  }
  if (media.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but image URLs, alt text, and captions are available for agent verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.media",
    };
  }
  if (transcripts.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but caption and transcript resources are available for media verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.transcripts",
    };
  }
  if (resources.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but feed, alternate, and document resource links are available for agent follow-up.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.resources",
    };
  }
  if (provenance.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but citation and provenance identifiers are available.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.provenance",
    };
  }
  if (embeds.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but iframe and media embed URLs are available for agent follow-up.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.embeds",
    };
  }
  if (authorLinks.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but author/profile links are available for provenance checking.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.authorLinks",
    };
  }
  if (contactPoints.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but contact points are available for agent verification or follow-up.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.contactPoints",
    };
  }
  if (metaFacts.length > 0) {
    return {
      action: "read-content",
      reason: "The page has limited readable content, but head metadata facts are available for agent verification.",
      url: pageUrl,
      terminal: true,
      readFrom: "pageCheck.metaFacts",
    };
  }
  if (analysis.kind === "empty" && !capturedHtml) {
    return {
      action: "retry-with-browser-html",
      reason: "The page is not reliably readable from fetched HTML.",
      url: pageUrl,
      ...commandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    };
  }
  if (analysis.kind === "empty" && capturedHtml) {
    const barrier = primaryBlockingBarrier(barriers);
    return {
      action: "inspect-browser-state",
      reason: barrier
        ? `Browser-captured HTML still shows a ${barrier.kind} barrier; handle it in the live browser, then capture HTML again.`
        : "Browser-captured HTML still appears blocked or empty; inspect the browser state or capture after interacting.",
      url: pageUrl,
      requiresBrowserInteraction: true,
      ...(barrier ? { target: barrierAgentTarget(barrier, pageUrl) } : {}),
      ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    };
  }
  if (sourceLinks[0]) {
    return {
      action: "open-source-link",
      reason: "The page has limited readable content, but an external source link is available.",
      url: sourceLinks[0].url,
      rank: sourceLinks[0].rank,
      ...(sourceLinks[0].path ? { sourceLinkRef: sourceLinks[0].path } : {}),
      target: agentTargetFromResult(sourceLinks[0]),
      ...commandFields(pageCommandSpec(sourceLinks[0].url, agentMode, false, [], timeoutMs, userAgent)),
    };
  }
  return {
    action: "inspect-actions-or-open-source-link",
    reason: "The page has limited readable content; inspect available controls or source links before relying on it.",
    url: pageUrl,
    requiresBrowserInteraction: true,
    ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
  };
}

function summarizePageCheckNextSteps(
  recommendedAction: SuggestedAction,
  readability: PageReadabilitySummary,
  analysis: AnalysisSummary,
  pageUrl: string,
  sourceLinks: PageLinkSummary[],
  actions: ActionSummary[],
  agentMode = false,
  capturedHtml = false,
  timeoutMs?: number,
  userAgent?: string,
): SuggestedAction[] {
  const steps: SuggestedAction[] = [];
  const add = (step: SuggestedAction): void => {
    const key = `${step.action}:${step.url ?? ""}:${step.rank ?? ""}:${step.openResult ?? ""}:${step.readFrom ?? ""}`;
    if (steps.some((item) => `${item.action}:${item.url ?? ""}:${item.rank ?? ""}:${item.openResult ?? ""}:${item.readFrom ?? ""}` === key)) return;
    steps.push(step);
  };
  const needsSearchRefinement = analysis.suggestedActions.some((action) => action.action === "refine-search");

  for (const action of analysis.suggestedActions) {
    if (action.action === "open-result" || action.action === "refine-search") add(action);
  }
  add(recommendedAction);
  if (analysis.kind === "search-results") return steps;

  if (!needsSearchRefinement) {
    for (const link of sourceLinks.slice(0, 2)) {
      add({
        action: "open-source-link",
        reason: "Inspect an external source link referenced by the page.",
        url: link.url,
        rank: link.rank,
        ...(link.path ? { sourceLinkRef: link.path } : {}),
        target: agentTargetFromResult(link),
        ...commandFields(pageCommandSpec(link.url, agentMode, false, [], timeoutMs, userAgent)),
      });
    }
  }

  if (actions[0] && analysis.kind !== "blocked-page" && analysis.kind !== "empty") {
    add({
      action: "inspect-actions",
      reason: "Visible controls may reveal more content or navigation choices.",
      url: pageUrl,
      requiresBrowserInteraction: true,
      ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    });
  }

  if (readability.level === "low" && analysis.kind !== "blocked-page" && analysis.kind !== "empty" && !capturedHtml) {
    add({
      action: "retry-with-browser-html",
      reason: "Fetched HTML has limited readable evidence; browser-captured HTML may expose more content.",
      url: pageUrl,
      ...commandFields(pageCommandSpec(pageUrl, agentMode, true, [], timeoutMs, userAgent)),
    });
  }

  return steps.slice(0, 5);
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function summarizeContentEvidence(content: ContentSummary[]): PageEvidenceSummary[] {
  return content.slice(0, 4).map((item, index) => {
    const score = evidenceScore(item.text, item.role, true, Boolean(item.selector));
    const evidence: PageEvidenceSummary = {
      id: `e${index + 1}`,
      path: `pageCheck.contentEvidence[${index}]`,
      rank: index + 1,
      text: item.text,
      role: item.role,
      source: "semantic",
      score,
      quality: evidenceQuality(score),
      qualityReason: evidenceQualityReason(score, item.text, item.role, true, Boolean(item.selector)),
    };
    if (item.selector) evidence.selector = item.selector;
    return evidence;
  });
}

function summarizeFallbackEvidence(preview: string[]): PageEvidenceSummary[] {
  return preview.map((text, index) => {
    const score = evidenceScore(text, "fallback", false, false);
    return {
      id: `e${index + 1}`,
      path: `pageCheck.contentEvidence[${index}]`,
      rank: index + 1,
      text,
      role: "fallback",
      source: "fallback",
      score,
      quality: evidenceQuality(score),
      qualityReason: evidenceQualityReason(score, text, "fallback", false, false),
    };
  });
}

function summarizeDataTables(html: string): PageDataTableSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  return findElements(document.children, (item) => item.name === "table")
    .map((table, index) => summarizeDataTable(table, index))
    .filter((table): table is PageDataTableSummary => Boolean(table))
    .map((table, index) => ({
      ...table,
      id: `t${index + 1}`,
      path: `pageCheck.dataTables[${index}]`,
      rank: index + 1,
    }))
    .slice(0, 4);
}

function summarizeDataTable(table: Element, tableIndex: number): PageDataTableSummary | undefined {
  const rows = findElements(table.children, (item) => item.name === "tr")
    .map((row) => tableRowCells(row))
    .filter((row) => row.cells.length > 0);
  if (rows.length === 0) return undefined;
  const maxColumns = Math.max(...rows.map((row) => row.cells.length));
  if (maxColumns < 2) return undefined;
  const headerRowIndex = rows.findIndex((row) => row.hasHeader);
  const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] : undefined;
  const headers = (headerRow?.cells ?? []).slice(0, 6);
  const dataRows = rows
    .filter((_row, rowIndex) => rowIndex !== headerRowIndex)
    .map((row) => row.cells.slice(0, 6))
    .filter((row) => row.some(Boolean));
  if (dataRows.length === 0) return undefined;
  const directCaption = findElement(table.children, (item) => item.name === "caption");
  const caption = directCaption ? cleanContentText(descendantText(directCaption)) : "";
  const textParts = [
    caption,
    headers.length > 0 ? `Headers: ${headers.join(" | ")}` : "",
    ...dataRows.slice(0, 3).map((row) => row.join(" | ")),
  ].filter(Boolean);
  const summary: PageDataTableSummary = {
    id: "t1",
    path: "pageCheck.dataTables[0]",
    rank: 1,
    rowCount: dataRows.length,
    columnCount: maxColumns,
    headers,
    sampleRows: dataRows.slice(0, 3),
    text: cleanContentText(textParts.join(" ; ")),
    selector: `table:nth-of-type(${tableIndex + 1})`,
  };
  if (caption) summary.caption = caption;
  return summary;
}

function tableRowCells(row: Element): { cells: string[]; hasHeader: boolean } {
  const cellElements = row.children.filter((child): child is Element => child instanceof DomElement && (child.name === "th" || child.name === "td"));
  return {
    cells: cellElements.map((cell) => cleanContentText(descendantText(cell))).filter(Boolean),
    hasHeader: cellElements.some((cell) => cell.name === "th"),
  };
}

function summarizeBarriers(diagnostics: DiagnosticSummary[], content: ContentSummary[], actions: ActionSummary[]): PageBarrierSummary[] {
  const items: PageBarrierSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageBarrierSummary, "id" | "path" | "rank" | "text">): void => {
    const evidence = cleanContentText(item.evidence).slice(0, 360);
    if (!evidence) return;
    const key = `${item.kind}\n${item.source}\n${evidence}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `br${rank}`,
      path: `pageCheck.barriers[${rank - 1}]`,
      rank,
      ...item,
      evidence,
      text: `${barrierLabel(item.kind)}: ${evidence}`,
    });
  };

  for (const diagnostic of diagnostics) {
    const kind = barrierKindFromDiagnostic(diagnostic.code);
    if (!kind) continue;
    add({
      kind,
      severity: diagnostic.severity,
      evidence: diagnostic.message,
      diagnosticCode: diagnostic.code,
      source: "diagnostic",
    });
  }

  for (const item of content.slice(0, 12)) {
    const kind = barrierKindFromText(item.text);
    if (!kind) continue;
    add({
      kind,
      severity: kind === "cookie-consent" ? "info" : "warning",
      evidence: item.text,
      source: "content",
      ...(item.selector ? { selector: item.selector } : {}),
    });
  }

  for (const action of actions.slice(0, 20)) {
    const kind = barrierKindFromText(action.text);
    if (!kind) continue;
    add({
      kind,
      severity: kind === "cookie-consent" ? "info" : "warning",
      evidence: action.text,
      source: "action",
      ...(action.selector ? { selector: action.selector } : {}),
    });
  }

  return items.slice(0, 6);
}

function barrierKindFromDiagnostic(code: string): PageBarrierSummary["kind"] | undefined {
  if (code === "CHALLENGE_LIKELY") return "challenge";
  if (code === "LOGIN_REQUIRED") return "login";
  if (code === "PAYWALL_LIKELY") return "paywall";
  return undefined;
}

function barrierKindFromText(text: string): PageBarrierSummary["kind"] | undefined {
  const haystack = text.toLowerCase();
  if (/(captcha|verify you are human|checking your browser|just a moment|cloudflare|access denied|request blocked|enable javascript|봇이 아닙니다|보안문자)/i.test(haystack)) return "challenge";
  if (/(login required|log in to continue|sign in to continue|please sign in|unauthorized|로그인이 필요|회원만|가입 후)/i.test(haystack)) return "login";
  if (/(subscribe to continue|subscription required|paywall|premium article|구독|유료기사|유료 기사|결제 후)/i.test(haystack)) return "paywall";
  if (/(accept all cookies|cookie settings|cookie preferences|we use cookies|쿠키|개인정보 설정)/i.test(haystack)) return "cookie-consent";
  if (/(age verification|confirm your age|are you over 18|18\+|성인 인증|나이 확인)/i.test(haystack)) return "age-gate";
  if (/(not available in your region|unavailable in your country|geo[-\s]?blocked|지역.*제한|국가.*제한)/i.test(haystack)) return "geo-block";
  return undefined;
}

function barrierLabel(kind: PageBarrierSummary["kind"]): string {
  if (kind === "cookie-consent") return "Cookie consent";
  if (kind === "age-gate") return "Age gate";
  if (kind === "geo-block") return "Geo block";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function primaryBlockingBarrier(barriers: PageBarrierSummary[]): PageBarrierSummary | undefined {
  const blocking = barriers.filter((barrier) => barrier.kind !== "cookie-consent");
  return blocking.sort((left, right) => barrierPriority(right) - barrierPriority(left) || left.rank - right.rank)[0];
}

function barrierPriority(barrier: PageBarrierSummary): number {
  if (barrier.kind === "challenge") return 6;
  if (barrier.kind === "login") return 5;
  if (barrier.kind === "paywall") return 4;
  if (barrier.kind === "age-gate") return 3;
  if (barrier.kind === "geo-block") return 2;
  return 1;
}

function barrierAgentTarget(barrier: PageBarrierSummary, pageUrl: string): AgentTarget {
  return {
    title: barrierLabel(barrier.kind),
    url: pageUrl,
    path: barrier.path,
    text: barrier.text,
    source: barrier.source,
    rank: barrier.rank,
    ...(barrier.selector ? { selector: barrier.selector } : {}),
  };
}

function summarizeForms(html: string, baseUrl: string): PageFormSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  return findElements(document.children, (item) => item.name === "form")
    .map((form, index) => summarizeForm(form, index, baseUrl, document.children))
    .filter((form): form is PageFormSummary => Boolean(form))
    .slice(0, 4);
}

function summarizeForm(form: Element, index: number, baseUrl: string, rootNodes: AnyNode[]): PageFormSummary | undefined {
  const fields = summarizeFormFields(form, rootNodes);
  if (fields.length === 0) return undefined;
  const method = (attr(form, "method") || "get").toLowerCase();
  const action = attr(form, "action") || baseUrl;
  const actionUrl = normalizeHref(action, baseUrl) ?? action;
  const submitText = summarizeFormSubmitText(form);
  const queryField = formQueryField(fields);
  const urlTemplate = method === "get" && queryField ? formUrlTemplate(actionUrl, queryField) : "";
  const textParts = [
    `${method.toUpperCase()} ${actionUrl}`,
    queryField ? `query field: ${queryField}` : "",
    submitText ? `submit: ${submitText}` : "",
    ...fields.slice(0, 4).map(formatFormFieldSummary),
  ].filter(Boolean);
  const summary: PageFormSummary = {
    id: `f${index + 1}`,
    path: `pageCheck.forms[${index}]`,
    rank: index + 1,
    method,
    actionUrl,
    fieldCount: fields.length,
    fields: fields.slice(0, 6),
    text: cleanContentText(textParts.join(" ; ")),
    selector: `form:nth-of-type(${index + 1})`,
  };
  if (submitText) summary.submitText = submitText;
  if (queryField) summary.queryField = queryField;
  if (urlTemplate) summary.urlTemplate = urlTemplate;
  return summary;
}

function summarizeFormFields(form: Element, rootNodes: AnyNode[]): PageFormFieldSummary[] {
  const controls = findElements(form.children, (item) => ["input", "textarea", "select"].includes(item.name));
  return controls
    .map((control, index) => summarizeFormField(control, index, rootNodes))
    .filter((field): field is PageFormFieldSummary => Boolean(field));
}

function summarizeFormField(control: Element, index: number, rootNodes: AnyNode[]): PageFormFieldSummary | undefined {
  const type = control.name === "textarea"
    ? "textarea"
    : control.name === "select"
      ? "select"
      : (attr(control, "type") || "text").toLowerCase();
  if (type === "hidden" || type === "submit" || type === "button" || type === "image" || type === "reset") return undefined;
  const name = attr(control, "name") || attr(control, "id") || "";
  const field: PageFormFieldSummary = {
    type,
    selector: name ? `${control.name}[name="${cssAttributeValue(name)}"]` : `${control.name}:nth-of-type(${index + 1})`,
  };
  const label = formFieldLabel(control, rootNodes);
  const placeholder = attr(control, "placeholder") || "";
  const value = attr(control, "value") || "";
  const options = control.name === "select"
    ? findElements(control.children, (item) => item.name === "option").map((option) => cleanContentText(descendantText(option) || attr(option, "value") || "")).filter(Boolean).slice(0, 8)
    : [];
  if (name) field.name = name;
  if (label) field.label = label;
  if (placeholder) field.placeholder = placeholder;
  if (value) field.value = value;
  if (attr(control, "required") !== undefined || attr(control, "aria-required") === "true") field.required = true;
  if (options.length > 0) field.options = options;
  return field;
}

function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function formFieldLabel(control: Element, rootNodes: AnyNode[]): string {
  const ariaLabel = attr(control, "aria-label");
  if (ariaLabel) return cleanLinkText(ariaLabel);
  const labelledBy = attr(control, "aria-labelledby");
  if (labelledBy) {
    const labels = labelledBy.split(/\s+/)
      .map((id) => findElement(rootNodes, (item) => attr(item, "id") === id))
      .map((element) => element ? cleanContentText(descendantText(element)) : "")
      .filter(Boolean);
    if (labels.length > 0) return labels.join(" ");
  }
  const id = attr(control, "id");
  if (id) {
    const explicit = findElement(rootNodes, (item) => item.name === "label" && attr(item, "for") === id);
    if (explicit) return cleanContentText(descendantText(explicit));
  }
  const wrapped = nearestAncestorLabel(control, rootNodes);
  if (wrapped) return cleanContentText(descendantText(wrapped));
  return "";
}

function nearestAncestorLabel(target: Element, nodes: AnyNode[]): Element | undefined {
  function visit(nodeList: AnyNode[], ancestors: Element[]): Element | undefined {
    for (const node of nodeList) {
      if (!(node instanceof DomElement)) continue;
      if (node === target) return [...ancestors].reverse().find((ancestor) => ancestor.name === "label");
      const found = visit(node.children, [...ancestors, node]);
      if (found) return found;
    }
    return undefined;
  }
  return visit(nodes, []);
}

function summarizeFormSubmitText(form: Element): string {
  const submit = findElement(form.children, (item) => {
    if (item.name === "button") return !attr(item, "type") || attr(item, "type") === "submit";
    return item.name === "input" && (attr(item, "type") || "text").toLowerCase() === "submit";
  });
  if (!submit) return "";
  return cleanLinkText(elementText(submit) || attr(submit, "value") || attr(submit, "aria-label") || "");
}

function elementText(element: Element): string {
  let text = "";
  for (const child of element.children) {
    if (child.type === "text") {
      text += child.data;
    } else if (child instanceof DomElement) {
      text += elementText(child);
    }
  }
  return text;
}

function formQueryField(fields: PageFormFieldSummary[]): string {
  const queryLike = fields.find((field) => field.name && (field.type === "search" || /^(q|query|search|keyword|keywords|s|wd|p)$/i.test(field.name) || /search|query|keyword|검색/i.test(`${field.label ?? ""} ${field.placeholder ?? ""}`)));
  return queryLike?.name ?? fields.find((field) => field.name && (field.type === "text" || field.type === "search"))?.name ?? "";
}

function formUrlTemplate(actionUrl: string, queryField: string): string {
  try {
    const url = new URL(actionUrl);
    url.searchParams.set(queryField, "{query}");
    return url.toString();
  } catch {
    return "";
  }
}

function formatFormFieldSummary(field: PageFormFieldSummary): string {
  const name = field.name ? `${field.name}:` : "";
  const label = field.label || field.placeholder || field.value || "";
  const required = field.required ? " required" : "";
  const options = field.options?.length ? ` options=${field.options.join("|")}` : "";
  return `${name}${field.type}${required}${label ? ` ${label}` : ""}${options}`;
}

function summarizeActionTargets(html: string, baseUrl: string): PageActionTargetSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageActionTargetSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageActionTargetSummary, "id" | "path" | "rank" | "text">): void => {
    const name = cleanContentText(item.name).slice(0, 140);
    const targetUrl = item.targetUrl ? normalizeActionTargetUrl(item.targetUrl, baseUrl) : "";
    const urlTemplate = item.urlTemplate ? normalizeActionTargetUrl(item.urlTemplate, baseUrl) : "";
    const queryInput = cleanContentText(item.queryInput ?? "").slice(0, 160);
    const method = cleanLinkText(item.method ?? "").toUpperCase().slice(0, 24);
    const encodingType = cleanLinkText(item.encodingType ?? "").slice(0, 80);
    const key = `${item.kind}\n${name}\n${targetUrl}\n${urlTemplate}\n${queryInput}`.toLowerCase();
    if (!isUsefulActionTarget(name, targetUrl, urlTemplate, queryInput) || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `at${rank}`,
      path: `pageCheck.actionTargets[${rank - 1}]`,
      rank,
      kind: item.kind,
      name,
      source: item.source,
      ...(targetUrl ? { targetUrl } : {}),
      ...(urlTemplate ? { urlTemplate } : {}),
      ...(queryInput ? { queryInput } : {}),
      ...(method ? { method } : {}),
      ...(encodingType ? { encodingType } : {}),
      ...(typeof item.disabled === "boolean" ? { disabled: item.disabled } : {}),
      ...(typeof item.pressed !== "undefined" ? { pressed: item.pressed } : {}),
      ...(typeof item.expanded === "boolean" ? { expanded: item.expanded } : {}),
      ...(typeof item.haspopup !== "undefined" ? { haspopup: item.haspopup } : {}),
      ...(item.controls ? { controls: item.controls } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
      text: actionTargetText(item.kind, name, targetUrl, urlTemplate, queryInput, method, encodingType, {
        disabled: item.disabled,
        pressed: item.pressed,
        expanded: item.expanded,
        haspopup: item.haspopup,
        controls: item.controls,
        source: item.source,
      }),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const target of actionTargetsFromJsonLd(value)) {
        add({
          ...target,
          source: "json-ld",
          selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
        });
      }
    }
  }

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = cleanLinkText(attr(link, "rel") ?? "");
    if (!rel.split(/\s+/).some((part) => part.toLowerCase() === "search")) continue;
    const href = attr(link, "href") ?? "";
    const targetUrl = href ? normalizeHref(href, baseUrl) : null;
    if (!targetUrl) continue;
    add({
      kind: "search",
      name: cleanContentText(attr(link, "title") || "Search endpoint"),
      source: "link",
      targetUrl,
      encodingType: cleanLinkText(attr(link, "type") ?? ""),
      ...actionTargetStateFromElement(link),
      selector: `link[rel="${cssAttributeValue(rel)}"]:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function actionTargetsFromJsonLd(value: Record<string, unknown>): Array<Omit<PageActionTargetSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const values = [...schemaObjectArray(value.potentialAction)];
  if (jsonLdStringArray(value["@type"]).some((type) => /Action$/i.test(type))) values.unshift(value);
  return values
    .map((action) => actionTargetFromJsonLd(action, value))
    .filter((target): target is Omit<PageActionTargetSummary, "id" | "path" | "rank" | "text" | "source" | "selector"> => Boolean(target));
}

function actionTargetFromJsonLd(action: Record<string, unknown>, context: Record<string, unknown>): Omit<PageActionTargetSummary, "id" | "path" | "rank" | "text" | "source" | "selector"> | undefined {
  const kind = actionTargetKind(jsonLdStringArray(action["@type"]));
  if (!kind) return undefined;
  const target = schemaObjectArray(action.target)[0];
  const rawTarget = target
    ? jsonLdString(target.urlTemplate) || jsonLdString(target.url) || jsonLdString(target.contentUrl) || jsonLdString(target["@id"])
    : jsonLdString(action.target);
  const targetUrl = rawTarget && !/[{]/.test(rawTarget) ? rawTarget : "";
  const urlTemplate = rawTarget && /[{]/.test(rawTarget) ? rawTarget : "";
  const name = jsonLdString(action.name) || jsonLdString(context.name) || actionTargetDefaultName(kind);
  const queryInput = jsonLdString(action["query-input"]) || jsonLdString(target?.["query-input"]);
  const method = jsonLdString(target?.httpMethod);
  const encodingType = jsonLdString(target?.encodingType) || jsonLdString(target?.contentType);
  return {
    kind,
    name,
    ...(targetUrl ? { targetUrl } : {}),
    ...(urlTemplate ? { urlTemplate } : {}),
    ...(queryInput ? { queryInput } : {}),
    ...(method ? { method } : {}),
    ...(encodingType ? { encodingType } : {}),
  };
}

function actionTargetKind(types: string[]): PageActionTargetSummary["kind"] | undefined {
  const normalized = types.map((type) => type.toLowerCase());
  if (normalized.includes("searchaction")) return "search";
  if (normalized.includes("readaction") || normalized.includes("viewaction")) return "read";
  if (normalized.includes("downloadaction")) return "download";
  if (normalized.includes("subscribeaction")) return "subscribe";
  if (normalized.some((type) => type.endsWith("action"))) return "action";
  return undefined;
}

function normalizeActionTargetUrl(value: string, baseUrl: string): string {
  const normalized = normalizeHref(value, baseUrl) ?? value;
  return normalized.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
}

function actionTargetDefaultName(kind: PageActionTargetSummary["kind"]): string {
  if (kind === "search") return "Search action";
  if (kind === "read") return "Read action";
  if (kind === "download") return "Download action";
  if (kind === "subscribe") return "Subscribe action";
  return "Action";
}

function isUsefulActionTarget(name: string, targetUrl: string, urlTemplate: string, queryInput: string): boolean {
  if (!name || name.length > 140) return false;
  return Boolean(targetUrl || urlTemplate || queryInput);
}

function actionTargetStateFromElement(element: Element): Pick<PageActionTargetSummary, "disabled" | "pressed" | "expanded" | "haspopup" | "controls"> {
  const ariaDisabled = cleanLinkText(attr(element, "aria-disabled") ?? "").toLowerCase();
  const ariaPressed = cleanLinkText(attr(element, "aria-pressed") ?? "").toLowerCase();
  const ariaExpanded = cleanLinkText(attr(element, "aria-expanded") ?? "").toLowerCase();
  const ariaHaspopup = cleanLinkText(attr(element, "aria-haspopup") ?? "").toLowerCase();
  const controls = cleanLinkText(attr(element, "aria-controls") ?? "").slice(0, 160);
  return {
    ...(typeof attr(element, "disabled") !== "undefined" || ariaDisabled === "true" ? { disabled: true } : {}),
    ...(ariaPressed === "true" || ariaPressed === "false" || ariaPressed === "mixed" ? { pressed: ariaPressed === "mixed" ? "mixed" : ariaPressed === "true" } : {}),
    ...(ariaExpanded === "true" || ariaExpanded === "false" ? { expanded: ariaExpanded === "true" } : {}),
    ...(ariaHaspopup && ariaHaspopup !== "false" ? { haspopup: ariaHaspopup === "true" ? true : ariaHaspopup as SemanticNodeState["haspopup"] } : {}),
    ...(controls ? { controls } : {}),
  };
}

function actionTargetText(
  kind: PageActionTargetSummary["kind"],
  name: string,
  targetUrl: string,
  urlTemplate: string,
  queryInput: string,
  method: string,
  encodingType: string,
  state: {
    disabled?: boolean | undefined;
    pressed?: SemanticNodeState["pressed"] | undefined;
    expanded?: boolean | undefined;
    haspopup?: SemanticNodeState["haspopup"] | undefined;
    controls?: string | undefined;
    source: PageActionTargetSummary["source"];
  },
): string {
  return cleanContentText([
    `${kind}: ${name}`,
    targetUrl ? `target=${targetUrl}` : "",
    urlTemplate ? `template=${urlTemplate}` : "",
    queryInput ? `queryInput=${queryInput}` : "",
    method ? `method=${method}` : "",
    encodingType ? `type=${encodingType}` : "",
    typeof state.disabled === "boolean" ? `disabled=${state.disabled}` : "",
    typeof state.pressed !== "undefined" ? `pressed=${state.pressed}` : "",
    typeof state.expanded === "boolean" ? `expanded=${state.expanded}` : "",
    typeof state.haspopup !== "undefined" ? `haspopup=${state.haspopup}` : "",
    state.controls ? `controls=${state.controls}` : "",
    `source=${state.source}`,
  ].filter(Boolean).join(" "));
}

function summarizeHydration(html: string, baseUrl: string): PageHydrationSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageHydrationSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageHydrationSummary, "id" | "path" | "rank" | "text">): void => {
    const label = cleanContentText(item.label).slice(0, 100);
    const route = cleanContentText(item.route ?? "").slice(0, 160);
    const buildId = cleanLinkText(item.buildId ?? "").slice(0, 120);
    const framework = cleanLinkText(item.framework ?? "").slice(0, 40);
    const url = item.url ? normalizeHydrationUrl(item.url, baseUrl) : "";
    const key = `${item.kind}\n${label}\n${route}\n${buildId}\n${url}`.toLowerCase();
    if (!label || seen.has(key) || !isUsefulHydrationHint(item.kind, label, route, buildId, url)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `hd${rank}`,
      path: `pageCheck.hydration[${rank - 1}]`,
      rank,
      kind: item.kind,
      label,
      source: item.source,
      ...(framework ? { framework } : {}),
      ...(route ? { route } : {}),
      ...(buildId ? { buildId } : {}),
      ...(url ? { url } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
      text: hydrationText(item.kind, label, framework, route, buildId, url, item.source),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script").entries()) {
    const id = cleanLinkText(attr(script, "id") ?? "");
    const type = cleanLinkText(attr(script, "type") ?? "").toLowerCase();
    if (id === "__NEXT_DATA__") {
      const data = parseJsonObject(scriptText(script));
      const route = jsonLdString(data?.page);
      const buildId = jsonLdString(data?.buildId);
      add({
        kind: "next-data",
        label: "Next.js data",
        source: "script",
        framework: "next",
        ...(route ? { route } : {}),
        ...(buildId ? { buildId } : {}),
        ...(nextDataUrl(route, buildId) ? { url: nextDataUrl(route, buildId) } : {}),
        selector: `script#__NEXT_DATA__:nth-of-type(${scriptIndex + 1})`,
      });
      continue;
    }
    if (id === "__NUXT_DATA__" || id === "__NUXT__") {
      add({
        kind: "nuxt-data",
        label: "Nuxt data",
        source: "script",
        framework: "nuxt",
        selector: `script#${cssIdentifier(id)}:nth-of-type(${scriptIndex + 1})`,
      });
      continue;
    }
    if (/application\/json/i.test(type) && /(?:gatsby|remix|sveltekit|apollo|payload|data|state)/i.test(id)) {
      add({
        kind: "json-script",
        label: id || "Application JSON data",
        source: "script",
        selector: id ? `script#${cssIdentifier(id)}:nth-of-type(${scriptIndex + 1})` : `script[type="${cssAttributeValue(type)}"]:nth-of-type(${scriptIndex + 1})`,
      });
    }
  }

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = cleanLinkText(attr(link, "rel") ?? "");
    const href = cleanLinkText(attr(link, "href") ?? "");
    if (!rel || !href) continue;
    const relParts = rel.toLowerCase().split(/\s+/);
    const asValue = cleanLinkText(attr(link, "as") ?? "").toLowerCase();
    const type = cleanLinkText(attr(link, "type") ?? "").toLowerCase();
    const kind = hydrationLinkKind(href, asValue, type);
    if (!kind || !relParts.some((part) => /^(preload|prefetch|modulepreload)$/.test(part))) continue;
    add({
      kind,
      label: hydrationLinkLabel(kind),
      source: "link",
      url: href,
      selector: `link[rel="${cssAttributeValue(rel)}"]:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function nextDataUrl(route: string, buildId: string): string {
  if (!route || !buildId) return "";
  const path = route === "/" ? "/index" : route.startsWith("/") ? route : `/${route}`;
  return `/_next/data/${buildId}${path}.json`;
}

function normalizeHydrationUrl(value: string, baseUrl: string): string {
  return normalizeHref(value, baseUrl) ?? value;
}

function hydrationLinkKind(href: string, asValue: string, type: string): PageHydrationSummary["kind"] | undefined {
  if (/\/_next\/data\/[^/]+\/.+\.json(?:[?#]|$)/i.test(href)) return "next-data";
  if (/\/page-data\/.+\/page-data\.json(?:[?#]|$)/i.test(href)) return "gatsby-data";
  if (asValue === "fetch" || /json/.test(type) || /\.(?:json|ndjson)(?:[?#]|$)/i.test(href)) return "fetch-preload";
  return undefined;
}

function hydrationLinkLabel(kind: PageHydrationSummary["kind"]): string {
  if (kind === "next-data") return "Next.js data URL";
  if (kind === "gatsby-data") return "Gatsby page data";
  if (kind === "fetch-preload") return "Fetch preload";
  if (kind === "nuxt-data") return "Nuxt data";
  return "Hydration data";
}

function isUsefulHydrationHint(kind: PageHydrationSummary["kind"], label: string, route: string, buildId: string, url: string): boolean {
  if (label.length > 120) return false;
  if (kind === "json-script") return /(?:data|state|payload|gatsby|remix|sveltekit|apollo)/i.test(label);
  return Boolean(route || buildId || url || kind === "nuxt-data");
}

function hydrationText(kind: PageHydrationSummary["kind"], label: string, framework: string, route: string, buildId: string, url: string, source: PageHydrationSummary["source"]): string {
  return cleanContentText([
    `${label}:`,
    `kind=${kind}`,
    framework ? `framework=${framework}` : "",
    route ? `route=${route}` : "",
    buildId ? `buildId=${buildId}` : "",
    url ? `url=${url}` : "",
    `source=${source}`,
  ].filter(Boolean).join(" "));
}

function cssIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function summarizeApiEndpoints(html: string, baseUrl: string): PageApiEndpointSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageApiEndpointSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageApiEndpointSummary, "id" | "path" | "rank" | "text">): void => {
    const url = normalizeApiEndpointUrl(item.url, baseUrl);
    const method = cleanLinkText(item.method ?? "").toUpperCase().slice(0, 12);
    const key = `${item.kind}\n${method}\n${url}`.toLowerCase();
    if (!isUsefulApiEndpointUrl(url) || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `api${rank}`,
      path: `pageCheck.apiEndpoints[${rank - 1}]`,
      rank,
      kind: item.kind,
      url,
      source: item.source,
      ...(method ? { method } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
      text: apiEndpointText(item.kind, method, url),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script").entries()) {
    if (attr(script, "src")) continue;
    const text = scriptText(script);
    if (!text || text.length > 160_000) continue;
    const selector = `script:nth-of-type(${scriptIndex + 1})`;
    for (const endpoint of apiEndpointsFromScript(text)) {
      add({ ...endpoint, source: "script", selector });
    }
  }

  return items.slice(0, 8);
}

function apiEndpointsFromScript(text: string): Array<Omit<PageApiEndpointSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const items: Array<Omit<PageApiEndpointSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> = [];
  const add = (kind: PageApiEndpointSummary["kind"], url: string, method?: string): void => {
    if (url) items.push({ kind, url, ...(method ? { method } : {}) });
  };

  for (const match of text.matchAll(/\bfetch\s*\(\s*(['"`])([^'"`]+)\1\s*(?:,\s*\{([\s\S]{0,400}?)\})?/g)) {
    const url = match[2] ?? "";
    add(apiEndpointKind(url), url, methodFromOptionsSnippet(match[3] ?? ""));
  }
  for (const match of text.matchAll(/\baxios(?:\.(get|post|put|patch|delete|head))?\s*\(\s*(['"`])([^'"`]+)\2/g)) {
    add("axios", match[3] ?? "", match[1]);
  }
  for (const match of text.matchAll(/\.open\s*\(\s*(['"`])([A-Z]+)\1\s*,\s*(['"`])([^'"`]+)\3/g)) {
    add("xhr", match[4] ?? "", match[2]);
  }
  for (const match of text.matchAll(/new\s+EventSource\s*\(\s*(['"`])([^'"`]+)\1/g)) {
    add("event-stream", match[2] ?? "", "GET");
  }
  for (const match of text.matchAll(/(['"`])([^'"`]*\/graphql[^'"`]*)\1/g)) {
    add("graphql", match[2] ?? "", "POST");
  }
  return items;
}

function methodFromOptionsSnippet(snippet: string): string {
  const match = /\bmethod\s*:\s*(['"`])([A-Za-z]+)\1/i.exec(snippet);
  return match?.[2] ?? "";
}

function apiEndpointKind(url: string): PageApiEndpointSummary["kind"] {
  if (/\/graphql(?:[/?#]|$)/i.test(url)) return "graphql";
  return "fetch";
}

function normalizeApiEndpointUrl(value: string, baseUrl: string): string {
  const trimmed = cleanLinkText(value);
  if (!trimmed || /[{]|\$\{|^data:|^blob:|^javascript:/i.test(trimmed)) return "";
  if (/^\/\//.test(trimmed)) {
    try {
      const base = new URL(baseUrl);
      return `${base.protocol}${trimmed}`;
    } catch {
      return trimmed;
    }
  }
  return normalizeHref(trimmed, baseUrl) ?? trimmed;
}

function isUsefulApiEndpointUrl(url: string): boolean {
  if (!url || url.length > 260) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  return /\/(?:api|graphql|rpc|v\d+|rest|search|query|events|stream)(?:[/?#]|$)|\.(?:json|ndjson)(?:[?#]|$)/i.test(url);
}

function apiEndpointText(kind: PageApiEndpointSummary["kind"], method: string, url: string): string {
  return cleanContentText([kind, method || "", url].filter(Boolean).join(" "));
}

function summarizeClientState(html: string): PageClientStateSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageClientStateSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageClientStateSummary, "id" | "path" | "rank" | "text" | "source"> & { source?: "script" }): void => {
    const key = normalizeClientStateKey(item.key);
    const dedupeKey = `${item.kind}\n${item.operation}\n${key}`.toLowerCase();
    if (!key || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const rank = items.length + 1;
    items.push({
      id: `cs${rank}`,
      path: `pageCheck.clientState[${rank - 1}]`,
      rank,
      kind: item.kind,
      operation: item.operation,
      key,
      text: clientStateText(item.kind, item.operation, key),
      source: "script",
      ...(item.selector ? { selector: item.selector } : {}),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script").entries()) {
    if (attr(script, "src")) continue;
    const text = scriptText(script);
    if (!text || text.length > 160_000) continue;
    const selector = `script:nth-of-type(${scriptIndex + 1})`;
    for (const state of clientStateFromScript(text)) {
      add({ ...state, selector });
    }
  }

  return items.slice(0, 8);
}

function clientStateFromScript(text: string): Array<Omit<PageClientStateSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const items: Array<Omit<PageClientStateSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> = [];
  const add = (kind: PageClientStateSummary["kind"], operation: PageClientStateSummary["operation"], key: string): void => {
    if (key) items.push({ kind, operation, key });
  };
  const storageKind = (value: string): PageClientStateSummary["kind"] => value === "sessionStorage" ? "session-storage" : "local-storage";

  for (const match of text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem)\s*\(\s*(['"`])([^'"`]+)\3/g)) {
    const operation = match[2] === "setItem" ? "write" : match[2] === "removeItem" ? "delete" : "read";
    add(storageKind(match[1] ?? ""), operation, match[4] ?? "");
  }
  for (const match of text.matchAll(/\b(localStorage|sessionStorage)\s*\[\s*(['"`])([^'"`]+)\2\s*\](\s*=)?/g)) {
    add(storageKind(match[1] ?? ""), match[4] ? "write" : "read", match[3] ?? "");
  }
  for (const match of text.matchAll(/\bdocument\s*\.\s*cookie\s*=\s*(['"`])\s*([^=;'"`]+)\s*=/g)) {
    add("cookie", "write", match[2] ?? "");
  }
  for (const match of text.matchAll(/\bdocument\s*\.\s*cookie\s*\.?\s*(?:match|includes|indexOf)\s*\(\s*(['"`])([^'"`=;]+)(?:=)?[^'"`]*\1/g)) {
    add("cookie", "read", match[2] ?? "");
  }
  for (const match of text.matchAll(/\bCookies\s*\.\s*(get|set|remove)\s*\(\s*(['"`])([^'"`]+)\2/g)) {
    const operation = match[1] === "set" ? "write" : match[1] === "remove" ? "delete" : "read";
    add("cookie", operation, match[3] ?? "");
  }
  return items;
}

function normalizeClientStateKey(value: string): string {
  const key = cleanLinkText(value).replace(/^["'`]+|["'`]+$/g, "");
  if (!key || key.length > 80) return "";
  if (/[{}]|\$\{|[\r\n]/.test(key)) return "";
  if (!/[A-Za-z0-9_-]/.test(key)) return "";
  return key;
}

function clientStateText(kind: PageClientStateSummary["kind"], operation: PageClientStateSummary["operation"], key: string): string {
  return cleanContentText(`${kind} ${operation} ${key}`);
}

function summarizeRuntime(html: string, baseUrl: string): PageRuntimeSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageRuntimeSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageRuntimeSummary, "id" | "path" | "rank" | "text">): void => {
    const url = normalizeRuntimeUrl(item.url, baseUrl);
    const key = `${item.kind}\n${url}`.toLowerCase();
    if (!url || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `rt${rank}`,
      path: `pageCheck.runtime[${rank - 1}]`,
      rank,
      kind: item.kind,
      url,
      text: runtimeText(item.kind, url),
      source: item.source,
      ...(item.selector ? { selector: item.selector } : {}),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script").entries()) {
    if (attr(script, "src")) continue;
    const text = scriptText(script);
    if (!text || text.length > 160_000) continue;
    const selector = `script:nth-of-type(${scriptIndex + 1})`;
    for (const item of runtimeFromScript(text)) {
      add({ ...item, source: "script", selector });
    }
  }
  for (const [linkIndex, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = cleanLinkText(attr(link, "rel") ?? "").toLowerCase();
    const href = attr(link, "href") ?? "";
    if (!/\bmodulepreload\b/.test(rel)) continue;
    add({
      kind: "module-preload",
      url: href,
      source: "link",
      selector: `link[rel="${cssAttributeValue(rel)}"]:nth-of-type(${linkIndex + 1})`,
    });
  }

  return items.slice(0, 8);
}

function runtimeFromScript(text: string): Array<Omit<PageRuntimeSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const items: Array<Omit<PageRuntimeSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> = [];
  const add = (kind: PageRuntimeSummary["kind"], url: string): void => {
    if (url) items.push({ kind, url });
  };

  for (const match of text.matchAll(/\bnavigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(\s*(['"`])([^'"`]+)\1/g)) {
    add("service-worker", match[2] ?? "");
  }
  for (const match of text.matchAll(/\bnew\s+Worker\s*\(\s*(['"`])([^'"`]+)\1/g)) {
    add("web-worker", match[2] ?? "");
  }
  for (const match of text.matchAll(/\bnew\s+SharedWorker\s*\(\s*(['"`])([^'"`]+)\1/g)) {
    add("shared-worker", match[2] ?? "");
  }
  for (const match of text.matchAll(/\b(?:audioWorklet|paintWorklet|layoutWorklet|animationWorklet|\w+\.worklet)\s*\.\s*addModule\s*\(\s*(['"`])([^'"`]+)\1/g)) {
    add("worklet", match[2] ?? "");
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
    add("dynamic-import", match[2] ?? "");
  }
  return items;
}

function normalizeRuntimeUrl(value: string, baseUrl: string): string {
  const trimmed = cleanLinkText(value);
  if (!trimmed || /[{]|\$\{|^data:|^blob:|^javascript:/i.test(trimmed)) return "";
  const url = normalizeHref(trimmed, baseUrl) ?? trimmed;
  if (!/^https?:\/\//i.test(url) || url.length > 260) return "";
  return url;
}

function runtimeText(kind: PageRuntimeSummary["kind"], url: string): string {
  return cleanContentText(`${kind} ${url}`);
}

function summarizeConfig(html: string): PageConfigSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageConfigSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageConfigSummary, "id" | "path" | "rank" | "text" | "keyCount" | "source">): void => {
    const name = cleanConfigName(item.name);
    const keys = uniqueStrings(item.keys.map(cleanConfigKey).filter(Boolean)).slice(0, 12);
    const key = `${item.kind}\n${name}\n${keys.join("\n")}`.toLowerCase();
    if (!name || keys.length === 0 || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `cfg${rank}`,
      path: `pageCheck.config[${rank - 1}]`,
      rank,
      kind: item.kind,
      name,
      keys,
      keyCount: keys.length,
      text: configText(item.kind, name, keys),
      source: "script",
      ...(item.selector ? { selector: item.selector } : {}),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script").entries()) {
    if (attr(script, "src")) continue;
    const text = scriptText(script);
    if (!text || text.length > 160_000) continue;
    const selector = `script:nth-of-type(${scriptIndex + 1})`;
    for (const item of configFromScript(text)) add({ ...item, selector });
  }

  return items.slice(0, 8);
}

function configFromScript(text: string): Array<Omit<PageConfigSummary, "id" | "path" | "rank" | "text" | "keyCount" | "source" | "selector">> {
  const items: Array<Omit<PageConfigSummary, "id" | "path" | "rank" | "text" | "keyCount" | "source" | "selector">> = [];
  const add = (name: string, objectText: string): void => {
    const keys = configKeysFromObjectLiteral(objectText);
    if (keys.length === 0) return;
    items.push({ kind: configKind(name, keys), name, keys });
  };

  const assignment = /\b(?:window|globalThis|self)?\s*\.?\s*([A-Za-z_$][\w$]*(?:__[A-Za-z0-9_$]+__)?|__[A-Za-z0-9_$]+__)\s*=\s*\{/g;
  for (const match of text.matchAll(assignment)) {
    const name = match[1] ?? "";
    if (!isConfigGlobalName(name)) continue;
    const openIndex = (match.index ?? 0) + match[0].lastIndexOf("{");
    const objectText = balancedBraceText(text, openIndex);
    if (objectText) add(name, objectText);
  }

  for (const match of text.matchAll(/\bdataLayer\s*\.\s*push\s*\(\s*\{/g)) {
    const openIndex = (match.index ?? 0) + match[0].lastIndexOf("{");
    const objectText = balancedBraceText(text, openIndex);
    if (objectText) add("dataLayer.push", objectText);
  }

  return items;
}

function isConfigGlobalName(name: string): boolean {
  return /(?:config|settings|env|flags|feature|state|store|bootstrap|initial|payload|apollo|redux|remix|sveltekit|dataLayer)/i.test(name);
}

function balancedBraceText(text: string, openIndex: number): string {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, index + 1);
    }
  }
  return "";
}

function configKeysFromObjectLiteral(objectText: string): string[] {
  const parsed = parseLooseObjectLiteral(objectText);
  if (parsed) return Object.keys(parsed);
  return Array.from(objectText.matchAll(/(?:^|[,{]\s*)(['"]?)([A-Za-z_$][\w$-]{1,80})\1\s*:/g), (match) => match[2] ?? "");
}

function parseLooseObjectLiteral(objectText: string): Record<string, unknown> | undefined {
  const attempts = [
    objectText,
    objectText
      .replace(/'/g, "\"")
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, "$1\"$2\"$3"),
  ];
  for (const attempt of attempts) {
    const parsed = parseJsonObject(attempt);
    if (parsed) return parsed;
  }
  return undefined;
}

function configKind(name: string, keys: string[]): PageConfigSummary["kind"] {
  const value = `${name} ${keys.join(" ")}`;
  if (/dataLayer/i.test(name)) return "data-layer";
  if (/(?:env|environment|apiBase|apiUrl|baseUrl)/i.test(value)) return "env";
  if (/(?:flag|feature|experiment|variant)/i.test(value)) return "feature-flags";
  if (/(?:state|store|redux|apollo|initial|bootstrap|payload)/i.test(value)) return "initial-state";
  if (/(?:config|settings)/i.test(value)) return "app-config";
  return "config";
}

function cleanConfigName(value: string): string {
  return cleanLinkText(value.replace(/^window\.|^globalThis\.|^self\./, "")).slice(0, 80);
}

function cleanConfigKey(value: string): string {
  const key = cleanLinkText(value).replace(/^["'`]+|["'`]+$/g, "");
  if (!key || key.length > 80 || /[{]|\$\{|[\r\n]/.test(key)) return "";
  return key;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function configText(kind: PageConfigSummary["kind"], name: string, keys: string[]): string {
  return cleanContentText(`${kind} ${name} keys=${keys.join(", ")}`);
}

function summarizeAppHints(html: string, baseUrl: string): PageAppHintSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageAppHintSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageAppHintSummary, "id" | "path" | "rank" | "text">): void => {
    const label = cleanContentText(item.label).slice(0, 80);
    const value = cleanContentText(item.value).slice(0, 180);
    const url = item.url ? normalizeHref(item.url, baseUrl) ?? "" : "";
    const sizes = cleanLinkText(item.sizes ?? "").slice(0, 60);
    const media = cleanLinkText(item.media ?? "").slice(0, 80);
    const key = `${item.kind}\n${label}\n${value}\n${url}\n${sizes}`.toLowerCase();
    if (!label || !value || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `ah${rank}`,
      path: `pageCheck.appHints[${rank - 1}]`,
      rank,
      kind: item.kind,
      label,
      value,
      source: item.source,
      ...(url ? { url } : {}),
      ...(sizes ? { sizes } : {}),
      ...(media ? { media } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
      text: appHintText(item.kind, label, value, url, sizes, media, item.source),
    });
  };

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = cleanLinkText(attr(link, "rel") ?? "");
    if (!rel) continue;
    const relParts = rel.toLowerCase().split(/\s+/);
    const href = cleanLinkText(attr(link, "href") ?? "");
    if (relParts.includes("manifest") && href) {
      add({
        kind: "manifest",
        label: "Web app manifest",
        value: href,
        source: "link",
        url: href,
        selector: `link[rel="${cssAttributeValue(rel)}"]:nth-of-type(${index + 1})`,
      });
      continue;
    }
    if (relParts.some((part) => /^(icon|shortcut|apple-touch-icon|mask-icon)$/.test(part)) && href) {
      const label = appIconLabel(relParts);
      add({
        kind: "icon",
        label,
        value: resourceTitleFromUrl(href) || href,
        source: "link",
        url: href,
        sizes: cleanLinkText(attr(link, "sizes") ?? ""),
        media: cleanLinkText(attr(link, "media") ?? ""),
        selector: `link[rel="${cssAttributeValue(rel)}"]:nth-of-type(${index + 1})`,
      });
    }
  }

  for (const [index, meta] of findElements(document.children, (item) => item.name === "meta").entries()) {
    const name = cleanLinkText(attr(meta, "name") || attr(meta, "property") || "").toLowerCase();
    const content = cleanContentText(attr(meta, "content") ?? "");
    if (!name || !content) continue;
    const hint = appHintFromMeta(name, content);
    if (!hint) continue;
    add({
      ...hint,
      source: "meta",
      selector: `meta[name="${cssAttributeValue(name)}"]:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function appIconLabel(relParts: string[]): string {
  if (relParts.includes("apple-touch-icon")) return "Apple touch icon";
  if (relParts.includes("mask-icon")) return "Mask icon";
  if (relParts.includes("shortcut")) return "Shortcut icon";
  return "App icon";
}

function appHintFromMeta(name: string, content: string): Omit<PageAppHintSummary, "id" | "path" | "rank" | "text" | "source" | "selector"> | undefined {
  if (name === "application-name" || name === "apple-mobile-web-app-title") {
    return { kind: "app-name", label: appMetaLabel(name), value: content };
  }
  if (name === "theme-color" || name === "msapplication-tilecolor" || name === "msapplication-navbutton-color") {
    return { kind: "theme", label: appMetaLabel(name), value: content };
  }
  if (/^(apple-mobile-web-app-capable|mobile-web-app-capable|msapplication-tap-highlight|msapplication-starturl|msapplication-tooltip)$/.test(name)) {
    return { kind: "capability", label: appMetaLabel(name), value: content };
  }
  if (/^msapplication-(tileimage|square\d+x\d+logo|wide\d+x\d+logo)$/i.test(name)) {
    return { kind: "icon", label: appMetaLabel(name), value: content, url: content };
  }
  return undefined;
}

function appMetaLabel(name: string): string {
  const labels: Record<string, string> = {
    "application-name": "Application name",
    "apple-mobile-web-app-title": "Apple app title",
    "theme-color": "Theme color",
    "msapplication-tilecolor": "Windows tile color",
    "msapplication-navbutton-color": "Windows nav button color",
    "apple-mobile-web-app-capable": "Apple standalone capable",
    "mobile-web-app-capable": "Mobile web app capable",
    "msapplication-tap-highlight": "Windows tap highlight",
    "msapplication-starturl": "Windows start URL",
    "msapplication-tooltip": "Windows tooltip",
    "msapplication-tileimage": "Windows tile image",
  };
  return labels[name] ?? cleanContentText(name.replace(/[-_]+/g, " ").replace(/^msapplication\s+/i, "Windows "));
}

function appHintText(kind: PageAppHintSummary["kind"], label: string, value: string, url: string, sizes: string, media: string, source: PageAppHintSummary["source"]): string {
  return cleanContentText([
    `${label}: ${value}`,
    `kind=${kind}`,
    url ? `url=${url}` : "",
    sizes ? `sizes=${sizes}` : "",
    media ? `media=${media}` : "",
    `source=${source}`,
  ].filter(Boolean).join(" "));
}

function summarizeMobileHints(html: string, baseUrl: string): PageMobileHintSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageMobileHintSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageMobileHintSummary, "id" | "path" | "rank" | "text">): void => {
    const label = cleanContentText(item.label).slice(0, 80);
    const value = cleanContentText(item.value).slice(0, 220);
    const url = item.url ? normalizeHref(item.url, baseUrl) ?? cleanLinkText(item.url) : "";
    const platform = cleanContentText(item.platform ?? "").slice(0, 40);
    const key = `${item.kind}\n${label}\n${value}\n${platform}\n${url}`.toLowerCase();
    if (!label || !value || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `mh${rank}`,
      path: `pageCheck.mobileHints[${rank - 1}]`,
      rank,
      kind: item.kind,
      label,
      value,
      source: item.source,
      ...(platform ? { platform } : {}),
      ...(url ? { url } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
      text: mobileHintText(item.kind, label, value, platform, url, item.source),
    });
  };

  for (const [index, meta] of findElements(document.children, (item) => item.name === "meta").entries()) {
    const name = cleanLinkText(attr(meta, "name") || attr(meta, "property") || "").toLowerCase();
    const content = cleanContentText(attr(meta, "content") ?? "");
    if (!name || !content) continue;
    const hint = mobileHintFromMeta(name, content);
    if (!hint) continue;
    add({
      ...hint,
      source: "meta",
      selector: `meta[name="${cssAttributeValue(name)}"]:nth-of-type(${index + 1})`,
    });
  }

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = cleanLinkText(attr(link, "rel") ?? "").toLowerCase();
    const href = cleanLinkText(attr(link, "href") ?? "");
    if (!href || !rel.split(/\s+/).includes("alternate")) continue;
    const type = cleanLinkText(attr(link, "type") ?? "").toLowerCase();
    const platform = mobileAlternatePlatform(type, href);
    if (!platform) continue;
    add({
      kind: "app-link",
      label: `${platform} alternate app link`,
      value: href,
      source: "link",
      platform,
      url: href,
      selector: `link[rel="${cssAttributeValue(rel)}"]:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function mobileHintFromMeta(name: string, content: string): Omit<PageMobileHintSummary, "id" | "path" | "rank" | "text" | "source" | "selector"> | undefined {
  if (name === "viewport") return { kind: "viewport", label: "Viewport", value: content };
  if (name === "format-detection") return { kind: "format-detection", label: "Format detection", value: content };
  if (name === "color-scheme" || name === "supported-color-schemes") return { kind: "color-scheme", label: mobileMetaLabel(name), value: content };
  if (name === "apple-itunes-app") {
    const url = appArgumentUrl(content);
    return {
      kind: "smart-app-banner",
      label: "Apple Smart App Banner",
      value: content,
      platform: "ios",
      ...(url ? { url } : {}),
    };
  }
  if (/^(al:ios:url|twitter:app:url:iphone|twitter:app:url:ipad)$/.test(name)) {
    return { kind: "app-link", label: mobileMetaLabel(name), value: content, platform: "ios", url: content };
  }
  if (/^(al:android:url|twitter:app:url:googleplay)$/.test(name)) {
    return { kind: "app-link", label: mobileMetaLabel(name), value: content, platform: "android", url: content };
  }
  if (/^(al:web:url|twitter:app:url)$/.test(name)) {
    return { kind: "app-link", label: mobileMetaLabel(name), value: content, platform: "web", url: content };
  }
  if (/^(al:ios:app_name|al:android:app_name|twitter:app:name:iphone|twitter:app:name:ipad|twitter:app:name:googleplay)$/.test(name)) {
    return { kind: "app-link", label: mobileMetaLabel(name), value: content, platform: mobileMetaPlatform(name) };
  }
  if (/^(al:ios:app_store_id|al:android:package|twitter:app:id:iphone|twitter:app:id:ipad|twitter:app:id:googleplay)$/.test(name)) {
    return { kind: "app-link", label: mobileMetaLabel(name), value: content, platform: mobileMetaPlatform(name) };
  }
  return undefined;
}

function mobileMetaLabel(name: string): string {
  const labels: Record<string, string> = {
    "color-scheme": "Color scheme",
    "supported-color-schemes": "Supported color schemes",
    "al:ios:url": "iOS app URL",
    "al:ios:app_name": "iOS app name",
    "al:ios:app_store_id": "iOS App Store ID",
    "al:android:url": "Android app URL",
    "al:android:app_name": "Android app name",
    "al:android:package": "Android package",
    "al:web:url": "Web app URL",
    "twitter:app:url:iphone": "Twitter iPhone app URL",
    "twitter:app:url:ipad": "Twitter iPad app URL",
    "twitter:app:url:googleplay": "Twitter Google Play app URL",
    "twitter:app:url": "Twitter app URL",
    "twitter:app:name:iphone": "Twitter iPhone app name",
    "twitter:app:name:ipad": "Twitter iPad app name",
    "twitter:app:name:googleplay": "Twitter Google Play app name",
    "twitter:app:id:iphone": "Twitter iPhone app ID",
    "twitter:app:id:ipad": "Twitter iPad app ID",
    "twitter:app:id:googleplay": "Twitter Google Play app ID",
  };
  return labels[name] ?? cleanContentText(name.replace(/[:_-]+/g, " "));
}

function mobileMetaPlatform(name: string): string {
  if (name.includes("ios") || name.includes("iphone") || name.includes("ipad")) return "ios";
  if (name.includes("android") || name.includes("googleplay")) return "android";
  return "web";
}

function mobileAlternatePlatform(type: string, href: string): string {
  if (type === "application/vnd.android.package-archive" || /^android-app:\/\//i.test(href)) return "android";
  if (/^ios-app:\/\//i.test(href)) return "ios";
  return "";
}

function appArgumentUrl(content: string): string | undefined {
  const match = /(?:^|,)\s*app-argument\s*=\s*([^,]+)/i.exec(content);
  return match?.[1]?.trim();
}

function mobileHintText(kind: PageMobileHintSummary["kind"], label: string, value: string, platform: string, url: string, source: PageMobileHintSummary["source"]): string {
  return cleanContentText([
    `${label}: ${value}`,
    `kind=${kind}`,
    platform ? `platform=${platform}` : "",
    url ? `url=${url}` : "",
    `source=${source}`,
  ].filter(Boolean).join(" "));
}

function summarizeTopics(html: string): PageTopicSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageTopicSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageTopicSummary, "id" | "path" | "rank" | "text">): void => {
    const value = cleanTopicValue(item.value);
    const label = cleanContentText(item.label).slice(0, 60) || topicLabel(item.kind);
    const key = `${item.kind}\n${value}`.toLowerCase();
    if (!isUsefulTopic(value) || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `tp${rank}`,
      path: `pageCheck.topics[${rank - 1}]`,
      rank,
      kind: item.kind,
      label,
      value,
      source: item.source,
      ...(item.selector ? { selector: item.selector } : {}),
      text: topicText(item.kind, label, value, item.source),
    });
  };

  for (const [index, meta] of findElements(document.children, (item) => item.name === "meta").entries()) {
    const rawName = cleanLinkText(attr(meta, "name") || attr(meta, "property") || "");
    const name = rawName.toLowerCase();
    const content = cleanContentText(attr(meta, "content") ?? "");
    if (!name || !content) continue;
    const kind = topicKindFromMetaName(name);
    if (!kind) continue;
    const values = kind === "keyword" ? splitTopicValues(content) : [content];
    for (const value of values) {
      const selectorAttribute = attr(meta, "property") ? "property" : "name";
      add({
        kind,
        label: topicMetaLabel(name, kind),
        value,
        source: "meta",
        selector: `meta[${selectorAttribute}="${cssAttributeValue(rawName)}"]:nth-of-type(${index + 1})`,
      });
    }
  }

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const topic of topicsFromJsonLd(value)) {
        add({
          ...topic,
          source: "json-ld",
          selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
        });
      }
    }
  }

  return items.slice(0, 10);
}

function topicKindFromMetaName(name: string): PageTopicSummary["kind"] | undefined {
  if (/^(keywords|news_keywords|sailthru\.tags|parsely-tags)$/.test(name)) return "keyword";
  if (name === "article:tag" || name === "og:article:tag") return "tag";
  if (name === "article:section" || name === "section") return "section";
  if (/^(category|dc\.subject|dcterms\.subject)$/.test(name)) return "category";
  return undefined;
}

function topicMetaLabel(name: string, kind: PageTopicSummary["kind"]): string {
  if (name === "news_keywords") return "News keyword";
  if (name === "article:tag" || name === "og:article:tag") return "Article tag";
  if (name === "article:section") return "Article section";
  return topicLabel(kind);
}

function topicsFromJsonLd(value: Record<string, unknown>): Array<Omit<PageTopicSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const items: Array<Omit<PageTopicSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> = [];
  for (const keyword of jsonLdTopicValues(value.keywords)) items.push({ kind: "keyword", label: "Keyword", value: keyword });
  for (const section of jsonLdTopicValues(value.articleSection)) items.push({ kind: "section", label: "Article section", value: section });
  for (const category of jsonLdTopicValues(value.category)) items.push({ kind: "category", label: "Category", value: category });
  for (const about of jsonLdTopicValues(value.about)) items.push({ kind: "about", label: "About", value: about });
  for (const mention of jsonLdTopicValues(value.mentions)) items.push({ kind: "mention", label: "Mention", value: mention });
  return items;
}

function jsonLdTopicValues(value: unknown): string[] {
  if (typeof value === "string") return splitTopicValues(value);
  if (Array.isArray(value)) return value.flatMap(jsonLdTopicValues);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [jsonLdString(object.name) || jsonLdString(object.headline) || jsonLdString(object.url) || jsonLdString(object["@id"])].filter(Boolean);
}

function splitTopicValues(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map(cleanTopicValue)
    .filter(Boolean);
}

function cleanTopicValue(value: string): string {
  return cleanContentText(value.replace(/^#/, "")).slice(0, 120);
}

function isUsefulTopic(value: string): boolean {
  if (value.length < 2 || value.length > 120) return false;
  return !/^(home|menu|navigation|login|search|share|privacy|terms|cookie|uncategorized)$/i.test(value);
}

function topicLabel(kind: PageTopicSummary["kind"]): string {
  if (kind === "keyword") return "Keyword";
  if (kind === "tag") return "Tag";
  if (kind === "section") return "Section";
  if (kind === "category") return "Category";
  if (kind === "about") return "About";
  return "Mention";
}

function topicText(kind: PageTopicSummary["kind"], label: string, value: string, source: PageTopicSummary["source"]): string {
  return cleanContentText(`${label}: ${value} kind=${kind} source=${source}`);
}

function summarizeKeyValues(html: string): PageKeyValueSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageKeyValueSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageKeyValueSummary, "id" | "path" | "rank">): void => {
    const label = cleanKeyValuePart(item.label);
    const value = cleanKeyValuePart(item.value);
    const key = `${label}\n${value}`.toLowerCase();
    if (!label || !value || seen.has(key) || isLowValueKeyValue(label, value)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `kv${rank}`,
      path: `pageCheck.keyValues[${rank - 1}]`,
      rank,
      label,
      value,
      text: cleanContentText(`${label}: ${value}`),
      source: item.source,
      ...(item.datetime ? { datetime: item.datetime } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
    });
  };
  for (const item of keyValuesFromDefinitionLists(document.children)) add(item);
  for (const item of keyValuesFromTimeElements(document.children)) add(item);
  for (const item of keyValuesFromLabelText(document.children)) add(item);
  return items.slice(0, 8);
}

function keyValuesFromDefinitionLists(nodes: AnyNode[]): Array<Omit<PageKeyValueSummary, "id" | "path" | "rank">> {
  const values: Array<Omit<PageKeyValueSummary, "id" | "path" | "rank">> = [];
  for (const [listIndex, list] of findElements(nodes, (item) => item.name === "dl").entries()) {
    let currentLabel = "";
    for (const child of list.children) {
      if (!(child instanceof DomElement)) continue;
      if (child.name === "dt") {
        currentLabel = cleanContentText(descendantText(child));
      } else if (child.name === "dd" && currentLabel) {
        const value = cleanContentText(descendantText(child));
        if (value) {
          values.push({
            label: currentLabel,
            value,
            text: `${currentLabel}: ${value}`,
            source: "definition-list",
            selector: `dl:nth-of-type(${listIndex + 1})`,
          });
        }
      }
    }
  }
  return values;
}

function keyValuesFromTimeElements(nodes: AnyNode[]): Array<Omit<PageKeyValueSummary, "id" | "path" | "rank">> {
  return findElements(nodes, (item) => item.name === "time")
    .map((time, index) => {
      const datetime = cleanLinkText(attr(time, "datetime") ?? "");
      const value = cleanContentText(descendantText(time) || datetime);
      const label = inferTimeLabel(time, nodes) || "Time";
      return {
        label,
        value,
        text: `${label}: ${value}`,
        source: "time" as const,
        ...(datetime ? { datetime } : {}),
        selector: `time:nth-of-type(${index + 1})`,
      };
    })
    .filter((item) => item.value);
}

function inferTimeLabel(time: Element, rootNodes: AnyNode[]): string {
  const marker = `${attr(time, "itemprop") ?? ""} ${attr(time, "property") ?? ""} ${attr(time, "class") ?? ""} ${attr(time, "aria-label") ?? ""}`.toLowerCase();
  if (/modified|updated|수정|업데이트/.test(marker)) return "Modified";
  if (/publish|published|datepublished|created|작성|게시|등록/.test(marker)) return "Published";
  const parentText = cleanContentText(parentContextText(time, rootNodes));
  const match = /\b(published|modified|updated|created|posted|date|작성일|수정일|게시일|등록일)\b\s*[:：-]?/i.exec(parentText);
  return match?.[1] ? cleanKeyValuePart(match[1]) : "";
}

function parentContextText(target: Element, rootNodes: AnyNode[]): string {
  let context = "";
  function visit(nodes: AnyNode[], ancestors: Element[]): boolean {
    for (const node of nodes) {
      if (!(node instanceof DomElement)) continue;
      if (node === target) {
        const parent = ancestors.at(-1);
        context = parent ? descendantText(parent) : descendantText(target);
        return true;
      }
      if (visit(node.children, [...ancestors, node])) return true;
    }
    return false;
  }
  visit(rootNodes, []);
  return context;
}

function keyValuesFromLabelText(nodes: AnyNode[]): Array<Omit<PageKeyValueSummary, "id" | "path" | "rank">> {
  const values: Array<Omit<PageKeyValueSummary, "id" | "path" | "rank">> = [];
  for (const [index, element] of findElements(nodes, isLikelyKeyValueContainer).entries()) {
    const text = cleanContentText(descendantText(element));
    const match = /^([^:：]{2,40})[:：]\s*(.{2,160})$/.exec(text);
    if (!match?.[1] || !match[2]) continue;
    values.push({
      label: match[1],
      value: match[2],
      text: `${match[1]}: ${match[2]}`,
      source: "text",
      selector: `${element.name}:nth-of-type(${index + 1})`,
    });
  }
  return values;
}

function isLikelyKeyValueContainer(element: Element): boolean {
  if (!["li", "p", "div", "span"].includes(element.name)) return false;
  if (hasLikelyContentChild(element)) return false;
  const text = cleanContentText(descendantText(element));
  return text.length >= 6 && text.length <= 180 && /^[^:：]{2,40}[:：]\s*.{2,160}$/.test(text);
}

function cleanKeyValuePart(value: string): string {
  return cleanContentText(value.replace(/\s*[:：]\s*$/g, "").replace(/^\s*[-–—]\s*/g, ""));
}

function isLowValueKeyValue(label: string, value: string): boolean {
  if (label.length > 48 || value.length > 180) return true;
  if (/^(home|menu|navigation|login|search|share|privacy|terms|cookie|광고|로그인|메뉴|검색)$/i.test(label)) return true;
  return label.toLowerCase() === value.toLowerCase();
}

function summarizeSchemaFacts(html: string): PageSchemaFactSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageSchemaFactSummary[] = [];
  const seen = new Set<string>();
  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      const types = jsonLdStringArray(value["@type"]).slice(0, 4);
      const facts = schemaFactsFromJsonLd(value).slice(0, 8);
      const key = `${types.join(",")}\n${facts.map((fact) => `${fact.label}:${fact.value}`).join("\n")}`.toLowerCase();
      if (facts.length === 0 || seen.has(key)) continue;
      seen.add(key);
      const rank = items.length + 1;
      items.push({
        id: `sf${rank}`,
        path: `pageCheck.schemaFacts[${rank - 1}]`,
        rank,
        types,
        facts,
        text: schemaFactText(types, facts),
        source: "json-ld",
        selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
      });
    }
  }
  return items.slice(0, 6);
}

function schemaFactsFromJsonLd(value: Record<string, unknown>): PageSchemaFact[] {
  const facts: PageSchemaFact[] = [];
  const add = (label: string, raw: unknown): void => {
    const fact = schemaFact(label, raw);
    if (!fact) return;
    if (facts.some((item) => item.label.toLowerCase() === fact.label.toLowerCase() && item.value.toLowerCase() === fact.value.toLowerCase())) return;
    facts.push(fact);
  };
  add("Name", value.name ?? value.headline);
  add("Description", value.description);
  add("Author", jsonLdAuthor(value.author));
  add("Published", value.datePublished ?? value.dateCreated);
  add("Modified", value.dateModified);
  add("SKU", value.sku);
  add("Brand", schemaNamedValue(value.brand));
  add("Category", value.category);
  add("Start date", value.startDate);
  add("End date", value.endDate);
  add("Location", schemaNamedValue(value.location));
  for (const offer of schemaObjectArray(value.offers).slice(0, 2)) {
    const price = [jsonLdString(offer.priceCurrency), jsonLdString(offer.price)].filter(Boolean).join(" ");
    add("Offer price", price);
    add("Offer availability", schemaAvailability(offer.availability));
    add("Offer URL", offer.url);
  }
  for (const rating of schemaObjectArray(value.aggregateRating).slice(0, 1)) {
    add("Rating", [jsonLdString(rating.ratingValue), jsonLdString(rating.bestRating)].filter(Boolean).join(" / "));
    add("Review count", rating.reviewCount ?? rating.ratingCount);
  }
  for (const question of schemaObjectArray(value.mainEntity).slice(0, 4)) {
    const questionText = jsonLdString(question.name);
    const answers = schemaObjectArray(question.acceptedAnswer)
      .map((answer) => jsonLdString(answer.text))
      .filter(Boolean);
    if (questionText && answers[0]) add(`FAQ: ${questionText}`, answers[0]);
  }
  return facts.filter((fact) => !isLowValueSchemaFact(fact));
}

function schemaFact(label: string, raw: unknown): PageSchemaFact | undefined {
  const value = schemaFactValue(raw);
  if (!value) return undefined;
  return { label, value };
}

function schemaFactValue(raw: unknown): string {
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return cleanContentText(String(raw));
  if (Array.isArray(raw)) return raw.map(schemaFactValue).filter(Boolean).join(", ");
  if (!raw || typeof raw !== "object") return "";
  return schemaNamedValue(raw);
}

function schemaObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function schemaNamedValue(value: unknown): string {
  if (!value || typeof value !== "object") return jsonLdString(value);
  const object = value as Record<string, unknown>;
  return jsonLdString(object.name) || jsonLdString(object.headline) || jsonLdString(object.url) || jsonLdString(object["@id"]);
}

function schemaAvailability(value: unknown): string {
  const text = jsonLdString(value);
  return text.replace(/^https?:\/\/schema\.org\//i, "");
}

function isLowValueSchemaFact(fact: PageSchemaFact): boolean {
  if (fact.value.length > 280) return true;
  return fact.label.toLowerCase() === fact.value.toLowerCase();
}

function summarizeMetaFacts(html: string, baseUrl: string): PageMetaFactSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageMetaFactSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageMetaFactSummary, "id" | "path" | "rank" | "text">): void => {
    const value = cleanContentText(item.value);
    if (!value || value.length > 240) return;
    const key = `${item.label}\n${value}\n${item.url ?? ""}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `mf${rank}`,
      path: `pageCheck.metaFacts[${rank - 1}]`,
      rank,
      ...item,
      value,
      text: `${item.label}: ${value}`,
    });
  };

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = (attr(link, "rel") ?? "").toLowerCase();
    if (!rel) continue;
    const href = attr(link, "href") ?? "";
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (rel.split(/\s+/).includes("canonical") && url) {
      add({ label: "Canonical URL", value: url, source: "link", url, selector: `link[rel="canonical"]:nth-of-type(${index + 1})` });
    } else if (rel.split(/\s+/).includes("alternate") && url) {
      const hreflang = cleanContentText(attr(link, "hreflang") ?? "");
      const type = cleanContentText(attr(link, "type") ?? "");
      const label = hreflang ? `Alternate language ${hreflang}` : type ? `Alternate ${type}` : "Alternate URL";
      add({ label, value: url, source: "link", url, selector: `link[rel="alternate"]:nth-of-type(${index + 1})` });
    }
  }

  for (const [index, meta] of findElements(document.children, (item) => item.name === "meta").entries()) {
    const name = (attr(meta, "name") || attr(meta, "property") || attr(meta, "http-equiv") || "").toLowerCase();
    const content = cleanContentText(attr(meta, "content") ?? "");
    if (!name || !content) continue;
    const label = metaFactLabel(name);
    if (!label) continue;
    const refreshUrl = name === "refresh" ? refreshContentUrl(content, baseUrl) : null;
    add({
      label,
      value: refreshUrl ?? content,
      source: "meta",
      ...(refreshUrl ? { url: refreshUrl } : {}),
      selector: `meta:nth-of-type(${index + 1})`,
    });
  }
  return items.slice(0, 10);
}

function metaFactLabel(name: string): string {
  if (/^(robots|googlebot|bingbot|slurp)$/.test(name)) return `${name} directives`;
  if (name === "refresh") return "Refresh target";
  if (name === "generator") return "Generator";
  if (name === "application-name") return "Application name";
  if (name === "og:type") return "Open Graph type";
  if (name === "og:locale") return "Open Graph locale";
  if (name === "article:section") return "Article section";
  if (name === "article:tag") return "Article tag";
  if (name === "twitter:card") return "Twitter card";
  return "";
}

function refreshContentUrl(content: string, baseUrl: string): string | null {
  const match = /url\s*=\s*([^;]+)/i.exec(content);
  const rawUrl = match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  return rawUrl ? normalizeHref(rawUrl, baseUrl) : null;
}

function summarizeProvenance(html: string, baseUrl: string): PageProvenanceSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageProvenanceSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageProvenanceSummary, "id" | "path" | "rank" | "text">): void => {
    const value = cleanProvenanceValue(item.value);
    const label = cleanContentText(item.label).slice(0, 80);
    const url = item.url ? normalizeHref(item.url, baseUrl) ?? item.url : provenanceUrl(item.kind, value, baseUrl);
    const key = `${item.kind}\n${label}\n${value}\n${url}`.toLowerCase();
    if (!label || !value || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `pv${rank}`,
      path: `pageCheck.provenance[${rank - 1}]`,
      rank,
      kind: item.kind,
      label,
      value,
      text: provenanceText(item.kind, label, value, url, item.source),
      source: item.source,
      ...(url ? { url } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
    });
  };

  for (const [index, meta] of findElements(document.children, (item) => item.name === "meta").entries()) {
    const name = (attr(meta, "name") || attr(meta, "property") || "").toLowerCase();
    const content = cleanContentText(attr(meta, "content") ?? "");
    if (!name || !content) continue;
    const fact = provenanceFromMeta(name, content);
    if (!fact) continue;
    add({ ...fact, source: "meta", selector: `meta:nth-of-type(${index + 1})` });
  }

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = cleanLinkText(attr(link, "rel") ?? "").toLowerCase();
    const href = attr(link, "href") ?? "";
    if (!href || !rel.split(/\s+/).includes("license")) continue;
    add({
      kind: "license",
      label: "License",
      value: href,
      url: href,
      source: "link",
      selector: `link[rel="license"]:nth-of-type(${index + 1})`,
    });
  }

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const fact of provenanceFromJsonLd(value, baseUrl)) {
        add({ ...fact, source: "json-ld", selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})` });
      }
    }
  }

  return items.slice(0, 8);
}

function provenanceFromMeta(name: string, content: string): Omit<PageProvenanceSummary, "id" | "path" | "rank" | "text" | "source" | "selector"> | undefined {
  if (/^(citation_doi|dc\.identifier|dcterms\.identifier)$/.test(name) && doiValue(content)) return { kind: "doi", label: "DOI", value: doiValue(content) };
  if (/^citation_pmid$/.test(name)) return { kind: "pmid", label: "PMID", value: content };
  if (/^(citation_arxiv_id|arxiv_id)$/.test(name)) return { kind: "arxiv", label: "arXiv", value: content };
  if (/^(citation_isbn|isbn)$/.test(name)) return { kind: "isbn", label: "ISBN", value: content };
  if (/^citation_journal_title$/.test(name)) return { kind: "journal", label: "Journal", value: content };
  if (/^(citation_publisher|dc\.publisher|dcterms\.publisher)$/.test(name)) return { kind: "publisher", label: "Publisher", value: content };
  if (/^(citation_pdf_url|citation_fulltext_html_url)$/.test(name)) return { kind: "identifier", label: name.replace(/^citation_/, "Citation "), value: content, url: content };
  if (/^(dc\.identifier|dcterms\.identifier)$/.test(name)) return { kind: "identifier", label: "Identifier", value: content };
  return undefined;
}

function provenanceFromJsonLd(value: Record<string, unknown>, baseUrl: string): Array<Omit<PageProvenanceSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const facts: Array<Omit<PageProvenanceSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> = [];
  const add = (kind: PageProvenanceSummary["kind"], label: string, raw: string, url?: string): void => {
    if (raw) facts.push({ kind, label, value: raw, ...(url ? { url } : {}) });
  };
  const identifier = jsonLdString(value.identifier) || jsonLdString(value["@id"]);
  if (doiValue(identifier)) add("doi", "DOI", doiValue(identifier));
  else add("identifier", "Identifier", identifier);
  add("isbn", "ISBN", jsonLdString(value.isbn));
  const publisher = schemaNamedValue(value.publisher);
  add("publisher", "Publisher", publisher);
  const journal = schemaNamedValue(value.isPartOf);
  add("journal", "Journal", journal);
  const license = schemaLicenseUrl(value.license, baseUrl);
  add("license", "License", license, license);
  return facts;
}

function doiValue(value: string): string {
  const match = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i.exec(value);
  return match?.[1] ?? "";
}

function cleanProvenanceValue(value: string): string {
  return cleanContentText(value).replace(/^doi:\s*/i, "").slice(0, 180);
}

function provenanceUrl(kind: PageProvenanceSummary["kind"], value: string, baseUrl: string): string {
  if (kind === "doi" && doiValue(value)) return `https://doi.org/${doiValue(value)}`;
  if (kind === "pmid" && /^\d+$/.test(value)) return `https://pubmed.ncbi.nlm.nih.gov/${value}/`;
  if (kind === "arxiv") return `https://arxiv.org/abs/${value.replace(/^arxiv:/i, "")}`;
  if (kind === "license" && /^https?:\/\//i.test(value)) return normalizeHref(value, baseUrl) ?? value;
  if (kind === "identifier" && /^https?:\/\//i.test(value)) return normalizeHref(value, baseUrl) ?? value;
  return "";
}

function provenanceText(kind: PageProvenanceSummary["kind"], label: string, value: string, url: string, source: PageProvenanceSummary["source"]): string {
  return cleanContentText([`${label}: ${value}`, `kind=${kind}`, url ? `url=${url}` : "", `source=${source}`].filter(Boolean).join(" "));
}

function summarizeHttpPolicies(html: string, responseHeaders: Record<string, string>): PageHttpPolicySummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageHttpPolicySummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageHttpPolicySummary, "id" | "path" | "rank" | "text">): void => {
    const name = httpPolicyName(item.name);
    const value = cleanContentText(item.value);
    const key = `${name}\n${value}\n${item.source}`.toLowerCase();
    if (!name || !value || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `hp${rank}`,
      path: `pageCheck.httpPolicies[${rank - 1}]`,
      rank,
      name,
      value,
      source: item.source,
      ...(item.selector ? { selector: item.selector } : {}),
      text: `${name}: ${value} source=${item.source}`,
    });
  };

  for (const name of responseHeaderAllowlist) {
    const value = responseHeaders[name];
    if (!value || !isHttpPolicyHeader(name)) continue;
    add({ name, value, source: "header" });
  }

  for (const [index, meta] of findElements(document.children, (item) => item.name === "meta").entries()) {
    const httpEquiv = cleanLinkText(attr(meta, "http-equiv") ?? "").toLowerCase();
    const content = cleanContentText(attr(meta, "content") ?? "");
    if (!content || !isHttpPolicyHeader(httpEquiv)) continue;
    add({
      name: httpEquiv,
      value: content,
      source: "meta",
      selector: `meta[http-equiv="${cssAttributeValue(httpEquiv)}"]:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 10);
}

function isHttpPolicyHeader(name: string): boolean {
  return /^(content-security-policy|permissions-policy|referrer-policy|strict-transport-security|x-content-type-options|x-frame-options|x-robots-tag|cross-origin-embedder-policy|cross-origin-opener-policy|cross-origin-resource-policy|cache-control)$/i.test(name);
}

function httpPolicyName(name: string): string {
  return cleanLinkText(name.toLowerCase()).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function schemaFactText(types: string[], facts: PageSchemaFact[]): string {
  const prefix = types.length > 0 ? `Types: ${types.join(", ")}` : "Types: unknown";
  return cleanContentText([prefix, ...facts.map((fact) => `${fact.label}: ${fact.value}`)].join(" ; "));
}

function summarizeOffers(html: string, baseUrl: string): PageOfferSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageOfferSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageOfferSummary, "id" | "path" | "rank" | "text" | "source">): void => {
    const text = offerText(item);
    if (!isUsefulOffer(item, text)) return;
    const key = [
      item.name ?? "",
      item.price ?? "",
      item.currency ?? "",
      item.availability ?? "",
      item.url ?? "",
      item.rating ?? "",
      item.reviewCount ?? "",
    ].join("\n").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `of${rank}`,
      path: `pageCheck.offers[${rank - 1}]`,
      rank,
      ...item,
      text,
      source: "json-ld",
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const offer of offersFromJsonLd(value, baseUrl)) {
        add({
          ...offer,
          selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
        });
      }
    }
  }

  return items.slice(0, 6);
}

function offersFromJsonLd(value: Record<string, unknown>, baseUrl: string): Array<Omit<PageOfferSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const types = jsonLdStringArray(value["@type"]).map((type) => type.toLowerCase());
  const productContext = {
    name: jsonLdString(value.name) || jsonLdString(value.headline),
    brand: schemaNamedValue(value.brand),
    sku: jsonLdString(value.sku),
    rating: schemaRatingValue(value.aggregateRating),
    reviewCount: schemaReviewCount(value.aggregateRating),
  };
  const offerObjects = schemaObjectArray(value.offers);
  if (offerObjects.length > 0) {
    return offerObjects
      .slice(0, 4)
      .map((offer) => offerSummaryFromJsonLd(offer, productContext, baseUrl))
      .filter((offer): offer is Omit<PageOfferSummary, "id" | "path" | "rank" | "text" | "source" | "selector"> => Boolean(offer));
  }
  if (types.some((type) => /^(offer|aggregateoffer)$/.test(type))) {
    const offer = offerSummaryFromJsonLd(value, productContext, baseUrl);
    return offer ? [offer] : [];
  }
  return [];
}

function offerSummaryFromJsonLd(
  offer: Record<string, unknown>,
  context: { name: string; brand: string; sku: string; rating: string; reviewCount: string },
  baseUrl: string,
): Omit<PageOfferSummary, "id" | "path" | "rank" | "text" | "source" | "selector"> | undefined {
  const price = offerPriceValue(offer);
  const currency = jsonLdString(offer.priceCurrency);
  const availability = schemaAvailability(offer.availability);
  const rawUrl = jsonLdString(offer.url) || jsonLdString(offer["@id"]);
  const url = rawUrl ? normalizeHref(rawUrl, baseUrl) ?? "" : "";
  const name = jsonLdString(offer.name) || context.name;
  const rating = context.rating || schemaRatingValue(offer.aggregateRating);
  const reviewCount = context.reviewCount || schemaReviewCount(offer.aggregateRating);
  const summary = {
    ...(name ? { name } : {}),
    ...(price ? { price } : {}),
    ...(currency ? { currency } : {}),
    ...(availability ? { availability } : {}),
    ...(url ? { url } : {}),
    ...(context.brand ? { brand: context.brand } : {}),
    ...(context.sku ? { sku: context.sku } : {}),
    ...(rating ? { rating } : {}),
    ...(reviewCount ? { reviewCount } : {}),
  };
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function offerPriceValue(offer: Record<string, unknown>): string {
  const price = jsonLdString(offer.price);
  if (price) return price;
  const low = jsonLdString(offer.lowPrice);
  const high = jsonLdString(offer.highPrice);
  if (low && high) return `${low}-${high}`;
  return low || high;
}

function schemaRatingValue(value: unknown): string {
  const rating = schemaObjectArray(value)[0];
  if (!rating) return "";
  return [jsonLdString(rating.ratingValue), jsonLdString(rating.bestRating)].filter(Boolean).join(" / ");
}

function schemaReviewCount(value: unknown): string {
  const rating = schemaObjectArray(value)[0];
  return rating ? jsonLdString(rating.reviewCount) || jsonLdString(rating.ratingCount) : "";
}

function offerText(offer: Omit<PageOfferSummary, "id" | "path" | "rank" | "text" | "source">): string {
  const price = [offer.currency, offer.price].filter(Boolean).join(" ");
  return cleanContentText([
    offer.name ? `Name: ${offer.name}` : "",
    price ? `Price: ${price}` : "",
    offer.availability ? `Availability: ${offer.availability}` : "",
    offer.brand ? `Brand: ${offer.brand}` : "",
    offer.sku ? `SKU: ${offer.sku}` : "",
    offer.rating ? `Rating: ${offer.rating}` : "",
    offer.reviewCount ? `Review count: ${offer.reviewCount}` : "",
    offer.url ? `URL: ${offer.url}` : "",
    "source=json-ld",
  ].filter(Boolean).join(" ; "));
}

function isUsefulOffer(offer: Omit<PageOfferSummary, "id" | "path" | "rank" | "text" | "source">, text: string): boolean {
  if (!text || text.length > 800) return false;
  return Boolean(offer.price || offer.availability || offer.rating || offer.reviewCount || offer.url);
}

function summarizeIdentities(html: string, baseUrl: string): PageIdentitySummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageIdentitySummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageIdentitySummary, "id" | "path" | "rank" | "text">): void => {
    const name = cleanContentText(item.name).slice(0, 160);
    const url = item.url ? normalizeHref(item.url, baseUrl) ?? item.url : "";
    const logoUrl = item.logoUrl ? normalizeHref(item.logoUrl, baseUrl) ?? item.logoUrl : "";
    const sameAs = normalizeSameAsUrls(item.sameAs ?? [], baseUrl);
    const key = `${item.kind}\n${name}\n${url}\n${sameAs.join("\n")}`.toLowerCase();
    if (!isUsefulIdentity(name, url, sameAs) || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `id${rank}`,
      path: `pageCheck.identities[${rank - 1}]`,
      rank,
      ...item,
      name,
      ...(url ? { url } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(sameAs.length > 0 ? { sameAs } : {}),
      text: identityText(item.kind, name, url, logoUrl, sameAs, item.source),
    });
  };

  const siteName = firstMetaContent(document.children, "og:site_name") || firstMetaContent(document.children, "application-name");
  if (siteName) {
    add({
      kind: "website",
      name: siteName,
      source: "meta",
      url: baseUrl,
      selector: "meta[property=\"og:site_name\"], meta[name=\"application-name\"]",
    });
  }

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      const identity = identityFromJsonLd(value, baseUrl);
      if (!identity) continue;
      add({
        ...identity,
        source: "json-ld",
        selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
      });
    }
  }

  return items.slice(0, 6);
}

function identityFromJsonLd(value: Record<string, unknown>, baseUrl: string): Omit<PageIdentitySummary, "id" | "path" | "rank" | "text" | "source" | "selector"> | undefined {
  const types = jsonLdStringArray(value["@type"]);
  const kind = identityKind(types);
  if (!kind) return undefined;
  const name = jsonLdString(value.name) || jsonLdString(value.headline) || jsonLdString(value.legalName);
  const rawUrl = jsonLdString(value.url) || jsonLdString(value["@id"]);
  const url = rawUrl ? normalizeHref(rawUrl, baseUrl) ?? rawUrl : "";
  const logoUrl = schemaImageUrl(value.logo, baseUrl);
  const sameAs = normalizeSameAsUrls(jsonLdStringArray(value.sameAs), baseUrl);
  return {
    kind,
    name,
    ...(url ? { url } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

function identityKind(types: string[]): PageIdentitySummary["kind"] | undefined {
  const normalized = types.map((type) => type.toLowerCase());
  if (normalized.some((type) => /organization|corporation|localbusiness|governmentorganization|newsmediaorganization|educationalorganization/.test(type))) return "organization";
  if (normalized.some((type) => type === "website" || type === "webpage")) return "website";
  if (normalized.some((type) => type === "person")) return "person";
  if (normalized.some((type) => type === "brand")) return "brand";
  if (normalized.some((type) => type === "thing")) return "thing";
  return undefined;
}

function schemaImageUrl(value: unknown, baseUrl: string): string {
  const raw = typeof value === "string"
    ? value
    : schemaObjectArray(value).map((item) => jsonLdString(item.url) || jsonLdString(item.contentUrl) || jsonLdString(item["@id"])).find(Boolean) ?? "";
  return raw ? normalizeHref(raw, baseUrl) ?? raw : "";
}

function normalizeSameAsUrls(values: string[], baseUrl: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const url = normalizeHref(value, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= 6) break;
  }
  return urls;
}

function isUsefulIdentity(name: string, url: string, sameAs: string[]): boolean {
  if (!name || name.length > 160) return false;
  if (/^(home|menu|navigation|login|search|share)$/i.test(name)) return false;
  return Boolean(url || sameAs.length > 0);
}

function identityText(kind: PageIdentitySummary["kind"], name: string, url: string, logoUrl: string, sameAs: string[], source: PageIdentitySummary["source"]): string {
  return cleanContentText([
    `${kind}: ${name}`,
    url ? `url=${url}` : "",
    logoUrl ? `logo=${logoUrl}` : "",
    sameAs.length > 0 ? `sameAs=${sameAs.join("|")}` : "",
    `source=${source}`,
  ].filter(Boolean).join(" "));
}

function summarizeDatasets(html: string, baseUrl: string): PageDatasetSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageDatasetSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageDatasetSummary, "id" | "path" | "rank" | "text">): void => {
    const name = cleanContentText(item.name).slice(0, 180);
    const url = item.url ? normalizeHref(item.url, baseUrl) ?? item.url : "";
    const distributionUrls = normalizeDatasetUrls(item.distributionUrls ?? [], baseUrl);
    const licenseUrl = item.licenseUrl ? normalizeHref(item.licenseUrl, baseUrl) ?? item.licenseUrl : "";
    const encodingFormat = cleanLinkText(item.encodingFormat ?? "").slice(0, 80);
    const temporalCoverage = cleanContentText(item.temporalCoverage ?? "").slice(0, 120);
    const spatialCoverage = cleanContentText(item.spatialCoverage ?? "").slice(0, 120);
    const creator = cleanContentText(item.creator ?? "").slice(0, 120);
    const key = `${item.kind}\n${name}\n${url}\n${distributionUrls.join("\n")}`.toLowerCase();
    if (!isUsefulDataset(name, url, distributionUrls, encodingFormat) || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `ds${rank}`,
      path: `pageCheck.datasets[${rank - 1}]`,
      rank,
      kind: item.kind,
      name,
      source: item.source,
      ...(url ? { url } : {}),
      ...(distributionUrls.length > 0 ? { distributionUrls } : {}),
      ...(encodingFormat ? { encodingFormat } : {}),
      ...(licenseUrl ? { licenseUrl } : {}),
      ...(temporalCoverage ? { temporalCoverage } : {}),
      ...(spatialCoverage ? { spatialCoverage } : {}),
      ...(creator ? { creator } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
      text: datasetText(item.kind, name, url, distributionUrls, encodingFormat, licenseUrl, temporalCoverage, spatialCoverage, creator, item.source),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const dataset of datasetsFromJsonLd(value, baseUrl)) {
        add({
          ...dataset,
          source: "json-ld",
          selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
        });
      }
    }
  }

  for (const [index, anchor] of findElements(document.children, (item) => item.name === "a").entries()) {
    const href = attr(anchor, "href");
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url || !isDatasetDownloadUrl(url)) continue;
    const name = cleanContentText(descendantText(anchor) || attr(anchor, "title") || attr(anchor, "aria-label") || resourceTitleFromUrl(url));
    const type = cleanLinkText(attr(anchor, "type") || datasetMimeHint(url));
    add({
      kind: "dataDownload",
      name,
      source: "link",
      url,
      distributionUrls: [url],
      encodingFormat: type || datasetExtension(url).toUpperCase(),
      selector: `a:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function datasetsFromJsonLd(value: Record<string, unknown>, baseUrl: string): Array<Omit<PageDatasetSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const types = jsonLdStringArray(value["@type"]).map((type) => type.toLowerCase());
  const kind = datasetKind(types);
  const items: Array<Omit<PageDatasetSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> = [];
  if (kind) {
    const name = jsonLdString(value.name) || jsonLdString(value.headline) || resourceTitleFromUrl(jsonLdString(value.url) || jsonLdString(value["@id"]));
    const rawUrl = jsonLdString(value.url) || jsonLdString(value["@id"]);
    const distributionUrls = datasetDistributionUrls(value, baseUrl);
    items.push({
      kind,
      name,
      ...(rawUrl ? { url: normalizeHref(rawUrl, baseUrl) ?? rawUrl } : {}),
      ...(distributionUrls.length > 0 ? { distributionUrls } : {}),
      ...(datasetEncodingFormat(value) ? { encodingFormat: datasetEncodingFormat(value) } : {}),
      ...(schemaLicenseUrl(value.license, baseUrl) ? { licenseUrl: schemaLicenseUrl(value.license, baseUrl) } : {}),
      ...(jsonLdString(value.temporalCoverage) ? { temporalCoverage: jsonLdString(value.temporalCoverage) } : {}),
      ...(schemaNamedValue(value.spatialCoverage) ? { spatialCoverage: schemaNamedValue(value.spatialCoverage) } : {}),
      ...(schemaNamedValue(value.creator ?? value.author ?? value.publisher) ? { creator: schemaNamedValue(value.creator ?? value.author ?? value.publisher) } : {}),
    });
  }
  if (types.includes("datacatalog")) {
    for (const dataset of schemaObjectArray(value.dataset).slice(0, 4)) {
      const name = jsonLdString(dataset.name) || jsonLdString(dataset.headline);
      const rawUrl = jsonLdString(dataset.url) || jsonLdString(dataset["@id"]);
      const distributionUrls = datasetDistributionUrls(dataset, baseUrl);
      items.push({
        kind: "dataset",
        name,
        ...(rawUrl ? { url: normalizeHref(rawUrl, baseUrl) ?? rawUrl } : {}),
        ...(distributionUrls.length > 0 ? { distributionUrls } : {}),
        ...(datasetEncodingFormat(dataset) ? { encodingFormat: datasetEncodingFormat(dataset) } : {}),
        ...(schemaLicenseUrl(dataset.license ?? value.license, baseUrl) ? { licenseUrl: schemaLicenseUrl(dataset.license ?? value.license, baseUrl) } : {}),
        ...(schemaNamedValue(dataset.creator ?? dataset.author ?? value.creator ?? value.publisher) ? { creator: schemaNamedValue(dataset.creator ?? dataset.author ?? value.creator ?? value.publisher) } : {}),
      });
    }
  }
  return items;
}

function datasetKind(types: string[]): PageDatasetSummary["kind"] | undefined {
  if (types.includes("dataset")) return "dataset";
  if (types.includes("datacatalog")) return "dataCatalog";
  if (types.includes("datadownload")) return "dataDownload";
  return undefined;
}

function datasetDistributionUrls(value: Record<string, unknown>, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const raw of jsonLdStringArray(value.contentUrl)) urls.push(raw);
  for (const distribution of schemaObjectArray(value.distribution).slice(0, 6)) {
    const raw = jsonLdString(distribution.contentUrl) || jsonLdString(distribution.url) || jsonLdString(distribution["@id"]);
    if (raw) urls.push(raw);
  }
  return normalizeDatasetUrls(urls, baseUrl);
}

function normalizeDatasetUrls(values: string[], baseUrl: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const url = normalizeHref(value, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= 6) break;
  }
  return urls;
}

function datasetEncodingFormat(value: Record<string, unknown>): string {
  return jsonLdString(value.encodingFormat) || jsonLdString(value.fileFormat) || (schemaObjectArray(value.distribution).map((item) => jsonLdString(item.encodingFormat) || jsonLdString(item.fileFormat)).find(Boolean) ?? "");
}

function schemaLicenseUrl(value: unknown, baseUrl: string): string {
  const raw = typeof value === "string" ? value : schemaObjectArray(value).map((item) => jsonLdString(item.url) || jsonLdString(item["@id"]) || jsonLdString(item.name)).find(Boolean) ?? "";
  return raw ? normalizeHref(raw, baseUrl) ?? raw : "";
}

function isDatasetDownloadUrl(url: string): boolean {
  return ["csv", "tsv", "parquet", "geojson", "jsonl", "ndjson"].includes(datasetExtension(url));
}

function datasetExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.match(/\.([a-z0-9]{2,8})$/)?.[1] ?? "";
  } catch {
    return "";
  }
}

function datasetMimeHint(url: string): string {
  const extension = datasetExtension(url);
  const byExtension: Record<string, string> = {
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    parquet: "application/vnd.apache.parquet",
    geojson: "application/geo+json",
    jsonl: "application/x-ndjson",
    ndjson: "application/x-ndjson",
  };
  return byExtension[extension] ?? "";
}

function isUsefulDataset(name: string, url: string, distributionUrls: string[], encodingFormat: string): boolean {
  if (!name || name.length > 180) return false;
  if (/^(download|view|open|click here|more|data)$/i.test(name) && distributionUrls.length === 0) return false;
  return Boolean(url || distributionUrls.length > 0 || encodingFormat);
}

function datasetText(kind: PageDatasetSummary["kind"], name: string, url: string, distributionUrls: string[], encodingFormat: string, licenseUrl: string, temporalCoverage: string, spatialCoverage: string, creator: string, source: PageDatasetSummary["source"]): string {
  return cleanContentText([
    `${kind}: ${name}`,
    url ? `url=${url}` : "",
    distributionUrls.length > 0 ? `distributions=${distributionUrls.join("|")}` : "",
    encodingFormat ? `format=${encodingFormat}` : "",
    licenseUrl ? `license=${licenseUrl}` : "",
    temporalCoverage ? `temporal=${temporalCoverage}` : "",
    spatialCoverage ? `spatial=${spatialCoverage}` : "",
    creator ? `creator=${creator}` : "",
    `source=${source}`,
  ].filter(Boolean).join(" "));
}

function summarizeTimeline(html: string, page: PageSummary): PageTimelineSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageTimelineSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageTimelineSummary, "id" | "path" | "rank" | "text">): void => {
    const value = cleanContentText(item.value);
    const label = cleanContentText(item.label);
    if (!isUsefulTimelineValue(label, value)) return;
    const key = `${item.kind}\n${value}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `tl${rank}`,
      path: `pageCheck.timeline[${rank - 1}]`,
      rank,
      ...item,
      label,
      value,
      text: timelineText(label, value, item.source),
    });
  };

  if (page.publishedTime) add({ kind: "published", label: "Published", value: page.publishedTime, source: "page" });
  if (page.modifiedTime) add({ kind: "modified", label: "Modified", value: page.modifiedTime, source: "page" });

  for (const [index, meta] of findElements(document.children, (item) => item.name === "meta").entries()) {
    const name = attr(meta, "name") || attr(meta, "property") || attr(meta, "itemprop") || "";
    const value = cleanContentText(attr(meta, "content") ?? "");
    const kind = timelineKindFromName(name);
    if (!kind || !value) continue;
    add({
      kind,
      label: timelineLabel(kind, name),
      value,
      source: "meta",
      selector: `meta:nth-of-type(${index + 1})`,
    });
  }

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const item of timelineItemsFromJsonLd(value)) {
        add({
          ...item,
          source: "json-ld",
          selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
        });
      }
    }
  }

  for (const [index, time] of findElements(document.children, (item) => item.name === "time").entries()) {
    const rawValue = cleanContentText(attr(time, "datetime") || descendantText(time));
    const labelSource = attr(time, "itemprop") || attr(time, "class") || attr(time, "aria-label") || descendantText(time);
    const kind = timelineKindFromName(labelSource) ?? "date";
    add({
      kind,
      label: timelineLabel(kind, labelSource),
      value: rawValue,
      source: "time",
      selector: `time:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function timelineItemsFromJsonLd(value: Record<string, unknown>): Array<{ kind: PageTimelineSummary["kind"]; label: string; value: string }> {
  const fields: Array<[PageTimelineSummary["kind"], string, unknown]> = [
    ["published", "Published", value.datePublished],
    ["created", "Created", value.dateCreated],
    ["modified", "Modified", value.dateModified],
    ["updated", "Updated", value.dateUpdated],
    ["date", "Posted", value.datePosted],
    ["date", "Uploaded", value.uploadDate],
    ["start", "Start date", value.startDate],
    ["end", "End date", value.endDate],
    ["date", "Date", value.date],
  ];
  return fields
    .map(([kind, label, raw]) => {
      const valueText = jsonLdString(raw);
      return valueText ? { kind, label, value: valueText } : undefined;
    })
    .filter((item): item is { kind: PageTimelineSummary["kind"]; label: string; value: string } => Boolean(item));
}

function timelineKindFromName(name: string): PageTimelineSummary["kind"] | undefined {
  const value = name.toLowerCase();
  if (/published|publishdate|pubdate|issued|release|datepublished/.test(value)) return "published";
  if (/modified|updated|revised|last[-_\s]?modified|datemodified|update/.test(value)) return "modified";
  if (/created|datecreated/.test(value)) return "created";
  if (/start|startdate|validfrom/.test(value)) return "start";
  if (/end|enddate|validthrough|expires|expiration/.test(value)) return "end";
  if (/\bdate\b|dc\.date|dcterms\.date|dateposted|uploaddate/.test(value)) return "date";
  return undefined;
}

function timelineLabel(kind: PageTimelineSummary["kind"], sourceName: string): string {
  const explicit = cleanContentText(sourceName.replace(/[_-]+/g, " "));
  const byKind: Record<PageTimelineSummary["kind"], string> = {
    published: "Published",
    modified: "Modified",
    created: "Created",
    updated: "Updated",
    start: "Start date",
    end: "End date",
    date: "Date",
  };
  if (!explicit || explicit.length > 48 || /^(date|time)$/i.test(explicit)) return byKind[kind];
  return explicit;
}

function isUsefulTimelineValue(label: string, value: string): boolean {
  if (!label || !value || value.length > 160) return false;
  if (/^(date|time|published|modified|updated|created)$/i.test(value)) return false;
  return /\d{4}|\d{1,2}[./-]\d{1,2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value);
}

function timelineText(label: string, value: string, source: PageTimelineSummary["source"]): string {
  return cleanContentText(`${label}: ${value} source=${source}`);
}

function summarizeContactPoints(html: string, baseUrl: string): PageContactPointSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageContactPointSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageContactPointSummary, "id" | "path" | "rank" | "text">): void => {
    const value = cleanContentText(item.value);
    const label = cleanContentText(item.label) || contactLabel(item.kind);
    const url = item.url ? cleanLinkText(item.url) : "";
    if (!isUsefulContactPoint(item.kind, value, url)) return;
    const key = `${item.kind}\n${value}\n${url}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `cp${rank}`,
      path: `pageCheck.contactPoints[${rank - 1}]`,
      rank,
      ...item,
      label,
      value,
      ...(url ? { url } : {}),
      text: contactPointText(item.kind, label, value, url, item.source),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const item of contactPointsFromJsonLd(value, baseUrl)) {
        add({
          ...item,
          source: "json-ld",
          selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
        });
      }
    }
  }

  for (const [index, anchor] of findElements(document.children, (item) => item.name === "a").entries()) {
    const href = cleanLinkText(attr(anchor, "href") ?? "");
    const label = cleanContentText(descendantText(anchor) || attr(anchor, "title") || attr(anchor, "aria-label") || "");
    if (/^mailto:/i.test(href)) {
      const value = mailtoValue(href);
      add({
        kind: "email",
        label: contactAnchorLabel(label, "Email"),
        value,
        source: "link",
        url: `mailto:${value}`,
        selector: `a:nth-of-type(${index + 1})`,
      });
      continue;
    }
    if (/^tel:/i.test(href)) {
      const value = telValue(href);
      add({
        kind: "phone",
        label: contactAnchorLabel(label, "Phone"),
        value,
        source: "link",
        url: `tel:${value}`,
        selector: `a:nth-of-type(${index + 1})`,
      });
      continue;
    }
    if (isLikelyContactAnchor(anchor, href, label)) {
      const url = normalizeHref(href, baseUrl);
      if (!url) continue;
      add({
        kind: "contact-url",
        label: contactAnchorLabel(label, "Contact"),
        value: label || resourceTitleFromUrl(url) || url,
        source: "html",
        url,
        selector: `a:nth-of-type(${index + 1})`,
      });
    }
  }

  for (const [index, address] of findElements(document.children, (item) => item.name === "address").entries()) {
    const value = cleanContentText(descendantText(address));
    add({
      kind: "address",
      label: "Address",
      value,
      source: "html",
      selector: `address:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function contactPointsFromJsonLd(value: Record<string, unknown>, baseUrl: string): Array<Omit<PageContactPointSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> {
  const items: Array<Omit<PageContactPointSummary, "id" | "path" | "rank" | "text" | "source" | "selector">> = [];
  const add = (kind: PageContactPointSummary["kind"], label: string, raw: unknown, rawUrl?: unknown): void => {
    const rawText = kind === "address" ? schemaAddressValue(raw) : jsonLdString(raw);
    const urlText = jsonLdString(rawUrl);
    const url = kind === "contact-url"
      ? contactUrl(rawText || urlText, baseUrl)
      : urlText ? contactUrl(urlText, baseUrl) : "";
    const valueText = kind === "contact-url" ? url || rawText : rawText;
    if (valueText || url) items.push({ kind, label, value: valueText || url, ...(url ? { url } : {}) });
  };

  add("email", "Email", value.email);
  add("phone", "Phone", value.telephone);
  add("address", "Address", value.address);
  add("contact-url", "Contact URL", value.contactUrl);
  for (const contactPoint of schemaObjectArray(value.contactPoint).slice(0, 4)) {
    const label = jsonLdString(contactPoint.contactType) || jsonLdString(contactPoint.name) || "Contact";
    add("email", label, contactPoint.email);
    add("phone", label, contactPoint.telephone);
    add("contact-url", label, contactPoint.url);
    add("address", label, contactPoint.address);
  }
  return items;
}

function schemaAddressValue(raw: unknown): string {
  if (typeof raw === "string") return cleanContentText(raw);
  if (Array.isArray(raw)) return raw.map(schemaAddressValue).filter(Boolean).join(" ; ");
  if (!raw || typeof raw !== "object") return "";
  const value = raw as Record<string, unknown>;
  return cleanContentText([
    jsonLdString(value.streetAddress),
    jsonLdString(value.addressLocality),
    jsonLdString(value.addressRegion),
    jsonLdString(value.postalCode),
    jsonLdString(value.addressCountry),
  ].filter(Boolean).join(", "));
}

function contactUrl(raw: string, baseUrl: string): string {
  if (!raw.trim()) return "";
  if (/^mailto:/i.test(raw)) return `mailto:${mailtoValue(raw)}`;
  if (/^tel:/i.test(raw)) return `tel:${telValue(raw)}`;
  return normalizeHref(raw, baseUrl) ?? "";
}

function mailtoValue(href: string): string {
  return decodeURIComponent(href.replace(/^mailto:/i, "").split(/[?#]/)[0] ?? "").trim();
}

function telValue(href: string): string {
  return decodeURIComponent(href.replace(/^tel:/i, "").split(/[?#]/)[0] ?? "").replace(/\s+/g, "").trim();
}

function contactAnchorLabel(label: string, fallback: string): string {
  const cleaned = cleanContentText(label);
  if (!cleaned || /^[+()0-9.\-\s]+$/.test(cleaned) || /^[^@\s]+@[^@\s]+$/.test(cleaned)) return fallback;
  return cleaned.slice(0, 80);
}

function isLikelyContactAnchor(anchor: Element, href: string, label: string): boolean {
  if (!href || /^#|^javascript:/i.test(href)) return false;
  const marker = [
    label,
    href,
    attr(anchor, "rel") ?? "",
    attr(anchor, "class") ?? "",
    attr(anchor, "aria-label") ?? "",
  ].join(" ").toLowerCase();
  if (/(contact|support|help[-_\s]?desk|customer[-_\s]?service|sales|press|media[-_\s]?inquiries|문의|고객센터|지원|연락처)/.test(marker)) {
    return !/(unsubscribe|share|privacy|terms|cookie|login|signup|advertis)/.test(marker);
  }
  return false;
}

function isUsefulContactPoint(kind: PageContactPointSummary["kind"], value: string, url: string): boolean {
  if (!value || value.length > 260) return false;
  if (kind === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  if (kind === "phone") return value.replace(/\D/g, "").length >= 7;
  if (kind === "address") return value.length >= 12 && !/^(address|location|contact)$/i.test(value);
  if (kind === "contact-url") return /^https?:\/\//i.test(url || value) && value.length <= 120;
  return false;
}

function contactLabel(kind: PageContactPointSummary["kind"]): string {
  if (kind === "contact-url") return "Contact URL";
  return kind[0]?.toUpperCase() + kind.slice(1);
}

function contactPointText(kind: PageContactPointSummary["kind"], label: string, value: string, url: string, source: PageContactPointSummary["source"]): string {
  return cleanContentText([`${label}:`, kind, value, url, `source=${source}`].filter(Boolean).join(" "));
}

function summarizeFaqs(html: string): PageFaqSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageFaqSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageFaqSummary, "id" | "path" | "rank" | "text">): void => {
    if (isLowValueFaq(item.question, item.answer)) return;
    const key = `${item.question}\n${item.answer}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `faq${rank}`,
      path: `pageCheck.faqs[${rank - 1}]`,
      rank,
      ...item,
      text: faqText(item.question, item.answer),
    });
  };

  for (const [index, details] of findElements(document.children, (item) => item.name === "details").entries()) {
    const summary = findElement(details.children, (item) => item.name === "summary");
    if (!summary) continue;
    const question = cleanContentText(descendantText(summary));
    const answer = cleanContentText(details.children
      .filter((child) => child !== summary)
      .map((child) => child instanceof DomElement ? descendantText(child) : child.type === "text" ? child.data : "")
      .join(" "));
    add({
      question,
      answer,
      source: "details",
      selector: `details:nth-of-type(${index + 1})`,
    });
  }

  for (const [containerIndex, container] of findElements(document.children, isLikelyFaqContainer).entries()) {
    for (const pair of faqPairsFromContainer(container).slice(0, 6)) {
      add({
        ...pair,
        source: "html",
        selector: `${container.name}:nth-of-type(${containerIndex + 1})`,
      });
    }
  }
  return items.slice(0, 8);
}

function isLikelyFaqContainer(element: Element): boolean {
  if (!["section", "div", "article", "ul", "ol"].includes(element.name)) return false;
  const marker = [
    attr(element, "class") ?? "",
    attr(element, "id") ?? "",
    attr(element, "aria-label") ?? "",
    headingTextInElement(element),
  ].join(" ").toLowerCase();
  return /faq|frequently asked|q[&-]?a|questions?|answers?|자주 묻|질문/.test(marker);
}

function faqPairsFromContainer(container: Element): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  for (const item of directElementChildren(container)) {
    const question = faqQuestionFromElement(item);
    if (!question) continue;
    const answer = faqAnswerFromElement(item, question);
    if (answer) pairs.push({ question, answer });
  }
  if (pairs.length > 0) return pairs;
  const headings = findElements(container.children, (item) => /^h[2-6]$/.test(item.name) || /question|faq-question|accordion/i.test(`${attr(item, "class") ?? ""} ${attr(item, "role") ?? ""}`));
  for (const heading of headings) {
    const question = cleanContentText(descendantText(heading));
    const answer = cleanContentText(nextSiblingText(heading));
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}

function directElementChildren(element: Element): Element[] {
  return element.children.filter((child): child is Element => child instanceof DomElement);
}

function faqQuestionFromElement(element: Element): string {
  if (element.name === "details") return "";
  const questionElement = findElement(element.children, (item) => /^h[2-6]$/.test(item.name) || item.name === "summary" || /question|faq-question|accordion-title/i.test(attr(item, "class") ?? ""));
  return questionElement ? cleanContentText(descendantText(questionElement)) : "";
}

function faqAnswerFromElement(element: Element, question: string): string {
  const answerElement = findElement(element.children, (item) => /answer|faq-answer|accordion-content|panel/i.test(`${attr(item, "class") ?? ""} ${attr(item, "role") ?? ""}`));
  const raw = answerElement ? descendantText(answerElement) : descendantText(element);
  return cleanContentText(raw.replace(question, ""));
}

function nextSiblingText(element: Element): string {
  const parent = element.parent;
  if (!parent || !(parent instanceof DomElement)) return "";
  const siblings = directElementChildren(parent);
  const index = siblings.indexOf(element);
  if (index < 0) return "";
  const next = siblings.slice(index + 1).find((item) => !/^h[1-6]$/.test(item.name));
  return next ? descendantText(next) : "";
}

function faqText(question: string, answer: string): string {
  return cleanContentText(`Q: ${question} A: ${answer}`);
}

function isLowValueFaq(question: string, answer: string): boolean {
  if (question.length < 6 || question.length > 180) return true;
  if (answer.length < 8 || answer.length > 500) return true;
  if (question.toLowerCase() === answer.toLowerCase()) return true;
  return /^(menu|navigation|login|search|share|privacy|terms|cookie)$/i.test(question);
}

function summarizeBreadcrumbs(html: string, baseUrl: string): PageBreadcrumbSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: Array<Omit<PageBreadcrumbSummary, "id" | "path" | "rank">> = [];
  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      if (!jsonLdStringArray(value["@type"]).some((type) => type.toLowerCase() === "breadcrumblist")) continue;
      const breadcrumbs = breadcrumbItemsFromJsonLd(value.itemListElement, baseUrl);
      const text = breadcrumbText(breadcrumbs);
      if (breadcrumbs.length < 2 || !text) continue;
      items.push({
        source: "json-ld",
        items: breadcrumbs,
        text,
        selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
      });
    }
  }
  for (const [index, element] of findElements(document.children, isLikelyBreadcrumbContainer).entries()) {
    const breadcrumbs = breadcrumbItemsFromHtml(element, baseUrl);
    const text = breadcrumbText(breadcrumbs);
    if (breadcrumbs.length < 2 || !text) continue;
    items.push({
      source: "html",
      items: breadcrumbs,
      text,
      selector: `${element.name}:nth-of-type(${index + 1})`,
    });
  }

  const seen = new Set<string>();
  const summaries: PageBreadcrumbSummary[] = [];
  for (const item of items) {
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rank = summaries.length + 1;
    summaries.push({
      id: `bc${rank}`,
      path: `pageCheck.breadcrumbs[${rank - 1}]`,
      rank,
      ...item,
    });
    if (summaries.length >= 4) break;
  }
  return summaries;
}

function breadcrumbItemsFromJsonLd(value: unknown, baseUrl: string): PageBreadcrumbItem[] {
  return schemaObjectArray(value)
    .map((item, index) => {
      const position = Number(item.position);
      const itemValue = item.item;
      const itemObject = itemValue && typeof itemValue === "object" && !Array.isArray(itemValue) ? itemValue as Record<string, unknown> : undefined;
      const rawUrl = typeof itemValue === "string"
        ? itemValue
        : jsonLdString(itemObject?.url) || jsonLdString(itemObject?.["@id"]);
      const label = jsonLdString(item.name) || jsonLdString(itemObject?.name) || jsonLdString(itemObject?.headline);
      const url = rawUrl ? normalizeHref(rawUrl, baseUrl) : null;
      return {
        label,
        ...(url ? { url } : {}),
        ...(Number.isFinite(position) ? { position } : { position: index + 1 }),
      };
    })
    .filter((item) => item.label)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .slice(0, 10);
}

function isLikelyBreadcrumbContainer(element: Element): boolean {
  const marker = [
    element.name,
    attr(element, "aria-label") ?? "",
    attr(element, "class") ?? "",
    attr(element, "id") ?? "",
    attr(element, "role") ?? "",
  ].join(" ").toLowerCase();
  if (/breadcrumb|breadcrumbs|crumb|현재\s*위치|현재위치|경로/.test(marker)) return true;
  return element.name === "nav" && /breadcrumb|breadcrumbs|현재\s*위치|현재위치|경로/.test(marker);
}

function breadcrumbItemsFromHtml(element: Element, baseUrl: string): PageBreadcrumbItem[] {
  const listItems = findElements(element.children, (item) => item.name === "li").slice(0, 10);
  const sourceItems = listItems.length > 0 ? listItems : findElements(element.children, (item) => item.name === "a").slice(0, 10);
  const breadcrumbs: PageBreadcrumbItem[] = [];
  for (const [index, item] of sourceItems.entries()) {
    const anchor = item.name === "a" ? item : findElement(item.children, (child) => child.name === "a");
    const label = cleanContentText(anchor ? descendantText(anchor) : descendantText(item));
    if (!label || isLowValueBreadcrumbLabel(label)) continue;
    const rawUrl = anchor ? attr(anchor, "href") : undefined;
    const url = rawUrl ? normalizeHref(rawUrl, baseUrl) : null;
    breadcrumbs.push({
      label,
      ...(url ? { url } : {}),
      position: index + 1,
    });
  }
  return breadcrumbs;
}

function breadcrumbText(items: PageBreadcrumbItem[]): string {
  return cleanContentText(items.map((item) => item.label).filter(Boolean).join(" > "));
}

function isLowValueBreadcrumbLabel(label: string): boolean {
  return label.length > 80 || /^(menu|navigation|breadcrumb|breadcrumbs|skip to content|메뉴|내비게이션)$/i.test(label);
}

function summarizeSections(html: string): PageSectionSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageSectionSummary[] = [];
  const seen = new Set<string>();
  const headings = findElements(document.children, (item) => /^h[1-3]$/.test(item.name));
  for (const heading of headings) {
    const headingText = cleanContentText(descendantText(heading));
    const level = headingLevel(heading);
    const excerpts = sectionExcerptsAfterHeading(heading);
    const text = cleanContentText([headingText, ...excerpts].join(" ; "));
    const key = text.toLowerCase();
    if (!isUsefulSectionSummary(headingText, excerpts, text) || seen.has(key)) continue;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `sec${rank}`,
      path: `pageCheck.sections[${rank - 1}]`,
      rank,
      heading: headingText,
      level,
      text,
      excerpts,
      selector: `${heading.name}:nth-of-type(${elementNthOfType(heading)})`,
    });
    if (items.length >= 6) break;
  }
  return items;
}

function sectionExcerptsAfterHeading(heading: Element): string[] {
  const parent = heading.parent instanceof DomElement ? heading.parent : undefined;
  if (!parent) return [];
  const siblings = directElementChildren(parent);
  const start = siblings.indexOf(heading);
  if (start < 0) return [];
  const level = headingLevel(heading);
  const excerpts: string[] = [];
  const seen = new Set<string>();
  for (const sibling of siblings.slice(start + 1)) {
    if (/^h[1-6]$/.test(sibling.name) && headingLevel(sibling) <= level) break;
    for (const text of sectionTextCandidates(sibling)) {
      const excerpt = cleanContentText(text).slice(0, 320);
      const key = excerpt.toLowerCase();
      if (excerpt.length < 24 || seen.has(key) || isLowValueSectionText(excerpt)) continue;
      seen.add(key);
      excerpts.push(excerpt);
      if (excerpts.length >= 3) return excerpts;
    }
  }
  return excerpts;
}

function sectionTextCandidates(element: Element): string[] {
  if (["p", "li", "blockquote"].includes(element.name)) return [descendantText(element)];
  if (element.name === "pre") return [codeElementText(element)];
  if (/^h[1-6]$/.test(element.name)) return [];
  const directChildren = directElementChildren(element);
  if (directChildren.some((child) => /^h[1-6]$/.test(child.name))) return [];
  const directUseful = directChildren
    .filter((child) => ["p", "li", "blockquote", "pre"].includes(child.name))
    .map((child) => child.name === "pre" ? codeElementText(child) : descendantText(child));
  if (directUseful.length > 0) return directUseful;
  if (["article", "section", "div", "main"].includes(element.name)) {
    return findElements(element.children, (item) => ["p", "li", "blockquote"].includes(item.name))
      .slice(0, 4)
      .map((item) => descendantText(item));
  }
  return [];
}

function headingLevel(element: Element): number {
  const match = /^h([1-6])$/.exec(element.name);
  return match?.[1] ? Number(match[1]) : 6;
}

function elementNthOfType(element: Element): number {
  const parent = element.parent instanceof DomElement ? element.parent : undefined;
  if (!parent) return 1;
  return directElementChildren(parent)
    .filter((child) => child.name === element.name)
    .indexOf(element) + 1;
}

function isUsefulSectionSummary(heading: string, excerpts: string[], text: string): boolean {
  if (!heading || isLowValueHeadingText(heading) || heading.length > 140) return false;
  if (excerpts.length === 0 || text.length < 48 || text.length > 1400) return false;
  return true;
}

function isLowValueSectionText(text: string): boolean {
  return /^(share|copy link|permalink|edit|back to top|login|sign in|advertisement|메뉴|로그인|광고)$/i.test(text);
}

function summarizePagination(html: string, baseUrl: string): PagePaginationSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PagePaginationSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PagePaginationSummary, "id" | "path" | "rank" | "text">): void => {
    const label = cleanContentText(item.label);
    const key = item.current || !item.url
      ? `${item.kind}\n${item.url ?? ""}\n${label}\n${item.current ? "current" : ""}`.toLowerCase()
      : `${item.kind}\n${item.url}`.toLowerCase();
    if (!isUsefulPaginationItem(item.kind, label, item.url, item.current) || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `pg${rank}`,
      path: `pageCheck.pagination[${rank - 1}]`,
      rank,
      ...item,
      label,
      text: paginationText(item.kind, label, item.url, item.current),
    });
  };

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = (attr(link, "rel") ?? "").toLowerCase().split(/\s+/);
    const kind = paginationKindFromRel(rel);
    if (!kind) continue;
    const href = attr(link, "href") ?? "";
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url) continue;
    add({
      kind,
      label: cleanContentText(attr(link, "title") || kind),
      source: "link",
      url,
      selector: `link[rel="${cssAttributeValue(rel.join(" "))}"]:nth-of-type(${index + 1})`,
    });
  }

  for (const [containerIndex, container] of findElements(document.children, isLikelyPaginationContainer).entries()) {
    const anchors = findElements(container.children, (item) => item.name === "a").slice(0, 16);
    for (const anchor of anchors) {
      const rawLabel = cleanContentText(descendantText(anchor) || attr(anchor, "aria-label") || attr(anchor, "title") || "");
      const rel = (attr(anchor, "rel") ?? "").toLowerCase().split(/\s+/);
      const kind = paginationKindFromRel(rel) ?? paginationKindFromText(rawLabel);
      if (!kind) continue;
      const href = attr(anchor, "href") ?? "";
      const url = href ? normalizeHref(href, baseUrl) : null;
      add({
        kind,
        label: rawLabel || kind,
        source: "html",
        ...(url ? { url } : {}),
        ...(attr(anchor, "aria-current") ? { current: true } : {}),
        selector: `${container.name}:nth-of-type(${containerIndex + 1}) a`,
      });
    }
    for (const [elementIndex, element] of findElements(container.children, (item) => attr(item, "aria-current") === "page" || hasClass(item, "current") || hasClass(item, "active")).entries()) {
      const label = cleanContentText(descendantText(element) || attr(element, "aria-label") || "");
      const anchor = element.name === "a" ? element : findElement(element.children, (item) => item.name === "a");
      const href = anchor ? attr(anchor, "href") ?? "" : "";
      const url = href ? normalizeHref(href, baseUrl) : null;
      add({
        kind: "page",
        label,
        source: "html",
        current: true,
        ...(url ? { url } : {}),
        selector: `${container.name}:nth-of-type(${containerIndex + 1}) [aria-current]:nth-of-type(${elementIndex + 1})`,
      });
    }
  }

  return items.slice(0, 8);
}

function isLikelyPaginationContainer(element: Element): boolean {
  if (!["nav", "div", "ul", "ol"].includes(element.name)) return false;
  const marker = [
    attr(element, "aria-label") ?? "",
    attr(element, "class") ?? "",
    attr(element, "id") ?? "",
    attr(element, "role") ?? "",
  ].join(" ").toLowerCase();
  return /pagination|pager|pages|page-nav|paginate|다음|이전|페이지|ページ|次へ|前へ/.test(marker);
}

function paginationKindFromRel(rel: string[]): PagePaginationSummary["kind"] | undefined {
  if (rel.includes("next")) return "next";
  if (rel.includes("prev") || rel.includes("previous")) return "prev";
  if (rel.includes("first")) return "first";
  if (rel.includes("last")) return "last";
  return undefined;
}

function paginationKindFromText(text: string): PagePaginationSummary["kind"] | undefined {
  const value = text.trim().toLowerCase();
  if (/^(next|next page|older|more|다음|다음 페이지|次へ|次のページ|下一页|下一頁|›|»|>)$/.test(value)) return "next";
  if (/^(prev|previous|previous page|newer|이전|이전 페이지|前へ|前のページ|上一页|上一頁|‹|«|<)$/.test(value)) return "prev";
  if (/^(first|first page|처음|最初|首页|首頁)$/.test(value)) return "first";
  if (/^(last|last page|끝|最後|末页|末頁)$/.test(value)) return "last";
  if (/^\d{1,4}$/.test(value)) return "page";
  return undefined;
}

function isUsefulPaginationItem(kind: PagePaginationSummary["kind"], label: string, url: string | undefined, current = false): boolean {
  if (!label || label.length > 80) return false;
  if (!url && !current) return false;
  return kind !== "page" || current || Boolean(url);
}

function paginationText(kind: PagePaginationSummary["kind"], label: string, url: string | undefined, current = false): string {
  return cleanContentText([kind, current ? "current" : "", label, url ?? ""].filter(Boolean).join(" "));
}

function summarizeToc(html: string, baseUrl: string): PageTocSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageTocSummary[] = [];
  const seen = new Set<string>();
  for (const [index, element] of findElements(document.children, isLikelyTocContainer).entries()) {
    const tocItems = tocItemsFromContainer(element, baseUrl);
    if (tocItems.length < 2) continue;
    const text = tocText(tocItems);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    const title = inferTocTitle(element);
    const rank = items.length + 1;
    items.push({
      id: `toc${rank}`,
      path: `pageCheck.toc[${rank - 1}]`,
      rank,
      items: tocItems,
      text,
      ...(title ? { title } : {}),
      selector: `${element.name}:nth-of-type(${index + 1})`,
    });
    if (items.length >= 4) break;
  }
  return items;
}

function isLikelyTocContainer(element: Element): boolean {
  if (!["nav", "aside", "section", "div"].includes(element.name)) return false;
  const marker = [
    attr(element, "aria-label") ?? "",
    attr(element, "aria-labelledby") ?? "",
    attr(element, "class") ?? "",
    attr(element, "id") ?? "",
    attr(element, "role") ?? "",
    headingTextInElement(element),
  ].join(" ").toLowerCase();
  return /table[-_\s]*of[-_\s]*contents|(?:^|\s)toc(?:\s|$)|on this page|in this article|contents|목차|이 문서|이 페이지/.test(marker);
}

function tocItemsFromContainer(element: Element, baseUrl: string): PageTocItem[] {
  const items: PageTocItem[] = [];
  const seen = new Set<string>();
  for (const anchor of findElements(element.children, (item) => item.name === "a").slice(0, 20)) {
    const label = cleanContentText(descendantText(anchor));
    if (!label || isLowValueTocLabel(label)) continue;
    const rawUrl = attr(anchor, "href") ?? "";
    const url = rawUrl ? normalizeHref(rawUrl, baseUrl) : null;
    const key = `${label}\n${url ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const level = inferTocItemLevel(anchor);
    items.push({
      label,
      ...(url ? { url } : {}),
      ...(level ? { level } : {}),
    });
  }
  return items.slice(0, 12);
}

function headingTextInElement(element: Element): string {
  const heading = findElement(element.children, (item) => /^h[1-6]$/.test(item.name));
  return heading ? cleanContentText(descendantText(heading)) : "";
}

function inferTocTitle(element: Element): string {
  return cleanContentText(attr(element, "aria-label") ?? "") || headingTextInElement(element);
}

function inferTocItemLevel(anchor: Element): number | undefined {
  const ariaLevel = Number(attr(anchor, "aria-level"));
  if (Number.isInteger(ariaLevel) && ariaLevel >= 1 && ariaLevel <= 6) return ariaLevel;
  const marker = `${attr(anchor, "class") ?? ""} ${attr(anchor, "data-level") ?? ""}`;
  const match = /(?:^|\D)([1-6])(?:\D|$)/.exec(marker);
  return match?.[1] ? Number(match[1]) : undefined;
}

function tocText(items: PageTocItem[]): string {
  return cleanContentText(items.map((item) => item.label).join(" ; "));
}

function isLowValueTocLabel(label: string): boolean {
  return label.length > 100 || /^(menu|navigation|home|top|back to top|skip to content|로그인|메뉴|홈)$/i.test(label);
}

function summarizeCodeBlocks(html: string): PageCodeBlockSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageCodeBlockSummary[] = [];
  const seen = new Set<string>();
  const codeElementsInPre = new Set<Element>();
  const add = (element: Element, source: PageCodeBlockSummary["source"], selector: string): void => {
    const rawText = codeElementText(element);
    const text = cleanCodeBlockText(rawText);
    if (!isLikelyUsefulCodeBlock(text)) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const language = inferCodeBlockLanguage(element);
    const rank = items.length + 1;
    items.push({
      id: `cb${rank}`,
      path: `pageCheck.codeBlocks[${rank - 1}]`,
      rank,
      text,
      lineCount: codeBlockLineCount(text),
      source,
      ...(language ? { language } : {}),
      ...(isCommandLikeCodeBlock(text, language) ? { commandLike: true } : {}),
      selector,
    });
  };

  for (const [index, pre] of findElements(document.children, (item) => item.name === "pre").entries()) {
    const code = findElement(pre.children, (item) => item.name === "code");
    if (code) codeElementsInPre.add(code);
    add(code ?? pre, "pre", `pre:nth-of-type(${index + 1})`);
  }
  for (const [index, code] of findElements(document.children, (item) => item.name === "code").entries()) {
    if (codeElementsInPre.has(code)) continue;
    add(code, "code", `code:nth-of-type(${index + 1})`);
  }
  return items.slice(0, 8);
}

function codeElementText(element: Element): string {
  let text = "";
  for (const child of element.children) {
    if (child.type === "text") {
      text += child.data;
    } else if (child instanceof DomElement) {
      text += codeElementText(child);
    }
  }
  return text;
}

function cleanCodeBlockText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim()
    .slice(0, 1200);
}

function inferCodeBlockLanguage(element: Element): string {
  const marker = [
    attr(element, "data-language") ?? "",
    attr(element, "lang") ?? "",
    attr(element, "class") ?? "",
  ].join(" ");
  const match = /(?:^|\s)(?:language|lang)-([a-z0-9_+#.-]+)/i.exec(marker)
    ?? /(?:^|\s)(?:highlight|brush):([a-z0-9_+#.-]+)/i.exec(marker);
  return cleanContentText(match?.[1] ?? "").toLowerCase();
}

function isLikelyUsefulCodeBlock(text: string): boolean {
  if (text.length < 12 || text.length > 1200) return false;
  if (codeBlockLineCount(text) >= 2) return true;
  return /(?:^|\s)(?:npm|pnpm|yarn|npx|pip|curl|git|docker|kubectl|brew|apt|get|post|put|delete)\s+\S+/i.test(text)
    || /[{}();=<>]|--[a-z0-9-]+/i.test(text);
}

function codeBlockLineCount(text: string): number {
  return text ? text.split("\n").length : 0;
}

function isCommandLikeCodeBlock(text: string, language: string): boolean {
  if (/^(bash|sh|shell|console|terminal|powershell|ps1|zsh|fish)$/.test(language)) return true;
  return /^(?:\$|>|#)\s*\S+/m.test(text)
    || /(?:^|\n)\s*(?:npm|pnpm|yarn|npx|pip|curl|git|docker|kubectl|brew|apt)\s+\S+/i.test(text);
}

function summarizeCitations(html: string, baseUrl: string): PageCitationSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageCitationSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageCitationSummary, "id" | "path" | "rank">): void => {
    const text = cleanContentText(item.text);
    if (!isLikelyUsefulCitation(text)) return;
    const key = `${item.source}\n${text}\n${item.url ?? ""}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `ct${rank}`,
      path: `pageCheck.citations[${rank - 1}]`,
      rank,
      ...item,
      text,
    });
  };

  for (const [index, blockquote] of findElements(document.children, (item) => item.name === "blockquote").entries()) {
    const quote = cleanContentText(descendantText(blockquote)).slice(0, 500);
    const rawUrl = attr(blockquote, "cite") ?? "";
    const url = rawUrl ? normalizeHref(rawUrl, baseUrl) : null;
    const cite = findElement(blockquote.children, (item) => item.name === "cite");
    const title = cite ? cleanContentText(descendantText(cite)) : "";
    add({
      source: "blockquote",
      text: citationText("Quote", quote, title, url ?? ""),
      ...(quote ? { quote } : {}),
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
      selector: `blockquote:nth-of-type(${index + 1})`,
    });
  }

  for (const [index, cite] of findElements(document.children, (item) => item.name === "cite").entries()) {
    const title = cleanContentText(descendantText(cite)).slice(0, 300);
    const url = firstCitationUrl(cite, baseUrl);
    add({
      source: "cite",
      text: citationText("Citation", "", title, url ?? ""),
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
      selector: `cite:nth-of-type(${index + 1})`,
    });
  }

  for (const [index, item] of findElements(document.children, (element) => element.name === "li" && isLikelyReferenceItem(element)).entries()) {
    const body = cleanContentText(descendantText(item)).slice(0, 500);
    const url = firstCitationUrl(item, baseUrl);
    add({
      source: isFootnoteItem(item) ? "footnote" : "reference",
      text: citationText(isFootnoteItem(item) ? "Footnote" : "Reference", body, "", url ?? ""),
      ...(body ? { quote: body } : {}),
      ...(url ? { url } : {}),
      selector: `li:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function citationText(label: string, body: string, title: string, url: string): string {
  return cleanContentText([`${label}: ${body || title}`, title && body ? title : "", url].filter(Boolean).join(" - "));
}

function firstCitationUrl(element: Element, baseUrl: string): string | null {
  const anchor = findElements(element.children, (item) => item.name === "a")
    .find((item) => {
      const href = attr(item, "href") ?? "";
      return href && !href.startsWith("#") && !/^javascript:/i.test(href);
    });
  const href = anchor ? attr(anchor, "href") : "";
  return href ? normalizeHref(href, baseUrl) : null;
}

function isLikelyReferenceItem(element: Element): boolean {
  const marker = citationMarker(element);
  if (/(?:^|[-_\s])(footnote|endnote|reference|references|citation|bib|biblio|fn)(?:[-_\s]|\d|$)/i.test(marker)) return true;
  const parent = element.parent instanceof DomElement ? element.parent : undefined;
  return parent ? /(?:^|[-_\s])(references|citation|bibliography|footnotes|endnotes)(?:[-_\s]|$)/i.test(citationMarker(parent)) : false;
}

function isFootnoteItem(element: Element): boolean {
  return /(?:^|[-_\s])(footnote|endnote|fn)(?:[-_\s]|\d|$)/i.test(citationMarker(element));
}

function citationMarker(element: Element): string {
  return [
    element.name,
    attr(element, "id") ?? "",
    attr(element, "class") ?? "",
    attr(element, "role") ?? "",
    attr(element, "itemtype") ?? "",
  ].join(" ");
}

function isLikelyUsefulCitation(text: string): boolean {
  if (text.length < 12 || text.length > 800) return false;
  return !/^(share|copy link|permalink|edit|back to top)$/i.test(text);
}

function summarizeMedia(html: string, baseUrl: string): PageMediaSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageMediaSummary[] = [];
  const seenUrls = new Set<string>();
  const figureImages = new Set<Element>();
  const add = (item: Omit<PageMediaSummary, "id" | "path" | "rank">): void => {
    if (!item.url || seenUrls.has(item.url) || isLowValueMedia(item)) return;
    seenUrls.add(item.url);
    const rank = items.length + 1;
    items.push({
      id: `m${rank}`,
      path: `pageCheck.media[${rank - 1}]`,
      rank,
      ...item,
    });
  };

  for (const meta of mediaMetaTags(document.children)) {
    const url = normalizeHref(meta.content, baseUrl);
    if (!url) continue;
    add({
      kind: "open-graph",
      url,
      text: mediaText(meta.alt, "", "", url),
      ...(meta.alt ? { alt: meta.alt } : {}),
      selector: `meta[property="${cssAttributeValue(meta.name)}"]`,
    });
  }

  for (const [index, figure] of findElements(document.children, (item) => item.name === "figure").entries()) {
    const image = findElement(figure.children, (item) => item.name === "img");
    if (!image) continue;
    figureImages.add(image);
    const imageSummary = imageMediaParts(image, baseUrl);
    if (!imageSummary.url) continue;
    const captionElement = findElement(figure.children, (item) => item.name === "figcaption");
    const caption = captionElement ? cleanContentText(descendantText(captionElement)) : "";
    add({
      kind: "figure",
      url: imageSummary.url,
      text: mediaText(imageSummary.alt, caption, imageSummary.title, imageSummary.url),
      ...(imageSummary.alt ? { alt: imageSummary.alt } : {}),
      ...(caption ? { caption } : {}),
      ...(imageSummary.title ? { title: imageSummary.title } : {}),
      ...(typeof imageSummary.width === "number" ? { width: imageSummary.width } : {}),
      ...(typeof imageSummary.height === "number" ? { height: imageSummary.height } : {}),
      selector: `figure:nth-of-type(${index + 1})`,
    });
  }

  for (const [index, image] of findElements(document.children, (item) => item.name === "img").entries()) {
    if (figureImages.has(image)) continue;
    const imageSummary = imageMediaParts(image, baseUrl);
    if (!imageSummary.url) continue;
    add({
      kind: "image",
      url: imageSummary.url,
      text: mediaText(imageSummary.alt, "", imageSummary.title, imageSummary.url),
      ...(imageSummary.alt ? { alt: imageSummary.alt } : {}),
      ...(imageSummary.title ? { title: imageSummary.title } : {}),
      ...(typeof imageSummary.width === "number" ? { width: imageSummary.width } : {}),
      ...(typeof imageSummary.height === "number" ? { height: imageSummary.height } : {}),
      selector: `img:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function mediaMetaTags(nodes: AnyNode[]): Array<{ name: string; content: string; alt: string }> {
  const altByName = new Map<string, string>();
  for (const meta of findElements(nodes, (item) => item.name === "meta")) {
    const name = attr(meta, "property") || attr(meta, "name") || "";
    const content = cleanLinkText(attr(meta, "content") ?? "");
    if (!name || !content) continue;
    if (name === "og:image:alt") altByName.set("og:image", content);
    if (name === "twitter:image:alt") altByName.set("twitter:image", content);
  }
  return findElements(nodes, (item) => item.name === "meta")
    .map((meta) => {
      const name = attr(meta, "property") || attr(meta, "name") || "";
      const content = cleanLinkText(attr(meta, "content") ?? "");
      const alt = name.startsWith("og:image")
        ? altByName.get("og:image") ?? ""
        : name.startsWith("twitter:image") ? altByName.get("twitter:image") ?? "" : "";
      return { name, content, alt };
    })
    .filter((meta) => ["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(meta.name) && Boolean(meta.content));
}

function imageMediaParts(image: Element, baseUrl: string): { url: string; alt: string; title: string; width?: number; height?: number } {
  const src = cleanLinkText(attr(image, "src") || firstSrcsetUrl(attr(image, "srcset") || ""));
  const url = src ? normalizeHref(src, baseUrl) ?? "" : "";
  const alt = cleanContentText(attr(image, "alt") ?? "");
  const title = cleanContentText(attr(image, "title") ?? "");
  const width = positiveIntegerAttribute(image, "width");
  const height = positiveIntegerAttribute(image, "height");
  return {
    url,
    alt,
    title,
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {}),
  };
}

function firstSrcsetUrl(srcset: string): string {
  return srcset.split(",").map((part) => part.trim().split(/\s+/)[0] ?? "").find(Boolean) ?? "";
}

function positiveIntegerAttribute(element: Element, name: string): number | undefined {
  const parsed = Number(attr(element, name));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function mediaText(alt: string, caption: string, title: string, url: string): string {
  return cleanContentText([caption, alt, title, url].filter(Boolean).join(" - "));
}

function isLowValueMedia(item: Omit<PageMediaSummary, "id" | "path" | "rank">): boolean {
  if (/^data:/i.test(item.url)) return true;
  if ((item.width !== undefined && item.width <= 2) || (item.height !== undefined && item.height <= 2)) return true;
  const label = `${item.alt ?? ""} ${item.caption ?? ""} ${item.title ?? ""}`.trim();
  if (item.kind === "image" && /^(logo|icon|avatar|profile|spacer|tracking|pixel)$/i.test(label)) return true;
  return item.kind === "image" && !label && !item.width && !item.height;
}

function summarizeResources(html: string, baseUrl: string): PageResourceSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageResourceSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageResourceSummary, "id" | "path" | "rank">): void => {
    const key = `${item.kind}\n${item.url}`.toLowerCase();
    if (!item.url || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `rs${rank}`,
      path: `pageCheck.resources[${rank - 1}]`,
      rank,
      ...item,
    });
  };

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const href = attr(link, "href");
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url) continue;
    const rel = cleanLinkText(attr(link, "rel") ?? "");
    const type = cleanLinkText(attr(link, "type") ?? "");
    const kind = resourceKindFromHeadLink(rel, type, url);
    if (!kind) continue;
    const title = cleanContentText(attr(link, "title") || resourceTitleFromUrl(url));
    const hreflang = cleanLinkText(attr(link, "hreflang") ?? "");
    add({
      kind,
      url,
      text: resourceText(kind, title, rel, type, hreflang, url),
      ...(title ? { title } : {}),
      ...(rel ? { rel } : {}),
      ...(type ? { type } : {}),
      ...(hreflang ? { hreflang } : {}),
      selector: rel ? `link[rel="${cssAttributeValue(rel)}"]` : `link:nth-of-type(${index + 1})`,
    });
  }

  for (const [index, link] of findElements(document.children, (item) => item.name === "a").entries()) {
    const href = attr(link, "href");
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url) continue;
    const kind = attr(link, "download") !== undefined ? "download" : documentResourceKind(url);
    if (!kind) continue;
    const title = cleanContentText(descendantText(link) || attr(link, "title") || resourceTitleFromUrl(url));
    add({
      kind,
      url,
      text: resourceText(kind, title, "", documentMimeHint(url), "", url),
      ...(title ? { title } : {}),
      ...(documentMimeHint(url) ? { type: documentMimeHint(url) } : {}),
      selector: `a:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function resourceKindFromHeadLink(rel: string, type: string, url: string): PageResourceSummary["kind"] | undefined {
  const relParts = rel.toLowerCase().split(/\s+/).filter(Boolean);
  const marker = `${rel} ${type} ${url}`.toLowerCase();
  if (relParts.includes("amphtml")) return "amp";
  if (relParts.includes("license")) return "license";
  if (relParts.includes("manifest")) return "manifest";
  if (relParts.includes("search")) return "search";
  if (relParts.includes("sitemap") || /\/sitemap[^/]*\.xml(?:[?#]|$)/i.test(url)) return "sitemap";
  if (relParts.includes("alternate") && /(rss|atom|feed|application\/json|jsonfeed)/i.test(marker)) return "feed";
  if (relParts.includes("alternate")) return "alternate";
  const documentKind = documentResourceKind(url);
  return documentKind && relParts.some((part) => ["enclosure", "attachment", "canonical"].includes(part)) ? documentKind : undefined;
}

function documentResourceKind(url: string): PageResourceSummary["kind"] | undefined {
  const extension = resourceExtension(url);
  if (!extension) return undefined;
  if (["pdf", "csv", "tsv", "xls", "xlsx", "doc", "docx", "ppt", "pptx", "ics"].includes(extension)) return "document";
  if (["zip", "gz", "tgz", "tar", "json", "xml"].includes(extension)) return "download";
  return undefined;
}

function resourceExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.match(/\.([a-z0-9]{2,5})$/)?.[1] ?? "";
  } catch {
    return "";
  }
}

function documentMimeHint(url: string): string {
  const extension = resourceExtension(url);
  const byExtension: Record<string, string> = {
    pdf: "application/pdf",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ics: "text/calendar",
    zip: "application/zip",
    json: "application/json",
    xml: "application/xml",
  };
  return byExtension[extension] ?? "";
}

function resourceTitleFromUrl(url: string): string {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    return pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return "";
  }
}

function resourceText(kind: PageResourceSummary["kind"], title: string, rel: string, type: string, hreflang: string, url: string): string {
  return cleanContentText([
    `${kind}:`,
    title,
    rel ? `rel=${rel}` : "",
    type ? `type=${type}` : "",
    hreflang ? `hreflang=${hreflang}` : "",
    url,
  ].filter(Boolean).join(" "));
}

function summarizeEmbeds(html: string, baseUrl: string): PageEmbedSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  return findElements(document.children, isEmbedElement)
    .map((element, index) => summarizeEmbed(element, index, baseUrl))
    .filter((embed): embed is PageEmbedSummary => Boolean(embed))
    .map((embed, index) => ({
      ...embed,
      id: `em${index + 1}`,
      path: `pageCheck.embeds[${index}]`,
      rank: index + 1,
    }))
    .slice(0, 8);
}

function isEmbedElement(element: Element): boolean {
  return ["iframe", "video", "audio", "embed", "object"].includes(element.name);
}

function summarizeEmbed(element: Element, index: number, baseUrl: string): PageEmbedSummary | undefined {
  const kind = element.name as PageEmbedSummary["kind"];
  const directUrl = embedDirectUrl(element, baseUrl);
  const posterUrl = kind === "video" ? normalizedAttributeUrl(element, "poster", baseUrl) : "";
  const sourceUrls = embedSourceUrls(element, baseUrl);
  const url = directUrl || sourceUrls[0] || posterUrl;
  if (!url) return undefined;
  const title = cleanContentText(attr(element, "title") || attr(element, "aria-label") || descendantText(element) || resourceTitleFromUrl(url));
  const type = cleanLinkText(attr(element, "type") || firstSourceType(element) || documentMimeHint(url));
  const sandbox = kind === "iframe" ? cleanLinkText(attr(element, "sandbox") ?? "") : "";
  const allow = kind === "iframe" ? cleanLinkText(attr(element, "allow") ?? "") : "";
  const loading = kind === "iframe" ? cleanLinkText(attr(element, "loading") ?? "") : "";
  return {
    id: "em1",
    path: "pageCheck.embeds[0]",
    rank: 1,
    kind,
    url,
    text: embedText(kind, title, type, url, posterUrl, sourceUrls, sandbox, allow),
    ...(title ? { title } : {}),
    ...(type ? { type } : {}),
    ...(posterUrl ? { posterUrl } : {}),
    ...(sourceUrls.length > 0 ? { sourceUrls } : {}),
    ...(sandbox ? { sandbox } : {}),
    ...(allow ? { allow } : {}),
    ...(loading ? { loading } : {}),
    selector: `${kind}:nth-of-type(${index + 1})`,
  };
}

function embedDirectUrl(element: Element, baseUrl: string): string {
  if (element.name === "object") return normalizedAttributeUrl(element, "data", baseUrl);
  return normalizedAttributeUrl(element, "src", baseUrl);
}

function normalizedAttributeUrl(element: Element, name: string, baseUrl: string): string {
  const value = cleanLinkText(attr(element, name) ?? "");
  return value ? normalizeHref(value, baseUrl) ?? "" : "";
}

function embedSourceUrls(element: Element, baseUrl: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const source of findElements(element.children, (item) => item.name === "source")) {
    const url = normalizedAttributeUrl(source, "src", baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls.slice(0, 4);
}

function firstSourceType(element: Element): string {
  const source = findElement(element.children, (item) => item.name === "source" && Boolean(attr(item, "type")));
  return source ? cleanLinkText(attr(source, "type") ?? "") : "";
}

function embedText(
  kind: PageEmbedSummary["kind"],
  title: string,
  type: string,
  url: string,
  posterUrl: string,
  sourceUrls: string[],
  sandbox: string,
  allow: string,
): string {
  return cleanContentText([
    `${kind}:`,
    title,
    type ? `type=${type}` : "",
    url,
    posterUrl ? `poster=${posterUrl}` : "",
    sourceUrls.length > 0 ? `sources=${sourceUrls.join("|")}` : "",
    sandbox ? `sandbox=${sandbox}` : "",
    allow ? `allow=${allow}` : "",
  ].filter(Boolean).join(" "));
}

function summarizeTranscripts(html: string, baseUrl: string): PageTranscriptSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageTranscriptSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageTranscriptSummary, "id" | "path" | "rank" | "text">): void => {
    const url = item.url ? normalizeHref(item.url, baseUrl) ?? item.url : "";
    const label = item.label ? cleanContentText(item.label).slice(0, 120) : "";
    const language = cleanLinkText(item.language ?? "").slice(0, 35);
    const key = `${item.kind}\n${url}\n${language}\n${label}`.toLowerCase();
    if (!url || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `tr${rank}`,
      path: `pageCheck.transcripts[${rank - 1}]`,
      rank,
      kind: item.kind,
      url,
      ...(item.mediaKind ? { mediaKind: item.mediaKind } : {}),
      ...(label ? { label } : {}),
      ...(language ? { language } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
      text: transcriptText(item.kind, url, item.mediaKind, label, language),
    });
  };

  for (const [index, track] of findElements(document.children, (item) => item.name === "track").entries()) {
    const src = attr(track, "src");
    const url = src ? normalizeHref(src, baseUrl) : null;
    if (!url) continue;
    const parent = track.parent instanceof DomElement ? track.parent : undefined;
    const mediaKind = parent?.name === "video" || parent?.name === "audio" ? parent.name : undefined;
    add({
      kind: transcriptKindFromTrack(attr(track, "kind") ?? ""),
      url,
      ...(mediaKind ? { mediaKind } : {}),
      label: attr(track, "label") ?? "",
      language: attr(track, "srclang") ?? "",
      selector: `track:nth-of-type(${index + 1})`,
    });
  }

  for (const [index, anchor] of findElements(document.children, (item) => item.name === "a").entries()) {
    const href = attr(anchor, "href");
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url) continue;
    const label = cleanContentText(descendantText(anchor) || attr(anchor, "title") || attr(anchor, "aria-label") || resourceTitleFromUrl(url));
    const rel = cleanLinkText(attr(anchor, "rel") ?? "");
    const kind = transcriptKindFromAnchor(url, label, rel);
    if (!kind) continue;
    add({
      kind,
      url,
      label,
      language: languageFromTranscriptUrl(url),
      selector: `a:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 8);
}

function transcriptKindFromTrack(value: string): PageTranscriptSummary["kind"] {
  const kind = value.toLowerCase().trim();
  if (kind === "captions" || kind === "subtitles" || kind === "descriptions" || kind === "chapters" || kind === "metadata") return kind;
  return "subtitles";
}

function transcriptKindFromAnchor(url: string, label: string, rel: string): PageTranscriptSummary["kind"] | undefined {
  const marker = `${url} ${label} ${rel}`.toLowerCase();
  if (!/(transcript|caption|subtitle|subtitles|captions|\.vtt(?:[?#]|$)|\.srt(?:[?#]|$))/.test(marker)) return undefined;
  if (/caption|captions|\.vtt(?:[?#]|$)/.test(marker)) return "captions";
  if (/subtitle|subtitles|\.srt(?:[?#]|$)/.test(marker)) return "subtitles";
  return "transcript";
}

function languageFromTranscriptUrl(url: string): string {
  try {
    const filename = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
    return filename.match(/[._-]([a-z]{2,3}(?:-[a-z0-9]{2,8})?)(?:\.(?:vtt|srt|txt))$/i)?.[1] ?? "";
  } catch {
    return "";
  }
}

function transcriptText(kind: PageTranscriptSummary["kind"], url: string, mediaKind: PageTranscriptSummary["mediaKind"] | undefined, label: string, language: string): string {
  return cleanContentText([
    `${kind}:`,
    label,
    language ? `lang=${language}` : "",
    mediaKind ? `media=${mediaKind}` : "",
    url,
  ].filter(Boolean).join(" "));
}

function summarizeAuthorLinks(html: string, baseUrl: string): PageAuthorLinkSummary[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const items: PageAuthorLinkSummary[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<PageAuthorLinkSummary, "id" | "path" | "rank" | "text">): void => {
    const url = item.url;
    const name = item.name ? cleanContentText(item.name).slice(0, 120) : "";
    const key = `${url}\n${name}`.toLowerCase();
    if (!isUsefulAuthorLink(url, name, baseUrl) || seen.has(key)) return;
    seen.add(key);
    const rank = items.length + 1;
    items.push({
      id: `au${rank}`,
      path: `pageCheck.authorLinks[${rank - 1}]`,
      rank,
      ...item,
      ...(name ? { name } : {}),
      text: authorLinkText(name, item.source, url),
    });
  };

  for (const [scriptIndex, script] of findElements(document.children, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? "")).entries()) {
    for (const value of parseJsonLdValues(scriptText(script))) {
      for (const author of jsonLdAuthorLinks(value.author, baseUrl)) {
        add({
          ...author,
          source: "json-ld",
          selector: `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`,
        });
      }
    }
  }

  for (const [index, link] of findElements(document.children, (item) => item.name === "link").entries()) {
    const rel = cleanLinkText(attr(link, "rel") ?? "");
    if (!rel.split(/\s+/).some((part) => part.toLowerCase() === "author")) continue;
    const href = attr(link, "href") ?? "";
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url) continue;
    add({
      url,
      source: "link",
      name: cleanContentText(attr(link, "title") || attr(link, "hreflang") || resourceTitleFromUrl(url)),
      rel,
      selector: `link[rel="${cssAttributeValue(rel)}"]:nth-of-type(${index + 1})`,
    });
  }

  const authorContainers = findElements(document.children, isLikelyAuthorContainer);
  for (const [containerIndex, container] of authorContainers.entries()) {
    for (const anchor of findElements(container.children, (item) => item.name === "a").slice(0, 4)) {
      const href = attr(anchor, "href") ?? "";
      const url = href ? normalizeHref(href, baseUrl) : null;
      if (!url) continue;
      const rel = cleanLinkText(attr(anchor, "rel") ?? "");
      add({
        url,
        source: "html",
        name: cleanContentText(descendantText(anchor) || attr(anchor, "title") || attr(anchor, "aria-label") || resourceTitleFromUrl(url)),
        ...(rel ? { rel } : {}),
        selector: `${container.name}:nth-of-type(${containerIndex + 1}) a`,
      });
    }
  }

  for (const [index, anchor] of findElements(document.children, (item) => item.name === "a").entries()) {
    const rel = cleanLinkText(attr(anchor, "rel") ?? "");
    if (!rel.split(/\s+/).some((part) => /^(author|me)$/.test(part.toLowerCase()))) continue;
    const href = attr(anchor, "href") ?? "";
    const url = href ? normalizeHref(href, baseUrl) : null;
    if (!url) continue;
    add({
      url,
      source: "html",
      name: cleanContentText(descendantText(anchor) || attr(anchor, "title") || attr(anchor, "aria-label") || resourceTitleFromUrl(url)),
      rel,
      selector: `a[rel="${cssAttributeValue(rel)}"]:nth-of-type(${index + 1})`,
    });
  }

  return items.slice(0, 6);
}

function jsonLdAuthorLinks(value: unknown, baseUrl: string): Array<{ name?: string; url: string }> {
  if (typeof value === "string") return [];
  return schemaObjectArray(value)
    .map((author) => {
      const name = jsonLdString(author.name) || jsonLdString(author.headline);
      const rawUrl = jsonLdString(author.url) || jsonLdStringArray(author.sameAs)[0];
      const url = rawUrl ? normalizeHref(rawUrl, baseUrl) : null;
      return url ? { ...(name ? { name } : {}), url } : undefined;
    })
    .filter((item): item is { name?: string; url: string } => Boolean(item));
}

function isLikelyAuthorContainer(element: Element): boolean {
  if (!["a", "address", "aside", "div", "footer", "header", "p", "section", "span"].includes(element.name)) return false;
  const marker = [
    element.name,
    attr(element, "class") ?? "",
    attr(element, "id") ?? "",
    attr(element, "itemprop") ?? "",
    attr(element, "rel") ?? "",
    attr(element, "aria-label") ?? "",
  ].join(" ").toLowerCase();
  return /\b(author|byline|profile|contributor|creator|writer|reporter|editor)\b|필자|작성자|저자|기자/.test(marker);
}

function isUsefulAuthorLink(url: string, name: string, baseUrl: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (name && /^(home|menu|navigation|login|search|share|profile|author|byline|작성자|저자)$/i.test(name)) return false;
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (parsed.href === base.href) return false;
    return true;
  } catch {
    return false;
  }
}

function authorLinkText(name: string, source: PageAuthorLinkSummary["source"], url: string): string {
  return cleanContentText([name || "Author", `source=${source}`, url].join(" "));
}

function evidenceScore(text: string, role: string, semantic: boolean, hasSelector: boolean): number {
  let score = semantic ? 0.58 : 0.24;
  const length = text.length;
  if (length >= 240) score += 0.2;
  else if (length >= 120) score += 0.14;
  else if (length >= 60) score += 0.08;
  if (role === "p" || role === "article") score += 0.12;
  if (hasSelector) score += 0.06;
  return roundMetric(Math.max(0, Math.min(1, score)));
}

function evidenceQuality(score: number): PageEvidenceSummary["quality"] {
  if (score >= 0.76) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function evidenceQualityReason(score: number, text: string, role: string, semantic: boolean, hasSelector: boolean): string {
  const parts = [
    semantic ? "semantic extraction" : "fallback text",
    `${text.length} chars`,
  ];
  if (role === "p" || role === "article") parts.push(`${role} content`);
  if (hasSelector) parts.push("selector available");
  return `${evidenceQuality(score)} evidence from ${parts.join(", ")}.`;
}

function summarizeFinds(
  queries: string[],
  page: PageSummary,
  pageCheck: PageCheckSummary,
  links: LinkSummary[],
  results: ResultSummary[],
  outline: OutlineSummary[],
  content: ContentSummary[],
  kind: ContentKind,
): FindSummary[] {
  if (queries.length === 0) return [];
  const candidates = findCandidates(page, pageCheck, links, results, outline, content, kind);
  return queries.map((query) => {
    const normalizedQuery = normalizeFindValue(query);
    const terms = queryTerms(query).map(normalizeFindValue);
    const allMatches = candidates.filter((candidate) => {
      const normalizedText = normalizeFindValue(candidate.text);
      if (!normalizedQuery) return false;
      if (normalizedText.includes(normalizedQuery)) return true;
      return terms.length > 0 && terms.every((term) => normalizedText.includes(term));
    });
    const directMatches = allMatches.filter((match) => match.field !== "section");
    const matches = (directMatches.length > 0 ? directMatches : allMatches).slice(0, 8);
    return {
      query,
      found: matches.length > 0,
      matchCount: matches.length,
      matches,
    };
  });
}

function summarizeVerification(
  finds: FindSummary[],
  pageCheck: PageCheckSummary,
  pageUrl: string,
  analysis: AnalysisSummary,
  agentMode = false,
  capturedHtml = false,
  sourceSearch?: SourceSearchSummary,
  timeoutMs?: number,
  userAgent?: string,
): VerificationSummary {
  const requestedCount = finds.length;
  const foundQueries = finds.filter((item) => item.found).map((item) => item.query);
  const missingQueries = finds.filter((item) => !item.found).map((item) => item.query);
  const evidenceCount = finds.reduce((total, item) => total + item.matchCount, 0);
  const bestEvidence = finds.find((item) => item.matches[0])?.matches[0];
  const status: VerificationSummary["status"] = requestedCount === 0
    ? "not-requested"
    : missingQueries.length === 0
      ? "matched"
      : foundQueries.length > 0
        ? "partial"
        : "missing";
  const summary: VerificationSummary = {
    status,
    requestedCount,
    foundCount: foundQueries.length,
    missingCount: missingQueries.length,
    evidenceCount,
    foundQueries,
    missingQueries,
  };
  if (bestEvidence) summary.bestEvidence = bestEvidence;
  const recommendedAction = recommendedVerificationAction(status, pageCheck, pageUrl, analysis, agentMode, missingQueries, capturedHtml, sourceSearch, timeoutMs, userAgent);
  if (recommendedAction) summary.recommendedAction = recommendedAction;
  return summary;
}

function recommendedVerificationAction(
  status: VerificationSummary["status"],
  pageCheck: PageCheckSummary,
  pageUrl: string,
  analysis: AnalysisSummary,
  agentMode = false,
  missingQueries: string[] = [],
  capturedHtml = false,
  sourceSearch?: SourceSearchSummary,
  timeoutMs?: number,
  userAgent?: string,
): SuggestedAction | undefined {
  if (status === "not-requested") return undefined;
  const searchAction = analysis.suggestedActions.find((action) => action.action === "refine-search" || action.action === "open-result");
  if (analysis.kind === "search-results" && searchAction) return searchAction;
  if (status === "matched") {
    return {
      action: "use-evidence",
      reason: "All requested text was found in the page summaries.",
      url: pageUrl,
      terminal: true,
      readFrom: "verification.bestEvidence",
    };
  }
  if (searchAction) return searchAction;
  const alternateAction = sourceSearchAlternateAction(sourceSearch, missingQueries, agentMode);
  if (alternateAction) return alternateAction;
  const siteSearchForm = pageCheck.forms.find((form) => form.urlTemplate);
  const siteSearchCommand = siteSearchCommandSpec(siteSearchForm, missingQueries, agentMode, timeoutMs, userAgent);
  if (siteSearchForm && siteSearchCommand) {
    return {
      action: "open-site-search",
      reason: "Requested text was not found; use the page's own search form before broadening to web search.",
      url: siteSearchCommand.url,
      rank: siteSearchForm.rank,
      target: {
        title: siteSearchForm.submitText || siteSearchForm.fields.find((field) => field.label)?.label || "Site search",
        url: siteSearchCommand.url,
        rank: siteSearchForm.rank,
      },
      ...commandFields(siteSearchCommand),
    };
  }
  if (pageCheck.sourceLinks[0]) {
    return {
      action: "open-source-link",
      reason: "Some requested text was not found; inspect the strongest external source link.",
      url: pageCheck.sourceLinks[0].url,
      rank: pageCheck.sourceLinks[0].rank,
      ...(pageCheck.sourceLinks[0].path ? { sourceLinkRef: pageCheck.sourceLinks[0].path } : {}),
      target: agentTargetFromResult(pageCheck.sourceLinks[0]),
      ...commandFields(pageCommandSpec(pageCheck.sourceLinks[0].url, agentMode, false, missingQueries, timeoutMs, userAgent)),
    };
  }
  if ((analysis.kind === "blocked-page" || analysis.kind === "empty" || pageCheck.readability.level === "low") && !capturedHtml) {
    return {
      action: "retry-with-browser-html",
      reason: "Requested text was not found and the fetched page may be incomplete.",
      url: pageUrl,
      ...commandFields(pageCommandSpec(pageUrl, agentMode, true, missingQueries, timeoutMs, userAgent)),
    };
  }
  if (analysis.kind === "blocked-page" || analysis.kind === "empty") {
    return {
      action: "inspect-browser-state",
      reason: "Requested text was not found, and browser-captured HTML still appears blocked or empty.",
      url: pageUrl,
      requiresBrowserInteraction: true,
      ...afterInteractionCommandFields(pageCommandSpec(pageUrl, agentMode, true, missingQueries, timeoutMs, userAgent)),
    };
  }
  return {
    action: "broaden-search",
    reason: "Requested text was not found in the current page summaries.",
    ...commandFields(verificationSearchCommandSpec(missingQueries, agentMode, timeoutMs, userAgent)),
  };
}

function sourceSearchAlternateAction(sourceSearch: SourceSearchSummary | undefined, missingQueries: string[], agentMode = false): SuggestedAction | undefined {
  if (!sourceSearch || missingQueries.length === 0) return undefined;
  const alternate = bestSourceSearchAlternate(sourceSearch, missingQueries);
  const command = alternate
    ? searchOpenCommandSpec(
        sourceSearch.query,
        sourceSearch.selectedEngine ?? sourceSearch.engine,
        missingQueries,
        agentMode,
        sourceSearch.lang,
        sourceSearch.region,
        alternate.rank,
        sourceSearch.timeoutMs,
        sourceSearch.userAgent,
      )
    : undefined;
  if (!alternate || !command) return undefined;
  return {
    action: "open-alternate-result",
    reason: "The opened result did not verify the requested text; an alternate original SERP result matches the missing query.",
    url: alternate.url,
    rank: alternate.rank,
    target: agentTargetFromResult(alternate),
    ...commandFields(command),
  };
}

function bestSourceSearchAlternate(sourceSearch: SourceSearchSummary | undefined, findQueries: string[] = []): ResultSummary | undefined {
  const alternates = sourceSearch?.alternateResults ?? [];
  if (alternates.length === 0) return undefined;
  const recommended = recommendedSearchResult(alternates, findQueries);
  if (recommended) return recommended;
  return [...alternates].sort((left, right) => {
    const scoreDelta = singleResultRecommendationScore(right, findQueries) - singleResultRecommendationScore(left, findQueries);
    if (scoreDelta !== 0) return scoreDelta;
    return left.rank - right.rank;
  })[0];
}

function summarizeAgentSemanticSummary(tree: SemanticNode, baseUrl?: string): AgentSemanticSummary {
  const roleCounts: Record<string, number> = {};
  const landmarks: string[] = [];
  const headings: string[] = [];
  const namedRoles: string[] = [];
  const semanticOutline: AgentSemanticSummary["semanticOutline"] = [];
  const keyboardItems: AgentSemanticSummary["keyboardItems"] = [];
  const headingItems: AgentSemanticSummary["headingItems"] = [];
  const landmarkItems: AgentSemanticSummary["landmarkItems"] = [];
  const namedRoleItems: AgentSemanticSummary["namedRoleItems"] = [];
  const interactiveRoles: AgentSemanticSummary["interactiveRoles"] = [];
  const focusableItems: AgentSemanticSummary["focusableItems"] = [];
  const links: AgentSemanticSummary["links"] = [];
  const inPageLinks: AgentSemanticSummary["inPageLinks"] = [];
  const buttons: AgentSemanticSummary["buttons"] = [];
  const imageItems: AgentSemanticSummary["imageItems"] = [];
  const tableItems: AgentSemanticSummary["tableItems"] = [];
  const listItems: AgentSemanticSummary["listItems"] = [];
  const fieldItems: AgentSemanticSummary["fieldItems"] = [];
  const descriptionItems: AgentSemanticSummary["descriptionItems"] = [];
  const valueItems: AgentSemanticSummary["valueItems"] = [];
  const relationItems: AgentSemanticSummary["relationItems"] = [];
  const choiceItems: AgentSemanticSummary["choiceItems"] = [];
  const stateItems: AgentSemanticSummary["stateItems"] = [];
  const unavailableItems: AgentSemanticSummary["unavailableItems"] = [];
  let nodeCount = 0;
  let namedRoleCount = 0;
  let interactiveCount = 0;
  let focusableCount = 0;
  let imageCount = 0;
  let tableCount = 0;
  let listCount = 0;
  let fieldCount = 0;
  let descriptionCount = 0;
  let valueCount = 0;
  let relationCount = 0;
  let choiceCount = 0;
  let stateCount = 0;
  let unavailableCount = 0;
  let landmarkCount = 0;
  const landmarkRoles = new Set(["banner", "main", "navigation", "contentinfo", "complementary", "region", "search", "form"]);
  const fieldRoles = new Set(["checkbox", "combobox", "listbox", "radio", "searchbox", "slider", "spinbutton", "switch", "textbox"]);
  const choiceRoles = new Set(["listitem", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "tab", "treeitem"]);
  const tableRoles = new Set(["grid", "table", "treegrid"]);
  const listRoles = new Set(["list", "menu", "menubar", "tablist", "tree"]);
  const nodesByDomId = indexSemanticNodesByDomId(tree);

  function pushSemanticOutline(item: Omit<AgentSemanticSummary["semanticOutline"][number], "path">): void {
    if (semanticOutline.length >= 16) return;
    semanticOutline.push({
      path: `agent.semanticSummary.semanticOutline[${semanticOutline.length}]`,
      ...item,
    });
  }

  function visit(node: SemanticNode, depth = 0, outlineParent?: Pick<AgentSemanticSummary["semanticOutline"][number], "path" | "role" | "text">): void {
    nodeCount += 1;
    const role = node.role ?? node.tag;
    const roleDescription = cleanContentText(node.attributes?.["aria-roledescription"] ?? "").slice(0, 120);
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    const shortcuts = semanticKeyboardShortcuts(node.attributes?.["aria-keyshortcuts"]);
    const accessKey = cleanContentText(node.attributes?.accesskey ?? "").slice(0, 80);
    const tabIndex = semanticTabIndex(node.attributes?.tabindex);
    if ((shortcuts.length > 0 || accessKey || typeof tabIndex === "number") && keyboardItems.length < 8) {
      keyboardItems.push({
        path: `agent.semanticSummary.keyboardItems[${keyboardItems.length}]`,
        role,
        ...(node.name ? { name: node.name } : {}),
        ...(shortcuts.length > 0 ? { shortcuts } : {}),
        ...(accessKey ? { accessKey } : {}),
        ...(typeof tabIndex === "number" ? { tabIndex } : {}),
        focusable: node.focusable,
        ...(node.selector ? { selector: node.selector } : {}),
      });
    }
    if (node.unavailableReason) {
      unavailableCount += 1;
      if (unavailableItems.length < 8) {
        unavailableItems.push({
          path: `agent.semanticSummary.unavailableItems[${unavailableItems.length}]`,
          tag: node.tag,
          ...(node.role ? { role: node.role } : {}),
          ...(node.name ? { name: node.name } : {}),
          reason: node.unavailableReason,
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.description) {
      descriptionCount += 1;
      if (descriptionItems.length < 8) {
        descriptionItems.push({
          path: `agent.semanticSummary.descriptionItems[${descriptionItems.length}]`,
          role,
          ...(node.name ? { name: node.name } : {}),
          description: node.description,
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.value) {
      valueCount += 1;
      if (valueItems.length < 8) {
        valueItems.push({
          path: `agent.semanticSummary.valueItems[${valueItems.length}]`,
          role,
          ...(node.name ? { name: node.name } : {}),
          value: node.value,
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    const semanticRelations = [
      { relation: "controls" as const, target: node.state?.controls ?? node.attributes?.["aria-controls"] },
      { relation: "owns" as const, target: node.attributes?.["aria-owns"] },
      { relation: "flowto" as const, target: node.attributes?.["aria-flowto"] },
      { relation: "activeDescendant" as const, target: node.attributes?.["aria-activedescendant"] },
      { relation: "details" as const, target: node.attributes?.["aria-details"] },
      { relation: "errorMessage" as const, target: node.attributes?.["aria-errormessage"] },
    ];
    for (const item of semanticRelations) {
      const targets = semanticRelationTargets(item.target);
      for (const target of targets) {
        const targetNode = nodesByDomId.get(target);
        relationCount += 1;
        if (relationItems.length < 8) {
          relationItems.push({
            path: `agent.semanticSummary.relationItems[${relationItems.length}]`,
            role,
            ...(node.name ? { name: node.name } : {}),
            relation: item.relation,
            target,
            ...(targetNode ? { targetRole: targetNode.role ?? targetNode.tag } : {}),
            ...(targetNode?.name ? { targetName: targetNode.name } : {}),
            ...(targetNode?.selector ? { targetSelector: targetNode.selector } : {}),
            ...(node.selector ? { selector: node.selector } : {}),
          });
        }
      }
    }
    const stateText = formatSemanticState(node.state);
    if (stateText) {
      stateCount += 1;
      if (stateItems.length < 8) {
        stateItems.push({
          path: `agent.semanticSummary.stateItems[${stateItems.length}]`,
          role,
          ...(node.name ? { name: node.name } : {}),
          state: stateText,
          ...(node.state ? { stateRaw: node.state } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.role && fieldRoles.has(node.role)) {
      fieldCount += 1;
      if (fieldItems.length < 8) {
        const minLength = semanticNonNegativeInteger(node.attributes?.minlength);
        const maxLength = semanticNonNegativeInteger(node.attributes?.maxlength);
        const labelledBy = cleanContentText(node.attributes?.["aria-labelledby"] ?? "").slice(0, 160);
        const describedBy = cleanContentText(node.attributes?.["aria-describedby"] ?? "").slice(0, 160);
        const details = cleanContentText(node.attributes?.["aria-details"] ?? "").slice(0, 160);
        const errorMessage = cleanContentText(node.attributes?.["aria-errormessage"] ?? "").slice(0, 160);
        const labelledByText = semanticIdrefText(labelledBy, nodesByDomId) ?? (labelledBy && node.name ? node.name : undefined);
        const describedByText = semanticIdrefText(describedBy, nodesByDomId) ?? (describedBy && node.description ? node.description : undefined);
        const detailsText = semanticIdrefText(details, nodesByDomId);
        const errorMessageText = semanticIdrefText(errorMessage, nodesByDomId);
        fieldItems.push({
          path: `agent.semanticSummary.fieldItems[${fieldItems.length}]`,
          role: node.role,
          ...(node.name ? { name: node.name } : {}),
          ...(node.description ? { description: node.description } : {}),
          ...(node.value ? { value: node.value } : {}),
          ...(node.attributes?.name ? { htmlName: cleanContentText(node.attributes.name).slice(0, 120) } : {}),
          ...(node.attributes?.type ? { htmlType: cleanContentText(node.attributes.type).slice(0, 80) } : {}),
          ...(node.attributes?.placeholder ? { placeholder: cleanContentText(node.attributes.placeholder).slice(0, 160) } : {}),
          ...(node.attributes?.["aria-placeholder"] ? { ariaPlaceholder: cleanContentText(node.attributes["aria-placeholder"]).slice(0, 160) } : {}),
          ...(node.attributes?.autocomplete ? { autocomplete: cleanContentText(node.attributes.autocomplete).slice(0, 80) } : {}),
          ...(node.attributes?.["aria-autocomplete"] ? { ariaAutocomplete: cleanContentText(node.attributes["aria-autocomplete"]).slice(0, 80) } : {}),
          ...(node.attributes?.inputmode ? { inputMode: cleanContentText(node.attributes.inputmode).slice(0, 80) } : {}),
          ...(node.attributes?.pattern ? { pattern: cleanContentText(node.attributes.pattern).slice(0, 160) } : {}),
          ...(node.attributes?.min ? { min: cleanContentText(node.attributes.min).slice(0, 80) } : {}),
          ...(node.attributes?.max ? { max: cleanContentText(node.attributes.max).slice(0, 80) } : {}),
          ...(node.attributes?.step ? { step: cleanContentText(node.attributes.step).slice(0, 80) } : {}),
          ...(typeof minLength === "number" ? { minLength } : {}),
          ...(typeof maxLength === "number" ? { maxLength } : {}),
          ...(labelledBy ? { labelledBy } : {}),
          ...(labelledByText ? { labelledByText } : {}),
          ...(describedBy ? { describedBy } : {}),
          ...(describedByText ? { describedByText } : {}),
          ...(details ? { details } : {}),
          ...(detailsText ? { detailsText } : {}),
          ...(errorMessage ? { errorMessage } : {}),
          ...(errorMessageText ? { errorMessageText } : {}),
          ...(node.state ? { state: node.state } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.role && node.name && choiceRoles.has(node.role)) {
      choiceCount += 1;
      if (choiceItems.length < 8) {
        const posInSet = semanticPositiveInteger(node.attributes?.["aria-posinset"]);
        const setSize = semanticPositiveInteger(node.attributes?.["aria-setsize"]);
        const level = semanticPositiveInteger(node.attributes?.["aria-level"]);
        choiceItems.push({
          path: `agent.semanticSummary.choiceItems[${choiceItems.length}]`,
          role: node.role,
          name: node.name,
          ...(typeof level === "number" ? { level } : {}),
          ...(typeof posInSet === "number" ? { posInSet } : {}),
          ...(typeof setSize === "number" ? { setSize } : {}),
          ...(typeof node.state?.selected === "boolean" ? { selected: node.state.selected } : {}),
          ...(typeof node.state?.current !== "undefined" ? { current: node.state.current } : {}),
          ...(node.state ? { state: node.state } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.role === "img") {
      imageCount += 1;
      if (imageItems.length < 8) {
        const src = node.attributes?.src;
        const url = src && baseUrl ? normalizeHref(src, baseUrl) : src;
        const width = semanticPositiveInteger(node.attributes?.width);
        const height = semanticPositiveInteger(node.attributes?.height);
        const loading = cleanContentText(node.attributes?.loading ?? "").slice(0, 40);
        const decoding = cleanContentText(node.attributes?.decoding ?? "").slice(0, 40);
        const srcset = cleanContentText(node.attributes?.srcset ?? "").slice(0, 240);
        const sizes = cleanContentText(node.attributes?.sizes ?? "").slice(0, 160);
        imageItems.push({
          path: `agent.semanticSummary.imageItems[${imageItems.length}]`,
          ...(node.name ? { name: node.name } : {}),
          ...(url ? { url } : {}),
          ...(typeof width === "number" ? { width } : {}),
          ...(typeof height === "number" ? { height } : {}),
          ...(loading ? { loading } : {}),
          ...(decoding ? { decoding } : {}),
          ...(srcset ? { srcset } : {}),
          ...(sizes ? { sizes } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.role && tableRoles.has(node.role)) {
      tableCount += 1;
      if (tableItems.length < 8) {
        const headers = semanticDescendantTextsByRole(node, new Set(["columnheader", "rowheader"]), 8);
        const sampleCells = semanticDescendantTextsByRole(node, new Set(["cell", "gridcell"]), 8);
        const tablePath = `agent.semanticSummary.tableItems[${tableItems.length}]`;
        const headerRefs = semanticDescendantHeaderRefs(node, 8)
          .map((header, index) => ({ path: `${tablePath}.headerRefs[${index}]`, ...header }));
        const ownedRefs = semanticOwnedRefs(node, nodesByDomId, 8);
        const sampleCellRefs = semanticDescendantCellRefs(node, 8, nodesByDomId)
          .map((cell, index) => ({ path: `${tablePath}.sampleCellRefs[${index}]`, ...cell }));
        const declaredRowCount = semanticPositiveInteger(node.attributes?.["aria-rowcount"]);
        const declaredColumnCount = semanticPositiveInteger(node.attributes?.["aria-colcount"]);
        tableItems.push({
          path: tablePath,
          role: node.role,
          ...(node.name ? { name: node.name } : {}),
          rowCount: countSemanticDescendantsByRole(node, new Set(["row"])),
          cellCount: countSemanticDescendantsByRole(node, new Set(["cell", "columnheader", "gridcell", "rowheader"])),
          ...(typeof declaredRowCount === "number" ? { declaredRowCount } : {}),
          ...(typeof declaredColumnCount === "number" ? { declaredColumnCount } : {}),
          ...(headers.length > 0 ? { headers } : {}),
          ...(headerRefs.length > 0 ? { headerRefs } : {}),
          ...(ownedRefs.length > 0 ? { ownedRefs } : {}),
          ...(sampleCells.length > 0 ? { sampleCells } : {}),
          ...(sampleCellRefs.length > 0 ? { sampleCellRefs } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.role && listRoles.has(node.role)) {
      listCount += 1;
      if (listItems.length < 8) {
        const sampleItems = semanticDescendantTextsByRole(node, new Set(["listitem", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "tab", "treeitem"]), 8);
        const fallbackSampleItems = sampleItems.length > 0
          ? sampleItems
          : semanticDescendantTextsByRole(node, new Set(["link", "button", "checkbox", "radio", "switch"]), 8);
        const itemRefs = semanticDescendantListItemRefs(node, 8);
        listItems.push({
          path: `agent.semanticSummary.listItems[${listItems.length}]`,
          role: node.role,
          ...(node.name ? { name: node.name } : {}),
          itemCount: countSemanticDescendantsByRole(node, new Set(["listitem", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "tab", "treeitem"])),
          ...(fallbackSampleItems.length > 0 ? { sampleItems: fallbackSampleItems } : {}),
          ...(itemRefs.length > 0 ? { itemRefs } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.interactive) {
      interactiveCount += 1;
      if (node.role && node.name && interactiveRoles.length < 8) {
        interactiveRoles.push({
          path: `agent.semanticSummary.interactiveRoles[${interactiveRoles.length}]`,
          role: node.role,
          name: node.name,
          ...(roleDescription ? { roleDescription } : {}),
          ...(node.description ? { description: node.description } : {}),
          ...(node.value ? { value: node.value } : {}),
          ...(node.state ? { state: node.state } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.focusable) {
      focusableCount += 1;
      if (focusableItems.length < 8) {
        focusableItems.push({
          path: `agent.semanticSummary.focusableItems[${focusableItems.length}]`,
          role,
          ...(node.name ? { name: node.name } : {}),
          ...(roleDescription ? { roleDescription } : {}),
          ...(node.state ? { state: node.state } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    }
    if (node.role && node.name) {
      namedRoleCount += 1;
      if (namedRoles.length < 16) {
        namedRoles.push(`${node.role}:${node.name}`);
        namedRoleItems.push({
          path: `agent.semanticSummary.namedRoleItems[${namedRoleItems.length}]`,
          role: node.role,
          name: node.name,
          ...(roleDescription ? { roleDescription } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
      if (node.role === "heading" && headings.length < 8) {
        const headingLevel = semanticHeadingLevel(node);
        headings.push(node.name);
        headingItems.push({
          path: `agent.semanticSummary.headingItems[${headingItems.length}]`,
          text: node.name,
          ...(typeof headingLevel === "number" ? { level: headingLevel } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
        pushSemanticOutline({
          kind: "heading",
          role: node.role,
          text: node.name,
          ...(typeof headingLevel === "number" ? { level: headingLevel } : {}),
          depth,
          ...(outlineParent ? { parentPath: outlineParent.path, parentRole: outlineParent.role, parentName: outlineParent.text } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
      if (node.role === "link" && links.length < 8) {
        const href = node.attributes?.href;
        const url = href && baseUrl ? normalizeHref(href, baseUrl) : null;
        const target = cleanContentText(node.attributes?.target ?? "").slice(0, 80);
        const rel = semanticRelTokens(node.attributes?.rel);
        const type = cleanContentText(node.attributes?.type ?? "").slice(0, 120);
        const hreflang = cleanContentText(node.attributes?.hreflang ?? "").slice(0, 40);
        const linkState = formatSemanticState(node.state);
        const download = semanticDownloadAttribute(node.attributes);
        links.push({
          path: `agent.semanticSummary.links[${links.length}]`,
          name: node.name,
          ...(url ? { url } : {}),
          ...(target ? { target } : {}),
          ...(rel.length > 0 ? { rel } : {}),
          ...(type ? { type } : {}),
          ...(hreflang ? { hreflang } : {}),
          ...(linkState ? { state: linkState } : {}),
          ...(typeof node.state?.current !== "undefined" ? { current: node.state.current } : {}),
          ...(download ? { download } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
        const inPageLink = semanticInPageLink(node, url);
        if (inPageLink && inPageLinks.length < 8) {
          inPageLinks.push({
            path: `agent.semanticSummary.inPageLinks[${inPageLinks.length}]`,
            ...inPageLink,
          });
        }
      }
      if (node.role === "button" && buttons.length < 8) {
        const type = cleanContentText(node.attributes?.type ?? "").slice(0, 80);
        const formActionRaw = cleanContentText(node.attributes?.formaction ?? "").slice(0, 240);
        const formAction = formActionRaw && baseUrl ? normalizeHref(formActionRaw, baseUrl) : formActionRaw;
        const formMethod = cleanContentText(node.attributes?.formmethod ?? "").slice(0, 40);
        const formTarget = cleanContentText(node.attributes?.formtarget ?? "").slice(0, 80);
        const formEncType = cleanContentText(node.attributes?.formenctype ?? "").slice(0, 120);
        const formNoValidate = Object.prototype.hasOwnProperty.call(node.attributes ?? {}, "formnovalidate");
        const formId = cleanContentText(node.attributes?.form ?? "").slice(0, 160);
        const buttonState = formatSemanticState(node.state);
        buttons.push({
          path: `agent.semanticSummary.buttons[${buttons.length}]`,
          name: node.name,
          ...(roleDescription ? { roleDescription } : {}),
          ...(node.description ? { description: node.description } : {}),
          ...(type ? { type } : {}),
          ...(buttonState ? { state: buttonState } : {}),
          disabled: node.state?.disabled === true,
          ...(typeof node.state?.pressed !== "undefined" ? { pressed: node.state.pressed } : {}),
          ...(typeof node.state?.expanded === "boolean" ? { expanded: node.state.expanded } : {}),
          ...(typeof node.state?.haspopup !== "undefined" ? { haspopup: node.state.haspopup } : {}),
          ...(node.state?.controls ? { controls: node.state.controls } : {}),
          ...(formAction ? { formAction } : {}),
          ...(formMethod ? { formMethod } : {}),
          ...(formTarget ? { formTarget } : {}),
          ...(formEncType ? { formEncType } : {}),
          ...(formNoValidate ? { formNoValidate } : {}),
          ...(formId ? { formId } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
      if (landmarkRoles.has(node.role)) {
        landmarkCount += 1;
        if (landmarks.length < 8) {
          landmarks.push(`${node.role}${node.name ? `:${node.name}` : ""}`);
          landmarkItems.push({
            path: `agent.semanticSummary.landmarkItems[${landmarkItems.length}]`,
            role: node.role,
            ...(node.name ? { name: node.name } : {}),
            ...(node.selector ? { selector: node.selector } : {}),
          });
        }
        pushSemanticOutline({
          kind: "landmark",
          role: node.role,
          text: node.name ?? node.role,
          depth,
          ...(outlineParent ? { parentPath: outlineParent.path, parentRole: outlineParent.role, parentName: outlineParent.text } : {}),
          ...(node.selector ? { selector: node.selector } : {}),
        });
      }
    } else if (node.role && landmarkRoles.has(node.role) && landmarks.length < 8) {
      landmarkCount += 1;
      landmarks.push(node.role);
      landmarkItems.push({
        path: `agent.semanticSummary.landmarkItems[${landmarkItems.length}]`,
        role: node.role,
        ...(node.selector ? { selector: node.selector } : {}),
      });
      pushSemanticOutline({
        kind: "landmark",
        role: node.role,
        text: node.role,
        depth,
        ...(outlineParent ? { parentPath: outlineParent.path, parentRole: outlineParent.role, parentName: outlineParent.text } : {}),
        ...(node.selector ? { selector: node.selector } : {}),
      });
    }
    const nextOutlineParent = semanticOutlineParentForChildren(node, semanticOutline, outlineParent);
    for (const child of node.children) visit(child, depth + 1, nextOutlineParent);
  }

  visit(tree);
  const topRoles = Object.entries(roleCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([role, count]) => ({ role, count }));

  return {
    nodeCount,
    namedRoleCount,
    interactiveCount,
    focusableCount,
    headingCount: roleCounts.heading ?? 0,
    landmarkCount,
    linkCount: roleCounts.link ?? 0,
    buttonCount: roleCounts.button ?? 0,
    imageCount,
    tableCount,
    listCount,
    fieldCount,
    descriptionCount,
    valueCount,
    relationCount,
    choiceCount,
    stateCount,
    unavailableCount,
    roleCounts,
    topRoles,
    landmarks,
    headings,
    namedRoles,
    semanticOutline,
    keyboardItems,
    headingItems,
    landmarkItems,
    namedRoleItems,
    interactiveRoles,
    focusableItems,
    links,
    inPageLinks,
    buttons,
    imageItems,
    tableItems,
    listItems,
    fieldItems,
    descriptionItems,
    valueItems,
    relationItems,
    choiceItems,
    stateItems,
    unavailableItems,
  };
}

function indexSemanticNodesByDomId(tree: SemanticNode): Map<string, SemanticNode> {
  const nodesByDomId = new Map<string, SemanticNode>();
  function visit(node: SemanticNode): void {
    const domId = cleanContentText(node.attributes?.id ?? "").slice(0, 160);
    if (domId && !nodesByDomId.has(domId)) nodesByDomId.set(domId, node);
    for (const child of node.children) visit(child);
  }
  visit(tree);
  return nodesByDomId;
}

function semanticRelationTargets(value: string | undefined): string[] {
  return cleanContentText(value ?? "")
    .split(/\s+/)
    .map((item) => item.trim().slice(0, 160))
    .filter(Boolean);
}

function semanticIdrefText(value: string | undefined, nodesByDomId: Map<string, SemanticNode>): string | undefined {
  const text = semanticRelationTargets(value)
    .map((target) => nodesByDomId.get(target))
    .map((node) => cleanContentText(node?.name || node?.text || "").slice(0, 160))
    .filter(Boolean)
    .join(" ");
  return text || undefined;
}

function semanticIdrefTexts(value: string | undefined, nodesByDomId: Map<string, SemanticNode>, limit: number): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const target of semanticRelationTargets(value)) {
    if (values.length >= limit) break;
    const node = nodesByDomId.get(target);
    const text = cleanContentText(node?.name || node?.text || "").slice(0, 160);
    if (text && !seen.has(text)) {
      seen.add(text);
      values.push(text);
    }
  }
  return values;
}

function semanticIdrefTextsByRole(value: string | undefined, nodesByDomId: Map<string, SemanticNode>, roles: Set<string>, limit: number): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const target of semanticRelationTargets(value)) {
    if (values.length >= limit) break;
    const node = nodesByDomId.get(target);
    if (!node?.role || !roles.has(node.role)) continue;
    const text = cleanContentText(node.name || node.text || "").slice(0, 160);
    if (text && !seen.has(text)) {
      seen.add(text);
      values.push(text);
    }
  }
  return values;
}

function semanticOwnedRefs(node: SemanticNode, nodesByDomId: Map<string, SemanticNode>, limit: number): Array<{ target: string; role?: string; name?: string; selector?: string }> {
  const refs: Array<{ target: string; role?: string; name?: string; selector?: string }> = [];
  for (const target of semanticRelationTargets(node.attributes?.["aria-owns"])) {
    if (refs.length >= limit) break;
    const targetNode = nodesByDomId.get(target);
    refs.push({
      target,
      ...(targetNode ? { role: targetNode.role ?? targetNode.tag } : {}),
      ...(targetNode?.name ? { name: targetNode.name } : {}),
      ...(targetNode?.selector ? { selector: targetNode.selector } : {}),
    });
  }
  return refs;
}

function semanticHeadingLevel(node: SemanticNode): number | undefined {
  const tagMatch = /^h([1-6])$/i.exec(node.tag);
  if (tagMatch) return Number(tagMatch[1]);
  const ariaLevel = node.attributes?.["aria-level"];
  if (!ariaLevel) return undefined;
  const parsed = Number(ariaLevel);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function semanticKeyboardShortcuts(value: string | undefined): string[] {
  return cleanContentText(value ?? "")
    .split(/\s+/)
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);
}

function semanticTabIndex(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function semanticPositiveInteger(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function semanticNonNegativeInteger(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function semanticRelTokens(value: string | undefined): string[] {
  return cleanContentText(value ?? "")
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);
}

function semanticDownloadAttribute(attributes: Record<string, string> | undefined): string | true | undefined {
  if (!attributes || !Object.prototype.hasOwnProperty.call(attributes, "download")) return undefined;
  const value = cleanContentText(attributes.download ?? "").slice(0, 160);
  return value || true;
}

function semanticInPageLink(node: SemanticNode, url: string | null): Omit<AgentSemanticSummary["inPageLinks"][number], "path"> | undefined {
  if (!url) return undefined;
  const targetId = semanticUrlHashId(url);
  const name = cleanContentText(node.name || node.text || url).slice(0, 160);
  if (!targetId) return undefined;
  const kind = /^(skip to|skip|content|main content|본문|콘텐츠|건너뛰기)/i.test(name) ? "skip" : "anchor";
  return {
    kind,
    name: name || targetId,
    url,
    targetId,
    ...(node.selector ? { selector: node.selector } : {}),
  };
}

function semanticUrlHashId(url: string): string | undefined {
  try {
    const hash = new URL(url).hash;
    if (!hash || hash === "#") return undefined;
    return decodeURIComponent(hash.slice(1)).slice(0, 160);
  } catch {
    return undefined;
  }
}

function semanticOutlineParentForChildren(
  node: SemanticNode,
  outline: AgentSemanticSummary["semanticOutline"],
  current?: Pick<AgentSemanticSummary["semanticOutline"][number], "path" | "role" | "text">,
): Pick<AgentSemanticSummary["semanticOutline"][number], "path" | "role" | "text"> | undefined {
  const last = outline.at(-1);
  if (last && last.kind === "landmark" && last.role === node.role && last.text === (node.name || node.role || node.tag)) {
    return { path: last.path, role: last.role, text: last.text };
  }
  return current;
}

function countSemanticDescendantsByRole(node: SemanticNode, roles: Set<string>): number {
  let count = 0;
  function visit(current: SemanticNode): void {
    if (current !== node && current.role && roles.has(current.role)) count += 1;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return count;
}

function semanticDescendantTextsByRole(node: SemanticNode, roles: Set<string>, limit: number): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  function visit(current: SemanticNode): void {
    if (values.length >= limit) return;
    if (current !== node && current.role && roles.has(current.role)) {
      const value = cleanContentText(current.name || current.text || "").slice(0, 160);
      if (value && !seen.has(value)) {
        seen.add(value);
        values.push(value);
      }
    }
    for (const child of current.children) visit(child);
  }
  visit(node);
  return values;
}

function semanticDescendantCellRefs(node: SemanticNode, limit: number, nodesByDomId: Map<string, SemanticNode>): Array<{ text: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string }> {
  const values: Array<{ text: string; rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number; headers?: string[]; rowHeaders?: string[]; columnHeaders?: string[]; selected?: boolean; current?: SemanticNodeState["current"]; selector?: string }> = [];
  const seen = new Set<string>();
  const cellRoles = new Set(["cell", "gridcell"]);
  function visit(current: SemanticNode, rowIndex?: number): void {
    if (values.length >= limit) return;
    const currentRowIndex = semanticPositiveInteger(current.attributes?.["aria-rowindex"]) ?? rowIndex;
    if (current !== node && current.role && cellRoles.has(current.role)) {
      const text = cleanContentText(current.name || current.text || "").slice(0, 160);
      const columnIndex = semanticPositiveInteger(current.attributes?.["aria-colindex"]);
      const rowSpan = semanticPositiveInteger(current.attributes?.["aria-rowspan"] ?? current.attributes?.rowspan);
      const columnSpan = semanticPositiveInteger(current.attributes?.["aria-colspan"] ?? current.attributes?.colspan);
      const headerIds = cleanContentText(current.attributes?.headers ?? "").slice(0, 240);
      const headers = semanticIdrefTexts(headerIds, nodesByDomId, 6);
      const rowHeaders = semanticIdrefTextsByRole(headerIds, nodesByDomId, new Set(["rowheader"]), 6);
      const columnHeaders = semanticIdrefTextsByRole(headerIds, nodesByDomId, new Set(["columnheader"]), 6);
      const key = [text, currentRowIndex ?? "", columnIndex ?? "", rowSpan ?? "", columnSpan ?? "", headers.join("|"), rowHeaders.join("|"), columnHeaders.join("|"), current.state?.selected ?? "", current.state?.current ?? "", current.selector ?? ""].join("\u0000");
      if (text && !seen.has(key)) {
        seen.add(key);
        values.push({
          text,
          ...(typeof currentRowIndex === "number" ? { rowIndex: currentRowIndex } : {}),
          ...(typeof columnIndex === "number" ? { columnIndex } : {}),
          ...(typeof rowSpan === "number" && rowSpan > 1 ? { rowSpan } : {}),
          ...(typeof columnSpan === "number" && columnSpan > 1 ? { columnSpan } : {}),
          ...(headers.length > 0 ? { headers } : {}),
          ...(rowHeaders.length > 0 ? { rowHeaders } : {}),
          ...(columnHeaders.length > 0 ? { columnHeaders } : {}),
          ...(typeof current.state?.selected === "boolean" ? { selected: current.state.selected } : {}),
          ...(typeof current.state?.current !== "undefined" ? { current: current.state.current } : {}),
          ...(current.selector ? { selector: current.selector } : {}),
        });
      }
    }
    for (const child of current.children) visit(child, currentRowIndex);
  }
  visit(node);
  return values;
}

function semanticDescendantHeaderRefs(node: SemanticNode, limit: number): Array<{ text: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }> {
  const values: Array<{ text: string; role?: string; rowIndex?: number; columnIndex?: number; sort?: string; selector?: string }> = [];
  const seen = new Set<string>();
  const headerRoles = new Set(["columnheader", "rowheader"]);
  function visit(current: SemanticNode, rowIndex?: number): void {
    if (values.length >= limit) return;
    const currentRowIndex = semanticPositiveInteger(current.attributes?.["aria-rowindex"]) ?? rowIndex;
    if (current !== node && current.role && headerRoles.has(current.role)) {
      const text = cleanContentText(current.name || current.text || "").slice(0, 160);
      const columnIndex = semanticPositiveInteger(current.attributes?.["aria-colindex"]);
      const sort = current.state?.sort;
      const key = [text, current.role, currentRowIndex ?? "", columnIndex ?? "", sort ?? "", current.selector ?? ""].join("\u0000");
      if (text && !seen.has(key)) {
        seen.add(key);
        values.push({
          text,
          role: current.role,
          ...(typeof currentRowIndex === "number" ? { rowIndex: currentRowIndex } : {}),
          ...(typeof columnIndex === "number" ? { columnIndex } : {}),
          ...(sort ? { sort } : {}),
          ...(current.selector ? { selector: current.selector } : {}),
        });
      }
    }
    for (const child of current.children) visit(child, currentRowIndex);
  }
  visit(node);
  return values;
}

function semanticDescendantListItemRefs(node: SemanticNode, limit: number): Array<{ text: string; role?: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: SemanticNodeState["current"]; expanded?: boolean; selector?: string }> {
  const values: Array<{ text: string; role?: string; level?: number; posInSet?: number; setSize?: number; selected?: boolean; current?: SemanticNodeState["current"]; expanded?: boolean; selector?: string }> = [];
  const seen = new Set<string>();
  const itemRoles = new Set(["listitem", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "tab", "treeitem"]);
  function visit(current: SemanticNode): void {
    if (values.length >= limit) return;
    if (current !== node && current.role && itemRoles.has(current.role)) {
      const text = cleanContentText(current.name || current.text || "").slice(0, 160);
      const level = semanticPositiveInteger(current.attributes?.["aria-level"]);
      const posInSet = semanticPositiveInteger(current.attributes?.["aria-posinset"]);
      const setSize = semanticPositiveInteger(current.attributes?.["aria-setsize"]);
      const key = [text, current.role, level ?? "", posInSet ?? "", setSize ?? "", current.state?.selected ?? "", current.state?.current ?? "", current.state?.expanded ?? "", current.selector ?? ""].join("\u0000");
      if (text && !seen.has(key)) {
        seen.add(key);
        values.push({
          text,
          role: current.role,
          ...(typeof level === "number" ? { level } : {}),
          ...(typeof posInSet === "number" ? { posInSet } : {}),
          ...(typeof setSize === "number" ? { setSize } : {}),
          ...(typeof current.state?.selected === "boolean" ? { selected: current.state.selected } : {}),
          ...(typeof current.state?.current !== "undefined" ? { current: current.state.current } : {}),
          ...(typeof current.state?.expanded === "boolean" ? { expanded: current.state.expanded } : {}),
          ...(current.selector ? { selector: current.selector } : {}),
        });
      }
    }
    for (const child of current.children) visit(child);
  }
  visit(node);
  return values;
}

function summarizeAgent(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  recommendedResult?: ResultSummary,
  error?: { code: CliErrorCode; message: string; status?: number },
  capturedHtml = false,
  sourceSearch?: SourceSearchSummary,
  fetched?: FetchResult,
  requestUrl?: string,
  agentMode = false,
  findQueries: string[] = [],
  timeoutMs?: number,
  userAgent?: string,
  semanticSummary?: AgentSemanticSummary,
): AgentSummary {
  const diagnosticCodes = analysis.diagnostics.map((diagnostic) => diagnostic.code);
  const primaryAction = primaryAgentAction(analysis, pageCheck, verification);
  const hasUsableSearchResults = analysis.kind === "search-results" && results.length > 0;
  const blockedOrEmpty = analysis.kind === "blocked-page" || analysis.kind === "empty";
  const primaryReadsCurrentPayload = primaryAction ? actionExecution(primaryAction) === "read-current" : false;
  const needsBrowserHtml = (Boolean(error) && !(error?.code === "NO_INSPECTABLE_CONTENT" && primaryReadsCurrentPayload))
    || (!capturedHtml && blockedOrEmpty && !primaryReadsCurrentPayload)
    || primaryAction?.action === "retry-with-browser-html";
  const canUseFetchedHtml = !needsBrowserHtml && (!blockedOrEmpty || primaryReadsCurrentPayload) && (capturedHtml || hasUsableSearchResults || verification.status === "matched" || pageCheck.readability.level !== "low" || primaryReadsCurrentPayload);
  const status = agentStatus(analysis, pageCheck, verification, needsBrowserHtml, error);
  const summary = agentSummaryText(status, analysis, pageCheck, verification, recommendedResult);
  const diagnosticCounts = countDiagnosticsBySeverity(analysis.diagnostics);
  const readTargets = summarizeAgentReadTargets(primaryAction, analysis.kind, pageCheck, verification, results, sourceSearch, semanticSummary);
  const bestReadTarget = selectBestReadTarget(readTargets);
  const bestStructuredReadTarget = selectBestStructuredReadTarget(readTargets);
  const bestHiddenReadTarget = selectBestHiddenReadTarget(readTargets);
  const hiddenSignalCount = countHiddenAgentPageCheckSignals(pageCheck);
  const hiddenHydrationCount = pageCheck.hydration.length;
  const hiddenApiEndpointCount = pageCheck.apiEndpoints.length;
  const hiddenClientStateCount = pageCheck.clientState.length;
  const hiddenAppHintCount = pageCheck.appHints.length;
  const topHydration = pageCheck.hydration[0];
  const topApiEndpoint = pageCheck.apiEndpoints[0];
  const topClientState = pageCheck.clientState[0];
  const topAppHint = pageCheck.appHints[0];
  const topHiddenSignal = selectTopHiddenAgentPageCheckSignal(pageCheck);
  const structuredReadTargetCount = countStructuredAgentReadTargets(readTargets);
  const hiddenReadTargetCount = countHiddenAgentReadTargets(readTargets);
  const citations = summarizeAgentCitations(analysis.kind, pageCheck, verification, primaryAction, recommendedResult, sourceSearch);
  const searchDecision = summarizeAgentSearchDecision(analysis, results, recommendedResult, primaryAction);
  const pageDecision = summarizeAgentPageDecision(analysis, pageCheck, primaryAction);
  const resultChoices = summarizeAgentResultChoices(hasUsableSearchResults ? results : [], recommendedResult, primaryAction, sourceSearch);
  const sourceChoices = summarizeAgentSourceChoices(analysis.kind, pageCheck.sourceLinks, primaryAction, agentMode, findQueries, timeoutMs, userAgent);
  const formChoices = summarizeAgentFormChoices(pageCheck.forms);
  const topFormChoice = formChoices[0];
  const topFormChoiceFirstField = topFormChoice?.fields[0];
  const actionTargetChoices = summarizeAgentActionTargetChoices(pageCheck.actionTargets);
  const topChoice = summarizeAgentTopChoice(resultChoices, sourceChoices, formChoices, actionTargetChoices);
  const topBarrier = primaryBlockingBarrier(pageCheck.barriers) ?? pageCheck.barriers[0];
  const next = summarizeAgentNext(primaryAction, readTargets, agentReadValue(primaryAction, pageCheck, verification, results, sourceSearch, semanticSummary));
  const expectedOutcome = summarizeAgentExpectedOutcome(primaryAction);
  const answerPlan = summarizeAgentAnswerPlan(status, primaryAction, pageCheck, verification, citations, needsBrowserHtml, error);
  const browserHtmlReason = summarizeBrowserHtmlReason(needsBrowserHtml, answerPlan, primaryAction);
  const staticReadiness = summarizeStaticReadiness(canUseFetchedHtml, needsBrowserHtml, pageCheck, primaryAction, error);
  const answerEvidence = summarizeAgentAnswerEvidence(citations, answerPlan);
  const executionPlan = summarizeAgentExecutionPlan(next, expectedOutcome, answerPlan, canUseFetchedHtml, needsBrowserHtml);
  const runbook = summarizeAgentRunbook(next, executionPlan, answerPlan);
  const browserHtmlReasonCode = summarizeBrowserHtmlReasonCode(needsBrowserHtml, analysis, primaryAction, error);
  const actions = summarizeAgentActions(analysis, pageCheck, verification, primaryAction);
  const alternativeAction = actions.find((action) => !action.primary);
  const evidenceQualityScore = averageEvidenceScore(pageCheck.contentEvidence);
  const sourceQualityScore = agentSourceQualityScore(analysis.kind, pageCheck.sourceLinks, results, recommendedResult);
  const usabilityScore = agentUsabilityScore(status, pageCheck, verification, hasUsableSearchResults ? results : [], needsBrowserHtml, error);
  const signals = summarizeAgentSignals(status, analysis, pageCheck, verification, hasUsableSearchResults ? results : [], needsBrowserHtml, fetched, error);
  const qualityGates = summarizeAgentQualityGates(status, analysis, pageCheck, verification, hasUsableSearchResults ? results : [], needsBrowserHtml, error, usabilityScore, evidenceQualityScore, sourceQualityScore);
  const signalCounts = countAgentSignalsBySeverity(signals);
  const topSignal = signals[0];
  const topQualityGate = qualityGates[0];
  const problemSignal = signals.find((signal) => signal.severity === "error" || signal.severity === "warning");
  const failingQualityGate = qualityGates.find((gate) => !gate.pass);
  const sourceSearchAgent = compactAgentSourceSearch(sourceSearch);
  const sourceSearchSelectedResult = sourceSearchAgent?.selectedResult;
  const sourceSearchAlternateResult = sourceSearchAgent?.alternateResults?.[0];
  const handoff = summarizeAgentHandoff(next, executionPlan, answerPlan, answerEvidence, resultChoices, sourceChoices, sourceSearchAgent, signals, qualityGates, verification.foundQueries, verification.missingQueries);
  const executor = summarizeAgentExecutor(next, executionPlan, answerPlan, handoff);
  const topSemanticHeading = semanticSummary?.headingItems[0];
  const topSemanticLandmark = semanticSummary?.landmarkItems[0];
  const topSemanticOutline = semanticSummary?.semanticOutline[0];
  const topSemanticKeyboardShortcut = semanticSummary?.keyboardItems[0];
  const topSemanticNamedRole = semanticSummary?.namedRoleItems[0];
  const topSemanticInteractive = semanticSummary?.interactiveRoles[0];
  const topSemanticInteractiveState = formatSemanticState(topSemanticInteractive?.state);
  const topSemanticFocusable = semanticSummary?.focusableItems[0];
  const topSemanticFocusableState = formatSemanticState(topSemanticFocusable?.state);
  const topSemanticInPageLink = semanticSummary?.inPageLinks[0];
  const topSemanticImage = semanticSummary?.imageItems[0];
  const topSemanticTable = semanticSummary?.tableItems[0];
  const topSemanticTableFirstHeaderRef = topSemanticTable?.headerRefs?.[0];
  const topSemanticTableFirstOwnedRef = topSemanticTable?.ownedRefs?.[0];
  const topSemanticTableFirstSampleCellRef = topSemanticTable?.sampleCellRefs?.[0];
  const topSemanticSelectedTableCellRef = topSemanticTable?.sampleCellRefs?.find((item) => item.selected === true)
    ?? topSemanticTable?.sampleCellRefs?.find((item) => typeof item.current !== "undefined");
  const topSemanticList = semanticSummary?.listItems[0];
  const topSemanticListFirstItemRef = topSemanticList?.itemRefs?.[0];
  const topSemanticField = semanticSummary?.fieldItems[0];
  const topSemanticFieldState = formatSemanticState(topSemanticField?.state);
  const topSemanticDescription = semanticSummary?.descriptionItems[0];
  const topSemanticValue = semanticSummary?.valueItems[0];
  const topSemanticRelation = semanticSummary?.relationItems[0];
  const topSemanticChoice = semanticSummary?.choiceItems[0];
  const topSemanticChoiceState = formatSemanticState(topSemanticChoice?.state);
  const topSemanticSelectedChoice = semanticSummary?.choiceItems.find((item) => item.state?.selected === true)
    ?? semanticSummary?.choiceItems.find((item) => typeof item.state?.current !== "undefined");
  const topSemanticSelectedChoiceState = formatSemanticState(topSemanticSelectedChoice?.state);
  const topSemanticSelectedChoiceControlsRelation = topSemanticSelectedChoice?.state?.controls
    ? semanticSummary?.relationItems.find((item) =>
        item.relation === "controls"
        && item.target === topSemanticSelectedChoice.state?.controls
        && item.role === topSemanticSelectedChoice.role
        && item.name === topSemanticSelectedChoice.name
      )
    : undefined;
  const topSemanticState = semanticSummary?.stateItems[0];
  const topSemanticModalState = semanticSummary?.stateItems.find((item) => item.stateRaw?.modal === true);
  const topSemanticLiveState = semanticSummary?.stateItems.find((item) => item.stateRaw?.live);
  const topSemanticUnavailable = semanticSummary?.unavailableItems[0];
  const agent: AgentSummary = {
    contract: agentContract,
    status,
    pageKind: analysis.kind,
    ...(fetched?.page.title ? { pageTitle: fetched.page.title } : {}),
    ...(fetched?.page.canonicalUrl ? { pageCanonicalUrl: fetched.page.canonicalUrl } : {}),
    ...(fetched?.page.lang ? { pageLang: fetched.page.lang } : {}),
    ...(fetched?.page.dir ? { pageDir: fetched.page.dir } : {}),
    ...(fetched?.page.siteName ? { pageSiteName: fetched.page.siteName } : {}),
    ...(fetched?.page.author ? { pageAuthor: fetched.page.author } : {}),
    ...(fetched?.page.publishedTime ? { pagePublishedTime: fetched.page.publishedTime } : {}),
    ...(fetched?.page.modifiedTime ? { pageModifiedTime: fetched.page.modifiedTime } : {}),
    ...(fetched?.page.structuredDataTypes?.length ? { pageStructuredDataTypes: fetched.page.structuredDataTypes } : {}),
    summary,
    routingIntent: agentRoutingIntent(primaryAction),
    continuationMode: agentContinuationMode(primaryAction),
    next,
    runbook,
    runbookDecision: runbook.decision,
    runbookMode: runbook.mode,
    runbookOperation: runbook.operation,
    ...(runbook.action ? { runbookActionName: runbook.action } : {}),
    runbookReason: runbook.reason,
    runbookConfidence: runbook.confidence,
    runbookAnswerStatus: runbook.answerStatus,
    runbookAnswerReady: runbook.answerReady,
    runbookShouldContinue: runbook.shouldContinue,
    runbookTerminal: runbook.terminal,
    runbookMaxSuggestedIterations: runbook.maxSuggestedIterations,
    runbookExpectedOutcome: runbook.expectedOutcome,
    ...(runbook.readFrom ? { runbookReadFrom: runbook.readFrom } : {}),
    ...(runbook.commandArgs ? { runbookCommandArgs: runbook.commandArgs } : {}),
    ...(runbook.url ? { runbookUrl: runbook.url } : {}),
    ...(next.action ? { nextActionName: next.action } : {}),
    ...(next.execution ? { nextExecution: next.execution } : {}),
    ...(next.command ? { nextCommand: next.command } : {}),
    ...(next.commandArgs ? { nextCommandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { nextAfterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { nextAfterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.readFrom ? { nextReadFrom: next.readFrom } : {}),
    ...(next.url ? { nextUrl: next.url } : {}),
    executor,
    handoff,
    expectedOutcome,
    executionPlan,
    expectedOutcomeKind: expectedOutcome.kind,
    expectedOutcomeMessage: expectedOutcome.message,
    executionPlanOperation: executionPlan.operation,
    executionPlanConfidence: executionPlan.confidence,
    executionPlanReason: executionPlan.reason,
    executionPlanAnswerReady: executionPlan.answerReady,
    executionPlanShouldContinue: executionPlan.shouldContinue,
    executionPlanTerminal: executionPlan.terminal,
    executionPlanExpectedOutcome: executionPlan.expectedOutcome,
    ...(executionPlan.readFrom ? { executionPlanReadFrom: executionPlan.readFrom } : {}),
    ...(executionPlan.commandArgs ? { executionPlanCommandArgs: executionPlan.commandArgs } : {}),
    ...(executionPlan.afterInteractionCommand ? { executionPlanAfterInteractionCommand: executionPlan.afterInteractionCommand } : {}),
    ...(executionPlan.afterInteractionCommandArgs ? { executionPlanAfterInteractionCommandArgs: executionPlan.afterInteractionCommandArgs } : {}),
    ...(executionPlan.url ? { executionPlanUrl: executionPlan.url } : {}),
    answerPlan,
    ...(searchDecision ? { searchDecision } : {}),
    ...(pageDecision ? { pageDecision } : {}),
    ...(searchDecision ? { searchDecisionName: searchDecision.decision } : {}),
    ...(searchDecision ? { searchDecisionConfidence: searchDecision.confidence } : {}),
    ...(searchDecision ? { searchDecisionReason: searchDecision.reason } : {}),
    ...(searchDecision ? { searchDecisionResultCount: searchDecision.resultCount } : {}),
    ...(searchDecision ? { searchDecisionHighRelevanceCount: searchDecision.highRelevanceCount } : {}),
    ...(searchDecision ? { searchDecisionMediumRelevanceCount: searchDecision.mediumRelevanceCount } : {}),
    ...(searchDecision ? { searchDecisionLowRelevanceCount: searchDecision.lowRelevanceCount } : {}),
    ...(searchDecision ? { searchDecisionOfficialCount: searchDecision.officialCount } : {}),
    ...(searchDecision ? { searchDecisionFindMatchCount: searchDecision.findMatchCount } : {}),
    ...(typeof searchDecision?.recommendedRank === "number" ? { searchDecisionRecommendedRank: searchDecision.recommendedRank } : {}),
    ...(searchDecision?.recommendedUrl ? { searchDecisionRecommendedUrl: searchDecision.recommendedUrl } : {}),
    ...(searchDecision?.commandArgs ? { searchDecisionCommandArgs: searchDecision.commandArgs } : {}),
    ...(pageDecision ? { pageDecisionName: pageDecision.decision } : {}),
    ...(pageDecision ? { pageDecisionConfidence: pageDecision.confidence } : {}),
    ...(pageDecision ? { pageDecisionReason: pageDecision.reason } : {}),
    ...(pageDecision?.readFrom ? { pageDecisionReadFrom: pageDecision.readFrom } : {}),
    ...(pageDecision?.url ? { pageDecisionUrl: pageDecision.url } : {}),
    ...(pageDecision?.commandArgs ? { pageDecisionCommandArgs: pageDecision.commandArgs } : {}),
    ...(semanticSummary ? { semanticSummary } : {}),
    ...(semanticSummary ? { semanticNodeCount: semanticSummary.nodeCount } : {}),
    ...(semanticSummary ? { semanticNamedRoleCount: semanticSummary.namedRoleCount } : {}),
    ...(semanticSummary ? { semanticInteractiveCount: semanticSummary.interactiveCount } : {}),
    ...(semanticSummary ? { semanticFocusableCount: semanticSummary.focusableCount } : {}),
    ...(semanticSummary ? { semanticHeadingCount: semanticSummary.headingCount } : {}),
    ...(semanticSummary ? { semanticLandmarkCount: semanticSummary.landmarkCount } : {}),
    ...(semanticSummary ? { semanticLinkCount: semanticSummary.linkCount } : {}),
    ...(semanticSummary ? { semanticButtonCount: semanticSummary.buttonCount } : {}),
    ...(semanticSummary ? { semanticImageCount: semanticSummary.imageCount } : {}),
    ...(semanticSummary ? { semanticTableCount: semanticSummary.tableCount } : {}),
    ...(semanticSummary ? { semanticListCount: semanticSummary.listCount } : {}),
    ...(semanticSummary ? { semanticFieldCount: semanticSummary.fieldCount } : {}),
    ...(semanticSummary ? { semanticDescriptionCount: semanticSummary.descriptionCount } : {}),
    ...(semanticSummary ? { semanticValueCount: semanticSummary.valueCount } : {}),
    ...(semanticSummary ? { semanticRelationCount: semanticSummary.relationCount } : {}),
    ...(semanticSummary ? { semanticChoiceCount: semanticSummary.choiceCount } : {}),
    ...(semanticSummary ? { semanticStateCount: semanticSummary.stateCount } : {}),
    ...(semanticSummary ? { semanticUnavailableCount: semanticSummary.unavailableCount } : {}),
    ...(semanticSummary?.topRoles[0] ? { semanticTopRole: semanticSummary.topRoles[0].role } : {}),
    ...(semanticSummary?.topRoles[0] ? { semanticTopRoleCount: semanticSummary.topRoles[0].count } : {}),
    ...(semanticSummary ? { semanticOutlineCount: semanticSummary.semanticOutline.length } : {}),
    ...(topSemanticOutline ? { semanticTopOutlinePath: topSemanticOutline.path } : {}),
    ...(topSemanticOutline ? { semanticTopOutlineKind: topSemanticOutline.kind } : {}),
    ...(topSemanticOutline ? { semanticTopOutlineRole: topSemanticOutline.role } : {}),
    ...(topSemanticOutline ? { semanticTopOutlineText: topSemanticOutline.text } : {}),
    ...(typeof topSemanticOutline?.level === "number" ? { semanticTopOutlineLevel: topSemanticOutline.level } : {}),
    ...(typeof topSemanticOutline?.depth === "number" ? { semanticTopOutlineDepth: topSemanticOutline.depth } : {}),
    ...(topSemanticOutline?.parentPath ? { semanticTopOutlineParentPath: topSemanticOutline.parentPath } : {}),
    ...(topSemanticOutline?.parentRole ? { semanticTopOutlineParentRole: topSemanticOutline.parentRole } : {}),
    ...(topSemanticOutline?.parentName ? { semanticTopOutlineParentName: topSemanticOutline.parentName } : {}),
    ...(topSemanticOutline?.selector ? { semanticTopOutlineSelector: topSemanticOutline.selector } : {}),
    ...(semanticSummary ? { semanticKeyboardShortcutCount: semanticSummary.keyboardItems.length } : {}),
    ...(topSemanticKeyboardShortcut ? { semanticTopKeyboardShortcutPath: topSemanticKeyboardShortcut.path } : {}),
    ...(topSemanticKeyboardShortcut ? { semanticTopKeyboardShortcutRole: topSemanticKeyboardShortcut.role } : {}),
    ...(topSemanticKeyboardShortcut?.name ? { semanticTopKeyboardShortcutName: topSemanticKeyboardShortcut.name } : {}),
    ...(topSemanticKeyboardShortcut?.shortcuts?.length ? { semanticTopKeyboardShortcutKeys: topSemanticKeyboardShortcut.shortcuts } : {}),
    ...(topSemanticKeyboardShortcut?.accessKey ? { semanticTopKeyboardShortcutAccessKey: topSemanticKeyboardShortcut.accessKey } : {}),
    ...(typeof topSemanticKeyboardShortcut?.tabIndex === "number" ? { semanticTopKeyboardShortcutTabIndex: topSemanticKeyboardShortcut.tabIndex } : {}),
    ...(typeof topSemanticKeyboardShortcut?.focusable === "boolean" ? { semanticTopKeyboardShortcutFocusable: topSemanticKeyboardShortcut.focusable } : {}),
    ...(topSemanticKeyboardShortcut?.selector ? { semanticTopKeyboardShortcutSelector: topSemanticKeyboardShortcut.selector } : {}),
    ...(semanticSummary?.headings[0] ? { semanticTopHeading: semanticSummary.headings[0] } : {}),
    ...(topSemanticHeading ? { semanticTopHeadingPath: topSemanticHeading.path } : {}),
    ...(typeof topSemanticHeading?.level === "number" ? { semanticTopHeadingLevel: topSemanticHeading.level } : {}),
    ...(semanticSummary?.landmarks[0] ? { semanticTopLandmark: semanticSummary.landmarks[0] } : {}),
    ...(topSemanticLandmark ? { semanticTopLandmarkPath: topSemanticLandmark.path } : {}),
    ...(topSemanticLandmark ? { semanticTopLandmarkRole: topSemanticLandmark.role } : {}),
    ...(topSemanticLandmark?.name ? { semanticTopLandmarkName: topSemanticLandmark.name } : {}),
    ...(semanticSummary?.namedRoles[0] ? { semanticTopNamedRole: semanticSummary.namedRoles[0] } : {}),
    ...(topSemanticNamedRole ? { semanticTopNamedRolePath: topSemanticNamedRole.path } : {}),
    ...(topSemanticNamedRole ? { semanticTopNamedRoleRole: topSemanticNamedRole.role } : {}),
    ...(topSemanticNamedRole?.name ? { semanticTopNamedRoleName: topSemanticNamedRole.name } : {}),
    ...(topSemanticNamedRole?.roleDescription ? { semanticTopNamedRoleDescription: topSemanticNamedRole.roleDescription } : {}),
    ...(topSemanticInteractive ? { semanticTopInteractiveRole: topSemanticInteractive.role } : {}),
    ...(topSemanticInteractive ? { semanticTopInteractivePath: topSemanticInteractive.path } : {}),
    ...(topSemanticInteractive?.name ? { semanticTopInteractiveName: topSemanticInteractive.name } : {}),
    ...(topSemanticInteractive?.roleDescription ? { semanticTopInteractiveRoleDescription: topSemanticInteractive.roleDescription } : {}),
    ...(topSemanticInteractive?.description ? { semanticTopInteractiveDescription: topSemanticInteractive.description } : {}),
    ...(topSemanticInteractive?.value ? { semanticTopInteractiveValue: topSemanticInteractive.value } : {}),
    ...(topSemanticInteractiveState ? { semanticTopInteractiveState: topSemanticInteractiveState } : {}),
    ...(typeof topSemanticInteractive?.state?.disabled === "boolean" ? { semanticTopInteractiveDisabled: topSemanticInteractive.state.disabled } : {}),
    ...(typeof topSemanticInteractive?.state?.pressed !== "undefined" ? { semanticTopInteractivePressed: topSemanticInteractive.state.pressed } : {}),
    ...(typeof topSemanticInteractive?.state?.expanded === "boolean" ? { semanticTopInteractiveExpanded: topSemanticInteractive.state.expanded } : {}),
    ...(typeof topSemanticInteractive?.state?.haspopup !== "undefined" ? { semanticTopInteractiveHaspopup: topSemanticInteractive.state.haspopup } : {}),
    ...(topSemanticInteractive?.state?.controls ? { semanticTopInteractiveControls: topSemanticInteractive.state.controls } : {}),
    ...(topSemanticInteractive?.selector ? { semanticTopInteractiveSelector: topSemanticInteractive.selector } : {}),
    ...(topSemanticFocusable ? { semanticTopFocusableRole: topSemanticFocusable.role } : {}),
    ...(topSemanticFocusable ? { semanticTopFocusablePath: topSemanticFocusable.path } : {}),
    ...(topSemanticFocusable?.name ? { semanticTopFocusableName: topSemanticFocusable.name } : {}),
    ...(topSemanticFocusable?.roleDescription ? { semanticTopFocusableRoleDescription: topSemanticFocusable.roleDescription } : {}),
    ...(topSemanticFocusableState ? { semanticTopFocusableState: topSemanticFocusableState } : {}),
    ...(typeof topSemanticFocusable?.state?.disabled === "boolean" ? { semanticTopFocusableDisabled: topSemanticFocusable.state.disabled } : {}),
    ...(typeof topSemanticFocusable?.state?.pressed !== "undefined" ? { semanticTopFocusablePressed: topSemanticFocusable.state.pressed } : {}),
    ...(typeof topSemanticFocusable?.state?.expanded === "boolean" ? { semanticTopFocusableExpanded: topSemanticFocusable.state.expanded } : {}),
    ...(typeof topSemanticFocusable?.state?.haspopup !== "undefined" ? { semanticTopFocusableHaspopup: topSemanticFocusable.state.haspopup } : {}),
    ...(topSemanticFocusable?.state?.controls ? { semanticTopFocusableControls: topSemanticFocusable.state.controls } : {}),
    ...(topSemanticFocusable?.selector ? { semanticTopFocusableSelector: topSemanticFocusable.selector } : {}),
    ...(semanticSummary?.links[0]?.name ? { semanticTopLinkName: semanticSummary.links[0].name } : {}),
    ...(semanticSummary?.links[0] ? { semanticTopLinkPath: semanticSummary.links[0].path } : {}),
    ...(semanticSummary?.links[0]?.url ? { semanticTopLinkUrl: semanticSummary.links[0].url } : {}),
    ...(semanticSummary?.links[0]?.target ? { semanticTopLinkTarget: semanticSummary.links[0].target } : {}),
    ...(semanticSummary?.links[0]?.rel?.length ? { semanticTopLinkRel: semanticSummary.links[0].rel } : {}),
    ...(semanticSummary?.links[0]?.type ? { semanticTopLinkType: semanticSummary.links[0].type } : {}),
    ...(semanticSummary?.links[0]?.hreflang ? { semanticTopLinkHreflang: semanticSummary.links[0].hreflang } : {}),
    ...(semanticSummary?.links[0]?.state ? { semanticTopLinkState: semanticSummary.links[0].state } : {}),
    ...(typeof semanticSummary?.links[0]?.current !== "undefined" ? { semanticTopLinkCurrent: semanticSummary.links[0].current } : {}),
    ...(semanticSummary?.links[0]?.download ? { semanticTopLinkDownload: semanticSummary.links[0].download } : {}),
    ...(semanticSummary?.links[0]?.selector ? { semanticTopLinkSelector: semanticSummary.links[0].selector } : {}),
    ...(semanticSummary ? { semanticInPageLinkCount: semanticSummary.inPageLinks.length } : {}),
    ...(topSemanticInPageLink ? { semanticTopInPageLinkPath: topSemanticInPageLink.path } : {}),
    ...(topSemanticInPageLink ? { semanticTopInPageLinkKind: topSemanticInPageLink.kind } : {}),
    ...(topSemanticInPageLink ? { semanticTopInPageLinkName: topSemanticInPageLink.name } : {}),
    ...(topSemanticInPageLink ? { semanticTopInPageLinkUrl: topSemanticInPageLink.url } : {}),
    ...(topSemanticInPageLink?.targetId ? { semanticTopInPageLinkTargetId: topSemanticInPageLink.targetId } : {}),
    ...(topSemanticInPageLink?.selector ? { semanticTopInPageLinkSelector: topSemanticInPageLink.selector } : {}),
    ...(semanticSummary?.buttons[0]?.name ? { semanticTopButtonName: semanticSummary.buttons[0].name } : {}),
    ...(semanticSummary?.buttons[0] ? { semanticTopButtonPath: semanticSummary.buttons[0].path } : {}),
    ...(semanticSummary?.buttons[0]?.roleDescription ? { semanticTopButtonRoleDescription: semanticSummary.buttons[0].roleDescription } : {}),
    ...(semanticSummary?.buttons[0]?.description ? { semanticTopButtonDescription: semanticSummary.buttons[0].description } : {}),
    ...(semanticSummary?.buttons[0]?.type ? { semanticTopButtonType: semanticSummary.buttons[0].type } : {}),
    ...(semanticSummary?.buttons[0]?.state ? { semanticTopButtonState: semanticSummary.buttons[0].state } : {}),
    ...(typeof semanticSummary?.buttons[0]?.disabled === "boolean" ? { semanticTopButtonDisabled: semanticSummary.buttons[0].disabled } : {}),
    ...(typeof semanticSummary?.buttons[0]?.pressed !== "undefined" ? { semanticTopButtonPressed: semanticSummary.buttons[0].pressed } : {}),
    ...(typeof semanticSummary?.buttons[0]?.expanded === "boolean" ? { semanticTopButtonExpanded: semanticSummary.buttons[0].expanded } : {}),
    ...(typeof semanticSummary?.buttons[0]?.haspopup !== "undefined" ? { semanticTopButtonHaspopup: semanticSummary.buttons[0].haspopup } : {}),
    ...(semanticSummary?.buttons[0]?.controls ? { semanticTopButtonControls: semanticSummary.buttons[0].controls } : {}),
    ...(semanticSummary?.buttons[0]?.formAction ? { semanticTopButtonFormAction: semanticSummary.buttons[0].formAction } : {}),
    ...(semanticSummary?.buttons[0]?.formMethod ? { semanticTopButtonFormMethod: semanticSummary.buttons[0].formMethod } : {}),
    ...(semanticSummary?.buttons[0]?.formTarget ? { semanticTopButtonFormTarget: semanticSummary.buttons[0].formTarget } : {}),
    ...(semanticSummary?.buttons[0]?.formEncType ? { semanticTopButtonFormEncType: semanticSummary.buttons[0].formEncType } : {}),
    ...(typeof semanticSummary?.buttons[0]?.formNoValidate === "boolean" ? { semanticTopButtonFormNoValidate: semanticSummary.buttons[0].formNoValidate } : {}),
    ...(semanticSummary?.buttons[0]?.formId ? { semanticTopButtonFormId: semanticSummary.buttons[0].formId } : {}),
    ...(semanticSummary?.buttons[0]?.selector ? { semanticTopButtonSelector: semanticSummary.buttons[0].selector } : {}),
    ...(topSemanticImage ? { semanticTopImagePath: topSemanticImage.path } : {}),
    ...(topSemanticImage?.name ? { semanticTopImageName: topSemanticImage.name } : {}),
    ...(topSemanticImage?.url ? { semanticTopImageUrl: topSemanticImage.url } : {}),
    ...(typeof topSemanticImage?.width === "number" ? { semanticTopImageWidth: topSemanticImage.width } : {}),
    ...(typeof topSemanticImage?.height === "number" ? { semanticTopImageHeight: topSemanticImage.height } : {}),
    ...(topSemanticImage?.loading ? { semanticTopImageLoading: topSemanticImage.loading } : {}),
    ...(topSemanticImage?.decoding ? { semanticTopImageDecoding: topSemanticImage.decoding } : {}),
    ...(topSemanticImage?.srcset ? { semanticTopImageSrcset: topSemanticImage.srcset } : {}),
    ...(topSemanticImage?.sizes ? { semanticTopImageSizes: topSemanticImage.sizes } : {}),
    ...(topSemanticImage?.selector ? { semanticTopImageSelector: topSemanticImage.selector } : {}),
    ...(topSemanticTable ? { semanticTopTableRole: topSemanticTable.role } : {}),
    ...(topSemanticTable ? { semanticTopTablePath: topSemanticTable.path } : {}),
    ...(topSemanticTable?.name ? { semanticTopTableName: topSemanticTable.name } : {}),
    ...(topSemanticTable ? { semanticTopTableRowCount: topSemanticTable.rowCount } : {}),
    ...(topSemanticTable ? { semanticTopTableCellCount: topSemanticTable.cellCount } : {}),
    ...(typeof topSemanticTable?.declaredRowCount === "number" ? { semanticTopTableDeclaredRowCount: topSemanticTable.declaredRowCount } : {}),
    ...(typeof topSemanticTable?.declaredColumnCount === "number" ? { semanticTopTableDeclaredColumnCount: topSemanticTable.declaredColumnCount } : {}),
    ...(topSemanticTable?.headers?.length ? { semanticTopTableHeaders: topSemanticTable.headers } : {}),
    ...(topSemanticTable?.headerRefs?.length ? { semanticTopTableHeaderRefs: topSemanticTable.headerRefs } : {}),
    ...(topSemanticTable?.ownedRefs?.length ? { semanticTopTableOwnedCount: topSemanticTable.ownedRefs.length } : {}),
    ...(topSemanticTable?.ownedRefs?.length ? { semanticTopTableOwnedRefs: topSemanticTable.ownedRefs } : {}),
    ...(topSemanticTable?.sampleCells?.length ? { semanticTopTableSampleCells: topSemanticTable.sampleCells } : {}),
    ...(topSemanticTable?.sampleCellRefs?.length ? { semanticTopTableSampleCellRefs: topSemanticTable.sampleCellRefs } : {}),
    ...(topSemanticTable?.headers?.[0] ? { semanticTopTableFirstHeader: topSemanticTable.headers[0] } : {}),
    ...(topSemanticTableFirstHeaderRef?.path ? { semanticTopTableFirstHeaderPath: topSemanticTableFirstHeaderRef.path } : {}),
    ...(topSemanticTableFirstHeaderRef?.role ? { semanticTopTableFirstHeaderRole: topSemanticTableFirstHeaderRef.role } : {}),
    ...(typeof topSemanticTableFirstHeaderRef?.rowIndex === "number" ? { semanticTopTableFirstHeaderRowIndex: topSemanticTableFirstHeaderRef.rowIndex } : {}),
    ...(typeof topSemanticTableFirstHeaderRef?.columnIndex === "number" ? { semanticTopTableFirstHeaderColumnIndex: topSemanticTableFirstHeaderRef.columnIndex } : {}),
    ...(topSemanticTableFirstHeaderRef?.sort ? { semanticTopTableFirstHeaderSort: topSemanticTableFirstHeaderRef.sort } : {}),
    ...(topSemanticTableFirstHeaderRef?.selector ? { semanticTopTableFirstHeaderSelector: topSemanticTableFirstHeaderRef.selector } : {}),
    ...(topSemanticTableFirstOwnedRef?.target ? { semanticTopTableFirstOwnedTarget: topSemanticTableFirstOwnedRef.target } : {}),
    ...(topSemanticTableFirstOwnedRef?.role ? { semanticTopTableFirstOwnedRole: topSemanticTableFirstOwnedRef.role } : {}),
    ...(topSemanticTableFirstOwnedRef?.name ? { semanticTopTableFirstOwnedName: topSemanticTableFirstOwnedRef.name } : {}),
    ...(topSemanticTableFirstOwnedRef?.selector ? { semanticTopTableFirstOwnedSelector: topSemanticTableFirstOwnedRef.selector } : {}),
    ...(topSemanticTableFirstSampleCellRef?.path ? { semanticTopTableFirstSampleCellPath: topSemanticTableFirstSampleCellRef.path } : {}),
    ...(topSemanticTableFirstSampleCellRef?.text ? { semanticTopTableFirstSampleCellText: topSemanticTableFirstSampleCellRef.text } : {}),
    ...(typeof topSemanticTableFirstSampleCellRef?.rowIndex === "number" ? { semanticTopTableFirstSampleCellRowIndex: topSemanticTableFirstSampleCellRef.rowIndex } : {}),
    ...(typeof topSemanticTableFirstSampleCellRef?.columnIndex === "number" ? { semanticTopTableFirstSampleCellColumnIndex: topSemanticTableFirstSampleCellRef.columnIndex } : {}),
    ...(typeof topSemanticTableFirstSampleCellRef?.rowSpan === "number" ? { semanticTopTableFirstSampleCellRowSpan: topSemanticTableFirstSampleCellRef.rowSpan } : {}),
    ...(typeof topSemanticTableFirstSampleCellRef?.columnSpan === "number" ? { semanticTopTableFirstSampleCellColumnSpan: topSemanticTableFirstSampleCellRef.columnSpan } : {}),
    ...(topSemanticTableFirstSampleCellRef?.headers?.length ? { semanticTopTableFirstSampleCellHeaders: topSemanticTableFirstSampleCellRef.headers } : {}),
    ...(topSemanticTableFirstSampleCellRef?.rowHeaders?.length ? { semanticTopTableFirstSampleCellRowHeaders: topSemanticTableFirstSampleCellRef.rowHeaders } : {}),
    ...(topSemanticTableFirstSampleCellRef?.columnHeaders?.length ? { semanticTopTableFirstSampleCellColumnHeaders: topSemanticTableFirstSampleCellRef.columnHeaders } : {}),
    ...(typeof topSemanticTableFirstSampleCellRef?.selected === "boolean" ? { semanticTopTableFirstSampleCellSelected: topSemanticTableFirstSampleCellRef.selected } : {}),
    ...(typeof topSemanticTableFirstSampleCellRef?.current !== "undefined" ? { semanticTopTableFirstSampleCellCurrent: topSemanticTableFirstSampleCellRef.current } : {}),
    ...(topSemanticTableFirstSampleCellRef?.selector ? { semanticTopTableFirstSampleCellSelector: topSemanticTableFirstSampleCellRef.selector } : {}),
    ...(topSemanticSelectedTableCellRef?.path ? { semanticTopSelectedTableCellPath: topSemanticSelectedTableCellRef.path } : {}),
    ...(topSemanticSelectedTableCellRef?.text ? { semanticTopSelectedTableCellText: topSemanticSelectedTableCellRef.text } : {}),
    ...(typeof topSemanticSelectedTableCellRef?.rowIndex === "number" ? { semanticTopSelectedTableCellRowIndex: topSemanticSelectedTableCellRef.rowIndex } : {}),
    ...(typeof topSemanticSelectedTableCellRef?.columnIndex === "number" ? { semanticTopSelectedTableCellColumnIndex: topSemanticSelectedTableCellRef.columnIndex } : {}),
    ...(typeof topSemanticSelectedTableCellRef?.selected === "boolean" ? { semanticTopSelectedTableCellSelected: topSemanticSelectedTableCellRef.selected } : {}),
    ...(typeof topSemanticSelectedTableCellRef?.current !== "undefined" ? { semanticTopSelectedTableCellCurrent: topSemanticSelectedTableCellRef.current } : {}),
    ...(topSemanticSelectedTableCellRef?.selector ? { semanticTopSelectedTableCellSelector: topSemanticSelectedTableCellRef.selector } : {}),
    ...(topSemanticTable?.selector ? { semanticTopTableSelector: topSemanticTable.selector } : {}),
    ...(topSemanticList ? { semanticTopListRole: topSemanticList.role } : {}),
    ...(topSemanticList ? { semanticTopListPath: topSemanticList.path } : {}),
    ...(topSemanticList?.name ? { semanticTopListName: topSemanticList.name } : {}),
    ...(topSemanticList ? { semanticTopListItemCount: topSemanticList.itemCount } : {}),
    ...(topSemanticList?.sampleItems?.length ? { semanticTopListItems: topSemanticList.sampleItems } : {}),
    ...(topSemanticList?.itemRefs?.length ? { semanticTopListItemRefs: topSemanticList.itemRefs } : {}),
    ...(topSemanticListFirstItemRef?.text ? { semanticTopListFirstItemText: topSemanticListFirstItemRef.text } : {}),
    ...(topSemanticListFirstItemRef?.role ? { semanticTopListFirstItemRole: topSemanticListFirstItemRef.role } : {}),
    ...(typeof topSemanticListFirstItemRef?.level === "number" ? { semanticTopListFirstItemLevel: topSemanticListFirstItemRef.level } : {}),
    ...(typeof topSemanticListFirstItemRef?.posInSet === "number" ? { semanticTopListFirstItemPosInSet: topSemanticListFirstItemRef.posInSet } : {}),
    ...(typeof topSemanticListFirstItemRef?.setSize === "number" ? { semanticTopListFirstItemSetSize: topSemanticListFirstItemRef.setSize } : {}),
    ...(typeof topSemanticListFirstItemRef?.selected === "boolean" ? { semanticTopListFirstItemSelected: topSemanticListFirstItemRef.selected } : {}),
    ...(typeof topSemanticListFirstItemRef?.current !== "undefined" ? { semanticTopListFirstItemCurrent: topSemanticListFirstItemRef.current } : {}),
    ...(typeof topSemanticListFirstItemRef?.expanded === "boolean" ? { semanticTopListFirstItemExpanded: topSemanticListFirstItemRef.expanded } : {}),
    ...(topSemanticListFirstItemRef?.selector ? { semanticTopListFirstItemSelector: topSemanticListFirstItemRef.selector } : {}),
    ...(topSemanticList?.selector ? { semanticTopListSelector: topSemanticList.selector } : {}),
    ...(topSemanticField ? { semanticTopFieldRole: topSemanticField.role } : {}),
    ...(topSemanticField ? { semanticTopFieldPath: topSemanticField.path } : {}),
    ...(topSemanticField?.name ? { semanticTopFieldName: topSemanticField.name } : {}),
    ...(topSemanticField?.description ? { semanticTopFieldDescription: topSemanticField.description } : {}),
    ...(topSemanticField?.value ? { semanticTopFieldValue: topSemanticField.value } : {}),
    ...(topSemanticField?.htmlName ? { semanticTopFieldHtmlName: topSemanticField.htmlName } : {}),
    ...(topSemanticField?.htmlType ? { semanticTopFieldHtmlType: topSemanticField.htmlType } : {}),
    ...(topSemanticField?.placeholder ? { semanticTopFieldPlaceholder: topSemanticField.placeholder } : {}),
    ...(topSemanticField?.ariaPlaceholder ? { semanticTopFieldAriaPlaceholder: topSemanticField.ariaPlaceholder } : {}),
    ...(topSemanticField?.autocomplete ? { semanticTopFieldAutocomplete: topSemanticField.autocomplete } : {}),
    ...(topSemanticField?.ariaAutocomplete ? { semanticTopFieldAriaAutocomplete: topSemanticField.ariaAutocomplete } : {}),
    ...(topSemanticField?.inputMode ? { semanticTopFieldInputMode: topSemanticField.inputMode } : {}),
    ...(topSemanticField?.pattern ? { semanticTopFieldPattern: topSemanticField.pattern } : {}),
    ...(topSemanticField?.min ? { semanticTopFieldMin: topSemanticField.min } : {}),
    ...(topSemanticField?.max ? { semanticTopFieldMax: topSemanticField.max } : {}),
    ...(topSemanticField?.step ? { semanticTopFieldStep: topSemanticField.step } : {}),
    ...(typeof topSemanticField?.minLength === "number" ? { semanticTopFieldMinLength: topSemanticField.minLength } : {}),
    ...(typeof topSemanticField?.maxLength === "number" ? { semanticTopFieldMaxLength: topSemanticField.maxLength } : {}),
    ...(topSemanticField?.labelledBy ? { semanticTopFieldLabelledBy: topSemanticField.labelledBy } : {}),
    ...(topSemanticField?.labelledByText ? { semanticTopFieldLabelledByText: topSemanticField.labelledByText } : {}),
    ...(topSemanticField?.describedBy ? { semanticTopFieldDescribedBy: topSemanticField.describedBy } : {}),
    ...(topSemanticField?.describedByText ? { semanticTopFieldDescribedByText: topSemanticField.describedByText } : {}),
    ...(topSemanticField?.details ? { semanticTopFieldDetails: topSemanticField.details } : {}),
    ...(topSemanticField?.detailsText ? { semanticTopFieldDetailsText: topSemanticField.detailsText } : {}),
    ...(topSemanticField?.errorMessage ? { semanticTopFieldErrorMessage: topSemanticField.errorMessage } : {}),
    ...(topSemanticField?.errorMessageText ? { semanticTopFieldErrorMessageText: topSemanticField.errorMessageText } : {}),
    ...(topSemanticFieldState ? { semanticTopFieldState: topSemanticFieldState } : {}),
    ...(typeof topSemanticField?.state?.disabled === "boolean" ? { semanticTopFieldDisabled: topSemanticField.state.disabled } : {}),
    ...(typeof topSemanticField?.state?.required === "boolean" ? { semanticTopFieldRequired: topSemanticField.state.required } : {}),
    ...(typeof topSemanticField?.state?.readonly === "boolean" ? { semanticTopFieldReadonly: topSemanticField.state.readonly } : {}),
    ...(typeof topSemanticField?.state?.invalid !== "undefined" ? { semanticTopFieldInvalid: topSemanticField.state.invalid } : {}),
    ...(typeof topSemanticField?.state?.checked !== "undefined" ? { semanticTopFieldChecked: topSemanticField.state.checked } : {}),
    ...(typeof topSemanticField?.state?.expanded === "boolean" ? { semanticTopFieldExpanded: topSemanticField.state.expanded } : {}),
    ...(typeof topSemanticField?.state?.haspopup !== "undefined" ? { semanticTopFieldHaspopup: topSemanticField.state.haspopup } : {}),
    ...(topSemanticField?.state?.controls ? { semanticTopFieldControls: topSemanticField.state.controls } : {}),
    ...(typeof topSemanticField?.state?.valueMin === "number" ? { semanticTopFieldValueMin: topSemanticField.state.valueMin } : {}),
    ...(typeof topSemanticField?.state?.valueMax === "number" ? { semanticTopFieldValueMax: topSemanticField.state.valueMax } : {}),
    ...(typeof topSemanticField?.state?.valueNow === "number" ? { semanticTopFieldValueNow: topSemanticField.state.valueNow } : {}),
    ...(topSemanticField?.state?.valueText ? { semanticTopFieldValueText: topSemanticField.state.valueText } : {}),
    ...(topSemanticField?.selector ? { semanticTopFieldSelector: topSemanticField.selector } : {}),
    ...(topSemanticDescription ? { semanticTopDescriptionRole: topSemanticDescription.role } : {}),
    ...(topSemanticDescription ? { semanticTopDescriptionPath: topSemanticDescription.path } : {}),
    ...(topSemanticDescription?.name ? { semanticTopDescriptionName: topSemanticDescription.name } : {}),
    ...(topSemanticDescription ? { semanticTopDescriptionText: topSemanticDescription.description } : {}),
    ...(topSemanticDescription?.selector ? { semanticTopDescriptionSelector: topSemanticDescription.selector } : {}),
    ...(topSemanticValue ? { semanticTopValueRole: topSemanticValue.role } : {}),
    ...(topSemanticValue ? { semanticTopValuePath: topSemanticValue.path } : {}),
    ...(topSemanticValue?.name ? { semanticTopValueName: topSemanticValue.name } : {}),
    ...(topSemanticValue ? { semanticTopValue: topSemanticValue.value } : {}),
    ...(topSemanticValue?.selector ? { semanticTopValueSelector: topSemanticValue.selector } : {}),
    ...(topSemanticRelation ? { semanticTopRelationRole: topSemanticRelation.role } : {}),
    ...(topSemanticRelation ? { semanticTopRelationPath: topSemanticRelation.path } : {}),
    ...(topSemanticRelation?.name ? { semanticTopRelationName: topSemanticRelation.name } : {}),
    ...(topSemanticRelation ? { semanticTopRelation: topSemanticRelation.relation } : {}),
    ...(topSemanticRelation ? { semanticTopRelationTarget: topSemanticRelation.target } : {}),
    ...(topSemanticRelation?.targetRole ? { semanticTopRelationTargetRole: topSemanticRelation.targetRole } : {}),
    ...(topSemanticRelation?.targetName ? { semanticTopRelationTargetName: topSemanticRelation.targetName } : {}),
    ...(topSemanticRelation?.targetSelector ? { semanticTopRelationTargetSelector: topSemanticRelation.targetSelector } : {}),
    ...(topSemanticRelation?.selector ? { semanticTopRelationSelector: topSemanticRelation.selector } : {}),
    ...(topSemanticChoice ? { semanticTopChoiceRole: topSemanticChoice.role } : {}),
    ...(topSemanticChoice ? { semanticTopChoicePath: topSemanticChoice.path } : {}),
    ...(topSemanticChoice?.name ? { semanticTopChoiceName: topSemanticChoice.name } : {}),
    ...(topSemanticChoiceState ? { semanticTopChoiceState: topSemanticChoiceState } : {}),
    ...(typeof topSemanticChoice?.state?.selected === "boolean" ? { semanticTopChoiceSelected: topSemanticChoice.state.selected } : {}),
    ...(typeof topSemanticChoice?.state?.current !== "undefined" ? { semanticTopChoiceCurrent: topSemanticChoice.state.current } : {}),
    ...(typeof topSemanticChoice?.level === "number" ? { semanticTopChoiceLevel: topSemanticChoice.level } : {}),
    ...(typeof topSemanticChoice?.posInSet === "number" ? { semanticTopChoicePosInSet: topSemanticChoice.posInSet } : {}),
    ...(typeof topSemanticChoice?.setSize === "number" ? { semanticTopChoiceSetSize: topSemanticChoice.setSize } : {}),
    ...(topSemanticChoice?.selector ? { semanticTopChoiceSelector: topSemanticChoice.selector } : {}),
    ...(topSemanticSelectedChoice ? { semanticTopSelectedChoiceRole: topSemanticSelectedChoice.role } : {}),
    ...(topSemanticSelectedChoice ? { semanticTopSelectedChoicePath: topSemanticSelectedChoice.path } : {}),
    ...(topSemanticSelectedChoice?.name ? { semanticTopSelectedChoiceName: topSemanticSelectedChoice.name } : {}),
    ...(topSemanticSelectedChoiceState ? { semanticTopSelectedChoiceState: topSemanticSelectedChoiceState } : {}),
    ...(typeof topSemanticSelectedChoice?.state?.selected === "boolean" ? { semanticTopSelectedChoiceSelected: topSemanticSelectedChoice.state.selected } : {}),
    ...(typeof topSemanticSelectedChoice?.state?.current !== "undefined" ? { semanticTopSelectedChoiceCurrent: topSemanticSelectedChoice.state.current } : {}),
    ...(typeof topSemanticSelectedChoice?.level === "number" ? { semanticTopSelectedChoiceLevel: topSemanticSelectedChoice.level } : {}),
    ...(typeof topSemanticSelectedChoice?.posInSet === "number" ? { semanticTopSelectedChoicePosInSet: topSemanticSelectedChoice.posInSet } : {}),
    ...(typeof topSemanticSelectedChoice?.setSize === "number" ? { semanticTopSelectedChoiceSetSize: topSemanticSelectedChoice.setSize } : {}),
    ...(topSemanticSelectedChoice?.state?.controls ? { semanticTopSelectedChoiceControls: topSemanticSelectedChoice.state.controls } : {}),
    ...(topSemanticSelectedChoiceControlsRelation?.targetRole ? { semanticTopSelectedChoiceControlsTargetRole: topSemanticSelectedChoiceControlsRelation.targetRole } : {}),
    ...(topSemanticSelectedChoiceControlsRelation?.targetName ? { semanticTopSelectedChoiceControlsTargetName: topSemanticSelectedChoiceControlsRelation.targetName } : {}),
    ...(topSemanticSelectedChoiceControlsRelation?.targetSelector ? { semanticTopSelectedChoiceControlsTargetSelector: topSemanticSelectedChoiceControlsRelation.targetSelector } : {}),
    ...(topSemanticSelectedChoice?.selector ? { semanticTopSelectedChoiceSelector: topSemanticSelectedChoice.selector } : {}),
    ...(topSemanticState ? { semanticTopStateRole: topSemanticState.role } : {}),
    ...(topSemanticState ? { semanticTopStatePath: topSemanticState.path } : {}),
    ...(topSemanticState?.name ? { semanticTopStateName: topSemanticState.name } : {}),
    ...(topSemanticState ? { semanticTopState: topSemanticState.state } : {}),
    ...(typeof topSemanticState?.stateRaw?.hidden === "boolean" ? { semanticTopStateHidden: topSemanticState.stateRaw.hidden } : {}),
    ...(typeof topSemanticState?.stateRaw?.disabled === "boolean" ? { semanticTopStateDisabled: topSemanticState.stateRaw.disabled } : {}),
    ...(typeof topSemanticState?.stateRaw?.busy === "boolean" ? { semanticTopStateBusy: topSemanticState.stateRaw.busy } : {}),
    ...(typeof topSemanticState?.stateRaw?.multiselectable === "boolean" ? { semanticTopStateMultiselectable: topSemanticState.stateRaw.multiselectable } : {}),
    ...(topSemanticState?.stateRaw?.sort ? { semanticTopStateSort: topSemanticState.stateRaw.sort } : {}),
    ...(typeof topSemanticState?.stateRaw?.grabbed === "boolean" ? { semanticTopStateGrabbed: topSemanticState.stateRaw.grabbed } : {}),
    ...(topSemanticState?.stateRaw?.dropEffect ? { semanticTopStateDropEffect: topSemanticState.stateRaw.dropEffect } : {}),
    ...(typeof topSemanticState?.stateRaw?.checked !== "undefined" ? { semanticTopStateChecked: topSemanticState.stateRaw.checked } : {}),
    ...(typeof topSemanticState?.stateRaw?.selected === "boolean" ? { semanticTopStateSelected: topSemanticState.stateRaw.selected } : {}),
    ...(typeof topSemanticState?.stateRaw?.expanded === "boolean" ? { semanticTopStateExpanded: topSemanticState.stateRaw.expanded } : {}),
    ...(typeof topSemanticState?.stateRaw?.pressed !== "undefined" ? { semanticTopStatePressed: topSemanticState.stateRaw.pressed } : {}),
    ...(typeof topSemanticState?.stateRaw?.focused === "boolean" ? { semanticTopStateFocused: topSemanticState.stateRaw.focused } : {}),
    ...(typeof topSemanticState?.stateRaw?.required === "boolean" ? { semanticTopStateRequired: topSemanticState.stateRaw.required } : {}),
    ...(typeof topSemanticState?.stateRaw?.invalid !== "undefined" ? { semanticTopStateInvalid: topSemanticState.stateRaw.invalid } : {}),
    ...(typeof topSemanticState?.stateRaw?.readonly === "boolean" ? { semanticTopStateReadonly: topSemanticState.stateRaw.readonly } : {}),
    ...(typeof topSemanticState?.stateRaw?.current !== "undefined" ? { semanticTopStateCurrent: topSemanticState.stateRaw.current } : {}),
    ...(typeof topSemanticState?.stateRaw?.haspopup !== "undefined" ? { semanticTopStateHaspopup: topSemanticState.stateRaw.haspopup } : {}),
    ...(topSemanticState?.stateRaw?.controls ? { semanticTopStateControls: topSemanticState.stateRaw.controls } : {}),
    ...(topSemanticState?.stateRaw?.live ? { semanticTopStateLive: topSemanticState.stateRaw.live } : {}),
    ...(typeof topSemanticState?.stateRaw?.modal === "boolean" ? { semanticTopStateModal: topSemanticState.stateRaw.modal } : {}),
    ...(topSemanticState?.stateRaw?.orientation ? { semanticTopStateOrientation: topSemanticState.stateRaw.orientation } : {}),
    ...(typeof topSemanticState?.stateRaw?.valueMin === "number" ? { semanticTopStateValueMin: topSemanticState.stateRaw.valueMin } : {}),
    ...(typeof topSemanticState?.stateRaw?.valueMax === "number" ? { semanticTopStateValueMax: topSemanticState.stateRaw.valueMax } : {}),
    ...(typeof topSemanticState?.stateRaw?.valueNow === "number" ? { semanticTopStateValueNow: topSemanticState.stateRaw.valueNow } : {}),
    ...(topSemanticState?.stateRaw?.valueText ? { semanticTopStateValueText: topSemanticState.stateRaw.valueText } : {}),
    ...(topSemanticState?.selector ? { semanticTopStateSelector: topSemanticState.selector } : {}),
    ...(topSemanticModalState ? { semanticTopModalStateRole: topSemanticModalState.role } : {}),
    ...(topSemanticModalState ? { semanticTopModalStatePath: topSemanticModalState.path } : {}),
    ...(topSemanticModalState?.name ? { semanticTopModalStateName: topSemanticModalState.name } : {}),
    ...(topSemanticModalState ? { semanticTopModalState: topSemanticModalState.state } : {}),
    ...(topSemanticModalState?.selector ? { semanticTopModalStateSelector: topSemanticModalState.selector } : {}),
    ...(topSemanticLiveState ? { semanticTopLiveStateRole: topSemanticLiveState.role } : {}),
    ...(topSemanticLiveState ? { semanticTopLiveStatePath: topSemanticLiveState.path } : {}),
    ...(topSemanticLiveState?.name ? { semanticTopLiveStateName: topSemanticLiveState.name } : {}),
    ...(topSemanticLiveState ? { semanticTopLiveState: topSemanticLiveState.state } : {}),
    ...(topSemanticLiveState?.stateRaw?.live ? { semanticTopLiveStateLive: topSemanticLiveState.stateRaw.live } : {}),
    ...(topSemanticLiveState?.selector ? { semanticTopLiveStateSelector: topSemanticLiveState.selector } : {}),
    ...(topSemanticUnavailable ? { semanticTopUnavailablePath: topSemanticUnavailable.path } : {}),
    ...(topSemanticUnavailable ? { semanticTopUnavailableTag: topSemanticUnavailable.tag } : {}),
    ...(topSemanticUnavailable?.role ? { semanticTopUnavailableRole: topSemanticUnavailable.role } : {}),
    ...(topSemanticUnavailable?.name ? { semanticTopUnavailableName: topSemanticUnavailable.name } : {}),
    ...(topSemanticUnavailable ? { semanticTopUnavailableReason: topSemanticUnavailable.reason } : {}),
    ...(topSemanticUnavailable?.selector ? { semanticTopUnavailableSelector: topSemanticUnavailable.selector } : {}),
    signalCount: signals.length,
    signalWarningCount: signalCounts.warning ?? 0,
    signalErrorCount: signalCounts.error ?? 0,
    signals,
    qualityGateCount: qualityGates.length,
    qualityGateFailCount: qualityGates.filter((gate) => !gate.pass).length,
    qualityGates,
    ...(topSignal ? { topSignalKind: topSignal.kind } : {}),
    ...(topSignal ? { topSignalSeverity: topSignal.severity } : {}),
    ...(topSignal ? { topSignalMessage: topSignal.message } : {}),
    ...(topQualityGate ? { topQualityGateKind: topQualityGate.kind } : {}),
    ...(typeof topQualityGate?.pass === "boolean" ? { topQualityGatePass: topQualityGate.pass } : {}),
    ...(topQualityGate ? { topQualityGateSeverity: topQualityGate.severity } : {}),
    ...(topQualityGate ? { topQualityGateMessage: topQualityGate.message } : {}),
    ...(topQualityGate?.path ? { topQualityGatePath: topQualityGate.path } : {}),
    ...(typeof topQualityGate?.score === "number" ? { topQualityGateScore: topQualityGate.score } : {}),
    ...(problemSignal ? { problemSignalKind: problemSignal.kind } : {}),
    ...(problemSignal ? { problemSignalSeverity: problemSignal.severity } : {}),
    ...(problemSignal ? { problemSignalMessage: problemSignal.message } : {}),
    ...(failingQualityGate ? { failingQualityGateKind: failingQualityGate.kind } : {}),
    ...(failingQualityGate ? { failingQualityGateSeverity: failingQualityGate.severity } : {}),
    ...(failingQualityGate ? { failingQualityGateMessage: failingQualityGate.message } : {}),
    ...(failingQualityGate?.path ? { failingQualityGatePath: failingQualityGate.path } : {}),
    ...(typeof failingQualityGate?.score === "number" ? { failingQualityGateScore: failingQualityGate.score } : {}),
    canContinue: agentCanContinue(primaryAction),
    canUseFetchedHtml,
    needsBrowserHtml,
    staticReadiness: staticReadiness.status,
    staticReadinessReasonCode: staticReadiness.reasonCode,
    staticReadinessReason: staticReadiness.reason,
    ...(staticReadiness.readFrom ? { staticReadinessReadFrom: staticReadiness.readFrom } : {}),
    ...(browserHtmlReason ? { browserHtmlReason } : {}),
    ...(browserHtmlReasonCode ? { browserHtmlReasonCode } : {}),
    ...(next.browserHtml ? { browserHtmlActionName: next.action } : {}),
    ...(next.browserHtml ? { browserHtmlOperation: executionPlan.operation } : {}),
    ...(next.browserHtml?.url ? { browserHtmlUrl: next.browserHtml.url } : {}),
    ...(next.browserHtml?.htmlFile ? { browserHtmlFile: next.browserHtml.htmlFile } : {}),
    ...(next.browserHtml?.captureScript ? { browserHtmlCaptureScript: next.browserHtml.captureScript } : {}),
    ...(next.browserHtml?.command ? { browserHtmlCommand: next.browserHtml.command } : {}),
    ...(next.browserHtml?.commandArgs ? { browserHtmlCommandArgs: next.browserHtml.commandArgs } : {}),
    ...(next.browserHtml?.afterInteractionCommand ? { browserHtmlAfterInteractionCommand: next.browserHtml.afterInteractionCommand } : {}),
    ...(next.browserHtml?.afterInteractionCommandArgs ? { browserHtmlAfterInteractionCommandArgs: next.browserHtml.afterInteractionCommandArgs } : {}),
    responseStatus: fetched?.status ?? error?.status ?? 0,
    responseOk: fetched ? fetched.status >= 200 && fetched.status < 400 : false,
    responseContentType: fetched?.contentType ?? "",
    finalUrlChanged: Boolean(fetched && requestUrl && fetched.finalUrl !== requestUrl),
    confidence: pageCheck.confidence,
    usabilityScore,
    readability: pageCheck.readability.level,
    readabilityScore: pageCheck.readability.score,
    readabilityReasons: pageCheck.readability.reasons.slice(0, 3),
    verificationStatus: verification.status,
    verificationRequestedCount: verification.requestedCount,
    verificationFoundCount: verification.foundCount,
    verificationMissingCount: verification.missingCount,
    verificationFoundQueries: verification.foundQueries,
    verificationMissingQueries: verification.missingQueries,
    ...(verification.foundQueries[0] ? { topVerificationFoundQuery: verification.foundQueries[0] } : {}),
    ...(verification.missingQueries[0] ? { topVerificationMissingQuery: verification.missingQueries[0] } : {}),
    resultCount: hasUsableSearchResults ? results.length : 0,
    resultChoiceCount: resultChoices.length,
    resultChoices,
    ...(resultChoices[0] ? { topResultChoicePath: resultChoices[0].path } : {}),
    ...(resultChoices[0]?.title ? { topResultChoiceTitle: resultChoices[0].title } : {}),
    ...(resultChoices[0]?.url ? { topResultChoiceUrl: resultChoices[0].url } : {}),
    ...(resultChoices[0]?.host ? { topResultChoiceHost: resultChoices[0].host } : {}),
    ...(resultChoices[0]?.snippet ? { topResultChoiceSnippet: resultChoices[0].snippet } : {}),
    ...(resultChoices[0]?.commandArgs ? { topResultChoiceCommandArgs: resultChoices[0].commandArgs } : {}),
    ...(typeof resultChoices[0]?.rank === "number" ? { topResultChoiceRank: resultChoices[0].rank } : {}),
    ...(resultChoices[0]?.openResult ? { topResultChoiceOpenResult: resultChoices[0].openResult } : {}),
    ...(typeof resultChoices[0]?.recommended === "boolean" ? { topResultChoiceRecommended: resultChoices[0].recommended } : {}),
    ...(typeof resultChoices[0]?.primary === "boolean" ? { topResultChoicePrimary: resultChoices[0].primary } : {}),
    ...(resultChoices[0]?.sourceType ? { topResultChoiceSourceType: resultChoices[0].sourceType } : {}),
    ...(typeof resultChoices[0]?.sourceScore === "number" ? { topResultChoiceSourceScore: resultChoices[0].sourceScore } : {}),
    ...(resultChoices[0]?.sourceHints?.length ? { topResultChoiceSourceHints: resultChoices[0].sourceHints } : {}),
    ...(resultChoices[0]?.dateText ? { topResultChoiceDateText: resultChoices[0].dateText } : {}),
    ...(resultChoices[0]?.relevance ? { topResultChoiceRelevance: resultChoices[0].relevance } : {}),
    ...(resultChoices[0]?.matchedTerms?.[0] ? { topResultChoiceMatchedTerm: resultChoices[0].matchedTerms[0] } : {}),
    ...(resultChoices[0]?.findMatches?.[0] ? { topResultChoiceFindMatch: resultChoices[0].findMatches[0] } : {}),
    ...(typeof resultChoices[0]?.isLikelyOfficial === "boolean" ? { topResultChoiceLikelyOfficial: resultChoices[0].isLikelyOfficial } : {}),
    ...(resultChoices[0]?.sitelinks?.length ? { topResultChoiceSitelinkCount: resultChoices[0].sitelinks.length } : {}),
    ...(resultChoices[0]?.sitelinks?.[0]?.title ? { topResultChoiceFirstSitelinkTitle: resultChoices[0].sitelinks[0].title } : {}),
    ...(resultChoices[0]?.sitelinks?.[0]?.url ? { topResultChoiceFirstSitelinkUrl: resultChoices[0].sitelinks[0].url } : {}),
    ...(resultChoices[0]?.selectionReason ? { topResultChoiceReason: resultChoices[0].selectionReason } : {}),
    evidenceCount: pageCheck.contentEvidence.length,
    formCount: pageCheck.forms.length,
    formChoices,
    formChoiceCount: pageCheck.forms.length,
    actionTargetCount: pageCheck.actionTargets.length,
    actionTargetChoices,
    actionTargetChoiceCount: pageCheck.actionTargets.length,
    ...(topFormChoice ? { topFormChoicePath: topFormChoice.path } : {}),
    ...(topFormChoice?.method ? { topFormChoiceMethod: topFormChoice.method } : {}),
    ...(topFormChoice?.actionUrl ? { topFormChoiceActionUrl: topFormChoice.actionUrl } : {}),
    ...(topFormChoice?.submitText ? { topFormChoiceSubmitText: topFormChoice.submitText } : {}),
    ...(topFormChoice?.queryField ? { topFormChoiceQueryField: topFormChoice.queryField } : {}),
    ...(topFormChoice?.urlTemplate ? { topFormChoiceUrlTemplate: topFormChoice.urlTemplate } : {}),
    ...(typeof topFormChoice?.fieldCount === "number" ? { topFormChoiceFieldCount: topFormChoice.fieldCount } : {}),
    ...(topFormChoice?.selector ? { topFormChoiceSelector: topFormChoice.selector } : {}),
    ...(topFormChoiceFirstField?.name ? { topFormChoiceFirstFieldName: topFormChoiceFirstField.name } : {}),
    ...(topFormChoiceFirstField?.type ? { topFormChoiceFirstFieldType: topFormChoiceFirstField.type } : {}),
    ...(topFormChoiceFirstField?.label ? { topFormChoiceFirstFieldLabel: topFormChoiceFirstField.label } : {}),
    ...(typeof topFormChoiceFirstField?.required === "boolean" ? { topFormChoiceFirstFieldRequired: topFormChoiceFirstField.required } : {}),
    ...(topFormChoiceFirstField?.selector ? { topFormChoiceFirstFieldSelector: topFormChoiceFirstField.selector } : {}),
    ...(actionTargetChoices[0] ? { topActionTargetChoicePath: actionTargetChoices[0].path } : {}),
    ...(actionTargetChoices[0]?.kind ? { topActionTargetChoiceKind: actionTargetChoices[0].kind } : {}),
    ...(actionTargetChoices[0]?.name ? { topActionTargetChoiceName: actionTargetChoices[0].name } : {}),
    ...(actionTargetChoices[0]?.source ? { topActionTargetChoiceSource: actionTargetChoices[0].source } : {}),
    ...(actionTargetChoices[0]?.targetUrl ? { topActionTargetChoiceTargetUrl: actionTargetChoices[0].targetUrl } : {}),
    ...(actionTargetChoices[0]?.urlTemplate ? { topActionTargetChoiceUrlTemplate: actionTargetChoices[0].urlTemplate } : {}),
    ...(actionTargetChoices[0]?.queryInput ? { topActionTargetChoiceQueryInput: actionTargetChoices[0].queryInput } : {}),
    ...(actionTargetChoices[0]?.method ? { topActionTargetChoiceMethod: actionTargetChoices[0].method } : {}),
    ...(typeof actionTargetChoices[0]?.disabled === "boolean" ? { topActionTargetChoiceDisabled: actionTargetChoices[0].disabled } : {}),
    ...(typeof actionTargetChoices[0]?.pressed !== "undefined" ? { topActionTargetChoicePressed: actionTargetChoices[0].pressed } : {}),
    ...(typeof actionTargetChoices[0]?.expanded === "boolean" ? { topActionTargetChoiceExpanded: actionTargetChoices[0].expanded } : {}),
    ...(typeof actionTargetChoices[0]?.haspopup !== "undefined" ? { topActionTargetChoiceHaspopup: actionTargetChoices[0].haspopup } : {}),
    ...(actionTargetChoices[0]?.controls ? { topActionTargetChoiceControls: actionTargetChoices[0].controls } : {}),
    ...(actionTargetChoices[0]?.selector ? { topActionTargetChoiceSelector: actionTargetChoices[0].selector } : {}),
    barrierCount: pageCheck.barriers.length,
    ...(topBarrier ? { topBarrierKind: topBarrier.kind } : {}),
    ...(topBarrier ? { topBarrierSeverity: topBarrier.severity } : {}),
    ...(topBarrier ? { topBarrierSource: topBarrier.source } : {}),
    ...(topBarrier ? { topBarrierPath: topBarrier.path } : {}),
    ...(topBarrier ? { topBarrierText: topBarrier.text } : {}),
    ...(topBarrier?.selector ? { topBarrierSelector: topBarrier.selector } : {}),
    ...(topBarrier?.diagnosticCode ? { topBarrierDiagnosticCode: topBarrier.diagnosticCode } : {}),
    dataTableCount: pageCheck.dataTables.length,
    faqCount: pageCheck.faqs.length,
    codeBlockCount: pageCheck.codeBlocks.length,
    resourceCount: pageCheck.resources.length,
    mediaCount: pageCheck.media.length,
    sectionCount: pageCheck.sections.length,
    breadcrumbCount: pageCheck.breadcrumbs.length,
    paginationCount: pageCheck.pagination.length,
    tocCount: pageCheck.toc.length,
    embedCount: pageCheck.embeds.length,
    transcriptCount: pageCheck.transcripts.length,
    authorLinkCount: pageCheck.authorLinks.length,
    provenanceCount: pageCheck.provenance.length,
    offerCount: pageCheck.offers.length,
    datasetCount: pageCheck.datasets.length,
    identityCount: pageCheck.identities.length,
    timelineCount: pageCheck.timeline.length,
    contactPointCount: pageCheck.contactPoints.length,
    ...(pageCheck.dataTables[0] ? { topDataTablePath: pageCheck.dataTables[0].path } : {}),
    ...(pageCheck.dataTables[0]?.caption ? { topDataTableCaption: pageCheck.dataTables[0].caption } : {}),
    ...(pageCheck.dataTables[0] ? { topDataTableRowCount: pageCheck.dataTables[0].rowCount } : {}),
    ...(pageCheck.dataTables[0] ? { topDataTableColumnCount: pageCheck.dataTables[0].columnCount } : {}),
    ...(pageCheck.dataTables[0] ? { topDataTableHeaderCount: pageCheck.dataTables[0].headers.length } : {}),
    ...(pageCheck.dataTables[0]?.headers[0] ? { topDataTableFirstHeader: pageCheck.dataTables[0].headers[0] } : {}),
    ...(pageCheck.dataTables[0]?.sampleRows[0] ? { topDataTableFirstRow: pageCheck.dataTables[0].sampleRows[0] } : {}),
    ...(pageCheck.dataTables[0]?.sampleRows[0]?.[0] ? { topDataTableFirstCell: pageCheck.dataTables[0].sampleRows[0][0] } : {}),
    ...(pageCheck.dataTables[0]?.selector ? { topDataTableSelector: pageCheck.dataTables[0].selector } : {}),
    ...(pageCheck.faqs[0]?.question ? { topFaqQuestion: pageCheck.faqs[0].question } : {}),
    ...(pageCheck.faqs[0]?.answer ? { topFaqAnswer: pageCheck.faqs[0].answer } : {}),
    ...(pageCheck.codeBlocks[0]?.language ? { topCodeBlockLanguage: pageCheck.codeBlocks[0].language } : {}),
    ...(pageCheck.codeBlocks[0] ? { topCodeBlockLineCount: pageCheck.codeBlocks[0].lineCount } : {}),
    ...(pageCheck.codeBlocks[0]?.text ? { topCodeBlockText: pageCheck.codeBlocks[0].text } : {}),
    ...(pageCheck.resources[0] ? { topResourceKind: pageCheck.resources[0].kind } : {}),
    ...(pageCheck.resources[0]?.url ? { topResourceUrl: pageCheck.resources[0].url } : {}),
    ...(pageCheck.resources[0]?.title ? { topResourceTitle: pageCheck.resources[0].title } : {}),
    ...(pageCheck.media[0] ? { topMediaKind: pageCheck.media[0].kind } : {}),
    ...(pageCheck.media[0]?.url ? { topMediaUrl: pageCheck.media[0].url } : {}),
    ...(pageCheck.media[0]?.text ? { topMediaText: pageCheck.media[0].text } : {}),
    ...(pageCheck.sections[0] ? { topSectionPath: pageCheck.sections[0].path } : {}),
    ...(pageCheck.sections[0]?.heading ? { topSectionHeading: pageCheck.sections[0].heading } : {}),
    ...(pageCheck.sections[0] ? { topSectionLevel: pageCheck.sections[0].level } : {}),
    ...(pageCheck.sections[0]?.text ? { topSectionText: pageCheck.sections[0].text } : {}),
    ...(pageCheck.sections[0]?.selector ? { topSectionSelector: pageCheck.sections[0].selector } : {}),
    ...(pageCheck.breadcrumbs[0] ? { topBreadcrumbPath: pageCheck.breadcrumbs[0].path } : {}),
    ...(pageCheck.breadcrumbs[0]?.text ? { topBreadcrumbText: pageCheck.breadcrumbs[0].text } : {}),
    ...(pageCheck.breadcrumbs[0] ? { topBreadcrumbSource: pageCheck.breadcrumbs[0].source } : {}),
    ...(pageCheck.pagination[0] ? { topPaginationPath: pageCheck.pagination[0].path } : {}),
    ...(pageCheck.pagination[0] ? { topPaginationKind: pageCheck.pagination[0].kind } : {}),
    ...(pageCheck.pagination[0]?.label ? { topPaginationLabel: pageCheck.pagination[0].label } : {}),
    ...(pageCheck.pagination[0]?.url ? { topPaginationUrl: pageCheck.pagination[0].url } : {}),
    ...(typeof pageCheck.pagination[0]?.current === "boolean" ? { topPaginationCurrent: pageCheck.pagination[0].current } : {}),
    ...(pageCheck.pagination[0]?.selector ? { topPaginationSelector: pageCheck.pagination[0].selector } : {}),
    ...(pageCheck.toc[0] ? { topTocPath: pageCheck.toc[0].path } : {}),
    ...(pageCheck.toc[0]?.title ? { topTocTitle: pageCheck.toc[0].title } : {}),
    ...(pageCheck.toc[0] ? { topTocItemCount: pageCheck.toc[0].items.length } : {}),
    ...(pageCheck.toc[0]?.text ? { topTocText: pageCheck.toc[0].text } : {}),
    ...(pageCheck.toc[0]?.items[0]?.label ? { topTocFirstItemLabel: pageCheck.toc[0].items[0].label } : {}),
    ...(pageCheck.toc[0]?.items[0]?.url ? { topTocFirstItemUrl: pageCheck.toc[0].items[0].url } : {}),
    ...(pageCheck.toc[0]?.selector ? { topTocSelector: pageCheck.toc[0].selector } : {}),
    ...(pageCheck.embeds[0] ? { topEmbedKind: pageCheck.embeds[0].kind } : {}),
    ...(pageCheck.embeds[0]?.url ? { topEmbedUrl: pageCheck.embeds[0].url } : {}),
    ...(pageCheck.embeds[0]?.title ? { topEmbedTitle: pageCheck.embeds[0].title } : {}),
    ...(pageCheck.transcripts[0] ? { topTranscriptKind: pageCheck.transcripts[0].kind } : {}),
    ...(pageCheck.transcripts[0]?.url ? { topTranscriptUrl: pageCheck.transcripts[0].url } : {}),
    ...(pageCheck.transcripts[0]?.label ? { topTranscriptLabel: pageCheck.transcripts[0].label } : {}),
    ...(pageCheck.transcripts[0]?.language ? { topTranscriptLanguage: pageCheck.transcripts[0].language } : {}),
    ...(pageCheck.authorLinks[0]?.name ? { topAuthorLinkName: pageCheck.authorLinks[0].name } : {}),
    ...(pageCheck.authorLinks[0]?.url ? { topAuthorLinkUrl: pageCheck.authorLinks[0].url } : {}),
    ...(pageCheck.authorLinks[0] ? { topAuthorLinkSource: pageCheck.authorLinks[0].source } : {}),
    ...(pageCheck.provenance[0] ? { topProvenancePath: pageCheck.provenance[0].path } : {}),
    ...(pageCheck.provenance[0] ? { topProvenanceKind: pageCheck.provenance[0].kind } : {}),
    ...(pageCheck.provenance[0]?.label ? { topProvenanceLabel: pageCheck.provenance[0].label } : {}),
    ...(pageCheck.provenance[0]?.value ? { topProvenanceValue: pageCheck.provenance[0].value } : {}),
    ...(pageCheck.provenance[0]?.url ? { topProvenanceUrl: pageCheck.provenance[0].url } : {}),
    ...(pageCheck.provenance[0] ? { topProvenanceSource: pageCheck.provenance[0].source } : {}),
    ...(pageCheck.provenance[0]?.selector ? { topProvenanceSelector: pageCheck.provenance[0].selector } : {}),
    ...(pageCheck.offers[0] ? { topOfferPath: pageCheck.offers[0].path } : {}),
    ...(pageCheck.offers[0]?.name ? { topOfferName: pageCheck.offers[0].name } : {}),
    ...(pageCheck.offers[0]?.price ? { topOfferPrice: pageCheck.offers[0].price } : {}),
    ...(pageCheck.offers[0]?.currency ? { topOfferCurrency: pageCheck.offers[0].currency } : {}),
    ...(pageCheck.offers[0]?.availability ? { topOfferAvailability: pageCheck.offers[0].availability } : {}),
    ...(pageCheck.offers[0]?.url ? { topOfferUrl: pageCheck.offers[0].url } : {}),
    ...(pageCheck.offers[0]?.selector ? { topOfferSelector: pageCheck.offers[0].selector } : {}),
    ...(pageCheck.datasets[0] ? { topDatasetPath: pageCheck.datasets[0].path } : {}),
    ...(pageCheck.datasets[0] ? { topDatasetKind: pageCheck.datasets[0].kind } : {}),
    ...(pageCheck.datasets[0]?.name ? { topDatasetName: pageCheck.datasets[0].name } : {}),
    ...(pageCheck.datasets[0]?.url ? { topDatasetUrl: pageCheck.datasets[0].url } : {}),
    ...(pageCheck.datasets[0]?.distributionUrls?.[0] ? { topDatasetDistributionUrl: pageCheck.datasets[0].distributionUrls[0] } : {}),
    ...(pageCheck.datasets[0]?.licenseUrl ? { topDatasetLicenseUrl: pageCheck.datasets[0].licenseUrl } : {}),
    ...(pageCheck.datasets[0]?.encodingFormat ? { topDatasetEncodingFormat: pageCheck.datasets[0].encodingFormat } : {}),
    ...(pageCheck.datasets[0]?.selector ? { topDatasetSelector: pageCheck.datasets[0].selector } : {}),
    ...(pageCheck.identities[0] ? { topIdentityPath: pageCheck.identities[0].path } : {}),
    ...(pageCheck.identities[0] ? { topIdentityKind: pageCheck.identities[0].kind } : {}),
    ...(pageCheck.identities[0]?.name ? { topIdentityName: pageCheck.identities[0].name } : {}),
    ...(pageCheck.identities[0]?.url ? { topIdentityUrl: pageCheck.identities[0].url } : {}),
    ...(pageCheck.identities[0]?.logoUrl ? { topIdentityLogoUrl: pageCheck.identities[0].logoUrl } : {}),
    ...(pageCheck.identities[0]?.sameAs?.[0] ? { topIdentitySameAsUrl: pageCheck.identities[0].sameAs[0] } : {}),
    ...(pageCheck.identities[0] ? { topIdentitySource: pageCheck.identities[0].source } : {}),
    ...(pageCheck.identities[0]?.selector ? { topIdentitySelector: pageCheck.identities[0].selector } : {}),
    ...(pageCheck.timeline[0] ? { topTimelinePath: pageCheck.timeline[0].path } : {}),
    ...(pageCheck.timeline[0] ? { topTimelineKind: pageCheck.timeline[0].kind } : {}),
    ...(pageCheck.timeline[0]?.label ? { topTimelineLabel: pageCheck.timeline[0].label } : {}),
    ...(pageCheck.timeline[0]?.value ? { topTimelineValue: pageCheck.timeline[0].value } : {}),
    ...(pageCheck.timeline[0] ? { topTimelineSource: pageCheck.timeline[0].source } : {}),
    ...(pageCheck.timeline[0]?.selector ? { topTimelineSelector: pageCheck.timeline[0].selector } : {}),
    ...(pageCheck.contactPoints[0] ? { topContactPointPath: pageCheck.contactPoints[0].path } : {}),
    ...(pageCheck.contactPoints[0] ? { topContactPointKind: pageCheck.contactPoints[0].kind } : {}),
    ...(pageCheck.contactPoints[0]?.label ? { topContactPointLabel: pageCheck.contactPoints[0].label } : {}),
    ...(pageCheck.contactPoints[0]?.value ? { topContactPointValue: pageCheck.contactPoints[0].value } : {}),
    ...(pageCheck.contactPoints[0]?.url ? { topContactPointUrl: pageCheck.contactPoints[0].url } : {}),
    ...(pageCheck.contactPoints[0] ? { topContactPointSource: pageCheck.contactPoints[0].source } : {}),
    ...(pageCheck.contactPoints[0]?.selector ? { topContactPointSelector: pageCheck.contactPoints[0].selector } : {}),
    structuredReadTargetCount,
    ...(bestStructuredReadTarget ? { bestStructuredReadTarget: bestStructuredReadTarget.path } : {}),
    ...(typeof bestStructuredReadTarget?.count === "number" ? { bestStructuredReadTargetCount: bestStructuredReadTarget.count } : {}),
    ...(typeof bestStructuredReadTarget?.score === "number" ? { bestStructuredReadTargetScore: bestStructuredReadTarget.score } : {}),
    ...(typeof bestStructuredReadTarget?.primary === "boolean" ? { bestStructuredReadTargetPrimary: bestStructuredReadTarget.primary } : {}),
    ...(bestStructuredReadTarget ? { bestStructuredReadTargetReason: bestStructuredReadTarget.reason } : {}),
    hiddenSignalCount,
    hiddenHydrationCount,
    hiddenApiEndpointCount,
    hiddenClientStateCount,
    hiddenAppHintCount,
    ...(topHydration ? { topHydrationPath: topHydration.path } : {}),
    ...(topHydration ? { topHydrationKind: topHydration.kind } : {}),
    ...(topHydration?.label ? { topHydrationLabel: topHydration.label } : {}),
    ...(topHydration?.url ? { topHydrationUrl: topHydration.url } : {}),
    ...(topHydration?.selector ? { topHydrationSelector: topHydration.selector } : {}),
    ...(topApiEndpoint ? { topApiEndpointPath: topApiEndpoint.path } : {}),
    ...(topApiEndpoint ? { topApiEndpointKind: topApiEndpoint.kind } : {}),
    ...(topApiEndpoint?.method ? { topApiEndpointMethod: topApiEndpoint.method } : {}),
    ...(topApiEndpoint?.url ? { topApiEndpointUrl: topApiEndpoint.url } : {}),
    ...(topApiEndpoint?.selector ? { topApiEndpointSelector: topApiEndpoint.selector } : {}),
    ...(topClientState ? { topClientStatePath: topClientState.path } : {}),
    ...(topClientState ? { topClientStateKind: topClientState.kind } : {}),
    ...(topClientState ? { topClientStateOperation: topClientState.operation } : {}),
    ...(topClientState?.key ? { topClientStateKey: topClientState.key } : {}),
    ...(topClientState?.selector ? { topClientStateSelector: topClientState.selector } : {}),
    ...(topAppHint ? { topAppHintPath: topAppHint.path } : {}),
    ...(topAppHint ? { topAppHintKind: topAppHint.kind } : {}),
    ...(topAppHint?.label ? { topAppHintLabel: topAppHint.label } : {}),
    ...(topAppHint?.url ? { topAppHintUrl: topAppHint.url } : {}),
    ...(topAppHint?.selector ? { topAppHintSelector: topAppHint.selector } : {}),
    ...(topHiddenSignal ? { topHiddenSignalGroup: topHiddenSignal.group } : {}),
    ...(topHiddenSignal ? { topHiddenSignalPath: topHiddenSignal.path } : {}),
    ...(topHiddenSignal?.kind ? { topHiddenSignalKind: topHiddenSignal.kind } : {}),
    ...(topHiddenSignal?.text ? { topHiddenSignalText: topHiddenSignal.text } : {}),
    ...(topHiddenSignal?.url ? { topHiddenSignalUrl: topHiddenSignal.url } : {}),
    ...(topHiddenSignal?.source ? { topHiddenSignalSource: topHiddenSignal.source } : {}),
    ...(topHiddenSignal?.selector ? { topHiddenSignalSelector: topHiddenSignal.selector } : {}),
    hiddenReadTargetCount,
    ...(bestHiddenReadTarget ? { bestHiddenReadTarget: bestHiddenReadTarget.path } : {}),
    ...(typeof bestHiddenReadTarget?.count === "number" ? { bestHiddenReadTargetCount: bestHiddenReadTarget.count } : {}),
    ...(typeof bestHiddenReadTarget?.score === "number" ? { bestHiddenReadTargetScore: bestHiddenReadTarget.score } : {}),
    ...(typeof bestHiddenReadTarget?.primary === "boolean" ? { bestHiddenReadTargetPrimary: bestHiddenReadTarget.primary } : {}),
    ...(bestHiddenReadTarget ? { bestHiddenReadTargetReason: bestHiddenReadTarget.reason } : {}),
    sourceLinkCount: analysis.kind === "search-results" ? 0 : pageCheck.sourceLinks.length,
    sourceChoiceCount: sourceChoices.length,
    sourceChoices,
    ...(sourceChoices[0] ? { topSourceChoicePath: sourceChoices[0].path } : {}),
    ...(sourceChoices[0]?.title ? { topSourceChoiceTitle: sourceChoices[0].title } : {}),
    ...(sourceChoices[0]?.url ? { topSourceChoiceUrl: sourceChoices[0].url } : {}),
    ...(sourceChoices[0]?.host ? { topSourceChoiceHost: sourceChoices[0].host } : {}),
    ...(sourceChoices[0]?.snippet ? { topSourceChoiceSnippet: sourceChoices[0].snippet } : {}),
    ...(sourceChoices[0]?.commandArgs ? { topSourceChoiceCommandArgs: sourceChoices[0].commandArgs } : {}),
    ...(sourceChoices[0]?.sourceType ? { topSourceChoiceSourceType: sourceChoices[0].sourceType } : {}),
    ...(typeof sourceChoices[0]?.sourceScore === "number" ? { topSourceChoiceSourceScore: sourceChoices[0].sourceScore } : {}),
    ...(sourceChoices[0]?.sourceHints?.length ? { topSourceChoiceSourceHints: sourceChoices[0].sourceHints } : {}),
    ...(typeof sourceChoices[0]?.primary === "boolean" ? { topSourceChoicePrimary: sourceChoices[0].primary } : {}),
    ...(sourceChoices[0]?.selectionReason ? { topSourceChoiceReason: sourceChoices[0].selectionReason } : {}),
    ...(topChoice ? { topChoiceKind: topChoice.kind } : {}),
    ...(topChoice ? { topChoicePath: topChoice.path } : {}),
    ...(topChoice?.label ? { topChoiceLabel: topChoice.label } : {}),
    ...(topChoice?.url ? { topChoiceUrl: topChoice.url } : {}),
    ...(topChoice?.commandArgs ? { topChoiceCommandArgs: topChoice.commandArgs } : {}),
    ...(sourceSearch ? { sourceSearchQuery: sourceSearch.query } : {}),
    ...(sourceSearch ? { sourceSearchEngine: sourceSearch.engine } : {}),
    ...(sourceSearch?.selectedEngine ? { sourceSearchSelectedEngine: sourceSearch.selectedEngine } : {}),
    ...(sourceSearch ? { sourceSearchSearchUrl: sourceSearch.searchUrl } : {}),
    ...(sourceSearch?.lang ? { sourceSearchLang: sourceSearch.lang } : {}),
    ...(sourceSearch?.region ? { sourceSearchRegion: sourceSearch.region } : {}),
    ...(sourceSearch?.findQueries ? { sourceSearchFindQueryCount: sourceSearch.findQueries.length } : {}),
    ...(sourceSearch?.findQueries?.[0] ? { sourceSearchTopFindQuery: sourceSearch.findQueries[0] } : {}),
    ...(sourceSearch ? { sourceSearchSelectedRank: sourceSearch.selectedRank } : {}),
    ...(sourceSearch ? { sourceSearchSelectedTitle: sourceSearch.selectedTitle } : {}),
    ...(sourceSearch ? { sourceSearchSelectedUrl: sourceSearch.selectedUrl } : {}),
    ...(sourceSearchSelectedResult?.host ? { sourceSearchSelectedHost: sourceSearchSelectedResult.host } : {}),
    ...(sourceSearchSelectedResult ? { sourceSearchSelectedPath: sourceSearchSelectedResult.path } : {}),
    ...(sourceSearchSelectedResult?.openResult ? { sourceSearchSelectedOpenResult: sourceSearchSelectedResult.openResult } : {}),
    ...(sourceSearchSelectedResult?.commandArgs ? { sourceSearchSelectedCommandArgs: sourceSearchSelectedResult.commandArgs } : {}),
    ...(sourceSearchSelectedResult?.selectionReason ? { sourceSearchSelectedReason: sourceSearchSelectedResult.selectionReason } : {}),
    sourceSearchAlternateCount: sourceSearch?.alternateResults?.length ?? 0,
    ...(sourceSearchAlternateResult ? { sourceSearchAlternatePath: sourceSearchAlternateResult.path } : {}),
    ...(sourceSearchAlternateResult?.title ? { sourceSearchAlternateTitle: sourceSearchAlternateResult.title } : {}),
    ...(sourceSearchAlternateResult?.url ? { sourceSearchAlternateUrl: sourceSearchAlternateResult.url } : {}),
    ...(sourceSearchAlternateResult?.host ? { sourceSearchAlternateHost: sourceSearchAlternateResult.host } : {}),
    ...(typeof sourceSearchAlternateResult?.rank === "number" ? { sourceSearchAlternateRank: sourceSearchAlternateResult.rank } : {}),
    ...(sourceSearchAlternateResult?.openResult ? { sourceSearchAlternateOpenResult: sourceSearchAlternateResult.openResult } : {}),
    ...(sourceSearchAlternateResult?.commandArgs ? { sourceSearchAlternateCommandArgs: sourceSearchAlternateResult.commandArgs } : {}),
    ...(sourceSearchAlternateResult?.selectionReason ? { sourceSearchAlternateReason: sourceSearchAlternateResult.selectionReason } : {}),
    evidenceQualityScore,
    sourceQualityScore,
    alternativeActionCount: actions.filter((action) => !action.primary).length,
    diagnosticCodes,
    diagnosticErrorCount: diagnosticCounts.error,
    diagnosticWarningCount: diagnosticCounts.warning,
    diagnosticInfoCount: diagnosticCounts.info,
    ...(analysis.diagnostics[0] ? { topDiagnosticCode: analysis.diagnostics[0].code } : {}),
    ...(analysis.diagnostics[0] ? { topDiagnosticSeverity: analysis.diagnostics[0].severity } : {}),
    ...(analysis.diagnostics[0] ? { topDiagnosticMessage: analysis.diagnostics[0].message } : {}),
    citationCount: citations.length,
    citations,
    ...(citations[0] ? { topCitationId: citations[0].id } : {}),
    ...(citations[0] ? { topCitationPath: citations[0].path } : {}),
    ...(citations[0] ? { topCitationKind: citations[0].kind } : {}),
    ...(citations[0]?.text ? { topCitationText: citations[0].text } : {}),
    ...(citations[0]?.title ? { topCitationTitle: citations[0].title } : {}),
    ...(citations[0]?.url ? { topCitationUrl: citations[0].url } : {}),
    ...(citations[0]?.confidence ? { topCitationConfidence: citations[0].confidence } : {}),
    ...(citations[0]?.reason ? { topCitationReason: citations[0].reason } : {}),
    ...(typeof citations[0]?.score === "number" ? { topCitationScore: citations[0].score } : {}),
    answerEvidenceCount: answerEvidence.length,
    answerEvidence,
    ...(answerEvidence[0] ? { topAnswerEvidenceId: answerEvidence[0].id } : {}),
    ...(answerEvidence[0] ? { topAnswerEvidencePath: answerEvidence[0].path } : {}),
    ...(answerEvidence[0] ? { topAnswerEvidenceKind: answerEvidence[0].kind } : {}),
    ...(answerEvidence[0]?.text ? { topAnswerEvidenceText: answerEvidence[0].text } : {}),
    ...(answerEvidence[0]?.title ? { topAnswerEvidenceTitle: answerEvidence[0].title } : {}),
    ...(answerEvidence[0]?.url ? { topAnswerEvidenceUrl: answerEvidence[0].url } : {}),
    ...(answerEvidence[0]?.confidence ? { topAnswerEvidenceConfidence: answerEvidence[0].confidence } : {}),
    ...(answerEvidence[0]?.reason ? { topAnswerEvidenceReason: answerEvidence[0].reason } : {}),
    answerPlanStatus: answerPlan.status,
    answerPlanConfidence: answerPlan.confidence,
    answerPlanReason: answerPlan.reason,
    ...(answerPlan.nextAction ? { answerPlanNextAction: answerPlan.nextAction } : {}),
    answerGapCount: answerPlan.gaps.length,
    answerUseCitationCount: answerPlan.useCitationIds.length,
    ...(answerPlan.useCitationIds[0] ? { topAnswerUseCitationId: answerPlan.useCitationIds[0] } : {}),
    ...(answerPlan.useCitationIds.length > 0 ? { answerUseCitationIds: answerPlan.useCitationIds } : {}),
    ...(answerPlan.readFrom ? { answerPlanReadFrom: answerPlan.readFrom } : {}),
    ...(answerPlan.commandArgs ? { answerPlanCommandArgs: answerPlan.commandArgs } : {}),
    ...(answerPlan.afterInteractionCommand ? { answerPlanAfterInteractionCommand: answerPlan.afterInteractionCommand } : {}),
    ...(answerPlan.afterInteractionCommandArgs ? { answerPlanAfterInteractionCommandArgs: answerPlan.afterInteractionCommandArgs } : {}),
    ...(answerPlan.url ? { answerPlanUrl: answerPlan.url } : {}),
    readTargetCount: readTargets.length,
    readTargets,
    ...(readTargets[0] ? { topReadTarget: readTargets[0].path } : {}),
    ...(typeof readTargets[0]?.count === "number" ? { topReadTargetCount: readTargets[0].count } : {}),
    ...(typeof readTargets[0]?.score === "number" ? { topReadTargetScore: readTargets[0].score } : {}),
    ...(typeof readTargets[0]?.primary === "boolean" ? { topReadTargetPrimary: readTargets[0].primary } : {}),
    ...(readTargets[0]?.reason ? { topReadTargetReason: readTargets[0].reason } : {}),
    actionCount: actions.length,
    actions,
    ...(actions[0]?.action ? { topActionName: actions[0].action } : {}),
    ...(actions[0]?.source ? { topActionSource: actions[0].source } : {}),
    ...(actions[0]?.execution ? { topActionExecution: actions[0].execution } : {}),
    ...(actions[0]?.priority ? { topActionPriority: actions[0].priority } : {}),
    ...(actions[0]?.reason ? { topActionReason: actions[0].reason } : {}),
    ...(actions[0]?.readFrom ? { topActionReadFrom: actions[0].readFrom } : {}),
    ...(actions[0]?.commandArgs ? { topActionCommandArgs: actions[0].commandArgs } : {}),
    ...(actions[0]?.url ? { topActionUrl: actions[0].url } : {}),
    ...(actions[0]?.sourceLinkRef ? { topActionSourceLinkRef: actions[0].sourceLinkRef } : {}),
    ...(actions[0]?.requiresBrowserInteraction ? { topActionRequiresBrowserInteraction: true } : {}),
    ...(alternativeAction?.action ? { alternativeActionName: alternativeAction.action } : {}),
    ...(alternativeAction?.source ? { alternativeActionSource: alternativeAction.source } : {}),
    ...(alternativeAction?.execution ? { alternativeActionExecution: alternativeAction.execution } : {}),
    ...(alternativeAction?.priority ? { alternativeActionPriority: alternativeAction.priority } : {}),
    ...(alternativeAction?.reason ? { alternativeActionReason: alternativeAction.reason } : {}),
    ...(alternativeAction?.readFrom ? { alternativeActionReadFrom: alternativeAction.readFrom } : {}),
    ...(alternativeAction?.commandArgs ? { alternativeActionCommandArgs: alternativeAction.commandArgs } : {}),
    ...(alternativeAction?.url ? { alternativeActionUrl: alternativeAction.url } : {}),
    ...(alternativeAction?.sourceLinkRef ? { alternativeActionSourceLinkRef: alternativeAction.sourceLinkRef } : {}),
    ...(alternativeAction?.requiresBrowserInteraction ? { alternativeActionRequiresBrowserInteraction: true } : {}),
    executorDecision: executor.decision,
    executorMode: executor.mode,
    ...(executor.action ? { executorActionName: executor.action } : {}),
    executorOperation: executor.operation,
    executorConfidence: executor.confidence,
    executorAnswerReady: executor.answerReady,
    executorShouldContinue: executor.shouldContinue,
    executorTerminal: executor.terminal,
    ...(executor.commandArgs ? { executorCommandArgs: executor.commandArgs } : {}),
    ...(executor.readFrom ? { executorReadFrom: executor.readFrom } : {}),
    ...(executor.url ? { executorUrl: executor.url } : {}),
    ...(executor.target?.url ? { executorTargetUrl: executor.target.url } : {}),
    ...(executor.target?.path ? { executorTargetPath: executor.target.path } : {}),
    ...(executor.target?.selector ? { executorTargetSelector: executor.target.selector } : {}),
    ...(executor.target?.text ? { executorTargetText: executor.target.text } : {}),
    executorExpectedOutcome: executor.expectedOutcome,
    handoffDecision: handoff.decision,
    handoffMode: handoff.mode,
    ...(handoff.action ? { handoffActionName: handoff.action } : {}),
    handoffOperation: handoff.operation,
    handoffAnswerStatus: handoff.answerStatus,
    handoffConfidence: handoff.confidence,
    handoffAnswerReady: handoff.answerReady,
    handoffShouldContinue: handoff.shouldContinue,
    handoffTerminal: handoff.terminal,
    ...(handoff.priority ? { handoffPriority: handoff.priority } : {}),
    ...(handoff.priorityReason ? { handoffPriorityReason: handoff.priorityReason } : {}),
    ...(handoff.commandArgs ? { handoffCommandArgs: handoff.commandArgs } : {}),
    ...(handoff.readFrom ? { handoffReadFrom: handoff.readFrom } : {}),
    ...(handoff.url ? { handoffUrl: handoff.url } : {}),
    ...(handoff.target?.url ? { handoffTargetUrl: handoff.target.url } : {}),
    ...(handoff.target?.path ? { handoffTargetPath: handoff.target.path } : {}),
    ...(handoff.target?.selector ? { handoffTargetSelector: handoff.target.selector } : {}),
    ...(handoff.target?.text ? { handoffTargetText: handoff.target.text } : {}),
    handoffExpectedOutcome: handoff.expectedOutcome,
  };
  if (bestReadTarget) {
    agent.bestReadTarget = bestReadTarget.path;
    if (typeof bestReadTarget.count === "number") agent.bestReadTargetCount = bestReadTarget.count;
    if (typeof bestReadTarget.score === "number") agent.bestReadTargetScore = bestReadTarget.score;
    if (typeof bestReadTarget.primary === "boolean") agent.bestReadTargetPrimary = bestReadTarget.primary;
    agent.bestReadTargetReason = bestReadTarget.reason;
  }
  if (primaryAction) {
    agent.primaryActionName = primaryAction.action;
    agent.primaryReason = primaryAction.reason;
    agent.primaryPriority = primaryAction.priority ?? actionPriority(primaryAction);
    agent.primaryPriorityReason = primaryAction.priorityReason ?? actionPriorityReason(primaryAction);
    agent.primaryExecution = actionExecution(primaryAction);
    if (primaryAction.readFrom) agent.primaryReadFrom = primaryAction.readFrom;
    if (primaryAction.command) agent.primaryCommand = primaryAction.command;
    if (primaryAction.commandArgs) agent.primaryCommandArgs = primaryAction.commandArgs;
    if (primaryAction.afterInteractionCommand) agent.primaryAfterInteractionCommand = primaryAction.afterInteractionCommand;
    if (primaryAction.afterInteractionCommandArgs) agent.primaryAfterInteractionCommandArgs = primaryAction.afterInteractionCommandArgs;
    if (primaryAction.url) agent.primaryUrl = primaryAction.url;
    if (primaryAction.sourceLinkRef) agent.primarySourceLinkRef = primaryAction.sourceLinkRef;
    if (primaryAction.rank) agent.primaryRank = primaryAction.rank;
    if (primaryAction.openResult) agent.primaryOpenResult = primaryAction.openResult;
    if (primaryAction.requiresBrowserInteraction) agent.requiresBrowserInteraction = true;
    agent.primaryAction = primaryAction;
  }
  if (recommendedResult) {
    agent.recommendedUrl = recommendedResult.url;
    agent.recommendedTitle = recommendedResult.title;
    agent.recommendedRank = recommendedResult.rank;
    agent.recommendedSource = recommendedResult.source;
    if (recommendedResult.relevance) agent.recommendedRelevance = recommendedResult.relevance;
    if (typeof recommendedResult.isLikelyOfficial === "boolean") agent.recommendedLikelyOfficial = recommendedResult.isLikelyOfficial;
    agent.recommendedSelectionReason = recommendedResult.selectionReason ?? searchResultSelectionReason(recommendedResult);
    if (primaryAction?.command) agent.recommendedCommand = primaryAction.command;
    if (primaryAction?.commandArgs) agent.recommendedCommandArgs = primaryAction.commandArgs;
  } else if (primaryAction?.url) {
    agent.recommendedUrl = primaryAction.url;
    if (primaryAction.command) agent.recommendedCommand = primaryAction.command;
    if (primaryAction.commandArgs) agent.recommendedCommandArgs = primaryAction.commandArgs;
  }
  return agent;
}

function summarizeAgentCitations(
  kind: ContentKind,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  primaryAction: SuggestedAction | undefined,
  recommendedResult?: ResultSummary,
  sourceSearch?: SourceSearchSummary,
): AgentCitation[] {
  const citations: AgentCitation[] = [];
  const add = (citation: AgentCitation): void => {
    if (citations.some((item) => item.kind === citation.kind && item.path === citation.path)) return;
    citations.push(citation);
  };
  if (verification.bestEvidence) {
    add({
      kind: "verification",
      id: "v1",
      path: "verification.bestEvidence",
      confidence: "high",
      reason: "Best matching evidence for the requested verification text.",
      text: verification.bestEvidence.text,
      ...(verification.bestEvidence.url ? { url: verification.bestEvidence.url } : {}),
      ...(typeof verification.bestEvidence.score === "number" ? { score: verification.bestEvidence.score } : {}),
    });
  }
  for (const evidence of pageCheck.contentEvidence.slice(0, 3)) {
    add({
      kind: "content",
      id: evidence.id,
      path: evidence.path,
      confidence: evidence.quality,
      reason: evidence.qualityReason,
      text: evidence.text,
      score: evidence.score,
    });
  }
  const readTargetCitation = summarizeReadTargetCitation(primaryAction, pageCheck);
  if (readTargetCitation) add(readTargetCitation);
  if (recommendedResult) {
    add({
      kind: "search-result",
      id: `r${recommendedResult.rank}`,
      path: "recommendedResult",
      confidence: searchCitationConfidence(recommendedResult),
      reason: recommendedResult.selectionReason ?? searchResultSelectionReason(recommendedResult),
      title: recommendedResult.title,
      url: recommendedResult.url,
      ...(typeof recommendedResult.sourceScore === "number" ? { score: recommendedResult.sourceScore } : {}),
    });
  }
  if (sourceSearch?.selectedResult) {
    add({
      kind: "search-result",
      id: sourceSearch.selectedResult.id ?? "selected",
      path: sourceSearch.selectedResult.path ?? "sourceSearch.selectedResult",
      confidence: searchCitationConfidence(sourceSearch.selectedResult),
      reason: sourceSearch.selectedResult.selectionReason ?? searchResultSelectionReason(sourceSearch.selectedResult),
      title: sourceSearch.selectedResult.title,
      url: sourceSearch.selectedResult.url,
      ...(typeof sourceSearch.selectedResult.sourceScore === "number" ? { score: sourceSearch.selectedResult.sourceScore } : {}),
    });
  }
  if (kind !== "search-results") {
    for (const [index, link] of pageCheck.sourceLinks.slice(0, 2).entries()) {
      add({
        kind: "source-link",
        id: `s${index + 1}`,
        path: `pageCheck.sourceLinks[${index}]`,
        confidence: sourceCitationConfidence(link),
        reason: link.selectionReason ?? sourceLinkSelectionReason(link),
        title: link.title,
        url: link.url,
        ...(typeof link.sourceScore === "number" ? { score: link.sourceScore } : {}),
      });
    }
  }
  return citations.slice(0, 6);
}

function summarizeReadTargetCitation(primaryAction: SuggestedAction | undefined, pageCheck: PageCheckSummary): AgentCitation | undefined {
  if (!primaryAction?.readFrom || actionExecution(primaryAction) !== "read-current") return undefined;
  if (primaryAction.readFrom === "verification.bestEvidence" || primaryAction.readFrom === "pageCheck.contentEvidence") return undefined;
  if (!primaryAction.readFrom.startsWith("pageCheck.")) return undefined;
  const value = pageCheckReadTargetValue(pageCheck, primaryAction.readFrom);
  const text = summarizeReadTargetCitationText(value);
  if (!text) return undefined;
  const url = firstReadTargetUrl(value);
  return {
    kind: "page-check",
    id: "pc1",
    path: primaryAction.readFrom,
    confidence: pageCheck.readability.level === "high" ? "high" : pageCheck.readability.level === "medium" ? "medium" : "low",
    reason: `Primary read-current target ${primaryAction.readFrom} is available in the pageCheck payload.`,
    text,
    ...(url ? { url } : {}),
    score: pageCheck.readability.score,
  };
}

function pageCheckReadTargetValue(pageCheck: PageCheckSummary, path: string): unknown {
  const key = path.slice("pageCheck.".length);
  if (!key || key.includes(".") || key.includes("[")) return undefined;
  return (pageCheck as unknown as Record<string, unknown>)[key];
}

function summarizeReadTargetCitationText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .slice(0, 3)
      .map((item) => readTargetItemText(item))
      .filter(Boolean)
      .join(" | ")
      .slice(0, 500);
  }
  return readTargetItemText(value).slice(0, 500);
}

function readTargetItemText(value: unknown): string {
  if (!value || typeof value !== "object") return typeof value === "string" ? cleanContentText(value) : "";
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return cleanContentText(record.text);
  const parts = ["label", "name", "title", "kind", "value", "url"]
    .map((key) => typeof record[key] === "string" ? record[key] as string : "")
    .filter(Boolean);
  return cleanContentText(parts.join(" "));
}

function firstReadTargetUrl(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value.find((item) => item && typeof item === "object") : value;
  if (!first || typeof first !== "object") return undefined;
  const url = (first as Record<string, unknown>).url;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

function summarizeAgentAnswerEvidence(citations: AgentCitation[], answerPlan: AgentAnswerPlan): AgentCitation[] {
  const byId = new Map(citations.map((citation) => [citation.id, citation]));
  return answerPlan.useCitationIds
    .map((id) => byId.get(id))
    .filter((citation): citation is AgentCitation => Boolean(citation));
}

function summarizeAgentResultChoices(
  results: ResultSummary[],
  recommendedResult: ResultSummary | undefined,
  primaryAction: SuggestedAction | undefined,
  sourceSearch?: SourceSearchSummary,
): AgentResultChoice[] {
  if (results.length === 0) return [];
  return selectCompactSearchResults(results, recommendedResult).map((result, index) => {
    const recommended = Boolean(recommendedResult && result.rank === recommendedResult.rank && result.url === recommendedResult.url);
    const primary = Boolean(primaryAction?.url === result.url || (typeof primaryAction?.rank === "number" && primaryAction.rank === result.rank));
    const host = result.host ?? sourceFromUrl(result.url);
    const command = sourceSearch ? searchOpenCommandSpec(
      sourceSearch.query,
      sourceSearch.selectedEngine ?? sourceSearch.engine,
      sourceSearch.findQueries ?? [],
      true,
      sourceSearch.lang,
      sourceSearch.region,
      result.rank,
      sourceSearch.timeoutMs,
      sourceSearch.userAgent,
    ) : undefined;
    return {
      id: `r${result.rank}`,
      path: `searchResults[${index}]`,
      title: result.title,
      url: result.url,
      ...(host ? { host } : {}),
      source: result.source,
      rank: result.rank,
      ...(result.snippet ? { snippet: result.snippet } : {}),
      ...(result.sourceType ? { sourceType: result.sourceType } : {}),
      ...(typeof result.sourceScore === "number" ? { sourceScore: result.sourceScore } : {}),
      ...(result.sourceHints?.length ? { sourceHints: result.sourceHints } : {}),
      ...(result.dateText ? { dateText: result.dateText } : {}),
      ...(result.date ? { date: result.date } : {}),
      ...(result.datePrecision ? { datePrecision: result.datePrecision } : {}),
      ...(result.dateSource ? { dateSource: result.dateSource } : {}),
      ...(result.sitelinks?.length ? { sitelinks: result.sitelinks } : {}),
      ...(result.relevance ? { relevance: result.relevance } : {}),
      ...(result.matchedTerms?.length ? { matchedTerms: result.matchedTerms } : {}),
      ...(result.findMatches?.length ? { findMatches: result.findMatches } : {}),
      ...(typeof result.isLikelyOfficial === "boolean" ? { isLikelyOfficial: result.isLikelyOfficial } : {}),
      selectionReason: result.selectionReason ?? searchResultSelectionReason(result),
      ...(command ? { openResult: result.rank, ...commandFields(command) } : {}),
      ...(recommended ? { recommended: true, recommendedPath: "recommendedResult" } : {}),
      ...(primary ? { primary: true } : {}),
    };
  });
}

function summarizeAgentSourceChoices(
  kind: ContentKind,
  sourceLinks: PageLinkSummary[],
  primaryAction: SuggestedAction | undefined,
  agentMode: boolean,
  findQueries: string[],
  timeoutMs?: number,
  userAgent?: string,
): AgentSourceChoice[] {
  if (kind === "search-results" || sourceLinks.length === 0) return [];
  return sourceLinks.slice(0, 4).map((link, index) => {
    const command = pageCommandSpec(link.url, agentMode, false, findQueries, timeoutMs, userAgent);
    const primary = Boolean(primaryAction?.url === link.url || (typeof primaryAction?.rank === "number" && primaryAction.rank === link.rank));
    const host = link.host ?? sourceFromUrl(link.url);
    return {
      id: `s${index + 1}`,
      path: `pageCheck.sourceLinks[${index}]`,
      title: link.title,
      url: link.url,
      ...(host ? { host } : {}),
      source: link.source,
      rank: link.rank,
      ...(link.text ? { text: link.text } : {}),
      ...(link.snippet ? { snippet: link.snippet } : {}),
      ...(link.selector ? { selector: link.selector } : {}),
      kind: link.kind,
      ...(link.sourceType ? { sourceType: link.sourceType } : {}),
      ...(typeof link.sourceScore === "number" ? { sourceScore: link.sourceScore } : {}),
      ...(link.sourceHints?.length ? { sourceHints: link.sourceHints } : {}),
      ...(link.relevance ? { relevance: link.relevance } : {}),
      ...(link.matchedTerms?.length ? { matchedTerms: link.matchedTerms } : {}),
      ...(link.findMatches?.length ? { findMatches: link.findMatches } : {}),
      ...(typeof link.isLikelyOfficial === "boolean" ? { isLikelyOfficial: link.isLikelyOfficial } : {}),
      selectionReason: link.selectionReason ?? sourceLinkSelectionReason(link),
      ...commandFields(command),
      ...(primary ? { primary: true } : {}),
    };
  });
}

function summarizeAgentQualityGates(
  status: AgentStatus,
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  needsBrowserHtml: boolean,
  error: { code: CliErrorCode; message: string; status?: number } | undefined,
  usabilityScore: number,
  evidenceQualityScore: number,
  sourceQualityScore: number,
): AgentQualityGate[] {
  const gates: AgentQualityGate[] = [];
  gates.push({
    kind: "fetch",
    pass: !error,
    severity: error ? "error" : "info",
    message: error ? `Fetch or extraction failed with ${error.code}.` : "Fetched response was converted into an agent payload.",
    score: error ? 0 : 1,
    path: "agent.responseStatus",
  });
  gates.push({
    kind: "content",
    pass: pageCheck.contentEvidence.length > 0 && pageCheck.readability.level !== "low",
    severity: pageCheck.readability.level === "low" ? "warning" : "info",
    message: `${pageCheck.contentEvidence.length} content evidence item(s); readability is ${pageCheck.readability.level}.`,
    score: evidenceQualityScore,
    path: "pageCheck.contentEvidence",
  });
  gates.push({
    kind: "source",
    pass: analysis.kind === "search-results" || pageCheck.sourceLinks.length > 0,
    severity: analysis.kind === "search-results" || pageCheck.sourceLinks.length > 0 ? "info" : "warning",
    message: analysis.kind === "search-results"
      ? "Search result pages use result choices instead of page source choices."
      : `${pageCheck.sourceLinks.length} source-like link(s) available.`,
    score: sourceQualityScore,
    path: analysis.kind === "search-results" ? "searchResults" : "pageCheck.sourceLinks",
  });
  if (analysis.kind === "search-results") {
    const highRelevanceCount = results.filter((result) => result.relevance === "high").length;
    gates.push({
      kind: "search",
      pass: results.length > 0,
      severity: results.length > 0 ? "info" : "warning",
      message: `${results.length} search result(s) extracted; ${highRelevanceCount} high-relevance result(s).`,
      score: results.length > 0 ? roundMetric(Math.min(1, (highRelevanceCount || results.length) / Math.max(1, results.length))) : 0,
      path: "searchResults",
    });
  }
  if (verification.status !== "not-requested") {
    gates.push({
      kind: "verification",
      pass: verification.status === "matched",
      severity: verification.status === "matched" ? "info" : verification.status === "partial" ? "warning" : "error",
      message: `${verification.foundCount}/${verification.requestedCount} requested verification text(s) found.`,
      score: verification.requestedCount > 0 ? roundMetric(verification.foundCount / verification.requestedCount) : 1,
      path: verification.bestEvidence ? "verification.bestEvidence" : "verification",
    });
  }
  gates.push({
    kind: "browser",
    pass: !needsBrowserHtml,
    severity: needsBrowserHtml ? "warning" : "info",
    message: needsBrowserHtml ? "Browser-captured HTML or browser inspection is needed." : "Fetched HTML is usable without browser capture.",
    score: needsBrowserHtml ? 0 : 1,
    path: "agent.needsBrowserHtml",
  });
  if (analysis.diagnostics.length > 0) {
    const highestSeverity = analysis.diagnostics.some((item) => item.severity === "error")
      ? "error"
      : analysis.diagnostics.some((item) => item.severity === "warning") ? "warning" : "info";
    gates.push({
      kind: "diagnostic",
      pass: highestSeverity !== "error",
      severity: highestSeverity,
      message: `${analysis.diagnostics.length} diagnostic item(s): ${analysis.diagnostics.map((item) => item.code).slice(0, 3).join(", ")}.`,
      score: highestSeverity === "error" ? 0 : highestSeverity === "warning" ? 0.5 : 1,
      path: "diagnostics",
    });
  }
  gates.push({
    kind: "status",
    pass: status === "ready" || status === "choose-result",
    severity: status === "error" || status === "needs-browser" ? "error" : status === "verify" ? "warning" : "info",
    message: `Overall agent status is ${status}; usability score is ${usabilityScore}.`,
    score: usabilityScore,
    path: "agent.status",
  });
  return gates;
}

function summarizeAgentSearchDecision(
  analysis: AnalysisSummary,
  results: ResultSummary[],
  recommendedResult: ResultSummary | undefined,
  primaryAction: SuggestedAction | undefined,
): AgentSearchDecision | undefined {
  if (analysis.kind !== "search-results") return undefined;
  const highRelevanceCount = results.filter((result) => result.relevance === "high").length;
  const mediumRelevanceCount = results.filter((result) => result.relevance === "medium").length;
  const lowRelevanceCount = results.filter((result) => result.relevance === "low").length;
  const officialCount = results.filter((result) => result.isLikelyOfficial).length;
  const findMatchCount = results.filter((result) => (result.findMatches?.length ?? 0) > 0).length;
  if (recommendedResult && primaryAction?.action === "open-result") {
    return {
      decision: "open-result",
      confidence: searchDecisionConfidence(recommendedResult),
      reason: recommendedResult.selectionReason ?? searchResultSelectionReason(recommendedResult),
      resultCount: results.length,
      highRelevanceCount,
      mediumRelevanceCount,
      lowRelevanceCount,
      officialCount,
      findMatchCount,
      recommendedRank: recommendedResult.rank,
      recommendedUrl: recommendedResult.url,
      ...(primaryAction.command ? { command: primaryAction.command } : {}),
      ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    };
  }
  if (primaryAction?.action === "refine-search") {
    return {
      decision: "refine-search",
      confidence: "low",
      reason: primaryAction.reason,
      resultCount: results.length,
      highRelevanceCount,
      mediumRelevanceCount,
      lowRelevanceCount,
      officialCount,
      findMatchCount,
      ...(primaryAction.command ? { command: primaryAction.command } : {}),
      ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    };
  }
  return {
    decision: "none",
    confidence: "low",
    reason: results.length > 0 ? "Search results were extracted, but no executable search decision was selected." : "No search results were extracted.",
    resultCount: results.length,
    highRelevanceCount,
    mediumRelevanceCount,
    lowRelevanceCount,
    officialCount,
    findMatchCount,
  };
}

function searchDecisionConfidence(result: ResultSummary): AgentSearchDecision["confidence"] {
  if (result.findMatches?.length || result.isLikelyOfficial || result.relevance === "high") return "high";
  if (result.relevance === "medium" || (result.sourceScore ?? 0) >= 0.5) return "medium";
  return "low";
}

function summarizeAgentPageDecision(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  primaryAction: SuggestedAction | undefined,
): AgentPageDecision | undefined {
  if (analysis.kind === "search-results") return undefined;
  const pageAction = primaryAction?.action === "use-evidence" ? pageCheck.recommendedAction : primaryAction;
  const evidenceQualityScore = averageEvidenceScore(pageCheck.contentEvidence);
  const sourceQualityScore = agentSourceQualityScore(analysis.kind, pageCheck.sourceLinks, []);
  const base = {
    readability: pageCheck.readability.level,
    readabilityScore: pageCheck.readability.score,
    evidenceCount: pageCheck.contentEvidence.length,
    evidenceQualityScore,
    sourceLinkCount: pageCheck.sourceLinks.length,
    sourceQualityScore,
  };
  if (pageAction?.action === "read-content") {
    return {
      decision: "read-content",
      confidence: pageDecisionConfidence(pageCheck, sourceQualityScore),
      reason: pageAction.reason,
      ...base,
      ...(pageAction.readFrom ? { readFrom: pageAction.readFrom } : {}),
      ...(pageAction.url ? { url: pageAction.url } : {}),
    };
  }
  if (pageAction?.action === "open-source-link") {
    return {
      decision: "open-source-link",
      confidence: sourceQualityScore >= 0.78 ? "high" : sourceQualityScore >= 0.5 ? "medium" : "low",
      reason: pageAction.reason,
      ...base,
      ...(pageAction.url ? { url: pageAction.url } : {}),
      ...(pageAction.command ? { command: pageAction.command } : {}),
      ...(pageAction.commandArgs ? { commandArgs: pageAction.commandArgs } : {}),
    };
  }
  if (pageAction?.action === "open-site-search") {
    return {
      decision: "open-site-search",
      confidence: pageDecisionConfidence(pageCheck, sourceQualityScore),
      reason: pageAction.reason,
      ...base,
      ...(pageAction.url ? { url: pageAction.url } : {}),
      ...(pageAction.command ? { command: pageAction.command } : {}),
      ...(pageAction.commandArgs ? { commandArgs: pageAction.commandArgs } : {}),
    };
  }
  if (pageAction?.action === "retry-with-browser-html") {
    return {
      decision: "retry-with-browser-html",
      confidence: "low",
      reason: pageAction.reason,
      ...base,
      ...(pageAction.url ? { url: pageAction.url } : {}),
      ...(pageAction.command ? { command: pageAction.command } : {}),
      ...(pageAction.commandArgs ? { commandArgs: pageAction.commandArgs } : {}),
    };
  }
  if (pageAction?.requiresBrowserInteraction || actionExecution(pageAction ?? pageCheck.recommendedAction) === "interact-browser") {
    return {
      decision: "inspect-actions",
      confidence: "low",
      reason: pageAction?.reason ?? pageCheck.recommendedAction.reason,
      ...base,
      ...(pageAction?.url ? { url: pageAction.url } : {}),
    };
  }
  return {
    decision: "none",
    confidence: "low",
    reason: "No page-level decision was selected.",
    ...base,
  };
}

function summarizeAgentExecutionPlan(
  next: AgentNext,
  expectedOutcome: AgentExpectedOutcome,
  answerPlan: AgentAnswerPlan,
  canUseFetchedHtml: boolean,
  needsBrowserHtml: boolean,
): AgentExecutionPlan {
  const operation = agentExecutionOperation(next);
  return {
    operation,
    confidence: executionPlanConfidence(operation, answerPlan, canUseFetchedHtml, needsBrowserHtml),
    reason: executionPlanReason(operation, next, answerPlan),
    useFetchedHtml: canUseFetchedHtml,
    needsBrowserHtml,
    answerReady: answerPlan.status === "ready",
    terminal: next.loop.terminal,
    shouldContinue: next.loop.shouldContinue,
    maxSuggestedIterations: next.loop.maxSuggestedIterations,
    expectedOutcome: expectedOutcome.kind,
    ...(next.readFrom ? { readFrom: next.readFrom } : {}),
    ...(next.command ? { command: next.command } : {}),
    ...(next.commandArgs ? { commandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { afterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { afterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.url ? { url: next.url } : {}),
    ...(next.browserHtml ? { browserHtml: next.browserHtml } : {}),
  };
}

function summarizeAgentRunbook(
  next: AgentNext,
  executionPlan: AgentExecutionPlan,
  answerPlan: AgentAnswerPlan,
): AgentRunbook {
  return {
    decision: next.loop.decision,
    mode: next.mode,
    operation: executionPlan.operation,
    ...(next.action ? { action: next.action } : {}),
    reason: next.loop.reason || next.reason,
    confidence: executionPlan.confidence,
    answerStatus: answerPlan.status,
    answerReady: executionPlan.answerReady,
    shouldContinue: next.loop.shouldContinue,
    terminal: next.loop.terminal,
    maxSuggestedIterations: next.loop.maxSuggestedIterations,
    useFetchedHtml: executionPlan.useFetchedHtml,
    needsBrowserHtml: executionPlan.needsBrowserHtml,
    expectedOutcome: executionPlan.expectedOutcome,
    ...(next.command ? { command: next.command } : {}),
    ...(next.commandArgs ? { commandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { afterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { afterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.readFrom ? { readFrom: next.readFrom } : {}),
    ...(next.readValue ? { readValue: next.readValue } : {}),
    ...(next.url ? { url: next.url } : {}),
    ...(next.target ? { target: next.target } : {}),
    ...(next.browserHtml ? { browserHtml: next.browserHtml } : {}),
  };
}

function summarizeAgentExecutor(
  next: AgentNext,
  executionPlan: AgentExecutionPlan,
  answerPlan: AgentAnswerPlan,
  handoff: AgentHandoff,
): AgentExecutorStep {
  return {
    instruction: handoff.instruction,
    decision: next.loop.decision,
    mode: next.mode,
    operation: executionPlan.operation,
    ...(next.action ? { action: next.action } : {}),
    status: answerPlan.status,
    confidence: executionPlan.confidence,
    answerReady: executionPlan.answerReady,
    shouldContinue: next.loop.shouldContinue,
    terminal: next.loop.terminal,
    maxSuggestedIterations: next.loop.maxSuggestedIterations,
    expectedOutcome: executionPlan.expectedOutcome,
    ...(answerPlan.useCitationIds.length > 0 ? { useCitationIds: answerPlan.useCitationIds } : {}),
    ...(handoff.verificationFoundQueries && handoff.verificationFoundQueries.length > 0 ? { verificationFoundQueries: handoff.verificationFoundQueries } : {}),
    ...(handoff.verificationMissingQueries && handoff.verificationMissingQueries.length > 0 ? { verificationMissingQueries: handoff.verificationMissingQueries } : {}),
    ...(next.commandArgs ? { commandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommandArgs ? { afterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.readFrom ? { readFrom: next.readFrom } : {}),
    ...(next.readTarget ? { readTarget: next.readTarget } : {}),
    ...(next.readValue ? { readValue: next.readValue } : {}),
    ...(next.url ? { url: next.url } : {}),
    ...(next.target ? { target: next.target } : {}),
    ...(next.browserHtml ? { browserHtml: next.browserHtml } : {}),
  };
}

function summarizeAgentHandoff(
  next: AgentNext,
  executionPlan: AgentExecutionPlan,
  answerPlan: AgentAnswerPlan,
  answerEvidence: AgentCitation[] = [],
  resultChoices: AgentResultChoice[] = [],
  sourceChoices: AgentSourceChoice[] = [],
  sourceSearch?: AgentSourceSearch,
  signals: AgentSignal[] = [],
  qualityGates: AgentQualityGate[] = [],
  verificationFoundQueries: string[] = [],
  verificationMissingQueries: string[] = [],
): AgentHandoff {
  return {
    instruction: agentHandoffInstruction(next, executionPlan, answerPlan),
    decision: next.loop.decision,
    mode: next.mode,
    operation: executionPlan.operation,
    ...(next.action ? { action: next.action } : {}),
    confidence: executionPlan.confidence,
    ...(next.priority ? { priority: next.priority } : {}),
    ...(next.priorityReason ? { priorityReason: next.priorityReason } : {}),
    answerStatus: answerPlan.status,
    answerReady: executionPlan.answerReady,
    shouldContinue: next.loop.shouldContinue,
    terminal: next.loop.terminal,
    maxSuggestedIterations: next.loop.maxSuggestedIterations,
    expectedOutcome: executionPlan.expectedOutcome,
    reason: next.loop.reason || next.reason || executionPlan.reason,
    ...(answerPlan.useCitationIds.length > 0 ? { useCitationIds: answerPlan.useCitationIds } : {}),
    ...(verificationFoundQueries.length > 0 ? { verificationFoundQueries } : {}),
    ...(verificationMissingQueries.length > 0 ? { verificationMissingQueries } : {}),
    ...(answerEvidence.length > 0 ? { answerEvidence } : {}),
    ...(resultChoices.length > 0 ? { resultChoices } : {}),
    ...(sourceChoices.length > 0 ? { sourceChoices } : {}),
    ...(sourceSearch ? { sourceSearch } : {}),
    ...(signals.length > 0 ? { signals } : {}),
    ...(qualityGates.length > 0 ? { qualityGates } : {}),
    ...(next.readTarget ? { readTarget: next.readTarget } : {}),
    ...(next.readFrom ? { readFrom: next.readFrom } : {}),
    ...(next.readValue ? { readValue: next.readValue } : {}),
    ...(next.command ? { command: next.command } : {}),
    ...(next.commandArgs ? { commandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { afterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { afterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.url ? { url: next.url } : {}),
    ...(next.target ? { target: next.target } : {}),
    ...(next.browserHtml ? { browserHtml: next.browserHtml } : {}),
  };
}

function agentHandoffInstruction(next: AgentNext, executionPlan: AgentExecutionPlan, answerPlan: AgentAnswerPlan): string {
  if (answerPlan.status === "ready") {
    const citations = answerPlan.useCitationIds.length > 0 ? ` using citations ${answerPlan.useCitationIds.join(", ")}` : "";
    const readFrom = answerPlan.readFrom ? ` from ${answerPlan.readFrom}` : "";
    return `Answer now${readFrom}${citations}.`;
  }
  if (executionPlan.operation === "execute-command" && next.command) {
    return `Run ${formatShellCommandForInstruction(next.command, next.commandArgs)} and continue with its output.`;
  }
  if (executionPlan.operation === "capture-browser-html" && next.browserHtml) {
    return `Capture rendered HTML into ${next.browserHtml.htmlFile}, then run ${formatShellCommandForInstruction(next.browserHtml.command ?? next.command ?? "ax-grep", next.browserHtml.commandArgs ?? next.commandArgs)}.`;
  }
  if (executionPlan.operation === "inspect-browser") return "Inspect the page in a browser before answering.";
  if (executionPlan.operation === "inspect-output") return "Inspect the command output before answering.";
  if (next.readFrom) return `Read ${next.readFrom} before answering.`;
  return answerPlan.gaps[0] ?? executionPlan.reason;
}

function formatShellCommandForInstruction(command: string, args: string[] | undefined): string {
  if (!args || args.length === 0 || command.includes(" ")) return command;
  return [command, ...args.map(shellQuote)].join(" ");
}

function agentExecutionOperation(next: AgentNext): AgentExecutionPlan["operation"] {
  if (next.loop.decision === "return") return "return";
  if (next.loop.decision === "execute") return "execute-command";
  if (next.loop.decision === "browser") return next.mode === "capture-html" ? "capture-browser-html" : "inspect-browser";
  if (next.loop.decision === "inspect") return "inspect-output";
  return "stop";
}

function executionPlanConfidence(
  operation: AgentExecutionPlan["operation"],
  answerPlan: AgentAnswerPlan,
  canUseFetchedHtml: boolean,
  needsBrowserHtml: boolean,
): AgentExecutionPlan["confidence"] {
  if (needsBrowserHtml || operation === "capture-browser-html" || operation === "inspect-browser") return "low";
  if (operation === "return" && answerPlan.status === "ready") return answerPlan.confidence;
  if (operation === "execute-command" && canUseFetchedHtml) return "medium";
  if (answerPlan.status === "error") return "low";
  return canUseFetchedHtml ? "medium" : "low";
}

function executionPlanReason(operation: AgentExecutionPlan["operation"], next: AgentNext, answerPlan: AgentAnswerPlan): string {
  if (operation === "return" && answerPlan.status === "ready") return answerPlan.reason;
  if (operation === "capture-browser-html") return "Fetch output is not reliable enough; capture rendered HTML and rerun the provided command.";
  if (operation === "inspect-browser") return "Static extraction needs browser interaction or inspection before continuing.";
  return next.reason;
}

function pageDecisionConfidence(pageCheck: PageCheckSummary, sourceQualityScore: number): AgentPageDecision["confidence"] {
  const evidenceQualityScore = averageEvidenceScore(pageCheck.contentEvidence);
  if (pageCheck.readability.level === "high" && evidenceQualityScore >= 0.76) return "high";
  if (pageCheck.readability.level !== "low" && (evidenceQualityScore >= 0.5 || sourceQualityScore >= 0.5)) return "medium";
  return "low";
}

function searchCitationConfidence(result: ResultSummary): NonNullable<AgentCitation["confidence"]> {
  if (result.findMatches?.length || result.isLikelyOfficial || result.relevance === "high") return "high";
  if (result.relevance === "medium" || (result.sourceScore ?? 0) >= 0.5) return "medium";
  return "low";
}

function sourceCitationConfidence(link: PageLinkSummary): NonNullable<AgentCitation["confidence"]> {
  if ((link.sourceScore ?? 0) >= 0.78) return "high";
  if ((link.sourceScore ?? 0) >= 0.5) return "medium";
  return "low";
}

function summarizeAgentAnswerPlan(
  status: AgentStatus,
  primaryAction: SuggestedAction | undefined,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  citations: AgentCitation[],
  needsBrowserHtml: boolean,
  error?: { code: CliErrorCode; message: string; status?: number },
): AgentAnswerPlan {
  const actionFields = answerPlanActionFields(primaryAction);
  const citationIds = citations
    .filter((citation) => citation.kind === "verification" || citation.kind === "content" || citation.kind === "page-check")
    .map((citation) => citation.id)
    .slice(0, 4);
  if (needsBrowserHtml || status === "needs-browser") {
    return {
      status: "blocked",
      confidence: "low",
      reason: "Browser-captured HTML or browser inspection is needed before answering.",
      gaps: error
        ? [`Extraction failed with ${error.code}.`, "Browser-captured HTML or browser inspection is needed."]
        : ["Browser-captured HTML or browser inspection is needed."],
      useCitationIds: [],
      ...actionFields,
    };
  }
  if (error) {
    return {
      status: "error",
      confidence: "low",
      reason: `Extraction failed with ${error.code}.`,
      gaps: [`Extraction failed with ${error.code}.`],
      useCitationIds: [],
      ...actionFields,
    };
  }
  if (verification.status === "matched") {
    return {
      status: "ready",
      confidence: "high",
      reason: "Requested verification text was found; answer from the listed citations.",
      gaps: [],
      useCitationIds: citationIds,
      ...actionFields,
    };
  }
  if (primaryAction && actionExecution(primaryAction) === "read-current" && pageCheck.contentEvidence.length > 0 && pageCheck.readability.level !== "low") {
    return {
      status: "ready",
      confidence: answerPlanReadConfidence(pageCheck),
      reason: "Readable page evidence is available; answer from the listed citations.",
      gaps: answerPlanReadGaps(pageCheck, citationIds),
      useCitationIds: citationIds,
      ...actionFields,
    };
  }
  if (primaryAction && actionExecution(primaryAction) === "read-current" && citationIds.length > 0) {
    return {
      status: "ready",
      confidence: pageCheck.readability.level === "high" ? "high" : "medium",
      reason: "The current read target is available as citeable agent evidence.",
      gaps: answerPlanReadGaps(pageCheck, citationIds),
      useCitationIds: citationIds,
      ...actionFields,
    };
  }
  return {
    status: "needs-more",
    confidence: citationIds.length > 0 ? "medium" : "low",
    reason: "Follow the next action before producing a final answer.",
    gaps: answerPlanFollowupGaps(pageCheck, verification, citationIds),
    useCitationIds: citationIds,
    ...actionFields,
  };
}

function answerPlanReadConfidence(pageCheck: PageCheckSummary): AgentAnswerPlan["confidence"] {
  if (pageCheck.readability.level === "high" && averageEvidenceScore(pageCheck.contentEvidence) >= 0.76) return "high";
  return "medium";
}

function summarizeBrowserHtmlReason(needsBrowserHtml: boolean, answerPlan: AgentAnswerPlan, primaryAction?: SuggestedAction): string | undefined {
  if (!needsBrowserHtml) return undefined;
  return answerPlan.gaps.find((gap) => /browser/i.test(gap))
    ?? primaryAction?.reason
    ?? answerPlan.reason
    ?? "Browser-captured HTML or browser inspection is needed.";
}

function summarizeBrowserHtmlReasonCode(
  needsBrowserHtml: boolean,
  analysis: AnalysisSummary,
  primaryAction?: SuggestedAction,
  error?: { code: CliErrorCode },
): AgentBrowserHtmlReasonCode | undefined {
  if (!needsBrowserHtml) return undefined;
  if (error?.code === "NO_INSPECTABLE_CONTENT") return "no-inspectable-content";
  if (error?.code === "HTTP_ERROR") return "http-error";
  if (error?.code === "FETCH_FAILED" || error?.code === "TIMEOUT") return "fetch-error";
  if (analysis.diagnostics.some((diagnostic) => diagnostic.code === "NO_INSPECTABLE_CONTENT")) return "no-inspectable-content";
  if (analysis.diagnostics.some((diagnostic) => diagnostic.code === "CHALLENGE_LIKELY")) return "challenge";
  if (analysis.diagnostics.some((diagnostic) => diagnostic.code === "LOGIN_REQUIRED")) return "login-required";
  if (analysis.diagnostics.some((diagnostic) => diagnostic.code === "PAYWALL_LIKELY")) return "paywall";
  if (primaryAction?.requiresBrowserInteraction || (primaryAction && actionExecution(primaryAction) === "interact-browser")) return "browser-interaction";
  if (primaryAction?.action === "retry-with-browser-html") return "retry-action";
  if (analysis.kind === "blocked-page" || analysis.kind === "empty") return "blocked-or-empty";
  return "unknown";
}

function summarizeStaticReadiness(
  canUseFetchedHtml: boolean,
  needsBrowserHtml: boolean,
  pageCheck: PageCheckSummary,
  primaryAction?: SuggestedAction,
  error?: { code: CliErrorCode },
): { status: AgentStaticReadiness; reasonCode: AgentStaticReadinessReasonCode; reason: string; readFrom?: string } {
  if (needsBrowserHtml) {
    return {
      status: "needs-browser",
      reasonCode: primaryAction?.requiresBrowserInteraction || (primaryAction && actionExecution(primaryAction) === "interact-browser") ? "interaction-required" : "browser-required",
      reason: "Static fetched HTML is not enough; browser-captured HTML or browser inspection is required.",
      ...(primaryAction?.readFrom ? { readFrom: primaryAction.readFrom } : {}),
    };
  }
  if (error) {
    return {
      status: "error",
      reasonCode: "extraction-error",
      reason: `Static readiness could not be established because extraction failed with ${error.code}.`,
      ...(primaryAction?.readFrom ? { readFrom: primaryAction.readFrom } : {}),
    };
  }
  const readFrom = primaryAction?.readFrom ?? staticReadinessReadFromForAction(primaryAction);
  if (readFrom && isHiddenStaticReadPath(readFrom)) {
    return {
      status: "usable-hidden-data",
      reasonCode: "hidden-data",
      reason: "Fetched HTML is usable through hidden app data such as hydration, API, client-state, runtime, config, app, or mobile hints.",
      readFrom,
    };
  }
  if (readFrom && readFrom !== "pageCheck.contentEvidence") {
    return {
      status: "usable-structured-data",
      reasonCode: staticReadinessReasonCodeFromReadPath(readFrom),
      reason: "Fetched HTML is usable through structured page-check data rather than direct prose evidence.",
      readFrom,
    };
  }
  if (canUseFetchedHtml && pageCheck.readability.level !== "low") {
    return {
      status: "usable-content",
      reasonCode: "readable-content",
      reason: `Fetched HTML has ${pageCheck.readability.level} readability and can be used without browser capture.`,
      ...(readFrom ? { readFrom } : {}),
    };
  }
  if (canUseFetchedHtml) {
    return {
      status: "usable-structured-data",
      reasonCode: "limited-static-payload",
      reason: "Fetched HTML has limited prose, but an agent-readable static payload is available.",
      ...(readFrom ? { readFrom } : {}),
    };
  }
  return {
    status: "thin",
    reasonCode: "thin-content",
    reason: "Fetched HTML is thin and no browser capture is currently scheduled; verify before relying on it.",
    ...(readFrom ? { readFrom } : {}),
  };
}

function staticReadinessReasonCodeFromReadPath(path: string): AgentStaticReadinessReasonCode {
  if (path === "pageCheck.sourceLinks" || path.startsWith("pageCheck.sourceLinks[")) return "source-link";
  if (path === "pageCheck.forms" || path.startsWith("pageCheck.forms[")) return "form";
  if (path === "pageCheck.actionTargets" || path.startsWith("pageCheck.actionTargets[") || path === "pageCheck.actions" || path.startsWith("pageCheck.actions[")) return "action-target";
  return "structured-data";
}

function staticReadinessReadFromForAction(action?: SuggestedAction): string | undefined {
  if (!action) return undefined;
  if (action.action === "open-source-link") return action.sourceLinkRef ?? "pageCheck.sourceLinks";
  if (action.action === "submit-form") return "pageCheck.forms";
  if (action.action === "inspect-actions") return "pageCheck.actionTargets";
  return undefined;
}

function isHiddenStaticReadPath(path: string): boolean {
  return path === "pageCheck.hydration"
    || path === "pageCheck.apiEndpoints"
    || path === "pageCheck.clientState"
    || path === "pageCheck.runtime"
    || path === "pageCheck.config"
    || path === "pageCheck.appHints"
    || path === "pageCheck.mobileHints";
}

function answerPlanReadGaps(pageCheck: PageCheckSummary, citationIds: string[]): string[] {
  const gaps: string[] = [];
  if (citationIds.length === 0) gaps.push("No citeable content evidence was shortlisted.");
  if (pageCheck.sourceLinks.length === 0) gaps.push("No external source-like links were found.");
  if (pageCheck.readability.level !== "high") gaps.push(`Page readability is ${pageCheck.readability.level}.`);
  return gaps.slice(0, 3);
}

function answerPlanFollowupGaps(pageCheck: PageCheckSummary, verification: VerificationSummary, citationIds: string[]): string[] {
  const gaps: string[] = [];
  if (verification.missingQueries.length > 0) gaps.push(`Missing verification text: ${verification.missingQueries.join(", ")}.`);
  if (citationIds.length === 0) gaps.push("No citeable current-payload evidence is ready.");
  if (pageCheck.readability.level === "low") gaps.push("Current page readability is low.");
  gaps.push("A follow-up action is required before final answering.");
  return gaps.slice(0, 4);
}

function answerPlanActionFields(primaryAction: SuggestedAction | undefined): Pick<AgentAnswerPlan, "nextAction" | "command" | "commandArgs" | "afterInteractionCommand" | "afterInteractionCommandArgs" | "url" | "readFrom"> {
  if (!primaryAction) return {};
  return {
    ...(primaryAction.action ? { nextAction: primaryAction.action } : {}),
    ...(primaryAction.command ? { command: primaryAction.command } : {}),
    ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    ...(primaryAction.afterInteractionCommand ? { afterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
    ...(primaryAction.afterInteractionCommandArgs ? { afterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    ...(primaryAction.url ? { url: primaryAction.url } : {}),
    ...(primaryAction.readFrom ? { readFrom: primaryAction.readFrom } : {}),
  };
}

function summarizeAgentReadTargets(
  primaryAction: SuggestedAction | undefined,
  kind: ContentKind,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  sourceSearch?: SourceSearchSummary,
  semanticSummary?: AgentSemanticSummary,
): AgentReadTarget[] {
  const targets: AgentReadTarget[] = [];
  const add = (target: AgentReadTarget): void => {
    if (targets.some((item) => item.path === target.path)) return;
    targets.push(target);
  };
  const primaryReadFrom = primaryAction && actionExecution(primaryAction) === "read-current" ? primaryAction.readFrom : undefined;
  if (verification.bestEvidence) {
    add({
      path: "verification.bestEvidence",
      reason: "Best matching evidence for the requested --find text.",
      count: 1,
      ...(typeof verification.bestEvidence.score === "number" ? { score: verification.bestEvidence.score } : {}),
      ...(primaryReadFrom === "verification.bestEvidence" ? { primary: true } : {}),
    });
  }
  if (pageCheck.contentEvidence.length > 0) {
    add({
      path: "pageCheck.contentEvidence",
      reason: "Structured page excerpts suitable for source checking.",
      count: pageCheck.contentEvidence.length,
      score: averageEvidenceScore(pageCheck.contentEvidence),
      ...(primaryReadFrom === "pageCheck.contentEvidence" ? { primary: true } : {}),
    });
  }
  if (semanticSummary && kind !== "search-results") {
    add({
      path: "agent.semanticSummary",
      reason: "Compact semantic tree overview with role counts, top roles, landmarks, headings, and named role samples.",
      count: semanticSummary.namedRoleCount,
      score: roundMetric(Math.min(0.42, 0.28 + semanticSummary.interactiveCount * 0.01 + semanticSummary.namedRoleCount * 0.003)),
      ...(primaryReadFrom === "agent.semanticSummary" ? { primary: true } : {}),
    });
  }
  if (pageCheck.dataTables.length > 0) {
    add({
      path: "pageCheck.dataTables",
      reason: "Structured table captions, headers, and sample rows extracted from the page HTML.",
      count: pageCheck.dataTables.length,
      score: roundMetric(Math.min(1, 0.45 + pageCheck.dataTables.length * 0.1)),
      ...(primaryReadFrom === "pageCheck.dataTables" ? { primary: true } : {}),
    });
  }
  if (pageCheck.barriers.length > 0) {
    add({
      path: "pageCheck.barriers",
      reason: "Login, paywall, challenge, consent, or regional barrier signals extracted for browser-handling decisions.",
      count: pageCheck.barriers.length,
      score: roundMetric(Math.min(1, 0.5 + pageCheck.barriers.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.barriers" ? { primary: true } : {}),
    });
  }
  if (pageCheck.forms.length > 0) {
    add({
      path: "pageCheck.forms",
      reason: "Form action, method, field names, labels, and query URL templates extracted from the page HTML.",
      count: pageCheck.forms.length,
      score: roundMetric(Math.min(1, 0.4 + pageCheck.forms.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.forms" ? { primary: true } : {}),
    });
  }
  if (pageCheck.actionTargets.length > 0) {
    add({
      path: "pageCheck.actionTargets",
      reason: "JSON-LD and OpenSearch action targets with URL templates, query inputs, and methods.",
      count: pageCheck.actionTargets.length,
      score: roundMetric(Math.min(1, 0.44 + pageCheck.actionTargets.length * 0.07)),
      ...(primaryReadFrom === "pageCheck.actionTargets" ? { primary: true } : {}),
    });
  }
  if (pageCheck.hydration.length > 0) {
    add({
      path: "pageCheck.hydration",
      reason: "Hydration scripts and preloaded JSON data endpoints extracted from app-shell HTML.",
      count: pageCheck.hydration.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.hydration.length * 0.07)),
      ...(primaryReadFrom === "pageCheck.hydration" ? { primary: true } : {}),
    });
  }
  if (pageCheck.apiEndpoints.length > 0) {
    add({
      path: "pageCheck.apiEndpoints",
      reason: "Inline script API, GraphQL, XHR, and event-stream endpoint hints extracted from page HTML.",
      count: pageCheck.apiEndpoints.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.apiEndpoints.length * 0.07)),
      ...(primaryReadFrom === "pageCheck.apiEndpoints" ? { primary: true } : {}),
    });
  }
  if (pageCheck.clientState.length > 0) {
    add({
      path: "pageCheck.clientState",
      reason: "Inline script localStorage, sessionStorage, and cookie key hints extracted from page HTML.",
      count: pageCheck.clientState.length,
      score: roundMetric(Math.min(1, 0.44 + pageCheck.clientState.length * 0.07)),
      ...(primaryReadFrom === "pageCheck.clientState" ? { primary: true } : {}),
    });
  }
  if (pageCheck.runtime.length > 0) {
    add({
      path: "pageCheck.runtime",
      reason: "Service worker, worker, worklet, dynamic import, and modulepreload runtime URLs extracted from page HTML.",
      count: pageCheck.runtime.length,
      score: roundMetric(Math.min(1, 0.44 + pageCheck.runtime.length * 0.07)),
      ...(primaryReadFrom === "pageCheck.runtime" ? { primary: true } : {}),
    });
  }
  if (pageCheck.config.length > 0) {
    add({
      path: "pageCheck.config",
      reason: "Inline app config, initial state, env, feature flag, and dataLayer keys extracted from page scripts.",
      count: pageCheck.config.length,
      score: roundMetric(Math.min(1, 0.44 + pageCheck.config.length * 0.07)),
      ...(primaryReadFrom === "pageCheck.config" ? { primary: true } : {}),
    });
  }
  if (pageCheck.appHints.length > 0) {
    add({
      path: "pageCheck.appHints",
      reason: "Web app manifest, icon, theme, and installability hints extracted from hidden head metadata.",
      count: pageCheck.appHints.length,
      score: roundMetric(Math.min(1, 0.4 + pageCheck.appHints.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.appHints" ? { primary: true } : {}),
    });
  }
  if (pageCheck.mobileHints.length > 0) {
    add({
      path: "pageCheck.mobileHints",
      reason: "Mobile viewport, format detection, color scheme, smart app banner, and app-link hints extracted from hidden head metadata.",
      count: pageCheck.mobileHints.length,
      score: roundMetric(Math.min(1, 0.4 + pageCheck.mobileHints.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.mobileHints" ? { primary: true } : {}),
    });
  }
  if (pageCheck.topics.length > 0) {
    add({
      path: "pageCheck.topics",
      reason: "Keywords, tags, categories, about, and mention topics extracted from hidden metadata and JSON-LD.",
      count: pageCheck.topics.length,
      score: roundMetric(Math.min(1, 0.44 + pageCheck.topics.length * 0.05)),
      ...(primaryReadFrom === "pageCheck.topics" ? { primary: true } : {}),
    });
  }
  if (pageCheck.contactPoints.length > 0 && primaryReadFrom === "pageCheck.contactPoints") {
    add({
      path: "pageCheck.contactPoints",
      reason: "Email, phone, address, and contact URL facts extracted from HTML links, address tags, and JSON-LD.",
      count: pageCheck.contactPoints.length,
      score: roundMetric(Math.min(1, 0.45 + pageCheck.contactPoints.length * 0.06)),
      primary: true,
    });
  }
  if (pageCheck.keyValues.length > 0) {
    add({
      path: "pageCheck.keyValues",
      reason: "Compact label/value facts extracted from definition lists, time elements, and short metadata text.",
      count: pageCheck.keyValues.length,
      score: roundMetric(Math.min(1, 0.42 + pageCheck.keyValues.length * 0.04)),
      ...(primaryReadFrom === "pageCheck.keyValues" ? { primary: true } : {}),
    });
  }
  if (pageCheck.metaFacts.length > 0) {
    add({
      path: "pageCheck.metaFacts",
      reason: "Head metadata directives and canonical/alternate links extracted from page HTML.",
      count: pageCheck.metaFacts.length,
      score: roundMetric(Math.min(1, 0.44 + pageCheck.metaFacts.length * 0.05)),
      ...(primaryReadFrom === "pageCheck.metaFacts" ? { primary: true } : {}),
    });
  }
  if (pageCheck.httpPolicies.length > 0) {
    add({
      path: "pageCheck.httpPolicies",
      reason: "HTTP and meta policy directives for indexing, security, embedding, referrer, and cache handling.",
      count: pageCheck.httpPolicies.length,
      score: roundMetric(Math.min(1, 0.48 + pageCheck.httpPolicies.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.httpPolicies" ? { primary: true } : {}),
    });
  }
  if (pageCheck.schemaFacts.length > 0) {
    add({
      path: "pageCheck.schemaFacts",
      reason: "Compact JSON-LD schema.org facts extracted from hidden structured data.",
      count: pageCheck.schemaFacts.length,
      score: roundMetric(Math.min(1, 0.5 + pageCheck.schemaFacts.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.schemaFacts" ? { primary: true } : {}),
    });
  }
  if (pageCheck.offers.length > 0) {
    add({
      path: "pageCheck.offers",
      reason: "Structured price, availability, rating, and offer URLs extracted from JSON-LD.",
      count: pageCheck.offers.length,
      score: roundMetric(Math.min(1, 0.5 + pageCheck.offers.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.offers" ? { primary: true } : {}),
    });
  }
  if (pageCheck.identities.length > 0 && primaryReadFrom === "pageCheck.identities") {
    add({
      path: "pageCheck.identities",
      reason: "Organization, website, person, brand, and sameAs identity facts extracted from JSON-LD and metadata.",
      count: pageCheck.identities.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.identities.length * 0.06)),
      primary: true,
    });
  }
  if (pageCheck.datasets.length > 0 && primaryReadFrom === "pageCheck.datasets") {
    add({
      path: "pageCheck.datasets",
      reason: "Dataset, data catalog, and data download provenance extracted from JSON-LD and data file links.",
      count: pageCheck.datasets.length,
      score: roundMetric(Math.min(1, 0.5 + pageCheck.datasets.length * 0.08)),
      primary: true,
    });
  }
  if (pageCheck.faqs.length > 0) {
    add({
      path: "pageCheck.faqs",
      reason: "FAQ question-answer pairs extracted from details, accordion, and FAQ HTML.",
      count: pageCheck.faqs.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.faqs.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.faqs" ? { primary: true } : {}),
    });
  }
  if (pageCheck.breadcrumbs.length > 0) {
    add({
      path: "pageCheck.breadcrumbs",
      reason: "Structured breadcrumb trails extracted from JSON-LD and breadcrumb navigation.",
      count: pageCheck.breadcrumbs.length,
      score: roundMetric(Math.min(1, 0.42 + pageCheck.breadcrumbs.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.breadcrumbs" ? { primary: true } : {}),
    });
  }
  if (pageCheck.sections.length > 0) {
    add({
      path: "pageCheck.sections",
      reason: "Heading-grouped section summaries extracted from nearby page text.",
      count: pageCheck.sections.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.sections.length * 0.07)),
      ...(primaryReadFrom === "pageCheck.sections" ? { primary: true } : {}),
    });
  }
  if (pageCheck.pagination.length > 0) {
    add({
      path: "pageCheck.pagination",
      reason: "Pagination and next/previous links extracted from rel metadata and page navigation.",
      count: pageCheck.pagination.length,
      score: roundMetric(Math.min(1, 0.38 + pageCheck.pagination.length * 0.05)),
      ...(primaryReadFrom === "pageCheck.pagination" ? { primary: true } : {}),
    });
  }
  if (pageCheck.toc.length > 0) {
    add({
      path: "pageCheck.toc",
      reason: "Table-of-contents and in-page section links extracted from document navigation.",
      count: pageCheck.toc.length,
      score: roundMetric(Math.min(1, 0.42 + pageCheck.toc.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.toc" ? { primary: true } : {}),
    });
  }
  if (pageCheck.codeBlocks.length > 0) {
    add({
      path: "pageCheck.codeBlocks",
      reason: "Code examples and command snippets extracted from pre/code blocks.",
      count: pageCheck.codeBlocks.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.codeBlocks.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.codeBlocks" ? { primary: true } : {}),
    });
  }
  if (pageCheck.citations.length > 0) {
    add({
      path: "pageCheck.citations",
      reason: "Citations, blockquotes, footnotes, and reference-list snippets extracted from page HTML.",
      count: pageCheck.citations.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.citations.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.citations" ? { primary: true } : {}),
    });
  }
  if (pageCheck.media.length > 0) {
    add({
      path: "pageCheck.media",
      reason: "Image URLs, alt text, captions, and social preview media extracted from page HTML.",
      count: pageCheck.media.length,
      score: roundMetric(Math.min(1, 0.38 + pageCheck.media.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.media" ? { primary: true } : {}),
    });
  }
  if (pageCheck.resources.length > 0) {
    add({
      path: "pageCheck.resources",
      reason: "Feed, alternate, license, manifest, sitemap, and document resource links extracted from page HTML.",
      count: pageCheck.resources.length,
      score: roundMetric(Math.min(1, 0.4 + pageCheck.resources.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.resources" ? { primary: true } : {}),
    });
  }
  if (pageCheck.embeds.length > 0) {
    add({
      path: "pageCheck.embeds",
      reason: "Iframe, object, embed, audio, and video URLs with titles and source metadata extracted from page HTML.",
      count: pageCheck.embeds.length,
      score: roundMetric(Math.min(1, 0.38 + pageCheck.embeds.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.embeds" ? { primary: true } : {}),
    });
  }
  if (pageCheck.transcripts.length > 0) {
    add({
      path: "pageCheck.transcripts",
      reason: "Caption, subtitle, and transcript URLs with labels and language hints extracted from page HTML.",
      count: pageCheck.transcripts.length,
      score: roundMetric(Math.min(1, 0.44 + pageCheck.transcripts.length * 0.08)),
      ...(primaryReadFrom === "pageCheck.transcripts" ? { primary: true } : {}),
    });
  }
  if (pageCheck.authorLinks.length > 0) {
    add({
      path: "pageCheck.authorLinks",
      reason: "Author, byline, and profile URLs extracted from HTML and JSON-LD.",
      count: pageCheck.authorLinks.length,
      score: roundMetric(Math.min(1, 0.4 + pageCheck.authorLinks.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.authorLinks" ? { primary: true } : {}),
    });
  }
  if (pageCheck.timeline.length > 0) {
    add({
      path: "pageCheck.timeline",
      reason: "Publication, modification, event, and visible time metadata extracted from page HTML and JSON-LD.",
      count: pageCheck.timeline.length,
      score: roundMetric(Math.min(1, 0.45 + pageCheck.timeline.length * 0.06)),
      ...(primaryReadFrom === "pageCheck.timeline" ? { primary: true } : {}),
    });
  }
  if (pageCheck.contactPoints.length > 0) {
    add({
      path: "pageCheck.contactPoints",
      reason: "Email, phone, address, and contact URL facts extracted from HTML links, address tags, and JSON-LD.",
      count: pageCheck.contactPoints.length,
      score: roundMetric(Math.min(1, 0.45 + pageCheck.contactPoints.length * 0.06)),
    });
  }
  if (pageCheck.identities.length > 0) {
    add({
      path: "pageCheck.identities",
      reason: "Organization, website, person, brand, and sameAs identity facts extracted from JSON-LD and metadata.",
      count: pageCheck.identities.length,
      score: roundMetric(Math.min(1, 0.46 + pageCheck.identities.length * 0.06)),
    });
  }
  if (pageCheck.datasets.length > 0) {
    add({
      path: "pageCheck.datasets",
      reason: "Dataset, data catalog, and data download provenance extracted from JSON-LD and data file links.",
      count: pageCheck.datasets.length,
      score: roundMetric(Math.min(1, 0.5 + pageCheck.datasets.length * 0.08)),
    });
  }
  if (pageCheck.provenance.length > 0) {
    add({
      path: "pageCheck.provenance",
      reason: "DOI, PMID, arXiv, ISBN, publisher, journal, license, and citation identifiers extracted from hidden metadata.",
      count: pageCheck.provenance.length,
      score: roundMetric(Math.min(1, 0.3 + pageCheck.provenance.length * 0.03)),
      ...(primaryReadFrom === "pageCheck.provenance" ? { primary: true } : {}),
    });
  }
  if (sourceSearch?.selectedResult) {
    add({
      path: "sourceSearch.selectedResult",
      reason: "Original SERP metadata for the result that produced the current page.",
      count: 1,
      ...(typeof sourceSearch.selectedResult.sourceScore === "number" ? { score: sourceSearch.selectedResult.sourceScore } : {}),
    });
  }
  if (kind === "search-results" && results.length > 0) {
    add({
      path: "searchResults",
      reason: "Ranked search result cards extracted from the current result page.",
      count: results.length,
    });
  }
  if (primaryAction?.action === "open-alternate-result" && sourceSearch?.alternateResults?.length) {
    add({
      path: "sourceSearch.alternateResults",
      reason: "Original SERP candidates available for recovery after the selected result failed or did not verify.",
      count: sourceSearch.alternateResults.length,
      score: averageResultSourceScore(sourceSearch.alternateResults),
    });
  }
  if (kind !== "search-results" && pageCheck.sourceLinks.length > 0) {
    add({
      path: "pageCheck.sourceLinks",
      reason: "External source-like links referenced by the page.",
      count: pageCheck.sourceLinks.length,
      score: roundMetric(pageCheck.sourceLinks.reduce((total, link) => total + (link.sourceScore ?? 0), 0) / pageCheck.sourceLinks.length),
    });
  }
  return targets.slice(0, 5);
}

function agentCanContinue(primaryAction: SuggestedAction | undefined): boolean {
  if (!primaryAction) return false;
  return actionExecution(primaryAction) !== "inspect-output";
}

function agentRoutingIntent(primaryAction: SuggestedAction | undefined): AgentRoutingIntent {
  if (!primaryAction) return "none";
  if (primaryAction.action === "retry-with-browser-html") return "browser-html";
  if (primaryAction.requiresBrowserInteraction || actionExecution(primaryAction) === "interact-browser") return "browser-interaction";
  if (primaryAction.action === "read-content" || primaryAction.action === "use-evidence" || actionExecution(primaryAction) === "read-current") return "read-current";
  if (primaryAction.action === "refine-search" || primaryAction.action === "broaden-search" || primaryAction.action === "check-url-or-search") return "search";
  if (primaryAction.action === "open-result" || primaryAction.action === "open-alternate-result" || primaryAction.action === "open-source-link" || primaryAction.action === "open-site-search" || primaryAction.url) return "open-url";
  if (actionExecution(primaryAction) === "inspect-output") return "inspect-output";
  return "open-url";
}

function agentContinuationMode(primaryAction: SuggestedAction | undefined): AgentContinuationMode {
  if (!primaryAction) return "stop";
  const routingIntent = agentRoutingIntent(primaryAction);
  if (routingIntent === "browser-html") return "capture-html";
  if (routingIntent === "browser-interaction") return "browser";
  const execution = actionExecution(primaryAction);
  if (execution === "read-current") return "read";
  if (execution === "inspect-output") return "inspect";
  if (execution === "run-command") return "command";
  return agentCanContinue(primaryAction) ? "command" : "stop";
}

function summarizeAgentNext(
  primaryAction: SuggestedAction | undefined,
  readTargets: AgentReadTarget[] = [],
  readValue?: AgentReadValue,
): AgentNext {
  if (!primaryAction) {
    return {
      mode: "stop",
      reason: "No follow-up action is available.",
      loop: summarizeAgentLoop(undefined),
    };
  }
  const readTarget = primaryAction.readFrom
    ? readTargets.find((target) => target.path === primaryAction.readFrom)
    : undefined;
  return {
    mode: agentContinuationMode(primaryAction),
    action: primaryAction.action,
    reason: primaryAction.reason,
    loop: summarizeAgentLoop(primaryAction),
    execution: actionExecution(primaryAction),
    priority: primaryAction.priority ?? actionPriority(primaryAction),
    priorityReason: primaryAction.priorityReason ?? actionPriorityReason(primaryAction),
    ...(primaryAction.url ? { url: primaryAction.url } : {}),
    ...(primaryAction.rank ? { rank: primaryAction.rank } : {}),
    ...(primaryAction.openResult ? { openResult: primaryAction.openResult } : {}),
    ...(primaryAction.readFrom ? { readFrom: primaryAction.readFrom } : {}),
    ...(primaryAction.command ? { command: primaryAction.command } : {}),
    ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
    ...(primaryAction.afterInteractionCommand ? { afterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
    ...(primaryAction.afterInteractionCommandArgs ? { afterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    ...(primaryAction.requiresBrowserInteraction ? { requiresBrowserInteraction: true } : {}),
    ...(primaryAction.terminal ? { terminal: true } : {}),
    ...(readTarget ? { readTarget } : {}),
    ...(readValue ? { readValue } : {}),
    ...(primaryAction.target ? { target: primaryAction.target } : {}),
    ...agentBrowserHtmlCaptureFields(primaryAction),
  };
}

function agentBrowserHtmlCaptureFields(primaryAction: SuggestedAction): { browserHtml?: AgentBrowserHtmlCapture } {
  if (primaryAction.action !== "retry-with-browser-html" && !primaryAction.afterInteractionCommandArgs) return {};
  return {
    browserHtml: {
      ...(primaryAction.url ? { url: primaryAction.url } : {}),
      htmlFile: "captured.html",
      captureScript: "document.documentElement.outerHTML",
      ...(primaryAction.command ? { command: primaryAction.command } : {}),
      ...(primaryAction.commandArgs ? { commandArgs: primaryAction.commandArgs } : {}),
      ...(primaryAction.afterInteractionCommand ? { afterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
      ...(primaryAction.afterInteractionCommandArgs ? { afterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    },
  };
}

function summarizeAgentLoop(primaryAction: SuggestedAction | undefined): AgentLoopDirective {
  if (!primaryAction) {
    return {
      decision: "stop",
      shouldContinue: false,
      terminal: true,
      reason: "No follow-up action is available.",
      maxSuggestedIterations: 0,
    };
  }
  const mode = agentContinuationMode(primaryAction);
  if (mode === "read") {
    return {
      decision: "return",
      shouldContinue: false,
      terminal: true,
      reason: primaryAction.readFrom
        ? `Return the resolved value for ${primaryAction.readFrom}.`
        : "Return the current payload evidence.",
      maxSuggestedIterations: 0,
    };
  }
  if (mode === "stop") {
    return {
      decision: "stop",
      shouldContinue: false,
      terminal: true,
      reason: primaryAction.reason,
      maxSuggestedIterations: 0,
    };
  }
  if (mode === "browser" || mode === "capture-html") {
    return {
      decision: "browser",
      shouldContinue: true,
      terminal: false,
      reason: mode === "capture-html"
        ? "Capture rendered HTML, rerun the provided command, and inspect the next agent payload."
        : "Use browser interaction or inspection before continuing.",
      maxSuggestedIterations: 1,
    };
  }
  if (mode === "inspect") {
    return {
      decision: "inspect",
      shouldContinue: false,
      terminal: false,
      reason: "Inspect the current payload before choosing a follow-up action.",
      maxSuggestedIterations: 0,
    };
  }
  return {
    decision: "execute",
    shouldContinue: true,
    terminal: false,
    reason: "Run the provided command and inspect the next agent payload.",
    maxSuggestedIterations: 1,
  };
}

function agentReadValue(
  primaryAction: SuggestedAction | undefined,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  sourceSearch?: SourceSearchSummary,
  semanticSummary?: AgentSemanticSummary,
): AgentReadValue | undefined {
  if (!primaryAction?.readFrom || actionExecution(primaryAction) !== "read-current") return undefined;
  const path = primaryAction.readFrom;
  if (path === "verification.bestEvidence" && verification.bestEvidence) return { path, value: verification.bestEvidence };
  if (path === "pageCheck.contentEvidence") return { path, value: pageCheck.contentEvidence };
  if (path === "pageCheck.dataTables") return { path, value: pageCheck.dataTables };
  if (path === "pageCheck.barriers") return { path, value: pageCheck.barriers };
  if (path === "pageCheck.forms") return { path, value: pageCheck.forms };
  if (path === "pageCheck.actionTargets") return { path, value: pageCheck.actionTargets };
  if (path === "pageCheck.hydration") return { path, value: pageCheck.hydration };
  if (path === "pageCheck.apiEndpoints") return { path, value: pageCheck.apiEndpoints };
  if (path === "pageCheck.clientState") return { path, value: pageCheck.clientState };
  if (path === "pageCheck.runtime") return { path, value: pageCheck.runtime };
  if (path === "pageCheck.config") return { path, value: pageCheck.config };
  if (path === "pageCheck.appHints") return { path, value: pageCheck.appHints };
  if (path === "pageCheck.mobileHints") return { path, value: pageCheck.mobileHints };
  if (path === "pageCheck.topics") return { path, value: pageCheck.topics };
  if (path === "pageCheck.contactPoints") return { path, value: pageCheck.contactPoints };
  if (path === "pageCheck.keyValues") return { path, value: pageCheck.keyValues };
  if (path === "pageCheck.metaFacts") return { path, value: pageCheck.metaFacts };
  if (path === "pageCheck.provenance") return { path, value: pageCheck.provenance };
  if (path === "pageCheck.httpPolicies") return { path, value: pageCheck.httpPolicies };
  if (path === "pageCheck.schemaFacts") return { path, value: pageCheck.schemaFacts };
  if (path === "pageCheck.offers") return { path, value: pageCheck.offers };
  if (path === "pageCheck.identities") return { path, value: pageCheck.identities };
  if (path === "pageCheck.datasets") return { path, value: pageCheck.datasets };
  if (path === "pageCheck.timeline") return { path, value: pageCheck.timeline };
  if (path === "pageCheck.faqs") return { path, value: pageCheck.faqs };
  if (path === "pageCheck.breadcrumbs") return { path, value: pageCheck.breadcrumbs };
  if (path === "pageCheck.sections") return { path, value: pageCheck.sections };
  if (path === "pageCheck.pagination") return { path, value: pageCheck.pagination };
  if (path === "pageCheck.toc") return { path, value: pageCheck.toc };
  if (path === "pageCheck.codeBlocks") return { path, value: pageCheck.codeBlocks };
  if (path === "pageCheck.citations") return { path, value: pageCheck.citations };
  if (path === "pageCheck.media") return { path, value: pageCheck.media };
  if (path === "pageCheck.resources") return { path, value: pageCheck.resources };
  if (path === "pageCheck.embeds") return { path, value: pageCheck.embeds };
  if (path === "pageCheck.transcripts") return { path, value: pageCheck.transcripts };
  if (path === "pageCheck.authorLinks") return { path, value: pageCheck.authorLinks };
  if (path === "searchResults") return { path, value: results };
  if (path === "sourceSearch.selectedResult" && sourceSearch?.selectedResult) return { path, value: sourceSearch.selectedResult };
  if (path === "sourceSearch.alternateResults" && sourceSearch?.alternateResults) return { path, value: sourceSearch.alternateResults };
  if (path === "pageCheck.sourceLinks") return { path, value: pageCheck.sourceLinks };
  if (path === "agent.semanticSummary" && semanticSummary) return { path, value: semanticSummary };
  return undefined;
}

function summarizeAgentExpectedOutcome(primaryAction: SuggestedAction | undefined): AgentExpectedOutcome {
  if (!primaryAction) {
    return {
      kind: "stop",
      message: "No follow-up action is available.",
    };
  }
  if (primaryAction.action === "retry-with-browser-html") {
    return {
      kind: "capture-html",
      message: "Capture rendered browser HTML, rerun the provided command, and expect a readable agent payload.",
    };
  }
  if (primaryAction.requiresBrowserInteraction || actionExecution(primaryAction) === "interact-browser") {
    return {
      kind: "browser-inspection",
      message: "Use a browser session to inspect or interact with the page state before retrying extraction.",
    };
  }
  if (actionExecution(primaryAction) === "read-current") {
    return {
      kind: "read-evidence",
      message: primaryAction.readFrom
        ? `Read ${primaryAction.readFrom} from the current payload and treat it as the next evidence source.`
        : "Read the current payload evidence before running another command.",
    };
  }
  if (primaryAction.action === "refine-search" || primaryAction.action === "broaden-search" || primaryAction.action === "check-url-or-search") {
    return {
      kind: "run-search",
      message: "Run the provided search command and expect a new ranked result payload.",
    };
  }
  if (primaryAction.action === "retry-later") {
    return {
      kind: "retry-fetch",
      message: "Retry the same URL with the provided command and expect a fresh page check payload.",
    };
  }
  if (primaryAction.action === "open-result" || primaryAction.action === "open-alternate-result" || primaryAction.action === "open-source-link" || primaryAction.action === "open-site-search" || primaryAction.url) {
    return {
      kind: "open-result",
      message: "Open the target URL with the provided command and expect the resulting page check or verification payload.",
    };
  }
  if (actionExecution(primaryAction) === "inspect-output") {
    return {
      kind: "inspect-output",
      message: "Inspect the current diagnostics and output before choosing a follow-up action.",
    };
  }
  return {
    kind: "inspect-output",
    message: "Inspect the current payload before choosing a follow-up action.",
  };
}

function summarizeAgentSignals(
  status: AgentStatus,
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  needsBrowserHtml: boolean,
  fetched?: FetchResult,
  error?: { code: CliErrorCode; message: string; status?: number },
): AgentSignal[] {
  const signals: AgentSignal[] = [];
  const add = (signal: AgentSignal): void => {
    if (signals.some((item) => item.kind === signal.kind && item.message === signal.message)) return;
    signals.push(signal);
  };

  if (error) {
    add({ kind: "diagnostic", severity: "error", message: `${error.code}: ${error.message}` });
  } else if (fetched && (fetched.status < 200 || fetched.status >= 400)) {
    add({ kind: "response", severity: fetched.status >= 500 ? "error" : "warning", message: `HTTP ${fetched.status} response from fetched page.` });
  }

  if (needsBrowserHtml) {
    add({ kind: "browser", severity: "warning", message: "Browser-captured HTML is recommended before trusting page content." });
  } else if (pageCheck.readability.level !== "low") {
    add({
      kind: "content",
      severity: "info",
      message: `Fetched HTML is ${pageCheck.readability.level} readability with ${pageCheck.contentEvidence.length} evidence item(s).`,
    });
  } else if (pageCheck.contentEvidence.length > 0) {
    add({
      kind: "content",
      severity: "warning",
      message: `Fetched HTML has low readability but ${pageCheck.contentEvidence.length} evidence item(s) were extracted.`,
    });
  } else if (status !== "choose-result") {
    add({ kind: "content", severity: "warning", message: "Fetched HTML has low readability for direct content extraction." });
  }

  if (analysis.kind === "search-results") {
    add({
      kind: "search-results",
      severity: results.length > 0 ? "info" : "warning",
      message: `${results.length} ranked search result(s) extracted.`,
    });
  }

  if (verification.requestedCount > 0) {
    add({
      kind: "verification",
      severity: verification.status === "matched" ? "info" : "warning",
      message: `${verification.foundCount}/${verification.requestedCount} requested verification text(s) found.`,
    });
  }

  if (analysis.kind !== "search-results" && pageCheck.sourceLinks.length > 0) {
    add({
      kind: "source-links",
      severity: "info",
      message: `${pageCheck.sourceLinks.length} source-like link(s) available for follow-up.`,
    });
  }

  for (const diagnostic of analysis.diagnostics.slice(0, 3)) {
    add({ kind: "diagnostic", severity: diagnostic.severity, message: `${diagnostic.code}: ${diagnostic.message}` });
  }

  return signals.slice(0, 6);
}

function selectBestReadTarget(readTargets: AgentReadTarget[]): AgentReadTarget | undefined {
  return [...readTargets].sort((left, right) => {
    if (left.primary !== right.primary) return left.primary ? -1 : 1;
    return (right.score ?? 0) - (left.score ?? 0);
  })[0];
}

function selectBestHiddenReadTarget(readTargets: AgentReadTarget[]): AgentReadTarget | undefined {
  return selectBestReadTarget(readTargets.filter(isHiddenAgentReadTarget));
}

function selectBestStructuredReadTarget(readTargets: AgentReadTarget[]): AgentReadTarget | undefined {
  return selectBestReadTarget(readTargets.filter(isStructuredAgentReadTarget));
}

function countDiagnosticsBySeverity(diagnostics: DiagnosticSummary[]): Record<DiagnosticSummary["severity"], number> {
  return diagnostics.reduce((counts, diagnostic) => {
    counts[diagnostic.severity] += 1;
    return counts;
  }, { info: 0, warning: 0, error: 0 });
}

function countAgentSignalsBySeverity(signals: AgentSignal[]): Record<AgentSignal["severity"], number> {
  return signals.reduce((counts, signal) => {
    counts[signal.severity] += 1;
    return counts;
  }, { info: 0, warning: 0, error: 0 });
}

function agentUsabilityScore(
  status: AgentStatus,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  results: ResultSummary[],
  needsBrowserHtml: boolean,
  error?: { code: CliErrorCode; message: string; status?: number },
): number {
  if (error) return 0;
  if (needsBrowserHtml) return 0.1;
  const confidence = pageCheck.confidence === "high" ? 1 : pageCheck.confidence === "medium" ? 0.65 : 0.25;
  const evidence = Math.min(1, pageCheck.contentEvidence.length / 3);
  const sources = Math.min(1, pageCheck.sourceLinks.length / 2);
  const searchResults = Math.min(1, results.length / 5);
  const verificationScore = verification.status === "matched"
    ? 1
    : verification.status === "partial"
      ? 0.55
      : verification.status === "missing"
        ? 0.15
        : 0.5;
  const statusScore = status === "ready" || status === "choose-result"
    ? 1
    : status === "verify"
      ? 0.55
      : status === "needs-browser"
        ? 0.15
        : 0;
  const resultScore = results.length > 0
    ? searchResults * 0.35 + confidence * 0.15 + verificationScore * 0.2 + statusScore * 0.3
    : pageCheck.readability.score * 0.35 + confidence * 0.2 + evidence * 0.2 + sources * 0.1 + verificationScore * 0.1 + statusScore * 0.05;
  return roundMetric(Math.max(0, Math.min(1, resultScore)));
}

function countAlternativeAgentActions(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  primaryAction: SuggestedAction | undefined,
): number {
  const actions: SuggestedAction[] = [];
  const add = (action: SuggestedAction | undefined): void => {
    if (!action || sameSuggestedAction(action, primaryAction)) return;
    if ((primaryAction?.action === "use-evidence" || primaryAction?.action === "read-content") && action.action === "read-content") return;
    if (actions.some((item) => sameSuggestedAction(item, action))) return;
    actions.push(action);
  };
  for (const action of analysis.suggestedActions) add(action);
  if (primaryAction?.action !== "use-evidence") {
    add(pageCheck.recommendedAction);
    for (const step of pageCheck.nextSteps) add(step);
  }
  add(verification.recommendedAction);
  return actions.length;
}

function summarizeAgentActions(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  primaryAction: SuggestedAction | undefined,
): AgentActionSummary[] {
  const actions: AgentActionSummary[] = [];
  const add = (action: SuggestedAction | undefined, source: AgentActionSource, primary = false, index?: number): void => {
    if (!action) return;
    if (!primary && sameSuggestedAction(action, primaryAction)) return;
    if (!primary && (primaryAction?.action === "use-evidence" || primaryAction?.action === "read-content") && action.action === "read-content") return;
    if (actions.some((item) => sameSuggestedAction(item, action))) return;
    actions.push({
      ...action,
      source,
      ...(primary ? { primary: true } : {}),
      ...(typeof index === "number" ? { index } : {}),
      execution: actionExecution(action),
      priority: action.priority ?? actionPriority(action),
      priorityReason: action.priorityReason ?? actionPriorityReason(action),
    });
  };
  add(primaryAction, "agent.primaryAction", true);
  analysis.suggestedActions.forEach((action, index) => add(action, "analysis.suggestedActions", false, index));
  if (primaryAction?.action !== "use-evidence") {
    add(pageCheck.recommendedAction, "pageCheck.recommendedAction");
    pageCheck.nextSteps.forEach((step, index) => add(step, "pageCheck.nextSteps", false, index));
  }
  add(verification.recommendedAction, "verification.recommendedAction");
  return actions;
}

function summarizeAgentFormChoices(forms: PageFormSummary[]): AgentFormChoice[] {
  return forms.map((form) => ({
    id: form.id,
    path: form.path,
    rank: form.rank,
    method: form.method,
    fieldCount: form.fieldCount,
    text: form.text,
    ...(form.actionUrl ? { actionUrl: form.actionUrl } : {}),
    ...(form.submitText ? { submitText: form.submitText } : {}),
    ...(form.queryField ? { queryField: form.queryField } : {}),
    ...(form.urlTemplate ? { urlTemplate: form.urlTemplate } : {}),
    ...(form.selector ? { selector: form.selector } : {}),
    fields: form.fields.map((field) => ({
      type: field.type,
      ...(field.name ? { name: field.name } : {}),
      ...(field.label ? { label: field.label } : {}),
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(field.value ? { value: field.value } : {}),
      ...(field.required ? { required: true } : {}),
      ...(field.selector ? { selector: field.selector } : {}),
      ...(field.options?.length ? { options: field.options.slice() } : {}),
    })),
  }));
}

function summarizeAgentActionTargetChoices(targets: PageActionTargetSummary[]): AgentActionTargetChoice[] {
  return targets.map((target) => ({
    id: target.id,
    path: target.path,
    rank: target.rank,
    kind: target.kind,
    name: target.name,
    text: target.text,
    source: target.source,
    ...(target.targetUrl ? { targetUrl: target.targetUrl } : {}),
    ...(target.urlTemplate ? { urlTemplate: target.urlTemplate } : {}),
    ...(target.queryInput ? { queryInput: target.queryInput } : {}),
    ...(target.method ? { method: target.method } : {}),
    ...(target.encodingType ? { encodingType: target.encodingType } : {}),
    ...(typeof target.disabled === "boolean" ? { disabled: target.disabled } : {}),
    ...(typeof target.pressed !== "undefined" ? { pressed: target.pressed } : {}),
    ...(typeof target.expanded === "boolean" ? { expanded: target.expanded } : {}),
    ...(typeof target.haspopup !== "undefined" ? { haspopup: target.haspopup } : {}),
    ...(target.controls ? { controls: target.controls } : {}),
    ...(target.selector ? { selector: target.selector } : {}),
  }));
}

function summarizeAgentTopChoice(
  resultChoices: AgentResultChoice[],
  sourceChoices: AgentSourceChoice[],
  formChoices: AgentFormChoice[],
  actionTargetChoices: AgentActionTargetChoice[],
): { kind: "result" | "source" | "form" | "action-target"; path: string; label?: string; url?: string; commandArgs?: string[] } | undefined {
  const result = resultChoices[0];
  if (result) {
    return {
      kind: "result",
      path: result.path,
      url: result.url,
      ...(result.title ? { label: result.title } : {}),
      ...(result.commandArgs ? { commandArgs: result.commandArgs } : {}),
    };
  }
  const source = sourceChoices[0];
  if (source) {
    return {
      kind: "source",
      path: source.path,
      url: source.url,
      ...(source.title || source.text ? { label: source.title || source.text } : {}),
      ...(source.commandArgs ? { commandArgs: source.commandArgs } : {}),
    };
  }
  const form = formChoices[0];
  if (form) {
    return {
      kind: "form",
      path: form.path,
      label: form.text,
      ...(form.actionUrl || form.urlTemplate ? { url: form.actionUrl ?? form.urlTemplate } : {}),
    };
  }
  const actionTarget = actionTargetChoices[0];
  if (actionTarget) {
    return {
      kind: "action-target",
      path: actionTarget.path,
      label: actionTarget.name || actionTarget.text,
      ...(actionTarget.targetUrl || actionTarget.urlTemplate ? { url: actionTarget.targetUrl ?? actionTarget.urlTemplate } : {}),
    };
  }
  return undefined;
}

function averageResultSourceScore(results: ResultSummary[]): number {
  const scores = results.map((result) => result.sourceScore).filter((score): score is number => typeof score === "number");
  if (scores.length === 0) return 0;
  return roundMetric(scores.reduce((total, score) => total + score, 0) / scores.length);
}

function agentSourceQualityScore(kind: ContentKind, sourceLinks: PageLinkSummary[], results: ResultSummary[], recommendedResult?: ResultSummary): number {
  if (kind === "search-results") return averageResultSourceScore(selectCompactSearchResults(results, recommendedResult));
  if (sourceLinks.length === 0) return 0;
  return roundMetric(sourceLinks.reduce((total, link) => total + (link.sourceScore ?? 0), 0) / sourceLinks.length);
}

function countHiddenAgentPageCheckSignals(pageCheck: PageCheckSummary): number {
  return hiddenAgentPageCheckPaths.reduce((total, path) => {
    const value = pageCheck[path];
    return total + (Array.isArray(value) ? value.length : 0);
  }, 0);
}

function selectTopHiddenAgentPageCheckSignal(pageCheck: PageCheckSummary): { group: string; path: string; kind?: string; text?: string; url?: string; source?: string; selector?: string } | undefined {
  for (const group of hiddenAgentPageCheckPaths) {
    const value = pageCheck[group];
    if (!Array.isArray(value) || value.length === 0) continue;
    const item = value[0];
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    return {
      group: String(group),
      path: typeof record.path === "string" ? record.path : `pageCheck.${String(group)}[0]`,
      ...(typeof record.kind === "string" ? { kind: record.kind } : {}),
      ...(typeof record.text === "string" ? { text: record.text } : {}),
      ...(typeof record.url === "string" ? { url: record.url } : {}),
      ...(typeof record.source === "string" ? { source: record.source } : {}),
      ...(typeof record.selector === "string" ? { selector: record.selector } : {}),
    };
  }
  return undefined;
}

function countHiddenAgentReadTargets(readTargets: AgentReadTarget[]): number {
  return readTargets.filter(isHiddenAgentReadTarget).length;
}

function countStructuredAgentReadTargets(readTargets: AgentReadTarget[]): number {
  return readTargets.filter(isStructuredAgentReadTarget).length;
}

function isStructuredAgentReadTarget(target: AgentReadTarget): boolean {
  return structuredAgentReadTargetPaths.has(target.path);
}

function isHiddenAgentReadTarget(target: AgentReadTarget): boolean {
  return hiddenAgentPageCheckPaths.some((path) => target.path === `pageCheck.${String(path)}`);
}

const structuredAgentReadTargetPaths = new Set<string>([
  "pageCheck.dataTables",
  "pageCheck.faqs",
  "pageCheck.sections",
  "pageCheck.toc",
  "pageCheck.codeBlocks",
  "pageCheck.citations",
  "pageCheck.media",
  "pageCheck.resources",
  "pageCheck.embeds",
  "pageCheck.transcripts",
  "pageCheck.breadcrumbs",
  "pageCheck.pagination",
]);

function averageEvidenceScore(evidence: PageEvidenceSummary[]): number {
  if (evidence.length === 0) return 0;
  return roundMetric(evidence.reduce((total, item) => total + item.score, 0) / evidence.length);
}

function primaryAgentAction(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
): SuggestedAction | undefined {
  const searchAction = analysis.suggestedActions.find((action) => action.action === "open-result" || action.action === "refine-search");
  if (searchAction) return searchAction;
  if (verification.recommendedAction) return verification.recommendedAction;
  return pageCheck.nextSteps[0] ?? pageCheck.recommendedAction;
}

function agentStatus(
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  needsBrowserHtml: boolean,
  error?: { code: CliErrorCode; message: string; status?: number },
): AgentStatus {
  if (error && error.code !== "NO_INSPECTABLE_CONTENT") return "error";
  if (needsBrowserHtml) return "needs-browser";
  if (analysis.kind === "search-results") return "choose-result";
  if (verification.status === "partial" || verification.status === "missing") return "verify";
  if (verification.status === "matched") return "ready";
  if (pageCheck.readability.level === "low"
    && pageCheck.recommendedAction.action === "read-content"
    && actionExecution(pageCheck.recommendedAction) === "read-current") return "ready";
  if (pageCheck.readability.level === "low") return "verify";
  return "ready";
}

function agentSummaryText(
  status: AgentStatus,
  analysis: AnalysisSummary,
  pageCheck: PageCheckSummary,
  verification: VerificationSummary,
  recommendedResult?: ResultSummary,
): string {
  if (status === "error") return "Extraction failed before a usable page summary was produced.";
  if (status === "needs-browser") return "Fetched HTML is blocked, empty, or too thin; browser-captured HTML is recommended.";
  if (status === "choose-result" && recommendedResult) return `Open result ${recommendedResult.rank}: ${recommendedResult.title}.`;
  if (status === "choose-result") return "Search results are low confidence; refine the query before opening a result.";
  if (status === "verify") {
    if (verification.status === "partial") return "Some requested text was found; inspect missing evidence before relying on this page.";
    if (verification.status === "missing") return "Requested text was not found in the current page summaries.";
    return "The page has limited readable evidence; inspect source links or controls before relying on it.";
  }
  if (verification.status === "matched") return "All requested text was found in the page summaries.";
  if (analysis.kind === "content-page") return "The page has readable content evidence suitable for source checking.";
  return `The page is usable with ${pageCheck.confidence} confidence and ${pageCheck.readability.level} readability.`;
}

function findCandidates(
  page: PageSummary,
  pageCheck: PageCheckSummary,
  links: LinkSummary[],
  results: ResultSummary[],
  outline: OutlineSummary[],
  content: ContentSummary[],
  kind: ContentKind,
): FindMatchSummary[] {
  const candidates: FindMatchSummary[] = [];
  const seen = new Set<string>();
  const add = (match: FindMatchSummary): void => {
    const key = `${match.url ?? ""}\n${match.text}`.toLowerCase();
    if (!match.text || seen.has(key)) return;
    seen.add(key);
    candidates.push(match);
  };
  if (kind !== "search-results") {
    if (page.title) add({ field: "title", text: page.title });
    if (page.description) add({ field: "description", text: page.description });
    if (pageCheck.mainHeading) add({ field: "mainHeading", text: pageCheck.mainHeading });
  }
  for (const evidence of pageCheck.contentEvidence) {
    add({
      field: "contentEvidence",
      text: evidence.text,
      rank: evidence.rank,
      ...(evidence.selector ? { selector: evidence.selector } : {}),
      source: evidence.source,
      score: evidence.score,
      quality: evidence.quality,
      qualityReason: evidence.qualityReason,
    });
  }
  for (const table of pageCheck.dataTables) {
    add({
      field: "dataTable",
      text: table.text,
      rank: table.rank,
      ...(table.selector ? { selector: table.selector } : {}),
    });
  }
  for (const barrier of pageCheck.barriers) {
    add({
      field: "barrier",
      text: barrier.text,
      rank: barrier.rank,
      ...(barrier.selector ? { selector: barrier.selector } : {}),
    });
  }
  for (const form of pageCheck.forms) {
    add({
      field: "form",
      text: form.text,
      rank: form.rank,
      ...(form.actionUrl ? { url: form.actionUrl } : {}),
      ...(form.selector ? { selector: form.selector } : {}),
    });
  }
  for (const target of pageCheck.actionTargets) {
    add({
      field: "actionTarget",
      text: target.text,
      rank: target.rank,
      ...(target.targetUrl ? { url: target.targetUrl } : target.urlTemplate ? { url: target.urlTemplate } : {}),
      ...(target.selector ? { selector: target.selector } : {}),
    });
  }
  for (const item of pageCheck.hydration) {
    add({
      field: "hydration",
      text: item.text,
      rank: item.rank,
      ...(item.url ? { url: item.url } : {}),
      ...(item.selector ? { selector: item.selector } : {}),
    });
  }
  for (const endpoint of pageCheck.apiEndpoints) {
    add({
      field: "apiEndpoint",
      text: endpoint.text,
      rank: endpoint.rank,
      url: endpoint.url,
      ...(endpoint.selector ? { selector: endpoint.selector } : {}),
    });
  }
  for (const state of pageCheck.clientState) {
    add({
      field: "clientState",
      text: state.text,
      rank: state.rank,
      ...(state.selector ? { selector: state.selector } : {}),
    });
  }
  for (const runtime of pageCheck.runtime) {
    add({
      field: "runtime",
      text: runtime.text,
      rank: runtime.rank,
      url: runtime.url,
      ...(runtime.selector ? { selector: runtime.selector } : {}),
    });
  }
  for (const config of pageCheck.config) {
    add({
      field: "config",
      text: config.text,
      rank: config.rank,
      ...(config.selector ? { selector: config.selector } : {}),
    });
  }
  for (const hint of pageCheck.appHints) {
    add({
      field: "appHint",
      text: hint.text,
      rank: hint.rank,
      ...(hint.url ? { url: hint.url } : {}),
      ...(hint.selector ? { selector: hint.selector } : {}),
    });
  }
  for (const hint of pageCheck.mobileHints) {
    add({
      field: "mobileHint",
      text: hint.text,
      rank: hint.rank,
      ...(hint.url ? { url: hint.url } : {}),
      ...(hint.selector ? { selector: hint.selector } : {}),
    });
  }
  for (const topic of pageCheck.topics) {
    add({
      field: "topic",
      text: topic.text,
      rank: topic.rank,
      ...(topic.selector ? { selector: topic.selector } : {}),
    });
  }
  for (const contact of pageCheck.contactPoints) {
    add({
      field: "contactPoint",
      text: contact.text,
      rank: contact.rank,
      ...(contact.url ? { url: contact.url } : {}),
      ...(contact.selector ? { selector: contact.selector } : {}),
    });
  }
  for (const fact of pageCheck.keyValues) {
    add({
      field: "keyValue",
      text: fact.text,
      rank: fact.rank,
      ...(fact.selector ? { selector: fact.selector } : {}),
    });
  }
  for (const fact of pageCheck.metaFacts) {
    add({
      field: "metaFact",
      text: fact.text,
      rank: fact.rank,
      ...(fact.url ? { url: fact.url } : {}),
      ...(fact.selector ? { selector: fact.selector } : {}),
    });
  }
  for (const policy of pageCheck.httpPolicies) {
    add({
      field: "httpPolicy",
      text: policy.text,
      rank: policy.rank,
      ...(policy.selector ? { selector: policy.selector } : {}),
    });
  }
  for (const fact of pageCheck.schemaFacts) {
    add({
      field: "schemaFact",
      text: fact.text,
      rank: fact.rank,
      ...(fact.selector ? { selector: fact.selector } : {}),
    });
  }
  for (const offer of pageCheck.offers) {
    add({
      field: "offer",
      text: offer.text,
      rank: offer.rank,
      ...(offer.url ? { url: offer.url } : {}),
      ...(offer.selector ? { selector: offer.selector } : {}),
    });
  }
  for (const identity of pageCheck.identities) {
    add({
      field: "identity",
      text: identity.text,
      rank: identity.rank,
      ...(identity.url ? { url: identity.url } : {}),
      ...(identity.selector ? { selector: identity.selector } : {}),
    });
  }
  for (const dataset of pageCheck.datasets) {
    add({
      field: "dataset",
      text: dataset.text,
      rank: dataset.rank,
      ...(dataset.url ? { url: dataset.url } : dataset.distributionUrls?.[0] ? { url: dataset.distributionUrls[0] } : {}),
      ...(dataset.selector ? { selector: dataset.selector } : {}),
    });
  }
  for (const fact of pageCheck.provenance) {
    add({
      field: "provenance",
      text: fact.text,
      rank: fact.rank,
      ...(fact.url ? { url: fact.url } : {}),
      ...(fact.selector ? { selector: fact.selector } : {}),
    });
  }
  for (const item of pageCheck.timeline) {
    add({
      field: "timeline",
      text: item.text,
      rank: item.rank,
      ...(item.selector ? { selector: item.selector } : {}),
    });
  }
  for (const faq of pageCheck.faqs) {
    add({
      field: "faq",
      text: faq.text,
      rank: faq.rank,
      ...(faq.selector ? { selector: faq.selector } : {}),
    });
  }
  for (const breadcrumb of pageCheck.breadcrumbs) {
    add({
      field: "breadcrumb",
      text: breadcrumb.text,
      rank: breadcrumb.rank,
      ...(breadcrumb.selector ? { selector: breadcrumb.selector } : {}),
    });
  }
  for (const section of pageCheck.sections) {
    add({
      field: "section",
      text: section.text,
      rank: section.rank,
      ...(section.selector ? { selector: section.selector } : {}),
    });
  }
  for (const pagination of pageCheck.pagination) {
    add({
      field: "pagination",
      text: pagination.text,
      rank: pagination.rank,
      ...(pagination.url ? { url: pagination.url } : {}),
      ...(pagination.selector ? { selector: pagination.selector } : {}),
    });
  }
  for (const toc of pageCheck.toc) {
    add({
      field: "toc",
      text: toc.text,
      rank: toc.rank,
      ...(toc.selector ? { selector: toc.selector } : {}),
    });
  }
  for (const codeBlock of pageCheck.codeBlocks) {
    add({
      field: "codeBlock",
      text: codeBlock.text,
      rank: codeBlock.rank,
      ...(codeBlock.selector ? { selector: codeBlock.selector } : {}),
    });
  }
  for (const citation of pageCheck.citations) {
    add({
      field: "citation",
      text: citation.text,
      rank: citation.rank,
      ...(citation.url ? { url: citation.url } : {}),
      ...(citation.selector ? { selector: citation.selector } : {}),
    });
  }
  for (const media of pageCheck.media) {
    add({
      field: "media",
      text: media.text,
      rank: media.rank,
      url: media.url,
      ...(media.selector ? { selector: media.selector } : {}),
    });
  }
  for (const resource of pageCheck.resources) {
    add({
      field: "resource",
      text: resource.text,
      rank: resource.rank,
      url: resource.url,
      ...(resource.selector ? { selector: resource.selector } : {}),
    });
  }
  for (const embed of pageCheck.embeds) {
    add({
      field: "embed",
      text: embed.text,
      rank: embed.rank,
      url: embed.url,
      ...(embed.selector ? { selector: embed.selector } : {}),
    });
  }
  for (const transcript of pageCheck.transcripts) {
    add({
      field: "transcript",
      text: transcript.text,
      rank: transcript.rank,
      url: transcript.url,
      ...(transcript.selector ? { selector: transcript.selector } : {}),
    });
  }
  for (const authorLink of pageCheck.authorLinks) {
    add({
      field: "authorLink",
      text: authorLink.text,
      rank: authorLink.rank,
      url: authorLink.url,
      ...(authorLink.selector ? { selector: authorLink.selector } : {}),
    });
  }
  for (const link of pageCheck.sourceLinks) add({ field: "sourceLink", text: link.title, rank: link.rank, url: link.url });
  for (const link of pageCheck.primaryLinks) add({ field: "primaryLink", text: link.title, rank: link.rank, url: link.url });
  for (const result of results) add({ field: "result", text: resultEvidenceText(result), rank: result.rank, url: result.url });
  for (const item of outline) add({ field: "heading", text: item.text, ...(item.level ? { rank: item.level } : {}) });
  for (const link of links) add({ field: "link", text: [link.text, link.snippet].filter(Boolean).join(" "), url: link.url });
  for (const item of content) add({ field: "content", text: item.text, ...(item.selector ? { selector: item.selector } : {}) });
  return candidates;
}

function normalizeFindValue(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function pageCheckContent(content: ContentSummary[]): ContentSummary[] {
  const paragraphContent = content.filter((item) => item.role !== "article");
  return paragraphContent.length > 0 ? paragraphContent : content;
}

function fallbackPageCheckPreview(fetched: FetchResult, outline: OutlineSummary[], primaryLinks: PageLinkSummary[]): string[] {
  const seen = new Set<string>();
  const preview: string[] = [];
  const add = (value: string): void => {
    const text = cleanContentText(value);
    const key = text.toLowerCase();
    if (!text || text.length < 6 || seen.has(key)) return;
    if (isLowValuePreviewText(text)) return;
    if (fetched.page.title && normalizePageTitle(fetched.page.title) === normalizePageTitle(text)) return;
    seen.add(key);
    preview.push(text);
  };
  for (const item of outline) add(item.text);
  for (const link of primaryLinks) {
    add(link.title);
    if (link.snippet) add(link.snippet);
  }
  return preview.slice(0, 4);
}

function htmlContentPreview(html: string): string[] {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const blocks: string[] = [];
  const seen = new Set<string>();
  function visit(nodes: AnyNode[]): void {
    for (const node of nodes) {
      if (!(node instanceof DomElement)) continue;
      if (isLikelyContentElement(node) && !hasLikelyContentChild(node)) {
        const text = cleanContentText(descendantText(node));
        const key = text.toLowerCase();
        if (text.length >= 24 && !seen.has(key) && !isLowValuePreviewText(text)) {
          seen.add(key);
          blocks.push(text);
          if (blocks.length >= 4) return;
        }
      }
      visit(node.children);
      if (blocks.length >= 4) return;
    }
  }
  visit(document.children);
  return blocks;
}

function isLikelyContentElement(element: Element): boolean {
  if (element.name === "p" || element.name === "article") return true;
  const marker = `${attr(element, "id") ?? ""} ${attr(element, "class") ?? ""} ${attr(element, "data-role") ?? ""}`.toLowerCase();
  return /(post|article|content|comment|view|본문|댓글)/i.test(marker)
    && !/(header|footer|nav|menu|login|auth|toolbar|button|contact|info|symph|like|reply)/i.test(marker);
}

function hasLikelyContentChild(element: Element): boolean {
  return element.children.some((child) => child instanceof DomElement && isLikelyContentElement(child));
}

function normalizePageTitle(value: string): string {
  return value.replace(/\s*[:|-]\s*.+$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isLowValuePreviewText(text: string): boolean {
  if (/^(?:\d{2,4}[-./년]\d{1,2}[-./월]\d{1,2}일?\s*){1,2}(?:\d{1,2}:\d{2}(?::\d{2})?)?\s*$/i.test(text)) return true;
  return /(본문 바로가기|메뉴 바로가기|보기설정|테마설정|통합검색|주소복사|Facebook|X\(Twitter\)|static nodes omitted|고객지원|게시물 삭제 요청|불법촬영물|쪽지 신고|닉네임 신고|개인정보|이용약관)/i.test(text);
}

function isLowValueHeadingText(text: string): boolean {
  return /^(navigation menu|folders and files|latest commit|history|repository files navigation|explore|explore by type|support & services|programs|footer|site navigation|메뉴|탐색|내비게이션)$/i.test(text.trim());
}

function summarizePrimaryPageLinks(links: LinkSummary[], baseUrl: string): PageLinkSummary[] {
  return links
    .filter((link) => !isLowValuePageLink(link))
    .slice(0, 8)
    .map((link, index) => {
      const sourceProfile = summarizeSourceProfile(link.url, link.text, link.snippet);
      const summary: PageLinkSummary = {
        title: link.text,
        url: link.url,
        source: sourceFromUrl(link.url),
        rank: index + 1,
        text: link.text,
        kind: samePageOrSameHost(link.url, baseUrl) ? "internal" : "external",
        sourceType: sourceProfile.type,
        sourceScore: sourceProfile.score,
        sourceHints: sourceProfile.hints,
        selectionReason: sourceLinkSelectionReason({
          source: sourceFromUrl(link.url),
          kind: samePageOrSameHost(link.url, baseUrl) ? "internal" : "external",
          sourceType: sourceProfile.type,
          sourceScore: sourceProfile.score,
          sourceHints: sourceProfile.hints,
        }),
      };
      if (link.snippet) summary.snippet = link.snippet;
      if (link.selector) summary.selector = link.selector;
      return summary;
    });
}

function isLowValuePageLink(link: LinkSummary): boolean {
  const haystack = `${link.text} ${link.url}`.toLowerCase();
  if (isLikelyGlobalNavigationText(link.text, link.snippet)) return true;
  return /(^clien\s|^clien$|login|logout|sign in|signup|register|privacy|terms|cookie|advertis|facebook\.com\/sharer|x\.com\/intent\/tweet|twitter\.com\/intent\/tweet|\/auth\/|#div_content|#menutop|\/service\/$|share|pricing|githubstatus|github\.blog|contact support|customer support|expert services|ask the github community|community discussions|공유|주소복사|본문 바로가기|메뉴 바로가기|보기설정|테마설정|톺아보기|공감글|커뮤니티전체|고객지원|광고|로그인|회원가입|개인정보|이용약관|메일인증|email verification)/i.test(haystack);
}

function isLikelyGlobalNavigationText(text: string, snippet = ""): boolean {
  const haystack = `${text} ${snippet}`.toLowerCase();
  return /(explore by type|support & services|why github|github skills|customer stories|events & webinars|ebooks & reports|business insights|community forum|trust center|partners|security lab|maintainer community|accelerator|github stars|archive program|blog changelog marketplace|contact support|customer support|expert services|ask the github community|status pricing blog)/i.test(haystack);
}

function pageCheckConfidence(contentLength: number, outline: OutlineSummary[], dataTables: PageDataTableSummary[], analysis: AnalysisSummary): PageCheckSummary["confidence"] {
  if (analysis.kind === "blocked-page" || analysis.kind === "empty") return "low";
  if (dataTables.length > 0 && (contentLength >= 80 || outline.length > 0)) return "high";
  if (dataTables.length > 0) return "medium";
  if (contentLength >= 180 && outline.length > 0) return "high";
  if (contentLength >= 80 || outline.length > 0) return "medium";
  return "low";
}

function emptyPageCheck(): PageCheckSummary {
  return {
    contentPreview: [],
    contentEvidence: [],
    dataTables: [],
    barriers: [],
    forms: [],
    actionTargets: [],
    hydration: [],
    apiEndpoints: [],
    clientState: [],
    runtime: [],
    config: [],
    appHints: [],
    mobileHints: [],
    topics: [],
    contactPoints: [],
    keyValues: [],
    metaFacts: [],
    provenance: [],
    httpPolicies: [],
    schemaFacts: [],
    offers: [],
    identities: [],
    datasets: [],
    timeline: [],
    faqs: [],
    breadcrumbs: [],
    sections: [],
    pagination: [],
    toc: [],
    codeBlocks: [],
    citations: [],
    media: [],
    resources: [],
    embeds: [],
    transcripts: [],
    authorLinks: [],
    contentLength: 0,
    primaryLinks: [],
    sourceLinks: [],
    actions: [],
    confidence: "low",
    readability: {
      level: "low",
      score: 0,
      reasons: ["no page content extracted"],
    },
    recommendedAction: {
      action: "retry-with-browser-html",
      reason: "The page is not reliably readable from fetched HTML.",
    },
    nextSteps: [
      {
        action: "retry-with-browser-html",
        reason: "The page is not reliably readable from fetched HTML.",
      },
    ],
  };
}

function emptyVerification(): VerificationSummary {
  return {
    status: "not-requested",
    requestedCount: 0,
    foundCount: 0,
    missingCount: 0,
    evidenceCount: 0,
    foundQueries: [],
    missingQueries: [],
  };
}

function errorAgent(error: CliError, url?: string, agentMode = false, findQueries: string[] = [], sourceSearch?: SourceSearchSummary, timeoutMs?: number, userAgent?: string): AgentSummary {
  const summary = error.code === "USAGE" ? error.message.split("\n")[0] || error.message : error.message;
  const primaryAction = errorAction(error, url, agentMode, findQueries, sourceSearch, timeoutMs, userAgent);
  const readTargets = summarizeErrorAgentReadTargets(primaryAction, sourceSearch);
  const bestReadTarget = selectBestReadTarget(readTargets);
  const next = summarizeAgentNext(primaryAction, readTargets, errorAgentReadValue(primaryAction, sourceSearch));
  const expectedOutcome = summarizeAgentExpectedOutcome(primaryAction);
  const needsBrowserHtml = errorNeedsBrowserHtml(primaryAction);
  const answerPlan = summarizeErrorAgentAnswerPlan(error, primaryAction, needsBrowserHtml);
  const browserHtmlReason = summarizeBrowserHtmlReason(needsBrowserHtml, answerPlan, primaryAction);
  const browserHtmlReasonCode = summarizeBrowserHtmlReasonCode(needsBrowserHtml, { kind: "empty", diagnostics: [], suggestedActions: [] }, primaryAction, error);
  const staticReadiness = summarizeStaticReadiness(false, needsBrowserHtml, emptyPageCheck(), primaryAction, error);
  const executionPlan = summarizeAgentExecutionPlan(next, expectedOutcome, answerPlan, false, needsBrowserHtml);
  const runbook = summarizeAgentRunbook(next, executionPlan, answerPlan);
  const signals = summarizeErrorAgentSignals(error, primaryAction, summary);
  const qualityGates: AgentQualityGate[] = [
    {
      kind: "fetch",
      pass: false,
      severity: "error",
      message: `Fetch or extraction failed with ${error.code}.`,
      score: 0,
      path: "error",
    },
    {
      kind: "browser",
      pass: !needsBrowserHtml,
      severity: needsBrowserHtml ? "warning" : "info",
      message: needsBrowserHtml ? "Browser-captured HTML or browser inspection is needed." : "No browser capture is required for this error path.",
      score: needsBrowserHtml ? 0 : 1,
      path: "agent.needsBrowserHtml",
    },
  ];
  const signalCounts = countAgentSignalsBySeverity(signals);
  const topSignal = signals[0];
  const topQualityGate = qualityGates[0];
  const problemSignal = signals.find((signal) => signal.severity === "error" || signal.severity === "warning");
  const failingQualityGate = qualityGates.find((gate) => !gate.pass);
  const sourceSearchAgent = compactAgentSourceSearch(sourceSearch);
  const sourceSearchSelectedResult = sourceSearchAgent?.selectedResult;
  const sourceSearchAlternateResult = sourceSearchAgent?.alternateResults?.[0];
  const handoff = summarizeAgentHandoff(next, executionPlan, answerPlan, [], [], [], sourceSearchAgent, signals, qualityGates);
  const executor = summarizeAgentExecutor(next, executionPlan, answerPlan, handoff);
  return {
    contract: agentContract,
    status: "error",
    pageKind: "empty",
    summary,
    routingIntent: agentRoutingIntent(primaryAction),
    continuationMode: agentContinuationMode(primaryAction),
    next,
    runbook,
    ...(next.action ? { nextActionName: next.action } : {}),
    ...(next.execution ? { nextExecution: next.execution } : {}),
    ...(next.command ? { nextCommand: next.command } : {}),
    ...(next.commandArgs ? { nextCommandArgs: next.commandArgs } : {}),
    ...(next.afterInteractionCommand ? { nextAfterInteractionCommand: next.afterInteractionCommand } : {}),
    ...(next.afterInteractionCommandArgs ? { nextAfterInteractionCommandArgs: next.afterInteractionCommandArgs } : {}),
    ...(next.readFrom ? { nextReadFrom: next.readFrom } : {}),
    ...(next.url ? { nextUrl: next.url } : {}),
    executor,
    handoff,
    expectedOutcome,
    executionPlan,
    answerPlan,
    signalCount: signals.length,
    signalWarningCount: signalCounts.warning ?? 0,
    signalErrorCount: signalCounts.error ?? 0,
    signals,
    qualityGateCount: qualityGates.length,
    qualityGateFailCount: qualityGates.filter((gate) => !gate.pass).length,
    qualityGates,
    ...(topSignal ? { topSignalKind: topSignal.kind } : {}),
    ...(topSignal ? { topSignalSeverity: topSignal.severity } : {}),
    ...(topSignal ? { topSignalMessage: topSignal.message } : {}),
    ...(topQualityGate ? { topQualityGateKind: topQualityGate.kind } : {}),
    ...(typeof topQualityGate?.pass === "boolean" ? { topQualityGatePass: topQualityGate.pass } : {}),
    ...(topQualityGate ? { topQualityGateSeverity: topQualityGate.severity } : {}),
    ...(topQualityGate ? { topQualityGateMessage: topQualityGate.message } : {}),
    ...(topQualityGate?.path ? { topQualityGatePath: topQualityGate.path } : {}),
    ...(typeof topQualityGate?.score === "number" ? { topQualityGateScore: topQualityGate.score } : {}),
    ...(problemSignal ? { problemSignalKind: problemSignal.kind } : {}),
    ...(problemSignal ? { problemSignalSeverity: problemSignal.severity } : {}),
    ...(problemSignal ? { problemSignalMessage: problemSignal.message } : {}),
    ...(failingQualityGate ? { failingQualityGateKind: failingQualityGate.kind } : {}),
    ...(failingQualityGate ? { failingQualityGateSeverity: failingQualityGate.severity } : {}),
    ...(failingQualityGate ? { failingQualityGateMessage: failingQualityGate.message } : {}),
    ...(failingQualityGate?.path ? { failingQualityGatePath: failingQualityGate.path } : {}),
    ...(typeof failingQualityGate?.score === "number" ? { failingQualityGateScore: failingQualityGate.score } : {}),
    canContinue: agentCanContinue(primaryAction),
    canUseFetchedHtml: false,
    needsBrowserHtml,
    staticReadiness: staticReadiness.status,
    staticReadinessReasonCode: staticReadiness.reasonCode,
    staticReadinessReason: staticReadiness.reason,
    ...(staticReadiness.readFrom ? { staticReadinessReadFrom: staticReadiness.readFrom } : {}),
    ...(browserHtmlReason ? { browserHtmlReason } : {}),
    ...(browserHtmlReasonCode ? { browserHtmlReasonCode } : {}),
    ...(next.browserHtml ? { browserHtmlActionName: next.action } : {}),
    ...(next.browserHtml ? { browserHtmlOperation: executionPlan.operation } : {}),
    ...(next.browserHtml?.url ? { browserHtmlUrl: next.browserHtml.url } : {}),
    ...(next.browserHtml?.htmlFile ? { browserHtmlFile: next.browserHtml.htmlFile } : {}),
    ...(next.browserHtml?.captureScript ? { browserHtmlCaptureScript: next.browserHtml.captureScript } : {}),
    ...(next.browserHtml?.command ? { browserHtmlCommand: next.browserHtml.command } : {}),
    ...(next.browserHtml?.commandArgs ? { browserHtmlCommandArgs: next.browserHtml.commandArgs } : {}),
    ...(next.browserHtml?.afterInteractionCommand ? { browserHtmlAfterInteractionCommand: next.browserHtml.afterInteractionCommand } : {}),
    ...(next.browserHtml?.afterInteractionCommandArgs ? { browserHtmlAfterInteractionCommandArgs: next.browserHtml.afterInteractionCommandArgs } : {}),
    responseStatus: error.status ?? 0,
    responseOk: false,
    responseContentType: "",
    finalUrlChanged: false,
    confidence: "low",
    usabilityScore: 0,
    readability: "low",
    readabilityScore: 0,
    readabilityReasons: ["error before page readability could be evaluated"],
    verificationStatus: "not-requested",
    verificationRequestedCount: 0,
    verificationFoundCount: 0,
    verificationMissingCount: 0,
    verificationFoundQueries: [],
    verificationMissingQueries: [],
    resultCount: 0,
    resultChoiceCount: 0,
    resultChoices: [],
    evidenceCount: 0,
    formCount: 0,
    formChoiceCount: 0,
    formChoices: [],
    actionTargetCount: 0,
    actionTargetChoiceCount: 0,
    actionTargetChoices: [],
    barrierCount: 0,
    dataTableCount: 0,
    faqCount: 0,
    codeBlockCount: 0,
    resourceCount: 0,
    mediaCount: 0,
    sectionCount: 0,
    breadcrumbCount: 0,
    paginationCount: 0,
    tocCount: 0,
    embedCount: 0,
    transcriptCount: 0,
    authorLinkCount: 0,
    provenanceCount: 0,
    offerCount: 0,
    datasetCount: 0,
    identityCount: 0,
    timelineCount: 0,
    contactPointCount: 0,
    structuredReadTargetCount: 0,
    hiddenSignalCount: 0,
    hiddenHydrationCount: 0,
    hiddenApiEndpointCount: 0,
    hiddenClientStateCount: 0,
    hiddenAppHintCount: 0,
    hiddenReadTargetCount: 0,
    sourceLinkCount: 0,
    sourceChoiceCount: 0,
    sourceChoices: [],
    sourceSearchAlternateCount: sourceSearch?.alternateResults?.length ?? 0,
    ...(sourceSearch ? { sourceSearchQuery: sourceSearch.query } : {}),
    ...(sourceSearch ? { sourceSearchEngine: sourceSearch.engine } : {}),
    ...(sourceSearch?.selectedEngine ? { sourceSearchSelectedEngine: sourceSearch.selectedEngine } : {}),
    ...(sourceSearch ? { sourceSearchSearchUrl: sourceSearch.searchUrl } : {}),
    ...(sourceSearch?.lang ? { sourceSearchLang: sourceSearch.lang } : {}),
    ...(sourceSearch?.region ? { sourceSearchRegion: sourceSearch.region } : {}),
    ...(sourceSearch?.findQueries ? { sourceSearchFindQueryCount: sourceSearch.findQueries.length } : {}),
    ...(sourceSearch?.findQueries?.[0] ? { sourceSearchTopFindQuery: sourceSearch.findQueries[0] } : {}),
    ...(sourceSearch ? { sourceSearchSelectedRank: sourceSearch.selectedRank } : {}),
    ...(sourceSearch ? { sourceSearchSelectedTitle: sourceSearch.selectedTitle } : {}),
    ...(sourceSearch ? { sourceSearchSelectedUrl: sourceSearch.selectedUrl } : {}),
    ...(sourceSearchSelectedResult?.host ? { sourceSearchSelectedHost: sourceSearchSelectedResult.host } : {}),
    ...(sourceSearchSelectedResult ? { sourceSearchSelectedPath: sourceSearchSelectedResult.path } : {}),
    ...(sourceSearchSelectedResult?.openResult ? { sourceSearchSelectedOpenResult: sourceSearchSelectedResult.openResult } : {}),
    ...(sourceSearchSelectedResult?.commandArgs ? { sourceSearchSelectedCommandArgs: sourceSearchSelectedResult.commandArgs } : {}),
    ...(sourceSearchSelectedResult?.selectionReason ? { sourceSearchSelectedReason: sourceSearchSelectedResult.selectionReason } : {}),
    ...(sourceSearch ? { sourceSearchFailureCode: error.code } : {}),
    ...(sourceSearch && typeof error.status === "number" ? { sourceSearchFailureStatus: error.status } : {}),
    ...(sourceSearch ? { sourceSearchFailureUrl: sourceSearch.selectedUrl } : {}),
    ...(sourceSearch ? { sourceSearchFailureReason: sourceSearchFailureReason(error) } : {}),
    ...(sourceSearchAlternateResult ? { sourceSearchAlternatePath: sourceSearchAlternateResult.path } : {}),
    ...(sourceSearchAlternateResult?.title ? { sourceSearchAlternateTitle: sourceSearchAlternateResult.title } : {}),
    ...(sourceSearchAlternateResult?.url ? { sourceSearchAlternateUrl: sourceSearchAlternateResult.url } : {}),
    ...(sourceSearchAlternateResult?.host ? { sourceSearchAlternateHost: sourceSearchAlternateResult.host } : {}),
    ...(typeof sourceSearchAlternateResult?.rank === "number" ? { sourceSearchAlternateRank: sourceSearchAlternateResult.rank } : {}),
    ...(sourceSearchAlternateResult?.openResult ? { sourceSearchAlternateOpenResult: sourceSearchAlternateResult.openResult } : {}),
    ...(sourceSearchAlternateResult?.commandArgs ? { sourceSearchAlternateCommandArgs: sourceSearchAlternateResult.commandArgs } : {}),
    ...(sourceSearchAlternateResult?.selectionReason ? { sourceSearchAlternateReason: sourceSearchAlternateResult.selectionReason } : {}),
    evidenceQualityScore: 0,
    sourceQualityScore: 0,
    alternativeActionCount: 0,
    diagnosticCodes: [error.code],
    diagnosticErrorCount: 1,
    diagnosticWarningCount: 0,
    diagnosticInfoCount: 0,
    topDiagnosticCode: error.code,
    topDiagnosticSeverity: "error",
    topDiagnosticMessage: summary,
    citationCount: 0,
    citations: [],
    answerEvidenceCount: 0,
    answerEvidence: [],
    readTargetCount: readTargets.length,
    readTargets,
    ...(readTargets[0] ? { topReadTarget: readTargets[0].path } : {}),
    ...(typeof readTargets[0]?.count === "number" ? { topReadTargetCount: readTargets[0].count } : {}),
    ...(typeof readTargets[0]?.score === "number" ? { topReadTargetScore: readTargets[0].score } : {}),
    ...(typeof readTargets[0]?.primary === "boolean" ? { topReadTargetPrimary: readTargets[0].primary } : {}),
    ...(readTargets[0]?.reason ? { topReadTargetReason: readTargets[0].reason } : {}),
    actionCount: primaryAction ? 1 : 0,
    actions: primaryAction ? [{
      ...withActionExecution(primaryAction),
      source: "agent.primaryAction",
      primary: true,
    }] : [],
    ...(primaryAction ? { topActionName: primaryAction.action } : {}),
    ...(primaryAction ? { topActionSource: "agent.primaryAction" } : {}),
    ...(primaryAction ? { topActionExecution: actionExecution(primaryAction) } : {}),
    ...(primaryAction ? { topActionPriority: primaryAction.priority ?? actionPriority(primaryAction) } : {}),
    ...(primaryAction?.reason ? { topActionReason: primaryAction.reason } : {}),
    ...(primaryAction?.readFrom ? { topActionReadFrom: primaryAction.readFrom } : {}),
    ...(primaryAction?.commandArgs ? { topActionCommandArgs: primaryAction.commandArgs } : {}),
    ...(primaryAction?.url ? { topActionUrl: primaryAction.url } : {}),
    ...(primaryAction?.sourceLinkRef ? { topActionSourceLinkRef: primaryAction.sourceLinkRef } : {}),
    ...(primaryAction?.requiresBrowserInteraction ? { topActionRequiresBrowserInteraction: true } : {}),
    ...(bestReadTarget ? { bestReadTarget: bestReadTarget.path } : {}),
    ...(typeof bestReadTarget?.count === "number" ? { bestReadTargetCount: bestReadTarget.count } : {}),
    ...(typeof bestReadTarget?.score === "number" ? { bestReadTargetScore: bestReadTarget.score } : {}),
    ...(typeof bestReadTarget?.primary === "boolean" ? { bestReadTargetPrimary: bestReadTarget.primary } : {}),
    ...(bestReadTarget ? { bestReadTargetReason: bestReadTarget.reason } : {}),
    executorDecision: executor.decision,
    executorMode: executor.mode,
    executorOperation: executor.operation,
    executorConfidence: executor.confidence,
    executorAnswerReady: executor.answerReady,
    executorShouldContinue: executor.shouldContinue,
    executorTerminal: executor.terminal,
    executorExpectedOutcome: executor.expectedOutcome,
    ...(executor.target?.url ? { executorTargetUrl: executor.target.url } : {}),
    ...(executor.target?.path ? { executorTargetPath: executor.target.path } : {}),
    ...(executor.target?.selector ? { executorTargetSelector: executor.target.selector } : {}),
    ...(executor.target?.text ? { executorTargetText: executor.target.text } : {}),
    handoffDecision: handoff.decision,
    handoffMode: handoff.mode,
    handoffOperation: handoff.operation,
    handoffAnswerStatus: handoff.answerStatus,
    handoffConfidence: handoff.confidence,
    handoffAnswerReady: handoff.answerReady,
    handoffShouldContinue: handoff.shouldContinue,
    handoffTerminal: handoff.terminal,
    handoffExpectedOutcome: handoff.expectedOutcome,
    ...(handoff.target?.url ? { handoffTargetUrl: handoff.target.url } : {}),
    ...(handoff.target?.path ? { handoffTargetPath: handoff.target.path } : {}),
    ...(handoff.target?.selector ? { handoffTargetSelector: handoff.target.selector } : {}),
    ...(handoff.target?.text ? { handoffTargetText: handoff.target.text } : {}),
    ...(primaryAction ? { primaryActionName: primaryAction.action } : {}),
    ...(primaryAction?.reason ? { primaryReason: primaryAction.reason } : {}),
    ...(primaryAction ? { primaryPriority: primaryAction.priority ?? actionPriority(primaryAction) } : {}),
    ...(primaryAction ? { primaryPriorityReason: primaryAction.priorityReason ?? actionPriorityReason(primaryAction) } : {}),
    ...(primaryAction ? { primaryExecution: actionExecution(primaryAction) } : {}),
    ...(primaryAction?.readFrom ? { primaryReadFrom: primaryAction.readFrom } : {}),
    ...(primaryAction?.command ? { primaryCommand: primaryAction.command } : {}),
    ...(primaryAction?.commandArgs ? { primaryCommandArgs: primaryAction.commandArgs } : {}),
    ...(primaryAction?.afterInteractionCommand ? { primaryAfterInteractionCommand: primaryAction.afterInteractionCommand } : {}),
    ...(primaryAction?.afterInteractionCommandArgs ? { primaryAfterInteractionCommandArgs: primaryAction.afterInteractionCommandArgs } : {}),
    ...(primaryAction?.url ? { primaryUrl: primaryAction.url } : {}),
    ...(primaryAction?.rank ? { primaryRank: primaryAction.rank } : {}),
    ...(primaryAction?.openResult ? { primaryOpenResult: primaryAction.openResult } : {}),
    ...(primaryAction?.requiresBrowserInteraction ? { requiresBrowserInteraction: true } : {}),
    ...(primaryAction ? { primaryAction } : {}),
  };
}

function summarizeErrorAgentAnswerPlan(error: CliError, primaryAction: SuggestedAction | undefined, needsBrowserHtml: boolean): AgentAnswerPlan {
  const actionFields = answerPlanActionFields(primaryAction);
  if (needsBrowserHtml) {
    return {
      status: "blocked",
      confidence: "low",
      reason: "Extraction failed; browser-captured HTML is needed before answering.",
      gaps: [`Extraction failed with ${error.code}.`, "Browser-captured HTML is needed."],
      useCitationIds: [],
      ...actionFields,
    };
  }
  if (primaryAction && actionExecution(primaryAction) !== "inspect-output") {
    return {
      status: "needs-more",
      confidence: "low",
      reason: "Extraction failed, but a recovery action is available.",
      gaps: [`Extraction failed with ${error.code}.`, "Follow the recovery action before answering."],
      useCitationIds: [],
      ...actionFields,
    };
  }
  return {
    status: "error",
    confidence: "low",
    reason: `Extraction failed with ${error.code}.`,
    gaps: [`Extraction failed with ${error.code}.`],
    useCitationIds: [],
    ...actionFields,
  };
}

function summarizeErrorAgentSignals(error: CliError, primaryAction: SuggestedAction | undefined, summary: string): AgentSignal[] {
  const signals: AgentSignal[] = [
    { kind: "diagnostic", severity: "error", message: `${error.code}: ${summary}` },
  ];
  if (primaryAction?.action === "retry-with-browser-html") {
    signals.push({ kind: "browser", severity: "warning", message: "Browser-captured HTML is recommended before retrying extraction." });
  }
  return signals;
}

function errorNeedsBrowserHtml(primaryAction: SuggestedAction | undefined): boolean {
  return primaryAction?.action === "retry-with-browser-html";
}

function summarizeErrorAgentReadTargets(primaryAction: SuggestedAction | undefined, sourceSearch?: SourceSearchSummary): AgentReadTarget[] {
  const targets: AgentReadTarget[] = [];
  if (sourceSearch?.selectedResult) {
    targets.push({
      path: "sourceSearch.selectedResult",
      reason: "Original SERP metadata for the selected result that failed.",
      count: 1,
      ...(typeof sourceSearch.selectedResult.sourceScore === "number" ? { score: sourceSearch.selectedResult.sourceScore } : {}),
    });
  }
  if (primaryAction?.action !== "open-alternate-result" || !sourceSearch?.alternateResults?.length) return targets;
  targets.push({
    path: "sourceSearch.alternateResults",
    reason: "Original SERP candidates available for recovery after the selected result failed.",
    count: sourceSearch.alternateResults.length,
    score: averageResultSourceScore(sourceSearch.alternateResults),
  });
  return targets;
}

function errorAgentReadValue(primaryAction: SuggestedAction | undefined, sourceSearch?: SourceSearchSummary): AgentReadValue | undefined {
  if (!primaryAction?.readFrom || actionExecution(primaryAction) !== "read-current") return undefined;
  if (primaryAction.readFrom === "sourceSearch.selectedResult" && sourceSearch?.selectedResult) {
    return { path: primaryAction.readFrom, value: sourceSearch.selectedResult };
  }
  if (primaryAction.readFrom === "sourceSearch.alternateResults" && sourceSearch?.alternateResults) {
    return { path: primaryAction.readFrom, value: sourceSearch.alternateResults };
  }
  return undefined;
}

function sourceSearchFailureReason(error: CliError): string {
  const status = typeof error.status === "number" ? ` status ${error.status}` : "";
  return `Selected sourceSearch result failed with ${error.code}${status}.`;
}

function errorAction(error: CliError, url?: string, agentMode = false, findQueries: string[] = [], sourceSearch?: SourceSearchSummary, timeoutMs?: number, userAgent?: string): SuggestedAction | undefined {
  if (error.code === "USAGE") return undefined;
  if (!url) {
    return {
      action: "retry-or-check-input",
      reason: "The CLI could not complete extraction for this request.",
    };
  }
  if (error.code === "HTTP_ERROR" && (error.status === 404 || error.status === 410)) {
    const alternate = bestSourceSearchAlternate(sourceSearch, findQueries);
    const alternateCommand = alternate && sourceSearch
      ? searchOpenCommandSpec(
          sourceSearch.query,
          sourceSearch.selectedEngine ?? sourceSearch.engine,
          findQueries,
          agentMode,
          sourceSearch.lang,
          sourceSearch.region,
          alternate.rank,
          sourceSearch.timeoutMs,
          sourceSearch.userAgent,
        )
      : undefined;
    if (alternate && alternateCommand) {
      return {
        action: "open-alternate-result",
        reason: "The selected search result was missing; open the next available result from the original SERP.",
        url: alternate.url,
        rank: alternate.rank,
        target: agentTargetFromResult(alternate),
        ...commandFields(alternateCommand),
      };
    }
    return {
      action: "check-url-or-search",
      reason: "The URL returned a missing/gone status; verify the URL or search for a replacement source.",
      url,
      ...commandFields(searchCommandSpec(url, agentMode, timeoutMs, userAgent)),
    };
  }
  if (error.code === "HTTP_ERROR" && typeof error.status === "number" && error.status >= 500) {
    return {
      action: "retry-later",
      reason: "The server returned a transient error status; retry the same URL later.",
      url,
      ...commandFields(pageCommandSpec(url, agentMode, false, findQueries, timeoutMs, userAgent)),
    };
  }
  return {
    action: "retry-with-browser-html",
    reason: "Fetch failed before a usable page summary was available; retry with browser-captured HTML.",
    url,
    ...commandFields(pageCommandSpec(url, agentMode, true, findQueries, timeoutMs, userAgent)),
  };
}

function linkContextSnippet(link: SemanticNode, ancestors: SemanticNode[]): string {
  for (const ancestor of [...ancestors].reverse()) {
    const role = ancestor.role || ancestor.tag;
    if (!["li", "listitem", "article", "section", "div", "p", "td", "cell"].includes(role)) continue;
    const text = cleanContentText(descendantSemanticText(ancestor, link));
    if (text.length < 24) continue;
    if (text.toLowerCase() === (link.name || "").toLowerCase()) continue;
    return text;
  }
  return "";
}

function descendantSemanticText(node: SemanticNode, skip?: SemanticNode): string {
  if (node === skip) return "";
  const parts = [node.text, node.role === "link" ? "" : node.name, node.value].filter(Boolean) as string[];
  for (const child of node.children) {
    const text = descendantSemanticText(child, skip);
    if (text) parts.push(text);
  }
  return parts.join(" ");
}

function cleanContentText(text: string): string {
  return cleanLinkText(text)
    .replace(/\s+([,.;:!?])/g, "$1")
    .slice(0, 320);
}

function analyzePage(
  fetched: FetchResult,
  tree: SemanticNode,
  links: LinkSummary[],
  results: ResultSummary[],
  outline: OutlineSummary[],
  actions: ActionSummary[],
  content: ContentSummary[],
  options: Pick<CliOptions, "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchLang" | "searchRegion" | "findQueries">
    & Partial<Pick<CliOptions, "timeoutMs" | "userAgent">>
    & { agentMode?: boolean; capturedHtml?: boolean } = {},
): AnalysisSummary {
  const barrierDiagnostics = filterDiagnosticsForResultPages(detectBarrierDiagnostics(fetched, tree, content), results);
  const diagnostics: DiagnosticSummary[] = [...barrierDiagnostics];
  const suggestedActions: SuggestedAction[] = [];
  const kind = classifyPage(fetched, tree, results, outline, actions, content, barrierDiagnostics);

  if (kind === "empty") {
    diagnostics.push({
      severity: "error",
      code: "NO_INSPECTABLE_CONTENT",
      message: "No inspectable content was extracted from the page.",
    });
    suggestedActions.push(options.capturedHtml
      ? {
          action: "inspect-browser-state",
          reason: "Browser-captured HTML is still empty; inspect the browser state or capture after interacting.",
          url: fetched.finalUrl,
          requiresBrowserInteraction: true,
          ...afterInteractionCommandFields(pageCommandSpec(fetched.finalUrl, options.agentMode ?? false, true, options.findQueries ?? [], options.timeoutMs, options.userAgent)),
        }
      : {
          action: "retry-with-browser-html",
          reason: "The fetched HTML may be challenged, empty, or JavaScript-rendered.",
        });
  }

  if (kind === "blocked-page") {
    suggestedActions.push(options.capturedHtml
      ? {
          action: "inspect-browser-state",
          reason: "Browser-captured HTML still appears blocked, challenged, paywalled, or login-gated.",
          url: fetched.finalUrl,
          requiresBrowserInteraction: true,
          ...afterInteractionCommandFields(pageCommandSpec(fetched.finalUrl, options.agentMode ?? false, true, options.findQueries ?? [], options.timeoutMs, options.userAgent)),
        }
      : {
          action: "retry-with-browser-html",
          reason: "The page appears blocked, challenged, paywalled, or login-gated.",
        });
  }

  if (kind === "search-results" && results[0]) {
    const topResults = results.slice(0, 5);
    const lowConfidence = searchResultsLowConfidence(topResults);
    if (lowConfidence) {
      diagnostics.push({
        severity: "warning",
        code: "SEARCH_LOW_CONFIDENCE",
        message: "Search results were extracted, but top results only weakly match the query.",
      });
    }
    const recommended = recommendedSearchResult(results, options.findQueries ?? []);
    if (recommended) {
      const command = options.searchQuery
        ? searchOpenCommandSpec(options.searchQuery, options.selectedSearchEngine ?? options.searchEngine, options.findQueries ?? [], options.agentMode ?? false, options.searchLang, options.searchRegion, "best", options.timeoutMs, options.userAgent)
        : pageCommandSpec(recommended.url, options.agentMode ?? false, false, options.findQueries ?? [], options.timeoutMs, options.userAgent);
      const reason = searchResultActionReason(recommended, results[0]);
      suggestedActions.push({
        action: "open-result",
        reason,
        url: recommended.url,
        rank: recommended.rank,
        openResult: options.searchQuery ? "best" : recommended.rank,
        target: agentTargetFromResult(recommended),
        ...commandFields(command),
      });
    } else {
      const directSearch = inferSearchResultCommandContext(fetched.finalUrl);
      const query = options.searchQuery ?? directSearch?.query;
      const engine = options.selectedSearchEngine ?? options.searchEngine ?? directSearch?.engine;
      const command = refineSearchCommandSpec(query, engine, options.findQueries ?? [], options.agentMode ?? false, options.searchLang, options.searchRegion, options.timeoutMs, options.userAgent);
      suggestedActions.push({
        action: "refine-search",
        reason: (options.findQueries?.length ?? 0) > 0
          ? "No result card matched the requested --find text; refine the query before opening a result."
          : "Top results do not match the essential query terms; refine the query or add --find before opening a result.",
        ...commandFields(command),
      });
    }
  }

  if (kind === "content-page" && content.length > 0) {
    suggestedActions.push({
      action: "read-content",
      reason: "The page has article-like content excerpts suitable for source checking.",
      url: fetched.finalUrl,
      terminal: true,
      readFrom: "pageCheck.contentEvidence",
    });
  }

  if (kind === "interactive-page" && actions.length > 0) {
    suggestedActions.push({
      action: "inspect-actions",
      reason: "The page exposes prominent controls that may be needed before content is visible.",
      url: fetched.finalUrl,
      requiresBrowserInteraction: true,
      ...afterInteractionCommandFields(pageCommandSpec(fetched.finalUrl, options.agentMode ?? false, true, options.findQueries ?? [], options.timeoutMs, options.userAgent)),
    });
  }

  if (links.length === 0 && kind !== "empty") {
    diagnostics.push({
      severity: "warning",
      code: "NO_USEFUL_LINKS",
      message: "No useful outbound links were found in the semantic tree.",
    });
  }

  if (!fetched.contentType.includes("html") && fetched.contentType) {
    diagnostics.push({
      severity: "warning",
      code: "NON_HTML_CONTENT_TYPE",
      message: `Fetched content-type is ${fetched.contentType}.`,
    });
  }

  return { kind, diagnostics, suggestedActions };
}

function searchResultsLowConfidence(results: ResultSummary[]): boolean {
  return results.some((result) => result.relevance)
    && !results.some((result) => result.relevance === "high" || result.isLikelyOfficial || (result.findMatches?.length ?? 0) > 0);
}

function filterDiagnosticsForResultPages(diagnostics: DiagnosticSummary[], results: ResultSummary[]): DiagnosticSummary[] {
  if (results.length < 5) return diagnostics;
  return diagnostics.filter((diagnostic) => diagnostic.code === "CHALLENGE_LIKELY");
}

function classifyPage(
  fetched: FetchResult,
  tree: SemanticNode,
  results: ResultSummary[],
  outline: OutlineSummary[],
  actions: ActionSummary[],
  content: ContentSummary[],
  diagnostics: DiagnosticSummary[],
): ContentKind {
  if (isUnavailableTree(tree)) return "empty";
  if (diagnostics.some((item) => item.code === "CHALLENGE_LIKELY" || item.code === "LOGIN_REQUIRED" || item.code === "PAYWALL_LIKELY")) return "blocked-page";
  if (looksLikeKnownSearchUrl(fetched.finalUrl) || (looksLikeGenericSearchUrl(fetched.finalUrl) && extractSearchResults(fetched.html, fetched.finalUrl).length > 0)) return "search-results";
  if (content.length >= 2 || outline.length >= 3) return "content-page";
  if (actions.length >= 3) return "interactive-page";
  return "page";
}

function detectBarrierDiagnostics(fetched: FetchResult, tree: SemanticNode, content: ContentSummary[]): DiagnosticSummary[] {
  const haystack = [
    fetched.page.title,
    fetched.page.description,
    ...content.map((item) => item.text),
    descendantSemanticText(tree),
  ].filter(Boolean).join(" ").toLowerCase();
  const diagnostics: DiagnosticSummary[] = [];

  if (/(captcha|verify you are human|unusual traffic|checking your browser|just a moment|cf-browser-verification|cloudflare|access denied|request blocked|please wait for verification|please wait|enable javascript|enable java script|자바스크립트|봇이 아닙니다|자동입력|보안문자)/i.test(haystack)) {
    diagnostics.push({
      severity: "warning",
      code: "CHALLENGE_LIKELY",
      message: "The page appears to contain a bot check, CAPTCHA, or access challenge.",
    });
  }
  if (/(login required|log in to continue|sign in to continue|please sign in|로그인이 필요|회원만|가입 후|unauthorized)/i.test(haystack)) {
    diagnostics.push({
      severity: "warning",
      code: "LOGIN_REQUIRED",
      message: "The page appears to require login or account access.",
    });
  }
  if (/(subscribe to continue|subscription required|paywall|premium article|구독|유료기사|유료 기사|결제 후)/i.test(haystack)) {
    diagnostics.push({
      severity: "warning",
      code: "PAYWALL_LIKELY",
      message: "The page appears to be paywalled or subscription-gated.",
    });
  }

  return dedupeDiagnostics(diagnostics);
}

function dedupeDiagnostics(diagnostics: DiagnosticSummary[]): DiagnosticSummary[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    if (seen.has(diagnostic.code)) return false;
    seen.add(diagnostic.code);
    return true;
  });
}

function looksLikeKnownSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const pathname = parsed.pathname.toLowerCase();
    if (hostname.endsWith("duckduckgo.com") && (parsed.searchParams.has("q") || pathname === "/html/" || pathname === "/html")) return true;
    if (hostname.endsWith("bing.com") && parsed.searchParams.has("q")) return true;
    if (hostname.endsWith("startpage.com") && (parsed.searchParams.has("query") || pathname.includes("/sp/search"))) return true;
    if (hostname.endsWith("google.com") && parsed.searchParams.has("q") && pathname.startsWith("/search")) return true;
    if (hostname.endsWith("baidu.com") && parsed.searchParams.has("wd")) return true;
    if (hostname.endsWith("search.yahoo.co.jp") && parsed.searchParams.has("p")) return true;
    return false;
  } catch {
    return false;
  }
}

function looksLikeGenericSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return /\/search\b|\/sp\/search\b/i.test(pathname)
      && (parsed.searchParams.has("q") || parsed.searchParams.has("query") || parsed.searchParams.has("wd") || parsed.searchParams.has("p"));
  } catch {
    return false;
  }
}

function findElement(nodes: AnyNode[], predicate: (element: Element) => boolean): Element | undefined {
  for (const node of nodes) {
    if (!(node instanceof DomElement)) continue;
    if (predicate(node)) return node;
    const found = findElement(node.children, predicate);
    if (found) return found;
  }
  return undefined;
}

function firstMetaContent(nodes: AnyNode[], name: string): string {
  const element = findElement(nodes, (item) => {
    if (item.name !== "meta") return false;
    return attr(item, "name") === name || attr(item, "property") === name;
  });
  return element ? cleanLinkText(attr(element, "content") ?? "") : "";
}

function firstMetaContentOf(nodes: AnyNode[], names: string[]): string {
  for (const name of names) {
    const value = firstMetaContent(nodes, name);
    if (value) return value;
  }
  return "";
}

function extractJsonLdSummary(nodes: AnyNode[]): { types: string[]; headline?: string; author?: string; publishedTime?: string; modifiedTime?: string } {
  const values = findElements(nodes, (item) => item.name === "script" && /application\/ld\+json/i.test(attr(item, "type") ?? ""))
    .flatMap((script) => parseJsonLdValues(scriptText(script)));
  const types = Array.from(new Set(values.flatMap((value) => jsonLdStringArray(value["@type"])).filter(Boolean))).slice(0, 8);
  const primary = values.find((value) => jsonLdStringArray(value["@type"]).some((type) => /article|posting|news|blog|product|book|review|webpage/i.test(type)))
    ?? values[0];
  return {
    types,
    headline: jsonLdString(primary?.headline) || jsonLdString(primary?.name),
    author: jsonLdAuthor(primary?.author),
    publishedTime: jsonLdString(primary?.datePublished) || jsonLdString(primary?.dateCreated),
    modifiedTime: jsonLdString(primary?.dateModified),
  };
}

function findElements(nodes: AnyNode[], predicate: (element: Element) => boolean): Element[] {
  const found: Element[] = [];
  for (const node of nodes) {
    if (!(node instanceof DomElement)) continue;
    if (predicate(node)) found.push(node);
    found.push(...findElements(node.children, predicate));
  }
  return found;
}

function parseJsonLdValues(text: string): Array<Record<string, unknown>> {
  if (!text.trim()) return [];
  try {
    return flattenJsonLd(JSON.parse(text));
  } catch {
    return [];
  }
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const graph = Array.isArray(object["@graph"]) ? object["@graph"].flatMap(flattenJsonLd) : [];
  return [object, ...graph];
}

function jsonLdString(value: unknown): string {
  if (typeof value === "string") return cleanLinkText(value);
  if (typeof value === "number") return String(value);
  return "";
}

function jsonLdStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(jsonLdString).filter(Boolean);
  const single = jsonLdString(value);
  return single ? [single] : [];
}

function jsonLdAuthor(value: unknown): string {
  if (typeof value === "string") return cleanLinkText(value);
  if (Array.isArray(value)) return value.map(jsonLdAuthor).filter(Boolean).join(", ");
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  return jsonLdString(object.name) || jsonLdString(object.url);
}

function firstLinkHref(nodes: AnyNode[], rel: string): string {
  const element = findElement(nodes, (item) => item.name === "link" && (attr(item, "rel") ?? "").split(/\s+/).includes(rel));
  return element ? attr(element, "href") ?? "" : "";
}

function scriptText(element: Element): string {
  let text = "";
  for (const child of element.children) {
    if (child.type === "text") text += child.data;
  }
  return text;
}

function descendantText(element: Element): string {
  if (["button", "input", "noscript", "script", "select", "style", "svg", "textarea"].includes(element.name)) return "";
  let text = "";
  for (const child of element.children) {
    if (child.type === "text") {
      text += child.data;
    } else if (child instanceof DomElement) {
      text += descendantText(child);
    }
  }
  return text;
}

function attr(element: Element, name: string): string | undefined {
  return element.attribs[name];
}

function hasClass(element: Element, className: string): boolean {
  return (attr(element, "class") ?? "").split(/\s+/).includes(className);
}

function samePageOrSameHost(url: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    return parsed.hostname === base.hostname;
  } catch {
    return false;
  }
}

function isUnavailableTree(tree: SemanticNode): boolean {
  return tree.children.length === 0 && Boolean(tree.unavailableReason);
}

function jsonEnvelope(
  options: CliOptions,
  fetched: FetchResult,
  tree: SemanticNode,
  warnings: Array<{ code: string; message: string }> = [],
  error?: { code: CliErrorCode; message: string; status?: number },
): object {
  const links = summarizeLinks(tree, fetched.finalUrl);
  const pageLinks = summarizeResults(links);
  const outline = summarizeOutline(tree);
  const actions = summarizeActions(tree);
  const content = summarizeContent(tree);
  const results = annotateResults(summarizeSearchResults(fetched, links), options.searchQuery, options.findQueries ?? []);
  const capturedHtml = options.input !== "fetch";
  const analysis = analyzePage(fetched, tree, links, results, outline, actions, content, { ...options, capturedHtml });
  const pageCheck = summarizePageCheck(fetched, links, outline, actions, content, analysis, options.agentMode, capturedHtml, options.timeoutMs, options.userAgent);
  const finds = summarizeFinds(options.findQueries ?? [], fetched.page, pageCheck, links, results, outline, content, analysis.kind);
  const verification = summarizeVerification(finds, pageCheck, fetched.finalUrl, analysis, options.agentMode, capturedHtml, options.sourceSearch, options.timeoutMs, options.userAgent);
  const recommendedResult = analysis.kind === "search-results" ? recommendedSearchResult(results, options.findQueries ?? []) : undefined;
  const agent = summarizeAgent(
    analysis,
    pageCheck,
    verification,
    results,
    recommendedResult,
    error,
    capturedHtml,
    options.sourceSearch,
    fetched,
    options.url,
    options.agentMode,
    options.findQueries ?? [],
    options.timeoutMs,
    options.userAgent,
    summarizeAgentSemanticSummary(tree, fetched.finalUrl),
  );
  const outputAnalysis = {
    ...analysis,
    suggestedActions: analysis.suggestedActions.map(withActionExecution),
  };
  const outputPageCheck = withPageCheckActionExecution(pageCheck);
  const outputVerification = withVerificationActionExecution(verification);
  const outputAgent = withAgentActionExecution(agent);
  const envelope = {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: warnings.length === 0 && !error,
    url: options.url,
    searchQuery: options.searchQuery,
    searchEngine: options.searchEngine,
    selectedSearchEngine: options.selectedSearchEngine,
    searchEngines: options.searchAttempts,
    searchLang: options.searchLang,
    searchRegion: options.searchRegion,
    sourceSearch: options.sourceSearch,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    contentType: fetched.contentType,
    fetchedAt: new Date().toISOString(),
    mode: options.extractOptions.mode ?? "compact",
    warnings,
    kind: outputAnalysis.kind,
    diagnostics: outputAnalysis.diagnostics,
    suggestedActions: outputAnalysis.suggestedActions,
    agent: outputAgent,
    page: fetched.page,
    pageCheck: outputPageCheck,
    finds,
    verification: outputVerification,
    links,
    pageLinks,
    results,
    searchResults: outputAnalysis.kind === "search-results" ? results : [],
    recommendedResult,
    outline,
    actions,
    content,
    error,
    treeOmitted: options.omitTree || undefined,
    tree: options.omitTree ? undefined : tree,
  };
  if (options.omitTree) delete (envelope as { tree?: SemanticNode }).tree;
  if (options.agentBrief) return agentBriefJsonEnvelope(envelope, searchResultCommandContext(options), pageLinkCommandContext(options));
  if (options.agentMode) return agentJsonEnvelope(envelope, searchResultCommandContext(options), pageLinkCommandContext(options));
  return envelope;
}

function agentJsonEnvelope(envelope: {
  schemaVersion: number;
  tool: string;
  ok: boolean;
  url: string | undefined;
  searchQuery: string | undefined;
  searchEngine: SearchEngineOption | undefined;
  selectedSearchEngine: SearchEngine | undefined;
  searchEngines: SearchAttemptSummary[] | undefined;
  searchLang: string | undefined;
  searchRegion: string | undefined;
  sourceSearch: SourceSearchSummary | undefined;
  finalUrl: string;
  status: number;
  contentType: string;
  fetchedAt: string;
  mode: string;
  warnings: Array<{ code: string; message: string }>;
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
  agent: AgentSummary;
  page: PageSummary;
  pageCheck: PageCheckSummary;
  finds: FindSummary[];
  verification: VerificationSummary;
  searchResults: ResultSummary[];
  recommendedResult: ResultSummary | undefined;
  error: { code: CliErrorCode; message: string; status?: number } | undefined;
}, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  const suggestedActions = compactSuggestedActions(envelope.suggestedActions, envelope.agent.primaryAction);

  return {
    schemaVersion: envelope.schemaVersion,
    tool: envelope.tool,
    ok: envelope.ok,
    url: envelope.url,
    finalUrl: envelope.finalUrl,
    status: envelope.status,
    contentType: envelope.contentType,
    fetchedAt: envelope.fetchedAt,
    mode: envelope.mode,
    kind: envelope.kind,
    searchQuery: envelope.searchQuery,
    searchEngine: envelope.searchEngine,
    selectedSearchEngine: envelope.selectedSearchEngine,
    ...(!envelope.sourceSearch ? compactAgentSearchEngines(envelope.searchEngines) : {}),
    searchLang: envelope.searchLang,
    searchRegion: envelope.searchRegion,
    sourceSearch: compactAgentSourceSearch(envelope.sourceSearch),
    ...(envelope.warnings.length > 0 ? { warnings: envelope.warnings } : {}),
    agent: compactAgentSummary(envelope.agent, searchCommandContext, pageLinkContext),
    ...compactAgentPage(envelope.page),
    pageCheck: compactAgentPageCheck(envelope.pageCheck, envelope.agent.primaryAction, envelope.searchResults.length > 0, pageLinkContext, envelope.agent.readTargets),
    ...compactAgentVerification(envelope.verification, envelope.agent.primaryAction),
    ...(envelope.finds.length > 0 ? { finds: envelope.finds } : {}),
    ...compactAgentSearchResults(envelope.searchResults, envelope.recommendedResult, searchCommandContext, pageLinkContext),
    ...(envelope.recommendedResult ? { recommendedResult: compactAgentSearchResult(envelope.recommendedResult, searchCommandContext, { id: `r${envelope.recommendedResult.rank}`, path: "recommendedResult" }, pageLinkContext) } : {}),
    ...(suggestedActions.length > 0 ? { suggestedActions } : {}),
    ...(envelope.error ? { error: envelope.error } : {}),
    treeOmitted: true,
  };
}

function agentBriefJsonEnvelope(envelope: {
  schemaVersion: number;
  tool: string;
  ok: boolean;
  url: string | undefined;
  searchQuery: string | undefined;
  searchEngine: SearchEngineOption | undefined;
  selectedSearchEngine: SearchEngine | undefined;
  searchEngines: SearchAttemptSummary[] | undefined;
  searchLang: string | undefined;
  searchRegion: string | undefined;
  sourceSearch: SourceSearchSummary | undefined;
  finalUrl: string;
  status: number;
  contentType: string;
  fetchedAt: string;
  mode: string;
  warnings: Array<{ code: string; message: string }>;
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
  agent: AgentSummary;
  page: PageSummary;
  pageCheck: PageCheckSummary;
  finds: FindSummary[];
  verification: VerificationSummary;
  searchResults: ResultSummary[];
  recommendedResult: ResultSummary | undefined;
  error: { code: CliErrorCode; message: string; status?: number } | undefined;
}, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  const suggestedActions = compactSuggestedActions(envelope.suggestedActions, envelope.agent.primaryAction);
  const output = {
    schemaVersion: envelope.schemaVersion,
    tool: envelope.tool,
    ok: envelope.ok,
    url: envelope.url,
    finalUrl: envelope.finalUrl,
    status: envelope.status,
    kind: envelope.kind,
    searchQuery: envelope.searchQuery,
    searchEngine: envelope.searchEngine,
    selectedSearchEngine: envelope.selectedSearchEngine,
    searchLang: envelope.searchLang,
    searchRegion: envelope.searchRegion,
    ...(envelope.warnings.length > 0 ? { warnings: envelope.warnings } : {}),
    agent: compactAgentBrief(envelope.agent, searchCommandContext, pageLinkContext),
    ...compactAgentPage(envelope.page),
    pageCheck: compactAgentBriefPageCheck(envelope.pageCheck, envelope.agent.primaryAction, envelope.agent.readTargets, pageLinkContext),
    ...compactAgentVerification(envelope.verification, envelope.agent.primaryAction),
    ...compactAgentSearchResults(envelope.searchResults, envelope.recommendedResult, searchCommandContext, pageLinkContext),
    ...(envelope.recommendedResult ? { recommendedResult: compactAgentSearchResult(envelope.recommendedResult, searchCommandContext, { id: `r${envelope.recommendedResult.rank}`, path: "recommendedResult" }, pageLinkContext) } : {}),
    ...(suggestedActions.length > 0 ? { suggestedActions } : {}),
    ...(envelope.error ? { error: envelope.error } : {}),
    treeOmitted: true,
  };
  return preferBriefAgentCommands(output) as object;
}

function jsonErrorEnvelope(
  error: CliError,
  metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "selectedSearchEngine" | "searchAttempts" | "searchLang" | "searchRegion" | "sourceSearch" | "agentMode" | "agentBrief" | "findQueries" | "timeoutMs" | "userAgent">> = {},
): object {
  const action = errorAction(error, metadata.url, metadata.agentMode ?? false, metadata.findQueries ?? [], metadata.sourceSearch, metadata.timeoutMs, metadata.userAgent);
  const outputAction = action ? withActionExecution(action) : undefined;
  const pageCheck = errorPageCheck(outputAction);
  const agent = withAgentActionExecution(errorAgent(error, metadata.url, metadata.agentMode ?? false, metadata.findQueries ?? [], metadata.sourceSearch, metadata.timeoutMs, metadata.userAgent));
  const envelope = {
    schemaVersion: 1,
    tool: "ax-grep",
    ok: false,
    url: metadata.url,
    searchQuery: metadata.searchQuery,
    searchEngine: metadata.searchEngine,
    selectedSearchEngine: metadata.selectedSearchEngine,
    searchEngines: metadata.searchAttempts,
    searchLang: metadata.searchLang,
    searchRegion: metadata.searchRegion,
    sourceSearch: metadata.sourceSearch,
    fetchedAt: new Date().toISOString(),
    mode: metadata.extractOptions?.mode ?? "compact",
    warnings: [],
    kind: "empty" as ContentKind,
    diagnostics: [
      {
        severity: "error" as const,
        code: error.code,
        message: error.message,
      },
    ],
    suggestedActions: outputAction ? [outputAction] : [],
    agent,
    page: {},
    pageCheck,
    finds: [],
    verification: emptyVerification(),
    links: [],
    pageLinks: [],
    results: [],
    searchResults: [],
    outline: [],
    actions: [],
    content: [],
    error: {
      code: error.code,
      message: error.message,
      ...(typeof error.status === "number" ? { status: error.status } : {}),
    },
  };
  if (metadata.agentBrief) return agentBriefJsonErrorEnvelope(envelope);
  if (metadata.agentMode) return agentJsonErrorEnvelope(envelope);
  return envelope;
}

function errorPageCheck(action: SuggestedAction | undefined): PageCheckSummary {
  const pageCheck = emptyPageCheck();
  if (!action) return pageCheck;
  return {
    ...pageCheck,
    recommendedAction: action,
    nextSteps: [action],
  };
}

function agentJsonErrorEnvelope(envelope: {
  schemaVersion: number;
  tool: string;
  ok: boolean;
  url: string | undefined;
  searchQuery: string | undefined;
  searchEngine: SearchEngineOption | undefined;
  selectedSearchEngine: SearchEngine | undefined;
  searchEngines: SearchAttemptSummary[] | undefined;
  searchLang: string | undefined;
  searchRegion: string | undefined;
  sourceSearch: SourceSearchSummary | undefined;
  fetchedAt: string;
  mode: string;
  warnings: Array<{ code: string; message: string }>;
  kind: ContentKind;
  diagnostics: DiagnosticSummary[];
  suggestedActions: SuggestedAction[];
  agent: AgentSummary;
  page: PageSummary;
  pageCheck: PageCheckSummary;
  finds: FindSummary[];
  verification: VerificationSummary;
  searchResults: ResultSummary[];
  error: { code: CliErrorCode; message: string; status?: number };
}): object {
  const suggestedActions = compactSuggestedActions(envelope.suggestedActions, envelope.agent.primaryAction);

  return {
    schemaVersion: envelope.schemaVersion,
    tool: envelope.tool,
    ok: envelope.ok,
    url: envelope.url,
    searchQuery: envelope.searchQuery,
    searchEngine: envelope.searchEngine,
    selectedSearchEngine: envelope.selectedSearchEngine,
    ...(!envelope.sourceSearch ? compactAgentSearchEngines(envelope.searchEngines) : {}),
    searchLang: envelope.searchLang,
    searchRegion: envelope.searchRegion,
    sourceSearch: compactAgentSourceSearch(envelope.sourceSearch),
    fetchedAt: envelope.fetchedAt,
    mode: envelope.mode,
    kind: envelope.kind,
    ...(envelope.warnings.length > 0 ? { warnings: envelope.warnings } : {}),
    ...(suggestedActions.length > 0 ? { suggestedActions } : {}),
    agent: compactAgentSummary(envelope.agent),
    ...compactAgentPage(envelope.page),
    pageCheck: compactAgentPageCheck(envelope.pageCheck, envelope.agent.primaryAction, envelope.searchResults.length > 0),
    ...compactAgentVerification(envelope.verification, envelope.agent.primaryAction),
    ...(envelope.finds.length > 0 ? { finds: envelope.finds } : {}),
    ...compactAgentSearchResults(envelope.searchResults),
    error: envelope.error,
    treeOmitted: true,
  };
}

function agentBriefJsonErrorEnvelope(envelope: {
  schemaVersion: number;
  tool: string;
  ok: boolean;
  url: string | undefined;
  searchQuery: string | undefined;
  searchEngine: SearchEngineOption | undefined;
  selectedSearchEngine: SearchEngine | undefined;
  searchLang: string | undefined;
  searchRegion: string | undefined;
  fetchedAt: string;
  mode: string;
  warnings: Array<{ code: string; message: string }>;
  kind: ContentKind;
  suggestedActions: SuggestedAction[];
  agent: AgentSummary;
  page: PageSummary;
  pageCheck: PageCheckSummary;
  verification: VerificationSummary;
  searchResults: ResultSummary[];
  error: { code: CliErrorCode; message: string; status?: number };
}): object {
  const suggestedActions = compactSuggestedActions(envelope.suggestedActions, envelope.agent.primaryAction);
  return preferBriefAgentCommands({
    schemaVersion: envelope.schemaVersion,
    tool: envelope.tool,
    ok: envelope.ok,
    url: envelope.url,
    searchQuery: envelope.searchQuery,
    searchEngine: envelope.searchEngine,
    selectedSearchEngine: envelope.selectedSearchEngine,
    searchLang: envelope.searchLang,
    searchRegion: envelope.searchRegion,
    fetchedAt: envelope.fetchedAt,
    mode: envelope.mode,
    kind: envelope.kind,
    ...(envelope.warnings.length > 0 ? { warnings: envelope.warnings } : {}),
    ...(suggestedActions.length > 0 ? { suggestedActions } : {}),
    agent: compactAgentBrief(envelope.agent),
    ...compactAgentPage(envelope.page),
    pageCheck: compactAgentBriefPageCheck(envelope.pageCheck, envelope.agent.primaryAction, envelope.agent.readTargets),
    ...compactAgentVerification(envelope.verification, envelope.agent.primaryAction),
    ...compactAgentSearchResults(envelope.searchResults),
    error: envelope.error,
    treeOmitted: true,
  }) as object;
}

function compactAgentPageCheck(
  pageCheck: PageCheckSummary,
  primaryAction?: SuggestedAction,
  omitResultLinkDuplicates = false,
  pageLinkContext?: PageLinkCommandContext,
  readTargets: AgentReadTarget[] = [],
): object {
  const sourceUrls = new Set(pageCheck.sourceLinks.map((link) => link.url));
  const nonSourcePrimaryLinks = pageCheck.primaryLinks.filter((link) => !sourceUrls.has(link.url));
  const primaryLinks = pageCheck.sourceLinks.length > 0
    ? nonSourcePrimaryLinks.filter((link) => link.kind === "internal")
    : nonSourcePrimaryLinks;
  const suppressPageActions = primaryAction?.action === "use-evidence";
  const nextSteps = suppressPageActions
    ? []
    : primaryAction ? pageCheck.nextSteps.filter((step) => !sameSuggestedAction(step, primaryAction)) : pageCheck.nextSteps;
  const recommendedAction = suppressPageActions || sameSuggestedAction(pageCheck.recommendedAction, primaryAction) ? undefined : pageCheck.recommendedAction;
  const compactNextSteps = compactAgentPageCheckNextSteps(nextSteps, pageCheck.sourceLinks);
  const slimPaths = compactPageCheckSlimPaths(pageCheck, readTargets);
  return {
    contentEvidence: compactAgentContentEvidence(pageCheck.contentEvidence, primaryAction),
    ...compactPageCheckArray("dataTables", pageCheck.dataTables, slimPaths),
    ...compactPageCheckArray("barriers", pageCheck.barriers, slimPaths),
    ...compactPageCheckArray("forms", compactAgentForms(pageCheck.forms, primaryAction), slimPaths),
    ...compactPageCheckArray("actionTargets", pageCheck.actionTargets, slimPaths),
    ...compactPageCheckArray("hydration", pageCheck.hydration, slimPaths),
    ...compactPageCheckArray("apiEndpoints", pageCheck.apiEndpoints, slimPaths),
    ...compactPageCheckArray("clientState", pageCheck.clientState, slimPaths),
    ...compactPageCheckArray("runtime", pageCheck.runtime, slimPaths),
    ...compactPageCheckArray("config", pageCheck.config, slimPaths),
    ...compactPageCheckArray("appHints", compactAgentAppHints(pageCheck.appHints, primaryAction), slimPaths),
    ...compactPageCheckArray("mobileHints", compactAgentMobileHints(pageCheck.mobileHints), slimPaths),
    ...compactPageCheckArray("topics", pageCheck.topics, slimPaths),
    ...compactPageCheckArray("contactPoints", pageCheck.contactPoints, slimPaths),
    ...compactPageCheckArray("keyValues", pageCheck.keyValues, slimPaths),
    ...compactPageCheckArray("metaFacts", pageCheck.metaFacts, slimPaths),
    ...compactPageCheckArray("provenance", pageCheck.provenance, slimPaths),
    ...compactPageCheckArray("httpPolicies", pageCheck.httpPolicies, slimPaths),
    ...compactPageCheckArray("schemaFacts", pageCheck.schemaFacts, slimPaths),
    ...compactPageCheckArray("offers", pageCheck.offers, slimPaths),
    ...compactPageCheckArray("identities", pageCheck.identities, slimPaths),
    ...compactPageCheckArray("datasets", pageCheck.datasets, slimPaths),
    ...compactPageCheckArray("timeline", pageCheck.timeline, slimPaths),
    ...compactPageCheckArray("faqs", pageCheck.faqs, slimPaths),
    ...compactPageCheckArray("breadcrumbs", pageCheck.breadcrumbs, slimPaths),
    ...compactPageCheckArray("sections", pageCheck.sections, slimPaths),
    ...compactPageCheckArray("pagination", pageCheck.pagination, slimPaths),
    ...compactPageCheckArray("toc", pageCheck.toc, slimPaths),
    ...compactPageCheckArray("codeBlocks", pageCheck.codeBlocks, slimPaths),
    ...compactPageCheckArray("citations", pageCheck.citations, slimPaths),
    ...compactPageCheckArray("media", pageCheck.media, slimPaths),
    ...compactPageCheckArray("resources", pageCheck.resources, slimPaths, 2200),
    ...compactPageCheckArray("embeds", pageCheck.embeds, slimPaths),
    ...compactPageCheckArray("transcripts", pageCheck.transcripts, slimPaths),
    ...compactPageCheckArray("authorLinks", pageCheck.authorLinks, slimPaths),
    contentLength: pageCheck.contentLength,
    ...(primaryLinks.length > 0 && !omitResultLinkDuplicates ? { primaryLinks: primaryLinks.map((link, index) => compactAgentPageLink(link, pageLinkContext, { id: `l${index + 1}`, path: `pageCheck.primaryLinks[${index}]` })) } : {}),
    ...(pageCheck.sourceLinks.length > 0 && !omitResultLinkDuplicates ? { sourceLinks: compactAgentPageLinkList(pageCheck.sourceLinks.map((link, index) => compactAgentPageLink(link, pageLinkContext, { id: `s${index + 1}`, path: `pageCheck.sourceLinks[${index}]` }))) } : {}),
    ...(pageCheck.actions.length > 0 && !omitResultLinkDuplicates ? { actions: pageCheck.actions } : {}),
    confidence: pageCheck.confidence,
    readability: {
      level: pageCheck.readability.level,
      score: pageCheck.readability.score,
      reasons: pageCheck.readability.reasons,
    },
    ...(recommendedAction ? { recommendedAction: compactAgentAction(recommendedAction) } : {}),
    ...(compactNextSteps.length > 0 ? { nextSteps: compactNextSteps } : {}),
    ...(pageCheck.title ? { title: pageCheck.title } : {}),
    ...(pageCheck.canonicalUrl ? { canonicalUrl: pageCheck.canonicalUrl } : {}),
    ...(pageCheck.mainHeading ? { mainHeading: pageCheck.mainHeading } : {}),
    ...(pageCheck.lang ? { lang: pageCheck.lang } : {}),
    ...(pageCheck.dir ? { dir: pageCheck.dir } : {}),
    ...(pageCheck.siteName ? { siteName: pageCheck.siteName } : {}),
    ...(pageCheck.author ? { author: pageCheck.author } : {}),
    ...(pageCheck.publishedTime ? { publishedTime: pageCheck.publishedTime } : {}),
    ...(pageCheck.modifiedTime ? { modifiedTime: pageCheck.modifiedTime } : {}),
    ...(pageCheck.structuredDataTypes?.length ? { structuredDataTypes: pageCheck.structuredDataTypes } : {}),
  };
}

function compactPageCheckArray<T>(
  key: string,
  items: T[],
  slimPaths: Set<string> | undefined,
  aggressiveThreshold?: number,
): object {
  if (items.length === 0) return {};
  if (slimPaths && !slimPaths.has(key)) return {};
  return { [key]: compactAgentPageCheckItems(items, aggressiveThreshold) };
}

function compactPageCheckSlimPaths(pageCheck: PageCheckSummary, readTargets: AgentReadTarget[]): Set<string> | undefined {
  const pageCheckSize = JSON.stringify(pageCheck).length;
  const thinFetchedPage = pageCheck.contentLength <= 20 && pageCheck.contentEvidence.length === 0 && pageCheckSize > 8000;
  if (!thinFetchedPage && pageCheckSize <= 18000) return undefined;
  const paths = new Set<string>(["contentEvidence", "sourceLinks", "nextSteps", "actions"]);
  for (const target of readTargets) {
    const match = /^pageCheck\.([A-Za-z0-9_]+)$/.exec(target.path);
    if (match?.[1]) paths.add(match[1]);
  }
  return paths;
}

function compactAgentAppHints(items: PageAppHintSummary[], primaryAction?: SuggestedAction): object[] {
  if (primaryAction?.readFrom === "pageCheck.appHints") return items;
  if (items.length < 8 || JSON.stringify(items).length <= 900) return items;
  return items.map((item) => ({
    rank: item.rank,
    kind: item.kind,
    label: item.label,
    ...(item.kind !== "icon" && item.url ? { url: item.url } : {}),
    ...(item.kind !== "icon" && !item.url ? { value: item.value } : {}),
    ...(item.sizes ? { sizes: item.sizes } : {}),
    ...(item.media ? { media: item.media } : {}),
  }));
}

function compactAgentMobileHints(items: PageMobileHintSummary[]): object[] {
  if (items.length < 8 || JSON.stringify(items).length <= 900) return items;
  return items.map((item) => ({
    rank: item.rank,
    kind: item.kind,
    label: item.label,
    value: item.value,
    ...(item.platform ? { platform: item.platform } : {}),
    ...(item.url ? { url: item.url } : {}),
  }));
}

function compactAgentPageLinkList(items: object[], threshold = 900): object[] {
  if (JSON.stringify(items).length <= threshold) return compactAgentCommandList(items);
  return compactAgentCommandList(items.map((item) => omitVerboseSourceLinkFields(item)), threshold);
}

function compactAgentContentEvidence(items: PageEvidenceSummary[], primaryAction?: SuggestedAction, threshold = 900): PageEvidenceSummary[] | object[] {
  if (primaryAction?.readFrom === "pageCheck.contentEvidence") return items;
  if (JSON.stringify(items).length <= threshold) return items;
  if (!items.every((item) => item.source === "fallback" && item.quality === "low")) return items;
  return items.map((item) => ({
    id: item.id,
    path: item.path,
    rank: item.rank,
    text: compactAgentPageCheckString(item.text, true),
    role: item.role,
    source: item.source,
    score: item.score,
    quality: item.quality,
    qualityReason: item.qualityReason,
  }));
}

function compactAgentForms(items: PageFormSummary[], primaryAction?: SuggestedAction, threshold = 500): PageFormSummary[] | object[] {
  if (primaryAction?.readFrom === "pageCheck.forms") return items;
  if (JSON.stringify(items).length <= threshold) return items;
  return items.map((item) => ({
    rank: item.rank,
    method: item.method,
    fieldCount: item.fieldCount,
    fields: item.fields.map((field) => ({
      type: field.type,
      ...(field.name ? { name: field.name } : {}),
      ...(field.label ? { label: field.label } : {}),
      ...(field.placeholder && field.placeholder !== field.label ? { placeholder: field.placeholder } : {}),
      ...(field.required ? { required: true } : {}),
    })),
    ...(item.actionUrl ? { actionUrl: item.actionUrl } : {}),
    ...(item.submitText ? { submitText: item.submitText } : {}),
    ...(item.queryField ? { queryField: item.queryField } : {}),
    ...(item.urlTemplate ? { urlTemplate: item.urlTemplate } : {}),
  }));
}

function compactAgentPageCheckNextSteps(steps: SuggestedAction[], sourceLinks: PageLinkSummary[], threshold = 650): object[] {
  const compact = steps.map((step) => {
    const action = compactAgentAction(step, { omitOpenSourceTarget: true, omitReason: true }) as Record<string, unknown>;
    if (action.action !== "open-source-link" || typeof action.url !== "string") return action;
    const index = sourceLinks.findIndex((link) => link.url === action.url);
    return index < 0 ? action : { ...action, sourceLinkRef: `pageCheck.sourceLinks[${index}]` };
  });
  if (JSON.stringify(compact).length <= threshold) return compact;
  return compact.map((item) => {
    const action = item as Record<string, unknown>;
    if (action.action !== "open-source-link" || typeof action.sourceLinkRef !== "string") return item;
    const { url: _url, command: _command, commandArgs: _commandArgs, ...rest } = action;
    return {
      ...rest,
      ...(rest.action === "open-source-link" ? { priorityReason: undefined } : {}),
    };
  });
}

function omitVerboseSourceLinkFields(item: object): object {
  const {
    source: _source,
    sourceType: _sourceType,
    sourceHints: _sourceHints,
    selectionReason: _selectionReason,
    command: _command,
    commandArgs: _commandArgs,
    ...rest
  } = item as {
    source?: unknown;
    sourceType?: unknown;
    sourceHints?: unknown;
    selectionReason?: unknown;
    command?: unknown;
    commandArgs?: unknown;
    [key: string]: unknown;
  };
  return rest;
}

function compactAgentPageCheckItems<T>(items: T[], aggressiveThreshold = 2400): object[] {
  const aggressive = JSON.stringify(items).length > aggressiveThreshold;
  return items.map((item) => compactAgentPageCheckItem(item, aggressive) as object);
}

function compactAgentPageCheckItem(value: unknown, aggressive = false): unknown {
  if (typeof value === "string") return compactAgentPageCheckString(value, aggressive);
  if (Array.isArray(value)) return value.map((item) => compactAgentPageCheckItem(item, aggressive));
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value);
  const hasStructuredSummary = entries.some(([key, item]) => key !== "text" && key !== "selector" && typeof item === "string" && item.length > 0);
  return Object.fromEntries(entries.flatMap(([key, item]) => {
    if (aggressive && key === "selector") return [];
    if (aggressive && key === "text" && hasStructuredSummary) return [];
    return [[key, compactAgentPageCheckItem(item, aggressive)]];
  }));
}

function compactAgentPageCheckString(value: string, aggressive = false): string {
  const maxLength = aggressive ? 180 : 320;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function sameSuggestedAction(left: SuggestedAction | undefined, right: SuggestedAction | undefined): boolean {
  if (!left || !right) return false;
  return left.action === right.action
    && left.url === right.url
    && left.command === right.command
    && left.afterInteractionCommand === right.afterInteractionCommand
    && left.rank === right.rank
    && left.openResult === right.openResult
    && left.terminal === right.terminal
    && left.readFrom === right.readFrom
    && left.requiresBrowserInteraction === right.requiresBrowserInteraction
    && actionExecution(left) === actionExecution(right);
}

function compactSuggestedActions(actions: SuggestedAction[], primaryAction?: SuggestedAction): object[] {
  return actions
    .filter((action) => !sameSuggestedAction(action, primaryAction))
    .filter((action) => !((primaryAction?.action === "use-evidence" || primaryAction?.action === "read-content") && action.action === "read-content"))
    .map((action) => compactAgentAction(action));
}

function compactAgentTopChoice(agent: AgentSummary, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  if (!agent.topChoiceKind || !agent.topChoicePath) return {};
  let commandArgs = agent.topChoiceCommandArgs;
  if (!commandArgs && agent.topChoiceKind === "result" && agent.resultChoices[0]) {
    commandArgs = compactAgentResultChoice(agent.resultChoices[0], searchCommandContext, pageLinkContext).commandArgs;
  }
  if (!commandArgs && agent.topChoiceKind === "source" && agent.sourceChoices[0]) {
    commandArgs = agent.sourceChoices[0].commandArgs;
  }
  return {
    topChoiceKind: agent.topChoiceKind,
    topChoicePath: agent.topChoicePath,
    ...(agent.topChoiceLabel ? { topChoiceLabel: agent.topChoiceLabel } : {}),
    ...(agent.topChoiceUrl ? { topChoiceUrl: agent.topChoiceUrl } : {}),
    ...(commandArgs ? { topChoiceCommandArgs: commandArgs } : {}),
  };
}

function compactAgentRecommended(agent: AgentSummary, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  if (!agent.recommendedUrl && !agent.recommendedRank) return {};
  const recommendedChoice = agent.resultChoices.find((choice) => {
    return choice.recommended
      || (agent.recommendedRank === choice.rank && agent.recommendedUrl === choice.url);
  });
  const compactChoice = recommendedChoice
    ? compactAgentResultChoice(recommendedChoice, searchCommandContext, pageLinkContext) as { command?: string; commandArgs?: string[] }
    : undefined;
  const command = compactChoice?.command ?? agent.recommendedCommand;
  const commandArgs = compactChoice?.commandArgs ?? agent.recommendedCommandArgs;
  return {
    ...(agent.recommendedUrl ? { recommendedUrl: agent.recommendedUrl } : {}),
    ...(agent.recommendedTitle ? { recommendedTitle: agent.recommendedTitle } : {}),
    ...(agent.recommendedRank ? { recommendedRank: agent.recommendedRank } : {}),
    ...(agent.recommendedSource ? { recommendedSource: agent.recommendedSource } : {}),
    ...(agent.recommendedRelevance ? { recommendedRelevance: agent.recommendedRelevance } : {}),
    ...(typeof agent.recommendedLikelyOfficial === "boolean" ? { recommendedLikelyOfficial: agent.recommendedLikelyOfficial } : {}),
    ...(agent.recommendedSelectionReason ? { recommendedSelectionReason: agent.recommendedSelectionReason } : {}),
    ...(command ? { recommendedCommand: command } : {}),
    ...(commandArgs ? { recommendedCommandArgs: commandArgs } : {}),
  };
}

function compactAgentSummary(agent: AgentSummary, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  return {
    contract: compactAgentContract(agent.contract),
    status: agent.status,
    pageKind: agent.pageKind,
    ...(agent.pageTitle ? { pageTitle: agent.pageTitle } : {}),
    ...(agent.pageCanonicalUrl ? { pageCanonicalUrl: agent.pageCanonicalUrl } : {}),
    ...(agent.pageLang ? { pageLang: agent.pageLang } : {}),
    ...(agent.pageDir ? { pageDir: agent.pageDir } : {}),
    ...(agent.pageSiteName ? { pageSiteName: agent.pageSiteName } : {}),
    ...(agent.pageAuthor ? { pageAuthor: agent.pageAuthor } : {}),
    ...(agent.pagePublishedTime ? { pagePublishedTime: agent.pagePublishedTime } : {}),
    ...(agent.pageModifiedTime ? { pageModifiedTime: agent.pageModifiedTime } : {}),
    ...(agent.pageStructuredDataTypes?.length ? { pageStructuredDataTypes: agent.pageStructuredDataTypes } : {}),
    summary: agent.summary,
    routingIntent: agent.routingIntent,
    continuationMode: agent.continuationMode,
    next: compactAgentNext(agent.next, agent.primaryUrl),
    runbook: compactAgentRunbook(agent.runbook, agent.primaryUrl),
    ...(agent.runbookDecision ? { runbookDecision: agent.runbookDecision } : {}),
    ...(agent.runbookMode ? { runbookMode: agent.runbookMode } : {}),
    ...(agent.runbookOperation ? { runbookOperation: agent.runbookOperation } : {}),
    ...(agent.runbookActionName ? { runbookActionName: agent.runbookActionName } : {}),
    ...(agent.runbookReason ? { runbookReason: agent.runbookReason } : {}),
    ...(agent.runbookConfidence ? { runbookConfidence: agent.runbookConfidence } : {}),
    ...(agent.runbookAnswerStatus ? { runbookAnswerStatus: agent.runbookAnswerStatus } : {}),
    ...(typeof agent.runbookAnswerReady === "boolean" ? { runbookAnswerReady: agent.runbookAnswerReady } : {}),
    ...(typeof agent.runbookShouldContinue === "boolean" ? { runbookShouldContinue: agent.runbookShouldContinue } : {}),
    ...(typeof agent.runbookTerminal === "boolean" ? { runbookTerminal: agent.runbookTerminal } : {}),
    ...(typeof agent.runbookMaxSuggestedIterations === "number" ? { runbookMaxSuggestedIterations: agent.runbookMaxSuggestedIterations } : {}),
    ...(agent.runbookExpectedOutcome ? { runbookExpectedOutcome: agent.runbookExpectedOutcome } : {}),
    ...(agent.runbookReadFrom ? { runbookReadFrom: agent.runbookReadFrom } : {}),
    ...(agent.runbookCommandArgs ? { runbookCommandArgs: agent.runbookCommandArgs } : {}),
    ...(agent.runbookUrl ? { runbookUrl: agent.runbookUrl } : {}),
    ...(agent.nextActionName ? { nextActionName: agent.nextActionName } : {}),
    ...(agent.nextExecution ? { nextExecution: agent.nextExecution } : {}),
    ...(agent.nextCommand ? { nextCommand: agent.nextCommand } : {}),
    ...(agent.nextCommandArgs ? { nextCommandArgs: agent.nextCommandArgs } : {}),
    ...(agent.nextAfterInteractionCommand ? { nextAfterInteractionCommand: agent.nextAfterInteractionCommand } : {}),
    ...(agent.nextAfterInteractionCommandArgs ? { nextAfterInteractionCommandArgs: agent.nextAfterInteractionCommandArgs } : {}),
    ...(agent.nextReadFrom ? { nextReadFrom: agent.nextReadFrom } : {}),
    ...(agent.nextUrl ? { nextUrl: agent.nextUrl } : {}),
    executor: compactAgentExecutor(agent.executor, agent.primaryUrl),
    handoff: compactAgentHandoff(agent.handoff, agent.primaryUrl, searchCommandContext, pageLinkContext),
    expectedOutcome: agent.expectedOutcome,
    executionPlan: compactAgentUrlRefs(agent.executionPlan, agent.primaryUrl),
    ...(agent.expectedOutcomeKind ? { expectedOutcomeKind: agent.expectedOutcomeKind } : {}),
    ...(agent.expectedOutcomeMessage ? { expectedOutcomeMessage: agent.expectedOutcomeMessage } : {}),
    ...(agent.executionPlanOperation ? { executionPlanOperation: agent.executionPlanOperation } : {}),
    ...(agent.executionPlanConfidence ? { executionPlanConfidence: agent.executionPlanConfidence } : {}),
    ...(agent.executionPlanReason ? { executionPlanReason: agent.executionPlanReason } : {}),
    ...(typeof agent.executionPlanAnswerReady === "boolean" ? { executionPlanAnswerReady: agent.executionPlanAnswerReady } : {}),
    ...(typeof agent.executionPlanShouldContinue === "boolean" ? { executionPlanShouldContinue: agent.executionPlanShouldContinue } : {}),
    ...(typeof agent.executionPlanTerminal === "boolean" ? { executionPlanTerminal: agent.executionPlanTerminal } : {}),
    ...(agent.executionPlanExpectedOutcome ? { executionPlanExpectedOutcome: agent.executionPlanExpectedOutcome } : {}),
    ...(agent.executionPlanReadFrom ? { executionPlanReadFrom: agent.executionPlanReadFrom } : {}),
    ...(agent.executionPlanCommandArgs ? { executionPlanCommandArgs: agent.executionPlanCommandArgs } : {}),
    ...(agent.executionPlanAfterInteractionCommand ? { executionPlanAfterInteractionCommand: agent.executionPlanAfterInteractionCommand } : {}),
    ...(agent.executionPlanAfterInteractionCommandArgs ? { executionPlanAfterInteractionCommandArgs: agent.executionPlanAfterInteractionCommandArgs } : {}),
    ...(agent.executionPlanUrl ? { executionPlanUrl: agent.executionPlanUrl } : {}),
    answerPlan: compactAgentUrlRefs(agent.answerPlan, agent.primaryUrl),
    ...(agent.searchDecision ? { searchDecision: agent.searchDecision } : {}),
    ...(agent.pageDecision ? { pageDecision: compactAgentUrlRefs(agent.pageDecision, agent.primaryUrl) } : {}),
    ...(agent.searchDecisionName ? { searchDecisionName: agent.searchDecisionName } : {}),
    ...(agent.searchDecisionConfidence ? { searchDecisionConfidence: agent.searchDecisionConfidence } : {}),
    ...(agent.searchDecisionReason ? { searchDecisionReason: agent.searchDecisionReason } : {}),
    ...(typeof agent.searchDecisionResultCount === "number" ? { searchDecisionResultCount: agent.searchDecisionResultCount } : {}),
    ...(typeof agent.searchDecisionHighRelevanceCount === "number" ? { searchDecisionHighRelevanceCount: agent.searchDecisionHighRelevanceCount } : {}),
    ...(typeof agent.searchDecisionMediumRelevanceCount === "number" ? { searchDecisionMediumRelevanceCount: agent.searchDecisionMediumRelevanceCount } : {}),
    ...(typeof agent.searchDecisionLowRelevanceCount === "number" ? { searchDecisionLowRelevanceCount: agent.searchDecisionLowRelevanceCount } : {}),
    ...(typeof agent.searchDecisionOfficialCount === "number" ? { searchDecisionOfficialCount: agent.searchDecisionOfficialCount } : {}),
    ...(typeof agent.searchDecisionFindMatchCount === "number" ? { searchDecisionFindMatchCount: agent.searchDecisionFindMatchCount } : {}),
    ...(typeof agent.searchDecisionRecommendedRank === "number" ? { searchDecisionRecommendedRank: agent.searchDecisionRecommendedRank } : {}),
    ...(agent.searchDecisionRecommendedUrl ? { searchDecisionRecommendedUrl: agent.searchDecisionRecommendedUrl } : {}),
    ...(agent.searchDecisionCommandArgs ? { searchDecisionCommandArgs: agent.searchDecisionCommandArgs } : {}),
    ...(agent.pageDecisionName ? { pageDecisionName: agent.pageDecisionName } : {}),
    ...(agent.pageDecisionConfidence ? { pageDecisionConfidence: agent.pageDecisionConfidence } : {}),
    ...(agent.pageDecisionReason ? { pageDecisionReason: agent.pageDecisionReason } : {}),
    ...(agent.pageDecisionReadFrom ? { pageDecisionReadFrom: agent.pageDecisionReadFrom } : {}),
    ...(agent.pageDecisionUrl ? { pageDecisionUrl: agent.pageDecisionUrl } : {}),
    ...(agent.pageDecisionCommandArgs ? { pageDecisionCommandArgs: agent.pageDecisionCommandArgs } : {}),
    ...(agent.semanticSummary ? { semanticSummary: compactAgentSemanticSummary(agent.semanticSummary) } : {}),
    ...(typeof agent.semanticNodeCount === "number" ? { semanticNodeCount: agent.semanticNodeCount } : {}),
    ...(typeof agent.semanticNamedRoleCount === "number" ? { semanticNamedRoleCount: agent.semanticNamedRoleCount } : {}),
    ...(typeof agent.semanticInteractiveCount === "number" ? { semanticInteractiveCount: agent.semanticInteractiveCount } : {}),
    ...(typeof agent.semanticFocusableCount === "number" ? { semanticFocusableCount: agent.semanticFocusableCount } : {}),
    ...(typeof agent.semanticHeadingCount === "number" ? { semanticHeadingCount: agent.semanticHeadingCount } : {}),
    ...(typeof agent.semanticLandmarkCount === "number" ? { semanticLandmarkCount: agent.semanticLandmarkCount } : {}),
    ...(typeof agent.semanticLinkCount === "number" ? { semanticLinkCount: agent.semanticLinkCount } : {}),
    ...(typeof agent.semanticButtonCount === "number" ? { semanticButtonCount: agent.semanticButtonCount } : {}),
    ...(typeof agent.semanticImageCount === "number" ? { semanticImageCount: agent.semanticImageCount } : {}),
    ...(typeof agent.semanticTableCount === "number" ? { semanticTableCount: agent.semanticTableCount } : {}),
    ...(typeof agent.semanticListCount === "number" ? { semanticListCount: agent.semanticListCount } : {}),
    ...(typeof agent.semanticFieldCount === "number" ? { semanticFieldCount: agent.semanticFieldCount } : {}),
    ...(typeof agent.semanticDescriptionCount === "number" ? { semanticDescriptionCount: agent.semanticDescriptionCount } : {}),
    ...(typeof agent.semanticValueCount === "number" ? { semanticValueCount: agent.semanticValueCount } : {}),
    ...(typeof agent.semanticRelationCount === "number" ? { semanticRelationCount: agent.semanticRelationCount } : {}),
    ...(typeof agent.semanticChoiceCount === "number" ? { semanticChoiceCount: agent.semanticChoiceCount } : {}),
    ...(typeof agent.semanticStateCount === "number" ? { semanticStateCount: agent.semanticStateCount } : {}),
    ...(typeof agent.semanticUnavailableCount === "number" ? { semanticUnavailableCount: agent.semanticUnavailableCount } : {}),
    ...(agent.semanticTopRole ? { semanticTopRole: agent.semanticTopRole } : {}),
    ...(typeof agent.semanticTopRoleCount === "number" ? { semanticTopRoleCount: agent.semanticTopRoleCount } : {}),
    ...(typeof agent.semanticOutlineCount === "number" ? { semanticOutlineCount: agent.semanticOutlineCount } : {}),
    ...(agent.semanticTopOutlinePath ? { semanticTopOutlinePath: agent.semanticTopOutlinePath } : {}),
    ...(agent.semanticTopOutlineKind ? { semanticTopOutlineKind: agent.semanticTopOutlineKind } : {}),
    ...(agent.semanticTopOutlineRole ? { semanticTopOutlineRole: agent.semanticTopOutlineRole } : {}),
    ...(agent.semanticTopOutlineText ? { semanticTopOutlineText: agent.semanticTopOutlineText } : {}),
    ...(typeof agent.semanticTopOutlineLevel === "number" ? { semanticTopOutlineLevel: agent.semanticTopOutlineLevel } : {}),
    ...(typeof agent.semanticTopOutlineDepth === "number" ? { semanticTopOutlineDepth: agent.semanticTopOutlineDepth } : {}),
    ...(agent.semanticTopOutlineParentPath ? { semanticTopOutlineParentPath: agent.semanticTopOutlineParentPath } : {}),
    ...(agent.semanticTopOutlineParentRole ? { semanticTopOutlineParentRole: agent.semanticTopOutlineParentRole } : {}),
    ...(agent.semanticTopOutlineParentName ? { semanticTopOutlineParentName: agent.semanticTopOutlineParentName } : {}),
    ...(agent.semanticTopOutlineSelector ? { semanticTopOutlineSelector: agent.semanticTopOutlineSelector } : {}),
    ...(typeof agent.semanticKeyboardShortcutCount === "number" ? { semanticKeyboardShortcutCount: agent.semanticKeyboardShortcutCount } : {}),
    ...(agent.semanticTopKeyboardShortcutPath ? { semanticTopKeyboardShortcutPath: agent.semanticTopKeyboardShortcutPath } : {}),
    ...(agent.semanticTopKeyboardShortcutRole ? { semanticTopKeyboardShortcutRole: agent.semanticTopKeyboardShortcutRole } : {}),
    ...(agent.semanticTopKeyboardShortcutName ? { semanticTopKeyboardShortcutName: agent.semanticTopKeyboardShortcutName } : {}),
    ...(agent.semanticTopKeyboardShortcutKeys?.length ? { semanticTopKeyboardShortcutKeys: agent.semanticTopKeyboardShortcutKeys } : {}),
    ...(agent.semanticTopKeyboardShortcutAccessKey ? { semanticTopKeyboardShortcutAccessKey: agent.semanticTopKeyboardShortcutAccessKey } : {}),
    ...(typeof agent.semanticTopKeyboardShortcutTabIndex === "number" ? { semanticTopKeyboardShortcutTabIndex: agent.semanticTopKeyboardShortcutTabIndex } : {}),
    ...(typeof agent.semanticTopKeyboardShortcutFocusable === "boolean" ? { semanticTopKeyboardShortcutFocusable: agent.semanticTopKeyboardShortcutFocusable } : {}),
    ...(agent.semanticTopKeyboardShortcutSelector ? { semanticTopKeyboardShortcutSelector: agent.semanticTopKeyboardShortcutSelector } : {}),
    ...(agent.semanticTopHeading ? { semanticTopHeading: agent.semanticTopHeading } : {}),
    ...(agent.semanticTopHeadingPath ? { semanticTopHeadingPath: agent.semanticTopHeadingPath } : {}),
    ...(typeof agent.semanticTopHeadingLevel === "number" ? { semanticTopHeadingLevel: agent.semanticTopHeadingLevel } : {}),
    ...(agent.semanticTopLandmark ? { semanticTopLandmark: agent.semanticTopLandmark } : {}),
    ...(agent.semanticTopLandmarkPath ? { semanticTopLandmarkPath: agent.semanticTopLandmarkPath } : {}),
    ...(agent.semanticTopLandmarkRole ? { semanticTopLandmarkRole: agent.semanticTopLandmarkRole } : {}),
    ...(agent.semanticTopLandmarkName ? { semanticTopLandmarkName: agent.semanticTopLandmarkName } : {}),
    ...(agent.semanticTopNamedRole ? { semanticTopNamedRole: agent.semanticTopNamedRole } : {}),
    ...(agent.semanticTopNamedRolePath ? { semanticTopNamedRolePath: agent.semanticTopNamedRolePath } : {}),
    ...(agent.semanticTopNamedRoleRole ? { semanticTopNamedRoleRole: agent.semanticTopNamedRoleRole } : {}),
    ...(agent.semanticTopNamedRoleName ? { semanticTopNamedRoleName: agent.semanticTopNamedRoleName } : {}),
    ...(agent.semanticTopNamedRoleDescription ? { semanticTopNamedRoleDescription: agent.semanticTopNamedRoleDescription } : {}),
    ...(agent.semanticTopInteractiveRole ? { semanticTopInteractiveRole: agent.semanticTopInteractiveRole } : {}),
    ...(agent.semanticTopInteractivePath ? { semanticTopInteractivePath: agent.semanticTopInteractivePath } : {}),
    ...(agent.semanticTopInteractiveName ? { semanticTopInteractiveName: agent.semanticTopInteractiveName } : {}),
    ...(agent.semanticTopInteractiveRoleDescription ? { semanticTopInteractiveRoleDescription: agent.semanticTopInteractiveRoleDescription } : {}),
    ...(agent.semanticTopInteractiveDescription ? { semanticTopInteractiveDescription: agent.semanticTopInteractiveDescription } : {}),
    ...(agent.semanticTopInteractiveValue ? { semanticTopInteractiveValue: agent.semanticTopInteractiveValue } : {}),
    ...(agent.semanticTopInteractiveState ? { semanticTopInteractiveState: agent.semanticTopInteractiveState } : {}),
    ...(typeof agent.semanticTopInteractiveDisabled === "boolean" ? { semanticTopInteractiveDisabled: agent.semanticTopInteractiveDisabled } : {}),
    ...(typeof agent.semanticTopInteractivePressed !== "undefined" ? { semanticTopInteractivePressed: agent.semanticTopInteractivePressed } : {}),
    ...(typeof agent.semanticTopInteractiveExpanded === "boolean" ? { semanticTopInteractiveExpanded: agent.semanticTopInteractiveExpanded } : {}),
    ...(typeof agent.semanticTopInteractiveHaspopup !== "undefined" ? { semanticTopInteractiveHaspopup: agent.semanticTopInteractiveHaspopup } : {}),
    ...(agent.semanticTopInteractiveControls ? { semanticTopInteractiveControls: agent.semanticTopInteractiveControls } : {}),
    ...(agent.semanticTopInteractiveSelector ? { semanticTopInteractiveSelector: agent.semanticTopInteractiveSelector } : {}),
    ...(agent.semanticTopFocusableRole ? { semanticTopFocusableRole: agent.semanticTopFocusableRole } : {}),
    ...(agent.semanticTopFocusablePath ? { semanticTopFocusablePath: agent.semanticTopFocusablePath } : {}),
    ...(agent.semanticTopFocusableName ? { semanticTopFocusableName: agent.semanticTopFocusableName } : {}),
    ...(agent.semanticTopFocusableRoleDescription ? { semanticTopFocusableRoleDescription: agent.semanticTopFocusableRoleDescription } : {}),
    ...(agent.semanticTopFocusableState ? { semanticTopFocusableState: agent.semanticTopFocusableState } : {}),
    ...(typeof agent.semanticTopFocusableDisabled === "boolean" ? { semanticTopFocusableDisabled: agent.semanticTopFocusableDisabled } : {}),
    ...(typeof agent.semanticTopFocusablePressed !== "undefined" ? { semanticTopFocusablePressed: agent.semanticTopFocusablePressed } : {}),
    ...(typeof agent.semanticTopFocusableExpanded === "boolean" ? { semanticTopFocusableExpanded: agent.semanticTopFocusableExpanded } : {}),
    ...(typeof agent.semanticTopFocusableHaspopup !== "undefined" ? { semanticTopFocusableHaspopup: agent.semanticTopFocusableHaspopup } : {}),
    ...(agent.semanticTopFocusableControls ? { semanticTopFocusableControls: agent.semanticTopFocusableControls } : {}),
    ...(agent.semanticTopFocusableSelector ? { semanticTopFocusableSelector: agent.semanticTopFocusableSelector } : {}),
    ...(agent.semanticTopLinkName ? { semanticTopLinkName: agent.semanticTopLinkName } : {}),
    ...(agent.semanticTopLinkPath ? { semanticTopLinkPath: agent.semanticTopLinkPath } : {}),
    ...(agent.semanticTopLinkUrl ? { semanticTopLinkUrl: agent.semanticTopLinkUrl } : {}),
    ...(agent.semanticTopLinkTarget ? { semanticTopLinkTarget: agent.semanticTopLinkTarget } : {}),
    ...(agent.semanticTopLinkRel?.length ? { semanticTopLinkRel: agent.semanticTopLinkRel } : {}),
    ...(agent.semanticTopLinkType ? { semanticTopLinkType: agent.semanticTopLinkType } : {}),
    ...(agent.semanticTopLinkHreflang ? { semanticTopLinkHreflang: agent.semanticTopLinkHreflang } : {}),
    ...(agent.semanticTopLinkState ? { semanticTopLinkState: agent.semanticTopLinkState } : {}),
    ...(typeof agent.semanticTopLinkCurrent !== "undefined" ? { semanticTopLinkCurrent: agent.semanticTopLinkCurrent } : {}),
    ...(agent.semanticTopLinkDownload ? { semanticTopLinkDownload: agent.semanticTopLinkDownload } : {}),
    ...(agent.semanticTopLinkSelector ? { semanticTopLinkSelector: agent.semanticTopLinkSelector } : {}),
    ...(typeof agent.semanticInPageLinkCount === "number" ? { semanticInPageLinkCount: agent.semanticInPageLinkCount } : {}),
    ...(agent.semanticTopInPageLinkPath ? { semanticTopInPageLinkPath: agent.semanticTopInPageLinkPath } : {}),
    ...(agent.semanticTopInPageLinkKind ? { semanticTopInPageLinkKind: agent.semanticTopInPageLinkKind } : {}),
    ...(agent.semanticTopInPageLinkName ? { semanticTopInPageLinkName: agent.semanticTopInPageLinkName } : {}),
    ...(agent.semanticTopInPageLinkUrl ? { semanticTopInPageLinkUrl: agent.semanticTopInPageLinkUrl } : {}),
    ...(agent.semanticTopInPageLinkTargetId ? { semanticTopInPageLinkTargetId: agent.semanticTopInPageLinkTargetId } : {}),
    ...(agent.semanticTopInPageLinkSelector ? { semanticTopInPageLinkSelector: agent.semanticTopInPageLinkSelector } : {}),
    ...(agent.semanticTopButtonName ? { semanticTopButtonName: agent.semanticTopButtonName } : {}),
    ...(agent.semanticTopButtonPath ? { semanticTopButtonPath: agent.semanticTopButtonPath } : {}),
    ...(agent.semanticTopButtonRoleDescription ? { semanticTopButtonRoleDescription: agent.semanticTopButtonRoleDescription } : {}),
    ...(agent.semanticTopButtonDescription ? { semanticTopButtonDescription: agent.semanticTopButtonDescription } : {}),
    ...(agent.semanticTopButtonType ? { semanticTopButtonType: agent.semanticTopButtonType } : {}),
    ...(agent.semanticTopButtonState ? { semanticTopButtonState: agent.semanticTopButtonState } : {}),
    ...(typeof agent.semanticTopButtonDisabled === "boolean" ? { semanticTopButtonDisabled: agent.semanticTopButtonDisabled } : {}),
    ...(typeof agent.semanticTopButtonPressed !== "undefined" ? { semanticTopButtonPressed: agent.semanticTopButtonPressed } : {}),
    ...(typeof agent.semanticTopButtonExpanded === "boolean" ? { semanticTopButtonExpanded: agent.semanticTopButtonExpanded } : {}),
    ...(typeof agent.semanticTopButtonHaspopup !== "undefined" ? { semanticTopButtonHaspopup: agent.semanticTopButtonHaspopup } : {}),
    ...(agent.semanticTopButtonControls ? { semanticTopButtonControls: agent.semanticTopButtonControls } : {}),
    ...(agent.semanticTopButtonFormAction ? { semanticTopButtonFormAction: agent.semanticTopButtonFormAction } : {}),
    ...(agent.semanticTopButtonFormMethod ? { semanticTopButtonFormMethod: agent.semanticTopButtonFormMethod } : {}),
    ...(agent.semanticTopButtonFormTarget ? { semanticTopButtonFormTarget: agent.semanticTopButtonFormTarget } : {}),
    ...(agent.semanticTopButtonFormEncType ? { semanticTopButtonFormEncType: agent.semanticTopButtonFormEncType } : {}),
    ...(typeof agent.semanticTopButtonFormNoValidate === "boolean" ? { semanticTopButtonFormNoValidate: agent.semanticTopButtonFormNoValidate } : {}),
    ...(agent.semanticTopButtonFormId ? { semanticTopButtonFormId: agent.semanticTopButtonFormId } : {}),
    ...(agent.semanticTopButtonSelector ? { semanticTopButtonSelector: agent.semanticTopButtonSelector } : {}),
    ...(agent.semanticTopImagePath ? { semanticTopImagePath: agent.semanticTopImagePath } : {}),
    ...(agent.semanticTopImageName ? { semanticTopImageName: agent.semanticTopImageName } : {}),
    ...(agent.semanticTopImageUrl ? { semanticTopImageUrl: agent.semanticTopImageUrl } : {}),
    ...(typeof agent.semanticTopImageWidth === "number" ? { semanticTopImageWidth: agent.semanticTopImageWidth } : {}),
    ...(typeof agent.semanticTopImageHeight === "number" ? { semanticTopImageHeight: agent.semanticTopImageHeight } : {}),
    ...(agent.semanticTopImageLoading ? { semanticTopImageLoading: agent.semanticTopImageLoading } : {}),
    ...(agent.semanticTopImageDecoding ? { semanticTopImageDecoding: agent.semanticTopImageDecoding } : {}),
    ...(agent.semanticTopImageSrcset ? { semanticTopImageSrcset: agent.semanticTopImageSrcset } : {}),
    ...(agent.semanticTopImageSizes ? { semanticTopImageSizes: agent.semanticTopImageSizes } : {}),
    ...(agent.semanticTopImageSelector ? { semanticTopImageSelector: agent.semanticTopImageSelector } : {}),
    ...(agent.semanticTopTableRole ? { semanticTopTableRole: agent.semanticTopTableRole } : {}),
    ...(agent.semanticTopTablePath ? { semanticTopTablePath: agent.semanticTopTablePath } : {}),
    ...(agent.semanticTopTableName ? { semanticTopTableName: agent.semanticTopTableName } : {}),
    ...(typeof agent.semanticTopTableRowCount === "number" ? { semanticTopTableRowCount: agent.semanticTopTableRowCount } : {}),
    ...(typeof agent.semanticTopTableCellCount === "number" ? { semanticTopTableCellCount: agent.semanticTopTableCellCount } : {}),
    ...(typeof agent.semanticTopTableDeclaredRowCount === "number" ? { semanticTopTableDeclaredRowCount: agent.semanticTopTableDeclaredRowCount } : {}),
    ...(typeof agent.semanticTopTableDeclaredColumnCount === "number" ? { semanticTopTableDeclaredColumnCount: agent.semanticTopTableDeclaredColumnCount } : {}),
    ...(agent.semanticTopTableHeaders?.length ? { semanticTopTableHeaders: agent.semanticTopTableHeaders } : {}),
    ...(agent.semanticTopTableHeaderRefs?.length ? { semanticTopTableHeaderRefs: agent.semanticTopTableHeaderRefs } : {}),
    ...(typeof agent.semanticTopTableOwnedCount === "number" ? { semanticTopTableOwnedCount: agent.semanticTopTableOwnedCount } : {}),
    ...(agent.semanticTopTableOwnedRefs?.length ? { semanticTopTableOwnedRefs: agent.semanticTopTableOwnedRefs } : {}),
    ...(agent.semanticTopTableSampleCells?.length ? { semanticTopTableSampleCells: agent.semanticTopTableSampleCells } : {}),
    ...(agent.semanticTopTableSampleCellRefs?.length ? { semanticTopTableSampleCellRefs: agent.semanticTopTableSampleCellRefs } : {}),
    ...(agent.semanticTopTableFirstHeader ? { semanticTopTableFirstHeader: agent.semanticTopTableFirstHeader } : {}),
    ...(agent.semanticTopTableFirstHeaderPath ? { semanticTopTableFirstHeaderPath: agent.semanticTopTableFirstHeaderPath } : {}),
    ...(agent.semanticTopTableFirstHeaderRole ? { semanticTopTableFirstHeaderRole: agent.semanticTopTableFirstHeaderRole } : {}),
    ...(typeof agent.semanticTopTableFirstHeaderRowIndex === "number" ? { semanticTopTableFirstHeaderRowIndex: agent.semanticTopTableFirstHeaderRowIndex } : {}),
    ...(typeof agent.semanticTopTableFirstHeaderColumnIndex === "number" ? { semanticTopTableFirstHeaderColumnIndex: agent.semanticTopTableFirstHeaderColumnIndex } : {}),
    ...(agent.semanticTopTableFirstHeaderSort ? { semanticTopTableFirstHeaderSort: agent.semanticTopTableFirstHeaderSort } : {}),
    ...(agent.semanticTopTableFirstHeaderSelector ? { semanticTopTableFirstHeaderSelector: agent.semanticTopTableFirstHeaderSelector } : {}),
    ...(agent.semanticTopTableFirstOwnedTarget ? { semanticTopTableFirstOwnedTarget: agent.semanticTopTableFirstOwnedTarget } : {}),
    ...(agent.semanticTopTableFirstOwnedRole ? { semanticTopTableFirstOwnedRole: agent.semanticTopTableFirstOwnedRole } : {}),
    ...(agent.semanticTopTableFirstOwnedName ? { semanticTopTableFirstOwnedName: agent.semanticTopTableFirstOwnedName } : {}),
    ...(agent.semanticTopTableFirstOwnedSelector ? { semanticTopTableFirstOwnedSelector: agent.semanticTopTableFirstOwnedSelector } : {}),
    ...(agent.semanticTopTableFirstSampleCellPath ? { semanticTopTableFirstSampleCellPath: agent.semanticTopTableFirstSampleCellPath } : {}),
    ...(agent.semanticTopTableFirstSampleCellText ? { semanticTopTableFirstSampleCellText: agent.semanticTopTableFirstSampleCellText } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellRowIndex === "number" ? { semanticTopTableFirstSampleCellRowIndex: agent.semanticTopTableFirstSampleCellRowIndex } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellColumnIndex === "number" ? { semanticTopTableFirstSampleCellColumnIndex: agent.semanticTopTableFirstSampleCellColumnIndex } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellRowSpan === "number" ? { semanticTopTableFirstSampleCellRowSpan: agent.semanticTopTableFirstSampleCellRowSpan } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellColumnSpan === "number" ? { semanticTopTableFirstSampleCellColumnSpan: agent.semanticTopTableFirstSampleCellColumnSpan } : {}),
    ...(agent.semanticTopTableFirstSampleCellHeaders?.length ? { semanticTopTableFirstSampleCellHeaders: agent.semanticTopTableFirstSampleCellHeaders } : {}),
    ...(agent.semanticTopTableFirstSampleCellRowHeaders?.length ? { semanticTopTableFirstSampleCellRowHeaders: agent.semanticTopTableFirstSampleCellRowHeaders } : {}),
    ...(agent.semanticTopTableFirstSampleCellColumnHeaders?.length ? { semanticTopTableFirstSampleCellColumnHeaders: agent.semanticTopTableFirstSampleCellColumnHeaders } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellSelected === "boolean" ? { semanticTopTableFirstSampleCellSelected: agent.semanticTopTableFirstSampleCellSelected } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellCurrent !== "undefined" ? { semanticTopTableFirstSampleCellCurrent: agent.semanticTopTableFirstSampleCellCurrent } : {}),
    ...(agent.semanticTopTableFirstSampleCellSelector ? { semanticTopTableFirstSampleCellSelector: agent.semanticTopTableFirstSampleCellSelector } : {}),
    ...(agent.semanticTopSelectedTableCellPath ? { semanticTopSelectedTableCellPath: agent.semanticTopSelectedTableCellPath } : {}),
    ...(agent.semanticTopSelectedTableCellText ? { semanticTopSelectedTableCellText: agent.semanticTopSelectedTableCellText } : {}),
    ...(typeof agent.semanticTopSelectedTableCellRowIndex === "number" ? { semanticTopSelectedTableCellRowIndex: agent.semanticTopSelectedTableCellRowIndex } : {}),
    ...(typeof agent.semanticTopSelectedTableCellColumnIndex === "number" ? { semanticTopSelectedTableCellColumnIndex: agent.semanticTopSelectedTableCellColumnIndex } : {}),
    ...(typeof agent.semanticTopSelectedTableCellSelected === "boolean" ? { semanticTopSelectedTableCellSelected: agent.semanticTopSelectedTableCellSelected } : {}),
    ...(typeof agent.semanticTopSelectedTableCellCurrent !== "undefined" ? { semanticTopSelectedTableCellCurrent: agent.semanticTopSelectedTableCellCurrent } : {}),
    ...(agent.semanticTopSelectedTableCellSelector ? { semanticTopSelectedTableCellSelector: agent.semanticTopSelectedTableCellSelector } : {}),
    ...(agent.semanticTopTableSelector ? { semanticTopTableSelector: agent.semanticTopTableSelector } : {}),
    ...(agent.semanticTopListRole ? { semanticTopListRole: agent.semanticTopListRole } : {}),
    ...(agent.semanticTopListPath ? { semanticTopListPath: agent.semanticTopListPath } : {}),
    ...(agent.semanticTopListName ? { semanticTopListName: agent.semanticTopListName } : {}),
    ...(typeof agent.semanticTopListItemCount === "number" ? { semanticTopListItemCount: agent.semanticTopListItemCount } : {}),
    ...(agent.semanticTopListItems?.length ? { semanticTopListItems: agent.semanticTopListItems } : {}),
    ...(agent.semanticTopListItemRefs?.length ? { semanticTopListItemRefs: agent.semanticTopListItemRefs } : {}),
    ...(agent.semanticTopListFirstItemText ? { semanticTopListFirstItemText: agent.semanticTopListFirstItemText } : {}),
    ...(agent.semanticTopListFirstItemRole ? { semanticTopListFirstItemRole: agent.semanticTopListFirstItemRole } : {}),
    ...(typeof agent.semanticTopListFirstItemLevel === "number" ? { semanticTopListFirstItemLevel: agent.semanticTopListFirstItemLevel } : {}),
    ...(typeof agent.semanticTopListFirstItemPosInSet === "number" ? { semanticTopListFirstItemPosInSet: agent.semanticTopListFirstItemPosInSet } : {}),
    ...(typeof agent.semanticTopListFirstItemSetSize === "number" ? { semanticTopListFirstItemSetSize: agent.semanticTopListFirstItemSetSize } : {}),
    ...(typeof agent.semanticTopListFirstItemSelected === "boolean" ? { semanticTopListFirstItemSelected: agent.semanticTopListFirstItemSelected } : {}),
    ...(typeof agent.semanticTopListFirstItemCurrent !== "undefined" ? { semanticTopListFirstItemCurrent: agent.semanticTopListFirstItemCurrent } : {}),
    ...(typeof agent.semanticTopListFirstItemExpanded === "boolean" ? { semanticTopListFirstItemExpanded: agent.semanticTopListFirstItemExpanded } : {}),
    ...(agent.semanticTopListFirstItemSelector ? { semanticTopListFirstItemSelector: agent.semanticTopListFirstItemSelector } : {}),
    ...(agent.semanticTopListSelector ? { semanticTopListSelector: agent.semanticTopListSelector } : {}),
    ...(agent.semanticTopFieldRole ? { semanticTopFieldRole: agent.semanticTopFieldRole } : {}),
    ...(agent.semanticTopFieldPath ? { semanticTopFieldPath: agent.semanticTopFieldPath } : {}),
    ...(agent.semanticTopFieldName ? { semanticTopFieldName: agent.semanticTopFieldName } : {}),
    ...(agent.semanticTopFieldDescription ? { semanticTopFieldDescription: agent.semanticTopFieldDescription } : {}),
    ...(agent.semanticTopFieldValue ? { semanticTopFieldValue: agent.semanticTopFieldValue } : {}),
    ...(agent.semanticTopFieldHtmlName ? { semanticTopFieldHtmlName: agent.semanticTopFieldHtmlName } : {}),
    ...(agent.semanticTopFieldHtmlType ? { semanticTopFieldHtmlType: agent.semanticTopFieldHtmlType } : {}),
    ...(agent.semanticTopFieldPlaceholder ? { semanticTopFieldPlaceholder: agent.semanticTopFieldPlaceholder } : {}),
    ...(agent.semanticTopFieldAriaPlaceholder ? { semanticTopFieldAriaPlaceholder: agent.semanticTopFieldAriaPlaceholder } : {}),
    ...(agent.semanticTopFieldAutocomplete ? { semanticTopFieldAutocomplete: agent.semanticTopFieldAutocomplete } : {}),
    ...(agent.semanticTopFieldAriaAutocomplete ? { semanticTopFieldAriaAutocomplete: agent.semanticTopFieldAriaAutocomplete } : {}),
    ...(agent.semanticTopFieldInputMode ? { semanticTopFieldInputMode: agent.semanticTopFieldInputMode } : {}),
    ...(agent.semanticTopFieldPattern ? { semanticTopFieldPattern: agent.semanticTopFieldPattern } : {}),
    ...(agent.semanticTopFieldMin ? { semanticTopFieldMin: agent.semanticTopFieldMin } : {}),
    ...(agent.semanticTopFieldMax ? { semanticTopFieldMax: agent.semanticTopFieldMax } : {}),
    ...(agent.semanticTopFieldStep ? { semanticTopFieldStep: agent.semanticTopFieldStep } : {}),
    ...(typeof agent.semanticTopFieldMinLength === "number" ? { semanticTopFieldMinLength: agent.semanticTopFieldMinLength } : {}),
    ...(typeof agent.semanticTopFieldMaxLength === "number" ? { semanticTopFieldMaxLength: agent.semanticTopFieldMaxLength } : {}),
    ...(agent.semanticTopFieldLabelledBy ? { semanticTopFieldLabelledBy: agent.semanticTopFieldLabelledBy } : {}),
    ...(agent.semanticTopFieldLabelledByText ? { semanticTopFieldLabelledByText: agent.semanticTopFieldLabelledByText } : {}),
    ...(agent.semanticTopFieldDescribedBy ? { semanticTopFieldDescribedBy: agent.semanticTopFieldDescribedBy } : {}),
    ...(agent.semanticTopFieldDescribedByText ? { semanticTopFieldDescribedByText: agent.semanticTopFieldDescribedByText } : {}),
    ...(agent.semanticTopFieldDetails ? { semanticTopFieldDetails: agent.semanticTopFieldDetails } : {}),
    ...(agent.semanticTopFieldDetailsText ? { semanticTopFieldDetailsText: agent.semanticTopFieldDetailsText } : {}),
    ...(agent.semanticTopFieldErrorMessage ? { semanticTopFieldErrorMessage: agent.semanticTopFieldErrorMessage } : {}),
    ...(agent.semanticTopFieldErrorMessageText ? { semanticTopFieldErrorMessageText: agent.semanticTopFieldErrorMessageText } : {}),
    ...(agent.semanticTopFieldState ? { semanticTopFieldState: agent.semanticTopFieldState } : {}),
    ...(typeof agent.semanticTopFieldDisabled === "boolean" ? { semanticTopFieldDisabled: agent.semanticTopFieldDisabled } : {}),
    ...(typeof agent.semanticTopFieldRequired === "boolean" ? { semanticTopFieldRequired: agent.semanticTopFieldRequired } : {}),
    ...(typeof agent.semanticTopFieldReadonly === "boolean" ? { semanticTopFieldReadonly: agent.semanticTopFieldReadonly } : {}),
    ...(typeof agent.semanticTopFieldInvalid !== "undefined" ? { semanticTopFieldInvalid: agent.semanticTopFieldInvalid } : {}),
    ...(typeof agent.semanticTopFieldChecked !== "undefined" ? { semanticTopFieldChecked: agent.semanticTopFieldChecked } : {}),
    ...(typeof agent.semanticTopFieldExpanded === "boolean" ? { semanticTopFieldExpanded: agent.semanticTopFieldExpanded } : {}),
    ...(typeof agent.semanticTopFieldHaspopup !== "undefined" ? { semanticTopFieldHaspopup: agent.semanticTopFieldHaspopup } : {}),
    ...(agent.semanticTopFieldControls ? { semanticTopFieldControls: agent.semanticTopFieldControls } : {}),
    ...(typeof agent.semanticTopFieldValueMin === "number" ? { semanticTopFieldValueMin: agent.semanticTopFieldValueMin } : {}),
    ...(typeof agent.semanticTopFieldValueMax === "number" ? { semanticTopFieldValueMax: agent.semanticTopFieldValueMax } : {}),
    ...(typeof agent.semanticTopFieldValueNow === "number" ? { semanticTopFieldValueNow: agent.semanticTopFieldValueNow } : {}),
    ...(agent.semanticTopFieldValueText ? { semanticTopFieldValueText: agent.semanticTopFieldValueText } : {}),
    ...(agent.semanticTopFieldSelector ? { semanticTopFieldSelector: agent.semanticTopFieldSelector } : {}),
    ...(agent.semanticTopDescriptionRole ? { semanticTopDescriptionRole: agent.semanticTopDescriptionRole } : {}),
    ...(agent.semanticTopDescriptionPath ? { semanticTopDescriptionPath: agent.semanticTopDescriptionPath } : {}),
    ...(agent.semanticTopDescriptionName ? { semanticTopDescriptionName: agent.semanticTopDescriptionName } : {}),
    ...(agent.semanticTopDescriptionText ? { semanticTopDescriptionText: agent.semanticTopDescriptionText } : {}),
    ...(agent.semanticTopDescriptionSelector ? { semanticTopDescriptionSelector: agent.semanticTopDescriptionSelector } : {}),
    ...(agent.semanticTopValueRole ? { semanticTopValueRole: agent.semanticTopValueRole } : {}),
    ...(agent.semanticTopValuePath ? { semanticTopValuePath: agent.semanticTopValuePath } : {}),
    ...(agent.semanticTopValueName ? { semanticTopValueName: agent.semanticTopValueName } : {}),
    ...(agent.semanticTopValue ? { semanticTopValue: agent.semanticTopValue } : {}),
    ...(agent.semanticTopValueSelector ? { semanticTopValueSelector: agent.semanticTopValueSelector } : {}),
    ...(agent.semanticTopRelationRole ? { semanticTopRelationRole: agent.semanticTopRelationRole } : {}),
    ...(agent.semanticTopRelationPath ? { semanticTopRelationPath: agent.semanticTopRelationPath } : {}),
    ...(agent.semanticTopRelationName ? { semanticTopRelationName: agent.semanticTopRelationName } : {}),
    ...(agent.semanticTopRelation ? { semanticTopRelation: agent.semanticTopRelation } : {}),
    ...(agent.semanticTopRelationTarget ? { semanticTopRelationTarget: agent.semanticTopRelationTarget } : {}),
    ...(agent.semanticTopRelationTargetRole ? { semanticTopRelationTargetRole: agent.semanticTopRelationTargetRole } : {}),
    ...(agent.semanticTopRelationTargetName ? { semanticTopRelationTargetName: agent.semanticTopRelationTargetName } : {}),
    ...(agent.semanticTopRelationTargetSelector ? { semanticTopRelationTargetSelector: agent.semanticTopRelationTargetSelector } : {}),
    ...(agent.semanticTopRelationSelector ? { semanticTopRelationSelector: agent.semanticTopRelationSelector } : {}),
    ...(agent.semanticTopChoiceRole ? { semanticTopChoiceRole: agent.semanticTopChoiceRole } : {}),
    ...(agent.semanticTopChoicePath ? { semanticTopChoicePath: agent.semanticTopChoicePath } : {}),
    ...(agent.semanticTopChoiceName ? { semanticTopChoiceName: agent.semanticTopChoiceName } : {}),
    ...(agent.semanticTopChoiceState ? { semanticTopChoiceState: agent.semanticTopChoiceState } : {}),
    ...(typeof agent.semanticTopChoiceSelected === "boolean" ? { semanticTopChoiceSelected: agent.semanticTopChoiceSelected } : {}),
    ...(typeof agent.semanticTopChoiceCurrent !== "undefined" ? { semanticTopChoiceCurrent: agent.semanticTopChoiceCurrent } : {}),
    ...(typeof agent.semanticTopChoiceLevel === "number" ? { semanticTopChoiceLevel: agent.semanticTopChoiceLevel } : {}),
    ...(typeof agent.semanticTopChoicePosInSet === "number" ? { semanticTopChoicePosInSet: agent.semanticTopChoicePosInSet } : {}),
    ...(typeof agent.semanticTopChoiceSetSize === "number" ? { semanticTopChoiceSetSize: agent.semanticTopChoiceSetSize } : {}),
    ...(agent.semanticTopChoiceSelector ? { semanticTopChoiceSelector: agent.semanticTopChoiceSelector } : {}),
    ...(agent.semanticTopSelectedChoiceRole ? { semanticTopSelectedChoiceRole: agent.semanticTopSelectedChoiceRole } : {}),
    ...(agent.semanticTopSelectedChoicePath ? { semanticTopSelectedChoicePath: agent.semanticTopSelectedChoicePath } : {}),
    ...(agent.semanticTopSelectedChoiceName ? { semanticTopSelectedChoiceName: agent.semanticTopSelectedChoiceName } : {}),
    ...(agent.semanticTopSelectedChoiceState ? { semanticTopSelectedChoiceState: agent.semanticTopSelectedChoiceState } : {}),
    ...(typeof agent.semanticTopSelectedChoiceSelected === "boolean" ? { semanticTopSelectedChoiceSelected: agent.semanticTopSelectedChoiceSelected } : {}),
    ...(typeof agent.semanticTopSelectedChoiceCurrent !== "undefined" ? { semanticTopSelectedChoiceCurrent: agent.semanticTopSelectedChoiceCurrent } : {}),
    ...(typeof agent.semanticTopSelectedChoiceLevel === "number" ? { semanticTopSelectedChoiceLevel: agent.semanticTopSelectedChoiceLevel } : {}),
    ...(typeof agent.semanticTopSelectedChoicePosInSet === "number" ? { semanticTopSelectedChoicePosInSet: agent.semanticTopSelectedChoicePosInSet } : {}),
    ...(typeof agent.semanticTopSelectedChoiceSetSize === "number" ? { semanticTopSelectedChoiceSetSize: agent.semanticTopSelectedChoiceSetSize } : {}),
    ...(agent.semanticTopSelectedChoiceControls ? { semanticTopSelectedChoiceControls: agent.semanticTopSelectedChoiceControls } : {}),
    ...(agent.semanticTopSelectedChoiceControlsTargetRole ? { semanticTopSelectedChoiceControlsTargetRole: agent.semanticTopSelectedChoiceControlsTargetRole } : {}),
    ...(agent.semanticTopSelectedChoiceControlsTargetName ? { semanticTopSelectedChoiceControlsTargetName: agent.semanticTopSelectedChoiceControlsTargetName } : {}),
    ...(agent.semanticTopSelectedChoiceControlsTargetSelector ? { semanticTopSelectedChoiceControlsTargetSelector: agent.semanticTopSelectedChoiceControlsTargetSelector } : {}),
    ...(agent.semanticTopSelectedChoiceSelector ? { semanticTopSelectedChoiceSelector: agent.semanticTopSelectedChoiceSelector } : {}),
    ...(agent.semanticTopStateRole ? { semanticTopStateRole: agent.semanticTopStateRole } : {}),
    ...(agent.semanticTopStatePath ? { semanticTopStatePath: agent.semanticTopStatePath } : {}),
    ...(agent.semanticTopStateName ? { semanticTopStateName: agent.semanticTopStateName } : {}),
    ...(agent.semanticTopState ? { semanticTopState: agent.semanticTopState } : {}),
    ...(typeof agent.semanticTopStateHidden === "boolean" ? { semanticTopStateHidden: agent.semanticTopStateHidden } : {}),
    ...(typeof agent.semanticTopStateDisabled === "boolean" ? { semanticTopStateDisabled: agent.semanticTopStateDisabled } : {}),
    ...(typeof agent.semanticTopStateBusy === "boolean" ? { semanticTopStateBusy: agent.semanticTopStateBusy } : {}),
    ...(typeof agent.semanticTopStateMultiselectable === "boolean" ? { semanticTopStateMultiselectable: agent.semanticTopStateMultiselectable } : {}),
    ...(agent.semanticTopStateSort ? { semanticTopStateSort: agent.semanticTopStateSort } : {}),
    ...(typeof agent.semanticTopStateGrabbed === "boolean" ? { semanticTopStateGrabbed: agent.semanticTopStateGrabbed } : {}),
    ...(agent.semanticTopStateDropEffect ? { semanticTopStateDropEffect: agent.semanticTopStateDropEffect } : {}),
    ...(typeof agent.semanticTopStateChecked !== "undefined" ? { semanticTopStateChecked: agent.semanticTopStateChecked } : {}),
    ...(typeof agent.semanticTopStateSelected === "boolean" ? { semanticTopStateSelected: agent.semanticTopStateSelected } : {}),
    ...(typeof agent.semanticTopStateExpanded === "boolean" ? { semanticTopStateExpanded: agent.semanticTopStateExpanded } : {}),
    ...(typeof agent.semanticTopStatePressed !== "undefined" ? { semanticTopStatePressed: agent.semanticTopStatePressed } : {}),
    ...(typeof agent.semanticTopStateFocused === "boolean" ? { semanticTopStateFocused: agent.semanticTopStateFocused } : {}),
    ...(typeof agent.semanticTopStateRequired === "boolean" ? { semanticTopStateRequired: agent.semanticTopStateRequired } : {}),
    ...(typeof agent.semanticTopStateInvalid !== "undefined" ? { semanticTopStateInvalid: agent.semanticTopStateInvalid } : {}),
    ...(typeof agent.semanticTopStateReadonly === "boolean" ? { semanticTopStateReadonly: agent.semanticTopStateReadonly } : {}),
    ...(typeof agent.semanticTopStateCurrent !== "undefined" ? { semanticTopStateCurrent: agent.semanticTopStateCurrent } : {}),
    ...(typeof agent.semanticTopStateHaspopup !== "undefined" ? { semanticTopStateHaspopup: agent.semanticTopStateHaspopup } : {}),
    ...(agent.semanticTopStateControls ? { semanticTopStateControls: agent.semanticTopStateControls } : {}),
    ...(agent.semanticTopStateLive ? { semanticTopStateLive: agent.semanticTopStateLive } : {}),
    ...(typeof agent.semanticTopStateModal === "boolean" ? { semanticTopStateModal: agent.semanticTopStateModal } : {}),
    ...(agent.semanticTopStateOrientation ? { semanticTopStateOrientation: agent.semanticTopStateOrientation } : {}),
    ...(typeof agent.semanticTopStateValueMin === "number" ? { semanticTopStateValueMin: agent.semanticTopStateValueMin } : {}),
    ...(typeof agent.semanticTopStateValueMax === "number" ? { semanticTopStateValueMax: agent.semanticTopStateValueMax } : {}),
    ...(typeof agent.semanticTopStateValueNow === "number" ? { semanticTopStateValueNow: agent.semanticTopStateValueNow } : {}),
    ...(agent.semanticTopStateValueText ? { semanticTopStateValueText: agent.semanticTopStateValueText } : {}),
    ...(agent.semanticTopStateSelector ? { semanticTopStateSelector: agent.semanticTopStateSelector } : {}),
    ...(agent.semanticTopModalStateRole ? { semanticTopModalStateRole: agent.semanticTopModalStateRole } : {}),
    ...(agent.semanticTopModalStatePath ? { semanticTopModalStatePath: agent.semanticTopModalStatePath } : {}),
    ...(agent.semanticTopModalStateName ? { semanticTopModalStateName: agent.semanticTopModalStateName } : {}),
    ...(agent.semanticTopModalState ? { semanticTopModalState: agent.semanticTopModalState } : {}),
    ...(agent.semanticTopModalStateSelector ? { semanticTopModalStateSelector: agent.semanticTopModalStateSelector } : {}),
    ...(agent.semanticTopLiveStateRole ? { semanticTopLiveStateRole: agent.semanticTopLiveStateRole } : {}),
    ...(agent.semanticTopLiveStatePath ? { semanticTopLiveStatePath: agent.semanticTopLiveStatePath } : {}),
    ...(agent.semanticTopLiveStateName ? { semanticTopLiveStateName: agent.semanticTopLiveStateName } : {}),
    ...(agent.semanticTopLiveState ? { semanticTopLiveState: agent.semanticTopLiveState } : {}),
    ...(agent.semanticTopLiveStateLive ? { semanticTopLiveStateLive: agent.semanticTopLiveStateLive } : {}),
    ...(agent.semanticTopLiveStateSelector ? { semanticTopLiveStateSelector: agent.semanticTopLiveStateSelector } : {}),
    ...(agent.semanticTopUnavailablePath ? { semanticTopUnavailablePath: agent.semanticTopUnavailablePath } : {}),
    ...(agent.semanticTopUnavailableTag ? { semanticTopUnavailableTag: agent.semanticTopUnavailableTag } : {}),
    ...(agent.semanticTopUnavailableRole ? { semanticTopUnavailableRole: agent.semanticTopUnavailableRole } : {}),
    ...(agent.semanticTopUnavailableName ? { semanticTopUnavailableName: agent.semanticTopUnavailableName } : {}),
    ...(agent.semanticTopUnavailableReason ? { semanticTopUnavailableReason: agent.semanticTopUnavailableReason } : {}),
    ...(agent.semanticTopUnavailableSelector ? { semanticTopUnavailableSelector: agent.semanticTopUnavailableSelector } : {}),
    signalCount: agent.signalCount,
    signalWarningCount: agent.signalWarningCount,
    signalErrorCount: agent.signalErrorCount,
    ...(agent.signals.length > 0 ? { signals: agent.signals } : {}),
    qualityGateCount: agent.qualityGateCount,
    qualityGateFailCount: agent.qualityGateFailCount,
    ...(agent.qualityGates.length > 0 ? { qualityGates: compactAgentQualityGates(agent.qualityGates) } : {}),
    ...(agent.topSignalKind ? { topSignalKind: agent.topSignalKind } : {}),
    ...(agent.topSignalSeverity ? { topSignalSeverity: agent.topSignalSeverity } : {}),
    ...(agent.topSignalMessage ? { topSignalMessage: agent.topSignalMessage } : {}),
    ...(agent.topQualityGateKind ? { topQualityGateKind: agent.topQualityGateKind } : {}),
    ...(typeof agent.topQualityGatePass === "boolean" ? { topQualityGatePass: agent.topQualityGatePass } : {}),
    ...(agent.topQualityGateSeverity ? { topQualityGateSeverity: agent.topQualityGateSeverity } : {}),
    ...(agent.topQualityGateMessage ? { topQualityGateMessage: agent.topQualityGateMessage } : {}),
    ...(agent.topQualityGatePath ? { topQualityGatePath: agent.topQualityGatePath } : {}),
    ...(typeof agent.topQualityGateScore === "number" ? { topQualityGateScore: agent.topQualityGateScore } : {}),
    ...(agent.problemSignalKind ? { problemSignalKind: agent.problemSignalKind } : {}),
    ...(agent.problemSignalSeverity ? { problemSignalSeverity: agent.problemSignalSeverity } : {}),
    ...(agent.problemSignalMessage ? { problemSignalMessage: agent.problemSignalMessage } : {}),
    ...(agent.failingQualityGateKind ? { failingQualityGateKind: agent.failingQualityGateKind } : {}),
    ...(agent.failingQualityGateSeverity ? { failingQualityGateSeverity: agent.failingQualityGateSeverity } : {}),
    ...(agent.failingQualityGateMessage ? { failingQualityGateMessage: agent.failingQualityGateMessage } : {}),
    ...(agent.failingQualityGatePath ? { failingQualityGatePath: agent.failingQualityGatePath } : {}),
    ...(typeof agent.failingQualityGateScore === "number" ? { failingQualityGateScore: agent.failingQualityGateScore } : {}),
    canContinue: agent.canContinue,
    canUseFetchedHtml: agent.canUseFetchedHtml,
    needsBrowserHtml: agent.needsBrowserHtml,
    ...(agent.staticReadiness ? { staticReadiness: agent.staticReadiness } : {}),
    ...(agent.staticReadinessReasonCode ? { staticReadinessReasonCode: agent.staticReadinessReasonCode } : {}),
    ...(agent.staticReadinessReason ? { staticReadinessReason: agent.staticReadinessReason } : {}),
    ...(agent.staticReadinessReadFrom ? { staticReadinessReadFrom: agent.staticReadinessReadFrom } : {}),
    ...(agent.browserHtmlReason ? { browserHtmlReason: agent.browserHtmlReason } : {}),
    ...(agent.browserHtmlReasonCode ? { browserHtmlReasonCode: agent.browserHtmlReasonCode } : {}),
    ...(agent.browserHtmlActionName ? { browserHtmlActionName: agent.browserHtmlActionName } : {}),
    ...(agent.browserHtmlOperation ? { browserHtmlOperation: agent.browserHtmlOperation } : {}),
    ...(agent.browserHtmlUrl ? { browserHtmlUrl: agent.browserHtmlUrl } : {}),
    ...(agent.browserHtmlFile ? { browserHtmlFile: agent.browserHtmlFile } : {}),
    ...(agent.browserHtmlCaptureScript ? { browserHtmlCaptureScript: agent.browserHtmlCaptureScript } : {}),
    ...(agent.browserHtmlCommand ? { browserHtmlCommand: agent.browserHtmlCommand } : {}),
    ...(agent.browserHtmlCommandArgs ? { browserHtmlCommandArgs: agent.browserHtmlCommandArgs } : {}),
    ...(agent.browserHtmlAfterInteractionCommand ? { browserHtmlAfterInteractionCommand: agent.browserHtmlAfterInteractionCommand } : {}),
    ...(agent.browserHtmlAfterInteractionCommandArgs ? { browserHtmlAfterInteractionCommandArgs: agent.browserHtmlAfterInteractionCommandArgs } : {}),
    responseStatus: agent.responseStatus,
    responseOk: agent.responseOk,
    responseContentType: agent.responseContentType,
    finalUrlChanged: agent.finalUrlChanged,
    confidence: agent.confidence,
    usabilityScore: agent.usabilityScore,
    readability: agent.readability,
    readabilityScore: agent.readabilityScore,
    ...(agent.readabilityReasons.length > 0 ? { readabilityReasons: agent.readabilityReasons } : {}),
    verificationStatus: agent.verificationStatus,
    verificationRequestedCount: agent.verificationRequestedCount,
    verificationFoundCount: agent.verificationFoundCount,
    verificationMissingCount: agent.verificationMissingCount,
    ...(agent.verificationFoundQueries.length > 0 ? { verificationFoundQueries: agent.verificationFoundQueries } : {}),
    ...(agent.verificationMissingQueries.length > 0 ? { verificationMissingQueries: agent.verificationMissingQueries } : {}),
    ...(agent.topVerificationFoundQuery ? { topVerificationFoundQuery: agent.topVerificationFoundQuery } : {}),
    ...(agent.topVerificationMissingQuery ? { topVerificationMissingQuery: agent.topVerificationMissingQuery } : {}),
    resultCount: agent.resultCount,
    resultChoiceCount: agent.resultChoiceCount,
    ...(agent.resultChoices.length > 0 ? { resultChoices: agent.resultChoices.map((choice) => compactAgentResultChoice(choice, searchCommandContext, pageLinkContext)) } : {}),
    ...(agent.topResultChoicePath ? { topResultChoicePath: agent.topResultChoicePath } : {}),
    ...(agent.topResultChoiceTitle ? { topResultChoiceTitle: agent.topResultChoiceTitle } : {}),
    ...(agent.topResultChoiceUrl ? { topResultChoiceUrl: agent.topResultChoiceUrl } : {}),
    ...(agent.topResultChoiceHost ? { topResultChoiceHost: agent.topResultChoiceHost } : {}),
    ...(agent.topResultChoiceSnippet ? { topResultChoiceSnippet: agent.topResultChoiceSnippet } : {}),
    ...(agent.topResultChoiceCommandArgs ? { topResultChoiceCommandArgs: agent.topResultChoiceCommandArgs } : agent.resultChoices[0] ? { topResultChoiceCommandArgs: compactAgentResultChoice(agent.resultChoices[0], searchCommandContext, pageLinkContext).commandArgs } : {}),
    ...(typeof agent.topResultChoiceRank === "number" ? { topResultChoiceRank: agent.topResultChoiceRank } : {}),
    ...(agent.topResultChoiceOpenResult ? { topResultChoiceOpenResult: agent.topResultChoiceOpenResult } : agent.resultChoices[0] ? { topResultChoiceOpenResult: compactAgentResultChoice(agent.resultChoices[0], searchCommandContext, pageLinkContext).openResult } : {}),
    ...(typeof agent.topResultChoiceRecommended === "boolean" ? { topResultChoiceRecommended: agent.topResultChoiceRecommended } : {}),
    ...(typeof agent.topResultChoicePrimary === "boolean" ? { topResultChoicePrimary: agent.topResultChoicePrimary } : {}),
    ...(agent.topResultChoiceSourceType ? { topResultChoiceSourceType: agent.topResultChoiceSourceType } : {}),
    ...(typeof agent.topResultChoiceSourceScore === "number" ? { topResultChoiceSourceScore: agent.topResultChoiceSourceScore } : {}),
    ...(agent.topResultChoiceSourceHints?.length ? { topResultChoiceSourceHints: agent.topResultChoiceSourceHints } : {}),
    ...(agent.topResultChoiceDateText ? { topResultChoiceDateText: agent.topResultChoiceDateText } : {}),
    ...(agent.topResultChoiceRelevance ? { topResultChoiceRelevance: agent.topResultChoiceRelevance } : {}),
    ...(agent.topResultChoiceMatchedTerm ? { topResultChoiceMatchedTerm: agent.topResultChoiceMatchedTerm } : {}),
    ...(agent.topResultChoiceFindMatch ? { topResultChoiceFindMatch: agent.topResultChoiceFindMatch } : {}),
    ...(typeof agent.topResultChoiceLikelyOfficial === "boolean" ? { topResultChoiceLikelyOfficial: agent.topResultChoiceLikelyOfficial } : {}),
    ...(typeof agent.topResultChoiceSitelinkCount === "number" ? { topResultChoiceSitelinkCount: agent.topResultChoiceSitelinkCount } : {}),
    ...(agent.topResultChoiceFirstSitelinkTitle ? { topResultChoiceFirstSitelinkTitle: agent.topResultChoiceFirstSitelinkTitle } : {}),
    ...(agent.topResultChoiceFirstSitelinkUrl ? { topResultChoiceFirstSitelinkUrl: agent.topResultChoiceFirstSitelinkUrl } : {}),
    ...(agent.topResultChoiceReason ? { topResultChoiceReason: agent.topResultChoiceReason } : {}),
    evidenceCount: agent.evidenceCount,
    formCount: agent.formCount,
    formChoiceCount: agent.formChoiceCount,
    ...(agent.formChoices.length > 0 ? { formChoices: compactAgentFormExecutionRefs(agent.formChoices) } : {}),
    actionTargetCount: agent.actionTargetCount,
    actionTargetChoiceCount: agent.actionTargetChoiceCount,
    ...(agent.actionTargetChoices.length > 0 ? { actionTargetChoices: compactAgentActionTargetExecutionRefs(agent.actionTargetChoices) } : {}),
    ...(agent.topFormChoicePath ? { topFormChoicePath: agent.topFormChoicePath } : {}),
    ...(agent.topFormChoiceMethod ? { topFormChoiceMethod: agent.topFormChoiceMethod } : {}),
    ...(agent.topFormChoiceActionUrl ? { topFormChoiceActionUrl: agent.topFormChoiceActionUrl } : {}),
    ...(agent.topFormChoiceSubmitText ? { topFormChoiceSubmitText: agent.topFormChoiceSubmitText } : {}),
    ...(agent.topFormChoiceQueryField ? { topFormChoiceQueryField: agent.topFormChoiceQueryField } : {}),
    ...(agent.topFormChoiceUrlTemplate ? { topFormChoiceUrlTemplate: agent.topFormChoiceUrlTemplate } : {}),
    ...(typeof agent.topFormChoiceFieldCount === "number" ? { topFormChoiceFieldCount: agent.topFormChoiceFieldCount } : {}),
    ...(agent.topFormChoiceSelector ? { topFormChoiceSelector: agent.topFormChoiceSelector } : {}),
    ...(agent.topFormChoiceFirstFieldName ? { topFormChoiceFirstFieldName: agent.topFormChoiceFirstFieldName } : {}),
    ...(agent.topFormChoiceFirstFieldType ? { topFormChoiceFirstFieldType: agent.topFormChoiceFirstFieldType } : {}),
    ...(agent.topFormChoiceFirstFieldLabel ? { topFormChoiceFirstFieldLabel: agent.topFormChoiceFirstFieldLabel } : {}),
    ...(typeof agent.topFormChoiceFirstFieldRequired === "boolean" ? { topFormChoiceFirstFieldRequired: agent.topFormChoiceFirstFieldRequired } : {}),
    ...(agent.topFormChoiceFirstFieldSelector ? { topFormChoiceFirstFieldSelector: agent.topFormChoiceFirstFieldSelector } : {}),
    ...(agent.topActionTargetChoicePath ? { topActionTargetChoicePath: agent.topActionTargetChoicePath } : {}),
    ...(agent.topActionTargetChoiceKind ? { topActionTargetChoiceKind: agent.topActionTargetChoiceKind } : {}),
    ...(agent.topActionTargetChoiceName ? { topActionTargetChoiceName: agent.topActionTargetChoiceName } : {}),
    ...(agent.topActionTargetChoiceSource ? { topActionTargetChoiceSource: agent.topActionTargetChoiceSource } : {}),
    ...(agent.topActionTargetChoiceTargetUrl ? { topActionTargetChoiceTargetUrl: agent.topActionTargetChoiceTargetUrl } : {}),
    ...(agent.topActionTargetChoiceUrlTemplate ? { topActionTargetChoiceUrlTemplate: agent.topActionTargetChoiceUrlTemplate } : {}),
    ...(agent.topActionTargetChoiceQueryInput ? { topActionTargetChoiceQueryInput: agent.topActionTargetChoiceQueryInput } : {}),
    ...(agent.topActionTargetChoiceMethod ? { topActionTargetChoiceMethod: agent.topActionTargetChoiceMethod } : {}),
    ...(typeof agent.topActionTargetChoiceDisabled === "boolean" ? { topActionTargetChoiceDisabled: agent.topActionTargetChoiceDisabled } : {}),
    ...(typeof agent.topActionTargetChoicePressed !== "undefined" ? { topActionTargetChoicePressed: agent.topActionTargetChoicePressed } : {}),
    ...(typeof agent.topActionTargetChoiceExpanded === "boolean" ? { topActionTargetChoiceExpanded: agent.topActionTargetChoiceExpanded } : {}),
    ...(typeof agent.topActionTargetChoiceHaspopup !== "undefined" ? { topActionTargetChoiceHaspopup: agent.topActionTargetChoiceHaspopup } : {}),
    ...(agent.topActionTargetChoiceControls ? { topActionTargetChoiceControls: agent.topActionTargetChoiceControls } : {}),
    ...(agent.topActionTargetChoiceSelector ? { topActionTargetChoiceSelector: agent.topActionTargetChoiceSelector } : {}),
    barrierCount: agent.barrierCount,
    ...(agent.topBarrierKind ? { topBarrierKind: agent.topBarrierKind } : {}),
    ...(agent.topBarrierSeverity ? { topBarrierSeverity: agent.topBarrierSeverity } : {}),
    ...(agent.topBarrierSource ? { topBarrierSource: agent.topBarrierSource } : {}),
    ...(agent.topBarrierPath ? { topBarrierPath: agent.topBarrierPath } : {}),
    ...(agent.topBarrierText ? { topBarrierText: agent.topBarrierText } : {}),
    ...(agent.topBarrierSelector ? { topBarrierSelector: agent.topBarrierSelector } : {}),
    ...(agent.topBarrierDiagnosticCode ? { topBarrierDiagnosticCode: agent.topBarrierDiagnosticCode } : {}),
    dataTableCount: agent.dataTableCount,
    faqCount: agent.faqCount,
    codeBlockCount: agent.codeBlockCount,
    resourceCount: agent.resourceCount,
    mediaCount: agent.mediaCount,
    sectionCount: agent.sectionCount,
    breadcrumbCount: agent.breadcrumbCount,
    paginationCount: agent.paginationCount,
    tocCount: agent.tocCount,
    embedCount: agent.embedCount,
    transcriptCount: agent.transcriptCount,
    authorLinkCount: agent.authorLinkCount,
    provenanceCount: agent.provenanceCount,
    offerCount: agent.offerCount,
    datasetCount: agent.datasetCount,
    identityCount: agent.identityCount,
    timelineCount: agent.timelineCount,
    contactPointCount: agent.contactPointCount,
    ...(agent.topDataTablePath ? { topDataTablePath: agent.topDataTablePath } : {}),
    ...(agent.topDataTableCaption ? { topDataTableCaption: agent.topDataTableCaption } : {}),
    ...(typeof agent.topDataTableRowCount === "number" ? { topDataTableRowCount: agent.topDataTableRowCount } : {}),
    ...(typeof agent.topDataTableColumnCount === "number" ? { topDataTableColumnCount: agent.topDataTableColumnCount } : {}),
    ...(typeof agent.topDataTableHeaderCount === "number" ? { topDataTableHeaderCount: agent.topDataTableHeaderCount } : {}),
    ...(agent.topDataTableFirstHeader ? { topDataTableFirstHeader: agent.topDataTableFirstHeader } : {}),
    ...(agent.topDataTableFirstRow?.length ? { topDataTableFirstRow: agent.topDataTableFirstRow } : {}),
    ...(agent.topDataTableFirstCell ? { topDataTableFirstCell: agent.topDataTableFirstCell } : {}),
    ...(agent.topDataTableSelector ? { topDataTableSelector: agent.topDataTableSelector } : {}),
    ...(agent.topFaqQuestion ? { topFaqQuestion: agent.topFaqQuestion } : {}),
    ...(agent.topFaqAnswer ? { topFaqAnswer: agent.topFaqAnswer } : {}),
    ...(agent.topCodeBlockLanguage ? { topCodeBlockLanguage: agent.topCodeBlockLanguage } : {}),
    ...(typeof agent.topCodeBlockLineCount === "number" ? { topCodeBlockLineCount: agent.topCodeBlockLineCount } : {}),
    ...(agent.topCodeBlockText ? { topCodeBlockText: agent.topCodeBlockText } : {}),
    ...(agent.topResourceKind ? { topResourceKind: agent.topResourceKind } : {}),
    ...(agent.topResourceUrl ? { topResourceUrl: agent.topResourceUrl } : {}),
    ...(agent.topResourceTitle ? { topResourceTitle: agent.topResourceTitle } : {}),
    ...(agent.topMediaKind ? { topMediaKind: agent.topMediaKind } : {}),
    ...(agent.topMediaUrl ? { topMediaUrl: agent.topMediaUrl } : {}),
    ...(agent.topMediaText ? { topMediaText: agent.topMediaText } : {}),
    ...(agent.topSectionPath ? { topSectionPath: agent.topSectionPath } : {}),
    ...(agent.topSectionHeading ? { topSectionHeading: agent.topSectionHeading } : {}),
    ...(typeof agent.topSectionLevel === "number" ? { topSectionLevel: agent.topSectionLevel } : {}),
    ...(agent.topSectionText ? { topSectionText: agent.topSectionText } : {}),
    ...(agent.topSectionSelector ? { topSectionSelector: agent.topSectionSelector } : {}),
    ...(agent.topBreadcrumbPath ? { topBreadcrumbPath: agent.topBreadcrumbPath } : {}),
    ...(agent.topBreadcrumbText ? { topBreadcrumbText: agent.topBreadcrumbText } : {}),
    ...(agent.topBreadcrumbSource ? { topBreadcrumbSource: agent.topBreadcrumbSource } : {}),
    ...(agent.topPaginationPath ? { topPaginationPath: agent.topPaginationPath } : {}),
    ...(agent.topPaginationKind ? { topPaginationKind: agent.topPaginationKind } : {}),
    ...(agent.topPaginationLabel ? { topPaginationLabel: agent.topPaginationLabel } : {}),
    ...(agent.topPaginationUrl ? { topPaginationUrl: agent.topPaginationUrl } : {}),
    ...(typeof agent.topPaginationCurrent === "boolean" ? { topPaginationCurrent: agent.topPaginationCurrent } : {}),
    ...(agent.topPaginationSelector ? { topPaginationSelector: agent.topPaginationSelector } : {}),
    ...(agent.topTocPath ? { topTocPath: agent.topTocPath } : {}),
    ...(agent.topTocTitle ? { topTocTitle: agent.topTocTitle } : {}),
    ...(typeof agent.topTocItemCount === "number" ? { topTocItemCount: agent.topTocItemCount } : {}),
    ...(agent.topTocText ? { topTocText: agent.topTocText } : {}),
    ...(agent.topTocFirstItemLabel ? { topTocFirstItemLabel: agent.topTocFirstItemLabel } : {}),
    ...(agent.topTocFirstItemUrl ? { topTocFirstItemUrl: agent.topTocFirstItemUrl } : {}),
    ...(agent.topTocSelector ? { topTocSelector: agent.topTocSelector } : {}),
    ...(agent.topEmbedKind ? { topEmbedKind: agent.topEmbedKind } : {}),
    ...(agent.topEmbedUrl ? { topEmbedUrl: agent.topEmbedUrl } : {}),
    ...(agent.topEmbedTitle ? { topEmbedTitle: agent.topEmbedTitle } : {}),
    ...(agent.topTranscriptKind ? { topTranscriptKind: agent.topTranscriptKind } : {}),
    ...(agent.topTranscriptUrl ? { topTranscriptUrl: agent.topTranscriptUrl } : {}),
    ...(agent.topTranscriptLabel ? { topTranscriptLabel: agent.topTranscriptLabel } : {}),
    ...(agent.topTranscriptLanguage ? { topTranscriptLanguage: agent.topTranscriptLanguage } : {}),
    ...(agent.topAuthorLinkName ? { topAuthorLinkName: agent.topAuthorLinkName } : {}),
    ...(agent.topAuthorLinkUrl ? { topAuthorLinkUrl: agent.topAuthorLinkUrl } : {}),
    ...(agent.topAuthorLinkSource ? { topAuthorLinkSource: agent.topAuthorLinkSource } : {}),
    ...(agent.topProvenancePath ? { topProvenancePath: agent.topProvenancePath } : {}),
    ...(agent.topProvenanceKind ? { topProvenanceKind: agent.topProvenanceKind } : {}),
    ...(agent.topProvenanceLabel ? { topProvenanceLabel: agent.topProvenanceLabel } : {}),
    ...(agent.topProvenanceValue ? { topProvenanceValue: agent.topProvenanceValue } : {}),
    ...(agent.topProvenanceUrl ? { topProvenanceUrl: agent.topProvenanceUrl } : {}),
    ...(agent.topProvenanceSource ? { topProvenanceSource: agent.topProvenanceSource } : {}),
    ...(agent.topProvenanceSelector ? { topProvenanceSelector: agent.topProvenanceSelector } : {}),
    ...(agent.topOfferPath ? { topOfferPath: agent.topOfferPath } : {}),
    ...(agent.topOfferName ? { topOfferName: agent.topOfferName } : {}),
    ...(agent.topOfferPrice ? { topOfferPrice: agent.topOfferPrice } : {}),
    ...(agent.topOfferCurrency ? { topOfferCurrency: agent.topOfferCurrency } : {}),
    ...(agent.topOfferAvailability ? { topOfferAvailability: agent.topOfferAvailability } : {}),
    ...(agent.topOfferUrl ? { topOfferUrl: agent.topOfferUrl } : {}),
    ...(agent.topOfferSelector ? { topOfferSelector: agent.topOfferSelector } : {}),
    ...(agent.topDatasetPath ? { topDatasetPath: agent.topDatasetPath } : {}),
    ...(agent.topDatasetKind ? { topDatasetKind: agent.topDatasetKind } : {}),
    ...(agent.topDatasetName ? { topDatasetName: agent.topDatasetName } : {}),
    ...(agent.topDatasetUrl ? { topDatasetUrl: agent.topDatasetUrl } : {}),
    ...(agent.topDatasetDistributionUrl ? { topDatasetDistributionUrl: agent.topDatasetDistributionUrl } : {}),
    ...(agent.topDatasetLicenseUrl ? { topDatasetLicenseUrl: agent.topDatasetLicenseUrl } : {}),
    ...(agent.topDatasetEncodingFormat ? { topDatasetEncodingFormat: agent.topDatasetEncodingFormat } : {}),
    ...(agent.topDatasetSelector ? { topDatasetSelector: agent.topDatasetSelector } : {}),
    ...(agent.topIdentityPath ? { topIdentityPath: agent.topIdentityPath } : {}),
    ...(agent.topIdentityKind ? { topIdentityKind: agent.topIdentityKind } : {}),
    ...(agent.topIdentityName ? { topIdentityName: agent.topIdentityName } : {}),
    ...(agent.topIdentityUrl ? { topIdentityUrl: agent.topIdentityUrl } : {}),
    ...(agent.topIdentityLogoUrl ? { topIdentityLogoUrl: agent.topIdentityLogoUrl } : {}),
    ...(agent.topIdentitySameAsUrl ? { topIdentitySameAsUrl: agent.topIdentitySameAsUrl } : {}),
    ...(agent.topIdentitySource ? { topIdentitySource: agent.topIdentitySource } : {}),
    ...(agent.topIdentitySelector ? { topIdentitySelector: agent.topIdentitySelector } : {}),
    ...(agent.topTimelinePath ? { topTimelinePath: agent.topTimelinePath } : {}),
    ...(agent.topTimelineKind ? { topTimelineKind: agent.topTimelineKind } : {}),
    ...(agent.topTimelineLabel ? { topTimelineLabel: agent.topTimelineLabel } : {}),
    ...(agent.topTimelineValue ? { topTimelineValue: agent.topTimelineValue } : {}),
    ...(agent.topTimelineSource ? { topTimelineSource: agent.topTimelineSource } : {}),
    ...(agent.topTimelineSelector ? { topTimelineSelector: agent.topTimelineSelector } : {}),
    ...(agent.topContactPointPath ? { topContactPointPath: agent.topContactPointPath } : {}),
    ...(agent.topContactPointKind ? { topContactPointKind: agent.topContactPointKind } : {}),
    ...(agent.topContactPointLabel ? { topContactPointLabel: agent.topContactPointLabel } : {}),
    ...(agent.topContactPointValue ? { topContactPointValue: agent.topContactPointValue } : {}),
    ...(agent.topContactPointUrl ? { topContactPointUrl: agent.topContactPointUrl } : {}),
    ...(agent.topContactPointSource ? { topContactPointSource: agent.topContactPointSource } : {}),
    ...(agent.topContactPointSelector ? { topContactPointSelector: agent.topContactPointSelector } : {}),
    structuredReadTargetCount: agent.structuredReadTargetCount,
    ...(agent.bestStructuredReadTarget ? { bestStructuredReadTarget: agent.bestStructuredReadTarget } : {}),
    ...(typeof agent.bestStructuredReadTargetCount === "number" ? { bestStructuredReadTargetCount: agent.bestStructuredReadTargetCount } : {}),
    ...(typeof agent.bestStructuredReadTargetScore === "number" ? { bestStructuredReadTargetScore: agent.bestStructuredReadTargetScore } : {}),
    ...(typeof agent.bestStructuredReadTargetPrimary === "boolean" ? { bestStructuredReadTargetPrimary: agent.bestStructuredReadTargetPrimary } : {}),
    ...(agent.bestStructuredReadTargetReason ? { bestStructuredReadTargetReason: agent.bestStructuredReadTargetReason } : {}),
    hiddenSignalCount: agent.hiddenSignalCount,
    hiddenHydrationCount: agent.hiddenHydrationCount,
    hiddenApiEndpointCount: agent.hiddenApiEndpointCount,
    hiddenClientStateCount: agent.hiddenClientStateCount,
    hiddenAppHintCount: agent.hiddenAppHintCount,
    ...(agent.topHydrationPath ? { topHydrationPath: agent.topHydrationPath } : {}),
    ...(agent.topHydrationKind ? { topHydrationKind: agent.topHydrationKind } : {}),
    ...(agent.topHydrationLabel ? { topHydrationLabel: agent.topHydrationLabel } : {}),
    ...(agent.topHydrationUrl ? { topHydrationUrl: agent.topHydrationUrl } : {}),
    ...(agent.topHydrationSelector ? { topHydrationSelector: agent.topHydrationSelector } : {}),
    ...(agent.topApiEndpointPath ? { topApiEndpointPath: agent.topApiEndpointPath } : {}),
    ...(agent.topApiEndpointKind ? { topApiEndpointKind: agent.topApiEndpointKind } : {}),
    ...(agent.topApiEndpointMethod ? { topApiEndpointMethod: agent.topApiEndpointMethod } : {}),
    ...(agent.topApiEndpointUrl ? { topApiEndpointUrl: agent.topApiEndpointUrl } : {}),
    ...(agent.topApiEndpointSelector ? { topApiEndpointSelector: agent.topApiEndpointSelector } : {}),
    ...(agent.topClientStatePath ? { topClientStatePath: agent.topClientStatePath } : {}),
    ...(agent.topClientStateKind ? { topClientStateKind: agent.topClientStateKind } : {}),
    ...(agent.topClientStateOperation ? { topClientStateOperation: agent.topClientStateOperation } : {}),
    ...(agent.topClientStateKey ? { topClientStateKey: agent.topClientStateKey } : {}),
    ...(agent.topClientStateSelector ? { topClientStateSelector: agent.topClientStateSelector } : {}),
    ...(agent.topAppHintPath ? { topAppHintPath: agent.topAppHintPath } : {}),
    ...(agent.topAppHintKind ? { topAppHintKind: agent.topAppHintKind } : {}),
    ...(agent.topAppHintLabel ? { topAppHintLabel: agent.topAppHintLabel } : {}),
    ...(agent.topAppHintUrl ? { topAppHintUrl: agent.topAppHintUrl } : {}),
    ...(agent.topAppHintSelector ? { topAppHintSelector: agent.topAppHintSelector } : {}),
    ...(agent.topHiddenSignalGroup ? { topHiddenSignalGroup: agent.topHiddenSignalGroup } : {}),
    ...(agent.topHiddenSignalPath ? { topHiddenSignalPath: agent.topHiddenSignalPath } : {}),
    ...(agent.topHiddenSignalKind ? { topHiddenSignalKind: agent.topHiddenSignalKind } : {}),
    ...(agent.topHiddenSignalText ? { topHiddenSignalText: agent.topHiddenSignalText } : {}),
    ...(agent.topHiddenSignalUrl ? { topHiddenSignalUrl: agent.topHiddenSignalUrl } : {}),
    ...(agent.topHiddenSignalSource ? { topHiddenSignalSource: agent.topHiddenSignalSource } : {}),
    ...(agent.topHiddenSignalSelector ? { topHiddenSignalSelector: agent.topHiddenSignalSelector } : {}),
    hiddenReadTargetCount: agent.hiddenReadTargetCount,
    ...(agent.bestHiddenReadTarget ? { bestHiddenReadTarget: agent.bestHiddenReadTarget } : {}),
    ...(typeof agent.bestHiddenReadTargetCount === "number" ? { bestHiddenReadTargetCount: agent.bestHiddenReadTargetCount } : {}),
    ...(typeof agent.bestHiddenReadTargetScore === "number" ? { bestHiddenReadTargetScore: agent.bestHiddenReadTargetScore } : {}),
    ...(typeof agent.bestHiddenReadTargetPrimary === "boolean" ? { bestHiddenReadTargetPrimary: agent.bestHiddenReadTargetPrimary } : {}),
    ...(agent.bestHiddenReadTargetReason ? { bestHiddenReadTargetReason: agent.bestHiddenReadTargetReason } : {}),
    sourceLinkCount: agent.sourceLinkCount,
    sourceChoiceCount: agent.sourceChoiceCount,
    ...(agent.sourceChoices.length > 0 ? { sourceChoices: compactAgentSourceChoiceList(agent.sourceChoices) } : {}),
    ...(agent.topSourceChoicePath ? { topSourceChoicePath: agent.topSourceChoicePath } : {}),
    ...(agent.topSourceChoiceTitle ? { topSourceChoiceTitle: agent.topSourceChoiceTitle } : {}),
    ...(agent.topSourceChoiceUrl ? { topSourceChoiceUrl: agent.topSourceChoiceUrl } : {}),
    ...(agent.topSourceChoiceHost ? { topSourceChoiceHost: agent.topSourceChoiceHost } : {}),
    ...(agent.topSourceChoiceSnippet ? { topSourceChoiceSnippet: agent.topSourceChoiceSnippet } : {}),
    ...(agent.topSourceChoiceCommandArgs ? { topSourceChoiceCommandArgs: agent.topSourceChoiceCommandArgs } : {}),
    ...(agent.topSourceChoiceSourceType ? { topSourceChoiceSourceType: agent.topSourceChoiceSourceType } : {}),
    ...(typeof agent.topSourceChoiceSourceScore === "number" ? { topSourceChoiceSourceScore: agent.topSourceChoiceSourceScore } : {}),
    ...(agent.topSourceChoiceSourceHints?.length ? { topSourceChoiceSourceHints: agent.topSourceChoiceSourceHints } : {}),
    ...(typeof agent.topSourceChoicePrimary === "boolean" ? { topSourceChoicePrimary: agent.topSourceChoicePrimary } : {}),
    ...(agent.topSourceChoiceReason ? { topSourceChoiceReason: agent.topSourceChoiceReason } : {}),
    ...compactAgentTopChoice(agent, searchCommandContext, pageLinkContext),
    ...(agent.sourceSearchQuery ? { sourceSearchQuery: agent.sourceSearchQuery } : {}),
    ...(agent.sourceSearchEngine ? { sourceSearchEngine: agent.sourceSearchEngine } : {}),
    ...(agent.sourceSearchSelectedEngine ? { sourceSearchSelectedEngine: agent.sourceSearchSelectedEngine } : {}),
    ...(agent.sourceSearchSearchUrl ? { sourceSearchSearchUrl: agent.sourceSearchSearchUrl } : {}),
    ...(agent.sourceSearchLang ? { sourceSearchLang: agent.sourceSearchLang } : {}),
    ...(agent.sourceSearchRegion ? { sourceSearchRegion: agent.sourceSearchRegion } : {}),
    ...(typeof agent.sourceSearchFindQueryCount === "number" ? { sourceSearchFindQueryCount: agent.sourceSearchFindQueryCount } : {}),
    ...(agent.sourceSearchTopFindQuery ? { sourceSearchTopFindQuery: agent.sourceSearchTopFindQuery } : {}),
    ...(typeof agent.sourceSearchSelectedRank === "number" ? { sourceSearchSelectedRank: agent.sourceSearchSelectedRank } : {}),
    ...(agent.sourceSearchSelectedTitle ? { sourceSearchSelectedTitle: agent.sourceSearchSelectedTitle } : {}),
    ...(agent.sourceSearchSelectedUrl ? { sourceSearchSelectedUrl: agent.sourceSearchSelectedUrl } : {}),
    ...(agent.sourceSearchSelectedHost ? { sourceSearchSelectedHost: agent.sourceSearchSelectedHost } : {}),
    ...(agent.sourceSearchSelectedPath ? { sourceSearchSelectedPath: agent.sourceSearchSelectedPath } : {}),
    ...(agent.sourceSearchSelectedOpenResult ? { sourceSearchSelectedOpenResult: agent.sourceSearchSelectedOpenResult } : {}),
    ...(agent.sourceSearchSelectedCommandArgs ? { sourceSearchSelectedCommandArgs: agent.sourceSearchSelectedCommandArgs } : {}),
    ...(agent.sourceSearchSelectedReason ? { sourceSearchSelectedReason: agent.sourceSearchSelectedReason } : {}),
    ...(agent.sourceSearchFailureCode ? { sourceSearchFailureCode: agent.sourceSearchFailureCode } : {}),
    ...(typeof agent.sourceSearchFailureStatus === "number" ? { sourceSearchFailureStatus: agent.sourceSearchFailureStatus } : {}),
    ...(agent.sourceSearchFailureUrl ? { sourceSearchFailureUrl: agent.sourceSearchFailureUrl } : {}),
    ...(agent.sourceSearchFailureReason ? { sourceSearchFailureReason: agent.sourceSearchFailureReason } : {}),
    sourceSearchAlternateCount: agent.sourceSearchAlternateCount,
    ...(agent.sourceSearchAlternatePath ? { sourceSearchAlternatePath: agent.sourceSearchAlternatePath } : {}),
    ...(agent.sourceSearchAlternateTitle ? { sourceSearchAlternateTitle: agent.sourceSearchAlternateTitle } : {}),
    ...(agent.sourceSearchAlternateUrl ? { sourceSearchAlternateUrl: agent.sourceSearchAlternateUrl } : {}),
    ...(agent.sourceSearchAlternateHost ? { sourceSearchAlternateHost: agent.sourceSearchAlternateHost } : {}),
    ...(typeof agent.sourceSearchAlternateRank === "number" ? { sourceSearchAlternateRank: agent.sourceSearchAlternateRank } : {}),
    ...(agent.sourceSearchAlternateOpenResult ? { sourceSearchAlternateOpenResult: agent.sourceSearchAlternateOpenResult } : {}),
    ...(agent.sourceSearchAlternateCommandArgs ? { sourceSearchAlternateCommandArgs: agent.sourceSearchAlternateCommandArgs } : {}),
    ...(agent.sourceSearchAlternateReason ? { sourceSearchAlternateReason: agent.sourceSearchAlternateReason } : {}),
    alternativeActionCount: agent.alternativeActionCount,
    evidenceQualityScore: agent.evidenceQualityScore,
    sourceQualityScore: agent.sourceQualityScore,
    ...(agent.diagnosticCodes.length > 0 ? { diagnosticCodes: agent.diagnosticCodes } : {}),
    diagnosticErrorCount: agent.diagnosticErrorCount,
    diagnosticWarningCount: agent.diagnosticWarningCount,
    diagnosticInfoCount: agent.diagnosticInfoCount,
    ...(agent.topDiagnosticCode ? { topDiagnosticCode: agent.topDiagnosticCode } : {}),
    ...(agent.topDiagnosticSeverity ? { topDiagnosticSeverity: agent.topDiagnosticSeverity } : {}),
    ...(agent.topDiagnosticMessage ? { topDiagnosticMessage: agent.topDiagnosticMessage } : {}),
    citationCount: agent.citationCount,
    ...(agent.citations.length > 0 ? { citations: compactAgentCitationList(agent.citations) } : {}),
    ...(agent.topCitationId ? { topCitationId: agent.topCitationId } : {}),
    ...(agent.topCitationPath ? { topCitationPath: agent.topCitationPath } : {}),
    ...(agent.topCitationKind ? { topCitationKind: agent.topCitationKind } : {}),
    ...(agent.topCitationText ? { topCitationText: agent.topCitationText } : {}),
    ...(agent.topCitationTitle ? { topCitationTitle: agent.topCitationTitle } : {}),
    ...(agent.topCitationUrl ? { topCitationUrl: agent.topCitationUrl } : {}),
    ...(agent.topCitationConfidence ? { topCitationConfidence: agent.topCitationConfidence } : {}),
    ...(agent.topCitationReason ? { topCitationReason: agent.topCitationReason } : {}),
    ...(typeof agent.topCitationScore === "number" ? { topCitationScore: agent.topCitationScore } : {}),
    answerEvidenceCount: agent.answerEvidenceCount,
    ...(agent.answerEvidence.length > 0 ? { answerEvidence: compactAgentCitationList(agent.answerEvidence, 650) } : {}),
    ...(agent.topAnswerEvidenceId ? { topAnswerEvidenceId: agent.topAnswerEvidenceId } : {}),
    ...(agent.topAnswerEvidencePath ? { topAnswerEvidencePath: agent.topAnswerEvidencePath } : {}),
    ...(agent.topAnswerEvidenceKind ? { topAnswerEvidenceKind: agent.topAnswerEvidenceKind } : {}),
    ...(agent.topAnswerEvidenceText ? { topAnswerEvidenceText: agent.topAnswerEvidenceText } : {}),
    ...(agent.topAnswerEvidenceTitle ? { topAnswerEvidenceTitle: agent.topAnswerEvidenceTitle } : {}),
    ...(agent.topAnswerEvidenceUrl ? { topAnswerEvidenceUrl: agent.topAnswerEvidenceUrl } : {}),
    ...(agent.topAnswerEvidenceConfidence ? { topAnswerEvidenceConfidence: agent.topAnswerEvidenceConfidence } : {}),
    ...(agent.topAnswerEvidenceReason ? { topAnswerEvidenceReason: agent.topAnswerEvidenceReason } : {}),
    ...(agent.answerPlanStatus ? { answerPlanStatus: agent.answerPlanStatus } : {}),
    ...(agent.answerPlanConfidence ? { answerPlanConfidence: agent.answerPlanConfidence } : {}),
    ...(agent.answerPlanReason ? { answerPlanReason: agent.answerPlanReason } : {}),
    ...(agent.answerPlanNextAction ? { answerPlanNextAction: agent.answerPlanNextAction } : {}),
    ...(typeof agent.answerGapCount === "number" ? { answerGapCount: agent.answerGapCount } : {}),
    ...(typeof agent.answerUseCitationCount === "number" ? { answerUseCitationCount: agent.answerUseCitationCount } : {}),
    ...(agent.topAnswerUseCitationId ? { topAnswerUseCitationId: agent.topAnswerUseCitationId } : {}),
    ...(agent.answerUseCitationIds && agent.answerUseCitationIds.length > 0 ? { answerUseCitationIds: agent.answerUseCitationIds } : {}),
    ...(agent.answerPlanReadFrom ? { answerPlanReadFrom: agent.answerPlanReadFrom } : {}),
    ...(agent.answerPlanCommandArgs ? { answerPlanCommandArgs: agent.answerPlanCommandArgs } : {}),
    ...(agent.answerPlanAfterInteractionCommand ? { answerPlanAfterInteractionCommand: agent.answerPlanAfterInteractionCommand } : {}),
    ...(agent.answerPlanAfterInteractionCommandArgs ? { answerPlanAfterInteractionCommandArgs: agent.answerPlanAfterInteractionCommandArgs } : {}),
    ...(agent.answerPlanUrl ? { answerPlanUrl: agent.answerPlanUrl } : {}),
    readTargetCount: agent.readTargetCount,
    ...(agent.readTargets.length > 0 ? { readTargets: compactAgentReadTargets(agent.readTargets) } : {}),
    ...(agent.topReadTarget ? { topReadTarget: agent.topReadTarget } : {}),
    ...(typeof agent.topReadTargetCount === "number" ? { topReadTargetCount: agent.topReadTargetCount } : {}),
    ...(typeof agent.topReadTargetScore === "number" ? { topReadTargetScore: agent.topReadTargetScore } : {}),
    ...(typeof agent.topReadTargetPrimary === "boolean" ? { topReadTargetPrimary: agent.topReadTargetPrimary } : {}),
    ...(agent.topReadTargetReason ? { topReadTargetReason: agent.topReadTargetReason } : {}),
    actionCount: agent.actionCount,
    ...(agent.topActionName ? { topActionName: agent.topActionName } : {}),
    ...(agent.topActionSource ? { topActionSource: agent.topActionSource } : {}),
    ...(agent.topActionExecution ? { topActionExecution: agent.topActionExecution } : {}),
    ...(agent.topActionPriority ? { topActionPriority: agent.topActionPriority } : {}),
    ...(agent.topActionReason ? { topActionReason: agent.topActionReason } : {}),
    ...(agent.topActionReadFrom ? { topActionReadFrom: agent.topActionReadFrom } : {}),
    ...(agent.topActionCommandArgs ? { topActionCommandArgs: agent.topActionCommandArgs } : {}),
    ...(agent.topActionUrl ? { topActionUrl: agent.topActionUrl } : {}),
    ...(agent.topActionSourceLinkRef ? { topActionSourceLinkRef: agent.topActionSourceLinkRef } : {}),
    ...(agent.topActionRequiresBrowserInteraction ? { topActionRequiresBrowserInteraction: true } : {}),
    ...(agent.alternativeActionName ? { alternativeActionName: agent.alternativeActionName } : {}),
    ...(agent.alternativeActionSource ? { alternativeActionSource: agent.alternativeActionSource } : {}),
    ...(agent.alternativeActionExecution ? { alternativeActionExecution: agent.alternativeActionExecution } : {}),
    ...(agent.alternativeActionPriority ? { alternativeActionPriority: agent.alternativeActionPriority } : {}),
    ...(agent.alternativeActionReason ? { alternativeActionReason: agent.alternativeActionReason } : {}),
    ...(agent.alternativeActionReadFrom ? { alternativeActionReadFrom: agent.alternativeActionReadFrom } : {}),
    ...(agent.alternativeActionCommandArgs ? { alternativeActionCommandArgs: agent.alternativeActionCommandArgs } : {}),
    ...(agent.alternativeActionUrl ? { alternativeActionUrl: agent.alternativeActionUrl } : {}),
    ...(agent.alternativeActionSourceLinkRef ? { alternativeActionSourceLinkRef: agent.alternativeActionSourceLinkRef } : {}),
    ...(agent.alternativeActionRequiresBrowserInteraction ? { alternativeActionRequiresBrowserInteraction: true } : {}),
    ...(agent.bestReadTarget ? { bestReadTarget: agent.bestReadTarget } : {}),
    ...(typeof agent.bestReadTargetCount === "number" ? { bestReadTargetCount: agent.bestReadTargetCount } : {}),
    ...(typeof agent.bestReadTargetScore === "number" ? { bestReadTargetScore: agent.bestReadTargetScore } : {}),
    ...(typeof agent.bestReadTargetPrimary === "boolean" ? { bestReadTargetPrimary: agent.bestReadTargetPrimary } : {}),
    ...(agent.bestReadTargetReason ? { bestReadTargetReason: agent.bestReadTargetReason } : {}),
    ...(agent.executorDecision ? { executorDecision: agent.executorDecision } : {}),
    ...(agent.executorMode ? { executorMode: agent.executorMode } : {}),
    ...(agent.executorActionName ? { executorActionName: agent.executorActionName } : {}),
    ...(agent.executorOperation ? { executorOperation: agent.executorOperation } : {}),
    ...(agent.executorConfidence ? { executorConfidence: agent.executorConfidence } : {}),
    ...(typeof agent.executorAnswerReady === "boolean" ? { executorAnswerReady: agent.executorAnswerReady } : {}),
    ...(typeof agent.executorShouldContinue === "boolean" ? { executorShouldContinue: agent.executorShouldContinue } : {}),
    ...(typeof agent.executorTerminal === "boolean" ? { executorTerminal: agent.executorTerminal } : {}),
    ...(agent.executorCommandArgs ? { executorCommandArgs: agent.executorCommandArgs } : {}),
    ...(agent.executorReadFrom ? { executorReadFrom: agent.executorReadFrom } : {}),
    ...(agent.executorUrl ? { executorUrl: agent.executorUrl } : {}),
    ...(agent.executorTargetUrl ? { executorTargetUrl: agent.executorTargetUrl } : {}),
    ...(agent.executorTargetPath ? { executorTargetPath: agent.executorTargetPath } : {}),
    ...(agent.executorTargetSelector ? { executorTargetSelector: agent.executorTargetSelector } : {}),
    ...(agent.executorTargetText ? { executorTargetText: agent.executorTargetText } : {}),
    ...(agent.executorExpectedOutcome ? { executorExpectedOutcome: agent.executorExpectedOutcome } : {}),
    ...(agent.handoffDecision ? { handoffDecision: agent.handoffDecision } : {}),
    ...(agent.handoffMode ? { handoffMode: agent.handoffMode } : {}),
    ...(agent.handoffActionName ? { handoffActionName: agent.handoffActionName } : {}),
    ...(agent.handoffOperation ? { handoffOperation: agent.handoffOperation } : {}),
    ...(agent.handoffAnswerStatus ? { handoffAnswerStatus: agent.handoffAnswerStatus } : {}),
    ...(agent.handoffConfidence ? { handoffConfidence: agent.handoffConfidence } : {}),
    ...(typeof agent.handoffAnswerReady === "boolean" ? { handoffAnswerReady: agent.handoffAnswerReady } : {}),
    ...(typeof agent.handoffShouldContinue === "boolean" ? { handoffShouldContinue: agent.handoffShouldContinue } : {}),
    ...(typeof agent.handoffTerminal === "boolean" ? { handoffTerminal: agent.handoffTerminal } : {}),
    ...(agent.handoffPriority ? { handoffPriority: agent.handoffPriority } : {}),
    ...(agent.handoffPriorityReason ? { handoffPriorityReason: agent.handoffPriorityReason } : {}),
    ...(agent.handoffCommandArgs ? { handoffCommandArgs: agent.handoffCommandArgs } : {}),
    ...(agent.handoffReadFrom ? { handoffReadFrom: agent.handoffReadFrom } : {}),
    ...(agent.handoffUrl ? { handoffUrl: agent.handoffUrl } : {}),
    ...(agent.handoffTargetUrl ? { handoffTargetUrl: agent.handoffTargetUrl } : {}),
    ...(agent.handoffTargetPath ? { handoffTargetPath: agent.handoffTargetPath } : {}),
    ...(agent.handoffTargetSelector ? { handoffTargetSelector: agent.handoffTargetSelector } : {}),
    ...(agent.handoffTargetText ? { handoffTargetText: agent.handoffTargetText } : {}),
    ...(agent.handoffExpectedOutcome ? { handoffExpectedOutcome: agent.handoffExpectedOutcome } : {}),
    ...(agent.primaryActionName ? { primaryActionName: agent.primaryActionName } : {}),
    ...(agent.primaryReason ? { primaryReason: agent.primaryReason } : {}),
    ...(agent.primaryPriority ? { primaryPriority: agent.primaryPriority } : {}),
    ...(agent.primaryPriorityReason ? { primaryPriorityReason: agent.primaryPriorityReason } : {}),
    ...(agent.primaryExecution ? { primaryExecution: agent.primaryExecution } : {}),
    ...(agent.primaryReadFrom ? { primaryReadFrom: agent.primaryReadFrom } : {}),
    ...(agent.primaryCommand ? { primaryCommand: agent.primaryCommand } : {}),
    ...(agent.primaryCommandArgs ? { primaryCommandArgs: agent.primaryCommandArgs } : {}),
    ...(agent.primaryAfterInteractionCommand ? { primaryAfterInteractionCommand: agent.primaryAfterInteractionCommand } : {}),
    ...(agent.primaryAfterInteractionCommandArgs ? { primaryAfterInteractionCommandArgs: agent.primaryAfterInteractionCommandArgs } : {}),
    ...(agent.primaryUrl ? { primaryUrl: agent.primaryUrl } : {}),
    ...(agent.primarySourceLinkRef ? { primarySourceLinkRef: agent.primarySourceLinkRef } : {}),
    ...(agent.primaryRank ? { primaryRank: agent.primaryRank } : {}),
    ...(agent.primaryOpenResult ? { primaryOpenResult: agent.primaryOpenResult } : {}),
    ...(agent.requiresBrowserInteraction ? { requiresBrowserInteraction: true } : {}),
    ...(agent.primaryAction ? { primaryAction: compactAgentAction(agent.primaryAction) } : {}),
    ...(agent.actions.length > 0 ? { actions: compactAgentActionList(agent.actions.map((action) => compactAgentActionSummary(action, agent.primaryAction, agent.primaryUrl))) } : {}),
    ...compactAgentRecommended(agent, searchCommandContext, pageLinkContext),
  };
}

function compactAgentBrief(agent: AgentSummary, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  return {
    contract: {
      version: agent.contract.version,
      compact: true,
      profile: "brief",
      featureCount: agent.contract.features.length,
    },
    status: agent.status,
    pageKind: agent.pageKind,
    ...(agent.pageTitle ? { pageTitle: agent.pageTitle } : {}),
    ...(agent.pageCanonicalUrl ? { pageCanonicalUrl: agent.pageCanonicalUrl } : {}),
    ...(agent.pageLang ? { pageLang: agent.pageLang } : {}),
    ...(agent.pageDir ? { pageDir: agent.pageDir } : {}),
    ...(agent.pageSiteName ? { pageSiteName: agent.pageSiteName } : {}),
    ...(agent.pageAuthor ? { pageAuthor: agent.pageAuthor } : {}),
    ...(agent.pagePublishedTime ? { pagePublishedTime: agent.pagePublishedTime } : {}),
    ...(agent.pageModifiedTime ? { pageModifiedTime: agent.pageModifiedTime } : {}),
    ...(agent.pageStructuredDataTypes?.length ? { pageStructuredDataTypes: agent.pageStructuredDataTypes } : {}),
    summary: agent.summary,
    ...(agent.runbookDecision ? { runbookDecision: agent.runbookDecision } : {}),
    ...(agent.runbookMode ? { runbookMode: agent.runbookMode } : {}),
    ...(agent.runbookOperation ? { runbookOperation: agent.runbookOperation } : {}),
    ...(agent.runbookActionName ? { runbookActionName: agent.runbookActionName } : {}),
    ...(agent.runbookConfidence ? { runbookConfidence: agent.runbookConfidence } : {}),
    ...(agent.runbookAnswerStatus ? { runbookAnswerStatus: agent.runbookAnswerStatus } : {}),
    ...(typeof agent.runbookAnswerReady === "boolean" ? { runbookAnswerReady: agent.runbookAnswerReady } : {}),
    ...(typeof agent.runbookShouldContinue === "boolean" ? { runbookShouldContinue: agent.runbookShouldContinue } : {}),
    ...(typeof agent.runbookTerminal === "boolean" ? { runbookTerminal: agent.runbookTerminal } : {}),
    ...(typeof agent.runbookMaxSuggestedIterations === "number" ? { runbookMaxSuggestedIterations: agent.runbookMaxSuggestedIterations } : {}),
    ...(agent.runbookExpectedOutcome ? { runbookExpectedOutcome: agent.runbookExpectedOutcome } : {}),
    ...(agent.runbookReadFrom ? { runbookReadFrom: agent.runbookReadFrom } : {}),
    ...(agent.runbookCommandArgs ? { runbookCommandArgs: agent.runbookCommandArgs } : {}),
    ...(agent.runbookUrl ? { runbookUrl: agent.runbookUrl } : {}),
    ...(agent.nextActionName ? { nextActionName: agent.nextActionName } : {}),
    ...(agent.nextExecution ? { nextExecution: agent.nextExecution } : {}),
    ...(agent.nextCommand ? { nextCommand: agent.nextCommand } : {}),
    ...(agent.nextCommandArgs ? { nextCommandArgs: agent.nextCommandArgs } : {}),
    ...(agent.nextAfterInteractionCommand ? { nextAfterInteractionCommand: agent.nextAfterInteractionCommand } : {}),
    ...(agent.nextAfterInteractionCommandArgs ? { nextAfterInteractionCommandArgs: agent.nextAfterInteractionCommandArgs } : {}),
    ...(agent.nextReadFrom ? { nextReadFrom: agent.nextReadFrom } : {}),
    ...(agent.nextUrl ? { nextUrl: agent.nextUrl } : {}),
    executor: compactAgentExecutor(agent.executor, agent.primaryUrl),
    handoff: compactAgentBriefHandoff(agent.handoff, agent.primaryUrl, searchCommandContext, pageLinkContext),
    ...(agent.expectedOutcomeKind ? { expectedOutcomeKind: agent.expectedOutcomeKind } : {}),
    ...(agent.expectedOutcomeMessage ? { expectedOutcomeMessage: agent.expectedOutcomeMessage } : {}),
    ...(agent.executionPlanOperation ? { executionPlanOperation: agent.executionPlanOperation } : {}),
    ...(agent.executionPlanConfidence ? { executionPlanConfidence: agent.executionPlanConfidence } : {}),
    ...(typeof agent.executionPlanAnswerReady === "boolean" ? { executionPlanAnswerReady: agent.executionPlanAnswerReady } : {}),
    ...(typeof agent.executionPlanShouldContinue === "boolean" ? { executionPlanShouldContinue: agent.executionPlanShouldContinue } : {}),
    ...(typeof agent.executionPlanTerminal === "boolean" ? { executionPlanTerminal: agent.executionPlanTerminal } : {}),
    ...(agent.executionPlanExpectedOutcome ? { executionPlanExpectedOutcome: agent.executionPlanExpectedOutcome } : {}),
    ...(agent.executionPlanReadFrom ? { executionPlanReadFrom: agent.executionPlanReadFrom } : {}),
    ...(agent.executionPlanCommandArgs ? { executionPlanCommandArgs: agent.executionPlanCommandArgs } : {}),
    ...(agent.executionPlanAfterInteractionCommand ? { executionPlanAfterInteractionCommand: agent.executionPlanAfterInteractionCommand } : {}),
    ...(agent.executionPlanAfterInteractionCommandArgs ? { executionPlanAfterInteractionCommandArgs: agent.executionPlanAfterInteractionCommandArgs } : {}),
    ...(agent.executionPlanUrl ? { executionPlanUrl: agent.executionPlanUrl } : {}),
    ...(agent.searchDecisionName ? { searchDecisionName: agent.searchDecisionName } : {}),
    ...(agent.searchDecisionConfidence ? { searchDecisionConfidence: agent.searchDecisionConfidence } : {}),
    ...(typeof agent.searchDecisionResultCount === "number" ? { searchDecisionResultCount: agent.searchDecisionResultCount } : {}),
    ...(typeof agent.searchDecisionHighRelevanceCount === "number" ? { searchDecisionHighRelevanceCount: agent.searchDecisionHighRelevanceCount } : {}),
    ...(typeof agent.searchDecisionMediumRelevanceCount === "number" ? { searchDecisionMediumRelevanceCount: agent.searchDecisionMediumRelevanceCount } : {}),
    ...(typeof agent.searchDecisionLowRelevanceCount === "number" ? { searchDecisionLowRelevanceCount: agent.searchDecisionLowRelevanceCount } : {}),
    ...(typeof agent.searchDecisionOfficialCount === "number" ? { searchDecisionOfficialCount: agent.searchDecisionOfficialCount } : {}),
    ...(typeof agent.searchDecisionFindMatchCount === "number" ? { searchDecisionFindMatchCount: agent.searchDecisionFindMatchCount } : {}),
    ...(typeof agent.searchDecisionRecommendedRank === "number" ? { searchDecisionRecommendedRank: agent.searchDecisionRecommendedRank } : {}),
    ...(agent.searchDecisionRecommendedUrl ? { searchDecisionRecommendedUrl: agent.searchDecisionRecommendedUrl } : {}),
    ...(agent.searchDecisionCommandArgs ? { searchDecisionCommandArgs: agent.searchDecisionCommandArgs } : {}),
    ...(agent.pageDecisionName ? { pageDecisionName: agent.pageDecisionName } : {}),
    ...(agent.pageDecisionConfidence ? { pageDecisionConfidence: agent.pageDecisionConfidence } : {}),
    ...(agent.pageDecisionReadFrom ? { pageDecisionReadFrom: agent.pageDecisionReadFrom } : {}),
    ...(agent.pageDecisionUrl ? { pageDecisionUrl: agent.pageDecisionUrl } : {}),
    ...(agent.pageDecisionCommandArgs ? { pageDecisionCommandArgs: agent.pageDecisionCommandArgs } : {}),
    ...(typeof agent.semanticNodeCount === "number" ? { semanticNodeCount: agent.semanticNodeCount } : {}),
    ...(typeof agent.semanticNamedRoleCount === "number" ? { semanticNamedRoleCount: agent.semanticNamedRoleCount } : {}),
    ...(typeof agent.semanticInteractiveCount === "number" ? { semanticInteractiveCount: agent.semanticInteractiveCount } : {}),
    ...(typeof agent.semanticFocusableCount === "number" ? { semanticFocusableCount: agent.semanticFocusableCount } : {}),
    ...(typeof agent.semanticHeadingCount === "number" ? { semanticHeadingCount: agent.semanticHeadingCount } : {}),
    ...(typeof agent.semanticLandmarkCount === "number" ? { semanticLandmarkCount: agent.semanticLandmarkCount } : {}),
    ...(typeof agent.semanticLinkCount === "number" ? { semanticLinkCount: agent.semanticLinkCount } : {}),
    ...(typeof agent.semanticButtonCount === "number" ? { semanticButtonCount: agent.semanticButtonCount } : {}),
    ...(typeof agent.semanticImageCount === "number" ? { semanticImageCount: agent.semanticImageCount } : {}),
    ...(typeof agent.semanticTableCount === "number" ? { semanticTableCount: agent.semanticTableCount } : {}),
    ...(typeof agent.semanticListCount === "number" ? { semanticListCount: agent.semanticListCount } : {}),
    ...(typeof agent.semanticFieldCount === "number" ? { semanticFieldCount: agent.semanticFieldCount } : {}),
    ...(agent.semanticTopRole ? { semanticTopRole: agent.semanticTopRole } : {}),
    ...(typeof agent.semanticTopRoleCount === "number" ? { semanticTopRoleCount: agent.semanticTopRoleCount } : {}),
    ...(typeof agent.semanticOutlineCount === "number" ? { semanticOutlineCount: agent.semanticOutlineCount } : {}),
    ...(agent.semanticTopOutlinePath ? { semanticTopOutlinePath: agent.semanticTopOutlinePath } : {}),
    ...(agent.semanticTopOutlineKind ? { semanticTopOutlineKind: agent.semanticTopOutlineKind } : {}),
    ...(agent.semanticTopOutlineRole ? { semanticTopOutlineRole: agent.semanticTopOutlineRole } : {}),
    ...(agent.semanticTopOutlineText ? { semanticTopOutlineText: agent.semanticTopOutlineText } : {}),
    ...(typeof agent.semanticTopOutlineLevel === "number" ? { semanticTopOutlineLevel: agent.semanticTopOutlineLevel } : {}),
    ...(typeof agent.semanticTopOutlineDepth === "number" ? { semanticTopOutlineDepth: agent.semanticTopOutlineDepth } : {}),
    ...(agent.semanticTopOutlineParentPath ? { semanticTopOutlineParentPath: agent.semanticTopOutlineParentPath } : {}),
    ...(agent.semanticTopOutlineParentRole ? { semanticTopOutlineParentRole: agent.semanticTopOutlineParentRole } : {}),
    ...(agent.semanticTopOutlineParentName ? { semanticTopOutlineParentName: agent.semanticTopOutlineParentName } : {}),
    ...(typeof agent.semanticKeyboardShortcutCount === "number" ? { semanticKeyboardShortcutCount: agent.semanticKeyboardShortcutCount } : {}),
    ...(agent.semanticTopKeyboardShortcutPath ? { semanticTopKeyboardShortcutPath: agent.semanticTopKeyboardShortcutPath } : {}),
    ...(agent.semanticTopKeyboardShortcutRole ? { semanticTopKeyboardShortcutRole: agent.semanticTopKeyboardShortcutRole } : {}),
    ...(agent.semanticTopKeyboardShortcutName ? { semanticTopKeyboardShortcutName: agent.semanticTopKeyboardShortcutName } : {}),
    ...(agent.semanticTopKeyboardShortcutKeys?.length ? { semanticTopKeyboardShortcutKeys: agent.semanticTopKeyboardShortcutKeys } : {}),
    ...(agent.semanticTopKeyboardShortcutAccessKey ? { semanticTopKeyboardShortcutAccessKey: agent.semanticTopKeyboardShortcutAccessKey } : {}),
    ...(typeof agent.semanticTopKeyboardShortcutTabIndex === "number" ? { semanticTopKeyboardShortcutTabIndex: agent.semanticTopKeyboardShortcutTabIndex } : {}),
    ...(typeof agent.semanticTopKeyboardShortcutFocusable === "boolean" ? { semanticTopKeyboardShortcutFocusable: agent.semanticTopKeyboardShortcutFocusable } : {}),
    ...(agent.semanticTopKeyboardShortcutSelector ? { semanticTopKeyboardShortcutSelector: agent.semanticTopKeyboardShortcutSelector } : {}),
    ...(agent.semanticTopHeading ? { semanticTopHeading: agent.semanticTopHeading } : {}),
    ...(agent.semanticTopHeadingPath ? { semanticTopHeadingPath: agent.semanticTopHeadingPath } : {}),
    ...(typeof agent.semanticTopHeadingLevel === "number" ? { semanticTopHeadingLevel: agent.semanticTopHeadingLevel } : {}),
    ...(agent.semanticTopLandmark ? { semanticTopLandmark: agent.semanticTopLandmark } : {}),
    ...(agent.semanticTopLandmarkPath ? { semanticTopLandmarkPath: agent.semanticTopLandmarkPath } : {}),
    ...(agent.semanticTopLandmarkRole ? { semanticTopLandmarkRole: agent.semanticTopLandmarkRole } : {}),
    ...(agent.semanticTopLandmarkName ? { semanticTopLandmarkName: agent.semanticTopLandmarkName } : {}),
    ...(agent.semanticTopNamedRole ? { semanticTopNamedRole: agent.semanticTopNamedRole } : {}),
    ...(agent.semanticTopNamedRolePath ? { semanticTopNamedRolePath: agent.semanticTopNamedRolePath } : {}),
    ...(agent.semanticTopNamedRoleRole ? { semanticTopNamedRoleRole: agent.semanticTopNamedRoleRole } : {}),
    ...(agent.semanticTopNamedRoleName ? { semanticTopNamedRoleName: agent.semanticTopNamedRoleName } : {}),
    ...(agent.semanticTopNamedRoleDescription ? { semanticTopNamedRoleDescription: agent.semanticTopNamedRoleDescription } : {}),
    ...(agent.semanticTopInteractiveRole ? { semanticTopInteractiveRole: agent.semanticTopInteractiveRole } : {}),
    ...(agent.semanticTopInteractivePath ? { semanticTopInteractivePath: agent.semanticTopInteractivePath } : {}),
    ...(agent.semanticTopInteractiveName ? { semanticTopInteractiveName: agent.semanticTopInteractiveName } : {}),
    ...(agent.semanticTopInteractiveRoleDescription ? { semanticTopInteractiveRoleDescription: agent.semanticTopInteractiveRoleDescription } : {}),
    ...(agent.semanticTopInteractiveDescription ? { semanticTopInteractiveDescription: agent.semanticTopInteractiveDescription } : {}),
    ...(agent.semanticTopInteractiveValue ? { semanticTopInteractiveValue: agent.semanticTopInteractiveValue } : {}),
    ...(agent.semanticTopInteractiveState ? { semanticTopInteractiveState: agent.semanticTopInteractiveState } : {}),
    ...(typeof agent.semanticTopInteractiveDisabled === "boolean" ? { semanticTopInteractiveDisabled: agent.semanticTopInteractiveDisabled } : {}),
    ...(typeof agent.semanticTopInteractivePressed !== "undefined" ? { semanticTopInteractivePressed: agent.semanticTopInteractivePressed } : {}),
    ...(typeof agent.semanticTopInteractiveExpanded === "boolean" ? { semanticTopInteractiveExpanded: agent.semanticTopInteractiveExpanded } : {}),
    ...(typeof agent.semanticTopInteractiveHaspopup !== "undefined" ? { semanticTopInteractiveHaspopup: agent.semanticTopInteractiveHaspopup } : {}),
    ...(agent.semanticTopInteractiveControls ? { semanticTopInteractiveControls: agent.semanticTopInteractiveControls } : {}),
    ...(agent.semanticTopInteractiveSelector ? { semanticTopInteractiveSelector: agent.semanticTopInteractiveSelector } : {}),
    ...(agent.semanticTopFocusableRole ? { semanticTopFocusableRole: agent.semanticTopFocusableRole } : {}),
    ...(agent.semanticTopFocusablePath ? { semanticTopFocusablePath: agent.semanticTopFocusablePath } : {}),
    ...(agent.semanticTopFocusableName ? { semanticTopFocusableName: agent.semanticTopFocusableName } : {}),
    ...(agent.semanticTopFocusableRoleDescription ? { semanticTopFocusableRoleDescription: agent.semanticTopFocusableRoleDescription } : {}),
    ...(agent.semanticTopFocusableState ? { semanticTopFocusableState: agent.semanticTopFocusableState } : {}),
    ...(typeof agent.semanticTopFocusableDisabled === "boolean" ? { semanticTopFocusableDisabled: agent.semanticTopFocusableDisabled } : {}),
    ...(typeof agent.semanticTopFocusablePressed !== "undefined" ? { semanticTopFocusablePressed: agent.semanticTopFocusablePressed } : {}),
    ...(typeof agent.semanticTopFocusableExpanded === "boolean" ? { semanticTopFocusableExpanded: agent.semanticTopFocusableExpanded } : {}),
    ...(typeof agent.semanticTopFocusableHaspopup !== "undefined" ? { semanticTopFocusableHaspopup: agent.semanticTopFocusableHaspopup } : {}),
    ...(agent.semanticTopFocusableControls ? { semanticTopFocusableControls: agent.semanticTopFocusableControls } : {}),
    ...(agent.semanticTopFocusableSelector ? { semanticTopFocusableSelector: agent.semanticTopFocusableSelector } : {}),
    ...(agent.semanticTopLinkName ? { semanticTopLinkName: agent.semanticTopLinkName } : {}),
    ...(agent.semanticTopLinkPath ? { semanticTopLinkPath: agent.semanticTopLinkPath } : {}),
    ...(agent.semanticTopLinkUrl ? { semanticTopLinkUrl: agent.semanticTopLinkUrl } : {}),
    ...(agent.semanticTopLinkTarget ? { semanticTopLinkTarget: agent.semanticTopLinkTarget } : {}),
    ...(agent.semanticTopLinkRel?.length ? { semanticTopLinkRel: agent.semanticTopLinkRel } : {}),
    ...(agent.semanticTopLinkType ? { semanticTopLinkType: agent.semanticTopLinkType } : {}),
    ...(agent.semanticTopLinkHreflang ? { semanticTopLinkHreflang: agent.semanticTopLinkHreflang } : {}),
    ...(agent.semanticTopLinkState ? { semanticTopLinkState: agent.semanticTopLinkState } : {}),
    ...(typeof agent.semanticTopLinkCurrent !== "undefined" ? { semanticTopLinkCurrent: agent.semanticTopLinkCurrent } : {}),
    ...(agent.semanticTopLinkDownload ? { semanticTopLinkDownload: agent.semanticTopLinkDownload } : {}),
    ...(agent.semanticTopLinkSelector ? { semanticTopLinkSelector: agent.semanticTopLinkSelector } : {}),
    ...(typeof agent.semanticInPageLinkCount === "number" ? { semanticInPageLinkCount: agent.semanticInPageLinkCount } : {}),
    ...(agent.semanticTopInPageLinkPath ? { semanticTopInPageLinkPath: agent.semanticTopInPageLinkPath } : {}),
    ...(agent.semanticTopInPageLinkKind ? { semanticTopInPageLinkKind: agent.semanticTopInPageLinkKind } : {}),
    ...(agent.semanticTopInPageLinkName ? { semanticTopInPageLinkName: agent.semanticTopInPageLinkName } : {}),
    ...(agent.semanticTopInPageLinkUrl ? { semanticTopInPageLinkUrl: agent.semanticTopInPageLinkUrl } : {}),
    ...(agent.semanticTopInPageLinkTargetId ? { semanticTopInPageLinkTargetId: agent.semanticTopInPageLinkTargetId } : {}),
    ...(agent.semanticTopInPageLinkSelector ? { semanticTopInPageLinkSelector: agent.semanticTopInPageLinkSelector } : {}),
    ...(agent.semanticTopButtonName ? { semanticTopButtonName: agent.semanticTopButtonName } : {}),
    ...(agent.semanticTopButtonPath ? { semanticTopButtonPath: agent.semanticTopButtonPath } : {}),
    ...(agent.semanticTopButtonRoleDescription ? { semanticTopButtonRoleDescription: agent.semanticTopButtonRoleDescription } : {}),
    ...(agent.semanticTopButtonDescription ? { semanticTopButtonDescription: agent.semanticTopButtonDescription } : {}),
    ...(agent.semanticTopButtonType ? { semanticTopButtonType: agent.semanticTopButtonType } : {}),
    ...(agent.semanticTopButtonState ? { semanticTopButtonState: agent.semanticTopButtonState } : {}),
    ...(typeof agent.semanticTopButtonDisabled === "boolean" ? { semanticTopButtonDisabled: agent.semanticTopButtonDisabled } : {}),
    ...(typeof agent.semanticTopButtonPressed !== "undefined" ? { semanticTopButtonPressed: agent.semanticTopButtonPressed } : {}),
    ...(typeof agent.semanticTopButtonExpanded === "boolean" ? { semanticTopButtonExpanded: agent.semanticTopButtonExpanded } : {}),
    ...(typeof agent.semanticTopButtonHaspopup !== "undefined" ? { semanticTopButtonHaspopup: agent.semanticTopButtonHaspopup } : {}),
    ...(agent.semanticTopButtonControls ? { semanticTopButtonControls: agent.semanticTopButtonControls } : {}),
    ...(agent.semanticTopButtonFormAction ? { semanticTopButtonFormAction: agent.semanticTopButtonFormAction } : {}),
    ...(agent.semanticTopButtonFormMethod ? { semanticTopButtonFormMethod: agent.semanticTopButtonFormMethod } : {}),
    ...(agent.semanticTopButtonFormTarget ? { semanticTopButtonFormTarget: agent.semanticTopButtonFormTarget } : {}),
    ...(agent.semanticTopButtonFormEncType ? { semanticTopButtonFormEncType: agent.semanticTopButtonFormEncType } : {}),
    ...(typeof agent.semanticTopButtonFormNoValidate === "boolean" ? { semanticTopButtonFormNoValidate: agent.semanticTopButtonFormNoValidate } : {}),
    ...(agent.semanticTopButtonFormId ? { semanticTopButtonFormId: agent.semanticTopButtonFormId } : {}),
    ...(agent.semanticTopButtonSelector ? { semanticTopButtonSelector: agent.semanticTopButtonSelector } : {}),
    ...(agent.semanticTopImagePath ? { semanticTopImagePath: agent.semanticTopImagePath } : {}),
    ...(agent.semanticTopImageName ? { semanticTopImageName: agent.semanticTopImageName } : {}),
    ...(agent.semanticTopImageUrl ? { semanticTopImageUrl: agent.semanticTopImageUrl } : {}),
    ...(typeof agent.semanticTopImageWidth === "number" ? { semanticTopImageWidth: agent.semanticTopImageWidth } : {}),
    ...(typeof agent.semanticTopImageHeight === "number" ? { semanticTopImageHeight: agent.semanticTopImageHeight } : {}),
    ...(agent.semanticTopImageLoading ? { semanticTopImageLoading: agent.semanticTopImageLoading } : {}),
    ...(agent.semanticTopImageDecoding ? { semanticTopImageDecoding: agent.semanticTopImageDecoding } : {}),
    ...(agent.semanticTopImageSrcset ? { semanticTopImageSrcset: agent.semanticTopImageSrcset } : {}),
    ...(agent.semanticTopImageSizes ? { semanticTopImageSizes: agent.semanticTopImageSizes } : {}),
    ...(agent.semanticTopImageSelector ? { semanticTopImageSelector: agent.semanticTopImageSelector } : {}),
    ...(agent.semanticTopTableRole ? { semanticTopTableRole: agent.semanticTopTableRole } : {}),
    ...(agent.semanticTopTablePath ? { semanticTopTablePath: agent.semanticTopTablePath } : {}),
    ...(agent.semanticTopTableName ? { semanticTopTableName: agent.semanticTopTableName } : {}),
    ...(typeof agent.semanticTopTableRowCount === "number" ? { semanticTopTableRowCount: agent.semanticTopTableRowCount } : {}),
    ...(typeof agent.semanticTopTableCellCount === "number" ? { semanticTopTableCellCount: agent.semanticTopTableCellCount } : {}),
    ...(typeof agent.semanticTopTableDeclaredRowCount === "number" ? { semanticTopTableDeclaredRowCount: agent.semanticTopTableDeclaredRowCount } : {}),
    ...(typeof agent.semanticTopTableDeclaredColumnCount === "number" ? { semanticTopTableDeclaredColumnCount: agent.semanticTopTableDeclaredColumnCount } : {}),
    ...(agent.semanticTopTableHeaders?.length ? { semanticTopTableHeaders: agent.semanticTopTableHeaders } : {}),
    ...(agent.semanticTopTableHeaderRefs?.length ? { semanticTopTableHeaderRefs: agent.semanticTopTableHeaderRefs } : {}),
    ...(typeof agent.semanticTopTableOwnedCount === "number" ? { semanticTopTableOwnedCount: agent.semanticTopTableOwnedCount } : {}),
    ...(agent.semanticTopTableOwnedRefs?.length ? { semanticTopTableOwnedRefs: agent.semanticTopTableOwnedRefs } : {}),
    ...(agent.semanticTopTableSampleCells?.length ? { semanticTopTableSampleCells: agent.semanticTopTableSampleCells } : {}),
    ...(agent.semanticTopTableSampleCellRefs?.length ? { semanticTopTableSampleCellRefs: agent.semanticTopTableSampleCellRefs } : {}),
    ...(agent.semanticTopTableFirstHeader ? { semanticTopTableFirstHeader: agent.semanticTopTableFirstHeader } : {}),
    ...(agent.semanticTopTableFirstHeaderPath ? { semanticTopTableFirstHeaderPath: agent.semanticTopTableFirstHeaderPath } : {}),
    ...(agent.semanticTopTableFirstHeaderRole ? { semanticTopTableFirstHeaderRole: agent.semanticTopTableFirstHeaderRole } : {}),
    ...(typeof agent.semanticTopTableFirstHeaderRowIndex === "number" ? { semanticTopTableFirstHeaderRowIndex: agent.semanticTopTableFirstHeaderRowIndex } : {}),
    ...(typeof agent.semanticTopTableFirstHeaderColumnIndex === "number" ? { semanticTopTableFirstHeaderColumnIndex: agent.semanticTopTableFirstHeaderColumnIndex } : {}),
    ...(agent.semanticTopTableFirstHeaderSort ? { semanticTopTableFirstHeaderSort: agent.semanticTopTableFirstHeaderSort } : {}),
    ...(agent.semanticTopTableFirstHeaderSelector ? { semanticTopTableFirstHeaderSelector: agent.semanticTopTableFirstHeaderSelector } : {}),
    ...(agent.semanticTopTableFirstOwnedTarget ? { semanticTopTableFirstOwnedTarget: agent.semanticTopTableFirstOwnedTarget } : {}),
    ...(agent.semanticTopTableFirstOwnedRole ? { semanticTopTableFirstOwnedRole: agent.semanticTopTableFirstOwnedRole } : {}),
    ...(agent.semanticTopTableFirstOwnedName ? { semanticTopTableFirstOwnedName: agent.semanticTopTableFirstOwnedName } : {}),
    ...(agent.semanticTopTableFirstOwnedSelector ? { semanticTopTableFirstOwnedSelector: agent.semanticTopTableFirstOwnedSelector } : {}),
    ...(agent.semanticTopTableFirstSampleCellPath ? { semanticTopTableFirstSampleCellPath: agent.semanticTopTableFirstSampleCellPath } : {}),
    ...(agent.semanticTopTableFirstSampleCellText ? { semanticTopTableFirstSampleCellText: agent.semanticTopTableFirstSampleCellText } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellRowIndex === "number" ? { semanticTopTableFirstSampleCellRowIndex: agent.semanticTopTableFirstSampleCellRowIndex } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellColumnIndex === "number" ? { semanticTopTableFirstSampleCellColumnIndex: agent.semanticTopTableFirstSampleCellColumnIndex } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellRowSpan === "number" ? { semanticTopTableFirstSampleCellRowSpan: agent.semanticTopTableFirstSampleCellRowSpan } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellColumnSpan === "number" ? { semanticTopTableFirstSampleCellColumnSpan: agent.semanticTopTableFirstSampleCellColumnSpan } : {}),
    ...(agent.semanticTopTableFirstSampleCellHeaders?.length ? { semanticTopTableFirstSampleCellHeaders: agent.semanticTopTableFirstSampleCellHeaders } : {}),
    ...(agent.semanticTopTableFirstSampleCellRowHeaders?.length ? { semanticTopTableFirstSampleCellRowHeaders: agent.semanticTopTableFirstSampleCellRowHeaders } : {}),
    ...(agent.semanticTopTableFirstSampleCellColumnHeaders?.length ? { semanticTopTableFirstSampleCellColumnHeaders: agent.semanticTopTableFirstSampleCellColumnHeaders } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellSelected === "boolean" ? { semanticTopTableFirstSampleCellSelected: agent.semanticTopTableFirstSampleCellSelected } : {}),
    ...(typeof agent.semanticTopTableFirstSampleCellCurrent !== "undefined" ? { semanticTopTableFirstSampleCellCurrent: agent.semanticTopTableFirstSampleCellCurrent } : {}),
    ...(agent.semanticTopTableFirstSampleCellSelector ? { semanticTopTableFirstSampleCellSelector: agent.semanticTopTableFirstSampleCellSelector } : {}),
    ...(agent.semanticTopSelectedTableCellPath ? { semanticTopSelectedTableCellPath: agent.semanticTopSelectedTableCellPath } : {}),
    ...(agent.semanticTopSelectedTableCellText ? { semanticTopSelectedTableCellText: agent.semanticTopSelectedTableCellText } : {}),
    ...(typeof agent.semanticTopSelectedTableCellRowIndex === "number" ? { semanticTopSelectedTableCellRowIndex: agent.semanticTopSelectedTableCellRowIndex } : {}),
    ...(typeof agent.semanticTopSelectedTableCellColumnIndex === "number" ? { semanticTopSelectedTableCellColumnIndex: agent.semanticTopSelectedTableCellColumnIndex } : {}),
    ...(typeof agent.semanticTopSelectedTableCellSelected === "boolean" ? { semanticTopSelectedTableCellSelected: agent.semanticTopSelectedTableCellSelected } : {}),
    ...(typeof agent.semanticTopSelectedTableCellCurrent !== "undefined" ? { semanticTopSelectedTableCellCurrent: agent.semanticTopSelectedTableCellCurrent } : {}),
    ...(agent.semanticTopSelectedTableCellSelector ? { semanticTopSelectedTableCellSelector: agent.semanticTopSelectedTableCellSelector } : {}),
    ...(agent.semanticTopTableSelector ? { semanticTopTableSelector: agent.semanticTopTableSelector } : {}),
    ...(agent.semanticTopListRole ? { semanticTopListRole: agent.semanticTopListRole } : {}),
    ...(agent.semanticTopListPath ? { semanticTopListPath: agent.semanticTopListPath } : {}),
    ...(agent.semanticTopListName ? { semanticTopListName: agent.semanticTopListName } : {}),
    ...(typeof agent.semanticTopListItemCount === "number" ? { semanticTopListItemCount: agent.semanticTopListItemCount } : {}),
    ...(agent.semanticTopListItems?.length ? { semanticTopListItems: agent.semanticTopListItems } : {}),
    ...(agent.semanticTopListItemRefs?.length ? { semanticTopListItemRefs: agent.semanticTopListItemRefs } : {}),
    ...(agent.semanticTopListFirstItemText ? { semanticTopListFirstItemText: agent.semanticTopListFirstItemText } : {}),
    ...(agent.semanticTopListFirstItemRole ? { semanticTopListFirstItemRole: agent.semanticTopListFirstItemRole } : {}),
    ...(typeof agent.semanticTopListFirstItemLevel === "number" ? { semanticTopListFirstItemLevel: agent.semanticTopListFirstItemLevel } : {}),
    ...(typeof agent.semanticTopListFirstItemPosInSet === "number" ? { semanticTopListFirstItemPosInSet: agent.semanticTopListFirstItemPosInSet } : {}),
    ...(typeof agent.semanticTopListFirstItemSetSize === "number" ? { semanticTopListFirstItemSetSize: agent.semanticTopListFirstItemSetSize } : {}),
    ...(typeof agent.semanticTopListFirstItemSelected === "boolean" ? { semanticTopListFirstItemSelected: agent.semanticTopListFirstItemSelected } : {}),
    ...(typeof agent.semanticTopListFirstItemCurrent !== "undefined" ? { semanticTopListFirstItemCurrent: agent.semanticTopListFirstItemCurrent } : {}),
    ...(typeof agent.semanticTopListFirstItemExpanded === "boolean" ? { semanticTopListFirstItemExpanded: agent.semanticTopListFirstItemExpanded } : {}),
    ...(agent.semanticTopListFirstItemSelector ? { semanticTopListFirstItemSelector: agent.semanticTopListFirstItemSelector } : {}),
    ...(agent.semanticTopListSelector ? { semanticTopListSelector: agent.semanticTopListSelector } : {}),
    ...(agent.semanticTopFieldRole ? { semanticTopFieldRole: agent.semanticTopFieldRole } : {}),
    ...(agent.semanticTopFieldPath ? { semanticTopFieldPath: agent.semanticTopFieldPath } : {}),
    ...(agent.semanticTopFieldName ? { semanticTopFieldName: agent.semanticTopFieldName } : {}),
    ...(agent.semanticTopFieldDescription ? { semanticTopFieldDescription: agent.semanticTopFieldDescription } : {}),
    ...(agent.semanticTopFieldValue ? { semanticTopFieldValue: agent.semanticTopFieldValue } : {}),
    ...(agent.semanticTopFieldHtmlName ? { semanticTopFieldHtmlName: agent.semanticTopFieldHtmlName } : {}),
    ...(agent.semanticTopFieldHtmlType ? { semanticTopFieldHtmlType: agent.semanticTopFieldHtmlType } : {}),
    ...(agent.semanticTopFieldPlaceholder ? { semanticTopFieldPlaceholder: agent.semanticTopFieldPlaceholder } : {}),
    ...(agent.semanticTopFieldAriaPlaceholder ? { semanticTopFieldAriaPlaceholder: agent.semanticTopFieldAriaPlaceholder } : {}),
    ...(agent.semanticTopFieldAutocomplete ? { semanticTopFieldAutocomplete: agent.semanticTopFieldAutocomplete } : {}),
    ...(agent.semanticTopFieldAriaAutocomplete ? { semanticTopFieldAriaAutocomplete: agent.semanticTopFieldAriaAutocomplete } : {}),
    ...(agent.semanticTopFieldInputMode ? { semanticTopFieldInputMode: agent.semanticTopFieldInputMode } : {}),
    ...(agent.semanticTopFieldPattern ? { semanticTopFieldPattern: agent.semanticTopFieldPattern } : {}),
    ...(agent.semanticTopFieldMin ? { semanticTopFieldMin: agent.semanticTopFieldMin } : {}),
    ...(agent.semanticTopFieldMax ? { semanticTopFieldMax: agent.semanticTopFieldMax } : {}),
    ...(agent.semanticTopFieldStep ? { semanticTopFieldStep: agent.semanticTopFieldStep } : {}),
    ...(typeof agent.semanticTopFieldMinLength === "number" ? { semanticTopFieldMinLength: agent.semanticTopFieldMinLength } : {}),
    ...(typeof agent.semanticTopFieldMaxLength === "number" ? { semanticTopFieldMaxLength: agent.semanticTopFieldMaxLength } : {}),
    ...(agent.semanticTopFieldLabelledBy ? { semanticTopFieldLabelledBy: agent.semanticTopFieldLabelledBy } : {}),
    ...(agent.semanticTopFieldLabelledByText ? { semanticTopFieldLabelledByText: agent.semanticTopFieldLabelledByText } : {}),
    ...(agent.semanticTopFieldDescribedBy ? { semanticTopFieldDescribedBy: agent.semanticTopFieldDescribedBy } : {}),
    ...(agent.semanticTopFieldDescribedByText ? { semanticTopFieldDescribedByText: agent.semanticTopFieldDescribedByText } : {}),
    ...(agent.semanticTopFieldDetails ? { semanticTopFieldDetails: agent.semanticTopFieldDetails } : {}),
    ...(agent.semanticTopFieldDetailsText ? { semanticTopFieldDetailsText: agent.semanticTopFieldDetailsText } : {}),
    ...(agent.semanticTopFieldErrorMessage ? { semanticTopFieldErrorMessage: agent.semanticTopFieldErrorMessage } : {}),
    ...(agent.semanticTopFieldErrorMessageText ? { semanticTopFieldErrorMessageText: agent.semanticTopFieldErrorMessageText } : {}),
    ...(agent.semanticTopFieldState ? { semanticTopFieldState: agent.semanticTopFieldState } : {}),
    ...(typeof agent.semanticTopFieldDisabled === "boolean" ? { semanticTopFieldDisabled: agent.semanticTopFieldDisabled } : {}),
    ...(typeof agent.semanticTopFieldRequired === "boolean" ? { semanticTopFieldRequired: agent.semanticTopFieldRequired } : {}),
    ...(typeof agent.semanticTopFieldReadonly === "boolean" ? { semanticTopFieldReadonly: agent.semanticTopFieldReadonly } : {}),
    ...(typeof agent.semanticTopFieldInvalid !== "undefined" ? { semanticTopFieldInvalid: agent.semanticTopFieldInvalid } : {}),
    ...(typeof agent.semanticTopFieldChecked !== "undefined" ? { semanticTopFieldChecked: agent.semanticTopFieldChecked } : {}),
    ...(typeof agent.semanticTopFieldExpanded === "boolean" ? { semanticTopFieldExpanded: agent.semanticTopFieldExpanded } : {}),
    ...(typeof agent.semanticTopFieldHaspopup !== "undefined" ? { semanticTopFieldHaspopup: agent.semanticTopFieldHaspopup } : {}),
    ...(agent.semanticTopFieldControls ? { semanticTopFieldControls: agent.semanticTopFieldControls } : {}),
    ...(typeof agent.semanticTopFieldValueMin === "number" ? { semanticTopFieldValueMin: agent.semanticTopFieldValueMin } : {}),
    ...(typeof agent.semanticTopFieldValueMax === "number" ? { semanticTopFieldValueMax: agent.semanticTopFieldValueMax } : {}),
    ...(typeof agent.semanticTopFieldValueNow === "number" ? { semanticTopFieldValueNow: agent.semanticTopFieldValueNow } : {}),
    ...(agent.semanticTopFieldValueText ? { semanticTopFieldValueText: agent.semanticTopFieldValueText } : {}),
    ...(agent.semanticTopFieldSelector ? { semanticTopFieldSelector: agent.semanticTopFieldSelector } : {}),
    ...(agent.semanticTopDescriptionRole ? { semanticTopDescriptionRole: agent.semanticTopDescriptionRole } : {}),
    ...(agent.semanticTopDescriptionPath ? { semanticTopDescriptionPath: agent.semanticTopDescriptionPath } : {}),
    ...(agent.semanticTopDescriptionName ? { semanticTopDescriptionName: agent.semanticTopDescriptionName } : {}),
    ...(agent.semanticTopDescriptionText ? { semanticTopDescriptionText: agent.semanticTopDescriptionText } : {}),
    ...(agent.semanticTopDescriptionSelector ? { semanticTopDescriptionSelector: agent.semanticTopDescriptionSelector } : {}),
    ...(agent.semanticTopValueRole ? { semanticTopValueRole: agent.semanticTopValueRole } : {}),
    ...(agent.semanticTopValuePath ? { semanticTopValuePath: agent.semanticTopValuePath } : {}),
    ...(agent.semanticTopValueName ? { semanticTopValueName: agent.semanticTopValueName } : {}),
    ...(agent.semanticTopValue ? { semanticTopValue: agent.semanticTopValue } : {}),
    ...(agent.semanticTopValueSelector ? { semanticTopValueSelector: agent.semanticTopValueSelector } : {}),
    ...(agent.semanticTopRelationRole ? { semanticTopRelationRole: agent.semanticTopRelationRole } : {}),
    ...(agent.semanticTopRelationPath ? { semanticTopRelationPath: agent.semanticTopRelationPath } : {}),
    ...(agent.semanticTopRelationName ? { semanticTopRelationName: agent.semanticTopRelationName } : {}),
    ...(agent.semanticTopRelation ? { semanticTopRelation: agent.semanticTopRelation } : {}),
    ...(agent.semanticTopRelationTarget ? { semanticTopRelationTarget: agent.semanticTopRelationTarget } : {}),
    ...(agent.semanticTopRelationTargetRole ? { semanticTopRelationTargetRole: agent.semanticTopRelationTargetRole } : {}),
    ...(agent.semanticTopRelationTargetName ? { semanticTopRelationTargetName: agent.semanticTopRelationTargetName } : {}),
    ...(agent.semanticTopRelationTargetSelector ? { semanticTopRelationTargetSelector: agent.semanticTopRelationTargetSelector } : {}),
    ...(agent.semanticTopRelationSelector ? { semanticTopRelationSelector: agent.semanticTopRelationSelector } : {}),
    ...(agent.semanticTopChoiceRole ? { semanticTopChoiceRole: agent.semanticTopChoiceRole } : {}),
    ...(agent.semanticTopChoicePath ? { semanticTopChoicePath: agent.semanticTopChoicePath } : {}),
    ...(agent.semanticTopChoiceName ? { semanticTopChoiceName: agent.semanticTopChoiceName } : {}),
    ...(agent.semanticTopChoiceState ? { semanticTopChoiceState: agent.semanticTopChoiceState } : {}),
    ...(typeof agent.semanticTopChoiceSelected === "boolean" ? { semanticTopChoiceSelected: agent.semanticTopChoiceSelected } : {}),
    ...(typeof agent.semanticTopChoiceCurrent !== "undefined" ? { semanticTopChoiceCurrent: agent.semanticTopChoiceCurrent } : {}),
    ...(typeof agent.semanticTopChoiceLevel === "number" ? { semanticTopChoiceLevel: agent.semanticTopChoiceLevel } : {}),
    ...(typeof agent.semanticTopChoicePosInSet === "number" ? { semanticTopChoicePosInSet: agent.semanticTopChoicePosInSet } : {}),
    ...(typeof agent.semanticTopChoiceSetSize === "number" ? { semanticTopChoiceSetSize: agent.semanticTopChoiceSetSize } : {}),
    ...(agent.semanticTopChoiceSelector ? { semanticTopChoiceSelector: agent.semanticTopChoiceSelector } : {}),
    ...(agent.semanticTopSelectedChoiceRole ? { semanticTopSelectedChoiceRole: agent.semanticTopSelectedChoiceRole } : {}),
    ...(agent.semanticTopSelectedChoicePath ? { semanticTopSelectedChoicePath: agent.semanticTopSelectedChoicePath } : {}),
    ...(agent.semanticTopSelectedChoiceName ? { semanticTopSelectedChoiceName: agent.semanticTopSelectedChoiceName } : {}),
    ...(agent.semanticTopSelectedChoiceState ? { semanticTopSelectedChoiceState: agent.semanticTopSelectedChoiceState } : {}),
    ...(typeof agent.semanticTopSelectedChoiceSelected === "boolean" ? { semanticTopSelectedChoiceSelected: agent.semanticTopSelectedChoiceSelected } : {}),
    ...(typeof agent.semanticTopSelectedChoiceCurrent !== "undefined" ? { semanticTopSelectedChoiceCurrent: agent.semanticTopSelectedChoiceCurrent } : {}),
    ...(typeof agent.semanticTopSelectedChoiceLevel === "number" ? { semanticTopSelectedChoiceLevel: agent.semanticTopSelectedChoiceLevel } : {}),
    ...(typeof agent.semanticTopSelectedChoicePosInSet === "number" ? { semanticTopSelectedChoicePosInSet: agent.semanticTopSelectedChoicePosInSet } : {}),
    ...(typeof agent.semanticTopSelectedChoiceSetSize === "number" ? { semanticTopSelectedChoiceSetSize: agent.semanticTopSelectedChoiceSetSize } : {}),
    ...(agent.semanticTopSelectedChoiceControls ? { semanticTopSelectedChoiceControls: agent.semanticTopSelectedChoiceControls } : {}),
    ...(agent.semanticTopSelectedChoiceControlsTargetRole ? { semanticTopSelectedChoiceControlsTargetRole: agent.semanticTopSelectedChoiceControlsTargetRole } : {}),
    ...(agent.semanticTopSelectedChoiceControlsTargetName ? { semanticTopSelectedChoiceControlsTargetName: agent.semanticTopSelectedChoiceControlsTargetName } : {}),
    ...(agent.semanticTopSelectedChoiceControlsTargetSelector ? { semanticTopSelectedChoiceControlsTargetSelector: agent.semanticTopSelectedChoiceControlsTargetSelector } : {}),
    ...(agent.semanticTopSelectedChoiceSelector ? { semanticTopSelectedChoiceSelector: agent.semanticTopSelectedChoiceSelector } : {}),
    ...(agent.semanticTopStateRole ? { semanticTopStateRole: agent.semanticTopStateRole } : {}),
    ...(agent.semanticTopStatePath ? { semanticTopStatePath: agent.semanticTopStatePath } : {}),
    ...(agent.semanticTopStateName ? { semanticTopStateName: agent.semanticTopStateName } : {}),
    ...(agent.semanticTopState ? { semanticTopState: agent.semanticTopState } : {}),
    ...(typeof agent.semanticTopStateHidden === "boolean" ? { semanticTopStateHidden: agent.semanticTopStateHidden } : {}),
    ...(typeof agent.semanticTopStateDisabled === "boolean" ? { semanticTopStateDisabled: agent.semanticTopStateDisabled } : {}),
    ...(typeof agent.semanticTopStateBusy === "boolean" ? { semanticTopStateBusy: agent.semanticTopStateBusy } : {}),
    ...(typeof agent.semanticTopStateMultiselectable === "boolean" ? { semanticTopStateMultiselectable: agent.semanticTopStateMultiselectable } : {}),
    ...(agent.semanticTopStateSort ? { semanticTopStateSort: agent.semanticTopStateSort } : {}),
    ...(typeof agent.semanticTopStateGrabbed === "boolean" ? { semanticTopStateGrabbed: agent.semanticTopStateGrabbed } : {}),
    ...(agent.semanticTopStateDropEffect ? { semanticTopStateDropEffect: agent.semanticTopStateDropEffect } : {}),
    ...(typeof agent.semanticTopStateChecked !== "undefined" ? { semanticTopStateChecked: agent.semanticTopStateChecked } : {}),
    ...(typeof agent.semanticTopStateSelected === "boolean" ? { semanticTopStateSelected: agent.semanticTopStateSelected } : {}),
    ...(typeof agent.semanticTopStateExpanded === "boolean" ? { semanticTopStateExpanded: agent.semanticTopStateExpanded } : {}),
    ...(typeof agent.semanticTopStatePressed !== "undefined" ? { semanticTopStatePressed: agent.semanticTopStatePressed } : {}),
    ...(typeof agent.semanticTopStateFocused === "boolean" ? { semanticTopStateFocused: agent.semanticTopStateFocused } : {}),
    ...(typeof agent.semanticTopStateRequired === "boolean" ? { semanticTopStateRequired: agent.semanticTopStateRequired } : {}),
    ...(typeof agent.semanticTopStateInvalid !== "undefined" ? { semanticTopStateInvalid: agent.semanticTopStateInvalid } : {}),
    ...(typeof agent.semanticTopStateReadonly === "boolean" ? { semanticTopStateReadonly: agent.semanticTopStateReadonly } : {}),
    ...(typeof agent.semanticTopStateCurrent !== "undefined" ? { semanticTopStateCurrent: agent.semanticTopStateCurrent } : {}),
    ...(typeof agent.semanticTopStateHaspopup !== "undefined" ? { semanticTopStateHaspopup: agent.semanticTopStateHaspopup } : {}),
    ...(agent.semanticTopStateControls ? { semanticTopStateControls: agent.semanticTopStateControls } : {}),
    ...(agent.semanticTopStateLive ? { semanticTopStateLive: agent.semanticTopStateLive } : {}),
    ...(typeof agent.semanticTopStateModal === "boolean" ? { semanticTopStateModal: agent.semanticTopStateModal } : {}),
    ...(agent.semanticTopStateOrientation ? { semanticTopStateOrientation: agent.semanticTopStateOrientation } : {}),
    ...(typeof agent.semanticTopStateValueMin === "number" ? { semanticTopStateValueMin: agent.semanticTopStateValueMin } : {}),
    ...(typeof agent.semanticTopStateValueMax === "number" ? { semanticTopStateValueMax: agent.semanticTopStateValueMax } : {}),
    ...(typeof agent.semanticTopStateValueNow === "number" ? { semanticTopStateValueNow: agent.semanticTopStateValueNow } : {}),
    ...(agent.semanticTopStateValueText ? { semanticTopStateValueText: agent.semanticTopStateValueText } : {}),
    ...(agent.semanticTopStateSelector ? { semanticTopStateSelector: agent.semanticTopStateSelector } : {}),
    ...(agent.semanticTopModalStateRole ? { semanticTopModalStateRole: agent.semanticTopModalStateRole } : {}),
    ...(agent.semanticTopModalStatePath ? { semanticTopModalStatePath: agent.semanticTopModalStatePath } : {}),
    ...(agent.semanticTopModalStateName ? { semanticTopModalStateName: agent.semanticTopModalStateName } : {}),
    ...(agent.semanticTopModalState ? { semanticTopModalState: agent.semanticTopModalState } : {}),
    ...(agent.semanticTopModalStateSelector ? { semanticTopModalStateSelector: agent.semanticTopModalStateSelector } : {}),
    ...(agent.semanticTopLiveStateRole ? { semanticTopLiveStateRole: agent.semanticTopLiveStateRole } : {}),
    ...(agent.semanticTopLiveStatePath ? { semanticTopLiveStatePath: agent.semanticTopLiveStatePath } : {}),
    ...(agent.semanticTopLiveStateName ? { semanticTopLiveStateName: agent.semanticTopLiveStateName } : {}),
    ...(agent.semanticTopLiveState ? { semanticTopLiveState: agent.semanticTopLiveState } : {}),
    ...(agent.semanticTopLiveStateLive ? { semanticTopLiveStateLive: agent.semanticTopLiveStateLive } : {}),
    ...(agent.semanticTopLiveStateSelector ? { semanticTopLiveStateSelector: agent.semanticTopLiveStateSelector } : {}),
    ...(typeof agent.semanticUnavailableCount === "number" ? { semanticUnavailableCount: agent.semanticUnavailableCount } : {}),
    ...(agent.semanticTopUnavailablePath ? { semanticTopUnavailablePath: agent.semanticTopUnavailablePath } : {}),
    ...(agent.semanticTopUnavailableTag ? { semanticTopUnavailableTag: agent.semanticTopUnavailableTag } : {}),
    ...(agent.semanticTopUnavailableRole ? { semanticTopUnavailableRole: agent.semanticTopUnavailableRole } : {}),
    ...(agent.semanticTopUnavailableName ? { semanticTopUnavailableName: agent.semanticTopUnavailableName } : {}),
    ...(agent.semanticTopUnavailableReason ? { semanticTopUnavailableReason: agent.semanticTopUnavailableReason } : {}),
    ...(agent.semanticTopUnavailableSelector ? { semanticTopUnavailableSelector: agent.semanticTopUnavailableSelector } : {}),
    signalCount: agent.signalCount,
    signalWarningCount: agent.signalWarningCount,
    signalErrorCount: agent.signalErrorCount,
    qualityGateCount: agent.qualityGateCount,
    qualityGateFailCount: agent.qualityGateFailCount,
    ...(agent.topSignalKind ? { topSignalKind: agent.topSignalKind } : {}),
    ...(agent.topSignalSeverity ? { topSignalSeverity: agent.topSignalSeverity } : {}),
    ...(agent.topSignalMessage ? { topSignalMessage: agent.topSignalMessage } : {}),
    ...(agent.topQualityGateKind ? { topQualityGateKind: agent.topQualityGateKind } : {}),
    ...(typeof agent.topQualityGatePass === "boolean" ? { topQualityGatePass: agent.topQualityGatePass } : {}),
    ...(agent.topQualityGateSeverity ? { topQualityGateSeverity: agent.topQualityGateSeverity } : {}),
    ...(agent.topQualityGateMessage ? { topQualityGateMessage: agent.topQualityGateMessage } : {}),
    ...(agent.topQualityGatePath ? { topQualityGatePath: agent.topQualityGatePath } : {}),
    ...(typeof agent.topQualityGateScore === "number" ? { topQualityGateScore: agent.topQualityGateScore } : {}),
    ...(agent.problemSignalKind ? { problemSignalKind: agent.problemSignalKind } : {}),
    ...(agent.problemSignalSeverity ? { problemSignalSeverity: agent.problemSignalSeverity } : {}),
    ...(agent.problemSignalMessage ? { problemSignalMessage: agent.problemSignalMessage } : {}),
    ...(agent.failingQualityGateKind ? { failingQualityGateKind: agent.failingQualityGateKind } : {}),
    ...(agent.failingQualityGateSeverity ? { failingQualityGateSeverity: agent.failingQualityGateSeverity } : {}),
    ...(agent.failingQualityGateMessage ? { failingQualityGateMessage: agent.failingQualityGateMessage } : {}),
    ...(agent.failingQualityGatePath ? { failingQualityGatePath: agent.failingQualityGatePath } : {}),
    ...(typeof agent.failingQualityGateScore === "number" ? { failingQualityGateScore: agent.failingQualityGateScore } : {}),
    canContinue: agent.canContinue,
    canUseFetchedHtml: agent.canUseFetchedHtml,
    needsBrowserHtml: agent.needsBrowserHtml,
    ...(agent.staticReadiness ? { staticReadiness: agent.staticReadiness } : {}),
    ...(agent.staticReadinessReasonCode ? { staticReadinessReasonCode: agent.staticReadinessReasonCode } : {}),
    ...(agent.staticReadinessReason ? { staticReadinessReason: agent.staticReadinessReason } : {}),
    ...(agent.staticReadinessReadFrom ? { staticReadinessReadFrom: agent.staticReadinessReadFrom } : {}),
    ...(agent.browserHtmlReason ? { browserHtmlReason: agent.browserHtmlReason } : {}),
    ...(agent.browserHtmlReasonCode ? { browserHtmlReasonCode: agent.browserHtmlReasonCode } : {}),
    ...(agent.browserHtmlActionName ? { browserHtmlActionName: agent.browserHtmlActionName } : {}),
    ...(agent.browserHtmlOperation ? { browserHtmlOperation: agent.browserHtmlOperation } : {}),
    ...(agent.browserHtmlUrl ? { browserHtmlUrl: agent.browserHtmlUrl } : {}),
    ...(agent.browserHtmlFile ? { browserHtmlFile: agent.browserHtmlFile } : {}),
    ...(agent.browserHtmlCaptureScript ? { browserHtmlCaptureScript: agent.browserHtmlCaptureScript } : {}),
    ...(agent.browserHtmlCommand ? { browserHtmlCommand: agent.browserHtmlCommand } : {}),
    ...(agent.browserHtmlCommandArgs ? { browserHtmlCommandArgs: agent.browserHtmlCommandArgs } : {}),
    ...(agent.browserHtmlAfterInteractionCommand ? { browserHtmlAfterInteractionCommand: agent.browserHtmlAfterInteractionCommand } : {}),
    ...(agent.browserHtmlAfterInteractionCommandArgs ? { browserHtmlAfterInteractionCommandArgs: agent.browserHtmlAfterInteractionCommandArgs } : {}),
    confidence: agent.confidence,
    usabilityScore: agent.usabilityScore,
    readability: agent.readability,
    readabilityScore: agent.readabilityScore,
    verificationStatus: agent.verificationStatus,
    ...(agent.verificationFoundQueries.length > 0 ? { verificationFoundQueries: agent.verificationFoundQueries } : {}),
    ...(agent.verificationMissingQueries.length > 0 ? { verificationMissingQueries: agent.verificationMissingQueries } : {}),
    ...(agent.topVerificationFoundQuery ? { topVerificationFoundQuery: agent.topVerificationFoundQuery } : {}),
    ...(agent.topVerificationMissingQuery ? { topVerificationMissingQuery: agent.topVerificationMissingQuery } : {}),
    resultCount: agent.resultCount,
    resultChoiceCount: agent.resultChoiceCount,
    ...(agent.topResultChoicePath ? { topResultChoicePath: agent.topResultChoicePath } : {}),
    ...(agent.topResultChoiceTitle ? { topResultChoiceTitle: agent.topResultChoiceTitle } : {}),
    ...(agent.topResultChoiceUrl ? { topResultChoiceUrl: agent.topResultChoiceUrl } : {}),
    ...(agent.topResultChoiceHost ? { topResultChoiceHost: agent.topResultChoiceHost } : {}),
    ...(agent.topResultChoiceSnippet ? { topResultChoiceSnippet: agent.topResultChoiceSnippet } : {}),
    ...(agent.topResultChoiceCommandArgs ? { topResultChoiceCommandArgs: agent.topResultChoiceCommandArgs } : agent.resultChoices[0] ? { topResultChoiceCommandArgs: compactAgentResultChoice(agent.resultChoices[0], searchCommandContext, pageLinkContext).commandArgs } : {}),
    ...(typeof agent.topResultChoiceRank === "number" ? { topResultChoiceRank: agent.topResultChoiceRank } : {}),
    ...(agent.topResultChoiceOpenResult ? { topResultChoiceOpenResult: agent.topResultChoiceOpenResult } : agent.resultChoices[0] ? { topResultChoiceOpenResult: compactAgentResultChoice(agent.resultChoices[0], searchCommandContext, pageLinkContext).openResult } : {}),
    ...(typeof agent.topResultChoiceRecommended === "boolean" ? { topResultChoiceRecommended: agent.topResultChoiceRecommended } : {}),
    ...(typeof agent.topResultChoicePrimary === "boolean" ? { topResultChoicePrimary: agent.topResultChoicePrimary } : {}),
    ...(agent.topResultChoiceSourceType ? { topResultChoiceSourceType: agent.topResultChoiceSourceType } : {}),
    ...(typeof agent.topResultChoiceSourceScore === "number" ? { topResultChoiceSourceScore: agent.topResultChoiceSourceScore } : {}),
    ...(agent.topResultChoiceSourceHints?.length ? { topResultChoiceSourceHints: agent.topResultChoiceSourceHints } : {}),
    ...(agent.topResultChoiceDateText ? { topResultChoiceDateText: agent.topResultChoiceDateText } : {}),
    ...(agent.topResultChoiceRelevance ? { topResultChoiceRelevance: agent.topResultChoiceRelevance } : {}),
    ...(agent.topResultChoiceMatchedTerm ? { topResultChoiceMatchedTerm: agent.topResultChoiceMatchedTerm } : {}),
    ...(agent.topResultChoiceFindMatch ? { topResultChoiceFindMatch: agent.topResultChoiceFindMatch } : {}),
    ...(typeof agent.topResultChoiceLikelyOfficial === "boolean" ? { topResultChoiceLikelyOfficial: agent.topResultChoiceLikelyOfficial } : {}),
    ...(typeof agent.topResultChoiceSitelinkCount === "number" ? { topResultChoiceSitelinkCount: agent.topResultChoiceSitelinkCount } : {}),
    ...(agent.topResultChoiceFirstSitelinkTitle ? { topResultChoiceFirstSitelinkTitle: agent.topResultChoiceFirstSitelinkTitle } : {}),
    ...(agent.topResultChoiceFirstSitelinkUrl ? { topResultChoiceFirstSitelinkUrl: agent.topResultChoiceFirstSitelinkUrl } : {}),
    ...(agent.topResultChoiceReason ? { topResultChoiceReason: agent.topResultChoiceReason } : {}),
    evidenceCount: agent.evidenceCount,
    formCount: agent.formCount,
    formChoiceCount: agent.formChoiceCount,
    ...(agent.formChoices.length > 0 ? { formChoices: compactAgentFormExecutionRefs(agent.formChoices) } : {}),
    actionTargetCount: agent.actionTargetCount,
    actionTargetChoiceCount: agent.actionTargetChoiceCount,
    ...(agent.actionTargetChoices.length > 0 ? { actionTargetChoices: compactAgentActionTargetExecutionRefs(agent.actionTargetChoices) } : {}),
    ...(agent.topFormChoicePath ? { topFormChoicePath: agent.topFormChoicePath } : {}),
    ...(agent.topFormChoiceMethod ? { topFormChoiceMethod: agent.topFormChoiceMethod } : {}),
    ...(agent.topFormChoiceActionUrl ? { topFormChoiceActionUrl: agent.topFormChoiceActionUrl } : {}),
    ...(agent.topFormChoiceSubmitText ? { topFormChoiceSubmitText: agent.topFormChoiceSubmitText } : {}),
    ...(agent.topFormChoiceQueryField ? { topFormChoiceQueryField: agent.topFormChoiceQueryField } : {}),
    ...(agent.topFormChoiceUrlTemplate ? { topFormChoiceUrlTemplate: agent.topFormChoiceUrlTemplate } : {}),
    ...(typeof agent.topFormChoiceFieldCount === "number" ? { topFormChoiceFieldCount: agent.topFormChoiceFieldCount } : {}),
    ...(agent.topFormChoiceSelector ? { topFormChoiceSelector: agent.topFormChoiceSelector } : {}),
    ...(agent.topFormChoiceFirstFieldName ? { topFormChoiceFirstFieldName: agent.topFormChoiceFirstFieldName } : {}),
    ...(agent.topFormChoiceFirstFieldType ? { topFormChoiceFirstFieldType: agent.topFormChoiceFirstFieldType } : {}),
    ...(agent.topFormChoiceFirstFieldLabel ? { topFormChoiceFirstFieldLabel: agent.topFormChoiceFirstFieldLabel } : {}),
    ...(typeof agent.topFormChoiceFirstFieldRequired === "boolean" ? { topFormChoiceFirstFieldRequired: agent.topFormChoiceFirstFieldRequired } : {}),
    ...(agent.topFormChoiceFirstFieldSelector ? { topFormChoiceFirstFieldSelector: agent.topFormChoiceFirstFieldSelector } : {}),
    ...(agent.topActionTargetChoicePath ? { topActionTargetChoicePath: agent.topActionTargetChoicePath } : {}),
    ...(agent.topActionTargetChoiceKind ? { topActionTargetChoiceKind: agent.topActionTargetChoiceKind } : {}),
    ...(agent.topActionTargetChoiceName ? { topActionTargetChoiceName: agent.topActionTargetChoiceName } : {}),
    ...(agent.topActionTargetChoiceSource ? { topActionTargetChoiceSource: agent.topActionTargetChoiceSource } : {}),
    ...(agent.topActionTargetChoiceTargetUrl ? { topActionTargetChoiceTargetUrl: agent.topActionTargetChoiceTargetUrl } : {}),
    ...(agent.topActionTargetChoiceUrlTemplate ? { topActionTargetChoiceUrlTemplate: agent.topActionTargetChoiceUrlTemplate } : {}),
    ...(agent.topActionTargetChoiceQueryInput ? { topActionTargetChoiceQueryInput: agent.topActionTargetChoiceQueryInput } : {}),
    ...(agent.topActionTargetChoiceMethod ? { topActionTargetChoiceMethod: agent.topActionTargetChoiceMethod } : {}),
    ...(typeof agent.topActionTargetChoiceDisabled === "boolean" ? { topActionTargetChoiceDisabled: agent.topActionTargetChoiceDisabled } : {}),
    ...(typeof agent.topActionTargetChoicePressed !== "undefined" ? { topActionTargetChoicePressed: agent.topActionTargetChoicePressed } : {}),
    ...(typeof agent.topActionTargetChoiceExpanded === "boolean" ? { topActionTargetChoiceExpanded: agent.topActionTargetChoiceExpanded } : {}),
    ...(typeof agent.topActionTargetChoiceHaspopup !== "undefined" ? { topActionTargetChoiceHaspopup: agent.topActionTargetChoiceHaspopup } : {}),
    ...(agent.topActionTargetChoiceControls ? { topActionTargetChoiceControls: agent.topActionTargetChoiceControls } : {}),
    ...(agent.topActionTargetChoiceSelector ? { topActionTargetChoiceSelector: agent.topActionTargetChoiceSelector } : {}),
    barrierCount: agent.barrierCount,
    ...(agent.topBarrierKind ? { topBarrierKind: agent.topBarrierKind } : {}),
    ...(agent.topBarrierSeverity ? { topBarrierSeverity: agent.topBarrierSeverity } : {}),
    ...(agent.topBarrierPath ? { topBarrierPath: agent.topBarrierPath } : {}),
    ...(agent.topBarrierText ? { topBarrierText: agent.topBarrierText } : {}),
    ...(agent.topBarrierSelector ? { topBarrierSelector: agent.topBarrierSelector } : {}),
    dataTableCount: agent.dataTableCount,
    faqCount: agent.faqCount,
    codeBlockCount: agent.codeBlockCount,
    resourceCount: agent.resourceCount,
    mediaCount: agent.mediaCount,
    sectionCount: agent.sectionCount,
    breadcrumbCount: agent.breadcrumbCount,
    paginationCount: agent.paginationCount,
    tocCount: agent.tocCount,
    embedCount: agent.embedCount,
    transcriptCount: agent.transcriptCount,
    authorLinkCount: agent.authorLinkCount,
    provenanceCount: agent.provenanceCount,
    offerCount: agent.offerCount,
    datasetCount: agent.datasetCount,
    identityCount: agent.identityCount,
    timelineCount: agent.timelineCount,
    contactPointCount: agent.contactPointCount,
    ...(agent.topDataTablePath ? { topDataTablePath: agent.topDataTablePath } : {}),
    ...(agent.topDataTableCaption ? { topDataTableCaption: agent.topDataTableCaption } : {}),
    ...(typeof agent.topDataTableRowCount === "number" ? { topDataTableRowCount: agent.topDataTableRowCount } : {}),
    ...(typeof agent.topDataTableColumnCount === "number" ? { topDataTableColumnCount: agent.topDataTableColumnCount } : {}),
    ...(typeof agent.topDataTableHeaderCount === "number" ? { topDataTableHeaderCount: agent.topDataTableHeaderCount } : {}),
    ...(agent.topDataTableFirstHeader ? { topDataTableFirstHeader: agent.topDataTableFirstHeader } : {}),
    ...(agent.topDataTableFirstRow?.length ? { topDataTableFirstRow: agent.topDataTableFirstRow } : {}),
    ...(agent.topDataTableFirstCell ? { topDataTableFirstCell: agent.topDataTableFirstCell } : {}),
    ...(agent.topDataTableSelector ? { topDataTableSelector: agent.topDataTableSelector } : {}),
    ...(agent.topFaqQuestion ? { topFaqQuestion: agent.topFaqQuestion } : {}),
    ...(agent.topFaqAnswer ? { topFaqAnswer: agent.topFaqAnswer } : {}),
    ...(agent.topCodeBlockLanguage ? { topCodeBlockLanguage: agent.topCodeBlockLanguage } : {}),
    ...(typeof agent.topCodeBlockLineCount === "number" ? { topCodeBlockLineCount: agent.topCodeBlockLineCount } : {}),
    ...(agent.topCodeBlockText ? { topCodeBlockText: agent.topCodeBlockText } : {}),
    ...(agent.topResourceKind ? { topResourceKind: agent.topResourceKind } : {}),
    ...(agent.topResourceUrl ? { topResourceUrl: agent.topResourceUrl } : {}),
    ...(agent.topResourceTitle ? { topResourceTitle: agent.topResourceTitle } : {}),
    ...(agent.topMediaKind ? { topMediaKind: agent.topMediaKind } : {}),
    ...(agent.topMediaUrl ? { topMediaUrl: agent.topMediaUrl } : {}),
    ...(agent.topMediaText ? { topMediaText: agent.topMediaText } : {}),
    ...(agent.topSectionPath ? { topSectionPath: agent.topSectionPath } : {}),
    ...(agent.topSectionHeading ? { topSectionHeading: agent.topSectionHeading } : {}),
    ...(typeof agent.topSectionLevel === "number" ? { topSectionLevel: agent.topSectionLevel } : {}),
    ...(agent.topSectionText ? { topSectionText: agent.topSectionText } : {}),
    ...(agent.topSectionSelector ? { topSectionSelector: agent.topSectionSelector } : {}),
    ...(agent.topBreadcrumbPath ? { topBreadcrumbPath: agent.topBreadcrumbPath } : {}),
    ...(agent.topBreadcrumbText ? { topBreadcrumbText: agent.topBreadcrumbText } : {}),
    ...(agent.topBreadcrumbSource ? { topBreadcrumbSource: agent.topBreadcrumbSource } : {}),
    ...(agent.topPaginationPath ? { topPaginationPath: agent.topPaginationPath } : {}),
    ...(agent.topPaginationKind ? { topPaginationKind: agent.topPaginationKind } : {}),
    ...(agent.topPaginationLabel ? { topPaginationLabel: agent.topPaginationLabel } : {}),
    ...(agent.topPaginationUrl ? { topPaginationUrl: agent.topPaginationUrl } : {}),
    ...(typeof agent.topPaginationCurrent === "boolean" ? { topPaginationCurrent: agent.topPaginationCurrent } : {}),
    ...(agent.topPaginationSelector ? { topPaginationSelector: agent.topPaginationSelector } : {}),
    ...(agent.topTocPath ? { topTocPath: agent.topTocPath } : {}),
    ...(agent.topTocTitle ? { topTocTitle: agent.topTocTitle } : {}),
    ...(typeof agent.topTocItemCount === "number" ? { topTocItemCount: agent.topTocItemCount } : {}),
    ...(agent.topTocText ? { topTocText: agent.topTocText } : {}),
    ...(agent.topTocFirstItemLabel ? { topTocFirstItemLabel: agent.topTocFirstItemLabel } : {}),
    ...(agent.topTocFirstItemUrl ? { topTocFirstItemUrl: agent.topTocFirstItemUrl } : {}),
    ...(agent.topTocSelector ? { topTocSelector: agent.topTocSelector } : {}),
    ...(agent.topEmbedKind ? { topEmbedKind: agent.topEmbedKind } : {}),
    ...(agent.topEmbedUrl ? { topEmbedUrl: agent.topEmbedUrl } : {}),
    ...(agent.topEmbedTitle ? { topEmbedTitle: agent.topEmbedTitle } : {}),
    ...(agent.topTranscriptKind ? { topTranscriptKind: agent.topTranscriptKind } : {}),
    ...(agent.topTranscriptUrl ? { topTranscriptUrl: agent.topTranscriptUrl } : {}),
    ...(agent.topTranscriptLabel ? { topTranscriptLabel: agent.topTranscriptLabel } : {}),
    ...(agent.topTranscriptLanguage ? { topTranscriptLanguage: agent.topTranscriptLanguage } : {}),
    ...(agent.topAuthorLinkName ? { topAuthorLinkName: agent.topAuthorLinkName } : {}),
    ...(agent.topAuthorLinkUrl ? { topAuthorLinkUrl: agent.topAuthorLinkUrl } : {}),
    ...(agent.topAuthorLinkSource ? { topAuthorLinkSource: agent.topAuthorLinkSource } : {}),
    ...(agent.topProvenancePath ? { topProvenancePath: agent.topProvenancePath } : {}),
    ...(agent.topProvenanceKind ? { topProvenanceKind: agent.topProvenanceKind } : {}),
    ...(agent.topProvenanceLabel ? { topProvenanceLabel: agent.topProvenanceLabel } : {}),
    ...(agent.topProvenanceValue ? { topProvenanceValue: agent.topProvenanceValue } : {}),
    ...(agent.topProvenanceUrl ? { topProvenanceUrl: agent.topProvenanceUrl } : {}),
    ...(agent.topProvenanceSource ? { topProvenanceSource: agent.topProvenanceSource } : {}),
    ...(agent.topProvenanceSelector ? { topProvenanceSelector: agent.topProvenanceSelector } : {}),
    ...(agent.topOfferPath ? { topOfferPath: agent.topOfferPath } : {}),
    ...(agent.topOfferName ? { topOfferName: agent.topOfferName } : {}),
    ...(agent.topOfferPrice ? { topOfferPrice: agent.topOfferPrice } : {}),
    ...(agent.topOfferCurrency ? { topOfferCurrency: agent.topOfferCurrency } : {}),
    ...(agent.topOfferAvailability ? { topOfferAvailability: agent.topOfferAvailability } : {}),
    ...(agent.topOfferUrl ? { topOfferUrl: agent.topOfferUrl } : {}),
    ...(agent.topOfferSelector ? { topOfferSelector: agent.topOfferSelector } : {}),
    ...(agent.topDatasetPath ? { topDatasetPath: agent.topDatasetPath } : {}),
    ...(agent.topDatasetKind ? { topDatasetKind: agent.topDatasetKind } : {}),
    ...(agent.topDatasetName ? { topDatasetName: agent.topDatasetName } : {}),
    ...(agent.topDatasetUrl ? { topDatasetUrl: agent.topDatasetUrl } : {}),
    ...(agent.topDatasetDistributionUrl ? { topDatasetDistributionUrl: agent.topDatasetDistributionUrl } : {}),
    ...(agent.topDatasetLicenseUrl ? { topDatasetLicenseUrl: agent.topDatasetLicenseUrl } : {}),
    ...(agent.topDatasetEncodingFormat ? { topDatasetEncodingFormat: agent.topDatasetEncodingFormat } : {}),
    ...(agent.topDatasetSelector ? { topDatasetSelector: agent.topDatasetSelector } : {}),
    ...(agent.topIdentityPath ? { topIdentityPath: agent.topIdentityPath } : {}),
    ...(agent.topIdentityKind ? { topIdentityKind: agent.topIdentityKind } : {}),
    ...(agent.topIdentityName ? { topIdentityName: agent.topIdentityName } : {}),
    ...(agent.topIdentityUrl ? { topIdentityUrl: agent.topIdentityUrl } : {}),
    ...(agent.topIdentityLogoUrl ? { topIdentityLogoUrl: agent.topIdentityLogoUrl } : {}),
    ...(agent.topIdentitySameAsUrl ? { topIdentitySameAsUrl: agent.topIdentitySameAsUrl } : {}),
    ...(agent.topIdentitySource ? { topIdentitySource: agent.topIdentitySource } : {}),
    ...(agent.topIdentitySelector ? { topIdentitySelector: agent.topIdentitySelector } : {}),
    ...(agent.topTimelinePath ? { topTimelinePath: agent.topTimelinePath } : {}),
    ...(agent.topTimelineKind ? { topTimelineKind: agent.topTimelineKind } : {}),
    ...(agent.topTimelineLabel ? { topTimelineLabel: agent.topTimelineLabel } : {}),
    ...(agent.topTimelineValue ? { topTimelineValue: agent.topTimelineValue } : {}),
    ...(agent.topTimelineSource ? { topTimelineSource: agent.topTimelineSource } : {}),
    ...(agent.topTimelineSelector ? { topTimelineSelector: agent.topTimelineSelector } : {}),
    ...(agent.topContactPointPath ? { topContactPointPath: agent.topContactPointPath } : {}),
    ...(agent.topContactPointKind ? { topContactPointKind: agent.topContactPointKind } : {}),
    ...(agent.topContactPointLabel ? { topContactPointLabel: agent.topContactPointLabel } : {}),
    ...(agent.topContactPointValue ? { topContactPointValue: agent.topContactPointValue } : {}),
    ...(agent.topContactPointUrl ? { topContactPointUrl: agent.topContactPointUrl } : {}),
    ...(agent.topContactPointSource ? { topContactPointSource: agent.topContactPointSource } : {}),
    ...(agent.topContactPointSelector ? { topContactPointSelector: agent.topContactPointSelector } : {}),
    structuredReadTargetCount: agent.structuredReadTargetCount,
    ...(agent.bestStructuredReadTarget ? { bestStructuredReadTarget: agent.bestStructuredReadTarget } : {}),
    ...(typeof agent.bestStructuredReadTargetCount === "number" ? { bestStructuredReadTargetCount: agent.bestStructuredReadTargetCount } : {}),
    ...(typeof agent.bestStructuredReadTargetScore === "number" ? { bestStructuredReadTargetScore: agent.bestStructuredReadTargetScore } : {}),
    ...(typeof agent.bestStructuredReadTargetPrimary === "boolean" ? { bestStructuredReadTargetPrimary: agent.bestStructuredReadTargetPrimary } : {}),
    ...(agent.bestStructuredReadTargetReason ? { bestStructuredReadTargetReason: agent.bestStructuredReadTargetReason } : {}),
    hiddenSignalCount: agent.hiddenSignalCount,
    hiddenHydrationCount: agent.hiddenHydrationCount,
    hiddenApiEndpointCount: agent.hiddenApiEndpointCount,
    hiddenClientStateCount: agent.hiddenClientStateCount,
    hiddenAppHintCount: agent.hiddenAppHintCount,
    ...(agent.topHydrationPath ? { topHydrationPath: agent.topHydrationPath } : {}),
    ...(agent.topHydrationKind ? { topHydrationKind: agent.topHydrationKind } : {}),
    ...(agent.topHydrationLabel ? { topHydrationLabel: agent.topHydrationLabel } : {}),
    ...(agent.topHydrationUrl ? { topHydrationUrl: agent.topHydrationUrl } : {}),
    ...(agent.topHydrationSelector ? { topHydrationSelector: agent.topHydrationSelector } : {}),
    ...(agent.topApiEndpointPath ? { topApiEndpointPath: agent.topApiEndpointPath } : {}),
    ...(agent.topApiEndpointKind ? { topApiEndpointKind: agent.topApiEndpointKind } : {}),
    ...(agent.topApiEndpointMethod ? { topApiEndpointMethod: agent.topApiEndpointMethod } : {}),
    ...(agent.topApiEndpointUrl ? { topApiEndpointUrl: agent.topApiEndpointUrl } : {}),
    ...(agent.topApiEndpointSelector ? { topApiEndpointSelector: agent.topApiEndpointSelector } : {}),
    ...(agent.topClientStatePath ? { topClientStatePath: agent.topClientStatePath } : {}),
    ...(agent.topClientStateKind ? { topClientStateKind: agent.topClientStateKind } : {}),
    ...(agent.topClientStateOperation ? { topClientStateOperation: agent.topClientStateOperation } : {}),
    ...(agent.topClientStateKey ? { topClientStateKey: agent.topClientStateKey } : {}),
    ...(agent.topClientStateSelector ? { topClientStateSelector: agent.topClientStateSelector } : {}),
    ...(agent.topAppHintPath ? { topAppHintPath: agent.topAppHintPath } : {}),
    ...(agent.topAppHintKind ? { topAppHintKind: agent.topAppHintKind } : {}),
    ...(agent.topAppHintLabel ? { topAppHintLabel: agent.topAppHintLabel } : {}),
    ...(agent.topAppHintUrl ? { topAppHintUrl: agent.topAppHintUrl } : {}),
    ...(agent.topAppHintSelector ? { topAppHintSelector: agent.topAppHintSelector } : {}),
    ...(agent.topHiddenSignalGroup ? { topHiddenSignalGroup: agent.topHiddenSignalGroup } : {}),
    ...(agent.topHiddenSignalPath ? { topHiddenSignalPath: agent.topHiddenSignalPath } : {}),
    ...(agent.topHiddenSignalKind ? { topHiddenSignalKind: agent.topHiddenSignalKind } : {}),
    ...(agent.topHiddenSignalText ? { topHiddenSignalText: agent.topHiddenSignalText } : {}),
    ...(agent.topHiddenSignalUrl ? { topHiddenSignalUrl: agent.topHiddenSignalUrl } : {}),
    ...(agent.topHiddenSignalSource ? { topHiddenSignalSource: agent.topHiddenSignalSource } : {}),
    ...(agent.topHiddenSignalSelector ? { topHiddenSignalSelector: agent.topHiddenSignalSelector } : {}),
    hiddenReadTargetCount: agent.hiddenReadTargetCount,
    ...(agent.bestHiddenReadTarget ? { bestHiddenReadTarget: agent.bestHiddenReadTarget } : {}),
    ...(typeof agent.bestHiddenReadTargetCount === "number" ? { bestHiddenReadTargetCount: agent.bestHiddenReadTargetCount } : {}),
    ...(typeof agent.bestHiddenReadTargetScore === "number" ? { bestHiddenReadTargetScore: agent.bestHiddenReadTargetScore } : {}),
    ...(typeof agent.bestHiddenReadTargetPrimary === "boolean" ? { bestHiddenReadTargetPrimary: agent.bestHiddenReadTargetPrimary } : {}),
    ...(agent.bestHiddenReadTargetReason ? { bestHiddenReadTargetReason: agent.bestHiddenReadTargetReason } : {}),
    sourceLinkCount: agent.sourceLinkCount,
    sourceChoiceCount: agent.sourceChoiceCount,
    ...(agent.topSourceChoicePath ? { topSourceChoicePath: agent.topSourceChoicePath } : {}),
    ...(agent.topSourceChoiceTitle ? { topSourceChoiceTitle: agent.topSourceChoiceTitle } : {}),
    ...(agent.topSourceChoiceUrl ? { topSourceChoiceUrl: agent.topSourceChoiceUrl } : {}),
    ...(agent.topSourceChoiceHost ? { topSourceChoiceHost: agent.topSourceChoiceHost } : {}),
    ...(agent.topSourceChoiceSnippet ? { topSourceChoiceSnippet: agent.topSourceChoiceSnippet } : {}),
    ...(agent.topSourceChoiceCommandArgs ? { topSourceChoiceCommandArgs: agent.topSourceChoiceCommandArgs } : {}),
    ...(agent.topSourceChoiceSourceType ? { topSourceChoiceSourceType: agent.topSourceChoiceSourceType } : {}),
    ...(typeof agent.topSourceChoiceSourceScore === "number" ? { topSourceChoiceSourceScore: agent.topSourceChoiceSourceScore } : {}),
    ...(agent.topSourceChoiceSourceHints?.length ? { topSourceChoiceSourceHints: agent.topSourceChoiceSourceHints } : {}),
    ...(typeof agent.topSourceChoicePrimary === "boolean" ? { topSourceChoicePrimary: agent.topSourceChoicePrimary } : {}),
    ...(agent.topSourceChoiceReason ? { topSourceChoiceReason: agent.topSourceChoiceReason } : {}),
    ...compactAgentTopChoice(agent, searchCommandContext, pageLinkContext),
    ...(agent.sourceSearchQuery ? { sourceSearchQuery: agent.sourceSearchQuery } : {}),
    ...(agent.sourceSearchEngine ? { sourceSearchEngine: agent.sourceSearchEngine } : {}),
    ...(agent.sourceSearchSelectedEngine ? { sourceSearchSelectedEngine: agent.sourceSearchSelectedEngine } : {}),
    ...(agent.sourceSearchSearchUrl ? { sourceSearchSearchUrl: agent.sourceSearchSearchUrl } : {}),
    ...(agent.sourceSearchLang ? { sourceSearchLang: agent.sourceSearchLang } : {}),
    ...(agent.sourceSearchRegion ? { sourceSearchRegion: agent.sourceSearchRegion } : {}),
    ...(typeof agent.sourceSearchFindQueryCount === "number" ? { sourceSearchFindQueryCount: agent.sourceSearchFindQueryCount } : {}),
    ...(agent.sourceSearchTopFindQuery ? { sourceSearchTopFindQuery: agent.sourceSearchTopFindQuery } : {}),
    ...(typeof agent.sourceSearchSelectedRank === "number" ? { sourceSearchSelectedRank: agent.sourceSearchSelectedRank } : {}),
    ...(agent.sourceSearchSelectedTitle ? { sourceSearchSelectedTitle: agent.sourceSearchSelectedTitle } : {}),
    ...(agent.sourceSearchSelectedUrl ? { sourceSearchSelectedUrl: agent.sourceSearchSelectedUrl } : {}),
    ...(agent.sourceSearchSelectedHost ? { sourceSearchSelectedHost: agent.sourceSearchSelectedHost } : {}),
    ...(agent.sourceSearchSelectedPath ? { sourceSearchSelectedPath: agent.sourceSearchSelectedPath } : {}),
    ...(agent.sourceSearchSelectedOpenResult ? { sourceSearchSelectedOpenResult: agent.sourceSearchSelectedOpenResult } : {}),
    ...(agent.sourceSearchSelectedCommandArgs ? { sourceSearchSelectedCommandArgs: agent.sourceSearchSelectedCommandArgs } : {}),
    ...(agent.sourceSearchSelectedReason ? { sourceSearchSelectedReason: agent.sourceSearchSelectedReason } : {}),
    ...(agent.sourceSearchFailureCode ? { sourceSearchFailureCode: agent.sourceSearchFailureCode } : {}),
    ...(typeof agent.sourceSearchFailureStatus === "number" ? { sourceSearchFailureStatus: agent.sourceSearchFailureStatus } : {}),
    ...(agent.sourceSearchFailureUrl ? { sourceSearchFailureUrl: agent.sourceSearchFailureUrl } : {}),
    ...(agent.sourceSearchFailureReason ? { sourceSearchFailureReason: agent.sourceSearchFailureReason } : {}),
    sourceSearchAlternateCount: agent.sourceSearchAlternateCount,
    ...(agent.sourceSearchAlternatePath ? { sourceSearchAlternatePath: agent.sourceSearchAlternatePath } : {}),
    ...(agent.sourceSearchAlternateTitle ? { sourceSearchAlternateTitle: agent.sourceSearchAlternateTitle } : {}),
    ...(agent.sourceSearchAlternateUrl ? { sourceSearchAlternateUrl: agent.sourceSearchAlternateUrl } : {}),
    ...(agent.sourceSearchAlternateHost ? { sourceSearchAlternateHost: agent.sourceSearchAlternateHost } : {}),
    ...(typeof agent.sourceSearchAlternateRank === "number" ? { sourceSearchAlternateRank: agent.sourceSearchAlternateRank } : {}),
    ...(agent.sourceSearchAlternateOpenResult ? { sourceSearchAlternateOpenResult: agent.sourceSearchAlternateOpenResult } : {}),
    ...(agent.sourceSearchAlternateCommandArgs ? { sourceSearchAlternateCommandArgs: agent.sourceSearchAlternateCommandArgs } : {}),
    ...(agent.sourceSearchAlternateReason ? { sourceSearchAlternateReason: agent.sourceSearchAlternateReason } : {}),
    evidenceQualityScore: agent.evidenceQualityScore,
    sourceQualityScore: agent.sourceQualityScore,
    ...(agent.diagnosticErrorCount || agent.diagnosticWarningCount ? {
      diagnostics: {
        errors: agent.diagnosticErrorCount,
        warnings: agent.diagnosticWarningCount,
      },
    } : {}),
    ...(agent.topDiagnosticCode ? { topDiagnosticCode: agent.topDiagnosticCode } : {}),
    ...(agent.topDiagnosticSeverity ? { topDiagnosticSeverity: agent.topDiagnosticSeverity } : {}),
    ...(agent.topDiagnosticMessage ? { topDiagnosticMessage: agent.topDiagnosticMessage } : {}),
    citationCount: agent.citationCount,
    ...(agent.citations.length > 0 ? { citations: agent.citations.map(compactAgentCitationRef) } : {}),
    ...(agent.topCitationId ? { topCitationId: agent.topCitationId } : {}),
    ...(agent.topCitationPath ? { topCitationPath: agent.topCitationPath } : {}),
    ...(agent.topCitationKind ? { topCitationKind: agent.topCitationKind } : {}),
    ...(agent.topCitationText ? { topCitationText: agent.topCitationText } : {}),
    ...(agent.topCitationTitle ? { topCitationTitle: agent.topCitationTitle } : {}),
    ...(agent.topCitationUrl ? { topCitationUrl: agent.topCitationUrl } : {}),
    ...(agent.topCitationConfidence ? { topCitationConfidence: agent.topCitationConfidence } : {}),
    ...(agent.topCitationReason ? { topCitationReason: agent.topCitationReason } : {}),
    ...(typeof agent.topCitationScore === "number" ? { topCitationScore: agent.topCitationScore } : {}),
    answerEvidenceCount: agent.answerEvidenceCount,
    ...(agent.topAnswerEvidenceId ? { topAnswerEvidenceId: agent.topAnswerEvidenceId } : {}),
    ...(agent.topAnswerEvidencePath ? { topAnswerEvidencePath: agent.topAnswerEvidencePath } : {}),
    ...(agent.topAnswerEvidenceKind ? { topAnswerEvidenceKind: agent.topAnswerEvidenceKind } : {}),
    ...(agent.topAnswerEvidenceText ? { topAnswerEvidenceText: agent.topAnswerEvidenceText } : {}),
    ...(agent.topAnswerEvidenceTitle ? { topAnswerEvidenceTitle: agent.topAnswerEvidenceTitle } : {}),
    ...(agent.topAnswerEvidenceUrl ? { topAnswerEvidenceUrl: agent.topAnswerEvidenceUrl } : {}),
    ...(agent.topAnswerEvidenceConfidence ? { topAnswerEvidenceConfidence: agent.topAnswerEvidenceConfidence } : {}),
    ...(agent.topAnswerEvidenceReason ? { topAnswerEvidenceReason: agent.topAnswerEvidenceReason } : {}),
    ...(agent.answerPlanStatus ? { answerPlanStatus: agent.answerPlanStatus } : {}),
    ...(agent.answerPlanConfidence ? { answerPlanConfidence: agent.answerPlanConfidence } : {}),
    ...(agent.answerPlanReason ? { answerPlanReason: agent.answerPlanReason } : {}),
    ...(agent.answerPlanNextAction ? { answerPlanNextAction: agent.answerPlanNextAction } : {}),
    ...(typeof agent.answerGapCount === "number" ? { answerGapCount: agent.answerGapCount } : {}),
    ...(typeof agent.answerUseCitationCount === "number" ? { answerUseCitationCount: agent.answerUseCitationCount } : {}),
    ...(agent.topAnswerUseCitationId ? { topAnswerUseCitationId: agent.topAnswerUseCitationId } : {}),
    ...(agent.answerUseCitationIds && agent.answerUseCitationIds.length > 0 ? { answerUseCitationIds: agent.answerUseCitationIds } : {}),
    ...(agent.answerPlanReadFrom ? { answerPlanReadFrom: agent.answerPlanReadFrom } : {}),
    ...(agent.answerPlanCommandArgs ? { answerPlanCommandArgs: agent.answerPlanCommandArgs } : {}),
    ...(agent.answerPlanAfterInteractionCommand ? { answerPlanAfterInteractionCommand: agent.answerPlanAfterInteractionCommand } : {}),
    ...(agent.answerPlanAfterInteractionCommandArgs ? { answerPlanAfterInteractionCommandArgs: agent.answerPlanAfterInteractionCommandArgs } : {}),
    ...(agent.answerPlanUrl ? { answerPlanUrl: agent.answerPlanUrl } : {}),
    readTargetCount: agent.readTargetCount,
    ...(agent.readTargets.length > 0 ? { readTargets: agent.readTargets.map((target) => compactAgentReadTargetRef(target)) } : {}),
    ...(agent.topReadTarget ? { topReadTarget: agent.topReadTarget } : {}),
    ...(typeof agent.topReadTargetCount === "number" ? { topReadTargetCount: agent.topReadTargetCount } : {}),
    ...(typeof agent.topReadTargetScore === "number" ? { topReadTargetScore: agent.topReadTargetScore } : {}),
    ...(typeof agent.topReadTargetPrimary === "boolean" ? { topReadTargetPrimary: agent.topReadTargetPrimary } : {}),
    ...(agent.topReadTargetReason ? { topReadTargetReason: agent.topReadTargetReason } : {}),
    actionCount: agent.actionCount,
    ...(agent.topActionName ? { topActionName: agent.topActionName } : {}),
    ...(agent.topActionSource ? { topActionSource: agent.topActionSource } : {}),
    ...(agent.topActionExecution ? { topActionExecution: agent.topActionExecution } : {}),
    ...(agent.topActionPriority ? { topActionPriority: agent.topActionPriority } : {}),
    ...(agent.topActionReason ? { topActionReason: agent.topActionReason } : {}),
    ...(agent.topActionReadFrom ? { topActionReadFrom: agent.topActionReadFrom } : {}),
    ...(agent.topActionCommandArgs ? { topActionCommandArgs: agent.topActionCommandArgs } : {}),
    ...(agent.topActionUrl ? { topActionUrl: agent.topActionUrl } : {}),
    ...(agent.topActionSourceLinkRef ? { topActionSourceLinkRef: agent.topActionSourceLinkRef } : {}),
    ...(agent.topActionRequiresBrowserInteraction ? { topActionRequiresBrowserInteraction: true } : {}),
    ...(agent.alternativeActionName ? { alternativeActionName: agent.alternativeActionName } : {}),
    ...(agent.alternativeActionSource ? { alternativeActionSource: agent.alternativeActionSource } : {}),
    ...(agent.alternativeActionExecution ? { alternativeActionExecution: agent.alternativeActionExecution } : {}),
    ...(agent.alternativeActionPriority ? { alternativeActionPriority: agent.alternativeActionPriority } : {}),
    ...(agent.alternativeActionReadFrom ? { alternativeActionReadFrom: agent.alternativeActionReadFrom } : {}),
    ...(agent.alternativeActionCommandArgs ? { alternativeActionCommandArgs: agent.alternativeActionCommandArgs } : {}),
    ...(agent.alternativeActionUrl ? { alternativeActionUrl: agent.alternativeActionUrl } : {}),
    ...(agent.alternativeActionSourceLinkRef ? { alternativeActionSourceLinkRef: agent.alternativeActionSourceLinkRef } : {}),
    ...(agent.alternativeActionRequiresBrowserInteraction ? { alternativeActionRequiresBrowserInteraction: true } : {}),
    ...(agent.bestReadTarget ? { bestReadTarget: agent.bestReadTarget } : {}),
    ...(typeof agent.bestReadTargetCount === "number" ? { bestReadTargetCount: agent.bestReadTargetCount } : {}),
    ...(typeof agent.bestReadTargetScore === "number" ? { bestReadTargetScore: agent.bestReadTargetScore } : {}),
    ...(typeof agent.bestReadTargetPrimary === "boolean" ? { bestReadTargetPrimary: agent.bestReadTargetPrimary } : {}),
    ...(agent.executorDecision ? { executorDecision: agent.executorDecision } : {}),
    ...(agent.executorMode ? { executorMode: agent.executorMode } : {}),
    ...(agent.executorActionName ? { executorActionName: agent.executorActionName } : {}),
    ...(agent.executorOperation ? { executorOperation: agent.executorOperation } : {}),
    ...(agent.executorConfidence ? { executorConfidence: agent.executorConfidence } : {}),
    ...(typeof agent.executorAnswerReady === "boolean" ? { executorAnswerReady: agent.executorAnswerReady } : {}),
    ...(typeof agent.executorShouldContinue === "boolean" ? { executorShouldContinue: agent.executorShouldContinue } : {}),
    ...(typeof agent.executorTerminal === "boolean" ? { executorTerminal: agent.executorTerminal } : {}),
    ...(agent.executorCommandArgs ? { executorCommandArgs: agent.executorCommandArgs } : {}),
    ...(agent.executorReadFrom ? { executorReadFrom: agent.executorReadFrom } : {}),
    ...(agent.executorUrl ? { executorUrl: agent.executorUrl } : {}),
    ...(agent.executorTargetUrl ? { executorTargetUrl: agent.executorTargetUrl } : {}),
    ...(agent.executorTargetPath ? { executorTargetPath: agent.executorTargetPath } : {}),
    ...(agent.executorTargetSelector ? { executorTargetSelector: agent.executorTargetSelector } : {}),
    ...(agent.executorTargetText ? { executorTargetText: agent.executorTargetText } : {}),
    ...(agent.executorExpectedOutcome ? { executorExpectedOutcome: agent.executorExpectedOutcome } : {}),
    ...(agent.handoffDecision ? { handoffDecision: agent.handoffDecision } : {}),
    ...(agent.handoffMode ? { handoffMode: agent.handoffMode } : {}),
    ...(agent.handoffActionName ? { handoffActionName: agent.handoffActionName } : {}),
    ...(agent.handoffOperation ? { handoffOperation: agent.handoffOperation } : {}),
    ...(agent.handoffAnswerStatus ? { handoffAnswerStatus: agent.handoffAnswerStatus } : {}),
    ...(agent.handoffConfidence ? { handoffConfidence: agent.handoffConfidence } : {}),
    ...(typeof agent.handoffAnswerReady === "boolean" ? { handoffAnswerReady: agent.handoffAnswerReady } : {}),
    ...(typeof agent.handoffShouldContinue === "boolean" ? { handoffShouldContinue: agent.handoffShouldContinue } : {}),
    ...(typeof agent.handoffTerminal === "boolean" ? { handoffTerminal: agent.handoffTerminal } : {}),
    ...(agent.handoffPriority ? { handoffPriority: agent.handoffPriority } : {}),
    ...(agent.handoffPriorityReason ? { handoffPriorityReason: agent.handoffPriorityReason } : {}),
    ...(agent.handoffCommandArgs ? { handoffCommandArgs: agent.handoffCommandArgs } : {}),
    ...(agent.handoffReadFrom ? { handoffReadFrom: agent.handoffReadFrom } : {}),
    ...(agent.handoffUrl ? { handoffUrl: agent.handoffUrl } : {}),
    ...(agent.handoffTargetUrl ? { handoffTargetUrl: agent.handoffTargetUrl } : {}),
    ...(agent.handoffTargetPath ? { handoffTargetPath: agent.handoffTargetPath } : {}),
    ...(agent.handoffTargetSelector ? { handoffTargetSelector: agent.handoffTargetSelector } : {}),
    ...(agent.handoffTargetText ? { handoffTargetText: agent.handoffTargetText } : {}),
    ...(agent.handoffExpectedOutcome ? { handoffExpectedOutcome: agent.handoffExpectedOutcome } : {}),
    ...(agent.primaryActionName ? { primaryActionName: agent.primaryActionName } : {}),
    ...(agent.primaryReason ? { primaryReason: agent.primaryReason } : {}),
    ...(agent.primaryPriority ? { primaryPriority: agent.primaryPriority } : {}),
    ...(agent.primaryPriorityReason ? { primaryPriorityReason: agent.primaryPriorityReason } : {}),
    ...(agent.primaryExecution ? { primaryExecution: agent.primaryExecution } : {}),
    ...(agent.primaryReadFrom ? { primaryReadFrom: agent.primaryReadFrom } : {}),
    ...(agent.primaryUrl ? { primaryUrl: agent.primaryUrl } : {}),
    ...(agent.primarySourceLinkRef ? { primarySourceLinkRef: agent.primarySourceLinkRef } : {}),
    ...(agent.primaryAction ? { primaryAction: compactAgentAction(agent.primaryAction, agent.primaryUrl ? { primaryUrl: agent.primaryUrl } : {}) } : {}),
    ...compactAgentRecommended(agent, searchCommandContext, pageLinkContext),
  };
}

function compactAgentBriefHandoff(handoff: AgentHandoff, primaryUrl?: string, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  const signals = compactAgentBriefHandoffSignals(handoff.signals);
  const qualityGates = compactAgentBriefHandoffQualityGates(handoff.qualityGates);
  const compact = {
    instruction: handoff.instruction,
    decision: handoff.decision,
    mode: handoff.mode,
    operation: handoff.operation,
    action: handoff.action,
    confidence: handoff.confidence,
    ...(handoff.priority ? { priority: handoff.priority } : {}),
    ...(handoff.priorityReason ? { priorityReason: handoff.priorityReason } : {}),
    answerStatus: handoff.answerStatus,
    answerReady: handoff.answerReady,
    shouldContinue: handoff.shouldContinue,
    terminal: handoff.terminal,
    maxSuggestedIterations: handoff.maxSuggestedIterations,
    expectedOutcome: handoff.expectedOutcome,
    reason: handoff.reason,
    ...(handoff.useCitationIds && handoff.useCitationIds.length > 0 ? { useCitationIds: handoff.useCitationIds } : {}),
    ...(handoff.verificationFoundQueries && handoff.verificationFoundQueries.length > 0 ? { verificationFoundQueries: handoff.verificationFoundQueries } : {}),
    ...(handoff.verificationMissingQueries && handoff.verificationMissingQueries.length > 0 ? { verificationMissingQueries: handoff.verificationMissingQueries } : {}),
    ...(handoff.readFrom ? { readFrom: handoff.readFrom } : {}),
    ...(handoff.commandArgs ? { commandArgs: handoff.commandArgs } : {}),
    ...(handoff.afterInteractionCommandArgs ? { afterInteractionCommandArgs: handoff.afterInteractionCommandArgs } : {}),
    ...(handoff.url ? { url: handoff.url } : {}),
    ...(handoff.target ? { target: compactAgentTarget(handoff.target, handoff.action) } : {}),
    ...(handoff.readTarget ? { readTarget: compactAgentHandoffReadTarget(handoff.readTarget) } : {}),
    ...(handoff.readValue ? { readValue: compactAgentReadValue(handoff.readValue, true) } : {}),
    ...(handoff.browserHtml ? { browserHtml: compactAgentBrowserHtml(handoff.browserHtml) } : {}),
    ...(handoff.sourceSearch ? { sourceSearch: handoff.sourceSearch } : {}),
    ...(handoff.resultChoices && handoff.resultChoices.length > 0 ? { resultChoices: compactAgentCommandList(handoff.resultChoices.map((choice) => compactAgentResultChoice(choice, searchCommandContext, pageLinkContext)), 900) } : {}),
    ...(handoff.sourceChoices && handoff.sourceChoices.length > 0 ? { sourceChoices: compactAgentSourceChoiceList(handoff.sourceChoices, 900) } : {}),
    ...(handoff.answerEvidence && handoff.answerEvidence.length > 0 ? { answerEvidence: handoff.answerEvidence.map(compactAgentAnswerEvidenceRef) } : {}),
    ...(signals.length > 0 ? { signals } : {}),
    ...(qualityGates.length > 0 ? { qualityGates } : {}),
  };
  return compactAgentUrlRefs(compact, primaryUrl);
}

function compactAgentBriefHandoffSignals(signals: AgentSignal[] | undefined): AgentSignal[] {
  return (signals ?? []).filter((signal) => signal.kind === "diagnostic" || signal.kind === "browser" || signal.kind === "response");
}

function compactAgentBriefHandoffQualityGates(gates: AgentQualityGate[] | undefined): object[] {
  const keep = (gates ?? []).filter((gate) => gate.kind === "fetch" || gate.kind === "browser" || gate.kind === "diagnostic" || gate.kind === "status");
  return compactAgentQualityGates(keep, 900);
}

function compactAgentBrowserHtml(browserHtml: AgentBrowserHtmlCapture): object {
  return {
    htmlFile: browserHtml.htmlFile,
    captureScript: browserHtml.captureScript,
    ...(browserHtml.url ? { url: browserHtml.url } : {}),
    ...(browserHtml.commandArgs ? { commandArgs: browserHtml.commandArgs } : {}),
  };
}

function compactAgentBriefPageCheck(
  pageCheck: PageCheckSummary,
  primaryAction: SuggestedAction | undefined,
  readTargets: AgentReadTarget[],
  commandContext?: PageLinkCommandContext,
): object {
  const readPaths = new Set(readTargets.map((target) => target.path));
  if (primaryAction?.readFrom) readPaths.add(primaryAction.readFrom);
  const primaryReadPath = primaryAction?.readFrom;
  return {
    confidence: pageCheck.confidence,
    readability: pageCheck.readability,
    contentLength: pageCheck.contentLength,
    ...(pageCheck.title ? { title: pageCheck.title } : {}),
    ...(pageCheck.mainHeading ? { mainHeading: pageCheck.mainHeading } : {}),
    ...(pageCheck.siteName ? { siteName: pageCheck.siteName } : {}),
    ...(pageCheck.canonicalUrl ? { canonicalUrl: pageCheck.canonicalUrl } : {}),
    ...(pageCheck.lang ? { lang: pageCheck.lang } : {}),
    ...(pageCheck.dir ? { dir: pageCheck.dir } : {}),
    ...compactBriefPageCheckPath("contentEvidence", compactAgentContentEvidence(pageCheck.contentEvidence, primaryAction), readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("dataTables", pageCheck.dataTables, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("barriers", pageCheck.barriers, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("forms", compactAgentForms(pageCheck.forms, primaryAction), readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("actionTargets", pageCheck.actionTargets, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("hydration", pageCheck.hydration, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("apiEndpoints", pageCheck.apiEndpoints, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("clientState", pageCheck.clientState, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("runtime", pageCheck.runtime, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("config", pageCheck.config, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("appHints", compactAgentAppHints(pageCheck.appHints, primaryAction), readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("mobileHints", compactAgentMobileHints(pageCheck.mobileHints), readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("topics", pageCheck.topics, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("keyValues", pageCheck.keyValues, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("metaFacts", pageCheck.metaFacts, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("provenance", pageCheck.provenance, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("httpPolicies", pageCheck.httpPolicies, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("schemaFacts", pageCheck.schemaFacts, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("offers", pageCheck.offers, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("identities", pageCheck.identities, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("datasets", pageCheck.datasets, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("timeline", pageCheck.timeline, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("contactPoints", pageCheck.contactPoints, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("faqs", pageCheck.faqs, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("breadcrumbs", pageCheck.breadcrumbs, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("sections", pageCheck.sections, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("pagination", pageCheck.pagination, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("toc", pageCheck.toc, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("codeBlocks", pageCheck.codeBlocks, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("citations", pageCheck.citations, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("media", pageCheck.media, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("resources", pageCheck.resources, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("embeds", pageCheck.embeds, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("transcripts", pageCheck.transcripts, readPaths, primaryReadPath),
    ...compactBriefPageCheckPath("authorLinks", pageCheck.authorLinks, readPaths, primaryReadPath),
    ...(pageCheck.sourceLinks.length > 0 ? { sourceLinks: compactAgentPageLinkList(pageCheck.sourceLinks.map((link) => compactAgentPageLink(link, commandContext))) } : {}),
    ...(pageCheck.actions.length > 0 ? { actions: compactAgentPageCheckItems(pageCheck.actions, 900).slice(0, 5) } : {}),
  };
}

function compactBriefPageCheckPath(key: string, value: object[] | unknown[], readPaths: Set<string>, primaryReadPath?: string): object {
  const path = `pageCheck.${key}`;
  if (!readPaths.has(path) && path !== primaryReadPath) return {};
  if (!Array.isArray(value) || value.length === 0) return {};
  return {
    [key]: path === primaryReadPath ? value : compactAgentPageCheckItems(value, 900),
  };
}

function compactAgentContract(contract: AgentContract): object {
  return {
    version: contract.version,
    compact: true,
    featureCount: contract.features.length,
  };
}

function compactAgentSemanticSummary(summary: AgentSemanticSummary): object {
  const roleCounts = Object.fromEntries(
    Object.entries(summary.roleCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6),
  );
  return {
    nodeCount: summary.nodeCount,
    namedRoleCount: summary.namedRoleCount,
    interactiveCount: summary.interactiveCount,
    focusableCount: summary.focusableCount,
    headingCount: summary.headingCount,
    landmarkCount: summary.landmarkCount,
    linkCount: summary.linkCount,
    buttonCount: summary.buttonCount,
    imageCount: summary.imageCount,
    tableCount: summary.tableCount,
    listCount: summary.listCount,
    fieldCount: summary.fieldCount,
    descriptionCount: summary.descriptionCount,
    valueCount: summary.valueCount,
    relationCount: summary.relationCount,
    choiceCount: summary.choiceCount,
    stateCount: summary.stateCount,
    unavailableCount: summary.unavailableCount,
    roleCounts,
    topRoles: summary.topRoles.slice(0, 4),
    landmarks: summary.landmarks.slice(0, 4),
    headings: summary.headings.slice(0, 4),
    namedRoles: summary.namedRoles.slice(0, 4),
    semanticOutline: summary.semanticOutline.slice(0, 8),
    keyboardItems: summary.keyboardItems.slice(0, 4),
    headingItems: summary.headingItems.slice(0, 4),
    landmarkItems: summary.landmarkItems.slice(0, 4),
    namedRoleItems: summary.namedRoleItems.slice(0, 4),
    interactiveRoles: summary.interactiveRoles.slice(0, 4),
    focusableItems: summary.focusableItems.slice(0, 4),
    links: summary.links.slice(0, 4),
    inPageLinks: summary.inPageLinks.slice(0, 4),
    buttons: summary.buttons.slice(0, 4),
    imageItems: summary.imageItems.slice(0, 4),
    tableItems: summary.tableItems.slice(0, 4),
    listItems: summary.listItems.slice(0, 4),
    fieldItems: summary.fieldItems.slice(0, 4),
    descriptionItems: summary.descriptionItems.slice(0, 4),
    valueItems: summary.valueItems.slice(0, 4),
    relationItems: summary.relationItems.slice(0, 4),
    choiceItems: summary.choiceItems.slice(0, 4),
    stateItems: summary.stateItems.slice(0, 4),
    unavailableItems: summary.unavailableItems.slice(0, 4),
  };
}

function compactAgentNext(next: AgentNext, primaryUrl?: string): object {
  const { readValue, target, ...rest } = next;
  return compactAgentUrlRefs({
    ...rest,
    ...(target ? { target: compactAgentTarget(target, next.action) } : {}),
    ...(readValue ? { readValue: compactAgentReadValue(readValue) } : {}),
  }, primaryUrl);
}

function compactAgentRunbook(runbook: AgentRunbook, primaryUrl?: string): object {
  const { readValue, target, ...rest } = runbook;
  return compactAgentUrlRefs({
    ...rest,
    ...(target ? { target: compactAgentTarget(target, runbook.action) } : {}),
    ...(readValue ? { readValue: compactAgentReadValue(readValue, true) } : {}),
  }, primaryUrl);
}

function compactAgentExecutor(executor: AgentExecutorStep, primaryUrl?: string): object {
  const { readValue, readTarget, target, ...rest } = executor;
  return compactAgentUrlRefs({
    ...rest,
    ...(target ? { target: compactAgentTarget(target, executor.action) } : {}),
    ...(readTarget ? { readTarget: compactAgentHandoffReadTarget(readTarget) } : {}),
    ...(readValue ? { readValue: compactAgentReadValue(readValue) } : {}),
  }, primaryUrl);
}

function compactAgentHandoff(handoff: AgentHandoff, primaryUrl?: string, searchCommandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): object {
  const { readValue, readTarget, sourceChoices, resultChoices, answerEvidence, target, signals: _signals, qualityGates: _qualityGates, ...rest } = handoff;
  const keepSignals = handoff.signals?.some((signal) => signal.kind === "verification" || signal.kind === "browser") === true;
  const keepQualityGates = handoff.qualityGates?.some((gate) => gate.kind === "verification") === true;
  return compactAgentUrlRefs({
    ...rest,
    ...(keepSignals ? { signals: handoff.signals } : {}),
    ...(keepQualityGates ? { qualityGates: compactAgentQualityGates(handoff.qualityGates ?? []) } : {}),
    ...(target ? { target: compactAgentTarget(target, handoff.action) } : {}),
    ...(readTarget ? { readTarget: compactAgentHandoffReadTarget(readTarget) } : {}),
    ...(answerEvidence && answerEvidence.length > 0 ? { answerEvidence: answerEvidence.map(compactAgentAnswerEvidenceRef) } : {}),
    ...(resultChoices && resultChoices.length > 0 ? { resultChoices: compactAgentCommandList(resultChoices.map((choice) => compactAgentResultChoice(choice, searchCommandContext, pageLinkContext))) } : {}),
    ...(sourceChoices && sourceChoices.length > 0 ? { sourceChoices: compactAgentSourceChoiceList(sourceChoices) } : {}),
    ...(readValue ? { readValue: compactAgentReadValue(readValue, true) } : {}),
  }, primaryUrl);
}

function compactAgentUrlRefs<T extends object>(value: T, primaryUrl?: string, threshold = 80): object {
  if (!primaryUrl || primaryUrl.length <= threshold) return value;
  const record = value as Record<string, unknown>;
  if (record.url !== primaryUrl) return value;
  const { url: _url, ...rest } = record;
  return {
    ...rest,
    urlRef: "agent.primaryUrl",
  };
}

function compactAgentHandoffReadTarget(target: AgentReadTarget): AgentReadTarget | object {
  return target.path.startsWith("verification.") ? target : compactAgentReadTargetRef(target, true);
}

function compactAgentQualityGates(gates: AgentQualityGate[], threshold = 650): object[] {
  if (JSON.stringify(gates).length <= threshold) return gates;
  return gates.map((gate) => {
    if (gate.kind === "verification") return gate;
    const { message: _message, ...rest } = gate;
    return rest;
  });
}

function compactAgentReadTargets(targets: AgentReadTarget[], threshold = 700): object[] {
  if (JSON.stringify(targets).length <= threshold) return targets;
  if (targets.some((target) => target.path.startsWith("verification."))) return targets;
  return targets.map((target) => target.primary ? target : compactAgentReadTargetRef(target));
}

function compactAgentReadTargetRef(target: AgentReadTarget, includeReason = false): object {
  return {
    path: target.path,
    count: target.count,
    ...(typeof target.score === "number" ? { score: target.score } : {}),
    ...(target.primary ? { primary: true } : {}),
    ...(includeReason ? { reason: target.reason } : {}),
  };
}

function compactAgentSourceChoiceRef(choice: AgentSourceChoice): object {
  if (choice.path.startsWith("pageCheck.sourceLinks[")) {
    return {
      id: choice.id,
      path: choice.path,
      url: choice.url,
      ...(choice.host ? { host: choice.host } : {}),
      rank: choice.rank,
      ...(choice.text ? { text: choice.text } : {}),
      ...(choice.snippet ? { snippet: choice.snippet } : {}),
      ...(choice.selector ? { selector: choice.selector } : {}),
      ...(choice.commandArgs ? { commandArgs: choice.commandArgs } : {}),
      ...(choice.primary ? { primary: true } : {}),
    };
  }
  return {
    id: choice.id,
    path: choice.path,
    title: choice.title,
    url: choice.url,
    ...(choice.host ? { host: choice.host } : {}),
    rank: choice.rank,
    ...(choice.text ? { text: choice.text } : {}),
    ...(choice.snippet ? { snippet: choice.snippet } : {}),
    ...(choice.selector ? { selector: choice.selector } : {}),
    kind: choice.kind,
    ...(choice.primary ? { primary: true } : {}),
  };
}

function compactAgentSourceChoiceList(choices: AgentSourceChoice[], threshold = 1500): object[] {
  if (JSON.stringify(choices).length <= threshold) return compactAgentCommandList(choices);
  return choices.map(compactAgentSourceChoiceRef);
}

function compactAgentResultChoice(choice: AgentResultChoice, commandContext?: SearchResultCommandContext, pageLinkContext?: PageLinkCommandContext): AgentResultChoice {
  if (choice.commandArgs) return choice;
  const command = commandContext
    ? searchOpenCommandSpec(
      commandContext.query,
      commandContext.engine,
      commandContext.findQueries,
      commandContext.agentMode,
      commandContext.lang,
      commandContext.region,
      choice.rank ?? 1,
      commandContext.timeoutMs,
      commandContext.userAgent,
    )
    : choice.url && pageLinkContext
      ? pageCommandSpec(choice.url, pageLinkContext.agentMode, false, pageLinkContext.findQueries, pageLinkContext.timeoutMs, pageLinkContext.userAgent)
      : undefined;
  if (!command) return choice;
  return {
    ...choice,
    openResult: choice.rank ?? 1,
    ...commandFields(command),
  };
}

function compactAgentCitationRef(citation: AgentCitation): object {
  return {
    kind: citation.kind,
    id: citation.id,
    path: citation.path,
    confidence: citation.confidence,
  };
}

function compactAgentAnswerEvidenceRef(citation: AgentCitation): object {
  return {
    ...compactAgentCitationRef(citation),
    ...(citation.text ? { text: citation.text } : {}),
    ...(citation.title ? { title: citation.title } : {}),
    ...(citation.url ? { url: citation.url } : {}),
    ...(citation.reason ? { reason: citation.reason } : {}),
    ...(typeof citation.score === "number" ? { score: citation.score } : {}),
  };
}

function compactAgentCitationList(citations: AgentCitation[], threshold = 1000): object[] {
  if (JSON.stringify(citations).length <= threshold) return citations;
  return citations.map(compactAgentCitationRef);
}

function compactAgentActionList(actions: object[]): object[] {
  return compactAgentCommandList(actions, 900);
}

function compactAgentCommandList<T extends object>(items: T[], threshold = 2200): object[] {
  const omitCommand = JSON.stringify(items).length > threshold;
  return items.map((item) => omitCommand ? omitRedundantCommand(item) : item);
}

function omitRedundantCommand<T extends object>(item: T): object {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === "command" && Array.isArray((item as { commandArgs?: unknown }).commandArgs)) continue;
    if (key === "afterInteractionCommand" && Array.isArray((item as { afterInteractionCommandArgs?: unknown }).afterInteractionCommandArgs)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = omitRedundantCommand(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function preferBriefAgentCommands(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(preferBriefAgentCommands);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "commandArgs" || key === "afterInteractionCommandArgs" || key.endsWith("CommandArgs")) {
      result[key] = Array.isArray(item)
        ? item.map((part) => part === "--agent" ? "--agent-brief" : part)
        : item;
      continue;
    }
    if (key === "command" || key === "afterInteractionCommand" || key === "instruction") {
      result[key] = typeof item === "string" ? preferBriefAgentCommandString(item) : item;
      continue;
    }
    result[key] = preferBriefAgentCommands(item);
  }
  return result;
}

function preferBriefAgentCommandString(value: string): string {
  return value.replace(/--agent(?!-brief)(?=$|[\s.,;:)])/g, "--agent-brief");
}

function compactAgentReadValue(readValue: AgentReadValue, forceReference = false): object {
  if (Array.isArray(readValue.value)) {
    const serialized = JSON.stringify(readValue.value);
    if (forceReference && readValue.path === "pageCheck.forms") return { path: readValue.path, value: compactAgentFormExecutionRefs(readValue.value as PageFormSummary[]) };
    if (forceReference && readValue.path === "pageCheck.actionTargets") return { path: readValue.path, value: compactAgentActionTargetExecutionRefs(readValue.value as PageActionTargetSummary[]) };
    if (forceReference && serialized.length <= 1000) return readValue;
    if (!forceReference && readValue.path === "pageCheck.contentEvidence" && readValue.value.length < 4) return readValue;
    const inlineLimit = readValue.path === "pageCheck.contentEvidence" ? 900 : 3000;
    if (!forceReference && serialized.length <= inlineLimit) return readValue;
    return {
      path: readValue.path,
      valuePath: readValue.path,
      valueType: "array",
      count: readValue.value.length,
    };
  }
  if (readValue.value && typeof readValue.value === "object") {
    const serialized = JSON.stringify(readValue.value);
    if (serialized.length <= (forceReference ? 800 : 1200)) return readValue;
    return {
      path: readValue.path,
      valuePath: readValue.path,
      valueType: "object",
    };
  }
  return {
    path: readValue.path,
    value: readValue.value,
  };
}

function compactAgentFormExecutionRefs(forms: PageFormSummary[]): object[] {
  return forms.slice(0, 4).map((form) => ({
    id: form.id,
    path: form.path,
    rank: form.rank,
    method: form.method,
    fieldCount: form.fieldCount,
    text: form.text,
    ...(form.actionUrl ? { actionUrl: form.actionUrl } : {}),
    ...(form.urlTemplate ? { urlTemplate: form.urlTemplate } : {}),
    ...(form.queryField ? { queryField: form.queryField } : {}),
    ...(form.submitText ? { submitText: form.submitText } : {}),
    ...(form.selector ? { selector: form.selector } : {}),
    fields: form.fields.map((field) => ({
      type: field.type,
      ...(field.name ? { name: field.name } : {}),
      ...(field.label ? { label: field.label } : {}),
      ...(field.placeholder && field.placeholder !== field.label ? { placeholder: field.placeholder } : {}),
      ...(field.required ? { required: true } : {}),
      ...(field.options?.length ? { options: field.options.slice(0, 6) } : {}),
      ...(field.selector ? { selector: field.selector } : {}),
    })),
  }));
}

function compactAgentActionTargetExecutionRefs(targets: PageActionTargetSummary[]): object[] {
  return targets.slice(0, 5).map((target) => ({
    id: target.id,
    path: target.path,
    rank: target.rank,
    kind: target.kind,
    name: target.name,
    text: target.text,
    source: target.source,
    ...(target.targetUrl ? { targetUrl: target.targetUrl } : {}),
    ...(target.urlTemplate ? { urlTemplate: target.urlTemplate } : {}),
    ...(target.queryInput ? { queryInput: target.queryInput } : {}),
    ...(target.method ? { method: target.method } : {}),
    ...(target.encodingType ? { encodingType: target.encodingType } : {}),
    ...(typeof target.disabled === "boolean" ? { disabled: target.disabled } : {}),
    ...(typeof target.pressed !== "undefined" ? { pressed: target.pressed } : {}),
    ...(typeof target.expanded === "boolean" ? { expanded: target.expanded } : {}),
    ...(typeof target.haspopup !== "undefined" ? { haspopup: target.haspopup } : {}),
    ...(target.controls ? { controls: target.controls } : {}),
    ...(target.selector ? { selector: target.selector } : {}),
  }));
}

function compactAgentPage(page: PageSummary): object {
  const compact = {
    ...(page.description ? { description: page.description } : {}),
    ...(page.lang ? { lang: page.lang } : {}),
    ...(page.dir ? { dir: page.dir } : {}),
    ...(page.siteName ? { siteName: page.siteName } : {}),
    ...(page.author ? { author: page.author } : {}),
    ...(page.publishedTime ? { publishedTime: page.publishedTime } : {}),
    ...(page.modifiedTime ? { modifiedTime: page.modifiedTime } : {}),
    ...(page.structuredDataTypes?.length ? { structuredDataTypes: page.structuredDataTypes } : {}),
  };
  return Object.keys(compact).length > 0 ? { page: compact } : {};
}

function compactAgentVerification(verification: VerificationSummary, primaryAction?: SuggestedAction): object {
  if (verification.status === "not-requested") return {};
  const recommendedAction = sameSuggestedAction(verification.recommendedAction, primaryAction)
    ? undefined
    : verification.recommendedAction;
  return {
    verification: {
      status: verification.status,
      requestedCount: verification.requestedCount,
      foundCount: verification.foundCount,
      missingCount: verification.missingCount,
      evidenceCount: verification.evidenceCount,
      ...(verification.foundQueries.length > 0 ? { foundQueries: verification.foundQueries } : {}),
      ...(verification.missingQueries.length > 0 ? { missingQueries: verification.missingQueries } : {}),
      ...(verification.bestEvidence ? { bestEvidence: verification.bestEvidence } : {}),
      ...(recommendedAction ? { recommendedAction: compactAgentAction(recommendedAction) } : {}),
    },
  };
}

function compactAgentSearchEngines(attempts: SearchAttemptSummary[] | undefined): object {
  if (!attempts || attempts.length === 0) return {};
  return {
    searchEngines: attempts.map((attempt) => ({
      engine: attempt.engine,
      ok: attempt.ok,
      resultCount: attempt.resultCount,
      ...(attempt.kind ? { kind: attempt.kind } : {}),
      ...(typeof attempt.status === "number" ? { status: attempt.status } : {}),
      ...(attempt.finalUrl && attempt.finalUrl !== attempt.url ? { finalUrl: attempt.finalUrl } : {}),
      ...(attempt.diagnostics?.length ? { diagnosticCodes: attempt.diagnostics.map((item) => item.code) } : {}),
      ...(attempt.topResult ? { topResult: compactAttemptTopResult(attempt.topResult) } : {}),
      ...(attempt.error ? { error: { code: attempt.error.code, ...(attempt.error.status ? { status: attempt.error.status } : {}) } } : {}),
    })),
  };
}

function compactAgentSourceSearch(sourceSearch: SourceSearchSummary | undefined): AgentSourceSearch | undefined {
  if (!sourceSearch) return undefined;
  return {
    query: sourceSearch.query,
    engine: sourceSearch.engine,
    ...(sourceSearch.selectedEngine ? { selectedEngine: sourceSearch.selectedEngine } : {}),
    searchUrl: sourceSearch.searchUrl,
    ...(sourceSearch.lang ? { lang: sourceSearch.lang } : {}),
    ...(sourceSearch.region ? { region: sourceSearch.region } : {}),
    ...(sourceSearch.findQueries?.length ? { findQueries: sourceSearch.findQueries } : {}),
    selectedRank: sourceSearch.selectedRank,
    selectedTitle: sourceSearch.selectedTitle,
    selectedUrl: sourceSearch.selectedUrl,
    ...(sourceSearch.selectedResult ? { selectedResult: compactAgentSourceSearchResult(sourceSearch, sourceSearch.selectedResult) } : {}),
    ...(sourceSearch.alternateResults?.length ? { alternateResults: compactAgentCommandList(sourceSearch.alternateResults.map((result, index) => compactAgentSourceSearchResult(sourceSearch, result, index))) as AgentSourceSearchResult[] } : {}),
  };
}

function compactAgentSourceSearchResult(sourceSearch: SourceSearchSummary, result: ResultSummary, index?: number): AgentSourceSearchResult {
  const command = searchOpenCommandSpec(
    sourceSearch.query,
    sourceSearch.selectedEngine ?? sourceSearch.engine,
    sourceSearch.findQueries ?? [],
    true,
    sourceSearch.lang,
    sourceSearch.region,
    result.rank,
    sourceSearch.timeoutMs,
    sourceSearch.userAgent,
  );
  const path = index === undefined ? "sourceSearch.selectedResult" : `sourceSearch.alternateResults[${index}]`;
  const id = index === undefined ? "selected" : `a${result.rank}`;
  return {
    ...compactAgentSearchResult(result, undefined, {
      id,
      path,
    }),
    id,
    path,
    openResult: result.rank,
    ...commandFields(command),
  };
}

function compactAttemptTopResult(topResult: NonNullable<SearchAttemptSummary["topResult"]>): object {
  return {
    title: topResult.title,
    url: topResult.url,
    ...(topResult.relevance ? { relevance: topResult.relevance } : {}),
    ...(typeof topResult.isLikelyOfficial === "boolean" ? { isLikelyOfficial: topResult.isLikelyOfficial } : {}),
  };
}

function searchResultCommandContext(options: CliOptions): SearchResultCommandContext | undefined {
  const inferred = inferSearchResultCommandContext(options.url);
  if (!options.searchQuery && !inferred?.engine) return undefined;
  const query = options.searchQuery ?? inferred?.query;
  if (!query) return undefined;
  const engine = options.selectedSearchEngine ?? options.searchEngine ?? inferred?.engine;
  return {
    query,
    findQueries: options.findQueries ?? [],
    agentMode: true,
    ...(engine ? { engine } : {}),
    ...(options.searchLang ? { lang: options.searchLang } : {}),
    ...(options.searchRegion ? { region: options.searchRegion } : {}),
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
  };
}

function inferSearchResultCommandContext(url: string | undefined): Pick<SearchResultCommandContext, "query" | "engine"> | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (hostname.endsWith("bing.com")) {
      const query = parsed.searchParams.get("q");
      return query ? { query, engine: "bing" } : undefined;
    }
    if (hostname.endsWith("duckduckgo.com")) {
      const query = parsed.searchParams.get("q");
      return query ? { query, engine: "duckduckgo" } : undefined;
    }
    if (hostname.endsWith("startpage.com")) {
      const query = parsed.searchParams.get("query");
      return query ? { query, engine: "startpage" } : undefined;
    }
    if (hostname.endsWith("google.com")) {
      const query = parsed.searchParams.get("q");
      return query ? { query } : undefined;
    }
    if (hostname.endsWith("baidu.com")) {
      const query = parsed.searchParams.get("wd") ?? parsed.searchParams.get("word");
      return query ? { query } : undefined;
    }
    if (hostname.endsWith("search.yahoo.co.jp")) {
      const query = parsed.searchParams.get("p");
      return query ? { query } : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function pageLinkCommandContext(options: CliOptions): PageLinkCommandContext {
  return {
    agentMode: true,
    findQueries: options.findQueries ?? [],
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
  };
}

function compactAgentSearchResults(
  results: ResultSummary[],
  recommendedResult?: ResultSummary,
  commandContext?: SearchResultCommandContext,
  fallbackCommandContext?: PageLinkCommandContext,
): object {
  if (results.length === 0) return {};
  const selected = selectCompactSearchResults(results, recommendedResult);
  return {
    searchResults: compactAgentCommandList(selected.map((result, index) => compactAgentSearchResult(
      result,
      commandContext,
      { id: `r${result.rank}`, path: `searchResults[${index}]` },
      fallbackCommandContext,
    ))),
  };
}

function selectCompactSearchResults(results: ResultSummary[], recommendedResult?: ResultSummary): ResultSummary[] {
  const selected: ResultSummary[] = [];
  const seen = new Set<string>();
  const add = (result: ResultSummary | undefined): void => {
    if (!result) return;
    const key = `${result.rank}:${result.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(result);
  };
  for (const result of results.slice(0, 5)) add(result);
  add(recommendedResult);
  return selected;
}

function compactAgentSearchResult(
  result: ResultSummary,
  commandContext?: SearchResultCommandContext,
  reference?: { id: string; path: string },
  fallbackCommandContext?: PageLinkCommandContext,
): ResultSummary & Partial<Pick<SuggestedAction, "openResult" | "command" | "commandArgs">> {
  const command = commandContext
    ? searchOpenCommandSpec(
        commandContext.query,
        commandContext.engine,
        commandContext.findQueries,
        commandContext.agentMode,
        commandContext.lang,
        commandContext.region,
        result.rank,
        commandContext.timeoutMs,
        commandContext.userAgent,
      )
    : fallbackCommandContext
      ? pageCommandSpec(result.url, fallbackCommandContext.agentMode, false, fallbackCommandContext.findQueries, fallbackCommandContext.timeoutMs, fallbackCommandContext.userAgent)
      : undefined;
  const host = result.host ?? sourceFromUrl(result.url);
  const compact: ResultSummary = {
    ...(reference ? { id: reference.id, path: reference.path } : {}),
    title: result.title,
    url: result.url,
    ...(host ? { host } : {}),
    source: result.source,
    rank: result.rank,
  };
  if (result.snippet) compact.snippet = result.snippet;
  if (result.sourceType) compact.sourceType = result.sourceType;
  if (typeof result.sourceScore === "number") compact.sourceScore = result.sourceScore;
  if (result.sourceHints?.length) compact.sourceHints = result.sourceHints;
  if (result.dateText) compact.dateText = result.dateText;
  if (result.date) compact.date = result.date;
  if (result.datePrecision) compact.datePrecision = result.datePrecision;
  if (result.dateSource) compact.dateSource = result.dateSource;
  if (result.sitelinks?.length) compact.sitelinks = result.sitelinks;
  if (result.relevance) compact.relevance = result.relevance;
  if (result.matchedTerms?.length) compact.matchedTerms = result.matchedTerms;
  if (result.findMatches?.length) compact.findMatches = result.findMatches;
  if (typeof result.isLikelyOfficial === "boolean") compact.isLikelyOfficial = result.isLikelyOfficial;
  compact.selectionReason = result.selectionReason ?? searchResultSelectionReason(result);
  return {
    ...compact,
    ...(command ? { openResult: result.rank, ...commandFields(command) } : {}),
  };
}

function compactAgentPageLink(
  link: PageLinkSummary,
  commandContext?: PageLinkCommandContext,
  reference?: { id: string; path: string },
): PageLinkSummary & Partial<Pick<SuggestedAction, "command" | "commandArgs">> {
  const host = link.host ?? sourceFromUrl(link.url);
  const compact: PageLinkSummary = {
    ...(reference ? { id: reference.id, path: reference.path } : {}),
    title: link.title,
    url: link.url,
    ...(host ? { host } : {}),
    source: link.source,
    rank: link.rank,
    ...(link.text ? { text: link.text } : {}),
    ...(link.snippet ? { snippet: link.snippet } : {}),
    ...(link.selector ? { selector: link.selector } : {}),
    kind: link.kind,
  };
  if (link.sourceType) compact.sourceType = link.sourceType;
  if (typeof link.sourceScore === "number") compact.sourceScore = link.sourceScore;
  if (link.sourceHints?.length) compact.sourceHints = link.sourceHints;
  if (link.relevance) compact.relevance = link.relevance;
  if (link.matchedTerms) compact.matchedTerms = link.matchedTerms;
  if (link.findMatches) compact.findMatches = link.findMatches;
  if (typeof link.isLikelyOfficial === "boolean") compact.isLikelyOfficial = link.isLikelyOfficial;
  compact.selectionReason = link.selectionReason ?? sourceLinkSelectionReason(link);
  const command = commandContext ? pageCommandSpec(link.url, commandContext.agentMode, false, commandContext.findQueries, commandContext.timeoutMs, commandContext.userAgent) : undefined;
  return {
    ...compact,
    ...(command ? commandFields(command) : {}),
  };
}

function agentTargetFromResult(result: ResultSummary): AgentTarget {
  const host = result.host ?? sourceFromUrl(result.url);
  return {
    title: result.title,
    url: result.url,
    ...(host ? { host } : {}),
    ...(result.path ? { path: result.path } : {}),
    ...(result.text ? { text: result.text } : {}),
    source: result.source,
    rank: result.rank,
    ...(result.snippet ? { snippet: result.snippet } : {}),
    ...(result.selector ? { selector: result.selector } : {}),
    ...(result.sourceType ? { sourceType: result.sourceType } : {}),
    ...(typeof result.sourceScore === "number" ? { sourceScore: result.sourceScore } : {}),
    ...(result.sourceHints?.length ? { sourceHints: result.sourceHints } : {}),
    ...(result.dateText ? { dateText: result.dateText } : {}),
    ...(result.date ? { date: result.date } : {}),
    ...(result.datePrecision ? { datePrecision: result.datePrecision } : {}),
    ...(result.dateSource ? { dateSource: result.dateSource } : {}),
    ...(result.sitelinks?.length ? { sitelinks: result.sitelinks } : {}),
    ...(result.relevance ? { relevance: result.relevance } : {}),
    ...(result.matchedTerms?.length ? { matchedTerms: result.matchedTerms } : {}),
    ...(result.findMatches?.length ? { findMatches: result.findMatches } : {}),
    ...(typeof result.isLikelyOfficial === "boolean" ? { isLikelyOfficial: result.isLikelyOfficial } : {}),
    selectionReason: result.selectionReason ?? searchResultSelectionReason(result),
  };
}

function compactAgentAction(action: SuggestedAction, options: { omitOpenSourceTarget?: boolean; omitReason?: boolean; primaryUrl?: string } = {}): object {
  return compactAgentUrlRefs({
    action: action.action,
    execution: actionExecution(action),
    priority: action.priority ?? actionPriority(action),
    priorityReason: action.priorityReason ?? actionPriorityReason(action),
    ...(!options.omitReason ? { reason: action.reason } : {}),
    ...(action.url ? { url: action.url } : {}),
    ...(action.rank ? { rank: action.rank } : {}),
    ...(action.openResult ? { openResult: action.openResult } : {}),
    ...(action.command ? { command: action.command } : {}),
    ...(action.commandArgs ? { commandArgs: action.commandArgs } : {}),
    ...(action.afterInteractionCommand ? { afterInteractionCommand: action.afterInteractionCommand } : {}),
    ...(action.afterInteractionCommandArgs ? { afterInteractionCommandArgs: action.afterInteractionCommandArgs } : {}),
    ...(action.terminal ? { terminal: action.terminal } : {}),
    ...(action.readFrom ? { readFrom: action.readFrom } : {}),
    ...(action.sourceLinkRef ? { sourceLinkRef: action.sourceLinkRef } : {}),
    ...(action.requiresBrowserInteraction ? { requiresBrowserInteraction: action.requiresBrowserInteraction } : {}),
    ...(action.target && !(options.omitOpenSourceTarget && action.action === "open-source-link") ? { target: compactAgentTarget(action.target, action.action) } : {}),
  }, options.primaryUrl);
}

function compactAgentTarget(target: AgentTarget, action?: string): object {
  if (action !== "open-source-link") return target;
  return {
    ...(target.title ? { title: target.title } : {}),
    url: target.url,
    ...(target.host ? { host: target.host } : {}),
    ...(target.path ? { path: target.path } : {}),
    ...(target.text ? { text: target.text } : {}),
    ...(target.source ? { source: target.source } : {}),
    ...(typeof target.rank === "number" ? { rank: target.rank } : {}),
    ...(target.snippet ? { snippet: target.snippet } : {}),
    ...(target.selector ? { selector: target.selector } : {}),
    ...(target.sourceType ? { sourceType: target.sourceType } : {}),
    ...(typeof target.sourceScore === "number" ? { sourceScore: target.sourceScore } : {}),
    ...(target.sourceHints?.length ? { sourceHints: target.sourceHints } : {}),
    ...(target.selectionReason ? { selectionReason: target.selectionReason } : {}),
  };
}

function compactAgentActionSummary(action: AgentActionSummary, primaryAction?: SuggestedAction, primaryUrl?: string): object {
  const actionOptions = primaryUrl ? { primaryUrl } : {};
  if (!action.primary && action.source === "pageCheck.nextSteps" && typeof action.index === "number") {
    const compactIndex = (primaryAction?.action === "read-content" || primaryAction?.action === "use-evidence") && action.index > 0
      ? action.index - 1
      : action.index;
    return {
      ...compactAgentAction(action, actionOptions),
      source: action.source,
      index: action.index,
      path: `pageCheck.nextSteps[${compactIndex}]`,
    };
  }
  return {
    ...compactAgentAction(action, actionOptions),
    source: action.source,
    ...(action.primary ? { primary: true } : {}),
    ...(typeof action.index === "number" ? { index: action.index } : {}),
  };
}

function actionExecution(action: SuggestedAction): NonNullable<SuggestedAction["execution"]> {
  if (action.execution) return action.execution;
  if (action.terminal) return "read-current";
  if (action.requiresBrowserInteraction || action.action === "inspect-browser-state") return "interact-browser";
  if (action.command) return "run-command";
  return "inspect-output";
}

function actionPriority(action: SuggestedAction): NonNullable<SuggestedAction["priority"]> {
  if (action.action === "use-evidence" || action.action === "read-content" || action.terminal) return "high";
  if (action.action === "open-result" || action.action === "open-alternate-result") return "high";
  if (action.action === "retry-with-browser-html") return "high";
  if (action.action === "open-source-link" || action.action === "open-site-search" || action.action === "refine-search" || action.action === "broaden-search") return "medium";
  if (action.requiresBrowserInteraction || actionExecution(action) === "interact-browser") return "medium";
  return "low";
}

function actionPriorityReason(action: SuggestedAction): string {
  if (action.action === "use-evidence") return "Confirmed evidence can be returned from the current payload.";
  if (action.action === "read-content" || action.terminal) return "Readable content evidence is available in the current payload.";
  if (action.action === "open-result" || action.action === "open-alternate-result") return "Opening the selected result is the next required executor step.";
  if (action.action === "retry-with-browser-html") return "Browser-captured HTML is required to make progress.";
  if (action.action === "open-source-link") return "External source-like link can improve verification.";
  if (action.action === "open-site-search") return "The page's own search form can narrow the verification query.";
  if (action.action === "refine-search" || action.action === "broaden-search") return "Search needs refinement before a reliable result can be opened.";
  if (action.requiresBrowserInteraction || actionExecution(action) === "interact-browser") return "Browser interaction may expose additional content or controls.";
  return "Inspect current output before choosing another action.";
}

function withActionExecution(action: SuggestedAction): SuggestedAction {
  return {
    ...action,
    execution: actionExecution(action),
    priority: action.priority ?? actionPriority(action),
    priorityReason: action.priorityReason ?? actionPriorityReason(action),
  };
}

function withPageCheckActionExecution(pageCheck: PageCheckSummary): PageCheckSummary {
  const addSourceLinkRef = (action: SuggestedAction): SuggestedAction => {
    const executable = withActionExecution(action);
    if (executable.sourceLinkRef || executable.action !== "open-source-link" || !executable.url) return executable;
    const index = pageCheck.sourceLinks.findIndex((link) => link.url === executable.url);
    return index < 0 ? executable : { ...executable, sourceLinkRef: `pageCheck.sourceLinks[${index}]` };
  };
  return {
    ...pageCheck,
    recommendedAction: addSourceLinkRef(pageCheck.recommendedAction),
    nextSteps: pageCheck.nextSteps.map(addSourceLinkRef),
  };
}

function withVerificationActionExecution(verification: VerificationSummary): VerificationSummary {
  return verification.recommendedAction
    ? { ...verification, recommendedAction: withActionExecution(verification.recommendedAction) }
    : verification;
}

function withAgentActionExecution(agent: AgentSummary): AgentSummary {
  return {
    ...agent,
    actions: agent.actions.map((action) => ({
      ...withActionExecution(action),
      source: action.source,
      ...(action.primary ? { primary: true } : {}),
      ...(typeof action.index === "number" ? { index: action.index } : {}),
    })),
    ...(agent.primaryAction ? { primaryExecution: actionExecution(agent.primaryAction), primaryAction: withActionExecution(agent.primaryAction) } : {}),
  };
}

function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof UsageError) return new CliError("USAGE", error.message, 2);
  return new CliError("FETCH_FAILED", error instanceof Error ? error.message : String(error), 10);
}

function parseArgMetadata(argv: string[]): Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "agentMode" | "agentBrief" | "findQueries" | "timeoutMs" | "userAgent">> {
  const metadata: Partial<Pick<CliOptions, "url" | "extractOptions" | "searchQuery" | "searchEngine" | "searchLang" | "searchRegion" | "agentMode" | "agentBrief" | "findQueries" | "timeoutMs" | "userAgent">> = { extractOptions: {}, findQueries: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--agent") {
      metadata.agentMode = true;
      continue;
    }
    if (arg === "--agent-brief") {
      metadata.agentMode = true;
      metadata.agentBrief = true;
      continue;
    }
    if (arg === "--mode") {
      const value = argv[index + 1];
      if (value === "compact" || value === "interactive" || value === "full") metadata.extractOptions = { mode: value };
      index += 1;
      continue;
    }
    if (arg === "--search") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.searchQuery = value;
      index += 1;
      continue;
    }
    if (arg === "--engine") {
      const value = argv[index + 1];
      if (value === "auto" || value === "bing" || value === "duckduckgo" || value === "startpage") metadata.searchEngine = value;
      index += 1;
      continue;
    }
    if (arg === "--lang") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.searchLang = value.toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--region") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.searchRegion = value.toUpperCase();
      index += 1;
      continue;
    }
    if (arg === "--find") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.findQueries?.push(value);
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      const value = argv[index + 1];
      const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
      if (Number.isFinite(parsed) && parsed > 0) metadata.timeoutMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--user-agent") {
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) metadata.userAgent = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      if (["--max-text-length", "--open", "--open-result", "--timeout", "--user-agent"].includes(arg)) index += 1;
      continue;
    }
    metadata.url ??= arg;
  }
  return metadata;
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
