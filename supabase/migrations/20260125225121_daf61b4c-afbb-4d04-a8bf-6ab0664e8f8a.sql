-- Add template tracking to sent_emails
ALTER TABLE public.sent_emails
ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.user_email_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS opened_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS replied_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS clicked_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS tracking_pixel_id uuid DEFAULT gen_random_uuid();

-- Create index for template performance queries
CREATE INDEX IF NOT EXISTS idx_sent_emails_template_id ON public.sent_emails(template_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_tracking_pixel ON public.sent_emails(tracking_pixel_id);

-- Create a view for template performance metrics
CREATE OR REPLACE VIEW public.template_performance AS
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

-- Grant access to the view
GRANT SELECT ON public.template_performance TO authenticated;