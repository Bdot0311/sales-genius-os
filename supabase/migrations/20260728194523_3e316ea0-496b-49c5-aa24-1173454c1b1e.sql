CREATE TABLE public.agent_chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  autonomy TEXT NOT NULL DEFAULT 'approval',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT agent_chat_threads_autonomy_check CHECK (autonomy IN ('approval','autonomous'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_chat_threads TO authenticated;
GRANT ALL ON public.agent_chat_threads TO service_role;
ALTER TABLE public.agent_chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own agent chat threads"
  ON public.agent_chat_threads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_chat_threads_user ON public.agent_chat_threads(user_id, updated_at DESC);

CREATE TRIGGER update_agent_chat_threads_updated_at
  BEFORE UPDATE ON public.agent_chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.agent_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.agent_chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT agent_chat_messages_role_check CHECK (role IN ('user','assistant'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_chat_messages TO authenticated;
GRANT ALL ON public.agent_chat_messages TO service_role;
ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own agent chat messages"
  ON public.agent_chat_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_chat_messages_thread ON public.agent_chat_messages(thread_id, created_at);