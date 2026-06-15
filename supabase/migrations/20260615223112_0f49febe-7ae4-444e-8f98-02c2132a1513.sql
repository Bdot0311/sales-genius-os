ALTER TABLE public.icp_profiles
  ALTER COLUMN revenue_range TYPE text[] USING CASE WHEN revenue_range IS NOT NULL THEN ARRAY[revenue_range] ELSE NULL END,
  ALTER COLUMN business_model TYPE text[] USING CASE WHEN business_model IS NOT NULL THEN ARRAY[business_model] ELSE NULL END,
  ALTER COLUMN growth_stage TYPE text[] USING CASE WHEN growth_stage IS NOT NULL THEN ARRAY[growth_stage] ELSE NULL END,
  ALTER COLUMN company_age_range TYPE text[] USING CASE WHEN company_age_range IS NOT NULL THEN ARRAY[company_age_range] ELSE NULL END,
  ALTER COLUMN deal_size_range TYPE text[] USING CASE WHEN deal_size_range IS NOT NULL THEN ARRAY[deal_size_range] ELSE NULL END,
  ALTER COLUMN sales_cycle TYPE text[] USING CASE WHEN sales_cycle IS NOT NULL THEN ARRAY[sales_cycle] ELSE NULL END,
  ALTER COLUMN budget_authority TYPE text[] USING CASE WHEN budget_authority IS NOT NULL THEN ARRAY[budget_authority] ELSE NULL END;