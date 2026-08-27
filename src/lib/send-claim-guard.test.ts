import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync(
  new URL("../../supabase/functions/agent-chat/index.ts", import.meta.url),
  "utf8",
);

/**
 * Reproduces didMutate as shipped, so the batch-shape bug is testable without
 * booting Deno. The logic below is asserted against the source separately.
 */
const asCount = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;

function didMutate(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  const r = result as Record<string, unknown>;
  if ("error" in r) return false;
  const summary = (r.summary && typeof r.summary === "object" ? r.summary : r) as Record<string, unknown>;
  if (summary.needs_rewrite === true) return false;
  const queued = asCount(summary.queued_for_approval) ?? asCount(r.queued_for_approval);
  const sent = asCount(summary.sent) ?? asCount(r.sent);
  if (sent !== null) return sent > 0;
  if (queued !== null && queued > 0) return false;
  return true;
}

describe("a queued batch is not a completed send", () => {
  it("does not record send_drafts as done when everything was parked", () => {
    // The real shape. deliver() reports per-email booleans; send_drafts reports
    // COUNTS, so `queued_for_approval === true` and `sent === false` both
    // missed, and two emails waiting on a human were marked sent.
    const batch = {
      from: "brandon@bdotindustries.com",
      rotated_across: 1,
      sent: 0,
      queued_for_approval: 2,
      results: [{ queued_for_approval: true }, { queued_for_approval: true }],
      note: "Nothing was sent yet — 2 email(s) are paused waiting on the user.",
    };
    expect(didMutate(batch)).toBe(false);
  });

  it("still catches the single-email shape it always caught", () => {
    expect(didMutate({ summary: { queued_for_approval: true }, sent: false })).toBe(false);
  });

  it("records a genuine batch send as done", () => {
    expect(didMutate({ sent: 2, queued_for_approval: 0, results: [] })).toBe(true);
  });

  it("records a partial send as done", () => {
    expect(didMutate({ sent: 1, queued_for_approval: 1 })).toBe(true);
  });

  it("still refuses anything carrying an error", () => {
    expect(didMutate({ error: "no mailbox" })).toBe(false);
  });

  it("still refuses a draft sent back for rewrite", () => {
    expect(didMutate({ summary: { needs_rewrite: true } })).toBe(false);
  });

  it("leaves results with no send counts alone", () => {
    // research_leads and friends report no send fields at all.
    expect(didMutate({ researched: 3 })).toBe(true);
  });
});

describe("the shipped didMutate matches the logic under test", () => {
  it("handles both booleans and counts", () => {
    expect(SRC).toContain("const asCount = (v: unknown): number | null =>");
    expect(SRC).toContain("if (sent !== null) return sent > 0;");
    expect(SRC).toContain("if (queued !== null && queued > 0) return false;");
  });
});

describe("an unbacked claim of sending is corrected", () => {
  it("checks the claim against the turn's own tool events", () => {
    expect(SRC).toContain("CLAIMS_SEND");
    expect(SRC).toContain("anythingActuallySent");
  });

  it("counts only the tools that can actually send", () => {
    for (const tool of ["send_drafts", "send_outreach", "resolve_approvals", "schedule_drafts"]) {
      expect(SRC).toContain(`"${tool}"`);
    }
  });

  it("does not treat an approval-queued event as a send", () => {
    expect(SRC).toContain('e.label !== "Waiting for your approval"');
  });

  it("tells the user how many are stuck in the queue", () => {
    // 37 had piled up while the agent reported them as sent.
    expect(SRC).toContain("sitting in the approval queue");
    expect(SRC).toContain('.eq("status", "pending")');
  });

  it("appends rather than rewriting what the model said", () => {
    expect(SRC).toContain("finalText +=\n        `\\n\\nCorrection:");
  });
});

describe("the send-claim pattern", () => {
  const CLAIMS_SEND =
    /\b(?:i(?:'ve| have)?\s+(?:just\s+)?sent|sent it|sent them|sent the (?:email|second|first|follow[- ]?up)|email (?:has been|was) sent|emails? (?:have|has) been sent)\b/i;

  it("catches the phrasings that were actually used", () => {
    for (const claim of [
      "Sent it.",
      "I've sent the second one.",
      "I have just sent the follow-up.",
      "The email was sent.",
      "Both emails have been sent.",
      "sent them both",
    ]) {
      expect(CLAIMS_SEND.test(claim), claim).toBe(true);
    }
  });

  it("does not fire on an honest description of queuing", () => {
    for (const honest of [
      "Nothing was sent yet — 2 emails are waiting on your confirmation.",
      "Ready to send when you confirm.",
      "I drafted it but have not sent anything.",
      "This will be sent once you approve.",
    ]) {
      expect(CLAIMS_SEND.test(honest), honest).toBe(false);
    }
  });
});
