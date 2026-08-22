// Find a person by name.
//
// The other entry points start from an ICP, a website, or a company list. This
// one starts from a person you already know of: "Jane Doe at Acme" — or an
// email, or a LinkedIn profile — and fills in the rest of the contact record.
//
// It reuses the same upstream verb as enrich-lead (Railway /enrich, which takes
// EXACTLY ONE of full_name+company, email, or linkedin_url) and the same credit
// rules: paid plan only, one credit, refunded when nothing matched.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeLinkedInUrl(url: string | null, kind: "profile" | "company" = "profile"): string | null {
  if (!url) return null;
  let cleaned = String(url).trim();
  if (!cleaned || cleaned.toLowerCase() === "linkedin") return null;
  if (!cleaned.startsWith("http")) cleaned = "https://" + cleaned;
  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname.includes("linkedin.com")) return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    const expected = kind === "company" ? /^\/(company|school)\/[^/]+/ : /^\/(in|pub)\/[^/]+/;
    if (!expected.test(path)) return null;
    return `https://www.linkedin.com${path}`;
  } catch {
    return null;
  }
}

function cleanDomain(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return d.includes(".") ? d.toLowerCase() : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (user && await isDemoMode(supabase, user.id)) {
      return demoResponse(
        { person: null, message: "People search simulated in demo mode — no credits spent." },
        corsHeaders,
      );
    }
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    const rl = await rateLimit(`find-person:${user.id}`, 20, 60);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const domain = cleanDomain(body.company_domain);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const linkedin = normalizeLinkedInUrl(typeof body.linkedin_url === "string" ? body.linkedin_url : null);

    // Railway /enrich accepts exactly one identifier. Prefer the strongest one
    // the user gave us: a LinkedIn profile, then an email, then name+company.
    const enrichPayload: Record<string, string> = {};
    if (linkedin) enrichPayload.linkedin_url = linkedin;
    else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) enrichPayload.email = email;
    else if (fullName.split(/\s+/).length >= 2 && (company || domain)) {
      enrichPayload.full_name = fullName;
      enrichPayload.company = company || domain!;
    }

    if (Object.keys(enrichPayload).length === 0) {
      return json({
        person: null,
        error:
          "Give a full name plus their company (or a work email, or a LinkedIn profile URL) so we know who to look up.",
        error_code: "insufficient_input",
      });
    }

    // Plan + credit gating, identical to enrich-lead.
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = adminRole?.role === "admin";

    let creditWasDeducted = false;
    if (!isAdmin) {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan, status, search_credits_remaining")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!subscription || subscription.plan === "free") {
        return json({
          person: null,
          error: "People search requires a paid plan. Upgrade to Growth to unlock contact lookups.",
          error_code: "free_tier_blocked",
          upgrade_plan: "growth",
        });
      }

      const remaining = subscription.search_credits_remaining || 0;
      if (remaining <= 0) {
        return json({
          person: null,
          error: "No search credits remaining. Add more credits to look up contacts.",
          error_code: "credits_exhausted",
        });
      }

      const { error: deductError } = await supabase
        .from("subscriptions")
        .update({ search_credits_remaining: remaining - 1 })
        .eq("user_id", user.id);
      if (deductError) {
        console.error("[find-person] credit deduction failed:", deductError.message);
        return json({ person: null, error: "Could not reserve a credit. Try again." }, 200);
      }
      creditWasDeducted = true;
      await supabase.from("search_transactions").insert({
        user_id: user.id,
        type: "usage",
        amount: -1,
        balance_after: remaining - 1,
        description: "People search",
      });
    }

    const refundCredit = async (reason: string) => {
      if (!creditWasDeducted) return;
      creditWasDeducted = false;
      try {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("search_credits_remaining")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!sub) return;
        const restored = (sub.search_credits_remaining || 0) + 1;
        await supabase.from("subscriptions")
          .update({ search_credits_remaining: restored })
          .eq("user_id", user.id);
        await supabase.from("search_transactions").insert({
          user_id: user.id,
          type: "refund",
          amount: 1,
          balance_after: restored,
          description: `People search refund: ${reason}`,
        });
      } catch (e) {
        console.error("[find-person] refund failed:", e instanceof Error ? e.message : e);
      }
    };

    const railwayBaseUrl = Deno.env.get("RAILWAY_LEADS_API_URL");
    if (!railwayBaseUrl) {
      await refundCredit("provider_unconfigured");
      return json({ person: null, error: "Lead provider is not configured yet." });
    }
    const baseUrl = railwayBaseUrl.replace(/\/+$/, "").replace(/\/(search|docs|health)$/, "");
    const railwayApiKey = Deno.env.get("RAILWAY_API_KEY");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (railwayApiKey) {
      headers["Authorization"] = `Bearer ${railwayApiKey}`;
      headers["X-API-Key"] = railwayApiKey;
    }

    let raw: any = null;
    try {
      const res = await fetch(`${baseUrl}/enrich`, {
        method: "POST",
        headers,
        body: JSON.stringify(enrichPayload),
      });
      console.log("[find-person] /enrich status:", res.status, "by", Object.keys(enrichPayload).join("+"));
      if (res.ok) raw = await res.json();
      else console.warn("[find-person] upstream error:", (await res.text().catch(() => "")).slice(0, 400));
    } catch (e) {
      console.error("[find-person] upstream fetch failed:", e instanceof Error ? e.message : e);
    }

    if (!raw || raw.error) {
      await refundCredit("no_match");
      return json({
        person: null,
        error: "No matching contact found. Try adding their company domain, work email, or LinkedIn URL.",
        error_code: "no_match",
      });
    }

    const root = raw.lead ?? raw;
    const p = root.person ?? root.contact ?? root.response ?? root;
    const c = root.company ?? p?.company ?? root;

    const resolvedName = [p.first_name, p.last_name].filter(Boolean).join(" ")
      || p.full_name || p.name || p.contact_name || fullName || null;
    const resolvedEmail = p.email?.value ?? p.email ?? p.business_email ?? (email || null);
    const resolvedCompany = c.name ?? c.company_name ?? root.company_name ?? (company || null);
    const website = c.website ?? c.domain ?? root.company_domain ?? domain;

    // A record with neither a name nor an email is not a usable contact.
    if (!resolvedName && !resolvedEmail) {
      await refundCredit("no_match");
      return json({
        person: null,
        error: "No matching contact found. Try adding their company domain, work email, or LinkedIn URL.",
        error_code: "no_match",
      });
    }

    const person: Record<string, unknown> = {
      contact_name: resolvedName,
      contact_email: resolvedEmail || null,
      contact_phone: p.phone ?? p.phone_number ?? p.mobile_phone ?? null,
      job_title: p.job_title ?? p.title ?? null,
      seniority: p.seniority ?? null,
      linkedin_url: normalizeLinkedInUrl(p.linkedin_url ?? p.linkedInUrl ?? linkedin, "profile"),
      company_name: resolvedCompany,
      company_website: website ? (String(website).startsWith("http") ? website : `https://${cleanDomain(website)}`) : null,
      company_linkedin: normalizeLinkedInUrl(c.linkedin_url ?? c.linkedInUrl ?? null, "company"),
      industry: c.industry ?? root.industry ?? root.company_industry ?? null,
      employee_count: (() => {
        const s = c.size ?? c.employee_count ?? c.employeeRange ?? root.company_size;
        return s ? String(s) : null;
      })(),
      company_description: c.description ?? root.company_description ?? null,
    };
    const rawCountry = p.country ?? p.location_country ?? p.country_code ?? p.location ?? c.country ?? null;
    const country = typeof rawCountry === "string" && rawCountry.trim() ? rawCountry.trim().slice(0, 100) : null;

    // Save (or refresh) the lead so the result is immediately usable everywhere
    // else — sequences, the SDR, outreach. Matching on email first, then on
    // name+company, keeps a repeat lookup from creating a duplicate record.
    let leadId: string | null = null;
    let created = false;
    try {
      let existing: { id: string } | null = null;
      if (person.contact_email) {
        const { data } = await supabase.from("leads")
          .select("id").eq("user_id", user.id)
          .ilike("contact_email", String(person.contact_email)).limit(1).maybeSingle();
        existing = data ?? null;
      }
      if (!existing && person.contact_name && person.company_name) {
        const { data } = await supabase.from("leads")
          .select("id").eq("user_id", user.id)
          .ilike("contact_name", String(person.contact_name))
          .ilike("company_name", String(person.company_name))
          .limit(1).maybeSingle();
        existing = data ?? null;
      }

      const record: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(person)) if (v) record[k] = v;
      record.enrichment_status = "enriched";
      record.enriched_at = new Date().toISOString();

      if (existing) {
        leadId = existing.id;
        await supabase.from("leads").update(record).eq("id", existing.id).eq("user_id", user.id);
      } else {
        const { data, error } = await supabase.from("leads")
          .insert({
            ...record,
            user_id: user.id,
            company_name: person.company_name ?? "Unknown company",
            contact_name: person.contact_name ?? String(person.contact_email),
            source: "People search",
            lead_status: "new",
          })
          .select("id").single();
        if (error) throw error;
        leadId = data.id;
        created = true;
      }

      if (leadId && country) {
        const { error: cErr } = await supabase.from("leads").update({ country }).eq("id", leadId).eq("user_id", user.id);
        if (cErr) console.warn("[find-person] country write skipped:", cErr.message);
      }
    } catch (e) {
      console.error("[find-person] lead save failed:", e instanceof Error ? e.message : e);
    }

    // Score it on the same path enrichment uses, best-effort.
    if (leadId) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/score-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: serviceKey },
          body: JSON.stringify({ leadId }),
        });
      } catch (e) {
        console.error("[find-person] score-lead failed:", e instanceof Error ? e.message : e);
      }
    }

    return json({ person: { ...person, id: leadId, country }, lead_id: leadId, created });
  } catch (error) {
    console.error("[find-person] error:", error instanceof Error ? error.message : error);
    return json({ person: null, error: "Lookup failed. Please try again." });
  }
});
