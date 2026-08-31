import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isValidWebhookUrl } from "../_shared/webhook-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) =>
  console.log(`[DISPATCH-WEBHOOKS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const sign = async (secret: string, body: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  // Accept the configured service key, or any JWT minted with the service_role claim
  // (cron jobs may carry the legacy JWT-format service key).
  let isServiceRole = Boolean(token && serviceKey && token === serviceKey);
  if (!isServiceRole && token.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      isServiceRole = payload?.role === "service_role";
    } catch { /* not a readable JWT */ }
  }
  if (!isServiceRole) {
    log("Unauthorized invocation");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const nowIso = new Date().toISOString();

    const { data: pending, error } = await supabase
      .from("webhook_deliveries")
      .select("id, webhook_id, event, payload, attempt_count, webhooks(id, url, secret, is_active, direction, total_triggers)")
      .eq("direction", "outbound")
      .eq("status", "pending")
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    if (!pending?.length) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Dispatching", { count: pending.length });

    const results = await Promise.allSettled(
      pending.map(async (d: any) => {
        const hook = d.webhooks;
        const attempt = (d.attempt_count ?? 0) + 1;

        const fail = async (reason: string, status?: number) => {
          const permanent = attempt >= 5;
          await supabase
            .from("webhook_deliveries")
            .update({
              status: permanent ? "permanently_failed" : "pending",
              attempt_count: attempt,
              last_attempt_at: new Date().toISOString(),
              response_status: status ?? null,
              response_body: reason.substring(0, 1000),
              next_retry_at: permanent
                ? null
                : new Date(Date.now() + Math.min(60_000 * 2 ** attempt, 3_600_000)).toISOString(),
            })
            .eq("id", d.id);
          return { id: d.id, success: false, reason };
        };

        if (!hook || hook.is_active === false) return fail("Webhook inactive or missing");
        if (!isValidWebhookUrl(hook.url)) return fail("Webhook URL blocked for security");

        const body = JSON.stringify(d.payload);
        let signature = "";
        try {
          signature = await sign(hook.secret ?? "", body);
        } catch { /* unsigned */ }

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15_000);
          const res = await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Event": d.event,
              ...(signature ? { "X-Webhook-Signature": signature } : {}),
            },
            body,
            signal: controller.signal,
          });
          clearTimeout(timer);

          const text = (await res.text()).substring(0, 1000);
          if (!res.ok) return fail(`HTTP ${res.status}: ${text}`, res.status);

          await supabase
            .from("webhook_deliveries")
            .update({
              status: "success",
              attempt_count: attempt,
              response_status: res.status,
              response_body: text,
              last_attempt_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              next_retry_at: null,
            })
            .eq("id", d.id);

          await supabase
            .from("webhooks")
            .update({
              last_triggered_at: new Date().toISOString(),
              total_triggers: (hook.total_triggers ?? 0) + 1,
            })
            .eq("id", hook.id);

          return { id: d.id, success: true };
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      }),
    );

    const delivered = results.filter(
      (r) => r.status === "fulfilled" && (r.value as any)?.success,
    ).length;

    return new Response(
      JSON.stringify({ dispatched: pending.length, delivered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
