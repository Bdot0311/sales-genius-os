import { resolveAppUser } from "../_shared/app-user.ts";
// Find a person by name.
//
// The other entry points start from an ICP, a website, or a company list. This
// one starts from a person you already know of: "Jane Doe at Acme" — or an
// email, or a LinkedIn profile — and fills in the rest of the contact record.
//
// It reuses the same upstream verb as enrich-lead (Railway /enrich, which takes
// EXACTLY ONE of full_name+company, email, or linkedin_url) and the same credit
// rules: paid plan only, one credit, refunded when nothing matched.
//
// Two actions (POST body):
//   { action: "lookup", ... }  — ask the provider. Writes nothing.
//   { action: "save", person, lead_id? } — write the result to leads.
//
// The lookup used to save on its own, which is how a lookup that learned
// nothing still reported "Saved to leads", and how repeating one on somebody
// already saved overwrote their row with the caller's own input. Looking is now
// separate from writing, and the caller is told what a write would change
// before deciding to make it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import {
  diffAgainstLead,
  isRealMatch,
  providerContributions,
  savableRecord,
} from "../_shared/person-match.ts";
import { applySearchMeter, asMeterClient } from "../_shared/search-meter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
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
    if (!authHeader && !req.headers.get("X-API-Key")) return json({ error: "Authorization required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const resolved = await resolveAppUser(req, supabase);
    if (!resolved.user) return json({ error: resolved.error }, resolved.status);
    const user = resolved.user;
    const userError = null;

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

    // ---------- SAVE ----------
    // Writing is its own call now, and costs nothing: the credit was spent on
    // the lookup that produced this record.
    if (body.action === "save") {
      const person = (body.person ?? {}) as Record<string, unknown>;
      const record = savableRecord(person);
      if (Object.keys(record).length === 0) {
        return json({ error: "Nothing to save.", error_code: "empty_record" }, 400);
      }
      record.enrichment_status = "enriched";
      record.enriched_at = new Date().toISOString();

      let leadId = typeof body.lead_id === "string" ? body.lead_id : null;
      if (leadId) {
        // Scoped to this user: a lead id from the client is a claim, not proof.
        const { data: owned } = await supabase
          .from("leads").select("id").eq("id", leadId).eq("user_id", user.id).maybeSingle();
        if (!owned) return json({ error: "Lead not found.", error_code: "not_found" }, 404);
        const { error } = await supabase.from("leads").update(record).eq("id", leadId).eq("user_id", user.id);
        if (error) {
          console.error("[find-person] update failed:", error.message);
          return json({ error: "Could not update the lead." }, 500);
        }
      } else {
        const { data, error } = await supabase.from("leads")
          .insert({
            ...record,
            user_id: user.id,
            company_name: record.company_name ?? "Unknown company",
            contact_name: record.contact_name ?? String(record.contact_email ?? "Unknown contact"),
            source: "People search",
            lead_status: "active",
            pipeline_stage: "new",
          })
          .select("id").single();
        if (error) {
          console.error("[find-person] insert failed:", error.message);
          return json({ error: "Could not save the lead." }, 500);
        }
        leadId = data.id;
      }

      // Score it on the same path enrichment uses, best-effort.
      try {
        await fetch(`${supabaseUrl}/functions/v1/score-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader ?? "", apikey: serviceKey, ...(req.headers.get("X-API-Key") ? { "X-API-Key": req.headers.get("X-API-Key") ?? "" } : {}) },
          body: JSON.stringify({ leadId }),
        });
      } catch (e) {
        console.error("[find-person] score-lead failed:", e instanceof Error ? e.message : e);
      }

      return json({ lead_id: leadId, saved: true, created: !body.lead_id });
    }
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
      enrichPayload.company = company || domain || '';
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

    // Metered for everyone, refused for no admin — the same split the search
    // and enrichment paths use. An admin spending nothing and showing nothing
    // is how the meter came to read the same number every day.
    let creditWasDeducted = false;
    {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan, status, search_credits_remaining")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!isAdmin && (!subscription || subscription.plan === "free")) {
        return json({
          person: null,
          error: "People search requires a paid plan. Upgrade to Growth to unlock contact lookups.",
          error_code: "free_tier_blocked",
          upgrade_plan: "growth",
        });
      }

      // Locked in apply_search_meter. Reading the balance and writing
      // remaining-1 let two lookups spend one credit.
      const metered = await applySearchMeter(asMeterClient(supabase), {
        userId: user.id,
        creditDelta: -1,
        dailyDelta: 0,
        description: "People search",
        gate: !isAdmin,
      });
      if (!metered.applied) {
        if (!isAdmin && (metered.reason === "insufficient" || metered.reason === "no_subscription")) {
          return json({
            person: null,
            error: "No search credits remaining. Add more credits to look up contacts.",
            error_code: "credits_exhausted",
          });
        }
        if (!(isAdmin && metered.reason === "no_subscription")) {
          console.error("[find-person] credit deduction failed:", metered.reason ?? "unknown");
          return json({ person: null, error: "Could not reserve a credit. Try again." }, 200);
        }
      } else {
        creditWasDeducted = true;
      }
    }

    const refundCredit = async (reason: string) => {
      if (!creditWasDeducted) return;
      // Cleared before the call so a second refund in this request cannot add
      // another credit if the first one is still in flight or throws after
      // the database has applied it.
      creditWasDeducted = false;
      try {
        await applySearchMeter(asMeterClient(supabase), {
          userId: user.id,
          creditDelta: 1,
          dailyDelta: 0,
          description: `People search refund: ${reason}`,
          gate: false,
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
    // Who is asking. Authorization is one service key shared by every user, so
    // without this the backend has only this function's egress address to go
    // on — shared between users and changing when a worker recycles.
    headers["X-Customer-ID"] = user.id;

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
    if (country) person.country = country;

    // Did the provider actually find anyone?
    //
    // The old test was "is there a name or an email", and the name falls back
    // to the one the caller typed — so for a name-plus-company lookup it was
    // satisfied before the provider was called. An empty upstream answer came
    // back as a found contact whose only fields were the caller's own input,
    // charged a credit, and was written into leads under a "Saved to leads"
    // badge. At least one field has to have come from upstream.
    const lookupInput = { fullName, company, email, linkedin };
    if (!isRealMatch(person, lookupInput)) {
      await refundCredit("no_match");
      return json({
        person: null,
        error:
          "No matching contact found — the provider returned nothing beyond what you typed, so no credit was charged. " +
          "A company domain, work email, or LinkedIn URL usually finds someone a name alone cannot.",
        error_code: "no_match",
      });
    }

    // Is this somebody already in their leads, and what would a save change?
    // Matching on email first, then on name+company, is the same pairing the
    // automatic save used — it is the writing that has moved, not the matching.
    let existingLead: Record<string, unknown> | null = null;
    const leadColumns =
      "id, contact_name, contact_email, contact_phone, job_title, seniority, linkedin_url, " +
      "company_name, company_website, company_linkedin, industry, employee_count, company_description, country";
    if (person.contact_email) {
      const { data, error: leadErr } = await supabase.from("leads")
        .select(leadColumns).eq("user_id", user.id)
        .ilike("contact_email", String(person.contact_email)).limit(1).maybeSingle();
      if (!leadErr && data) {
        existingLead = data as unknown as Record<string, unknown>;
      }
    }
    if (!existingLead && person.contact_name && person.company_name) {
      const { data, error: leadErr } = await supabase.from("leads")
        .select(leadColumns).eq("user_id", user.id)
        .ilike("contact_name", String(person.contact_name))
        .ilike("company_name", String(person.company_name))
        .limit(1).maybeSingle();
      if (!leadErr && data) {
        existingLead = data as unknown as Record<string, unknown>;
      }
    }

    return json({
      person: { ...person, id: existingLead?.id ?? null },
      // What upstream contributed, so the caller can say what the lookup added
      // rather than claiming a find it did not make.
      found_fields: providerContributions(person, lookupInput),
      existing_lead: existingLead
        ? {
            id: existingLead.id,
            contact_name: existingLead.contact_name,
            company_name: existingLead.company_name,
            changes: diffAgainstLead(person, existingLead),
          }
        : null,
      saved: false,
    });
  } catch (error) {
    console.error("[find-person] error:", error instanceof Error ? error.message : error);
    return json({ person: null, error: "Lookup failed. Please try again." });
  }
});
