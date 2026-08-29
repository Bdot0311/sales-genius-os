CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fcm_tokens TO authenticated;
GRANT ALL ON public.fcm_tokens TO service_role;

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users view own fcm tokens"
  ON public.fcm_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users register own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users register own fcm tokens"
  ON public.fcm_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users update own fcm tokens"
  ON public.fcm_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users delete own fcm tokens"
  ON public.fcm_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS fcm_tokens_user_idx ON public.fcm_tokens (user_id);

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT v.t, v.c, v.n
FROM (VALUES
  ('fcm_tokens','token','Firebase device registration token used by send-fcm-notification'),
  ('fcm_tokens','user_id','Owner of the device token'),
  ('fcm_tokens','platform','web | android | ios'),
  ('fcm_tokens','last_seen_at','Refreshed each time the device re-registers')
) AS v(t,c,n)
WHERE NOT EXISTS (
  SELECT 1 FROM public.schema_contract sc WHERE sc.table_name = v.t AND sc.column_name = v.c
);