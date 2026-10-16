// Safety net for billing state: compares every stored subscription against
// Stripe and corrects any account whose entitlements drifted — a cancellation
// or unpaid invoice that never reached us leaves the account on a paid plan
// forever otherwise. Runs hourly on cron; an admin can also trigger it.

import Stripe from "https://esm.sh/stripe@18.5.0";
/*
 * The same specifier the rest of the product uses.
 *
 * This arrived as `npm:@supabase/supabase-js@2.57.2`, the only file in the
 * repo to import it that way — everywhere else, including the shared billing
 * helpers this calls into, uses the esm.sh copy. Deno treats the two as
 * different modules, so the client built here was not the client
 * `process-stripe-event` types its parameters against, and every call into it
 * failed to type-check on a protected member.
 *
 * Nothing about the runtime behaviour changes; it is the same library at the
 * same version. What changes is that the type checker can see that.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, isInternalCaller } from "../_shared/internal-auth.ts";
import { logSystemAlert } from "../_shared/alerts.ts";
import { PRICE_TO_PLAN, PRODUCT_TO_PLAN, finalizeFailedPayment } from "../_shared/process-stripe-event.ts";
import { dunningStage } from "../_shared/dunning-policy.ts";
import { getSubscriptionPeriod, toIsoUnix } from "../_shared/stripe-period.ts";

const log = (s: string, d?: unknown) =>
  console.log(`[RECONCILE-STRIPE] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

interface SubRow {
  user_id: string;
  plan: string;
  status: string | null;
  account_status: string | null;
  stripe_subscription_id: string | null;
  trial_end_date: string | null;
  previous_plan: string | null;
  grace_started_at: string | null;
}

function planFor(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id ?? "";
  const productId = sub.items.data[0]?.price?.product as string | undefined;
  let details = PRICE_TO_PLAN[priceId];
  if (!details && productId && PRODUCT_TO_PLAN[productId]) {
    const planName = PRODUCT_TO_PLAN[productId];
    const key = Object.keys(PRICE_TO_PLAN).find((k) => PRICE_TO_PLAN[k].plan === planName);
    if (key) details = PRICE_TO_PLAN[key];
  }
  return details ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Cron/service callers pass through; anyone else must be a signed-in admin.
  if (!isInternalCaller(req)) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: userData } = token
      ? await supabase.auth.getUser(token)
      : { data: { user: null } } as never;
    const caller = userData?.user;
    if (!caller) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403,
      });
    }
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ success: false, error: "STRIPE_SECRET_KEY not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const stats = { checked: 0, corrected: 0, downgraded: 0, upgraded: 0, errors: [] as string[] };

  try {
    // Only rows that could possibly be wrong: anything linked to Stripe, or on
    // a paid plan without a live subscription.
    const { data: rows, error } = await supabase
      .from("subscriptions")
      .select("user_id, plan, status, account_status, stripe_subscription_id, trial_end_date, previous_plan, grace_started_at")
      .or("stripe_subscription_id.not.is.null,plan.neq.free");
    if (error) throw new Error(error.message);

    // Our own team's accounts are granted internally, never through Stripe.
    const { data: adminRows } = await supabase
      .from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = new Set((adminRows ?? []).map((r: { user_id: string }) => r.user_id));

    for (const row of (rows ?? []) as SubRow[]) {
      stats.checked++;
      // Admin accounts and manually granted, still-valid trials are ours to set.
      const trialValid = row.account_status === "trial" && !!row.trial_end_date &&
        new Date(row.trial_end_date).getTime() > Date.now();
      if (row.account_status === "admin" || adminIds.has(row.user_id)) continue;

      let email: string | null = null;
      const { data: profile } = await supabase
        .from("profiles").select("email").eq("id", row.user_id).maybeSingle();
      email = (profile as { email?: string } | null)?.email ?? null;

      try {
        let sub: Stripe.Subscription | null = null;
        if (row.stripe_subscription_id) {
          try {
            sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
          } catch (e: any) {
            if (e?.code === "resource_missing") sub = null;
            else throw e;
          }
        }

        const entitled = !!sub && (sub.status === "active" || sub.status === "trialing");

        if (entitled && sub) {
          const details = planFor(sub);
          if (!details) continue;
          const accountStatus = sub.status === "trialing" ? "trial" : "active";
          const needsFix = row.plan !== details.plan || row.status !== "active" ||
            row.account_status !== accountStatus;
          if (!needsFix) continue;

          await supabase.from("subscriptions").update({
            plan: details.plan,
            previous_plan: null,
            status: "active",
            account_status: accountStatus,
            search_credits_base: details.credits,
            leads_limit: details.leadsLimit,
            current_period_end: toIsoUnix(getSubscriptionPeriod(sub).endSec),
            updated_at: new Date().toISOString(),
          }).eq("user_id", row.user_id);

          await supabase.from("audit_logs").insert({
            user_id: row.user_id, action: "billing_reconciled",
            entity_type: "subscription", entity_id: row.user_id,
            old_values: { plan: row.plan, status: row.status, account_status: row.account_status },
            new_values: { plan: details.plan, status: "active", account_status: accountStatus },
            metadata: {
              source: "reconciliation", reason: `Stripe subscription is ${sub.status}`,
              target_email: email, stripe_subscription_id: sub.id,
            },
          });
          stats.corrected++; stats.upgraded++;
          await logSystemAlert({
            category: "billing_reconciled", severity: "warning",
            message: `${email ?? row.user_id} was corrected to the ${details.plan} plan to match Stripe`,
            details: {
              email, from_plan: row.plan, to_plan: details.plan, stripe_status: sub.status,
              stripe_subscription_id: sub.id, trigger: "reconciliation",
            },
            user_id: row.user_id, related_entity: sub.id,
          });
          continue;
        }

        // Failed-payment run past its recovery window: end it for good.
        if (sub && sub.status === "past_due" && row.grace_started_at &&
            dunningStage(row.grace_started_at, 1) === "final") {
          await finalizeFailedPayment(stripe, supabase, row.user_id, email, sub.id, 0);
          stats.corrected++; stats.downgraded++;
          await logSystemAlert({
            category: "billing_payment_failed", severity: "critical",
            message: `${email ?? row.user_id} did not fix their payment within 3 days — subscription cancelled, account moved to the free plan`,
            details: { email, stripe_subscription_id: sub.id, trigger: "dunning_final" },
            user_id: row.user_id, related_entity: sub.id,
          });
          continue;
        }
        // Inside the grace day the paid plan stays on.
        if (sub && sub.status === "past_due" && row.grace_started_at &&
            dunningStage(row.grace_started_at, 1) === "grace") continue;

        // Not entitled in Stripe (cancelled, unpaid, or gone).
        if (row.plan === "free" && !row.stripe_subscription_id) continue;
        if (!sub && trialValid && !row.stripe_subscription_id) continue; // manual trial

        const stripeStatus = sub?.status ?? "missing";
        const alreadyFree = row.plan === "free";

        await supabase.from("subscriptions").update({
          status: sub ? (stripeStatus === "past_due" ? "past_due" : "cancelled") : "cancelled",
          account_status: sub && stripeStatus === "past_due" ? "past_due" : "cancelled",
          stripe_subscription_id: sub ? row.stripe_subscription_id : null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }).eq("user_id", row.user_id);

        const { error: downErr } = await supabase.rpc("billing_downgrade_to_free", {
          _user_id: row.user_id,
          _reason: `Reconciliation: Stripe subscription is ${stripeStatus} — entitlements returned to the free plan`,
          _details: {
            trigger: "reconciliation", stripe_status: stripeStatus,
            target_email: email, stripe_subscription_id: row.stripe_subscription_id,
          },
        });
        if (downErr) throw new Error(downErr.message);

        if (!alreadyFree) {
          stats.corrected++; stats.downgraded++;
          await logSystemAlert({
            category: "billing_reconciled", severity: "error",
            message: `${email ?? row.user_id} was returned to the free plan — their Stripe subscription is ${stripeStatus}`,
            details: {
              email, from_plan: row.plan, to_plan: "free", stripe_status: stripeStatus,
              stripe_subscription_id: row.stripe_subscription_id, trigger: "reconciliation",
            },
            user_id: row.user_id, related_entity: row.stripe_subscription_id,
          });
        }
      } catch (e: any) {
        stats.errors.push(`${email ?? row.user_id}: ${e?.message ?? String(e)}`);
      }
    }

    log("done", stats);
    return new Response(JSON.stringify({ success: true, ...stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e: any) {
    log("failed", { error: e?.message });
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e), ...stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }
});
