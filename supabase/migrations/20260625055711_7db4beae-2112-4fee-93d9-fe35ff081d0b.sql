CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    'active',
    10,
    10,
    10,
    public.next_month_start_utc()
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;