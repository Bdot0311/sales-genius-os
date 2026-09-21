// Lead Intelligence: the structured decision layer.
//
// Division of labour, deliberately strict:
//   Bedrock  — research, summaries, analysis, email/subject/follow-up writing.
//   JEV      — classification and decisions: is this lead a fit, is there
//              intent, how should the email be written, is it safe to automate.
//
// Nothing in the app calls the decision provider directly. Everything goes
// through evaluateLeadWithJEV() below, which owns the question set, the
// normalized result shape, freshness, persistence and observability. Swapping
// providers means rewriting jev-provider.ts and the normalizer here — no call
// site changes.

import { askJev, JevError, jevConfigured, readChoice, type JevChoiceQuestion } from "./jev-provider.ts";

export const LEAD_INTELLIGENCE_FLAG = "jevLeadIntelligence";

/** How long a decision stays fresh when nothing about the lead has changed. */
const FRESH_DAYS = 14;

/**
 * Confidence gates. Thresholds scale with the stakes of the action: sending an
 * email on a customer's behalf without review is the most consequential thing
 * this product does, so it needs the highest bar.
 */
export const CONFIDENCE = {
  /** Below this the answer is treated as "unknown" and never shown as a fact. */
  floor: 0.45,
  /** Enough to shape how an email is written. */
  advisory: 0.55,
  /** Enough to let the agent send without a human looking first. */
  automation: 0.7,
} as const;

// ─── Normalized lead context (provider-agnostic) ─────────────────────────────

export interface LeadContext {
  id: string;
  user_id: string;
  company_name?: string | null;
  contact_name?: string | null;
  job_title?: string | null;
  department?: string | null;
  seniority?: string | null;
  industry?: string | null;
  company_size?: string | null;
  employee_count?: string | null;
  annual_revenue?: string | null;
  company_website?: string | null;
  company_description?: string | null;
  technologies?: string[] | null;
  icp_score?: number | null;
  intent_score?: number | null;
  intent_label?: string | null;
  intent_reasons?: string[] | null;
  signals?: string[] | null;
  signal_type?: string | null;
  recommended_angle?: string | null;
  research_brief?: unknown;
  research_confidence?: number | null;
  notes?: string | null;
  status?: string | null;
  contact_email?: string | null;
  linkedin_url?: string | null;
}

export interface SellerContext {
  business_description?: string | null;
  icp_summary?: string | null;
}

export interface LeadDecisionField {
  value: string;
  label: string;
  confidence: number;
  /** false when confidence sits under the floor — treat as unknown. */
  actionable: boolean;
}

export interface LeadDecision {
  lead_id: string;
  status: "ok" | "unavailable";
  provider: string;
  provider_model?: string | null;
  evaluated_at: string;
  error_message?: string | null;
  latency_ms?: number | null;
  fields: Partial<Record<DecisionKey, LeadDecisionField>>;
  average_confidence: number;
  /** Safe to let the agent send without review. */
  automation_allowed: boolean;
  automation_reason: string;
}

// ─── The question set ────────────────────────────────────────────────────────

export type DecisionKey =
  | "icp_fit"
  | "buying_intent"
  | "email_priority"
  | "send_recommendation"
  | "personalization_depth"
  | "subject_strategy"
  | "cta_strategy"
  | "sequence_length"
  | "follow_up_timing"
  | "automation_review";

interface DecisionSpec {
  question: JevChoiceQuestion;
  /** Customer-facing wording per option. */
  labels: Record<string, string>;
}

