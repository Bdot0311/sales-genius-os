-- ICP Builder v2: first-class exclusion columns
ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS exclude_company_sizes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclude_geographies jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclude_domains jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclude_tech_stack jsonb DEFAULT '[]'::jsonb;

-- Version history table
CREATE TABLE IF NOT EXISTS public.icp_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  icp_profile_id uuid NOT NULL REFERENCES public.icp_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (icp_profile_id, version)
);

CREATE INDEX IF NOT EXISTS idx_icp_versions_profile ON public.icp_versions(icp_profile_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_icp_versions_user ON public.icp_versions(user_id);

GRANT SELECT, DELETE ON public.icp_versions TO authenticated;
GRANT ALL ON public.icp_versions TO service_role;

ALTER TABLE public.icp_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ICP versions"
  ON public.icp_versions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ICP versions"
  ON public.icp_versions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Snapshot trigger
CREATE OR REPLACE FUNCTION public.snapshot_icp_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version integer;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) - 'updated_at' = to_jsonb(OLD) - 'updated_at' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM public.icp_versions
  WHERE icp_profile_id = NEW.id;

  INSERT INTO public.icp_versions (icp_profile_id, user_id, version, snapshot, changed_by)
  VALUES (NEW.id, NEW.user_id, next_version, to_jsonb(NEW), auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_icp_version ON public.icp_profiles;
CREATE TRIGGER trg_snapshot_icp_version
AFTER INSERT OR UPDATE ON public.icp_profiles
FOR EACH ROW EXECUTE FUNCTION public.snapshot_icp_version();