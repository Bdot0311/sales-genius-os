-- Phase 1: Lead Score v2
-- Two-axis scoring (fit + intent) on the Signal Lead Queue, which reads the
-- leads table. Additive only: no columns dropped. Scoped to user_id to match
-- the leads table and the app-wide auth.uid() = user_id RLS convention.

-- 1. Score fields on leads, co-located with the existing intent layer
--    (intent_score / intent_label / signal_type / signal_date already exist).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fit_score        integer,
  ADD COLUMN IF NOT EXISTS tier             text,
  ADD COLUMN IF NOT EXISTS score_reason     text,
  ADD COLUMN IF NOT EXISTS scored_at        timestamptz,
  ADD COLUMN IF NOT EXISTS score_breakdown  jsonb DEFAULT '{}'::jsonb;

-- Tier is a small closed set. Use NOT VALID + separate validate so the
-- constraint applies to new writes without failing on any legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_tier_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_tier_check CHECK (tier IS NULL OR tier IN ('A','B','C')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_tier ON public.leads(tier);
CREATE INDEX IF NOT EXISTS idx_leads_scored_at ON public.leads(scored_at);

-- 2. Timestamped signal events. Generalizes the single leads.signal_type /
--    signal_date into a log so intent can use recency-decay, count, and
--    repeat-account, and can be rescored deterministically.
CREATE TABLE IF NOT EXISTS public.signal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  source      text,
  weight      integer NOT NULL DEFAULT 20,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_events_lead_id ON public.signal_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_signal_events_user_occurred ON public.signal_events(user_id, occurred_at DESC);

ALTER TABLE public.signal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_events_select_own" ON public.signal_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "signal_events_insert_own" ON public.signal_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "signal_events_update_own" ON public.signal_events
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "signal_events_delete_own" ON public.signal_events
  FOR DELETE USING (auth.uid() = user_id);

-- 3. Per-user scoring rubric so weights are tunable. One row per user; a
--    sensible default is applied lazily by the scoring function when absent
--    (no accounts table exists to hook workspace-creation onto).
CREATE TABLE IF NOT EXISTS public.scoring_rubric (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  weights    jsonb NOT NULL DEFAULT '{
    "fit": {"industry": 30, "headcount": 20, "seniority": 20, "function": 15, "geography": 10, "tech": 5},
    "intent": {"base_signal": 20, "recency_half_life_days": 14, "count_weight": 10, "repeat_account_bonus": 15},
    "thresholds": {"a_fit_min": 70, "b_fit_min": 40}
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scoring_rubric ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scoring_rubric_select_own" ON public.scoring_rubric
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scoring_rubric_insert_own" ON public.scoring_rubric
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scoring_rubric_update_own" ON public.scoring_rubric
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "scoring_rubric_delete_own" ON public.scoring_rubric
  FOR DELETE USING (auth.uid() = user_id);
