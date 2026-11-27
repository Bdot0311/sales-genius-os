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
 *
 * What a credit buys depends on the tier:
 *   - Paid tiers: searching is free; one credit is spent per lead *revealed*
 *     (enrich-lead), which is what "contact up to N verified prospects" means
 *     on the pricing page.
 *   - Free tier: cannot reveal at all, so its allowance is spent per *search* —
 *     the pricing page's "100 lead searches / month".
 *
 * dailySearchLimit applies to every tier regardless. It is a rate limit rather
 * than a charge, and it is what bounds upstream provider spend now that paid
 * searching costs no credits.
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

/**
 * Monthly email sends per plan — the single source of truth.
 *
 * This table was declared twice, identically, in send-email and
 * process-scheduled-emails. The two agreed when this was written and nothing
 * kept them agreeing, which is the same drift this file already exists to
 * stop: PLAN_SEARCH_LIMITS was consolidated after the free tier was enforced
 * at 100 while the UI showed 10, and an account could be told a different
 * allowance than the server applied.
 *
 * Two send paths disagreeing would be worse than that one. A send allowed by
 * the immediate path and refused by the scheduled path -- or the reverse --
 * is an allowance that depends on which door the email went through.
 *
 * `free: 100` is what the pricing page advertises as "Monthly email sends".
 * -1 is unlimited. `elite` is a legacy plan id that maps to pro.
 */
export const MONTHLY_EMAIL_LIMITS: Record<string, number> = {
  free: 100, starter: 50000, growth: 250000, pro: 1000000, elite: 1000000, agency: -1,
};

/** The monthly send allowance for a plan, defaulting to the free tier. */
export function monthlyEmailLimit(plan: string | null | undefined): number {
  return MONTHLY_EMAIL_LIMITS[String(plan ?? "")] ?? MONTHLY_EMAIL_LIMITS.free;
}

export const DEFAULT_PLAN: PlanId = "free";

/** Limits for a plan, falling back to the free tier for an unknown plan id. */
export function getPlanSearchLimits(plan: string | null | undefined): PlanSearchLimits {
  return PLAN_SEARCH_LIMITS[plan as PlanId] ?? PLAN_SEARCH_LIMITS[DEFAULT_PLAN];
}
