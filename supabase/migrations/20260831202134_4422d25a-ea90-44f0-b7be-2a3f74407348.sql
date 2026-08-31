REVOKE ALL ON FUNCTION public.trg_webhooks_leads() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_webhooks_deals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_webhook_event(uuid, text, jsonb) FROM anon, authenticated;