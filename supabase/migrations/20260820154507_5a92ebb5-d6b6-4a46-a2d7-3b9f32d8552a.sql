REVOKE EXECUTE ON FUNCTION public.increment_ai_gateway_usage(NUMERIC) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ai_gateway_usage_alert() FROM authenticated;

-- Keep service_role and anon grants as needed:
-- service_role remains for edge functions; anon has no business calling these.
GRANT EXECUTE ON FUNCTION public.increment_ai_gateway_usage(NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_ai_gateway_usage_alert() TO service_role;
