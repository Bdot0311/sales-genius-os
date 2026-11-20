/**
 * How outcome labels read on screen.
 *
 * The labels themselves and the confirmation rule are re-exported from the
 * edge function's module rather than copied, so the inbox cannot drift from the
 * classifier about what the labels are or which ones need a human.
 */
export {
  LOW_CONFIDENCE,
  OUTCOME_LABELS,
  POSITIVE_LABELS,
  isOutcomeLabel,
  needsConfirmation,
  type OutcomeLabel,
} from "../../supabase/functions/_shared/reply-labels";

import type { OutcomeLabel } from "../../supabase/functions/_shared/reply-labels";

export const LABEL_COPY: Record<OutcomeLabel, { label: string; color: string }> = {
  positive: { label: "Interested", color: "text-emerald-400" },
  interested_later: { label: "Later", color: "text-teal-400" },
  referral: { label: "Referral", color: "text-sky-400" },
  meeting_booked: { label: "Meeting", color: "text-emerald-300" },
  objection: { label: "Objection", color: "text-amber-400" },
  not_interested: { label: "Not interested", color: "text-rose-400" },
  wrong_person: { label: "Wrong person", color: "text-orange-300" },
  out_of_office: { label: "Away", color: "text-muted-foreground" },
  auto_reply: { label: "Auto-reply", color: "text-muted-foreground" },
  unsubscribe_request: { label: "Unsubscribe", color: "text-rose-300" },
  other: { label: "Unclear", color: "text-muted-foreground" },
};
