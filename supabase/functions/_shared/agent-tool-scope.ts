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
  "verify_email",
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
  // Large asks (thousands to millions of leads) go to a background run the
  // owner approves in Bulk Runs; the agent creates and inspects, never approves.
  "start_bulk_run",
  "list_bulk_runs",
  "control_bulk_run",
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
  "analyse_won_deals",
  "create_deal",
  "update_deal",
  "delete_deal",
];

/**
 * ICP upkeep belongs with sourcing.
 *
 * apply_won_deal_icp is here rather than with the deal tools because what it
 * touches is the ICP: it reads the pipeline and writes the profile every lead
 * is scored against.
 */
export const ICP_TOOLS = ["list_icp_profiles", "update_icp_profile", "apply_won_deal_icp"];

/**
 * The dated evidence behind a lead's intent score.
 *
 * Signals are what "why now" is actually built on — a role posted three weeks
 * ago, a Form D filed last month, Segment added to the stack — and until now no
 * agent could read them. An agent asked why a lead was worth emailing answered
 * from the lead's standing description, which is the same sentence for every
 * visitor to that company's website and carries no timing.
 *
 * `refresh_signals` re-reads a public job board and costs nothing. It stops at
 * hiring deliberately: the news and tech detectors spend a third-party credit
 * per uncached lookup, and a tool an agent can call in a loop must not be able
 * to spend those.
 */
export const SIGNAL_TOOLS = ["list_signals", "refresh_signals"];

/** Standing missions. Read the schedule, and edit or pause it. */
export const MISSION_TOOLS = [
  "list_agent_missions",
  "save_agent_mission",
  "set_agent_mission_status",
];

