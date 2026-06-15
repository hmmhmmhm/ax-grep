import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("browser fixture ledger tracking", () => {
  it("links every browser parity check to a documented gap record", async () => {
    const source = await readFile(join(process.cwd(), "scripts/compare-browser-fixture.ts"), "utf8");
    const progress = await readFile(join(process.cwd(), "docs/progress.md"), "utf8");
    const checkMatches = Array.from(source.matchAll(/^\s+\{\n\s+id: "([^"]+)",\n\s+ledgerId: "(G\d+)",/gm));
    const checkIds = checkMatches.map((match) => match[1]!);

    expect(checkIds).toEqual([
      "heading-link-button-field-image-parity",
      "table-header-cell-context",
      "form-relation-state-context",
      "list-keyboard-target-context",
      "expanded-popup-controls-parity",
      "current-link-modal-live-state-parity",
      "combobox-state-relation-parity",
      "selected-current-option-parity",
      "selected-tab-panel-parity",
      "selected-gridcell-parity",
      "range-value-state-parity",
      "busy-status-state-parity",
      "invalid-field-state-parity",
      "sorted-header-state-parity",
      "multiselect-listbox-state-parity",
      "drag-drop-state-parity",
      "disabled-readonly-field-state-parity",
      "mixed-checkbox-state-parity",
      "field-details-relation-parity",
    ]);

    for (const [, checkId, ledgerId] of checkMatches) {
      expect(checkId).toMatch(/-parity$|-context$/);
      expect(progress).toContain(`| ${ledgerId} |`);
    }
  });
});
