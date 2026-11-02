/**
 * Which detectors still owe this lead a signal.
 *
 * Research tops up signals for a lead that was never enriched, and the
 * decision about WHICH detectors to run is the part that went wrong. It was
 * one `.or()` asking whether any news-or-tech row existed, skipping both
 * detectors if either did. Two consequences:
 *
 *   - hiring was simply absent from the list, which is the highest-weighted
 *     signal of the three (30 for a GTM role against 18 for a tech change),
 *   - and appending it to that same list would not have fixed it: a lead with
 *     a news signal would still never have had its job board read.
 *
 * It lives here, as a function over the sources already on record, because the
 * version of this written inline could only be checked by grepping the file
 * for a variable name — and a grep passes just as happily on the shared-gate
 * version it was supposed to rule out. Behaviour is what needs pinning, so
 * behaviour is what this exposes.
 */

export interface BackfillDetector {
  /** Edge function to invoke. */
  fn: string;
  /** The `source` prefix this detector writes, e.g. `ats:greenhouse`. */
  prefix: string;
}

export const BACKFILL_DETECTORS: readonly BackfillDetector[] = [
  { fn: "detect-news-signals", prefix: "news:" },
  { fn: "detect-tech-signals", prefix: "tech:" },
  { fn: "detect-hiring-signals", prefix: "ats:" },
];

/** The PostgREST `.or()` filter that fetches only the sources that matter. */
export function backfillSourceFilter(
  detectors: readonly BackfillDetector[] = BACKFILL_DETECTORS,
): string {
  return detectors.map((d) => `source.ilike.${d.prefix}%`).join(",");
}

/**
 * The detectors with nothing on record for this lead.
 *
 * Each is judged on its own prefix. A lead that has news and nothing else gets
 * the tech and hiring checks, which is the case the previous shared gate got
 * wrong.
 */
export function detectorsToBackfill(
  sources: ReadonlyArray<string | null | undefined>,
  detectors: readonly BackfillDetector[] = BACKFILL_DETECTORS,
): BackfillDetector[] {
  const present = sources.filter((s): s is string => typeof s === "string" && s.length > 0);
  return detectors.filter((d) => !present.some((s) => s.startsWith(d.prefix)));
}