const SPECS: Record<DecisionKey, DecisionSpec> = {
  icp_fit: {
    question: {
      type: "choice",
      instructions:
        "How well does this prospect match the seller's ideal customer profile, judged on role, company type, size and industry",
      criteria: {
        strong: "Clear match on role and company type — the seller sells to people like this",
        moderate: "Plausible match but something is off: adjacent role, wrong size, or unclear industry",
        weak: "Not the kind of buyer this seller serves",
      },
    },
    labels: { strong: "Strong fit", moderate: "Moderate fit", weak: "Weak fit" },
  },
  buying_intent: {
    question: {
      type: "choice",
      instructions: "What the evidence says about this prospect's current buying intent",
      criteria: {
        active: "Concrete recent evidence of a live need or trigger: hiring, funding, launch, tooling change",
        researching: "Some indication of movement or relevance, but no clear live trigger",
        dormant: "No evidence of a current need — this would be a cold, unprompted approach",
      },
    },
    labels: { active: "Active intent", researching: "Researching", dormant: "No signal" },
  },
  email_priority: {
    question: {
      type: "choice",
      instructions: "How this lead should be prioritized against a list of other outbound prospects this week",
      criteria: {
        high: "Reach out first — fit and timing both point the right way",
        medium: "Worth contacting, but behind the strongest prospects",
        low: "Leave until the better prospects are worked",
      },
    },
    labels: { high: "High priority", medium: "Medium priority", low: "Low priority" },
  },
  send_recommendation: {
    question: {
      type: "choice",
      instructions: "What should happen next with this lead for a cold email",
      criteria: {
        send_now: "There is enough to write a specific, credible email today",
        needs_more_research: "The email would be generic — research the company first",
        do_not_send: "This prospect should not be emailed: wrong fit, wrong role, or no usable basis",
      },
    },
    labels: { send_now: "Ready to email", needs_more_research: "Research first", do_not_send: "Do not email" },
  },
  personalization_depth: {
    question: {
      type: "choice",
      instructions: "How much genuine, verifiable personalization the available evidence can support",
      criteria: {
        deep: "Specific verified detail exists — a named trigger, tooling fact, or company specific",
        moderate: "Role and industry level relevance only",
        light: "Almost nothing specific — keep the email short and avoid claims",
      },
    },
    labels: { deep: "Deep personalization", moderate: "Moderate", light: "Keep it light" },
  },
  subject_strategy: {
    question: {
      type: "choice",
      instructions: "Which subject line angle is most likely to get this specific prospect to open",
      criteria: {
        pain_point: "Name the operational problem their role owns",
        curiosity: "A short, specific, slightly open line that invites the click",
        outcome: "Lead with the result they would care about",
        direct_ask: "Say plainly why you are writing",
      },
    },
    labels: {
      pain_point: "Pain-point subject",
      curiosity: "Curiosity subject",
      outcome: "Outcome subject",
      direct_ask: "Direct subject",
    },
  },
  cta_strategy: {
    question: {
      type: "choice",
      instructions: "Which closing ask this prospect is most likely to respond to in a first cold email",
      criteria: {
        soft_question: "A low-friction question about how they handle something today",
        meeting_request: "Ask directly for a short call",
        resource_offer: "Offer something concrete and useful, no meeting",
        reply_ask: "Ask for a one-word or yes/no reply",
      },
    },
    labels: {
      soft_question: "Soft question",
      meeting_request: "Ask for a call",
      resource_offer: "Offer a resource",
      reply_ask: "Ask for a reply",
    },
  },
  sequence_length: {
    question: {
      type: "choice",
      instructions: "How many emails this prospect is worth before stopping",
      criteria: {
        short: "Two touches — low fit or weak evidence, do not spend more",
        standard: "Around four touches, the normal cadence",
        extended: "Six or more — high value prospect worth sustained effort",
      },
    },
    labels: { short: "2 emails", standard: "4 emails", extended: "6+ emails" },
  },
  follow_up_timing: {
    question: {
      type: "choice",
      instructions: "How quickly the first follow-up should go out if there is no reply",
      criteria: {
        fast: "Within two or three days — there is a live trigger and timing matters",
        standard: "Four or five days",
        slow: "A week or more — no urgency, do not crowd them",
      },
    },
    labels: { fast: "Follow up in 2-3 days", standard: "Follow up in 4-5 days", slow: "Follow up in 7+ days" },
  },
  automation_review: {
    question: {
      type: "choice",
      instructions:
        "Whether an autonomous sales agent should be allowed to email this prospect without a person reading the email first",
      criteria: {
        safe_to_automate: "Ordinary, low-risk prospect — an automated send is fine",
        human_review: "Something warrants a human read: seniority, sensitivity, or thin evidence",
        hold: "Do not send automatically under any circumstances",
      },
    },
    labels: { safe_to_automate: "Safe to automate", human_review: "Human review", hold: "Hold" },
  },
};

