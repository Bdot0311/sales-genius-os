-- Add social_proof column to profiles for storing customer references
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_proof text;

-- Create sent_emails table to track all sent emails
CREATE TABLE sent_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body_html text,
  body_text text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'bounced', 'failed')),
  gmail_message_id text,
  gmail_thread_id text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create email_drafts table to save work in progress
CREATE TABLE email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  subject text,
  body text,
  tone text,
  trigger_context text,
  opener_word text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on sent_emails
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sent emails" 
ON sent_emails FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sent emails" 
ON sent_emails FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sent emails" 
ON sent_emails FOR UPDATE 
USING (auth.uid() = user_id);

-- Enable RLS on email_drafts
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts" 
ON email_drafts FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drafts" 
ON email_drafts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts" 
ON email_drafts FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts" 
ON email_drafts FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_sent_emails_user_id ON sent_emails(user_id);
CREATE INDEX idx_sent_emails_lead_id ON sent_emails(lead_id);
CREATE INDEX idx_sent_emails_sent_at ON sent_emails(sent_at DESC);
CREATE INDEX idx_email_drafts_user_id ON email_drafts(user_id);
CREATE INDEX idx_email_drafts_updated_at ON email_drafts(updated_at DESC);

-- Enable realtime for sent_emails to show live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE sent_emails;