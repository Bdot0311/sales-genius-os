import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return new Response('<html><body style="font-family:sans-serif;max-width:400px;margin:60px auto;text-align:center"><h2>Invalid unsubscribe link</h2></body></html>', {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  await supabase.from('email_optouts').upsert({ email: email.toLowerCase().trim(), opted_out_at: new Date().toISOString() }, { onConflict: 'email' });

  return new Response('<html><body style="font-family:-apple-system,sans-serif;max-width:400px;margin:80px auto;text-align:center;color:#333"><h2 style="font-weight:600">You\'ve been unsubscribed</h2><p style="color:#666">You won\'t receive any more emails from this sender.</p></body></html>', {
    headers: { ...corsHeaders, 'Content-Type': 'text/html' }
  });
});
