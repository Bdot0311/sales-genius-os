-- 1. Fix subscription INSERT policy: restrict to free plan only
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;

CREATE POLICY "Users can insert own free subscription"
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND plan = 'free'
  AND leads_limit = 0
  AND search_credits_base = 0
  AND search_credits_remaining = 0
  AND status = 'active'
  AND account_status = 'active'
  AND stripe_customer_id IS NULL
  AND stripe_subscription_id IS NULL
);

-- 2. Fix message_blocks shared exposure: scope to team members only
DROP POLICY IF EXISTS "Users can view own or shared blocks" ON public.message_blocks;

CREATE POLICY "Users can view own or team shared blocks"
ON public.message_blocks
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    is_shared = true
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_owner_id = message_blocks.user_id
        AND team_members.member_user_id = auth.uid()
        AND team_members.status = 'active'
    )
  )
  OR (
    is_shared = true
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.member_user_id = message_blocks.user_id
        AND team_members.team_owner_id = auth.uid()
        AND team_members.status = 'active'
    )
  )
);

-- 3. Fix function search path mutable for affected functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;