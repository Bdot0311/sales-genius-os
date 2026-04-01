-- Drop and recreate the template_performance view with security_invoker
-- This ensures the view respects RLS policies on underlying tables

DROP VIEW IF EXISTS public.template_performance;

CREATE VIEW public.template_performance 
WITH (security_invoker = true)
AS
SELECT 
    t.id AS template_id,
    t.name AS template_name,
    t.user_id,
    count(se.id) AS total_sent,
    count(se.opened_at) AS total_opened,
    count(se.replied_at) AS total_replied,
    count(se.clicked_at) AS total_clicked,
    CASE
        WHEN count(se.id) > 0 THEN round(count(se.opened_at)::numeric / count(se.id)::numeric * 100::numeric, 1)
        ELSE 0::numeric
    END AS open_rate,
    CASE
        WHEN count(se.id) > 0 THEN round(count(se.replied_at)::numeric / count(se.id)::numeric * 100::numeric, 1)
        ELSE 0::numeric
    END AS reply_rate,
    CASE
        WHEN count(se.id) > 0 THEN round(count(se.clicked_at)::numeric / count(se.id)::numeric * 100::numeric, 1)
        ELSE 0::numeric
    END AS click_rate
FROM user_email_templates t
LEFT JOIN sent_emails se ON se.template_id = t.id
GROUP BY t.id, t.name, t.user_id;

-- Grant SELECT to authenticated users (RLS on underlying tables will filter data)
GRANT SELECT ON public.template_performance TO authenticated;