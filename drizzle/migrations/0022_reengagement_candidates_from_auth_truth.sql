-- profiles.last_sign_in_at is only written by public.record_user_login, which the
-- client calls on password sign-in. Every other way in (OAuth, restored session,
-- magic link) left it NULL, so 32 of 46 accounts looked like they had never
-- signed in. The re-engagement sweep filtered on that column, so it swept the
-- same ~12 people every day and never saw anyone else. auth.users is the truth.

-- One-time repair so the admin views read correctly too.
UPDATE public.profiles p
SET last_sign_in_at = u.last_sign_in_at
FROM auth.users u
WHERE u.id = p.id
  AND u.last_sign_in_at IS NOT NULL
  AND (p.last_sign_in_at IS NULL OR p.last_sign_in_at < u.last_sign_in_at);

-- The sweep's candidate list, read straight from auth.users.
-- never_signed_in accounts are included and measured from signup instead, so a
-- signup that never opened the app is no longer invisible.
CREATE OR REPLACE FUNCTION public.reengagement_candidates(p_inactive_days integer DEFAULT 1, p_limit integer DEFAULT 1500)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  never_signed_in boolean,
  days_inactive integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.full_name,
    u.last_sign_in_at,
    p.created_at,
    u.last_sign_in_at IS NULL AS never_signed_in,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(u.last_sign_in_at, p.created_at))) / 86400))::int AS days_inactive
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.email IS NOT NULL
    AND u.deleted_at IS NULL
    AND COALESCE(u.last_sign_in_at, p.created_at) < now() - make_interval(days => GREATEST(p_inactive_days, 0))
  ORDER BY COALESCE(u.last_sign_in_at, p.created_at) ASC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.reengagement_candidates(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reengagement_candidates(integer, integer) TO service_role;
