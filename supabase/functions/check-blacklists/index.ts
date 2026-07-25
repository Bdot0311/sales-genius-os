// check-blacklists — queries domain-based DNSBLs (DBLs) for a sending or tracking
// domain and logs results to blacklist_checks. Because OutReign sends through
// Gmail's IPs, IP-based RBLs are not meaningful here; we check the DOMAIN.
//
// Honesty: some DNSBLs block queries from large public resolvers/datacenter IPs.
// When a lookup can't be resolved, the result is 'unknown', never a false 'clean'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders, validateDomain, dohQuery } from "../_shared/dns.ts";

// Domain-based blacklists. Each returns a 127.0.0.x / 127.0.1.x A record when listed.
const DBLS: { name: string; zone: string }[] = [
  { name: "Spamhaus DBL", zone: "dbl.spamhaus.org" },
  { name: "SURBL multi", zone: "multi.surbl.org" },
  { name: "URIBL", zone: "multi.uribl.com" },
];

type ListStatus = "listed" | "clean" | "unknown";

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

    const results = await Promise.all(
      DBLS.map(async ({ name, zone }) => {
        const res = await dohQuery(`${target}.${zone}`, "A");
        let status: ListStatus;
        let detail: string;

        if (res.status === 3) {
          // NXDOMAIN — the definitive "not listed" answer.
          status = "clean";
          detail = "Not listed";
        } else if (res.status === 0 && res.answers.length > 0) {
          // Several DNSBLs refuse queries from shared/public resolvers (we query
          // via Cloudflare) and answer with a sentinel that is NOT a real listing:
          //  - 127.255.255.x        → Spamhaus "public resolver / error"
          //  - 127.0.0.1            → URIBL/SURBL "query refused via public resolver"
          // Treat those as "unknown", never as "listed".
          const isBlockedSentinel = (a: string) => a.startsWith("127.255.255.") || a === "127.0.0.1";
          const allBlocked = res.answers.every(isBlockedSentinel);
          if (allBlocked) {
            status = "unknown";
            detail = "Query refused by the DNSBL (public-resolver limit), not a listing";
          } else {
            // A genuine listing uses codes >= 127.0.0.2. Report only the non-sentinel codes.
            const realCodes = res.answers.filter((a) => !isBlockedSentinel(a));
            status = "listed";
            detail = `Listed: ${realCodes.join(", ")}`;
          }
        } else {
          status = "unknown";
          detail = "No definitive answer";
        }

        return { rbl_name: name, status, listed: status === "listed", detail };
      }),
    );

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
        const rows = results
          .filter((r) => r.status !== "unknown")
          .map((r) => ({
            user_id: userId!,
            target,
            target_type: "domain",
            rbl_name: r.rbl_name,
            listed: r.listed,
            detail: r.detail,
          }));
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
