import { describe, expect, it, vi } from "vitest";
import { personalizedOutreach, selectLeadCount } from "../../supabase/functions/_shared/personalized-outreach";
import { outreachLeadPages } from "./outreach-lead-pages";

describe("research-led bulk outreach", () => {
  const leads = Array.from({ length: 19 }, (_, i) => ({ id: `lead-${i}` }));
  for (const count of [5, 10, 15, "all"] as const) {
    it(`generates separately for ${count} selected recipients`, async () => {
      const ids = selectLeadCount(leads, count);
      const invoke = vi.fn(async (input: Record<string, any>) => ({ data: {
        email: `Subject: research ${input.lead.id}\n\nFindings for ${input.lead.id}`,
        quality_status: "clear", evidence_id: `evidence-${input.lead.id}`,
      } }));
      const emails = [];
      for (const id of ids) emails.push(await personalizedOutreach(invoke, { lead: { id }, tone: "professional", goal: "introduction" }));
      expect(invoke).toHaveBeenCalledTimes(count === "all" ? 19 : count);
      expect(new Set(emails.map(e => e.body)).size).toBe(ids.length);
      expect(invoke.mock.calls.map(([input]) => input.lead.id)).toEqual(ids);
    });
  }
  it("does not release copy without recipient research", async () => {
    await expect(personalizedOutreach(async () => ({ data: { quality_status: "clear", email: "Subject: hi\n\nbody" } }), { lead: { id: "one" } })).rejects.toThrow("Research");
  });
  it("does not release rejected or weak copy", async () => {
    for (const data of [{ error: "No approved research" }, { quality_status: "needs_review" }, { quality_status: "clear", quality_weak: true, evidence_id: "e" }]) {
      await expect(personalizedOutreach(async () => ({ data }), { lead: { id: "one" } })).rejects.toThrow();
    }
  });
  it("all leads includes recipients beyond the first 1000", async () => {
    const all = Array.from({ length: 1015 }, (_, i) => ({ id: String(i) }));
    const rows = await outreachLeadPages(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(selectLeadCount(rows, "all")).toHaveLength(1015);
    expect(rows[1014].id).toBe("1014");
  });
});