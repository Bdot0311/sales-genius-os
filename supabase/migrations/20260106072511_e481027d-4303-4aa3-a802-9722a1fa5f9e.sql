-- Create table for coaching conversations
CREATE TABLE public.coaching_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for coaching messages
CREATE TABLE public.coaching_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.coaching_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coaching_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversations
CREATE POLICY "Users can view their own conversations" 
ON public.coaching_conversations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations" 
ON public.coaching_conversations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations" 
ON public.coaching_conversations 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations" 
ON public.coaching_conversations 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for messages
CREATE POLICY "Users can view their own messages" 
ON public.coaching_messages 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages" 
ON public.coaching_messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_coaching_conversations_user_id ON public.coaching_conversations(user_id);
CREATE INDEX idx_coaching_messages_conversation_id ON public.coaching_messages(conversation_id);
CREATE INDEX idx_coaching_messages_created_at ON public.coaching_messages(created_at);

-- Trigger to update updated_at
CREATE TRIGGER update_coaching_conversations_updated_at
BEFORE UPDATE ON public.coaching_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();