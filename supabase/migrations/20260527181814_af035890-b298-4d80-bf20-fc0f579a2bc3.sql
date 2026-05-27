ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.deals REPLICA IDENTITY FULL;
ALTER TABLE public.reply_threads REPLICA IDENTITY FULL;
ALTER TABLE public.sent_emails REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='reply_threads') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reply_threads';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sent_emails') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sent_emails';
  END IF;
END $$;