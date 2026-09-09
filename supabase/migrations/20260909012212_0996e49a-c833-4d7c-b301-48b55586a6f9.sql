CREATE OR REPLACE FUNCTION public.admin_list_signup_responses(_limit int DEFAULT 500)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  channel text,
  discovery_channel text,
  discovery_channel_other text,
  role text,
  company_type text,
  team_size text,
  goals jsonb,
  current_tooling text,
  monthly_prospect_volume text,
  completed_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.user_id,
    p.email,
    p.full_name,
    COALESCE(NULLIF(TRIM(COALESCE(r.discovery_channel_other, r.discovery_channel)), ''), 'Unknown') AS channel,
    r.discovery_channel,
    r.discovery_channel_other,
    r.role,
    r.company_type,
    r.team_size,
    r.goals,
    r.current_tooling,
    r.monthly_prospect_volume,
    r.completed_at,
    r.created_at
  FROM public.onboarding_responses r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY COALESCE(r.completed_at, r.created_at) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 500), 2000));
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_signup_responses(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_signup_responses(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_signup_response(
  _id uuid,
  _discovery_channel text DEFAULT NULL,
  _discovery_channel_other text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  UPDATE public.onboarding_responses
     SET discovery_channel = NULLIF(TRIM(COALESCE(_discovery_channel, '')), ''),
         discovery_channel_other = NULLIF(TRIM(COALESCE(_discovery_channel_other, '')), ''),
         updated_at = now()
   WHERE id = _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_signup_response(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_signup_response(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_signup_response(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  DELETE FROM public.onboarding_responses WHERE id = _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_signup_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_signup_response(uuid) TO authenticated;