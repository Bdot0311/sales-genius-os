import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const html = (body: string) =>
  new Response(
    `<html><body style="font-family:-apple-system,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#333">${body}</body></html>`,
    { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
  );

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return html('<h2 style="font-weight:600">Invalid unsubscribe link</h2><p style="color:#666">Missing token.</p>');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Validate token against email_unsubscribe_tokens table
  const { data: tokenRecord, error: lookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('email, used_at')
    .eq('token', token)
    .maybeSingle();

  if (lookupError || !tokenRecord) {
    return html('<h2 style="font-weight:600">Invalid unsubscribe link</h2><p style="color:#666">This link is not valid.</p>');
  }

  const email = tokenRecord.email;

  // Mark token used (idempotent — second visit just re-confirms)
  await supabase
    .from('email_unsubscribe_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);

  // Record the opt-out
  await supabase.from('email_optouts').upsert(
    { email: email.toLowerCase().trim(), opted_out_at: new Date().toISOString() },
    { onConflict: 'email' }
  );

  return html('<h2 style="font-weight:600">You\'ve been unsubscribed</h2><p style="color:#666">You won\'t receive any more emails from this sender.</p>');
});
