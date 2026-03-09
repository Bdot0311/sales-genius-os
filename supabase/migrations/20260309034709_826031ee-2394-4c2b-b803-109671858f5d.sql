-- Add 'starter' to the subscription_plan enum
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'starter' BEFORE 'growth';

-- Update get_user_plan to include starter tier
CREATE OR REPLACE FUNCTION public.get_user_plan()
 RETURNS TABLE(plan subscription_plan, has_automations boolean, has_ai_coach boolean, has_analytics boolean, has_api_access boolean, leads_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_plan subscription_plan;
BEGIN
  SELECT s.plan INTO user_plan
  FROM subscriptions s
  WHERE s.user_id = auth.uid()
  AND s.status = 'active';
  
  IF user_plan IS NULL THEN
    user_plan := 'free';
  END IF;
  
  RETURN QUERY
  SELECT 
    user_plan,
    user_plan IN ('pro', 'elite') AS has_automations,
    user_plan IN ('starter', 'growth', 'pro', 'elite') AS has_ai_coach,
    user_plan IN ('starter', 'growth', 'pro', 'elite') AS has_analytics,
    user_plan = 'elite' AS has_api_access,
    CASE 
      WHEN user_plan = 'free' THEN 0
      WHEN user_plan = 'starter' THEN 400
      WHEN user_plan = 'growth' THEN 1200
      WHEN user_plan = 'pro' THEN 3000
      ELSE 999999
    END AS leads_limit;
END;
$function$;