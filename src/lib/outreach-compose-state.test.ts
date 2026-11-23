import { describe, expect, it } from "vitest";
import { emptyComposeDraft, mergeSavedComposeDrafts, updateComposeDraft } from "./outreach-compose-state";

describe("recipient-specific Studio copy", () => {
  it("replaces only the regenerated recipient while retaining the selection's other edits", () => {
    const drafts = {
      a: { subject: "A subject", trigger: "A research", body: "Old A", draftId: "draft-a", edited: true },
      b: { subject: "Edited B", trigger: "B research", body: "Keep B", draftId: "draft-b", edited: true },
    };
    const result = updateComposeDraft(drafts, "a", { body: "Regenerated A", subject: "New A subject" });
    expect(result.a).toEqual({ subject: "New A subject", trigger: "A research", body: "Regenerated A", draftId: "draft-a", edited: true });
    expect(result.b).toEqual(drafts.b);
    expect(drafts.a.body).toBe("Old A");
  });
  it("keeps two recipients' subjects, triggers and email bodies separate", () => {
    const first = updateComposeDraft({}, "lead-a", { subject: "Alpha", trigger: "Alpha context", body: "Email for Alpha" });
    const second = updateComposeDraft(first, "lead-b", { subject: "Beta", trigger: "Beta context", body: "Email for Beta" });
    expect(second["lead-a"]).toMatchObject({ subject: "Alpha", trigger: "Alpha context", body: "Email for Alpha" });
    expect(second["lead-b"]).toMatchObject({ subject: "Beta", trigger: "Beta context", body: "Email for Beta" });
    expect(second["lead-c"] ?? emptyComposeDraft).toEqual({ subject: "", trigger: "", body: "", draftId: null });
  });
  it("reads each background draft into the matching recipient and keeps the newest", () => {
    const result = mergeSavedComposeDrafts({}, [
      { id: "new-a", lead_id: "a", subject: "New A", body: "A body", trigger_context: "A context" },
      { id: "b-draft", lead_id: "b", subject: "B", body: "B body", trigger_context: "B context" },
      { id: "old-a", lead_id: "a", subject: "Old A", body: "Old body", trigger_context: null },
    ]);
    expect(result.a).toEqual({ draftId: "new-a", subject: "New A", body: "A body", trigger: "A context" });
    expect(result.b).toEqual({ draftId: "b-draft", subject: "B", body: "B body", trigger: "B context" });
  });
  it("never overwrites local edits when queued drafts refresh", () => {
    const local = updateComposeDraft({}, "a", { subject: "My edit", body: "My body", draftId: "draft-a" });
    const result = mergeSavedComposeDrafts(local, [{ id: "draft-a", lead_id: "a", subject: "Remote", body: "Remote body", trigger_context: "Remote context" }]);
    expect(result.a).toEqual(local.a);
    expect(result.a.subject).toBe("My edit");
  });
});