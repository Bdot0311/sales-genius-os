// Calendly webhook receiver: turns a booked meeting into a real, named
// campaign-setup request. Without this, bookings only showed up as
// "Unknown visitor" clicks with no way to know who to prepare for.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, calendly-webhook-signature",
};

const SALES_EMAIL = "sales@bdotindustries.com";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function verifySignature(header: string | null, rawBody: string, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=").map((s) => s.trim())) as [string, string][],
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === v1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(200, { success: false, error: "not_configured" });

  const rawBody = await req.text();

  const signingKey = Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY");
  if (signingKey) {
    const ok = await verifySignature(req.headers.get("calendly-webhook-signature"), rawBody, signingKey);
    if (!ok) {
      console.error("[calendly-webhook] invalid signature");
      return json(401, { error: "invalid signature" });
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(200, { success: false, error: "invalid_json" });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const kind = clean(event?.event, 60);
  const p = event?.payload ?? {};

  const name = clean(p.name, 120) || null;
  const email = (clean(p.email, 200) || "").toLowerCase() || null;
  const scheduledAt = clean(p?.scheduled_event?.start_time, 60) || null;
  const eventName = clean(p?.scheduled_event?.name, 120) || "Campaign setup call";
  const trackedRequestId = clean(p?.tracking?.utm_content, 60) || null;
  const timezone = clean(p.timezone, 60) || null;
  const rescheduleUrl = clean(p.reschedule_url, 300) || null;
  const cancelUrl = clean(p.cancel_url, 300) || null;
  const answers = Array.isArray(p.questions_and_answers)
    ? p.questions_and_answers.map((q: any) => `${clean(q?.question, 200)}: ${clean(q?.answer, 500)}`)
    : [];

  if (kind !== "invitee.created" && kind !== "invitee.canceled") {
    return json(200, { success: true, ignored: kind });
  }

  // Match the account this booking belongs to, when they have one.
  let userId: string | null = null;
  let userPlan: string | null = null;
  if (email) {
    const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profile?.id) {
      userId = profile.id;
      const { data: sub } = await admin
        .from("subscriptions").select("plan").eq("user_id", profile.id).maybeSingle();
      userPlan = sub?.plan ?? null;
    }
  }

  // Prefer the exact click that produced this booking; fall back to the most
  // recent unbooked click from this person, then to a brand new row.
  let target: { id: string; metadata: Record<string, unknown>; plan: string | null } | null = null;
  if (trackedRequestId) {
    const { data } = await admin
      .from("campaign_setup_requests").select("id, metadata, plan").eq("id", trackedRequestId).maybeSingle();
    if (data) target = data as { id: string; metadata: Record<string, unknown>; plan: string | null };
  }
  if (!target && email) {
    const { data } = await admin
      .from("campaign_setup_requests")
      .select("id, metadata, plan")
      .eq("contact_email", email)
      .is("booked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) target = data as { id: string; metadata: Record<string, unknown>; plan: string | null };
  }
  if (!target && userId) {
    const { data } = await admin
      .from("campaign_setup_requests")
      .select("id, metadata, plan")
      .eq("user_id", userId)
      .is("booked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) target = data as { id: string; metadata: Record<string, unknown>; plan: string | null };
  }

  const calendlyMeta = {
    calendly: {
      event: kind,
      event_name: eventName,
      scheduled_at: scheduledAt,
      timezone,
      reschedule_url: rescheduleUrl,
      cancel_url: cancelUrl,
      answers,
      invitee_uri: clean(p.uri, 300) || null,
    },
  };

  const canceled = kind === "invitee.canceled";
  let requestId = target?.id ?? null;

  if (target) {
    const { error } = await admin
      .from("campaign_setup_requests")
      .update({
        contact_name: name,
        contact_email: email,
        user_id: userId ?? undefined,
        plan: target.plan ?? userPlan,
        booked_at: canceled ? null : scheduledAt,
        status: canceled ? "cancelled" : "booked",
        notes: answers.length ? answers.join("\n").slice(0, 2000) : undefined,
        metadata: { ...(target.metadata ?? {}), ...calendlyMeta },
      })
      .eq("id", target.id);
    if (error) console.error("[calendly-webhook] update failed:", error.message);
  } else {
    const { data: row, error } = await admin
      .from("campaign_setup_requests")
      .insert({
        user_id: userId,
        contact_email: email,
        contact_name: name,
        source: "calendly_booking",
        plan: userPlan,
        direction: "inbound",
        status: canceled ? "cancelled" : "booked",
        booked_at: canceled ? null : scheduledAt,
        notes: answers.length ? answers.join("\n").slice(0, 2000) : null,
        metadata: calendlyMeta,
      })
      .select("id")
      .single();
    if (error) console.error("[calendly-webhook] insert failed:", error.message);
    requestId = row?.id ?? null;
  }

  // Alert sales with the real person's details, not "Unknown visitor".
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        templateName: "campaign-setup-request",
        recipientEmail: SALES_EMAIL,
        idempotencyKey: `calendly-${kind}-${clean(p.uri, 200) || requestId || email}`,
        templateData: {
          name: name || "Unknown invitee",
          email: email || "no email provided",
          company: "",
          website: "",
          audience: answers.length ? answers.join(" | ") : eventName,
          goal: canceled
            ? "Meeting CANCELLED via Calendly"
            : `Meeting booked for ${scheduledAt ?? "unknown time"}${timezone ? ` (${timezone})` : ""} — plan: ${userPlan ?? (userId ? "unknown" : "no account yet")}`,
          submittedAt: new Date().toUTCString(),
        },
      }),
    });
  } catch (e) {
    console.warn("[calendly-webhook] alert email failed:", e);
  }

  return json(200, { success: true, id: requestId, event: kind });
});
