-- The scheduled sweep records a reply before the agent runs. The next
-- inbox-sync then treats that Gmail message as already seen and does not
-- return it, so the agent never drafts. This claim lets one agent run take
-- the row. A second run, or a sweep, does not. A run that dies releases the
-- row after fifteen minutes.

ALTER TABLE public.reply_analysis
  ADD COLUMN IF NOT EXISTS agent_claimed_at timestamptz;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'reply_analysis', 'agent_claimed_at', 'Lease so one agent run answers a swept reply, and a dead run does not hold it'
WHERE NOT EXISTS (
  SELECT 1 FROM public.schema_contract
  WHERE table_name = 'reply_analysis' AND column_name = 'agent_claimed_at'
);

CREATE OR REPLACE FUNCTION public.claim_reply_for_agent(p_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_reply_for_agent is internal';
  END IF;
  IF p_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.reply_analysis
     SET agent_claimed_at = now()
   WHERE id = p_id
     AND user_id = p_user_id
     AND coalesce(processed_by_agent, false) = false
     AND (agent_claimed_at IS NULL OR agent_claimed_at < now() - interval '15 minutes')
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reply_for_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reply_for_agent(uuid, uuid) TO service_role;
