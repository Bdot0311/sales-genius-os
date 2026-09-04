-- Let the database accept the trigger the product sells.
--
-- SequenceBuilder offers "Custom trigger" (on_custom) to accounts on the
-- Custom sequence tier. The trigger_condition CHECK constraint has never
-- listed it, so choosing the option the plan was bought for produced
-- "new row for relation sequence_steps violates check constraint
-- sequence_steps_trigger_condition_check" and the step was lost.
--
-- Widened rather than removed from the UI: it is a real capability behind a
-- real plan gate. Every other value is unchanged, so no existing row can be
-- invalidated by this.
ALTER TABLE public.sequence_steps
  DROP CONSTRAINT IF EXISTS sequence_steps_trigger_condition_check;

ALTER TABLE public.sequence_steps
  ADD CONSTRAINT sequence_steps_trigger_condition_check
  CHECK (trigger_condition IN (
    'on_enroll', 'on_delay', 'on_open', 'on_click',
    'on_no_response', 'on_silence', 'on_custom'
  ));

-- The step_type constraint is deliberately NOT widened.
--
-- The writers that violated it were sending 'email', which describes the
-- channel. This is an email-only product, so that value distinguishes nothing
-- — admitting it would make the column meaningless rather than fix anything.
-- The vocabulary that survives is the one that says what the step does:
-- initial, follow_up, pattern_interrupt, re_engagement. The writers are
-- corrected in the same change; see _shared/sequence-steps.ts.
COMMENT ON COLUMN public.sequence_steps.step_type IS
  'The step''s role in the sequence, never its channel. Allowed values live in supabase/functions/_shared/sequence-steps.ts and are enforced by sequence_steps_step_type_check.';
