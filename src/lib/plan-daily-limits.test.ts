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

const CORRECTION_SQL = readFileSync(
  "supabase/migrations/20260825210000_correct_legacy_elite_daily_limit.sql",
  "utf8",
);

describe("the one-time correction is narrow", () => {
  it("only touches rows still holding the schema default", () => {
    expect(MIGRATION).toContain("WHERE daily_email_limit = 10");
  });

  it("casts the enum, because lower() has no overload for it", () => {
    // ERROR 42883: function lower(subscription_plan) does not exist. The first
    // version of this migration could never run.
    // Judge the statements, not the comment that explains the bug — which
    // necessarily quotes the broken call.
    const statements = (sql: string) =>
      sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const sql of [MIGRATION, CORRECTION_SQL]) {
      expect(statements(sql)).not.toContain("lower(plan)");
      expect(statements(sql)).toContain("plan::text");
    }
  });

  it("only touches paid plans", () => {
    expect(MIGRATION).toContain("plan::text IN ('starter', 'growth', 'pro', 'elite', 'agency')");
    expect(MIGRATION).not.toMatch(/WHEN 'free'/);
  });

  it("does not hand a legacy elite row Agency's allowance", () => {
    // Elite is the AGENT tier the Agency plan carries, not a plan. Every other
    // path normalises plan 'elite' to pro, so it takes pro's 500 a day.
    const CORRECTION = readFileSync(
      "supabase/migrations/20260825210000_correct_legacy_elite_daily_limit.sql",
      "utf8",
    );
    expect(CORRECTION).toContain("SET daily_email_limit = 500");
    expect(CORRECTION).toContain("plan::text = 'elite'");
    expect(CORRECTION).toContain("AND daily_email_limit = 1500");
    expect(readFileSync("src/components/deliverability/AccountSendLimit.tsx", "utf8"))
      .toContain("elite: 500");
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

describe("the account-wide limit lives where sending caps live", () => {
  const PANEL = readFileSync("src/components/deliverability/AccountSendLimit.tsx", "utf8");
  const PAGE = readFileSync("src/pages/Deliverability.tsx", "utf8");
  const BULK = readFileSync("src/components/outreach/BulkSendDialog.tsx", "utf8");

  it("is rendered on the Deliverability page", () => {
    expect(PAGE).toContain("<AccountSendLimit />");
    expect(PAGE).toContain("Daily send limit");
  });

  it("edits the account column, not a per-mailbox one", () => {
    expect(PANEL).toContain('.from("subscriptions")');
    expect(PANEL).toContain("daily_email_limit: next");
  });

  it("refuses a value above what the plan allows", () => {
    expect(PANEL).toContain("next > planCap");
  });

  it("says what it actually governs", () => {
    // It applies to Outreach Studio singles, the agent, sequences and
    // scheduled sends — not only to bulk.
    expect(PANEL).toContain("Applies to everything that sends");
  });

  it("stops the bulk dialog implying the limit is bulk-only", () => {
    expect(BULK).toContain("Account daily limit:");
    expect(BULK).toContain("Applies to every send on the account, not just this batch");
  });
});
