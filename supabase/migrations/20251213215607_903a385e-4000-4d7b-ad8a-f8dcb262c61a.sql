-- Add lead_status field to leads table
ALTER TABLE public.leads
ADD COLUMN lead_status TEXT NOT NULL DEFAULT 'active'
CHECK (lead_status IN ('discovered', 'active', 'archived'));