export const DECISION_KEYS = Object.keys(SPECS) as DecisionKey[];

export function decisionLabel(key: DecisionKey, value: string | null | undefined): string | null {
  if (!value) return null;
  return SPECS[key]?.labels[value] ?? value;
}

// ─── State building ─────────────────────────────────────────────────────────

function line(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = Array.isArray(value) ? value.slice(0, 8).join(", ") : String(value);
  if (!text.trim()) return null;
  return `${label}: ${text.trim().slice(0, 600)}`;
}

function briefText(brief: unknown): string | null {
  if (!brief) return null;
  if (typeof brief === "string") return brief.slice(0, 2000);
  try {
    const obj = brief as Record<string, unknown>;
    const facts = Array.isArray(obj.facts) ? obj.facts : null;
    if (facts) {
      return facts
        .slice(0, 6)
        .map((f) => (typeof f === "string" ? f : (f as Record<string, unknown>)?.fact))
        .filter(Boolean)
        .join("; ")
        .slice(0, 2000);
    }
    return JSON.stringify(brief).slice(0, 2000);
  } catch {
    return null;
  }
}

/**
 * The state the provider reasons over. Plain prose, no JSON, no instructions —
 * the questions carry the instructions.
 */
export function buildLeadState(lead: LeadContext, seller: SellerContext = {}): string {
  const prospect = [
    line("Contact", lead.contact_name),
    line("Title", lead.job_title),
    line("Seniority", lead.seniority),
    line("Department", lead.department),
    line("Company", lead.company_name),
    line("Industry", lead.industry),
    line("Company size", lead.company_size || lead.employee_count),
    line("Revenue", lead.annual_revenue),
    line("Website", lead.company_website),
    line("What the company does", lead.company_description),
    line("Tech stack", lead.technologies),
    line("Has a work email on file", lead.contact_email ? "yes" : "no"),
    line("Pipeline status", lead.status),
  ].filter(Boolean).join("\n");

  const evidence = [
    line("ICP score already computed in-app (0-100)", lead.icp_score),
    line("Intent score already computed in-app (0-100)", lead.intent_score),
    line("Intent label", lead.intent_label),
    line("Intent reasons", lead.intent_reasons),
    line("Buying signals on record", lead.signals),
    line("Signal type", lead.signal_type),
    line("Suggested angle on record", lead.recommended_angle),
    line("Verified research facts", briefText(lead.research_brief)),
    line("Research confidence (0-100)", lead.research_confidence),
    line("Seller's notes", lead.notes),
  ].filter(Boolean).join("\n");

  const sellerBlock = [
    line("What the seller sells", seller.business_description),
    line("Seller's ideal customer profile", seller.icp_summary),
  ].filter(Boolean).join("\n");

  return [
    "A B2B cold-email prospect being considered for outbound email outreach.",
    "\nPROSPECT\n" + (prospect || "No prospect details on file."),
    "\nEVIDENCE\n" + (evidence || "No research or buying signals on file for this prospect."),
    "\nSELLER\n" + (sellerBlock || "The seller's own product description is not on file."),
  ].join("\n");
}

