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


/**
 * The third copy, which TypeScript cannot import.
 *
 * The UI's counter does not read the TS table at all -- it calls the database
 * function get_monthly_email_usage, which gets its ceiling from
 * get_monthly_email_limit. So the allowance is declared in SQL as well, and
 * that is the number a user is SHOWN while the TS table is the number that
 * STOPS them.
 *
 * This is how PLAN_SEARCH_LIMITS drifted: the free tier was enforced at 100
 * while the UI showed 10. Nothing can make SQL import TypeScript, so the only
 * guard available is to read the migration and compare.
 */
describe("the SQL the counter reads agrees with the TypeScript that enforces", () => {
  const MIGRATION = "supabase/migrations/20260720194710_30631809-98d5-4813-bce5-b3091370adfa.sql";
  const sql = readFileSync(MIGRATION, "utf8");
  const fn = sql.slice(sql.indexOf("FUNCTION public.get_monthly_email_limit"));
  const body = fn.slice(0, fn.indexOf("$function$", fn.indexOf("$function$") + 1) + 1) || fn.slice(0, 1200);

  /** What the CASE arm for a plan returns, as the migration writes it. */
  const sqlLimitFor = (plan: string): number => {
    const arm = new RegExp(`WHEN _plan (?:=|IN \\()\\s*'[^']*?\\b${plan}\\b[^)]*?\\)?\\s*THEN\\s*(-?\\d+)`, "i");
    const match = body.match(arm);
    expect(match, `no CASE arm for ${plan} in ${MIGRATION}`).toBeTruthy();
    return Number(match![1]);
  };

  it("found the function it is comparing against", () => {
    // A rename or a move would otherwise make every assertion below vacuous.
    expect(body).toContain("get_monthly_email_limit");
    expect(body).toContain("WHEN _plan = 'free' THEN");
  });

  for (const plan of ["free", "starter", "growth", "agency"]) {
    it(`agrees on ${plan}`, () => {
      expect(sqlLimitFor(plan)).toBe(MONTHLY_EMAIL_LIMITS[plan]);
    });
  }

  it("agrees that pro and the legacy elite share an allowance", () => {
    // The SQL writes them as one arm: WHEN _plan IN ('pro','elite').
    expect(sqlLimitFor("pro")).toBe(MONTHLY_EMAIL_LIMITS.pro);
    expect(MONTHLY_EMAIL_LIMITS.elite).toBe(MONTHLY_EMAIL_LIMITS.pro);
  });

  it("falls back to the free allowance on both sides for an unknown plan", () => {
    expect(body).toMatch(/ELSE\s+100/i);
    expect(monthlyEmailLimit("nonsense")).toBe(100);
  });
});
