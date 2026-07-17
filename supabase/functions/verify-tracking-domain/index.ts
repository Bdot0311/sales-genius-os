// verify-tracking-domain — validates that a custom tracking subdomain's CNAME
// points at the expected OutReign tracking target, then flips tracking_domains
// to verified. A dedicated tracking domain avoids shared-domain reputation drag.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders, validateDomain, dohQuery } from "../_shared/dns.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { domain } = await req.json();
    if (!domain || !validateDomain(domain)) {
      return json({ error: "Invalid domain format" }, 400);
    }
    const host = String(domain).toLowerCase();

    // The tracking domain row must already exist (created when the user adds it),
    // so we know the expected target and enforce ownership via RLS.
    const { data: row, error: rowError } = await supabase
      .from("tracking_domains")
      .select("id, target")
      .eq("user_id", user.id)
      .eq("domain", host)
      .maybeSingle();

    if (rowError) {
      console.error("[verify-tracking-domain] lookup error:", rowError);
      return json({ error: "Lookup failed" }, 500);
    }
    if (!row) {
      return json({ error: "Tracking domain not found. Add it first." }, 404);
    }

    const expected = String(row.target).toLowerCase().replace(/\.$/, "");
    const cname = await dohQuery(host, "CNAME");
    const found = cname.answers.map((a) => a.toLowerCase().replace(/\.$/, ""));
    const matches = found.some((f) => f === expected);

    const status = matches ? "verified" : "failed";
    await supabase
      .from("tracking_domains")
      .update({
        status,
        verified: matches,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return json({
      domain: host,
      verified: matches,
      status,
      expected,
      found,
      hint: matches
        ? undefined
        : `Add a CNAME record: host "${host}" → "${expected}". DNS changes can take up to an hour to propagate.`,
    });
  } catch (err) {
    console.error("[verify-tracking-domain] error:", err);
    return json({ error: "Tracking domain verification failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
