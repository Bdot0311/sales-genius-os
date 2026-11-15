-- Two agent runs can each insert a row for the same Gmail message before
-- either sees the other. Claiming by row id then lets both answer. A claim
-- now fails when another row for that same message is already processed or
-- still inside its lease.

CREATE OR REPLACE FUNCTION public.claim_reply_for_agent(
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
     AND NOT EXISTS (
       SELECT 1
         FROM public.reply_analysis other
        WHERE other.user_id = p_user_id
          AND other.id <> p_id
          AND other.detected_signals->>'gmail_message_id' IS NOT NULL
          AND other.detected_signals->>'gmail_message_id' = reply_analysis.detected_signals->>'gmail_message_id'
          AND (
            coalesce(other.processed_by_agent, false) = true
            OR (other.agent_claimed_at IS NOT NULL AND other.agent_claimed_at >= now() - interval '15 minutes')
          )
     )
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reply_for_agent(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reply_for_agent(uuid, uuid, timestamptz) TO service_role;
