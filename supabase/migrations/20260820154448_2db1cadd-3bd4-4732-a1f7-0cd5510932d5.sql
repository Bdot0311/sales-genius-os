-- AI Gateway usage tracking and 80% threshold alerting

CREATE TABLE IF NOT EXISTS public.ai_gateway_usage_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_start DATE NOT NULL DEFAULT date_trunc('month', now())::DATE,
  period_end DATE NOT NULL DEFAULT (date_trunc('month', now()) + INTERVAL '1 month - 1 day')::DATE,
  credits_used NUMERIC NOT NULL DEFAULT 0,
  calls_count INTEGER NOT NULL DEFAULT 0,
  warning_sent_at TIMESTAMPTZ,
  limit_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_start)
);

GRANT SELECT, INSERT, UPDATE ON public.ai_gateway_usage_tracking TO authenticated;
GRANT ALL ON public.ai_gateway_usage_tracking TO service_role;

ALTER TABLE public.ai_gateway_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages AI gateway usage"
  ON public.ai_gateway_usage_tracking
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can view AI gateway usage"
  ON public.ai_gateway_usage_tracking
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('ai_gateway_usage_tracking', 'id', 'Primary key'),
  ('ai_gateway_usage_tracking', 'period_start', 'Month start'),
  ('ai_gateway_usage_tracking', 'period_end', 'Month end'),
  ('ai_gateway_usage_tracking', 'credits_used', 'Estimated credits consumed'),
  ('ai_gateway_usage_tracking', 'calls_count', 'Number of AI calls'),
  ('ai_gateway_usage_tracking', 'warning_sent_at', '80% alert sent timestamp'),
  ('ai_gateway_usage_tracking', 'limit_sent_at', '100% alert sent timestamp')
ON CONFLICT (table_name, column_name) DO NOTHING;

INSERT INTO public.admin_settings (setting_key, setting_value, description, category)
VALUES
  ('ai_gateway_monthly_cap', '5000', 'Maximum Lovable AI Gateway credits allowed per workspace per month. When reached, the AI SDR is blocked.', 'billing'),
  ('ai_gateway_warning_threshold', '4000', 'Threshold at which admins receive an AI gateway usage warning (80% of cap by default).', 'billing')
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.increment_ai_gateway_usage(
  p_credits NUMERIC DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start DATE := date_trunc('month', now())::DATE;
  v_period_end DATE := (date_trunc('month', now()) + INTERVAL '1 month - 1 day')::DATE;
BEGIN
  INSERT INTO public.ai_gateway_usage_tracking (period_start, period_end, credits_used, calls_count)
  VALUES (v_period_start, v_period_end, p_credits, 1)
  ON CONFLICT (period_start)
  DO UPDATE SET
    credits_used = public.ai_gateway_usage_tracking.credits_used + p_credits,
    calls_count = public.ai_gateway_usage_tracking.calls_count + 1,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_gateway_usage(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_gateway_usage(NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION public.check_ai_gateway_usage_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap NUMERIC;
  v_threshold NUMERIC;
  v_used NUMERIC;
  v_period_start DATE := date_trunc('month', now())::DATE;
  v_row public.ai_gateway_usage_tracking%ROWTYPE;
BEGIN
  SELECT NULLIF(setting_value, '')::NUMERIC INTO v_cap
  FROM public.admin_settings WHERE setting_key = 'ai_gateway_monthly_cap';

  SELECT NULLIF(setting_value, '')::NUMERIC INTO v_threshold
  FROM public.admin_settings WHERE setting_key = 'ai_gateway_warning_threshold';

  IF v_cap IS NULL OR v_threshold IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.ai_gateway_usage_tracking
  WHERE period_start = v_period_start;

  v_used := COALESCE(v_row.credits_used, 0);

  IF v_used >= v_threshold AND v_row.warning_sent_at IS NULL THEN
    INSERT INTO public.system_alerts (category, severity, message, details)
    VALUES (
      'billing',
      'warning',
      'AI Gateway usage at ' || ROUND(v_used / v_cap * 100) || '% of monthly cap',
      jsonb_build_object(
        'credits_used', v_used,
        'cap', v_cap,
        'threshold', v_threshold,
        'percentage', ROUND(v_used / v_cap * 100),
        'period_start', v_period_start
      )
    );

    UPDATE public.ai_gateway_usage_tracking
    SET warning_sent_at = now()
    WHERE period_start = v_period_start;
  END IF;

  IF v_used >= v_cap AND v_row.limit_sent_at IS NULL THEN
    INSERT INTO public.system_alerts (category, severity, message, details)
    VALUES (
      'billing',
      'critical',
      'AI Gateway monthly cap reached (' || v_used || ' / ' || v_cap || ' credits)',
      jsonb_build_object(
        'credits_used', v_used,
        'cap', v_cap,
        'percentage', 100,
        'period_start', v_period_start
      )
    );

    UPDATE public.ai_gateway_usage_tracking
    SET limit_sent_at = now()
    WHERE period_start = v_period_start;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_gateway_usage_alert() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_gateway_usage_alert() TO service_role;
