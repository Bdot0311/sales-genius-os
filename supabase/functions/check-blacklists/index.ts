// check-blacklists — queries domain-based DNSBLs (DBLs) for a sending or tracking
// domain and logs results to blacklist_checks. Because OutReign sends through
// Gmail's IPs, IP-based RBLs are not meaningful here; we check the DOMAIN.
//
// Honesty: some DNSBLs block queries from large public resolvers/datacenter IPs.
// When a lookup can't be resolved, the result is 'unknown', never a false 'clean'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders, validateDomain } from "../_shared/dns.ts";
// The lookup logic is shared with blacklist-sweep, the nightly job, so the
// button in the dashboard and the cron cannot answer differently about the
// same domain.
import { checkDomainAgainstDnsbls, persistableRows } from "../_shared/dnsbl.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Parse first — the DNSBL lookups need no auth, so a missing/expired token
    // must not stop the user from seeing results.
    const { domain } = await req.json().catch(() => ({ domain: undefined }));
    if (!domain || !validateDomain(domain)) {
      return json({ error: "Invalid domain format" }, 400);
    }
    const target = String(domain).toLowerCase().replace(/^www\./, "");

    const results = await checkDomainAgainstDnsbls(target);

    // Best-effort: log determinate results to history if the caller is authed.
    // Validate the JWT via anon client, then insert with the service role so RLS
    // on blacklist_checks cannot silently drop the write.
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      let userId: string | null = null;
      if (authHeader) {
        const authClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const { data: { user } } = await authClient.auth.getUser(token);
        userId = user?.id ?? null;
      }
      if (userId && serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey);
        const rows = persistableRows(results, userId, target);
        if (rows.length > 0) {
          const { error: insErr } = await admin.from("blacklist_checks").insert(rows);
          if (insErr) console.error("[check-blacklists] insert error:", insErr);
        }
      }
    } catch (persistErr) {
      console.error("[check-blacklists] persist step failed (non-fatal):", persistErr);
    }

    const listedCount = results.filter((r) => r.status === "listed").length;
    return json({
      domain: target,
      listedCount,
      anyUnknown: results.some((r) => r.status === "unknown"),
      results,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[check-blacklists] error:", err);
    return json({ error: "Blacklist check failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
