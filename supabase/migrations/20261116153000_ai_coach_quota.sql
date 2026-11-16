-- Coach quota is a reservation, not a model call.
--
-- ai-coach used to count coaching_messages, then insert an ai_usage_events row
-- with a fake model before the provider returned. That row was not a generation:
-- it polluted cost metering, and the source scanner that checks which tier a
-- call asks for treated `model` as a model choice. Two requests could also both
-- read "under the limit" and both insert, and a failed provider call left the
-- row in place so the customer lost a message they never received.
--
-- This table is the reservation. claim_ai_coach_message locks the user, counts
-- what already counts, and inserts in that same transaction. A held row counts
-- for a few minutes so a crash cannot be retried in parallel past the cap. A
-- consumed row counts for the rest of the month. A released row does not.
-- Customer roles cannot insert, update, or delete the rows, so they cannot
-- reset the month by forging or removing them.

CREATE TABLE IF NOT EXISTS public.ai_coach_quota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'consumed', 'released')),
  -- The user message this reservation already represents. Kept on release so a
  -- failed reply does not fall back to counting that message. Not a foreign key:
  -- deleting the conversation must not delete the usage.
  message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_coach_quota_user_period_idx
  ON public.ai_coach_quota (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ai_coach_quota_message_uidx
  ON public.ai_coach_quota (message_id)
  WHERE message_id IS NOT NULL;

ALTER TABLE public.ai_coach_quota ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_coach_quota FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_coach_quota TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_coach_message(
  p_user_id uuid,
  p_period_start timestamptz,
  p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_cover uuid;
  v_messages bigint;
  v_active bigint;
  v_used bigint;
  v_id uuid;
BEGIN
  -- Planned only when the function exists. A local test database has no
  -- auth.role(), and naming it in this body would fail there.
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'claim_ai_coach_message is internal';
    END IF;
  END IF;

  IF p_user_id IS NULL OR p_period_start IS NULL THEN
    RETURN jsonb_build_object('id', NULL, 'allowed', false, 'used', 0);
  END IF;

  -- One lock per customer. Concurrent coach calls wait, then see this insert.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-coach:' || p_user_id::text, 0));

  -- The coach page saves the user message, then calls. That row is this
  -- request, not an earlier one. Only the newest message from the last two
  -- minutes qualifies, so an older saved message cannot be dropped to slip
  -- under the cap. Direct callers have no such row and are counted by the
  -- reservation alone.
  SELECT m.id
    INTO v_cover
    FROM public.coaching_messages m
   WHERE m.user_id = p_user_id
     AND m.role = 'user'
     AND m.created_at >= p_period_start
     AND m.created_at >= now() - interval '2 minutes'
     AND NOT EXISTS (
       SELECT 1
         FROM public.ai_coach_quota q
        WHERE q.user_id = p_user_id
          AND q.message_id = m.id
     )
   ORDER BY m.created_at DESC
   LIMIT 1;

  -- Messages with no reservation are usage from before this ledger, or a
  -- message this call is not covering. Reservations that already point at a
  -- message are the same request and are not added twice.
  SELECT count(*)
    INTO v_messages
    FROM public.coaching_messages m
   WHERE m.user_id = p_user_id
     AND m.role = 'user'
     AND m.created_at >= p_period_start
     AND (v_cover IS NULL OR m.id <> v_cover)
     AND NOT EXISTS (
       SELECT 1
         FROM public.ai_coach_quota q
        WHERE q.user_id = p_user_id
          AND q.message_id = m.id
     );

  -- Released rows are failed calls. A held row older than the provider timeout
  -- is a crash, not a call still in flight, so it stops counting.
  SELECT count(*)
    INTO v_active
    FROM public.ai_coach_quota q
   WHERE q.user_id = p_user_id
     AND q.created_at >= p_period_start
     AND (
       q.status = 'consumed'
       OR (q.status = 'held' AND q.created_at >= now() - interval '3 minutes')
     );

  v_used := v_messages + v_active;

  -- Null and non-positive limits fail closed. Negative means unlimited
  -- (the agency plan). The row is still inserted so a later downgrade sees it.
  IF coalesce(p_limit, 0) >= 0 AND v_used >= coalesce(p_limit, 0) THEN
    RETURN jsonb_build_object('id', NULL, 'allowed', false, 'used', v_used);
  END IF;

  INSERT INTO public.ai_coach_quota (user_id, status, message_id)
  VALUES (p_user_id, 'held', v_cover)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'allowed', true, 'used', v_used);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_coach_message(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_coach_message(uuid, timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_coach_message(
  p_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'consume_ai_coach_message is internal';
    END IF;
  END IF;

  UPDATE public.ai_coach_quota
     SET status = 'consumed'
   WHERE id = p_id
     AND user_id = p_user_id
     AND status = 'held'
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_coach_message(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_coach_message(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_ai_coach_message(
  p_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'release_ai_coach_message is internal';
    END IF;
  END IF;

  -- Held only. A consumed reply must not be handed back, and the message link
  -- stays so the saved user message does not start counting in its place.
  UPDATE public.ai_coach_quota
     SET status = 'released'
   WHERE id = p_id
     AND user_id = p_user_id
     AND status = 'held'
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_ai_coach_message(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_coach_message(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF to_regclass('public.schema_contract') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.schema_contract (table_name, column_name, note)
  SELECT v.table_name, v.column_name, v.note
  FROM (VALUES
    ('ai_coach_quota', 'user_id', 'Whose monthly coach quota this reservation counts against'),
    ('ai_coach_quota', 'status', 'held counts briefly, consumed counts for the month, released does not'),
    ('ai_coach_quota', 'message_id', 'Coach message this reservation already covers, so it is not counted twice'),
    ('ai_coach_quota', 'created_at', 'Month boundary for the reservation')
  ) AS v(table_name, column_name, note)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.schema_contract sc
    WHERE sc.table_name = v.table_name AND sc.column_name = v.column_name
  );
END $$;

-- Private on purpose. The grant check treats a table customers cannot read as
-- an outage unless it is named here, and it still fails if the service role
-- loses write access or a customer role gains it. Same list the credit ledger
-- and the visitor jobs already use, plus this table.
DO $health$
DECLARE
  definition text;
  with_quota text := 'c.relname IN (''stripe_credit_grants'', ''outbound_gate_canary'', ''visitor_resolve_jobs'', ''visitor_network_cache'', ''visitor_ip_cache'', ''ai_coach_quota'')';
BEGIN
  IF to_regprocedure('public._system_health_checks()') IS NULL THEN
    RETURN;
  END IF;
  definition := pg_get_functiondef('public._system_health_checks()'::regprocedure);
  IF position('ai_coach_quota' IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position('c.relname IN (''stripe_credit_grants'', ''outbound_gate_canary'', ''visitor_resolve_jobs'', ''visitor_network_cache'', ''visitor_ip_cache'')' IN definition) > 0 THEN
    definition := replace(
      definition,
      'c.relname IN (''stripe_credit_grants'', ''outbound_gate_canary'', ''visitor_resolve_jobs'', ''visitor_network_cache'', ''visitor_ip_cache'')',
      with_quota
    );
  ELSIF position('c.relname IN (''stripe_credit_grants'', ''outbound_gate_canary'')' IN definition) > 0 THEN
    definition := replace(
      definition,
      'c.relname IN (''stripe_credit_grants'', ''outbound_gate_canary'')',
      with_quota
    );
  ELSIF position('c.relname = ''stripe_credit_grants''' IN definition) > 0 THEN
    definition := replace(definition, 'c.relname = ''stripe_credit_grants''', with_quota);
  ELSE
    RAISE EXCEPTION 'Health predicate changed; refusing to leave ai_coach_quota as a false outage';
  END IF;
  EXECUTE definition;
END;
$health$;

DO $regression$
DECLARE
  report jsonb;
  quota oid;
BEGIN
  IF to_regclass('public.ai_coach_quota') IS NULL THEN
    RAISE EXCEPTION 'Regression: coach quota table missing';
  END IF;
  quota := 'public.ai_coach_quota'::regclass;
  IF has_any_column_privilege('authenticated', quota, 'SELECT,INSERT,UPDATE')
     OR has_table_privilege('authenticated', quota, 'DELETE')
     OR has_any_column_privilege('anon', quota, 'SELECT,INSERT,UPDATE')
     OR has_table_privilege('anon', quota, 'DELETE') THEN
    RAISE EXCEPTION 'Regression: customer roles can access the coach quota ledger';
  END IF;
  IF NOT has_table_privilege('service_role', quota, 'SELECT')
     OR NOT has_table_privilege('service_role', quota, 'INSERT')
     OR NOT has_table_privilege('service_role', quota, 'UPDATE')
     OR NOT has_table_privilege('service_role', quota, 'DELETE') THEN
    RAISE EXCEPTION 'Regression: service role cannot maintain the coach quota ledger';
  END IF;
  IF to_regprocedure('public._system_health_checks()') IS NULL THEN
    RETURN;
  END IF;
  report := public._system_health_checks();
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(report->'checks') c
    WHERE c->>'id' = 'api_grants'
      AND c->>'status' = 'fail'
      AND c->>'detail' LIKE '%ai_coach_quota%'
  ) THEN
    RAISE EXCEPTION 'Regression: private coach quota triggers a false outage';
  END IF;
END;
$regression$;
