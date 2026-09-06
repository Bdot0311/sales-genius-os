import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The activation funnel measured the wrong things for months and looked fine
 * doing it. Each assertion below pins one of the five defects so a future edit
 * to the migration cannot quietly reintroduce it.
 */
const SQL = readFileSync(
  join(process.cwd(), "supabase/migrations/20260906210000_fix_activation_funnel_truth.sql"),
  "utf8",
);

describe("first search means a lead search", () => {
  it("reads the authoritative search table", () => {
    expect(SQL).toMatch(/CREATE TRIGGER trg_activation_search_event AFTER INSERT ON public\.search_usage_events/);
    expect(SQL).toContain("'lead_search'");
  });

  it("does not count AI usage, which is written to the same credit ledger", () => {
    // charge_ai_usage() inserts 'AI usage: <fn>' into search_transactions for
    // every AI call, so generating one email used to mark a user as searching.
    expect(SQL).toMatch(/LIKE 'AI usage:%'/);
  });
});

describe("demo data is not activation", () => {
  it.each(["trg_activation_lead", "trg_activation_sent_email", "trg_activation_sending_account"])(
    "%s skips demo-seeded rows",
    (fn) => {
      const body = SQL.slice(SQL.indexOf(`FUNCTION public.${fn}()`));
      const guard = body.slice(0, body.indexOf("$$;"));
      expect(guard).toMatch(/COALESCE\(NEW\.demo_seed, false\)/);
    },
  );
});

describe("onboarding", () => {
  it("no longer requires finishing the skippable product tour", () => {
    const body = SQL.slice(SQL.indexOf("FUNCTION public.trg_activation_onboarding()"));
    expect(body.slice(0, body.indexOf("$$;"))).not.toContain("completed_tour");
  });

  it("is NULL-safe, since `a AND b` is NULL when either side is", () => {
    expect(SQL).toMatch(/COALESCE\(NEW\.completed_profile, false\)/);
  });

  it("is reported outside the funnel chain", () => {
    const rank = SQL.slice(SQL.indexOf("activation_stage_rank"));
    expect(rank.slice(0, rank.indexOf("$$;"))).not.toContain("completed_onboarding");
  });
});

describe("mailbox connected", () => {
  it("also watches sending_accounts, the table that decides if a mailbox can send", () => {
    expect(SQL).toMatch(/CREATE TRIGGER trg_activation_sending_account AFTER INSERT ON public\.sending_accounts/);
  });
});

describe("the funnel is cumulative", () => {
  it("counts users who reached each stage or beyond", () => {
    for (const r of [2, 3, 4, 5, 6]) {
      expect(SQL).toContain(`FILTER (WHERE rank >= ${r})`);
    }
  });

  it("still reports the independent tallies so nothing is hidden", () => {
    expect(SQL).toMatch(/'ever', jsonb_build_object/);
  });
});

describe("signature change", () => {
  it("drops the old signatures instead of overloading them", () => {
    // Adding a defaulted parameter to a CREATE OR REPLACE leaves BOTH arities
    // installed, and the frontend's one-argument call then fails with
    // "function ... is not unique". Verified against a real Postgres 16.
    expect(SQL).toMatch(/DROP FUNCTION IF EXISTS public\.admin_get_activation_funnel\(int\)/);
    expect(SQL).toMatch(/DROP FUNCTION IF EXISTS public\.admin_list_activation_users\(int, text, int\)/);
    const dropAt = SQL.indexOf("DROP FUNCTION IF EXISTS public.admin_get_activation_funnel(int)");
    const createAt = SQL.indexOf("CREATE OR REPLACE FUNCTION public.admin_get_activation_funnel(");
    expect(dropAt).toBeGreaterThan(-1);
    expect(dropAt).toBeLessThan(createAt);
  });
});

describe("range_days", () => {
  it("reports the clamped range, not the raw argument", () => {
    expect(SQL).toMatch(/'range_days', _clamped/);
  });
});
