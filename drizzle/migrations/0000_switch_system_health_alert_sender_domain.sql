CREATE OR REPLACE FUNCTION public.system_health_alert()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'from', 'OutReign System <noreply@notify.outreign.io>',
      'sender_domain', 'notify.outreign.io',
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
$function$;