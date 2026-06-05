import type {
  SemanticNode,
  SemanticNodeState,
  SemanticTreeChange,
  SemanticTreeObserverOptions,
  SemanticTreeOptions,
} from "./types";

type WalkContext = {
  options: Required<SemanticTreeOptions>;
  nextId: number;
  rootDocument: Document;
};

const defaultOptions: Required<SemanticTreeOptions> = {
  mode: "compact",
  includeBounds: true,
  includeAttributes: true,
  includeTextNodes: true,
  includeHidden: false,
  includeSelectOptions: true,
  excludeLikelyAds: false,
  pruneCustomElementWrappers: true,
  maxTextLength: 240,
};

const defaultObserverOptions: Required<Pick<SemanticTreeObserverOptions, "debounceMs">> = {
  debounceMs: 50,
};

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
  form: "form",
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

export function extractSemanticTree(options: SemanticTreeOptions = {}): SemanticNode {
  const rootDocument = document;
  const context: WalkContext = {
    options: { ...defaultOptions, ...options },
    nextId: 1,
    rootDocument,
  };

  return (
    walkElement(rootDocument.body ?? rootDocument.documentElement, context) ??
    unavailableNode(context, "document", "Document has no inspectable body")
  );
}

export function formatSemanticTreeText(node: SemanticNode): string {
  const lines: string[] = [];

  function visit(current: SemanticNode, depth: number): void {
    const prefix = "  ".repeat(depth);
    const role = current.role ?? current.tag;
    const marker = current.interactive ? "[i] " : "";
    const name = current.name ? ` '${current.name}'` : "";
    const state = formatState(current.state);
    const unavailable = current.unavailableReason ? ` (${current.unavailableReason})` : "";
    lines.push(`${prefix}${marker}${role}${name}${state}${unavailable}`);
    for (const child of current.children) visit(child, depth + 1);
  }

  visit(node, 0);
  return lines.join("\n");
}

export function observeSemanticTree(
  onChange: (change: SemanticTreeChange) => void,
  options: SemanticTreeObserverOptions = {},
): { disconnect: () => void; snapshot: () => SemanticNode } {
  const root = document.documentElement;
  const observerOptions = { ...defaultObserverOptions, ...options };
  let mutationCount = 0;
  let timeoutId: number | undefined;

  function snapshot(): SemanticNode {
    return extractSemanticTree(options);
  }

  function emit(): void {
    timeoutId = undefined;
    onChange({
      tree: snapshot(),
      changedAt: Date.now(),
      mutationCount,
    });
    mutationCount = 0;
  }

  const observer = new MutationObserver((mutations) => {
    mutationCount += mutations.length;
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(emit, observerOptions.debounceMs);
  });

  observer.observe(root, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });

  return {
    disconnect() {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      observer.disconnect();
    },
    snapshot,
  };
}

