-- Create a function to get waitlist count (publicly accessible, returns only count, no PII)
CREATE OR REPLACE FUNCTION public.get_waitlist_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM waitlist_signups;
$$;