/** Cheap, stable fingerprint of everything that should invalidate a decision. */
export async function fingerprintLead(lead: LeadContext, seller: SellerContext = {}): Promise<string> {
  const material = buildLeadState(lead, seller);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Normalization ──────────────────────────────────────────────────────────

function normalize(
  leadId: string,
  answers: Record<string, unknown>,
  meta: { model?: string | null; latencyMs?: number },
): LeadDecision {
  const fields: Partial<Record<DecisionKey, LeadDecisionField>> = {};
  const confidences: number[] = [];

  for (const key of DECISION_KEYS) {
    const spec = SPECS[key];
    const answer = readChoice(answers as never, key, Object.keys(spec.labels));
    if (!answer) continue; // unrecognized output is dropped, never guessed at
    fields[key] = {
      value: answer.choice,
      label: spec.labels[answer.choice] ?? answer.choice,
      confidence: answer.confidence,
      actionable: answer.confidence >= CONFIDENCE.floor,
    };
    confidences.push(answer.confidence);
  }

  const average = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  const review = fields.automation_review;
  const send = fields.send_recommendation;
  let automation_allowed = false;
  let automation_reason = "No evaluation available — a person should review this email.";

  if (!review || !send) {
    automation_reason = "The evaluation did not return a send decision, so this needs a human read.";
  } else if (review.value !== "safe_to_automate") {
    automation_reason = review.value === "hold"
      ? "Evaluation says hold: do not send to this prospect automatically."
      : "Evaluation asks for a human to read this email before it goes out.";
  } else if (send.value !== "send_now") {
    automation_reason = send.value === "do_not_send"
      ? "Evaluation says this prospect should not be emailed."
      : "Evaluation says research this company before emailing.";
  } else if (review.confidence < CONFIDENCE.automation || send.confidence < CONFIDENCE.automation) {
    automation_reason = "Evaluation is not confident enough to send without a human read.";
  } else {
    automation_allowed = true;
    automation_reason = "Evaluation is confident this is safe to send automatically.";
  }

  return {
    lead_id: leadId,
    status: "ok",
    provider: "jev",
    provider_model: meta.model ?? null,
    evaluated_at: new Date().toISOString(),
    latency_ms: meta.latencyMs ?? null,
    fields,
    average_confidence: Number(average.toFixed(3)),
    automation_allowed,
    automation_reason,
  };
}

export function unavailableDecision(leadId: string, message: string): LeadDecision {
  return {
    lead_id: leadId,
    status: "unavailable",
    provider: "jev",
    evaluated_at: new Date().toISOString(),
    error_message: message,
    fields: {},
    average_confidence: 0,
    automation_allowed: false,
    automation_reason: "Lead Intelligence is unavailable, so nothing is sent without a human read.",
  };
}

// ─── The service ────────────────────────────────────────────────────────────

type Supa = {
  from: (t: string) => any;
};

/** Is the feature switched on for the whole workspace? */
export async function leadIntelligenceEnabled(supabase: Supa): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("name", LEAD_INTELLIGENCE_FLAG)
      .maybeSingle();
    return data ? Boolean(data.is_enabled) : false;
  } catch {
    return false;
  }
}

export function isDecisionFresh(row: { evaluated_at?: string | null; input_fingerprint?: string | null }, fingerprint: string): boolean {
  if (!row?.evaluated_at) return false;
  if (row.input_fingerprint && row.input_fingerprint !== fingerprint) return false;
  const age = Date.now() - new Date(row.evaluated_at).getTime();
  return age < FRESH_DAYS * 24 * 60 * 60 * 1000;
}

/** Turn a persisted row back into the normalized shape the app consumes. */
export function decisionFromRow(row: Record<string, any>): LeadDecision {
  const fields: Partial<Record<DecisionKey, LeadDecisionField>> = {};
  const confidences: number[] = [];
  for (const key of DECISION_KEYS) {
    const value = row[key];
    if (!value) continue;
    const confidence = Number(row[`${key}_confidence`] ?? 0) || 0;
    fields[key] = {
      value,
      label: decisionLabel(key, value) ?? value,
      confidence,
      actionable: confidence >= CONFIDENCE.floor,
    };
    confidences.push(confidence);
  }
  const base = normalizeAutomation(fields);
  return {
    lead_id: row.lead_id,
    status: row.status === "unavailable" ? "unavailable" : "ok",
    provider: row.provider ?? "jev",
    provider_model: row.provider_model ?? null,
    evaluated_at: row.evaluated_at,
    error_message: row.error_message ?? null,
    latency_ms: row.latency_ms ?? null,
    fields,
    average_confidence: confidences.length
      ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3))
      : 0,
    ...base,
  };
}

function normalizeAutomation(fields: Partial<Record<DecisionKey, LeadDecisionField>>) {
  const fake = normalize("", {}, {});
  const review = fields.automation_review;
  const send = fields.send_recommendation;
  if (!review || !send) return { automation_allowed: false, automation_reason: fake.automation_reason };
  const rebuilt = normalize("", {
    automation_review: { type: "choice", choice: review.value, confidence: review.confidence },
    send_recommendation: { type: "choice", choice: send.value, confidence: send.confidence },
  }, {});
  return { automation_allowed: rebuilt.automation_allowed, automation_reason: rebuilt.automation_reason };
}

