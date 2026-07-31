-- 1) Add WITH CHECK ownership enforcement to user-owned UPDATE policies
DO $$
DECLARE
  r record;
  t text;
  tables text[] := ARRAY[
    'activities','alert_rules','api_keys','api_versions','coaching_conversations','companies',
    'deals','deliverability_alerts','email_drafts','email_sequences','icp_profiles','integrations',
    'lead_index','lead_scores','lead_search_presets','leads','mailbox_warmup','message_blocks',
    'onboarding_progress','placement_tests','push_subscriptions','reply_analysis','reply_threads',
    'scheduled_imports','sending_accounts','sending_domains','sent_emails','sequence_enrollments',
    'tracking_domains','user_email_templates','warmup_pool','webhook_tests','webhooks',
    'white_label_settings','workflows'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR r IN
      SELECT policyname, qual
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd = 'UPDATE' AND with_check IS NULL
    LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
      ) THEN
        EXECUTE format(
          'ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s AND user_id = auth.uid())',
          r.policyname, t, r.qual, r.qual
        );
      ELSE
        EXECUTE format(
          'ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
          r.policyname, t, r.qual, r.qual
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- profiles uses id as the owner column
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, qual FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND cmd='UPDATE' AND with_check IS NULL
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.profiles USING (%s) WITH CHECK (id = auth.uid())',
      r.policyname, r.qual
    );
  END LOOP;
END $$;

-- 2) Stop exposing the plaintext webhook secret column to clients.
REVOKE SELECT ON public.webhooks FROM authenticated;
GRANT SELECT (id, user_id, name, url, events, is_active, created_at, last_triggered_at, total_triggers)
  ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;