/**
 * Writing one lead's draft.
 *
 * This lived inside agent-chat's `draft_outreach` as a closure. It has to be
 * callable from two places now: the inline tool, and the queue worker that runs
 * a batch too long for a chat turn. The scope for that queue named two paths
 * for the same work as its main design risk — "the per-item worker must call
 * the same helpers the inline tools call, not a copy" — so the helper moved
 * here rather than being written twice.
 *
 * Everything the caller differs on is passed in. Nothing here reads Deno.env or
 * builds its own client, so it behaves the same whether the caller is a request
 * with a user's JWT or a worker holding the service role.
 */

import { realValue } from "./email-rules.ts";

export interface DraftLead {
  id: string;
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  [key: string]: unknown;
}

export interface DraftSettings {
  goal: string;
  tone: string;
  senderName: string;
  senderEmail: string;
  senderCompany: string;
  businessDescription: string;
  /** A redraft: what the user rejected, and why. */
  customInstruction?: string;
  variantNum?: number;
  /** What the drafts row is labelled with, so its origin is readable later. */
  triggerContext: string;
  /**
   * The conversation so far, when there is one.
   *
   * Without it a reframe is a reframe of nothing: `4ps_followup` is told "new
   * frame, new angle" about an email it cannot read, and a follow-up to
   * someone who replied cannot answer what they said. The generator was never
   * given either, so every follow-up was written blind.
   */
  thread?: LeadThread;
}

export interface DraftResult {
  lead_id: string;
  draft_id: string | null;
  company: string | null;
  contact: string | null;
  contact_email: string | null;
  subject: string | null;
  body: string | null;
  email: string | null;
  research?: unknown;
  skills_used: unknown[];
  style_warnings: unknown[];
  name_warnings: unknown[];
  name_repairs: unknown[];
  error?: string;
}

/** generate-email returns "Subject: ...\n\n<body>". Split it, or treat it all as body. */
export function splitSubject(raw: string): { subject: string; body: string } {
  const text = String(raw ?? "");
  const match = text.match(/^\s*subject\s*:\s*(.+)\s*(?:\n|$)/i);
  if (!match) return { subject: "", body: text };
  return { subject: match[1].trim(), body: text.slice(match[0].length).trim() };
}

/**
 * A subject when the model did not give one.
 *
 * Providers write "Unknown" and "N/A" into company_name rather than leaving it
 * null, and the old fallback took it literally: real prospects were queued under
 * "Quick question — Unknown". A bare "Quick question" is the honest version.
 *
 * It also has to be a subject this person has not already had. The fallback is
 * deterministic per lead, so a redraft produced the identical subject, which the
 * send path refuses as a repeat — a draft that could never be sent, generated
 * over and over.
 */
