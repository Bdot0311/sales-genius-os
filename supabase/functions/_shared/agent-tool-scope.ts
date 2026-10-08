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
  // Checking copy is core, not a role.
  //
  // These were only in OUTREACH_TOOLS and REPLY_TOOLS, so a custom build got
  // them solely if whoever generated it happened to pick them. A build without
  // them does not decline an audit — it answers from the skills in its prompt,
  // which reads exactly like an audit and is not one. Asked to check an email
  // that the real checker returns one finding on, a build without the tool
  // returned six prose bullets and no rule names, no severities and no
  // evidence: an opinion wearing the costume of a check.
  //
  // Both are read-only, free, and side-effect-free. There is no coherent build
  // — deliverability, personalisation, replies — that should be denied the
  // ability to check text against the rules, so they belong to every build the
  // way list_leads does.
  "audit_email",
  "audit_sequence",
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
  // Every email-facing agent must be able to see what already went out:
  // follow-ups are written against the real first touch, not a guess.
  "list_sent_emails",
  "get_email_thread",
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
  // Reviewing copy is part of writing it. Both audits are read-only and
  // deterministic, so every email-facing agent gets them: an agent that can
  // send but cannot check what it is about to send is the arrangement that
  // produced the copy complaints in the first place.
  "audit_email",
  "audit_sequence",
];

export const REPLY_TOOLS = [
  "list_recent_replies",
  // Read the outbound side of the thread too, so a reply/follow-up quotes the
  // email that was actually sent.
  "list_sent_emails",
  "get_email_thread",
  "list_mailboxes",
  // A replies agent has to be able to WRITE the reply, not just read the thread.
  "draft_outreach",
  "list_drafts",
  "send_drafts",
  "send_outreach",
  "schedule_drafts",
  "list_scheduled_emails",
  "cancel_scheduled_email",
  "audit_email",
  // Reading the lead behind the thread, and moving its stage after a reply.
  "update_lead",
  "delete_inbox_threads",
];

/**
 * CRM upkeep: audit lead records for problems, fix contact fields, and manage
 * pipeline deals. Lets a custom "CRM monitor" build actually repair what it finds.
 */
export const CRM_TOOLS = [
  "find_lead_issues",
  "update_lead",
  "list_deals",
  "create_deal",
  "update_deal",
  "delete_deal",
];

/** ICP upkeep belongs with sourcing. */
export const ICP_TOOLS = ["list_icp_profiles", "update_icp_profile"];

/** Campaign assets and sequence control for email-facing agents. */
export const CAMPAIGN_TOOLS = [
  "list_sequence_enrollments",
  "update_enrollment",
  "update_sequence_status",
  "list_email_templates",
  "save_email_template",
  "list_objections",
  "save_objection",
  "list_campaign_briefs",
  "save_campaign_brief",
  "get_outbound_stats",
];

/** Inbox triage. */
export const INBOX_TOOLS = ["classify_reply"];

/** Mailbox health and deliverability. */
export const DELIVERABILITY_TOOLS = [
  "list_sending_accounts",
  "update_sending_account",
  "list_deliverability_alerts",
  "resolve_deliverability_alert",
  "get_outbound_stats",
];

export const FULL_CYCLE_EXTRA_TOOLS = ["run_full_agent"];

/** Every tool a custom build can be granted. */
export const ALL_AGENT_TOOLS = [
  ...new Set([
    ...CORE_TOOLS,
    ...LEAD_GEN_TOOLS,
    ...OUTREACH_TOOLS,
    ...REPLY_TOOLS,
    ...CRM_TOOLS,
    ...ICP_TOOLS,
    ...CAMPAIGN_TOOLS,
    ...INBOX_TOOLS,
    ...DELIVERABILITY_TOOLS,
    ...FULL_CYCLE_EXTRA_TOOLS,
  ]),
];

