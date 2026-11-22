CREATE OR REPLACE FUNCTION public.agent_reply_plan_limit(p_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT CASE COALESCE((SELECT plan::text FROM public.subscriptions WHERE user_id=p_user_id LIMIT 1),'free')
 WHEN 'starter' THEN 15 WHEN 'growth' THEN 50 WHEN 'pro' THEN 150 WHEN 'elite' THEN 500 WHEN 'agency' THEN 500 ELSE 3 END;
$$;
REVOKE ALL ON FUNCTION public.agent_reply_plan_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_reply_plan_limit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_agent_reply_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 NEW.max_daily_auto_replies := LEAST(public.agent_reply_plan_limit(NEW.user_id), GREATEST(0,COALESCE(NEW.max_daily_auto_replies,0)));
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_agent_reply_plan_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_agent_reply_plan_limit BEFORE INSERT OR UPDATE OF max_daily_auto_replies,user_id ON public.agent_configs FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_reply_plan_limit();
NOTIFY pgrst, 'reload schema';