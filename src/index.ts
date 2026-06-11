import { formatSemanticTreeText, observeSemanticTree } from "./browser";
import { extract as extractStatic, type StaticSemanticTreeOptions } from "./static";
import type { ExtractorScriptOptions, ObserverScriptOptions, SemanticNode, SemanticTreeOptions } from "./types";

export type {
  AgentContract,
  AgentContractFeature,
  AgentAction,
  AgentActionTargetChoice,
  AgentAnswerPlan,
  AgentBrowserHtmlCapture,
  AgentCitation,
  AgentContinuationMode,
  AgentExpectedOutcome,
  AgentExpectedOutcomeKind,
  AgentExecutorStep,
  AgentExecutionMode,
  AgentFormChoice,
  AgentHandoff,
  AgentJsonEnvelope,
  AgentLoopDecision,
  AgentLoopDirective,
  AgentNext,
  AgentQualityGate,
  AgentQualityGateKind,
  AgentReadTarget,
  AgentReadValue,
  AgentResultChoice,
  AgentRoutingIntent,
  AgentSignal,
  AgentSignalKind,
  AgentSignalSeverity,
  AgentSourceChoice,
  AgentSourceSearch,
  AgentSourceSearchResult,
  AgentStatus,
  AgentSummary,
  AgentTarget,
  ExtractMode,
  ExtractorScriptOptions,
  OutputFormat,
  ObserverScriptOptions,
  SemanticNode,
  SemanticNodeBounds,
  SemanticNodeState,
  SemanticTreeChange,
  SemanticTreeObserverOptions,
  SemanticTreeOptions,
} from "./types";
export type { StaticSemanticTreeOptions } from "./static";

export { formatSemanticTreeText, observeSemanticTree };

export function extract(html: string, options?: StaticSemanticTreeOptions): SemanticNode {
  return extractStatic(html, options);
}

export function createExtractorScript(options: ExtractorScriptOptions = {}): string {
  const serializedOptions = JSON.stringify(options);
  return `(() => {
    ${browserBundleSource()}
    const options = ${serializedOptions};
    const tree = __AX_LITE__.extractSemanticTree(options);
    return options.format === "text" ? __AX_LITE__.formatSemanticTreeText(tree) : tree;
  })()`;
}

export function createObserverScript(options: ObserverScriptOptions = {}): string {
  const { globalName = "__AX_LITE_OBSERVER__", ...observerOptions } = options;
  const serializedOptions = JSON.stringify(observerOptions);
  const serializedGlobalName = JSON.stringify(globalName);
  return `(() => {
    ${browserBundleSource()}
    const globalName = ${serializedGlobalName};
    const observer = __AX_LITE__.observeSemanticTree((change) => {
      window.dispatchEvent(new CustomEvent(globalName + ":change", { detail: change }));
    }, ${serializedOptions});
    window[globalName] = observer;
    return observer.snapshot();
  })()`;
}

export function flattenSemanticTree(node: SemanticNode): SemanticNode[] {
  const nodes: SemanticNode[] = [];
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) continue;
    nodes.push(current);
    stack.unshift(...current.children);
  }
  return nodes;
}

export function summarizeSemanticTree(node: SemanticNode): {
  nodeCount: number;
  interactiveCount: number;
  roles: Record<string, number>;
  namedRoles: string[];
} {
  const flat = flattenSemanticTree(node);
  const roles: Record<string, number> = {};
  const namedRoles: string[] = [];
  for (const item of flat) {
    const role = item.role ?? item.tag;
    roles[role] = (roles[role] ?? 0) + 1;
    if (item.role && item.name) namedRoles.push(`${item.role}:${item.name}`);
  }
  return {
    nodeCount: flat.length,
    interactiveCount: flat.filter((item) => item.interactive).length,
    roles,
    namedRoles,
  };
}

