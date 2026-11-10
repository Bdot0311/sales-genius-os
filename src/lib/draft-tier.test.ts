import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRAFT_TIER_HEADER, draftTierForCaller } from "../../supabase/functions/_shared/draft-tier";

describe("email drafts pick a tier from the caller, not the body", () => {
  it("keeps a signed-in client on Standard even if it sends the agent header", () => {
    expect(draftTierForCaller(false, "pro")).toBe("standard");
    expect(draftTierForCaller(false, null)).toBe("standard");
    expect(draftTierForCaller(false, "PRO")).toBe("standard");
  });

  it("gives Pro only to an internal caller that sets the agent header", () => {
    expect(draftTierForCaller(true, "pro")).toBe("pro");
    expect(draftTierForCaller(true, " Pro ")).toBe("pro");
    expect(draftTierForCaller(true, null)).toBe("standard");
    expect(draftTierForCaller(true, "standard")).toBe("standard");
    expect(DRAFT_TIER_HEADER).toBe("x-outreign-draft-tier");
  });

  it("wires Studio-facing callers to Standard and agent callers to the header", () => {
    const email = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
    const chat = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    const jobs = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");
    const rest = readFileSync("supabase/functions/rest-api/index.ts", "utf8");
    expect(email).toContain('draftTierForCaller(internal, req.headers.get(DRAFT_TIER_HEADER)) === "pro" ? AI_SMART : AI_FAST');
    expect(email).not.toMatch(/requestData\.(tier|modelTier|model)\b/);
    expect(chat).toContain('name === "generate-email"');
    expect(chat).toContain("DRAFT_TIER_HEADER");
    expect(chat).toContain("Bearer ${serviceKey}");
    expect(jobs).toContain("DRAFT_TIER_HEADER");
    expect(rest).not.toContain("DRAFT_TIER_HEADER");
  });
});
