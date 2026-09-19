-- agency_id must always be set explicitly by the trusted server path,
-- never inferred from the caller's session.
ALTER TABLE public.agency_clients ALTER COLUMN agency_id DROP DEFAULT;