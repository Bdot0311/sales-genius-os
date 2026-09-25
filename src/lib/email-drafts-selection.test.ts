import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/outreach/EmailDraftsTable.tsx"),
  "utf8",
);

describe("email draft bulk selection", () => {
  it("offers select-all and per-row draft checkboxes", () => {
    expect(source).toContain('aria-label="Select all drafts"');
    expect(source).toContain("onCheckedChange={toggleSelectAll}");
    expect(source).toContain("onCheckedChange={() => toggleSelect(draft.id)}");
  });

  it("deletes the selected draft ids in one request", () => {
    expect(source).toContain("const idsToDelete = draftToDelete ? [draftToDelete] : [...selectedIds]");
    expect(source).toContain(".in('id', idsToDelete)");
    expect(source).toContain("Delete {selectedIds.size} selected");
  });
});