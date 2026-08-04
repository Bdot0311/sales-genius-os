ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS exclude_headcount_ceiling integer,
  ADD COLUMN IF NOT EXISTS exclude_b2c boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_regulated jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclude_non_english boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.icp_profiles TO authenticated;
GRANT ALL ON public.icp_profiles TO service_role;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('icp_profiles', 'exclude_headcount_ceiling', 'Required by ICP Builder hard exclusions'),
  ('icp_profiles', 'exclude_b2c', 'Required by ICP Builder hard exclusions'),
  ('icp_profiles', 'exclude_regulated', 'Required by ICP Builder hard exclusions'),
  ('icp_profiles', 'exclude_non_english', 'Required by ICP Builder hard exclusions')
ON CONFLICT DO NOTHING;