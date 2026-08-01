// Shared ICP helpers so every agent surface (scheduled runs and chat) targets the
// same saved ideal customer profile instead of generic defaults.

export const icpList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim()) : [];

export function bucketFromRange(min?: number | null, max?: number | null): string {
  const lo = typeof min === "number" ? min : 0;
  const hi = typeof max === "number" && max > 0 ? max : lo;
  const mid = hi || lo;
  if (!mid) return "";
  if (mid <= 10) return "1-10";
  if (mid <= 50) return "11-50";
  if (mid <= 200) return "51-200";
  if (mid <= 500) return "201-500";
  if (mid <= 1000) return "501-1000";
  return "1000+";
}

/** Renders the saved ICP profile as prompt context so the agent stays grounded. */
export function buildIcpContext(snap: Record<string, any> | null | undefined): string {
  if (!snap || typeof snap !== "object") return "";
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : "");
  const lines: string[] = [];
  if (snap.name) lines.push(`ICP profile: ${snap.name}`);
  if (list(snap.target_titles)) lines.push(`Target titles: ${list(snap.target_titles)}`);
  if (list(snap.seniority_levels)) lines.push(`Seniority: ${list(snap.seniority_levels)}`);
  if (list(snap.departments)) lines.push(`Departments: ${list(snap.departments)}`);
  if (list(snap.industries)) lines.push(`Industries: ${list(snap.industries)}`);
  if (list(snap.geographies)) lines.push(`Geographies: ${list(snap.geographies)}`);
  if (snap.company_size_min || snap.company_size_max) {
    lines.push(`Company size: ${snap.company_size_min ?? "?"}-${snap.company_size_max ?? "?"} employees`);
  }
  if (list(snap.pain_points)) lines.push(`Pain points they feel: ${list(snap.pain_points)}`);
  if (list(snap.buying_signals)) lines.push(`Buying signals: ${list(snap.buying_signals)}`);
  if (list(snap.intent_keywords)) lines.push(`Intent keywords: ${list(snap.intent_keywords)}`);
  if (list(snap.event_triggers)) lines.push(`Trigger events: ${list(snap.event_triggers)}`);
  if (list(snap.hiring_signals)) lines.push(`Hiring signals: ${list(snap.hiring_signals)}`);
  if (list(snap.tech_stack)) lines.push(`Tech stack: ${list(snap.tech_stack)}`);
  if (list(snap.competitor_tools)) lines.push(`Competitor tools: ${list(snap.competitor_tools)}`);
  if (list(snap.use_cases)) lines.push(`Use cases: ${list(snap.use_cases)}`);
  if (snap.value_proposition) lines.push(`Value proposition: ${snap.value_proposition}`);
  if (list(snap.success_metrics)) lines.push(`Success metrics: ${list(snap.success_metrics)}`);
  if (list(snap.objections)) lines.push(`Common objections: ${list(snap.objections)}`);
  if (snap.customer_examples) lines.push(`Customer examples: ${snap.customer_examples}`);
  if (snap.disqualifiers) lines.push(`Disqualifiers: ${snap.disqualifiers}`);
  const excl = [
    icpList(snap.exclude_titles).join(", "),
    icpList(snap.exclude_industries).join(", "),
    icpList(snap.exclude_keywords).join(", "),
  ]
    .filter(Boolean)
    .join(" | ");
  if (excl) lines.push(`Never target: ${excl}`);
  if (snap.notes) lines.push(`Notes: ${snap.notes}`);
  return lines.length
    ? `IDEAL CUSTOMER PROFILE (use this for targeting, relevance and personalization):\n${lines.join("\n")}`
    : "";
}

/** Builds the fetch-external-leads request body from a saved ICP snapshot. */
export function icpSearchBody(
  snap: Record<string, any> | null | undefined,
  opts: { limit: number; page?: number },
): Record<string, unknown> {
  const s = snap ?? {};
  const titles = icpList(s.target_titles);
  const industries = icpList(s.industries);
  const countries = icpList(s.geographies);
  const seniorities = icpList(s.seniority_levels);
  const keywords = icpList(s.intent_keywords);
  return {
    job_title: titles[0] || undefined,
    job_titles: titles.length ? titles : undefined,
    industry: industries[0] || undefined,
    industries: industries.length ? industries : undefined,
    country: countries[0] || undefined,
    countries: countries.length ? countries : undefined,
    company_size:
      s.company_size_bucket || bucketFromRange(s.company_size_min, s.company_size_max) || undefined,
    seniority: seniorities[0] || undefined,
    seniority_levels: seniorities.length ? seniorities : undefined,
    keywords: keywords.length ? keywords : undefined,
    exclude_titles: icpList(s.exclude_titles).length ? icpList(s.exclude_titles) : undefined,
    exclude_industries: icpList(s.exclude_industries).length ? icpList(s.exclude_industries) : undefined,
    exclude_keywords: icpList(s.exclude_keywords).length ? icpList(s.exclude_keywords) : undefined,
    limit: opts.limit,
    page: opts.page && opts.page > 1 ? opts.page : undefined,
    strict: Boolean(snap),
    exclude_seen: true,
  };
}
