import type { ICPProfile } from "@/hooks/use-icp-profiles";

interface Lead {
  job_title?: string | null;
  industry?: string | null;
  company_size?: string | null;
  employee_count?: string | null;
  technologies?: string[] | null;
}

interface ScoreBreakdown {
  title: boolean;
  industry: boolean;
  size: boolean;
  tech: boolean;
  score: number;
}

export function calculateICPMatch(lead: Lead, profiles: ICPProfile[]): ScoreBreakdown | null {
  if (!profiles.length) return null;

  let bestScore: ScoreBreakdown = { title: false, industry: false, size: false, tech: false, score: 0 };

  for (const profile of profiles) {
    let titleMatch = false;
    let industryMatch = false;
    let sizeMatch = false;
    let techMatch = false;

    // Title match
    if (lead.job_title && profile.target_titles.length > 0) {
      const lower = lead.job_title.toLowerCase();
      titleMatch = profile.target_titles.some(
        (t) => lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)
      );
    }

    // Industry match
    if (lead.industry && profile.industries.length > 0) {
      const lower = lead.industry.toLowerCase();
      industryMatch = profile.industries.some((i) => lower.includes(i.toLowerCase()));
    }

    // Size match
    const empCount = parseInt(lead.employee_count || lead.company_size || "0", 10);
    if (empCount > 0) {
      sizeMatch = empCount >= profile.company_size_min && empCount <= profile.company_size_max;
    }

    // Tech match
    if (lead.technologies && lead.technologies.length > 0 && profile.tech_stack.length > 0) {
      const leadTech = lead.technologies.map((t) => t.toLowerCase());
      techMatch = profile.tech_stack.some((t) => leadTech.includes(t.toLowerCase()));
    }

    const score = (titleMatch ? 25 : 0) + (industryMatch ? 25 : 0) + (sizeMatch ? 25 : 0) + (techMatch ? 25 : 0);

    if (score > bestScore.score) {
      bestScore = { title: titleMatch, industry: industryMatch, size: sizeMatch, tech: techMatch, score };
    }
  }

  return bestScore;
}

export function getScoreColor(score: number): string {
  if (score >= 71) return "bg-green-500/10 text-green-500 border-green-500/20";
  if (score >= 41) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
  return "bg-red-500/10 text-red-500 border-red-500/20";
}
