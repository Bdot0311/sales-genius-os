
-- Create topup_payments table to track one-time credit purchases and prevent double-crediting
CREATE TABLE public.topup_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  prospects_added INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.topup_payments ENABLE ROW LEVEL SECURITY;

-- Users can only view their own topup payments
CREATE POLICY "Users can view own topup payments"
ON public.topup_payments
FOR SELECT
USING (auth.uid() = user_id);

-- Only service role inserts (edge functions), no direct user inserts
-- No INSERT/UPDATE/DELETE policies for authenticated users

-- Index for fast lookup by stripe_session_id
CREATE INDEX idx_topup_payments_session ON public.topup_payments (stripe_session_id);
CREATE INDEX idx_topup_payments_user ON public.topup_payments (user_id);
