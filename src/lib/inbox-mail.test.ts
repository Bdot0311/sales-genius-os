import { describe, expect, it } from "vitest";
import { mailState, matchesMailFolder, readAllMail } from "./inbox-mail";
import { generatedDraftFields } from "../../supabase/functions/_shared/generated-email-draft";

describe("Unified Inbox email coverage", () => {
  for (const source of ["Outreach Studio", "AI agents", "API", "MCP"]) {
    it(`includes ${source} drafts without claiming they were sent`, () => {
      const c = { unread: false, hasReply: false, messages: [{ direction: "out" as const, state: mailState("draft") }] };
      expect(matchesMailFolder("all", c)).toBe(true);
      expect(matchesMailFolder("drafts", c)).toBe(true);
      expect(matchesMailFolder("sent", c)).toBe(false);
      expect(matchesMailFolder("awaiting", c)).toBe(false);
    });
  }
  it("keeps scheduled and failed mail out of Sent and Awaiting Reply", () => {
    for (const status of ["scheduled", "queued", "pending", "failed", "bounced"]) {
      const c = { unread: false, hasReply: false, messages: [{ direction: "out" as const, state: mailState(status) }] };
      expect(matchesMailFolder("sent", c)).toBe(false);
      expect(matchesMailFolder("awaiting", c)).toBe(false);
      expect(matchesMailFolder(status === "failed" || status === "bounced" ? "failed" : "scheduled", c)).toBe(true);
    }
  });
  it("shows completed sends as awaiting reply", () => {
    expect(matchesMailFolder("awaiting", { unread: false, hasReply: false, messages: [{ direction: "out", state: mailState("sent", "2026-11-06T00:00:00Z") }] })).toBe(true);
  });
  it("does not mistake a queued send time for completed delivery", () => {
    expect(mailState("queued", "2026-11-07T00:00:00Z")).toBe("queued");
    expect(mailState("scheduled", "2026-11-07T00:00:00Z")).toBe("scheduled");
    expect(mailState("failed", "2026-11-06T00:00:00Z")).toBe("failed");
  });
  it("reads beyond the old 300-row cutoff", async () => {
    const all = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const result = await readAllMail(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(result).toHaveLength(1201);
    expect(result[1200].id).toBe(1200);
  });
  it("persists generated copy with the verified owner and no sent state", () => {
    expect(generatedDraftFields({ userId: "owner", leadId: "lead", email: "Subject: Hello\n\nHi Alex,\nA real draft.", subject: "fallback", tone: "friendly" })).toEqual({ user_id: "owner", lead_id: "lead", subject: "Hello", body: "Hi Alex,\nA real draft.", tone: "friendly" });
  });
});