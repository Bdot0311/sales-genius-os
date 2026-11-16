DO $migration$
DECLARE
 definition text := pg_get_functiondef('public._system_health_checks()'::regprocedure);
 original text := 'c.relname = ''stripe_credit_grants''';
BEGIN
 IF position(original IN definition) = 0 THEN
  RAISE EXCEPTION 'Health predicate changed; refusing unrelated replacement';
 END IF;
 EXECUTE replace(definition, original, 'c.relname IN (''stripe_credit_grants'', ''outbound_gate_canary'')');
END;
$migration$;

-- Executable regressions run against the real health routine in this transaction.
DO $regression$
DECLARE
 report jsonb;
 canary oid := 'public.outbound_gate_canary'::regclass;
BEGIN
 IF has_any_column_privilege('authenticated', canary, 'SELECT,INSERT,UPDATE')
 OR has_table_privilege('authenticated', canary, 'DELETE')
 OR has_any_column_privilege('anon', canary, 'SELECT,INSERT,UPDATE')
 OR has_table_privilege('anon', canary, 'DELETE') THEN
  RAISE EXCEPTION 'Regression: customer access to the private outgoing-email safety switch';
 END IF;
 report := public._system_health_checks();
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(report->'checks') c WHERE c->>'id' = 'api_grants' AND c->>'status' = 'pass') THEN
  RAISE EXCEPTION 'Regression: healthy private tables still trigger an outage';
 END IF;
 REVOKE SELECT ON public.outbound_gate_canary FROM service_role;
 report := public._system_health_checks();
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(report->'checks') c WHERE c->>'id' = 'api_grants' AND c->>'status' = 'fail' AND c->>'detail' LIKE '%outbound_gate_canary%') THEN
  RAISE EXCEPTION 'Regression: missing backend safety-switch access is not detected';
 END IF;
 GRANT SELECT ON public.outbound_gate_canary TO service_role;
END;
$regression$;