-- Deliverability Suite — Phase 1b: bounce events, reputation snapshots, alerts

-- =============================================================
-- bounce_events — classified bounces linked to account + sent email.
-- Populated by Gmail bounce-back parsing (inbox-sync) and the suppression webhook.
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

ALTER TABLE public.bounce_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bounce events"
  ON public.bounce_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bounce events"
  ON public.bounce_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bounce_events_account ON public.bounce_events (sending_account_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounce_events_user ON public.bounce_events (user_id, detected_at DESC);

-- =============================================================
-- reputation_snapshots — daily per-account reputation trend (for graphs/history).
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

ALTER TABLE public.reputation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reputation snapshots"
  ON public.reputation_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reputation snapshots"
  ON public.reputation_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reputation_snapshots_account
  ON public.reputation_snapshots (sending_account_id, snapshot_date DESC);

-- =============================================================
-- deliverability_alerts — in-app alerts for reputation drops, blacklisting,
-- auth failures, and bounce spikes.
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

ALTER TABLE public.deliverability_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deliverability alerts"
  ON public.deliverability_alerts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own deliverability alerts"
  ON public.deliverability_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own deliverability alerts"
  ON public.deliverability_alerts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_deliverability_alerts_active
  ON public.deliverability_alerts (user_id, status, created_at DESC);
