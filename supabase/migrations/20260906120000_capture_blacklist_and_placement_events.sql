-- The timeline was built to show seven things nothing ever wrote.
--
-- EventTimeline renders sixteen event types. Eight are produced: mailbox
-- added/removed/paused/resumed, limit changed, warmup started/completed, auth
-- record changed, and quarantined. The other seven were styled, iconed and
-- unreachable — among them the two that matter most for explaining a chart.
--
-- A blacklist listing is the single largest thing that can happen to a
-- sender's deliverability, and the sweep that finds it raised an alert and
-- wrote nothing to the timeline. So placement could fall off a cliff on the day
-- a domain got listed and "What changed" would say nothing changed.
--
-- Same for a placement test: the seed test is the one deliberate act a user
-- performs on this page, and it left no trace on the record of what they did.
--
-- Triggers rather than inserts inside the edge functions, for the reason the
-- first capture migration gives: a listing can be recorded by the nightly
-- sweep, by an on-demand check, or by a path nobody has written yet, and a
-- trigger catches all of them.

CREATE OR REPLACE FUNCTION public.record_blacklist_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_listed boolean;
BEGIN
  -- What the previous check on this exact target and RBL said. Only a CHANGE
  -- of verdict is an event: the sweep runs nightly, and a domain that has been
  -- clean for a month must not write a "cleared" row every single night.
  SELECT b.listed INTO v_was_listed
  FROM public.blacklist_checks b
  WHERE b.user_id = NEW.user_id
    AND b.target = NEW.target
    AND b.rbl_name = NEW.rbl_name
    AND b.id <> NEW.id
  ORDER BY b.checked_at DESC
  LIMIT 1;

  -- First ever check of this target. A listing found on the first look is
  -- news; a clean first look is just the baseline.
  IF v_was_listed IS NULL THEN
    IF NOT NEW.listed THEN RETURN NEW; END IF;
  ELSIF v_was_listed = NEW.listed THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.deliverability_events (user_id, domain, event_type, title, detail, metadata)
  VALUES (
    NEW.user_id,
    NEW.target,
    CASE WHEN NEW.listed THEN 'blacklist_listed' ELSE 'blacklist_cleared' END,
    CASE
      WHEN NEW.listed THEN format('%s listed on %s', NEW.target, NEW.rbl_name)
      ELSE format('%s no longer listed on %s', NEW.target, NEW.rbl_name)
    END,
    CASE
      WHEN NEW.listed THEN COALESCE(
        NEW.detail,
        'Delivery to most providers degrades while a sending domain is listed. Request delisting, and pause sending from it until it clears.'
      )
      ELSE 'Delisted. Reputation recovers over days rather than immediately, so ramp volume back up gradually.'
    END,
    jsonb_build_object('rbl', NEW.rbl_name, 'target_type', NEW.target_type)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blacklist_checks_events ON public.blacklist_checks;
CREATE TRIGGER trg_blacklist_checks_events
  AFTER INSERT ON public.blacklist_checks
  FOR EACH ROW EXECUTE FUNCTION public.record_blacklist_event();

COMMENT ON FUNCTION public.record_blacklist_event() IS
  'Writes blacklist_listed / blacklist_cleared deliverability_events when a check changes verdict. Only on a change: the sweep runs nightly and an unchanged verdict is not an event.';


-- A completed placement test, on the record of what the user did.
CREATE OR REPLACE FUNCTION public.record_placement_test_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inbox int;
  v_total int;
BEGIN
  -- Only the transition into a finished state, so a row touched twice does not
  -- write the event twice.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed', 'failed') THEN RETURN NEW; END IF;

  IF NEW.status = 'failed' THEN
    INSERT INTO public.deliverability_events (user_id, sending_account_id, event_type, title, detail)
    VALUES (NEW.user_id, NEW.sending_account_id, 'placement_test',
            'Placement test did not complete',
            'No seed inbox reported back, so placement is still unmeasured.');
    RETURN NEW;
  END IF;

  -- placement is one of: inbox, spam, promotions, missing, pending,
  -- unsupported. Only the rows that actually reached a verdict count in the
  -- denominator — a provider with no seed inbox configured is not a miss.
  SELECT count(*) FILTER (WHERE r.placement = 'inbox'), count(*)
    INTO v_inbox, v_total
  FROM public.placement_results r
  WHERE r.test_id = NEW.id
    AND r.placement NOT IN ('unsupported', 'pending');

  INSERT INTO public.deliverability_events (user_id, sending_account_id, event_type, title, detail, metadata)
  VALUES (
    NEW.user_id,
    NEW.sending_account_id,
    'placement_test',
    CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 'Placement test completed with no results'
      ELSE format('Placement test: %s of %s seeds landed in the inbox', v_inbox, v_total)
    END,
    NULL,
    jsonb_build_object('inbox', v_inbox, 'total', v_total)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_placement_tests_events ON public.placement_tests;
CREATE TRIGGER trg_placement_tests_events
  AFTER UPDATE ON public.placement_tests
  FOR EACH ROW EXECUTE FUNCTION public.record_placement_test_event();

COMMENT ON FUNCTION public.record_placement_test_event() IS
  'Writes a placement_test deliverability_event when a test finishes. Fires only on a status transition, so a row touched twice does not double-log.';
