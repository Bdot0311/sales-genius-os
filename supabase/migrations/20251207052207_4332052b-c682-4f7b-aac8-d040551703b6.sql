-- Create admin settings table for global configuration
CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}',
  description text,
  category text NOT NULL DEFAULT 'general',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create feature flags table
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  target_plans text[] DEFAULT ARRAY['growth', 'pro', 'elite'],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create email templates table
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  variables text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create blocked IPs table
CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  reason text,
  blocked_by uuid REFERENCES auth.users(id),
  blocked_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true
);

-- Create system events log table
CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create login history table
CREATE TABLE public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  login_method text NOT NULL DEFAULT 'password',
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for admin_settings
CREATE POLICY "Admins can view admin settings"
  ON public.admin_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert admin settings"
  ON public.admin_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update admin settings"
  ON public.admin_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete admin settings"
  ON public.admin_settings FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin-only policies for feature_flags
CREATE POLICY "Admins can view feature flags"
  ON public.feature_flags FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin-only policies for email_templates
CREATE POLICY "Admins can view email templates"
  ON public.email_templates FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin-only policies for blocked_ips
CREATE POLICY "Admins can view blocked IPs"
  ON public.blocked_ips FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage blocked IPs"
  ON public.blocked_ips FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin-only policies for system_events
CREATE POLICY "Admins can view system events"
  ON public.system_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert system events"
  ON public.system_events FOR INSERT
  WITH CHECK (true);

-- Admin-only policies for login_history
CREATE POLICY "Admins can view all login history"
  ON public.login_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own login history"
  ON public.login_history FOR SELECT
  USING (auth.uid() = user_id);

-- Enable realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.login_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_ips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- Insert default feature flags
INSERT INTO public.feature_flags (name, description, is_enabled, target_plans) VALUES
  ('ai_coach', 'AI-powered sales coaching feature', true, ARRAY['pro', 'elite']),
  ('advanced_analytics', 'Advanced analytics dashboard', true, ARRAY['pro', 'elite']),
  ('api_access', 'REST API access', true, ARRAY['elite']),
  ('workflow_automation', 'Automated workflow builder', true, ARRAY['pro', 'elite']),
  ('white_label', 'White-label branding options', true, ARRAY['elite']),
  ('team_collaboration', 'Team collaboration features', true, ARRAY['elite']),
  ('bulk_import', 'Bulk lead import functionality', true, ARRAY['growth', 'pro', 'elite']),
  ('email_sequences', 'Automated email sequences', false, ARRAY['pro', 'elite']);

-- Insert default email templates
INSERT INTO public.email_templates (name, subject, body_html, variables) VALUES
  ('welcome', 'Welcome to SalesOS!', '<h1>Welcome {{name}}!</h1><p>Thank you for joining SalesOS.</p>', ARRAY['name', 'email']),
  ('trial_warning_7d', 'Your trial ends in 7 days', '<p>Hi {{name}}, your trial ends on {{trial_end_date}}.</p>', ARRAY['name', 'trial_end_date']),
  ('trial_warning_3d', 'Your trial ends in 3 days', '<p>Hi {{name}}, your trial ends on {{trial_end_date}}.</p>', ARRAY['name', 'trial_end_date']),
  ('trial_warning_1d', 'Your trial ends tomorrow', '<p>Hi {{name}}, your trial ends tomorrow!</p>', ARRAY['name', 'trial_end_date']),
  ('subscription_confirmed', 'Subscription Confirmed', '<h1>Thank you for subscribing!</h1><p>Your {{plan}} plan is now active.</p>', ARRAY['name', 'plan']),
  ('password_reset', 'Reset Your Password', '<p>Click the link to reset your password: {{reset_link}}</p>', ARRAY['name', 'reset_link']);

-- Insert default admin settings
INSERT INTO public.admin_settings (setting_key, setting_value, description, category) VALUES
  ('maintenance_mode', '{"enabled": false, "message": "System is under maintenance"}', 'Enable maintenance mode', 'general'),
  ('signup_enabled', '{"enabled": true}', 'Allow new user signups', 'general'),
  ('trial_days', '{"value": 14}', 'Default trial period in days', 'billing'),
  ('max_leads_growth', '{"value": 1000}', 'Max leads for Growth plan', 'billing'),
  ('max_leads_pro', '{"value": 10000}', 'Max leads for Pro plan', 'billing'),
  ('rate_limit_default', '{"per_minute": 60, "per_day": 10000}', 'Default API rate limits', 'api'),
  ('webhook_max_retries', '{"value": 5}', 'Maximum webhook retry attempts', 'api'),
  ('email_from_name', '{"value": "SalesOS"}', 'Email sender name', 'email'),
  ('email_from_address', '{"value": "noreply@salesos.com"}', 'Email sender address', 'email');

-- Update triggers for updated_at
CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();