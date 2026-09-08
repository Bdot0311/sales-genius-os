CREATE TABLE public.onboarding_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  role text,
  company_type text,
  team_size text,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_tooling text,
  monthly_prospect_volume text,
  discovery_channel text,
  discovery_channel_other text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.onboarding_responses TO authenticated;
GRANT ALL ON public.onboarding_responses TO service_role;

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding responses"
  ON public.onboarding_responses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding responses"
  ON public.onboarding_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding responses"
  ON public.onboarding_responses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_onboarding_responses_updated_at
  BEFORE UPDATE ON public.onboarding_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.onboarding_progress
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Existing accounts are not forced through the new questionnaire.
UPDATE public.onboarding_progress SET onboarding_completed = true;

CREATE OR REPLACE FUNCTION public.mark_onboarding_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL THEN
    INSERT INTO public.onboarding_progress (user_id, onboarding_completed, completed_profile)
    VALUES (NEW.user_id, true, true)
    ON CONFLICT (user_id) DO UPDATE
      SET onboarding_completed = true,
          completed_profile = true,
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_onboarding_completed() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_mark_onboarding_completed
  AFTER INSERT OR UPDATE OF completed_at ON public.onboarding_responses
  FOR EACH ROW EXECUTE FUNCTION public.mark_onboarding_completed();

CREATE OR REPLACE FUNCTION public.admin_get_signup_channels()
RETURNS TABLE (channel text, signups bigint, last_signup timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(COALESCE(r.discovery_channel_other, r.discovery_channel)), ''), 'Unknown') AS channel,
    COUNT(*)::bigint AS signups,
    MAX(r.completed_at) AS last_signup
  FROM public.onboarding_responses r
  WHERE r.completed_at IS NOT NULL
    AND public.has_role(auth.uid(), 'admin')
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_signup_channels() TO authenticated;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'onboarding_responses', c, 'onboarding questionnaire'
FROM unnest(ARRAY['id','user_id','role','company_type','team_size','goals','current_tooling','monthly_prospect_volume','discovery_channel','discovery_channel_other','completed_at']) AS c
ON CONFLICT DO NOTHING;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('onboarding_progress', 'onboarding_completed', 'gates the onboarding questionnaire')
ON CONFLICT DO NOTHING;