-- Phase 3: Database Security Hardening

-- 1. Prevent subscription deletion by users (only Stripe webhooks via service role should delete)
CREATE POLICY "Prevent subscription deletion by users"
ON public.subscriptions FOR DELETE
TO authenticated
USING (false);

-- 2. Make audit logs immutable - prevent UPDATE
CREATE POLICY "Prevent audit log modification"
ON public.audit_logs FOR UPDATE
TO authenticated
USING (false);

-- 3. Make audit logs immutable - prevent DELETE
CREATE POLICY "Prevent audit log deletion"
ON public.audit_logs FOR DELETE
TO authenticated
USING (false);

-- 4. Restrict webhook_deliveries to service role only for modifications
-- Users can only SELECT their own webhook deliveries
CREATE POLICY "Users can view own webhook deliveries"
ON public.webhook_deliveries FOR SELECT
TO authenticated
USING (
  webhook_id IN (
    SELECT id FROM public.webhooks WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Prevent user webhook delivery insert"
ON public.webhook_deliveries FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Prevent user webhook delivery update"
ON public.webhook_deliveries FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Prevent user webhook delivery delete"
ON public.webhook_deliveries FOR DELETE
TO authenticated
USING (false);

-- 5. Restrict rate_limit_buckets to service role only
CREATE POLICY "Prevent user rate limit bucket insert"
ON public.rate_limit_buckets FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Prevent user rate limit bucket update"
ON public.rate_limit_buckets FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Prevent user rate limit bucket delete"
ON public.rate_limit_buckets FOR DELETE
TO authenticated
USING (false);

-- 6. Restrict api_usage_log - users can only view their own usage
CREATE POLICY "Users can view own api usage logs"
ON public.api_usage_log FOR SELECT
TO authenticated
USING (
  api_key_id IN (
    SELECT id FROM public.api_keys WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Prevent user api usage log insert"
ON public.api_usage_log FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Prevent user api usage log update"
ON public.api_usage_log FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Prevent user api usage log delete"
ON public.api_usage_log FOR DELETE
TO authenticated
USING (false);

-- Phase 4: Security Event Logging Table

-- Create a dedicated security events table for monitoring
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  user_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for efficient querying
CREATE INDEX idx_security_events_created_at ON public.security_events(created_at DESC);
CREATE INDEX idx_security_events_event_type ON public.security_events(event_type);
CREATE INDEX idx_security_events_severity ON public.security_events(severity);
CREATE INDEX idx_security_events_user_id ON public.security_events(user_id);

-- Enable RLS on security_events
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only admins can view security events
CREATE POLICY "Admins can view security events"
ON public.security_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Prevent authenticated users from inserting (only service role)
CREATE POLICY "Prevent user security event insert"
ON public.security_events FOR INSERT
TO authenticated
WITH CHECK (false);

-- Make security events immutable
CREATE POLICY "Prevent security event update"
ON public.security_events FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Prevent security event delete"
ON public.security_events FOR DELETE
TO authenticated
USING (false);

-- Create a helper function to log security events (for use in edge functions)
CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type TEXT,
  _severity TEXT DEFAULT 'info',
  _user_id UUID DEFAULT NULL,
  _ip_address TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL,
  _details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id UUID;
BEGIN
  -- Validate severity level
  IF _severity NOT IN ('info', 'warning', 'error', 'critical') THEN
    _severity := 'info';
  END IF;
  
  INSERT INTO public.security_events (
    event_type,
    severity,
    user_id,
    ip_address,
    user_agent,
    details
  ) VALUES (
    _event_type,
    _severity,
    _user_id,
    _ip_address,
    _user_agent,
    _details
  )
  RETURNING id INTO event_id;
  
  RETURN event_id;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.log_security_event TO service_role;

-- Add comment for documentation
COMMENT ON TABLE public.security_events IS 'Stores security-relevant events for monitoring and audit purposes. Events include failed logins, rate limit hits, suspicious activity, etc.';
COMMENT ON FUNCTION public.log_security_event IS 'Helper function to log security events. Should only be called from edge functions using service role.';