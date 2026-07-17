-- Deliverability Suite — Phase 4: per-account sending controls (limits + rotation).

-- Atomically enforce a sending account's daily limit. Resets the counter on a
-- new day, blocks when the account is paused/disabled or at its cap, otherwise
-- increments and stamps last_sent_at. Returns true when the send is allowed.
-- Ownership is enforced via auth.uid() so a caller can only spend its own quota.
CREATE OR REPLACE FUNCTION public.increment_account_send(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sending_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.sending_accounts
   WHERE id = p_account_id AND user_id = auth.uid()
   FOR UPDATE;

  -- No per-account row (e.g. not migrated): don't block; user-level caps apply.
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_row.status <> 'active' THEN
    RETURN false;
  END IF;

  -- Roll the daily counter over at the start of a new day.
  IF v_row.sent_today_date < CURRENT_DATE THEN
    v_row.sent_today := 0;
    v_row.sent_today_date := CURRENT_DATE;
  END IF;

  IF v_row.sent_today >= v_row.daily_limit THEN
    RETURN false;
  END IF;

  UPDATE public.sending_accounts
     SET sent_today = v_row.sent_today + 1,
         sent_today_date = v_row.sent_today_date,
         last_sent_at = now()
   WHERE id = p_account_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_account_send(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_account_send(uuid) TO authenticated;

-- Rotation helper: pick the least-recently-used active account that still has
-- capacity today, so volume spreads across mailboxes. For orchestrators
-- (service role) — the interactive send path passes an explicit account.
CREATE OR REPLACE FUNCTION public.pick_sending_account(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM public.sending_accounts
   WHERE user_id = p_user_id
     AND status = 'active'
     AND (sent_today_date < CURRENT_DATE OR sent_today < daily_limit)
   ORDER BY last_sent_at ASC NULLS FIRST
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pick_sending_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pick_sending_account(uuid) TO service_role;
