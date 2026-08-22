DROP TRIGGER IF EXISTS trigger_workflow_on_new_lead ON public.leads;
DROP TRIGGER IF EXISTS trigger_workflow_on_deal_change ON public.deals;
DROP FUNCTION IF EXISTS public.execute_workflow_on_trigger() CASCADE;
DROP TABLE IF EXISTS public.workflows CASCADE;