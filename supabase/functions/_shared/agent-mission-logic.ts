/**
 * Standing mission decisions that do not touch the database.
 *
 * The cron claim, the queue worker and the Missions screen all ask the same
 * questions: when is this due, may it send, and should it stop. Keeping the
 * answers here means a test can lock them without booting Postgres or Deno.
 */

import { checkGrounded } from "./grounding.ts";
import { evaluateSend, type StoredVerdict } from "./outbound-verdict.ts";
import type { StepEvent } from "./agent-step-present.ts";

export const AGENT_MISSIONS_FLAG = "agentMissions";

/** Matches the AI SDR caps already published in plan-features. Not a new price. */
export const PLAN_AGENT_CAPS: Record<string, { dailyLeads: number; autoSend: boolean }> = {
  free: { dailyLeads: 25, autoSend: false },
  starter: { dailyLeads: 100, autoSend: true },
  growth: { dailyLeads: 300, autoSend: true },
  pro: { dailyLeads: 750, autoSend: true },
  agency: { dailyLeads: -1, autoSend: true },
  elite: { dailyLeads: -1, autoSend: true },
};

const MIN_SENT_FOR_BOUNCE = 20;
const MIN_REPLIES_FOR_TONE = 8;
const DEFAULT_BOUNCE_RATE = 0.05;
const DEFAULT_NEGATIVE_RATE = 0.15;

const PROVIDER_ERROR =
  /rate limit|rate-limit|429|502|503|504|timeout|timed out|temporarily unavailable|overloaded|provider|upstream|fetch failed/i;

export function planCaps(plan: string | null | undefined): { dailyLeads: number; autoSend: boolean } {
  const key = String(plan ?? "free").toLowerCase();
  return PLAN_AGENT_CAPS[key] ?? PLAN_AGENT_CAPS.free;
}

export function clampLeadCap(plan: string | null | undefined, requested: number): number {
  const ask = Math.max(1, Math.min(500, Math.round(Number(requested)) || 1));
  const cap = planCaps(plan).dailyLeads;
  if (cap < 0) return ask;
  return Math.min(ask, cap);
}

export type MissionActor = "owner" | "admin" | "member" | "none";

/** Members can edit. Only the owner or an admin can turn on unattended sending. */
export function canEditMission(actor: MissionActor): boolean {
  return actor === "owner" || actor === "admin" || actor === "member";
}

export function canAutopilotMission(actor: MissionActor): boolean {
  return actor === "owner" || actor === "admin";
}

/** The plan cap is shared by every mission. A mission cap can only be lower. */
export function remainingLeadSlots(input: {
  plan: string | null | undefined;
  missionCap: number;
  usedOnMission: number;
  usedByWorkspace: number;
}): number {
  const missionLeft = Math.max(0, clampLeadCap(input.plan, input.missionCap) - Math.max(0, input.usedOnMission));
  const ceiling = planCaps(input.plan).dailyLeads;
  if (ceiling < 0) return missionLeft;
  return Math.min(missionLeft, Math.max(0, ceiling - Math.max(0, input.usedByWorkspace)));
}

export function clampSendCap(plan: string | null | undefined, requested: number, leadCap: number): number {
  const ask = Math.max(1, Math.min(500, Math.round(Number(requested)) || 1));
  return Math.min(ask, leadCap, clampLeadCap(plan, 500));
}

export function clampSpendCap(requested: number): number {
  const n = Number(requested);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(25, Math.round(n * 100) / 100));
}

/** Autopilot on a plan that cannot auto-send becomes approval. The drafts still get written. */
export function effectiveMode(mode: string, plan: string | null | undefined): "autopilot" | "approval" {
  return mode === "autopilot" && planCaps(plan).autoSend ? "autopilot" : "approval";
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  const zone = String(timeZone ?? "").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return "UTC";
  }
}

export function zonedParts(date: Date, timeZone: string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
} {
  const zone = safeTimeZone(timeZone);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute,
    second: parts.second,
    weekday: parts.weekday,
  };
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function weekdayIndex(date: Date, timeZone: string): number {
  return WEEKDAY_INDEX[zonedParts(date, timeZone).weekday] ?? 0;
}

export function windowKey(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** A wall-clock time in `timeZone`, as an absolute instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const zone = safeTimeZone(timeZone);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = zoneOffsetMinutes(guess, zone);
  const adjusted = new Date(guess.getTime() - offset * 60_000);
  const drift = zoneOffsetMinutes(adjusted, zone) - offset;
  return drift === 0 ? adjusted : new Date(adjusted.getTime() - drift * 60_000);
}

