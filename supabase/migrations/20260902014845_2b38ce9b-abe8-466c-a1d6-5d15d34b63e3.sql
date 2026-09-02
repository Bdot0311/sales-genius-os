ALTER TABLE public.placement_tests ADD COLUMN IF NOT EXISTS seed_email text;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'placement_tests', 'seed_email', 'inbox placement seed mailbox used for the test'
WHERE NOT EXISTS (
  SELECT 1 FROM public.schema_contract WHERE table_name='placement_tests' AND column_name='seed_email'
);