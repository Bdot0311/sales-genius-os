-- Deliverability Suite — Phase 1a: sending accounts, domains, tracking domains, blacklist checks
-- Backbone for per-account reputation, sending controls, and DNS/auth monitoring.

-- Shared updated_at trigger for the deliverability tables (self-contained, idempotent).
CREATE OR REPLACE FUNCTION public.deliverability_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================
-- sending_accounts — canonical per-mailbox sending config + reputation.
-- One row per real connected sending mailbox (links to integrations OAuth store).
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

ALTER TABLE public.sending_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sending accounts"
  ON public.sending_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sending accounts"
  ON public.sending_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sending accounts"
  ON public.sending_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sending accounts"
  ON public.sending_accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sending_accounts_user ON public.sending_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_sending_accounts_status ON public.sending_accounts (status);

CREATE TRIGGER trg_sending_accounts_updated_at
  BEFORE UPDATE ON public.sending_accounts
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- Attribute each sent email to a sending account (for per-account reputation).
ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sent_emails_sending_account ON public.sent_emails (sending_account_id);

-- Backfill sending_accounts from existing active Gmail integrations that have a connected email.
INSERT INTO public.sending_accounts (user_id, integration_id, email, provider, warmup_enabled)
SELECT i.user_id, i.id, i.config->>'connected_email',
       CASE WHEN i.integration_id ILIKE '%google%' OR i.integration_id ILIKE '%gmail%' THEN 'gmail' ELSE i.integration_id END,
       false
FROM public.integrations i
WHERE i.is_active = true
  AND coalesce(i.config->>'connected_email', '') <> ''
ON CONFLICT (user_id, email) DO NOTHING;

-- =============================================================
-- sending_domains — SPF/DKIM/DMARC status + recommended records per domain.
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

ALTER TABLE public.sending_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sending domains"
  ON public.sending_domains FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sending domains"
  ON public.sending_domains FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sending domains"
  ON public.sending_domains FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sending domains"
  ON public.sending_domains FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sending_domains_user ON public.sending_domains (user_id);

CREATE TRIGGER trg_sending_domains_updated_at
  BEFORE UPDATE ON public.sending_domains
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- =============================================================
-- tracking_domains — custom CNAME tracking domains (avoid shared-domain drag).
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

ALTER TABLE public.tracking_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tracking domains"
  ON public.tracking_domains FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tracking domains"
  ON public.tracking_domains FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tracking domains"
  ON public.tracking_domains FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tracking domains"
  ON public.tracking_domains FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tracking_domains_user ON public.tracking_domains (user_id);

CREATE TRIGGER trg_tracking_domains_updated_at
  BEFORE UPDATE ON public.tracking_domains
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- =============================================================
-- blacklist_checks — RBL/DNSBL lookup history for domains (and optionally IPs).
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

ALTER TABLE public.blacklist_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blacklist checks"
  ON public.blacklist_checks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own blacklist checks"
  ON public.blacklist_checks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own blacklist checks"
  ON public.blacklist_checks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_blacklist_checks_lookup
  ON public.blacklist_checks (user_id, target, checked_at DESC);
