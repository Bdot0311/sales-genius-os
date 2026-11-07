-- An enrollment is a send instruction. The insert policy used to require only
-- that the row's user_id was the caller, and the lead and sequence foreign
-- keys only require that those rows exist. A caller could therefore enroll
-- another account's lead into a sequence. The dispatcher runs as service
-- role, so it would then queue mail to that lead and write last_contacted_at
-- on a row the caller does not own.
--
-- The worker also refuses a mismatched row, because service-role inserts
-- (the agent) bypass this policy. This is the check for everyone else.

DROP POLICY IF EXISTS "Users can create own enrollments" ON public.sequence_enrollments;

CREATE POLICY "Users can create own enrollments" ON public.sequence_enrollments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.email_sequences s
      WHERE s.id = sequence_id AND s.user_id = auth.uid()
    )
  );
