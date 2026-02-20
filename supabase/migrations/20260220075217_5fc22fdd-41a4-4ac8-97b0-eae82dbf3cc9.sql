-- Drop the unique constraint to allow multiple Google accounts per user
ALTER TABLE public.integrations DROP CONSTRAINT integrations_user_id_integration_id_key;

-- Add a unique constraint on id (already primary key, so this is fine)
-- Add a column to store the connected email for display purposes
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS connected_email text;