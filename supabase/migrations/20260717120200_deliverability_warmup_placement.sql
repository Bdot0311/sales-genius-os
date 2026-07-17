-- Deliverability Suite — Phase 1c: shared warmup pool, warmup messages, placement tests
-- The warmup pool is cross-user: opted-in mailboxes exchange filler mail + replies to
-- build sender reputation. Only the orchestrator (service_role) writes warmup_messages;
-- users can read messages involving their own accounts.

-- =============================================================
-- warmup_pool — a mailbox's participation in the shared warmup network.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.warmup_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sending_account_id uuid NOT NULL REFERENCES public.sending_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  daily_target integer NOT NULL DEFAULT 4,
  reputation_score integer CHECK (reputation_score BETWEEN 0 AND 100),
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sending_account_id)
);

ALTER TABLE public.warmup_pool ENABLE ROW LEVEL SECURITY;

-- Users manage only their own pool membership. The orchestrator uses service_role
-- (bypasses RLS) to read all active members for pairing.
CREATE POLICY "Users can view own warmup pool membership"
  ON public.warmup_pool FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup pool membership"
  ON public.warmup_pool FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own warmup pool membership"
  ON public.warmup_pool FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own warmup pool membership"
  ON public.warmup_pool FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_warmup_pool_active ON public.warmup_pool (active);

CREATE TRIGGER trg_warmup_pool_updated_at
  BEFORE UPDATE ON public.warmup_pool
  FOR EACH ROW EXECUTE FUNCTION public.deliverability_set_updated_at();

-- =============================================================
-- warmup_messages — individual warmup sends between two pool accounts.
-- folder_detected records where the recipient found it (inbox = good, spam = recovery needed).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.warmup_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  to_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text,
  gmail_message_id text,
  gmail_thread_id text,
  folder_detected text CHECK (folder_detected IN ('inbox', 'spam', 'promotions', 'unknown')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warmup_messages ENABLE ROW LEVEL SECURITY;

-- Users can read warmup messages involving their own accounts (either direction).
-- Writes are performed by the orchestrator via service_role (bypasses RLS).
CREATE POLICY "Users can view own warmup messages"
  ON public.warmup_messages FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE INDEX IF NOT EXISTS idx_warmup_messages_from ON public.warmup_messages (from_account_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_warmup_messages_to ON public.warmup_messages (to_account_id, sent_at DESC);

-- =============================================================
-- placement_tests / placement_results — inbox-vs-spam seed testing.
-- Gmail placement is measured via a seed inbox we control; Outlook/Yahoo remain
-- 'pending' until seed accounts on those providers are connected (no fabricated %).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.placement_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.placement_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own placement tests"
  ON public.placement_tests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own placement tests"
  ON public.placement_tests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own placement tests"
  ON public.placement_tests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_placement_tests_user ON public.placement_tests (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.placement_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.placement_tests(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail', 'outlook', 'yahoo')),
  placement text NOT NULL DEFAULT 'pending' CHECK (placement IN ('inbox', 'spam', 'promotions', 'missing', 'pending', 'unsupported')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, provider)
);

ALTER TABLE public.placement_results ENABLE ROW LEVEL SECURITY;

-- Results inherit ownership through the parent test.
CREATE POLICY "Users can view own placement results"
  ON public.placement_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.placement_tests t
    WHERE t.id = placement_results.test_id AND t.user_id = auth.uid()
  ));
