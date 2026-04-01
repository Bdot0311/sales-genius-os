-- ICP Profiles table
CREATE TABLE public.icp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  industries jsonb DEFAULT '[]'::jsonb,
  company_size_min integer DEFAULT 1,
  company_size_max integer DEFAULT 10000,
  revenue_range text,
  geographies jsonb DEFAULT '[]'::jsonb,
  target_titles jsonb DEFAULT '[]'::jsonb,
  tech_stack jsonb DEFAULT '[]'::jsonb,
  buying_signals jsonb DEFAULT '[]'::jsonb,
  pain_points jsonb DEFAULT '[]'::jsonb,
  disqualifiers text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ICP profiles" ON public.icp_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own ICP profiles" ON public.icp_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ICP profiles" ON public.icp_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ICP profiles" ON public.icp_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_icp_profiles_updated_at BEFORE UPDATE ON public.icp_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reply Threads table
CREATE TABLE public.reply_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  subject text NOT NULL,
  original_email_body text,
  reply_body text,
  sender_email text NOT NULL,
  classification text DEFAULT 'question',
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz
);

ALTER TABLE public.reply_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reply threads" ON public.reply_threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own reply threads" ON public.reply_threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reply threads" ON public.reply_threads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reply threads" ON public.reply_threads FOR DELETE USING (auth.uid() = user_id);

-- Mailbox Warmup table
CREATE TABLE public.mailbox_warmup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  warmup_active boolean DEFAULT false,
  current_week integer DEFAULT 1,
  start_date timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mailbox_warmup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mailbox warmup" ON public.mailbox_warmup FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own mailbox warmup" ON public.mailbox_warmup FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mailbox warmup" ON public.mailbox_warmup FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mailbox warmup" ON public.mailbox_warmup FOR DELETE USING (auth.uid() = user_id);