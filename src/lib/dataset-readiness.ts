/**
 * Reading the outcome dataset honestly.
 *
 * Two traps this module exists to avoid.
 *
 * A single progress bar. 2,000 finished examples with 40 positives is not 80%
 * of the way to a trainable dataset; it is a dataset that mostly records
 * silence, and a model trained on it learns to answer "no" to everything. The
 * positives are the scarce half, so progress is the WORSE of the two ratios,
 * never their average and never the examples alone.
 *
 * A breakdown read as signal when it is noise. A band holding four finished
 * examples will show a positive rate of 0%, 25%, 50% or 75% whatever is
 * actually true of it, and those numbers look like findings. Bands below a
 * floor are marked thin so the page can say "not enough yet" rather than draw
 * a bar that invites a conclusion.
 */

export interface Readiness {
  finalized: number;
  positives: number;
  target_examples: number;
  target_positives: number;
  ready: boolean;
}

export interface BreakdownRow {
  value: string;
  finalized: number;
  positives: number;
  positive_rate: number | null;
}

/**
 * Below this a band's rate is arithmetic rather than evidence. 30 is the
 * conventional floor for treating a proportion as meaningful at all, and it is
 * a label on the page rather than a filter: a thin band is still worth seeing,
 * it just must not be read as a rate.
 */
export const THIN_BAND = 30;

/** Progress toward trainable, as the worse of the two ratios. 0 to 1. */
export function readinessFraction(r: Readiness): number {
  const byExamples = r.target_examples > 0 ? r.finalized / r.target_examples : 1;
  const byPositives = r.target_positives > 0 ? r.positives / r.target_positives : 1;
  return Math.max(0, Math.min(1, Math.min(byExamples, byPositives)));
}

/** Which threshold is actually holding things up, for a page that says so. */
export function bindingConstraint(r: Readiness): "examples" | "positives" | "none" {
  if (r.finalized >= r.target_examples && r.positives >= r.target_positives) return "none";
  const examplesShort = Math.max(0, r.target_examples - r.finalized) / Math.max(1, r.target_examples);
  const positivesShort = Math.max(0, r.target_positives - r.positives) / Math.max(1, r.target_positives);
  return positivesShort >= examplesShort ? "positives" : "examples";
}

export function isThin(row: BreakdownRow): boolean {
  return row.finalized < THIN_BAND;
}

/**
 * Does this dimension separate repliers from non-repliers at all?
 *
 * The spread between the best and worst band, counting only bands with enough
 * examples to mean anything. A flat spread across send_recommendation is the
 * finding that matters: it says Lead Intelligence's recommendation predicts
 * nothing yet, and a model trained on it would inherit that.
 *
 * Null when fewer than two bands are thick enough to compare, because one band
 * has nothing to spread against.
 */
export function discrimination(rows: readonly BreakdownRow[]): number | null {
  const usable = rows.filter((r) => !isThin(r) && r.positive_rate !== null);
  if (usable.length < 2) return null;
  const rates = usable.map((r) => r.positive_rate as number);
  return Math.max(...rates) - Math.min(...rates);
}

/** How many more positives and examples are needed, never negative. */
export function remaining(r: Readiness): { examples: number; positives: number } {
  return {
    examples: Math.max(0, r.target_examples - r.finalized),
    positives: Math.max(0, r.target_positives - r.positives),
  };
}

export function formatRate(rate: number | null): string {
  // An absent rate is not zero: a band with no finished examples has no rate.
  if (rate === null || rate === undefined || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * When the threshold would be reached at the recent rate.
 *
 * Measured from the dataset_stats history rather than from total volume, so a
 * burst three months ago does not flatter today's pace. Null when there is not
 * enough history to see a slope, or when nothing is moving -- an honest "no
 * estimate" beats a date computed from two points that happened to differ.
 */
export function projectedReadyDate(
  history: readonly { as_of: string; finalized: number; positives: number }[],
  target: Readiness,
  today = new Date(),
): Date | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => (a.as_of < b.as_of ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = (new Date(last.as_of).getTime() - new Date(first.as_of).getTime()) / 86_400_000;
  if (days <= 0) return null;

  const perDayExamples = (last.finalized - first.finalized) / days;
  const perDayPositives = (last.positives - first.positives) / days;
  const need = remaining(target);
  if (need.examples === 0 && need.positives === 0) return today;
  // Either rate being flat or falling means the threshold is not approaching.
  if (perDayExamples <= 0 || perDayPositives <= 0) return null;

  const daysNeeded = Math.max(
    need.examples > 0 ? need.examples / perDayExamples : 0,
    need.positives > 0 ? need.positives / perDayPositives : 0,
  );
  if (!Number.isFinite(daysNeeded)) return null;
  return new Date(today.getTime() + Math.ceil(daysNeeded) * 86_400_000);
}