export function fallbackSubject(companyName: unknown, avoidSubjects: string[]): string {
  const usable = realValue(companyName) ?? "";
  const base = `Quick question${usable ? ` — ${usable}` : ""}`;
  const taken = new Set((avoidSubjects ?? []).map((x) => String(x).trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  const alts = [
    `following up${usable ? ` — ${usable}` : ""}`,
    `one more thought${usable ? ` for ${usable}` : ""}`,
    `different angle${usable ? ` — ${usable}` : ""}`,
  ];
  return alts.find((a) => !taken.has(a.toLowerCase())) ??
    `${base} (${new Date().toISOString().slice(0, 10)})`;
}

/**
 * Replace this lead's pending draft rather than adding another.
 *
 * Two overlapping draft calls — ["a","b"] then ["b","c"] — used to leave lead b
 * holding two drafts, and send_drafts with no arguments sends every pending
 * draft, so b received two emails. A redraft is the user asking for a better
 * version of the same email, never a second email to the same person.
 */
export async function saveDraft(
  admin: any,
  fields: { userId: string; leadId: string; subject: string; body: string; tone: string; triggerContext: string },
): Promise<string | null> {
  await admin
    .from("email_drafts")
    .delete()
    .eq("user_id", fields.userId)
    .eq("lead_id", fields.leadId);

  const { data } = await admin
    .from("email_drafts")
    .insert({
      user_id: fields.userId,
      lead_id: fields.leadId,
      subject: fields.subject,
      body: fields.body,
      tone: fields.tone,
      trigger_context: fields.triggerContext,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

/**
 * Which of these leads already hold a saved draft.
 *
 * Nothing in the system knew this, and that is the whole reason a request to
 * draft eighty-two leads produced twenty drafts however many times it was run.
 * list_leads orders by created_at and has no idea what has been written, so
 * every pass handed the drafter the same head of the same list; saveDraft
 * below replaces a lead's draft rather than adding one, so each pass overwrote
 * the previous pass's work and the folder never grew past a single batch.
 *
 * Read in chunks because a batch here is the whole account, and a PostgREST
 * `in` list goes into the URL.
 */
export async function leadsWithDrafts(
  admin: any,
  userId: string,
  leadIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (leadIds.length === 0) return out;
  for (let i = 0; i < leadIds.length; i += 100) {
    const { data } = await admin
      .from("email_drafts")
      .select("lead_id")
      .eq("user_id", userId)
      .in("lead_id", leadIds.slice(i, i + 100));
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const id = String(row.lead_id ?? "");
      if (id) out.add(id);
    }
  }
  return out;
}

/**
 * Where this person is in the conversation.
 *
 * Three states, because three different emails are owed:
 *
 *   never_contacted  a first touch — name a problem their world has and ask
 *                    whether it is one of theirs
 *   awaiting_reply   a reframe — the same point in different words, because
 *                    the words already used did not land
 *   replied          an answer — a follow-up about what they actually said
 *
 * A scheduled or failed row is not contact: nothing reached the person.
 */
export type ContactState = "never_contacted" | "awaiting_reply" | "replied";

/** The thread so far, as much of it as matters for writing the next email. */
export interface LeadThread {
  state: ContactState;
  /** The last thing actually sent to them. */
  lastSubject?: string;
  lastBody?: string;
  lastSentAt?: string;
  /** What they wrote back. Prospect-authored: fence it before it reaches a prompt. */
  replyContent?: string;
  replyIntent?: string;
}

/** Statuses that mean the message left. `scheduled` and `failed` do not. */
const DELIVERED_STATUSES = ["sent", "delivered", "opened", "clicked", "replied", "bounced"];

/**
 * Read the thread state for a batch of leads in two queries rather than two
 * per lead. Leads with no row are simply absent from the map, which the caller
 * reads as never_contacted.
 */
export async function leadThreads(
  admin: any,
  userId: string,
  leadIds: string[],
): Promise<Map<string, LeadThread>> {
  const out = new Map<string, LeadThread>();
  if (leadIds.length === 0) return out;

  const sentIdToLead = new Map<string, string>();

  for (let i = 0; i < leadIds.length; i += 100) {
    const { data } = await admin
      .from("sent_emails")
      .select("id, lead_id, subject, body_text, sent_at, replied_at, status")
      .eq("user_id", userId)
      .in("lead_id", leadIds.slice(i, i + 100))
      .in("status", DELIVERED_STATUSES)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false });

    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const leadId = String(row.lead_id ?? "");
      if (!leadId) continue;
      const replied = Boolean(row.replied_at);
      const existing = out.get(leadId);

      if (!existing) {
        // Rows arrive newest first, so the first one seen is the latest email.
        out.set(leadId, {
          state: replied ? "replied" : "awaiting_reply",
          lastSubject: String(row.subject ?? "") || undefined,
          lastBody: String(row.body_text ?? "") || undefined,
          lastSentAt: String(row.sent_at ?? "") || undefined,
        });
      } else if (replied && existing.state !== "replied") {
        // A reply anywhere in the thread outranks silence on the newest email:
        // someone who answered the first email and ignored the second has
        // still spoken, and the next message owes them an answer.
        existing.state = "replied";
      }

      if (replied) sentIdToLead.set(String(row.id ?? ""), leadId);
    }
  }

  const repliedIds = [...sentIdToLead.keys()].filter(Boolean);
  for (let i = 0; i < repliedIds.length; i += 100) {
    const { data } = await admin
      .from("reply_analysis")
      .select("sent_email_id, reply_content, intent_classification")
      .eq("user_id", userId)
      .in("sent_email_id", repliedIds.slice(i, i + 100));

    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const leadId = sentIdToLead.get(String(row.sent_email_id ?? ""));
      const thread = leadId ? out.get(leadId) : undefined;
      if (!thread || thread.replyContent) continue;
      thread.replyContent = String(row.reply_content ?? "").trim() || undefined;
      thread.replyIntent = String(row.intent_classification ?? "").trim() || undefined;
    }
  }

  return out;
}

