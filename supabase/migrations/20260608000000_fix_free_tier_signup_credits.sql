-- Fix handle_new_user_subscription() to give free users 10 leads on signup
-- instead of 0. The previous trigger seeded 0 credits, blocking new users
-- from searching immediately. Also sets status='active' and account_status='free'
-- so the subscription row is recognised as valid by the app.

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    account_status,
    leads_limit,
    search_credits_base,
    search_credits_remaining,
    credits_reset_at
  )
  VALUES (
    NEW.id,
    'free',
    'active',
    'free',
    10,
    10,
    10,
    public.next_month_start_utc()
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Backfill any existing free users who still have 0 credits
-- (covers anyone who signed up before this fix)
UPDATE public.subscriptions
SET
  status        = COALESCE(NULLIF(status, ''), 'active'),
  account_status = COALESCE(NULLIF(account_status, ''), 'free'),
  leads_limit   = GREATEST(COALESCE(leads_limit, 0), 10),
  search_credits_base      = GREATEST(COALESCE(search_credits_base, 0), 10),
  search_credits_remaining = GREATEST(COALESCE(search_credits_remaining, 0), 10),
  credits_reset_at = COALESCE(credits_reset_at, public.next_month_start_utc()),
  updated_at    = now()
WHERE plan = 'free'
  AND (
    leads_limit = 0
    OR search_credits_base = 0
    OR search_credits_remaining = 0
    OR status IS NULL
    OR status = ''
  );
