import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  console.log(`[replay-webhook] ${step}`, details || '');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Starting webhook replay');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { deliveryIds } = await req.json();
    logStep('Replay request', { deliveryIds, userId: user.id });

    if (!deliveryIds || !Array.isArray(deliveryIds) || deliveryIds.length === 0) {
      throw new Error('Delivery IDs are required');
    }

    // Fetch the delivery records
    const { data: deliveries, error: fetchError } = await supabase
      .from('webhook_deliveries')
      .select('*, webhooks!inner(*)')
      .in('id', deliveryIds)
      .eq('webhooks.user_id', user.id);

    if (fetchError) throw fetchError;

    if (!deliveries || deliveries.length === 0) {
      throw new Error('No deliveries found');
    }

    const replayResults = [];

    // Replay each webhook delivery
    for (const delivery of deliveries) {
      const webhook = delivery.webhooks;
      
      try {
        logStep(`Replaying delivery ${delivery.id}`, {
          webhookId: webhook.id,
          event: delivery.event,
        });

        // Generate signature
        const signature = createHmac('sha256', webhook.secret)
          .update(JSON.stringify(delivery.payload))
          .digest('hex');

        // Send webhook
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': delivery.event,
            'X-Webhook-Delivery-Id': delivery.id,
            'X-Webhook-Replay': 'true',
          },
          body: JSON.stringify(delivery.payload),
        });

        const responseBody = await response.text();
        const status = response.status;
        const success = status >= 200 && status < 300;

        logStep(`Replay ${success ? 'succeeded' : 'failed'}`, {
          deliveryId: delivery.id,
          status,
        });

        // Create new delivery record for the replay
        const { data: newDelivery, error: insertError } = await supabase
          .from('webhook_deliveries')
          .insert({
            webhook_id: webhook.id,
            event: delivery.event,
            payload: delivery.payload,
            status: success ? 'delivered' : 'failed',
            response_status: status,
            response_body: responseBody.substring(0, 1000),
            attempt_count: 1,
            last_attempt_at: new Date().toISOString(),
            completed_at: success ? new Date().toISOString() : null,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        replayResults.push({
          originalDeliveryId: delivery.id,
          newDeliveryId: newDelivery.id,
          success,
          status,
        });

        // Update webhook stats on success
        if (success) {
          await supabase
            .from('webhooks')
            .update({
              last_triggered_at: new Date().toISOString(),
              total_triggers: webhook.total_triggers + 1,
            })
            .eq('id', webhook.id);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep(`Error replaying delivery ${delivery.id}`, errorMessage);
        replayResults.push({
          originalDeliveryId: delivery.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Webhook replay completed',
        results: replayResults,
        totalReplayed: replayResults.length,
        successful: replayResults.filter(r => r.success).length,
        failed: replayResults.filter(r => !r.success).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('Error', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
