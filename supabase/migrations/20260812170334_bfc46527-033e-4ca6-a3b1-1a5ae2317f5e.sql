ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_source TEXT DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_signature_source_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_signature_source_check
      CHECK (signature_source IS NULL OR signature_source IN ('gmail', 'custom', 'none'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.signature_source IS 'gmail = pull signature from connected Gmail sendAs settings, custom = use profiles.email_signature, none = no signature';

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('profiles', 'signature_source', 'Signature choice for Outreach Studio + AI SDR: gmail | custom | none')
ON CONFLICT DO NOTHING;