import { DomUtils, parseDocument } from "htmlparser2";
import { Element as DomElement } from "domhandler";
import type { AnyNode, Element, Text } from "domhandler";
import type { SemanticNode, SemanticNodeState, SemanticTreeOptions } from "./types";

type StaticContext = {
  options: Required<Pick<
    SemanticTreeOptions,
    "excludeLikelyAds" | "excludeLikelyBoilerplate" | "includeAttributes" | "includeHidden" | "includeSelectOptions" | "includeTextNodes" | "maxChildrenPerNode" | "maxLinkFarmChildren" | "maxRepeatedSubtreeInstances" | "maxTextLength" | "mode" | "pruneCollapsedSubtrees" | "pruneLikelyClosedOverlays" | "summarizeLargeSubtrees" | "summarizeLikelyLinkFarms" | "summarizeRepeatedSubtrees"
  >>;
  nextId: number;
  ids: Map<string, Element>;
  referencedIds: Set<string>;
  collapsedControlledIds: Set<string>;
  labelsByFor: Map<string, Element>;
  slotAssignments: Map<string, AnyNode[]> | undefined;
};

const defaultOptions = {
  includeAttributes: true,
  excludeLikelyAds: false,
  includeHidden: false,
  includeSelectOptions: true,
  includeTextNodes: false,
  maxTextLength: 240,
  mode: "compact",
  excludeLikelyBoilerplate: false,
  maxChildrenPerNode: 80,
  maxLinkFarmChildren: 24,
  maxRepeatedSubtreeInstances: 3,
  pruneCollapsedSubtrees: true,
  pruneLikelyClosedOverlays: true,
  summarizeLargeSubtrees: true,
  summarizeLikelyLinkFarms: true,
  summarizeRepeatedSubtrees: true,
} satisfies StaticContext["options"];

const interactiveRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

const landmarkTags: Record<string, string> = {
  article: "article",
  aside: "complementary",
  footer: "contentinfo",
  header: "banner",
  main: "main",
  nav: "navigation",
  section: "region",
};

const rolesNamedFromContents = new Set([
  "button",
  "cell",
  "checkbox",
  "columnheader",
  "heading",
  "link",
  "listitem",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "rowheader",
  "switch",
  "tab",
  "treeitem",
]);

const hiddenStylePattern = /(?:^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden|content-visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?)(?:;|$)/i;
const nonSemanticTags = new Set(["head", "link", "meta", "script", "style", "template"]);

export type StaticSemanticTreeOptions = Pick<
  SemanticTreeOptions,
  "excludeLikelyAds" | "excludeLikelyBoilerplate" | "includeAttributes" | "includeHidden" | "includeSelectOptions" | "includeTextNodes" | "maxChildrenPerNode" | "maxLinkFarmChildren" | "maxRepeatedSubtreeInstances" | "maxTextLength" | "mode" | "pruneCollapsedSubtrees" | "pruneLikelyClosedOverlays" | "summarizeLargeSubtrees" | "summarizeLikelyLinkFarms" | "summarizeRepeatedSubtrees"
>;

export function extractStaticSemanticTree(html: string, options: StaticSemanticTreeOptions = {}): SemanticNode {
  const document = parseDocument(html, {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    recognizeSelfClosing: true,
  });
  const context: StaticContext = {
    options: resolveStaticOptions(document.children, html, options),
    nextId: 1,
    ids: new Map(),
    referencedIds: new Set(),
    collapsedControlledIds: new Set(),
    labelsByFor: new Map(),
    slotAssignments: undefined,
  };
  indexDocument(document.children, context);
  const root = findElement(document.children, "body") ?? findElement(document.children, "html") ?? fragmentRoot(document.children);
  return walkElement(root, context) ?? unavailableNode(context, "document", "HTML has no inspectable root");
}

export { extractStaticSemanticTree as extract };

function resolveStaticOptions(nodes: AnyNode[], html: string, options: StaticSemanticTreeOptions): StaticContext["options"] {
  const inferred = inferStaticSourceProfile(nodes, html);
  const resolved = { ...defaultOptions };

  if (inferred.wikiLike) {
    resolved.maxChildrenPerNode = 400;
    resolved.maxLinkFarmChildren = 80;
  }
  if (inferred.forumLike) {
    resolved.maxLinkFarmChildren = 19;
  }

  return { ...resolved, ...options };
}

