-- The vault secret named email_queue_service_role_key does not hold the
-- service role key.
--
-- sync-vault-service-key writes INTERNAL_TRIGGER_SECRET into it. The name has
-- been wrong since it was created, and it cost a round on this very branch: a
-- fix repointed five broken cron jobs at "the service role key", which was in
-- fact the internal secret, and the functions they call compared against the
-- real service role key and carried on answering 401.
--
-- A name that lies about its contents is a trap that resets every time someone
-- new reads it, so it gets the right one: internal_trigger_secret.
--
-- ── Why the old name survives this ───────────────────────────────────────
--
-- Not every reader is in this repository. internal_job_key() is defined in the
-- database and nowhere here, and anything else applied straight to the project
-- is equally invisible. Dropping the old secret would break whichever of them
-- still reads it, silently, in exactly the way this corner already specialises
-- in.
--
-- So this is the first half of a rename, not a rename: the new name is created
-- with the same value, every job this repository can see moves to it, and the
-- old name stays as an alias that sync-vault-service-key keeps up to date.
-- The old one can be dropped once
--
--   SELECT jobname, command FROM cron.job
--   WHERE command LIKE '%email_queue_service_role_key%';
--
-- comes back empty and no function body mentions it either.

DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'email_queue_service_role_key not in the vault; nothing to copy';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret') THEN
    PERFORM vault.update_secret(
      (SELECT id FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret' LIMIT 1),
      v_secret,
      'internal_trigger_secret',
      'INTERNAL_TRIGGER_SECRET. Signs database-scheduled calls to edge functions; _shared/internal-auth.ts accepts it alongside the real service role key. Written by sync-vault-service-key.'
    );
  ELSE
    PERFORM vault.create_secret(
      v_secret,
      'internal_trigger_secret',
      'INTERNAL_TRIGGER_SECRET. Signs database-scheduled calls to edge functions; _shared/internal-auth.ts accepts it alongside the real service role key. Written by sync-vault-service-key.'
    );
  END IF;
END $$;

-- Every job this repository can see, repointed at the honest name. Schedules,
-- bodies and URLs are unchanged; only the secret lookup moves.
DO $$
DECLARE
  j record;
  new_cmd text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping job repoint';
    RETURN;
  END IF;

  FOR j IN
    SELECT jobname, schedule, command
    FROM cron.job
    WHERE command LIKE '%email_queue_service_role_key%'
  LOOP
    new_cmd := replace(j.command, 'email_queue_service_role_key', 'internal_trigger_secret');
    PERFORM cron.schedule(j.jobname, j.schedule, new_cmd);
    RAISE NOTICE 'repointed cron job % at internal_trigger_secret', j.jobname;
  END LOOP;
END $$;
