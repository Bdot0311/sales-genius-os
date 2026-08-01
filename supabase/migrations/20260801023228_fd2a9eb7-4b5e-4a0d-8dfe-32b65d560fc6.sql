DROP POLICY IF EXISTS "Authenticated team owners can update team members" ON public.team_members;

CREATE POLICY "Authenticated team owners can update team members"
ON public.team_members
FOR UPDATE
TO authenticated
USING (auth.uid() = team_owner_id)
WITH CHECK (auth.uid() = team_owner_id);