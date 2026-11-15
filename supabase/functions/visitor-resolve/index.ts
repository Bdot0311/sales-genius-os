import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.76.1";
import { requireServiceRole } from "../_shared/internal-auth.ts";
import { CONTACTS_PER_RUN, planRuleRun, type VisitorAction } from "../_shared/visitor-automation.ts";
import {
  asnQueryName,
  decideIdentity,
  featureEnabled,
  isPrivateOrLocal,
  networkPrefix,
  parseAsnTxt,
  parseRdap,
  ptrName,
  registrableDomain,
  visitFacts,
  VISITOR_FLAG,
  type IdentityDecision,
  type RegistrySignals,
} from "../_shared/visitor-identity.ts";
import { evaluateLeadWithJEV, leadIntelligenceEnabled, loadSellerContext } from "../_shared/lead-intelligence.ts";
import {
  RESOLVE_CLAIM_LIMIT,
  RESOLVE_CONCURRENCY,
  RESOLVE_WALL_BUDGET_MS,
  releaseQueuedClaim,
  runResolveBatch,
} from "../_shared/visitor-resolve-batch.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const denied = requireServiceRole(req);
  if (denied) return denied;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  await admin.rpc("visitor_apply_retention");
  const { data: jobs, error } = await admin.rpc("claim_visitor_resolve_jobs", { p_limit: RESOLVE_CLAIM_LIMIT });
  if (error) {
    console.error("[visitor-resolve] claim failed", error.message);
    return json({ error: error.message }, 500);
  }

  let resolved = 0;
  let automated = 0;
  let skipped = 0;
  const startedAt = Date.now();
  const { deferred } = await runResolveBatch((jobs ?? []) as Job[], {
    concurrency: RESOLVE_CONCURRENCY,
    budgetMs: RESOLVE_WALL_BUDGET_MS,
    startedAt,
    now: () => Date.now(),
    run: async (job) => {
      try {
        // The queue outlives the switch. A job claimed after the flag or the
        // workspace grant is turned off must not spend search, enrich, research
        // or draft credits.
        if (!(await workspaceEnabled(admin, job.user_id))) {
          skipped += 1;
          await admin.from("visitor_resolve_jobs").update({
            status: "done",
            ip_raw: null,
            last_error: "Visitor Intelligence is off for this workspace.",
            finished_at: new Date().toISOString(),
          }).eq("id", job.id);
          return;
        }
        const matchId = await resolveJob(admin, job);
        resolved += 1;
        if (matchId) automated += await runRules(admin, job, matchId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "resolve failed";
        console.error("[visitor-resolve] job failed", message);
        await admin.from("visitor_resolve_jobs").update({
          status: "failed",
          ip_raw: null,
          last_error: message.slice(0, 300),
          finished_at: new Date().toISOString(),
        }).eq("id", job.id);
      }
    },
  });

  // Claim already incremented attempts and set status to running. Put back
  // only rows that are still running, and give the attempt back, so a job
  // this run did not reach is queued for the next cron instead of waiting
  // out the 10-minute reclaim.
  for (const job of deferred) {
    const { error: releaseError } = await admin.from("visitor_resolve_jobs").update(releaseQueuedClaim(job.attempts))
      .eq("id", job.id)
      .eq("status", "running");
    if (releaseError) console.error("[visitor-resolve] release failed", releaseError.message);
  }
  return json({ resolved, automated, skipped, deferred: deferred.length });
});

async function workspaceEnabled(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: flag } = await admin.from("feature_flags").select("is_enabled").eq("name", VISITOR_FLAG).maybeSingle();
  const { data: grant } = await admin.from("visitor_workspace_grants").select("enabled").eq("user_id", userId).maybeSingle();
  return featureEnabled(flag?.is_enabled === true, grant?.enabled === true);
}

