INSERT INTO public.schema_contract (table_name, column_name, note) VALUES
  ('sent_emails', 'send_claimed_at', 'Send-queue claim stamp; process-scheduled-emails depends on it to prevent duplicate sends'),
  ('sent_emails', 'send_attempted_at', 'Set just before the Gmail POST; stale-claim reaper fails rather than resends when set'),
  ('queue_tenant_turn', 'served_count', 'Per-account fair-queue turn memory used by claim_agent_job_items and claim_due_scheduled_emails'),
  ('queue_tenant_turn', 'last_served_at', 'Sliding-window reset marker for fair-queue rotation');