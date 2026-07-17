// check-domain-auth — validates SPF, DKIM, and DMARC for a sending domain over
// DoH, returns the exact records to add, and upserts the result into
// sending_domains. Honest: an unresolvable check is reported as 'unknown', never
// silently passed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders, validateDomain, dohQuery, txt } from "../_shared/dns.ts";

type AuthStatus = "pass" | "fail" | "unknown";

// DKIM selectors to probe, in order. Google's is 'google'; the rest are common.
const DKIM_SELECTORS = ["google", "selector1", "selector2", "default", "mail", "k1", "s1", "s2", "dkim", "em"];

interface RecommendedRecord {
  type: string;
  host: string;
  value: string;
  note?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { domain } = await req.json();
    if (!domain || !validateDomain(domain)) {
      return json({ error: "Invalid domain format" }, 400);
    }
    const root = String(domain).toLowerCase().replace(/^www\./, "");

    // ---- SPF ----
    const spfRecords = (await txt(root)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
    let spfStatus: AuthStatus = spfRecords.length === 0 ? "fail" : "pass";
    const spfIncludesGoogle = spfRecords.some((r) => r.toLowerCase().includes("_spf.google.com"));
    // Multiple SPF records is itself a failure per RFC 7208.
    if (spfRecords.length > 1) spfStatus = "fail";

    // ---- DMARC ----
    const dmarcRecords = (await txt(`_dmarc.${root}`)).filter((r) => r.toLowerCase().startsWith("v=dmarc1"));
    const dmarcStatus: AuthStatus = dmarcRecords.length >= 1 ? "pass" : "fail";

    // ---- DKIM (probe selectors) ----
    let dkimStatus: AuthStatus = "fail";
    let dkimSelector: string | null = null;
    let anyLookupErrored = false;
    for (const sel of DKIM_SELECTORS) {
      const res = await dohQuery(`${sel}._domainkey.${root}`, "TXT");
      if (res.status === -1) { anyLookupErrored = true; continue; }
      const hit = res.answers.find((r) => /v=dkim1|k=rsa|p=[A-Za-z0-9+/]/i.test(r));
      if (hit) { dkimStatus = "pass"; dkimSelector = sel; break; }
    }
    // If we never found DKIM but a lookup errored, we genuinely don't know.
    if (dkimStatus === "fail" && anyLookupErrored) dkimStatus = "unknown";

    // ---- Recommended records to fix any failures ----
    const recommended: RecommendedRecord[] = [];
    if (spfStatus !== "pass") {
      recommended.push({
        type: "TXT",
        host: root,
        value: "v=spf1 include:_spf.google.com ~all",
        note: spfRecords.length > 1
          ? "You have multiple SPF records — merge them into this single record."
          : "SPF authorizes Google to send for your domain.",
      });
    } else if (!spfIncludesGoogle) {
      recommended.push({
        type: "TXT",
        host: root,
        value: "v=spf1 include:_spf.google.com ~all",
        note: "Your SPF exists but doesn't include Google. Add include:_spf.google.com since you send via Gmail.",
      });
    }
    if (dkimStatus !== "pass") {
      recommended.push({
        type: "TXT",
        host: "google._domainkey",
        value: "(generate in Google Admin → Apps → Google Workspace → Gmail → Authenticate email)",
        note: "Turn on DKIM in Google Admin, then publish the key it gives you at this host.",
      });
    }
    if (dmarcStatus !== "pass") {
      recommended.push({
        type: "TXT",
        host: `_dmarc.${root}`,
        value: `v=DMARC1; p=none; rua=mailto:dmarc@${root}`,
        note: "Start at p=none to monitor, then tighten to quarantine/reject once SPF+DKIM are aligned.",
      });
    }

    // ---- Persist ----
    const { error: upsertError } = await supabase
      .from("sending_domains")
      .upsert({
        user_id: user.id,
        domain: root,
        spf_status: spfStatus,
        dkim_status: dkimStatus,
        dmarc_status: dmarcStatus,
        dkim_selector: dkimSelector,
        recommended_records: recommended,
        last_checked_at: new Date().toISOString(),
      }, { onConflict: "user_id,domain" });

    if (upsertError) {
      console.error("[check-domain-auth] upsert error:", upsertError);
    }

    return json({
      domain: root,
      spf: { status: spfStatus, includesGoogle: spfIncludesGoogle, records: spfRecords },
      dkim: { status: dkimStatus, selector: dkimSelector },
      dmarc: { status: dmarcStatus, records: dmarcRecords },
      recommended,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[check-domain-auth] error:", err);
    return json({ error: "Domain auth check failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
