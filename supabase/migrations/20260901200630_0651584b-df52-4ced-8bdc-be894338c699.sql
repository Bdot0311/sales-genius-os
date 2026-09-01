-- 1) email_templates: admin-only, signed-in only; no anon privileges
REVOKE ALL ON public.email_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can view email templates" ON public.email_templates;

CREATE POLICY "Admins can view email templates"
ON public.email_templates FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email templates"
ON public.email_templates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2) warmup_messages: explicit owner check, null-safe
REVOKE ALL ON public.warmup_messages FROM anon;
DROP POLICY IF EXISTS "Users can view warmup messages for their own mailboxes" ON public.warmup_messages;

CREATE POLICY "Users can view warmup messages for their own mailboxes"
ON public.warmup_messages FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.sending_accounts sa
    WHERE sa.user_id IS NOT NULL
      AND sa.user_id = auth.uid()
      AND sa.id = ANY (ARRAY[warmup_messages.from_account_id, warmup_messages.to_account_id])
  )
);

-- 3) webhook_tests: authenticated-only + null-safe ownership join
REVOKE ALL ON public.webhook_tests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_tests TO authenticated;
GRANT ALL ON public.webhook_tests TO service_role;

DROP POLICY IF EXISTS "Pro users can view own webhook tests" ON public.webhook_tests;
DROP POLICY IF EXISTS "Pro users can create webhook tests" ON public.webhook_tests;
DROP POLICY IF EXISTS "Pro users can update own webhook tests" ON public.webhook_tests;
DROP POLICY IF EXISTS "Pro users can delete webhook tests" ON public.webhook_tests;

CREATE POLICY "Users can view own webhook tests"
ON public.webhook_tests FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.webhooks w
    WHERE w.id = webhook_tests.webhook_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create own webhook tests"
ON public.webhook_tests FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.webhooks w
    WHERE w.id = webhook_tests.webhook_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own webhook tests"
ON public.webhook_tests FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.webhooks w
    WHERE w.id = webhook_tests.webhook_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.webhooks w
    WHERE w.id = webhook_tests.webhook_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own webhook tests"
ON public.webhook_tests FOR DELETE TO authenticated
USING (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.webhooks w
    WHERE w.id = webhook_tests.webhook_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()
  )
);