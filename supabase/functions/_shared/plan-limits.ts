/**
 * Canonical search-credit limits per plan — the single source of truth.
 *
 * These numbers were previously declared three times: `PLAN_CREDITS` in
 * fetch-external-leads (enforced), `PLAN_CONFIG` in src/lib/stripe-config.ts
 * (displayed), and `PLAN_FEATURES` in src/lib/plan-features.ts (gating). They
 * drifted — the free tier was enforced at 100 while the UI showed 10 — so an
 * account could be told it had a different allowance than the one the server
 * actually applied. Everything now reads from here.
 *
 * This lives under supabase/functions/_shared because Deno edge functions can
 * only import from within supabase/functions; the Vite frontend has no such
 * restriction and imports it from here too.
 *
 * These are SalesOS plan credits, metered per account in
 * `subscriptions.search_credits_remaining`. They are unrelated to the balance
 * on any upstream data provider's account.
 */

export type PlanId = "free" | "starter" | "growth" | "pro" | "agency";

export interface PlanSearchLimits {
  /** Search credits granted per monthly billing period. */
  monthlySearchCredits: number;
  /** Maximum searches per calendar day, reset at midnight. */
  dailySearchLimit: number;
  /** Maximum leads returned by a single search. */
  maxResultsPerSearch: number;
}

export const PLAN_SEARCH_LIMITS: Record<PlanId, PlanSearchLimits> = {
  free: { monthlySearchCredits: 100, dailySearchLimit: 100, maxResultsPerSearch: 25 },
  starter: { monthlySearchCredits: 1000, dailySearchLimit: 100, maxResultsPerSearch: 25 },
  growth: { monthlySearchCredits: 2500, dailySearchLimit: 250, maxResultsPerSearch: 50 },
  pro: { monthlySearchCredits: 5000, dailySearchLimit: 500, maxResultsPerSearch: 100 },
  agency: { monthlySearchCredits: 15000, dailySearchLimit: 1500, maxResultsPerSearch: 200 },
};

export const DEFAULT_PLAN: PlanId = "free";

/** Limits for a plan, falling back to the free tier for an unknown plan id. */
export function getPlanSearchLimits(plan: string | null | undefined): PlanSearchLimits {
  return PLAN_SEARCH_LIMITS[plan as PlanId] ?? PLAN_SEARCH_LIMITS[DEFAULT_PLAN];
}

export function isPlanId(plan: string | null | undefined): plan is PlanId {
  return plan != null && plan in PLAN_SEARCH_LIMITS;
}
