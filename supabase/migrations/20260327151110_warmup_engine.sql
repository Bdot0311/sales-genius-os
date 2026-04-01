-- Add warmup engine fields to mailbox_warmup
ALTER TABLE mailbox_warmup
  ADD COLUMN IF NOT EXISTS ramp_style text DEFAULT 'conservative' CHECK (ramp_style IN ('conservative', 'aggressive')),
  ADD COLUMN IF NOT EXISTS max_per_day integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS warmup_sent_today integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_replied_today integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_warmup_sent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_warmup_replied integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_warmup_run timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_paused_reason text;

-- Warmup daily activity log
CREATE TABLE IF NOT EXISTS warmup_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mailbox_id uuid REFERENCES mailbox_warmup(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  emails_sent integer DEFAULT 0,
  emails_replied integer DEFAULT 0,
  week_number integer NOT NULL,
  daily_target integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (mailbox_id, log_date)
);

ALTER TABLE warmup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own warmup logs"
  ON warmup_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own warmup logs"
  ON warmup_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own warmup logs"
  ON warmup_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
