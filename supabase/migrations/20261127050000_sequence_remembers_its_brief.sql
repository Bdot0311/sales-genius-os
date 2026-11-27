-- Mirror of drizzle/migrations/0086_sequence_remembers_its_brief.sql.
--
-- A campaign brief carries forbidden_claims: the things this account must
-- never say, in any wording. AiSequenceBuilder takes a briefId, generates the
-- sequence with it, and then does not store it -- so by the time
-- process-sequence-step writes the email that actually goes out, nothing
-- records which brief the sequence was designed against, and every forbidden
-- claim is a rule the preview honoured and the send never saw.
--
-- Nullable, and ON DELETE SET NULL: a sequence outlives the brief it was
-- written from, and losing the brief must not take the sequence with it.

ALTER TABLE public.email_sequences
  ADD COLUMN IF NOT EXISTS brief_id uuid REFERENCES public.campaign_briefs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.email_sequences.brief_id IS
  'The campaign brief this sequence was written from. process-sequence-step reads its forbidden_claims so the rules that bound the preview also bind the send.';

CREATE INDEX IF NOT EXISTS idx_email_sequences_brief_id
  ON public.email_sequences (brief_id)
  WHERE brief_id IS NOT NULL;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('email_sequences', 'brief_id', 'Campaign brief the sequence was written from; supplies forbidden_claims at send')
ON CONFLICT (table_name, column_name) DO NOTHING;
