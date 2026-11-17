// process-bulk-runs — works one approved bulk run for one bounded pass.
//
// Woken by trigger_bulk_runs (inside the existing once-a-minute agent queue
// tick). Deterministic: no model decides what to do next, so a run cannot
// "forget" leads or report work it did not do. Every count is a database row.
//
//   lease (single-flight per run) → feed next page of matching leads by keyset
//   cursor (never past the approved cap) → claim a small batch → research then
//   draft each lead → settle each item as it finishes → bump counters → cool
//   off on rate limits, pause on credit/billing errors → release lease.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { requireServiceRole } from "../_shared/internal-auth.ts";
import { DRAFT_TIER_HEADER } from "../_shared/draft-tier.ts";
import { draftForLead, goalForLead, leadThreads, leadsWithDrafts, sentSubjectsFor } from "../_shared/draft-one.ts";
import {
  applyBulkFilters, classifyFailure, feedSize, itemBackoffSeconds, keysetOr, MAX_ATTEMPTS,
  normalizeFilters, RATE_LIMIT_PAUSE_AFTER, runCooloffSeconds,
} from "../_shared/bulk-run-logic.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BUDGET_MS = 110_000;
const LEASE_SECONDS = 150;
const CONCURRENCY = Math.min(Math.max(Number(Deno.env.get("BULK_RUN_CONCURRENCY")) || 6, 1), 12);

