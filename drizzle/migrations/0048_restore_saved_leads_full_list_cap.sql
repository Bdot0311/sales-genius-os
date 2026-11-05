CREATE OR REPLACE FUNCTION public.search_saved_leads(
  p_search        text    DEFAULT NULL,
  p_intent_label  text    DEFAULT NULL,
  p_industry      text    DEFAULT NULL,
  p_company_size  text    DEFAULT NULL,
  p_seniority     text    DEFAULT NULL,
  p_stage         text    DEFAULT NULL,
  p_priority      text    DEFAULT NULL,
  p_next_step     text    DEFAULT NULL,
  p_tier          text    DEFAULT NULL,
  p_sort          text    DEFAULT 'tier',
  p_desc          boolean DEFAULT true,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0,
  p_show          text    DEFAULT NULL,
  p_enriched      text    DEFAULT NULL
)
RETURNS TABLE (
  id uuid, company_name text, contact_name text, contact_email text, contact_phone text,
  contact_phone_type text, industry text, company_size text, source text, icp_score integer,
  created_at timestamptz, updated_at timestamptz, user_id uuid, linkedin_url text, job_title text,
  company_website text, enrichment_status text, enriched_at timestamptz, seniority text,
  department text, intent_score integer, intent_label text, recommended_angle text, tier text,
  fit_score integer, signal_date timestamptz, pipeline_stage text, last_contacted_at timestamptz,
  total_count bigint
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
      AND (p_tier         IS NULL
           OR (p_tier = 'unscored' AND l.tier IS NULL)
           OR l.tier = p_tier)
      AND (p_enriched IS NULL
           OR (p_enriched = 'enriched'
               AND (l.enrichment_status IN ('enriched', 'completed')
                    OR l.enriched_at IS NOT NULL))
           OR (p_enriched = 'not-enriched'
               AND NOT (l.enrichment_status IN ('enriched', 'completed')
                        OR l.enriched_at IS NOT NULL)))
      AND (p_show IS NULL
           OR (p_show = 'no-email'
               AND (l.contact_email IS NULL OR l.contact_email = ''))
           OR (p_show = 'never-contacted'
               AND l.contact_email IS NOT NULL AND l.contact_email <> ''
               AND l.last_contacted_at IS NULL))
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
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 100000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.search_saved_leads FROM public;
GRANT EXECUTE ON FUNCTION public.search_saved_leads TO authenticated;