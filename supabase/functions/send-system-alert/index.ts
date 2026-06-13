// Sends a system-alert email to the configured support inbox via Resend.
// Invoked by the shared alerts logger for severity >= "error".
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPPORT_EMAIL =
  Deno.env.get("NOTIFICATION_EMAIL") || "support@bdotindustries.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || !serviceKey || token !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
    });
  }

  try {
    const { category, severity, message, details } = await req.json();

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.warn("[SEND-SYSTEM-ALERT] RESEND_API_KEY not set, skipping email");
      return new Response(
        JSON.stringify({ ok: true, emailed: false, reason: "no_resend_key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subject = `[OutReign ${String(severity).toUpperCase()}] ${category}`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
        <h2 style="color:#7c3aed;margin:0 0 12px">System alert: ${category}</h2>
        <p style="margin:0 0 8px"><strong>Severity:</strong> ${severity}</p>
        <p style="margin:0 0 16px"><strong>Message:</strong> ${escapeHtml(String(message ?? ""))}</p>
        <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px">${escapeHtml(
          JSON.stringify(details ?? {}, null, 2),
        )}</pre>
        <p style="margin:16px 0 0;color:#64748b;font-size:12px">Open Admin → Alerts to acknowledge or investigate.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "OutReign Alerts <alerts@notify.bdotindustries.com>",
        to: [SUPPORT_EMAIL],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[SEND-SYSTEM-ALERT] Resend error", res.status, text);
      return new Response(
        JSON.stringify({ ok: false, error: "resend_failed", status: res.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, emailed: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[SEND-SYSTEM-ALERT] Exception", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
