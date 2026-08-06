import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

// Real, free funding signals from SEC EDGAR Form D filings.
//
// A Form D is the notice a US company files when it raises money in a private
// (Reg D) offering, so a recent Form D from a target account is a genuine, timely
// "they just raised" signal. EDGAR's full-text search API is public and free (it
// only asks for a descriptive User-Agent). We match filings back to the lead's
// company by cleaned legal name, keep only recent ones, and write the newest to
// signal_events, where Lead Score v2 folds it into intent and decays it by age.
//
// Form D is filed by legal entity name (no domain), so matching is name-only and
// therefore kept deliberately strict: we require the cleaned filing name to equal
// the cleaned company name. Precision over recall — a wrong funding signal is
// worse than a missed one.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SEC asks callers to identify themselves with a descriptive UA incl. contact.
const UA = "OutReign Signals support@bdotindustries.com";
const FETCH_TIMEOUT_MS = 8000;
const RECENT_DAYS = 180; // a funding signal older than this is not worth firing

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Strip entity noise (Inc, LLC, punctuation, generic tokens) so "Acme, Inc." and
// "ACME" compare equal, while keeping enough to avoid matching "Acme Capital".
function cleanName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(cik[^)]*\)/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|l\.l\.c|corp|corporation|ltd|limited|co|company|holdings|group|technologies|technology|labs|software|systems|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) return json({ error: "Invalid user token" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    if (!leadId) return json({ error: "leadId is required", error_code: "invalid_input" }, 400);

    const { data: lead } = await supabase
      .from("leads").select("id, company_name")
      .eq("id", leadId).eq("user_id", user.id).maybeSingle();
    if (!lead) return json({ error: "lead not found", error_code: "not_found" }, 404);

    const company = (lead.company_name || "").trim();
    const wanted = cleanName(company);
    // Too generic / empty names would match half of EDGAR — skip them.
    if (!company || company.toLowerCase() === "unknown" || wanted.length < 3) {
      return json({ detected: false, reason: "no usable company name to match" });
    }

    const enddt = new Date().toISOString().slice(0, 10);
    const startdt = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${company}"`)}&forms=D&startdt=${startdt}&enddt=${enddt}`;

    let data: any = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
      if (r.ok) data = await r.json();
    } catch {
      // network/timeout: treat as no signal this pass
    } finally {
      clearTimeout(timer);
    }

    const hits: any[] = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
    // Keep only filings whose cleaned name equals the company's cleaned name.
    const matches = hits
      .map((h) => {
        const src = h?._source ?? {};
        const name = Array.isArray(src.display_names) ? String(src.display_names[0] || "") : "";
        const accession = String(src.adsh || (typeof h._id === "string" ? h._id.split(":")[0] : "") || "");
        return { name, accession, fileDate: String(src.file_date || ""), cik: Array.isArray(src.ciks) ? src.ciks[0] : null };
      })
      .filter((m) => m.accession && m.fileDate && cleanName(m.name) === wanted)
      .sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));

    const newest = matches[0];
    if (!newest) return json({ detected: false, reason: "no matching recent Form D" });

    const signalKey = `funding_raised:${newest.accession}`;
    const { data: existing } = await supabase
      .from("signal_events").select("metadata")
      .eq("lead_id", leadId).eq("user_id", user.id).ilike("source", "sec:%").limit(50);
    const already = (existing || []).some((e: any) => e?.metadata?.signal_key === signalKey);
    if (already) return json({ detected: true, deduped: true, signal_type: "funding_raised" });

    const { error: insErr } = await supabase.from("signal_events").insert({
      lead_id: leadId,
      user_id: user.id,
      signal_type: "funding_raised",
      weight: 40, // funding is a strong, high-priority signal
      occurred_at: new Date(newest.fileDate).toISOString(),
      source: "sec:formd",
      metadata: {
        signal_key: signalKey,
        accession: newest.accession,
        filing_name: newest.name,
        file_date: newest.fileDate,
        cik: newest.cik,
        filing_url: newest.cik
          ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${newest.cik}&type=D`
          : "https://www.sec.gov/cgi-bin/srqsb",
        company_name: company,
      },
    });
    if (insErr) return json({ error: "could not record signal", error_code: "db_error" }, 500);

    return json({
      detected: true,
      signal_type: "funding_raised",
      filing_name: newest.name,
      file_date: newest.fileDate,
    });
  } catch (e) {
    console.error("[detect-funding-signals] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
