-- Single source of truth for per-plan monthly search credits inside the DB,
-- mirroring supabase/functions/_shared/plan-limits.ts. Plan changes previously
-- left search_credits_base at whatever it was (free's 100), so an agency
-- account was shown "of 100 search credits left".
CREATE OR REPLACE FUNCTION public.plan_search_credits(_plan public.subscription_plan)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _plan
    WHEN 'free' THEN 100
    WHEN 'starter' THEN 1000
    WHEN 'growth' THEN 2500
    WHEN 'pro' THEN 5000
    WHEN 'elite' THEN 5000
    WHEN 'agency' THEN 15000
    ELSE 100
  END;
$$;

GRANT EXECUTE ON FUNCTION public.plan_search_credits(public.subscription_plan) TO authenticated, service_role;

-- Keep the stored allowance in step with the plan on every plan change,
-- preserving how much the account has already consumed.
CREATE OR REPLACE FUNCTION public.sync_plan_credit_allowance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _new_base integer;
  _used integer;
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    _new_base := public.plan_search_credits(NEW.plan);
    -- Only realign when the row still carries the previous plan's allowance;
    -- an explicit allowance set in the same statement wins.
    IF NEW.search_credits_base IS NULL
       OR NEW.search_credits_base = COALESCE(OLD.search_credits_base, 0) THEN
      _used := GREATEST(COALESCE(OLD.search_credits_base, 0) - COALESCE(OLD.search_credits_remaining, 0), 0);
      NEW.search_credits_base := _new_base;
      NEW.search_credits_remaining := GREATEST(LEAST(_new_base - _used, _new_base), 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_plan_credit_allowance ON public.subscriptions;
CREATE TRIGGER sync_plan_credit_allowance
BEFORE UPDATE OF plan ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_plan_credit_allowance();