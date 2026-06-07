
-- =========================================================
-- 1. RLS HARDENING
-- =========================================================

-- system_events: deny client inserts
DROP POLICY IF EXISTS "Service role can insert system events" ON public.system_events;
CREATE POLICY "Only service role can insert system events"
  ON public.system_events FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Deny client writes to system_events"
  ON public.system_events AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- subscriptions: remove user INSERT (handled by trigger)
DROP POLICY IF EXISTS "Users can insert own free subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
CREATE POLICY "Only service role can insert subscriptions"
  ON public.subscriptions FOR INSERT TO service_role WITH CHECK (true);

-- agent_actions: replace FOR ALL with read-only for users
DROP POLICY IF EXISTS "Users view own agent_actions" ON public.agent_actions;
CREATE POLICY "Users view own agent_actions"
  ON public.agent_actions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages agent_actions"
  ON public.agent_actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny client writes to agent_actions"
  ON public.agent_actions AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- white_label_settings: hide referral_code column from client reads
REVOKE SELECT (referral_code) ON public.white_label_settings FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_my_referral_code()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text;
BEGIN
  SELECT referral_code INTO _code FROM public.white_label_settings WHERE user_id = auth.uid() LIMIT 1;
  RETURN _code;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_code() TO authenticated;

-- rate_limit_buckets: deny client reads
DROP POLICY IF EXISTS "Pro users can view own rate limit buckets" ON public.rate_limit_buckets;
DROP POLICY IF EXISTS "Elite users can view own rate limit buckets" ON public.rate_limit_buckets;
CREATE POLICY "Deny client reads of rate_limit_buckets"
  ON public.rate_limit_buckets AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (false);

-- api_versions: plan-gate INSERT
DROP POLICY IF EXISTS "Pro users can create own API versions" ON public.api_versions;
DROP POLICY IF EXISTS "Elite users can create own API versions" ON public.api_versions;
CREATE POLICY "Pro/Elite users can create own API versions"
  ON public.api_versions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.subscriptions s
                WHERE s.user_id = auth.uid()
                  AND s.plan IN ('pro','elite','agency')
                  AND s.status = 'active')
  );

-- coaching_messages: explicit deny client updates/deletes
CREATE POLICY "Deny client updates to coaching_messages"
  ON public.coaching_messages AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny client deletes to coaching_messages"
  ON public.coaching_messages AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- system_alerts: deny client inserts
CREATE POLICY "Deny client inserts to system_alerts"
  ON public.system_alerts AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- agency_clients: restrict insert/delete to service_role
DROP POLICY IF EXISTS "Agency owns their clients" ON public.agency_clients;
CREATE POLICY "Agency views their clients"
  ON public.agency_clients FOR SELECT TO authenticated USING (agency_id = auth.uid());
CREATE POLICY "Agency updates their clients"
  ON public.agency_clients FOR UPDATE TO authenticated
  USING (agency_id = auth.uid()) WITH CHECK (agency_id = auth.uid());
CREATE POLICY "Service role manages agency_clients"
  ON public.agency_clients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny client-side insert to agency_clients"
  ON public.agency_clients AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny client-side delete to agency_clients"
  ON public.agency_clients AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- =========================================================
-- 2. DATA INTEGRITY
-- =========================================================