function inferStaticSourceProfile(nodes: AnyNode[], html: string): { wikiLike: boolean; forumLike: boolean } {
  const root = findElement(nodes, "html") ?? fragmentRoot(nodes);
  const body = findElement(nodes, "body");
  const profileText = [
    attr(root, "class"),
    attr(root, "id"),
    body ? attr(body, "class") : "",
    body ? attr(body, "id") : "",
    firstMetaContent(root, "generator"),
    firstMetaContent(root, "application-name"),
    firstMetaContent(root, "twitter:site"),
  ].filter(Boolean).join(" ").toLowerCase();

  return {
    wikiLike: /\b(mediawiki|mw-parser-output|wikipedia|wikimedia)\b/.test(profileText)
      || /\b(?:id|class)=["'][^"']*\bmw-parser-output\b/i.test(html),
    forumLike: /\b(5ch|2ch|dcinside|ruliweb|clien|bbs|board|forum|gallery|gall|thread|subback)\b/.test(profileText)
      || /\b(?:id|class)=["'][^"']*\b(?:gall_list|threadlist|thread-list|board-list|article-list|subback|bbs|forum)\b/i.test(html)
      || /(?:갤러리|게시판|댓글|개념글|스레드|レス|話題度)/.test(html),
  };
}

function firstMetaContent(root: Element | undefined, name: string): string {
  /* v8 ignore next -- internal callers pass a fragment fallback when html is absent. */
  if (!root) return "";
  const stack = [...root.children];
  while (stack.length > 0) {
    const node = stack.shift();
    /* v8 ignore next -- guarded for noUncheckedIndexedAccess; loop condition prevents this. */
    if (!node) continue;
    if (!isElement(node)) continue;
    if (node.name === "meta" && (attr(node, "name") === name || attr(node, "property") === name)) {
      return attr(node, "content") ?? "";
    }
    stack.unshift(...node.children);
  }
  return "";
}

function indexDocument(nodes: AnyNode[], context: StaticContext): void {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    const id = attr(node, "id");
    if (id) context.ids.set(id, node);
    for (const referencedId of referencedIds(node)) {
      context.referencedIds.add(referencedId);
    }
    if (attr(node, "aria-expanded") === "false") {
      for (const controlledId of (attr(node, "aria-controls") ?? "").split(/\s+/)) {
        if (controlledId) context.collapsedControlledIds.add(controlledId);
      }
    }
    if (node.name === "label") {
      const target = attr(node, "for");
      if (target) context.labelsByFor.set(target, node);
    }
    indexDocument(node.children, context);
  }
}

function referencedIds(element: Element): string[] {
  return [
    attr(element, "aria-labelledby"),
    attr(element, "aria-describedby"),
    attr(element, "aria-details"),
    attr(element, "aria-errormessage"),
    attr(element, "aria-controls"),
    attr(element, "aria-owns"),
    attr(element, "aria-flowto"),
    attr(element, "aria-activedescendant"),
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/\s+/).map((item) => item.trim()).filter(Boolean));
}

function walkElement(element: Element | undefined, context: StaticContext): SemanticNode | null {
  /* v8 ignore next -- public extraction always supplies body/html or a fragment root. */
  if (!element) return null;
  if (shouldSkipElement(element, context)) return null;
  if (!context.options.includeHidden && isHidden(element)) return null;
  if (context.options.excludeLikelyAds && isLikelyAd(element)) return null;
  if (context.options.excludeLikelyBoilerplate && isLikelyBoilerplateTable(element)) return flattenBoilerplateTable(element, context);
  if (context.options.excludeLikelyBoilerplate && isLikelyBoilerplate(element)) return null;
  if (!context.options.includeHidden && isCollapsedControlledElement(element, context)) return null;
  if (!context.options.includeHidden && isLikelyClosedOverlay(element, context)) return null;

  const role = getRole(element);
  const state = getState(element);
  const focusable = isFocusable(element, role);
  const interactive = isInteractive(element, role, focusable);
  const name = role ? computeName(element, role, context) : "";
  const tag = element.name;
  const children = shouldSkipChildrenForCollapsedElement(element, context) ? [] : collectChildren(element, context);
  if (tag === "iframe" && children.length === 0 && attr(element, "src") && !attr(element, "srcdoc")) {
    children.push(unavailableNode(context, "iframe", "iframe content unavailable in static HTML"));
  }

  if (context.options.mode === "interactive" && !interactive) {
    return children.length > 0 ? containerNode(context, tag, children) : null;
  }
  if (shouldPruneCustomElementWrapper(element, role, name, interactive, children, context)) {
    return children.length === 1 ? children[0] ?? null : containerNode(context, "fragment", children);
  }
  if (shouldPruneListItemWrapper(role, children, context)) {
    return children.length === 1 ? children[0] ?? null : containerNode(context, tag, children);
  }
  if (shouldPrune(element, role, name, interactive, children, context)) {
    if (children.length === 0) return null;
    return children.length === 1 ? children[0] ?? null : containerNode(context, tag, children);
  }

  const node: SemanticNode = {
    id: nextId(context),
    tag,
    role,
    name,
    interactive,
    focusable,
    selector: getSelector(element),
    xpath: getXPath(element),
    children,
  };
  const description = computeDescription(element, context);
  if (description) node.description = description;
  const text = directText(element, context.options.maxTextLength);
  if (text) node.text = text;
  const value = getValue(element);
  if (value) node.value = value;
  if (Object.keys(state).length > 0) node.state = state;
  if (context.options.includeAttributes) node.attributes = { ...element.attribs };
  return node;
}

