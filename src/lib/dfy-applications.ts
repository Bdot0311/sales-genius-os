/*
 * Reading a done-for-you application back out of the row it was stored in.
 *
 * The answers live in `campaign_setup_requests.metadata`, as JSON, because
 * that table already had everywhere else an application needs: a nullable
 * user, contact fields, a booking timestamp the Calendly webhook fills, and a
 * source label. Keeping the question set in metadata rather than in columns
 * means a changed question is a form change, not a migration.
 *
 * The cost of that is this file: nothing enforces the shape, so every read
 * has to tolerate a missing or renamed key. Hence the fallbacks, and hence
 * the tests.
 */

export const DFY_SOURCE = "dfy_application";

export interface DfyApplicationRow {
  id: string;
  created_at: string;
  contact_name: string | null;
  contact_email: string | null;
  plan: string | null;
  booked_at: string | null;
  status: string | null;
  metadata: unknown;
}

export interface DfyApplicationView {
  name: string;
  email: string;
  company: string;
  website: string;
  sells: string;
  outboundToday: string;
  dealSize: string;
  salesCycle: string;
  rung: string;
  /**
   * Their sales cycle is longer than the 90-day founding term, so they cannot
   * produce a result inside it. The delivery runbook says to check this
   * before spending a seat, which is only possible if it is asked for up
   * front and shown here.
   */
  cycleTooLong: boolean;
}

const OUTBOUND_LABELS: Record<string, string> = {
  none: "Nothing yet",
  in_house: "In-house",
  agency: "Agency",
  tool: "Own tool",
};
const DEAL_LABELS: Record<string, string> = {
  under_5k: "Under $5k",
  "5k_25k": "$5k–25k",
  "25k_100k": "$25k–100k",
  over_100k: "Over $100k",
};
const CYCLE_LABELS: Record<string, string> = {
  under_30d: "Under 30d",
  "30_90d": "30–90d",
  "90_180d": "90–180d",
  over_180d: "Over 180d",
};
const RUNG_LABELS: Record<string, string> = {
  managed: "Managed",
  launch: "Launch",
  unsure: "Undecided",
};

/** Cycles that cannot finish inside a 90-day term. */
const CYCLE_EXCEEDS_TERM = new Set(["90_180d", "over_180d"]);

const UNSET = "—";

function field(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function labelled(raw: string, labels: Record<string, string>): string {
  if (!raw || raw === "unspecified") return UNSET;
  return labels[raw] ?? raw;
}

export function describeApplication(row: DfyApplicationRow): DfyApplicationView {
  const cycle = field(row.metadata, "sales_cycle");
  return {
    name: row.contact_name?.trim() || "Unnamed",
    email: row.contact_email?.trim() || UNSET,
    company: field(row.metadata, "company"),
    website: field(row.metadata, "website"),
    sells: field(row.metadata, "sells") || UNSET,
    outboundToday: labelled(field(row.metadata, "outbound_today"), OUTBOUND_LABELS),
    dealSize: labelled(field(row.metadata, "deal_size"), DEAL_LABELS),
    salesCycle: labelled(cycle, CYCLE_LABELS),
    // `plan` carries the rung, matching how the column is used elsewhere.
    rung: labelled(row.plan?.trim() ?? "", RUNG_LABELS),
    cycleTooLong: CYCLE_EXCEEDS_TERM.has(cycle),
  };
}
