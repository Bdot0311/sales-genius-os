export type AgentRole = "lead_gen" | "outreach" | "replies" | "full_cycle" | "custom";

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
  {
    value: "custom",
    label: "Custom build",
    description: "You pick exactly which actions this agent is allowed to take",
  },
];

export const roleLabel = (role?: string | null) =>
  AGENT_ROLES.find((r) => r.value === role)?.label ?? "Full cycle";

export const roleDescription = (role?: string | null) =>
  AGENT_ROLES.find((r) => r.value === role)?.description ??
  AGENT_ROLES[0].description;

/**
 * Mirrors supabase/functions/_shared/agent-tool-scope.ts. Keep both in sync:
 * the edge function is what actually enforces scope, this list is the UI for
 * custom builds.
 */
export const AGENT_TOOL_GROUPS: {
  label: string;
  tools: { name: string; label: string }[];
}[] = [
  {
    label: "Leads",
    tools: [
      { name: "find_leads", label: "Source new leads" },
      { name: "search_companies", label: "Search companies" },
      { name: "enrich_leads", label: "Enrich leads" },
      { name: "research_leads", label: "Research leads" },
      { name: "score_leads", label: "Score against ICP" },
      { name: "update_lead", label: "Update lead records" },
      { name: "delete_leads", label: "Delete leads" },
    ],
  },
  {
    label: "Outreach",
    tools: [
      { name: "draft_outreach", label: "Draft emails" },
      { name: "draft_sequence", label: "Draft sequences" },
      { name: "list_drafts", label: "Review drafts" },
      { name: "list_mailboxes", label: "See connected inboxes" },
      { name: "send_drafts", label: "Send drafts" },
      { name: "send_outreach", label: "Send a one-off email" },
      { name: "schedule_drafts", label: "Schedule sends" },
      { name: "list_scheduled_emails", label: "See scheduled sends" },
      { name: "cancel_scheduled_email", label: "Cancel scheduled sends" },
      { name: "delete_drafts", label: "Delete drafts" },
      { name: "list_sequences", label: "See sequences" },
      { name: "enroll_lead_in_sequence", label: "Enroll leads in sequences" },
      { name: "list_sequence_enrollments", label: "See sequence enrollments" },
      { name: "update_enrollment", label: "Pause, resume or stop a lead's sequence" },
      { name: "update_sequence_status", label: "Activate or pause sequences" },
    ],
  },
  {
    label: "Replies",
    tools: [
      { name: "list_recent_replies", label: "Read inbound replies" },
      { name: "list_sent_emails", label: "Read sent inbox history" },
      { name: "get_email_thread", label: "Read a full email thread" },
      { name: "classify_reply", label: "Tag replies and mark read" },
      { name: "delete_inbox_threads", label: "Delete inbox threads" },
    ],
  },
  {
    label: "Targeting & campaign assets",
    tools: [
      { name: "list_icp_profiles", label: "Read ICP profiles" },
      { name: "update_icp_profile", label: "Edit ICP targeting" },
      { name: "list_campaign_briefs", label: "Read campaign briefs" },
      { name: "save_campaign_brief", label: "Create or edit campaign briefs" },
      { name: "list_email_templates", label: "Read email templates" },
      { name: "save_email_template", label: "Create or edit templates" },
      { name: "list_objections", label: "Read objection library" },
      { name: "save_objection", label: "Create or edit objection talk tracks" },
    ],
  },
  {
    label: "Deliverability & performance",
    tools: [
      { name: "list_sending_accounts", label: "See mailbox health" },
      { name: "update_sending_account", label: "Pause mailboxes or change limits" },
      { name: "list_deliverability_alerts", label: "Read deliverability alerts" },
      { name: "resolve_deliverability_alert", label: "Resolve deliverability alerts" },
      { name: "get_outbound_stats", label: "Read open and reply rates" },
    ],
  },
  {
    label: "CRM",
    tools: [
      { name: "find_lead_issues", label: "Find CRM data problems" },
      { name: "list_deals", label: "See pipeline deals" },
      { name: "create_deal", label: "Create deals" },
      { name: "update_deal", label: "Update deals" },
      { name: "delete_deal", label: "Delete deals" },
    ],
  },
  {
    label: "Autonomy",
    tools: [{ name: "run_full_agent", label: "Trigger a full agent run" }],
  },
];

export const ALL_AGENT_TOOL_NAMES = AGENT_TOOL_GROUPS.flatMap((g) =>
  g.tools.map((t) => t.name),
);

export const agentToolLabel = (name: string) =>
  AGENT_TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.name === name)?.label ?? name;
