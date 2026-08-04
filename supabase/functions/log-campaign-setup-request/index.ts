import { createClient } from "npm:@supabase/supabase-js@2";

// Logs a "book a campaign setup" click. Runs with the service role so it works
// for signed-out landing-page visitors too — previously these clicks were never
// recorded anywhere, so a booked meeting could arrive with no trace in admin.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SALES_EMAIL = "sales@bdotindustries.com";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(200, { success: false, error: "not_configured" });

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const source = clean(body.source, 80) || "unknown";
    const plan = clean(body.plan, 40) || null;
    const referrer = clean(body.referrer, 300);
    const pagePath = clean(body.path, 200);

    // Identify the visitor when a session is present; stay anonymous otherwise.
    let userId: string | null = null;
    let email = clean(body.email, 200).toLowerCase() || null;
    let name = clean(body.name, 120) || null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      if (data?.user) {
        userId = data.user.id;
        email = email ?? data.user.email ?? null;
        const { data: profile } = await admin
          .from("profiles").select("full_name, email").eq("id", data.user.id).maybeSingle();
        name = name ?? (profile?.full_name ?? null);
        email = email ?? (profile?.email ?? null);
      }
    }

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const { data: ipOk } = await admin.rpc("consume_rate_limit", {
      _key: `campaign-setup-click:${userId ?? ip}`,
      _max: 10,
      _window_seconds: 3600,
    });
    if (ipOk === false) return json(200, { success: true, throttled: true });

    const { data: row, error } = await admin
      .from("campaign_setup_requests")
      .insert({
        user_id: userId,
        contact_email: email,
        contact_name: name,
        source,
        plan,
        direction: "inbound",
        status: "new",
        metadata: { referrer, path: pagePath, ip },
      })
      .select("id")
      .single();
    if (error) {
      console.error("[log-campaign-setup-request] insert failed:", error.message);
      return json(200, { success: false, error: error.message });
    }

    // Notify sales so a booking is never silently missed.
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          templateName: "campaign-setup-request",
          recipientEmail: SALES_EMAIL,
          idempotencyKey: `campaign-setup-click-${row.id}`,
          templateData: {
            name: name || "Unknown visitor",
            email: email || "not signed in",
            company: "",
            website: referrer,
            audience: `Clicked "${source}"${plan ? ` on the ${plan} plan` : ""}`,
            goal: userId ? "Existing account holder — see admin > Campaign setup" : "Anonymous visitor booking",
            submittedAt: new Date().toUTCString(),
          },
        }),
      });
    } catch (e) {
      console.warn("[log-campaign-setup-request] alert email failed:", e);
    }

    return json(200, { success: true, id: row.id });
  } catch (e) {
    console.error("[log-campaign-setup-request] error:", e instanceof Error ? e.message : e);
    return json(200, { success: false, error: "internal" });
  }
});
