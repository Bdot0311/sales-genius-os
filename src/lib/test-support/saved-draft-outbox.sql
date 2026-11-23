-- Rollback-only integration assertions. Future due dates prevent delivery.
BEGIN;
DO $$
DECLARE owner_id uuid; lead uuid; test_leads uuid[]; mailbox uuid; draft uuid; items jsonb := '[]'::jsonb; outcome jsonb; row_item jsonb; queued_count int; prefix text := '__draft_delivery_test_' || gen_random_uuid()::text; other_owner uuid := gen_random_uuid();
BEGIN
 SELECT a.user_id,a.id INTO owner_id,mailbox FROM public.sending_accounts a JOIN public.integrations i ON i.id=a.integration_id AND i.is_active WHERE a.status='active' AND i.integration_id='google' AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=a.user_id AND r.role='admin') LIMIT 1;
 SELECT array_agg(id) INTO test_leads FROM (SELECT l.id FROM public.leads l WHERE l.user_id=owner_id AND l.contact_email IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.email_drafts d WHERE d.user_id=owner_id AND d.lead_id=l.id) LIMIT 61) available;
 IF owner_id IS NULL OR coalesce(array_length(test_leads,1),0)<>61 THEN RAISE EXCEPTION 'Test needs owner mailbox and 61 unused leads'; END IF;
 FOR n IN 1..61 LOOP
  lead := test_leads[n];
  INSERT INTO public.email_drafts(user_id,lead_id,subject,body) VALUES(owner_id,lead,prefix||n,'Individual researched message '||n) RETURNING id INTO draft;
  items := items || jsonb_build_array(jsonb_build_object('draft_id',draft,'original_subject',prefix||n,'original_body','Individual researched message '||n,'body_html','<p>Individual researched message '||n||'</p>','body_text','Individual researched message '||n,'sending_account_id',mailbox,'scheduled_at',now()+interval '30 days'));
 END LOOP;
 outcome := public.queue_saved_draft_outbox(other_owner,items);
 SELECT count(*) INTO queued_count FROM jsonb_array_elements(outcome) e WHERE e->>'queued'='true';
 IF queued_count<>0 THEN RAISE EXCEPTION 'Other owner queued drafts'; END IF;
 outcome := public.queue_saved_draft_outbox(owner_id,items);
 SELECT count(*) INTO queued_count FROM jsonb_array_elements(outcome) e WHERE e->>'queued'='true';
 IF queued_count<>61 THEN RAISE EXCEPTION 'Expected all 61 queued, got %',queued_count; END IF;
 IF (SELECT count(*) FROM public.sent_emails WHERE user_id=owner_id AND subject LIKE prefix||'%' AND status='scheduled' AND sent_at IS NULL)<>61 THEN RAISE EXCEPTION 'Outbox copy/count/state differs'; END IF;
 IF EXISTS(SELECT 1 FROM public.email_drafts WHERE user_id=owner_id AND subject LIKE prefix||'%') THEN RAISE EXCEPTION 'Queued drafts were not atomically moved'; END IF;
 outcome := public.queue_saved_draft_outbox(owner_id,items);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(outcome) e WHERE e->>'queued'='true') THEN RAISE EXCEPTION 'Repeated batch queued twice'; END IF;
 row_item := items->0;
 lead := test_leads[1];
 INSERT INTO public.email_drafts(user_id,lead_id,subject,body) VALUES(owner_id,lead,row_item->>'original_subject',row_item->>'original_body') RETURNING id INTO draft;
 row_item := jsonb_set(row_item,'{draft_id}',to_jsonb(draft));
 outcome := public.queue_saved_draft_outbox(owner_id,jsonb_build_array(row_item));
 IF outcome->0->>'code'<>'duplicate_send' THEN RAISE EXCEPTION 'Queued duplicate was not blocked'; END IF;
 UPDATE public.sent_emails SET status='sent',sent_at=now()-interval '10 days' WHERE user_id=owner_id AND subject=row_item->>'original_subject';
 outcome := public.queue_saved_draft_outbox(owner_id,jsonb_build_array(row_item));
 IF outcome->0->>'code'<>'duplicate_send' THEN RAISE EXCEPTION 'Two-week delivered duplicate guard was not retained'; END IF;
 row_item := jsonb_set(row_item,'{allow_duplicate}','true'::jsonb);
 outcome := public.queue_saved_draft_outbox(owner_id,jsonb_build_array(row_item));
 IF outcome->0->>'queued'<>'true' THEN RAISE EXCEPTION 'Explicit deliberate resend was lost'; END IF;
 INSERT INTO public.email_drafts(user_id,lead_id,subject,body) VALUES(owner_id,lead,prefix||'changed','new body') RETURNING id INTO draft;
 row_item := jsonb_set(items->0,'{draft_id}',to_jsonb(draft));
 outcome := public.queue_saved_draft_outbox(owner_id,jsonb_build_array(row_item));
 IF outcome->0->>'error' NOT LIKE 'Draft changed%' THEN RAISE EXCEPTION 'Changed draft was not held for review'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.email_drafts WHERE id=draft) THEN RAISE EXCEPTION 'Changed draft was lost'; END IF;
 IF has_function_privilege('authenticated','public.queue_saved_draft_outbox(uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.queue_saved_draft_outbox(uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.queue_saved_draft_outbox(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Queue grants incorrect'; END IF;
 RAISE NOTICE 'Passed: 61 queued, owner isolation, atomic move, retry idempotency, queued duplicates, 14-day delivered duplicates, deliberate resend, changed copy, private grants.';
END $$;
ROLLBACK;