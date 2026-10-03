-- Effective plan for any user (service-side lookup; mirrors get_user_plan).
CREATE OR REPLACE FUNCTION public.plan_for_user(_user_id uuid)
RETURNS public.subscription_plan
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN s.status = 'active' AND (
        s.account_status IN ('active','admin')
        OR (s.account_status = 'trial' AND s.trial_end_date IS NOT NULL AND s.trial_end_date > now())
      ) THEN CASE WHEN s.plan = 'elite' THEN 'pro'::public.subscription_plan ELSE s.plan END
      ELSE 'free'::public.subscription_plan
    END
    FROM public.subscriptions s WHERE s.user_id = _user_id LIMIT 1
  ), 'free'::public.subscription_plan)
$$;
REVOKE EXECUTE ON FUNCTION public.plan_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_for_user(uuid) TO service_role;

-- Single source of truth for API + MCP rate limits per tier. Free = no access.
CREATE OR REPLACE FUNCTION public.api_tier_limits(_plan public.subscription_plan)
RETURNS TABLE(per_minute integer, per_day integer)
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT * FROM (VALUES
    (CASE _plan WHEN 'starter' THEN 30 WHEN 'growth' THEN 60 WHEN 'pro' THEN 120 WHEN 'elite' THEN 120 WHEN 'agency' THEN 300 ELSE 0 END,
     CASE _plan WHEN 'starter' THEN 2000 WHEN 'growth' THEN 10000 WHEN 'pro' THEN 50000 WHEN 'elite' THEN 50000 WHEN 'agency' THEN 200000 ELSE 0 END)
  ) v(per_minute, per_day)
$$;
GRANT EXECUTE ON FUNCTION public.api_tier_limits(public.subscription_plan) TO authenticated, service_role;

-- MCP call log used for per-tier rate limiting.
CREATE TABLE IF NOT EXISTS public.mcp_call_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  tool text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_call_log TO authenticated;
GRANT ALL ON public.mcp_call_log TO service_role;
ALTER TABLE public.mcp_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own MCP calls" ON public.mcp_call_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS mcp_call_log_user_time_idx ON public.mcp_call_log (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.mcp_consume_call(_tool text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _plan public.subscription_plan;
  _min int; _day int; _used_min int; _used_day int;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Not authenticated');
  END IF;
  _plan := public.plan_for_user(_uid);
  SELECT per_minute, per_day INTO _min, _day FROM public.api_tier_limits(_plan);
  IF COALESCE(_min, 0) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'plan', _plan,
      'reason', 'MCP access is included on Starter and above. Upgrade your OutReign plan to connect AI assistants.');
  END IF;
  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 minute'), count(*)
    INTO _used_min, _used_day
    FROM public.mcp_call_log WHERE user_id = _uid AND created_at > now() - interval '1 day';
  IF _used_min >= _min THEN
    RETURN jsonb_build_object('allowed', false, 'plan', _plan,
      'reason', format('Rate limit reached: your plan allows %s MCP calls per minute. Try again in a minute.', _min));
  END IF;
  IF _used_day >= _day THEN
    RETURN jsonb_build_object('allowed', false, 'plan', _plan,
      'reason', format('Daily limit reached: your plan allows %s MCP calls per day.', _day));
  END IF;
  INSERT INTO public.mcp_call_log (user_id, tool) VALUES (_uid, left(COALESCE(_tool, 'unknown'), 80));
  DELETE FROM public.mcp_call_log WHERE user_id = _uid AND created_at < now() - interval '2 days';
  RETURN jsonb_build_object('allowed', true, 'plan', _plan,
    'remaining_minute', _min - _used_min - 1, 'remaining_day', _day - _used_day - 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mcp_consume_call(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_consume_call(text) TO authenticated, service_role;

-- API access now included on every paid tier.
CREATE OR REPLACE FUNCTION public.get_user_plan()
RETURNS TABLE(plan public.subscription_plan, has_automations boolean, has_ai_coach boolean, has_analytics boolean, has_api_access boolean, leads_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE user_plan public.subscription_plan;
BEGIN
  user_plan := public.plan_for_user(auth.uid());
  RETURN QUERY SELECT
    user_plan,
    user_plan IN ('pro','agency'),
    user_plan IN ('starter','growth','pro','agency'),
    user_plan IN ('starter','growth','pro','agency'),
    user_plan IN ('starter','growth','pro','agency'),
    CASE user_plan WHEN 'free' THEN 100 WHEN 'starter' THEN 1000 WHEN 'growth' THEN 2500 WHEN 'pro' THEN 5000 WHEN 'agency' THEN 15000 ELSE 100 END;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_user_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_plan() TO authenticated, service_role;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('mcp_call_log', 'created_at', 'Per-tier MCP rate limiting')
ON CONFLICT (table_name, column_name) DO UPDATE SET note = EXCLUDED.note;