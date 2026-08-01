// Deterministic ICP validation + breadth check (Phase 5). Every result is
// derived from real rows: if there is not enough data, the field says so rather
// than inventing a claim. No model calls.

export interface ValidationLead {
  industry?: string | null;
  company_size?: string | null;
  job_title?: string | null;
  country?: string | null;
}

export interface ValidationProfile {
  industries?: string[] | null;
  company_size_min?: number | null;
  company_size_max?: number | null;
  target_titles?: string[] | null;
  seniority_levels?: string[] | null;
  geographies?: string[] | null;
}

const norm = (s: unknown) => (typeof s === "string" ? s.toLowerCase().trim() : "");
const anyHit = (needle: string, hay?: string[] | null) =>
  !!hay && hay.some((h) => { const n = norm(h); return !!n && (needle.includes(n) || n.includes(needle)); });

function sizeNum(size?: string | null): number | null {
  if (!size) return null;
  const d = String(size).replace(/,/g, "").match(/\d+/g);
  if (!d) return null;
  const n = d.map(Number);
  return n.length >= 2 ? Math.round((n[0] + n[1]) / 2) : n[0];
}

// Per-criterion pass, only for criteria the ICP actually specifies.
function criterionPass(lead: ValidationLead, p: ValidationProfile) {
  const title = norm(lead.job_title);
  const size = sizeNum(lead.company_size);
  const titleTargets = [...(p.target_titles || []), ...(p.seniority_levels || [])];
  return {
    industry: !p.industries?.length || anyHit(norm(lead.industry), p.industries),
    headcount: !(p.company_size_min != null || p.company_size_max != null) || (size != null
      && (p.company_size_min == null || size >= p.company_size_min)
      && (p.company_size_max == null || size <= p.company_size_max)),
    title: !titleTargets.length || (!!title && anyHit(title, titleTargets)),
    geography: !p.geographies?.length || anyHit(norm(lead.country), p.geographies),
  };
}

export interface ValidationResult {
  sampleSize: number;
  replySize: number;
  matchShare: number | null;        // fraction of the pool the whole ICP matches
  tooBroad: boolean;
  uselessCriteria: string[];        // specified criteria that filter out almost nothing
  replyMismatches: string[];        // where replies diverge from the stated ICP
  hasEnoughReplyData: boolean;
}

const CRIT_LABEL: Record<string, string> = {
  industry: "industry", headcount: "company size", title: "titles", geography: "geography",
};

export function validateIcp(
  profile: ValidationProfile,
  leadPool: ValidationLead[],
  repliedLeads: ValidationLead[],
): ValidationResult {
  const specified = (["industry", "headcount", "title", "geography"] as const).filter((k) =>
    k === "industry" ? profile.industries?.length
    : k === "headcount" ? (profile.company_size_min != null || profile.company_size_max != null)
    : k === "title" ? ((profile.target_titles?.length || 0) + (profile.seniority_levels?.length || 0)) > 0
    : profile.geographies?.length);

  // Breadth: needs a pool to judge against.
  let matchShare: number | null = null;
  let tooBroad = false;
  const uselessCriteria: string[] = [];
  if (leadPool.length >= 10) {
    let fullMatches = 0;
    const passCounts: Record<string, number> = { industry: 0, headcount: 0, title: 0, geography: 0 };
    for (const lead of leadPool) {
      const p = criterionPass(lead, profile);
      if (p.industry && p.headcount && p.title && p.geography) fullMatches++;
      for (const k of specified) if ((p as any)[k]) passCounts[k]++;
    }
    matchShare = fullMatches / leadPool.length;
    tooBroad = matchShare > 0.6;
    // a specified criterion that passes for >90% of the pool is doing no filtering
    for (const k of specified) {
      if (passCounts[k] / leadPool.length > 0.9) uselessCriteria.push(CRIT_LABEL[k]);
    }
  }

  // Reply validation: only claim something if there are enough replied rows.
  const hasEnoughReplyData = repliedLeads.length >= 5;
  const replyMismatches: string[] = [];
  if (hasEnoughReplyData) {
    // dominant industry among replies vs the stated ICP
    if (profile.industries?.length) {
      const outside = repliedLeads.filter((l) => !anyHit(norm(l.industry), profile.industries));
      if (outside.length / repliedLeads.length > 0.4) {
        replyMismatches.push(`${outside.length} of ${repliedLeads.length} replies came from industries not in your icp`);
      }
    }
    // replies from headcounts outside the band
    if (profile.company_size_min != null || profile.company_size_max != null) {
      const outside = repliedLeads.filter((l) => !criterionPass(l, profile).headcount);
      if (outside.length / repliedLeads.length > 0.4) {
        replyMismatches.push(`${outside.length} of ${repliedLeads.length} replies came from outside your company-size band`);
      }
    }
  }

  return {
    sampleSize: leadPool.length,
    replySize: repliedLeads.length,
    matchShare,
    tooBroad,
    uselessCriteria,
    replyMismatches,
    hasEnoughReplyData,
  };
}
