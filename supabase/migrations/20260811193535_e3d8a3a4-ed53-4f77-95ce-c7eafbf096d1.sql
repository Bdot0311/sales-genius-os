UPDATE public.companies
SET name = initcap(replace(split_part(regexp_replace(lower(coalesce(domain,'')), '^(https?://)?(www\.)?', ''), '.', 1), '-', ' '))
WHERE nullif(trim(coalesce(name,'')), '') IS NULL
  AND nullif(trim(coalesce(domain,'')), '') IS NOT NULL;