/** Website visitors. Read the identified companies, and edit the site and rules. */
export const VISITOR_TOOLS = [
  "list_visitor_sites",
  "list_visitor_companies",
  "save_visitor_site",
  "save_visitor_rule",
];

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
export const INBOX_TOOLS = ["classify_reply", "list_reply_labels", "set_reply_label"];

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
    ...SIGNAL_TOOLS,
    ...VISITOR_TOOLS,
    ...MISSION_TOOLS,
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
  lead_gen: [...CORE_TOOLS, ...LEAD_GEN_TOOLS, ...ICP_TOOLS, ...SIGNAL_TOOLS, ...VISITOR_TOOLS],
  outreach: [
    ...CORE_TOOLS,
    ...OUTREACH_TOOLS,
    // Personalisation and prioritisation of leads already in the account.
    "research_leads",
    "score_leads",
    "update_lead",
    // What a first line can honestly open on.
    ...SIGNAL_TOOLS,
    ...CAMPAIGN_TOOLS,
    "list_icp_profiles",
    "list_sending_accounts",
    "list_deliverability_alerts",
    ...MISSION_TOOLS,
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


/**
 * Who needs a follow-up, and what a follow-up may say about the first touch.
 *
 * These are two different questions and they have two different sources, and
 * conflating them cost a whole run. Asked for "leads with no response", the
 * agent listed leads, read the sent history, found it empty because the
 * original campaign went out through another tool, and stopped to ask what the
 * first email had said -- as though an empty sent folder meant there was
 * nobody to follow up with.
 *
 * The saved-lead label already answered the first question. `pipeline_stage`
 * carries new / contacted / no_response / replied, the user sets it, and it
 * survives the original mail having been sent from somewhere this product
 * cannot see.
 *
 * The refusal to invent the first touch was right and stays. What changes is
 * that it is reported as one missing fact rather than as a dead end.
 */
export const FOLLOW_UP_SOURCES_NOTE =
  "FOLLOW-UPS HAVE TWO SOURCES, AND YOU USE BOTH. " +
  "Who to follow up with comes from the saved-lead label: pipeline_stage is new, contacted, no_response, replied, bounced, meeting_booked, qualified, not_interested, won or lost, and a user asking for \"leads with no response\", \"contacted but quiet\" or \"who hasn't replied\" means that field. Filter list_leads by it. " +
  "What the follow-up may SAY about the earlier email comes from the sent history (list_sent_emails, get_email_thread). " +
  "\"Has not replied\", \"no reply to the initial outreach\" and \"still quiet\" are label questions, including when an operator instruction below words it that way. A lead is unreplied because its label says so, not only because a reply is missing from an inbox this product may never have seen. " +
  "An empty sent history does NOT mean there is nothing to follow up on. It means this product cannot see the first touch, usually because it was sent from another tool. " +
  "When that happens: say so once, in one line, and keep going. Follow up on the leads the label selected, and write copy that does not claim anything specific about an email you have not read -- no subject, no offer, no date, no \"as I mentioned\". " +
  "Asking the user for a one-line summary of the original is a good offer, but make it alongside the drafts, not instead of them. Never invent what the first email said. " +
  "THE SHAPE, so this is not left to judgement: a follow-up to a lead whose first touch you cannot read is a fresh, research-grounded touch to somebody already on the list. It opens on the researched fact, it does not refer to a previous email at all, and it does not need to. That is a real follow-up and it is the one to write. " +
  "Do not refuse on the reasoning that it would contradict the original or read as generic filler. It cannot contradict an email it never mentions, and it is not filler if it is grounded in research the way every other first touch here is. Refusing to draft is the worse outcome: it leaves the lead with nothing. " +
  "Not drafting is only correct when there is no approved research for the lead, which is a different refusal with its own reason.";

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
  const tools = allowedToolsFor(config);
  // Only where it can be acted on: an agent with no drafting tool does not
  // need a rule about what a follow-up may say.
  if (tools.includes("draft_outreach")) base = `${base}\n${FOLLOW_UP_SOURCES_NOTE}`;
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
  list_reply_labels: "Read the outcome label on replies, who set it, and which ones the classifier was unsure about.",
  set_reply_label: "Correct the outcome label on a reply. Beats the classifier and survives re-analysis.",
  list_leads:
    "List leads already in the account, with filters. pipeline_stage is the visible label the user sets — new, contacted, no_response, replied and the rest — so it is how \"leads with no response\" or \"contacted but quiet\" is answered.",
  get_lead: "Read one lead's full record.",
  get_agent_status: "Report this agent's own configuration and recent activity.",
  find_leads: "Source brand-new leads (people) from the lead network.",
  search_companies: "Search companies matching an ICP.",
  verify_email: "Check one business email through the same verifier used in search and enrichment; returns an honest mailbox verdict without sending.",
  enrich_leads: "Fill missing contact/company data on existing leads.",
  score_leads: "Score existing leads against the saved ICP.",
  research_leads: "Research a lead/company for personalisation angles.",
  update_lead: "Edit a lead's contact/company fields, notes or pipeline stage. Use to fix bad CRM data.",
  find_lead_issues: "Scan lead records for CRM problems: missing or invalid emails, duplicates, missing names/companies, stale stages.",
  list_deals: "List pipeline deals with stage, value and probability.",
  analyse_won_deals:
    "Read what the closed-won deals have in common — industry, size, seniority, title, country, tech — counted from the leads behind them, with a ready search query. Reports nothing below five wins.",
  apply_won_deal_icp:
    "Write that closed-won pattern into the saved ICP, so scoring and search follow deals that closed rather than a guess made at signup. Changes how every lead scores.",
  create_deal: "Create a pipeline deal, optionally linked to a lead.",
  update_deal: "Edit a pipeline deal's stage, value, probability, close date or notes.",
  delete_deal: "Permanently delete a pipeline deal (destructive).",
  delete_leads: "Permanently delete leads (destructive).",
  draft_outreach:
    "Write email drafts for leads — first touch AND follow-ups. Required for any agent that writes email.",
  draft_sequence: "Build a multi-step email sequence.",
  start_bulk_run: "Set up a background research + drafting run for every lead matching a filter, any size; the owner approves the estimate before it starts.",
  list_bulk_runs: "See bulk runs and their real progress counts.",
  control_bulk_run: "Pause, resume or cancel a bulk run.",
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
  list_signals: "Read a lead's detected buying signals with dates and sources.",
  refresh_signals: "Re-read a lead's public job board for new hiring signals (free).",
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
  list_visitor_sites: "Read Visitor Intelligence sites, allowed domains and consent settings.",
  list_visitor_companies: "Read companies identified from website visits, and Unknown visitors with the reason.",
  save_visitor_site: "Create or edit a Visitor Intelligence site, domains, consent and exclusions.",
  save_visitor_rule: "Create or edit a visitor automation rule. It can find contacts, enrich, research, score, draft, or enroll paused. It cannot send.",
  list_agent_missions: "Read standing agent missions, their schedule and the latest run.",
  save_agent_mission: "Create or edit a standing mission: goal, schedule, send window, caps, approval or autopilot.",
  set_agent_mission_status: "Pause, resume or stop a standing mission.",
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
  start_bulk_run: ["list_bulk_runs"],
  control_bulk_run: ["list_bulk_runs"],
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
  refresh_signals: ["list_signals"],
  update_enrollment: ["list_sequence_enrollments"],
  update_sequence_status: ["list_sequences"],
  list_sequence_enrollments: ["list_sequences"],
  save_email_template: ["list_email_templates"],
  save_objection: ["list_objections"],
  save_campaign_brief: ["list_campaign_briefs"],
  save_visitor_site: ["list_visitor_sites"],
  save_visitor_rule: ["list_visitor_sites", "list_visitor_companies"],
  save_agent_mission: ["list_agent_missions"],
  set_agent_mission_status: ["list_agent_missions"],
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
