import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompanyCandidate {
  id_or_domain: string;
  name: string;
  domain: string;
  location?: string;
  employee_range?: string;
}

// Defensive field pluck — the upstream company object shape isn't strictly typed.
function first(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function normalizeCompany(raw: Record<string, unknown>): CompanyCandidate | null {
  const name = first(raw, ["name", "company_name", "company", "organization", "company_display_name"]);
  const domain = first(raw, ["domain", "company_domain", "website", "company_website"])
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  if (!name && !domain) return null;
  const location = first(raw, ["location", "company_location", "hq_location", "city_state"]) || undefined;
  const employee_range = first(raw, ["employee_range", "company_size", "employee_count", "size", "employees"]) || undefined;
  return { id_or_domain: domain || name, name: name || domain, domain, location, employee_range };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    // Auth — same JWT pattern as fetch-external-leads.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required", companies: [] }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    // Demo mode: simulate instead of hitting providers or spending credits
    if (user && await isDemoMode(supabase, user.id)) {
      return demoResponse({ companies: [], message: 'Company search simulated in demo mode — no credits spent.' }, corsHeaders);
    }
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user token", companies: [] }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Autocomplete is free/unmetered, but rate-limit to prevent abuse (client also debounces).
    const rl = await rateLimit(`search-companies:${user.id}`, 60, 60);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    const { query } = await req.json().catch(() => ({ query: "" }));
    const q = typeof query === "string" ? query.trim() : "";
    if (q.length < 2) {
      return new Response(JSON.stringify({ companies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const railwayBaseUrl = Deno.env.get("RAILWAY_LEADS_API_URL");
    if (!railwayBaseUrl) {
      console.error("[search-companies] RAILWAY_LEADS_API_URL not configured");
      return new Response(JSON.stringify({ companies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const baseUrl = railwayBaseUrl.replace(/\/+$/, "").replace(/\/(search|docs|health)$/, "");
    // enrich=false keeps this free (no Wiza credits) — this is autocomplete only.
    const url = `${baseUrl}/company/search?enrich=false&enrich_limit=8`;

    const railwayApiKey = Deno.env.get("RAILWAY_API_KEY");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (railwayApiKey) {
      headers["Authorization"] = `Bearer ${railwayApiKey}`;
      headers["X-API-Key"] = railwayApiKey;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ company: q, limit: 8 }),
      });
    } catch (e) {
      console.error("[search-companies] upstream fetch failed:", e instanceof Error ? e.message : e);
      return new Response(JSON.stringify({ companies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!res.ok) {
      console.warn("[search-companies] upstream status:", res.status);
      return new Response(JSON.stringify({ companies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json().catch(() => null);
    // Upstream may nest the array under any of these keys.
    let rawCompanies: Record<string, unknown>[] = [];
    if (Array.isArray(data)) {
      rawCompanies = data;
    } else if (data && typeof data === "object") {
      for (const k of ["companies", "results", "data", "leads", "items"]) {
        const arr = (data as Record<string, unknown>)[k];
        if (Array.isArray(arr) && arr.length) { rawCompanies = arr as Record<string, unknown>[]; break; }
      }
    }

    const seen = new Set<string>();
    const companies: CompanyCandidate[] = [];
    for (const raw of rawCompanies) {
      const c = normalizeCompany(raw);
      if (!c) continue;
      const key = c.id_or_domain.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      companies.push(c);
      if (companies.length >= 8) break;
    }

    return new Response(JSON.stringify({ companies }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[search-companies] error:", error instanceof Error ? error.message : error);
    // Never surface provider details; degrade to empty so the picker just shows no matches.
    return new Response(JSON.stringify({ companies: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
