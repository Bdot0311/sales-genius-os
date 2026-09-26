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

/* ------------------------------------------------------------------------ *
 * Why a score is what it is.
 *
 * The page showed "50 Fair" beside "100% inbox placement" and the two read as
 * a contradiction. They are not: placement measures where accepted mail lands,
 * and the score is almost entirely bounces, which is mail that was never
 * accepted at all. Nothing on the page connected the two, so the number looked
 * arbitrary and the actual problem -- a list full of addresses that do not
 * exist -- went unnamed.
 *
 * So the deficit is decomposed into the deductions that caused it.
 * ------------------------------------------------------------------------ */

/** The three things that can cost a mailbox points. */
export type DeductionKey = "bounces" | "complaints" | "spam_placement";

export interface Deduction {
  key: DeductionKey;
  /** Column heading, not a sentence. */
  label: string;
  /** Points lost, as a positive number. */
  points: number;
  /** The counts behind it, so the figure can be checked rather than believed. */
  detail: string;
  /** The penalty hit its ceiling: the real damage is worse than the number. */
  capped: boolean;
}

export interface ScoreBreakdown {
  /** Nonzero deductions, largest first. Empty when nothing cost points. */
  deductions: Deduction[];
  /** Points lost in total. Always equals 100 - score. */
  total: number;
  /** Penalties exceeded 100, so the score bottomed out rather than summing. */
  floored: boolean;
}

export interface BreakdownInputs {
  outreach_sent: number;
  bounced: number;
  complaints: number;
  warmup_inbox: number;
  warmup_spam: number;
}

/** Penalty ceilings, mirroring computeReputation(). A capped penalty is worth
 *  saying out loud: it means the rate is past the point where the score can
 *  still track it. */
const BOUNCE_CAP = 50;
const COMPLAINT_CAP = 40;
const SPAM_PLACEMENT_CAP = 25;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Attribute a score's deficit to its causes.
 *
 * This mirrors computeReputation() in supabase/functions/_shared/reputation.ts,
 * which is the only place a score is really produced. A mirror can drift, and a
 * drifted mirror is worse than no mirror at all: it would state a cause with
 * the same confidence whether or not it was the real one.
 *
 * So the reconstruction is checked against the score the server reported. If it
 * cannot reproduce that number, it returns null and the UI shows nothing. The
 * page would rather say less than blame the wrong thing.
 *
 * Returns null when there is no score to explain, and when the score is a
 * perfect 100 there is simply nothing to attribute.
 */
export function scoreBreakdown(
  input: BreakdownInputs,
  reportedScore: number | null | undefined,
): ScoreBreakdown | null {
  if (reportedScore === null || reportedScore === undefined) return null;

  const sent = Math.max(0, input.outreach_sent);
  const bounced = Math.max(0, input.bounced);
  const complaints = Math.max(0, input.complaints);
  const spam = Math.max(0, input.warmup_spam);
  const classified = Math.max(0, input.warmup_inbox) + spam;

  const raw: Array<Omit<Deduction, "points"> & { exact: number }> = [
    {
      key: "bounces",
      label: "Bounces",
      exact: sent > 0 ? Math.min(BOUNCE_CAP, (bounced / sent) * 600) : 0,
      capped: sent > 0 && (bounced / sent) * 600 >= BOUNCE_CAP,
      detail: `${bounced} of ${plural(sent, "send")} rejected`,
    },
    {
      key: "complaints",
      label: "Spam complaints",
      exact: sent > 0 ? Math.min(COMPLAINT_CAP, (complaints / sent) * 13000) : 0,
      capped: sent > 0 && (complaints / sent) * 13000 >= COMPLAINT_CAP,
      detail: `${plural(complaints, "recipient")} marked it spam`,
    },
    {
      key: "spam_placement",
      label: "Warmup in spam",
      exact: classified > 0 ? Math.min(SPAM_PLACEMENT_CAP, (spam / classified) * 100) : 0,
      capped: classified > 0 && (spam / classified) * 100 >= SPAM_PLACEMENT_CAP,
      detail: `${spam} of ${plural(classified, "warmup message")} filtered`,
    },
  ];

  const exactTotal = raw.reduce((t, d) => t + d.exact, 0);
  const floored = exactTotal > 100;
  // The same clamp-then-round the server applies. Comparing before rounding
  // would reject a breakdown that is right for a reason that does not matter.
  if (Math.round(Math.max(0, Math.min(100, 100 - exactTotal))) !== reportedScore) return null;

  const total = 100 - reportedScore;
  const deductions = raw
    .filter((d) => d.exact > 0)
    .sort((a, b) => b.exact - a.exact)
    .map(({ exact, ...rest }) => ({ ...rest, points: Math.round(exact) }));

  if (deductions.length === 0) return { deductions, total, floored };

  // Each penalty is fractional and only the final score is rounded, so the
  // rounded parts can miss the whole by a point. A ledger whose entries do not
  // add up to the number above them invites exactly the doubt it exists to
  // settle, so the largest entry absorbs the remainder. Nothing is invented:
  // the drift is at most a point, and it lands on the line that earned it.
  if (!floored) {
    const drift = total - deductions.reduce((t, d) => t + d.points, 0);
    if (drift !== 0) deductions[0] = { ...deductions[0], points: deductions[0].points + drift };
  }

  return { deductions, total, floored };
}
