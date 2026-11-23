export interface LeadComposeDraft {
  subject: string;
  body: string;
  trigger: string;
  draftId: string | null;
  edited?: boolean;
}

export const emptyComposeDraft: LeadComposeDraft = {
  subject: "", body: "", trigger: "", draftId: null,
};

export type ComposeDrafts = Record<string, LeadComposeDraft>;

export function updateComposeDraft(drafts: ComposeDrafts, leadId: string, patch: Partial<LeadComposeDraft>): ComposeDrafts {
  return { ...drafts, [leadId]: { ...emptyComposeDraft, ...drafts[leadId], ...patch, edited: true } };
}

export function mergeSavedComposeDrafts(drafts: ComposeDrafts, saved: Array<{
  id: string; lead_id: string | null; subject: string | null; body: string | null; trigger_context: string | null;
}>): ComposeDrafts {
  const next = { ...drafts };
  const seen = new Set<string>();
  // Caller orders newest first. Never replace unsaved local edits or use one
  // recipient's copy as a fallback for another recipient.
  for (const row of saved) {
    if (!row.lead_id || seen.has(row.lead_id)) continue;
    seen.add(row.lead_id);
    if (next[row.lead_id]?.edited) continue;
    next[row.lead_id] = { subject: row.subject ?? "", body: row.body ?? "", trigger: row.trigger_context ?? "", draftId: row.id };
  }
  return next;
}
/**
 * Content prepared before any lead is chosen (prefill, template) lives under
 * the "" key. Hand it to the first lead picked, unless that lead already has
 * its own copy, so nothing on screen vanishes.
 */
export function adoptUnassignedDraft(drafts: ComposeDrafts, leadId: string): ComposeDrafts {
  const pending = drafts[""];
  if (!leadId || !pending) return drafts;
  const target = drafts[leadId];
  if (target && (target.subject || target.body || target.trigger)) return drafts;
  const { [""]: _unused, ...rest } = drafts;
  return { ...rest, [leadId]: { ...emptyComposeDraft, ...target, ...pending, draftId: target?.draftId ?? pending.draftId } };
}
