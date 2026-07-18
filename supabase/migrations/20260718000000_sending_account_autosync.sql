-- Deliverability: auto-sync sending_accounts from integrations.
--
-- The original suite migration backfilled sending_accounts once from existing
-- integrations, but a mailbox connected AFTER that point never got a row, so it
-- didn't appear in the Command Center. This adds a trigger that keeps
-- sending_accounts in sync whenever a Gmail/Google integration is connected or
-- updated, plus a one-time backfill to pick up any already-connected mailbox.

CREATE OR REPLACE FUNCTION public.sync_sending_account_from_integration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true
     AND coalesce(NEW.config->>'connected_email', '') <> ''
     AND (NEW.integration_id ILIKE '%google%' OR NEW.integration_id ILIKE '%gmail%')
  THEN
    INSERT INTO public.sending_accounts (user_id, integration_id, email, provider, warmup_enabled)
    VALUES (NEW.user_id, NEW.id, NEW.config->>'connected_email', 'gmail', false)
    ON CONFLICT (user_id, email)
      DO UPDATE SET integration_id = EXCLUDED.integration_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sending_account ON public.integrations;
CREATE TRIGGER trg_sync_sending_account
  AFTER INSERT OR UPDATE OF is_active, config ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.sync_sending_account_from_integration();

-- One-time backfill for mailboxes connected since the initial suite migration.
INSERT INTO public.sending_accounts (user_id, integration_id, email, provider, warmup_enabled)
SELECT i.user_id, i.id, i.config->>'connected_email',
       CASE WHEN i.integration_id ILIKE '%google%' OR i.integration_id ILIKE '%gmail%' THEN 'gmail' ELSE i.integration_id END,
       false
FROM public.integrations i
WHERE i.is_active = true
  AND coalesce(i.config->>'connected_email', '') <> ''
  AND (i.integration_id ILIKE '%google%' OR i.integration_id ILIKE '%gmail%')
ON CONFLICT (user_id, email) DO NOTHING;
