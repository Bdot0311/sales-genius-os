CREATE OR REPLACE FUNCTION public.admin_get_user_timeline(_user_id uuid)
RETURNS TABLE(event_at timestamp with time zone, event_type text, description text, meta jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT t.event_at, t.event_type, t.event_description AS description, t.meta
  FROM (
    SELECT
      u.created_at AS event_at,
      'signup'::text AS event_type,
      'Signed up'::text AS event_description,
      jsonb_build_object('email', u.email) AS meta
    FROM auth.users u
    WHERE u.id = _user_id

    UNION ALL

    SELECT
      u.email_confirmed_at AS event_at,
      'email_verified'::text AS event_type,
      'Verified email'::text AS event_description,
      '{}'::jsonb AS meta
    FROM auth.users u
    WHERE u.id = _user_id
      AND u.email_confirmed_at IS NOT NULL

    UNION ALL

    SELECT
      st.created_at AS event_at,
      'search'::text AS event_type,
      COALESCE(st.description, 'Ran search')::text AS event_description,
      jsonb_build_object('amount', st.amount, 'type', st.type) AS meta
    FROM public.search_transactions st
    WHERE st.user_id = _user_id

    UNION ALL

    SELECT
      l.created_at AS event_at,
      'lead_saved'::text AS event_type,
      COALESCE(l.contact_name, l.contact_email, l.company_name, 'Lead saved')::text AS event_description,
      jsonb_build_object(
        'company', l.company_name,
        'email', l.contact_email,
        'status', l.lead_status,
        'source', l.source
      ) AS meta
    FROM public.leads l
    WHERE l.user_id = _user_id

    UNION ALL

    SELECT
      i.created_at AS event_at,
      'integration'::text AS event_type,
      ('Connected ' || COALESCE(i.integration_name, i.integration_id, 'integration'))::text AS event_description,
      jsonb_build_object('id', i.integration_id, 'email', i.connected_email) AS meta
    FROM public.integrations i
    WHERE i.user_id = _user_id

    UNION ALL

    SELECT
      COALESCE(se.sent_at, se.created_at) AS event_at,
      'email_sent'::text AS event_type,
      ('Sent: ' || COALESCE(se.subject, '(no subject)'))::text AS event_description,
      jsonb_build_object('to', se.to_email, 'status', se.status) AS meta
    FROM public.sent_emails se
    WHERE se.user_id = _user_id

    UNION ALL

    SELECT
      lh.created_at AS event_at,
      'login'::text AS event_type,
      ('Logged in (' || COALESCE(lh.login_method, 'password') || ')')::text AS event_description,
      jsonb_build_object('status', lh.status) AS meta
    FROM public.login_history lh
    WHERE lh.user_id = _user_id
  ) t
  ORDER BY t.event_at DESC NULLS LAST
  LIMIT 500;
END;
$$;