/**
 * Evaluate one lead. On-demand only in v1: callers pass `force` when the
 * customer explicitly asked for a re-evaluation, otherwise a fresh saved
 * decision is reused.
 *
 * Never throws on provider failure — returns an `unavailable` decision so the
 * calling feature degrades instead of breaking.
 */
export async function evaluateLeadWithJEV(
  supabase: Supa,
  lead: LeadContext,
  options: {
    seller?: SellerContext;
    force?: boolean;
    triggerSource?: "manual" | "campaign" | "bulk";
    campaignId?: string | null;
  } = {},
): Promise<{ decision: LeadDecision; cached: boolean }> {
  const seller = options.seller ?? {};
  const trigger = options.triggerSource ?? "manual";
  const fingerprint = await fingerprintLead(lead, seller);

  if (!options.force) {
    const { data: existing } = await supabase
      .from("lead_decisions")
      .select("*")
      .eq("lead_id", lead.id)
      .maybeSingle();
    if (existing && existing.status === "ok" && isDecisionFresh(existing, fingerprint)) {
      await logEvent(supabase, {
        user_id: lead.user_id,
        lead_id: lead.id,
        status: "skipped_cached",
        trigger_source: trigger,
      });
      return { decision: decisionFromRow(existing), cached: true };
    }
  }

  if (!jevConfigured()) {
    await logEvent(supabase, {
      user_id: lead.user_id,
      lead_id: lead.id,
      status: "error",
      error_kind: "not_configured",
      trigger_source: trigger,
    });
    return { decision: unavailableDecision(lead.id, "Lead Intelligence is not configured yet."), cached: false };
  }

  const questions: Record<string, JevChoiceQuestion> = {};
  for (const key of DECISION_KEYS) questions[key] = SPECS[key].question;

  try {
    const { response, latencyMs } = await askJev(buildLeadState(lead, seller), questions);
    const decision = normalize(lead.id, response.answers as Record<string, unknown>, {
      model: response.model,
      latencyMs,
    });

    if (Object.keys(decision.fields).length === 0) {
      await logEvent(supabase, {
        user_id: lead.user_id,
        lead_id: lead.id,
        status: "error",
        error_kind: "malformed",
        latency_ms: latencyMs,
        trigger_source: trigger,
      });
      return {
        decision: unavailableDecision(lead.id, "The evaluation came back empty. Try again in a moment."),
        cached: false,
      };
    }

    await persist(supabase, lead, decision, {
      fingerprint,
      raw: response,
      state: buildLeadState(lead, seller),
      campaignId: options.campaignId ?? null,
    });

    await logEvent(supabase, {
      user_id: lead.user_id,
      lead_id: lead.id,
      status: "ok",
      provider_model: decision.provider_model,
      latency_ms: latencyMs,
      avg_confidence: decision.average_confidence,
      email_priority: decision.fields.email_priority?.value ?? null,
      send_recommendation: decision.fields.send_recommendation?.value ?? null,
      automation_review: decision.fields.automation_review?.value ?? null,
      trigger_source: trigger,
    });

    return { decision, cached: false };
  } catch (err) {
    const kind = err instanceof JevError ? err.kind : "unknown";
    console.error("[lead-intelligence] evaluation failed", kind, err instanceof Error ? err.message : err);
    await logEvent(supabase, {
      user_id: lead.user_id,
      lead_id: lead.id,
      status: "error",
      error_kind: kind,
      trigger_source: trigger,
    });
    const message = kind === "timeout"
      ? "The evaluation took too long. Try again."
      : kind === "rate_limit"
        ? "Lead Intelligence is busy right now. Try again shortly."
        : "Lead Intelligence is temporarily unavailable.";
    return { decision: unavailableDecision(lead.id, message), cached: false };
  }
}

