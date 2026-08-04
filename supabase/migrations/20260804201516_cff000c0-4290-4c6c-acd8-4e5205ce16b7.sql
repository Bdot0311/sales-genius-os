DROP POLICY IF EXISTS "Team owners and members can view activity log" ON public.team_activity_log;

CREATE POLICY "Team owners and members can view activity log"
ON public.team_activity_log
FOR SELECT
TO authenticated
USING (
  auth.uid() = team_owner_id
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_owner_id = team_activity_log.team_owner_id
      AND tm.member_user_id = auth.uid()
      AND tm.status = 'active'
  )
);