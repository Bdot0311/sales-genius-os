/**
 * The signed-in person's answer to one question: may their outbound outcomes
 * be used to improve the lead scoring?
 *
 * Why a function rather than a table write from the browser:
 *   - consent needs a server timestamp and a record that cannot be edited
 *     afterwards, because "you can withdraw at any time" has to be evidenced
 *     later. set_outcome_consent writes the flag and the history together, in
 *     one transaction, and is service-only;
 *   - an answer may only come from the person. An API key is a program acting
 *     for them, which is not the same thing, so a key is refused here even
 *     though it is accepted everywhere else in the app.
 *
 * The flag is tri-state and this never writes NULL. Absent means nobody has
 * been asked yet, and only the person answering can move it off that.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // A key cannot answer for a person, so there is no resolveAppUser here.
    if (req.headers.get("X-API-Key")) return json({ error: "Consent can only be given by the account owner." }, 403);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const { data: { user }, error: userErr } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String((body as { action?: unknown })?.action ?? "read");

    if (action === "read") {
      const { data, error } = await admin.rpc("outcome_consent_state", { p_user_id: user.id });
      if (error) {
        console.error("[outcome-consent] could not read the setting:", error.message);
        return json({ error: "Could not read your setting." }, 500);
      }
      const state = (data ?? {}) as { consent?: boolean | null; decided_at?: string | null };
      return json({
        // null, not false: "not asked" is a state of its own and the app shows
        // a different thing for each of the three.
        consent: typeof state.consent === "boolean" ? state.consent : null,
        decided_at: state.decided_at ?? null,
      });
    }

    if (action === "set") {
      const raw = (body as { consent?: unknown })?.consent;
      if (typeof raw !== "boolean") {
        return json({ error: "An answer must be yes or no." }, 400);
      }
      const source = (body as { source?: unknown })?.source === "settings" ? "settings" : "prompt";
      const { data, error } = await admin.rpc("set_outcome_consent", {
        p_user_id: user.id,
        p_consent: raw,
        p_source: source,
      });
      if (error) {
        console.error("[outcome-consent] could not record the answer:", error.message);
        return json({ error: "Your answer was not saved. Try again." }, 500);
      }
      const recorded = (data ?? {}) as { consent?: boolean; decided_at?: string };
      return json({ consent: recorded.consent ?? raw, decided_at: recorded.decided_at ?? null });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[outcome-consent]", err instanceof Error ? err.message : err);
    return json({ error: "Something went wrong." }, 500);
  }
});
