// Sends a system-alert email via Resend.
// Invoked by the shared alerts logger for severity >= "error".
// Billing categories honour the admin-configurable `billing_notifications`
// setting: an on/off switch, a per-event switch, and a recipient list.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_EMAIL =
  Deno.env.get("NOTIFICATION_EMAIL") || "support@bdotindustries.com";

const BILLING_LABELS: Record<string, string> = {
  billing_cancellation: "Subscription cancelled",
  billing_cancellation_scheduled: "Cancellation scheduled",
  billing_payment_failed: "Invoice payment failed",
  billing_payment_action_required: "Card authentication required",
  billing_dispute: "Chargeback opened",
  billing_subscription_paused: "Subscription paused",
  billing_auto_paused: "Account automatically paused",
};

interface BillingSettings {
  enabled: boolean;
  recipients: string[];
  events: Record<string, boolean>;
}

function normalizeSettings(raw: unknown): BillingSettings {
  const v = (raw ?? {}) as Record<string, unknown>;
  return {
    enabled: v.enabled !== false,
    recipients: Array.isArray(v.recipients)
      ? (v.recipients as unknown[])
          .filter((r): r is string => typeof r === "string" && r.includes("@"))
          .map((r) => r.trim())
      : [],
    events: (v.events && typeof v.events === "object" ? v.events : {}) as Record<string, boolean>,
  };
}

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
    const cat = String(category ?? "");
    const isBilling = cat.startsWith("billing_");
    const d = (details ?? {}) as Record<string, unknown>;

    // Recipients + per-event opt-out come from admin settings.
    let recipients: string[] = [];
    if (Deno.env.get("SUPABASE_URL")) {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
        auth: { persistSession: false },
      });
      const { data: row } = await supabase
        .from("admin_settings")
        .select("setting_value")
        .eq("setting_key", "billing_notifications")
        .maybeSingle();
      const settings = normalizeSettings(row?.setting_value);

      if (isBilling) {
        if (!settings.enabled) {
          return json({ ok: true, emailed: false, reason: "billing_alerts_disabled" });
        }
        if (settings.events[cat] === false) {
          return json({ ok: true, emailed: false, reason: "event_muted" });
        }
      }
      recipients = settings.recipients;
    }
    if (recipients.length === 0) recipients = [FALLBACK_EMAIL];

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.warn("[SEND-SYSTEM-ALERT] RESEND_API_KEY not set, skipping email");
      return json({ ok: true, emailed: false, reason: "no_resend_key" });
    }

    const label = BILLING_LABELS[cat] ?? cat;
    const customerEmail = typeof d.email === "string" ? d.email : null;
    const invoiceUrl =
      typeof d.invoice_url === "string" && d.invoice_url.startsWith("https://")
        ? d.invoice_url
        : null;

    const subject = isBilling
      ? `[OutReign ${String(severity).toUpperCase()}] ${label}${customerEmail ? ` — ${customerEmail}` : ""}`
      : `[OutReign ${String(severity).toUpperCase()}] ${cat}`;

    const facts: string[] = [];
    if (customerEmail) facts.push(row("Customer", escapeHtml(customerEmail)));
    if (typeof d.plan === "string") facts.push(row("Plan", escapeHtml(d.plan)));
    if (typeof d.amount_due === "number") {
      facts.push(row("Amount due", `$${d.amount_due.toFixed(2)} ${String(d.currency ?? "usd").toUpperCase()}`));
    }
    if (typeof d.reason === "string") facts.push(row("Reason", escapeHtml(d.reason)));
    if (typeof d.next_payment_attempt === "string") {
      facts.push(row("Stripe retries", escapeHtml(d.next_payment_attempt.slice(0, 10))));
    }
    if (typeof d.access_until === "string") {
      facts.push(row("Access until", escapeHtml(d.access_until.slice(0, 10))));
    }

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:560px">
        <h2 style="color:#7c3aed;margin:0 0 12px">${escapeHtml(label)}</h2>
        <p style="margin:0 0 16px;font-size:15px">${escapeHtml(String(message ?? ""))}</p>
        ${facts.length ? `<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px">${facts.join("")}</table>` : ""}
        ${
          invoiceUrl
            ? `<p style="margin:0 0 20px"><a href="${invoiceUrl}" style="background:#7c3aed;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600">View invoice in Stripe</a></p>`
            : ""
        }
        <p style="margin:0 0 8px;color:#64748b;font-size:12px"><strong>Severity:</strong> ${escapeHtml(String(severity))} · <strong>Category:</strong> ${escapeHtml(cat)}</p>
        <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px">${escapeHtml(
          JSON.stringify(d, null, 2),
        )}</pre>
        <p style="margin:16px 0 0;color:#64748b;font-size:12px">Open Admin → ${isBilling ? "Billing &amp; Churn" : "Alerts"} to pause, restore or investigate this account.</p>
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
        to: recipients,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[SEND-SYSTEM-ALERT] Resend error", res.status, text);
      return json({ ok: false, error: "resend_failed", status: res.status });
    }

    return json({ ok: true, emailed: true, recipients: recipients.length });
  } catch (err) {
    console.error("[SEND-SYSTEM-ALERT] Exception", err);
    return json({ ok: false, error: (err as Error).message });
  }
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${label}</td><td style="padding:4px 0;font-weight:600">${value}</td></tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
