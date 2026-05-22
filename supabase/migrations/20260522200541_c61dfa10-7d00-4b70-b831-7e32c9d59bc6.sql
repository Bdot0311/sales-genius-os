CREATE TABLE IF NOT EXISTS public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE,
  agent_name TEXT DEFAULT 'Alex',
  persona TEXT DEFAULT 'You are a professional, consultative, and helpful sales representative.',
  tone TEXT DEFAULT 'professional' CHECK (tone IN ('professional', 'friendly', 'direct', 'casual')),
  company_context TEXT,
  value_props JSONB DEFAULT '[]'::JSONB,
  objection_responses JSONB DEFAULT '{}'::JSONB,
  can_reply_interested BOOLEAN DEFAULT TRUE,
  can_handle_objections BOOLEAN DEFAULT TRUE,
  can_book_meetings BOOLEAN DEFAULT FALSE,
  calendly_url TEXT,
  max_daily_auto_replies INTEGER DEFAULT 20,
  reply_delay_minutes INTEGER DEFAULT 15,
  signature TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent_configs" ON public.agent_configs;
CREATE POLICY "Users manage own agent_configs" ON public.agent_configs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'sync', 'classify', 'reply_sent', 'meeting_booked',
    'unsubscribed', 'closed_thread', 'skipped', 'error'
  )),
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'skipped')),
  prospect_email TEXT,
  subject TEXT,
  classification TEXT,
  reply_content TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own agent_actions" ON public.agent_actions;
CREATE POLICY "Users view own agent_actions" ON public.agent_actions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS agent_thread_status TEXT DEFAULT 'active'
    CHECK (agent_thread_status IN ('active', 'replied', 'meeting_booked', 'unsubscribed', 'closed')),
  ADD COLUMN IF NOT EXISTS agent_last_synced_at TIMESTAMPTZ;

ALTER TABLE public.reply_analysis
  ADD COLUMN IF NOT EXISTS processed_by_agent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS agent_reply_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS triage_category TEXT;