-- Fix subscription column defaults to match free tier (new users start on free)
ALTER TABLE public.subscriptions ALTER COLUMN plan SET DEFAULT 'free'::subscription_plan;
ALTER TABLE public.subscriptions ALTER COLUMN leads_limit SET DEFAULT 0;
ALTER TABLE public.subscriptions ALTER COLUMN search_credits_base SET DEFAULT 0;
ALTER TABLE public.subscriptions ALTER COLUMN search_credits_remaining SET DEFAULT 0;