function walkElement(element: Element, context: WalkContext): SemanticNode | null {
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

  if (context.options.mode === "interactive" && !interactive) {
    return children.length > 0
      ? containerNode(context, tag, children)
      : null;
  }

  if (shouldPrune(element, role, name, interactive, children, context)) {
    return children.length === 1 ? children[0] ?? null : containerNode(context, tag, children);
  }

  const node: SemanticNode = {
    id: nextId(context),
    tag,
    role,
    name,
    interactive,
    focusable,
    children,
  };

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

function collectChildren(element: Element, context: WalkContext): SemanticNode[] {
  const children: SemanticNode[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (!context.options.includeSelectOptions && element instanceof HTMLSelectElement) continue;
      const semanticChild = walkElement(child as Element, context);
      if (semanticChild) children.push(semanticChild);
      continue;
    }

    if (context.options.includeTextNodes && child.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(child.textContent ?? "", context.options.maxTextLength);
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
  return children;
}

function shouldPrune(
  element: Element,
  role: string | null,
  name: string,
  interactive: boolean,
  children: SemanticNode[],
  context: WalkContext,
): boolean {
  if (context.options.mode === "full") return false;
  if (role === "none" || role === "presentation") return true;
  if (interactive) return false;
  if (context.options.pruneCustomElementWrappers && isCustomElement(element)) return children.length > 0;
  if (role && role !== "generic") return false;
  if (name) return false;
  if (element.id || element.getAttribute("aria-label") || element.getAttribute("aria-labelledby")) return false;
  return children.length > 0;
}

function getRole(element: Element): string | null {
  const explicit = firstToken(element.getAttribute("role"));
  if (explicit) return explicit;

  const tag = element.tagName.toLowerCase();
  if (tag === "section" && !hasExplicitNameSource(element)) return null;
  if (tag === "form" && !hasExplicitNameSource(element)) return null;
  if (tag in landmarkTags) return landmarkTags[tag] ?? null;
  if (/^h[1-6]$/.test(tag)) return "heading";

  if (tag === "a" || tag === "area") return element.hasAttribute("href") ? "link" : null;
  if (tag === "button") return "button";
  if (tag === "details") return "group";
  if (tag === "dialog") return "dialog";
  if (tag === "fieldset") return "group";
  if (tag === "figure") return "figure";
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

  if (tag === "input") return inputRole(element as HTMLInputElement);
  return null;
}

function inputRole(input: HTMLInputElement): string | null {
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

function computeName(element: Element, role: string, context: WalkContext): string {
  if (element.getAttribute("aria-labelledby")) {
    const labelled = textFromIds(element.getAttribute("aria-labelledby") ?? "", context.rootDocument);
    if (labelled) return labelled;
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return normalizeText(ariaLabel, context.options.maxTextLength);

  if (element instanceof HTMLInputElement && isButtonLikeInput(element)) {
    return normalizeText(element.value || element.getAttribute("value") || inputFallbackName(element), context.options.maxTextLength);
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const label = labelText(element, context);
    if (label) return label;
    const placeholder = element.getAttribute("placeholder");
    if (placeholder) return normalizeText(placeholder, context.options.maxTextLength);
  }

  if (element instanceof HTMLImageElement) {
    return normalizeText(element.alt || element.getAttribute("title") || "", context.options.maxTextLength);
  }

  if (element instanceof HTMLFieldSetElement) {
    const legend = element.querySelector(":scope > legend");
    if (legend) return getVisibleText(legend, context.options.maxTextLength);
  }

  if (rolesNamedFromContents.has(role)) {
    const ownText = getVisibleText(element, context.options.maxTextLength);
    if (ownText) return ownText;
  }

  return normalizeText(element.getAttribute("title") ?? "", context.options.maxTextLength);
}

function computeDescription(element: Element, context: WalkContext): string {
  const describedBy = element.getAttribute("aria-describedby");
  if (describedBy) return textFromIds(describedBy, context.rootDocument);
  return normalizeText(element.getAttribute("title") ?? "", context.options.maxTextLength);
}

function labelText(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  context: WalkContext,
): string {
  if (element.labels && element.labels.length > 0) {
    return normalizeText(Array.from(element.labels).map((label) => getVisibleText(label, context.options.maxTextLength)).join(" "), context.options.maxTextLength);
  }
  return "";
}

function getState(element: Element): SemanticNodeState {
  const state: SemanticNodeState = {};
  if (isHidden(element)) state.hidden = true;
  if (isDisabled(element)) state.disabled = true;
  if (element === document.activeElement) state.focused = true;

  const checked = ariaBooleanOrMixed(element.getAttribute("aria-checked"));
  if (checked !== undefined) state.checked = checked;
  else if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    state.checked = element.checked;
  }

  const selected = ariaBoolean(element.getAttribute("aria-selected"));
  if (selected !== undefined) state.selected = selected;
  else if (element instanceof HTMLOptionElement) state.selected = element.selected;

  const expanded = ariaBoolean(element.getAttribute("aria-expanded"));
  if (expanded !== undefined) state.expanded = expanded;

  const pressed = ariaBooleanOrMixed(element.getAttribute("aria-pressed"));
  if (pressed !== undefined) state.pressed = pressed;

  const required = ariaBoolean(element.getAttribute("aria-required"));
  if (required !== undefined) state.required = required;
  else if ("required" in element && Boolean((element as HTMLInputElement).required)) state.required = true;

  const invalid = element.getAttribute("aria-invalid");
  if (invalid && invalid !== "false") state.invalid = invalid === "true" ? true : invalid;

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.readOnly) state.readonly = true;
  }

  return state;
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute("hidden")) return true;
  if (element.getAttribute("aria-hidden") === "true") return true;

  const style = getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.contentVisibility === "hidden"
  ) return true;
  if (Number(style.opacity) === 0) return true;
  return false;
}

