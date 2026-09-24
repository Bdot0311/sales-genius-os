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
