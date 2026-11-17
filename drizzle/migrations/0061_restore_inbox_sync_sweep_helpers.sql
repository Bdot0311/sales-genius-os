CREATE TABLE IF NOT EXISTS public.inbox_sync_cursors (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0
);
REVOKE ALL ON TABLE public.inbox_sync_cursors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inbox_sync_cursors TO authenticated;
GRANT ALL ON TABLE public.inbox_sync_cursors TO service_role;
ALTER TABLE public.inbox_sync_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY inbox_sync_cursors_select_own ON public.inbox_sync_cursors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_sync_cursors_attempt ON public.inbox_sync_cursors (last_attempt_at NULLS FIRST);

CREATE TABLE IF NOT EXISTS public.inbox_sync_lock (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  locked_until timestamptz
);
REVOKE ALL ON TABLE public.inbox_sync_lock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inbox_sync_lock TO authenticated;
GRANT ALL ON TABLE public.inbox_sync_lock TO service_role;
ALTER TABLE public.inbox_sync_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY inbox_sync_lock_no_customer_read ON public.inbox_sync_lock FOR SELECT TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.claim_inbox_sync_sweep(p_ttl_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_until timestamptz;
  v_ttl integer := greatest(30, least(coalesce(p_ttl_seconds, 180), 600));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'claim_inbox_sync_sweep is internal'; END IF;
  INSERT INTO public.inbox_sync_lock (id, locked_until) VALUES (1, NULL) ON CONFLICT (id) DO NOTHING;
  SELECT locked_until INTO v_until FROM public.inbox_sync_lock WHERE id = 1 FOR UPDATE;
  IF v_until IS NOT NULL AND v_until > now() THEN RETURN false; END IF;
  UPDATE public.inbox_sync_lock SET locked_until = now() + make_interval(secs => v_ttl) WHERE id = 1;
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.release_inbox_sync_sweep()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'release_inbox_sync_sweep is internal'; END IF;
  UPDATE public.inbox_sync_lock SET locked_until = NULL WHERE id = 1;
END;
$$;
CREATE OR REPLACE FUNCTION public.next_inbox_sync_users(p_limit integer)
RETURNS TABLE (user_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'next_inbox_sync_users is internal'; END IF;
  RETURN QUERY
  SELECT i.user_id FROM (
    SELECT DISTINCT g.user_id FROM public.integrations g WHERE g.integration_id = 'google' AND g.is_active
  ) i LEFT JOIN public.inbox_sync_cursors c ON c.user_id = i.user_id
  WHERE EXISTS (
    SELECT 1 FROM public.sent_emails s WHERE s.user_id = i.user_id AND s.gmail_thread_id IS NOT NULL
      AND s.agent_thread_status = 'active' AND s.sent_at >= now() - interval '30 days'
  )
  ORDER BY c.last_attempt_at NULLS FIRST, i.user_id
  LIMIT greatest(1, least(coalesce(p_limit, 40), 40));
END;
$$;
CREATE OR REPLACE FUNCTION public.note_inbox_sync_started(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'note_inbox_sync_started is internal'; END IF;
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.inbox_sync_cursors (user_id, last_attempt_at) VALUES (p_user_id, now())
    ON CONFLICT (user_id) DO UPDATE SET last_attempt_at = now();
END;
$$;
CREATE OR REPLACE FUNCTION public.record_inbox_sync_result(p_user_id uuid, p_error text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_failures integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'record_inbox_sync_result is internal'; END IF;
  IF p_user_id IS NULL THEN RETURN 0; END IF;
  IF p_error IS NULL OR length(btrim(p_error)) = 0 THEN
    UPDATE public.inbox_sync_cursors SET last_success_at = now(), last_error = NULL, consecutive_failures = 0
      WHERE user_id = p_user_id RETURNING consecutive_failures INTO v_failures;
  ELSE
    UPDATE public.inbox_sync_cursors SET last_error = left(p_error, 500), consecutive_failures = consecutive_failures + 1
      WHERE user_id = p_user_id RETURNING consecutive_failures INTO v_failures;
  END IF;
  RETURN coalesce(v_failures, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_inbox_sync_sweep(integer), public.release_inbox_sync_sweep(), public.next_inbox_sync_users(integer), public.note_inbox_sync_started(uuid), public.record_inbox_sync_result(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inbox_sync_sweep(integer), public.release_inbox_sync_sweep(), public.next_inbox_sync_users(integer), public.note_inbox_sync_started(uuid), public.record_inbox_sync_result(uuid, text) TO service_role;
COMMENT ON TABLE public.inbox_sync_cursors IS 'Automatic reply-check rotation and outcomes, registered in public.schema_contract.';
COMMENT ON TABLE public.inbox_sync_lock IS 'Private lease preventing simultaneous automatic reply sweeps, registered in public.schema_contract.';
NOTIFY pgrst, 'reload schema';