/**
 * The leads that were emailed and never answered.
 *
 * "Follow up with everyone who hasn't replied" had no way to be asked. The
 * lead filters could express a pipeline stage, an ICP score or a missing
 * email, and nothing about whether a person had actually gone quiet — so the
 * closest available filter was "has no draft yet", which is every lead in the
 * account that has not been written to, contacted or not. Asked for 86, the
 * agent got 105 and the turn dutifully finished all of them.
 *
 * Two conditions, and both matter:
 *
 *   The quiet period. Silence is a claim about elapsed time, not a null
 *   column. Without it, mail sent this morning counts as unanswered and the
 *   follow-up goes out the same day.
 *
 *   No reply anywhere in the thread. A reply to the first email and silence on
 *   the second is not an unanswered lead; that person is mid-conversation.
 */
export async function leadsAwaitingReply(
  admin: any,
  userId: string,
  quietForDays = 3,
): Promise<Set<string>> {
  const quiet = Math.min(Math.max(quietForDays, 1), 60);
  const cutoff = new Date(Date.now() - quiet * 86_400_000).toISOString();

  const { data } = await admin
    .from("sent_emails")
    .select("lead_id, sent_at, replied_at")
    .eq("user_id", userId)
    .in("status", DELIVERED_STATUSES)
    .not("sent_at", "is", null)
    .not("lead_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(20000);

  const quietLeads = new Set<string>();
  const answered = new Set<string>();

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.lead_id ?? "");
    if (!id) continue;
    if (row.replied_at) {
      answered.add(id);
      continue;
    }
    if (String(row.sent_at ?? "") <= cutoff) quietLeads.add(id);
  }

  for (const id of answered) quietLeads.delete(id);
  return quietLeads;
}

/**
 * Goals that only make sense to someone who has already heard from you.
 *
 * `4ps_followup` is the clearest case: its opening line is fixed text, "I
 * reached out the other day but likely didn't do the best job explaining how
 * we help." Sent to a stranger that is not a clumsy email, it is a false
 * statement about something that never happened. `4ps_elusive_followup` opens
 * by referring back to a question email 1 asked, and `follow-up` is written to
 * deliver a payoff a first email withheld.
 */
export const FOLLOW_UP_GOALS = new Set([
  "follow-up",
  "4ps_followup",
  "4ps_elusive_followup",
]);

/** Follow-ups that reframe rather than escalate. Right for silence. */
const REFRAME_GOALS = new Set(["4ps_followup", "4ps_elusive_followup"]);

/**
 * The goal for one lead, given what the batch asked for.
 *
 * draft_outreach takes a single goal for every lead in the call and the queue
 * stores a single goal for the whole job, so one word decided the shape of
 * every email in a batch. Ask for follow-ups over a set that turns out to hold
 * people who were never contacted, and each of them gets an email referring to
 * a message that was never sent.
 *
 * Two corrections, both narrow:
 *
 *   never_contacted + a follow-up goal -> introduction. A follow-up to someone
 *   who has heard nothing is not a clumsy email, it is a false one.
 *
 *   awaiting_reply + `follow-up` -> `4ps_followup`. `follow-up` is written to
 *   sell: "deliver the payoff it held back, back it with proof". Silence is
 *   not interest, and answering it with a pitch escalates to someone who has
 *   not engaged. The 4P's follow-up makes the same point in different words,
 *   which is what silence actually calls for.
 *
 * Everything else is left alone. A fresh introduction to someone already
 * emailed is a judgement call that can be right, and once someone has replied
 * the goal the caller chose is the caller's to choose.
 */
