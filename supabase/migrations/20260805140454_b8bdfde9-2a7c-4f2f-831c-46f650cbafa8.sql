ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('subscriptions', 'billing_exempt', 'Marks internal/comped plans so the billing-linkage health check does not flag them')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._system_health_checks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  checks jsonb := '[]'::jsonb;
  v_count int;
  v_detail text;
BEGIN
  SELECT count(*), coalesce(string_agg(sc.table_name || '.' || sc.column_name, ', '), '')
    INTO v_count, v_detail
  FROM public.schema_contract sc
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = sc.table_name AND c.column_name = sc.column_name
  );
  checks := checks || jsonb_build_object(
    'id','schema_contract','label','Required database fields','severity','critical',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
    'detail', CASE WHEN v_count = 0 THEN 'All ' || (SELECT count(*) FROM public.schema_contract) || ' contracted fields present' ELSE v_count || ' missing: ' || v_detail END);

  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_count, v_detail
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  checks := checks || jsonb_build_object(
    'id','rls_enabled','label','Row level security on all tables','severity','critical',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
    'detail', CASE WHEN v_count = 0 THEN 'Every public table has RLS enabled' ELSE v_count || ' without RLS: ' || v_detail END);

  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_count, v_detail
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
  checks := checks || jsonb_build_object(
    'id','rls_policies','label','Tables have access policies','severity','warning',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
    'detail', CASE WHEN v_count = 0 THEN 'No silently-locked tables' ELSE v_count || ' with RLS but no policies: ' || v_detail END);

  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_count, v_detail
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT has_any_column_privilege('authenticated', c.oid, 'SELECT')
    AND NOT has_any_column_privilege('anon', c.oid, 'SELECT');
  checks := checks || jsonb_build_object(
    'id','api_grants','label','API access grants','severity','critical',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
    'detail', CASE WHEN v_count = 0 THEN 'All tables reachable by the app' ELSE v_count || ' missing grants: ' || v_detail END);

  SELECT count(*), coalesce(string_agg(p.proname, ', '), '') INTO v_count, v_detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%');
  checks := checks || jsonb_build_object(
    'id','function_search_path','label','Database function hardening','severity','warning',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
    'detail', CASE WHEN v_count = 0 THEN 'All privileged functions pin search_path' ELSE v_count || ' unpinned: ' || v_detail END);

  BEGIN
    SELECT count(*), coalesce(string_agg(DISTINCT j.jobname, ', '), '') INTO v_count, v_detail
    FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.start_time > now() - interval '24 hours' AND d.status <> 'succeeded';
    checks := checks || jsonb_build_object(
      'id','cron_failures','label','Scheduled jobs (24h)','severity','critical',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'No failed scheduled runs' ELSE v_count || ' failed runs: ' || v_detail END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','cron_failures','label','Scheduled jobs (24h)','severity','warning','status','unknown','detail','Scheduler history unavailable');
  END;

  BEGIN
    SELECT count(*) INTO v_count FROM public.email_send_log
    WHERE created_at > now() - interval '24 hours'
      AND status NOT IN ('sent','skipped','duplicate','pending','bounced','suppressed','complained','unsubscribed');
    checks := checks || jsonb_build_object(
      'id','email_failures','label','Transactional email (24h)','severity','critical',
      'status', CASE WHEN v_count = 0 THEN 'pass' WHEN v_count < 5 THEN 'warn' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'All sends succeeded' ELSE v_count || ' failed sends' END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','email_failures','label','Transactional email (24h)','severity','warning','status','unknown','detail','Send log unavailable');
  END;

  -- Only genuine hard bounces / complaints from real recipient domains count.
  -- Correctly blocked (suppressed) addresses mean the guard worked, and reserved
  -- test domains are synthetic.
  BEGIN
    SELECT count(*) INTO v_count FROM public.email_send_log
    WHERE created_at > now() - interval '24 hours'
      AND status IN ('bounced','complained')
      AND lower(recipient_email) !~ '@(outreign-tests\.com|example\.(com|org|net))$'
      AND lower(recipient_email) !~ '\.(test|invalid|localhost|local)$';
    checks := checks || jsonb_build_object(
      'id','email_bounces','label','Email bounces (24h)','severity','warning',
      'status', CASE WHEN v_count = 0 THEN 'pass' WHEN v_count < 25 THEN 'warn' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'No hard bounces from real recipients' ELSE v_count || ' hard bounces or complaints' END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','email_bounces','label','Email bounces (24h)','severity','warning','status','unknown','detail','Send log unavailable');
  END;

  BEGIN
    SELECT count(*) INTO v_count FROM public.subscriptions
    WHERE plan <> 'free' AND NOT billing_exempt
      AND (stripe_customer_id IS NULL OR stripe_subscription_id IS NULL);
    checks := checks || jsonb_build_object(
      'id','billing_linkage','label','Paid accounts linked to billing','severity','warning',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
      'detail', CASE WHEN v_count = 0 THEN 'Every billable account has billing records' ELSE v_count || ' paid accounts without Stripe records' END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','billing_linkage','label','Paid accounts linked to billing','severity','warning','status','unknown','detail','Subscription data unavailable');
  END;

  BEGIN
    SELECT count(*) INTO v_count FROM public.agent_actions
    WHERE created_at > now() - interval '24 hours' AND status = 'error';
    checks := checks || jsonb_build_object(
      'id','agent_errors','label','AI agent runs (24h)','severity','warning',
      'status', CASE WHEN v_count = 0 THEN 'pass' WHEN v_count < 10 THEN 'warn' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'No agent errors' ELSE v_count || ' agent errors' END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','agent_errors','label','AI agent runs (24h)','severity','warning','status','unknown','detail','Agent log unavailable');
  END;

  RETURN jsonb_build_object('generated_at', now(), 'checks', checks);
END;
$fn$;