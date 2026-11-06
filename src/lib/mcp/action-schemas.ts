import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const list = z.array(text).max(20).optional();
export const prospectSearchSchema = {
  query: text.optional(), job_title: text.optional(), industry: text.optional(),
  company_size: text.optional(), country: text.optional(), company: text.optional(), company_domain: text.optional(),
  job_titles: list, industries: list, countries: list, seniority_levels: list,
  keywords: list, exclude_titles: list, exclude_industries: list, exclude_keywords: list,
  companies: z.array(z.object({ name: text.optional(), domain: text.optional() }).strict()).max(20).optional(),
  seniority: text.optional(), limit: z.number().int().min(1).max(200).optional(),
  page: z.number().int().min(1).max(1000).optional(), cursor: z.string().max(4000).optional(),
  strict: z.boolean().optional(), relax: z.boolean().optional(), exclude_seen: z.boolean().optional(),
};