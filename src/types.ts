export type OutputFormat = "json" | "text";

export type ExtractMode = "full" | "compact" | "interactive";

export type SemanticTreeOptions = {
  mode?: ExtractMode;
  includeBounds?: boolean;
  includeAttributes?: boolean;
  includeTextNodes?: boolean;
  includeHidden?: boolean;
  includeSelectOptions?: boolean;
  pruneCustomElementWrappers?: boolean;
  maxTextLength?: number;
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
