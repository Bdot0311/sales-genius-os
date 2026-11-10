import { describe, expect, it } from "vitest";
import {
  backgroundDraftCopy,
  formatDraftTurnSummary,
  listLeadsCopy,
  presentSteps,
  researchStepCopy,
  sweepCopy,
} from "../../supabase/functions/_shared/agent-step-present";

describe("agent steps read as a chat, and a miss stays visible", () => {
  it("says a zero research result out loud", () => {
    const copy = researchStepCopy({
      ok: 0,
      total: 12,
      thin: 0,
      reason: "No company website on this lead, so there's nothing to research.",
    });
    expect(copy.status).toBe("error");
    expect(copy.label).toMatch(/Couldn't research/);
    expect(copy.detail).toContain("0 of 12");
    expect(copy.detail).toContain("nothing to research");
  });

  it("keeps a partial research result as a normal step with the thin count", () => {
    const copy = researchStepCopy({ ok: 10, total: 12, thin: 2 });
    expect(copy.status).toBe("ok");
    expect(copy.label).toBe("Researched 10 companies");
    expect(copy.detail).toContain("2 didn't have enough");
  });

  it("folds consecutive duplicates and leaves a different step alone", () => {
    const steps = presentSteps([
      { name: "research_leads", label: "Couldn't research these 12 companies", status: "error", detail: "0 of 12" },
      { name: "research_leads", label: "Couldn't research these 12 companies", status: "error", detail: "0 of 12" },
      { name: "draft_outreach", label: "Writing them in the background", status: "queued", detail: "35 drafts" },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0].count).toBe(2);
    expect(steps[1].status).toBe("queued");
  });

  it("summarises a queued batch in one sentence and still names the folder", () => {
    const line = formatDraftTurnSummary({
      written: 0,
      queued: 63,
      skipped: 0,
      failed: 0,
      folder: 0,
      swept: 28,
      stillWaiting: 0,
    });
    expect(line).toContain("63 drafts are being written — they'll appear in Drafts as they finish.");
    expect(line).toContain("28 of those were added at the end");
    expect(line).toContain("nothing from that set is still waiting");
    expect(line).toContain("Drafts holds 0 right now.");
    expect(line).not.toContain("lead(s)");
    expect(line).not.toContain("📝");
  });

  it("says when the sweep could not finish the set", () => {
    const line = formatDraftTurnSummary({
      written: 2,
      queued: 10,
      skipped: 1,
      failed: 1,
      folder: 4,
      swept: 3,
      stillWaiting: 5,
    });
    expect(line).toContain("Wrote 2 drafts.");
    expect(line).toContain("1 couldn't be written.");
    expect(line).toContain("5 are still waiting");
    expect(sweepCopy({ queued: 28, pool: 63, beyondLimit: 0, cap: 500 }).detail).toContain("Nothing from that set is still waiting");
    expect(sweepCopy({ queued: 28, pool: 63, beyondLimit: 4, cap: 500 }).detail).toContain("4 are still waiting");
  });

  it("keeps lookup and background-draft lines short", () => {
    expect(listLeadsCopy(63, 63)).toEqual({
      label: "Found 63 leads",
      detail: "63 still need a draft.",
    });
    expect(backgroundDraftCopy(35).label).toBe("Writing them in the background");
    expect(backgroundDraftCopy(35).detail).toContain("Drafts");
  });
});
