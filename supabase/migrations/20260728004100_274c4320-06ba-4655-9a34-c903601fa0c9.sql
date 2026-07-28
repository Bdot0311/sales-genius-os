ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS icp_profile_id uuid REFERENCES public.icp_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icp_snapshot jsonb;