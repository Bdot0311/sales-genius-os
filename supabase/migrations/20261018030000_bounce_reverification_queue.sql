/*
 * Re-verification work that a busy run skipped was lost, not deferred.
 *
 * sync-bounces marks the send 'bounced' as it goes, and the next run only
 * looks at sends that are NOT bounced. So anything the wall-clock budget or
 * the per-run ceiling skipped was never revisited: the bounce was recorded,
 * the allowance was refunded, and the address it was supposed to teach us
 * about stayed exactly as wrong as before. A queue that silently drops its
 * remainder is the same defect as the agent-job remainder that was being
 * reported as "skipped — ran out of time" and then existing nowhere.
 *
 * bounce_events already has one row per bounce, with the address, the type
 * and the code. It is the queue; it was just missing somewhere to record that
 * the work is done.
 */

ALTER TABLE public.bounce_events
  -- When the address was re-checked because of this bounce. NULL means the
  -- work is still owed, which is what the next run picks up.
  ADD COLUMN IF NOT EXISTS reverified_at timestamptz;

/*
 * The sweep's access path: one user's outstanding bounces, oldest first.
 *
 * Partial, so the index stays the size of the backlog rather than the size of
 * every bounce ever recorded — which on a mature account is most of them.
 */
ALTER TABLE public.bounce_events
  /*
   * When the re-check was last tried, whatever came of it.
   *
   * A verdict of 'unknown' proves nothing, so the row stays queued — and a
   * queue ordered only by detection date then hands the same unanswerable
   * addresses the whole budget on every run while everything behind them
   * waits for ever. Stamping every attempt lets the sweep take what it has
   * not tried recently, so one address that cannot be resolved cannot starve
   * the rest.
   */
  ADD COLUMN IF NOT EXISTS reverification_attempted_at timestamptz;

/*
 * The sweep's access path: never-tried first, then least-recently-tried.
 *
 * NULLS FIRST on the attempt column is the fairness: a bounce nobody has
 * looked at outranks one that has already had its turn, however old.
 */
CREATE INDEX IF NOT EXISTS idx_bounce_events_awaiting_reverification
  ON public.bounce_events (user_id, reverification_attempted_at NULLS FIRST, detected_at)
  WHERE reverified_at IS NULL;
