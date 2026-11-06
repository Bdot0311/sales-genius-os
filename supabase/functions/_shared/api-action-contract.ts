// Explicit routes only: never turn an API key into an arbitrary function proxy.
export const APP_API_ACTIONS: Record<string, string> = {
  "prospects/search": "fetch-external-leads",
  "companies/search": "search-companies",
  "people/lookup": "find-person",
  "email/verify": "check-lead-email",
};
export function validateAppAction(route: string, body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A JSON object is required";
  const input = body as Record<string, unknown>;
  const search = ["query", "job_title", "industry", "company_size", "country", "company", "company_domain", "companies", "seniority", "keywords", "limit", "page", "cursor", "job_titles", "industries", "countries", "seniority_levels", "exclude_titles", "exclude_industries", "exclude_keywords", "strict", "relax", "exclude_seen"];
  const fields = route === "prospects/search" ? search : route === "companies/search" ? ["query"] : route === "people/lookup" ? ["full_name", "company", "company_domain", "email", "linkedin_url"] : route === "email/verify" ? ["email"] : [];
  if (!fields.length || Object.keys(input).some(k => !fields.includes(k))) return "Unsupported input field";
  for (const [key, value] of Object.entries(input)) {
    if (["limit", "page"].includes(key)) {
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > (key === "limit" ? 200 : 1000)) return `Invalid ${key}`;
    } else if (["strict", "relax", "exclude_seen"].includes(key)) {
      if (typeof value !== "boolean") return `Invalid ${key}`;
    } else if (["keywords", "job_titles", "industries", "countries", "seniority_levels", "exclude_titles", "exclude_industries", "exclude_keywords"].includes(key)) {
      if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== "string" || !v.trim() || v.length > 500)) return `Invalid ${key}`;
    } else if (key === "companies") {
      if (!Array.isArray(value) || value.length > 20 || value.some(v => !v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(k => !["name", "domain"].includes(k)) || Object.values(v).some(v => typeof v !== "string" || !v.trim() || v.length > 500))) return "Invalid companies";
    } else if (typeof value !== "string" || !value.trim() || value.length > (key === "cursor" ? 4000 : key === "email" ? 320 : 500)) return `Invalid ${key}`;
  }
  if (route === "companies/search" && (typeof input.query !== "string" || input.query.trim().length < 2)) return "query must have at least 2 characters";
  if (route === "email/verify" && typeof input.email !== "string") return "email is required";
  if (route === "people/lookup" && !input.linkedin_url && !input.email && !(input.full_name && (input.company || input.company_domain))) return "Provide a LinkedIn URL, email, or full name and company";
  if (route === "prospects/search" && !["query", "job_title", "industry", "company", "company_domain", "job_titles", "industries", "companies"].some(k => input[k] && (!Array.isArray(input[k]) || (input[k] as unknown[]).length))) return "Provide at least one targeting filter";
  return null;
}