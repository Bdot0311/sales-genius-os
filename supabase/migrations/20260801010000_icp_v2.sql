-- Phase 5: ICP Builder v2.
-- First-class hard exclusions and ICP version history. Additive only.
-- (Rescore-on-ICP-change is already handled by the Phase 1 trg_rescore_on_icp
-- trigger, so changing an ICP already queues a rescore.)

ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS exclude_headcount_ceiling integer,          -- drop accounts above this headcount
  ADD COLUMN IF NOT EXISTS exclude_b2c               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_regulated         jsonb   NOT NULL DEFAULT '[]'::jsonb,  -- regulated verticals to exclude
  ADD COLUMN IF NOT EXISTS exclude_non_english       boolean NOT NULL DEFAULT false;

-- Version history: a snapshot is written on each save so scoring can record
-- which ICP version produced it, and users can see how the ICP changed.
CREATE TABLE IF NOT EXISTS public.icp_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  icp_profile_id uuid NOT NULL REFERENCES public.icp_profiles(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot       jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icp_versions_profile ON public.icp_versions(icp_profile_id, version_number DESC);
ALTER TABLE public.icp_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "icp_versions_select_own" ON public.icp_versions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "icp_versions_insert_own" ON public.icp_versions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "icp_versions_delete_own" ON public.icp_versions FOR DELETE USING (auth.uid() = user_id);

-- Snapshot the ICP on every update into icp_versions with an incrementing number.
CREATE OR REPLACE FUNCTION public.snapshot_icp_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_num integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_num
  FROM public.icp_versions WHERE icp_profile_id = NEW.id;
  INSERT INTO public.icp_versions (user_id, icp_profile_id, version_number, snapshot)
  VALUES (NEW.user_id, NEW.id, next_num, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_icp_version ON public.icp_profiles;
CREATE TRIGGER trg_snapshot_icp_version
  AFTER INSERT OR UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_icp_version();
