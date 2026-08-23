/**
 * Email gate on scan results.
 *
 * Anonymous visitors may run a scan and watch it finish, but the rows stay
 * obscured until they hand over an email. Signed-in users and anyone who
 * already gave an email are never gated.
 *
 * Deliberately no posthog.identify() here: these people have no account. An
 * identify() would pin this browser's distinct_id to the email, and the real
 * identify(user_id) at signup would then be refused — two people, split
 * history, and a payment that cannot be traced to the visit that made it.
 * setPersonProperties attaches the email while leaving the anonymous
 * distinct_id intact, so the eventual signup merges correctly.
 */
import { supabase } from "@/integrations/supabase/client";
import { posthog } from "@/lib/posthog";

export const SCAN_GATE_EMAIL_KEY = "outreign_lead_email";

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value.trim());

export function getStoredGateEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(SCAN_GATE_EMAIL_KEY);
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

export function storeGateEmail(email: string) {
  try {
    localStorage.setItem(SCAN_GATE_EMAIL_KEY, email);
  } catch { /* private mode — the gate simply asks again next visit */ }
}

/**
 * Record the captured lead. Fire-and-forget: the reveal must not wait on the
 * network, so failures are logged and swallowed.
 */
export async function captureScanGateLead(
  email: string,
  scanContext?: Record<string, unknown> | null,
) {
  const clean = email.trim().toLowerCase();

  storeGateEmail(clean);

  // Person properties, never identify() — see the note at the top of this file.
  posthog.setPersonProperties({ email: clean, lead_source: "scan_gate" });
  posthog.capture("lead_captured", { source: "scan_gate" });

  const distinctId = posthog.get_distinct_id();

  try {
    const { error } = await supabase
      .from("scan_gate_leads")
      .upsert(
        {
          email: clean,
          posthog_distinct_id: distinctId ?? null,
          scan_context: (scanContext ?? null) as never,
        },
        { onConflict: "email", ignoreDuplicates: false },
      );
    if (error) console.warn("[scan-gate] lead insert failed:", error.message);
  } catch (e) {
    console.warn("[scan-gate] lead insert error:", String(e));
  }
}
