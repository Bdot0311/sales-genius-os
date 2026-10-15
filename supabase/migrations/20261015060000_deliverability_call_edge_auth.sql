-- Three more scheduled jobs have been answering 401, and one of them is warmup.
--
-- deliverability_call_edge is the helper three cron jobs go through:
--
--   compute-reputation-daily          05:05
--   deliverability-alerts-scan-daily  06:15
--   warmup-orchestrator-hourly        every hour
--
-- It signs them with deliverability_settings.anon_key, and that row really
-- does hold the anon key — the seed in 20260717232146 inserts a JWT whose
-- payload reads "role":"anon". The three functions it calls are the correct
-- side of this: they use the shared guards in _shared/internal-auth.ts.
--
--   compute-reputation          requireServiceRole    service key or INTERNAL_TRIGGER_SECRET
--   deliverability-alerts-scan  requireServiceRole    same
--   warmup-orchestrator         requireInternalOrUser internal, else a real signed-in user
--
-- The anon key is none of those. requireServiceRole compares it against two
-- secrets and matches neither; requireInternalOrUser then asks /auth/v1/user
-- who the bearer is, and an anon JWT carries no user. So every call this
-- helper has ever made was rejected at the door.
--
-- Reputation has not been recomputed, deliverability alerts have not been
-- scanned, and mailbox warmup — the thing that earns a sending domain the
-- right to send volume — has never run. None of it is visible from inside the
-- product: pg_cron records the POST as sent and the 401 is just the response
-- body.
--
-- The helper now signs with the same vault secret as every job that works.
-- internal_trigger_secret is the honest name created one migration earlier;
-- the fallback to the old name keeps this working if that migration is ever
-- applied out of order.

CREATE OR REPLACE FUNCTION public.deliverability_call_edge(p_function_name text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_url FROM public.deliverability_settings WHERE key = 'supabase_url';

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'internal_trigger_secret'
  LIMIT 1;

  IF v_key IS NULL THEN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key'
    LIMIT 1;
  END IF;

  -- Loud rather than a null Authorization header, which reads downstream as
  -- the function being broken rather than the call being unsigned.
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'deliverability_call_edge: url or signing secret missing; % not called', p_function_name;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_payload
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deliverability_call_edge(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.deliverability_call_edge(text, jsonb) TO service_role;

COMMENT ON FUNCTION public.deliverability_call_edge(text, jsonb) IS
  'Calls a deliverability edge function from the database, signed with the internal_trigger_secret vault secret. Signed with deliverability_settings.anon_key until 2026-10-15, which every target rejected.';

-- The anon key is no longer a credential this helper uses. Left in the table
-- rather than deleted: it is the publishable key, it is not a secret, and
-- something else may read the row.
COMMENT ON TABLE public.deliverability_settings IS
  'Deliverability config. The anon_key row is no longer used for signing internal calls — see deliverability_call_edge.';
