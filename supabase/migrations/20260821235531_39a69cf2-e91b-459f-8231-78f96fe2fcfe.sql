
ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

CREATE TABLE IF NOT EXISTS public.email_open_events (
  id uuid primary key default gen_random_uuid(),
  sent_email_id uuid references public.sent_emails(id) on delete cascade,
  user_id uuid,
  tracking_pixel_id uuid,
  occurred_at timestamptz not null default now(),
  seconds_since_send integer,
  user_agent text,
  counted boolean not null default false,
  skip_reason text,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS email_open_events_sent_email_idx ON public.email_open_events(sent_email_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_open_events_user_idx ON public.email_open_events(user_id, occurred_at DESC);

GRANT SELECT ON public.email_open_events TO authenticated;
GRANT ALL ON public.email_open_events TO service_role;
ALTER TABLE public.email_open_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own open events" ON public.email_open_events;
CREATE POLICY "Users read their own open events"
  ON public.email_open_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Purge false opens recorded by mail-provider image prefetch (fired within 60s of send)
UPDATE public.sent_emails
SET opened_at = NULL
WHERE opened_at IS NOT NULL
  AND sent_at IS NOT NULL
  AND clicked_at IS NULL
  AND opened_at - sent_at < interval '60 seconds';

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT v.t, v.c, 'email open tracking integrity'
FROM (VALUES
  ('sent_emails','open_count'),
  ('sent_emails','last_opened_at'),
  ('email_open_events','sent_email_id'),
  ('email_open_events','user_id'),
  ('email_open_events','tracking_pixel_id'),
  ('email_open_events','occurred_at'),
  ('email_open_events','counted'),
  ('email_open_events','skip_reason')
) AS v(t,c)
WHERE NOT EXISTS (
  SELECT 1 FROM public.schema_contract sc WHERE sc.table_name = v.t AND sc.column_name = v.c
);
