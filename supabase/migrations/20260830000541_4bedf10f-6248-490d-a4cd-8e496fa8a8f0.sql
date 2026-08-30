-- 1) agency_clients: prevent agency_id spoofing / accidental widening of reads
ALTER TABLE public.agency_clients ALTER COLUMN agency_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Only the owning agency can read agency_clients" ON public.agency_clients;
CREATE POLICY "Only the owning agency can read agency_clients"
ON public.agency_clients
AS RESTRICTIVE
FOR SELECT TO authenticated, anon
USING (agency_id = auth.uid());

REVOKE ALL ON public.agency_clients FROM anon;

-- 2) email_send_log: single authoritative admin-only policy
DROP POLICY IF EXISTS "Admins can view email send logs" ON public.email_send_log;
DROP POLICY IF EXISTS "Restrict email_send_log to admins" ON public.email_send_log;

CREATE POLICY "Only admins can access email send logs"
ON public.email_send_log
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages email_send_log" ON public.email_send_log;
CREATE POLICY "Service role manages email_send_log"
ON public.email_send_log
FOR ALL TO service_role
USING (true) WITH CHECK (true);

REVOKE ALL ON public.email_send_log FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;

-- 3) warmup_messages: verify mailbox ownership against sending_accounts
DROP POLICY IF EXISTS "Users can view own warmup messages" ON public.warmup_messages;
DROP POLICY IF EXISTS "Users can view warmup messages for their own mailboxes" ON public.warmup_messages;
CREATE POLICY "Users can view warmup messages for their own mailboxes"
ON public.warmup_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sending_accounts sa
    WHERE sa.user_id = auth.uid()
      AND sa.id IN (warmup_messages.from_account_id, warmup_messages.to_account_id)
  )
);

DROP POLICY IF EXISTS "Deny client-side insert to warmup_messages" ON public.warmup_messages;
CREATE POLICY "Deny client-side insert to warmup_messages"
ON public.warmup_messages AS RESTRICTIVE
FOR INSERT TO authenticated, anon
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client-side update to warmup_messages" ON public.warmup_messages;
CREATE POLICY "Deny client-side update to warmup_messages"
ON public.warmup_messages AS RESTRICTIVE
FOR UPDATE TO authenticated, anon
USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client-side delete to warmup_messages" ON public.warmup_messages;
CREATE POLICY "Deny client-side delete to warmup_messages"
ON public.warmup_messages AS RESTRICTIVE
FOR DELETE TO authenticated, anon
USING (false);

REVOKE ALL ON public.warmup_messages FROM anon;