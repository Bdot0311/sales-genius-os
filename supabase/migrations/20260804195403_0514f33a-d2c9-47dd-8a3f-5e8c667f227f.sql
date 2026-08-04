UPDATE public.campaign_setup_requests r
SET user_id = p.id,
    contact_email = p.email,
    contact_name = COALESCE(p.full_name, r.contact_name),
    plan = s.plan
FROM public.profiles p
JOIN public.subscriptions s ON s.user_id = p.id
WHERE p.email = 'siddesh@photon.codes'
  AND r.id = 'e400a6e5-1cda-4c82-8048-91c47bcc4cc3'
  AND r.user_id IS NULL;