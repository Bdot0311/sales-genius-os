-- Fix: sending_accounts auto-sync must read integrations.connected_email (a real
-- COLUMN), not config->>'connected_email' (a JSON field that is empty for these
-- rows). Each connected Google account is its own integrations row with
-- integration_id='google' and its email in the connected_email column, so the
-- previous version only picked up the one legacy row that happened to carry the
-- email inside config. This resyncs every connected Gmail mailbox.

CREATE OR REPLACE FUNCTION public.sync_sending_account_from_integration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true
     AND coalesce(NEW.connected_email, '') <> ''
     AND (NEW.integration_id ILIKE '%google%' OR NEW.integration_id ILIKE '%gmail%')
  THEN
    INSERT INTO public.sending_accounts (user_id, integration_id, email, provider, warmup_enabled)
    VALUES (NEW.user_id, NEW.id, NEW.connected_email, 'gmail', false)
    ON CONFLICT (user_id, email)
      DO UPDATE SET integration_id = EXCLUDED.integration_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sending_account ON public.integrations;
CREATE TRIGGER trg_sync_sending_account
  AFTER INSERT OR UPDATE OF is_active, connected_email, config ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.sync_sending_account_from_integration();

-- Backfill every already-connected Gmail mailbox using the correct column.
INSERT INTO public.sending_accounts (user_id, integration_id, email, provider, warmup_enabled)
SELECT i.user_id, i.id, i.connected_email, 'gmail', false
FROM public.integrations i
WHERE i.is_active = true
  AND coalesce(i.connected_email, '') <> ''
  AND (i.integration_id ILIKE '%google%' OR i.integration_id ILIKE '%gmail%')
ON CONFLICT (user_id, email) DO NOTHING;
