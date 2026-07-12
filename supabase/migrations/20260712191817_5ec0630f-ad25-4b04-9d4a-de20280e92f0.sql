REVOKE EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) TO service_role;