export function normalizeOptions(options: SemanticTreeOptions = {}): SemanticTreeOptions {
  return {
    mode: "compact",
    includeBounds: true,
    includeAttributes: true,
    includeTextNodes: true,
    includeHidden: false,
    includeSelectOptions: true,
    excludeLikelyAds: false,
    excludeLikelyBoilerplate: false,
    pruneCustomElementWrappers: true,
    pruneCollapsedSubtrees: true,
    pruneLikelyClosedOverlays: false,
    summarizeLargeSubtrees: false,
    summarizeLikelyLinkFarms: false,
    summarizeRepeatedSubtrees: false,
    maxChildrenPerNode: 80,
    maxLinkFarmChildren: 24,
    maxRepeatedSubtreeInstances: 3,
    ...options,
  };
}

function browserBundleSource(): string {
  return String.raw`
const __AX_LITE__ = (() => {
  const defaultOptions = {
    mode: "compact",
    includeBounds: true,
    includeAttributes: true,
    includeTextNodes: true,
    includeHidden: false,
    includeSelectOptions: true,
    excludeLikelyAds: false,
    excludeLikelyBoilerplate: false,
    pruneCustomElementWrappers: true,
    pruneCollapsedSubtrees: true,
    pruneLikelyClosedOverlays: false,
    summarizeLargeSubtrees: false,
    summarizeLikelyLinkFarms: false,
    summarizeRepeatedSubtrees: false,
    maxChildrenPerNode: 80,
    maxLinkFarmChildren: 24,
    maxRepeatedSubtreeInstances: 3,
    maxTextLength: 240,
  };
  const interactiveRoles = new Set(["button","checkbox","combobox","link","listbox","menuitem","menuitemcheckbox","menuitemradio","option","radio","searchbox","slider","spinbutton","switch","tab","textbox","treeitem"]);
  const landmarkTags = { article: "article", aside: "complementary", footer: "contentinfo", form: "form", header: "banner", main: "main", nav: "navigation", section: "region" };
  const rolesNamedFromContents = new Set(["button","cell","checkbox","columnheader","heading","link","menuitem","menuitemcheckbox","menuitemradio","option","radio","rowheader","switch","tab","treeitem"]);
  function extractSemanticTree(options = {}) {
    const rootDocument = document;
    const context = { options: { ...defaultOptions, ...options }, nextId: 1, rootDocument };
    return walkElement(rootDocument.body || rootDocument.documentElement, context) || unavailableNode(context, "document", "Document has no inspectable body");
  }
  function formatSemanticTreeText(node) {
    const lines = [];
    function visit(current, depth) {
      const prefix = "  ".repeat(depth);
      const role = current.role || current.tag;
      const marker = current.interactive ? "[i] " : "";
      const name = current.name ? " '" + current.name + "'" : "";
      const state = formatState(current.state);
      const unavailable = current.unavailableReason ? " (" + current.unavailableReason + ")" : "";
      lines.push(prefix + marker + role + name + state + unavailable);
      for (const child of current.children) visit(child, depth + 1);
    }
    visit(node, 0);
    return lines.join("\n");
  }
  function observeSemanticTree(onChange, options = {}) {
    const root = document.documentElement;
    const debounceMs = options.debounceMs ?? 50;
    let mutationCount = 0;
    let timeoutId;
    function snapshot() { return extractSemanticTree(options); }
    function emit() {
      timeoutId = undefined;
      onChange({ tree: snapshot(), changedAt: Date.now(), mutationCount });
      mutationCount = 0;
    }
    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(emit, debounceMs);
    });
    observer.observe(root, { attributes: true, characterData: true, childList: true, subtree: true });
    return {
      disconnect() {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        observer.disconnect();
      },
      snapshot,
    };
  }
  function walkElement(element, context) {
    if (!context.options.includeHidden && isHidden(element)) return null;
    if (context.options.excludeLikelyAds && isLikelyAd(element)) return null;
    const role = getRole(element);
    const state = getState(element);
    const focusable = isFocusable(element);
    const interactive = isInteractive(element, role, focusable);
    const name = role ? computeName(element, role, context) : "";
    const description = computeDescription(element, context);
    const tag = element.tagName.toLowerCase();
    const children = collectChildren(element, context);
    if (context.options.mode === "interactive" && !interactive) return children.length > 0 ? containerNode(context, tag, children) : null;
    if (shouldPrune(element, role, name, interactive, children, context)) return children.length === 1 ? children[0] || null : containerNode(context, tag, children);
    const node = { id: nextId(context), tag, role, name, interactive, focusable, children };
    if (description) node.description = description;
    const text = getDirectText(element, context.options.maxTextLength);
    if (text) node.text = text;
    const value = getValue(element);
    if (value) node.value = value;
    if (Object.keys(state).length > 0) node.state = state;
    node.selector = getCssPath(element);
    node.xpath = getXPath(element);
    if (context.options.includeBounds) node.bounds = getBounds(element);
    if (context.options.includeAttributes) node.attributes = getAttributes(element);
    appendSpecialChildren(element, node, context);
    appendShadowChildren(element, node, context);
    appendFrameChildren(element, node, context);
    return node;
  }
  function collectChildren(element, context) {
    const children = [];
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!context.options.includeSelectOptions && element instanceof HTMLSelectElement) continue;
        const semanticChild = walkElement(child, context);
        if (semanticChild) children.push(semanticChild);
      } else if (context.options.includeTextNodes && child.nodeType === Node.TEXT_NODE) {
        const text = normalizeText(child.textContent || "", context.options.maxTextLength);
        if (text) children.push({ id: nextId(context), tag: "#text", role: "text", name: text, text, interactive: false, focusable: false, children: [] });
      }
    }
    return children;
  }
  function shouldPrune(element, role, name, interactive, children, context) {
    if (context.options.mode === "full") return false;
    if (role === "none" || role === "presentation") return true;
    if (interactive) return false;
    if (context.options.pruneCustomElementWrappers && isCustomElement(element)) return children.length > 0;
    if (role && role !== "generic") return false;
    if (name) return false;
    if (element.id || element.getAttribute("aria-label") || element.getAttribute("aria-labelledby")) return false;
    return children.length > 0;
  }
  function getRole(element) {
    const explicit = firstToken(element.getAttribute("role"));
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === "section" && !hasExplicitNameSource(element)) return null;
    if (tag === "form" && !hasExplicitNameSource(element)) return null;
    if (tag in landmarkTags) return landmarkTags[tag] || null;
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "a" || tag === "area") return element.hasAttribute("href") ? "link" : null;
    if (tag === "button") return "button";
    if (tag === "details") return "group";
    if (tag === "dialog") return "dialog";
    if (tag === "fieldset") return "group";
    if (tag === "figure") return "figure";
    if (tag === "iframe") return "iframe";
    if (tag === "img") return hasEmptyAlt(element) ? "presentation" : "img";
    if (tag === "li") return "listitem";
    if (tag === "ol" || tag === "ul") return "list";
    if (tag === "optgroup") return "group";
    if (tag === "option") return "option";
    if (tag === "output") return "status";
    if (tag === "progress") return "progressbar";
    if (tag === "select") return element.hasAttribute("multiple") ? "listbox" : "combobox";
    if (tag === "summary") return "button";
    if (tag === "table") return "table";
    if (tag === "caption") return "caption";
    if (tag === "tbody" || tag === "tfoot" || tag === "thead") return "rowgroup";
    if (tag === "td") return "cell";
    if (tag === "textarea") return "textbox";
    if (tag === "th") return element.getAttribute("scope") === "row" ? "rowheader" : "columnheader";
    if (tag === "tr") return "row";
    if (tag === "input") return inputRole(element);
    return null;
  }
  function inputRole(input) {
    const type = (input.getAttribute("type") || "text").toLowerCase();
    if (type === "button" || type === "image" || type === "reset" || type === "submit") return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "email" || type === "tel" || type === "text" || type === "url") return "textbox";
    if (type === "number") return "spinbutton";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    if (type === "search") return "searchbox";
    if (type === "hidden") return null;
    return "textbox";
  }
  function computeName(element, role, context) {
    if (element.getAttribute("aria-labelledby")) {
      const labelled = textFromIds(element.getAttribute("aria-labelledby") || "", context.rootDocument);
      if (labelled) return labelled;
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return normalizeText(ariaLabel, context.options.maxTextLength);
    if (element instanceof HTMLInputElement && isButtonLikeInput(element)) return normalizeText(element.value || element.getAttribute("value") || inputFallbackName(element), context.options.maxTextLength);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const label = labelText(element, context);
      if (label) return label;
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) return normalizeText(placeholder, context.options.maxTextLength);
    }
    if (element instanceof HTMLImageElement) return normalizeText(element.alt || element.getAttribute("title") || "", context.options.maxTextLength);
    if (element instanceof HTMLFieldSetElement) {
      const legend = element.querySelector(":scope > legend");
      if (legend) return getVisibleText(legend, context.options.maxTextLength);
    }
    if (rolesNamedFromContents.has(role)) {
      const ownText = getVisibleText(element, context.options.maxTextLength);
      if (ownText) return ownText;
    }
    return normalizeText(element.getAttribute("title") || "", context.options.maxTextLength);
  }
  function computeDescription(element, context) {
    const describedBy = element.getAttribute("aria-describedby");
    if (describedBy) return textFromIds(describedBy, context.rootDocument);
    return normalizeText(element.getAttribute("title") || "", context.options.maxTextLength);
  }
  function labelText(element, context) {
    if (element.labels && element.labels.length > 0) return normalizeText(Array.from(element.labels).map((label) => getVisibleText(label, context.options.maxTextLength)).join(" "), context.options.maxTextLength);
    return "";
  }
  function getState(element) {
    const state = {};
    if (isHidden(element)) state.hidden = true;
    if (isDisabled(element)) state.disabled = true;
    const busy = ariaBoolean(element.getAttribute("aria-busy"));
    if (busy !== undefined) state.busy = busy;
    const multiselectable = ariaBoolean(element.getAttribute("aria-multiselectable"));
    if (multiselectable !== undefined) state.multiselectable = multiselectable;
    if (element === document.activeElement) state.focused = true;
    const checked = ariaBooleanOrMixed(element.getAttribute("aria-checked"));
    if (checked !== undefined) state.checked = checked;
    else if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) state.checked = element.checked;
    const selected = ariaBoolean(element.getAttribute("aria-selected"));
    if (selected !== undefined) state.selected = selected;
    else if (element instanceof HTMLOptionElement) state.selected = element.selected;
    const expanded = ariaBoolean(element.getAttribute("aria-expanded"));
    if (expanded !== undefined) state.expanded = expanded;
    const pressed = ariaBooleanOrMixed(element.getAttribute("aria-pressed"));
    if (pressed !== undefined) state.pressed = pressed;
    const required = ariaBoolean(element.getAttribute("aria-required"));
    if (required !== undefined) state.required = required;
    else if ("required" in element && Boolean(element.required)) state.required = true;
    const invalid = element.getAttribute("aria-invalid");
    if (invalid && invalid !== "false") state.invalid = invalid === "true" ? true : invalid;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) if (element.readOnly) state.readonly = true;
    const current = element.getAttribute("aria-current");
    if (current && current !== "false") state.current = current === "true" ? true : current;
    const haspopup = element.getAttribute("aria-haspopup");
    if (haspopup && haspopup !== "false") state.haspopup = haspopup === "true" ? true : haspopup;
    const controls = element.getAttribute("aria-controls");
    if (controls) state.controls = normalizeText(controls, context.options.maxTextLength);
    const live = element.getAttribute("aria-live");
    if (live) state.live = normalizeText(live, context.options.maxTextLength);
    if (element.getAttribute("aria-modal") === "true") state.modal = true;
    const orientation = element.getAttribute("aria-orientation");
    if (orientation) state.orientation = normalizeText(orientation, 40);
    const valueMin = ariaNumber(element.getAttribute("aria-valuemin"));
    if (typeof valueMin === "number") state.valueMin = valueMin;
    const valueMax = ariaNumber(element.getAttribute("aria-valuemax"));
    if (typeof valueMax === "number") state.valueMax = valueMax;
    const valueNow = ariaNumber(element.getAttribute("aria-valuenow"));
    if (typeof valueNow === "number") state.valueNow = valueNow;
    const valueText = element.getAttribute("aria-valuetext");
    if (valueText) state.valueText = normalizeText(valueText, context.options.maxTextLength);
    return state;
  }
  function isHidden(element) {
    if (element.hasAttribute("hidden")) return true;
    if (element.getAttribute("aria-hidden") === "true") return true;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.contentVisibility === "hidden") return true;
    if (Number(style.opacity) === 0) return true;
    return false;
  }
  function isLikelyAd(element) { const haystack = [element.id, element.getAttribute("class"), element.getAttribute("aria-label"), element.getAttribute("data-testid"), element.getAttribute("data-test-id"), element.getAttribute("data-name")].filter(Boolean).join(" ").toLowerCase(); if (/\b(ad|ads|advert|advertisement|sponsor|sponsored|placement)\b/.test(haystack)) return true; if (element instanceof HTMLAnchorElement && normalizeText(element.textContent || "", 80).toLowerCase() === "ad") return true; return false; }
  function isDisabled(element) { return element.getAttribute("aria-disabled") === "true" || ("disabled" in element && Boolean(element.disabled)); }
  function isFocusable(element) {
    if (isDisabled(element) || isHidden(element)) return false;
    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null) return Number(tabindex) >= 0;
    return element.matches("a[href],area[href],button,input,select,textarea,summary,iframe,[contenteditable=''],[contenteditable='true']");
  }
  function isInteractive(element, role, focusable) {
    if (role && interactiveRoles.has(role)) return true;
    if (element.matches("a[href],button,input,select,textarea,summary,option")) return true;
    if (element.hasAttribute("onclick")) return true;
    return focusable && Boolean(role);
  }
  function appendSpecialChildren(element, node, context) {
    if (!context.options.includeSelectOptions) return;
    if (element instanceof HTMLSelectElement) {
      for (const option of Array.from(element.options)) node.children.push({ id: nextId(context), tag: "option", role: "option", name: normalizeText(option.textContent || "", context.options.maxTextLength), value: option.value, state: { selected: option.selected, disabled: option.disabled }, interactive: false, focusable: false, selector: getCssPath(option), xpath: getXPath(option), children: [] });
    }
  }
  function isCustomElement(element) { return element.tagName.includes("-"); }
  function appendShadowChildren(element, node, context) {
    const shadowRoot = element.shadowRoot;
    if (!shadowRoot) return;
    for (const child of Array.from(shadowRoot.children)) {
      const semanticChild = walkElement(child, context);
      if (semanticChild) node.children.push(semanticChild);
    }
  }
  function appendFrameChildren(element, node, context) {
    if (!(element instanceof HTMLIFrameElement)) return;
    try {
      const frameDocument = element.contentDocument;
      if (!frameDocument || !frameDocument.body) {
        node.children.push(unavailableNode(context, "iframe", "iframe document unavailable"));
        return;
      }
      const previousDocument = context.rootDocument;
      context.rootDocument = frameDocument;
      const child = walkElement(frameDocument.body, context);
      context.rootDocument = previousDocument;
      if (child) node.children.push(child);
    } catch {
      node.children.push(unavailableNode(context, "iframe", "cross-origin iframe"));
    }
  }
  function unavailableNode(context, tag, reason) { return { id: nextId(context), tag, role: null, name: "", interactive: false, focusable: false, unavailableReason: reason, children: [] }; }
  function containerNode(context, tag, children) { return { id: nextId(context), tag, role: null, name: "", interactive: false, focusable: false, children }; }
  function getValue(element) { if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value; return normalizeText(element.getAttribute("aria-valuetext") || element.getAttribute("aria-valuenow") || "", 80); }
  function getDirectText(element, maxLength) { return normalizeText(Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || "").join(" "), maxLength); }
  function getVisibleText(element, maxLength) { const parts = []; function visit(node) { if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent || ""); return; } if (node.nodeType !== Node.ELEMENT_NODE) return; const childElement = node; if (isHidden(childElement)) return; for (const child of Array.from(childElement.childNodes)) visit(child); } visit(element); return normalizeText(parts.join(" "), maxLength); }
  function getAttributes(element) { const attributes = {}; for (const attribute of Array.from(element.attributes)) if (attribute.name === "id" || attribute.name === "href" || attribute.name === "type" || attribute.name === "role" || attribute.name === "alt" || attribute.name === "title" || attribute.name.startsWith("aria-") || attribute.name.startsWith("data-")) attributes[attribute.name] = attribute.value; return attributes; }
  function getBounds(element) { const rect = element.getBoundingClientRect(); return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) }; }
  function getCssPath(element) { if (element.id) return "#" + cssEscape(element.id); const segments = []; let current = element; while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) { const tag = current.tagName.toLowerCase(); const parent = current.parentElement; if (!parent) { segments.unshift(tag); break; } const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName); const index = siblings.indexOf(current) + 1; segments.unshift(siblings.length > 1 ? tag + ":nth-of-type(" + index + ")" : tag); current = parent; } return segments.join(" > "); }
  function getXPath(element) { const segments = []; let current = element; while (current && current.nodeType === Node.ELEMENT_NODE) { const tag = current.tagName.toLowerCase(); const parent = current.parentElement; if (!parent) { segments.unshift("/" + tag + "[1]"); break; } const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName); segments.unshift("/" + tag + "[" + (sameTag.indexOf(current) + 1) + "]"); current = parent; } return segments.join(""); }
  function textFromIds(ids, rootDocument) { return normalizeText(ids.split(/\s+/).map((id) => { const element = rootDocument.getElementById(id); return element ? getVisibleText(element, 240) : ""; }).filter(Boolean).join(" "), 240); }
  function normalizeText(value, maxLength) { const normalized = value.replace(/\s+/g, " ").trim(); return normalized.length > maxLength ? normalized.slice(0, maxLength - 1) + "…" : normalized; }
  function firstToken(value) { return (value && value.trim().split(/\s+/)[0]) || null; }
  function hasExplicitNameSource(element) { return Boolean(element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title")); }
  function hasEmptyAlt(element) { return element.hasAttribute("alt") && element.getAttribute("alt") === ""; }
  function isButtonLikeInput(input) { return ["button", "image", "reset", "submit"].includes((input.getAttribute("type") || "").toLowerCase()); }
  function inputFallbackName(input) { const type = (input.getAttribute("type") || "").toLowerCase(); if (type === "submit") return "Submit"; if (type === "reset") return "Reset"; return ""; }
  function ariaBoolean(value) { if (value === "true") return true; if (value === "false") return false; return undefined; }
  function ariaBooleanOrMixed(value) { if (value === "mixed") return "mixed"; return ariaBoolean(value); }
  function ariaNumber(value) {
    if (value === null || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  function formatState(state) { if (!state) return ""; const entries = Object.entries(state).filter(([, value]) => value !== undefined); return entries.length > 0 ? " [" + entries.map(([key, value]) => key + "=" + String(value)).join(" ") + "]" : ""; }
  function nextId(context) { const id = "n" + context.nextId; context.nextId += 1; return id; }
  function round(value) { return Math.round(value * 100) / 100; }
  function cssEscape(value) { if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value); return value.replace(/[^a-zA-Z0-9_-]/g, (char) => "\\" + char); }
  return { extractSemanticTree, formatSemanticTreeText, observeSemanticTree };
})();
`;
}
