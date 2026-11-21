import { isEnriched } from "@/lib/lead-email-gap";

/** Outreach labels that group the saved-lead stages by what to do next. */
export const OUTREACH_LABEL_GROUPS = {
  first_touch: { label: "Needs first touch", stages: ["new"] },
  follow_up: { label: "Needs follow-up", stages: ["contacted", "no_response"] },
} as const;

export interface LeadPickerFilters {
  label: string; // "all" | group key | stage value
  intent: string; // "all" | intent label
  enrichment: "all" | "enriched" | "not_enriched";
}

export const DEFAULT_LEAD_PICKER_FILTERS: LeadPickerFilters = { label: "all", intent: "all", enrichment: "all" };

export interface FilterableLead {
  pipeline_stage?: string | null;
  intent_label?: string | null;
  enrichment_status?: string | null;
  enriched_at?: string | null;
}

export function leadMatchesPickerFilters(lead: FilterableLead, f: LeadPickerFilters): boolean {
  const stage = lead.pipeline_stage || "new";
  if (f.label !== "all") {
    const group = OUTREACH_LABEL_GROUPS[f.label as keyof typeof OUTREACH_LABEL_GROUPS];
    if (group ? !(group.stages as readonly string[]).includes(stage) : stage !== f.label) return false;
  }
  if (f.intent !== "all" && lead.intent_label !== f.intent) return false;
  if (f.enrichment === "enriched" && !isEnriched(lead)) return false;
  if (f.enrichment === "not_enriched" && isEnriched(lead)) return false;
  return true;
}
