-- Remove the open-rate penalty from the live reputation score.
--
-- get_deliverability_live_stats carried a fourth deduction the shared scorer
-- does not have:
--
--   - CASE WHEN outreach_sent >= 50 AND opened / outreach_sent < 0.05 THEN 5 END
--
-- _shared/reputation.ts dropped open rate as a score input on purpose, and
-- says why: the open pixel fires from the spam folder when the provider loads
-- images, so the number meant to measure placement is inflated by the exact
-- failure it should catch. Scoring on it punishes mailboxes whose recipients
-- block images, and it moves the score when tracking settings change rather
-- than when deliverability does.
--
-- That left two scorers disagreeing. compute-reputation writes the nightly
-- trend line from the TypeScript; this function feeds the number on the card.
-- Above 50 outreach sends with a low open rate they differed by 5 points, so
-- the card and the sparkline directly beneath it reported different scores
-- with nothing on the page to explain the gap.
--
-- Worse, it made the open-tracking toggle a trap. Turning tracking off zeroes
-- `opened`, which drives the measured open rate to 0% -- so a mailbox over 50
-- sends lost 5 reputation points for changing a setting the page recommends
-- changing, and the damage looked like a deliverability decline.
--
-- open_rate is still returned. It is worth looking at. It just does not score.
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
         -- Three deductions, identical to computeReputation() in
         -- supabase/functions/_shared/reputation.ts. The UI reconstructs this
         -- sum client-side to attribute the deficit, and hides the attribution
         -- if it cannot reproduce the number -- so if these ever drift apart
         -- again, the page goes quiet instead of blaming the wrong cause.
         CASE WHEN (b.outreach_sent + b.warmup_sent) < 20 THEN NULL
              ELSE greatest(0, least(100, round(
                   100
                   - least(50, CASE WHEN b.outreach_sent > 0 THEN b.bounced * 600.0 / b.outreach_sent ELSE 0 END)
                   - least(40, CASE WHEN b.outreach_sent > 0 THEN b.complaints * 13000.0 / b.outreach_sent ELSE 0 END)
                   - least(25, CASE WHEN (b.warmup_inbox + b.warmup_spam) > 0
                                    THEN b.warmup_spam * 100.0 / (b.warmup_inbox + b.warmup_spam) ELSE 0 END)
              )))::integer END
  FROM base b;
$function$;

GRANT EXECUTE ON FUNCTION public.get_deliverability_live_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deliverability_live_stats(integer) TO service_role;
