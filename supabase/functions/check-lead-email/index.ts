import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0?target=deno";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveAppUser } from "../_shared/app-user.ts";
import { verifyEmail } from "../_shared/email-verify.ts";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { getPlanSearchLimits } from "../_shared/plan-limits.ts";

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const caller = await resolveAppUser(req, db);
    if (!caller.user) return json({ error: caller.error }, caller.status);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== "string" || !body.email.trim() || body.email.length > 320 || Object.keys(body).some(k => k !== "email")) return json({ error: "Provide only an email string (maximum 320 characters)." }, 400);
    const { data: plan, error: planError } = await db.rpc("plan_for_user", { _user_id: caller.user.id });
    if (planError) return json({ error: "Could not verify plan access" }, 503);
    if (!plan || plan === "free") return json({ error: "Email checking requires a paid plan", error_code: "free_tier_blocked" }, 403);
    const { data: subscription, error: subscriptionError } = await db.from("subscriptions").select("account_status").eq("user_id", caller.user.id).maybeSingle();
    if (subscriptionError) return json({ error: "Could not verify account access" }, 503);
    if (subscription?.account_status === "locked") return json({ error: "Account is locked", error_code: "account_locked" }, 403);
    if (await isDemoMode(db, caller.user.id)) return demoResponse({ status: "unknown", verified: null, reason: "Verification simulated in demo mode" }, corsHeaders);
    const limits = getPlanSearchLimits(plan);
    for (const [key, max, window] of [
      [`email-check:minute:${caller.user.id}`, 10, 60],
      [`email-check:day:${caller.user.id}`, limits.dailySearchLimit, 86400],
    ] as const) {
      const { data: allowed, error } = await db.rpc("consume_rate_limit", { _key: key, _max: max, _window_seconds: window });
      if (error) return json({ error: "Usage check unavailable" }, 503);
      if (allowed !== true) return json({ error: "Email verification request limit reached" }, 429);
    }
    const email = body.email.trim().toLowerCase();
    const result = await verifyEmail(db, email);
    // Provider identity is internal; preserve honest verdicts, not vendor names.
    return json({ email, status: result.status, verified: result.verified, reason: result.reason, cached: result.source === "cache", credits_charged: 0 });
  } catch {
    return json({ error: "Email verification unavailable", status: "unknown", verified: null }, 200);
  }
});