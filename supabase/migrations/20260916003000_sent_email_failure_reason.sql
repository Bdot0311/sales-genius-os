-- Why a send failed, on the row that failed.
--
-- process-scheduled-emails can fail a send seven different ways: the recipient
-- unsubscribed, no Google integration is connected, the server is missing its
-- OAuth credentials, the refresh token would not exchange, no access token came
-- back, Gmail rejected the message, or something threw. Every one of them wrote
-- `status = 'failed'` and sent the actual reason to console.error, which lands
-- in the edge function log and nowhere a user can reach.
--
-- So the Sent tab could show a red "Failed" badge and could not say why, and
-- the only way to find out was for an operator to go log-diving. Two of those
-- seven causes are the user's own Google connection having expired, which they
-- could fix themselves in a minute if anything told them.

alter table public.sent_emails
  add column if not exists error_message text,
  add column if not exists failed_at timestamptz;

comment on column public.sent_emails.error_message is
  'Plain-English reason the send failed, written at the moment it failed. Null for anything not in a failed state.';
comment on column public.sent_emails.failed_at is
  'When the send failed. sent_at stays null on a failure, so without this a failed row has no timestamp of its own and the UI falls back to scheduled_at.';

-- Finding the failures in an account with tens of thousands of sends.
create index if not exists sent_emails_failed_idx
  on public.sent_emails (user_id, failed_at desc)
  where status = 'failed';
