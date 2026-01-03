-- Enable realtime for onboarding_progress table
ALTER TABLE public.onboarding_progress REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_progress;