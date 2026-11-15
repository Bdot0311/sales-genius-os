-- Replies were only found when somebody opened Inbox and clicked Sync,
-- or when an agent run happened to poll. sync-inboxes already existed and
-- already accepted the cron credential, and nothing scheduled it. A person
-- who replied kept receiving follow-ups, and the reply never reached the
-- inbox, until a human happened to look.
--
-- This is the clock. Every five minutes, off the dispatch minute, it asks
-- for the mailboxes that have been waiting longest and syncs a few of them.
-- One pass cannot cover every mailbox inside an edge function's time limit,
-- so the cursor is what stops the same first page being the only page.

CREATE TABLE IF NOT EXISTS public.inbox_sync_cursors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_inbox_sync_cursors_attempt
  ON public.inbox_sync_cursors (last_attempt_at NULLS FIRST);

CREATE TABLE IF NOT EXISTS public.inbox_sync_lock (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  locked_until timestamptz
);

INSERT INTO public.inbox_sync_lock (id, locked_until)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

-- The app may see its own cursor. It may not write one, and it may not see
-- the sweep lock. Service role does both. Authenticated SELECT is what the
-- health grant check requires; RLS is what keeps the rows private.
REVOKE ALL ON TABLE public.inbox_sync_cursors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inbox_sync_lock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inbox_sync_cursors TO authenticated;
GRANT SELECT ON TABLE public.inbox_sync_lock TO authenticated;
GRANT ALL ON TABLE public.inbox_sync_cursors TO service_role;
GRANT ALL ON TABLE public.inbox_sync_lock TO service_role;

ALTER TABLE public.inbox_sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_sync_lock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_sync_cursors_select_own" ON public.inbox_sync_cursors;
CREATE POLICY "inbox_sync_cursors_select_own"
  ON public.inbox_sync_cursors
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "inbox_sync_lock_no_customer_read" ON public.inbox_sync_lock;
CREATE POLICY "inbox_sync_lock_no_customer_read"
  ON public.inbox_sync_lock
  FOR SELECT
  TO authenticated
  USING (false);

CREATE INDEX IF NOT EXISTS idx_sent_emails_live_gmail_threads
  ON public.sent_emails (user_id, sent_at DESC)
  WHERE gmail_thread_id IS NOT NULL AND agent_thread_status = 'active';

CREATE INDEX IF NOT EXISTS idx_sent_emails_replied
  ON public.sent_emails (user_id, replied_at DESC)
  WHERE replied_at IS NOT NULL;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT v.table_name, v.column_name, v.note
FROM (VALUES
  ('inbox_sync_cursors', 'user_id', 'Whose mailbox the reply sweep last tried'),
  ('inbox_sync_cursors', 'last_attempt_at', 'Rotation key so the sweep does not repeat the same mailboxes'),
  ('inbox_sync_cursors', 'last_error', 'Last sync failure, shown when a mailbox stays disconnected'),
  ('inbox_sync_lock', 'locked_until', 'Lease that keeps two reply sweeps from running at once')
) AS v(table_name, column_name, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.schema_contract sc
  WHERE sc.table_name = v.table_name AND sc.column_name = v.column_name
);

CREATE OR REPLACE FUNCTION public.claim_inbox_sync_sweep(p_ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until timestamptz;
  v_ttl integer := greatest(30, least(coalesce(p_ttl_seconds, 180), 600));
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_inbox_sync_sweep is internal';
  END IF;

  SELECT locked_until INTO v_until
    FROM public.inbox_sync_lock
   WHERE id = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inbox_sync_lock (id, locked_until)
    VALUES (1, now() + make_interval(secs => v_ttl));
    RETURN true;
  END IF;

  IF v_until IS NOT NULL AND v_until > now() THEN
    RETURN false;
  END IF;

  UPDATE public.inbox_sync_lock
     SET locked_until = now() + make_interval(secs => v_ttl)
   WHERE id = 1;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_inbox_sync_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'release_inbox_sync_sweep is internal';
  END IF;

  UPDATE public.inbox_sync_lock SET locked_until = NULL WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_inbox_sync_users(p_limit integer)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'next_inbox_sync_users is internal';
  END IF;

  RETURN QUERY
  SELECT i.user_id
    FROM (
      SELECT DISTINCT g.user_id
        FROM public.integrations g
       WHERE g.integration_id = 'google'
         AND g.is_active
    ) i
    LEFT JOIN public.inbox_sync_cursors c ON c.user_id = i.user_id
   WHERE EXISTS (
     SELECT 1
       FROM public.sent_emails s
      WHERE s.user_id = i.user_id
        AND s.gmail_thread_id IS NOT NULL
        AND s.agent_thread_status = 'active'
        AND s.sent_at >= now() - interval '30 days'
   )
   ORDER BY c.last_attempt_at NULLS FIRST, i.user_id
   LIMIT greatest(1, least(coalesce(p_limit, 40), 40));
END;
$$;

CREATE OR REPLACE FUNCTION public.note_inbox_sync_started(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'note_inbox_sync_started is internal';
  END IF;
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.inbox_sync_cursors (user_id, last_attempt_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO UPDATE SET last_attempt_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.record_inbox_sync_result(p_user_id uuid, p_error text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failures integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'record_inbox_sync_result is internal';
  END IF;
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_error IS NULL OR length(btrim(p_error)) = 0 THEN
    UPDATE public.inbox_sync_cursors
       SET last_success_at = now(),
           last_error = NULL,
           consecutive_failures = 0
     WHERE user_id = p_user_id
    RETURNING consecutive_failures INTO v_failures;
  ELSE
    UPDATE public.inbox_sync_cursors
       SET last_error = left(p_error, 500),
           consecutive_failures = consecutive_failures + 1
     WHERE user_id = p_user_id
    RETURNING consecutive_failures INTO v_failures;
  END IF;

  RETURN coalesce(v_failures, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_inbox_sync_sweep(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_inbox_sync_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_inbox_sync_users(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.note_inbox_sync_started(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_inbox_sync_result(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inbox_sync_sweep(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inbox_sync_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.next_inbox_sync_users(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.note_inbox_sync_started(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_inbox_sync_result(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_inbox_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_url text;
  config_key text;
BEGIN
  SELECT setting_value->>'supabase_url' INTO config_url
    FROM admin_settings
   WHERE setting_key = 'supabase_config';
  config_key := public.internal_job_key();
  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_inbox_sync: edge credentials missing; skipped';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := config_url || '/functions/v1/sync-inboxes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || config_key
    ),
    body := '{"scheduled": true}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_inbox_sync() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-inboxes');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'sync-inboxes',
    '2-57/5 * * * *',
    $cmd$ SELECT public.trigger_inbox_sync(); $cmd$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync-inboxes not scheduled: %', SQLERRM;
END;
$$;
