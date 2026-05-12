// Admin tool: scan all active Stripe subscriptions and update user entitlements
// in our database to match. Uses the same plan mapping logic as the webhook
// processor so behavior stays consistent.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRICE_TO_PLAN: Record<
  string,
  {
    plan: "starter" | "growth" | "pro" | "agency";
    credits: number;
    leadsLimit: number;
    isYearly: boolean;
  }
> = {
  price_1T8tywFTerosS6hi0fHQuybr: { plan: "starter", credits: 1000, leadsLimit: 1000, isYearly: false },
  price_1T8tyxFTerosS6hiSakB51fA: { plan: "starter", credits: 12000, leadsLimit: 1000, isYearly: true },
  price_1T8tyyFTerosS6hiTsTXkWDa: { plan: "growth", credits: 2500, leadsLimit: 2500, isYearly: false },
  price_1T8tyzFTerosS6hiUyzpHnCK: { plan: "growth", credits: 30000, leadsLimit: 2500, isYearly: true },
  price_1T8tz0FTerosS6hiKJluR3kk: { plan: "pro", credits: 5000, leadsLimit: 5000, isYearly: false },
  price_1T8tz0FTerosS6hiIHNG82Bh: { plan: "pro", credits: 60000, leadsLimit: 5000, isYearly: true },
  price_1TSXEzFTerosS6hiKJdDX95R: { plan: "agency", credits: 15000, leadsLimit: 15000, isYearly: false },
  price_1TSXF0FTerosS6hiAU2FlQli: { plan: "agency", credits: 180000, leadsLimit: 15000, isYearly: true },
  price_1SmM2hFTerosS6hiiDXBDIxl: { plan: "growth", credits: 2500, leadsLimit: 2500, isYearly: false },
  price_1SS44wFTerosS6hiCkKQnnoD: { plan: "growth", credits: 2500, leadsLimit: 2500, isYearly: false },
  price_1SS456FTerosS6hisBSDPwo4: { plan: "pro", credits: 5000, leadsLimit: 5000, isYearly: false },
  price_1SS45HFTerosS6hiQtxsNVL4: { plan: "pro", credits: 5000, leadsLimit: 5000, isYearly: false },
};

const PRODUCT_TO_PLAN: Record<string, "starter" | "growth" | "pro" | "agency"> = {
  prod_U78FZoAWovU1rX: "starter", prod_U78FC92stOkRxS: "starter",
  prod_U78Ff02VQAzrLC: "growth", prod_U78Fk0l7swAukt: "growth",
  prod_U78Fs2HpZzcZJc: "pro", prod_U78Fuo9Mg04kz9: "pro",
  prod_URQ5ib01VNZY9o: "agency", prod_URQ5awS6V2AAXH: "agency",
  prod_TjpiXbauY0T3RF: "growth", prod_TOrozUbuuN18RP: "pro", prod_TOrod7SaIV2D7s: "pro",
  prod_U6gflsh1Zzoh3V: "starter", prod_U6gfTND3QdfgcC: "growth", prod_U6gfOj1Xgfd1vy: "pro",
};

const log = (s: string, d?: unknown) =>
  console.log(`[RESYNC-STRIPE] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

async function findUserId(supabase: any, email: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles").select("id").ilike("email", email).maybeSingle();
  if (profile?.id) return profile.id;
  for (let page = 1; page <= 20; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    const m = data?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (m) return m.id;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Not authenticated");
    const { data: roleRow } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const stats = {
      scanned: 0,
      updated: 0,
      created_users: 0,
      skipped_no_email: 0,
      skipped_unknown_price: 0,
      user_not_found: 0,
      errors: [] as Array<{ email?: string; error: string }>,
    };

    // Iterate all active + trialing + past_due subs (paginated)
    const statuses: Array<"active" | "trialing" | "past_due"> = [
      "active", "trialing", "past_due",
    ];
    for (const status of statuses) {
      let starting_after: string | undefined;
      // Safety cap to avoid runaway loops
      for (let i = 0; i < 50; i++) {
        const page = await stripe.subscriptions.list({
          status, limit: 100, starting_after, expand: ["data.customer"],
        });
        for (const sub of page.data) {
          stats.scanned++;
          try {
            const customer = sub.customer as Stripe.Customer;
            const email = customer?.email;
            if (!email) { stats.skipped_no_email++; continue; }

            const priceId = sub.items.data[0]?.price?.id || "";
            const productId = sub.items.data[0]?.price?.product as string;
            let planDetails = PRICE_TO_PLAN[priceId];
            if (!planDetails && productId && PRODUCT_TO_PLAN[productId]) {
              const planName = PRODUCT_TO_PLAN[productId];
              const matchKey = Object.keys(PRICE_TO_PLAN).find(
                (k) => PRICE_TO_PLAN[k].plan === planName,
              );
              if (matchKey) planDetails = PRICE_TO_PLAN[matchKey];
            }
            if (!planDetails) {
              stats.skipped_unknown_price++;
              stats.errors.push({ email, error: `Unknown price/product ${priceId}/${productId}` });
              continue;
            }

            let userId = await findUserId(supabase, email);
            if (!userId) {
              // Create the user so entitlements stick
              const tempPassword = crypto.randomUUID().replace(/-/g, "") + "Aa1!";
              const { data: created, error: createErr } =
                await supabase.auth.admin.createUser({
                  email, password: tempPassword, email_confirm: true,
                });
              if (createErr || !created?.user) {
                stats.user_not_found++;
                stats.errors.push({ email, error: `createUser failed: ${createErr?.message}` });
                continue;
              }
              userId = created.user.id;
              stats.created_users++;
            }

            const periodStart = new Date((sub.current_period_start ?? Date.now() / 1000) * 1000).toISOString();
            const periodEnd = new Date((sub.current_period_end ?? Date.now() / 1000 + 30 * 86400) * 1000).toISOString();

            // Preserve existing remaining credits if they're greater than the
            // base allotment (don't wipe out rollover/top-ups during a resync).
            const { data: cur } = await supabase
              .from("subscriptions")
              .select("search_credits_remaining")
              .eq("user_id", userId).maybeSingle();
            const remaining = Math.max(
              cur?.search_credits_remaining ?? 0,
              planDetails.credits,
            );

            const { error: upErr } = await supabase.from("subscriptions").update({
              plan: planDetails.plan,
              status: sub.status === "active" || sub.status === "trialing" ? "active" : "inactive",
              account_status: sub.status === "active" || sub.status === "trialing" ? "active" : sub.status,
              stripe_customer_id: customer.id,
              stripe_subscription_id: sub.id,
              search_credits_base: planDetails.credits,
              search_credits_remaining: remaining,
              leads_limit: planDetails.leadsLimit,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              credits_reset_at: periodEnd,
              updated_at: new Date().toISOString(),
            }).eq("user_id", userId);

            if (upErr) {
              stats.errors.push({ email, error: `update failed: ${upErr.message}` });
              continue;
            }
            stats.updated++;
          } catch (e: any) {
            stats.errors.push({ error: e?.message ?? String(e) });
          }
        }
        if (!page.has_more) break;
        starting_after = page.data[page.data.length - 1]?.id;
        if (!starting_after) break;
      }
    }

    log("done", stats);
    return new Response(JSON.stringify({ success: true, ...stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    log("error", { message: e?.message });
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
