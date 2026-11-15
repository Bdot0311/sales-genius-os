CREATE OR REPLACE FUNCTION public.agency_client_stats()
 RETURNS TABLE(client_id uuid, client_user_id uuid, leads_count bigint, emails_sent_count bigint, sequences_count bigint, last_activity_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT ac.id, ac.client_user_id,
    (SELECT count(*) FROM public.leads l WHERE l.user_id = ac.client_user_id),
    (SELECT count(*) FROM public.sent_emails se WHERE se.user_id = ac.client_user_id),
    (SELECT count(*) FROM public.email_sequences es WHERE es.user_id = ac.client_user_id),
    GREATEST(
      (SELECT max(l.created_at) FROM public.leads l WHERE l.user_id = ac.client_user_id),
      (SELECT max(se.created_at) FROM public.sent_emails se WHERE se.user_id = ac.client_user_id))
  FROM public.agency_clients ac
  WHERE ac.agency_id = auth.uid() AND ac.client_user_id IS NOT NULL AND ac.status = 'active';
$function$;