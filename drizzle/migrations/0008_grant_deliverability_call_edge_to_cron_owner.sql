-- pg_cron jobs (compute-reputation-daily, deliverability-alerts-scan-daily,
-- warmup-orchestrator-hourly) run as the postgres role, but the function they
-- call was only granted to service_role, so every scheduled run failed with
-- "permission denied for function deliverability_call_edge".
GRANT EXECUTE ON FUNCTION public.deliverability_call_edge(text, jsonb) TO postgres;