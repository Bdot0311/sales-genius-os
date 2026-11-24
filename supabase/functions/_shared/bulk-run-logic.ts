/**
 * Pure rules for bulk research + drafting runs. No I/O here so the rules can
 * be tested directly; bulk-runs (owner API) and process-bulk-runs (worker)
 * both import them.
 */

export const PIPELINE_STAGE_FILTER_KEYS = ["pipeline_stage", "tier", "min_icp_score", "query", "has_email"] as const;

export interface BulkFilters {
  pipeline_stage?: string;
  tier?: "A" | "B" | "C" | "unscored";
  min_icp_score?: number;
  query?: string;
  /** Default true: a lead with no address cannot receive a draft. */
  has_email?: boolean;
}

export function normalizeFilters(raw: unknown): BulkFilters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: BulkFilters = {};
  if (typeof r.pipeline_stage === "string" && r.pipeline_stage.trim()) out.pipeline_stage = r.pipeline_stage.trim().slice(0, 60);
  if (typeof r.tier === "string" && ["A", "B", "C", "unscored"].includes(r.tier)) out.tier = r.tier as BulkFilters["tier"];
  if (typeof r.min_icp_score === "number" && Number.isFinite(r.min_icp_score)) out.min_icp_score = Math.max(0, Math.min(100, r.min_icp_score));
  if (typeof r.query === "string" && r.query.trim()) out.query = r.query.replace(/[%,()]/g, "").trim().slice(0, 100);
  out.has_email = r.has_email === false ? false : true;
  return out;
}

// deno-lint-ignore no-explicit-any
export function applyBulkFilters(q: any, userId: string, f: BulkFilters): any {
  let b = q.eq("user_id", userId);
  if (f.pipeline_stage) b = b.eq("pipeline_stage", f.pipeline_stage);
  if (typeof f.min_icp_score === "number") b = b.gte("icp_score", f.min_icp_score);
  if (f.tier === "unscored") b = b.is("tier", null);
  else if (f.tier) b = b.eq("tier", f.tier);
  if (f.query) b = b.or(`company_name.ilike.%${f.query}%,contact_name.ilike.%${f.query}%,contact_email.ilike.%${f.query}%`);
  if (f.has_email !== false) b = b.not("contact_email", "is", null);
  return b;
}

/** Keyset cursor over (created_at desc, id desc): stable for any list size, no OFFSET. */
export function keysetOr(cursor: { created_at: string | null; id: string | null }): string | null {
  if (!cursor.created_at || !cursor.id) return null;
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

export const ESTIMATE_RATES = {
  /** Leads finished per minute by one run at the default concurrency. Measured conservatively. */
  leadsPerMinute: 8,
  researchUsd: 0.03,
  draftUsd: 0.02,
};

export interface BulkEstimate {
  leads: number;
  research_calls: number;
  draft_calls: number;
  est_provider_usd: number;
  est_minutes: number;
}

export function estimateRun(leads: number, doResearch: boolean, doDraft: boolean, rates = ESTIMATE_RATES): BulkEstimate {
  const n = Math.max(0, Math.floor(leads));
  const research = doResearch ? n : 0;
  const drafts = doDraft ? n : 0;
  return {
    leads: n,
    research_calls: research,
    draft_calls: drafts,
    est_provider_usd: Math.round((research * rates.researchUsd + drafts * rates.draftUsd) * 100) / 100,
    est_minutes: Math.ceil(n / rates.leadsPerMinute),
  };
}

export type FailureKind = "rate_limit" | "credits" | "transient" | "permanent";

export function classifyFailure(message: string): FailureKind {
  const m = message.toLowerCase();
  if (/ai_credits|payment required|402|credits? (are )?exhausted|insufficient/.test(m)) return "credits";
  if (/rate.?limit|429|too many requests|throttl/.test(m)) return "rate_limit";
  // "already running in another pass": two passes reached the same lead and
  // the second was refused the research claim. The next attempt finds the
  // brief the first one stored.
  // "the company site could not be read" is a fetch that failed: a timeout, a
  // 503, a temporary block. It was settled as permanent, so a lead whose site
  // was briefly unreachable never got a second attempt and was reported to the
  // owner as research finding nothing worth quoting.
  if (/timed? ?out|timeout|temporarily|overloaded|unreachable|50[234]|network|econn|did not return a score|no response from the model|empty (model )?response|already running in another pass|site could not be read|could not be stored as evidence/.test(m)) return "transient";
  return "permanent";
}

export const MAX_ATTEMPTS = 4;

/** Seconds to wait before an item's next attempt: 30s, 2m, 8m, … capped at 30m. */
export function itemBackoffSeconds(attempts: number): number {
  return Math.min(30 * 4 ** Math.max(0, attempts - 1), 1800);
}

/** Same curve, a quarter either side, so a batch of throttled items does not wake together. */
export function jitteredBackoffSeconds(attempts: number, random: () => number = Math.random): number {
  const base = itemBackoffSeconds(attempts);
  const spread = base * 0.25;
  const unit = Math.min(1, Math.max(0, random()));
  return Math.max(1, Math.round(base - spread + unit * spread * 2));
}

/**
 * The agent worker's attempt cap. The stale-claim reaper gives up at the same
 * number, so a lead cannot bounce between pending and claimed past it.
 */
export const AGENT_JOB_ATTEMPT_CAP = 3;

/**
 * Whether the worker should run this item again, and how long to leave it.
 *
 * A rate limit and a scorer timeout are the provider saying not now. Parking
 * the row with no delay meant the next pass — often the next of the three
 * passes fired in the same minute — spent the remaining attempts inside the
 * same throttle window and then stored a permanent failure.
 */
export function agentJobRetry(
  message: string,
  attempts: number,
  random: () => number = Math.random,
): { retry: boolean; delaySeconds: number } {
  const kind = classifyFailure(message);
  const retry = (kind === "rate_limit" || kind === "transient") && attempts < AGENT_JOB_ATTEMPT_CAP;
  if (!retry) return { retry: false, delaySeconds: 0 };
  return { retry: true, delaySeconds: jitteredBackoffSeconds(attempts, random) };
}

/** Run-wide cool-off after consecutive rate limits: 1m, 2m, 4m … capped at 30m. */
export function runCooloffSeconds(consecutive: number): number {
  return Math.min(60 * 2 ** Math.max(0, consecutive - 1), 1800);
}

/** After this many rate-limited passes in a row the run pauses and asks the owner. */
export const RATE_LIMIT_PAUSE_AFTER = 8;

/** Leads to add to the queue now, never past the approved cap. */
export function feedSize(enqueued: number, maxLeads: number | null, pendingNow: number, page = 500, lowWater = 200): number {
  if (pendingNow >= lowWater) return 0;
  const room = maxLeads == null ? page : Math.max(0, maxLeads - enqueued);
  return Math.min(page, room);
}
