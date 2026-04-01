-- Add search credit tracking columns to subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS search_credits_base integer NOT NULL DEFAULT 200,
ADD COLUMN IF NOT EXISTS search_credits_addon integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS search_credits_remaining integer NOT NULL DEFAULT 200,
ADD COLUMN IF NOT EXISTS daily_searches_used integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_searches_reset_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS credits_reset_at timestamp with time zone DEFAULT (now() + interval '1 month'),
ADD COLUMN IF NOT EXISTS addon_price_id text DEFAULT NULL;

-- Create search transactions table for audit trail
CREATE TABLE IF NOT EXISTS public.search_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.search_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for search_transactions
CREATE POLICY "Users can view own search transactions"
  ON public.search_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own search transactions"
  ON public.search_transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);