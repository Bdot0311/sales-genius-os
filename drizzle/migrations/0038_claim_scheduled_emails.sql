ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS send_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_attempted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sent_emails_claimable
  ON public.sent_emails (user_id, scheduled_at, id)
  WHERE status = 'scheduled';

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_emails(p_limit integer DEFAULT 20)
RETURNS SETOF public.sent_emails
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH tenants AS (
    SELECT DISTINCT c.user_id
      FROM public.sent_emails c
     WHERE c.status = 'scheduled'
       AND c.send_claimed_at IS NULL
       AND c.scheduled_at IS NOT NULL
       AND c.scheduled_at <= now()
  ),
  candidates AS (
    SELECT x.id,
           row_number() OVER (ORDER BY x.turn, x.scheduled_at, x.id) AS ord
      FROM tenants t
     CROSS JOIN LATERAL (
       SELECT c.id,
              c.scheduled_at,
              row_number() OVER (ORDER BY c.scheduled_at, c.id) AS turn
         FROM public.sent_emails c
        WHERE c.status = 'scheduled'
          AND c.send_claimed_at IS NULL
          AND c.scheduled_at IS NOT NULL
          AND c.scheduled_at <= now()
          AND c.user_id = t.user_id
        ORDER BY c.scheduled_at, c.id
        LIMIT GREATEST(p_limit, 1) * 4
     ) x
  ),
  locked AS (
    SELECT c.id
      FROM public.sent_emails c
      JOIN candidates cd ON cd.id = c.id
     WHERE c.status = 'scheduled'
       AND c.send_claimed_at IS NULL
     ORDER BY cd.ord
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE OF c SKIP LOCKED
  )
  UPDATE public.sent_emails e
     SET send_claimed_at = now()
   WHERE e.id IN (SELECT id FROM locked)
  RETURNING e.*;
$$;

REVOKE ALL ON FUNCTION public.claim_due_scheduled_emails(integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.begin_scheduled_email_send(p_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sent_emails e
     SET send_attempted_at = now()
   WHERE e.id = p_id
     AND e.status = 'scheduled'
     AND e.send_attempted_at IS NULL
  RETURNING e.id;
$$;

REVOKE ALL ON FUNCTION public.begin_scheduled_email_send(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_scheduled_email_claims(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  UPDATE public.sent_emails
     SET send_claimed_at = NULL
   WHERE id = ANY(p_ids)
     AND status = 'scheduled'
     AND send_claimed_at IS NOT NULL
     AND send_attempted_at IS NULL;
  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_scheduled_email_claims(uuid[]) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_stale_scheduled_email_claims()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  UPDATE public.sent_emails
     SET send_claimed_at = NULL
   WHERE status = 'scheduled'
     AND send_claimed_at < now() - interval '15 minutes'
     AND send_attempted_at IS NULL;
  GET DIAGNOSTICS released = ROW_COUNT;

  UPDATE public.sent_emails
     SET status = 'failed',
         error_message = COALESCE(
           error_message,
           'The send was interrupted and we could not confirm whether it went out. '
           || 'It was not retried, because a duplicate cannot be taken back. '
           || 'Check the recipient''s thread and resend if it did not arrive.'
         ),
         failed_at = now()
   WHERE status = 'scheduled'
     AND send_attempted_at IS NOT NULL
     AND send_attempted_at < now() - interval '15 minutes';

  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_scheduled_email_claims() FROM public, anon, authenticated;