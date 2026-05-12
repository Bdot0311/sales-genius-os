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

  // Atomic claim: prevents concurrent deliveries of the same event from
  // double-processing. The DB function inserts (or locks) the row and only
  // returns claimed=true to one caller.
  const { data: claimRows, error: claimErr } = await supabase.rpc('claim_stripe_webhook_event', {
    _event_id: event.id,
    _event_type: event.type,
    _payload: event as unknown as Record<string, unknown>,
    _idempotency_key: event.id,
  });

  if (claimErr || !claimRows || claimRows.length === 0) {
    log("failed to claim event row", { err: claimErr });
    await logSystemAlert({
      category: "stripe_webhook_failure", severity: "critical",
      message: `Failed to claim webhook event: ${claimErr?.message}`,
      details: { event_id: event.id, type: event.type },
    });
    return new Response(JSON.stringify({ received: true, persisted: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const claim = claimRows[0] as {
    row_id: string; attempts: number; max_attempts: number;
    claimed: boolean; already_succeeded: boolean; in_progress: boolean;
  };

  if (claim.already_succeeded) {
    log("event already processed (idempotent)", { id: event.id });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (claim.in_progress) {
    log("event already in progress on another worker", { id: event.id });
    return new Response(JSON.stringify({ received: true, in_progress: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const row = { id: claim.row_id };
  const attempts = claim.attempts;
  const maxAttempts = claim.max_attempts ?? BACKOFF_MINUTES.length;

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