serve(async (req) => {
  const authFail = requireServiceRole(req);
  if (authFail) return authFail;
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > BUDGET_MS - 25_000;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const invokeFn = async (name: string, body: unknown): Promise<any> => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json",
          ...(name === "generate-email" ? { [DRAFT_TIER_HEADER]: "pro" } : {}),
        },
        body: JSON.stringify(body ?? {}),
      });
      const text = await res.text();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = { error: text.slice(0, 300) || `${name} returned ${res.status}` }; }
      if (!res.ok && !parsed?.error) parsed = { ...parsed, error: `${name} returned ${res.status}` };
      if (res.status === 429 && parsed?.error && !/429|rate/i.test(String(parsed.error))) parsed.error = `rate limit: ${parsed.error}`;
      return parsed;
    } catch (e) {
      return { error: `network: ${e instanceof Error ? e.message : "unreachable"}` };
    }
  };

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const runId = String(body.run_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return json({ error: "run_id required" }, 400);

  const { data: token } = await admin.rpc("acquire_bulk_run_lease", { p_run: runId, p_seconds: LEASE_SECONDS });
  if (!token) return json({ skipped: "busy, paused, or cooling off" });

  const tally = { researched: 0, drafted: 0, skipped: 0, failed: 0 };
  let rateLimited = false;
  let pauseReason: string | null = null;
  try {
    const { data: runRow } = await admin.from("bulk_runs").select("*").eq("id", runId).maybeSingle();
    const run = runRow as Record<string, any> | null;
    if (!run || run.status !== "running") return json({ skipped: "not running" });
    const userId = String(run.user_id);
    const now = () => new Date().toISOString();

    // ── Feed: page the next matching leads with a keyset cursor ──
    const { count: open } = await admin.from("bulk_run_items").select("id", { count: "exact", head: true })
      .eq("run_id", runId).in("stage", ["pending", "claimed"]);
    let feedExhausted = Boolean(run.feed_exhausted);
    const want = feedExhausted ? 0 : feedSize(Number(run.enqueued), run.max_leads, open ?? 0);
    if (!feedExhausted && want === 0 && run.max_leads != null && Number(run.enqueued) >= Number(run.max_leads)) {
      feedExhausted = true;
      await admin.from("bulk_runs").update({ feed_exhausted: true }).eq("id", runId);
    }
    if (want > 0) {
      let q = applyBulkFilters(admin.from("leads").select("id, created_at"), userId, normalizeFilters(run.filters));
      const or = keysetOr({ created_at: run.cursor_created_at, id: run.cursor_id });
      if (or) q = q.or(or);
      const { data: page, error: pageErr } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(want);
      if (pageErr) throw new Error(`feed: ${pageErr.message}`);
      const rows = (page ?? []) as { id: string; created_at: string }[];
      if (rows.length) {
        const { error: insErr } = await admin.from("bulk_run_items").upsert(
          rows.map((r) => ({ run_id: runId, user_id: userId, lead_id: r.id })),
          { onConflict: "run_id,lead_id", ignoreDuplicates: true },
        );
        if (insErr) throw new Error(`enqueue: ${insErr.message}`);
      }
      const last = rows[rows.length - 1];
      const enqueued = Number(run.enqueued) + rows.length;
      feedExhausted = rows.length < want || (run.max_leads != null && enqueued >= Number(run.max_leads));
      await admin.from("bulk_runs").update({
        enqueued,
        feed_exhausted: feedExhausted,
        ...(last ? { cursor_created_at: last.created_at, cursor_id: last.id } : {}),
        updated_at: now(),
      }).eq("id", runId);
    }

    // ── Draft context, read once per pass ──
    let draftCtx: Record<string, any> | null = null;
    if (run.do_draft) {
      const [{ data: config }, { data: profile }, { data: boxes }] = await Promise.all([
        run.agent_config_id
          ? admin.from("agent_configs").select("tone, company_context, value_props").eq("id", run.agent_config_id).eq("user_id", userId).maybeSingle()
          : Promise.resolve({ data: null }),
        admin.from("profiles").select("full_name, company_name").eq("id", userId).maybeSingle(),
        admin.from("sending_accounts").select("email, integration_id").eq("user_id", userId).order("created_at", { ascending: true }),
      ]);
      draftCtx = {
        tone: String((config as any)?.tone ?? "professional"),
        senderName: String((profile as any)?.full_name ?? ""),
        senderEmail: String(((boxes ?? []) as any[]).find((a) => a.integration_id && a.email)?.email ?? ""),
        // Generated emails sign with the user's own company only.
        senderCompany: String((profile as any)?.company_name ?? (config as any)?.company_context ?? ""),
        businessDescription: [(config as any)?.company_context ?? "", ((config as any)?.value_props ?? []).join("; ")]
          .filter(Boolean).join(" — ").slice(0, 600),
      };
    }

    // ── Claim and work a bounded batch ──
    const { data: claimed, error: claimErr } = await admin.rpc("claim_bulk_run_items", { p_run: runId, p_limit: CONCURRENCY * 3 });
    if (claimErr) throw new Error(`claim: ${claimErr.message}`);
    const queue = [...((claimed ?? []) as Record<string, any>[])];
    const handBack: Record<string, any>[] = [];

    const settle = async (item: Record<string, any>, message: string) => {
      const kind = classifyFailure(message);
      if (kind === "credits") {
        pauseReason = "AI usage limit reached. Resume once it is restored.";
        handBack.push(item);
        return;
      }
      if (kind === "rate_limit") rateLimited = true;
      if ((kind === "rate_limit" || kind === "transient") && Number(item.attempts) < MAX_ATTEMPTS) {
        await admin.from("bulk_run_items").update({
          stage: "pending", claimed_at: null, error: message.slice(0, 400),
          next_attempt_at: new Date(Date.now() + itemBackoffSeconds(Number(item.attempts)) * 1000).toISOString(),
        }).eq("id", item.id);
        return;
      }
      await admin.from("bulk_run_items").update({ stage: "failed", error: message.slice(0, 400), finished_at: now() }).eq("id", item.id);
      tally.failed++;
    };

    const work = async (item: Record<string, any>) => {
      const { data: lead } = await admin.from("leads").select("*").eq("id", item.lead_id).eq("user_id", userId).maybeSingle();
      if (!lead) {
        await admin.from("bulk_run_items").update({ stage: "skipped", error: "Lead no longer exists", finished_at: now() }).eq("id", item.id);
        tally.skipped++;
        return;
      }
      if (run.do_draft) {
        const have = await leadsWithDrafts(admin, userId, [String(item.lead_id)]);
        if (have.has(String(item.lead_id))) {
          await admin.from("bulk_run_items").update({ stage: "skipped", error: "Already has a draft", finished_at: now() }).eq("id", item.id);
          tally.skipped++;
          return;
        }
      }
      if (run.do_research && !item.research_done) {
        const r = await invokeFn("research-lead", { leadId: item.lead_id, lead_id: item.lead_id, lead });
        if (r?.error) return settle(item, String(r.error));
        await admin.from("bulk_run_items").update({ research_done: true }).eq("id", item.id);
        item.research_done = true;
        tally.researched++;
      }
      if (!run.do_draft) {
        await admin.from("bulk_run_items").update({ stage: "done", error: null, finished_at: now() }).eq("id", item.id);
        return;
      }
      const { data: fresh } = await admin.from("leads").select("*").eq("id", item.lead_id).maybeSingle();
      const thread = (await leadThreads(admin, userId, [String(item.lead_id)])).get(String(item.lead_id));
      const goal = goalForLead(String(run.goal ?? "introduction"), thread?.state ?? "never_contacted");
      const avoid = await sentSubjectsFor(admin, userId, [String(item.lead_id)]);
      const result = await draftForLead({ admin, userId, invokeFn }, (fresh ?? lead) as any, {
        goal, thread, ...draftCtx!,
        ...(run.feedback ? { customInstruction: String(run.feedback), variantNum: 1 } : {}),
        triggerContext: `Bulk run — ${goal}`,
      } as any, avoid.get(String(item.lead_id)) ?? []);
      if (result.skipped) {
        await admin.from("bulk_run_items").update({ stage: "skipped", error: result.skipped, finished_at: now() }).eq("id", item.id);
        tally.skipped++;
        return;
      }
      if (!result.draft_id) return settle(item, String(result.error ?? "Draft failed"));
      await admin.from("bulk_run_items").update({ stage: "done", draft_id: result.draft_id, error: null, finished_at: now() }).eq("id", item.id);
      tally.drafted++;
    };

    const drain = async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;
        if (outOfTime() || pauseReason || rateLimited) { handBack.push(item); continue; }
        // Paused/cancelled guard before every provider call.
        const { data: st } = await admin.from("bulk_runs").select("status").eq("id", runId).maybeSingle();
        if ((st as any)?.status !== "running") { handBack.push(item); continue; }
        try { await work(item); } catch (e) { await settle(item, e instanceof Error ? e.message : "Unexpected error"); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => drain()));

    // Unstarted rows go back without burning an attempt.
    for (const item of handBack) {
      await admin.from("bulk_run_items").update({
        stage: "pending", claimed_at: null, attempts: Math.max(0, Number(item.attempts) - 1),
      }).eq("id", item.id).eq("stage", "claimed");
    }

    await admin.rpc("bump_bulk_run", {
      p_run: runId, p_researched: tally.researched, p_drafted: tally.drafted, p_skipped: tally.skipped, p_failed: tally.failed,
    });

    const consecutive = rateLimited ? Number(run.consecutive_rate_limits) + 1 : 0;
    const update: Record<string, unknown> = { consecutive_rate_limits: consecutive, updated_at: now() };
    if (rateLimited) {
      update.rate_limited_until = new Date(Date.now() + runCooloffSeconds(consecutive) * 1000).toISOString();
      if (consecutive >= RATE_LIMIT_PAUSE_AFTER) {
        pauseReason = "Research and drafting providers kept rate limiting. Resume to try again.";
      }
    }
    if (pauseReason) { update.status = "paused"; update.pause_reason = pauseReason; }

    if (!pauseReason && feedExhausted) {
      const { count: left } = await admin.from("bulk_run_items").select("id", { count: "exact", head: true })
        .eq("run_id", runId).in("stage", ["pending", "claimed"]);
      if (!left) { update.status = "completed"; update.finished_at = now(); }
    }
    await admin.from("bulk_runs").update(update).eq("id", runId).eq("status", "running");
    return json({ ...tally, rateLimited, paused: pauseReason });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[process-bulk-runs]", msg);
    await admin.from("bulk_runs").update({ last_error: msg.slice(0, 400), updated_at: new Date().toISOString() }).eq("id", runId);
    return json({ error: "pass failed" }, 500);
  } finally {
    await admin.rpc("release_bulk_run_lease", { p_run: runId, p_token: token });
  }
});
