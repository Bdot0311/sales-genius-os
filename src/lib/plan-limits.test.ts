import { describe, expect, it } from "vitest";
import {
  PLAN_SEARCH_LIMITS,
  getPlanSearchLimits,
  type PlanId,
} from "../../supabase/functions/_shared/plan-limits.ts";
import { PLAN_CONFIG } from "./stripe-config";
import { PLAN_FEATURES } from "./plan-features";

const PLANS: PlanId[] = ["free", "starter", "growth", "pro", "agency"];

describe("plan search limits", () => {
  // These three tables were independently maintained and drifted: the free tier
  // was enforced at 100 credits while stripe-config advertised 10, so the UI
  // showed an allowance the server did not honour. They are now derived from
  // PLAN_SEARCH_LIMITS; these assertions fail if a local copy creeps back in.
  it.each(PLANS)("stripe-config matches the canonical limits for %s", (plan) => {
    expect(PLAN_CONFIG[plan].monthlyProspects).toBe(PLAN_SEARCH_LIMITS[plan].monthlySearchCredits);
    expect(PLAN_CONFIG[plan].dailyLimit).toBe(PLAN_SEARCH_LIMITS[plan].dailySearchLimit);
  });

  it.each(PLANS)("plan-features matches the canonical limits for %s", (plan) => {
    expect(PLAN_FEATURES[plan].monthlySearchCredits).toBe(
      PLAN_SEARCH_LIMITS[plan].monthlySearchCredits,
    );
    expect(PLAN_FEATURES[plan].dailySearchLimit).toBe(PLAN_SEARCH_LIMITS[plan].dailySearchLimit);
    expect(PLAN_FEATURES[plan].maxResultsPerSearch).toBe(
      PLAN_SEARCH_LIMITS[plan].maxResultsPerSearch,
    );
  });

  it("grants the free tier 100 search credits", () => {
    expect(PLAN_SEARCH_LIMITS.free.monthlySearchCredits).toBe(100);
    expect(PLAN_SEARCH_LIMITS.free.dailySearchLimit).toBe(100);
    expect(PLAN_CONFIG.free.monthlyProspects).toBe(100);
    expect(PLAN_FEATURES.free.monthlySearchCredits).toBe(100);
  });

  it("never lets the daily limit exceed the monthly allowance", () => {
    for (const plan of PLANS) {
      expect(PLAN_SEARCH_LIMITS[plan].dailySearchLimit).toBeLessThanOrEqual(
        PLAN_SEARCH_LIMITS[plan].monthlySearchCredits,
      );
    }
  });

  describe("getPlanSearchLimits", () => {
    it.each(PLANS)("returns the limits for %s", (plan) => {
      expect(getPlanSearchLimits(plan)).toEqual(PLAN_SEARCH_LIMITS[plan]);
    });

    it("falls back to free for an unknown, null, or undefined plan", () => {
      // An account with no subscription row resolves to the free tier — the
      // same fallback fetch-external-leads applies before deducting a credit.
      expect(getPlanSearchLimits("enterprise")).toEqual(PLAN_SEARCH_LIMITS.free);
      expect(getPlanSearchLimits(null)).toEqual(PLAN_SEARCH_LIMITS.free);
      expect(getPlanSearchLimits(undefined)).toEqual(PLAN_SEARCH_LIMITS.free);
    });
  });
});
