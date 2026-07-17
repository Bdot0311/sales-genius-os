/**
 * Frontend display helpers for reputation scores. The score itself is computed
 * server-side (compute-reputation) from real send/bounce/complaint data and read
 * from the DB — this module only maps a score to a label and color for the UI.
 * A null score means "insufficient data", never a fabricated number.
 */

export type ReputationTier = "unknown" | "poor" | "fair" | "good" | "excellent";

export interface ReputationDisplay {
  tier: ReputationTier;
  label: string;
  /** Tailwind text color class. */
  color: string;
  /** HSL for inline styling (bars, rings). */
  hsl: string;
}

export function reputationDisplay(score: number | null | undefined): ReputationDisplay {
  if (score === null || score === undefined) {
    return { tier: "unknown", label: "Not enough data", color: "text-muted-foreground", hsl: "hsl(0 0% 60%)" };
  }
  if (score >= 85) return { tier: "excellent", label: "Excellent", color: "text-green-500", hsl: "hsl(142 71% 45%)" };
  if (score >= 70) return { tier: "good", label: "Good", color: "text-emerald-400", hsl: "hsl(160 60% 45%)" };
  if (score >= 50) return { tier: "fair", label: "Fair", color: "text-yellow-500", hsl: "hsl(45 93% 47%)" };
  return { tier: "poor", label: "Poor", color: "text-destructive", hsl: "hsl(0 72% 51%)" };
}

/** Minimum 30-day volume before a score is produced (mirrors the server floor). */
export const MIN_VOLUME_FOR_SCORE = 20;
