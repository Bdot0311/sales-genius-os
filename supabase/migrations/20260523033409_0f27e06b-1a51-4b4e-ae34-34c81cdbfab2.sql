-- Ensure icp_profiles table exists (idempotent — safe to run multiple times)
CREATE TABLE IF NOT EXISTS public.icp_profiles (
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

DO $$ BEGIN
  CREATE POLICY "Users can view own ICP profiles"
    ON public.icp_profiles FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own ICP profiles"
    ON public.icp_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own ICP profiles"
    ON public.icp_profiles FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own ICP profiles"
    ON public.icp_profiles FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_icp_profiles_updated_at
    BEFORE UPDATE ON public.icp_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;