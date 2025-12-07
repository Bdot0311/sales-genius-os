-- Fix system_events INSERT policy to only allow service role
DROP POLICY IF EXISTS "Service role can insert system events" ON public.system_events;

CREATE POLICY "Service role can insert system events"
ON public.system_events
FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);