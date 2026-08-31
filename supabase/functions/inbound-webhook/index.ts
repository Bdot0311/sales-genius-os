import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-outreign-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const log = (step: string, details?: unknown) =>
  console.log(`[INBOUND-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

type AnyRec = Record<string, any>;

const SUPPORTED_ACTIONS = [
  "lead.created",
  "lead.updated",
  "lead.stage_changed",
  "contact.created",
  "deal.created",
] as const;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s.slice(0, 2000) : null;
};

const pick = (o: AnyRec, keys: string[]): string | null => {
  for (const k of keys) {
    const v = str(o?.[k]);
    if (v) return v;
  }
  return null;
};

const fullName = (o: AnyRec): string | null => {
  const direct = pick(o, ["contact_name", "full_name", "name", "fullName"]);
  if (direct) return direct;
  const first = pick(o, ["first_name", "firstName", "given_name"]);
  const last = pick(o, ["last_name", "lastName", "family_name"]);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined.length ? joined : null;
};

// Map an arbitrary external payload onto our lead shape.
const mapLead = (o: AnyRec, defaultSource: string | null) => {
  const email = pick(o, ["contact_email", "email", "email_address", "work_email"]);
  const domain = pick(o, ["domain", "company_domain"]);
  const explicitCompany = pick(o, ["company_name", "company", "organization", "org", "account_name"]);
  const row: AnyRec = {
    contact_email: email ? email.toLowerCase() : null,
    contact_name: fullName(o),
    // Visitor-identification providers commonly send { name, domain } for a
    // company rather than a person. Use name as the company only in that shape.
    company_name: explicitCompany || (domain ? pick(o, ["name"]) : null),
    job_title: pick(o, ["job_title", "title", "position", "role"]),
    contact_phone: pick(o, ["contact_phone", "phone", "phone_number", "mobile"]),
    linkedin_url: pick(o, ["linkedin_url", "linkedin", "linkedin_profile"]),
    company_website: pick(o, ["company_website", "website"]) || domain,
    industry: pick(o, ["industry", "sector"]),
    company_size: pick(o, ["company_size", "employees", "employee_range"]),
    country: pick(o, ["country", "country_name"]),
    notes: pick(o, ["notes", "note", "message", "comments"]),
    pipeline_stage: pick(o, ["pipeline_stage", "stage", "status"]),
    source: pick(o, ["source", "lead_source", "utm_source"]) || defaultSource || "webhook",
  };
  for (const k of Object.keys(row)) if (row[k] === null) delete row[k];
  return row;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let webhook: AnyRec | null = null;
  let payload: AnyRec = {};

  try {
    const url = new URL(req.url);
    // Accept /inbound-webhook/<token> or ?token=<token>
    const parts = url.pathname.split("/").filter(Boolean);
    const token = parts[parts.indexOf("inbound-webhook") + 1] || url.searchParams.get("token") || "";
    if (!token) return json({ error: "Missing endpoint token in URL" }, 400);

    const { data: hook, error: hookErr } = await supabase
      .from("webhooks")
      .select("id, user_id, name, secret, events, is_active, direction, default_source, total_received")
      .eq("endpoint_token", token)
      .eq("direction", "inbound")
      .maybeSingle();

    if (hookErr) throw hookErr;
    if (!hook) return json({ error: "Unknown endpoint" }, 404);
    if (!hook.is_active) return json({ error: "This endpoint is disabled" }, 403);
    webhook = hook;

    const provided =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-outreign-secret");

    // The high-entropy endpoint token is a bearer credential in the URL. Some
    // webhook providers (including GetLeads) cannot attach custom headers, so
    // the secret header is optional. If a caller supplies one, it must match.
    if (provided && provided !== hook.secret) {
      log("Auth failed", { webhook_id: hook.id });
      return json({ error: "Invalid webhook secret" }, 401);
    }

    // Simple abuse guard: max 500 accepted requests per hour per endpoint
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("webhook_id", hook.id)
      .eq("direction", "inbound")
      .gte("created_at", since);
    if ((count ?? 0) >= 500) return json({ error: "Rate limit exceeded (500/hour)" }, 429);

    try {
      payload = await req.json();
    } catch {
      return json({ error: "Body must be valid JSON" }, 400);
    }

    const action: string =
      str(payload.action) || str(payload.event) || str(payload.type) || "lead.created";
    if (!SUPPORTED_ACTIONS.includes(action as any)) {
      return json(
        { error: `Unsupported action "${action}"`, supported: SUPPORTED_ACTIONS },
        400,
      );
    }
    if (hook.events?.length && !hook.events.includes(action)) {
      return json({ error: `Action "${action}" is not enabled on this endpoint` }, 403);
    }

    // Records can arrive as data / lead / leads[] / records[] or the bare body
    const raw =
      payload.data ?? payload.lead ?? payload.record ?? payload.contact ?? payload.deal ?? payload;
    const items: AnyRec[] = Array.isArray(payload.leads)
      ? payload.leads
      : Array.isArray(payload.records)
        ? payload.records
        : Array.isArray(raw)
          ? raw
          : [raw];

    if (items.length === 0) return json({ error: "No records in payload" }, 400);
    if (items.length > 100) return json({ error: "Max 100 records per request" }, 400);

    const results: AnyRec[] = [];

    for (const item of items) {
      if (!item || typeof item !== "object") {
        results.push({ status: "skipped", reason: "record is not an object" });
        continue;
      }

      if (action === "deal.created") {
        const title = pick(item, ["title", "deal_name", "name"]);
        const company = pick(item, ["company_name", "company", "organization"]);
        if (!title || !company) {
          results.push({ status: "skipped", reason: "deal requires title and company_name" });
          continue;
        }
        const value = Number(item.value ?? item.amount);
        const { data, error } = await supabase
          .from("deals")
          .insert({
            user_id: webhook.user_id,
            title,
            company_name: company,
            contact_name: fullName(item),
            value: Number.isFinite(value) ? value : null,
            stage: pick(item, ["stage", "status"]) || "discovery",
            notes: pick(item, ["notes", "note"]),
          })
          .select("id")
          .single();
        if (error) results.push({ status: "error", reason: error.message });
        else results.push({ status: "created", type: "deal", id: data.id });
        continue;
      }

      if (action === "contact.created") {
        const email = pick(item, ["email", "contact_email", "work_email"]);
        if (!email) {
          results.push({ status: "skipped", reason: "contact requires an email" });
          continue;
        }
        const row = {
          user_id: webhook.user_id,
          email: email.toLowerCase(),
          first_name: pick(item, ["first_name", "firstName"]),
          last_name: pick(item, ["last_name", "lastName"]),
          job_title: pick(item, ["job_title", "title"]),
          phone: pick(item, ["phone", "phone_number"]),
          linkedin_url: pick(item, ["linkedin_url", "linkedin"]),
          country: pick(item, ["country"]),
          city: pick(item, ["city"]),
          source: pick(item, ["source"]) || webhook.default_source || "webhook",
        };
        const { data: existing } = await supabase
          .from("contacts")
          .select("id")
          .eq("user_id", webhook.user_id)
          .eq("email", row.email)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase.from("contacts").update(row).eq("id", existing.id);
          results.push(
            error
              ? { status: "error", reason: error.message }
              : { status: "updated", type: "contact", id: existing.id },
          );
        } else {
          const { data, error } = await supabase
            .from("contacts")
            .insert(row)
            .select("id")
            .single();
          results.push(
            error
              ? { status: "error", reason: error.message }
              : { status: "created", type: "contact", id: data.id },
          );
        }
        continue;
      }

      // lead.created / lead.updated / lead.stage_changed
      const mapped = mapLead(item, webhook.default_source);
      const email = mapped.contact_email as string | undefined;
      const externalId = pick(item, ["lead_id", "id", "external_id"]);

      let existingId: string | null = null;
      if (email) {
        const { data } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", webhook.user_id)
          .ilike("contact_email", email)
          .maybeSingle();
        existingId = data?.id ?? null;
      } else if (externalId && /^[0-9a-f-]{36}$/i.test(externalId)) {
        const { data } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", webhook.user_id)
          .eq("id", externalId)
          .maybeSingle();
        existingId = data?.id ?? null;
      }

      if (action === "lead.stage_changed") {
        const stage = mapped.pipeline_stage as string | undefined;
        if (!existingId || !stage) {
          results.push({
            status: "skipped",
            reason: !existingId ? "no matching lead for email/id" : "missing stage",
          });
          continue;
        }
        const { error } = await supabase
          .from("leads")
          .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
          .eq("id", existingId);
        results.push(
          error
            ? { status: "error", reason: error.message }
            : { status: "updated", type: "lead", id: existingId, pipeline_stage: stage },
        );
        continue;
      }

      if (existingId) {
        const { error } = await supabase
          .from("leads")
          .update({ ...mapped, updated_at: new Date().toISOString() })
          .eq("id", existingId);
        results.push(
          error
            ? { status: "error", reason: error.message }
            : { status: "updated", type: "lead", id: existingId },
        );
        continue;
      }

      if (action === "lead.updated") {
        results.push({ status: "skipped", reason: "no matching lead to update" });
        continue;
      }

      if (!mapped.company_name && !mapped.contact_name && !email) {
        results.push({ status: "skipped", reason: "record needs an email, name, or company" });
        continue;
      }

      const { data, error } = await supabase
        .from("leads")
        .insert({ ...mapped, user_id: webhook.user_id })
        .select("id")
        .single();
      results.push(
        error
          ? { status: "error", reason: error.message }
          : { status: "created", type: "lead", id: data.id },
      );
    }

    const accepted = results.filter((r) => r.status === "created" || r.status === "updated").length;
    const failed = results.filter((r) => r.status === "error").length;

    await supabase.from("webhook_deliveries").insert({
      webhook_id: webhook.id,
      user_id: webhook.user_id,
      direction: "inbound",
      event: action,
      payload,
      status: failed > 0 && accepted === 0 ? "failed" : "success",
      response_status: failed > 0 && accepted === 0 ? 422 : 200,
      response_body: JSON.stringify(results).slice(0, 4000),
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    await supabase
      .from("webhooks")
      .update({
        last_received_at: new Date().toISOString(),
        total_received: (webhook.total_received ?? 0) + 1,
      })
      .eq("id", webhook.id);

    log("Processed", { webhook_id: webhook.id, action, accepted, failed });

    return json(
      { received: items.length, accepted, failed, action, results },
      failed > 0 && accepted === 0 ? 422 : 200,
    );
  } catch (error: any) {
    log("Error", { message: error?.message });
    if (webhook) {
      await supabase.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        user_id: webhook.user_id,
        direction: "inbound",
        event: "inbound.error",
        payload,
        status: "failed",
        response_status: 500,
        response_body: String(error?.message ?? error).slice(0, 2000),
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }
    return json({ error: error?.message ?? "Internal error" }, 500);
  }
});