export function normalizeDays(days: number[] | null | undefined): number[] {
  const clean = [...new Set((days ?? []).map((day) => Math.round(Number(day))).filter((day) => day >= 0 && day <= 6))];
  return clean.length ? clean.sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

export function nextRunAt(input: {
  from: Date;
  timeZone: string;
  daysOfWeek: number[];
  hour: number;
  minute: number;
}): Date {
  const zone = safeTimeZone(input.timeZone);
  const days = new Set(normalizeDays(input.daysOfWeek));
  const hour = Math.max(0, Math.min(23, Math.round(input.hour) || 0));
  const minute = Math.max(0, Math.min(59, Math.round(input.minute) || 0));
  const start = zonedParts(input.from, zone);
  let year = Number(start.year);
  let month = Number(start.month);
  let day = Number(start.day);
  for (let i = 0; i < 21; i++) {
    const candidate = zonedTimeToUtc(year, month, day, hour, minute, zone);
    if (days.has(weekdayIndex(candidate, zone)) && candidate.getTime() > input.from.getTime()) {
      return candidate;
    }
    const next = new Date(Date.UTC(year, month - 1, day) + 86_400_000);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return new Date(input.from.getTime() + 86_400_000);
}

export function parseClock(value: string | null | undefined, fallback: string): string {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clockMinutes(value: string): number {
  const [hour, minute] = parseClock(value, "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

export function inSendWindow(date: Date, timeZone: string, windowStart: string, windowEnd: string): boolean {
  const parts = zonedParts(date, timeZone);
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  const start = clockMinutes(windowStart);
  const end = clockMinutes(windowEnd);
  if (end <= start) return false;
  return now >= start && now < end;
}

/** Next instant the window is open, including now when it already is. */
export function nextWindowOpen(from: Date, timeZone: string, windowStart: string, windowEnd: string): Date {
  if (inSendWindow(from, timeZone, windowStart, windowEnd)) return from;
  const zone = safeTimeZone(timeZone);
  const [hour, minute] = parseClock(windowStart, "08:00").split(":").map(Number);
  const start = zonedParts(from, zone);
  let year = Number(start.year);
  let month = Number(start.month);
  let day = Number(start.day);
  for (let i = 0; i < 4; i++) {
    const candidate = zonedTimeToUtc(year, month, day, hour, minute, zone);
    if (candidate.getTime() > from.getTime()) return candidate;
    const next = new Date(Date.UTC(year, month - 1, day) + 86_400_000);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return new Date(from.getTime() + 86_400_000);
}

/**
 * A send time inside the mailbox window.
 *
 * The existing outbox stagger is two minutes. This keeps that gap and moves
 * the whole chain to the next open window when the clock is closed, so a
 * mission that finishes at 2am does not mail anyone at 2am.
 */
export function scheduleInsideWindow(input: {
  from: Date;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  staggerIndex: number;
}): Date {
  const stagger = Math.max(0, input.staggerIndex) * 120_000;
  const open = nextWindowOpen(input.from, input.timeZone, input.windowStart, input.windowEnd);
  const base = open.getTime() === input.from.getTime()
    ? input.from.getTime() + 60_000
    : open.getTime();
  let candidate = new Date(base + stagger);
  if (inSendWindow(candidate, input.timeZone, input.windowStart, input.windowEnd)) return candidate;
  const rolled = nextWindowOpen(new Date(candidate.getTime() + 60_000), input.timeZone, input.windowStart, input.windowEnd);
  return new Date(rolled.getTime() + stagger);
}

export function isProviderError(message: string | null | undefined): boolean {
  return PROVIDER_ERROR.test(String(message ?? ""));
}

export function pauseDecision(input: {
  sent: number;
  bounced: number;
  replies: number;
  negativeReplies: number;
  openAlerts: number;
  providerError?: string | null;
  bounceRate?: number;
  negativeRate?: number;
}): { pause: boolean; reason: string | null } {
  if (input.providerError && isProviderError(input.providerError)) {
    return { pause: true, reason: `Paused after a provider error: ${input.providerError.slice(0, 180)}` };
  }
  if (input.openAlerts > 0) {
    return { pause: true, reason: "Paused because a deliverability alert is still open." };
  }
  const bounceRate = input.bounceRate ?? DEFAULT_BOUNCE_RATE;
  if (input.sent >= MIN_SENT_FOR_BOUNCE && input.bounced / input.sent >= bounceRate) {
    const pct = Math.round((input.bounced / input.sent) * 1000) / 10;
    return { pause: true, reason: `Paused because ${pct}% of recent sends bounced.` };
  }
  const negativeRate = input.negativeRate ?? DEFAULT_NEGATIVE_RATE;
  if (input.replies >= MIN_REPLIES_FOR_TONE && input.negativeReplies / input.replies >= negativeRate) {
    const pct = Math.round((input.negativeReplies / input.replies) * 1000) / 10;
    return { pause: true, reason: `Paused because ${pct}% of recent replies were negative or spam.` };
  }
  return { pause: false, reason: null };
}

const NEGATIVE = new Set(["not_interested", "unsubscribe", "spam", "hostile"]);

export function isNegativeReply(classification: string | null | undefined): boolean {
  return NEGATIVE.has(String(classification ?? "").trim().toLowerCase());
}

export function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 20);
}

export function icpSearchFilters(
  icp: Record<string, unknown> | null,
  config: Record<string, unknown> | null,
  goal: string,
  limit: number,
): Record<string, unknown> {
  const titles = asStrings(icp?.target_titles);
  const industries = asStrings(icp?.industries);
  const countries = asStrings(icp?.geographies);
  const seniority = asStrings(icp?.seniority_levels);
  if (!titles.length && config?.prospecting_job_title) titles.push(String(config.prospecting_job_title));
  if (!industries.length && config?.prospecting_industry) industries.push(String(config.prospecting_industry));
  if (!countries.length && config?.prospecting_country) countries.push(String(config.prospecting_country));
  return {
    query: String(goal ?? "").trim().slice(0, 240),
    ...(titles.length ? { job_titles: titles } : {}),
    ...(industries.length ? { industries } : {}),
    ...(countries.length ? { countries } : {}),
    ...(seniority.length ? { seniority_levels: seniority } : {}),
    ...(asStrings(icp?.exclude_titles).length ? { exclude_titles: asStrings(icp?.exclude_titles) } : {}),
    ...(asStrings(icp?.exclude_industries).length ? { exclude_industries: asStrings(icp?.exclude_industries) } : {}),
    ...(asStrings(icp?.exclude_keywords).length ? { exclude_keywords: asStrings(icp?.exclude_keywords) } : {}),
    strict: true,
    exclude_seen: true,
    relax: false,
    limit: Math.max(1, Math.min(25, limit)),
  };
}

export interface KnownLead {
  contact_name: string;
  contact_email: string;
  company_name: string;
  company_website: string | null;
  job_title: string | null;
  industry: string | null;
  linkedin_url: string | null;
  company_size: string | null;
}

/** A search row we are willing to save. Missing name, company or email is a skip, not a guess. */
export function knownSearchLead(raw: Record<string, unknown>): { lead: KnownLead } | { skip: string } {
  const email = String(raw.business_email || raw.email || raw.contact_email || "").trim();
  const name = String(raw.contact_name || raw.full_name || raw.name || "").trim();
  const company = String(raw.company_name || raw.company || "").trim();
  if (!email.includes("@")) return { skip: "No email on the search result. Nothing was guessed." };
  if (!name || /^unknown$/i.test(name)) return { skip: "No contact name on the search result. Nothing was guessed." };
  if (!company || /^unknown$/i.test(company)) return { skip: "No company on the search result. Nothing was guessed." };
  return {
    lead: {
      contact_name: name.slice(0, 200),
      contact_email: email.slice(0, 320),
      company_name: company.slice(0, 200),
      company_website: String(raw.company_domain || raw.company_website || "").trim() || null,
      job_title: String(raw.job_title || "").trim() || null,
      industry: String(raw.industry || "").trim() || null,
      linkedin_url: String(raw.linkedin_url || "").trim() || null,
      company_size: String(raw.company_size || "").trim() || null,
    },
  };
}

export function researchSourceText(lead: Record<string, unknown> | null | undefined): string[] {
  if (!lead) return [];
  const sources: string[] = [];
  for (const key of ["company_name", "contact_name", "job_title", "industry", "company_description", "company_website"]) {
    const value = String(lead[key] ?? "").trim();
    if (value) sources.push(value);
  }
  const brief = lead.research_brief;
  if (typeof brief === "string" && brief.trim()) sources.push(brief);
  else if (brief && typeof brief === "object") sources.push(JSON.stringify(brief));
  if (Array.isArray(lead.research_sources)) {
    for (const source of lead.research_sources) {
      const text = String(source ?? "").trim();
      if (text) sources.push(text);
    }
  }
  return sources;
}

export interface MissionSendInput {
  mode: "autopilot" | "approval";
  subject: string;
  body: string;
  sources: string[];
  qualityStatus?: string | null;
  qualityWeak?: boolean;
  rubricAvailability?: string | null;
  persisted: boolean;
  stored: StoredVerdict | null;
  contentHash: string;
  promptHash: string;
  rubricPromptHash: string;
  userId: string;
}

/** Grounding and the quality gate, before a verdict row exists. */
export function missionDraftReady(input: Pick<MissionSendInput, "mode" | "subject" | "body" | "sources" | "qualityStatus" | "qualityWeak"> & { rubricAvailability?: string | null }): { ready: boolean; reason: string } {
  if (input.mode !== "autopilot") {
    return { ready: false, reason: "Approval mode. The draft is waiting for you." };
  }
  const grounding = checkGrounded(`${input.subject}\n${input.body}`, input.sources);
  if (!grounding.grounded) {
    const novel = grounding.novel.slice(0, 6).join(", ");
    return {
      ready: false,
      reason: novel
        ? `Held. The draft added ${novel}, which the research does not support.`
        : "Held. The draft is not grounded in the research on this lead.",
    };
  }
  if (input.qualityStatus !== "clear" || input.qualityWeak) {
    return { ready: false, reason: "Held. The quality check did not clear this draft." };
  }
  if (input.rubricAvailability !== "scored") {
    return { ready: false, reason: "Held. The reply rubric did not return a score, so this draft was not scheduled." };
  }
  return { ready: true, reason: "Grounded and clear." };
}

/**
 * Autopilot may schedule only when grounding, the quality gate and a current
 * verdict all agree. Approval never schedules. A miss stays a draft with a reason.
 */
export function missionSendDecision(input: MissionSendInput): { allow: boolean; reason: string } {
  const ready = missionDraftReady(input);
  if (!ready.ready) return { allow: false, reason: ready.reason };
  const decision = evaluateSend({
    liveBlocked: false,
    contentHash: input.contentHash,
    promptHash: input.promptHash,
    rubricPromptHash: input.rubricPromptHash,
    stored: input.stored,
    persisted: input.persisted,
    canary: true,
    userId: input.userId,
  });
  if (!decision.allow) {
    return { allow: false, reason: "Held. This draft has no current clear verdict, so it was not scheduled." };
  }
  return { allow: true, reason: "Scheduled inside the send window." };
}

export interface MissionReportInput {
  missionName: string;
  leads: number;
  drafts: number;
  scheduled: number;
  waiting: { who: string; subject: string }[];
  skipped: { reason: string; source?: string | null }[];
  pausedReason?: string | null;
}

export function missionReport(input: MissionReportInput): { summary: string; steps: StepEvent[] } {
  const steps: StepEvent[] = [];
  steps.push({
    name: "mission_leads",
    label: input.leads === 1 ? "Found 1 new lead" : `Found ${input.leads} new leads`,
    status: "ok",
    detail: "Saved only rows that already had a name, a company and an email.",
  });
  steps.push({
    name: "mission_drafts",
    label: input.drafts === 1 ? "Wrote 1 draft" : `Wrote ${input.drafts} drafts`,
    status: "ok",
  });
  if (input.scheduled > 0) {
    steps.push({
      name: "mission_scheduled",
      label: input.scheduled === 1 ? "Queued 1 email to send" : `Queued ${input.scheduled} emails to send`,
      status: "ok",
      detail: "They sit in the outbox. The usual sender still applies every cap.",
    });
  }
  if (input.waiting.length) {
    steps.push({
      name: "mission_waiting",
      label: input.waiting.length === 1 ? "1 draft is waiting for approval" : `${input.waiting.length} drafts are waiting for approval`,
      status: "queued",
      detail: input.waiting.slice(0, 8).map((row) => `${row.who}: ${row.subject || "No subject"}`).join("\n"),
    });
  }
  for (const skip of input.skipped.slice(0, 12)) {
    steps.push({
      name: "mission_skipped",
      label: "Skipped",
      status: "error",
      detail: skip.source ? `${skip.reason} Source: ${skip.source}` : skip.reason,
    });
  }
  if (input.pausedReason) {
    steps.push({ name: "mission_paused", label: "Mission paused", status: "error", detail: input.pausedReason });
  }
  const summaryParts = [
    `${input.missionName}: ${input.leads} new ${input.leads === 1 ? "lead" : "leads"}, ${input.drafts} ${input.drafts === 1 ? "draft" : "drafts"}`,
  ];
  if (input.scheduled) summaryParts.push(`${input.scheduled} queued to send`);
  if (input.waiting.length) summaryParts.push(`${input.waiting.length} waiting for approval`);
  if (input.skipped.length) summaryParts.push(`${input.skipped.length} skipped`);
  if (input.pausedReason) summaryParts.push("paused");
  return { summary: summaryParts.join(", ") + ".", steps };
}

export function spendExceeded(spent: number, cap: number): boolean {
  return Number.isFinite(spent) && Number.isFinite(cap) && spent >= cap;
}
