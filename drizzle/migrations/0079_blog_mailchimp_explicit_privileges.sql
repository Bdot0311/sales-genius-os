REVOKE ALL ON public.blog_mailchimp_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blog_mailchimp_deliveries TO authenticated;
GRANT ALL ON public.blog_mailchimp_deliveries TO service_role;
REVOKE ALL ON FUNCTION public.claim_blog_mailchimp_delivery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_blog_mailchimp_delivery() TO service_role;
NOTIFY pgrst, 'reload schema';