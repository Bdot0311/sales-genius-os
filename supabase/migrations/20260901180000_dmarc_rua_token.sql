-- The address receivers send DMARC reports to.
--
-- A report arrives as mail, addressed to whatever `rua=mailto:` the domain
-- published. To route an inbound report to the right tenant, each sending
-- domain publishes its own address — <token>@dmarc.outreign.io — and this is
-- the token.
--
-- Random rather than derived from the domain: the address is published in
-- public DNS, and a guessable one would let anyone post fabricated reports for
-- a domain they don't own. The ingestion function treats a valid token as the
-- only proof of ownership it has, so guessing it must be infeasible.
ALTER TABLE public.sending_domains
  ADD COLUMN IF NOT EXISTS dmarc_rua_token text;

-- encode(gen_random_bytes(...), 'hex') needs pgcrypto; the digest-free path
-- below uses gen_random_uuid(), which is built in, and strips the dashes to
-- keep the address short enough to read out over a support call.
UPDATE public.sending_domains
SET dmarc_rua_token = replace(gen_random_uuid()::text, '-', '')
WHERE dmarc_rua_token IS NULL;

ALTER TABLE public.sending_domains
  ALTER COLUMN dmarc_rua_token SET DEFAULT replace(gen_random_uuid()::text, '-', ''),
  ALTER COLUMN dmarc_rua_token SET NOT NULL;

-- One token, one domain. The lookup that resolves an inbound report depends on
-- this being unique, and a collision would attribute a report to the wrong
-- tenant.
CREATE UNIQUE INDEX IF NOT EXISTS sending_domains_dmarc_rua_token_key
  ON public.sending_domains (dmarc_rua_token);

COMMENT ON COLUMN public.sending_domains.dmarc_rua_token IS
  'Local part of this domain''s DMARC rua address. Published in the customer''s DNS; the only ownership proof the ingestion function has, so it must stay unguessable.';
