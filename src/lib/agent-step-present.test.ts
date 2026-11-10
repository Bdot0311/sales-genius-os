import { describe, expect, it } from "vitest";
import {
  backgroundDraftCopy,
  confirmedClose,
  formatDraftTurnSummary,
  listLeadsCopy,
  presentSteps,
  researchStepCopy,
  sweepCopy,
  withConfirmedClose,
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

  it("does not say every lead was researched or that drafts were saved", () => {
    const line = confirmedClose({
      pool: 63,
      researchedOk: 12,
      researchedFailed: 0,
      researchQueued: 51,
      researchFailed: 4,
      scoreFailed: 2,
      queued: 15,
      written: 0,
      folder: 0,
      draftFailed: 15,
      draftPending: 0,
      jobError: "Research ran and did not produce an approved sentence.",
    });
    expect(line).toContain("Researched 12 of 63.");
    expect(line).toContain("Queued 51 leads for research.");
    expect(line).toContain("4 queued research jobs failed.");
    expect(line).toContain("2 queued score jobs failed.");
    expect(line).toContain("Queued 15 drafts.");
    expect(line).toContain("Drafts holds 0.");
    expect(line).toContain("15 queued drafts failed");
    expect(line).toContain("approved sentence");
    expect(line).not.toMatch(/all 63/i);
    expect(line).not.toContain("being written");
  });

  it("keeps research findings and replaces only the completion claim", () => {
    const close = confirmedClose({
      pool: 63,
      researchedOk: 12,
      researchedFailed: 0,
      researchQueued: 0,
      researchFailed: 0,
      scoreFailed: 0,
      queued: 15,
      written: 0,
      folder: 0,
      draftFailed: 0,
      draftPending: 15,
    });
    const reply = withConfirmedClose(
      "Acme sells freight software to brokers. They have been researched by their own buyers for years.\n\nAll 63 leads have been researched and all drafts are queued — the background worker is writing them now.",
      close,
    );
    expect(reply).toContain("Acme sells freight software to brokers.");
    expect(reply).toContain("researched by their own buyers");
    expect(reply).toContain("Researched 12 of 63.");
    expect(reply).not.toMatch(/all 63 leads have been researched/i);
    expect(reply).not.toMatch(/background worker is writing/i);
  });

  it("says the queue has not confirmed drafts that are still pending", () => {
    const line = confirmedClose({
      pool: 63,
      researchedOk: 12,
      researchedFailed: 0,
      researchQueued: 0,
      researchFailed: 0,
      scoreFailed: 0,
      queued: 15,
      written: 0,
      folder: 0,
      draftFailed: 0,
      draftPending: 15,
    });
    expect(line).toContain("None are saved yet. The queue has not confirmed them.");
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
