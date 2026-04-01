
-- Update log_team_activity function to check for 'pro' instead of 'elite'
CREATE OR REPLACE FUNCTION public.log_team_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  team_owner uuid;
  action_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'updated';
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'deleted';
  END IF;

  SELECT user_id INTO team_owner
  FROM subscriptions
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
  AND plan IN ('pro', 'elite')
  LIMIT 1;

  IF team_owner IS NOT NULL THEN
    INSERT INTO team_activity_log (
      team_owner_id,
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      team_owner,
      COALESCE(NEW.user_id, OLD.user_id),
      action_type,
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      CASE
        WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
        ELSE to_jsonb(NEW)
      END
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Update feature_flags default to remove 'elite'
ALTER TABLE public.feature_flags ALTER COLUMN target_plans SET DEFAULT ARRAY['growth'::text, 'pro'::text];

-- Update existing feature_flags rows that have 'elite' in target_plans
UPDATE public.feature_flags 
SET target_plans = array_remove(target_plans, 'elite') 
WHERE 'elite' = ANY(target_plans);

-- Rename RLS policies that reference "Elite" to "Pro"
-- webhook_deliveries
ALTER POLICY "Elite users can view own webhook deliveries" ON public.webhook_deliveries RENAME TO "Pro users can view own webhook deliveries";

-- webhooks
ALTER POLICY "Elite users can create own webhooks" ON public.webhooks RENAME TO "Pro users can create own webhooks";
ALTER POLICY "Elite users can delete own webhooks" ON public.webhooks RENAME TO "Pro users can delete own webhooks";
ALTER POLICY "Elite users can update own webhooks" ON public.webhooks RENAME TO "Pro users can update own webhooks";
ALTER POLICY "Elite users can view own webhooks" ON public.webhooks RENAME TO "Pro users can view own webhooks";

-- api_versions
ALTER POLICY "Elite users can create own API versions" ON public.api_versions RENAME TO "Pro users can create own API versions";
ALTER POLICY "Elite users can delete own API versions" ON public.api_versions RENAME TO "Pro users can delete own API versions";
ALTER POLICY "Elite users can update own API versions" ON public.api_versions RENAME TO "Pro users can update own API versions";
ALTER POLICY "Elite users can view own API versions" ON public.api_versions RENAME TO "Pro users can view own API versions";

-- rate_limit_buckets
ALTER POLICY "Elite users can view own rate limit buckets" ON public.rate_limit_buckets RENAME TO "Pro users can view own rate limit buckets";

-- api_usage_log
ALTER POLICY "Elite users can view own API usage" ON public.api_usage_log RENAME TO "Pro users can view own API usage";

-- webhook_tests
ALTER POLICY "Elite users can create webhook tests" ON public.webhook_tests RENAME TO "Pro users can create webhook tests";
ALTER POLICY "Elite users can delete webhook tests" ON public.webhook_tests RENAME TO "Pro users can delete webhook tests";
ALTER POLICY "Elite users can update own webhook tests" ON public.webhook_tests RENAME TO "Pro users can update own webhook tests";
ALTER POLICY "Elite users can view own webhook tests" ON public.webhook_tests RENAME TO "Pro users can view own webhook tests";

-- white_label_settings
ALTER POLICY "Elite users can create own white label settings" ON public.white_label_settings RENAME TO "Pro users can create own white label settings";
ALTER POLICY "Elite users can update own white label settings" ON public.white_label_settings RENAME TO "Pro users can update own white label settings";
ALTER POLICY "Elite users can view own white label settings" ON public.white_label_settings RENAME TO "Pro users can view own white label settings";

-- Migrate any remaining 'elite' subscriptions to 'pro'
UPDATE public.subscriptions SET plan = 'pro' WHERE plan = 'elite';
