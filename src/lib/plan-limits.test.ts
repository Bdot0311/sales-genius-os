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

  // What outreign.io/pricing advertises, transcribed from src/components/Pricing.tsx
  // (freePlan, paidPlans and the "Verified Prospects & Email Sends" comparison
  // rows). Enforcement must match the page: if a tier's published allowance
  // changes, this fails until PLAN_SEARCH_LIMITS is updated to match.
  const PUBLISHED = {
    free: { monthly: 100, daily: 100, maxResults: 25 },
    starter: { monthly: 1000, daily: 100 },
    growth: { monthly: 2500, daily: 250 },
    pro: { monthly: 5000, daily: 500 },
    agency: { monthly: 15000, daily: 1500 },
  } as const;

  it.each(PLANS)("enforces the published allowance for %s", (plan) => {
    expect(PLAN_SEARCH_LIMITS[plan].monthlySearchCredits).toBe(PUBLISHED[plan].monthly);
    expect(PLAN_SEARCH_LIMITS[plan].dailySearchLimit).toBe(PUBLISHED[plan].daily);
  });

  it("caps the free tier at the published 25 results per search", () => {
    // The pricing page states this only for Explore: "Up to 25 results per
    // search". Paid tiers advertise no per-search cap.
    expect(PLAN_SEARCH_LIMITS.free.maxResultsPerSearch).toBe(PUBLISHED.free.maxResults);
  });

  it("never caps a paid tier below the free tier", () => {
    for (const plan of PLANS.filter((p) => p !== "free")) {
      expect(PLAN_SEARCH_LIMITS[plan].maxResultsPerSearch).toBeGreaterThanOrEqual(
        PLAN_SEARCH_LIMITS.free.maxResultsPerSearch,
      );
      expect(PLAN_SEARCH_LIMITS[plan].monthlySearchCredits).toBeGreaterThanOrEqual(
        PLAN_SEARCH_LIMITS.free.monthlySearchCredits,
      );
    }
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
