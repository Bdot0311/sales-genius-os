CREATE OR REPLACE FUNCTION public.queue_saved_draft_outbox(p_user_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb; d public.email_drafts%ROWTYPE; recipient text; account_id uuid; outbox_id uuid; results jsonb := '[]'::jsonb;
BEGIN
 IF p_user_id IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 100 THEN RAISE EXCEPTION 'Invalid draft batch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 73581));
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO d FROM public.email_drafts WHERE id=(item->>'draft_id')::uuid AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
   results := results || jsonb_build_array(jsonb_build_object('draft_id',item->>'draft_id','error','Draft no longer available; refresh before retrying.')); CONTINUE;
  END IF;
  IF coalesce(d.subject,'') <> coalesce(item->>'original_subject','') OR coalesce(d.body,'') <> coalesce(item->>'original_body','') THEN
   results := results || jsonb_build_array(jsonb_build_object('draft_id',d.id,'error','Draft changed; refresh and review it again.')); CONTINUE;
  END IF;
  SELECT contact_email INTO recipient FROM public.leads WHERE id=d.lead_id AND user_id=p_user_id;
  IF recipient IS NULL OR btrim(recipient)='' OR coalesce(d.subject,'')='' OR coalesce(d.body,'')='' THEN
   results := results || jsonb_build_array(jsonb_build_object('draft_id',d.id,'error','Draft needs a recipient, subject and body.')); CONTINUE;
  END IF;
  account_id := (item->>'sending_account_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.sending_accounts a JOIN public.integrations i ON i.id=a.integration_id AND i.user_id=p_user_id AND i.is_active WHERE a.id=account_id AND a.user_id=p_user_id AND a.status='active' AND i.integration_id='google') THEN
   results := results || jsonb_build_array(jsonb_build_object('draft_id',d.id,'error','Selected mailbox is not active.')); CONTINUE;
  END IF;
  IF EXISTS(SELECT 1 FROM public.sent_emails e WHERE e.user_id=p_user_id AND lower(btrim(e.to_email))=lower(btrim(recipient)) AND lower(btrim(e.subject))=lower(btrim(d.subject)) AND (e.status='scheduled' OR (coalesce((item->>'allow_duplicate')::boolean,false)=false AND e.status IN ('sent','delivered','opened','replied','clicked') AND e.sent_at>now()-interval '14 days'))) THEN
   results := results || jsonb_build_array(jsonb_build_object('draft_id',d.id,'error','This recipient already has this email sent or queued.','code','duplicate_send')); CONTINUE;
  END IF;
  INSERT INTO public.sent_emails(user_id,lead_id,to_email,subject,body_html,body_text,status,scheduled_at,sent_at,sending_account_id)
  VALUES(p_user_id,d.lead_id,recipient,d.subject,item->>'body_html',item->>'body_text','scheduled',(item->>'scheduled_at')::timestamptz,NULL,account_id) RETURNING id INTO outbox_id;
  DELETE FROM public.email_drafts WHERE id=d.id AND user_id=p_user_id;
  results := results || jsonb_build_array(jsonb_build_object('draft_id',d.id,'email_id',outbox_id,'queued',true,'scheduled_at',item->>'scheduled_at'));
 END LOOP;
 RETURN results;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_saved_draft_outbox(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_saved_draft_outbox(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';