-- Drop existing policies on team_members
DROP POLICY IF EXISTS "Elite users can create team members" ON public.team_members;
DROP POLICY IF EXISTS "Elite users can delete own team members" ON public.team_members;
DROP POLICY IF EXISTS "Elite users can update own team members" ON public.team_members;
DROP POLICY IF EXISTS "Elite users can view own team members" ON public.team_members;

-- Create new policies with explicit authentication checks
CREATE POLICY "Authenticated team owners can create team members"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = team_owner_id);

CREATE POLICY "Authenticated team owners can delete team members"
ON public.team_members
FOR DELETE
TO authenticated
USING (auth.uid() = team_owner_id);

CREATE POLICY "Authenticated team owners can update team members"
ON public.team_members
FOR UPDATE
TO authenticated
USING (auth.uid() = team_owner_id);

CREATE POLICY "Authenticated users can view their team members"
ON public.team_members
FOR SELECT
TO authenticated
USING ((auth.uid() = team_owner_id) OR (auth.uid() = member_user_id));