DROP POLICY IF EXISTS "Team members can create activity log" ON public.team_activity_log;

CREATE POLICY "Team members can create activity log"
ON public.team_activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    auth.uid() = team_owner_id
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_owner_id = team_activity_log.team_owner_id
        AND tm.member_user_id = auth.uid()
        AND COALESCE(tm.status, 'active') = 'active'
    )
  )
);