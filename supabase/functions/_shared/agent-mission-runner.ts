/**
 * One pass of a standing mission.
 *
 * The queue claims the item. This function does one unit of work and either
 * asks to be released (so the next minute continues) or finishes the run.
 * It re-reads the flag, the grant, the plan and the pause state before it
 * spends anything or schedules anything.
 */

import { draftForLead, type DraftResult } from "./draft-one.ts";
import { contentHash, gatePromptHash, rubricPromptHash } from "./prompt-versions.ts";
import {
  AGENT_MISSIONS_FLAG,
  clampLeadCap,
  clampSendCap,
  effectiveMode,
  icpSearchFilters,
  planCaps,
  isProviderError,
  knownSearchLead,
  remainingLeadSlots,
  missionDraftReady,
  missionReport,
  missionSendDecision,
  pauseDecision,
  researchSourceText,
  scheduleInsideWindow,
  spendExceeded,
  zonedParts,
  zonedTimeToUtc,
  type KnownLead,
} from "./agent-mission-logic.ts";

export interface MissionStepResult {
  action: "continue" | "done" | "failed";
  error?: string;
}

interface Cursor {
  phase: "search" | "work" | "report";
  lead_ids: string[];
  index: number;
  leads: number;
  drafts: number;
  sends: number;
  waiting: { who: string; subject: string; draft_id: string | null }[];
  skipped: { reason: string; source?: string | null }[];
}

const emptyCursor = (): Cursor => ({
  phase: "search",
  lead_ids: [],
  index: 0,
  leads: 0,
  drafts: 0,
  sends: 0,
  waiting: [],
  skipped: [],
});

function asCursor(value: unknown): Cursor {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Cursor>;
  return {
    ...emptyCursor(),
    ...raw,
    lead_ids: Array.isArray(raw.lead_ids) ? raw.lead_ids.map(String) : [],
    waiting: Array.isArray(raw.waiting) ? raw.waiting : [],
    skipped: Array.isArray(raw.skipped) ? raw.skipped : [],
    phase: raw.phase === "work" || raw.phase === "report" ? raw.phase : "search",
  };
}

async function saveCursor(admin: any, runId: string, userId: string, cursor: Cursor, extra: Record<string, unknown> = {}) {
  await admin.from("agent_mission_runs").update({
    cursor,
    phase: cursor.phase,
    leads_found: cursor.leads,
    drafts_written: cursor.drafts,
    sends_queued: cursor.sends,
    ...extra,
  }).eq("id", runId).eq("user_id", userId);
}

