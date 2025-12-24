-- =============================================
-- FIX PROFILES TABLE RLS
-- =============================================

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Create secure policies requiring authentication
CREATE POLICY "Authenticated users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Authenticated users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Authenticated users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- =============================================
-- FIX LEADS TABLE RLS
-- =============================================

-- Ensure RLS is enabled
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view own leads" ON public.leads;

-- Create secure policies with explicit authentication
CREATE POLICY "Authenticated users can create own leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete own leads"
ON public.leads
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view own leads"
ON public.leads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);