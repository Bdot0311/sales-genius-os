-- Retire the approval queue.
--
-- Approval used to write a row holding a frozen copy of a subject and body,
-- and that row outlived the conversation that made it. Approvals from old
-- threads stayed pending for weeks, a batch refused on a daily limit left one
-- unclearable row per recipient, and the queue reached 103 — every one of them
-- an email the user had asked for and never received.
--
-- Approval is a message in the chat now, and a draft is the pending state.
-- Drafts already persist, are already visible in the Drafts tab, and are
-- already what the send tools read.
--
-- Nothing is thrown away here. Every pending approval carries the email it was
-- holding, so anything without a draft behind it becomes one; the rest were
-- always duplicates of a draft that still exists.

-- 0. One draft per lead.
--
-- send_drafts already assumes this — it deduplicates by lead before sending,
-- because two drafts for the same person means that person gets two emails.
-- The rule was enforced in application code and nowhere in the database, so
-- duplicates accumulated and every send path had to remember to filter them.
--
-- Older duplicates go first; the newest wording is the one the user last saw.
DELETE FROM public.email_drafts d
USING public.email_drafts newer
WHERE d.lead_id IS NOT NULL
  AND d.user_id = newer.user_id
  AND d.lead_id = newer.lead_id
  AND (
    COALESCE(d.created_at, '-infinity'::timestamptz) < COALESCE(newer.created_at, '-infinity'::timestamptz)
    OR (d.created_at IS NOT DISTINCT FROM newer.created_at AND d.id < newer.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS email_drafts_user_lead_key
  ON public.email_drafts (user_id, lead_id)
  WHERE lead_id IS NOT NULL;

-- 1. Rescue the emails that only exist as approvals.
--
-- Chat approvals left the draft in place, so those are already covered. Runs
-- from agent-run did not — they wrote an approval and no draft, so this is the
-- only copy of that email.
INSERT INTO public.email_drafts (user_id, lead_id, subject, body, created_at)
SELECT DISTINCT ON (a.user_id, a.lead_id)
       a.user_id, a.lead_id, a.subject, a.body, a.created_at
FROM public.agent_approvals a
WHERE a.status = 'pending'
  AND a.lead_id IS NOT NULL
  AND a.subject IS NOT NULL
  AND a.body IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.email_drafts d
    WHERE d.user_id = a.user_id AND d.lead_id = a.lead_id
  )
-- Newest first: a lead with several stale approvals keeps the latest wording.
ORDER BY a.user_id, a.lead_id, a.created_at DESC;

-- 2. Close the queue.
--
-- Retired rather than deleted: these rows are the record of what the agent
-- asked to do and when, and that history is worth keeping even though nothing
-- reads the table for pending work any more.
UPDATE public.agent_approvals
SET status = 'retired',
    review_note = COALESCE(review_note, '') ||
      CASE WHEN COALESCE(review_note, '') = '' THEN '' ELSE ' ' END ||
      'Approval queue retired. Approval now happens in the chat, and the email is saved as a draft.',
    updated_at = now()
WHERE status = 'pending';

COMMENT ON TABLE public.agent_approvals IS
  'Historical. The approval queue was retired: approval happens in the conversation and drafts are the pending state. Nothing writes pending rows here any more.';
