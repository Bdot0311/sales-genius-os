import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  const unauth = requireServiceRole(req);
  if (unauth) return unauth;

  try {

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const NOTIFICATION_EMAIL = Deno.env.get('NOTIFICATION_EMAIL') || 'sales@alephwave.io';

    const { record } = await req.json();

    const userEmail = record?.email || 'Unknown';
    const fullName = record?.full_name || 'No name provided';
    const signupTime = new Date(record?.created_at || Date.now()).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use Lovable's transactional email infrastructure
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'signup-notification',
        recipientEmail: NOTIFICATION_EMAIL,
        idempotencyKey: `signup-notify-${record?.id || userEmail}-${Date.now()}`,
        templateData: {
          userName: fullName,
          userEmail: userEmail,
          plan: 'Free',
          signupDate: signupTime,
        },
      },
    });

    if (error) {
      console.error('Error sending signup notification:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Signup notification queued for:', userEmail);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending signup notification:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
