/**
 * The new-signup questionnaire: single source of truth for the options shown on
 * /onboarding, the labels used in the admin views, and the mapping from answers
 * into the user's first ICP.
 */

export const ROLE_OPTIONS = [
  "Founder / CEO",
  "Sales",
  "Marketing",
  "RevOps",
  "Agency",
  "Other",
] as const;

export const COMPANY_TYPE_OPTIONS = [
  "SaaS",
  "Agency",
  "B2B Services",
  "E-commerce",
  "Other",
] as const;

export const TEAM_SIZE_OPTIONS = ["Just me", "2-10", "11-50", "51-200", "200+"] as const;

export const GOAL_OPTIONS = [
  "Find leads",
  "Qualify prospects",
  "Personalize outreach",
  "Automate outreach",
  "Manage pipeline",
  "All of the above",
] as const;

export const TOOLING_OPTIONS = [
  "Clay",
  "Apollo",
  "LinkedIn / Sales Navigator",
  "Manual research",
  "Another tool",
  "Not doing this yet",
] as const;

export const VOLUME_OPTIONS = [
  "Under 100",
  "100-500",
  "500-2,000",
  "2,000-10,000",
  "10,000+",
] as const;

export const DISCOVERY_OPTIONS = [
  "X / Twitter",
  "LinkedIn",
  "Google search",
  "Product Hunt / a directory",
  "Reddit",
  "YouTube",
  "Word of mouth",
  "Newsletter",
  "Other",
] as const;

export const COMPANY_SIZE_OPTIONS = [
  { label: "1-10 employees", min: 1, max: 10 },
  { label: "11-50 employees", min: 11, max: 50 },
  { label: "51-200 employees", min: 51, max: 200 },
  { label: "201-1,000 employees", min: 201, max: 1000 },
  { label: "1,000+ employees", min: 1001, max: 100000 },
  { label: "Any size", min: null, max: null },
] as const;

/** Split a comma-separated free-text answer into a clean list. */
export const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

/**
 * Which dashboard quick action a user's stated goal points at, so the first
 * screen leads with what they said they came for.
 */
export const GOAL_DESTINATIONS: Record<string, string> = {
  "Find leads": "/dashboard/leads",
  "Qualify prospects": "/dashboard/icp",
  "Personalize outreach": "/dashboard/outreach",
  "Automate outreach": "/dashboard/agent",
  "Manage pipeline": "/dashboard/pipeline",
};

export type OnboardingAnswers = {
  role: string;
  company_type: string;
  team_size: string;
  goals: string[];
  current_tooling: string;
  monthly_prospect_volume: string;
  discovery_channel: string;
  discovery_channel_other: string;
  target_titles: string;
  industries: string;
  company_size: string;
  what_you_sell: string;
};

export const EMPTY_ANSWERS: OnboardingAnswers = {
  role: "",
  company_type: "",
  team_size: "",
  goals: [],
  current_tooling: "",
  monthly_prospect_volume: "",
  discovery_channel: "",
  discovery_channel_other: "",
  target_titles: "",
  industries: "",
  company_size: "",
  what_you_sell: "",
};

/** A step counts as answered only when the question it owns has a real value. */
export const isStepComplete = (step: number, a: OnboardingAnswers): boolean => {
  switch (step) {
    case 0:
      return !!a.role;
    case 1:
      return !!a.company_type;
    case 2:
      return !!a.team_size;
    case 3:
      return a.goals.length > 0;
    case 4:
      return splitList(a.target_titles).length > 0 && a.what_you_sell.trim().length >= 10;
    case 5:
      return !!a.current_tooling && !!a.monthly_prospect_volume;
    case 6:
      return (
        !!a.discovery_channel &&
        (a.discovery_channel !== "Other" || a.discovery_channel_other.trim().length > 1)
      );
    default:
      return true;
  }
};

export const TOTAL_STEPS = 7;