export async function runMissionItem(deps: {
  admin: any;
  job: Record<string, any>;
  item: Record<string, any>;
  invokeFn: (name: string, body: unknown) => Promise<any>;
  scheduleDraft: (
    lead: Record<string, unknown>,
    draft: { subject: string | null; body: string | null },
    scheduledAt: string,
    alreadyScheduled: number,
  ) => Promise<{ id: string; scheduledAt: string } | null>;
  now?: Date;
  outOfTime?: () => boolean;
  draftLead?: typeof draftForLead;
  notify?: (summary: string) => Promise<void>;
  sendDigest?: (summary: string, waiting: number) => Promise<void>;
}): Promise<MissionStepResult> {
  const admin = deps.admin;
  const userId = String(deps.job.user_id);
  const payload = (deps.item.payload ?? {}) as Record<string, unknown>;
  const missionId = String(payload.mission_id ?? "");
  const runId = String(payload.run_id ?? "");
  const now = deps.now ?? new Date();
  const outOfTime = deps.outOfTime ?? (() => false);
  const writeDraft = deps.draftLead ?? draftForLead;

  if (!missionId || !runId) return { action: "failed", error: "Mission item has no run" };

  const { data: mission } = await admin.from("agent_missions").select("*").eq("id", missionId).eq("user_id", userId).maybeSingle();
  const { data: run } = await admin.from("agent_mission_runs").select("*").eq("id", runId).eq("user_id", userId).maybeSingle();
  if (!mission || !run) return { action: "failed", error: "Mission was not found in this workspace" };
  if (["completed", "failed", "skipped", "paused"].includes(String(run.status))) {
    return { action: "done" };
  }

  const { data: flag } = await admin.from("feature_flags").select("is_enabled").eq("name", AGENT_MISSIONS_FLAG).maybeSingle();
  const { data: grant } = await admin.from("agent_mission_grants").select("enabled").eq("user_id", userId).maybeSingle();
  const { data: subscription } = await admin.from("subscriptions").select("plan").eq("user_id", userId).maybeSingle();
  const plan = String(subscription?.plan ?? "free");

  const stop = async (status: string, reason: string) => {
    const cursor = asCursor(run.cursor);
    cursor.skipped.push({ reason, source: "mission guard" });
    const report = missionReport({
      missionName: String(mission.name ?? "Mission"),
      leads: cursor.leads,
      drafts: cursor.drafts,
      scheduled: cursor.sends,
      waiting: cursor.waiting,
      skipped: cursor.skipped,
      pausedReason: status === "paused" ? reason : null,
    });
    await saveCursor(admin, runId, userId, cursor, {
      status,
      skip_reason: reason,
      report,
      finished_at: now.toISOString(),
    });
    return { action: "done" as const };
  };

  if (flag?.is_enabled !== true || grant?.enabled !== true) {
    return stop("skipped", "Agent missions are off for this workspace.");
  }
  if (mission.status !== "active") {
    return stop("skipped", mission.pause_reason || "The mission is paused.");
  }

  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const local = zonedParts(now, String(mission.timezone ?? "UTC"));
  const dayStart = zonedTimeToUtc(
    Number(local.year),
    Number(local.month),
    Number(local.day),
    0,
    0,
    String(mission.timezone ?? "UTC"),
  ).toISOString();
  const negativeClasses = ["not_interested", "unsubscribe", "spam", "hostile"];
  const [sentCount, bouncedCount, replyCount, negativeCount, alertCount, usage] = await Promise.all([
    admin.from("sent_emails").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since),
    admin.from("sent_emails").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bounced").gte("created_at", since),
    admin.from("reply_analysis").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since),
    admin.from("reply_analysis").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since).in("intent_classification", negativeClasses),
    admin.from("deliverability_alerts").select("id", { count: "exact", head: true }).eq("user_id", userId).is("resolved_at", null).in("alert_type", ["bounce_rate", "blacklist", "spam", "complaint", "reputation_drop", "auth_failure"]),
    admin.from("ai_usage_events").select("cost_usd").eq("user_id", userId).gte("created_at", dayStart),
  ]);
  const spent = ((usage?.data ?? []) as { cost_usd?: number }[]).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  const guard = pauseDecision({
    sent: Number(sentCount?.count ?? 0),
    bounced: Number(bouncedCount?.count ?? 0),
    replies: Number(replyCount?.count ?? 0),
    negativeReplies: Number(negativeCount?.count ?? 0),
    openAlerts: Number(alertCount?.count ?? 0),
    bounceRate: Number(mission.bounce_pause_rate ?? 0.05),
    negativeRate: Number(mission.negative_reply_pause_rate ?? 0.15),
  });
  if (guard.pause && guard.reason) {
    await admin.from("agent_missions").update({ status: "paused", pause_reason: guard.reason }).eq("id", missionId).eq("user_id", userId);
    return stop("paused", guard.reason);
  }
  if (spendExceeded(spent, Number(mission.daily_spend_cap_usd ?? 5))) {
    return stop("skipped", "Paused this run because today's AI spend hit the mission cap. Nothing else was generated.");
  }

  const cursor = asCursor(run.cursor);
  const { data: usedByOthers, error: usedError } = await admin.rpc("agent_mission_leads_used_today", {
    p_user_id: userId,
    p_timezone: String(mission.timezone ?? "UTC"),
    p_exclude_run: runId,
  });
  if (usedError) {
    return stop("skipped", "Could not read today's lead count, so this run added no leads.");
  }
  const leadCeiling = planCaps(plan).dailyLeads;
  const slotsLeft = remainingLeadSlots({
    plan,
    missionCap: Number(mission.daily_lead_cap ?? 10),
    usedOnMission: cursor.leads,
    usedByWorkspace: Number(usedByOthers ?? 0) + cursor.leads,
  });
  const sendCap = clampSendCap(plan, Number(mission.daily_send_cap ?? 10), clampLeadCap(plan, Number(mission.daily_lead_cap ?? 10)));
  const mode = effectiveMode(String(mission.mode), plan);

  if (cursor.phase === "search") {
    if (outOfTime()) return { action: "continue" };
    const { data: icp } = mission.icp_profile_id
      ? await admin.from("icp_profiles").select("target_titles, industries, geographies, seniority_levels, exclude_titles, exclude_industries, exclude_keywords").eq("id", mission.icp_profile_id).eq("user_id", userId).maybeSingle()
      : { data: null };
    const { data: config } = await admin.from("agent_configs").select("prospecting_job_title, prospecting_industry, prospecting_country, tone, company_context, value_props").eq("id", mission.agent_config_id).eq("user_id", userId).maybeSingle();
    if (slotsLeft <= 0) {
      cursor.skipped.push({ reason: "Today's lead cap for this workspace is already used.", source: "plan cap" });
      cursor.phase = "report";
      await saveCursor(admin, runId, userId, cursor);
      return { action: "continue" };
    }
    const filters = icpSearchFilters(icp, config, String(mission.goal ?? ""), slotsLeft);
    let result: any;
    try {
      result = await deps.invokeFn("fetch-external-leads", { ...filters, job_id: deps.job.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      if (isProviderError(message)) {
        await admin.from("agent_missions").update({ status: "paused", pause_reason: `Paused after a provider error: ${message.slice(0, 180)}` }).eq("id", missionId).eq("user_id", userId);
        return stop("paused", `Paused after a provider error: ${message.slice(0, 180)}`);
      }
      cursor.skipped.push({ reason: message, source: "lead search" });
      cursor.phase = "report";
      await saveCursor(admin, runId, userId, cursor);
      return { action: "continue" };
    }
    if (result?.error) {
      const message = String(result.error);
      if (isProviderError(message)) {
        await admin.from("agent_missions").update({ status: "paused", pause_reason: `Paused after a provider error: ${message.slice(0, 180)}` }).eq("id", missionId).eq("user_id", userId);
        return stop("paused", `Paused after a provider error: ${message.slice(0, 180)}`);
      }
      cursor.skipped.push({ reason: message, source: "lead search" });
    }
    const found = Array.isArray(result?.leads) ? result.leads as Record<string, unknown>[] : [];
    let added = 0;
    for (const raw of found) {
      if (added >= slotsLeft) break;
      const known = knownSearchLead(raw);
      if ("skip" in known) {
        cursor.skipped.push({ reason: known.skip, source: "lead search" });
        continue;
      }
      if (leadCeiling >= 0) {
        const { data: reserved, error: reserveError } = await admin.rpc("claim_agent_mission_lead", {
          p_user_id: userId,
          p_run_id: runId,
          p_timezone: String(mission.timezone ?? "UTC"),
          p_ceiling: leadCeiling,
        });
        if (reserveError || reserved !== true) {
          cursor.skipped.push({
            reason: reserveError
              ? "Could not reserve a lead under today's cap, so this run stopped."
              : "Today's lead cap for this workspace is already used.",
            source: "plan cap",
          });
          break;
        }
      }
      const inserted = await insertLead(admin, userId, known.lead);
      if (leadCeiling >= 0 && (inserted === "duplicate" || !inserted)) {
        await admin.rpc("release_agent_mission_lead", { p_user_id: userId, p_run_id: runId });
      }
      if (inserted === "duplicate") {
        cursor.skipped.push({ reason: `${known.lead.contact_email} is already in the list.`, source: "lead search" });
        continue;
      }
      if (!inserted) {
        cursor.skipped.push({ reason: `Could not save ${known.lead.contact_name} at ${known.lead.company_name}.`, source: "lead search" });
        continue;
      }
      cursor.lead_ids.push(inserted);
      cursor.leads += 1;
      added += 1;
    }
    if (!found.length && !cursor.skipped.some((row) => row.source === "lead search")) {
      cursor.skipped.push({ reason: "The search returned no one who matched this ICP.", source: "lead search" });
    }
    cursor.phase = cursor.lead_ids.length ? "work" : "report";
    await saveCursor(admin, runId, userId, cursor);
    return { action: "continue" };
  }

  if (cursor.phase === "work") {
    if (cursor.index >= cursor.lead_ids.length || cursor.sends >= sendCap) {
      cursor.phase = "report";
      await saveCursor(admin, runId, userId, cursor);
      return { action: "continue" };
    }
    if (outOfTime()) return { action: "continue" };
    const leadId = cursor.lead_ids[cursor.index];
    const { data: lead } = await admin.from("leads").select("*").eq("id", leadId).eq("user_id", userId).maybeSingle();
    if (!lead) {
      cursor.skipped.push({ reason: "That lead is no longer in this workspace.", source: "lead record" });
      cursor.index += 1;
      await saveCursor(admin, runId, userId, cursor);
      return { action: "continue" };
    }
    if (!lead.research_brief) {
      const researched = await deps.invokeFn("research-lead", { leadId, lead_id: leadId, lead });
      if (researched?.error) {
        const message = String(researched.error);
        if (isProviderError(message)) {
          await admin.from("agent_missions").update({ status: "paused", pause_reason: `Paused after a provider error: ${message.slice(0, 180)}` }).eq("id", missionId).eq("user_id", userId);
          return stop("paused", `Paused after a provider error: ${message.slice(0, 180)}`);
        }
        cursor.skipped.push({ reason: message, source: "company research" });
        cursor.index += 1;
        await saveCursor(admin, runId, userId, cursor);
        return { action: "continue" };
      }
    }
    const { data: freshLead } = await admin.from("leads").select("*").eq("id", leadId).eq("user_id", userId).maybeSingle();
    const { data: config } = await admin.from("agent_configs").select("tone, company_context, value_props").eq("id", mission.agent_config_id).eq("user_id", userId).maybeSingle();
    const { data: profile } = await admin.from("profiles").select("full_name, company_name").eq("id", userId).maybeSingle();
    const { data: mailboxes } = await admin.from("sending_accounts").select("email, integration_id").eq("user_id", userId).order("created_at", { ascending: true });
    const senderEmail = String(((mailboxes ?? []) as Record<string, unknown>[]).find((row) => row.integration_id && row.email)?.email ?? "");
    const drafted: DraftResult = await writeDraft(
      { admin, userId, invokeFn: deps.invokeFn },
      freshLead ?? lead,
      {
        goal: "introduction",
        tone: String(config?.tone ?? "professional"),
        senderName: String(profile?.full_name ?? ""),
        senderEmail,
        senderCompany: String(profile?.company_name ?? config?.company_context ?? ""),
        businessDescription: [config?.company_context ?? "", ...(Array.isArray(config?.value_props) ? config.value_props : [])].filter(Boolean).join(" ").slice(0, 600),
        triggerContext: `Agent mission — ${mission.name}`,
      },
    );
    if (drafted.skipped || !drafted.draft_id || !drafted.subject || !drafted.body) {
      cursor.skipped.push({
        reason: drafted.skipped || drafted.error || "No draft was saved.",
        source: "email draft",
      });
      cursor.index += 1;
      await saveCursor(admin, runId, userId, cursor);
      return { action: "continue" };
    }
    cursor.drafts += 1;
    const sources = [
      ...researchSourceText(freshLead ?? lead),
      String(config?.company_context ?? ""),
    ].filter(Boolean);
    const hash = await contentHash(drafted.subject, drafted.body);
    const promptHash = await gatePromptHash();
    const rubricHash = await rubricPromptHash();
    const ready = missionDraftReady({
      mode,
      subject: drafted.subject,
      body: drafted.body,
      sources,
      qualityStatus: drafted.quality_status,
      qualityWeak: drafted.quality_weak,
      rubricAvailability: drafted.rubric_availability,
    });
    let allow = false;
    let reason = ready.reason;
    if (ready.ready) {
      const gateStatus = "clear";
      const { data: verdictId, error: verdictError } = await admin.rpc("record_outbound_verdict", {
        p_user_id: userId,
        p_lead_id: leadId,
        p_content_hash: hash,
        p_subject: drafted.subject,
        p_body: drafted.body,
        p_findings: [],
        p_rubric_availability: "scored",
        p_rubric: null,
        p_prompt_hash: promptHash,
        p_rubric_prompt_hash: rubricHash,
        p_gate_status: gateStatus,
        p_shadow: false,
        p_shadow_mismatch: false,
      });
      const persisted = !verdictError && typeof verdictId === "string";
      const verdict = missionSendDecision({
        mode,
        subject: drafted.subject,
        body: drafted.body,
        sources,
        qualityStatus: drafted.quality_status,
        qualityWeak: drafted.quality_weak,
        rubricAvailability: drafted.rubric_availability,
        persisted,
        stored: persisted ? {
          contentHash: hash,
          gateStatus: "clear",
          promptHash,
          rubricPromptHash: rubricHash,
          userId,
        } : null,
        contentHash: hash,
        promptHash,
        rubricPromptHash: rubricHash,
        userId,
      });
      allow = verdict.allow;
      reason = verdict.reason;
    } else if (mode === "approval" && String(mission.mode) === "autopilot") {
      reason = "This plan queues drafts for approval. Auto-send stays off.";
    }
    if (allow) {
      const when = scheduleInsideWindow({
        from: now,
        timeZone: String(mission.timezone ?? "UTC"),
        windowStart: String(mission.send_window_start ?? "08:00"),
        windowEnd: String(mission.send_window_end ?? "17:00"),
        staggerIndex: cursor.sends,
      });
      const { data: claimedSend, error: claimError } = await admin.rpc("claim_agent_mission_send", {
        p_run_id: runId,
        p_user_id: userId,
        p_lead_id: leadId,
      });
      if (claimError) {
        cursor.waiting.push({
          who: String((freshLead ?? lead).contact_name ?? "Lead"),
          subject: drafted.subject,
          draft_id: drafted.draft_id,
        });
        cursor.skipped.push({ reason: "Could not reserve this send, so the draft is waiting in Drafts.", source: "outbox" });
      } else if (claimedSend === "done") {
        cursor.sends += 1;
      } else if (claimedSend === "schedule") {
      const scheduled = await deps.scheduleDraft(freshLead ?? lead, drafted, when.toISOString(), cursor.sends);
      const emailId = scheduled && typeof scheduled === "object" && "id" in scheduled ? String(scheduled.id) : null;
      if (emailId) {
        await admin.rpc("complete_agent_mission_send", {
          p_run_id: runId,
          p_user_id: userId,
          p_lead_id: leadId,
          p_sent_email_id: emailId,
        });
        cursor.sends += 1;
        if (mission.sequence_id) await enroll(admin, userId, leadId, String(mission.sequence_id));
      } else {
        cursor.waiting.push({
          who: String((freshLead ?? lead).contact_name ?? "Lead"),
          subject: drafted.subject,
          draft_id: drafted.draft_id,
        });
        cursor.skipped.push({ reason: "The outbox did not take this draft, so it is waiting in Drafts.", source: "outbox" });
      }
      } else {
        cursor.skipped.push({ reason: "This lead could not be reserved for sending.", source: "outbox" });
      }
    } else {
      cursor.waiting.push({
        who: String((freshLead ?? lead).contact_name ?? "Lead"),
        subject: drafted.subject,
        draft_id: drafted.draft_id,
      });
      cursor.skipped.push({ reason, source: "grounding and verdict" });
    }
    cursor.index += 1;
    if (cursor.index >= cursor.lead_ids.length) cursor.phase = "report";
    await saveCursor(admin, runId, userId, cursor);
    return { action: "continue" };
  }

  const report = missionReport({
    missionName: String(mission.name ?? "Mission"),
    leads: cursor.leads,
    drafts: cursor.drafts,
    scheduled: cursor.sends,
    waiting: cursor.waiting,
    skipped: cursor.skipped,
  });
  await saveCursor(admin, runId, userId, cursor, {
    status: "completed",
    report,
    finished_at: now.toISOString(),
  });
  await deliverDigest(admin, userId, missionId, runId, report.summary, cursor.waiting.length, deps.notify, deps.sendDigest);
  return { action: "done" };
}

async function insertLead(admin: any, userId: string, lead: KnownLead): Promise<string | "duplicate" | null> {
  const { data: existing } = await admin.from("leads").select("id").eq("user_id", userId).ilike("contact_email", lead.contact_email).maybeSingle();
  if (existing?.id) return "duplicate";
  const { data, error } = await admin.from("leads").insert({
    user_id: userId,
    contact_name: lead.contact_name,
    contact_email: lead.contact_email,
    company_name: lead.company_name,
    company_website: lead.company_website,
    job_title: lead.job_title,
    industry: lead.industry,
    company_size: lead.company_size,
    linkedin_url: lead.linkedin_url,
    source: "agent_mission",
    lead_status: "discovered",
    pipeline_stage: "new",
    enrichment_status: "enriched",
  }).select("id").single();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function enroll(admin: any, userId: string, leadId: string, sequenceId: string) {
  const { data: owned } = await admin.from("email_sequences").select("id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!owned) return;
  const { data: already } = await admin.from("sequence_enrollments").select("id").eq("user_id", userId).eq("lead_id", leadId).eq("sequence_id", sequenceId).maybeSingle();
  if (already) return;
  await admin.from("sequence_enrollments").insert({
    user_id: userId,
    lead_id: leadId,
    sequence_id: sequenceId,
    status: "active",
  });
}

async function deliverDigest(
  admin: any,
  userId: string,
  missionId: string,
  runId: string,
  summary: string,
  waiting: number,
  notify?: (summary: string) => Promise<void>,
  sendDigest?: (summary: string, waiting: number) => Promise<void>,
) {
  const payload = { summary, waiting };
  const channels: { channel: "in_app" | "email"; send: () => Promise<void> }[] = [];
  if (notify) channels.push({ channel: "in_app", send: () => notify(summary) });
  if (sendDigest) channels.push({ channel: "email", send: () => sendDigest(summary, waiting) });
  for (const channel of channels) {
    const { error } = await admin.from("agent_mission_digests").insert({
      user_id: userId,
      mission_id: missionId,
      run_id: runId,
      channel: channel.channel,
      payload,
    });
    if (error) continue;
    try {
      await channel.send();
    } catch {
      // The row is the record. A failed push does not run the mission again.
    }
  }
}
