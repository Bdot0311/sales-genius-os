-- Drop and recreate view with SECURITY INVOKER (default, but explicit)
DROP VIEW IF EXISTS public.template_performance;

CREATE VIEW public.template_performance 
WITH (security_invoker = true) AS
SELECT 
  t.id as template_id,
  t.name as template_name,
  t.user_id,
  COUNT(se.id) as total_sent,
  COUNT(se.opened_at) as total_opened,
  COUNT(se.replied_at) as total_replied,
  COUNT(se.clicked_at) as total_clicked,
  CASE WHEN COUNT(se.id) > 0 
    THEN ROUND((COUNT(se.opened_at)::numeric / COUNT(se.id)::numeric) * 100, 1) 
    ELSE 0 
  END as open_rate,
  CASE WHEN COUNT(se.id) > 0 
    THEN ROUND((COUNT(se.replied_at)::numeric / COUNT(se.id)::numeric) * 100, 1) 
    ELSE 0 
  END as reply_rate,
  CASE WHEN COUNT(se.id) > 0 
    THEN ROUND((COUNT(se.clicked_at)::numeric / COUNT(se.id)::numeric) * 100, 1) 
    ELSE 0 
  END as click_rate
FROM public.user_email_templates t
LEFT JOIN public.sent_emails se ON se.template_id = t.id
GROUP BY t.id, t.name, t.user_id;

GRANT SELECT ON public.template_performance TO authenticated;