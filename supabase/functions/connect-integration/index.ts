import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveCaller } from "../_shared/internal-auth.ts";
import { ManualIntegrationSchema, MANUAL_INTEGRATION_NAMES } from "../_shared/manual-integration.ts";
import { saveIntegration } from "../_shared/save-integration.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const caller = await resolveCaller(req);
    if (!caller.ok) return caller.response;
    if (caller.internal) return json({ error: "Please sign in to connect an integration." }, 403);
    const parsed = ManualIntegrationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Invalid connection settings." });
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Connection service is unavailable." });
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { integrationId, config } = parsed.data;
    await saveIntegration(client, caller.userId, integrationId, MANUAL_INTEGRATION_NAMES[integrationId], config);
    // Saving a webhook never fires it or claims that a remote workflow ran.
    return json({ success: true });
  } catch {
    return json({ error: "Could not save your connection. Please try again." });
  }
});