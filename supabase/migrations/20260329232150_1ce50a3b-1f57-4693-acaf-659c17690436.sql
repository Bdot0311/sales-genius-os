-- Fix: Remove user-facing INSERT policy on search_transactions, restrict to service_role only
DROP POLICY IF EXISTS "Users can create own search transactions" ON public.search_transactions;

CREATE POLICY "Service role can insert search transactions"
ON public.search_transactions
FOR INSERT
TO public
WITH CHECK (auth.role() = 'service_role');