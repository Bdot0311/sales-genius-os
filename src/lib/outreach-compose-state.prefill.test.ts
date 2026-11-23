import { describe, it, expect } from "vitest";
import { adoptUnassignedDraft } from "./outreach-compose-state";
describe("adoptUnassignedDraft", () => {
  it("moves pre-filled subject/body to the first chosen lead", () => {
    const out = adoptUnassignedDraft({ "": { subject: "S", body: "B", trigger: "", draftId: null } }, "L1");
    expect(out.L1.subject).toBe("S"); expect(out.L1.body).toBe("B"); expect(out[""]).toBeUndefined();
  });
  it("never overwrites a lead's own copy", () => {
    const out = adoptUnassignedDraft({ "": { subject: "S", body: "B", trigger: "", draftId: null }, L1: { subject: "Mine", body: "", trigger: "", draftId: null } }, "L1");
    expect(out.L1.subject).toBe("Mine");
  });
});
