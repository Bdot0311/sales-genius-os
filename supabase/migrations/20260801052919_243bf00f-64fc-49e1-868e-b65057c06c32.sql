CREATE TABLE IF NOT EXISTS public.payoff_bank (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL,
  content         text NOT NULL,
  source_url      text,
  source_of_truth text,
  asserts_stat    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payoff_bank_user ON public.payoff_bank(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payoff_bank TO authenticated;
GRANT ALL ON public.payoff_bank TO service_role;

ALTER TABLE public.payoff_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payoff_bank_select_own" ON public.payoff_bank FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "payoff_bank_insert_own" ON public.payoff_bank FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payoff_bank_update_own" ON public.payoff_bank FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payoff_bank_delete_own" ON public.payoff_bank FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_payoff_bank_updated_at BEFORE UPDATE ON public.payoff_bank
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.campaign_briefs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  offer            text,
  replaces         text,
  pain_by_persona  jsonb NOT NULL DEFAULT '{}'::jsonb,
  proof            jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_claims text[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_briefs_user ON public.campaign_briefs(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_briefs TO authenticated;
GRANT ALL ON public.campaign_briefs TO service_role;

ALTER TABLE public.campaign_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_briefs_select_own" ON public.campaign_briefs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "campaign_briefs_insert_own" ON public.campaign_briefs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaign_briefs_update_own" ON public.campaign_briefs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaign_briefs_delete_own" ON public.campaign_briefs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_campaign_briefs_updated_at BEFORE UPDATE ON public.campaign_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();