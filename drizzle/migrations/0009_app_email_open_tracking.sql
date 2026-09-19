ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS pixel_id uuid,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_to text;

CREATE UNIQUE INDEX IF NOT EXISTS email_send_log_pixel_id_key
  ON public.email_send_log (pixel_id) WHERE pixel_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.admin_get_email_send_logs(timestamptz, integer);

CREATE FUNCTION public.admin_get_email_send_logs(
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
  created_at timestamptz,
  opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer,
  reply_to text
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
    esl.created_at,
    esl.opened_at,
    esl.last_opened_at,
    esl.open_count,
    esl.reply_to
  FROM public.email_send_log esl
  WHERE (_since IS NULL OR esl.created_at >= _since)
  ORDER BY COALESCE(esl.message_id, esl.id::text), esl.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 1000), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_email_send_logs(timestamptz, integer) TO service_role;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('email_send_log','pixel_id','Admin email inbox open tracking'),
  ('email_send_log','opened_at','Admin email inbox open tracking'),
  ('email_send_log','last_opened_at','Admin email inbox open tracking'),
  ('email_send_log','open_count','Admin email inbox open tracking'),
  ('email_send_log','reply_to','Admin email inbox reply routing')
ON CONFLICT DO NOTHING;