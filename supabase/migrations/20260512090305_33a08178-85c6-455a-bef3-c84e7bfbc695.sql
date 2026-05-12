
-- 1. Diagnostics table
CREATE TABLE IF NOT EXISTS public.signup_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  message text,
  sqlstate text,
  details jsonb,
  source text NOT NULL DEFAULT 'db_trigger',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_diagnostics_created_at
  ON public.signup_diagnostics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_diagnostics_user_id
  ON public.signup_diagnostics (user_id);
CREATE INDEX IF NOT EXISTS idx_signup_diagnostics_status
  ON public.signup_diagnostics (status);

ALTER TABLE public.signup_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view signup diagnostics" ON public.signup_diagnostics;
CREATE POLICY "Admins can view signup diagnostics"
  ON public.signup_diagnostics
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can insert signup diagnostics" ON public.signup_diagnostics;
CREATE POLICY "Service role can insert signup diagnostics"
  ON public.signup_diagnostics
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.signup_diagnostics;

-- 2. Helper RPC for backend code (edge functions / triggers)
CREATE OR REPLACE FUNCTION public.log_signup_event(
  _user_id uuid,
  _email text,
  _stage text,
  _status text,
  _message text,
  _details jsonb DEFAULT NULL,
  _source text DEFAULT 'edge_function'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.signup_diagnostics
    (user_id, email, stage, status, message, details, source)
  VALUES
    (_user_id, _email, _stage, COALESCE(_status, 'info'), _message, _details, COALESCE(_source, 'edge_function'));
END;
$$;

-- 3. Verbose provisioning trigger
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id uuid;
  _inserted_id uuid;
BEGIN
  INSERT INTO public.signup_diagnostics (user_id, email, stage, status, message, source)
  VALUES (NEW.id, NEW.email, 'trigger_start', 'info', 'handle_new_user_subscription invoked', 'db_trigger');

  SELECT id INTO _existing_id FROM public.subscriptions WHERE user_id = NEW.id LIMIT 1;
  IF _existing_id IS NOT NULL THEN
    INSERT INTO public.signup_diagnostics (user_id, email, stage, status, message, details, source)
    VALUES (NEW.id, NEW.email, 'subscription_exists', 'warning',
            'Subscription row already exists for this user; skipping insert',
            jsonb_build_object('subscription_id', _existing_id), 'db_trigger');
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.subscriptions (
      user_id, plan, status, account_status,
      leads_limit, search_credits_base, search_credits_remaining, daily_searches_used,
      current_period_start, current_period_end, credits_reset_at
    )
    VALUES (
      NEW.id, 'free', 'active', 'active',
      0, 0, 0, 0,
      now(), now() + interval '100 years', now() + interval '100 years'
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO _inserted_id;

    IF _inserted_id IS NOT NULL THEN
      INSERT INTO public.signup_diagnostics (user_id, email, stage, status, message, details, source)
      VALUES (NEW.id, NEW.email, 'subscription_created', 'success',
              'Free-tier subscription provisioned',
              jsonb_build_object('subscription_id', _inserted_id, 'plan', 'free'), 'db_trigger');
    ELSE
      INSERT INTO public.signup_diagnostics (user_id, email, stage, status, message, source)
      VALUES (NEW.id, NEW.email, 'subscription_conflict', 'warning',
              'Insert hit ON CONFLICT DO NOTHING (race condition)', 'db_trigger');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.signup_diagnostics (user_id, email, stage, status, message, sqlstate, details, source)
    VALUES (NEW.id, NEW.email, 'subscription_insert_failed', 'error',
            SQLERRM, SQLSTATE,
            jsonb_build_object('hint', 'Trigger swallowed the error so signup did not break'),
            'db_trigger');
    RAISE WARNING 'handle_new_user_subscription failed for user %: % (%).', NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Outermost guard - never block signup
  BEGIN
    INSERT INTO public.signup_diagnostics (user_id, email, stage, status, message, sqlstate, source)
    VALUES (NEW.id, NEW.email, 'trigger_outer_failure', 'error', SQLERRM, SQLSTATE, 'db_trigger');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;
