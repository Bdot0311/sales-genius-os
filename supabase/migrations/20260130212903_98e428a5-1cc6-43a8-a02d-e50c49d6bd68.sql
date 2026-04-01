-- Phase 1: Database Schema Foundation for Email Sequences & Behavioral Automation

-- Add engagement_state to leads table (no foreign key dependency)
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS engagement_state text DEFAULT 'new';

-- 1. Email Sequences table (create first - no dependencies)
CREATE TABLE public.email_sequences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  total_enrollments integer DEFAULT 0,
  total_completed integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on email_sequences
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_sequences
CREATE POLICY "Users can view own sequences" ON public.email_sequences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sequences" ON public.email_sequences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sequences" ON public.email_sequences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sequences" ON public.email_sequences
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Sequence Steps table
CREATE TABLE public.sequence_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  delay_days integer NOT NULL DEFAULT 0,
  delay_hours integer NOT NULL DEFAULT 0,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  step_type text NOT NULL DEFAULT 'follow_up' CHECK (step_type IN ('initial', 'follow_up', 'pattern_interrupt', 're_engagement')),
  trigger_condition text NOT NULL DEFAULT 'on_delay' CHECK (trigger_condition IN ('on_enroll', 'on_delay', 'on_open', 'on_click', 'on_no_response', 'on_silence')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, step_number)
);

-- Enable RLS on sequence_steps
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies for sequence_steps (through sequence ownership)
CREATE POLICY "Users can view own sequence steps" ON public.sequence_steps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.email_sequences WHERE id = sequence_steps.sequence_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can create own sequence steps" ON public.sequence_steps
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.email_sequences WHERE id = sequence_steps.sequence_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can update own sequence steps" ON public.sequence_steps
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.email_sequences WHERE id = sequence_steps.sequence_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can delete own sequence steps" ON public.sequence_steps
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.email_sequences WHERE id = sequence_steps.sequence_id AND user_id = auth.uid())
  );

-- 3. Sequence Enrollments table
CREATE TABLE public.sequence_enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  current_step integer NOT NULL DEFAULT 1,
  engagement_state text NOT NULL DEFAULT 'new' CHECK (engagement_state IN ('new', 'contacted', 'opened_no_click', 'clicked', 'silent_after_open', 'silent_after_click', 'replied')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'exited', 'bounced')),
  paused_reason text,
  next_action_at timestamp with time zone,
  enrolled_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  last_activity_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, lead_id)
);

-- Enable RLS on sequence_enrollments
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- RLS policies for sequence_enrollments
CREATE POLICY "Users can view own enrollments" ON public.sequence_enrollments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own enrollments" ON public.sequence_enrollments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own enrollments" ON public.sequence_enrollments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own enrollments" ON public.sequence_enrollments
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Reply Analysis table
CREATE TABLE public.reply_analysis (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sent_email_id uuid REFERENCES public.sent_emails(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reply_content text,
  intent_score integer CHECK (intent_score >= 0 AND intent_score <= 100),
  intent_classification text CHECK (intent_classification IN ('high_intent', 'low_intent', 'neutral')),
  detected_signals jsonb DEFAULT '[]'::jsonb,
  requires_human_action boolean NOT NULL DEFAULT false,
  analyzed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on reply_analysis
ALTER TABLE public.reply_analysis ENABLE ROW LEVEL SECURITY;

-- RLS policies for reply_analysis
CREATE POLICY "Users can view own reply analysis" ON public.reply_analysis
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own reply analysis" ON public.reply_analysis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reply analysis" ON public.reply_analysis
  FOR UPDATE USING (auth.uid() = user_id);

-- Prevent deletion of analysis records (audit trail)
CREATE POLICY "Prevent reply analysis deletion" ON public.reply_analysis
  FOR DELETE USING (false);

-- 5. Message Blocks table
CREATE TABLE public.message_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('opener', 'pain_point', 'social_proof', 'cta', 'closing', 'objection_handler', 'custom')),
  content text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on message_blocks
ALTER TABLE public.message_blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_blocks
CREATE POLICY "Users can view own or shared blocks" ON public.message_blocks
  FOR SELECT USING (auth.uid() = user_id OR is_shared = true);

CREATE POLICY "Users can create own blocks" ON public.message_blocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own blocks" ON public.message_blocks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own blocks" ON public.message_blocks
  FOR DELETE USING (auth.uid() = user_id);

-- NOW add foreign key columns to sent_emails (after email_sequences exists)
ALTER TABLE public.sent_emails 
ADD COLUMN IF NOT EXISTS sequence_id uuid REFERENCES public.email_sequences(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sequence_step integer,
ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES public.sequence_enrollments(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_email_sequences_user_id ON public.email_sequences(user_id);
CREATE INDEX idx_email_sequences_status ON public.email_sequences(status);
CREATE INDEX idx_sequence_steps_sequence_id ON public.sequence_steps(sequence_id);
CREATE INDEX idx_sequence_enrollments_user_id ON public.sequence_enrollments(user_id);
CREATE INDEX idx_sequence_enrollments_sequence_id ON public.sequence_enrollments(sequence_id);
CREATE INDEX idx_sequence_enrollments_lead_id ON public.sequence_enrollments(lead_id);
CREATE INDEX idx_sequence_enrollments_status ON public.sequence_enrollments(status);
CREATE INDEX idx_sequence_enrollments_next_action ON public.sequence_enrollments(next_action_at) WHERE status = 'active';
CREATE INDEX idx_reply_analysis_user_id ON public.reply_analysis(user_id);
CREATE INDEX idx_reply_analysis_lead_id ON public.reply_analysis(lead_id);
CREATE INDEX idx_reply_analysis_requires_action ON public.reply_analysis(requires_human_action) WHERE requires_human_action = true;
CREATE INDEX idx_message_blocks_user_id ON public.message_blocks(user_id);
CREATE INDEX idx_message_blocks_category ON public.message_blocks(category);
CREATE INDEX idx_leads_engagement_state ON public.leads(engagement_state);

-- Add updated_at trigger for new tables
CREATE TRIGGER update_email_sequences_updated_at
  BEFORE UPDATE ON public.email_sequences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sequence_steps_updated_at
  BEFORE UPDATE ON public.sequence_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sequence_enrollments_updated_at
  BEFORE UPDATE ON public.sequence_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_blocks_updated_at
  BEFORE UPDATE ON public.message_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();