function isLikelyAd(element: Element): boolean {
  const haystack = [
    element.id,
    element.getAttribute("class"),
    element.getAttribute("aria-label"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-test-id"),
    element.getAttribute("data-name"),
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(ad|ads|advert|advertisement|sponsor|sponsored|placement)\b/.test(haystack)) return true;
  if (element instanceof HTMLAnchorElement && normalizeText(element.textContent ?? "", 80).toLowerCase() === "ad") return true;
  return false;
}

function isDisabled(element: Element): boolean {
  if (element.getAttribute("aria-disabled") === "true") return true;
  return "disabled" in element && Boolean((element as HTMLButtonElement).disabled);
}

function isFocusable(element: Element): boolean {
  if (isDisabled(element) || isHidden(element)) return false;
  const tabindex = element.getAttribute("tabindex");
  if (tabindex !== null) return Number(tabindex) >= 0;
  return element.matches("a[href],area[href],button,input,select,textarea,summary,iframe,[contenteditable=''],[contenteditable='true']");
}

function isInteractive(element: Element, role: string | null, focusable: boolean): boolean {
  if (role && interactiveRoles.has(role)) return true;
  if (element.matches("a[href],button,input,select,textarea,summary,option")) return true;
  if (element.hasAttribute("onclick")) return true;
  return focusable && Boolean(role);
}

function appendSpecialChildren(element: Element, node: SemanticNode, context: WalkContext): void {
  if (!context.options.includeSelectOptions) return;
  if (element instanceof HTMLSelectElement) {
    for (const option of Array.from(element.options)) {
      node.children.push({
        id: nextId(context),
        tag: "option",
        role: "option",
        name: normalizeText(option.textContent ?? "", context.options.maxTextLength),
        value: option.value,
        state: { selected: option.selected, disabled: option.disabled },
        interactive: false,
        focusable: false,
        selector: getCssPath(option),
        xpath: getXPath(option),
        children: [],
      });
    }
  }
}

function isCustomElement(element: Element): boolean {
  return element.tagName.includes("-");
}

function appendShadowChildren(element: Element, node: SemanticNode, context: WalkContext): void {
  const shadowRoot = element.shadowRoot;
  if (!shadowRoot) return;
  for (const child of Array.from(shadowRoot.children)) {
    const semanticChild = walkElement(child, context);
    if (semanticChild) node.children.push(semanticChild);
  }
}

function appendFrameChildren(element: Element, node: SemanticNode, context: WalkContext): void {
  if (!(element instanceof HTMLIFrameElement)) return;
  try {
    const frameDocument = element.contentDocument;
    if (!frameDocument?.body) {
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

function unavailableNode(context: WalkContext, tag: string, reason: string): SemanticNode {
  return {
    id: nextId(context),
    tag,
    role: null,
    name: "",
    interactive: false,
    focusable: false,
    unavailableReason: reason,
    children: [],
  };
}

function containerNode(context: WalkContext, tag: string, children: SemanticNode[]): SemanticNode {
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

function getValue(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value;
  }
  return normalizeText(element.getAttribute("aria-valuetext") ?? element.getAttribute("aria-valuenow") ?? "", 80);
}

function getDirectText(element: Element, maxLength: number): string {
  return normalizeText(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" "),
    maxLength,
  );
}

function getVisibleText(element: Element, maxLength: number): string {
  const parts: string[] = [];

  function visit(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const childElement = node as Element;
    if (isHidden(childElement)) return;
    for (const child of Array.from(childElement.childNodes)) visit(child);
  }

  visit(element);
  return normalizeText(parts.join(" "), maxLength);
}

function getAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (
      attribute.name === "id" ||
      attribute.name === "href" ||
      attribute.name === "type" ||
      attribute.name === "role" ||
      attribute.name === "alt" ||
      attribute.name === "title" ||
      attribute.name.startsWith("aria-") ||
      attribute.name.startsWith("data-")
    ) {
      attributes[attribute.name] = attribute.value;
    }
  }
  return attributes;
}

function getBounds(element: Element) {
  const rect = element.getBoundingClientRect();
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function getCssPath(element: Element): string {
  if (element.id) return `#${cssEscape(element.id)}`;
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    const elementAtLevel: Element = current;
    const tag = elementAtLevel.tagName.toLowerCase();
    const parent: Element | null = elementAtLevel.parentElement;
    if (!parent) {
      segments.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter((child) => child.tagName === elementAtLevel.tagName);
    const index = siblings.indexOf(elementAtLevel) + 1;
    segments.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }
  return segments.join(" > ");
}

function getXPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const elementAtLevel: Element = current;
    const tag = elementAtLevel.tagName.toLowerCase();
    const parent: Element | null = elementAtLevel.parentElement;
    if (!parent) {
      segments.unshift(`/${tag}[1]`);
      break;
    }
    const sameTag = Array.from(parent.children).filter((child) => child.tagName === elementAtLevel.tagName);
    segments.unshift(`/${tag}[${sameTag.indexOf(elementAtLevel) + 1}]`);
    current = parent;
  }
  return segments.join("");
}

