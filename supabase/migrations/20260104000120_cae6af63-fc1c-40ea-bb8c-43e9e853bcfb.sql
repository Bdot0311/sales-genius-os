-- Fix RLS policies for profiles table - remove any overly permissive policies
-- The current policy already correctly uses auth.uid() = id, but we'll ensure it's restrictive

-- Fix RLS for deals table to allow team member access
CREATE POLICY "Team members can view team owner deals" 
ON public.deals 
FOR SELECT 
USING (
  (auth.uid() = user_id) OR 
  (EXISTS (
    SELECT 1 FROM team_members 
    WHERE team_members.team_owner_id = deals.user_id 
    AND team_members.member_user_id = auth.uid() 
    AND team_members.status = 'active'
  ))
);

-- Drop existing restrictive SELECT policy on deals and recreate
DROP POLICY IF EXISTS "Users can view own deals" ON public.deals;