function collectChildren(element: Element, context: StaticContext): SemanticNode[] {
  const children: SemanticNode[] = [];
  const repeatedSignatures = new Map<string, number>();
  let omitted = 0;
  const shadowTemplate = element.children.find((child): child is Element => isElement(child) && isDeclarativeShadowTemplate(child));
  if (shadowTemplate) {
    const previousAssignments = context.slotAssignments;
    context.slotAssignments = collectSlotAssignments(element);
    for (const child of shadowTemplate.children) {
      if (!isElement(child)) continue;
      const semanticChild = walkElement(child, context);
      omitted += appendSemanticChild(element, semanticChild, children, repeatedSignatures, context);
    }
    context.slotAssignments = previousAssignments;
    const linkFarmSummary = summarizeLikelyLinkFarmChildren(element, children, context);
    if (linkFarmSummary.omitted > 0) {
      children.splice(0, children.length, ...linkFarmSummary.children);
      omitted += linkFarmSummary.omitted;
    }
    if (omitted > 0) children.push(omittedNode(context, omitted));
    return children;
  }

  if (element.name === "slot" && context.slotAssignments) {
    const slotName = attr(element, "name") ?? "";
    const assignedChildren = context.slotAssignments.get(slotName) ?? [];
    const projectedChildren = assignedChildren.length > 0 ? assignedChildren : element.children.filter(isElement);
    for (const child of projectedChildren) {
      if (isElement(child)) {
        const semanticChild = walkElement(child, context);
        omitted += appendSemanticChild(element, semanticChild, children, repeatedSignatures, context);
      } else if (context.options.includeTextNodes && isText(child)) {
        const text = normalizeText(child.data, context.options.maxTextLength);
        if (text) {
          children.push({
            id: nextId(context),
            tag: "#text",
            role: "text",
            name: text,
            text,
            interactive: false,
            focusable: false,
            children: [],
          });
        }
      }
    }
    if (omitted > 0) children.push(omittedNode(context, omitted));
    return children;
  }

  for (const child of element.children) {
    if (isElement(child)) {
      if (!context.options.includeSelectOptions && element.name === "select") continue;
      const semanticChild = walkElement(child, context);
      omitted += appendSemanticChild(element, semanticChild, children, repeatedSignatures, context);
    } else if (context.options.includeTextNodes && isText(child)) {
      const text = normalizeText(child.data, context.options.maxTextLength);
      if (text) {
        const textNode: SemanticNode = {
          id: nextId(context),
          tag: "#text",
          role: "text",
          name: text,
          text,
          interactive: false,
          focusable: false,
          children: [],
        };
        if (shouldSummarizeMoreChildren(element, children, context)) {
          omitted += 1;
        } else {
          children.push(textNode);
        }
      }
    }
  }
  const linkFarmSummary = summarizeLikelyLinkFarmChildren(element, children, context);
  if (linkFarmSummary.omitted > 0) {
    children.splice(0, children.length, ...linkFarmSummary.children);
    omitted += linkFarmSummary.omitted;
  }
  if (omitted > 0) children.push(omittedNode(context, omitted));
  return children;
}

function collectSlotAssignments(host: Element): Map<string, AnyNode[]> {
  const assignments = new Map<string, AnyNode[]>();
  for (const child of host.children) {
    if (!isUsefulSlotAssignment(child)) continue;
    const slotName = isElement(child) ? attr(child, "slot") ?? "" : "";
    const assigned = assignments.get(slotName) ?? [];
    assigned.push(child);
    assignments.set(slotName, assigned);
  }
  return assignments;
}

function isUsefulSlotAssignment(node: AnyNode): boolean {
  if (isText(node)) return normalizeText(node.data, 120) !== "";
  if (!isElement(node)) return false;
  return !isDeclarativeShadowTemplate(node);
}

function appendSemanticChild(
  parent: Element,
  child: SemanticNode | null,
  children: SemanticNode[],
  repeatedSignatures: Map<string, number>,
  context: StaticContext,
): number {
  if (!child) return 0;
  if (shouldSummarizeRepeatedChild(parent, child, repeatedSignatures, context)) {
    return countSemanticNodes(child);
  }
  if (shouldSummarizeMoreChildren(parent, children, context)) {
    return countSemanticNodes(child);
  }
  children.push(child);
  return 0;
}

function shouldSkipElement(element: Element, context: StaticContext): boolean {
  if (context.options.mode === "full") return false;
  if (isDeclarativeShadowTemplate(element)) return false;
  if (nonSemanticTags.has(element.name)) return true;
  if (element.name === "noscript") return true;
  return false;
}

function isDeclarativeShadowTemplate(element: Element): boolean {
  if (element.name !== "template") return false;
  const mode = attr(element, "shadowrootmode") ?? attr(element, "shadowroot");
  return mode === "open" || mode === "closed";
}

function shouldSummarizeMoreChildren(element: Element, children: SemanticNode[], context: StaticContext): boolean {
  if (!context.options.summarizeLargeSubtrees || context.options.mode === "full") return false;
  if (!isLargeSubtreeCandidate(element)) return false;
  return children.length >= context.options.maxChildrenPerNode;
}

function isLargeSubtreeCandidate(element: Element): boolean {
  return ["nav", "ul", "ol", "div", "section", "footer", "header", "main"].includes(element.name);
}

