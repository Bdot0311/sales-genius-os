
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    daily_searches_used,
    current_period_start,
    current_period_end,
    credits_reset_at
  )
  VALUES (
    NEW.id,
    'free',
    'active',
    'active',
    0,
    0,
    0,
    0,
    now(),
    now() + interval '100 years',
    now() + interval '100 years'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block signup if provisioning fails for some reason
  RAISE WARNING 'handle_new_user_subscription failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Ensure user_id is unique so ON CONFLICT works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND contype IN ('u','p')
      AND conkey = (
        SELECT array_agg(attnum) FROM pg_attribute
        WHERE attrelid = 'public.subscriptions'::regclass
          AND attname = 'user_id'
      )
  ) THEN
    BEGIN
      ALTER TABLE public.subscriptions
        ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- Backfill any existing user without a subscription row
INSERT INTO public.subscriptions (
  user_id, plan, status, account_status,
  leads_limit, search_credits_base, search_credits_remaining, daily_searches_used,
  current_period_start, current_period_end, credits_reset_at
)
SELECT
  u.id, 'free', 'active', 'active',
  0, 0, 0, 0,
  now(), now() + interval '100 years', now() + interval '100 years'
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
