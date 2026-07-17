
-- 1. TABLE
CREATE TABLE public.user_activation (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  verified_email_at timestamptz,
  completed_onboarding_at timestamptz,
  first_search_at timestamptz,
  first_lead_saved_at timestamptz,
  mailbox_connected_at timestamptz,
  first_email_sent_at timestamptz,
  cohort text NOT NULL DEFAULT 'tire_kicker',
  current_stage text NOT NULL DEFAULT 'signed_up',
  milestones_hit int NOT NULL DEFAULT 0,
  last_nudge_sent text,
  last_nudge_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_activation TO authenticated;
GRANT ALL ON public.user_activation TO service_role;
ALTER TABLE public.user_activation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own activation" ON public.user_activation
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_activation_signed_up ON public.user_activation(signed_up_at DESC);
CREATE INDEX idx_user_activation_cohort ON public.user_activation(cohort);

-- 2. RECOMPUTE HELPER
CREATE OR REPLACE FUNCTION public.recompute_activation(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.user_activation;
  hits int := 0;
  new_stage text;
  new_cohort text;
BEGIN
  SELECT * INTO r FROM public.user_activation WHERE user_id = _user_id;
  IF NOT FOUND THEN RETURN; END IF;

  hits := (r.verified_email_at IS NOT NULL)::int
        + (r.completed_onboarding_at IS NOT NULL)::int
        + (r.first_search_at IS NOT NULL)::int
        + (r.first_lead_saved_at IS NOT NULL)::int
        + (r.mailbox_connected_at IS NOT NULL)::int
        + (r.first_email_sent_at IS NOT NULL)::int;

  new_stage := CASE
    WHEN r.first_email_sent_at IS NOT NULL THEN 'first_email_sent'
    WHEN r.mailbox_connected_at IS NOT NULL THEN 'mailbox_connected'
    WHEN r.first_lead_saved_at IS NOT NULL THEN 'first_lead_saved'
    WHEN r.first_search_at IS NOT NULL THEN 'first_search'
    WHEN r.completed_onboarding_at IS NOT NULL THEN 'completed_onboarding'
    WHEN r.verified_email_at IS NOT NULL THEN 'verified_email'
    ELSE 'signed_up'
  END;

  new_cohort := CASE
    WHEN hits >= 6 THEN 'power'
    WHEN hits >= 4 THEN 'active'
    WHEN hits >= 2 THEN 'explorer'
    ELSE 'tire_kicker'
  END;

  UPDATE public.user_activation
    SET milestones_hit = hits,
        current_stage = new_stage,
        cohort = new_cohort,
        updated_at = now()
    WHERE user_id = _user_id;
END;
$$;

-- 3. TRIGGERS
CREATE OR REPLACE FUNCTION public.trg_activation_ensure_row(_uid uuid, _signed_up timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.user_activation (user_id, signed_up_at)
  VALUES (_uid, COALESCE(_signed_up, now()))
  ON CONFLICT (user_id) DO NOTHING;
$$;

-- On new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_activation (user_id, signed_up_at, verified_email_at)
  VALUES (NEW.id, COALESCE(NEW.created_at, now()), NEW.email_confirmed_at)
  ON CONFLICT (user_id) DO UPDATE
    SET verified_email_at = COALESCE(public.user_activation.verified_email_at, EXCLUDED.verified_email_at);
  PERFORM public.recompute_activation(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_activation ON auth.users;
CREATE TRIGGER on_auth_user_created_activation
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_activation();

-- search_transactions
CREATE OR REPLACE FUNCTION public.trg_activation_search()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET first_search_at = COALESCE(first_search_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND first_search_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activation_search ON public.search_transactions;
CREATE TRIGGER trg_activation_search AFTER INSERT ON public.search_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_activation_search();

-- leads
CREATE OR REPLACE FUNCTION public.trg_activation_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET first_lead_saved_at = COALESCE(first_lead_saved_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND first_lead_saved_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activation_lead ON public.leads;
CREATE TRIGGER trg_activation_lead AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_activation_lead();

-- integrations (Gmail)
CREATE OR REPLACE FUNCTION public.trg_activation_integration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.integration_id IN ('gmail','google') THEN
    PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
    UPDATE public.user_activation
      SET mailbox_connected_at = COALESCE(mailbox_connected_at, NEW.created_at, now())
      WHERE user_id = NEW.user_id AND mailbox_connected_at IS NULL;
    PERFORM public.recompute_activation(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activation_integration ON public.integrations;
CREATE TRIGGER trg_activation_integration AFTER INSERT ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.trg_activation_integration();

-- sent_emails
CREATE OR REPLACE FUNCTION public.trg_activation_sent_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET first_email_sent_at = COALESCE(first_email_sent_at, NEW.sent_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND first_email_sent_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activation_sent_email ON public.sent_emails;
CREATE TRIGGER trg_activation_sent_email AFTER INSERT ON public.sent_emails
  FOR EACH ROW EXECUTE FUNCTION public.trg_activation_sent_email();

-- onboarding
CREATE OR REPLACE FUNCTION public.trg_activation_onboarding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE done boolean;
BEGIN
  done := NEW.completed_profile AND NEW.completed_tour;
  IF done THEN
    PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
    UPDATE public.user_activation
      SET completed_onboarding_at = COALESCE(completed_onboarding_at, NEW.updated_at, now())
      WHERE user_id = NEW.user_id AND completed_onboarding_at IS NULL;
    PERFORM public.recompute_activation(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activation_onboarding ON public.onboarding_progress;
CREATE TRIGGER trg_activation_onboarding AFTER INSERT OR UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.trg_activation_onboarding();

-- 4. BACKFILL
INSERT INTO public.user_activation (user_id, signed_up_at, verified_email_at)
SELECT u.id, u.created_at, u.email_confirmed_at FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.user_activation ua SET first_search_at = s.t FROM (
  SELECT user_id, MIN(created_at) AS t FROM public.search_transactions GROUP BY user_id
) s WHERE ua.user_id = s.user_id AND ua.first_search_at IS NULL;

UPDATE public.user_activation ua SET first_lead_saved_at = s.t FROM (
  SELECT user_id, MIN(created_at) AS t FROM public.leads GROUP BY user_id
) s WHERE ua.user_id = s.user_id AND ua.first_lead_saved_at IS NULL;

UPDATE public.user_activation ua SET mailbox_connected_at = s.t FROM (
  SELECT user_id, MIN(created_at) AS t FROM public.integrations
   WHERE integration_id IN ('gmail','google') GROUP BY user_id
) s WHERE ua.user_id = s.user_id AND ua.mailbox_connected_at IS NULL;

UPDATE public.user_activation ua SET first_email_sent_at = s.t FROM (
  SELECT user_id, MIN(COALESCE(sent_at, created_at)) AS t FROM public.sent_emails GROUP BY user_id
) s WHERE ua.user_id = s.user_id AND ua.first_email_sent_at IS NULL;

UPDATE public.user_activation ua SET completed_onboarding_at = s.t FROM (
  SELECT user_id, updated_at AS t FROM public.onboarding_progress
   WHERE completed_profile AND completed_tour
) s WHERE ua.user_id = s.user_id AND ua.completed_onboarding_at IS NULL;

-- Recompute for all
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT user_id FROM public.user_activation LOOP
    PERFORM public.recompute_activation(r.user_id);
  END LOOP;
END $$;

-- 5. ADMIN RPCs

CREATE OR REPLACE FUNCTION public.admin_get_activation_funnel(_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _since timestamptz;
  _res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  _since := now() - make_interval(days => GREATEST(LEAST(_days, 365), 1));

  SELECT jsonb_build_object(
    'range_days', _days,
    'funnel', jsonb_build_object(
      'signed_up', COUNT(*),
      'verified_email', COUNT(*) FILTER (WHERE verified_email_at IS NOT NULL),
      'completed_onboarding', COUNT(*) FILTER (WHERE completed_onboarding_at IS NOT NULL),
      'first_search', COUNT(*) FILTER (WHERE first_search_at IS NOT NULL),
      'first_lead_saved', COUNT(*) FILTER (WHERE first_lead_saved_at IS NOT NULL),
      'mailbox_connected', COUNT(*) FILTER (WHERE mailbox_connected_at IS NOT NULL),
      'first_email_sent', COUNT(*) FILTER (WHERE first_email_sent_at IS NOT NULL)
    ),
    'cohorts', jsonb_build_object(
      'tire_kicker', COUNT(*) FILTER (WHERE cohort = 'tire_kicker'),
      'explorer', COUNT(*) FILTER (WHERE cohort = 'explorer'),
      'active', COUNT(*) FILTER (WHERE cohort = 'active'),
      'power', COUNT(*) FILTER (WHERE cohort = 'power')
    )
  ) INTO _res
  FROM public.user_activation
  WHERE signed_up_at >= _since;
  RETURN _res;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_activation_users(_days int DEFAULT 30, _cohort text DEFAULT NULL, _limit int DEFAULT 200)
RETURNS TABLE(
  user_id uuid, email text, full_name text, signed_up_at timestamptz,
  cohort text, current_stage text, milestones_hit int,
  verified_email_at timestamptz, completed_onboarding_at timestamptz,
  first_search_at timestamptz, first_lead_saved_at timestamptz,
  mailbox_connected_at timestamptz, first_email_sent_at timestamptz,
  plan text, days_since_signup int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _since timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  _since := now() - make_interval(days => GREATEST(LEAST(_days, 365), 1));
  RETURN QUERY
  SELECT ua.user_id, p.email, p.full_name, ua.signed_up_at,
         ua.cohort, ua.current_stage, ua.milestones_hit,
         ua.verified_email_at, ua.completed_onboarding_at,
         ua.first_search_at, ua.first_lead_saved_at,
         ua.mailbox_connected_at, ua.first_email_sent_at,
         COALESCE(s.plan::text, 'free'),
         GREATEST(0, EXTRACT(day FROM (now() - ua.signed_up_at))::int)
  FROM public.user_activation ua
  LEFT JOIN public.profiles p ON p.id = ua.user_id
  LEFT JOIN public.subscriptions s ON s.user_id = ua.user_id
  WHERE ua.signed_up_at >= _since
    AND (_cohort IS NULL OR ua.cohort = _cohort)
  ORDER BY ua.signed_up_at DESC
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_user_timeline(_user_id uuid)
RETURNS TABLE(event_at timestamptz, event_type text, description text, meta jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT u.created_at, 'signup'::text, 'Signed up'::text, jsonb_build_object('email', u.email)
      FROM auth.users u WHERE u.id = _user_id
    UNION ALL
    SELECT u.email_confirmed_at, 'email_verified', 'Verified email', '{}'::jsonb
      FROM auth.users u WHERE u.id = _user_id AND u.email_confirmed_at IS NOT NULL
    UNION ALL
    SELECT created_at, 'search', COALESCE(description, 'Ran search'), jsonb_build_object('amount', amount)
      FROM public.search_transactions WHERE user_id = _user_id
    UNION ALL
    SELECT created_at, 'lead_saved', COALESCE(name, 'Lead saved'), jsonb_build_object('company', company)
      FROM public.leads WHERE user_id = _user_id
    UNION ALL
    SELECT created_at, 'integration', 'Connected ' || integration_name, jsonb_build_object('id', integration_id)
      FROM public.integrations WHERE user_id = _user_id
    UNION ALL
    SELECT COALESCE(sent_at, created_at), 'email_sent', 'Sent: ' || COALESCE(subject, '(no subject)'), jsonb_build_object('to', to_email, 'status', status)
      FROM public.sent_emails WHERE user_id = _user_id
    UNION ALL
    SELECT created_at, 'login', 'Logged in (' || COALESCE(login_method,'password') || ')', jsonb_build_object('status', status)
      FROM public.login_history WHERE user_id = _user_id
  ) t
  ORDER BY event_at DESC NULLS LAST
  LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_activation_dropoff_alerts()
RETURNS TABLE(user_id uuid, email text, signed_up_at timestamptz, days_since int, current_stage text, milestones_hit int, alert_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT ua.user_id, p.email, ua.signed_up_at,
    EXTRACT(day FROM (now() - ua.signed_up_at))::int,
    ua.current_stage, ua.milestones_hit,
    CASE
      WHEN ua.milestones_hit >= 5 AND COALESCE(s.plan::text,'free') = 'free' THEN 'hot_lead_unpaid'
      WHEN ua.milestones_hit <= 1 AND ua.signed_up_at < now() - interval '7 days' THEN 'dead_cohort'
      WHEN ua.first_search_at IS NULL AND ua.signed_up_at < now() - interval '3 days' THEN 'no_first_search'
      ELSE 'other'
    END
  FROM public.user_activation ua
  LEFT JOIN public.profiles p ON p.id = ua.user_id
  LEFT JOIN public.subscriptions s ON s.user_id = ua.user_id
  WHERE ua.signed_up_at < now() - interval '3 days'
    AND ua.signed_up_at > now() - interval '60 days'
    AND (
      (ua.milestones_hit >= 5 AND COALESCE(s.plan::text,'free') = 'free')
      OR (ua.milestones_hit <= 1 AND ua.signed_up_at < now() - interval '7 days')
      OR (ua.first_search_at IS NULL AND ua.signed_up_at < now() - interval '3 days')
    )
  ORDER BY ua.signed_up_at DESC
  LIMIT 500;
END $$;