// Preset roles get the same treatment custom builds get: the closure of every
// tool the role's job actually needs. A role list that misses a prerequisite is
// an agent that says "I can't do that" for work it is supposed to own.
const ROLE_TOOLS: Record<Exclude<AgentRole, "custom">, string[]> = {
  full_cycle: ALL_AGENT_TOOLS,
  lead_gen: [...CORE_TOOLS, ...LEAD_GEN_TOOLS, ...ICP_TOOLS],
  outreach: [
    ...CORE_TOOLS,
    ...OUTREACH_TOOLS,
    // Personalisation and prioritisation of leads already in the account.
    "research_leads",
    "score_leads",
    "update_lead",
    ...CAMPAIGN_TOOLS,
    "list_icp_profiles",
    "list_sending_accounts",
    "list_deliverability_alerts",
  ],
  replies: [...CORE_TOOLS, ...REPLY_TOOLS, ...INBOX_TOOLS, "list_objections", "list_sequence_enrollments", "update_enrollment"],
};


export const ROLE_SCOPE_NOTE: Record<AgentRole, string> = {
  full_cycle:
    "You run the full cycle: sourcing leads, outreach and replies are all in scope.",
  lead_gen:
    "SCOPE: you are a LEAD GENERATION agent. You may source, enrich, research, score and tidy leads. You CANNOT draft, send, schedule or delete email, and you cannot handle replies — those tools are not available to you. If the user asks for email work, say plainly that this agent is scoped to lead gen and they should switch to an outreach or full-cycle agent, and do not attempt a workaround.",
  outreach:
    "SCOPE: you are an OUTREACH agent. You may read the inbox history of email already sent and draft, review, send, schedule and cancel first-touch email and sequences for leads that already exist in the account. You CANNOT source or enrich new leads — those tools are not available to you. If the user asks for prospecting, say this agent is scoped to outreach and they should switch to a lead gen or full-cycle agent.",
  replies:
    "SCOPE: you are a REPLIES agent. You may read the inbox history of email already sent, review inbound replies, draft and send responses in existing threads, schedule those sends and move the lead's stage. You CANNOT source or enrich new leads and you CANNOT run new first-touch campaigns — those tools are not available to you. If the user asks for that, say this agent is scoped to replies and they should switch agents.",
  custom:
    "SCOPE: you are a CUSTOM agent. Only the tools listed for you are available. Never claim you can do work outside them; if the user asks, say what this build is scoped to and suggest switching agents.",
};

/**
 * Resolve the tool names an agent may call.
 *
 * Custom builds use their saved allow-list. Preset roles use their role set, and
 * if the operator narrowed that role in the config UI (a non-empty
 * `allowed_tools` that is a subset of the role) the narrowed list wins. Either
 * way the result is closed over prerequisites, so no agent — preset or custom —
 * ends up holding a tool it cannot actually use.
 */
