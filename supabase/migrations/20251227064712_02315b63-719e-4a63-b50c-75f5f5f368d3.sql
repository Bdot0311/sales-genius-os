-- Remove duplicate RLS policies on profiles table
-- Keep the cleaner "Authenticated users can..." naming convention

-- Drop duplicate SELECT policy
DROP POLICY IF EXISTS "Users can only view their own profile" ON public.profiles;

-- Drop duplicate UPDATE policy  
DROP POLICY IF EXISTS "Users can only update their own profile" ON public.profiles;