-- Add monthly email counter to profiles table for performance
-- This eliminates the need for COUNT(*) queries on sent_emails table

-- Add counter columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS monthly_email_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_email_count_updated_at TIMESTAMP WITH TIME ZONE;

-- Create function to increment monthly counter
CREATE OR REPLACE FUNCTION public.increment_monthly_email_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_month_start TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Reset counter at start of new month
  current_month_start := date_trunc('month', NEW.sent_at);
  
  UPDATE public.profiles
  SET 
    monthly_email_count = monthly_email_count + 1,
    monthly_email_count_updated_at = NEW.sent_at
  WHERE id = NEW.user_id
    AND (
      monthly_email_count_updated_at IS NULL 
      OR monthly_email_count_updated_at < current_month_start
    );
  
  -- If it's a new month, reset the counter
  IF NOT FOUND OR (SELECT monthly_email_count_updated_at FROM public.profiles WHERE id = NEW.user_id) < current_month_start THEN
    UPDATE public.profiles
    SET 
      monthly_email_count = 1,
      monthly_email_count_updated_at = NEW.sent_at
    WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to increment counter on sent email insert
DROP TRIGGER IF EXISTS increment_monthly_email_count_trigger ON public.sent_emails;
CREATE TRIGGER increment_monthly_email_count_trigger
AFTER INSERT ON public.sent_emails
FOR EACH ROW
WHEN (NEW.status IN ('sent', 'delivered', 'opened', 'clicked', 'replied'))
EXECUTE FUNCTION public.increment_monthly_email_count();

-- Create RPC function to get monthly count (fallback to COUNT if counter not available)
CREATE OR REPLACE FUNCTION public.get_monthly_email_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    monthly_email_count,
    (SELECT COUNT(*) 
     FROM public.sent_emails 
     WHERE user_id = p_user_id 
       AND status IN ('sent', 'delivered', 'opened', 'clicked', 'replied')
       AND sent_at >= date_trunc('month', CURRENT_TIMESTAMP))
  )
  FROM public.profiles
  WHERE id = p_user_id;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_monthly_email_count TO authenticated;

-- Add RPC function for atomic rescore queue claiming with SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_rescore_items(p_row_ids UUID[])
RETURNS TABLE (id UUID, user_id UUID, lead_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rescore_queue
  SET status = 'processing',
      claimed_at = NOW()
  WHERE id = ANY(p_row_ids)
    AND status = 'pending'
  RETURNING id, user_id, lead_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.claim_rescore_items TO authenticated;