/** Read a saved decision without calling the provider. Never throws. */
export async function getSavedDecision(supabase: Supa, leadId: string): Promise<LeadDecision | null> {
  try {
    const { data } = await supabase.from("lead_decisions").select("*").eq("lead_id", leadId).maybeSingle();
    if (!data || data.status !== "ok") return null;
    return decisionFromRow(data);
  } catch {
    return null;
  }
}

async function persist(
  supabase: Supa,
  lead: LeadContext,
  decision: LeadDecision,
  extra: { fingerprint: string; raw: unknown; state: string; campaignId: string | null },
) {
  const row: Record<string, unknown> = {
    lead_id: lead.id,
    user_id: lead.user_id,
    provider: decision.provider,
    provider_model: decision.provider_model,
    status: "ok",
    error_message: null,
    raw_response: extra.raw,
    input_snapshot: { state: extra.state },
    input_fingerprint: extra.fingerprint,
    campaign_id: extra.campaignId,
    latency_ms: decision.latency_ms,
    evaluated_at: decision.evaluated_at,
    updated_at: new Date().toISOString(),
  };
  for (const key of DECISION_KEYS) {
    row[key] = decision.fields[key]?.value ?? null;
    row[`${key}_confidence`] = decision.fields[key]?.confidence ?? null;
  }
  const { error } = await supabase.from("lead_decisions").upsert(row, { onConflict: "lead_id" });
  if (error) console.error("[lead-intelligence] persist failed", error.message);
}

async function logEvent(supabase: Supa, event: Record<string, unknown>) {
  try {
    const { error } = await supabase.from("lead_decision_events").insert(event);
    if (error) console.error("[lead-intelligence] event log failed", error.message);
  } catch (err) {
    console.error("[lead-intelligence] event log threw", err);
  }
}

// ─── Consumption by the writing layer (Bedrock) ──────────────────────────────

/**
 * The decision, rendered as constraints for a generation prompt. Only
 * sufficiently confident answers are included — a low-confidence guess must not
 * steer how an email is written.
 */
export function decisionPromptBlock(decision: LeadDecision | null): string {
  if (!decision || decision.status !== "ok") return "";
  const f = decision.fields;
  const usable = (field?: LeadDecisionField) =>
    field && field.confidence >= CONFIDENCE.advisory ? field.value : null;

  const lines: string[] = [];
  const depth = usable(f.personalization_depth);
  if (depth === "deep") lines.push("- Personalization: lean on the specific verified detail in the research. One concrete fact, not two.");
  if (depth === "moderate") lines.push("- Personalization: role- and industry-level relevance only. Do not imply you researched them deeply.");
  if (depth === "light") lines.push("- Personalization: evidence is thin. Keep it short and make no claims about their company.");

  const subject = usable(f.subject_strategy);
  if (subject === "pain_point") lines.push("- Subject angle: name the operational problem their role owns.");
  if (subject === "curiosity") lines.push("- Subject angle: short and specific, open enough to invite the click. No clickbait.");
  if (subject === "outcome") lines.push("- Subject angle: lead with the result they care about.");
  if (subject === "direct_ask") lines.push("- Subject angle: say plainly why you are writing.");

  const cta = usable(f.cta_strategy);
  if (cta === "soft_question") lines.push("- Close with a low-friction question about how they handle this today. Do not ask for a meeting.");
  if (cta === "meeting_request") lines.push("- Close by asking directly for a short call.");
  if (cta === "resource_offer") lines.push("- Close by offering something concrete and useful. Do not ask for a meeting.");
  if (cta === "reply_ask") lines.push("- Close by asking for a one-word reply.");

  const intent = usable(f.buying_intent);
  if (intent === "active") lines.push("- There is a live trigger on record: write as if timing matters, without overstating what you know.");
  if (intent === "dormant") lines.push("- There is no trigger: do not invent one or imply recent news.");

  if (!lines.length) return "";
  return `\n\nEMAIL STRATEGY for this prospect (decided by the lead evaluation layer — follow it):\n${lines.join("\n")}`;
}

// ─── Draft-time decisions (used by every email-writing surface) ──────────────

