CREATE OR REPLACE FUNCTION public.record_blacklist_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_listed boolean;
BEGIN
  SELECT b.listed INTO v_was_listed
  FROM public.blacklist_checks b
  WHERE b.user_id = NEW.user_id
    AND b.target = NEW.target
    AND b.rbl_name = NEW.rbl_name
    AND b.id <> NEW.id
  ORDER BY b.checked_at DESC
  LIMIT 1;

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
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed', 'failed') THEN RETURN NEW; END IF;

  IF NEW.status = 'failed' THEN
    INSERT INTO public.deliverability_events (user_id, sending_account_id, event_type, title, detail)
    VALUES (NEW.user_id, NEW.sending_account_id, 'placement_test',
            'Placement test did not complete',
            'No seed inbox reported back, so placement is still unmeasured.');
    RETURN NEW;
  END IF;

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