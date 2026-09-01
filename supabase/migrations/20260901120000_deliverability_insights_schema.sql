-- Deliverability Insights — schema for the diagnostician layer.
--
-- The existing suite reports numbers. This is the storage the Insights layer
-- needs to report causes: where mail actually landed and how it authenticated
-- on arrival, what the receiving world says about us in DMARC aggregate
-- reports, what changed on the timeline, and every automatic action taken on a
-- mailbox on the user's behalf.
--
-- Nothing here is user-visible on its own. It is deliberately shipped ahead of
-- the UI so the DMARC and reputation history have time to accumulate — a
-- diagnostician with one day of data cannot name a cause.
--
-- Every table is per-account private under RLS. Seed results and DMARC reports
-- describe a customer's sending infrastructure and must never be readable
-- across tenants.

-- =============================================================
-- 1. Seed placement — extend, don't duplicate.
--
-- placement_tests / placement_results already exist and hold real Gmail seed
-- results. What they can't express: the other four providers in the panel, the
-- Gmail tab a message landed in, and how the message authenticated *as the
-- receiver saw it* — which is a different question from whether the DNS records
-- exist, and the one that explains a placement drop with correct-looking DNS.
-- =============================================================

ALTER TABLE public.placement_results
  DROP CONSTRAINT IF EXISTS placement_results_provider_check;

ALTER TABLE public.placement_results
  ADD CONSTRAINT placement_results_provider_check
  CHECK (provider IN ('gmail', 'outlook', 'yahoo', 'm365', 'workspace'));

ALTER TABLE public.placement_results
  -- Which Gmail tab. Distinct from `placement`: a message can be in the inbox
  -- and still be buried in Promotions, which is the failure users describe as
  -- "my open rate died and I don't know why".
  ADD COLUMN IF NOT EXISTS tab text
    CHECK (tab IS NULL OR tab IN ('primary', 'promotions', 'updates', 'social', 'forums', 'none', 'unknown')),
  -- The seed mailbox that answered, so a provider result can be traced to the
  -- inbox that produced it when seeds are added or rotated.
  ADD COLUMN IF NOT EXISTS seed_mailbox text,
  -- Authentication as reported by the receiving provider's own headers. NULL
  -- means we could not read it — never assume a pass.
  ADD COLUMN IF NOT EXISTS spf_result text
    CHECK (spf_result IS NULL OR spf_result IN ('pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror')),
  ADD COLUMN IF NOT EXISTS dkim_result text
    CHECK (dkim_result IS NULL OR dkim_result IN ('pass', 'fail', 'none', 'temperror', 'permerror')),
  ADD COLUMN IF NOT EXISTS dmarc_result text
    CHECK (dmarc_result IS NULL OR dmarc_result IN ('pass', 'fail', 'none')),
  -- When the seed inbox was actually read, as opposed to when the row was made.
  ADD COLUMN IF NOT EXISTS observed_at timestamptz;

COMMENT ON COLUMN public.placement_results.tab IS
  'Gmail category tab. NULL for providers without tabs, ''unknown'' when the tab could not be read.';
COMMENT ON COLUMN public.placement_results.dmarc_result IS
  'DMARC as evaluated by the RECEIVER, from the delivered message headers. Not the same as the DNS record check in sending_domains.';

-- =============================================================
-- 2. DMARC aggregate (RUA) reports.
--
-- Receivers send an XML report saying which IPs sent mail claiming to be your
-- domain and whether it authenticated. It is the only feed that shows a
-- forwarder breaking SPF, or somebody else sending as you, and almost nothing
-- in cold email parses it.
--
-- Two tables because one report covers a date range and contains many rows,
-- one per source IP.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.dmarc_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_domain_id uuid REFERENCES public.sending_domains(id) ON DELETE SET NULL,
  -- Denormalised so a report survives the domain row being removed. The whole
  -- point of these is historical attribution.
  domain text NOT NULL,
  -- Who sent the report (google.com, outlook.com, ...).
  org_name text,
  org_email text,
  -- The reporter's own id for this report. Reports get re-delivered; this is
  -- what makes ingestion idempotent.
  external_report_id text NOT NULL,
  date_range_begin timestamptz NOT NULL,
  date_range_end timestamptz NOT NULL,
  -- The policy the receiver saw published, at the time it evaluated. Keeping it
  -- per report is what lets the UI say "this failure predates your p=reject".
  policy_p text,
  policy_sp text,
  policy_pct integer,
  policy_adkim text,
  policy_aspf text,
  -- Totals, so the overview does not have to aggregate every record row.
  total_messages integer NOT NULL DEFAULT 0,
  passing_messages integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain, external_report_id)
);