async function resolveJob(admin: SupabaseClient, job: Job): Promise<string | null> {
  const prefix = job.network_prefix || (job.ip_raw ? networkPrefix(job.ip_raw) : null);
  let decision: IdentityDecision;

  if (!job.ip_raw || isPrivateOrLocal(job.ip_raw)) {
    const cached = await readIpCache(admin, job.ip_hash);
    decision = cached ?? unknownDecision(prefix, job.ip_raw ? "Private or local address." : "Address expired before it could be resolved.");
  } else {
    const network = prefix ? await readNetworkCache(admin, prefix) : null;
    if (network) decision = network;
    else {
      const cached = await readIpCache(admin, job.ip_hash);
      decision = cached ?? await lookupIdentity(admin, job.user_id, job.ip_raw, prefix);
      const transient = decision.status === "unknown" && decision.evidence.length === 0;
      const definitiveNonCompany = ["isp", "mobile", "cloud", "hosting", "vpn", "residential"].includes(decision.classification);
      if (!cached && !transient && definitiveNonCompany && prefix) {
        await admin.from("visitor_network_cache").upsert({
          network_prefix: prefix,
          classification: decision.classification,
          unknown_reason: decision.unknownReason,
          evidence: decision.evidence,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        });
      }
      if (!cached && !transient) {
        await admin.from("visitor_ip_cache").upsert({
          ip_hash: job.ip_hash,
          status: decision.status,
          classification: decision.classification,
          company_name: decision.companyName,
          company_domain: decision.companyDomain,
          confidence: decision.confidence,
          unknown_reason: decision.unknownReason,
          evidence: decision.evidence,
          network_prefix: prefix,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
      }
    }
  }

  const matchId = await saveMatch(admin, job, decision);
  await admin.from("visitor_resolve_jobs").update({
    status: "done",
    ip_raw: null,
    finished_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", job.id);
  return matchId;
}

async function lookupIdentity(admin: SupabaseClient, userId: string, ip: string, prefix: string | null): Promise<IdentityDecision> {
  const signals = await lookupSignals(ip);
  const domain = registrableDomain(signals.ptrHost);
  let local: { id: string; name: string; domain: string } | null = null;
  if (domain) {
    const { data } = await admin.from("companies").select("id, name, domain").eq("user_id", userId).eq("domain", domain).maybeSingle();
    if (data?.id && data.name && data.domain) local = { id: data.id, name: data.name, domain: data.domain };
  }
  return decideIdentity(signals, { localCompany: local, prefix });
}

async function lookupSignals(ip: string): Promise<RegistrySignals> {
  const errors: string[] = [];
  const [ptr, asnTxt, rdap] = await Promise.all([
    dnsLookup(ptrName(ip), "PTR").catch((err) => { errors.push(String(err)); return null; }),
    dnsLookup(asnQueryName(ip), "TXT").catch((err) => { errors.push(String(err)); return null; }),
    rdapLookup(ip).catch((err) => { errors.push(String(err)); return null; }),
  ]);
  const parsedAsn = parseAsnTxt(asnTxt);
  const parsedRdap = parseRdap(rdap);
  let asnName: string | null = null;
  if (parsedAsn) {
    asnName = await dnsLookup(`AS${parsedAsn.asn}.asn.cymru.com`, "TXT").catch(() => null);
    if (asnName) asnName = asnName.replace(/"/g, "").split("|")[4]?.trim() || asnName.replace(/"/g, "").trim();
  }
  const failed = !ptr && !parsedAsn && !parsedRdap.org && !parsedRdap.network;
  return {
    ptrHost: ptr ? ptr.replace(/\.$/, "").toLowerCase() : null,
    rdapOrg: parsedRdap.org,
    rdapNetwork: parsedRdap.network,
    cidr: parsedRdap.cidr,
    asn: parsedAsn?.asn ?? null,
    asnName,
    lookupError: failed ? (errors[0] ? "Identity lookup failed." : "No registry or DNS signal for this address.") : null,
  };
}

async function dnsLookup(name: string | null, type: string): Promise<string | null> {
  if (!name) return null;
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`DNS ${type} failed`);
  const payload = await response.json();
  const answer = Array.isArray(payload?.Answer) ? payload.Answer.find((row: { data?: string }) => row?.data) : null;
  return typeof answer?.data === "string" ? answer.data : null;
}

async function rdapLookup(ip: string): Promise<unknown> {
  const response = await fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
    headers: { Accept: "application/rdap+json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("RDAP lookup failed");
  return response.json();
}

async function saveMatch(admin: SupabaseClient, job: Job, decision: IdentityDecision): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: existing } = await admin.from("visitor_company_matches")
    .select("id, status")
    .eq("site_id", job.site_id)
    .eq("visitor_key", job.visitor_key)
    .maybeSingle();
  if (existing?.status === "matched" && decision.status !== "matched") {
    await admin.from("visitor_company_matches").update({ last_seen: now }).eq("id", existing.id);
    return existing.id;
  }
  const row = {
    site_id: job.site_id,
    user_id: job.user_id,
    visitor_key: job.visitor_key,
    status: decision.status,
    classification: decision.classification,
    company_id: decision.companyId,
    company_name: decision.companyName,
    company_domain: decision.companyDomain,
    confidence: decision.confidence,
    unknown_reason: decision.unknownReason,
    evidence: decision.evidence,
    network_prefix: decision.networkPrefix,
    last_seen: now,
    resolved_at: now,
  };
  if (existing) {
    await admin.from("visitor_company_matches").update(row).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await admin.from("visitor_company_matches").insert({ ...row, first_seen: now }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function readNetworkCache(admin: SupabaseClient, prefix: string): Promise<IdentityDecision | null> {
  const { data } = await admin.from("visitor_network_cache")
    .select("classification, unknown_reason, evidence, expires_at")
    .eq("network_prefix", prefix)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.classification === "company") return null;
  return {
    status: "unknown",
    classification: data.classification,
    confidence: null,
    companyName: null,
    companyDomain: null,
    companyId: null,
    unknownReason: data.unknown_reason || "Cached non-company network.",
    networkPrefix: prefix,
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
  };
}

async function readIpCache(admin: SupabaseClient, ipHash: string): Promise<IdentityDecision | null> {
  const { data } = await admin.from("visitor_ip_cache")
    .select("status, classification, company_name, company_domain, confidence, unknown_reason, evidence, network_prefix, expires_at")
    .eq("ip_hash", ipHash)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.status === "matched" && (!data.company_name || !data.company_domain || data.confidence == null)) return null;
  return {
    status: data.status,
    classification: data.classification,
    confidence: data.status === "matched" ? Number(data.confidence) : null,
    companyName: data.status === "matched" ? data.company_name : null,
    companyDomain: data.status === "matched" ? data.company_domain : null,
    companyId: null,
    unknownReason: data.status === "unknown" ? data.unknown_reason : null,
    networkPrefix: data.network_prefix,
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
  };
}

function unknownDecision(prefix: string | null, reason: string): IdentityDecision {
  return {
    status: "unknown",
    classification: "unknown",
    confidence: null,
    companyName: null,
    companyDomain: null,
    companyId: null,
    unknownReason: reason,
    networkPrefix: prefix,
    evidence: [],
  };
}

async function runRules(admin: SupabaseClient, job: Job, matchId: string): Promise<number> {
  const { data: match } = await admin.from("visitor_company_matches")
    .select("id, status, confidence, company_name, company_domain, company_id, user_id, site_id, visitor_key")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return 0;
  const { data: events } = await admin.from("visitor_events")
    .select("path, page_type, event_name")
    .eq("site_id", job.site_id)
    .eq("visitor_key", job.visitor_key)
    .order("received_at", { ascending: false })
    .limit(50);
  const seen = events ?? [];
  const { data: rules } = await admin.from("visitor_rules")
    .select("id, enabled, min_confidence, page_types, event_names, actions, daily_cap, sequence_id")
    .eq("site_id", job.site_id)
    .eq("user_id", job.user_id)
    .eq("enabled", true);
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count: workspaceRuns } = await admin.from("visitor_rule_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", job.user_id)
    .gte("created_at", since)
    .in("status", ["running", "completed", "failed"]);
  let started = 0;
  for (const rule of rules ?? []) {
    const { count: ruleRuns } = await admin.from("visitor_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("rule_id", rule.id)
      .gte("created_at", since)
      .in("status", ["running", "completed", "failed"]);
    const { data: prior } = await admin.from("visitor_rule_runs").select("id").eq("rule_id", rule.id).eq("match_id", matchId).maybeSingle();
    const plan = planRuleRun({
      rule: {
        enabled: rule.enabled,
        minConfidence: Number(rule.min_confidence),
        pageTypes: rule.page_types ?? [],
        eventNames: rule.event_names ?? [],
        actions: rule.actions ?? [],
        dailyCap: rule.daily_cap,
        sequenceId: rule.sequence_id,
      },
      match: {
        status: match.status,
        confidence: match.confidence == null ? null : Number(match.confidence),
        pageTypes: seen.map((event) => event.page_type),
        eventNames: seen.map((event) => event.event_name),
      },
      runsTodayForRule: ruleRuns ?? 0,
      runsTodayForWorkspace: workspaceRuns ?? 0,
      alreadyRan: !!prior,
    });
    if (!plan.run) {
      if (!prior) {
        await admin.from("visitor_rule_runs").insert({
          rule_id: rule.id,
          match_id: matchId,
          user_id: job.user_id,
          status: "skipped",
          skip_reason: plan.reason,
        });
      }
      continue;
    }
    // The counts above are a hint. Jobs in this batch, and the next rule in
    // this same job, would otherwise all read the same number and each insert
    // a running row. The claim locks, counts again, and inserts only when
    // both caps still have room. Paid work waits on that.
    const claimed = await admin.rpc("claim_visitor_rule_run", {
      p_user_id: job.user_id,
      p_rule_id: rule.id,
      p_match_id: matchId,
    });
    if (claimed.error || claimed.data !== true) {
      if (claimed.error) console.error("[visitor-resolve] rule claim failed", claimed.error.message);
      const skipped = await admin.from("visitor_rule_runs").insert({
        rule_id: rule.id,
        match_id: matchId,
        user_id: job.user_id,
        status: "skipped",
        skip_reason: "Daily cap is reached.",
      });
      if (skipped.error && skipped.error.code !== "23505") {
        console.error("[visitor-resolve] cap skip failed", skipped.error.message);
      }
      continue;
    }
    const { data: running } = await admin.from("visitor_rule_runs").select("id")
      .eq("rule_id", rule.id)
      .eq("match_id", matchId)
      .eq("status", "running")
      .maybeSingle();
    if (!running) continue;
    started += 1;
    const taken = await executeActions(admin, job.user_id, match, seen, plan.actions, rule.sequence_id);
    const failed = taken.some((item) => !item.ok);
    await admin.from("visitor_rule_runs").update({
      status: failed ? "failed" : "completed",
      actions_taken: taken,
      finished_at: new Date().toISOString(),
      skip_reason: failed ? taken.find((item) => !item.ok)?.detail ?? "Action failed" : null,
    }).eq("id", running.id);
  }
  return started;
}

async function executeActions(
  admin: SupabaseClient,
  userId: string,
  match: { id: string; company_name: string | null; company_domain: string | null; company_id: string | null },
  events: { path: string; page_type: string; event_name: string }[],
  actions: VisitorAction[],
  sequenceId: string | null,
): Promise<{ action: string; ok: boolean; detail: string }[]> {
  const results: { action: string; ok: boolean; detail: string }[] = [];
  let leadIds: string[] = [];
  if (actions.includes("find_contacts")) {
    const found = await findContacts(admin, userId, match, events);
    results.push(found.summary);
    leadIds = found.leadIds;
  }
  const leadId = leadIds[0];
  if (leadId) {
    if (actions.includes("enrich")) results.push(await callOwned("enrich", "enrich-lead", { leadId }));
    if (actions.includes("research")) results.push(await callOwned("research", "research-lead", { leadId }));
    if (actions.includes("score")) results.push(await scoreLead(admin, userId, leadId, events));
    if (actions.includes("draft")) results.push(await callOwned("draft", "generate-email", { lead: { id: leadId }, goal: "introduction" }));
    if (actions.includes("enroll") && sequenceId) results.push(await enrollPaused(admin, userId, leadId, sequenceId));
    if (leadIds.length > 1) {
      results.push({ action: "saved", ok: true, detail: `Saved ${leadIds.length} contacts. Enrichment, research and drafts ran for the first so one visit cannot fan out.` });
    }
  } else if (actions.some((action) => action !== "find_contacts")) {
    results.push({ action: "follow_up", ok: false, detail: "No contact was saved, so enrich, research, scoring, drafts and enrollment did not run." });
  }
  return results;
}

async function findContacts(
  admin: SupabaseClient,
  userId: string,
  match: { company_name: string | null; company_domain: string | null; company_id: string | null },
  events: { path: string; page_type: string; event_name: string }[],
): Promise<{ summary: { action: string; ok: boolean; detail: string }; leadIds: string[] }> {
  if (!match.company_domain || !match.company_name) {
    return { summary: { action: "find_contacts", ok: false, detail: "Matched company has no domain." }, leadIds: [] };
  }
  const job = await admin.from("agent_jobs").insert({
    user_id: userId,
    kind: "visitor_search",
    status: "done",
    request_text: "visitor intelligence contact search",
    autonomy: "approval",
    goal: "introduction",
    total: 0,
    finished_at: new Date().toISOString(),
  }).select("id").single();
  if (job.error || !job.data) {
    return { summary: { action: "find_contacts", ok: false, detail: job.error?.message ?? "Could not open a search job." }, leadIds: [] };
  }
  const searched = await callFunction("fetch-external-leads", {
    job_id: job.data.id,
    company_domain: match.company_domain,
    limit: CONTACTS_PER_RUN,
  });
  const people = Array.isArray(searched.body?.leads) ? searched.body.leads : [];
  if (!searched.ok) {
    return { summary: { action: "find_contacts", ok: false, detail: searched.body?.error || "People search failed." }, leadIds: [] };
  }
  let companyId = match.company_id;
  if (!companyId) {
    const existing = await admin.from("companies").select("id").eq("user_id", userId).eq("domain", match.company_domain).maybeSingle();
    companyId = existing.data?.id ?? null;
    if (!companyId) {
      const created = await admin.from("companies").insert({
        user_id: userId,
        name: match.company_name,
        domain: match.company_domain,
      }).select("id").single();
      companyId = created.data?.id ?? null;
    }
  }
  const facts = visitFacts(events);
  const leadIds: string[] = [];
  for (const person of people.slice(0, CONTACTS_PER_RUN)) {
    const name = typeof person?.contact_name === "string" && person.contact_name.trim()
      ? person.contact_name.trim().slice(0, 100)
      : "";
    if (!name) continue;
    const email = typeof person.contact_email === "string" ? person.contact_email : null;
    const inserted = await admin.from("leads").insert({
      user_id: userId,
      company_name: match.company_name,
      company_id: companyId,
      company_website: `https://${match.company_domain}`,
      contact_name: name,
      contact_email: email,
      job_title: typeof person.job_title === "string" ? person.job_title : null,
      linkedin_url: typeof person.linkedin_url === "string" ? person.linkedin_url : null,
      industry: typeof person.industry === "string" ? person.industry : null,
      source: "visitor_intelligence",
      lead_status: "active",
      signals: facts,
      signal_type: facts.length ? "website_visit" : null,
      signal_date: facts.length ? new Date().toISOString().slice(0, 10) : null,
    }).select("id").single();
    if (inserted.data?.id) leadIds.push(inserted.data.id);
  }
  return {
    summary: {
      action: "find_contacts",
      ok: true,
      detail: leadIds.length ? `Saved ${leadIds.length} contact${leadIds.length === 1 ? "" : "s"}.` : "People search returned nobody with a name.",
    },
    leadIds,
  };
}

async function scoreLead(
  admin: SupabaseClient,
  userId: string,
  leadId: string,
  events: { path: string; page_type: string; event_name: string }[],
): Promise<{ action: string; ok: boolean; detail: string }> {
  if (!(await leadIntelligenceEnabled(admin))) {
    return { action: "score", ok: false, detail: "Lead Intelligence is off, so Jev was not called." };
  }
  const { data: lead } = await admin.from("leads")
    .select("id, user_id, company_name, contact_name, job_title, company_website, signals, industry, company_size, company_description")
    .eq("id", leadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!lead) return { action: "score", ok: false, detail: "Lead was not found." };
  const facts = visitFacts(events);
  const signals = [...new Set([...(lead.signals ?? []), ...facts])].slice(0, 20);
  await admin.from("leads").update({
    signals,
    signal_type: facts.length ? "website_visit" : lead.signals?.length ? "website_visit" : null,
    signal_date: facts.length ? new Date().toISOString().slice(0, 10) : null,
  }).eq("id", leadId).eq("user_id", userId);
  const seller = await loadSellerContext(admin, userId);
  const { decision } = await evaluateLeadWithJEV(admin, { ...lead, signals, user_id: userId }, {
    seller,
    force: true,
    triggerSource: "campaign",
  });
  if (decision.status !== "ok") return { action: "score", ok: false, detail: "Jev did not return a decision." };
  return { action: "score", ok: true, detail: "Jev stored a decision from the lead and the visit record." };
}

async function enrollPaused(admin: SupabaseClient, userId: string, leadId: string, sequenceId: string) {
  const { data: sequence } = await admin.from("email_sequences").select("id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return { action: "enroll", ok: false, detail: "Sequence was not found in this workspace." };
  const { error } = await admin.from("sequence_enrollments").insert({
    user_id: userId,
    sequence_id: sequenceId,
    lead_id: leadId,
    status: "paused",
    paused_reason: "Visitor automation waits for you to resume this enrollment. Nothing sends while it is paused.",
  });
  if (error) return { action: "enroll", ok: false, detail: error.message };
  return { action: "enroll", ok: true, detail: "Enrolled paused. Resume the enrollment to let the existing sequence sender run." };
}

async function callOwned(action: string, fn: string, body: Record<string, unknown>) {
  const result = await callFunction(fn, body);
  return {
    action,
    ok: result.ok && !result.body?.error,
    detail: result.ok && !result.body?.error ? "Completed through the existing function." : (result.body?.error || `${fn} failed`),
  };
}

async function callFunction(name: string, body: Record<string, unknown>): Promise<{ ok: boolean; body: Record<string, any> | null }> {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || !key) return { ok: false, body: { error: "Function URL is not configured." } };
  try {
    const response = await fetch(`${base}/functions/v1/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, body: payload };
  } catch (err) {
    return { ok: false, body: { error: err instanceof Error ? err.message : "Call failed" } };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface Job {
  id: string;
  site_id: string;
  user_id: string;
  visitor_key: string;
  ip_hash: string;
  ip_raw: string | null;
  network_prefix: string | null;
  attempts?: number;
}
