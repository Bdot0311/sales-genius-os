-- Remove client-side UPDATE access on agency_clients.
-- Financial columns (total_earnings_cents, agency_earnings_cents,
-- monthly_value_cents, plan, status) must only be written by backend
-- logic running under service_role (Stripe webhooks, invite claim
-- edge function, etc.). Authenticated agencies never legitimately
-- update these rows from the client.
DROP POLICY IF EXISTS "Agency updates their clients" ON public.agency_clients;

-- Explicit restrictive deny so future permissive policies can't
-- accidentally re-open direct writes.
CREATE POLICY "Deny client-side update to agency_clients"
  ON public.agency_clients
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);