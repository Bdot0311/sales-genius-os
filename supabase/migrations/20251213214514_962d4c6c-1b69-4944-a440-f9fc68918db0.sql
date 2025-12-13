-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  industry TEXT,
  employee_count INTEGER,
  revenue_range TEXT,
  country TEXT,
  city TEXT,
  linkedin_url TEXT,
  tech_stack JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own companies"
ON public.companies
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own companies"
ON public.companies
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own companies"
ON public.companies
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own companies"
ON public.companies
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_companies_user_id ON public.companies(user_id);
CREATE INDEX idx_companies_domain ON public.companies(domain);