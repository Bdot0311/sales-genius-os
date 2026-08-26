-- Correct the daily limit for legacy 'elite' plan rows.
--
-- 20260825200000 raised paid rows off the schema default and gave plan 'elite'
-- 1500 a day, which is the Agency figure. That was wrong: 'elite' is a legacy
-- PLAN value that every other path normalises to 'pro' (use-subscription.tsx,
-- use-leads-usage.tsx, admin/Users.tsx), and MONTHLY_EMAIL_LIMITS already gives
-- it pro's monthly allowance. It takes pro's daily allowance too.
--
-- The collision is a naming one: Elite is the AI SDR tier that the Agency plan
-- carries. It has never been a plan. Agency's 1500 belongs to plan 'agency'.
--
-- Ordering-safe either way. If the earlier migration has already run, this
-- corrects the rows it set. If it has not, it runs first and this corrects them
-- immediately after. Only rows sitting on exactly the wrong value are touched,
-- so an elite row someone deliberately set to something else is left alone.

UPDATE public.subscriptions
SET daily_email_limit = 500
WHERE lower(plan) = 'elite'
  AND daily_email_limit = 1500;
