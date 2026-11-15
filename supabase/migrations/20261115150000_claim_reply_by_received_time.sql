-- The 72-hour gate was on when we wrote the reply_analysis row, not on when
-- the prospect replied. The first sweep after deploy records threads from the
-- last 30 days, so a three-week-old reply gets a fresh analyzed_at and the
-- agent would answer it. The received time is passed in and checked here, in
-- the claim, so there is one rule. Older replies stay stored for the inbox
-- and still stop the sequence. They are not handed to the agent.

DROP FUNCTION IF EXISTS public.claim_reply_for_agent(uuid, uuid);

CREATE FUNCTION public.claim_reply_for_agent(
  p_id uuid,
  p_user_id uuid,
  p_received_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_shipped timestamptz;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_reply_for_agent is internal';
  END IF;
  IF p_id IS NULL OR p_user_id IS NULL OR p_received_at IS NULL THEN
    RETURN false;
  END IF;
  -- When the prospect replied, not when we stored the row.
  IF p_received_at < now() - interval '72 hours' THEN
    RETURN false;
  END IF;

  SELECT shipped_at INTO v_shipped FROM public.agent_reply_cutoff WHERE id = 1;
  IF v_shipped IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.reply_analysis
     SET agent_claimed_at = now()
   WHERE id = p_id
     AND user_id = p_user_id
     AND coalesce(processed_by_agent, false) = false
     AND (agent_claimed_at IS NULL OR agent_claimed_at < now() - interval '15 minutes')
     AND coalesce(analyzed_at, created_at) >= v_shipped
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reply_for_agent(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reply_for_agent(uuid, uuid, timestamptz) TO service_role;
