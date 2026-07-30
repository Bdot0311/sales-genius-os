// Shared types + freshness helpers for per-lead website research briefs.
// The brief lives on public.leads (research_brief / research_sources /
// research_confidence / researched_at) so one scrape serves every email
// surface: Outreach Studio, bulk send, sequences and the AI SDR agent.

export interface ResearchObservation {
  fact: string;
  source: string;
}

export interface LeadResearchBrief {
  what_they_do: string;
  who_they_sell_to: string;
  observations: ResearchObservation[];
  hooks: string[];
  avoid: string[];
  confidence: "high" | "medium" | "low";
}

export interface StoredResearch {
  research_brief: LeadResearchBrief | null;
  research_sources: string[] | null;
  research_confidence: string | null;
  researched_at: string | null;
}

/** Briefs older than this are re-scraped so the context stays current. */
export const RESEARCH_TTL_DAYS = 14;

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "live.com", "aol.com", "icloud.com", "me.com", "msn.com", "protonmail.com",
  "proton.me", "gmx.com", "yandex.com", "mail.com", "zoho.com", "qq.com",
]);

/**
 * A brief is stale when it's missing, older than the TTL, or older than the
 * lead's own last update (new signals / enrichment mean new context).
 */
export function isResearchFresh(lead: {
  research_brief?: unknown;
  researched_at?: string | null;
  updated_at?: string | null;
  enriched_at?: string | null;
}): boolean {
  if (!lead?.research_brief || !lead?.researched_at) return false;
  const researchedAt = new Date(lead.researched_at).getTime();
  if (!Number.isFinite(researchedAt)) return false;

  if (Date.now() - researchedAt > RESEARCH_TTL_DAYS * 86_400_000) return false;

  for (const ts of [lead.updated_at, lead.enriched_at]) {
    if (!ts) continue;
    const t = new Date(ts).getTime();
    // Small grace window: the research write itself bumps updated_at.
    if (Number.isFinite(t) && t - researchedAt > 60_000) return false;
  }
  return true;
}

/** Derive a company domain from an explicit website, else a business email. */
export function resolveLeadDomain(lead: {
  company_website?: string | null;
  website?: string | null;
  contact_email?: string | null;
}): string | null {
  const raw = (lead.company_website || lead.website || "").trim();
  if (raw) {
    const host = normalizeHost(raw);
    if (host) return host;
  }
  const email = (lead.contact_email || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at > 0) {
    const host = email.slice(at + 1).replace(/^www\./, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && !FREE_MAIL_DOMAINS.has(host)) return host;
  }
  return null;
}

export function normalizeHost(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw || /\s/.test(raw)) return null;
  if (!/^https?:\/\//.test(raw)) raw = `https://${raw}`;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** Render a stored brief as a prompt block for the email writer. */
export function briefToPromptBlock(
  brief: LeadResearchBrief | null | undefined,
  sources?: string[] | null,
): string {
  if (!brief) return "";
  const lines: string[] = [];
  if (brief.what_they_do) lines.push(`- What they do: ${brief.what_they_do}`);
  if (brief.who_they_sell_to) lines.push(`- Who they sell to: ${brief.who_they_sell_to}`);
  for (const o of brief.observations || []) {
    if (o?.fact) lines.push(`- Observed on their site: ${o.fact}`);
  }
  for (const h of brief.hooks || []) {
    if (h) lines.push(`- Possible angle: ${h}`);
  }
  if (brief.avoid?.length) {
    lines.push(`- Do NOT claim (unsupported by their site): ${brief.avoid.join("; ")}`);
  }
  if (sources?.length) lines.push(`- Sources read: ${sources.slice(0, 8).join(", ")}`);
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n- Research confidence: ${brief.confidence || "low"}`;
}
