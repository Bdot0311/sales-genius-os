-- Agency portal: client tracking + 50/50 revenue split

CREATE TABLE IF NOT EXISTS public.agency_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  client_user_id uuid,
  invite_email text,
  invite_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled')),
  plan text,
  monthly_value_cents integer NOT NULL DEFAULT 0,
  agency_earnings_cents integer NOT NULL DEFAULT 0,
  total_earnings_cents integer NOT NULL DEFAULT 0,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants: agency data is auth-only (scoped to agency_id = auth.uid()), no anon access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_clients TO authenticated;
GRANT ALL ON public.agency_clients TO service_role;

ALTER TABLE public.agency_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency owns their clients"
  ON public.agency_clients FOR ALL
  USING (agency_id = auth.uid());

-- Add referral_code to white_label_settings (stable per-agency code for signup links)
ALTER TABLE public.white_label_settings
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Backfill a referral code for existing rows
UPDATE public.white_label_settings
  SET referral_code = encode(gen_random_bytes(6), 'hex')
  WHERE referral_code IS NULL;

-- Index for fast referral code lookups (used when a new user signs up with a ref code)
CREATE INDEX IF NOT EXISTS idx_white_label_referral_code ON public.white_label_settings (referral_code);

-- Index for agency client list queries
CREATE INDEX IF NOT EXISTS idx_agency_clients_agency_id ON public.agency_clients (agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_clients_invite_token ON public.agency_clients (invite_token);
CREATE INDEX IF NOT EXISTS idx_agency_clients_client_user_id ON public.agency_clients (client_user_id);