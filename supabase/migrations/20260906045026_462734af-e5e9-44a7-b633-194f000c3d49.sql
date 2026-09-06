-- sync_sequence_enrollment_counts is a trigger-only SECURITY DEFINER function;
-- nothing should call it directly.
REVOKE EXECUTE ON FUNCTION public.sync_sequence_enrollment_counts() FROM PUBLIC, anon, authenticated;