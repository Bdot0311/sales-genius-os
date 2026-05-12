import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logSystemAlert } from "../_shared/alerts.ts";
import { processStripeEvent } from "../_shared/process-stripe-event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BACKOFF_MINUTES = [1, 5, 15, 60, 360, 1440];
const BATCH_SIZE = 25;

const log = (s: string, d?: unknown) => console.log(`[STRIPE-RETRY] ${s}${d ? ' - ' + JSON.stringify(d) : ''}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const { data: due, error } = await supabase
    .from('stripe_webhook_events')
    .select('id, event_id, event_type, payload, attempts, max_attempts')
    .eq('status', 'failed')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    log("query error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  log(`processing ${due?.length ?? 0} due events`);
  const results: Array<{ id: string; status: string }> = [];

  for (const row of due ?? []) {
    const attempts = (row.attempts ?? 0) + 1;
    const maxAttempts = row.max_attempts ?? BACKOFF_MINUTES.length;

    // Mark processing to avoid concurrent picks
    await supabase.from('stripe_webhook_events').update({ status: 'processing' }).eq('id', row.id);

    try {
      const event = row.payload as unknown as Stripe.Event;
      await processStripeEvent(event, stripe, supabase);
      await supabase.from('stripe_webhook_events').update({
        status: 'succeeded', attempts, processed_at: new Date().toISOString(),
        last_error: null, next_retry_at: null,
      }).eq('id', row.id);
      results.push({ id: row.event_id, status: 'succeeded' });
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
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
          ? `Stripe webhook event ${row.event_id} hit dead-letter after ${attempts} attempts`
          : `Stripe webhook retry failed (attempt ${attempts}/${maxAttempts}); next in ${nextDelayMin}m`,
        details: { event_id: row.event_id, type: row.event_type, error: errMsg, next_retry_at: nextRetryAt },
        related_entity: row.event_id,
      });

      results.push({ id: row.event_id, status: isDead ? 'dead_letter' : 'failed' });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
