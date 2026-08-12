-- Give leads a real link to the account they belong to.
--
-- leads has only company_name, a free text field, so anything that needs an
-- account's leads has to match on that string. contacts already links by
-- company_id, which is why an account's buying committee resolves while its
-- why-now research finds nothing: the two look up the same account different
-- ways, and companies and leads are populated by different flows (lead
-- activation, tech-signal import, manual entry, CSV import) that do not agree
-- on casing or punctuation.
--
-- company_name stays. It is what the providers return and what the UI shows,
-- and it is the only thing a lead has before its account row exists. company_id
-- is the authoritative link when it is set; the name remains the fallback.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- The lookup this column exists for: "every lead for this account, for me".
CREATE INDEX IF NOT EXISTS idx_leads_company_id
  ON public.leads(user_id, company_id)
  WHERE company_id IS NOT NULL;

-- Backfill. Match within a user only — two accounts in different workspaces can
-- share a name and must never be linked to each other's leads.
--
-- Names are compared case- and whitespace-insensitively because that is exactly
-- the mismatch this column removes. Punctuation is left alone: "Reddit" and
-- "Reddit, Inc." are plausibly different records, and guessing wrong here
-- attaches a lead to the wrong account permanently.
WITH matched AS (
  SELECT
    l.id AS lead_id,
    -- A name could resolve to more than one company row for the same user.
    -- Take the oldest, which is the one other records are most likely already
    -- pointing at, and only when the match is unambiguous (see the count below).
    (ARRAY_AGG(c.id ORDER BY c.created_at ASC))[1] AS company_id,
    COUNT(DISTINCT c.id) AS candidates
  FROM public.leads l
  JOIN public.companies c
    ON c.user_id = l.user_id
   AND lower(btrim(c.name)) = lower(btrim(l.company_name))
  WHERE l.company_id IS NULL
    AND l.company_name IS NOT NULL
    AND btrim(l.company_name) <> ''
  GROUP BY l.id
)
UPDATE public.leads l
   SET company_id = m.company_id
  FROM matched m
 WHERE l.id = m.lead_id
   AND m.candidates = 1;

-- Keep the link current as accounts are created after their leads. A lead
-- imported before its account row existed would otherwise stay unlinked
-- forever, which is the state this migration is cleaning up.
CREATE OR REPLACE FUNCTION public.link_leads_to_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads l
     SET company_id = NEW.id
   WHERE l.user_id = NEW.user_id
     AND l.company_id IS NULL
     AND l.company_name IS NOT NULL
     AND lower(btrim(l.company_name)) = lower(btrim(NEW.name));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_leads_to_company ON public.companies;
CREATE TRIGGER trg_link_leads_to_company
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.link_leads_to_company();
