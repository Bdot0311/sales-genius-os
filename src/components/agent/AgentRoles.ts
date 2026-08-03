export type AgentRole = "lead_gen" | "outreach" | "replies" | "full_cycle";

export const AGENT_ROLES: {
  value: AgentRole;
  label: string;
  description: string;
}[] = [
  {
    value: "full_cycle",
    label: "Full cycle",
    description: "Sources leads, sends first touches and handles replies",
  },
  {
    value: "lead_gen",
    label: "Lead gen",
    description: "Only sources and enriches new leads matching your ICP",
  },
  {
    value: "outreach",
    label: "Outreach",
    description: "Only writes and sends first-touch emails",
  },
  {
    value: "replies",
    label: "Replies",
    description: "Only classifies and answers inbound replies",
  },
];

export const roleLabel = (role?: string | null) =>
  AGENT_ROLES.find((r) => r.value === role)?.label ?? "Full cycle";

export const roleDescription = (role?: string | null) =>
  AGENT_ROLES.find((r) => r.value === role)?.description ??
  AGENT_ROLES[0].description;
