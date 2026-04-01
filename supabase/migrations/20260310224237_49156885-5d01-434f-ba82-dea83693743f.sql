-- Fix THeon's missing subscription
INSERT INTO subscriptions (user_id, plan, leads_limit, search_credits_base, search_credits_remaining)
SELECT p.id, 'free', 0, 0, 0
FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.id
WHERE s.id IS NULL;

-- Reset admin accounts to proper period end dates (rolling monthly)
UPDATE subscriptions
SET current_period_end = now() + interval '1 month',
    current_period_start = now()
WHERE current_period_end < now()
AND stripe_subscription_id IS NULL;