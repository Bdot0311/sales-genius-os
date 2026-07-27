ALTER TABLE public.agent_actions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS approval_mode boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  lead_id uuid,
  sent_email_id uuid,
  integration_row_id uuid,
  prospect_email text,
  prospect_name text,
  company_name text,
  subject text,
  body text,
  classification text,
  reasoning text,
  metadata jsonb DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_approvals_user_status_idx ON public.agent_approvals (user_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_approvals TO authenticated;
GRANT ALL ON public.agent_approvals TO service_role;

ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent approvals" ON public.agent_approvals;
CREATE POLICY "Users manage own agent approvals" ON public.agent_approvals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_agent_approvals_updated_at ON public.agent_approvals;
CREATE TRIGGER update_agent_approvals_updated_at BEFORE UPDATE ON public.agent_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();