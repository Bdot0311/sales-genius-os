-- The first agent run after this ships must not answer the backlog.
-- Every reply_analysis row that already exists was recorded by Inbox Sync or
-- analyze-reply with processed_by_agent left unset. Claiming those would
-- draft or send to people who replied days ago, including people the user
-- has already answered by hand.
--
-- Two gates, and both have to fail closed. Rows that exist at this moment
-- are marked processed, so they are history. The claim also refuses anything
-- written before shipped_at, and anything older than 72 hours, so a reply
-- that sits unprocessed for a week is not answered automatically either.

CREATE TABLE IF NOT EXISTS public.agent_reply_cutoff (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shipped_at timestamptz NOT NULL
);

INSERT INTO public.agent_reply_cutoff (id, shipped_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE public.agent_reply_cutoff FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agent_reply_cutoff TO authenticated;
GRANT ALL ON TABLE public.agent_reply_cutoff TO service_role;

ALTER TABLE public.agent_reply_cutoff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_reply_cutoff_read" ON public.agent_reply_cutoff;
CREATE POLICY "agent_reply_cutoff_read"
  ON public.agent_reply_cutoff
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'agent_reply_cutoff', 'shipped_at', 'Replies recorded before this instant are not auto-answered'
WHERE NOT EXISTS (
  SELECT 1 FROM public.schema_contract
  WHERE table_name = 'agent_reply_cutoff' AND column_name = 'shipped_at'
);

UPDATE public.reply_analysis
   SET processed_by_agent = true
 WHERE coalesce(processed_by_agent, false) = false;

CREATE OR REPLACE FUNCTION public.claim_reply_for_agent(p_id uuid, p_user_id uuid)
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
  IF p_id IS NULL OR p_user_id IS NULL THEN
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
     AND coalesce(analyzed_at, created_at) >= now() - interval '72 hours'
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reply_for_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reply_for_agent(uuid, uuid) TO service_role;
