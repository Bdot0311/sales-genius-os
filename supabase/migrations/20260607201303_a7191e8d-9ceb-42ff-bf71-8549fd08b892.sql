
-- 1) api_keys: hide the raw `key` column from clients; expose via owner-only RPC
REVOKE SELECT ON public.api_keys FROM authenticated, anon;
GRANT SELECT (
  id, user_id, name, prefix, created_at, last_used_at, is_active,
  rate_limit_per_minute, rate_limit_per_day, total_requests, last_request_at,
  expires_at, rotation_reminder_sent, rotation_policy_days,
  endpoint_rate_limits, enable_caching, cache_ttl_seconds
) ON public.api_keys TO authenticated;

CREATE OR REPLACE FUNCTION public.get_api_key_value(_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _key text;
BEGIN
  SELECT user_id, key INTO _owner, _key FROM public.api_keys WHERE id = _id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'API key not found';
  END IF;
  IF _owner <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN _key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_api_key_value(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_api_key_value(uuid) TO authenticated;

-- 2) integrations: hide `config` (OAuth tokens) from clients
REVOKE SELECT ON public.integrations FROM authenticated, anon;
GRANT SELECT (
  id, user_id, integration_id, integration_name, is_active,
  created_at, updated_at, connected_email
) ON public.integrations TO authenticated;

-- 3) webhooks: hide `secret` from clients (clients already use webhooks_safe view + get_webhook_secret RPC)
REVOKE SELECT ON public.webhooks FROM authenticated, anon;
GRANT SELECT (
  id, user_id, name, url, events, is_active,
  created_at, last_triggered_at, total_triggers
) ON public.webhooks TO authenticated;

-- 4) login_history: drop redundant plaintext email column
ALTER TABLE public.login_history DROP COLUMN IF EXISTS user_email;

-- 5) signup_diagnostics: drop redundant plaintext email column
ALTER TABLE public.signup_diagnostics DROP COLUMN IF EXISTS email;

-- Update RPC that wrote user_email to login_history
CREATE OR REPLACE FUNCTION public.record_user_login(
  p_user_id uuid,
  p_user_email text DEFAULT NULL,
  p_login_method text DEFAULT 'password'::text,
  p_ip_address text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text,
  p_status text DEFAULT 'success'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.login_history (user_id, login_method, ip_address, user_agent, status)
  VALUES (p_user_id, p_login_method, p_ip_address, p_user_agent, p_status);

  IF p_status = 'success' THEN
    UPDATE public.profiles SET last_sign_in_at = now() WHERE id = p_user_id;
  END IF;
END;
$$;

-- Update RPC that wrote email to signup_diagnostics
CREATE OR REPLACE FUNCTION public.log_signup_event(
  _user_id uuid,
  _email text DEFAULT NULL,
  _stage text DEFAULT NULL,
  _status text DEFAULT 'info',
  _message text DEFAULT NULL,
  _details jsonb DEFAULT NULL::jsonb,
  _source text DEFAULT 'edge_function'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.signup_diagnostics
    (user_id, stage, status, message, details, source)
  VALUES
    (_user_id, _stage, COALESCE(_status, 'info'), _message, _details, COALESCE(_source, 'edge_function'));
END;
$$;

-- Update the signup trigger that referenced NEW.email on signup_diagnostics
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing_id uuid;
  _inserted_id uuid;
BEGIN
  INSERT INTO public.signup_diagnostics (user_id, stage, status, message, source)
  VALUES (NEW.id, 'trigger_start', 'info', 'handle_new_user_subscription invoked', 'db_trigger');

  SELECT id INTO _existing_id FROM public.subscriptions WHERE user_id = NEW.id LIMIT 1;
  IF _existing_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.subscriptions (
      user_id, plan, status, account_status,
      leads_limit, search_credits_base, search_credits_remaining, daily_searches_used,
      daily_email_limit,
      current_period_start, current_period_end, credits_reset_at
    )
    VALUES (
      NEW.id, 'free', 'active', 'active',
      10, 10, 10, 0,
      10,
      now(), public.next_month_start_utc(), public.next_month_start_utc()
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user_subscription failed for user %: % (%).', NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
