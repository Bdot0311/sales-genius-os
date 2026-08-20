// blacklist-sweep — nightly DNSBL check across every sending domain.
//
// check-blacklists only ever ran when a user pressed the button in the
// dashboard, but deliverability-alerts-scan raises its blacklist alerts by
// reading the blacklist_checks table. So the "monitoring" was: nothing checked
// anything unless a human remembered to, and the nightly scan re-reported
// whatever was last checked by hand. A domain listed on Saturday stayed
// unreported until someone happened to look.
//
// This runs before the alerts scan (05:45 vs 06:15) so the alerts it raises
// are drawn from results measured hours earlier rather than weeks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";
import { validateDomain } from "../_shared/dns.ts";
import { checkDomainAgainstDnsbls, persistableRows } from "../_shared/dnsbl.ts";

// Each domain costs three DNS lookups. The cap is a runaway guard, not a
// product limit — it is far above any plausible number of sending domains, and
// the count is logged so hitting it is visible rather than silent.
const MAX_DOMAINS = 500;
const CONCURRENCY = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Unlike the other deliverability crons this one is guarded: it is an
  // unauthenticated trigger for a few hundred outbound DNS queries, which is
  // worth not leaving open.
  const denied = requireServiceRole(req);
  if (denied) return denied;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: domains, error } = await supabase
      .from("sending_domains")
      .select("user_id, domain")
      .limit(MAX_DOMAINS);
    if (error) {
      console.error("[blacklist-sweep] could not load domains:", error.message);
      return json({ error: "could not load sending domains" }, 500);
    }

    // The same domain can be registered by more than one user; check it once
    // and write a row for each owner rather than querying the DBLs per owner.
    const owners = new Map<string, string[]>();
    for (const d of domains ?? []) {
      const domain = String(d.domain ?? "").toLowerCase().trim();
      if (!domain || !validateDomain(domain)) continue;
      owners.set(domain, [...(owners.get(domain) ?? []), d.user_id]);
    }

    const targets = [...owners.keys()];
    let checked = 0;
    let listed = 0;

    // Serial batches: a nightly job has no deadline, and firing hundreds of
    // DNSBL queries at once is how you get rate-limited into `unknown`.
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (domain) => {
          const results = await checkDomainAgainstDnsbls(domain);
          checked++;
          if (results.some((r) => r.listed)) listed++;

          const rows = (owners.get(domain) ?? []).flatMap((userId) =>
            persistableRows(results, userId, domain),
          );
          if (rows.length === 0) return; // every lookup came back unknown

          const { error: insErr } = await supabase.from("blacklist_checks").insert(rows);
          if (insErr) console.error(`[blacklist-sweep] insert failed for ${domain}:`, insErr.message);
        }),
      );
    }

    console.log(
      `[blacklist-sweep] domains=${checked} listed=${listed}` +
        (targets.length >= MAX_DOMAINS ? ` (capped at ${MAX_DOMAINS} — some domains were not checked)` : ""),
    );
    return json({ ok: true, checked, listed });
  } catch (err) {
    console.error("[blacklist-sweep] error:", err);
    return json({ error: "sweep failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
