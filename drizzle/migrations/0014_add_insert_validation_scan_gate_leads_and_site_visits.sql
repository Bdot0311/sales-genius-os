-- Tighten public insert policies with WITH CHECK validation to reduce spam/pollution abuse.

-- scan_gate_leads: require a plausible email and bounded field sizes
DROP POLICY IF EXISTS "Anyone can submit a scan-gate email" ON public.scan_gate_leads;
CREATE POLICY "Anyone can submit a scan-gate email"
ON public.scan_gate_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND char_length(email) BETWEEN 5 AND 255
  AND email ~ '^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$'
  AND (posthog_distinct_id IS NULL OR char_length(posthog_distinct_id) <= 200)
);

-- site_visits: require visitor/session identifiers and bound text field sizes
DROP POLICY IF EXISTS "Anyone can log a visit" ON public.site_visits;
CREATE POLICY "Anyone can log a visit"
ON public.site_visits
FOR INSERT
TO anon, authenticated
WITH CHECK (
  visitor_id IS NOT NULL AND char_length(visitor_id) <= 100
  AND session_id IS NOT NULL AND char_length(session_id) <= 100
  AND (posthog_distinct_id IS NULL OR char_length(posthog_distinct_id) <= 200)
  AND (landing_path IS NULL OR char_length(landing_path) <= 500)
  AND (landing_url IS NULL OR char_length(landing_url) <= 1000)
  AND (referrer IS NULL OR char_length(referrer) <= 1000)
  AND (user_agent IS NULL OR char_length(user_agent) <= 500)
  AND (utm_source IS NULL OR char_length(utm_source) <= 200)
  AND (utm_medium IS NULL OR char_length(utm_medium) <= 200)
  AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 200)
  AND (utm_content IS NULL OR char_length(utm_content) <= 200)
  AND (utm_term IS NULL OR char_length(utm_term) <= 200)
);