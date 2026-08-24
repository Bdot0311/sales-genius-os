// Shared detection + alerting for Lovable AI gateway credit exhaustion.
//
// Why this exists: when the workspace AI credit cap is hit, every AI feature
// (ICP domain analysis, lead research, query parsing, email generation) fails
// for real users while it keeps working for whoever tops the balance up moments
// later. The failure is invisible to the operator unless a user emails in, so
// each exhaustion is logged as a critical system alert (which emails support)
// and de-duplicated so one bad hour cannot flood the inbox.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logSystemAlert } from "./alerts.ts";

/** The gateway signals an exhausted balance/cap as 402, or 403 + credit_limit_reached. */
export function isAiCreditError(status: number, body: string): boolean {
  if (status === 402) return true;
  if (status === 403 && /credit_limit_reached/i.test(body)) return true;
  return /credit_limit_reached|insufficient[_ ]?(funds|balance|credits)/i.test(body);
}

/** One alert per function per window — enough to notice, not enough to spam. */
const DEDUPE_WINDOW_MINUTES = 30;

export interface AiCreditReport {
  /** Edge function name, e.g. "analyze-domain". */
  fn: string;
  userId?: string | null;
  model?: string;
  status?: number;
  detail?: string;
}

export async function reportAiCreditsExhausted(report: AiCreditReport): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  console.error(
    `[ai-credits] AI gateway credit cap hit in ${report.fn}`,
    report.status ?? "",
    (report.detail ?? "").slice(0, 300),
  );
  if (!url || !key) return;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const since = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60_000).toISOString();
    const { data: recent } = await supabase
      .from("system_alerts")
      .select("id")
      .eq("category", "ai_credits_exhausted")
      .eq("related_entity", report.fn)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return;

    await logSystemAlert({
      category: "ai_credits_exhausted",
      severity: "critical",
      message:
        `AI credits exhausted — ${report.fn} is failing for users. ` +
        `Top up the AI balance or raise the workspace limit.`,
      details: {
        function: report.fn,
        model: report.model ?? null,
        gateway_status: report.status ?? null,
        gateway_detail: (report.detail ?? "").slice(0, 500),
      },
      user_id: report.userId ?? null,
      related_entity: report.fn,
    });
  } catch (err) {
    console.error("[ai-credits] failed to record alert", err);
  }
}

/**
 * User-facing copy for an exhausted balance. Deliberately does not tell the
 * customer to "add funds" — it is our balance, not theirs — and does not
 * pretend the feature is broken forever.
 */
export const AI_CREDITS_USER_MESSAGE =
  "Our AI capacity is momentarily maxed out — the team has been alerted automatically. Please try again in a few minutes.";
