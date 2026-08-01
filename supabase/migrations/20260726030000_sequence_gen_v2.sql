-- Phase 4: Sequence Generation Engine v2 foundations.
-- The payoff bank is what makes value-first generation safe: the model may only
-- draw payoffs from real, user-supplied entries. The campaign brief is captured
-- once and reused across a campaign's sequences. User-scoped, additive only.

CREATE TABLE IF NOT EXISTS public.payoff_bank (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- observation: a claim the generator may make from public prospect data
  -- benchmark:   a number the user actually owns
  -- resource:    an ungated asset with a live URL
  -- teardown:    a teardown or audit offer
  type            text NOT NULL,
  content         text NOT NULL,
  source_url      text,
  source_of_truth text,             -- where this fact comes from
  asserts_stat    boolean NOT NULL DEFAULT false,  -- true if it carries a number
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payoff_bank_user ON public.payoff_bank(user_id);
ALTER TABLE public.payoff_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payoff_bank_select_own" ON public.payoff_bank FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payoff_bank_insert_own" ON public.payoff_bank FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payoff_bank_update_own" ON public.payoff_bank FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "payoff_bank_delete_own" ON public.payoff_bank FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.campaign_briefs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  offer            text,             -- the offer and what it replaces
  replaces         text,
  pain_by_persona  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { persona: pain in their words }
  proof            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- real, citable proof
  forbidden_claims text[] NOT NULL DEFAULT '{}',          -- claims that must never be made
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_briefs_user ON public.campaign_briefs(user_id);
ALTER TABLE public.campaign_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_briefs_select_own" ON public.campaign_briefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "campaign_briefs_insert_own" ON public.campaign_briefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaign_briefs_update_own" ON public.campaign_briefs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "campaign_briefs_delete_own" ON public.campaign_briefs FOR DELETE USING (auth.uid() = user_id);
