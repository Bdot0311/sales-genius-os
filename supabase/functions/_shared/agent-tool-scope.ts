// Canonical mapping of agent roles -> the chat tools that role may use.
//
// Roles used to only gate autonomous runs (agent-run), so a "lead gen" agent
// would happily send email if you asked it in chat. The scope below is applied
// to the chat tool catalog too, so an agent physically cannot do work outside
// its role.

export type AgentRole = "lead_gen" | "outreach" | "replies" | "full_cycle" | "custom";

/** Always available: read-only status/context tools. */
export const CORE_TOOLS = [
  "list_leads",
  "get_lead",
  "get_agent_status",
  "list_pending_approvals",
];

export const LEAD_GEN_TOOLS = [
  "find_leads",
  "search_companies",
  "enrich_leads",
  "score_leads",
  "research_leads",
  "update_lead",
  "delete_leads",
];

export const OUTREACH_TOOLS = [
  "draft_outreach",
  "draft_sequence",
  "list_drafts",
  "list_mailboxes",
  "send_drafts",
  "send_outreach",
  "schedule_drafts",
  "list_scheduled_emails",
  "cancel_scheduled_email",
  "delete_drafts",
  "list_sequences",
  "enroll_lead_in_sequence",
  "resolve_approvals",
];

export const REPLY_TOOLS = [
  "list_recent_replies",
  "list_mailboxes",
  "send_outreach",
  "delete_inbox_threads",
  "resolve_approvals",
];

export const FULL_CYCLE_EXTRA_TOOLS = ["run_full_agent"];

/** Every tool a custom build can be granted. */
export const ALL_AGENT_TOOLS = [
  ...new Set([
    ...CORE_TOOLS,
    ...LEAD_GEN_TOOLS,
    ...OUTREACH_TOOLS,
    ...REPLY_TOOLS,
    ...FULL_CYCLE_EXTRA_TOOLS,
  ]),
];

const ROLE_TOOLS: Record<Exclude<AgentRole, "custom">, string[]> = {
  full_cycle: ALL_AGENT_TOOLS,
  lead_gen: [...CORE_TOOLS, ...LEAD_GEN_TOOLS],
  outreach: [...CORE_TOOLS, ...OUTREACH_TOOLS],
  replies: [...CORE_TOOLS, ...REPLY_TOOLS],
};

export const ROLE_SCOPE_NOTE: Record<AgentRole, string> = {
  full_cycle:
    "You run the full cycle: sourcing leads, outreach and replies are all in scope.",
  lead_gen:
    "SCOPE: you are a LEAD GENERATION agent. You may source, enrich, research, score and tidy leads. You CANNOT draft, send, schedule or delete email, and you cannot handle replies — those tools are not available to you. If the user asks for email work, say plainly that this agent is scoped to lead gen and they should switch to an outreach or full-cycle agent, and do not attempt a workaround.",
  outreach:
    "SCOPE: you are an OUTREACH agent. You may draft, review, send, schedule and cancel first-touch email and sequences for leads that already exist in the account. You CANNOT source or enrich new leads — those tools are not available to you. If the user asks for prospecting, say this agent is scoped to outreach and they should switch to a lead gen or full-cycle agent.",
  replies:
    "SCOPE: you are a REPLIES agent. You may review inbound replies and respond to them. You CANNOT source leads or run new first-touch campaigns — those tools are not available to you. If the user asks for that, say this agent is scoped to replies and they should switch agents.",
  custom:
    "SCOPE: you are a CUSTOM agent. Only the tools listed for you are available. Never claim you can do work outside them; if the user asks, say what this build is scoped to and suggest switching agents.",
};

/**
 * Resolve the tool names an agent may call.
 * Custom builds use their saved allow-list (intersected with the real catalog);
 * an empty/missing list falls back to full cycle so an agent is never useless.
 */
export function allowedToolsFor(config: {
  role?: string | null;
  allowed_tools?: string[] | null;
} | null | undefined): string[] {
  const role = (config?.role ?? "full_cycle") as AgentRole;
  if (role === "custom") {
    const saved = (config?.allowed_tools ?? []).filter((t) => ALL_AGENT_TOOLS.includes(t));
    const scoped = [...new Set([...CORE_TOOLS, ...saved])];
    return saved.length ? scoped : ALL_AGENT_TOOLS;
  }
  return ROLE_TOOLS[(role in ROLE_TOOLS ? role : "full_cycle") as Exclude<AgentRole, "custom">];
}

export function scopeNoteFor(config: {
  role?: string | null;
  role_instructions?: string | null;
} | null | undefined): string {
  const role = (config?.role ?? "full_cycle") as AgentRole;
  const base = ROLE_SCOPE_NOTE[role] ?? ROLE_SCOPE_NOTE.full_cycle;
  const extra = (config?.role_instructions ?? "").trim();
  return extra ? `${base}\nOPERATOR INSTRUCTIONS FOR THIS BUILD: ${extra}` : base;
}
