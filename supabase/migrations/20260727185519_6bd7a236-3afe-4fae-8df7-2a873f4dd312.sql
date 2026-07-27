ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS can_find_leads boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_outreach boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prospecting_job_title text,
  ADD COLUMN IF NOT EXISTS prospecting_industry text,
  ADD COLUMN IF NOT EXISTS prospecting_country text,
  ADD COLUMN IF NOT EXISTS prospecting_company_size text,
  ADD COLUMN IF NOT EXISTS daily_lead_target integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_daily_new_emails integer NOT NULL DEFAULT 20;