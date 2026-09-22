-- 1. Explicit admin SELECT on changelog_roadmap so admins can read unpublished items
DROP POLICY IF EXISTS "admins read all roadmap items" ON public.changelog_roadmap;
CREATE POLICY "admins read all roadmap items"
ON public.changelog_roadmap
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Throttle anonymous scan-gate lead submissions
CREATE OR REPLACE FUNCTION public.throttle_scan_gate_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_total integer;
  recent_same_client integer;
BEGIN
  SELECT count(*) INTO recent_total
  FROM public.scan_gate_leads
  WHERE created_at > now() - interval '1 minute';

  IF recent_total >= 20 THEN
    RAISE EXCEPTION 'Too many submissions right now. Please try again shortly.';
  END IF;

  IF NEW.posthog_distinct_id IS NOT NULL THEN
    SELECT count(*) INTO recent_same_client
    FROM public.scan_gate_leads
    WHERE posthog_distinct_id = NEW.posthog_distinct_id
      AND created_at > now() - interval '1 hour';

    IF recent_same_client >= 5 THEN
      RAISE EXCEPTION 'Too many submissions from this browser. Please try again later.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_throttle_scan_gate_leads ON public.scan_gate_leads;
CREATE TRIGGER trg_throttle_scan_gate_leads
BEFORE INSERT ON public.scan_gate_leads
FOR EACH ROW EXECUTE FUNCTION public.throttle_scan_gate_leads();

-- 3. Throttle anonymous analytics visit logging
CREATE OR REPLACE FUNCTION public.throttle_site_visits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_total integer;
  recent_same_visitor integer;
BEGIN
  SELECT count(*) INTO recent_total
  FROM public.site_visits
  WHERE created_at > now() - interval '1 minute';

  IF recent_total >= 120 THEN
    RAISE EXCEPTION 'Visit logging temporarily throttled.';
  END IF;

  SELECT count(*) INTO recent_same_visitor
  FROM public.site_visits
  WHERE visitor_id = NEW.visitor_id
    AND created_at > now() - interval '1 hour';

  IF recent_same_visitor >= 30 THEN
    RAISE EXCEPTION 'Visit logging temporarily throttled for this visitor.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_throttle_site_visits ON public.site_visits;
CREATE TRIGGER trg_throttle_site_visits
BEFORE INSERT ON public.site_visits
FOR EACH ROW EXECUTE FUNCTION public.throttle_site_visits();