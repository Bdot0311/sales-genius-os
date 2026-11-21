-- Run through a privileged database connection. All writes roll back.
BEGIN;

DO $$
DECLARE owner_id uuid; initial_state jsonb; saved jsonb; history_before bigint;
BEGIN
  SELECT id INTO owner_id FROM public.profiles ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Consent regression needs a profile'; END IF;
  initial_state := public.outcome_consent_state(owner_id);
  SELECT count(*) INTO history_before FROM public.outcome_consent_log WHERE user_id = owner_id;
  saved := public.set_outcome_consent(owner_id, true, 'settings');
  IF (public.outcome_consent_state(owner_id)->>'consent')::boolean IS DISTINCT FROM true
     OR saved->>'decided_at' IS NULL THEN
    RAISE EXCEPTION 'Explicit yes must read back with its server timestamp';
  END IF;
  saved := public.set_outcome_consent(owner_id, false, 'settings');
  IF (public.outcome_consent_state(owner_id)->>'consent')::boolean IS DISTINCT FROM false
     OR saved->>'decided_at' IS NULL THEN
    RAISE EXCEPTION 'Withdrawal must read back as false with its timestamp';
  END IF;
  IF (SELECT count(*) FROM public.outcome_consent_log WHERE user_id = owner_id) <> history_before + 2 THEN
    RAISE EXCEPTION 'Every explicit answer must have an audit record';
  END IF;
  BEGIN
    PERFORM public.set_outcome_consent(owner_id, NULL, 'settings');
    RAISE EXCEPTION 'Unexpected acceptance of a null answer';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'set_outcome_consent needs a user and an explicit answer' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.outcome_consent_log WHERE user_id = owner_id) <> history_before + 2 THEN
    RAISE EXCEPTION 'Rejected answers must not create history';
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.outcome_consent_state(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.outcome_consent_state(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.set_outcome_consent(uuid,boolean,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_outcome_consent(uuid,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Only the verified server handler may call consent helpers';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.outcome_consent_state(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.set_outcome_consent(uuid,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Server must be able to read and save consent';
  END IF;
  IF (SELECT count(*) FROM public.schema_contract WHERE table_name = 'profiles'
      AND column_name IN ('outcome_consent', 'outcome_consent_decided_at')) <> 2 THEN
    RAISE EXCEPTION 'Both consent columns must be monitored';
  END IF;
END;
$$;

ROLLBACK;