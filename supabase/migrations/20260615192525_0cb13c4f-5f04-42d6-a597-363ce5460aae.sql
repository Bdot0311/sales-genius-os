
-- Remove sensitive tables from Realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.rate_limit_buckets;
ALTER PUBLICATION supabase_realtime DROP TABLE public.signup_diagnostics;
ALTER PUBLICATION supabase_realtime DROP TABLE public.subscriptions;

-- Tighten api_key_rotations INSERT policy: require ownership of both old/new key
DROP POLICY IF EXISTS "Elite users can create key rotations" ON public.api_key_rotations;
CREATE POLICY "Elite users can create key rotations"
ON public.api_key_rotations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = rotated_by
  AND EXISTS (SELECT 1 FROM public.api_keys k WHERE k.id = api_key_rotations.new_key_id AND k.user_id = auth.uid())
  AND (
    api_key_rotations.old_key_id IS NULL
    OR EXISTS (SELECT 1 FROM public.api_keys k WHERE k.id = api_key_rotations.old_key_id AND k.user_id = auth.uid())
  )
);

-- Tighten sequence_steps INSERT policy: require ownership of parent sequence
DROP POLICY IF EXISTS "Users can create own sequence steps" ON public.sequence_steps;
CREATE POLICY "Users can create own sequence steps"
ON public.sequence_steps
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.email_sequences s WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid())
);