ALTER TABLE public.dmarc_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own dmarc reports" ON public.dmarc_reports;
CREATE POLICY "Users can view own dmarc reports"
  ON public.dmarc_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- No user INSERT/UPDATE: rows come from the ingestion function under the
-- service role. A user-writable report table would let anyone fabricate the
-- evidence the Insights layer reasons from.

CREATE INDEX IF NOT EXISTS idx_dmarc_reports_user_domain
  ON public.dmarc_reports (user_id, domain, date_range_end DESC);

CREATE TABLE IF NOT EXISTS public.dmarc_report_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dmarc_reports(id) ON DELETE CASCADE,
  -- inet rather than text: malformed addresses are rejected at the boundary
  -- instead of becoming rows nothing can group by. The parser skips what it
  -- cannot validate rather than storing a guess.
  source_ip inet NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  disposition text CHECK (disposition IS NULL OR disposition IN ('none', 'quarantine', 'reject')),
  -- Evaluated (aligned) results — what actually decided the disposition.
  dkim_result text CHECK (dkim_result IS NULL OR dkim_result IN ('pass', 'fail')),
  spf_result text CHECK (spf_result IS NULL OR spf_result IN ('pass', 'fail')),
  header_from text,
  envelope_from text,
  -- Auth detail, for naming the cause: which selector, which domain.
  dkim_domain text,
  dkim_selector text,
  spf_domain text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dmarc_report_records ENABLE ROW LEVEL SECURITY;

-- Records inherit ownership through the parent report, matching how
-- placement_results inherits from placement_tests.
DROP POLICY IF EXISTS "Users can view own dmarc report records" ON public.dmarc_report_records;
CREATE POLICY "Users can view own dmarc report records"
  ON public.dmarc_report_records FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dmarc_reports r
    WHERE r.id = dmarc_report_records.report_id AND r.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_dmarc_records_report ON public.dmarc_report_records (report_id);
CREATE INDEX IF NOT EXISTS idx_dmarc_records_source ON public.dmarc_report_records (source_ip);

-- =============================================================
-- 3. Reputation history.
--
-- reputation_snapshots already stores a daily row per mailbox. Two changes.
--
-- First, open_rate stops being a scoring input. Open tracking needs a pixel,
-- the pixel raises spam score, and spam-foldered mail still fires it — so the
-- number meant to measure placement is inflated by the exact failure it should
-- catch. It stays as a reported figure and is no longer scored; the code change
-- is in _shared/reputation.ts.
--
-- Second, seed placement becomes a first-class input. It answers the question
-- open rate was standing in for, and it answers it honestly.
-- =============================================================

ALTER TABLE public.reputation_snapshots
  -- Share of seed tests in the last window that landed in the inbox. NULL when
  -- no test ran — an unmeasured mailbox is not a failing one.
  ADD COLUMN IF NOT EXISTS placement_inbox_rate numeric,
  ADD COLUMN IF NOT EXISTS placement_spam_rate numeric,
  ADD COLUMN IF NOT EXISTS placement_sample_size integer,
  -- Whether the mailbox was out of rotation on this day, so a volume collapse
  -- reads as containment rather than as a mystery.
  ADD COLUMN IF NOT EXISTS quarantined boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reputation_snapshots.open_rate IS
  'Reported, never scored. Pixel opens are inflated by provider prefetch and by spam-foldered mail that still loads images. Placement and reply rate are the metrics of record.';

