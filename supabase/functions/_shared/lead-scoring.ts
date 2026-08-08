// Deterministic lead scoring engine (Phase 1: Lead Score v2).
//
// The numeric scores and tier are computed purely from the rubric + inputs, so
// scoring the same lead twice with unchanged inputs always returns the same
// tier. The model is used only to phrase the reason string; if it fails, the
// deterministic reason built here is used instead. No score depends on model
// output, and no value here is fabricated: everything derives from the lead's
// own fields and its recorded signal events.

export interface RubricWeights {
  fit: { industry: number; headcount: number; seniority: number; function: number; geography: number; tech: number };
  intent: { base_signal: number; recency_half_life_days: number; count_weight: number; repeat_account_bonus: number };
  thresholds: { a_fit_min: number; b_fit_min: number };
}

export const DEFAULT_RUBRIC: RubricWeights = {
  fit: { industry: 30, headcount: 20, seniority: 20, function: 15, geography: 10, tech: 5 },
  intent: { base_signal: 20, recency_half_life_days: 14, count_weight: 10, repeat_account_bonus: 15 },
  thresholds: { a_fit_min: 70, b_fit_min: 40 },
};

export interface LeadInput {
  industry?: string | null;
  company_size?: string | null;
  job_title?: string | null;
  country?: string | null;
  tech_stack?: string[] | null;
  /**
   * The `leads` table stores technographics in `technologies` (text[]), not
   * `tech_stack` — callers pass the raw row (`select("*")`), so reading only
   * `tech_stack` meant the `tech` fit dimension never had a value to match and
   * was silently skipped for every lead. Both names are accepted; `tech_stack`
   * wins when present so existing callers keep their behaviour.
   */
  technologies?: string[] | null;
  company_name?: string | null;
}

export interface IcpInput {
  industries?: string[] | null;
  company_size_min?: number | null;
  company_size_max?: number | null;
  seniority_levels?: string[] | null;
  departments?: string[] | null;
  target_titles?: string[] | null;
  geographies?: string[] | null;
  tech_stack?: string[] | null;
}

export interface SignalEventInput {
  signal_type: string;
  weight: number;
  occurred_at: string; // ISO
  metadata?: Record<string, unknown> | null;
}

const norm = (s: unknown): string => (typeof s === "string" ? s.toLowerCase().trim() : "");
const anyMatch = (needle: string, hay?: string[] | null): boolean =>
  !!hay && hay.some((h) => { const n = norm(h); return !!n && (needle.includes(n) || n.includes(needle)); });

// Parse a company_size value ("51-200", "200", "1000+") into a representative number.
function sizeToNumber(size?: string | null): number | null {
  if (!size) return null;
  const digits = String(size).replace(/,/g, "").match(/\d+/g);
  if (!digits) return null;
  const nums = digits.map(Number);
  return nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
}

export interface FitResult {
  score: number; // 0-100
  matched: Record<string, boolean>;
  applicable: string[];
}

// Fit only counts dimensions the ICP actually specifies. A lead is not
// penalized for a criterion the ICP left blank.
export function computeFit(lead: LeadInput, icp: IcpInput | null, rubric: RubricWeights): FitResult {
  const w = rubric.fit;
  const matched: Record<string, boolean> = {};
  const applicable: string[] = [];
  let got = 0;
  let possible = 0;

  const consider = (key: keyof typeof w, isApplicable: boolean, isMatch: boolean) => {
    if (!isApplicable) return;
    applicable.push(key);
    possible += w[key];
    matched[key] = isMatch;
    if (isMatch) got += w[key];
  };

  if (!icp) return { score: 0, matched, applicable };

  const title = norm(lead.job_title);
  consider("industry", !!icp.industries?.length, anyMatch(norm(lead.industry), icp.industries));

  const size = sizeToNumber(lead.company_size);
  const hasBand = icp.company_size_min != null || icp.company_size_max != null;
  consider("headcount", hasBand && size != null,
    size != null && (icp.company_size_min == null || size >= icp.company_size_min) &&
    (icp.company_size_max == null || size <= icp.company_size_max));

  consider("seniority", !!icp.seniority_levels?.length && !!title, !!title && anyMatch(title, icp.seniority_levels));
  const funcTargets = [...(icp.departments || []), ...(icp.target_titles || [])];
  consider("function", funcTargets.length > 0 && !!title, !!title && anyMatch(title, funcTargets));
  consider("geography", !!icp.geographies?.length, anyMatch(norm(lead.country), icp.geographies));
  const leadTech = lead.tech_stack ?? lead.technologies;
  consider("tech", !!icp.tech_stack?.length && !!leadTech?.length,
    !!leadTech?.some((t) => anyMatch(norm(t), icp.tech_stack)));

  const score = possible > 0 ? Math.round((got / possible) * 100) : 0;
  return { score, matched, applicable };
}

export interface IntentResult {
  score: number; // 0-100
  count: number;
  repeat_account: boolean;
  most_recent_days: number | null;
  top_signal: string | null;
}

