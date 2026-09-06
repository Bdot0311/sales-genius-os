-- The activation funnel measured the wrong things, then drew them as a funnel.
--
-- What the admin panel showed: Signed up 12, Verified 12, Onboarded 3 (-75%),
-- First search 5, First lead saved 5, Mailbox connected 2. A funnel in which a
-- later step has MORE users than an earlier one is not a funnel, and the drop-off
-- arithmetic in the UI silently hid the increase, so the chart looked plausible
-- while being wrong in five separate ways.
--
-- Each one is a real defect, not a display quirk:
--
--   1. FIRST SEARCH counted AI usage, not searches. charge_ai_usage() writes a
--      row into search_transactions for EVERY AI call — email generation, agent
--      chat, research — with description 'AI usage: <fn>'. The trigger fired on
--      any insert into that table, so generating one email marked a user as
--      having run a lead search. The authoritative record of a lead search is
--      search_usage_events (written by fetch-external-leads); it was unused.
--
--   2. FIRST LEAD SAVED and FIRST EMAIL SENT counted demo data. Both triggers
--      fired on any insert, and admin-demo-data / agent-test insert rows with
--      demo_seed = true. Seeding a demo account marked that user as having saved
--      a lead and sent an email. Fake activity, counted as activation.
--
--   3. ONBOARDED required finishing the guided product tour
--      (completed_profile AND completed_tour). Users skip tours. That is why it
--      read 3 while 5 had already searched — it was never a gate anyone had to
--      pass, so it does not belong in the funnel chain at all. It is a real
--      signal, so it is kept and reported, just not as a step people "drop off"
--      at. It is also now NULL-safe: `a AND b` is NULL when either side is NULL,
--      and `IF NULL THEN` is silently false.
--
--   4. MAILBOX CONNECTED watched only the integrations table. sending_accounts
--      is the table that decides whether a mailbox can actually send, and it is
--      written on a path integrations is not.
--
--   5. THE FUNNEL WAS NOT CUMULATIVE. Every step was an independent
--      COUNT(*) FILTER, so the steps were unordered tallies with drop-off
--      percentages drawn between them. Fixed below by counting how many users
--      reached each stage OR BEYOND, which is monotonic by construction.
--
-- The raw independent counts are still returned alongside, as 'ever', so
-- nothing this migration changes is hidden — where the two disagree the admin
-- can see both numbers.


