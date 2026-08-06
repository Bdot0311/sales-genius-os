ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON public.leads (user_id, pipeline_stage);

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('leads', 'pipeline_stage', 'Saved Leads pipeline label dropdown (new/contacted/no_response/etc)')
ON CONFLICT DO NOTHING;