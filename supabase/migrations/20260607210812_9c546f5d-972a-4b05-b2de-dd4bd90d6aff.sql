
CREATE TABLE IF NOT EXISTS public.rl_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rl_buckets TO service_role;
ALTER TABLE public.rl_buckets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS rl_buckets_window_idx ON public.rl_buckets(window_start);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _max integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _bucket timestamptz;
  _hits integer;
BEGIN
  IF _key IS NULL OR length(_key) = 0 OR length(_key) > 200 THEN RETURN false; END IF;
  IF _max < 1 OR _window_seconds < 1 OR _window_seconds > 86400 THEN RETURN false; END IF;

  _bucket := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rl_buckets AS rlb (bucket_key, window_start, hits)
  VALUES (_key, _bucket, 1)
  ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET hits = rlb.hits + 1
  RETURNING rlb.hits INTO _hits;

  RETURN _hits <= _max;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_rl_buckets() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$ DELETE FROM public.rl_buckets WHERE window_start < now() - interval '1 day'; $fn$;

REVOKE EXECUTE ON FUNCTION public.cleanup_rl_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rl_buckets() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rl-buckets') THEN
      PERFORM cron.unschedule('cleanup-rl-buckets');
    END IF;
    PERFORM cron.schedule('cleanup-rl-buckets', '17 * * * *',
      $cron$SELECT public.cleanup_rl_buckets();$cron$);
  END IF;
END $$;