-- Daily email counter reset
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS daily_emails_reset_at timestamptz;
UPDATE public.subscriptions
  SET daily_emails_reset_at = date_trunc('day', now() AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'UTC'
  WHERE daily_emails_reset_at IS NULL;

CREATE OR REPLACE FUNCTION public.reset_daily_email_counters()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.subscriptions
  SET daily_emails_sent = 0,
      daily_emails_reset_at = date_trunc('day', now() AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'UTC'
  WHERE daily_emails_reset_at < date_trunc('day', now() AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'UTC'
     OR daily_emails_reset_at IS NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reset_daily_email_counters() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_email_counters() TO service_role;

-- Schedule cron (idempotent)
DO $$ BEGIN
  PERFORM cron.unschedule('reset-daily-email-counters');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('reset-daily-email-counters', '0 0 * * *',
  $cmd$ SELECT public.reset_daily_email_counters(); $cmd$);

-- get_user_plan: free fallback
CREATE OR REPLACE FUNCTION public.get_user_plan()
RETURNS TABLE(plan subscription_plan, has_automations boolean, has_ai_coach boolean,
              has_analytics boolean, has_api_access boolean, leads_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_plan subscription_plan;
BEGIN
  SELECT s.plan INTO user_plan FROM subscriptions s
    WHERE s.user_id = auth.uid() AND s.status = 'active';
  IF user_plan IS NULL THEN user_plan := 'free'; END IF;
  IF user_plan = 'elite' THEN user_plan := 'pro'; END IF;
  RETURN QUERY SELECT
    user_plan,
    user_plan IN ('pro','agency'),
    user_plan IN ('starter','growth','pro','agency'),
    user_plan IN ('starter','growth','pro','agency'),
    user_plan IN ('pro','agency'),
    CASE
      WHEN user_plan='free' THEN 10
      WHEN user_plan='starter' THEN 1000
      WHEN user_plan='growth' THEN 2500
      WHEN user_plan='pro' THEN 5000
      WHEN user_plan='agency' THEN 15000
      ELSE 10
    END;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_user_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_plan() TO authenticated, service_role;

-- Drop dead columns
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS monthly_emails_sent;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS monthly_emails_reset_at;

-- Sync cross-user enrollments
UPDATE public.sequence_enrollments se
  SET user_id = es.user_id
  FROM public.email_sequences es
  WHERE es.id = se.sequence_id AND se.user_id <> es.user_id;

-- Onboarding dedup + unique
DELETE FROM public.onboarding_progress
  WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id FROM public.onboarding_progress
    ORDER BY user_id, updated_at DESC NULLS LAST
  );
DO $$ BEGIN
  ALTER TABLE public.onboarding_progress ADD CONSTRAINT onboarding_progress_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- =========================================================
-- 3. PERFORMANCE — INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_leads_user_id        ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_created   ON public.leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_user_id        ON public.deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_user_stage     ON public.deals(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_activities_user_id   ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_user_status_sent
  ON public.sent_emails(user_id, status, sent_at DESC);

-- =========================================================
-- 4. PERFORMANCE — DENORMALIZE user_id ON RLS SUBQUERY TABLES
-- =========================================================

-- sequence_steps
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE public.sequence_steps ss
  SET user_id = es.user_id FROM public.email_sequences es
  WHERE ss.sequence_id = es.id AND ss.user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sequence_steps_user_id ON public.sequence_steps(user_id);

CREATE OR REPLACE FUNCTION public.sync_sequence_step_user_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id FROM public.email_sequences WHERE id = NEW.sequence_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_sequence_step_user_id ON public.sequence_steps;
CREATE TRIGGER trg_sync_sequence_step_user_id
  BEFORE INSERT OR UPDATE OF sequence_id ON public.sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public.sync_sequence_step_user_id();

DROP POLICY IF EXISTS "Users can view own sequence steps"   ON public.sequence_steps;
DROP POLICY IF EXISTS "Users can create own sequence steps" ON public.sequence_steps;
DROP POLICY IF EXISTS "Users can update own sequence steps" ON public.sequence_steps;
DROP POLICY IF EXISTS "Users can delete own sequence steps" ON public.sequence_steps;
CREATE POLICY "Users can view own sequence steps"   ON public.sequence_steps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sequence steps" ON public.sequence_steps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sequence steps" ON public.sequence_steps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sequence steps" ON public.sequence_steps FOR DELETE USING (auth.uid() = user_id);

-- webhook_deliveries
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE public.webhook_deliveries wd
  SET user_id = w.user_id FROM public.webhooks w
  WHERE wd.webhook_id = w.id AND wd.user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_user_id ON public.webhook_deliveries(user_id);

DROP POLICY IF EXISTS "Users can view own webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Users can view own webhook deliveries"
  ON public.webhook_deliveries FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- api_usage_log
ALTER TABLE public.api_usage_log ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE public.api_usage_log al
  SET user_id = k.user_id FROM public.api_keys k
  WHERE al.api_key_id = k.id AND al.user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_usage_log_user_id ON public.api_usage_log(user_id);

DROP POLICY IF EXISTS "Users can view own api usage logs" ON public.api_usage_log;
DROP POLICY IF EXISTS "Users can view own api usage" ON public.api_usage_log;
CREATE POLICY "Users can view own api usage logs"
  ON public.api_usage_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
