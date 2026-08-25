import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CHECK_SUB = readFileSync("supabase/functions/check-subscription/index.ts", "utf8");
const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
const MIGRATION = readFileSync(
  "supabase/migrations/20260825200000_apply_plan_daily_email_limits.sql",
  "utf8",
);

/**
 * An Agency account paying $249/mo was capped at 10 emails a day — the free
 * tier's number. PLAN_PRODUCTS has carried the correct per-plan daily limit
 * since it was written and nothing ever read it, so the column kept its schema
 * default for every account on every plan.
 */
describe("the plan's daily limit reaches the subscription", () => {
  it("still declares a daily limit for every plan product", () => {
    for (const n of ["dailyLimit: 100", "dailyLimit: 250", "dailyLimit: 500", "dailyLimit: 1500"]) {
      expect(CHECK_SUB, n).toContain(n);
    }
  });

  it("reads it off the matched product instead of ignoring it", () => {
    expect(CHECK_SUB).toContain("dailyEmailLimit = planInfo.dailyLimit");
  });

  it("writes it on the subscription upsert", () => {
    expect(CHECK_SUB).toContain("daily_email_limit: dailyEmailLimit");
  });

  it("defaults to the free-tier figure rather than to 10", () => {
    expect(CHECK_SUB).toContain("let dailyEmailLimit = 100;");
  });

  it("matches the published pricing table", () => {
    // Explore 100 · Starter 100 · Growth 250 · Pro 500 · Agency 1,500
    expect(CHECK_SUB).toMatch(/plan: 'starter'[^}]*dailyLimit: 100/);
    expect(CHECK_SUB).toMatch(/plan: 'growth'[^}]*dailyLimit: 250/);
    expect(CHECK_SUB).toMatch(/plan: 'pro'[^}]*dailyLimit: 500/);
    expect(CHECK_SUB).toMatch(/plan: 'agency'[^}]*dailyLimit: 1500/);
  });
});

describe("send-email still enforces whatever the row holds", () => {
  it("reads the column rather than hardcoding a plan", () => {
    expect(SEND).toContain("subscription.daily_email_limit || 10");
  });
});

describe("the one-time correction is narrow", () => {
  it("only touches rows still holding the schema default", () => {
    expect(MIGRATION).toContain("WHERE daily_email_limit = 10");
  });

  it("only touches paid plans", () => {
    expect(MIGRATION).toContain("lower(plan) IN ('starter', 'growth', 'pro', 'elite', 'agency')");
    expect(MIGRATION).not.toMatch(/WHEN 'free'/);
  });

  it("raises each plan to its published figure", () => {
    expect(MIGRATION).toContain("WHEN 'starter' THEN 100");
    expect(MIGRATION).toContain("WHEN 'growth'  THEN 250");
    expect(MIGRATION).toContain("WHEN 'pro'     THEN 500");
    expect(MIGRATION).toContain("WHEN 'agency'  THEN 1500");
  });

  it("leaves a deliberately chosen value alone", () => {
    // It cannot tell an intentional 10 from an untouched one, so it only moves
    // the exact default and never a number someone picked.
    expect(MIGRATION).toContain("ELSE daily_email_limit");
  });
});
