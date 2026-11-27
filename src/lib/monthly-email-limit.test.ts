import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MONTHLY_EMAIL_LIMITS, monthlyEmailLimit } from "../../supabase/functions/_shared/plan-limits.ts";

const code = (path: string) =>
  readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const SEND = code("supabase/functions/send-email/index.ts");
const SCHEDULED = code("supabase/functions/process-scheduled-emails/index.ts");

/**
 * The monthly send allowance was declared twice, identically, in the two
 * functions that enforce it. They agreed, and nothing kept them agreeing.
 *
 * This file already exists because PLAN_SEARCH_LIMITS drifted the same way --
 * the free tier was enforced at 100 while the UI showed 10. Two SEND paths
 * disagreeing would be worse: an allowance that depends on which door the
 * email went through, refused when scheduled and allowed when sent now.
 */
describe("one monthly email allowance, read by both send paths", () => {
  it("is declared once", () => {
    expect(SEND).not.toContain("const MONTHLY_EMAIL_LIMITS");
    expect(SCHEDULED).not.toContain("const MONTHLY_EMAIL_LIMITS");
  });

  it("is imported by both", () => {
    for (const [name, src] of [["send-email", SEND], ["process-scheduled-emails", SCHEDULED]] as const) {
      expect(src, name).toContain('import { MONTHLY_EMAIL_LIMITS } from "../_shared/plan-limits.ts"');
      expect(src, name).toContain("MONTHLY_EMAIL_LIMITS[");
    }
  });

  it("gives the free tier what the pricing page advertises", () => {
    /*
     * The pricing table's "Monthly email sends" row says 100 for free. A user
     * wrote in saying his free email allowance was depleted, so the number
     * being the one he was sold matters.
     */
    expect(MONTHLY_EMAIL_LIMITS.free).toBe(100);
    const pricing = readFileSync("src/components/Pricing.tsx", "utf8");
    expect(pricing).toContain('{ name: "Monthly email sends", free: "100"');
  });

  it("treats an unknown or missing plan as free, never as unlimited", () => {
    // A lapsed card is a reason to send less, not a reason to skip the cap.
    expect(monthlyEmailLimit(null)).toBe(100);
    expect(monthlyEmailLimit(undefined)).toBe(100);
    expect(monthlyEmailLimit("")).toBe(100);
    expect(monthlyEmailLimit("nonsense")).toBe(100);
  });

  it("keeps unlimited meaning unlimited", () => {
    expect(MONTHLY_EMAIL_LIMITS.agency).toBe(-1);
    expect(monthlyEmailLimit("agency")).toBe(-1);
  });

  it("still maps the legacy elite id to a pro-sized allowance", () => {
    expect(monthlyEmailLimit("elite")).toBe(MONTHLY_EMAIL_LIMITS.pro);
  });
});
