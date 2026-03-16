ALTER TABLE public.email_sequences ADD COLUMN IF NOT EXISTS ab_test_enabled boolean DEFAULT false;
ALTER TABLE public.email_sequences ADD COLUMN IF NOT EXISTS ab_test_split integer DEFAULT 50;
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS branch_config jsonb DEFAULT null;