// Intent decays with age (half-life), rewards multiple signals, and adds a
// bonus when the same account fired more than once. `nowMs` is injected for
// deterministic testing.
export function computeIntent(events: SignalEventInput[], rubric: RubricWeights, nowMs: number): IntentResult {
  const w = rubric.intent;
  if (!events.length) return { score: 0, count: 0, repeat_account: false, most_recent_days: null, top_signal: null };

  const halfLife = Math.max(1, w.recency_half_life_days);
  let decayed = 0;
  let mostRecentMs = -Infinity;
  let topSignal: string | null = null;
  let topContribution = -1;
  const companies = new Set<string>();

  for (const e of events) {
    const t = Date.parse(e.occurred_at);
    if (Number.isNaN(t)) continue;
    const ageDays = Math.max(0, (nowMs - t) / 86_400_000);
    const contribution = (e.weight ?? w.base_signal) * Math.pow(0.5, ageDays / halfLife);
    decayed += contribution;
    if (t > mostRecentMs) mostRecentMs = t;
    if (contribution > topContribution) { topContribution = contribution; topSignal = e.signal_type; }
    const company = norm((e.metadata?.company_name as string) || "");
    if (company) companies.add(company);
  }

  const count = events.length;
  const repeatAccount = count > 1 && (companies.size <= 1 || companies.size < count);
  let raw = decayed + Math.min(count - 1, 3) * w.count_weight + (repeatAccount ? w.repeat_account_bonus : 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const mostRecentDays = mostRecentMs > -Infinity ? Math.floor((nowMs - mostRecentMs) / 86_400_000) : null;
  return { score, count, repeat_account: repeatAccount, most_recent_days: mostRecentDays, top_signal: topSignal };
}

export type Tier = "A" | "B" | "C";

// A requires real intent (a fired signal) on top of strong fit, so a
// strong-fit lead with no signals can never be A.
export function deriveTier(fitScore: number, intent: IntentResult, rubric: RubricWeights): Tier {
  const t = rubric.thresholds;
  if (intent.score > 0 && fitScore >= t.a_fit_min) return "A";
  if (fitScore >= t.b_fit_min) return "B";
  return "C";
}

// Baseline "worth engaging" intent for a lead with no fired buying signals yet.
// Signal-based intent is 0 until something fires, which for cold outbound is most
// leads, so the displayed intent used to sit at a bare 0 and read as broken. This
// gives a deterministic, per-lead floor from fit + seniority + data completeness
// so intent is meaningful immediately; a real signal (e.g. a hiring event from the
// ATS feed) then pushes it above this floor. It is capped below the top band so a
// fired signal always stands out, and it never gates tier A (that still needs a
// real signal via deriveTier).
export function qualityBaseline(lead: LeadInput, fit: FitResult): number {
  let b = Math.round(fit.score * 0.4); // 0-40 from ICP fit
  const t = norm(lead.job_title);
  if (/\b(founder|co-?founder|ceo|chief|owner|president|cxo|cto|cfo|coo|cmo)\b/.test(t)) b += 28;
  else if (/\b(vp|vice president|head|director|partner)\b/.test(t)) b += 20;
  else if (/\b(manager|lead|principal)\b/.test(t)) b += 12;
  else if (t) b += 6;
  if (lead.industry) b += 4;
  if (lead.company_size) b += 4;
  const co = norm(lead.company_name);
  if (co && co !== "unknown") b += 4;
  return Math.max(15, Math.min(80, b));
}

// Plain-English fallback reason. Lowercase-first, no em-dashes, no hype.
export function buildReason(fit: FitResult, intent: IntentResult): string {
  const strong = Object.entries(fit.matched).filter(([, v]) => v).map(([k]) => k);
  const parts: string[] = [];
  if (strong.length) parts.push(`fits on ${strong.join(", ")}`);
  else if (fit.applicable.length) parts.push("weak fit against your icp");
  else parts.push("no icp criteria to match against yet");

  if (intent.score > 0) {
    const recency = intent.most_recent_days === 0 ? "today"
      : intent.most_recent_days === 1 ? "yesterday"
      : intent.most_recent_days != null ? `${intent.most_recent_days} days ago` : "recently";
    const sig = intent.top_signal ? intent.top_signal.replace(/_/g, " ") : "a signal";
    parts.push(`${sig} ${recency}${intent.repeat_account ? " with repeat activity" : ""}`);
  } else {
    parts.push("no recent signals");
  }
  return parts.join(", ") + ".";
}

export interface ScoreResult {
  fit_score: number;
  intent_score: number;
  tier: Tier;
  reason: string;
  breakdown: {
    fit: FitResult;
    intent: IntentResult;
  };
}

export function scoreLead(
  lead: LeadInput,
  icp: IcpInput | null,
  events: SignalEventInput[],
  rubric: RubricWeights,
  nowMs: number,
): ScoreResult {
  const fit = computeFit(lead, icp, rubric);
  const intent = computeIntent(events, rubric, nowMs);
  const tier = deriveTier(fit.score, intent, rubric);
  // Displayed intent never sits at a bare 0 for a real lead: with no fired
  // signals it shows the quality baseline; a live signal adds a boost ON TOP of
  // that floor (additive, not max, so a real signal is always visible even when
  // the baseline is already high), scaled by the signal's strength and recency.
  // A signal that has fully decayed contributes nothing and falls back to the
  // floor. Tier still keys on the real signal intent (via deriveTier above), so
  // the baseline can never manufacture an A.
  const baseline = qualityBaseline(lead, fit);
  const intentScore = intent.score > 0
    ? Math.min(100, baseline + Math.max(5, Math.round(intent.score * 0.5)))
    : baseline;
  return {
    fit_score: fit.score,
    intent_score: intentScore,
    tier,
    reason: buildReason(fit, intent),
    breakdown: { fit, intent },
  };
}
