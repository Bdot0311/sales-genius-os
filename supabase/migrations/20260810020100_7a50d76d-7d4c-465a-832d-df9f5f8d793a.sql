REVOKE ALL ON FUNCTION public.advance_lead_stage(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sweep_lead_no_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_lead_stage_from_sent_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_lead_stage_from_reply() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_lead_no_response() TO service_role;
