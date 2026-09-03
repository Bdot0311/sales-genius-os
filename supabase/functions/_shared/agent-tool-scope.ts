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
    // A custom build with no (or no recognised) tools is read-only, NOT
    // full-cycle: falling back to every tool is how a "deliverability only"
    // build ended up offering to send email.
    return [...new Set([...CORE_TOOLS, ...saved])];
  }
  return ROLE_TOOLS[(role in ROLE_TOOLS ? role : "full_cycle") as Exclude<AgentRole, "custom">];
}

export function scopeNoteFor(config: {
  role?: string | null;
  role_instructions?: string | null;
  allowed_tools?: string[] | null;
  agent_name?: string | null;
} | null | undefined): string {
  const role = (config?.role ?? "full_cycle") as AgentRole;
  let base = ROLE_SCOPE_NOTE[role] ?? ROLE_SCOPE_NOTE.full_cycle;
  if (role === "custom") {
    const tools = allowedToolsFor(config);
    base = `SCOPE: you are "${config?.agent_name ?? "a custom agent"}", a custom build. The ONLY tools you have are: ${tools.join(", ")}. Anything else — sending, scheduling, drafting, deleting, sourcing, enrolling, full runs — is outside this build. If the user asks for it, say plainly that this build is not scoped to that and they should switch agents with the selector at the top of the chat. Do not offer alternatives for the out-of-scope work and never imply you would do it if drafts, approvals or data existed.`;
  }
  const extra = (config?.role_instructions ?? "").trim();
  return extra ? `${base}\nOPERATOR INSTRUCTIONS FOR THIS BUILD: ${extra}` : base;
}

// ---------------------------------------------------------------------------
// Catalog used when a custom build is generated from a plain-English prompt.
//
// Naming a tool is not enough for the model to pick well: "build me a follow-up
// agent" used to come back with just list_recent_replies + delete_inbox_threads
// because those names *sound* like follow-up work. The description of every
// tool, plus the prerequisite closure below, is what makes the generated build
// actually able to do the job it was described for.
// ---------------------------------------------------------------------------

export const TOOL_CATALOG: Record<string, string> = {
  list_leads: "List leads already in the account, with filters.",
  get_lead: "Read one lead's full record.",
  get_agent_status: "Report this agent's own configuration and recent activity.",
  list_pending_approvals: "List actions waiting for the user's approval.",
  find_leads: "Source brand-new leads (people) from the lead network.",
  search_companies: "Search companies matching an ICP.",
  enrich_leads: "Fill missing contact/company data on existing leads.",
  score_leads: "Score existing leads against the saved ICP.",
  research_leads: "Research a lead/company for personalisation angles.",
  update_lead: "Edit a lead's fields or pipeline stage.",
  delete_leads: "Permanently delete leads (destructive).",
  draft_outreach:
    "Write email drafts for leads — first touch AND follow-ups. Required for any agent that writes email.",
  draft_sequence: "Build a multi-step email sequence.",
  list_drafts: "List existing unsent drafts.",
  list_mailboxes: "List the user's connected sending mailboxes.",
  send_drafts: "Send drafts that already exist.",
  send_outreach: "Send a one-off email, including a reply in an existing thread.",
  schedule_drafts: "Schedule drafts to send at a future time.",
  list_scheduled_emails: "List emails scheduled to send later.",
  cancel_scheduled_email: "Cancel a scheduled send.",
  delete_drafts: "Permanently delete drafts (destructive).",
  list_sequences: "List the account's sequences.",
  enroll_lead_in_sequence: "Enroll leads into a sequence.",
  resolve_approvals: "Approve or reject pending actions.",
  list_recent_replies: "Read inbound replies from connected inboxes.",
  delete_inbox_threads: "Permanently delete inbox threads (destructive).",
  run_full_agent: "Run the whole autonomous cycle end to end.",
};

/** Tools that only make sense with these other tools also granted. */
const TOOL_PREREQUISITES: Record<string, string[]> = {
  send_drafts: ["list_drafts", "draft_outreach", "list_mailboxes"],
  schedule_drafts: ["list_drafts", "draft_outreach", "list_scheduled_emails"],
  cancel_scheduled_email: ["list_scheduled_emails"],
  delete_drafts: ["list_drafts"],
  send_outreach: ["list_mailboxes"],
  draft_outreach: ["list_drafts"],
  draft_sequence: ["list_sequences"],
  enroll_lead_in_sequence: ["list_sequences"],
  delete_inbox_threads: ["list_recent_replies"],
  resolve_approvals: ["list_pending_approvals"],
  enrich_leads: ["list_leads"],
  score_leads: ["list_leads"],
  research_leads: ["list_leads"],
  update_lead: ["list_leads", "get_lead"],
  delete_leads: ["list_leads"],
  find_leads: ["list_leads"],
  run_full_agent: ["get_agent_status"],
};

export const DESTRUCTIVE_TOOLS = ["delete_leads", "delete_drafts", "delete_inbox_threads"];

/**
 * Add the prerequisites a granted tool needs to be usable. Without this a build
 * can be granted "send" with no way to write or find what to send.
 */
export function withToolPrerequisites(tools: string[]): string[] {
  const out = new Set<string>(tools.filter((t) => ALL_AGENT_TOOLS.includes(t)));
  // Two passes cover the one level of nesting the map has.
  for (let i = 0; i < 2; i++) {
    for (const t of [...out]) {
      for (const dep of TOOL_PREREQUISITES[t] ?? []) out.add(dep);
    }
  }
  return [...out];
}
