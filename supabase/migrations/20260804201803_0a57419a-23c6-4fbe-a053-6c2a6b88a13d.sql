DROP POLICY IF EXISTS "Users can create their own search usage events" ON public.search_usage_events;

CREATE POLICY "Users can create their own search usage events"
ON public.search_usage_events
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_admin = false
);

-- Client code never updates usage events; only the service role does.
-- Remove the unused UPDATE grant so the surface matches the policies.
REVOKE UPDATE ON public.search_usage_events FROM authenticated;