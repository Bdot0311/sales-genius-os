-- Lock down the new SECURITY DEFINER helpers added by the activation-funnel fix.
-- They are trigger-only internals and should not be callable from the API.
REVOKE EXECUTE ON FUNCTION public.recompute_activation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_activation_search() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_activation_lead() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_activation_sent_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_activation_onboarding() FROM PUBLIC, anon, authenticated;

-- activation_stage_rank is an IMMUTABLE SQL helper with no elevated privileges;
-- no revoke needed.

-- admin_get_activation_funnel and admin_list_activation_users intentionally
-- remain executable by authenticated users because they perform their own
-- admin-role check via public.has_role(auth.uid(), 'admin').