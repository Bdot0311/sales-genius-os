
DROP POLICY IF EXISTS "Users can update own sequence steps" ON public.sequence_steps;
DROP POLICY IF EXISTS "Users can delete own sequence steps" ON public.sequence_steps;

CREATE POLICY "Users can update own sequence steps"
  ON public.sequence_steps
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own sequence steps"
  ON public.sequence_steps
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view their team members" ON public.team_members;

CREATE POLICY "Team owners can view their team members"
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = team_owner_id);
