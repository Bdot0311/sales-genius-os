-- An opt-out belonged to everybody, and the bulk path offered no way to make one.
--
-- Three separate problems in the same corner, found together:
--
--   1. No List-Unsubscribe header on any send. Gmail and Yahoo have required
--      one, with RFC 8058 one-click, from every bulk sender since February
--      2024. Without it mail from a sending domain gets throttled first and
--      spam-foldered after, which is invisible from inside the product: the
--      send succeeds, the reply never comes.
--
--   2. process-scheduled-emails — the path everything queued goes out
--      through, which is to say the path that carries the volume — wrote no
--      unsubscribe token, no footer link and no header. It checked the
--      opt-out list on the way out and gave the recipient no way to get onto
--      it. send-email, the one-at-a-time path, had the footer link.
--
--   3. Opt-outs and tokens were keyed on the email address alone, with no
--      sender. So a prospect who unsubscribed from one account could not be
--      emailed by any other account on the platform, and the token upsert
--      (onConflict: 'email') meant one account's send silently invalidated
--      the unsubscribe links another account had already put in people's
--      inboxes.
--
-- This migration is for (3). CAN-SPAM opt-out is per sender: unsubscribing
-- from one business does not opt you out of another. 
--
-- ── Why existing rows stay global ────────────────────────────────────────
--
-- A NULL user_id means "applies to every sender", and that is what every row
-- written before today becomes. Re-scoping them to whoever happened to send
-- the email would hand every other account a list of people who have already
-- said no — the one mistake here that cannot be walked back. New opt-outs
-- carry their sender; old ones keep suppressing for everyone.

ALTER TABLE public.email_optouts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.email_unsubscribe_tokens
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- The old unique(email) is what forced the global behaviour. Two partial
-- indexes replace it, because in Postgres NULLs are distinct and a plain
-- unique(user_id, email) would let the same address be opted out globally
-- any number of times.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'email_optouts' AND con.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.email_optouts DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- The sender index is deliberately NOT partial.
--
-- Postgres only infers a partial unique index for ON CONFLICT when the
-- statement repeats the index predicate, and PostgREST's on_conflict passes
-- column names and nothing else. A partial (user_id, email) index would make
-- every upsert fail with "no unique or exclusion constraint matching the ON
-- CONFLICT specification" — at the moment a recipient clicks unsubscribe,
-- which is the worst possible place to find out.
--
-- Full index for the inference, partial index on the address alone to keep
-- global rows unique, since Postgres treats NULLs as distinct and would
-- otherwise allow the same address globally any number of times.
CREATE UNIQUE INDEX IF NOT EXISTS email_optouts_sender_email
  ON public.email_optouts (user_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS email_optouts_global_email
  ON public.email_optouts (email) WHERE user_id IS NULL;

-- Same shape for tokens: one live token per sender per recipient, so two
-- accounts mailing the same person do not overwrite each other's links.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'email_unsubscribe_tokens' AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%(email)%'
  LOOP
    EXECUTE format('ALTER TABLE public.email_unsubscribe_tokens DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS unsub_tokens_sender_email
  ON public.email_unsubscribe_tokens (user_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS unsub_tokens_global_email
  ON public.email_unsubscribe_tokens (email) WHERE user_id IS NULL;

-- The lookup every send does: "is this address opted out for me, or globally".
CREATE INDEX IF NOT EXISTS idx_email_optouts_email_user
  ON public.email_optouts (email, user_id);

COMMENT ON COLUMN public.email_optouts.user_id IS
  'The sender this opt-out applies to. NULL means every sender — the value every row written before per-sender opt-outs shipped keeps, because re-scoping them would expose one account''s do-not-contact list to the rest.';
COMMENT ON COLUMN public.email_unsubscribe_tokens.user_id IS
  'The sender whose email carried this token. Scoped so two accounts mailing the same person cannot overwrite each other''s already-delivered unsubscribe links.';
