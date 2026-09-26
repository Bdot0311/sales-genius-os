CREATE OR REPLACE FUNCTION public.search_saved_leads(
  p_search        text    DEFAULT NULL,
  p_intent_label  text    DEFAULT NULL,
  p_industry      text    DEFAULT NULL,
  p_company_size  text    DEFAULT NULL,
  p_seniority     text    DEFAULT NULL,
  p_stage         text    DEFAULT NULL,
  p_priority      text    DEFAULT NULL,
  p_next_step     text    DEFAULT NULL,
  p_sort          text    DEFAULT 'tier',
  p_desc          boolean DEFAULT true,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
RETURNS TABLE (
  id                 uuid,
  company_name       text,
  contact_name       text,
  contact_email      text,
  contact_phone      text,
  contact_phone_type text,
  industry           text,
  company_size       text,
  source             text,
  icp_score          integer,
  created_at         timestamptz,
  updated_at         timestamptz,
  user_id            uuid,
  linkedin_url       text,
  job_title          text,
  company_website    text,
  enrichment_status  text,
  enriched_at        timestamptz,
  seniority          text,
  department         text,
  intent_score       integer,
  intent_label       text,
  recommended_angle  text,
  tier               text,
  fit_score          integer,
  signal_date        timestamptz,
  pipeline_stage     text,
  last_contacted_at  timestamptz,
  total_count        bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT l.*, d.email_priority, d.send_recommendation
    FROM public.leads l
    LEFT JOIN public.lead_decisions d
      ON d.lead_id = l.id AND d.user_id = l.user_id AND d.status = 'ok'
    WHERE l.user_id = auth.uid()
      AND (p_search IS NULL OR p_search = '' OR (
            l.company_name  ILIKE '%' || p_search || '%'
         OR l.contact_name  ILIKE '%' || p_search || '%'
         OR l.contact_email ILIKE '%' || p_search || '%'))
      AND (p_intent_label IS NULL OR l.intent_label = p_intent_label)
      AND (p_industry     IS NULL OR l.industry = p_industry)
      AND (p_company_size IS NULL OR l.company_size = p_company_size)
      AND (p_seniority    IS NULL OR l.seniority = p_seniority)
      AND (p_stage        IS NULL OR COALESCE(l.pipeline_stage, 'new') = p_stage)
      AND (p_priority     IS NULL OR d.email_priority = p_priority)
      AND (p_next_step    IS NULL OR d.send_recommendation = p_next_step)
  )
  SELECT
    s.id, s.company_name, s.contact_name, s.contact_email, s.contact_phone,
    s.contact_phone_type, s.industry, s.company_size, s.source, s.icp_score,
    s.created_at, s.updated_at, s.user_id, s.linkedin_url, s.job_title,
    s.company_website, s.enrichment_status, s.enriched_at, s.seniority,
    s.department, s.intent_score, s.intent_label, s.recommended_angle, s.tier,
    s.fit_score, s.signal_date, s.pipeline_stage, s.last_contacted_at,
    COUNT(*) OVER () AS total_count
  FROM scoped s
  ORDER BY
    CASE WHEN p_sort = 'tier'          AND p_desc THEN
      CASE s.tier WHEN 'A' THEN 3 WHEN 'B' THEN 2 WHEN 'C' THEN 1 ELSE 0 END END DESC NULLS LAST,
    CASE WHEN p_sort = 'tier'          AND NOT p_desc THEN
      CASE s.tier WHEN 'A' THEN 3 WHEN 'B' THEN 2 WHEN 'C' THEN 1 ELSE 0 END END ASC NULLS LAST,
    CASE WHEN p_sort = 'tier'          AND p_desc     THEN s.signal_date  END DESC NULLS LAST,
    CASE WHEN p_sort = 'tier'          AND NOT p_desc THEN s.signal_date  END ASC  NULLS LAST,
    CASE WHEN p_sort = 'icp_score'     AND p_desc     THEN s.icp_score    END DESC NULLS LAST,
    CASE WHEN p_sort = 'icp_score'     AND NOT p_desc THEN s.icp_score    END ASC  NULLS LAST,
    CASE WHEN p_sort = 'intent_score'  AND p_desc     THEN s.intent_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'intent_score'  AND NOT p_desc THEN s.intent_score END ASC  NULLS LAST,
    CASE WHEN p_sort = 'company_name'  AND p_desc     THEN s.company_name END DESC NULLS LAST,
    CASE WHEN p_sort = 'company_name'  AND NOT p_desc THEN s.company_name END ASC  NULLS LAST,
    CASE WHEN p_sort = 'created_at'    AND p_desc     THEN s.created_at   END DESC NULLS LAST,
    CASE WHEN p_sort = 'created_at'    AND NOT p_desc THEN s.created_at   END ASC  NULLS LAST,
    s.created_at DESC, s.id DESC
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.search_saved_leads FROM public;
GRANT EXECUTE ON FUNCTION public.search_saved_leads TO authenticated;

CREATE OR REPLACE FUNCTION public.saved_lead_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'industries',    COALESCE((SELECT jsonb_agg(DISTINCT industry     ORDER BY industry)     FROM public.leads WHERE user_id = auth.uid() AND industry     IS NOT NULL AND industry     <> ''), '[]'::jsonb),
    'company_sizes', COALESCE((SELECT jsonb_agg(DISTINCT company_size ORDER BY company_size) FROM public.leads WHERE user_id = auth.uid() AND company_size IS NOT NULL AND company_size <> ''), '[]'::jsonb),
    'seniorities',   COALESCE((SELECT jsonb_agg(DISTINCT seniority    ORDER BY seniority)    FROM public.leads WHERE user_id = auth.uid() AND seniority    IS NOT NULL AND seniority    <> ''), '[]'::jsonb),
    'total',         (SELECT COUNT(*) FROM public.leads WHERE user_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.saved_lead_facets FROM public;
GRANT EXECUTE ON FUNCTION public.saved_lead_facets TO authenticated;

CREATE INDEX IF NOT EXISTS idx_leads_user_tier_signal
  ON public.leads(user_id, tier, signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_stage
  ON public.leads(user_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_user_industry
  ON public.leads(user_id, industry);
CREATE INDEX IF NOT EXISTS idx_leads_user_created
  ON public.leads(user_id, created_at DESC);

COMMENT ON FUNCTION public.search_saved_leads IS
  'Saved Leads list: filters, sorts and pages server-side across leads + lead_decisions. Scoped to auth.uid(); the caller never names a user.';