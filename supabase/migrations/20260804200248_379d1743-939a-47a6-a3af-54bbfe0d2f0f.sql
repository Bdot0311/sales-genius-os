UPDATE public.subscriptions
SET stripe_customer_id = 'cus_V0qCnXAHB7l3kn',
    stripe_subscription_id = 'sub_1U0oXpFTerosS6hiN8WfWiUI',
    plan = 'growth',
    status = 'active',
    account_status = 'trial',
    trial_end_date = to_timestamp(1787083357),
    current_period_start = to_timestamp(1785873757),
    current_period_end = to_timestamp(1787083357),
    updated_at = now()
WHERE user_id = '7e85ea7a-079e-46d7-ae72-4dd09fbad4df';