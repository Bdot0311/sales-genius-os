
-- 1) email_send_log: consolidate redundant policies
DROP POLICY IF EXISTS "Admins can read email send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
-- Keep the single restrictive policy "Restrict email_send_log to admins" which already
-- allows service_role OR admin for all commands.

-- 2) message_blocks: remove reciprocal team share clause
DROP POLICY IF EXISTS "Users can view own or team shared blocks" ON public.message_blocks;
CREATE POLICY "Users can view own or team shared blocks"
ON public.message_blocks
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    is_shared = true
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_owner_id = message_blocks.user_id
        AND team_members.member_user_id = auth.uid()
        AND team_members.status = 'active'
    )
  )
);
