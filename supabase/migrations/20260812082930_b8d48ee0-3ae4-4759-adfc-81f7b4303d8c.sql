ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_company_id ON public.leads(company_id);

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('leads', 'company_id', 'Links a saved lead to its account row; used by research-account and enrichment save flow')
ON CONFLICT DO NOTHING;