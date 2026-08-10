-- companies.domain was declared globally UNIQUE, which is wrong for a
-- multi-tenant table: the first workspace to track acme.com made that domain
-- permanently un-trackable for every other workspace, with the insert failing
-- on a constraint that names a row the user is not allowed to see.
--
-- It surfaced with tech-signal discovery, where the whole point is importing
-- well-known companies that other workspaces are very likely to track too.
--
-- Safe to apply as-is: the constraint being dropped already guarantees no two
-- rows share a domain, so no pair of existing rows can collide on the narrower
-- (user_id, domain) key. Domains stay optional — the partial index leaves rows
-- with a NULL domain unconstrained, as before.
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_domain_key;

CREATE UNIQUE INDEX IF NOT EXISTS companies_user_id_domain_key
  ON public.companies (user_id, domain)
  WHERE domain IS NOT NULL;
