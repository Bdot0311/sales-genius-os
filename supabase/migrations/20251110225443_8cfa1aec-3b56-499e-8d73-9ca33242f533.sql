-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user has a role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Add Stripe customer ID to subscriptions table
ALTER TABLE public.subscriptions
ADD COLUMN stripe_customer_id TEXT,
ADD COLUMN stripe_subscription_id TEXT;

-- Function to get leads count and limit for a user
CREATE OR REPLACE FUNCTION public.get_user_leads_usage()
RETURNS TABLE(
  leads_count BIGINT,
  leads_limit INTEGER,
  plan subscription_plan
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(l.id)::BIGINT as leads_count,
    s.leads_limit,
    s.plan
  FROM subscriptions s
  LEFT JOIN leads l ON l.user_id = s.user_id
  WHERE s.user_id = auth.uid()
  AND s.status = 'active'
  GROUP BY s.leads_limit, s.plan;
END;
$$;

-- Function for admins to get all user subscriptions
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  full_name TEXT,
  plan subscription_plan,
  status TEXT,
  leads_limit INTEGER,
  stripe_customer_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    s.user_id,
    p.email,
    p.full_name,
    s.plan,
    s.status,
    s.leads_limit,
    s.stripe_customer_id,
    s.current_period_end
  FROM subscriptions s
  JOIN profiles p ON p.id = s.user_id
  ORDER BY s.created_at DESC;
END;
$$;

-- Function for admins to update user subscription
CREATE OR REPLACE FUNCTION public.admin_update_subscription(
  _user_id UUID,
  _plan subscription_plan,
  _status TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _leads_limit INTEGER;
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Set leads limit based on plan
  _leads_limit := CASE 
    WHEN _plan = 'growth' THEN 1000
    WHEN _plan = 'pro' THEN 10000
    ELSE 999999
  END;

  -- Update subscription
  UPDATE subscriptions
  SET 
    plan = _plan,
    leads_limit = _leads_limit,
    status = COALESCE(_status, status),
    updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

-- Trigger to assign default user role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();