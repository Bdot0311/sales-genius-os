alter table public.sent_emails
  add column if not exists error_message text,
  add column if not exists failed_at timestamptz;

comment on column public.sent_emails.error_message is
  'Plain-English reason the send failed, written at the moment it failed. Null for anything not in a failed state.';
comment on column public.sent_emails.failed_at is
  'When the send failed. sent_at stays null on a failure, so without this a failed row has no timestamp of its own and the UI falls back to scheduled_at.';

create index if not exists sent_emails_failed_idx
  on public.sent_emails (user_id, failed_at desc)
  where status = 'failed';

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('sent_emails', 'error_message', 'plain-English reason a send failed'),
  ('sent_emails', 'failed_at', 'when the send failed')
ON CONFLICT DO NOTHING;