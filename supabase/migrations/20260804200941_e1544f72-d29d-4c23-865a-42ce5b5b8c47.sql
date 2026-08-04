-- Internal check routine (shared by the admin report and the daily automation)
CREATE OR REPLACE FUNCTION public._system_health_checks()
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
    AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
    AND NOT has_table_privilege('anon', c.oid, 'SELECT');
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
    WHERE d.status <> 'succeeded' AND d.start_time > now() - interval '24 hours';
    checks := checks || jsonb_build_object(
      'id','cron_failures','label','Scheduled jobs (24h)','severity','critical',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'No failed scheduled runs' ELSE v_count || ' failed runs: ' || v_detail END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','cron_failures','label','Scheduled jobs (24h)','severity','warning','status','unknown','detail','Scheduler history unavailable');
  END;

  BEGIN
    SELECT count(*) INTO v_count FROM public.email_send_log
    WHERE created_at > now() - interval '24 hours' AND status NOT IN ('sent','skipped','duplicate','pending');
    checks := checks || jsonb_build_object(
      'id','email_failures','label','Transactional email (24h)','severity','critical',
      'status', CASE WHEN v_count = 0 THEN 'pass' WHEN v_count < 5 THEN 'warn' ELSE 'fail' END,
      'detail', CASE WHEN v_count = 0 THEN 'All sends succeeded' ELSE v_count || ' failed sends' END);
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('id','email_failures','label','Transactional email (24h)','severity','warning','status','unknown','detail','Send log unavailable');
  END;

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

REVOKE ALL ON FUNCTION public._system_health_checks() FROM public;
REVOKE ALL ON FUNCTION public._system_health_checks() FROM anon, authenticated;

-- Admin report now delegates to the shared routine
CREATE OR REPLACE FUNCTION public.admin_system_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN public._system_health_checks();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_system_healthcheck() FROM public;
REVOKE ALL ON FUNCTION public.admin_system_healthcheck() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_system_healthcheck() TO authenticated;

-- Daily automated run: record an alert and email support when something is broken
CREATE OR REPLACE FUNCTION public.system_health_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report jsonb;
  failing jsonb;
  fail_count int;
  rows_html text := '';
  chk jsonb;
  msg_id uuid := gen_random_uuid();
  recipient text := 'support@bdotindustries.com';
BEGIN
  report := public._system_health_checks();

  SELECT coalesce(jsonb_agg(c), '[]'::jsonb) INTO failing
  FROM jsonb_array_elements(report -> 'checks') c
  WHERE c ->> 'status' = 'fail';

  fail_count := jsonb_array_length(failing);
  IF fail_count = 0 THEN
    RETURN;
  END IF;

  FOR chk IN SELECT * FROM jsonb_array_elements(failing) LOOP
    rows_html := rows_html ||
      '<tr><td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#fff;font-weight:600;">' ||
      (chk ->> 'label') ||
      '</td><td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#bbb;">' ||
      (chk ->> 'detail') || '</td></tr>';
  END LOOP;

  INSERT INTO public.system_alerts (category, severity, message, details)
  VALUES ('system_health', 'critical',
          fail_count || ' system health check(s) failing',
          jsonb_build_object('failing', failing));

  BEGIN
    PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
      'message_id', msg_id,
      'to', recipient,
      'from', 'OutReign System <noreply@notify.bdotindustries.com>',
      'sender_domain', 'notify.bdotindustries.com',
      'subject', '[OutReign] ' || fail_count || ' system health check(s) failing',
      'html', '<div style="background:#0b0b0f;padding:24px;font-family:system-ui,-apple-system,sans-serif;">'
              || '<h2 style="color:#fff;margin:0 0 8px;">System health: ' || fail_count || ' failing</h2>'
              || '<p style="color:#8b5cf6;margin:0 0 16px;">Detected by the daily automated check.</p>'
              || '<table style="width:100%;border-collapse:collapse;background:#141419;border-radius:8px;">'
              || rows_html || '</table></div>',
      'text', fail_count || ' system health check(s) failing',
      'purpose', 'transactional',
      'label', 'system-health-alert',
      'idempotency_key', 'system-health-' || to_char(now(), 'YYYY-MM-DD'),
      'queued_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
    ));

    INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status)
    VALUES (msg_id, 'system-health-alert', recipient, 'pending');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'system_health_alert: email enqueue failed';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.system_health_alert() FROM public;
REVOKE ALL ON FUNCTION public.system_health_alert() FROM anon, authenticated;

SELECT cron.unschedule('system-health-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'system-health-daily'
);

SELECT cron.schedule('system-health-daily', '0 13 * * *', $$SELECT public.system_health_alert();$$);