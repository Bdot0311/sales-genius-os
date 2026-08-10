ALTER TABLE public.reputation_snapshots ADD COLUMN IF NOT EXISTS warmup_volume integer NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.get_reputation_inputs(integer);

-- Nightly inputs now include warmup traffic: it is real send activity from the
-- mailbox, so it must count toward the volume that unlocks a score.
CREATE OR REPLACE FUNCTION public.get_reputation_inputs(p_days integer DEFAULT 30)
RETURNS TABLE(sending_account_id uuid, user_id uuid, sent bigint, bounced bigint, complaints bigint, opened bigint,
              warmup_sent bigint, warmup_replied bigint, warmup_inbox bigint, warmup_spam bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH se AS (
    SELECT s.sending_account_id, s.user_id,
           count(*) AS sent,
           count(*) FILTER (WHERE s.status = 'bounced') AS bounced,
           count(*) FILTER (WHERE s.status = 'spam_complaint') AS complaints,
           count(*) FILTER (WHERE s.opened_at IS NOT NULL) AS opened
    FROM public.sent_emails s
    WHERE s.sending_account_id IS NOT NULL
      AND s.sent_at >= now() - make_interval(days => p_days)
    GROUP BY s.sending_account_id, s.user_id
  ), wm AS (
    SELECT w.from_account_id AS sending_account_id,
           count(*) AS warmup_sent,
           count(*) FILTER (WHERE w.replied_at IS NOT NULL) AS warmup_replied,
           count(*) FILTER (WHERE w.folder_detected = 'inbox') AS warmup_inbox,
           count(*) FILTER (WHERE w.folder_detected = 'spam') AS warmup_spam
    FROM public.warmup_messages w
    WHERE w.from_account_id IS NOT NULL
      AND w.sent_at >= now() - make_interval(days => p_days)
    GROUP BY w.from_account_id
  )
  SELECT a.id, a.user_id,
         coalesce(se.sent, 0), coalesce(se.bounced, 0), coalesce(se.complaints, 0), coalesce(se.opened, 0),
         coalesce(wm.warmup_sent, 0), coalesce(wm.warmup_replied, 0),
         coalesce(wm.warmup_inbox, 0), coalesce(wm.warmup_spam, 0)
  FROM public.sending_accounts a
  LEFT JOIN se ON se.sending_account_id = a.id
  LEFT JOIN wm ON wm.sending_account_id = a.id;
$function$;

-- Single live source of truth for the deliverability suite. Every panel reads
-- this, so the overview, per-mailbox cards and warmup stats can never disagree,
-- and the figures move the moment an email or warmup message is recorded
-- instead of waiting for the nightly snapshot job.
CREATE OR REPLACE FUNCTION public.get_deliverability_live_stats(p_days integer DEFAULT 30)
RETURNS TABLE(sending_account_id uuid, outreach_sent bigint, bounced bigint, complaints bigint, opened bigint,
              warmup_sent bigint, warmup_replied bigint, warmup_inbox bigint, warmup_spam bigint,
              volume bigint, bounce_rate numeric, complaint_rate numeric, open_rate numeric,
              warmup_reply_rate numeric, warmup_inbox_rate numeric, reputation_score integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH acct AS (
    SELECT id FROM public.sending_accounts WHERE user_id = auth.uid()
  ), se AS (
    SELECT s.sending_account_id,
           count(*) AS sent,
           count(*) FILTER (WHERE s.status = 'bounced') AS bounced,
           count(*) FILTER (WHERE s.status = 'spam_complaint') AS complaints,
           count(*) FILTER (WHERE s.opened_at IS NOT NULL) AS opened
    FROM public.sent_emails s
    WHERE s.sending_account_id IN (SELECT id FROM acct)
      AND s.sent_at >= now() - make_interval(days => p_days)
    GROUP BY s.sending_account_id
  ), wm AS (
    SELECT w.from_account_id AS sending_account_id,
           count(*) AS warmup_sent,
           count(*) FILTER (WHERE w.replied_at IS NOT NULL) AS warmup_replied,
           count(*) FILTER (WHERE w.folder_detected = 'inbox') AS warmup_inbox,
           count(*) FILTER (WHERE w.folder_detected = 'spam') AS warmup_spam
    FROM public.warmup_messages w
    WHERE w.from_account_id IN (SELECT id FROM acct)
      AND w.sent_at >= now() - make_interval(days => p_days)
    GROUP BY w.from_account_id
  ), base AS (
    SELECT a.id,
           coalesce(se.sent, 0)::bigint AS outreach_sent,
           coalesce(se.bounced, 0)::bigint AS bounced,
           coalesce(se.complaints, 0)::bigint AS complaints,
           coalesce(se.opened, 0)::bigint AS opened,
           coalesce(wm.warmup_sent, 0)::bigint AS warmup_sent,
           coalesce(wm.warmup_replied, 0)::bigint AS warmup_replied,
           coalesce(wm.warmup_inbox, 0)::bigint AS warmup_inbox,
           coalesce(wm.warmup_spam, 0)::bigint AS warmup_spam
    FROM acct a
    LEFT JOIN se ON se.sending_account_id = a.id
    LEFT JOIN wm ON wm.sending_account_id = a.id
  )
  SELECT b.id,
         b.outreach_sent, b.bounced, b.complaints, b.opened,
         b.warmup_sent, b.warmup_replied, b.warmup_inbox, b.warmup_spam,
         (b.outreach_sent + b.warmup_sent) AS volume,
         CASE WHEN b.outreach_sent > 0 THEN round(b.bounced * 100.0 / b.outreach_sent, 3) ELSE NULL END,
         CASE WHEN b.outreach_sent > 0 THEN round(b.complaints * 100.0 / b.outreach_sent, 3) ELSE NULL END,
         CASE WHEN b.outreach_sent > 0 THEN round(b.opened * 100.0 / b.outreach_sent, 3) ELSE NULL END,
         CASE WHEN b.warmup_sent > 0 THEN round(b.warmup_replied * 100.0 / b.warmup_sent, 3) ELSE NULL END,
         CASE WHEN (b.warmup_inbox + b.warmup_spam) > 0
              THEN round(b.warmup_inbox * 100.0 / (b.warmup_inbox + b.warmup_spam), 3) ELSE NULL END,
         CASE WHEN (b.outreach_sent + b.warmup_sent) < 20 THEN NULL
              ELSE greatest(0, least(100, round(
                   100
                   - least(50, CASE WHEN b.outreach_sent > 0 THEN b.bounced * 600.0 / b.outreach_sent ELSE 0 END)
                   - least(40, CASE WHEN b.outreach_sent > 0 THEN b.complaints * 13000.0 / b.outreach_sent ELSE 0 END)
                   - least(25, CASE WHEN (b.warmup_inbox + b.warmup_spam) > 0
                                    THEN b.warmup_spam * 100.0 / (b.warmup_inbox + b.warmup_spam) ELSE 0 END)
                   - CASE WHEN b.outreach_sent >= 50 AND b.opened * 1.0 / b.outreach_sent < 0.05 THEN 5 ELSE 0 END
              )))::integer END
  FROM base b;
$function$;

GRANT EXECUTE ON FUNCTION public.get_deliverability_live_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deliverability_live_stats(integer) TO service_role;