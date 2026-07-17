-- Deliverability Suite — consolidated schema + permissions + crons
-- Creates the full backend for per-mailbox reputation, DNS/auth checks,
-- blacklist monitoring, warmup pool, and inbox placement testing.

-- =============================================================
-- Shared updated-at trigger for the deliverability tables.
-- =============================================================
CREATE OR REPLACE FUNCTION public.deliverability_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deliverability_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliverability_set_updated_at() TO service_role;

-- =============================================================
-- Internal config table for edge-function invocation settings.
-- Read-only to service_role; the cron jobs use this to call functions.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.deliverability_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.deliverability_settings TO service_role;

ALTER TABLE public.deliverability_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role can read deliverability settings"
  ON public.deliverability_settings FOR SELECT TO service_role USING (true);

INSERT INTO public.deliverability_settings (key, value) VALUES
  ('supabase_url', 'https://ghgfjnepvxvxrncmskys.supabase.co'),
  ('anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o')
ON CONFLICT (key) DO NOTHING;

-- =============================================================
-- sending_accounts — canonical per-mailbox sending config + reputation.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.sending_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  email text NOT NULL,
  provider text,
  daily_limit integer NOT NULL DEFAULT 50,
  sent_today integer NOT NULL DEFAULT 0,
  sent_today_date date NOT NULL DEFAULT CURRENT_DATE,
  min_send_delay_seconds integer NOT NULL DEFAULT 30,
  max_send_delay_seconds integer NOT NULL DEFAULT 120,
  warmup_enabled boolean NOT NULL DEFAULT false,
  reputation_score integer CHECK (reputation_score BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  paused_reason text,
  auto_pause_threshold integer NOT NULL DEFAULT 70,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sending_accounts TO authenticated;
GRANT ALL ON public.sending_accounts TO service_role;

ALTER TABLE public.sending_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sending accounts"
  ON public.sending_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sending accounts"
  ON public.sending_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sending accounts"
  ON public.sending_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sending accounts"
  ON public.sending_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sending_accounts_user ON public.sending_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_sending_accounts_status ON public.sending_accounts (status);

CREATE TRIGGER trg_sending_accounts_updated_at
  BEFORE UPDATE ON public.sending_accounts
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- Attribute each sent email to a sending account.
ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sent_emails_sending_account ON public.sent_emails (sending_account_id);

-- Backfill sending_accounts from existing active integrations.
INSERT INTO public.sending_accounts (user_id, integration_id, email, provider, warmup_enabled)
SELECT i.user_id, i.id, i.connected_email,
       CASE
         WHEN i.integration_id ILIKE '%google%' OR i.integration_id ILIKE '%gmail%' THEN 'gmail'
         ELSE i.integration_id
       END,
       false
FROM public.integrations i
WHERE i.is_active = true
  AND coalesce(i.connected_email, '') <> ''
ON CONFLICT (user_id, email) DO NOTHING;

-- =============================================================
-- sending_domains — SPF/DKIM/DMARC status + recommended records.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.sending_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  spf_status text NOT NULL DEFAULT 'unknown' CHECK (spf_status IN ('pass', 'fail', 'unknown')),
  dkim_status text NOT NULL DEFAULT 'unknown' CHECK (dkim_status IN ('pass', 'fail', 'unknown')),
  dmarc_status text NOT NULL DEFAULT 'unknown' CHECK (dmarc_status IN ('pass', 'fail', 'unknown')),
  dkim_selector text,
  recommended_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sending_domains TO authenticated;
GRANT ALL ON public.sending_domains TO service_role;

ALTER TABLE public.sending_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sending domains"
  ON public.sending_domains FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sending domains"
  ON public.sending_domains FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sending domains"
  ON public.sending_domains FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sending domains"
  ON public.sending_domains FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sending_domains_user ON public.sending_domains (user_id);

CREATE TRIGGER trg_sending_domains_updated_at
  BEFORE UPDATE ON public.sending_domains
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- =============================================================
-- tracking_domains — custom CNAME tracking domains.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.tracking_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  target text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  verified boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_domains TO authenticated;
GRANT ALL ON public.tracking_domains TO service_role;

ALTER TABLE public.tracking_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tracking domains"
  ON public.tracking_domains FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tracking domains"
  ON public.tracking_domains FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tracking domains"
  ON public.tracking_domains FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tracking domains"
  ON public.tracking_domains FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tracking_domains_user ON public.tracking_domains (user_id);

CREATE TRIGGER trg_tracking_domains_updated_at
  BEFORE UPDATE ON public.tracking_domains
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- =============================================================
-- blacklist_checks — RBL/DNSBL lookup history.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.blacklist_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target text NOT NULL,
  target_type text NOT NULL DEFAULT 'domain' CHECK (target_type IN ('domain', 'ip')),
  rbl_name text NOT NULL,
  listed boolean NOT NULL DEFAULT false,
  detail text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.blacklist_checks TO authenticated;
GRANT ALL ON public.blacklist_checks TO service_role;

ALTER TABLE public.blacklist_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blacklist checks"
  ON public.blacklist_checks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own blacklist checks"
  ON public.blacklist_checks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own blacklist checks"
  ON public.blacklist_checks FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_blacklist_checks_lookup
  ON public.blacklist_checks (user_id, target, checked_at DESC);

-- =============================================================
-- bounce_events — classified bounces linked to account + sent email.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.bounce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  sent_email_id uuid REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  bounce_type text NOT NULL DEFAULT 'soft' CHECK (bounce_type IN ('hard', 'soft', 'block')),
  reason text,
  smtp_code text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.bounce_events TO authenticated;
GRANT ALL ON public.bounce_events TO service_role;

ALTER TABLE public.bounce_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bounce events"
  ON public.bounce_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bounce events"
  ON public.bounce_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bounce_events_account ON public.bounce_events (sending_account_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounce_events_user ON public.bounce_events (user_id, detected_at DESC);

-- =============================================================
-- reputation_snapshots — daily per-account reputation trend.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.reputation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_account_id uuid NOT NULL REFERENCES public.sending_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  reputation_score integer CHECK (reputation_score BETWEEN 0 AND 100),
  volume integer NOT NULL DEFAULT 0,
  bounce_rate numeric(6,3) NOT NULL DEFAULT 0,
  complaint_rate numeric(6,3) NOT NULL DEFAULT 0,
  open_rate numeric(6,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sending_account_id, snapshot_date)
);

GRANT SELECT, INSERT ON public.reputation_snapshots TO authenticated;
GRANT ALL ON public.reputation_snapshots TO service_role;

ALTER TABLE public.reputation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reputation snapshots"
  ON public.reputation_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reputation snapshots"
  ON public.reputation_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reputation_snapshots_account
  ON public.reputation_snapshots (sending_account_id, snapshot_date DESC);

-- =============================================================
-- deliverability_alerts — in-app alerts for reputation/deliverability issues.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.deliverability_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE CASCADE,
  domain text,
  alert_type text NOT NULL CHECK (alert_type IN ('reputation_drop', 'blacklist', 'auth_failure', 'bounce_spike', 'complaint_spike', 'warmup_paused')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliverability_alerts TO authenticated;
GRANT ALL ON public.deliverability_alerts TO service_role;

ALTER TABLE public.deliverability_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deliverability alerts"
  ON public.deliverability_alerts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own deliverability alerts"
  ON public.deliverability_alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own deliverability alerts"
  ON public.deliverability_alerts FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_deliverability_alerts_active
  ON public.deliverability_alerts (user_id, status, created_at DESC);

-- =============================================================
-- warmup_pool — shared warmup network membership.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.warmup_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sending_account_id uuid NOT NULL REFERENCES public.sending_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  daily_target integer NOT NULL DEFAULT 4,
  reputation_score integer CHECK (reputation_score BETWEEN 0 AND 100),
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sending_account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_pool TO authenticated;
GRANT ALL ON public.warmup_pool TO service_role;

ALTER TABLE public.warmup_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own warmup pool membership"
  ON public.warmup_pool FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup pool membership"
  ON public.warmup_pool FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own warmup pool membership"
  ON public.warmup_pool FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own warmup pool membership"
  ON public.warmup_pool FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_warmup_pool_active ON public.warmup_pool (active);

CREATE TRIGGER trg_warmup_pool_updated_at
  BEFORE UPDATE ON public.warmup_pool
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- =============================================================
-- warmup_messages — individual warmup sends between pool accounts.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.warmup_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  to_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text,
  gmail_message_id text,
  gmail_thread_id text,
  folder_detected text CHECK (folder_detected IN ('inbox', 'spam', 'promotions', 'unknown')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.warmup_messages TO authenticated;
GRANT ALL ON public.warmup_messages TO service_role;

ALTER TABLE public.warmup_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own warmup messages"
  ON public.warmup_messages FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE INDEX IF NOT EXISTS idx_warmup_messages_from ON public.warmup_messages (from_account_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_warmup_messages_to ON public.warmup_messages (to_account_id, sent_at DESC);

-- =============================================================
-- placement_tests / placement_results — inbox-vs-spam seed testing.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.placement_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.placement_tests TO authenticated;
GRANT ALL ON public.placement_tests TO service_role;

ALTER TABLE public.placement_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own placement tests"
  ON public.placement_tests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own placement tests"
  ON public.placement_tests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own placement tests"
  ON public.placement_tests FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_placement_tests_user ON public.placement_tests (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.placement_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.placement_tests(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail', 'outlook', 'yahoo')),
  placement text NOT NULL DEFAULT 'pending' CHECK (placement IN ('inbox', 'spam', 'promotions', 'missing', 'pending', 'unsupported')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, provider)
);

GRANT SELECT ON public.placement_results TO authenticated;
GRANT ALL ON public.placement_results TO service_role;

ALTER TABLE public.placement_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own placement results"
  ON public.placement_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.placement_tests t
    WHERE t.id = placement_results.test_id AND t.user_id = auth.uid()
  ));

-- =============================================================
-- Reputation engine RPC: aggregates send/bounce/complaint/open counts.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_reputation_inputs(p_days integer DEFAULT 30)
RETURNS TABLE (
  sending_account_id uuid,
  user_id uuid,
  sent bigint,
  bounced bigint,
  complaints bigint,
  opened bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    se.sending_account_id,
    se.user_id,
    count(*) AS sent,
    count(*) FILTER (WHERE se.status = 'bounced') AS bounced,
    count(*) FILTER (WHERE se.status = 'spam_complaint') AS complaints,
    count(*) FILTER (WHERE se.opened_at IS NOT NULL) AS opened
  FROM public.sent_emails se
  WHERE se.sending_account_id IS NOT NULL
    AND se.sent_at >= now() - make_interval(days => p_days)
  GROUP BY se.sending_account_id, se.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_reputation_inputs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_reputation_inputs(integer) TO service_role;

-- =============================================================
-- Sending controls: atomic daily-limit enforcement and account rotation.
-- =============================================================
CREATE OR REPLACE FUNCTION public.increment_account_send(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sending_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.sending_accounts
   WHERE id = p_account_id AND user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_row.status <> 'active' THEN
    RETURN false;
  END IF;

  IF v_row.sent_today_date < CURRENT_DATE THEN
    v_row.sent_today := 0;
    v_row.sent_today_date := CURRENT_DATE;
  END IF;

  IF v_row.sent_today >= v_row.daily_limit THEN
    RETURN false;
  END IF;

  UPDATE public.sending_accounts
     SET sent_today = v_row.sent_today + 1,
         sent_today_date = v_row.sent_today_date,
         last_sent_at = now()
   WHERE id = p_account_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_account_send(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_account_send(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pick_sending_account(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM public.sending_accounts
   WHERE user_id = p_user_id
      AND status = 'active'
      AND (sent_today_date < CURRENT_DATE OR sent_today < daily_limit)
   ORDER BY last_sent_at ASC NULLS FIRST
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pick_sending_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pick_sending_account(uuid) TO service_role;

-- =============================================================
-- Edge-function helper used by cron jobs.
-- =============================================================
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
  SELECT value INTO v_key FROM public.deliverability_settings WHERE key = 'anon_key';

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

-- =============================================================
-- Scheduled cron jobs (recompute reputation, scan alerts).
-- =============================================================
DO $$
BEGIN
  PERFORM cron.unschedule('compute-reputation-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'compute-reputation-daily',
  '0 6 * * *',
  $$SELECT public.deliverability_call_edge('compute-reputation', '{"scheduled": true}'::jsonb);$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('deliverability-alerts-scan-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'deliverability-alerts-scan-daily',
  '15 6 * * *',
  $$SELECT public.deliverability_call_edge('deliverability-alerts-scan', '{"scheduled": true}'::jsonb);$$
);