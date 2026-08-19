-- Blocklist of disposable/bot signup domains and local-part patterns
CREATE TABLE IF NOT EXISTS public.signup_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('domain','local_pattern','email')),
  value text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

GRANT ALL ON public.signup_blocklist TO service_role;
ALTER TABLE public.signup_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage signup blocklist" ON public.signup_blocklist;
CREATE POLICY "Admins manage signup blocklist"
  ON public.signup_blocklist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_blocklist TO authenticated;

-- Seed: disposable / temp-mail / scanner domains
INSERT INTO public.signup_blocklist (kind, value, note) VALUES
  ('domain','emalupe.com','automated audit/scanner signups'),
  ('domain','mailinator.com','disposable'),
  ('domain','trashmail.com','disposable'),
  ('domain','tempmail.com','disposable'),
  ('domain','temp-mail.org','disposable'),
  ('domain','temp-mail.io','disposable'),
  ('domain','guerrillamail.com','disposable'),
  ('domain','guerrillamail.net','disposable'),
  ('domain','sharklasers.com','disposable'),
  ('domain','grr.la','disposable'),
  ('domain','10minutemail.com','disposable'),
  ('domain','20minutemail.com','disposable'),
  ('domain','yopmail.com','disposable'),
  ('domain','fakeinbox.com','disposable'),
  ('domain','throwawaymail.com','disposable'),
  ('domain','getnada.com','disposable'),
  ('domain','nada.email','disposable'),
  ('domain','maildrop.cc','disposable'),
  ('domain','mailnesia.com','disposable'),
  ('domain','dispostable.com','disposable'),
  ('domain','mailcatch.com','disposable'),
  ('domain','spam4.me','disposable'),
  ('domain','moakt.com','disposable'),
  ('domain','mohmal.com','disposable'),
  ('domain','burnermail.io','disposable'),
  ('domain','tempr.email','disposable'),
  ('domain','discardmail.com','disposable'),
  ('domain','fakemail.net','disposable'),
  ('domain','mailnull.com','disposable'),
  ('domain','spambog.com','disposable'),
  ('domain','tmpmail.org','disposable'),
  ('domain','tempmailo.com','disposable'),
  ('domain','mailto.plus','disposable'),
  ('domain','emlhub.com','disposable'),
  ('domain','trbvm.com','disposable'),
  ('domain','example.com','placeholder'),
  ('domain','test.com','placeholder'),
  ('local_pattern','^audit[-_]','scanner probe'),
  ('local_pattern','^(pentest|scanner|security[-_]?audit)','scanner probe'),
  ('local_pattern','^(test|testing|fake|dummy|asdf|qwerty|noreply|no-reply)[0-9._-]*$','junk signup')
ON CONFLICT (kind, value) DO NOTHING;

-- Enforcement: runs inside the signup transaction via profiles insert
CREATE OR REPLACE FUNCTION public.enforce_signup_email_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(NEW.email, '')));
  v_domain text;
  v_local text;
BEGIN
  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Signup blocked: a valid email address is required.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_local := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  IF EXISTS (SELECT 1 FROM public.signup_blocklist b WHERE b.kind = 'email' AND lower(b.value) = v_email) THEN
    RAISE EXCEPTION 'Signup blocked: this email address is not allowed.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.signup_blocklist b WHERE b.kind = 'domain' AND lower(b.value) = v_domain) THEN
    RAISE EXCEPTION 'Signup blocked: disposable or temporary email domains are not allowed. Please use a permanent work address.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.signup_blocklist b
    WHERE b.kind = 'local_pattern' AND v_local ~ b.value
  ) THEN
    RAISE EXCEPTION 'Signup blocked: this email address looks automated. Please use a real address.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_signup_email_policy ON public.profiles;
CREATE TRIGGER enforce_signup_email_policy
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signup_email_policy();