-- =============================================================
-- 1. Stage ordering, in one place.
-- =============================================================
--
-- The funnel chain is the sequence a user actually has to walk. Onboarding is
-- deliberately NOT in it (see defect 3), so the chain is six ranks, not seven.
CREATE OR REPLACE FUNCTION public.activation_stage_rank(_stage text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _stage
    WHEN 'signed_up'         THEN 1
    WHEN 'verified_email'    THEN 2
    WHEN 'first_search'      THEN 3
    WHEN 'first_lead_saved'  THEN 4
    WHEN 'mailbox_connected' THEN 5
    WHEN 'first_email_sent'  THEN 6
    ELSE 1
  END;
$$;

COMMENT ON FUNCTION public.activation_stage_rank(text) IS
  'Order of the activation funnel chain. Onboarding is not a rank: users routinely search without completing the profile or tour, so it is a side milestone rather than a gate.';


-- =============================================================
-- 2. Recompute, over the corrected stage chain.
-- =============================================================
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

  -- Onboarding still counts toward milestones_hit — it is real engagement —
  -- it just is not a funnel rank.
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


-- =============================================================
-- 3. Milestone triggers, pointed at the right sources.
-- =============================================================

-- FIRST SEARCH — the real one.
-- search_usage_events is written by fetch-external-leads for every lead search.
CREATE OR REPLACE FUNCTION public.trg_activation_search_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.search_type, '') <> 'lead_search' THEN RETURN NEW; END IF;
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET first_search_at = COALESCE(first_search_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND first_search_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_activation_search_event ON public.search_usage_events;
CREATE TRIGGER trg_activation_search_event AFTER INSERT ON public.search_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_activation_search_event();

-- The credit ledger stays a fallback source, because it predates
-- search_usage_events and holds genuine historical searches. It just no longer
-- counts AI usage as a search.
CREATE OR REPLACE FUNCTION public.trg_activation_search()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- charge_ai_usage() writes 'AI usage: <fn>' here for every AI call. Those are
  -- not searches; counting them was defect 1.
  IF COALESCE(NEW.description, '') LIKE 'AI usage:%' THEN RETURN NEW; END IF;
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET first_search_at = COALESCE(first_search_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND first_search_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;

-- FIRST LEAD SAVED — real leads only.
CREATE OR REPLACE FUNCTION public.trg_activation_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.demo_seed, false) THEN RETURN NEW; END IF;
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET first_lead_saved_at = COALESCE(first_lead_saved_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND first_lead_saved_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;

-- FIRST EMAIL SENT — real sends only.
CREATE OR REPLACE FUNCTION public.trg_activation_sent_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.demo_seed, false) THEN RETURN NEW; END IF;
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET first_email_sent_at = COALESCE(first_email_sent_at, NEW.sent_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND first_email_sent_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;

-- MAILBOX CONNECTED — also from sending_accounts, which is what actually sends.
CREATE OR REPLACE FUNCTION public.trg_activation_sending_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.demo_seed, false) THEN RETURN NEW; END IF;
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET mailbox_connected_at = COALESCE(mailbox_connected_at, NEW.created_at, now())
    WHERE user_id = NEW.user_id AND mailbox_connected_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_activation_sending_account ON public.sending_accounts;
CREATE TRIGGER trg_activation_sending_account AFTER INSERT ON public.sending_accounts
  FOR EACH ROW EXECUTE FUNCTION public.trg_activation_sending_account();

-- ONBOARDING — NULL-safe, and no longer requires finishing the tour.
CREATE OR REPLACE FUNCTION public.trg_activation_onboarding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT COALESCE(NEW.completed_profile, false) THEN RETURN NEW; END IF;
  PERFORM public.trg_activation_ensure_row(NEW.user_id, NULL);
  UPDATE public.user_activation
    SET completed_onboarding_at = COALESCE(completed_onboarding_at, NEW.updated_at, now())
    WHERE user_id = NEW.user_id AND completed_onboarding_at IS NULL;
  PERFORM public.recompute_activation(NEW.user_id);
  RETURN NEW;
END $$;


-- =============================================================
-- 4. Correct the history.
-- =============================================================
--
-- The stored timestamps are known-polluted: AI calls recorded as searches, demo
-- rows recorded as real activity. So these are recomputed from source rather
-- than filled in where NULL — a COALESCE backfill would preserve exactly the
-- wrong values. Every milestone below is derived, so recomputing is safe.
UPDATE public.user_activation ua SET
  first_search_at = LEAST(
    (SELECT MIN(e.created_at) FROM public.search_usage_events e
      WHERE e.user_id = ua.user_id AND e.search_type = 'lead_search'),
    (SELECT MIN(t.created_at) FROM public.search_transactions t
      WHERE t.user_id = ua.user_id AND COALESCE(t.description, '') NOT LIKE 'AI usage:%')
  ),
  first_lead_saved_at = (
    SELECT MIN(l.created_at) FROM public.leads l
     WHERE l.user_id = ua.user_id AND NOT COALESCE(l.demo_seed, false)),
  first_email_sent_at = (
    SELECT MIN(COALESCE(se.sent_at, se.created_at)) FROM public.sent_emails se
     WHERE se.user_id = ua.user_id AND NOT COALESCE(se.demo_seed, false)),
  mailbox_connected_at = LEAST(
    (SELECT MIN(i.created_at) FROM public.integrations i
      WHERE i.user_id = ua.user_id AND i.integration_id IN ('gmail','google')),
    (SELECT MIN(sa.created_at) FROM public.sending_accounts sa
      WHERE sa.user_id = ua.user_id AND NOT COALESCE(sa.demo_seed, false))
  ),
  completed_onboarding_at = (
    SELECT MIN(op.updated_at) FROM public.onboarding_progress op
     WHERE op.user_id = ua.user_id AND COALESCE(op.completed_profile, false));

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT user_id FROM public.user_activation LOOP
    PERFORM public.recompute_activation(r.user_id);
  END LOOP;
END $$;


-- =============================================================
-- 5. A funnel that is actually a funnel.
-- =============================================================
-- Dropped, not replaced. Adding a defaulted parameter creates an OVERLOAD:
-- both admin_get_activation_funnel(int) and (int, boolean) would exist, and the
-- frontend's one-argument call resolves to neither —
-- "function public.admin_get_activation_funnel(integer) is not unique".
-- Same for the users list. Caught by running this migration against the real
-- schema instead of assuming CREATE OR REPLACE replaces a changed signature.
DROP FUNCTION IF EXISTS public.admin_get_activation_funnel(int);
DROP FUNCTION IF EXISTS public.admin_list_activation_users(int, text, int);

CREATE OR REPLACE FUNCTION public.admin_get_activation_funnel(
  _days int DEFAULT 30,
  _include_internal boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _since timestamptz;
  _clamped int;
  _res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  -- Reported back as range_days. The old version echoed the raw argument while
  -- querying the clamped one, so asking for 9999 days claimed a 9999-day range.
  _clamped := GREATEST(LEAST(_days, 365), 1);
  _since := now() - make_interval(days => _clamped);

  WITH scoped AS (
    SELECT ua.*, public.activation_stage_rank(ua.current_stage) AS rank
      FROM public.user_activation ua
     WHERE ua.signed_up_at >= _since
       -- Internal accounts skew a cohort this small badly: on a base of twelve
       -- signups, two admin test accounts move every percentage by ~17 points.
       AND (_include_internal OR NOT public.has_role(ua.user_id, 'admin'))
  )
  SELECT jsonb_build_object(
    'range_days', _clamped,
    'generated_at', now(),
    'include_internal', _include_internal,
    'excluded_internal', (
      SELECT COUNT(*) FROM public.user_activation ua
       WHERE ua.signed_up_at >= _since AND public.has_role(ua.user_id, 'admin')),
    -- Cumulative: users who reached this stage OR BEYOND. Monotonic by
    -- construction, which is what makes the drop-off percentages mean anything.
    'funnel', jsonb_build_object(
      'signed_up',         COUNT(*),
      'verified_email',    COUNT(*) FILTER (WHERE rank >= 2),
      'first_search',      COUNT(*) FILTER (WHERE rank >= 3),
      'first_lead_saved',  COUNT(*) FILTER (WHERE rank >= 4),
      'mailbox_connected', COUNT(*) FILTER (WHERE rank >= 5),
      'first_email_sent',  COUNT(*) FILTER (WHERE rank >= 6)
    ),
    -- The independent tallies, unchanged in meaning from the old version. Kept
    -- so the cumulative view never hides a user who skipped a step.
    'ever', jsonb_build_object(
      'verified_email',    COUNT(*) FILTER (WHERE verified_email_at IS NOT NULL),
      'first_search',      COUNT(*) FILTER (WHERE first_search_at IS NOT NULL),
      'first_lead_saved',  COUNT(*) FILTER (WHERE first_lead_saved_at IS NOT NULL),
      'mailbox_connected', COUNT(*) FILTER (WHERE mailbox_connected_at IS NOT NULL),
      'first_email_sent',  COUNT(*) FILTER (WHERE first_email_sent_at IS NOT NULL)
    ),
    -- Not a funnel step. Reported on its own so it stops distorting the chain.
    'onboarding', jsonb_build_object(
      'completed_profile', COUNT(*) FILTER (WHERE completed_onboarding_at IS NOT NULL)
    ),
    'cohorts', jsonb_build_object(
      'tire_kicker', COUNT(*) FILTER (WHERE cohort = 'tire_kicker'),
      'explorer',    COUNT(*) FILTER (WHERE cohort = 'explorer'),
      'active',      COUNT(*) FILTER (WHERE cohort = 'active'),
      'power',       COUNT(*) FILTER (WHERE cohort = 'power')
    )
  ) INTO _res
  FROM scoped;
  RETURN _res;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_activation_users(
  _days int DEFAULT 30,
  _cohort text DEFAULT NULL,
  _limit int DEFAULT 200,
  _include_internal boolean DEFAULT false
)
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
    AND (_include_internal OR NOT public.has_role(ua.user_id, 'admin'))
  ORDER BY ua.signed_up_at DESC
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
END $$;

-- Trigger-only SECURITY DEFINER helpers; nothing should call them directly.
REVOKE EXECUTE ON FUNCTION public.trg_activation_search_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_activation_sending_account() FROM PUBLIC, anon, authenticated;