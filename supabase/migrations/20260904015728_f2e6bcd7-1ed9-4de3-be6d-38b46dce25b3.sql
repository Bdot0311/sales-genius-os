GRANT INSERT (direction, endpoint_token, default_source) ON public.webhooks TO authenticated;
GRANT UPDATE (default_source) ON public.webhooks TO authenticated;