import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logSystemAlert } from "../_shared/alerts.ts";
import { processStripeEvent } from "../_shared/process-stripe-event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[STRIPE-WEBHOOK] ${s}${d ? ' - ' + JSON.stringify(d) : ''}`);

// Exponential backoff: 1m, 5m, 15m, 1h, 6h, 24h
const BACKOFF_MINUTES = [1, 5, 15, 60, 360, 1440];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeSecretKey) return new Response("Server configuration error", { status: 500 });

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    if (!stripeWebhookSecret) {
      await logSystemAlert({
        category: "stripe_webhook_failure", severity: "critical",
        message: "STRIPE_WEBHOOK_SECRET not configured — webhook events cannot be verified",
      });
      return new Response("Server misconfiguration", { status: 500 });
    }
    if (!signature) return new Response("Missing stripe-signature header", { status: 400 });
    event = await stripe.webhooks.constructEventAsync(
      body, signature, stripeWebhookSecret, undefined, Stripe.createSubtleCryptoProvider()
    );
  } catch (err: any) {
    await logSystemAlert({
      category: "stripe_webhook_failure", severity: "error",
      message: `Stripe webhook signature verification failed: ${err.message}`,
      details: { error: err.message },
    });
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // Idempotency: if we've already succeeded this event, return early.
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('id, status, attempts, max_attempts')
    .eq('event_id', event.id).maybeSingle();

  if (existing?.status === 'succeeded') {
    log("event already processed", { id: event.id });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Insert (or reset) the event row to pending.
  const { data: row, error: upsertErr } = await supabase
    .from('stripe_webhook_events')
    .upsert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      status: 'pending',
      last_error: null,
      next_retry_at: null,
    }, { onConflict: 'event_id' })
    .select('id, attempts, max_attempts').single();

  if (upsertErr || !row) {
    log("failed to persist event row", { err: upsertErr });
    // Still return 200 so Stripe won't pile up; alert ops.
    await logSystemAlert({
      category: "stripe_webhook_failure", severity: "critical",
      message: `Failed to persist webhook event: ${upsertErr?.message}`,
      details: { event_id: event.id, type: event.type },
    });
    return new Response(JSON.stringify({ received: true, persisted: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const attempts = (row.attempts ?? 0) + 1;
  const maxAttempts = row.max_attempts ?? BACKOFF_MINUTES.length;

  try {
    await processStripeEvent(event, stripe, supabase);
    await supabase.from('stripe_webhook_events').update({
      status: 'succeeded', attempts, processed_at: new Date().toISOString(), last_error: null, next_retry_at: null,
    }).eq('id', row.id);
    return new Response(JSON.stringify({ received: true, processed: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    log("processing failed", { id: event.id, attempt: attempts, err: errMsg });

    const isDead = attempts >= maxAttempts;
    const nextDelayMin = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
    const nextRetryAt = isDead ? null : new Date(Date.now() + nextDelayMin * 60 * 1000).toISOString();

    await supabase.from('stripe_webhook_events').update({
      status: isDead ? 'dead_letter' : 'failed',
      attempts,
      last_error: errMsg.slice(0, 2000),
      next_retry_at: nextRetryAt,
    }).eq('id', row.id);

    await logSystemAlert({
      category: "stripe_webhook_failure",
      severity: isDead ? "critical" : "warning",
      message: isDead
        ? `Stripe webhook event hit dead-letter after ${attempts} attempts`
        : `Stripe webhook event failed (attempt ${attempts}/${maxAttempts}); will retry in ${nextDelayMin}m`,
      details: { event_id: event.id, type: event.type, error: errMsg, next_retry_at: nextRetryAt },
      related_entity: event.id,
    });

    // Always 200: we've persisted state and will retry ourselves.
    return new Response(JSON.stringify({ received: true, processed: false, will_retry: !isDead }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
