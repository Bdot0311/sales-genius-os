/*
 * A lapsed account's sends were never counted, so its daily cap never bit.
 *
 * `increment_daily_emails_sent` carries `AND status = 'active'`. For a row
 * that is past_due, paused or cancelled the UPDATE matches nothing and
 * *succeeds* — no error, so the caller's error-only fallback never runs and
 * `daily_emails_sent` stays at zero for good. An account with no subscriptions
 * row at all has nowhere for a counter to live in the first place.
 *
 * Enforcing a daily cap against that number is enforcing it against zero. The
 * monthly cap survived only because it was already a live count of
 * sent_emails rather than a counter — which is the same reasoning, reached
 * once before and not carried across.
 *
 * So the daily cap gets a live count too, and the counter column keeps being
 * maintained for what reads it: the Outreach and Deliverability panels show
 * it, and a counter frozen at zero on a lapsed account is its own small lie.
 */

/*
 * Today's sends, counted rather than remembered.
 *
 * Mirrors get_monthly_email_count exactly — same table, same statuses, same
 * caller check — so the two caps cannot drift apart in what they consider a
 * send. 'bounced' is excluded by both: a bounce left the building, but the
 * product does not charge an allowance for a message nobody received.
 *
 * `date_trunc('day', now())` is UTC on this database, which is the midnight
 * the senders already compute with Date.UTC.
 */
CREATE OR REPLACE FUNCTION public.get_daily_email_count(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.sent_emails
  WHERE user_id = p_user_id
    AND (auth.role() = 'service_role' OR auth.uid() = p_user_id)
    AND status IN ('sent','delivered','opened','clicked','replied')
    AND sent_at >= date_trunc('day', now());
$$;

REVOKE ALL ON FUNCTION public.get_daily_email_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_email_count(UUID) TO authenticated, service_role;

/*
 * And count the send whatever the account's standing.
 *
 * The status filter meant the number shown to a lapsed account stopped moving
 * the moment their card failed. The cap no longer depends on this, but the
 * panels that display it do, and a frozen counter reads as "you have sent
 * nothing today" to someone who has been sending all morning.
 */
CREATE OR REPLACE FUNCTION public.increment_daily_emails_sent(_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.subscriptions
     SET daily_emails_sent = COALESCE(daily_emails_sent, 0) + 1
   WHERE user_id = _user_id;
$$;

REVOKE ALL ON FUNCTION public.increment_daily_emails_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_daily_emails_sent(uuid) TO authenticated, service_role;
