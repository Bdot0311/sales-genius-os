-- Create import history table
CREATE TABLE public.import_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL,
  leads_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  import_type TEXT NOT NULL DEFAULT 'manual',
  search_query TEXT,
  field_mappings JSONB,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT import_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create scheduled imports table
CREATE TABLE public.scheduled_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  integration_id TEXT NOT NULL,
  search_query TEXT NOT NULL,
  field_mappings JSONB,
  schedule_frequency TEXT NOT NULL,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_imports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for import_history
CREATE POLICY "Users can view own import history"
  ON public.import_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own import history"
  ON public.import_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for scheduled_imports
CREATE POLICY "Users can view own scheduled imports"
  ON public.scheduled_imports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own scheduled imports"
  ON public.scheduled_imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled imports"
  ON public.scheduled_imports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled imports"
  ON public.scheduled_imports FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_import_history_user_id ON public.import_history(user_id);
CREATE INDEX idx_import_history_imported_at ON public.import_history(imported_at);
CREATE INDEX idx_scheduled_imports_user_id ON public.scheduled_imports(user_id);
CREATE INDEX idx_scheduled_imports_next_run ON public.scheduled_imports(next_run_at) WHERE is_active = true;