export function allowedToolsFor(config: {
  role?: string | null;
  allowed_tools?: string[] | null;
} | null | undefined): string[] {
  const role = (config?.role ?? "full_cycle") as AgentRole;
  const saved = (config?.allowed_tools ?? []).filter((t) => ALL_AGENT_TOOLS.includes(t));
  if (role === "custom") {
    // A custom build with no (or no recognised) tools is read-only, NOT
    // full-cycle: falling back to every tool is how a "deliverability only"
    // build ended up offering to send email.
    // Closure over prerequisites so a hand-picked build is coherent: "send
    // drafts" without draft/list tools is an agent that can't do its job.
    return withToolPrerequisites([...new Set([...CORE_TOOLS, ...saved])]);
  }
  const roleTools =
    ROLE_TOOLS[(role in ROLE_TOOLS ? role : "full_cycle") as Exclude<AgentRole, "custom">];
  // Operator narrowing of a preset role, never widening past the role.
  const narrowed = saved.filter((t) => roleTools.includes(t));
  const base = narrowed.length ? [...new Set([...CORE_TOOLS, ...narrowed])] : roleTools;
  return withToolPrerequisites(base).filter((t) => roleTools.includes(t));
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
  find_leads: "Source brand-new leads (people) from the lead network.",
  search_companies: "Search companies matching an ICP.",
  enrich_leads: "Fill missing contact/company data on existing leads.",
  score_leads: "Score existing leads against the saved ICP.",
  research_leads: "Research a lead/company for personalisation angles.",
  update_lead: "Edit a lead's contact/company fields, notes or pipeline stage. Use to fix bad CRM data.",
  find_lead_issues: "Scan lead records for CRM problems: missing or invalid emails, duplicates, missing names/companies, stale stages.",
  list_deals: "List pipeline deals with stage, value and probability.",
  create_deal: "Create a pipeline deal, optionally linked to a lead.",
  update_deal: "Edit a pipeline deal's stage, value, probability, close date or notes.",
  delete_deal: "Permanently delete a pipeline deal (destructive).",
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
  audit_email: "Check a subject and body against every mechanical cold-email rule and return the violations with fixes.",
  audit_sequence: "Check a whole sequence for repeated touches, bad spacing, and per-step rule violations.",
  enroll_lead_in_sequence: "Enroll leads into a sequence.",
  list_recent_replies: "Read inbound replies from connected inboxes.",
  list_sent_emails:
    "Read the inbox history of email already SENT: recipient, subject, body, send time, opens and whether they replied. Required for any agent that writes follow-ups or needs to know who was already contacted.",
  get_email_thread:
    "Read one full conversation: every outbound email to that person plus their inbound replies. Required before replying or following up in an existing thread.",
  delete_inbox_threads: "Permanently delete inbox threads (destructive).",
  run_full_agent: "Run the whole autonomous cycle end to end.",
  list_icp_profiles: "Read the ICP definitions.",
  update_icp_profile: "Edit ICP targeting: industries, titles, seniority, geos, size, pains, signals, exclusions.",
  list_sequence_enrollments: "See which leads are in which sequence and their next send.",
  update_enrollment: "Pause, resume or stop one lead's sequence.",
  update_sequence_status: "Activate or pause a whole sequence.",
  list_email_templates: "Read saved email templates.",
  save_email_template: "Create or edit an email template.",
  list_objections: "Read the objection and competitor library.",
  save_objection: "Create or edit an objection/competitor talk track.",
  list_campaign_briefs: "Read campaign briefs (offer, proof, forbidden claims).",
  save_campaign_brief: "Create or edit a campaign brief.",
  get_outbound_stats: "Sent, open, click and reply rates, overall and per mailbox.",
  classify_reply: "Tag an inbound reply (interested, objection, unsubscribe...) or mark it read.",
  list_sending_accounts: "See sending mailboxes: status, limits, sent today, reputation, warm-up.",
  update_sending_account: "Pause/resume a mailbox or change its daily limit.",
  list_deliverability_alerts: "Read open deliverability alerts.",
  resolve_deliverability_alert: "Mark a deliverability alert resolved.",
};

/** Tools that only make sense with these other tools also granted. */
const TOOL_PREREQUISITES: Record<string, string[]> = {
  send_drafts: ["list_drafts", "draft_outreach", "list_mailboxes"],
  schedule_drafts: ["list_drafts", "draft_outreach", "list_scheduled_emails"],
  cancel_scheduled_email: ["list_scheduled_emails"],
  delete_drafts: ["list_drafts"],
  draft_outreach: ["list_drafts", "list_sent_emails", "get_email_thread"],
  enroll_lead_in_sequence: ["list_sequences"],
  delete_inbox_threads: ["list_recent_replies"],
  // Writing email without being able to read what already went out produces
  // follow-ups that contradict the first touch.
  draft_sequence: ["list_sequences", "list_sent_emails"],
  send_outreach: ["list_mailboxes", "list_sent_emails", "get_email_thread"],
  list_recent_replies: ["list_sent_emails", "get_email_thread"],
  get_email_thread: ["list_sent_emails"],
  enrich_leads: ["list_leads"],
  score_leads: ["list_leads"],
  research_leads: ["list_leads"],
  update_lead: ["list_leads", "get_lead"],
  find_lead_issues: ["list_leads", "get_lead"],
  create_deal: ["list_deals", "list_leads"],
  update_deal: ["list_deals"],
  delete_deal: ["list_deals"],
  delete_leads: ["list_leads"],
  find_leads: ["list_leads"],
  run_full_agent: ["get_agent_status"],
  update_icp_profile: ["list_icp_profiles"],
  update_enrollment: ["list_sequence_enrollments"],
  update_sequence_status: ["list_sequences"],
  list_sequence_enrollments: ["list_sequences"],
  save_email_template: ["list_email_templates"],
  save_objection: ["list_objections"],
  save_campaign_brief: ["list_campaign_briefs"],
  classify_reply: ["list_recent_replies"],
  update_sending_account: ["list_sending_accounts"],
  resolve_deliverability_alert: ["list_deliverability_alerts"],
};

export const DESTRUCTIVE_TOOLS = ["delete_leads", "delete_drafts", "delete_inbox_threads", "delete_deal"];

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
