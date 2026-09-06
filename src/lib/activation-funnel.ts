/**
 * Reading the activation funnel honestly.
 *
 * The admin panel drew six independent tallies as a funnel and computed
 * drop-off percentages between them. Because the tallies were unordered, a
 * later step could exceed an earlier one — the reported panel showed
 * "Onboarded 3" above "First search 5" — and the drop-off line was only
 * rendered `when dropoff > 0`, so the increase was silently swallowed and the
 * chart looked coherent while being wrong.
 *
 * The RPC now returns two views of every step and this module keeps them
 * distinct:
 *
 *   funnel — users who reached that stage OR BEYOND. Monotonic by
 *            construction, which is the only thing that makes a drop-off
 *            percentage meaningful.
 *   ever   — users who actually hit that specific milestone, whether or not
 *            they walked the steps in order.
 *
 * Where the two disagree, someone skipped a step, and the UI shows both rather
 * than picking the flattering one.
 */

export const ACTIVATION_FUNNEL_STEPS = [
  { key: "signed_up", label: "Signed up" },
  { key: "verified_email", label: "Verified email" },
  { key: "first_search", label: "First lead search" },
  { key: "first_lead_saved", label: "First lead saved" },
  { key: "mailbox_connected", label: "Mailbox connected" },
  { key: "first_email_sent", label: "First email sent" },
] as const;

export type FunnelStepKey = (typeof ACTIVATION_FUNNEL_STEPS)[number]["key"];

export interface ActivationFunnelResponse {
  range_days: number;
  generated_at?: string;
  include_internal?: boolean;
  excluded_internal?: number;
  funnel: Record<string, number>;
  ever?: Record<string, number>;
  onboarding?: { completed_profile: number };
  cohorts: { tire_kicker: number; explorer: number; active: number; power: number };
}

export interface FunnelRow {
  key: FunnelStepKey;
  label: string;
  value: number;
  /** Share of everyone who signed up in range. */
  pct: number;
  /**
   * Change from the previous step. Negative means the step LOST users (the
   * normal case). Positive would mean it gained them, which a cumulative
   * funnel cannot do — so if it ever appears, it is surfaced rather than
   * hidden, because it means the data is wrong and someone should know.
   */
  changePct: number | null;
  /**
   * The independent count, present only when it differs from the cumulative
   * one. A difference means users skipped this step and arrived later anyway.
   */
  everValue: number | null;
}

export function percentOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export function funnelRows(data: ActivationFunnelResponse | null): FunnelRow[] {
  if (!data) return [];
  const total = data.funnel?.signed_up ?? 0;

  return ACTIVATION_FUNNEL_STEPS.map((step, i) => {
    const value = data.funnel?.[step.key] ?? 0;
    const ever = data.ever?.[step.key];
    const prev = i === 0 ? null : (data.funnel?.[ACTIVATION_FUNNEL_STEPS[i - 1].key] ?? 0);

    let changePct: number | null = null;
    if (prev !== null && prev > 0) changePct = Math.round(((value - prev) / prev) * 100);

    return {
      key: step.key,
      label: step.label,
      value,
      pct: percentOf(value, total),
      changePct,
      everValue: typeof ever === "number" && ever !== value ? ever : null,
    };
  });
}

/**
 * A cumulative funnel that goes UP is impossible, so it means the query is
 * broken rather than that the product improved. Worth saying out loud on the
 * page instead of leaving an admin to spot it.
 */
export function isMonotonic(rows: FunnelRow[]): boolean {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].value > rows[i - 1].value) return false;
  }
  return true;
}

/** Where the largest single drop happens — the step worth fixing first. */
export function biggestDropStep(rows: FunnelRow[]): FunnelRow | null {
  let worst: FunnelRow | null = null;
  for (const r of rows) {
    if (r.changePct === null || r.changePct >= 0) continue;
    if (!worst || r.changePct < (worst.changePct ?? 0)) worst = r;
  }
  return worst;
}

export function freshnessLabel(generatedAt: string | undefined, now = Date.now()): string {
  if (!generatedAt) return "";
  const t = new Date(generatedAt).getTime();
  if (!Number.isFinite(t)) return "";
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
