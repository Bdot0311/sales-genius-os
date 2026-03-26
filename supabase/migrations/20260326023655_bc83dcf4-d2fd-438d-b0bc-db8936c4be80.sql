-- Drop the permissive user UPDATE policy on subscriptions
-- Users should NEVER be able to directly update their subscription row
-- All mutations go through SECURITY DEFINER functions or service role
DROP POLICY IF EXISTS "Users can update own subscription safe fields" ON public.subscriptions;