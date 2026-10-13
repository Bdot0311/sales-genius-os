-- The lead grade was computed, stored, indexed, displayed — and unselectable.
--
-- lead-scoring.ts derives an A/B/C tier, 20260726000000 added the column, the
-- constraint and idx_leads_tier, score-lead-v2 writes it and the Saved Leads
-- row renders it as a pill. Nothing could filter on it. A user could see that
-- a lead was a B and had no way to say "work my B-leads" — not on the page,
-- not through the agent.
--
-- That is the segment the SaaStr AI-agent playbook calls the found money: the
-- contacts already in the database with some score and some signal that no
-- human will ever get to, because a human works the A-list and runs out of
-- week. Every part of selecting them was already paid for except the WHERE.
--
-- ── Why this drops before it creates ────────────────────────────────────
--
-- Postgres overloads functions by argument list, so CREATE OR REPLACE with one
-- extra parameter does not replace anything — it adds a second function with
-- the same name. PostgREST then cannot choose between them and every call
-- fails as ambiguous, which would take Saved Leads down rather than extend it.
--
-- The drop is written against pg_proc rather than a literal signature on
-- purpose. The live function has a p_show parameter that no migration in this
-- repository creates (it was applied straight to the database), so the
-- signature here is not known to be the signature there, and DROP FUNCTION
-- with the wrong argument list is an error that stops the migration. Looping
-- over whatever overloads exist removes them whichever shape they are.

DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_saved_leads'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.search_saved_leads(%s)', sig);
  END LOOP;
END $$;

CREATE FUNCTION public.search_saved_leads(
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
  p_show          text    DEFAULT NULL
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
    -- auth.uid(), never a parameter: the caller says how to filter, never whose
    -- rows to read. SECURITY DEFINER without this is a data leak.
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
      -- 'unscored' is its own answer, not an absence: a lead nobody has graded
      -- is the one a user most wants to find, and NULL = NULL would hide it.
      AND (p_tier         IS NULL
           OR (p_tier = 'unscored' AND l.tier IS NULL)
           OR l.tier = p_tier)
      -- The two entry points the overview counts link to. Reproduced from the
      -- predicates the page applied before this moved server-side: no-email is
      -- a lead with no address at all, never-contacted is a reachable one
      -- nobody has emailed yet.
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
    -- The real total, so paging knows where it ends and nothing is silently
    -- out of reach. Counted over the filtered set, before the limit.
    COUNT(*) OVER () AS total_count
  FROM scoped s
  ORDER BY
    -- Tier first, then signal recency, then intent: the same order the page
    -- sorted by in the browser, kept so the default view does not change
    -- under anyone.
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
    -- Every sort ends on a unique column. Without it two rows that tie can
    -- swap between pages, so paging shows one twice and skips another.
    s.created_at DESC, s.id DESC
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.search_saved_leads FROM public;
GRANT EXECUTE ON FUNCTION public.search_saved_leads TO authenticated;

COMMENT ON FUNCTION public.search_saved_leads IS
  'Saved Leads list: filters (including tier), sorts and pages server-side across leads + lead_decisions. Scoped to auth.uid(); the caller never names a user.';

-- How many leads sit in each grade, for the filter control.
--
-- The point of the B-lead segment is its size, and a dropdown that says "B"
-- without saying "1,284" is asking the user to guess whether it is worth
-- running. Counted over the whole account, like the other facets.
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
    'tiers',         COALESCE((SELECT jsonb_object_agg(k, n) FROM (
                        SELECT COALESCE(tier, 'unscored') AS k, COUNT(*) AS n
                        FROM public.leads WHERE user_id = auth.uid()
                        GROUP BY COALESCE(tier, 'unscored')
                      ) t), '{}'::jsonb),
    'total',         (SELECT COUNT(*) FROM public.leads WHERE user_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.saved_lead_facets FROM public;
GRANT EXECUTE ON FUNCTION public.saved_lead_facets TO authenticated;

-- The agent filters leads by tier too, and it reads through the service role
-- rather than this function, so it needs the plain column index. 20260926140000
-- created (user_id, tier, signal_date) which covers it; this is the narrower
-- one for a tier-only scan with the account filter.
CREATE INDEX IF NOT EXISTS idx_leads_user_tier ON public.leads(user_id, tier);