export function goalForLead(batchGoal: string, state: ContactState): string {
  const goal = String(batchGoal ?? "").trim().toLowerCase() || "introduction";

  if (state === "never_contacted") {
    return FOLLOW_UP_GOALS.has(goal) ? "introduction" : goal;
  }
  if (state === "awaiting_reply" && goal === "follow-up") {
    return "4ps_followup";
  }
  return goal;
}

/** True when this goal writes to someone who has not answered. */
export function isReframeGoal(goal: string): boolean {
  return REFRAME_GOALS.has(String(goal ?? "").trim().toLowerCase());
}

/**
 * The subjects this person has already received, so a redraft does not land on
 * one of them and get refused at the send step after being written and shown.
 */
export async function sentSubjectsFor(
  admin: any,
  userId: string,
  leadIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (leadIds.length === 0) return map;
  const { data } = await admin
    .from("sent_emails")
    .select("lead_id, subject")
    .eq("user_id", userId)
    .in("lead_id", leadIds)
    .in("status", ["sent", "delivered", "opened", "clicked", "replied"])
    .order("sent_at", { ascending: false })
    .limit(200);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = String(row.lead_id ?? "");
    const subject = String(row.subject ?? "").trim();
    if (!key || !subject) continue;
    const list = map.get(key) ?? [];
    if (!list.includes(subject) && list.length < 10) list.push(subject);
    map.set(key, list);
  }
  return map;
}

/** One lead in, one saved draft out. */
export async function draftForLead(
  deps: { admin: any; userId: string; invokeFn: (name: string, body: unknown) => Promise<any> },
  lead: DraftLead,
  settings: DraftSettings,
  avoidSubjects: string[] = [],
): Promise<DraftResult> {
  const payload = {
    lead,
    goal: settings.goal,
    tone: settings.tone,
    senderName: settings.senderName,
    senderEmail: settings.senderEmail,
    senderCompany: settings.senderCompany,
    businessDescription: settings.businessDescription,
    avoidSubjects,
    ...(settings.customInstruction
      ? { customInstruction: settings.customInstruction, variantNum: settings.variantNum ?? 1 }
      : {}),
    // Only sent when there is something to say. An absent thread and an empty
    // one have to look different to the generator, or a first touch would be
    // told it is continuing a conversation that never started.
    ...(settings.thread && settings.thread.state !== "never_contacted"
      ? { thread: settings.thread }
      : {}),
  };

  // generate-email runs (or reuses) the per-lead website research brief
  // internally, so drafts are grounded in real findings.
  let r = await deps.invokeFn("generate-email", payload);
  // one retry on upstream rate limiting
  if (!r?.email && /rate limit/i.test(JSON.stringify(r?.error ?? ""))) {
    await new Promise((res) => setTimeout(res, 2500));
    r = await deps.invokeFn("generate-email", payload);
  }

  const raw: string = typeof r?.email === "string" ? r.email : "";
  const split = splitSubject(raw);
  const subject = split.subject || fallbackSubject(lead.company_name, avoidSubjects);

  let draftId: string | null = null;
  if (raw) {
    draftId = await saveDraft(deps.admin, {
      userId: deps.userId,
      leadId: lead.id,
      subject,
      body: split.body,
      tone: settings.tone,
      triggerContext: settings.triggerContext,
    });
  }

  return {
    lead_id: lead.id,
    draft_id: draftId,
    company: (lead.company_name as string) ?? null,
    contact: (lead.contact_name as string) ?? null,
    contact_email: (lead.contact_email as string) ?? null,
    subject: raw ? subject : null,
    body: raw ? split.body : null,
    email: r?.email ?? null,
    research: r?.research ?? null,
    skills_used: Array.isArray(r?.skills_used) ? r.skills_used : [],
    style_warnings: Array.isArray(r?.style_warnings) ? r.style_warnings : [],
    name_warnings: Array.isArray(r?.name_warnings) ? r.name_warnings : [],
    name_repairs: Array.isArray(r?.name_repairs) ? r.name_repairs : [],
    error: r?.email ? undefined : (r?.error ?? "Draft failed"),
  };
}
