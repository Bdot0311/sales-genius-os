/*
 * The idempotency key on nine platform emails had a clock in it.
 *
 *     idempotencyKey: `sub-confirm-${email}-${Date.now()}`
 *
 * An idempotency key exists so that the same send, attempted twice, arrives
 * once. A key that includes the current millisecond is different on every
 * attempt, so it can never match a previous one. Nine call sites were passing
 * one, which is the appearance of at-most-once delivery with none of it.
 *
 * It is reachable without anything going wrong. The subscription confirmation
 * is invoked from the Confirmation page's effect, guarded by a React ref that
 * only lives as long as the mounted component: reload the page after the
 * Stripe redirect, or open the link in a second tab, and the customer gets
 * another "Subscription Confirmed!" email. The error and critical alerts are
 * worse in a quieter way — a condition that keeps firing mails the support
 * inbox every time it fires, and an alert inbox nobody can read is an alert
 * inbox nobody reads.
 *
 * ── Why a column and not just a better key ─────────────────────────────
 *
 * Fixing the keys to be stable leaves the guarantee resting entirely on the
 * email provider's own dedupe window, which this codebase cannot see, cannot
 * test and does not control. `dedupe_key` puts the primary check somewhere
 * verifiable: `email_send_log` already records every send, so a keyed send
 * looks for its own key there first and skips if it finds one.
 *
 * The unique index is what makes it hold under a race. Two simultaneous
 * renders can both find nothing and both send — the provider's key is the
 * layer that catches that one — but only one of them can record the send, so
 * the log never grows two rows claiming the same key.
 */

ALTER TABLE public.email_send_log
  -- The caller's idempotency key, recorded so a later send with the same key
  -- can find it. NULL means the caller wanted a fresh send every time, which
  -- is correct for a password reset someone asked to be resent.
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_dedupe_key
  ON public.email_send_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