function textFromIds(ids: string, rootDocument: Document): string {
  return normalizeText(
    ids
      .split(/\s+/)
      .map((id) => {
        const element = rootDocument.getElementById(id);
        return element ? getVisibleText(element, 240) : "";
      })
      .filter(Boolean)
      .join(" "),
    240,
  );
}

function normalizeText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function firstToken(value: string | null): string | null {
  return value?.trim().split(/\s+/)[0] || null;
}

function hasExplicitNameSource(element: Element): boolean {
  return Boolean(
    element.getAttribute("aria-label") ||
    element.getAttribute("aria-labelledby") ||
    element.getAttribute("title"),
  );
}

function hasEmptyAlt(element: Element): boolean {
  return element.hasAttribute("alt") && element.getAttribute("alt") === "";
}

function isButtonLikeInput(input: HTMLInputElement): boolean {
  return ["button", "image", "reset", "submit"].includes((input.getAttribute("type") || "").toLowerCase());
}

function inputFallbackName(input: HTMLInputElement): string {
  const type = (input.getAttribute("type") || "").toLowerCase();
  if (type === "submit") return "Submit";
  if (type === "reset") return "Reset";
  return "";
}

function ariaBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function ariaBooleanOrMixed(value: string | null): boolean | "mixed" | undefined {
  if (value === "mixed") return "mixed";
  return ariaBoolean(value);
}

function formatState(state: SemanticNodeState | undefined): string {
  if (!state) return "";
  const entries = Object.entries(state).filter(([, value]) => value !== undefined);
  return entries.length > 0
    ? ` [${entries.map(([key, value]) => `${key}=${String(value)}`).join(" ")}]`
    : "";
}

function nextId(context: WalkContext): string {
  const id = `n${context.nextId}`;
  context.nextId += 1;
  return id;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}
