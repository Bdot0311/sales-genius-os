import type { ICPProfile } from "@/hooks/use-icp-profiles";
import { OUTBOUND_KB, BuyingSignalType } from "./outbound-kb";

interface Lead {
  job_title?: string | null;
  industry?: string | null;
  company_size?: string | null;
  employee_count?: string | null;
  technologies?: string[] | null;
}

interface ScoreBreakdown {
  title: boolean;
  industry: boolean;
  size: boolean;
  tech: boolean;
  score: number;
  // true = had data but didn't match; false = matched; null = no data to evaluate
  titleEval: boolean | null;
  industryEval: boolean | null;
  sizeEval: boolean | null;
  techEval: boolean | null;
  hasEnoughData: boolean;
}

export function calculateICPMatch(lead: Lead, profiles: ICPProfile[]): ScoreBreakdown | null {
  if (!profiles.length) return null;

  let bestScore: ScoreBreakdown = {
    title: false, industry: false, size: false, tech: false, score: 0,
    titleEval: null, industryEval: null, sizeEval: null, techEval: null,
    hasEnoughData: false,
  };

  for (const profile of profiles) {
    let titleMatch = false;
    let industryMatch = false;
    let sizeMatch = false;
    let techMatch = false;

    // null = no data to evaluate; true/false = evaluated
    let titleEval: boolean | null = null;
    let industryEval: boolean | null = null;
    let sizeEval: boolean | null = null;
    let techEval: boolean | null = null;

    // Title match
    if (lead.job_title && profile.target_titles.length > 0) {
      const lower = lead.job_title.toLowerCase();
      titleMatch = profile.target_titles.some(
        (t) => lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)
      );
      titleEval = titleMatch;
    } else if (lead.job_title && profile.target_titles.length === 0) {
      titleEval = null; // profile has no titles to match against
    }

    // Industry match
    if (lead.industry && profile.industries.length > 0) {
      const lower = lead.industry.toLowerCase();
      industryMatch = profile.industries.some((i) => lower.includes(i.toLowerCase()));
      industryEval = industryMatch;
    }

    // Size match
    const empCount = parseInt(lead.employee_count || lead.company_size || "0", 10);
    if (empCount > 0) {
      sizeMatch = empCount >= profile.company_size_min && empCount <= profile.company_size_max;
      sizeEval = sizeMatch;
    }

    // Tech match
    if (lead.technologies && lead.technologies.length > 0 && profile.tech_stack.length > 0) {
      const leadTech = lead.technologies.map((t) => t.toLowerCase());
      techMatch = profile.tech_stack.some((t) => leadTech.includes(t.toLowerCase()));
      techEval = techMatch;
    }

    const w = (profile as any).scoring_weights || { title: 25, industry: 25, size: 25, tech: 25 };
    const score =
      (titleMatch ? w.title : 0) +
      (industryMatch ? w.industry : 0) +
      (sizeMatch ? w.size : 0) +
      (techMatch ? w.tech : 0);
    const evaluatedCount = [titleEval, industryEval, sizeEval, techEval].filter(v => v !== null).length;

    if (score > bestScore.score || (score === bestScore.score && evaluatedCount > [bestScore.titleEval, bestScore.industryEval, bestScore.sizeEval, bestScore.techEval].filter(v => v !== null).length)) {
      bestScore = {
        title: titleMatch, industry: industryMatch, size: sizeMatch, tech: techMatch, score,
        titleEval, industryEval, sizeEval, techEval,
        hasEnoughData: evaluatedCount >= 2,
      };
    }
  }

  return bestScore;
}

export function getScoreColor(score: number): string {
  if (score >= 71) return "bg-green-500/10 text-green-500 border-green-500/20";
  if (score >= 41) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
  return "bg-red-500/10 text-red-500 border-red-500/20";
}

// ─── Signal-based scoring ─────────────────────────────────────────────────────

export interface SignalScoreResult {
  score: number;            // 0–100 normalized
  rawWeight: number;        // sum of matched signal weights
  matchedSignals: Array<{ signal: BuyingSignalType; label: string; weight: number }>;
  badge: "none" | "high_intent" | "buying_signal";
  badgeLabel: string;
}

/**
 * Compute a signal score (0–100) for a lead given its detected buying signals.
 * `detectedSignals` should be an array of BuyingSignalType strings present on the lead.
 */
export function computeSignalScore(detectedSignals: string[]): SignalScoreResult {
  const maxPossibleWeight = OUTBOUND_KB.buyingSignals.reduce((sum, s) => sum + s.weight, 0);

  const matched = OUTBOUND_KB.buyingSignals.filter(s =>
    detectedSignals.some(d => d === s.signal || d.toLowerCase().includes(s.signal.replace(/_/g, ' ')))
  );

  const rawWeight = matched.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.round((rawWeight / maxPossibleWeight) * 100);

  let badge: SignalScoreResult["badge"] = "none";
  let badgeLabel = "";

  if (rawWeight > 40) {
    badge = "buying_signal";
    badgeLabel = "Buying Signal Detected";
  } else if (rawWeight > 20) {
    badge = "high_intent";
    badgeLabel = "High Intent";
  }

  return {
    score,
    rawWeight,
    matchedSignals: matched.map(s => ({ signal: s.signal as BuyingSignalType, label: s.label, weight: s.weight })),
    badge,
    badgeLabel,
  };
}

/** All available buying signals with their weights — for display in UI */
export const ALL_BUYING_SIGNALS = OUTBOUND_KB.buyingSignals;
