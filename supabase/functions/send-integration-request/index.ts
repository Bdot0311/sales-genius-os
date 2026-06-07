import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { rateLimit, rateLimitResponse, clientIp } from "../_shared/rate-limit.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Light input validator — no Zod to keep cold-start fast
function clean(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t || t.length > max) return null;
  return t;
}

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const name = clean(body.name, 200);
    const email = clean(body.email, 320);
    const company = clean(body.company, 200);
    const integration = clean(body.integration, 100);
    const description = clean(body.description, 4000);
    const useCase = clean(body.useCase, 4000);

    if (!name || !email || !company || !integration || !description || !useCase) {
      return new Response(JSON.stringify({ error: "Missing or invalid fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const notifyTo = Deno.env.get("NOTIFICATION_EMAIL") || "support@bdotindustries.com";

    const subject = `Integration request: ${integration}`;
    const text =
`New integration request

Integration: ${integration}
From: ${name} <${email}>
Company: ${company}

Description:
${description}

Use case:
${useCase}`;

    await supabase.rpc("enqueue_email", {
      queue_name: "email_queue",
      payload: {
        purpose: "transactional",
        to: notifyTo,
        reply_to: email,
        subject,
        text,
        html: text.replace(/\n/g, "<br/>"),
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("send-integration-request error:", error?.message ?? error);
    return new Response(
      JSON.stringify({ success: false, error: "Could not submit request" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
