INSERT INTO public.onboarding_progress (user_id, onboarding_completed)
SELECT u.id, true
FROM auth.users u
LEFT JOIN public.onboarding_progress op ON op.user_id = u.id
WHERE op.user_id IS NULL
  AND u.created_at < '2026-09-08T00:00:00Z'
ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = true;