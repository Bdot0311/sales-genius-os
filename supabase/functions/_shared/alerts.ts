// Shared system alert logger for edge functions.
// Writes to public.system_alerts (admin-visible) and, for severity >= 'error',
// triggers an email to the configured support inbox via send-system-alert.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export type AlertSeverity = "info" | "warning" | "error" | "critical";

export interface AlertInput {
  category:
    | "stripe_webhook_failure"
    | "stripe_plan_mismatch"
    | "outreach_send_limit"
    | "outreach_send_error"
    | string;
  severity?: AlertSeverity;
  message: string;
  details?: Record<string, unknown>;
  user_id?: string | null;
  related_entity?: string | null;
}

export async function logSystemAlert(input: AlertInput): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("[ALERTS] Missing Supabase env, cannot persist alert", input);
    return;
  }

  const severity: AlertSeverity = input.severity ?? "warning";
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    const { error } = await supabase.from("system_alerts").insert({
      category: input.category,
      severity,
      message: input.message.slice(0, 2000),
      details: input.details ?? {},
      user_id: input.user_id ?? null,
      related_entity: input.related_entity ?? null,
    });
    if (error) {
      console.error("[ALERTS] Failed to insert system_alert", error);
    }
  } catch (err) {
    console.error("[ALERTS] Exception inserting system_alert", err);
  }

  // Email on error/critical only — avoid noisy mailbox.
  if (severity === "error" || severity === "critical") {
    try {
      await supabase.functions.invoke("send-system-alert", {
        body: {
          category: input.category,
          severity,
          message: input.message,
          details: input.details ?? {},
        },
      });
    } catch (err) {
      console.error("[ALERTS] Failed to invoke send-system-alert", err);
    }
  }
}
