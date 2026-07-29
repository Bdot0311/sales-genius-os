-- 1. Campaign setup request log (CTA clicks)
CREATE TABLE public.campaign_setup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  plan text,
  booked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.campaign_setup_requests TO authenticated;
GRANT ALL ON public.campaign_setup_requests TO service_role;
ALTER TABLE public.campaign_setup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own setup requests"
  ON public.campaign_setup_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own setup requests"
  ON public.campaign_setup_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view all setup requests"
  ON public.campaign_setup_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update setup requests"
  ON public.campaign_setup_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER campaign_setup_requests_updated_at
  BEFORE UPDATE ON public.campaign_setup_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_campaign_setup_requests_user ON public.campaign_setup_requests(user_id, created_at DESC);

-- 2. Support access grants
CREATE TABLE public.support_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_id uuid REFERENCES public.campaign_setup_requests(id) ON DELETE SET NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['campaign_assets','leads']::text[],
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  revoked_at timestamptz,
  revoked_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_access_grants TO authenticated;
GRANT ALL ON public.support_access_grants TO service_role;
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own grants"
  ON public.support_access_grants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own grants"
  ON public.support_access_grants FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users revoke own grants"
  ON public.support_access_grants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all grants"
  ON public.support_access_grants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins end grants"
  ON public.support_access_grants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER support_access_grants_updated_at
  BEFORE UPDATE ON public.support_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_support_access_grants_active
  ON public.support_access_grants(user_id, expires_at)
  WHERE revoked_at IS NULL;

-- Enforce sane expiry window with a trigger (not a CHECK, since it is time dependent)
CREATE OR REPLACE FUNCTION public.validate_support_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '30 days' THEN
      NEW.expires_at := now() + interval '14 days';
    END IF;
    IF NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'Grant expiry must be in the future';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_access_grants_validate
  BEFORE INSERT ON public.support_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.validate_support_grant();

-- 3. Helper: is there an active grant covering a scope?
CREATE OR REPLACE FUNCTION public.has_active_support_grant(_user_id uuid, _scope text DEFAULT 'campaign_assets')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_access_grants g
    WHERE g.user_id = _user_id
      AND g.revoked_at IS NULL
      AND g.completed_at IS NULL
      AND g.expires_at > now()
      AND _scope = ANY(g.scopes)
  );
$$;

-- 4. Audit trail of admin actions taken under a grant
CREATE TABLE public.support_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES public.support_access_grants(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_access_events TO authenticated;
GRANT ALL ON public.support_access_events TO service_role;
ALTER TABLE public.support_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view events on their account"
  ON public.support_access_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view all support events"
  ON public.support_access_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins log support events"
  ON public.support_access_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = admin_id);

CREATE INDEX idx_support_access_events_user ON public.support_access_events(user_id, created_at DESC);

-- 5. Scoped admin access to campaign assets while a grant is active
CREATE POLICY "Support access to sequences"
  ON public.email_sequences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'));

CREATE POLICY "Support access to sequence steps"
  ON public.sequence_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'));

CREATE POLICY "Support access to message blocks"
  ON public.message_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'));

CREATE POLICY "Support access to email drafts"
  ON public.email_drafts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'));

CREATE POLICY "Support access to icp profiles"
  ON public.icp_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'));

CREATE POLICY "Support access to agent configs"
  ON public.agent_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'campaign_assets'));

CREATE POLICY "Support access to leads"
  ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'leads'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'leads'));