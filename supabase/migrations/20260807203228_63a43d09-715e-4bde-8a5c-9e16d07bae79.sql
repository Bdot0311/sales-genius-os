ALTER TABLE public.agency_clients
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS company_domain text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS assigned_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.agency_client_stats()
RETURNS TABLE (
  client_id uuid,
  client_user_id uuid,
  leads_count bigint,
  emails_sent_count bigint,
  sequences_count bigint,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ac.id,
    ac.client_user_id,
    (SELECT count(*) FROM public.leads l WHERE l.user_id = ac.client_user_id),
    (SELECT count(*) FROM public.sent_emails se WHERE se.user_id = ac.client_user_id),
    (SELECT count(*) FROM public.email_sequences es WHERE es.user_id = ac.client_user_id),
    GREATEST(
      (SELECT max(l.created_at) FROM public.leads l WHERE l.user_id = ac.client_user_id),
      (SELECT max(se.created_at) FROM public.sent_emails se WHERE se.user_id = ac.client_user_id)
    )
  FROM public.agency_clients ac
  WHERE ac.agency_id = auth.uid()
    AND ac.client_user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.agency_client_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_client_stats() TO authenticated;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('agency_clients','client_name','Agency admin panel'),
  ('agency_clients','company_domain','Agency admin panel'),
  ('agency_clients','notes','Agency admin panel'),
  ('agency_clients','assigned_member_id','Agency admin panel'),
  ('agency_clients','archived','Agency admin panel')
ON CONFLICT DO NOTHING;