DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','leads','icp_profiles','personas','email_sequences','sequence_steps',
    'sequence_enrollments','sent_emails','reply_threads','deals','activities',
    'agent_configs','agent_actions','sending_domains','sending_accounts','reputation_snapshots'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS demo_seed boolean NOT NULL DEFAULT false', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (demo_seed) WHERE demo_seed', 'idx_'||t||'_demo_seed', t);
    INSERT INTO public.schema_contract (table_name, column_name, note)
    VALUES (t, 'demo_seed', 'Demo mode: marks seeded demo records for exact cleanup')
    ON CONFLICT (table_name, column_name) DO NOTHING;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_demo_mode(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (s.setting_value->>'enabled')::boolean
       AND (s.setting_value->>'admin_user_id') = _user_id::text
     FROM public.admin_settings s
     WHERE s.setting_key = 'demo_mode'),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_demo_mode(uuid) TO authenticated, service_role;