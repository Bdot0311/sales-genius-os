CREATE OR REPLACE FUNCTION public.get_user_plan()
RETURNS TABLE(
  plan public.subscription_plan,
  has_automations boolean,
  has_ai_coach boolean,
  has_analytics boolean,
  has_api_access boolean,
  leads_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_plan public.subscription_plan;
BEGIN
  SELECT CASE
    WHEN s.status = 'active'
      AND (
        s.account_status IN ('active', 'admin')
        OR (
          s.account_status = 'trial'
          AND s.trial_end_date IS NOT NULL
          AND s.trial_end_date > now()
        )
      )
    THEN s.plan
    ELSE 'free'::public.subscription_plan
  END
  INTO user_plan
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid();

  IF user_plan IS NULL THEN
    user_plan := 'free'::public.subscription_plan;
  END IF;

  IF user_plan = 'elite' THEN
    user_plan := 'pro'::public.subscription_plan;
  END IF;

  RETURN QUERY SELECT
    user_plan,
    user_plan IN ('pro', 'agency'),
    user_plan IN ('starter', 'growth', 'pro', 'agency'),
    user_plan IN ('starter', 'growth', 'pro', 'agency'),
    user_plan IN ('pro', 'agency'),
    CASE
      WHEN user_plan = 'free' THEN 100
      WHEN user_plan = 'starter' THEN 1000
      WHEN user_plan = 'growth' THEN 2500
      WHEN user_plan = 'pro' THEN 5000
      WHEN user_plan = 'agency' THEN 15000
      ELSE 100
    END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_plan() TO authenticated, service_role;