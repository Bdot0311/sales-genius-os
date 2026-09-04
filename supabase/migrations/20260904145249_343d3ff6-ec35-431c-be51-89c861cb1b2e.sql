-- Retire the approval queue.
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
ORDER BY a.user_id, a.lead_id, a.created_at DESC;

UPDATE public.agent_approvals
SET status = 'retired',
    review_note = COALESCE(review_note, '') ||
      CASE WHEN COALESCE(review_note, '') = '' THEN '' ELSE ' ' END ||
      'Approval queue retired. Approval now happens in the chat, and the email is saved as a draft.',
    updated_at = now()
WHERE status = 'pending';

COMMENT ON TABLE public.agent_approvals IS
  'Historical. The approval queue was retired: approval happens in the conversation and drafts are the pending state. Nothing writes pending rows here any more.';