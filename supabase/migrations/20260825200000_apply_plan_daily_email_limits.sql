-- Give paying accounts the daily send limit their plan advertises.
--
-- subscriptions.daily_email_limit was added as `integer NOT NULL DEFAULT 10`
-- and nothing has ever written it. check-subscription's PLAN_PRODUCTS map has
-- carried a dailyLimit for every plan since it was written — 100/250/500/1500,
-- matching the published pricing table — and that field was never read.
--
-- So every account, on every plan, sat at 10 emails a day: the free-tier rate.
-- An Agency customer paying $249/mo was capped at the same number as someone on
-- the free plan, and the only way to discover it was a control buried inside the
-- Bulk Send dialog.
--
-- Scope is deliberately narrow. Only rows on a paid plan still holding EXACTLY
-- the schema default of 10 are raised. A row where someone chose a different
-- number — including someone who deliberately lowered it while warming a
-- domain — is left alone, because this cannot tell an intentional 10 from an
-- untouched one and overwriting a deliberate choice is worse than leaving a
-- conservative limit in place.
--
-- Going forward check-subscription writes this on every sync, so the migration
-- is a one-time correction rather than the mechanism.

UPDATE public.subscriptions
SET daily_email_limit = CASE lower(plan)
  WHEN 'starter' THEN 100
  WHEN 'growth'  THEN 250
  WHEN 'pro'     THEN 500
  WHEN 'elite'   THEN 1500
  WHEN 'agency'  THEN 1500
  ELSE daily_email_limit
END
WHERE daily_email_limit = 10
  AND lower(plan) IN ('starter', 'growth', 'pro', 'elite', 'agency');
