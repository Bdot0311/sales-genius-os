-- The table was created without Data API grants, so every insert from the app
-- failed with a permission error and no booking was ever logged.
GRANT SELECT, INSERT, UPDATE ON public.campaign_setup_requests TO authenticated;
GRANT ALL ON public.campaign_setup_requests TO service_role;

ALTER TABLE public.campaign_setup_requests
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS access_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_request_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_campaign_setup_requests_created
  ON public.campaign_setup_requests (created_at DESC);

-- Admins can create requests on a customer's behalf (outbound access asks).
DROP POLICY IF EXISTS "Admins insert setup requests" ON public.campaign_setup_requests;
CREATE POLICY "Admins insert setup requests"
  ON public.campaign_setup_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));