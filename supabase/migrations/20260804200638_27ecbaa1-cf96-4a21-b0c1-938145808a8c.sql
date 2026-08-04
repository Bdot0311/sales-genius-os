-- 1. Schema contract table: the app's expected database surface
CREATE TABLE IF NOT EXISTS public.schema_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  column_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, column_name)
);

GRANT SELECT ON public.schema_contract TO authenticated;
GRANT ALL ON public.schema_contract TO service_role;
ALTER TABLE public.schema_contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view schema contract" ON public.schema_contract;
CREATE POLICY "Admins can view schema contract"
ON public.schema_contract FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role manages schema contract" ON public.schema_contract;
CREATE POLICY "Service role manages schema contract"
ON public.schema_contract FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Seed the contract from the current (working) schema for the critical tables
INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT c.table_name, c.column_name, 'auto-seeded baseline'
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'leads','subscriptions','profiles','user_roles','agent_configs','agent_actions',
    'agent_chat_threads','agent_chat_messages','campaign_setup_requests','sent_emails',
    'user_activation','sequence_enrollments','sequence_steps','email_sequences',
    'sending_accounts','sending_domains','icp_profiles','lead_scores','support_access_grants',
    'stripe_webhook_events','email_drafts','contacts','companies','deals'
  )
ON CONFLICT (table_name, column_name) DO NOTHING;

-- 2. Health check function
CREATE OR REPLACE FUNCTION public.admin_system_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  checks jsonb := '[]'::jsonb;
  v_count int;
  v_detail text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Missing contracted columns (catches "column does not exist" runtime 500s)
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
    'detail', CASE WHEN v_count = 0 THEN 'All contracted fields present' ELSE v_count || ' missing: ' || v_detail END);

  -- Tables without RLS
  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_count, v_detail
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  checks := checks || jsonb_build_object(
    'id','rls_enabled','label','Row level security on all tables','severity','critical',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
    'detail', CASE WHEN v_count = 0 THEN 'Every public table has RLS enabled' ELSE v_count || ' without RLS: ' || v_detail END);

  -- Tables with RLS but zero policies (silently locked = broken feature)
  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_count, v_detail
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
  checks := checks || jsonb_build_object(
    'id','rls_policies','label','Tables have access policies','severity','warning',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
    'detail', CASE WHEN v_count = 0 THEN 'No silently-locked tables' ELSE v_count || ' with RLS but no policies: ' || v_detail END);

  -- Tables missing API grants (PostgREST permission-denied class of bug)
  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_count, v_detail
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
    AND NOT has_table_privilege('anon', c.oid, 'SELECT');
  checks := checks || jsonb_build_object(
    'id','api_grants','label','API access grants','severity','critical',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
    'detail', CASE WHEN v_count = 0 THEN 'All tables reachable by the app' ELSE v_count || ' missing grants: ' || v_detail END);

  -- Security definer functions without pinned search_path
  SELECT count(*), coalesce(string_agg(p.proname, ', '), '') INTO v_count, v_detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%');
  checks := checks || jsonb_build_object(
    'id','function_search_path','label','Database function hardening','severity','warning',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
    'detail', CASE WHEN v_count = 0 THEN 'All privileged functions pin search_path' ELSE v_count || ' unpinned: ' || v_detail END);

  -- Scheduled job failures in the last 24h
  BEGIN
    SELECT count(*), coalesce(string_agg(DISTINCT j.jobname, ', '), '') INTO v_count, v_detail
    FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.status <> 'succeeded' AND d.start_time > now() - interval '24 hours';
    checks := checks || jsonb_build_object(
      'id','cron_failures','label','Scheduled jobs (24h)','severity','critical',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'No failed scheduled runs' ELSE v_count || ' failed runs: ' || v_detail END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','cron_failures','label','Scheduled jobs (24h)','severity','warning','status','unknown','detail','Scheduler history unavailable');
  END;

  -- Email failures in the last 24h
  BEGIN
    SELECT count(*) INTO v_count FROM public.email_send_log
    WHERE created_at > now() - interval '24 hours' AND status NOT IN ('sent','skipped','duplicate');
    checks := checks || jsonb_build_object(
      'id','email_failures','label','Transactional email (24h)','severity','critical',
      'status', CASE WHEN v_count = 0 THEN 'pass' WHEN v_count < 5 THEN 'warn' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'All sends succeeded' ELSE v_count || ' failed sends' END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','email_failures','label','Transactional email (24h)','severity','warning','status','unknown','detail','Send log unavailable');
  END;

  -- Paid accounts missing Stripe linkage
  BEGIN
    SELECT count(*) INTO v_count FROM public.subscriptions
    WHERE plan <> 'free' AND (stripe_customer_id IS NULL OR stripe_subscription_id IS NULL);
    checks := checks || jsonb_build_object(
      'id','billing_linkage','label','Paid accounts linked to billing','severity','warning',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
      'detail', CASE WHEN v_count = 0 THEN 'Every paid account has billing records' ELSE v_count || ' paid accounts without Stripe records' END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','billing_linkage','label','Paid accounts linked to billing','severity','warning','status','unknown','detail','Subscription data unavailable');
  END;

  -- Agent errors in the last 24h
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
$$;

REVOKE ALL ON FUNCTION public.admin_system_healthcheck() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_system_healthcheck() TO authenticated;