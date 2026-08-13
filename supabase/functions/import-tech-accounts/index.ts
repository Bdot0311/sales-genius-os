import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";

// Accounts that just dropped a tool you displace, added on their own.
//
// Technographic churn is not a thing to go and search for. A company that
// stopped running a competitor last week is in a buying window now, and a
// window nobody happens to look through is worth nothing — so this runs on a
// schedule against the competitor list already set on each user's ICP, and the
// accounts simply appear.
//
// There is deliberately no interface. The signal reaches the user twice, both
// times as part of something they were already looking at: the account shows up
// in their account list, and once a lead there is enriched, detect-tech-signals
// writes a tech_stack_change row to signal_events, which is what the intent
// score beside the ICP score is computed from.
//
// Internal only — pg_cron calls it. See the companion migration.

const BATCH_USERS = 25;
// Per user, per run. Bloomberry meters technographics by results returned, so
// this is the direct cost lever: a handful of genuinely fresh accounts a day
// beats a flood nobody works.
const PER_USER_LIMIT = 10;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const cleanDomain = (raw: unknown): string | null => {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return null;
  return value.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauthorized = requireServiceRole(req);
  if (unauthorized) return unauthorized;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // Only users who have said which tools they displace. Without that list
    // there is no competitor to watch, and guessing one would fill someone's
    // account list with companies they never asked about.
    const { data: profiles } = await supabase
      .from("icp_profiles")
      .select("user_id, exclude_tech_stack")
      .not("exclude_tech_stack", "is", null)
      .limit(BATCH_USERS);

    const targets = (profiles || []).filter(
      (p) => Array.isArray(p.exclude_tech_stack) && p.exclude_tech_stack.length > 0,
    );

    let imported = 0;
    let scanned = 0;

    for (const profile of targets) {
      try {
        // No vendor: discover-tech-signals falls back to this user's own
        // exclude_tech_stack, which is the list this is about.
        const res = await fetch(`${supabaseUrl}/functions/v1/discover-tech-signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ userId: profile.user_id, change: "removed", limit: PER_USER_LIMIT }),
        });
        if (!res.ok) {
          console.error("[import-tech-accounts] discovery failed for", profile.user_id, res.status);
          continue;
        }

        const payload = await res.json();
        const signals = Array.isArray(payload?.signals) ? payload.signals : [];
        scanned += signals.length;

        for (const signal of signals) {
          // A company already tracked needs nothing: the churn will reach its
          // leads through detect-tech-signals on the next enrichment.
          if (signal?.known) continue;
          const domain = cleanDomain(signal?.domain);
          const name = typeof signal?.company === "string" ? signal.company.trim() : "";
          if (!name && !domain) continue;

          // Name and domain only. On a churn signal they no longer run the
          // product, so seeding it into tech_stack would state the opposite of
          // what was observed and mislead every score downstream.
          const { error } = await supabase.from("companies").insert({
            user_id: profile.user_id,
            name: name || domain!.split(".")[0],
            domain,
          });
          // 23505 is the per-user uniqueness constraint: already theirs.
          if (error && error.code !== "23505") {
            console.error("[import-tech-accounts] insert failed:", error.message);
            continue;
          }
          if (!error) imported++;
        }
      } catch (e) {
        console.error("[import-tech-accounts] user failed:", profile.user_id, e instanceof Error ? e.message : e);
      }
    }

    console.log(`[import-tech-accounts] ${targets.length} users, ${scanned} signals, ${imported} accounts added`);
    return json({ users: targets.length, scanned, imported });
  } catch (e) {
    console.error("[import-tech-accounts] error:", e instanceof Error ? e.message : e);
    return json({ error: "internal" }, 500);
  }
});
