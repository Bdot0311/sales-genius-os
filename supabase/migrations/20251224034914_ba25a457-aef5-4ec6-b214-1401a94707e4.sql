-- Fix profiles table: Add policy to deny anonymous access
CREATE POLICY "Profiles require authentication for viewing"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Drop existing profile policies that might be too permissive
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Add team member access to companies table
CREATE POLICY "Team members can view team owner companies"
ON public.companies
FOR SELECT
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM team_members 
    WHERE team_members.team_owner_id = companies.user_id 
    AND team_members.member_user_id = auth.uid()
    AND team_members.status = 'active'
  )
);