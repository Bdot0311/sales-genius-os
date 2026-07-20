-- Raise per-mailbox default daily send cap from 50 to 500 so plan-level daily_email_limit remains the authoritative cap for typical users. Existing rows still at the old default (50) are backfilled to 500.
ALTER TABLE public.sending_accounts ALTER COLUMN daily_limit SET DEFAULT 500;
UPDATE public.sending_accounts SET daily_limit = 500 WHERE daily_limit = 50;