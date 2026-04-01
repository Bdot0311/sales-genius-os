-- Enable realtime for search_transactions and subscriptions tables
ALTER TABLE public.search_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.search_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;