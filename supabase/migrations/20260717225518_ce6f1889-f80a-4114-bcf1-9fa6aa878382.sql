CREATE OR REPLACE FUNCTION public.admin_get_user_timeline(_user_id uuid)
RETURNS TABLE(event_at timestamp with time zone, event_type text, description text, meta jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT t.event_at, t.event_type, t.description, t.meta FROM (
    SELECT u.created_at AS event_at, 'signup'::text AS event_type, 'Signed up'::text AS description, jsonb_build_object('email', u.email) AS meta
      FROM auth.users u WHERE u.id = _user_id
    UNION ALL
    SELECT u.email_confirmed_at, 'email_verified', 'Verified email', '{}'::jsonb
      FROM auth.users u WHERE u.id = _user_id AND u.email_confirmed_at IS NOT NULL
    UNION ALL
    SELECT st.created_at, 'search', COALESCE(st.description, 'Ran search'), jsonb_build_object('amount', st.amount)
      FROM public.search_transactions st WHERE st.user_id = _user_id
    UNION ALL
    SELECT l.created_at, 'lead_saved', COALESCE(l.name, 'Lead saved'), jsonb_build_object('company', l.company)
      FROM public.leads l WHERE l.user_id = _user_id
    UNION ALL
    SELECT i.created_at, 'integration', 'Connected ' || i.integration_name, jsonb_build_object('id', i.integration_id)
      FROM public.integrations i WHERE i.user_id = _user_id
    UNION ALL
    SELECT COALESCE(se.sent_at, se.created_at), 'email_sent', 'Sent: ' || COALESCE(se.subject, '(no subject)'), jsonb_build_object('to', se.to_email, 'status', se.status)
      FROM public.sent_emails se WHERE se.user_id = _user_id
    UNION ALL
    SELECT lh.created_at, 'login', 'Logged in (' || COALESCE(lh.login_method,'password') || ')', jsonb_build_object('status', lh.status)
      FROM public.login_history lh WHERE lh.user_id = _user_id
  ) t
  ORDER BY t.event_at DESC NULLS LAST
  LIMIT 500;
END $function$;