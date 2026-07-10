-- Fix 1: Add explicit service_role bypass policy to rl_buckets so backend rate-limit writes work
CREATE POLICY "Service role manages rate limit buckets"
  ON public.rl_buckets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix 2: Scope sequence_steps policies to 'authenticated' role instead of broad 'public'
DROP POLICY IF EXISTS "Users can view own sequence steps" ON public.sequence_steps;
DROP POLICY IF EXISTS "Users can update own sequence steps" ON public.sequence_steps;
DROP POLICY IF EXISTS "Users can delete own sequence steps" ON public.sequence_steps;

CREATE POLICY "Users can view own sequence steps"
  ON public.sequence_steps
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id)
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own sequence steps"
  ON public.sequence_steps
  FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = user_id)
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (auth.uid() = user_id)
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own sequence steps"
  ON public.sequence_steps
  FOR DELETE
  TO authenticated
  USING (
    (auth.uid() = user_id)
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  );