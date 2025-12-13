-- Create LeadIndex table for the SalesOS Lead Intelligence Network
CREATE TABLE public.lead_index (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  canonical_domain TEXT,
  canonical_title TEXT,
  canonical_industry TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  employee_bucket TEXT CHECK (employee_bucket IN ('1-10', '11-50', '51-200', '201-1000', '1000+')),
  data_quality_score INTEGER DEFAULT 0 CHECK (data_quality_score >= 0 AND data_quality_score <= 100),
  last_verified_at TIMESTAMP WITH TIME ZONE,
  last_refreshed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, company_id)
);

-- Create indexes for fast filtering
CREATE INDEX idx_lead_index_canonical_title ON public.lead_index(canonical_title);
CREATE INDEX idx_lead_index_canonical_industry ON public.lead_index(canonical_industry);
CREATE INDEX idx_lead_index_country ON public.lead_index(country);
CREATE INDEX idx_lead_index_employee_bucket ON public.lead_index(employee_bucket);
CREATE INDEX idx_lead_index_data_quality_score ON public.lead_index(data_quality_score);
CREATE INDEX idx_lead_index_canonical_domain ON public.lead_index(canonical_domain);
CREATE INDEX idx_lead_index_user_id ON public.lead_index(user_id);
CREATE INDEX idx_lead_index_is_active ON public.lead_index(is_active);
CREATE INDEX idx_lead_index_last_refreshed_at ON public.lead_index(last_refreshed_at);

-- Enable RLS
ALTER TABLE public.lead_index ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead_index
CREATE POLICY "Users can view own lead index" ON public.lead_index
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own lead index" ON public.lead_index
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lead index" ON public.lead_index
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own lead index" ON public.lead_index
  FOR DELETE USING (auth.uid() = user_id);

-- Create DataProviderEvent table for tracking provider usage
CREATE TABLE public.data_provider_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name TEXT NOT NULL DEFAULT 'salesos_network',
  query_hash TEXT NOT NULL,
  user_id UUID NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  cost_units NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for query deduplication
CREATE INDEX idx_data_provider_events_query_hash ON public.data_provider_events(query_hash);
CREATE INDEX idx_data_provider_events_user_id ON public.data_provider_events(user_id);
CREATE INDEX idx_data_provider_events_created_at ON public.data_provider_events(created_at);

-- Enable RLS
ALTER TABLE public.data_provider_events ENABLE ROW LEVEL SECURITY;

-- RLS policies - admins can view all, users can view own
CREATE POLICY "Users can view own provider events" ON public.data_provider_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own provider events" ON public.data_provider_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all provider events" ON public.data_provider_events
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at on lead_index
CREATE TRIGGER update_lead_index_updated_at
  BEFORE UPDATE ON public.lead_index
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();