-- Privileged rollback-only checks. No account creation, charges or mail.
BEGIN;
DO $$
DECLARE owner_id uuid; tier public.subscription_plan; before_balance integer; key text := 'stripe-required-regression-' || gen_random_uuid(); claim text := gen_random_uuid()::text;
BEGIN
 SELECT s.user_id,s.search_credits_remaining INTO owner_id,before_balance
 FROM public.subscriptions s WHERE s.plan='free'
 AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=s.user_id AND r.role='admin') LIMIT 1;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'A Free customer fixture is required'; END IF;
 FOREACH tier IN ARRAY ARRAY['starter','growth','pro','agency']::public.subscription_plan[] LOOP
  BEGIN
   UPDATE public.subscriptions SET plan=tier,billing_exempt=true,stripe_customer_id=NULL,stripe_subscription_id=NULL WHERE user_id=owner_id;
   RAISE EXCEPTION 'Paid tier % escaped the Stripe guard',tier;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
 BEGIN
  UPDATE public.subscriptions SET plan='pro',account_status='trial',trial_end_date=now()+interval '30 days',stripe_customer_id='cus_fixture',stripe_subscription_id=NULL WHERE user_id=owner_id;
  RAISE EXCEPTION 'Manual trial bypassed Stripe signup';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 PERFORM public.appsumo_apply_event(jsonb_build_object('license_key',key,'event','activate','event_timestamp',1,'tier',5,'test',false));
 INSERT INTO public.appsumo_redemption_claims(token_hash,license_key,expires_at) VALUES(claim,key,now()+interval '30 minutes');
 PERFORM public.appsumo_claim_license(claim,owner_id);
 IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=owner_id AND plan='free' AND NOT billing_exempt AND search_credits_remaining=before_balance AND appsumo_license_key=key) THEN
  RAISE EXCEPTION 'AppSumo claim granted paid access or changed credits';
 END IF;
 IF public.appsumo_refresh_credits()<>0 THEN RAISE EXCEPTION 'AppSumo independently renewed credits'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 RAISE NOTICE 'Six Stripe linkage/claim checks passed';
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
 BEGIN
  UPDATE public.subscriptions SET plan='pro',stripe_customer_id='cus_forged',stripe_subscription_id='sub_forged',billing_exempt=true WHERE user_id=auth.uid();
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Customer could write paid entitlements'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.admin_update_subscription(auth.uid(),'pro','active');
  RAISE EXCEPTION 'Customer could grant a tier through the admin helper';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Customer could grant a tier through the admin helper' OR SQLSTATE='42883' THEN RAISE; END IF;
 END;
 IF has_function_privilege('authenticated','public.appsumo_sync_subscription(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.appsumo_refresh_credits()','EXECUTE') THEN RAISE EXCEPTION 'Customer could run licensing helpers'; END IF;
 RAISE NOTICE 'Three direct-customer permission checks passed';
END $$;
RESET ROLE;
DO $$
DECLARE admin_id uuid;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Protected admin fixture is required'; END IF;
 UPDATE public.subscriptions SET billing_exempt=false WHERE user_id=admin_id;
 IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=admin_id AND billing_exempt AND plan='agency') THEN RAISE EXCEPTION 'Owner Agency admin exemption changed'; END IF;
 RAISE NOTICE 'Administrator exemption check passed';
END $$;
ROLLBACK;