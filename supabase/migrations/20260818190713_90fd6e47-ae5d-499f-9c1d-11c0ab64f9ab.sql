REVOKE ALL ON FUNCTION public.trg_lead_stage_from_reply_analysis() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_lead_stage_from_bounce() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_lead_stage(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_lead_stage_from_reply_analysis() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_lead_stage_from_bounce() TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_lead_stage(uuid, text) TO service_role;