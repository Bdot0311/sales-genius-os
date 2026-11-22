-- Privileged rollback-only regression: no agent is enabled or run, no mail sent.
BEGIN;
DO $$
DECLARE owner_id uuid;
BEGIN
 SELECT c.user_id INTO owner_id FROM public.agent_configs c
 LEFT JOIN public.subscriptions s ON s.user_id=c.user_id
 WHERE COALESCE(s.plan::text,'free')='free'
 AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=c.user_id AND r.role='admin') LIMIT 1;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Needs a non-admin Free test owner'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE config_id uuid; value integer; new_id uuid := gen_random_uuid();
BEGIN
 SELECT id INTO config_id FROM public.agent_configs WHERE user_id=auth.uid() LIMIT 1;
 UPDATE public.agent_configs SET max_daily_auto_replies=2147483647 WHERE id=config_id;
 SELECT max_daily_auto_replies INTO value FROM public.agent_configs WHERE id=config_id;
 IF value<>3 THEN RAISE EXCEPTION 'Direct customer update escaped plan cap'; END IF;
 UPDATE public.agent_configs SET max_daily_auto_replies=1 WHERE id=config_id;
 SELECT max_daily_auto_replies INTO value FROM public.agent_configs WHERE id=config_id;
 IF value<>1 THEN RAISE EXCEPTION 'Lower preference must remain allowed'; END IF;
 UPDATE public.agent_configs SET max_daily_auto_replies=-1 WHERE id=config_id;
 SELECT max_daily_auto_replies INTO value FROM public.agent_configs WHERE id=config_id;
 IF value<>0 THEN RAISE EXCEPTION 'Negative preference must clamp to zero'; END IF;
 UPDATE public.agent_configs SET max_daily_auto_replies=NULL WHERE id=config_id;
 SELECT max_daily_auto_replies INTO value FROM public.agent_configs WHERE id=config_id;
 IF value IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Null preference must fail closed'; END IF;
 INSERT INTO public.agent_configs(id,user_id,enabled,is_primary,max_daily_auto_replies)
 VALUES(new_id,auth.uid(),false,false,999999);
 SELECT max_daily_auto_replies INTO value FROM public.agent_configs WHERE id=new_id;
 IF value<>3 THEN RAISE EXCEPTION 'Direct customer insert escaped plan cap'; END IF;
 UPDATE public.agent_configs SET reply_delay_minutes=30 WHERE id=new_id;
 SELECT max_daily_auto_replies INTO value FROM public.agent_configs WHERE id=new_id;
 IF value<>3 THEN RAISE EXCEPTION 'Unrelated settings unexpectedly changed reply cap'; END IF;
 IF has_function_privilege('authenticated','public.agent_reply_plan_limit(uuid)','EXECUTE') OR has_function_privilege('anon','public.agent_reply_plan_limit(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Plan reader must stay service-only'; END IF;
 RAISE NOTICE 'Seven direct-customer reply-setting regressions passed';
END $$;
ROLLBACK;