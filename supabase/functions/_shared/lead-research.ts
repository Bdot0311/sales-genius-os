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
  /** Deterministic completeness score, stored with the brief for reuse. */
  quality?: ResearchQuality;
}

export type ResearchQualityLabel = "strong" | "usable" | "thin" | "insufficient";

export interface ResearchQuality {
  /** 0-100 completeness score. */
  score: number;
  label: ResearchQualityLabel;
  /** False when the brief is too thin to personalize safely. */
  safe_to_personalize: boolean;
  /** What's missing, in plain language. */
  gaps: string[];
}

/** Below this we refuse to claim the email is personalized. */
export const RESEARCH_BLOCK_THRESHOLD = 35;
/** Below this we still generate, but warn the user. */
export const RESEARCH_WARN_THRESHOLD = 60;

/**
 * Deterministic 0-100 research completeness score. No model involved so the
 * same brief always scores the same, and the gate can't drift.
 */
export function scoreResearchQuality(
  brief: LeadResearchBrief | null | undefined,
  sources?: string[] | null,
): ResearchQuality {
  const gaps: string[] = [];
  if (!brief) {
    return {
      score: 0,
      label: "insufficient",
      safe_to_personalize: false,
      gaps: ["No research brief for this lead yet"],
    };
  }

  const observations = (brief.observations || []).filter((o) => o?.fact);
  const sourced = observations.filter((o) => o.source);
  const hooks = (brief.hooks || []).filter(Boolean);
  const pages = (sources || []).length;

  let score = 0;
  // Concrete, quotable facts carry most of the weight.
  score += Math.min(observations.length, 3) * 15; // max 45
  if (observations.length >= 4) score += 5; // max 50
  // Facts we can point at a page are worth more than floating claims.
  score += observations.length > 0
    ? Math.round((sourced.length / observations.length) * 15)
    : 0;
  score += Math.min(hooks.length, 2) * 7; // max 14
  if (brief.what_they_do) score += 10;
  if (brief.who_they_sell_to) score += 8;
  score += Math.min(Math.max(pages - 1, 0), 3); // breadth of pages read

  if (observations.length < 3) gaps.push("Fewer than 3 concrete findings from their site");
  if (observations.length > 0 && sourced.length < observations.length) {
    gaps.push("Some findings have no source page");
  }
  if (hooks.length === 0) gaps.push("No personalization angle found");
  if (!brief.what_they_do) gaps.push("What they do is unclear");
  if (!brief.who_they_sell_to) gaps.push("Who they sell to is unclear");
  if (pages <= 1) gaps.push("Only their homepage was readable");

  // A low-confidence read can never be called strong.
  if (brief.confidence === "low") score = Math.min(score, 45);
  else if (brief.confidence === "medium") score = Math.min(score, 80);
  score = Math.max(0, Math.min(100, score));

  const label: ResearchQualityLabel =
    score >= 80 ? "strong" : score >= RESEARCH_WARN_THRESHOLD ? "usable" : score >= RESEARCH_BLOCK_THRESHOLD ? "thin" : "insufficient";

  return {
    score,
    label,
    safe_to_personalize: score >= RESEARCH_BLOCK_THRESHOLD,
    gaps,
  };
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
  const quality = brief.quality ?? scoreResearchQuality(brief, sources);
  let block = `${lines.join("\n")}\n- Research confidence: ${brief.confidence || "low"}`;
  block += `\n- Research completeness score: ${quality.score}/100 (${quality.label})`;
  if (!quality.safe_to_personalize) {
    block +=
      "\n- WARNING: this research is too thin to personalize on. Do NOT reference anything specific about this company beyond the verified lead fields below, and do NOT imply you studied their website.";
  } else if (quality.label === "thin") {
    block +=
      "\n- CAUTION: research is thin. Reference ONLY the observations listed above verbatim in meaning; make no other company-specific claims.";
  }
  return block;
}
