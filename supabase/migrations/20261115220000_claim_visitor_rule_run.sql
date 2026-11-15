-- A resolve batch runs several jobs at once, and one job walks every matching
-- rule. Each used to count visitor_rule_runs and then insert. Jobs in the same
-- batch read the same number, and a second rule in the same job never saw the
-- row the first rule had just written. Both then spent search, enrich,
-- research and draft credits past the daily caps.
--
-- The locks are taken before the count, user then rule, and the 'running' row
-- is inserted in that same transaction. The next caller waits, then sees it.
-- Skipped rows do not count. 25 is the hard ceiling in visitor-automation.ts.

CREATE OR REPLACE FUNCTION public.claim_visitor_rule_run(
  p_user_id uuid,
  p_rule_id uuid,
  p_match_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_cap integer;
  v_rule_runs bigint;
  v_workspace_runs bigint;
  v_role text;
BEGIN
  -- Planned only when the function exists. A local test database has no
  -- auth.role(), and naming it in this body would fail there.
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'claim_visitor_rule_run is internal';
    END IF;
  END IF;
  IF p_user_id IS NULL OR p_rule_id IS NULL OR p_match_id IS NULL THEN
    RETURN false;
  END IF;

  -- User first, then the rule. Every caller takes them in this order.
  PERFORM pg_advisory_xact_lock(hashtextextended('visitor-workspace:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('visitor-rule:' || p_rule_id::text, 0));

  SELECT user_id, daily_cap
    INTO v_owner, v_cap
    FROM public.visitor_rules
   WHERE id = p_rule_id
     AND enabled IS TRUE;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RETURN false;
  END IF;
  v_cap := least(greatest(coalesce(v_cap, 5), 1), 25);

  IF EXISTS (
    SELECT 1
      FROM public.visitor_rule_runs
     WHERE rule_id = p_rule_id
       AND match_id = p_match_id
  ) THEN
    RETURN false;
  END IF;

  SELECT count(*)
    INTO v_workspace_runs
    FROM public.visitor_rule_runs
   WHERE user_id = p_user_id
     AND created_at >= now() - interval '24 hours'
     AND status IN ('running', 'completed', 'failed');

  SELECT count(*)
    INTO v_rule_runs
    FROM public.visitor_rule_runs
   WHERE rule_id = p_rule_id
     AND created_at >= now() - interval '24 hours'
     AND status IN ('running', 'completed', 'failed');

  IF v_workspace_runs >= 25 OR v_rule_runs >= v_cap THEN
    RETURN false;
  END IF;

  INSERT INTO public.visitor_rule_runs (rule_id, match_id, user_id, status)
  VALUES (p_rule_id, p_match_id, p_user_id, 'running');
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_visitor_rule_run(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_visitor_rule_run(uuid, uuid, uuid) TO service_role;
