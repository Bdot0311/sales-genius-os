-- Add custom domain field to white label settings
ALTER TABLE white_label_settings 
ADD COLUMN IF NOT EXISTS custom_domain text,
ADD COLUMN IF NOT EXISTS domain_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS domain_verification_token text;