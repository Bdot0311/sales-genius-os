-- Add lead_status field to contacts table
ALTER TABLE public.contacts
ADD COLUMN lead_status TEXT NOT NULL DEFAULT 'discovered'
CHECK (lead_status IN ('discovered', 'active', 'archived'));