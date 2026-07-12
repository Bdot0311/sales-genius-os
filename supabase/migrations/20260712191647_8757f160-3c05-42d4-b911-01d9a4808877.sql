CREATE OR REPLACE FUNCTION public.admin_get_email_send_logs(
  _since timestamptz DEFAULT NULL,
  _limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  message_id text,
  template_name text,
  recipient_email text,
  status text,
  error_message text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (COALESCE(esl.message_id, esl.id::text))
    esl.id,
    esl.message_id,
    esl.template_name,
    esl.recipient_email,
    esl.status,
    esl.error_message,
    esl.metadata,
    esl.created_at
  FROM public.email_send_log esl
  WHERE (_since IS NULL OR esl.created_at >= _since)
  ORDER BY COALESCE(esl.message_id, esl.id::text), esl.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 1000), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) TO service_role;