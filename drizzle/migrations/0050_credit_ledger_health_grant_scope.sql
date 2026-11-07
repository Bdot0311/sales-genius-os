-- Internal Stripe grant ledger is deliberately inaccessible to app users.
-- Preserve all other health checks and report this table if backend access is lost.
GRANT ALL ON TABLE public.stripe_credit_grants TO service_role;
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public._system_health_checks()'::regprocedure);
  original_predicate text := 'AND NOT has_any_column_privilege(''anon'', c.oid, ''SELECT'');';
  corrected_predicate text := $predicate$AND NOT has_any_column_privilege('anon', c.oid, 'SELECT')
    AND NOT (
      c.relname = 'stripe_credit_grants'
      AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      AND has_table_privilege('service_role', c.oid, 'SELECT')
      AND has_table_privilege('service_role', c.oid, 'INSERT')
      AND has_table_privilege('service_role', c.oid, 'UPDATE')
      AND has_table_privilege('service_role', c.oid, 'DELETE')
      AND NOT has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE')
      AND NOT has_table_privilege('authenticated', c.oid, 'DELETE')
      AND NOT has_any_column_privilege('anon', c.oid, 'INSERT,UPDATE')
      AND NOT has_table_privilege('anon', c.oid, 'DELETE')
    );$predicate$;
BEGIN
  IF position(original_predicate IN definition) = 0 THEN
    RAISE EXCEPTION 'Health grant predicate changed; refusing to replace unrelated checks';
  END IF;
  EXECUTE replace(definition, original_predicate, corrected_predicate);
END;
$migration$;
-- Executable regression checks: private ledger remains private; live check passes.
DO $regression$
DECLARE
  checks jsonb := public._system_health_checks();
  ledger oid := 'public.stripe_credit_grants'::regclass;
BEGIN
  IF has_any_column_privilege('authenticated', ledger, 'SELECT,INSERT,UPDATE')
     OR has_table_privilege('authenticated', ledger, 'DELETE')
     OR has_any_column_privilege('anon', ledger, 'SELECT,INSERT,UPDATE')
     OR has_table_privilege('anon', ledger, 'DELETE') THEN
    RAISE EXCEPTION 'Regression: customer roles can access the internal credit ledger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(checks->'checks') c
    WHERE c->>'id' = 'api_grants' AND c->>'status' = 'pass'
  ) THEN
    RAISE EXCEPTION 'Regression: API grants health check still failing';
  END IF;
END;
$regression$;