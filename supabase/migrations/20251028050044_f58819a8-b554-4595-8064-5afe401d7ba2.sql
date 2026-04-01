-- Add columns to workflows table to store visual workflow data
ALTER TABLE public.workflows 
ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS edges JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS workflow_type TEXT DEFAULT 'simple';