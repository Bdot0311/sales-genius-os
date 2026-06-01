-- Lock down SECURITY DEFINER functions that should never be called from the
-- client. Trigger/cron/edge-only helpers get EXECUTE revoked from anon &
-- authenticated; service_role keeps access.

REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_signup_via_edge() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_trail() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_team_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_lead_score_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_workflow_on_trigger() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_onboarding_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_cache() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_expiring_api_keys() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_expired_trials() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_stripe_event_to_subscription(uuid, text, timestamptz, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_signup_event(uuid, text, text, text, text, jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text, uuid, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_user_login(uuid, text, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_expiring_trials(integer) FROM anon, authenticated;