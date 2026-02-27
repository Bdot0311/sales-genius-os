ALTER TABLE subscriptions
ADD COLUMN daily_email_limit integer NOT NULL DEFAULT 10,
ADD COLUMN daily_emails_sent integer NOT NULL DEFAULT 0,
ADD COLUMN daily_emails_reset_at timestamptz DEFAULT now();