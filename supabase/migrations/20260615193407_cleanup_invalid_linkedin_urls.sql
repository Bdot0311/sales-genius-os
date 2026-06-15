-- Clear LinkedIn URLs that aren't real linkedin.com profile/company paths
UPDATE public.leads
SET linkedin_url = NULL
WHERE linkedin_url IS NOT NULL
  AND linkedin_url !~* 'linkedin\.com/(in|pub)/[^/]+';

UPDATE public.leads
SET company_linkedin = NULL
WHERE company_linkedin IS NOT NULL
  AND company_linkedin !~* 'linkedin\.com/(company|school)/[^/]+';