function summarizeLikelyLinkFarmChildren(
  element: Element,
  children: SemanticNode[],
  context: StaticContext,
): { children: SemanticNode[]; omitted: number } {
  if (!context.options.summarizeLikelyLinkFarms || context.options.mode === "full") return { children, omitted: 0 };
  if (children.length <= context.options.maxLinkFarmChildren) return { children, omitted: 0 };
  if (!isLikelyLinkFarmContainer(element)) return { children, omitted: 0 };
  const stats = childLinkFarmStats(children);
  if (stats.linkishChildren < Math.max(8, Math.floor(children.length * 0.65))) return { children, omitted: 0 };
  if (stats.contentRichChildren > Math.max(2, Math.floor(children.length * 0.2))) return { children, omitted: 0 };

  const kept: SemanticNode[] = [];
  let omitted = 0;
  let keptLinkish = 0;
  for (const child of children) {
    /* v8 ignore next 4 -- covered by link-farm tests, but V8 maps this continue branch unreliably through TS output. */
    if (!isLinkishSummaryChild(child)) {
      kept.push(child);
      continue;
    }
    if (keptLinkish < context.options.maxLinkFarmChildren) {
      kept.push(child);
      keptLinkish += 1;
    } else {
      omitted += countSemanticNodes(child);
    }
  }
  return omitted > 0 ? { children: kept, omitted } : { children, omitted: 0 };
}

function isLikelyLinkFarmContainer(element: Element): boolean {
  if (["nav", "ul", "ol", "aside", "footer", "header"].includes(element.name)) return true;
  if (!["div", "section"].includes(element.name)) return false;
  const value = [
    attr(element, "id"),
    attr(element, "class"),
    attr(element, "role"),
    attr(element, "aria-label"),
    attr(element, "title"),
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(article|body|content|contents|entry|main|post|story|text|view)\b/.test(value)) return false;
  return /\b(board|category|comment|footer|gallery|gnb|header|issue|list|menu|nav|popular|recent|recommend|related|reply|sidebar|tab)\b/.test(value)
    || /갤러리|댓글|개념글|관련|목록|베스트|인기|최근|추천|카테고리/.test(value);
}

function childLinkFarmStats(children: SemanticNode[]): { linkishChildren: number; contentRichChildren: number } {
  let linkishChildren = 0;
  let contentRichChildren = 0;
  for (const child of children) {
    if (isLinkishSummaryChild(child)) linkishChildren += 1;
    if (isContentRichSummaryChild(child)) contentRichChildren += 1;
  }
  return { linkishChildren, contentRichChildren };
}

function isLinkishSummaryChild(node: SemanticNode): boolean {
  const stats = semanticRoleStats(node);
  return stats.links > 0
    && stats.formControls === 0
    && stats.tables === 0
    && stats.paragraphs <= 1
    && stats.contentContainers === 0;
}

function isContentRichSummaryChild(node: SemanticNode): boolean {
  const stats = semanticRoleStats(node);
  return stats.paragraphs > 1 || stats.tables > 0 || stats.contentContainers > 0 || stats.formControls > 0;
}

function semanticRoleStats(node: SemanticNode): {
  links: number;
  paragraphs: number;
  tables: number;
  formControls: number;
  contentContainers: number;
} {
  const role = node.role ?? node.tag;
  const stats = {
    links: role === "link" ? 1 : 0,
    paragraphs: role === "p" || role === "text" ? 1 : 0,
    tables: role === "table" || role === "row" || role === "cell" ? 1 : 0,
    formControls: role === "textbox" || role === "searchbox" || role === "combobox" || role === "listbox" || role === "checkbox" || role === "radio" || role === "slider" || role === "spinbutton" || role === "switch" ? 1 : 0,
    contentContainers: role === "article" || role === "main" ? 1 : 0,
  };
  for (const child of node.children) {
    const childStats = semanticRoleStats(child);
    stats.links += childStats.links;
    stats.paragraphs += childStats.paragraphs;
    stats.tables += childStats.tables;
    stats.formControls += childStats.formControls;
    stats.contentContainers += childStats.contentContainers;
  }
  return stats;
}

function shouldSummarizeRepeatedChild(
  parent: Element,
  child: SemanticNode,
  signatures: Map<string, number>,
  context: StaticContext,
): boolean {
  if (!context.options.summarizeRepeatedSubtrees || context.options.mode === "full") return false;
  if (!isRepeatedSubtreeCandidate(parent)) return false;
  const signature = semanticSignature(child);
  const count = signatures.get(signature) ?? 0;
  signatures.set(signature, count + 1);
  return count >= context.options.maxRepeatedSubtreeInstances;
}

function isRepeatedSubtreeCandidate(element: Element): boolean {
  return ["body", "main", "nav", "ul", "ol", "div", "section", "footer", "header", "aside"].includes(element.name);
}

function semanticSignature(node: SemanticNode): string {
  const childSignatures = node.children.map(semanticSignature).join(",");
  return `${node.tag}|${node.role ?? ""}|${node.name}|${node.text ?? ""}|${node.value ?? ""}|${node.interactive ? "i" : ""}[${childSignatures}]`;
}

