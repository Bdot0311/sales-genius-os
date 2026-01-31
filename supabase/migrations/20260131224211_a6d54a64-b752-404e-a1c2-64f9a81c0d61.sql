-- Drop the waitlist count function
DROP FUNCTION IF EXISTS public.get_waitlist_count();

-- Drop the RLS policies first
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist_signups;
DROP POLICY IF EXISTS "Admins can view all waitlist signups" ON public.waitlist_signups;
DROP POLICY IF EXISTS "Admins can delete waitlist signups" ON public.waitlist_signups;

-- Drop the waitlist_signups table
DROP TABLE IF EXISTS public.waitlist_signups;