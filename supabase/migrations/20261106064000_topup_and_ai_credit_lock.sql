-- Two more credit writes that raced, without changing the RPC signatures
-- callers already deployed against.
--
-- record_ai_usage keeps (text, text, text, integer, integer, numeric, uuid).
-- The balance read was not locked, so two usage rows could both subtract from
-- the same number. The read is now FOR UPDATE, and the stored balance is that
-- locked value.
--
-- grant_topup_credits is new. verify-topup-payment used to add credits and
-- then insert the session row. Two overlapping verifications of one Stripe
-- session could both add, and the unique session insert only stopped the
-- second row. The insert and the add now commit together. A second call finds
-- the session and adds nothing.

CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_fn text,
  p_provider text,
  p_model text,
  p_prompt_tokens integer DEFAULT 0,
  p_completion_tokens integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0,
  p_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer := 0;
  v_remaining integer;
  v_next integer;
  v_exempt boolean := false;
BEGIN
  v_credits := GREATEST(0, CEIL(COALESCE(p_cost_usd, 0) / 0.002))::integer;

  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(billing_exempt, false), COALESCE(search_credits_remaining, 0)
      INTO v_exempt, v_remaining
      FROM public.subscriptions
     WHERE user_id = p_user_id
     FOR UPDATE;

    IF COALESCE(v_exempt, false) OR public.has_role(p_user_id, 'admin') THEN
      v_credits := 0;
    ELSIF v_credits > 0 AND v_remaining IS NOT NULL THEN
      v_next := GREATEST(0, v_remaining - v_credits);
      UPDATE public.subscriptions
         SET search_credits_remaining = v_next
       WHERE user_id = p_user_id;

      INSERT INTO public.search_transactions (user_id, type, amount, balance_after, description)
      VALUES (p_user_id, 'usage', -v_credits, v_next, 'AI usage: ' || p_fn);
    END IF;
  END IF;

  INSERT INTO public.ai_usage_events (
    user_id, fn, provider, model, prompt_tokens, completion_tokens, cost_usd, credits_charged
  ) VALUES (
    p_user_id, p_fn, p_provider, p_model,
    COALESCE(p_prompt_tokens, 0), COALESCE(p_completion_tokens, 0),
    COALESCE(p_cost_usd, 0), v_credits
  );

  RETURN v_credits;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_usage(text, text, text, integer, integer, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(text, text, text, integer, integer, numeric, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_topup_credits(
  p_user_id uuid,
  p_session_id text,
  p_prospects integer,
  p_amount_paid integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer;
  v_inserted uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'grant_topup_credits denied';
  END IF;
  IF p_session_id IS NULL OR length(btrim(p_session_id)) = 0 OR p_prospects IS NULL OR p_prospects <= 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_amount');
  END IF;

  INSERT INTO public.topup_payments (user_id, stripe_session_id, prospects_added, amount_paid)
  VALUES (p_user_id, p_session_id, p_prospects, p_amount_paid)
  ON CONFLICT (stripe_session_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_granted');
  END IF;

  SELECT COALESCE(search_credits_remaining, 0)
    INTO v_credits
    FROM public.subscriptions
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_subscription';
  END IF;

  v_credits := v_credits + p_prospects;

  UPDATE public.subscriptions
     SET search_credits_remaining = v_credits
   WHERE user_id = p_user_id;

  INSERT INTO public.search_transactions (user_id, type, amount, balance_after, description)
  VALUES (
    p_user_id,
    'topup',
    p_prospects,
    v_credits,
    left('One-time top-up: +' || p_prospects::text || ' prospects', 500)
  );

  RETURN jsonb_build_object('applied', true, 'credits', v_credits);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_topup_credits(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_topup_credits(uuid, text, integer, integer)
  TO service_role;
