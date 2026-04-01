-- Fix subscription credit allocations to match plan tiers
-- Pro = 3000, Growth = 1200, Starter = 400, Free = 0

UPDATE public.subscriptions 
SET search_credits_base = 3000,
    search_credits_remaining = 3000
WHERE plan = 'pro' AND search_credits_base < 3000;

UPDATE public.subscriptions 
SET search_credits_base = 1200,
    search_credits_remaining = LEAST(search_credits_remaining + (1200 - search_credits_base), 1200)
WHERE plan = 'growth' AND search_credits_base < 1200;

UPDATE public.subscriptions 
SET search_credits_base = 400,
    search_credits_remaining = LEAST(search_credits_remaining + (400 - search_credits_base), 400)
WHERE plan = 'starter' AND search_credits_base < 400;

UPDATE public.subscriptions 
SET search_credits_base = 0,
    search_credits_remaining = 0
WHERE plan = 'free';

-- Also fix daily search reset dates that are in the past
UPDATE public.subscriptions
SET daily_searches_used = 0,
    daily_searches_reset_at = NOW() + INTERVAL '1 day'
WHERE daily_searches_reset_at < NOW();