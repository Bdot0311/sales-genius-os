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
          // Return codes 127.255.255.x signal a blocked/error query, not a listing.
          const blocked = res.answers.every((a) => a.startsWith("127.255.255."));
          if (blocked) {
            status = "unknown";
            detail = "Query blocked by the DNSBL (public-resolver limit)";
          } else {
            status = "listed";
            detail = `Listed: ${res.answers.join(", ")}`;
          }
        } else {
          status = "unknown";
          detail = "No definitive answer";
        }

        return { rbl_name: name, status, listed: status === "listed", detail };
      }),
    );

    // Log every determinate result to history (skip 'unknown' to avoid noise).
    const rows = results
      .filter((r) => r.status !== "unknown")
      .map((r) => ({
        user_id: user.id,
        target,
        target_type: "domain",
        rbl_name: r.rbl_name,
        listed: r.listed,
        detail: r.detail,
      }));
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("blacklist_checks").insert(rows);
      if (insErr) console.error("[check-blacklists] insert error:", insErr);
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
