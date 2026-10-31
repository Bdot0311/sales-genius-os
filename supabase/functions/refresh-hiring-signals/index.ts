import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";

/**
 * Keeps hiring signals current for the leads somebody is actually working.
 *
 * `detect-hiring-signals` had exactly one caller, `enrich-lead`, so a lead's
 * job board was read once in its life and never again. Every role posted after
 * that was invisible, and `SIGNAL_FRESHNESS_DAYS` (120) meant the signal aged
 * out of the copy with nothing to replace it. A buying signal sampled once at
 * enrichment is not a signal, it is a snapshot — the whole value of "they
 * posted this role three weeks ago" is that it is true this week.
 *
 * Only hiring is refreshed here, and that is deliberate. The other two
 * detectors are equally stale and cost money to re-run: `detect-tech-signals`
 * spends a Bloomberry credit on every uncached lookup and the news one a
 * PredictLeads credit, which is why both cache hard. Putting them on a
 * schedule would quietly spend third-party credits across a whole book of
 * leads, and that is an account-level spending decision rather than a code
 * one. Public ATS boards are free, so hiring can be refreshed without asking.
 *
 * Scope is narrowed the same way for the same reason: leads with a LIVE
 * sequence enrollment. Re-polling a board for a lead nobody is emailing buys
 * nothing — and when somebody does pick that lead up, `research-lead` now
 * backfills the signal on the spot. So the schedule covers "being worked" and
 * research covers "about to be worked", and neither has to sweep the table.
 *
 * Service-role only; the pg_cron job signs with the vault-backed internal key.
 */

const DEFAULT_BATCH = 40;
const MAX_BATCH = 200;
/** How many detector calls are in flight at once. */
const CONCURRENCY = 5;
const CALL_TIMEOUT_MS = 20_000;

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface DueLead {
  lead_id: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authFail = requireServiceRole(req);
  if (authFail) return authFail;

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const batch = Math.min(Math.max(Number(body.batch) || DEFAULT_BATCH, 1), MAX_BATCH);

    /*
     * Selection is a database function, not a query built here.
     *
     * It needs the newest `ats:` signal per lead joined against live
     * enrollments, which is an aggregate PostgREST cannot express without
     * pulling every row back to compare in TypeScript. It also round-robins
     * across accounts, so one account's large book cannot own the schedule —
     * the same fairness problem `process-rescore-queue` had when it ordered
     * globally by enqueued_at.
     */
    const { data, error } = await supabase.rpc("leads_due_for_hiring_refresh", { p_limit: batch });
    if (error) {
      console.error("[refresh-hiring-signals] selection failed:", error.message);
      return json({ error: "could not select leads", error_code: "db_error" }, 500);
    }

    const due = (data ?? []) as DueLead[];
    if (!due.length) return json({ refreshed: 0, detected: 0, reason: "nothing due" });

    let detected = 0;
    let failed = 0;

    // Bounded concurrency: these are other people's job boards, and a burst of
    // forty parallel requests at one ATS is how an IP gets rate-limited.
    const queue = [...due];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
        try {
          const res = await fetch(`${url}/functions/v1/detect-hiring-signals`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ leadId: next.lead_id }),
            signal: ctrl.signal,
          });
          const out = await res.json().catch(() => null);
          if (!res.ok) {
            failed++;
            console.error(`[refresh-hiring-signals] ${next.lead_id}: ${res.status}`);
          } else if (out?.detected && !out?.deduped) {
            detected++;
          }
        } catch (e) {
          failed++;
          console.error(`[refresh-hiring-signals] ${next.lead_id}:`, e instanceof Error ? e.message : e);
        } finally {
          clearTimeout(timer);
        }
      }
    });
    await Promise.all(workers);

    return json({ refreshed: due.length, detected, failed });
  } catch (e) {
    console.error("[refresh-hiring-signals] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