function countSemanticNodes(node: SemanticNode): number {
  let count = 1;
  for (const child of node.children) count += countSemanticNodes(child);
  return count;
}

function shouldSkipChildrenForCollapsedElement(element: Element, context: StaticContext): boolean {
  if (!context.options.pruneCollapsedSubtrees || context.options.includeHidden) return false;
  if (attr(element, "aria-expanded") === "false") return true;
  if (element.name === "details" && attr(element, "open") === null) return true;
  if (element.name === "dialog" && attr(element, "open") === null) return true;
  if (attr(element, "popover") !== null && attr(element, "open") === null) return true;
  return false;
}

function isCollapsedControlledElement(element: Element, context: StaticContext): boolean {
  const id = attr(element, "id");
  return Boolean(id && context.options.pruneCollapsedSubtrees && context.collapsedControlledIds.has(id));
}

function isLikelyClosedOverlay(element: Element, context: StaticContext): boolean {
  if (!context.options.pruneLikelyClosedOverlays || context.options.mode === "full") return false;
  if (hasUsefulOpenSignal(element)) return false;
  if (!hasOverlaySignal(element)) return false;
  if (hasDirectFocusableIntent(element)) return false;
  return hasOffscreenOrClosedStyle(element) || hasClosedClassSignal(element) || hasInertSignal(element);
}

function hasUsefulOpenSignal(element: Element): boolean {
  return attr(element, "open") !== null
    || attr(element, "aria-expanded") === "true"
    || attr(element, "aria-modal") === "true"
    || attr(element, "data-open") === "true"
    || attr(element, "data-state") === "open";
}

