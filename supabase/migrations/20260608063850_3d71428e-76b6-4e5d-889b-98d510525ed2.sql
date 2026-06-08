
CREATE TABLE public.re_engagement_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  last_sign_in_at TIMESTAMPTZ,
  days_inactive INTEGER,
  eligibility_reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','skipped','failed')),
  error_message TEXT,
  triggered_manually BOOLEAN NOT NULL DEFAULT false,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reengage_log_attempted_at ON public.re_engagement_log (attempted_at DESC);
CREATE INDEX idx_reengage_log_user_id ON public.re_engagement_log (user_id);
CREATE INDEX idx_reengage_log_status ON public.re_engagement_log (status);

GRANT SELECT ON public.re_engagement_log TO authenticated;
GRANT ALL ON public.re_engagement_log TO service_role;

ALTER TABLE public.re_engagement_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view re-engagement log"
  ON public.re_engagement_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
