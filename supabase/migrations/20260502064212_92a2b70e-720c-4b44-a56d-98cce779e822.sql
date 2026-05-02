
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  user_id UUID,
  related_entity TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_system_alerts_category ON public.system_alerts (category);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON public.system_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_unresolved ON public.system_alerts (resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON public.system_alerts (created_at DESC);

CREATE POLICY "Admins can view system alerts"
ON public.system_alerts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system alerts"
ON public.system_alerts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete system alerts"
ON public.system_alerts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Note: writes happen via service-role from edge functions; no INSERT policy exposed to clients.
