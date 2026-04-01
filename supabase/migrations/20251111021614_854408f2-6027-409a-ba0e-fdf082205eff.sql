-- Create API keys table for Elite users
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  key text NOT NULL UNIQUE,
  prefix text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies for API keys
CREATE POLICY "Elite users can view own API keys"
  ON public.api_keys
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Elite users can create own API keys"
  ON public.api_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Elite users can update own API keys"
  ON public.api_keys
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Elite users can delete own API keys"
  ON public.api_keys
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create team members table
CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_owner_id uuid NOT NULL,
  member_email text NOT NULL,
  member_user_id uuid,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(team_owner_id, member_email)
);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team members
CREATE POLICY "Elite users can view own team members"
  ON public.team_members
  FOR SELECT
  USING (auth.uid() = team_owner_id OR auth.uid() = member_user_id);

CREATE POLICY "Elite users can create team members"
  ON public.team_members
  FOR INSERT
  WITH CHECK (auth.uid() = team_owner_id);

CREATE POLICY "Elite users can update own team members"
  ON public.team_members
  FOR UPDATE
  USING (auth.uid() = team_owner_id);

CREATE POLICY "Elite users can delete own team members"
  ON public.team_members
  FOR DELETE
  USING (auth.uid() = team_owner_id);

-- Create white label settings table
CREATE TABLE public.white_label_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  company_name text,
  logo_url text,
  primary_color text DEFAULT '#8B5CF6',
  secondary_color text DEFAULT '#10B981',
  accent_color text DEFAULT '#F59E0B',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for white label settings
CREATE POLICY "Elite users can view own white label settings"
  ON public.white_label_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Elite users can create own white label settings"
  ON public.white_label_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Elite users can update own white label settings"
  ON public.white_label_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for team members updated_at
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for white label settings updated_at
CREATE TRIGGER update_white_label_settings_updated_at
  BEFORE UPDATE ON public.white_label_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();