/** Everything the decision layer needs about a lead, in one select. */
export const DECISION_LEAD_SELECT =
  "id, user_id, company_name, contact_name, contact_email, company_website, job_title, department, seniority, industry, company_size, employee_count, annual_revenue, technologies, company_description, notes, signals, signal_type, intent_reasons, recommended_angle, research_brief, research_confidence, icp_score, intent_score, intent_label, lead_status, pipeline_stage";

/** What the seller sells, so fit is judged against their business. Never throws. */
export async function loadSellerContext(supabase: Supa, userId: string): Promise<SellerContext> {
  const seller: SellerContext = {};
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("business_description")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.business_description) seller.business_description = profile.business_description;

    const { data: icp } = await supabase
      .from("icp_profiles")
      .select(
        "name, industries, target_titles, seniority_levels, departments, company_size_min, company_size_max, value_proposition, pain_points, disqualifiers",
      )
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (icp) {
      const list = (label: string, v: unknown) =>
        Array.isArray(v) && v.length ? `${label}: ${v.slice(0, 10).join(", ")}` : null;
      const size = icp.company_size_min || icp.company_size_max
        ? `headcount: ${icp.company_size_min ?? "?"}-${icp.company_size_max ?? "?"}`
        : null;
      seller.icp_summary = [
        icp.name,
        list("industries", icp.industries),
        list("target titles", icp.target_titles),
        list("seniority", icp.seniority_levels),
        list("departments", icp.departments),
        size,
        icp.value_proposition ? `value proposition: ${icp.value_proposition}` : null,
        list("pain points", icp.pain_points),
        list("disqualifiers", icp.disqualifiers),
      ].filter(Boolean).join("; ") || null;
    }
  } catch (err) {
    console.warn("[lead-intelligence] seller context unavailable", err instanceof Error ? err.message : err);
  }
  return seller;
}

/**
 * The decision a writing surface should follow for this lead.
 *
 * Prefers a saved, still-fresh evaluation. When there is none — the common case
 * for a lead the agent just found — it evaluates once here rather than writing
 * the email blind, then caches it like any other evaluation. Still on demand:
 * something a person or their agent asked for, never a sweep.
 *
 * Never throws and never blocks writing: any failure returns null and the
 * prompt is exactly what it would have been without the decision layer.
 */
export async function decisionForDrafting(
  supabase: Supa,
  leadId: string,
  userId: string,
  options: { seller?: SellerContext; campaignId?: string | null } = {},
): Promise<LeadDecision | null> {
  try {
    const saved = await getSavedDecision(supabase, leadId);
    if (saved) {
      // Fresh against the lead as it stands now? Then reuse it.
      const { data: row } = await supabase
        .from("lead_decisions")
        .select("evaluated_at, input_fingerprint")
        .eq("lead_id", leadId)
        .maybeSingle();
      const { data: lead } = await supabase
        .from("leads")
        .select(DECISION_LEAD_SELECT)
        .eq("id", leadId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!lead) return saved;
      const seller = options.seller ?? (await loadSellerContext(supabase, userId));
      const context = { ...(lead as Record<string, unknown>), status: (lead as any).lead_status } as LeadContext;
      const fingerprint = await fingerprintLead(context, seller);
      if (row && isDecisionFresh(row, fingerprint)) return saved;
      const { decision } = await evaluateLeadWithJEV(supabase, context, {
        seller,
        triggerSource: "campaign",
        campaignId: options.campaignId ?? null,
      });
      return decision.status === "ok" ? decision : saved;
    }

    if (!jevConfigured() || !(await leadIntelligenceEnabled(supabase))) return null;

    const { data: lead } = await supabase
      .from("leads")
      .select(DECISION_LEAD_SELECT)
      .eq("id", leadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!lead) return null;

    const seller = options.seller ?? (await loadSellerContext(supabase, userId));
    const context = { ...(lead as Record<string, unknown>), status: (lead as any).lead_status } as LeadContext;
    const { decision } = await evaluateLeadWithJEV(supabase, context, {
      seller,
      triggerSource: "campaign",
      campaignId: options.campaignId ?? null,
    });
    return decision.status === "ok" ? decision : null;
  } catch (err) {
    console.error("[lead-intelligence] draft-time decision failed", err instanceof Error ? err.message : err);
    return null;
  }
}
