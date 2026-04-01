
-- Add scheduled_at column to sent_emails for scheduling support
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone DEFAULT NULL;

-- Add index for efficient scheduled email queries
CREATE INDEX IF NOT EXISTS idx_sent_emails_scheduled ON public.sent_emails (scheduled_at) WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;
