CREATE TABLE public.treg_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  endpoint text NOT NULL,
  treg_call_id text,
  cost_micro bigint NOT NULL DEFAULT 0,
  status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.treg_usage TO authenticated;
GRANT ALL ON public.treg_usage TO service_role;
ALTER TABLE public.treg_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own Treg usage" ON public.treg_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all Treg usage" ON public.treg_usage FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX treg_usage_user_created_idx ON public.treg_usage (user_id, created_at DESC);
INSERT INTO public.schema_contract (table_name, column_name)
SELECT 'treg_usage', c FROM unnest(ARRAY['user_id','feature','endpoint','treg_call_id','cost_micro','created_at']) AS c
ON CONFLICT DO NOTHING;