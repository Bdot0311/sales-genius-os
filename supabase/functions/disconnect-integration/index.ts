import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { corsHeaders, ownerOf, resolveCaller } from "../_shared/internal-auth.ts";

/**
 * Disconnecting an integration, without needing a table grant in the browser.
 *
 * Removing a connected inbox did `.update({ is_active: false })` straight from
 * the page and failed with `permission denied for table integrations` — a
 * privilege error, raised before RLS is ever consulted. A migration granting
 * `authenticated` the write was the obvious repair and it did not take effect,
 * because the migration ledger here belongs to Lovable and a file added
 * through a GitHub pull request is not necessarily in it.
 *
 * So this stops depending on that. Connecting an integration has always
 * worked, and the reason is structural rather than lucky: it runs in an edge
 * function on the service role, which bypasses table grants. Disconnecting now
 * runs the same way, which makes the two halves of one feature behave the
 * same.
 *
 * It is also the better posture. `integrations.config` holds OAuth refresh
 * tokens, and 20260901211628 deliberately revoked the browser's ability to
 * read them. Handing the browser a table-wide UPDATE to turn one boolean off
 * widens what a page can write to that row; doing it here does not.
 *
 * Ownership is resolved from the row, never from the request: `ownerOf`
 * returns null both for a row that does not exist and for one belonging to
 * somebody else, so the reply cannot be used to find out whose a record is.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const caller = await resolveCaller(req);
    if (!caller.ok) return caller.response;
    if (caller.internal) {
      // Nothing schedules a disconnect. A service key arriving here has not
      // said whose integration it means, and it does not get to choose.
      return json({ error: "This can only be done by a signed-in user.", error_code: "user_required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const rowId = typeof body?.rowId === "string" ? body.rowId.trim() : "";
    const integrationId = typeof body?.integrationId === "string" ? body.integrationId.trim() : "";
    if (!rowId && !integrationId) {
      return json({ error: "Nothing was named to disconnect.", error_code: "invalid_input" }, 400);
    }

    /*
     * One row by id, or every row for a provider. The id path checks ownership
     * first so a row belonging to another account is refused before anything
     * is written, rather than relying on the filter below to miss it.
     */
    if (rowId) {
      const owner = await ownerOf(supabase, "integrations", rowId, caller);
      if (!owner) return json({ error: "That integration was not found.", error_code: "not_found" }, 404);

      const { error } = await supabase
        .from("integrations")
        .update({ is_active: false })
        .eq("id", rowId)
        .eq("user_id", owner);
      if (error) {
        console.error("[disconnect-integration]", error.message);
        return json({ error: "Could not disconnect it. Please try again.", error_code: "db_error" }, 500);
      }
      return json({ success: true, disconnected: 1 });
    }

    const { data, error } = await supabase
      .from("integrations")
      .update({ is_active: false })
      .eq("user_id", caller.userId)
      .eq("integration_id", integrationId)
      .select("id");
    if (error) {
      console.error("[disconnect-integration]", error.message);
      return json({ error: "Could not disconnect it. Please try again.", error_code: "db_error" }, 500);
    }
    if (!data?.length) {
      return json({ error: "There was nothing connected to disconnect.", error_code: "not_found" }, 404);
    }
    return json({ success: true, disconnected: data.length });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[disconnect-integration] unexpected:", detail);
    return json({ error: `Could not disconnect it: ${detail}`, error_code: "unexpected" }, 500);
  }
});
