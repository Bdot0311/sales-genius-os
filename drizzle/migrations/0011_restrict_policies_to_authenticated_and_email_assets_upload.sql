-- 1) Narrow permissive `public`-role policies to the intended grantee roles.
DO $$
DECLARE
  r record;
  target_role text;
BEGIN
  FOR r IN
    SELECT policyname, tablename, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'public' = ANY(roles)
      AND tablename IN (
        'reply_analysis','webhooks','reply_threads','user_email_templates','coaching_messages',
        'coaching_conversations','icp_profiles','companies','deals','leads','sent_emails',
        'lead_scores','lead_index','message_blocks','email_drafts','sequence_enrollments',
        'email_sequences','push_subscriptions','white_label_settings','api_keys','api_versions',
        'subscriptions','topup_payments','onboarding_progress','audit_logs'
      )
  LOOP
    IF coalesce(r.qual,'') || coalesce(r.with_check,'') ILIKE '%service_role%' THEN
      target_role := 'service_role';
    ELSE
      target_role := 'authenticated';
    END IF;

    EXECUTE format('ALTER POLICY %I ON public.%I TO %I', r.policyname, r.tablename, target_role);
  END LOOP;
END $$;

-- 2) email-assets uploads: restrict to authenticated role only, keep per-user folder
--    ownership, and allow only image asset types used by email templates.
DROP POLICY IF EXISTS "Authenticated users can upload own email assets" ON storage.objects;

CREATE POLICY "Authenticated users can upload own email assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'email-assets'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND lower(name) ~ '\.(png|jpe?g|webp|gif|svg)$'
);

-- Public read of email assets stays intentional (images embedded in sent emails).
