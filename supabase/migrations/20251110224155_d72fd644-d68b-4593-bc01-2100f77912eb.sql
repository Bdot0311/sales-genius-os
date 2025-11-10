-- Create enum for subscription plans
CREATE TYPE public.subscription_plan AS ENUM ('growth', 'pro', 'elite');

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan subscription_plan NOT NULL DEFAULT 'growth',
  leads_limit INTEGER NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON public.subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to get user's plan and features
CREATE OR REPLACE FUNCTION public.get_user_plan()
RETURNS TABLE (
  plan subscription_plan,
  has_automations BOOLEAN,
  has_ai_coach BOOLEAN,
  has_analytics BOOLEAN,
  has_api_access BOOLEAN,
  leads_limit INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_plan subscription_plan;
BEGIN
  -- Get user's current plan
  SELECT s.plan INTO user_plan
  FROM subscriptions s
  WHERE s.user_id = auth.uid()
  AND s.status = 'active';
  
  -- Default to growth if no subscription found
  IF user_plan IS NULL THEN
    user_plan := 'growth';
  END IF;
  
  -- Return plan with feature flags
  RETURN QUERY
  SELECT 
    user_plan,
    user_plan IN ('pro', 'elite') AS has_automations,
    user_plan IN ('pro', 'elite') AS has_ai_coach,
    user_plan IN ('pro', 'elite') AS has_analytics,
    user_plan = 'elite' AS has_api_access,
    CASE 
      WHEN user_plan = 'growth' THEN 1000
      WHEN user_plan = 'pro' THEN 10000
      ELSE 999999 -- Unlimited for elite
    END AS leads_limit;
END;
$$;

-- Function to create default subscription on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create a default Growth plan subscription for new users
  INSERT INTO public.subscriptions (user_id, plan, leads_limit)
  VALUES (NEW.id, 'growth', 1000);
  RETURN NEW;
END;
$$;

-- Trigger to create subscription on user signup
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();

-- Update trigger for subscriptions
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();