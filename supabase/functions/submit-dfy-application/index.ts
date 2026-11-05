import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { botRejectionMessage, botSignals } from "../_shared/bot-signals.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { normalizeDfySalesAnswers } from "../_shared/dfy-sales-model.ts";

/**
 * A done-for-you application, from the public pricing page.
 *
 * Unauthenticated on purpose: the people who need this offer do not have an
 * account yet, and making them create one to ask about a $2,500/month service
 * loses most of them. That makes every control here server-side.
 *
 * It writes to `campaign_setup_requests` rather than a table of its own. That
 * table already carries a nullable `user_id`, `contact_name`, `contact_email`,
 * a free-form `metadata`, a `source` label and `booked_at` — and, more to the
 * point, `calendly-webhook` already looks a row up by the id it finds in
 * `tracking.utm_content` and marks it booked. Reusing it means the booking
 * half of this feature needed no new code at all.
 *
 * The row id is returned so the browser can hand it to the Calendly embed as
 * utm_content. That is the whole mechanism behind "I never know what the
 * meeting is about": the booking arrives already joined to the answers.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Trim and cap. A field longer than this is not an answer. */
const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Closed sets. Anything else is recorded as "unspecified" rather than stored. */
const ONE_OF = (v: unknown, allowed: readonly string[]): string =>
  typeof v === "string" && allowed.includes(v) ? v : "unspecified";

const OUTBOUND_TODAY = ["none", "in_house", "agency", "tool"] as const;
const DEAL_SIZE = ["under_5k", "5k_25k", "25k_100k", "over_100k"] as const;
const SALES_CYCLE = ["under_30d", "30_90d", "90_180d", "over_180d"] as const;
const RUNG = ["managed", "launch", "unsure"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json(400, { error: "Invalid request." });

  const name = text((body as Record<string, unknown>).name, 120);
  const email = text((body as Record<string, unknown>).email, 200).toLowerCase();
  const company = text((body as Record<string, unknown>).company, 200);
  const website = text((body as Record<string, unknown>).website, 300);
  const sells = text((body as Record<string, unknown>).sells, 1000);

  if (name.length < 2) return json(400, { error: "Enter your name." });
  // Deliberately permissive. A regex that rejects a real address costs more
  // than one that admits a fake one, which the reply then bounces off anyway.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "Enter a valid work email." });
  if (sells.length < 3) return json(400, { error: "Tell us what you sell and who you sell it to." });

  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const signals = botSignals({
    honeypot: (body as Record<string, unknown>).company_fax,
    elapsedMs: (body as Record<string, unknown>).elapsedMs,
    answers: [sells],
  });
  if (signals.length > 0) {
    console.warn(`submit-dfy-application: rejected ${ip} — ${signals.join(", ")}`);
    return json(400, { error: botRejectionMessage(signals) });
  }

  const turnstile = await verifyTurnstile(
    (body as Record<string, unknown>).turnstileToken,
    ip,
    Deno.env.get("TURNSTILE_SECRET_KEY"),
  );
  if (!turnstile.ok) {
    console.warn(`submit-dfy-application: turnstile ${turnstile.reason} for ${ip}`);
    return json(400, { error: "We could not verify that you are human. Reload and try again." });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  /*
   * By IP only, because there is no account to key on. Ten an hour is far
   * above what a real applicant needs and far below what makes a form worth
   * abusing.
   */
  try {
    const { data: allowed } = await admin.rpc("consume_rate_limit", {
      _key: `dfy-application:ip:${ip}`,
      _max: 10,
      _window_seconds: 3600,
    });
    if (allowed === false) {
      return json(429, { error: "Too many applications from this connection. Try again later." });
    }
  } catch (e) {
    // The limiter failing must not take the form down. Logged, then onward.
    console.warn("submit-dfy-application: rate limit check failed, continuing", e);
  }

  const { data, error } = await admin
    .from("campaign_setup_requests")
    .insert({
      user_id: null,
      source: "dfy_application",
      plan: ONE_OF((body as Record<string, unknown>).rung, RUNG),
      contact_name: name,
      contact_email: email,
      metadata: {
        ...normalizeDfySalesAnswers(body as Record<string, unknown>),
        company,
        website,
        sells,
        outbound_today: ONE_OF((body as Record<string, unknown>).outboundToday, OUTBOUND_TODAY),
        deal_size: ONE_OF((body as Record<string, unknown>).dealSize, DEAL_SIZE),
        sales_cycle: ONE_OF((body as Record<string, unknown>).salesCycle, SALES_CYCLE),
      },
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.error("submit-dfy-application: insert failed:", error?.message);
    return json(500, { error: "We could not save that. Try again in a moment." });
  }

  return json(200, { id: data.id });
});