function hasOverlaySignal(element: Element): boolean {
  const value = [element.name, attr(element, "id"), attr(element, "class"), attr(element, "role"), attr(element, "aria-label")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(drawer|modal|dialog|popover|overlay|hamburger|menu|sidebar|sheet|flyout|dropdown)\b/.test(value);
}

function hasDirectFocusableIntent(element: Element): boolean {
  const tabindex = attr(element, "tabindex");
  return tabindex !== null && Number(tabindex) >= 0;
}

function hasInertSignal(element: Element): boolean {
  return attr(element, "inert") !== null || attr(element, "aria-hidden") === "true";
}

function hasClosedClassSignal(element: Element): boolean {
  const className = attr(element, "class") ?? "";
  return /\b(closed|collapsed|hidden|inactive|is-closed|is-hidden)\b/i.test(className);
}

function hasOffscreenOrClosedStyle(element: Element): boolean {
  const style = attr(element, "style") ?? "";
  if (!style) return false;
  const normalized = style.replace(/\s+/g, "").toLowerCase();
  return /(?:^|;)(?:left|right|top|bottom):-\d{2,}(?:px|rem|em|vw|vh|%)/.test(normalized)
    || /(?:^|;)transform:translate[xy]?\(-[1-9]\d*%/.test(normalized)
    || /(?:^|;)(?:max-height|height):0(?:px|rem|em|%)?/.test(normalized)
    || /(?:^|;)pointer-events:none/.test(normalized);
}

function shouldPrune(
  element: Element,
  role: string | null,
  name: string,
  interactive: boolean,
  children: SemanticNode[],
  context: StaticContext,
): boolean {
  if (context.options.mode === "full") return false;
  if (role === "none" || role === "presentation") return true;
  if (interactive) return false;
  if (role && role !== "generic") return false;
  if (name) return false;
  if (isReferencedIdTarget(element, context)) return false;
  if (children.length === 0) return true;
  if (attr(element, "id") || attr(element, "aria-label") || attr(element, "aria-labelledby")) return false;
  return children.length > 0;
}

function isReferencedIdTarget(element: Element, context: StaticContext): boolean {
  const id = attr(element, "id");
  return Boolean(id && context.referencedIds.has(id));
}

function shouldPruneListItemWrapper(role: string | null, children: SemanticNode[], context: StaticContext): boolean {
  if (context.options.mode === "full") return false;
  if (role !== "listitem") return false;
  return children.some((child) => child.role === "link" || child.role === "button");
}

function shouldPruneCustomElementWrapper(
  element: Element,
  role: string | null,
  name: string,
  interactive: boolean,
  children: SemanticNode[],
  context: StaticContext,
): boolean {
  if (context.options.mode === "full") return false;
  if (!isCustomElement(element)) return false;
  if (interactive) return false;
  if (role && role !== "generic") return false;
  if (name) return false;
  if (children.length === 0) return false;
  if (hasUsefulHostSignal(element)) return false;
  return true;
}

function isCustomElement(element: Element): boolean {
  return element.name.includes("-");
}

function hasUsefulHostSignal(element: Element): boolean {
  return Boolean(
    attr(element, "id")
      || attr(element, "aria-label")
      || attr(element, "aria-labelledby")
      || attr(element, "aria-describedby")
      || attr(element, "aria-controls")
      || attr(element, "aria-expanded")
      || attr(element, "aria-selected")
      || attr(element, "aria-current")
      || attr(element, "tabindex")
  );
}

function getRole(element: Element): string | null {
  const explicit = firstToken(attr(element, "role"));
  if (explicit) return explicit;
  const tag = element.name;
  if (tag === "section" && !hasExplicitNameSource(element)) return null;
  if (tag === "form" && !hasExplicitNameSource(element)) return null;
  if (tag in landmarkTags) return landmarkTags[tag] ?? null;
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "a" || tag === "area") return attr(element, "href") ? "link" : null;
  if (tag === "button") return "button";
  if (tag === "details" || tag === "fieldset") return "group";
  if (tag === "dialog") return "dialog";
  if (tag === "figure") return "figure";
  if (tag === "form") return "form";
  if (tag === "iframe") return "iframe";
  if (tag === "img") return "img";
  if (tag === "input") return inputRole(element);
  if (tag === "li") return "listitem";
  if (tag === "ol" || tag === "ul") return "list";
  if (tag === "option") return "option";
  if (tag === "p") return "p";
  if (tag === "progress") return "progressbar";
  if (tag === "select") return attr(element, "multiple") !== null ? "listbox" : "combobox";
  if (tag === "summary") return "button";
  if (tag === "table") return "table";
  if (tag === "td") return "cell";
  if (tag === "textarea") return "textbox";
  if (tag === "th") return attr(element, "scope") === "row" ? "rowheader" : "columnheader";
  if (tag === "tr") return "row";
  return null;
}

function inputRole(element: Element): string | null {
  const type = (attr(element, "type") ?? "text").toLowerCase();
  if (type === "hidden") return null;
  if (type === "button" || type === "submit" || type === "reset") return "button";
  if (type === "checkbox") return "checkbox";
  if (type === "image") return "button";
  if (type === "radio") return "radio";
  if (type === "range") return "slider";
  if (type === "search") return "searchbox";
  if (type === "number") return "spinbutton";
  return "textbox";
}

function computeName(element: Element, role: string, context: StaticContext): string {
  const labelledBy = attr(element, "aria-labelledby");
  if (labelledBy) {
    const value = labelledBy
      .split(/\s+/)
      .map((id) => context.ids.get(id))
      .filter((item): item is Element => Boolean(item))
      .map((item) => descendantText(item, context))
      .join(" ");
    const normalized = normalizeText(value, context.options.maxTextLength);
    if (normalized) return normalized;
  }

  const ariaLabel = normalizeText(attr(element, "aria-label") ?? "", context.options.maxTextLength);
  if (ariaLabel) return ariaLabel;

  const labelled = labelName(element, context);
  if (labelled) return labelled;

  const valueName = elementValueName(element);
  if (valueName) return normalizeText(valueName, context.options.maxTextLength);

  if (role === "img") {
    const alt = normalizeText(attr(element, "alt") ?? "", context.options.maxTextLength);
    if (alt) return alt;
  }

  if (rolesNamedFromContents.has(role)) {
    const contents = normalizeText(descendantText(element, context), context.options.maxTextLength);
    if (contents) return contents;
  }

  const title = normalizeText(attr(element, "title") ?? "", context.options.maxTextLength);
  if (title) return title;

  return "";
}

function labelName(element: Element, context: StaticContext): string {
  const id = attr(element, "id");
  if (id) {
    const label = context.labelsByFor.get(id);
    if (label) {
      const value = normalizeText(descendantText(label, context), context.options.maxTextLength);
      if (value) return value;
    }
  }
  const label = findClosestLabel(element);
  return label ? normalizeText(descendantText(label, context), context.options.maxTextLength) : "";
}

function findClosestLabel(element: Element): Element | null {
  let parent = element.parent;
  while (parent) {
    if (isElement(parent) && parent.name === "label") return parent;
    parent = parent.parent;
  }
  return null;
}

function elementValueName(element: Element): string {
  if (element.name === "input") {
    const type = (attr(element, "type") ?? "text").toLowerCase();
    if (type === "button" || type === "submit" || type === "reset") return attr(element, "value") ?? "";
  }
  return "";
}

function getState(element: Element): SemanticNodeState {
  const state: SemanticNodeState = {};
  if (attr(element, "disabled") !== null || attr(element, "aria-disabled") === "true") state.disabled = true;
  const busy = attr(element, "aria-busy");
  if (busy === "true") state.busy = true;
  if (busy === "false") state.busy = false;
  const multiselectable = attr(element, "aria-multiselectable");
  if (multiselectable === "true") state.multiselectable = true;
  if (multiselectable === "false") state.multiselectable = false;
  const sort = attr(element, "aria-sort");
  if (sort) state.sort = normalizeText(sort, 40);
  const grabbed = attr(element, "aria-grabbed");
  if (grabbed === "true") state.grabbed = true;
  if (grabbed === "false") state.grabbed = false;
  const dropEffect = attr(element, "aria-dropeffect");
  if (dropEffect) state.dropEffect = normalizeText(dropEffect, 80);
  if (attr(element, "required") !== null || attr(element, "aria-required") === "true") state.required = true;
  if (attr(element, "readonly") !== null || attr(element, "aria-readonly") === "true") state.readonly = true;
  const checked = attr(element, "aria-checked") ?? (attr(element, "checked") !== null ? "true" : null);
  if (checked === "true") state.checked = true;
  if (checked === "false") state.checked = false;
  if (checked === "mixed") state.checked = "mixed";
  if (attr(element, "selected") !== null || attr(element, "aria-selected") === "true") state.selected = true;
  const expanded = attr(element, "aria-expanded");
  if (expanded === "true") state.expanded = true;
  if (expanded === "false") state.expanded = false;
  const pressed = attr(element, "aria-pressed");
  if (pressed === "true") state.pressed = true;
  if (pressed === "false") state.pressed = false;
  if (pressed === "mixed") state.pressed = "mixed";
  const invalid = attr(element, "aria-invalid");
  if (invalid && invalid !== "false") state.invalid = invalid === "true" ? true : invalid;
  const current = attr(element, "aria-current");
  if (current && current !== "false") state.current = current === "true" ? true : current;
  const haspopup = attr(element, "aria-haspopup");
  if (haspopup && haspopup !== "false") state.haspopup = haspopup === "true" ? true : haspopup;
  const controls = attr(element, "aria-controls");
  if (controls) state.controls = normalizeText(controls, 120);
  const live = attr(element, "aria-live");
  if (live) state.live = normalizeText(live, 120);
  if (attr(element, "aria-modal") === "true") state.modal = true;
  const orientation = attr(element, "aria-orientation");
  if (orientation) state.orientation = normalizeText(orientation, 40);
  const valueMin = ariaNumber(attr(element, "aria-valuemin"));
  if (typeof valueMin === "number") state.valueMin = valueMin;
  const valueMax = ariaNumber(attr(element, "aria-valuemax"));
  if (typeof valueMax === "number") state.valueMax = valueMax;
  const valueNow = ariaNumber(attr(element, "aria-valuenow"));
  if (typeof valueNow === "number") state.valueNow = valueNow;
  const valueText = attr(element, "aria-valuetext");
  if (valueText) state.valueText = normalizeText(valueText, 120);
  return state;
}

function ariaNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isInteractive(element: Element, role: string | null, focusable: boolean): boolean {
  if (role && interactiveRoles.has(role)) return true;
  if (focusable) return true;
  return ["button", "input", "select", "textarea"].includes(element.name);
}

function isFocusable(element: Element, role: string | null): boolean {
  if (attr(element, "disabled") !== null) return false;
  const tabindex = attr(element, "tabindex");
  if (tabindex !== null && Number(tabindex) >= 0) return true;
  if (role && interactiveRoles.has(role)) return true;
  return element.name === "a" && attr(element, "href") !== null;
}

function isHidden(element: Element): boolean {
  if (attr(element, "hidden") !== null) return true;
  if (attr(element, "aria-hidden") === "true") return true;
  const style = attr(element, "style");
  return style ? hiddenStylePattern.test(style) : false;
}

function isLikelyAd(element: Element): boolean {
  const value = [
    attr(element, "id"),
    attr(element, "class"),
    attr(element, "aria-label"),
    attr(element, "title"),
    attr(element, "data-testid"),
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(ad|ads|advert|advertisement|banner|sponsor|sponsored|promotion|promoted|powerlink)\b/.test(value)
    || /파워링크|광고|직접홍보|홍보/.test(value);
}

function isLikelyBoilerplate(element: Element): boolean {
  if (element.name === "footer") return true;
  if (element.name === "main" || element.name === "article") return false;
  const role = firstToken(attr(element, "role"));
  if (role === "main" || role === "article") return false;
  const value = [
    attr(element, "id"),
    attr(element, "class"),
    attr(element, "aria-label"),
    attr(element, "title"),
  ].filter(Boolean).join(" ").toLowerCase();
  if (!value) return false;
  if (/\b(content|contents|entry|post-body|article-body|story-body|view-content)\b/.test(value)) return false;
  return /\b(footer|sidebar)\b/.test(value) || /푸터/.test(value);
}

function isLikelyBoilerplateTable(element: Element): boolean {
  if (element.name !== "table") return false;
  const value = [
    attr(element, "id"),
    attr(element, "class"),
    attr(element, "aria-label"),
    attr(element, "title"),
  ].filter(Boolean).join(" ").toLowerCase();
  return /\bgall[_-]?list\b/.test(value) || /\bbottom[_-]?list\w*\b/.test(value);
}

function flattenBoilerplateTable(element: Element, context: StaticContext): SemanticNode | null {
  const children = collectFlattenedBoilerplateItems(element, context);
  if (children.length === 0) return null;
  return containerNode(context, element.name, children);
}

function collectFlattenedBoilerplateItems(element: Element, context: StaticContext): SemanticNode[] {
  const children: SemanticNode[] = [];
  for (const child of element.children) {
    if (!isElement(child)) continue;
    if (shouldSkipElement(child, context)) continue;
    if (!context.options.includeHidden && isHidden(child)) continue;
    if (context.options.excludeLikelyAds && isLikelyAd(child)) continue;
    const role = getRole(child);
    const focusable = isFocusable(child, role);
    const interactive = isInteractive(child, role, focusable);
    const name = role ? computeName(child, role, context) : "";
    if (role && name && (interactive || role === "heading" || role === "img")) {
      const node: SemanticNode = {
        id: nextId(context),
        tag: child.name,
        role,
        name,
        interactive,
        focusable,
        selector: getSelector(child),
        xpath: getXPath(child),
        children: [],
      };
      const description = computeDescription(child, context);
      if (description) node.description = description;
      const value = getValue(child);
      if (value) node.value = value;
      const state = getState(child);
      if (Object.keys(state).length > 0) node.state = state;
      if (context.options.includeAttributes) node.attributes = { ...child.attribs };
      children.push(node);
      continue;
    }
    children.push(...collectFlattenedBoilerplateItems(child, context));
  }
  return children;
}

function hasExplicitNameSource(element: Element): boolean {
  return attr(element, "aria-label") !== null || attr(element, "aria-labelledby") !== null || attr(element, "title") !== null;
}

function directText(element: Element, maxLength: number): string {
  return normalizeText(
    element.children
      .filter(isText)
      .map((node) => node.data)
      .join(" "),
    maxLength,
  );
}

function descendantText(element: Element, context?: StaticContext): string {
  const parts: string[] = [];
  collectDescendantText(element.children, parts, context);
  return parts.join(" ");
}

function collectDescendantText(nodes: AnyNode[], parts: string[], context?: StaticContext): void {
  for (const node of nodes) {
    if (isText(node)) {
      parts.push(node.data);
      continue;
    }
    if (!isElement(node)) continue;
    if (node.name === "slot" && context?.slotAssignments) {
      const slotName = attr(node, "name") ?? "";
      const assigned = context.slotAssignments.get(slotName) ?? [];
      collectDescendantText(assigned.length > 0 ? assigned : node.children, parts, context);
      continue;
    }
    if (nonSemanticTags.has(node.name) || node.name === "noscript") continue;
    collectDescendantText(node.children, parts, context);
  }
}

function normalizeText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function computeDescription(element: Element, context: StaticContext): string {
  const describedBy = attr(element, "aria-describedby");
  if (describedBy) {
    const text = describedBy
      .split(/\s+/)
      .map((id) => context.ids.get(id))
      .filter((item): item is Element => Boolean(item))
      .map((item) => descendantText(item, context))
      .filter(Boolean)
      .join(" ");
    if (text) return normalizeText(text, context.options.maxTextLength);
  }
  return normalizeText(attr(element, "title") ?? "", context.options.maxTextLength);
}

function getValue(element: Element): string {
  return normalizeText(attr(element, "value") ?? attr(element, "aria-valuetext") ?? attr(element, "aria-valuenow") ?? "", 240);
}

function getSelector(element: Element): string {
  const id = attr(element, "id");
  if (id) return `#${cssEscape(id)}`;
  const parent = element.parent;
  if (!parent || !("children" in parent)) return element.name;
  const siblings = parent.children.filter((node): node is Element => isElement(node) && node.name === element.name);
  const index = siblings.indexOf(element);
  return index > 0 ? `${element.name}:nth-of-type(${index + 1})` : element.name;
}

function getXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    const parent: AnyNode | null = current.parent;
    /* v8 ignore next 4 -- htmlparser2 assigns parents for nodes returned by the public extract API. */
    if (!parent || !("children" in parent)) {
      parts.unshift(current.name);
      break;
    }
    const siblings = parent.children.filter((node): node is Element => isElement(node) && node.name === current?.name);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${current.name}[${index}]`);
    current = isElement(parent) ? parent : null;
  }
  return `/${parts.join("/")}`;
}

function containerNode(context: StaticContext, tag: string, children: SemanticNode[]): SemanticNode {
  return {
    id: nextId(context),
    tag,
    role: null,
    name: "",
    interactive: false,
    focusable: false,
    children,
  };
}

/* v8 ignore start -- defensive fallback for impossible parser roots. */
function unavailableNode(context: StaticContext, tag: string, unavailableReason: string): SemanticNode {
  return {
    id: nextId(context),
    tag,
    role: null,
    name: "",
    interactive: false,
    focusable: false,
    children: [],
    unavailableReason,
  };
}
/* v8 ignore stop */

function omittedNode(context: StaticContext, omitted: number): SemanticNode {
  return {
    id: nextId(context),
    tag: "omitted",
    role: "note",
    name: `${omitted} static nodes omitted`,
    interactive: false,
    focusable: false,
    children: [],
  };
}

function nextId(context: StaticContext): string {
  return `static-${context.nextId++}`;
}

function attr(element: Element, name: string): string | null {
  return Object.prototype.hasOwnProperty.call(element.attribs, name) ? element.attribs[name] ?? "" : null;
}

function firstToken(value: string | null): string | null {
  return value?.trim().split(/\s+/)[0] || null;
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function isText(node: AnyNode): node is Text {
  return node.type === "text";
}

function findElement(nodes: AnyNode[], name: string): Element | undefined {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    if (node.name === name) return node;
    const child = findElement(node.children, name);
    if (child) return child;
  }
  return undefined;
}

function fragmentRoot(children: AnyNode[]): Element {
  return new DomElement("fragment", {}, children);
}
