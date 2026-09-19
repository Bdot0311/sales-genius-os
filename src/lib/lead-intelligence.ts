/**
 * Lead Intelligence, as the app reads it.
 *
 * The decision layer is a separate provider from the writing layer, and the UI
 * knows neither: it reads the normalized decision shape below. Labels live here
 * so a badge, a filter and the detail sheet always say the same words.
 */

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

export interface LeadDecisionField {
  value: string;
  label: string;
  confidence: number;
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
  automation_allowed: boolean;
  automation_reason: string;
  cached?: boolean;
}

/** Below this the answer is shown as "not sure", never as a fact. */
export const CONFIDENCE_FLOOR = 0.45;

export const DECISION_LABELS: Record<DecisionKey, { title: string; options: Record<string, string> }> = {
  icp_fit: {
    title: "Fit",
    options: { strong: "Strong fit", moderate: "Moderate fit", weak: "Weak fit" },
  },
  buying_intent: {
    title: "Intent",
    options: { active: "Active intent", researching: "Researching", dormant: "No signal" },
  },
  email_priority: {
    title: "Priority",
    options: { high: "High priority", medium: "Medium priority", low: "Low priority" },
  },
  send_recommendation: {
    title: "Next step",
    options: { send_now: "Ready to email", needs_more_research: "Research first", do_not_send: "Do not email" },
  },
  personalization_depth: {
    title: "Personalization",
    options: { deep: "Deep personalization", moderate: "Moderate", light: "Keep it light" },
  },
  subject_strategy: {
    title: "Subject angle",
    options: {
      pain_point: "Pain-point subject",
      curiosity: "Curiosity subject",
      outcome: "Outcome subject",
      direct_ask: "Direct subject",
    },
  },
  cta_strategy: {
    title: "Closing ask",
    options: {
      soft_question: "Soft question",
      meeting_request: "Ask for a call",
      resource_offer: "Offer a resource",
      reply_ask: "Ask for a reply",
    },
  },
  sequence_length: {
    title: "Sequence length",
    options: { short: "2 emails", standard: "4 emails", extended: "6+ emails" },
  },
  follow_up_timing: {
    title: "Follow-up timing",
    options: { fast: "Follow up in 2-3 days", standard: "Follow up in 4-5 days", slow: "Follow up in 7+ days" },
  },
  automation_review: {
    title: "Automation",
    options: { safe_to_automate: "Safe to automate", human_review: "Human review", hold: "Hold" },
  },
};

export const EMAIL_STRATEGY_KEYS: DecisionKey[] = [
  "personalization_depth",
  "subject_strategy",
  "cta_strategy",
  "sequence_length",
  "follow_up_timing",
];

/** Tailwind classes per option, using semantic tokens only. */
export function decisionTone(key: DecisionKey, value: string): string {
  const good = "bg-primary/10 text-primary border-primary/20";
  const warn = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  const bad = "bg-destructive/10 text-destructive border-destructive/20";
  const neutral = "bg-muted text-muted-foreground border-border";

  if (key === "icp_fit") return value === "strong" ? good : value === "moderate" ? warn : bad;
  if (key === "buying_intent") return value === "active" ? good : value === "researching" ? warn : neutral;
  if (key === "email_priority") return value === "high" ? good : value === "medium" ? warn : neutral;
  if (key === "send_recommendation") return value === "send_now" ? good : value === "needs_more_research" ? warn : bad;
  if (key === "automation_review") return value === "safe_to_automate" ? good : value === "hold" ? bad : warn;
  return neutral;
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "High confidence";
  if (confidence >= CONFIDENCE_FLOOR) return "Moderate confidence";
  return "Not sure";
}

export function formatPercent(confidence: number): string {
  return `${Math.round((confidence || 0) * 100)}%`;
}

/** Rows straight out of the database, turned into the shape above. */
export function decisionFromRow(row: Record<string, any>): LeadDecision {
  const fields: Partial<Record<DecisionKey, LeadDecisionField>> = {};
  const confidences: number[] = [];
  (Object.keys(DECISION_LABELS) as DecisionKey[]).forEach((key) => {
    const value = row[key];
    if (!value) return;
    const confidence = Number(row[`${key}_confidence`] ?? 0) || 0;
    fields[key] = {
      value,
      label: DECISION_LABELS[key].options[value] ?? value,
      confidence,
      actionable: confidence >= CONFIDENCE_FLOOR,
    };
    confidences.push(confidence);
  });

  const review = fields.automation_review;
  const send = fields.send_recommendation;
  const automation_allowed = Boolean(
    review?.value === "safe_to_automate" &&
    send?.value === "send_now" &&
    review.confidence >= 0.7 &&
    send.confidence >= 0.7,
  );

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
    automation_allowed,
    automation_reason: automation_allowed
      ? "Safe to send without a human read."
      : "A person should read this email before it goes out.",
  };
}
