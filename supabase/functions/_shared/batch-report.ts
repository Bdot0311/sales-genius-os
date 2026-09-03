/**
 * Telling the model what a batch tool did NOT do.
 *
 * A user asked the agent to send 32 emails. It sent 11 and reported that
 * everything had gone out — truthfully, from its own point of view, because the
 * tool had quietly fetched at most 20 rows and then deduplicated them down to
 * 11 before sending. The tool's note said "Sent 11 of 11". Both numbers were
 * correct. Neither was the number the user asked for.
 *
 * A batch tool that reports only on what it processed cannot be honest about a
 * request it never fully saw. So every batch here accounts for the whole
 * request: what was asked for, what was found, what was dropped and why, and
 * what actually happened — in a sentence the model has to repeat.
 */

export interface BatchAccounting {
  /** How many records the caller named. 0 when the call was "everything pending". */
  requested: number;
  /** How many the query actually returned. */
  found: number;
  /** Removed because another record already covered the same person. */
  deduped: number;
  /** Not fetched because the batch ceiling cut the query short. */
  overCeiling: number;
}

/** One tool call never touches more than this, whatever it was asked for. */
export const BATCH_CEILING = 100;

/**
 * How many rows to fetch.
 *
 * Explicit ids are honoured up to the ceiling rather than clipped to a fixed
 * page size — naming 32 drafts means 32, and silently returning 20 of them is
 * what produced the failure this module exists to prevent.
 */
export function batchFetchLimit(requestedCount: number): number {
  if (requestedCount <= 0) return BATCH_CEILING;
  return Math.min(requestedCount, BATCH_CEILING);
}

export function accountFor(
  requested: number,
  fetched: number,
  afterDedupe: number,
): BatchAccounting {
  const overCeiling = requested > 0 ? Math.max(0, requested - fetched) : 0;
  return {
    requested,
    found: fetched,
    deduped: Math.max(0, fetched - afterDedupe),
    overCeiling,
  };
}

/** True when fewer records were acted on than the caller named. */
export function isShortfall(a: BatchAccounting): boolean {
  return a.overCeiling > 0 || a.deduped > 0;
}

/**
 * The sentence the model must pass on.
 *
 * Written as an instruction rather than a statistic because a bare count gets
 * summarised away — "sent 11" reads as success. Naming the gap and telling the
 * model to report it is what stops "all of them went out".
 */
export function shortfallNote(a: BatchAccounting, verb: string, acted: number): string {
  if (!isShortfall(a)) return "";

  const parts: string[] = [];
  if (a.deduped > 0) {
    parts.push(
      `${a.deduped} were duplicates for someone already in this batch and were skipped — one email per person`,
    );
  }
  if (a.overCeiling > 0) {
    parts.push(
      `${a.overCeiling} could not be found or exceeded the ${BATCH_CEILING}-record limit for a single call`,
    );
  }

  return (
    `IMPORTANT — you were asked for ${a.requested} but only ${acted} ${verb}: ` +
    `${parts.join("; ")}. ` +
    `Tell the user this number plainly. Do NOT say all of them ${verb}.`
  );
}