-- =============================================================
-- 4. Event annotations.
--
-- A timeline without events is a shape nobody can attribute. This is what lets
-- a user see the placement drop start on the day the copy changed.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.deliverability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  domain text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN (
    'mailbox_added', 'mailbox_removed', 'mailbox_paused', 'mailbox_resumed',
    'warmup_started', 'warmup_completed',
    'dns_changed', 'auth_record_changed',
    'copy_edited', 'campaign_launched',
    'limit_changed', 'quarantined', 'quarantine_released',
    'placement_test', 'blacklist_listed', 'blacklist_cleared'
  )),
  -- One line, already written for a human. The timeline renders this verbatim.
  title text NOT NULL,
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deliverability_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own deliverability events" ON public.deliverability_events;
CREATE POLICY "Users can view own deliverability events"
  ON public.deliverability_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Users may annotate their own timeline (a note about a copy change the system
-- cannot see), but never edit or delete history that was recorded for them.
DROP POLICY IF EXISTS "Users can insert own deliverability events" ON public.deliverability_events;
CREATE POLICY "Users can insert own deliverability events"
  ON public.deliverability_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_deliverability_events_user_time
  ON public.deliverability_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliverability_events_account
  ON public.deliverability_events (sending_account_id, occurred_at DESC);

-- =============================================================
-- 5. Quarantine log.
--
-- Auto-quarantine changes sending behaviour without being asked. That is only
-- acceptable with a record: every action, why it fired, what it moved, and
-- whether a human or the system did it. Never silently.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.mailbox_quarantine_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  -- Kept alongside the id so the log still reads correctly after a mailbox is
  -- disconnected and its row goes away.
  mailbox_email text NOT NULL,
  action text NOT NULL CHECK (action IN ('quarantined', 'released', 'volume_redistributed')),
  -- Written for a person, not a status code.
  reason text NOT NULL,
  reputation_score integer,
  threshold integer,
  -- The save, in the only unit users care about: sends that would have been
  -- lost, and where they went instead.
  volume_redistributed integer,
  redistributed_to jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- false when a human pulled or released the mailbox by hand.
  automatic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mailbox_quarantine_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own quarantine log" ON public.mailbox_quarantine_log;
CREATE POLICY "Users can view own quarantine log"
  ON public.mailbox_quarantine_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Append-only from the user's side: the log is evidence, and evidence a user
-- can rewrite is not evidence. Writes come from the scoring job.

CREATE INDEX IF NOT EXISTS idx_quarantine_log_user_time
  ON public.mailbox_quarantine_log (user_id, created_at DESC);

-- =============================================================
-- 6. Per-user preferences.
--
-- deliverability_settings is a GLOBAL operator key/value store (it holds the
-- seed inbox credentials) and has no user_id. Per-account choices need their
-- own table rather than being bolted onto that one.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.deliverability_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Default on, per spec: containment that is off by default protects nobody.
  auto_quarantine_enabled boolean NOT NULL DEFAULT true,
  auto_quarantine_threshold integer NOT NULL DEFAULT 60
    CHECK (auto_quarantine_threshold BETWEEN 0 AND 100),
  -- Account-level default for open tracking. Off is the deliverability-correct
  -- default; existing behaviour is on, so this starts true and the UI makes the
  -- cost visible rather than changing it silently underneath anyone.
  open_tracking_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deliverability_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own deliverability preferences" ON public.deliverability_preferences;
CREATE POLICY "Users can view own deliverability preferences"
  ON public.deliverability_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own deliverability preferences" ON public.deliverability_preferences;
CREATE POLICY "Users can insert own deliverability preferences"
  ON public.deliverability_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own deliverability preferences" ON public.deliverability_preferences;
CREATE POLICY "Users can update own deliverability preferences"
  ON public.deliverability_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_deliverability_preferences_updated_at ON public.deliverability_preferences;
CREATE TRIGGER trg_deliverability_preferences_updated_at
  BEFORE UPDATE ON public.deliverability_preferences
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- =============================================================
-- Grants. The Data API needs these on top of RLS — a table with policies and
-- no grant fails every request with a permission error, which is how the
-- campaign_setup_requests table shipped broken once already.
-- =============================================================

GRANT SELECT ON public.dmarc_reports TO authenticated;
GRANT SELECT ON public.dmarc_report_records TO authenticated;
GRANT SELECT, INSERT ON public.deliverability_events TO authenticated;
GRANT SELECT ON public.mailbox_quarantine_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.deliverability_preferences TO authenticated;

GRANT ALL ON public.dmarc_reports TO service_role;
GRANT ALL ON public.dmarc_report_records TO service_role;
GRANT ALL ON public.deliverability_events TO service_role;
GRANT ALL ON public.mailbox_quarantine_log TO service_role;
GRANT ALL ON public.deliverability_preferences TO service_role;
