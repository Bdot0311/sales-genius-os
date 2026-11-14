import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { UNTRUSTED_CONTENT_RULE, fence } from "../_shared/untrusted.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { captureServerEvent } from "../_shared/posthog.ts";
import {
  AGENT_MAX_ATTEMPTS,
  AGENT_TARGET_SCORE,
  attemptFeedback,
  better,
  isPerfect,
  autonomousSendAllowed,
  scoreEmailReport,
  type Attempt,
  type RubricDimension,
} from "../_shared/email-quality.ts";
import { auditEmail } from "../_shared/email-audit.ts";
import { buildAgentRunSummary, classifyProviderSend, reconcileReceipts, type ToolReceipt } from "../_shared/run-receipts.ts";
import { advanceReply, rpcStepStore, runPhase, type StepStore } from "../_shared/lead-run.ts";
import { evaluateStoredSnapshots } from "../_shared/evidence-contract.ts";
import { contentHash, gatePromptHash, rubricPromptHash } from "../_shared/prompt-versions.ts";
import { agentProhibitions } from "../_shared/agent-prohibitions.ts";
import { deliverabilityCheck } from "../_shared/email-deliverability.ts";
import { findPlaceholders, hasPlaceholder, bannedPhrasesBlock, realValue } from "../_shared/email-rules.ts";
// The autonomous agent writes email the same way every other path does, and
// was the one path that loaded none of the house rules — see _shared/email-skills.ts.
import { composeSkillContext } from "../_shared/email-skills.ts";
import {
  playbookSystemRules,
  buildTouchPrompt,
  parseTouches,
  scheduleFollowUps,
} from "../_shared/cold-email-playbook.ts";
import { AI_SMART, aiFetch } from "../_shared/ai-provider.ts";
import { capToolsToTier, resolveAgentTier } from "../_shared/agent-tier-scope.ts";
import { notifyAgentRunFinished, notifyMeetingBooked } from "../_shared/notify-events.ts";
import { researchBlockForLead } from "../_shared/lead-research-block.ts";
import { firstTouchBlockers, replySendBlockers } from "../_shared/factual-send.ts";
import {
  decisionForDrafting,
  decisionPromptBlock,
  loadSellerContext,
  type SellerContext,
} from "../_shared/lead-intelligence.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * The prospect's own website, read and summarized, for the agent's drafts.
 *
 * Outreach Studio has always written against this brief (generate-email scrapes
 * and caches it); the autonomous agent wrote from the lead row alone, which is
 * why its emails read thinner than the ones a person generates. Same brief,
 * same cache, same 14-day freshness rule. An empty block is not a researched
 * draft: company-specific assertions are rejected, and nothing is sent until
 * a person reviews it.
 */


async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const response = await aiFetch("agent-run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_SMART,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
}


interface Reply {
  sentEmailId: string;
  gmailMessageId: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  gmailThreadId: string;
  /**
   * The lead this reply belongs to, when inbox-sync could resolve one.
   *
   * It has always been on the wire — inbox-sync sends `leadId: thread.lead_id
   * ?? null` with every reply — and this interface simply did not say so, so
   * nothing here could use it without the type checker objecting. It is what
   * lets a reply the agent reads reach the sequence it belongs to.
   */
  leadId: string | null;
}

interface AgentConfig {
  id: string;
  enabled: boolean;
  agent_name: string;
  persona: string;
  tone: string;
  company_context: string | null;
  value_props: string[];
  objection_responses: Record<string, string>;
  can_reply_interested: boolean;
  can_handle_objections: boolean;
  can_book_meetings: boolean;
  calendly_url: string | null;
  max_daily_auto_replies: number;
  reply_delay_minutes: number;
  signature: string | null;
  can_find_leads: boolean;
  can_send_outreach: boolean;
  prospecting_job_title: string | null;
  prospecting_industry: string | null;
  prospecting_country: string | null;
  prospecting_company_size: string | null;
  daily_lead_target: number;
  max_daily_new_emails: number;
  icp_profile_id: string | null;
  icp_snapshot: Record<string, any> | null;
  /** Search pagination cursor, reset when the ICP behind it changes. */
  search_page?: number | null;
  search_page_icp_id?: string | null;
}

/** Maps an ICP employee-count range onto the provider's size buckets. */
function bucketFromRange(min?: number | null, max?: number | null): string {
  const lo = typeof min === "number" ? min : 0;
  const hi = typeof max === "number" && max > 0 ? max : lo;
  const mid = hi || lo;
  if (!mid) return "";
  if (mid <= 10) return "1-10";
  if (mid <= 50) return "11-50";
  if (mid <= 200) return "51-200";
  if (mid <= 500) return "201-500";
  if (mid <= 1000) return "501-1000";
  return "1000+";
}

/** Renders the saved ICP profile as prompt/search context so runs stay grounded. */
function buildIcpContext(snap: Record<string, any> | null | undefined): string {

  if (!snap || typeof snap !== "object") return "";
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : "");
  const lines: string[] = [];
  if (snap.name) lines.push(`ICP profile: ${snap.name}`);
  if (snap.summary) lines.push(`Summary: ${snap.summary}`);
  if (list(snap.target_titles)) lines.push(`Target titles: ${list(snap.target_titles)}`);
  if (list(snap.seniority_levels)) lines.push(`Seniority: ${list(snap.seniority_levels)}`);
  if (list(snap.departments)) lines.push(`Departments: ${list(snap.departments)}`);
  if (list(snap.industries)) lines.push(`Industries: ${list(snap.industries)}`);
  if (list(snap.geographies)) lines.push(`Geographies: ${list(snap.geographies)}`);
  if (snap.company_size_min || snap.company_size_max) {
    lines.push(`Company size: ${snap.company_size_min ?? "?"}-${snap.company_size_max ?? "?"} employees`);
  }
  if (list(snap.pain_points)) lines.push(`Pain points they feel: ${list(snap.pain_points)}`);
  if (list(snap.buying_signals)) lines.push(`Buying signals: ${list(snap.buying_signals)}`);
  if (list(snap.intent_keywords)) lines.push(`Intent keywords: ${list(snap.intent_keywords)}`);
  if (list(snap.event_triggers)) lines.push(`Trigger events: ${list(snap.event_triggers)}`);
  if (list(snap.hiring_signals)) lines.push(`Hiring signals: ${list(snap.hiring_signals)}`);
  if (list(snap.tech_stack)) lines.push(`Tech stack: ${list(snap.tech_stack)}`);
  if (list(snap.competitor_tools)) lines.push(`Competitor tools: ${list(snap.competitor_tools)}`);
  if (list(snap.use_cases)) lines.push(`Use cases: ${list(snap.use_cases)}`);
  if (snap.value_proposition) lines.push(`Value proposition: ${snap.value_proposition}`);
  if (list(snap.success_metrics)) lines.push(`Success metrics: ${list(snap.success_metrics)}`);
  if (list(snap.objections)) lines.push(`Common objections: ${list(snap.objections)}`);
  if (snap.customer_examples) lines.push(`Customer examples: ${snap.customer_examples}`);
  if (snap.disqualifiers) lines.push(`Disqualifiers: ${snap.disqualifiers}`);
  const excl = [list(snap.exclude_titles), list(snap.exclude_industries), list(snap.exclude_keywords)]
    .filter(Boolean)
    .join(" | ");
  if (excl) lines.push(`Never target: ${excl}`);
  if (snap.notes) lines.push(`Notes: ${snap.notes}`);
  return lines.length ? `IDEAL CUSTOMER PROFILE (use this for relevance and personalization):\n${lines.join("\n")}` : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const reqBody: { mode?: string; agentId?: string; trigger?: string; cancelRunId?: string } = await req.json().catch(() => ({}));

  // Every invocation gets a run id so the UI can group the audit trail into
  // discrete runs, and record *why* a run produced nothing. open_outbound_run
  // may replace it with an unfinished run so a restart resumes that run.
  let runId: string = crypto.randomUUID();
  const triggerSource = typeof reqBody.trigger === "string" ? reqBody.trigger : "manual";
  const auditClient = createClient(supabaseUrl, serviceKey);
  let auditUserId: string | null = null;
  let auditAgentId: string | null = null;

  const logRunEvent = async (row: Record<string, unknown>) => {
    if (!auditUserId) return;
    try {
      await auditClient.from("agent_actions").insert({
        user_id: auditUserId,
        agent_config_id: auditAgentId,
        run_id: runId,
        ...row,
      });
    } catch (logErr) {
      console.error("agent-run audit log failed:", logErr);
    }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(authHeader.replace("Bearer ", ""));

    // Demo mode: simulate instead of hitting providers or spending credits
    if (user && await isDemoMode(adminClient, user.id)) {
      return demoResponse({ message: 'Agent run simulated in demo mode — no emails sent and no credits spent.', actions: [] }, corsHeaders);
    }
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    auditUserId = user.id;
    if (typeof reqBody.cancelRunId === "string" && reqBody.cancelRunId.length > 0) {
      await adminClient.rpc("cancel_agent_run", { p_user_id: user.id, p_run_id: reqBody.cancelRunId });
      return new Response(JSON.stringify({ cancelled: true, runId: reqBody.cancelRunId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Rollout-off (no row, or the migration is not applied) keeps the in-memory
    // loop and says so. Enabled mode does not send if the step store fails.
    let durableMode: "on" | "off" = "off";
    let stepStore: StepStore | null = null;
    try {
      const flag = await adminClient.rpc("outbound_durable_enabled", { p_user_id: user.id });
      if (!flag.error && flag.data === true) durableMode = "on";
    } catch {
      durableMode = "off";
    }
    if (durableMode === "on") {
      try {
        const opened = await adminClient.rpc("open_outbound_run", { p_user_id: user.id });
        if (typeof opened.data !== "string" || opened.error) {
          return new Response(JSON.stringify({
            error: "Durable run storage is enabled and the open run could not be claimed. Nothing was sent.",
            durableMode: "on",
          }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        runId = opened.data;
        stepStore = rpcStepStore(adminClient);
      } catch (openErr) {
        console.error("[agent-run] durable open failed", openErr);
        return new Response(JSON.stringify({
          error: "Durable run storage is enabled and the open run could not be claimed. Nothing was sent.",
          durableMode: "on",
        }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Agent resolution ──────────────────────────────────────────────────
    // A user can own several agent builds. When no specific agent is named we
    // fan out over every enabled build (each one runs as its own invocation of
    // this function) so extra builds are not silently ignored.
    const requestedAgentId = typeof reqBody.agentId === "string" ? reqBody.agentId : null;

    let agentConfig: Record<string, any> | null = null;

    if (requestedAgentId) {
      const { data } = await adminClient
        .from("agent_configs")
        .select("*")
        .eq("id", requestedAgentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        await logRunEvent({
          action_type: "skipped",
          status: "skipped",
          description: "Run skipped: this agent build no longer exists.",
          metadata: { phase: "run", reason: "agent_not_found", trigger: triggerSource, requested_agent_id: requestedAgentId },
        });
        return new Response(
          JSON.stringify({ success: false, message: "Agent not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      agentConfig = data as Record<string, any>;
    } else {
      const { data: allAgents } = await adminClient
        .from("agent_configs")
        .select("*")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false });

      const enabledAgents = (allAgents ?? []).filter((a: any) => a.enabled);

      if (enabledAgents.length > 1) {
        const results = await Promise.all(
          enabledAgents.map(async (a: any) => {
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/agent-run`, {
                method: "POST",
                headers: { Authorization: authHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ ...reqBody, agentId: a.id, trigger: triggerSource }),
              });
              const payload = await res.json().catch(() => ({}));
              return { agentId: a.id, agentName: a.agent_name, role: a.role ?? "full_cycle", ...payload };
            } catch (fanErr: any) {
              return {
                agentId: a.id,
                agentName: a.agent_name,
                role: a.role ?? "full_cycle",
                success: false,
                error: fanErr?.message ?? "run failed",
              };
            }
          })
        );

        const total = (key: string) =>
          results.reduce((sum, r: any) => sum + (typeof r[key] === "number" ? r[key] : 0), 0);

        return new Response(
          JSON.stringify({
            success: results.some((r: any) => r.success),
            multiAgent: true,
            agentsRun: results.length,
            summary: `Ran ${results.length} agent(s): ${results
              .map((r: any) => `${r.agentName || "agent"} (${r.success ? "ok" : "failed"})`)
              .join(", ")}.`,
            leadsFound: total("leadsFound"),
            outreachSent: total("outreachSent"),
            outreachDrafted: total("outreachDrafted"),
            pendingApprovals: total("pendingApprovals"),
            repliesProcessed: total("repliesProcessed"),
            repliesSent: total("repliesSent"),
            meetingsBooked: total("meetingsBooked"),
            threadsChecked: total("threadsChecked"),
            agents: results,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      agentConfig = (enabledAgents[0] ?? (allAgents ?? [])[0] ?? null) as Record<string, any> | null;
    }

    if (!agentConfig) {
      await logRunEvent({
        action_type: "skipped",
        status: "skipped",
        description: "Run skipped: no agent build has been set up yet.",
        metadata: { phase: "run", reason: "no_agent_configured", trigger: triggerSource },
      });
      return new Response(
        JSON.stringify({ success: false, message: "Agent is not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = agentConfig as unknown as AgentConfig;

    if (!config.enabled) {
      auditAgentId = config.id;
      await logRunEvent({
        action_type: "skipped",
        status: "skipped",
        description: `Run skipped: ${config.agent_name || "this agent"} is switched off.`,
        metadata: { phase: "run", reason: "agent_disabled", trigger: triggerSource },
      });
      return new Response(
        JSON.stringify({ success: false, message: "Agent is not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Role gating: a build labelled "lead gen" must not send outreach or answer
    // replies, and so on. "full_cycle" runs every phase.
    const agentRole = String((agentConfig as any).role ?? "full_cycle");
    // Custom builds derive their phases from the tools the operator granted.
    // Custom allow-lists are capped by the account's plan tier, so a build can
    // never run a phase the plan doesn't include.
    const agentTier = await resolveAgentTier(adminClient as any, user.id);
    const customTools: string[] = capToolsToTier(
      Array.isArray((agentConfig as any).allowed_tools)
        ? (agentConfig as any).allowed_tools
        : [],
      agentTier,
    );
    const customCan = (tools: string[]) =>
      agentRole === "custom" && tools.some((t) => customTools.includes(t));
    const runLeadGen = agentRole === "full_cycle" || agentRole === "lead_gen" ||
      customCan(["find_leads", "search_companies", "enrich_leads"]);
    const runOutreach = agentRole === "full_cycle" || agentRole === "outreach" ||
      customCan(["draft_outreach", "send_drafts", "schedule_drafts", "send_outreach"]);
    const runReplies = agentRole === "full_cycle" || agentRole === "replies" ||
      customCan(["list_recent_replies"]);

    // Every action row is attributed to the agent build that produced it.
    auditAgentId = config.id;
    const logAction = (row: Record<string, unknown>) =>
      adminClient.from("agent_actions").insert({ agent_config_id: config.id, run_id: runId, ...row });

    // Reply capacity stays per user, not per agent, so extra builds never
    // multiply the volume the plan allows.
    const { count: dailyReplyCount } = await adminClient
      .from("agent_actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action_type", "reply_sent")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const remainingReplies = Math.max(
      0,
      (config.max_daily_auto_replies ?? 0) - (dailyReplyCount ?? 0)
    );


    const { data: senderAccounts } = await adminClient
      .from("sending_accounts")
      .select("integration_id, email, status, updated_at")
      .eq("user_id", user.id)
      .in("provider", ["google", "gmail"])
      .not("integration_id", "is", null)
      .order("updated_at", { ascending: false });

    // Every healthy mailbox is a candidate sender. Outbound rotates across all of
    // them so volume spreads over each connected domain instead of one inbox.
    const senderPool = (senderAccounts ?? []).filter(
      (account) =>
        account.integration_id &&
        account.status !== "paused" &&
        account.status !== "disabled"
    );
    const activeSender = senderPool[0];

    let googleIntegrationId: string | null = activeSender?.integration_id ?? null;
    const senderEmail: string | null = activeSender?.email ?? null;

    if (!googleIntegrationId) {
      const { data: integration } = await adminClient
        .from("integrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("integration_id", "google")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      googleIntegrationId = integration?.id ?? null;
    }

    // Sends already made in the last 24h per mailbox, so the least-used domain
    // starts the rotation.
    const rotationOrder: { integration_id: string; email: string | null }[] = await (async () => {
      if (senderPool.length < 2)
        return senderPool.length === 1
          ? [{ integration_id: senderPool[0].integration_id as string, email: senderPool[0].email ?? null }]
          : googleIntegrationId
          ? [{ integration_id: googleIntegrationId, email: senderEmail }]
          : [];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await adminClient
        .from("sent_emails")
        .select("sending_account_id")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .not("sending_account_id", "is", null);
      const { data: accountIds } = await adminClient
        .from("sending_accounts")
        .select("id, integration_id")
        .eq("user_id", user.id);
      const idByIntegration = new Map<string, string>();
      for (const a of accountIds ?? []) {
        if ((a as any).integration_id) idByIntegration.set(String((a as any).integration_id), String((a as any).id));
      }
      const counts = new Map<string, number>();
      for (const r of recent ?? []) {
        const key = String((r as any).sending_account_id);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...senderPool]
        .sort((a, b) => {
          const ca = counts.get(idByIntegration.get(String(a.integration_id)) ?? "") ?? 0;
          const cb = counts.get(idByIntegration.get(String(b.integration_id)) ?? "") ?? 0;
          return ca - cb;
        })
        .map((a) => ({ integration_id: a.integration_id as string, email: a.email ?? null }));
    })();

    let rotationIndex = 0;
    const nextSender = () => {
      if (rotationOrder.length === 0) return { integration_id: googleIntegrationId as string, email: senderEmail };
      const pick = rotationOrder[rotationIndex % rotationOrder.length];
      rotationIndex++;
      return pick;
    };

    const icpSnapshot = (config as any).icp_snapshot ?? null;
    const icpContext = buildIcpContext(icpSnapshot);
    const icpList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

    const cfgValueProps = Array.isArray(config.value_props) ? config.value_props : [];
    const cfgValuePropsText = cfgValueProps.join("\n");

    // Run mode: "approval" queues drafts for human review, "autonomous" sends directly.
    const approvalMode =
      reqBody.mode === "approval"
        ? true
        : reqBody.mode === "autonomous"
        ? false
        : (agentConfig as any).approval_mode !== false;

    let pendingApprovals = 0;

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


    // ────────────────────────────────────────────────────────────────────────
    // PHASE 1 — Lead generation
    // ────────────────────────────────────────────────────────────────────────
    let leadsFound = 0;
    if (runLeadGen && config.can_find_leads) {
      try {
        const target = Math.min(Math.max(config.daily_lead_target ?? 10, 1), 25);
        // Where this agent got to last run.
        //
        // The page used to be derived from a count of leads the agent had
        // already saved, which only advances when a run saves something. A run
        // that saved nothing — everything on the page already seen, deduped, or
        // without an email — left the count unchanged, so the next run asked
        // for the same page, got the same people, saved nothing again, and
        // never moved. That is the agent showing the same leads every day.
        //
        // Position is now the agent's own, advanced once per run whatever the
        // run produced, and reset when the ICP changes because a page number
        // means nothing against a different result set.
        const storedPage = Number(config.search_page) || 1;
        const icpChanged = (config.search_page_icp_id ?? null) !== (config.icp_profile_id ?? null);
        let searchPage = icpChanged ? 1 : storedPage;
        const searchBody: Record<string, unknown> = {
          // The saved ICP profile is the source of truth. The legacy single-field
          // targeting on agent_configs is only a fallback for users with no ICP.
          job_title: icpList(icpSnapshot?.target_titles)[0] || config.prospecting_job_title || undefined,
          job_titles: icpList(icpSnapshot?.target_titles).length
            ? icpList(icpSnapshot?.target_titles)
            : undefined,
          industry: icpList(icpSnapshot?.industries)[0] || config.prospecting_industry || undefined,
          industries: icpList(icpSnapshot?.industries).length ? icpList(icpSnapshot?.industries) : undefined,
          country: icpList(icpSnapshot?.geographies)[0] || config.prospecting_country || undefined,
          countries: icpList(icpSnapshot?.geographies).length ? icpList(icpSnapshot?.geographies) : undefined,
          company_size:
            icpSnapshot?.company_size_bucket ||
            bucketFromRange(icpSnapshot?.company_size_min, icpSnapshot?.company_size_max) ||
            config.prospecting_company_size ||
            undefined,
          seniority: icpList(icpSnapshot?.seniority_levels)[0] || undefined,
          seniority_levels: icpList(icpSnapshot?.seniority_levels).length
            ? icpList(icpSnapshot?.seniority_levels)
            : undefined,
          keywords: icpList(icpSnapshot?.intent_keywords).length
            ? icpList(icpSnapshot?.intent_keywords)
            : undefined,
          exclude_titles: icpList(icpSnapshot?.exclude_titles).length
            ? icpList(icpSnapshot?.exclude_titles)
            : undefined,
          exclude_industries: icpList(icpSnapshot?.exclude_industries).length
            ? icpList(icpSnapshot?.exclude_industries)
            : undefined,
          exclude_keywords: icpList(icpSnapshot?.exclude_keywords).length
            ? icpList(icpSnapshot?.exclude_keywords)
            : undefined,
          limit: target,
          // Non-strict so the backend's broadening ladder runs: it only drops
          // secondary filters (industry/seniority/size) that fail to resolve in
          // the provider taxonomy while keeping title and geography, so an ICP
          // returns people instead of 0. Never return people already saved.
          strict: false,
          exclude_seen: true,
        };
        const runSearch = async (pg: number) => {
          const r = await fetch(`${supabaseUrl}/functions/v1/fetch-external-leads`, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ ...searchBody, page: pg }),
          });
          return await r.json().catch(() => ({}));
        };
        let searchData = await runSearch(searchPage);
        let foundLeads: any[] = Array.isArray(searchData?.leads) ? searchData.leads : [];
        // An empty advanced page means the result set is exhausted, so wrap to
        // the start. exclude_seen keeps everything already saved out, so page 1
        // returns only genuinely new matches — and the wrap is recorded below
        // rather than left implicit, or the next run would resume past the end
        // again and find nothing a second time.
        let wrapped = false;
        if (foundLeads.length === 0 && !searchData?.error && searchPage > 1) {
          searchPage = 1;
          wrapped = true;
          searchData = await runSearch(searchPage);
          foundLeads = Array.isArray(searchData?.leads) ? searchData.leads : [];
        }

        // Advance past the page just read, whatever it yielded. This is the
        // whole fix: a run that saves nothing still moves the agent forward.
        // Capped because the providers refuse deep offsets — Crustdata stops at
        // 100 rows — and a position past the ceiling would return nothing
        // forever.
        const MAX_SEARCH_PAGE = 10;
        const nextPage = wrapped || searchPage >= MAX_SEARCH_PAGE ? 2 : searchPage + 1;
        await adminClient
          .from("agent_configs")
          .update({ search_page: nextPage, search_page_icp_id: config.icp_profile_id ?? null })
          .eq("id", config.id);

        for (const l of foundLeads) {
          const email = (l.business_email || "").trim().toLowerCase();
          const name = (l.contact_name || "").trim();
          if (!email && !name) continue;

          // Dedupe on email when we have one, otherwise on name + company
          let existingLead: { id: string } | null = null;
          if (email) {
            const { data } = await adminClient
              .from("leads")
              .select("id")
              .eq("user_id", user.id)
              .ilike("contact_email", email)
              .maybeSingle();
            existingLead = data ?? null;
          } else {
            const { data } = await adminClient
              .from("leads")
              .select("id")
              .eq("user_id", user.id)
              .ilike("contact_name", name)
              // Match on the company only when there is one. Looking a lead
              // up by the placeholder groups every company-less lead together,
              // so the second one is treated as a duplicate of the first and
              // silently dropped.
              .ilike("company_name", realValue(l.company_name) ?? "%")
              .maybeSingle();
            existingLead = data ?? null;
          }
          if (existingLead) continue;

          const { error: insertLeadErr } = await adminClient.from("leads").insert({
            user_id: user.id,
            contact_name: name || email.split("@")[0],
            contact_email: email || null,
            company_name: l.company_name || "Unknown",
            company_website: l.company_domain || null,
            job_title: l.job_title || null,
            industry: l.industry || null,
            company_size: l.company_size || null,
            linkedin_url: l.linkedin_url || null,
            icp_score: l.scores?.icp_score ?? null,
            intent_score: l.scores?.intent_score ?? null,
            signals: Array.isArray(l.buying_signals) ? l.buying_signals : null,
            source: "ai_agent",
            lead_status: "discovered",
            enrichment_status: email ? "enriched" : "pending",
          });
          if (insertLeadErr) {
            console.error("agent lead insert error:", insertLeadErr.message);
            continue;
          }

          leadsFound++;
          await logAction({
            user_id: user.id,
            action_type: "lead_found",
            status: "completed",
            prospect_email: email || null,
            description: `Found ${l.job_title || "contact"}${name ? ` ${name}` : ""} at ${l.company_name || "company"}${email ? "" : " — no email yet, needs enrichment"}`,
            metadata: { source: "ai_agent", icp_score: l.scores?.icp_score ?? null, has_email: !!email },
          });
        }

        if (foundLeads.length === 0) {
          await logAction({
            user_id: user.id,
            action_type: "skipped",
            status: "skipped",
            description: `Lead search returned no matches for ${
              [
                icpList(icpSnapshot?.target_titles).join(", ") || config.prospecting_job_title,
                icpList(icpSnapshot?.industries).join(", ") || config.prospecting_industry,
                icpList(icpSnapshot?.geographies).join(", ") || config.prospecting_country,
              ]
                .filter(Boolean)
                .join(" · ") || "your targeting"
            }${icpSnapshot?.name ? ` (ICP: ${icpSnapshot.name})` : ""} — try broadening the targeting in your ICP profile.`,
            metadata: { phase: "prospecting", icp_profile: icpSnapshot?.name ?? null },

          });
        }


        if (searchData?.error) {
          await logAction({
            user_id: user.id,
            action_type: "skipped",
            status: "skipped",
            description: `Lead search skipped: ${searchData.error}`,
            metadata: { phase: "prospecting", error_code: searchData.error_code ?? null },
          });
        }
      } catch (prospectErr: any) {
        console.error("agent prospecting error:", prospectErr?.message);
        await logAction({
          user_id: user.id,
          action_type: "error",
          status: "failed",
          description: "Lead generation failed",
          error_message: prospectErr?.message ?? "unknown",
          metadata: { phase: "prospecting" },
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 2 — First-touch outreach
    // ────────────────────────────────────────────────────────────────────────
    let outreachSent = 0;
    let outreachDrafted = 0;
    const stepOwner = crypto.randomUUID();
    const leadReceipts: ToolReceipt[] = [];
    const recordReplySend = (
      detail: string,
      sendRes: Response,
      sendData: { error?: unknown; code?: unknown },
    ) => {
      const status = classifyProviderSend({ ok: sendRes.ok, error: sendData?.error, code: sendData?.code });
      leadReceipts.push({ toolName: "send_reply", status, detail });
      return status;
    };
    /**
     * One reply: draft, score, hold, send. No research step.
     * The subject key is the sent-email id, so this does not reuse the lead's
     * first-touch send. Enabled durable mode passes requireDurable and will not
     * run these effects in memory. A provider request that already left is not
     * recalled by a later cancel; deliverReserved is the other lock.
     */
    const executeDurableReply = async (input: {
      sentEmailId: string;
      fromEmail: string;
      subject: string;
      classification: string;
      gmailThreadId?: string | null;
      gmailMessageId?: string | null;
      confidence?: number;
      draft: () => Promise<string>;
      review: (body: string) => Promise<{ hold: boolean; approval: boolean }>;
      onHold: (body: string) => Promise<void>;
      onSent: (body: string) => Promise<void>;
    }): Promise<"sent" | "held" | "blocked" | "failed" | "unpersisted" | "resumed" | "stopped"> => {
      let body = "";
      const result = await advanceReply({
        store: stepStore,
        userId: user.id,
        leadId: input.sentEmailId,
        subjectKey: input.sentEmailId,
        runId,
        owner: stepOwner,
        requireDurable: durableMode === "on",
        effects: {
          draft: async () => {
            body = await input.draft();
            return { body };
          },
          score: async () => {
            const review = await input.review(body);
            return { ...review, body };
          },
          hold: async (score) => {
            const text = typeof score?.body === "string" && score.body ? score.body : body;
            if (score?.approval === true) {
              await input.onHold(text);
              leadReceipts.push({ toolName: "send_reply", status: "approved", detail: input.fromEmail });
            }
            return { hold: true };
          },
          send: async (ctx, prior) => {
            if (!await ctx.owned()) return { ok: false, done: false, submitted: false };
            const text = body
              || (typeof prior.score?.body === "string" ? prior.score.body : "")
              || (typeof prior.draft?.body === "string" ? prior.draft.body : "");
            if (!googleIntegrationId) {
              leadReceipts.push({ toolName: "send_reply", status: "failed", detail: input.fromEmail });
              await logAction({
                user_id: user.id,
                sent_email_id: input.sentEmailId,
                action_type: "skipped",
                status: "skipped",
                prospect_email: input.fromEmail,
                subject: input.subject,
                classification: input.classification,
                description: `Did not send the reply to ${input.fromEmail} because no active Gmail mailbox is available.`,
                metadata: { phase: "reply", reason: "no_active_mailbox" },
              });
              skipped++;
              return { ok: false, noMailbox: true };
            }
            const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({
                to: input.fromEmail,
                subject: `Re: ${input.subject}`,
                body: text,
                integrationRowId: googleIntegrationId,
                threadId: input.gmailThreadId,
                appendSignature: true,
              }),
            });
            const sendData = await sendRes.json().catch(() => ({}));
            const replyStatus = recordReplySend(input.fromEmail, sendRes, sendData);
            if (replyStatus === "provider_accepted_unpersisted") {
              await logAction({
                user_id: user.id,
                sent_email_id: input.sentEmailId,
                action_type: "error",
                status: "failed",
                prospect_email: input.fromEmail,
                subject: input.subject,
                classification: input.classification,
                description: `Gmail accepted a reply to ${input.fromEmail}, and the send record was not saved. It was not counted as delivered. Cancelling this run cannot recall that provider request.`,
                metadata: { phase: "reply", gmail_message_id: input.gmailMessageId ?? null, code: sendData?.code ?? null },
              });
              errors++;
              return { ok: false, submitted: true, unpersisted: true };
            }
            if (replyStatus !== "ok") {
              await logAction({
                user_id: user.id,
                sent_email_id: input.sentEmailId,
                action_type: "error",
                status: "failed",
                prospect_email: input.fromEmail,
                subject: input.subject,
                classification: input.classification,
                error_message: sendData?.error ?? `send-email returned ${sendRes.status}`,
                description: `Could not send the reply to ${input.fromEmail}.`,
                metadata: { phase: "reply", gmail_message_id: input.gmailMessageId ?? null, code: sendData?.code ?? null },
              });
              errors++;
              return { ok: false, done: false, submitted: true };
            }
            body = text;
            return { ok: true, submitted: true };
          },
        },
      });
      if (typeof result.payloads.draft?.body === "string" && result.payloads.draft.body) {
        body = result.payloads.draft.body;
      }
      if (result.stopped && result.stopped !== "left_open") return "stopped";
      if (result.hold) return result.payloads.score?.approval === true ? "held" : "blocked";
      if (result.payloads.send?.ok === true && result.effects.includes("send")) {
        const text = body || (typeof result.payloads.send.body === "string" ? result.payloads.send.body : "");
        await input.onSent(text);
        repliesSent++;
        return "sent";
      }
      if (result.payloads.send?.ok === true) return "resumed";
      if (result.payloads.send?.unpersisted === true) return "unpersisted";
      return "failed";
    };
    /*
     * How many drafts this run wrote with no facts about the company, and why.
     *
     * The prompt now tells the model to stay generic when this happens rather
     * than inventing, so these are no longer fabrications. They are still the
     * weakest emails the product sends, and the count is the only way to know
     * whether a provider has quietly stopped answering: a lapsed key, an empty
     * wallet and a trailing space all land here, and all of them used to look
     * exactly like a working run.
     */
    let draftsWithoutResearch = 0;
    const researchOutcomes: Record<string, number> = {};
    // Loaded once per run, not once per lead: what this customer sells is what
    // the evaluation judges fit against.
    let sellerContext: SellerContext | null = null;
    if (runOutreach && config.can_send_outreach && googleIntegrationId) {
      try {
        const dailyCap = Math.min(Math.max(config.max_daily_new_emails ?? 20, 0), 100);
        const { count: sentToday } = await adminClient
          .from("agent_actions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("action_type", "outreach_sent")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        let remainingOutreach = Math.max(0, dailyCap - (sentToday ?? 0));

        if (remainingOutreach > 0) {
          /*
            Leads the agent could not write a good enough email for recently.

            Nothing marks a lead as attempted unless an email actually sends,
            and the candidate query takes the highest ICP scores first. So a
            lead the agent cannot reach the bar for is picked again on the next
            run, and the one after that — burning four generations and four
            scoring calls every time, and, because it holds a slot at the top of
            the order, keeping every lead behind it from ever being tried.

            A week is long enough that the retry costs little, and short enough
            that enriching the lead gets it back into the queue without anyone
            having to know this rule exists.
          */
          const COOLDOWN_DAYS = 7;
          const { data: recentQualitySkips } = await adminClient
            .from("agent_actions")
            .select("metadata")
            .eq("user_id", user.id)
            .eq("action_type", "skipped")
            .gte("created_at", new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString())
            .limit(500);

          const coolingOff = [
            ...new Set(
              (recentQualitySkips ?? [])
                .map((r) => r.metadata as Record<string, unknown> | null)
                .filter((m) => m?.reason === "quality")
                .map((m) => String(m?.lead_id ?? ""))
                .filter(Boolean),
            ),
          ];

          // Built as one conditional expression rather than reassigned:
          // reassigning a PostgREST filter builder chains its type again and
          // drives TypeScript past its instantiation depth limit (TS2589).
          const pendingQuery =
            coolingOff.length > 0
              ? adminClient
                  .from("leads")
                  .select("id, contact_name, contact_email, company_name, company_website, job_title, industry, signals, research_brief")
                  .eq("user_id", user.id)
                  .not("contact_email", "is", null)
                  .is("last_contacted_at", null)
                  // An empty list would render as `in.()`, which PostgREST rejects.
                  .not("id", "in", `(${coolingOff.join(",")})`)
              : adminClient
                  .from("leads")
                  .select("id, contact_name, contact_email, company_name, company_website, job_title, industry, signals, research_brief")
                  .eq("user_id", user.id)
                  .not("contact_email", "is", null)
                  .is("last_contacted_at", null);

          const { data: pendingLeads, error: pendingLeadsError } = await pendingQuery
            .order("icp_score", { ascending: false, nullsFirst: false })
            .limit(remainingOutreach);

          if (pendingLeadsError) throw pendingLeadsError;

          if ((pendingLeads ?? []).length === 0) {
            await logAction({
              user_id: user.id,
              action_type: "skipped",
              status: "skipped",
              description: "No uncontacted leads with emails are ready for first-touch outreach yet.",
              metadata: { phase: "outreach", reason: "no_pending_leads" },
            });
          }

          for (const lead of pendingLeads ?? []) {
            if (remainingOutreach <= 0) break;
            const to = (lead.contact_email || "").trim();
            if (!to) continue;
            if (!EMAIL_RE.test(to)) {
              await logAction({
                user_id: user.id,
                action_type: "skipped",
                status: "skipped",
                prospect_email: to,
                description: `Skipped ${lead.company_name ?? "lead"} — "${to}" is not a valid email address`,
                metadata: { phase: "outreach", reason: "invalid_email", lead_id: lead.id },
              });
              continue;
            }


            try {
              const { data: alreadySent } = await adminClient
                .from("sent_emails")
                .select("id")
                .eq("user_id", user.id)
                .ilike("to_email", to)
                .limit(1)
                .maybeSingle();
              if (alreadySent) {
                await adminClient
                  .from("leads")
                  .update({ last_contacted_at: new Date().toISOString() })
                  .eq("id", lead.id);
                continue;
              }

               const firstName = (lead.contact_name || "").split(" ")[0] || "there";
               // Rotate the sending mailbox/domain per lead.
               const sender = nextSender();
               const leadSenderEmail = sender.email ?? senderEmail;
               const leadIntegrationId = sender.integration_id ?? googleIntegrationId;
               const senderFirstName =
                 (config.agent_name ?? "").split(" ")[0] ||
                 (leadSenderEmail ?? "").split("@")[0] ||
                 "there";
              const outreachSystemPrompt = `You are ${config.agent_name ?? "a sales rep"} writing outbound for a B2B founder. Persona: ${config.persona ?? "direct and helpful"}. Tone: ${config.tone ?? "professional"}.
${agentProhibitions(config.agent_name)}
Company context: ${config.company_context ?? ""}
Value propositions:
${cfgValuePropsText}

${icpContext}

${playbookSystemRules()}`;
              // Research the prospect's site and read the decision layer before
              // writing, exactly as Outreach Studio does: Bedrock writes, the
              // brief supplies the facts, the evaluation supplies the angle.
              let research: { block: string; outcome: string; detail?: string } = { block: "", outcome: "skipped" };
              const researchPhase = await runPhase(stepStore, {
                userId: user.id, leadId: lead.id, runId, owner: stepOwner, requireDurable: durableMode === "on",
              }, "research", async () => {
                research = await researchBlockForLead(
                  adminClient,
                  supabaseUrl,
                  authHeader,
                  anonKey,
                  lead.id,
                );
                return { block: research.block, outcome: research.outcome, detail: research.detail ?? null };
              });
              if (researchPhase.action === "stopped" || researchPhase.status === "left_open") continue;
              if (researchPhase.action === "skipped") {
                const payload = researchPhase.payload;
                research = {
                  block: typeof payload?.block === "string" ? payload.block : "",
                  outcome: typeof payload?.outcome === "string" ? payload.outcome : "skipped",
                  detail: typeof payload?.detail === "string" ? payload.detail : "resumed",
                };
              }
              const leadResearchBlock = research.block;
              const proofForTouch = [
                leadResearchBlock,
                config.company_context ?? "",
                cfgValuePropsText,
                lead.job_title ?? "",
                lead.industry ?? "",
                ...(Array.isArray(lead.signals) ? lead.signals : []),
              ].filter(Boolean).join("\n");
              researchOutcomes[research.outcome] = (researchOutcomes[research.outcome] ?? 0) + 1;
              if (!leadResearchBlock) {
                draftsWithoutResearch++;
                console.warn(
                  `[agent-run] drafting ${lead.id} with no research (${research.outcome}${research.detail ? `: ${research.detail}` : ""})`,
                );
              }
              if (!sellerContext) sellerContext = await loadSellerContext(adminClient, user.id);
              const leadDecision = await decisionForDrafting(adminClient, lead.id, user.id, {
                seller: sellerContext,
              });
              const leadStrategyBlock = decisionPromptBlock(leadDecision);

              const outreachPrompt = buildTouchPrompt({
                research: leadResearchBlock,
                firstName,
                jobTitle: lead.job_title,
                companyName: lead.company_name,
                industry: lead.industry,
                signals: Array.isArray(lead.signals) ? lead.signals : [],
                senderFirstName,
                companyContext: config.company_context,
                valueProps: cfgValuePropsText,
              });

              // Not appended here any more: buildTouchPrompt takes it, so the
              // empty case can be stated to the model rather than vanishing.
              const websiteHost = (() => {
                const rawSite = String((lead as { company_website?: string }).company_website ?? "");
                try { return new URL(rawSite.includes("://") ? rawSite : `https://${rawSite}`).hostname.replace(/^www\./, ""); }
                catch { return null; }
              })();
              const { data: snapRows } = await adminClient
                .from("research_snapshots")
                .select("payload")
                .eq("user_id", user.id)
                .eq("lead_id", lead.id);
              const evidenceDecision = evaluateStoredSnapshots({
                userId: user.id,
                leadId: lead.id,
                company: String(lead.company_name ?? ""),
                websiteHost,
                now: new Date().toISOString(),
                stored: (snapRows ?? []).map((row: { payload?: unknown }) => row.payload).filter(Boolean),
              });
              if (evidenceDecision.status !== "ready") {
                await logAction({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  description: evidenceDecision.reason,
                  metadata: { phase: "outreach", reason: "no_research", research_status: evidenceDecision.status, lead_id: lead.id },
                });
                continue;
              }
              const factBlock = evidenceDecision.facts.map((fact) => fact.span).join("\n");
              const groundedPrompt = buildTouchPrompt({
                research: factBlock,
                firstName,
                jobTitle: lead.job_title,
                companyName: lead.company_name,
                industry: lead.industry,
                signals: Array.isArray(lead.signals) ? lead.signals : [],
                senderFirstName,
                companyContext: config.company_context,
                valueProps: cfgValuePropsText,
              });
              let raw = "";
              const draftPhase = await runPhase(stepStore, {
                userId: user.id, leadId: lead.id, runId, owner: stepOwner, requireDurable: durableMode === "on",
              }, "draft", async () => {
                raw = await callGemini(
                  groundedPrompt,
                  `${outreachSystemPrompt}\n\nAPPROVED FACTS, the only statements you may make about this company:\n${factBlock}\nDo not add a number, a customer result, or a consequence that is not in those sentences.`,
                );
                return { raw, factIds: evidenceDecision.facts.map((fact) => fact.id) };
              });
              if (draftPhase.action === "stopped" || draftPhase.status === "left_open") continue;
              if (draftPhase.action === "skipped") {
                const savedRaw = draftPhase.payload?.raw;
                if (typeof savedRaw === "string" && savedRaw.length > 0) {
                  raw = savedRaw;
                } else {
                  const { data: saved } = await adminClient.from("email_drafts")
                    .select("subject, body")
                    .eq("user_id", user.id)
                    .eq("lead_id", lead.id)
                    .maybeSingle();
                  raw = JSON.stringify({ touches: [{ day: 0, purpose: "resumed", subject: saved?.subject ?? "", body: saved?.body ?? "" }] });
                }
              }
              const touches = parseTouches(raw);
              let subject = touches[0]?.subject ?? "";
              let body = touches[0]?.body ?? "";
              if (!subject || !body) {
                await logAction({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  description: `Skipped ${lead.contact_name ?? to} — the agent could not generate a usable 4-touch sequence`,
                  metadata: { phase: "outreach", reason: "generation_failed" },
                });
                continue;
              }


              const check = deliverabilityCheck(subject, body);
              if (!check.ok) {
                await logAction({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  subject,
                  description: `Skipped ${lead.contact_name ?? to} — generated email hit deliverability trigger(s): ${check.hits.join(", ")}`,
                  metadata: { phase: "outreach", reason: "deliverability_block", spam_triggers: check.hits },
                });
                continue;
              }

              // Quality gate. Outreach Studio shows a person their score and
              // lets them edit until it is green. The agent has nobody to show
              // it to, so the loop that a person performs by hand has to happen
              // here: write, score, read the objections, write it again, until
              // the rubric is 5/5 on every dimension and the rule audit is
              // clean. It stops at AGENT_MAX_ATTEMPTS and keeps the best.
              //
              // A draft that never gets there is held for a human rather than
              // sent. That is the whole point of the bar: an agent allowed to
              // send its fourth-best attempt has no bar at all.
              //
              // A missing rubric holds the send. Plan gating is the only exception,
              // and it still holds when a rule blocks. autonomousSendAllowed
              // is that rule.
              // An unfilled merge token must never reach a prospect. Unlike a weak
              // score this is not a judgement call, so it skips outright rather
              // than queueing a draft a human would only reject.
              if (hasPlaceholder(subject) || hasPlaceholder(body)) {
                const found = [...findPlaceholders(subject), ...findPlaceholders(body)];
                await logAction({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  subject,
                  description: `Skipped ${lead.contact_name ?? to} — the draft still had an unfilled placeholder: ${found.join(", ")}`,
                  metadata: { phase: "outreach", reason: "placeholder", placeholders: found },
                });
                continue;
              }

              /** Score one draft on both checks: the model rubric and the rule audit. */
              const assess = async (subj: string, bod: string): Promise<Attempt> => {
                const report = await scoreEmailReport(supabaseUrl, authHeader, anonKey, { subject: subj, body: bod });
                const rubric = report.rubric;
                const blocking = [
                  ...auditEmail({
                    subject: subj,
                    body: bod,
                    position: 1,
                    verifiedProof: proofForTouch,
                    lead: { company: lead.company_name, contactName: lead.contact_name },
                  })
                    // Notes are observations, not reasons to rewrite. Blockers and
                    // warnings are both things a person would fix before sending.
                    .filter((f) => f.severity !== "note")
                    .map((f) => ({ rule: f.rule, severity: f.severity, why: f.why, fix: f.fix })),
                  // A number the proof does not contain is already a blocker
                  // above. These are the claims that audit does not see: a
                  // specific company observation with no research, and an
                  // offer the account never authorised.
                  ...firstTouchBlockers({
                    researchBlock: [
                      leadResearchBlock,
                      ...(Array.isArray(lead.signals) ? lead.signals : []),
                    ].filter(Boolean).join("\n"),
                    subject: subj,
                    body: bod,
                    allowedProof: [config.company_context ?? "", cfgValuePropsText].filter(Boolean).join("\n"),
                  }),
                ];
                return { subject: subj, body: bod, rubric, blocking, availability: report.availability };
              };

              let best: Attempt = { subject, body, rubric: null, blocking: [], availability: "unavailable" };
              let attempts = 1;
              let qualityHold = false;
              let rubric: { overall?: number; dimensions?: Record<string, { score: number }> } | null = null;
              let quality: { score: number | null; dimensions: Record<string, number> | null; attempts: number; blocking: string[] } = {
                score: null, dimensions: null, attempts: 1, blocking: [],
              };
              const scorePhase = await runPhase(stepStore, {
                userId: user.id, leadId: lead.id, runId, owner: stepOwner, requireDurable: durableMode === "on",
              }, "score", async (ctx) => {
              if (!await ctx.owned()) return { hold: true, done: false };
              best = await assess(subject, body);
              rubric = best.rubric;
              qualityHold = !autonomousSendAllowed(best, best.availability ?? "unavailable");
              quality = {
                score: rubric?.overall ?? null,
                dimensions: rubric
                  ? Object.fromEntries(Object.entries(rubric.dimensions ?? {}).map(([k, d]) => [k, d.score]))
                  : null,
                attempts: 1,
                blocking: best.blocking.map((finding) => finding.rule),
              };
              return { hold: qualityHold, subject: best.subject, body: best.body, availability: best.availability ?? "unavailable" };
              });
              if (scorePhase.action === "stopped" || scorePhase.status === "left_open") continue;
              if (scorePhase.action === "skipped") {
                qualityHold = scorePhase.payload?.hold === true;
                if (typeof scorePhase.payload?.subject === "string") subject = scorePhase.payload.subject;
                if (typeof scorePhase.payload?.body === "string") body = scorePhase.payload.body;
              }
              if (scorePhase.action === "ran" && scorePhase.status === "done") {
                try {
                  const [hash, promptHash, rubricHash] = await Promise.all([
                    contentHash(subject, body),
                    gatePromptHash(),
                    rubricPromptHash(),
                  ]);
                  await adminClient.rpc("record_outbound_verdict", {
                    p_user_id: user.id,
                    p_lead_id: lead.id,
                    p_content_hash: hash,
                    p_subject: subject,
                    p_body: body,
                    p_findings: best.blocking,
                    p_rubric_availability: best.availability ?? "unavailable",
                    p_rubric: best.rubric,
                    p_prompt_hash: promptHash,
                    p_rubric_prompt_hash: rubricHash,
                    p_gate_status: qualityHold ? "refused" : "clear",
                    p_shadow: true,
                    p_shadow_mismatch: false,
                  });
                } catch (verdictErr) {
                  console.warn("[agent-run] draft verdict skipped", verdictErr);
                }
              }
              if (qualityHold) {
                console.log(
                  `[agent-run] quality hold for ${to} after ${attempts} attempt(s): ` +
                  `${best.rubric?.overall ?? "unscored"}/100, ${best.blocking.length} blocking`,
                );
              } else {
                console.log(`[agent-run] quality pass after ${attempts} attempt(s): ${best.rubric?.overall ?? "unscored"}/100`);
              }

              // A draft that could not be written well enough is thrown away,
              // not filed.
              //
              // Holding it put copy the agent had already judged unsendable
              // into the same Drafts tab as work waiting on approval, so the
              // tab stopped meaning "ready to go" and became a queue of things
              // to triage. There is nothing to salvage in it either: four
              // attempts with the rubric's own objections fed back is a better
              // rewrite than a person editing the fourth one by hand.
              //
              // The lead is untouched. last_contacted_at stays null, so once
              // the cooldown below expires — or once the lead has more to say
              // about it — the agent writes a fresh email rather than
              // resurrecting this one.
              if (qualityHold) {
                const held = await runPhase(stepStore, {
                  userId: user.id, leadId: lead.id, runId, owner: stepOwner, requireDurable: durableMode === "on",
                }, "hold", async (ctx) => {
                if (!await ctx.owned()) return { hold: true, done: false };
                await logAction({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  subject,
                  description:
                    `Skipped ${lead.contact_name ?? to} at ${lead.company_name ?? "their company"} — ` +
                    `after ${attempts} attempt${attempts === 1 ? "" : "s"} the best draft scored ` +
                    `${best.rubric?.overall ?? "unscored"}/100` +
                    `${best.blocking.length ? ` with ${best.blocking.length} rule problem${best.blocking.length === 1 ? "" : "s"}` : ""}` +
                    `, so nothing was sent or saved. Enriching this lead usually fixes it.`,
                  metadata: {
                    phase: "outreach",
                    reason: "quality",
                    lead_id: lead.id,
                    quality,
                  },
                });
                return { hold: true };
                });
                if (held.action === "ran") remainingOutreach--;
                continue;
              }

              const heldForResearch = !leadResearchBlock.trim();
              if (approvalMode || heldForResearch) {
                // Save a draft, not an approval.
                //
                // An empty research block used to take the send path. The
                // prompt says not to invent a company fact, and the draft
                // above was rejected when it did, but a category-only email
                // is still not something to send while the account is asleep.
                // It is saved here, labelled, and left for a person.
                //
                // agent-run has no conversation to confirm in, so its pending
                // work has to live somewhere the user can find it. That place
                // is the Drafts tab — the same place chat drafts land, and the
                // same records "send my drafts" already reads. The approvals
                // table was a second inbox that only the agent could see, and
                // it filled with rows nothing could drain.
                const { error: draftErr } = await adminClient.from("email_drafts").upsert({
                  user_id: user.id,
                  lead_id: lead.id,
                  subject,
                  body,
                }, { onConflict: "user_id,lead_id" });
                const queued = !draftErr;
                if (draftErr) console.error("[agent-run] could not save draft:", draftErr.message);
                                if (!queued) {
                  await logAction({
                    user_id: user.id,
                    action_type: "error",
                    status: "failed",
                    prospect_email: to,
                    subject,
                    description: `Could not save the draft for ${lead.contact_name ?? to}`,
                    metadata: { phase: "outreach", lead_id: lead.id },
                  });
                  continue;
                }
                await logAction({
                  user_id: user.id,
                  action_type: "awaiting_approval",
                  status: "pending",
                  prospect_email: to,
                  subject,
                  reply_content: body,
                  description: heldForResearch
                    ? `Drafted a category-only first touch to ${lead.contact_name ?? to} at ${lead.company_name ?? "their company"}. No company research was on file, so it was not sent. Review it before it goes out.`
                    : `Drafted a first-touch email to ${lead.contact_name ?? to} at ${lead.company_name ?? "their company"}, scoring ${quality.score ?? "unscored"}/100 — saved to your drafts${leadSenderEmail ? `, to send from ${leadSenderEmail}` : ""}`,
                  metadata: {
                    phase: "outreach",
                    lead_id: lead.id,
                    sender_email: leadSenderEmail,
                    quality,
                    ...(heldForResearch
                      ? { reason: "no_research", research_outcome: research.outcome }
                      : {}),
                  },
                });
                leadReceipts.push({ toolName: "send_outreach", status: "approved", detail: to });
                outreachDrafted++;
                remainingOutreach--;
                continue;
              }

              const sendPhase = await runPhase(stepStore, {
                userId: user.id, leadId: lead.id, runId, owner: stepOwner, requireDurable: durableMode === "on",
              }, "send", async (ctx) => {
              if (!await ctx.owned()) return { ok: false, done: false };
              const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                method: "POST",
                headers: { Authorization: authHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                  to,
                  subject,
                  body,
                  integrationRowId: leadIntegrationId,
                    appendSignature: true,
                  leadId: lead.id,
                }),
              });
              const sendData = await sendRes.json().catch(() => ({}));
              const sendStatus = classifyProviderSend({ ok: sendRes.ok, error: sendData?.error, code: sendData?.code });
              leadReceipts.push({ toolName: "send_outreach", status: sendStatus, detail: to });

              if (sendStatus === "provider_accepted_unpersisted") {
                return { ok: false, unpersisted: true };
              }
              if (!sendRes.ok || sendData?.error) {
                await logAction({
                  user_id: user.id,
                  action_type: "error",
                  status: "failed",
                  prospect_email: to,
                  subject,
                  error_message: sendData?.error ?? `send-email returned ${sendRes.status}`,
                  description: `Could not send to ${to}: ${sendData?.error ?? `send-email returned ${sendRes.status}`}`,
                  metadata: { phase: "outreach", lead_id: lead.id },
                });
                return { ok: false, done: false };
              }
              return { ok: true, sendData };
              });
              if (sendPhase.action !== "ran" || sendPhase.payload?.ok !== true) continue;

              await adminClient
                .from("leads")
                .update({ last_contacted_at: new Date().toISOString(), lead_status: "active" })
                .eq("id", lead.id);

              const followUpBlockers = touches.slice(1, 4).flatMap((touch) => [
                ...firstTouchBlockers({
                  researchBlock: leadResearchBlock,
                  subject: touch.subject ?? "",
                  body: touch.body ?? "",
                  allowedProof: proofForTouch,
                }),
                ...auditEmail({
                  subject: touch.subject,
                  body: touch.body,
                  position: 2,
                  verifiedProof: proofForTouch,
                  lead: { company: lead.company_name, contactName: lead.contact_name },
                }).filter((finding) => finding.severity === "blocker"),
              ]);
              const scheduled = followUpBlockers.length === 0
                ? await scheduleFollowUps(
                    adminClient,
                    user.id,
                    lead.id,
                    lead.company_name ?? lead.contact_name ?? to,
                    touches,
                  )
                : false;
              if (followUpBlockers.length > 0) {
                console.warn(
                  `[agent-run] follow-ups not queued for ${lead.id}: ${followUpBlockers.map((finding) => finding.rule).join(", ")}`,
                );
              }

              await logAction({
                user_id: user.id,
                action_type: "outreach_sent",
                status: "completed",
                prospect_email: to,
                subject,
                reply_content: body,
                description: `Touch 1 of 4 sent to ${lead.company_name ?? to}${quality.score !== null ? `, scoring ${quality.score}/100` : ""}${scheduled ? " — follow-ups queued for day 3, 7 and 14 (they stop automatically on reply)" : followUpBlockers.length > 0 ? " — follow-ups were not queued because they included a claim the research does not support" : ""}`,
                metadata: {
                  phase: "outreach",
                  lead_id: lead.id,
                  playbook: "cold_email_engine_4_touch",
                  follow_ups_scheduled: scheduled,
                  // What it scored and how many rewrites it took to get there.
                  // A send that needed four attempts is worth knowing about even
                  // though it passed.
                  quality,
                },
              });


              leadReceipts.push({ toolName: "send_outreach", status: "ok", detail: to });
              outreachSent++;
              remainingOutreach--;
            } catch (leadErr: any) {
              console.error(`outreach error:`, leadErr?.message);
              await logAction({
                user_id: user.id,
                action_type: "error",
                status: "failed",
                prospect_email: to,
                error_message: leadErr?.message ?? "unknown",
                metadata: { phase: "outreach" },
              });
            }
          }
        }
      } catch (outreachErr: any) {
        console.error("agent outreach error:", outreachErr?.message);
        await logAction({
          user_id: user.id,
          action_type: "error",
          status: "failed",
          description: "First-touch outreach failed",
          error_message: outreachErr?.message ?? "unknown",
          metadata: { phase: "outreach" },
        });
      }
    } else if (runOutreach && config.can_send_outreach && !googleIntegrationId) {
      await logAction({
        user_id: user.id,
        action_type: "skipped",
        status: "skipped",
        description: "First-touch outreach skipped because no active Gmail mailbox is available.",
        metadata: { phase: "outreach", reason: "no_active_mailbox" },
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 3 — Reply handling (skipped for lead-gen / outreach-only builds)
    // ────────────────────────────────────────────────────────────────────────
    let replies: Reply[] = [];
    let threadsChecked = 0;

    if (runReplies) {
      const syncRes = await fetch(`${supabaseUrl}/functions/v1/inbox-sync`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      });

      if (!syncRes.ok) {
        const errBody = await syncRes.text();
        throw new Error(`inbox-sync failed: ${errBody}`);
      }

      const syncData = await syncRes.json();

      if (!syncData.success) {
        throw new Error(syncData.error || "inbox-sync returned failure");
      }

      replies = syncData.replies || [];
      threadsChecked = syncData.threadsChecked ?? 0;
    }


    let repliesProcessed = 0;
    let repliesSent = 0;
    let meetingsBooked = 0;
    let skipped = 0;
    let errors = 0;

    const valuePropsList = Array.isArray(config.value_props) ? config.value_props : [];
    const valuePropsText = valuePropsList.join("\n");
    const accountProof = [config.company_context ?? "", valuePropsText].filter(Boolean).join("\n");
    /** True when the reply invents a figure or an offer. Logs and skips. */
    const blockUngroundedReply = async (
      current: Reply,
      body: string,
      classification: string,
      extraProof = "",
    ): Promise<boolean> => {
      const blockers = replySendBlockers(
        body,
        `${accountProof}\n${extraProof}`,
        `${extraProof}\n${current.bodyText ?? ""}`,
      );
      if (blockers.length === 0) return false;
      await logAction({
        user_id: user.id,
        sent_email_id: current.sentEmailId,
        action_type: "skipped",
        status: "skipped",
        prospect_email: current.fromEmail,
        subject: current.subject,
        classification,
        description: `Did not send a reply to ${current.fromEmail} — it included ${blockers.slice(0, 3).join("; ")}`,
        metadata: { phase: "reply", reason: "ungrounded_reply", blockers },
      });
      skipped++;
      return true;
    };

    for (const reply of replies) {
      if (repliesSent >= remainingReplies) break;

      try {
        repliesProcessed++;

        const classifySystemPrompt =
          "You classify sales email replies. Respond ONLY with valid JSON.\n" +
          // The classifier is the first thing to read a stranger's words, and
          // a reply that talks its way into the wrong bucket steers everything
          // downstream — an unsubscribe classified as interested gets answered.
          UNTRUSTED_CONTENT_RULE;
        const classifyPrompt = `Classify this email reply:
Subject: ${reply.subject}
From: ${reply.fromEmail}
Body: ${fence(`reply from ${reply.fromEmail}`, reply.bodyText)}

Classification rules (apply in this order):
1. unsubscribe — asks to stop, remove me, do not contact, hostile "leave me alone".
2. out_of_office / auto_reply — automated away, vacation, or system-generated messages.
3. meeting_request — proposes or agrees to a specific call/meeting/time, asks for a calendar link.
4. objection — ANY hesitation, blocker, deferral or pushback, even if the tone is warm. This includes: "too expensive", "no budget", "not the right time", "already have a solution/vendor", "need to think about it", "need to run it by my team/boss", "circle back later", "not a priority right now", "who is this?" / "how did you get my info?".
5. not_interested — clear rejection with no opening, but no unsubscribe request.
6. interested — positive engagement WITHOUT a blocker: asks for pricing, details, a deck, or says "tell me more" / "sounds interesting, send info".
7. unknown — cannot tell.

Important: a reply that is polite or curious but contains a deferral or condition ("interesting, but I need to think about it", "let me talk to my team first") is objection, NOT interested. Only classify as interested when there is no stated blocker.

Return JSON: { "classification": one of ["interested","objection","meeting_request","not_interested","unsubscribe","out_of_office","auto_reply","unknown"], "confidence": 0.0-1.0, "reasoning": "brief reason", "objection_type": one of ["pricing","timing","competitor","authority","status_quo","no_need"] or null (set only when classification is "objection") }`;

        const classifyRaw = await callGemini(classifyPrompt, classifySystemPrompt);

        let classification = "unknown";
        let confidence = 0;
        let reasoning = "";
        let objectionType: string | null = null;
        try {
          const jsonMatch = classifyRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            classification = parsed.classification ?? "unknown";
            confidence = parsed.confidence ?? 0;
            reasoning = parsed.reasoning ?? "";
            objectionType = parsed.objection_type ?? null;
          }
        } catch {
          // classification stays "unknown"
        }

        await logAction({
          user_id: user.id,
          sent_email_id: reply.sentEmailId,
          action_type: "classify",
          status: "completed",
          prospect_email: reply.fromEmail,
          subject: reply.subject,
          classification,
          description: `Read reply from ${reply.fromEmail} and classified it as "${classification}" (${Math.round(
            (confidence ?? 0) * 100
          )}% confidence)${reasoning ? ` — ${reasoning}` : ""}`,
          metadata: { phase: "reply", confidence, reasoning },
        });


        if (!reply.bodyText.trim()) {
          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "skipped",
            status: "skipped",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "unknown",
            metadata: { reason: "empty_body", gmail_message_id: reply.gmailMessageId },
          });
          skipped++;
          continue;
        }

        await adminClient
          .from("sent_emails")
          .update({
            replied_at: reply.receivedAt,
            agent_last_synced_at: new Date().toISOString(),
          })
          .eq("id", reply.sentEmailId)
          .is("replied_at", null);

        await adminClient
          .from("sent_emails")
          .update({ agent_last_synced_at: new Date().toISOString() })
          .eq("id", reply.sentEmailId)
          .not("replied_at", "is", null);

        const { data: existingAnalysis } = await adminClient
          .from("reply_analysis")
          .select("id")
          .eq("sent_email_id", reply.sentEmailId)
          .maybeSingle();

        if (existingAnalysis) {
          await adminClient
            .from("reply_analysis")
            .update({
              processed_by_agent: true,
              triage_category: classification,
            })
            .eq("id", existingAnalysis.id);
        } else {
          await adminClient.from("reply_analysis").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            reply_content: reply.bodyText,
            intent_score: confidence,
            intent_classification: classification,
            detected_signals: {
              gmail_message_id: reply.gmailMessageId,
              reasoning,
            },
            requires_human_action: false,
            analyzed_at: new Date().toISOString(),
            processed_by_agent: true,
            triage_category: classification,
          });
        }

        /*
         * Tell the sequence what the reply said.
         *
         * This path never reaches analyze-reply: agent-run calls inbox-sync
         * with no body, so `analyzeReplies` is undefined, and it classifies
         * the reply itself and writes reply_analysis directly. A later
         * scheduled sync then skips the message because a row already exists
         * for it — so without this call, a reply the agent read would never
         * stop its sequence, and the follow-ups kept going out.
         *
         * The agent's taxonomy is its own, so it is mapped rather than passed
         * through. Everything that is not an automated bounce-back stops the
         * sequence: that was the product's intent before any of this existed,
         * and an unclassifiable reply is still a person who wrote back.
         *
         * No check-back date: this classifier does not extract one, and the
         * stop branch is the honest answer to a deferral we cannot date.
         */
        const triageForSequence =
          classification === "out_of_office" || classification === "auto_reply"
            ? "ooo"
            : classification === "not_interested" || classification === "unsubscribe"
              ? "hard_no"
              : classification === "interested" || classification === "meeting_request"
                ? "positive"
                : "soft_no";

        if (reply.leadId) {
          const { error: applyErr } = await adminClient.rpc("apply_reply_to_sequence", {
            p_user_id: user.id,
            p_lead_id: reply.leadId,
            p_triage: triageForSequence,
            p_check_back_at: null,
          });
          if (applyErr) {
            console.error("[agent-run] reply not applied to the sequence:", applyErr.message);
          }
        }

        if (classification === "interested" && config.can_reply_interested) {
          // Someone replied positively — this is the most valuable email the
          // agent writes, and it was written with a persona line and nothing
          // else. The first-touch path gets the house rules through
          // playbookSystemRules(); the reply paths got none of it.
          const replySystemPrompt = `You are ${config.agent_name}, a sales rep. Your persona: ${config.persona}. Tone: ${config.tone}.
${UNTRUSTED_CONTENT_RULE}
${bannedPhrasesBlock()}
${agentProhibitions(config.agent_name)}
${composeSkillContext({ goal: "meeting" })}
Company context: ${config.company_context ?? ""}
Value propositions: ${valuePropsText}

${icpContext}`;

          const replyPrompt = `A prospect replied to your email positively.
Subject: ${reply.subject}
Prospect reply: ${fence(`reply from ${reply.fromEmail}`, reply.bodyText)}

Write a concise ${config.tone} reply (2-3 sentences) that:
- Acknowledges their interest briefly
- Proposes a specific next step (15-minute call or demo)
- Ends with a clear, low-pressure CTA

Output ONLY the reply body. No subject line. No greeting like "Hi [name]". No signature.`;

          await executeDurableReply({
            sentEmailId: reply.sentEmailId,
            fromEmail: reply.fromEmail,
            subject: reply.subject,
            classification: "interested",
            gmailThreadId: reply.gmailThreadId,
            gmailMessageId: reply.gmailMessageId,
            confidence,
            draft: () => callGemini(replyPrompt, replySystemPrompt),
            review: async (body) => {
              const delivCheck = deliverabilityCheck(`Re: ${reply.subject}`, body);
              if (!delivCheck.ok) {
                await logAction({
                  user_id: user.id,
                  sent_email_id: reply.sentEmailId,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: reply.fromEmail,
                  subject: reply.subject,
                  classification: "interested",
                  metadata: { reason: "deliverability_block", spam_triggers: delivCheck.hits },
                });
                skipped++;
                return { hold: true, approval: false };
              }
              if (await blockUngroundedReply(reply, body, "interested")) return { hold: true, approval: false };
              if (approvalMode) return { hold: true, approval: true };
              return { hold: false, approval: false };
            },
            onHold: async (body) => {
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "awaiting_reply",
                status: "pending",
                prospect_email: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                description: `${reply.fromEmail} replied and is waiting on an answer. Ask the agent to reply and it will draft against the live thread.`,
                metadata: { phase: "reply", gmail_message_id: reply.gmailMessageId },
              });
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "awaiting_approval",
                status: "pending",
                prospect_email: reply.fromEmail,
                subject: reply.subject,
                classification: "interested",
                reply_content: body,
                description: `${reply.fromEmail} replied with interest — drafted a response for your approval`,
                metadata: { phase: "reply", confidence },
              });
            },
            onSent: async (body) => {
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "reply_sent",
                status: "completed",
                prospect_email: reply.fromEmail,
                subject: reply.subject,
                classification: "interested",
                reply_content: body,
                metadata: { gmail_message_id: reply.gmailMessageId, confidence },
              });
              await adminClient.from("sent_emails").update({ agent_thread_status: "replied" }).eq("id", reply.sentEmailId);
              await adminClient.from("reply_analysis").update({ agent_reply_sent_at: new Date().toISOString() }).eq("sent_email_id", reply.sentEmailId);
            },
          });
        } else if (classification === "objection" && config.can_handle_objections) {
          // Objection Library: pull matching entries (by classified type first,
          // then trigger term in the reply body; top two if several) and ground the
          // draft in them. Fall back to the flat objection_responses map when
          // nothing matches, so an empty library behaves exactly as before.
          const { data: objEntries } = await adminClient
            .from("objection_entries")
            .select("id, type, trigger_terms, positioning, talk_track, proof_points, do_not_say, competitor_name, strengths, weaknesses")
            .eq("user_id", user.id);
          const bodyLower = (reply.bodyText || "").toLowerCase();
          const matched: any[] = [];
          const seen = new Set<string>();
          const push = (e: any) => { if (e && !seen.has(e.id)) { seen.add(e.id); matched.push(e); } };
          for (const e of objEntries || []) { if (objectionType && e.type === objectionType) push(e); }
          for (const e of objEntries || []) {
            if ((e.trigger_terms || []).some((t: string) => t && bodyLower.includes(t.toLowerCase()))) push(e);
          }
          const top = matched.slice(0, 2);

          const usedEntryIds: string[] = [];
          let objectionGuidance = "";
          if (top.length > 0) {
            const blocks = top.map((e: any) => {
              usedEntryIds.push(e.id);
              const pts = Array.isArray(e.proof_points) ? e.proof_points.filter(Boolean) : [];
              const parts = [`Objection type: ${e.type}`];
              if (e.positioning) parts.push(`Positioning: ${e.positioning}`);
              if (e.talk_track) parts.push(`Talk track: ${e.talk_track}`);
              if (e.competitor_name) parts.push(`Competitor named: ${e.competitor_name}`);
              if (e.strengths) parts.push(`Their strengths (do not disparage): ${e.strengths}`);
              if (e.weaknesses) parts.push(`Where we differ: ${e.weaknesses}`);
              if (pts.length) parts.push(`Proof points you may cite (only these, as written): ${JSON.stringify(pts)}`);
              if ((e.do_not_say || []).length) parts.push(`Never say: ${(e.do_not_say).join("; ")}`);
              return parts.join("\n");
            });
            objectionGuidance = `Use this prepared objection guidance. Cite a proof point only if one is listed here. Never invent a customer name, a metric, or a statistic that is not listed.\n\n${blocks.join("\n\n")}`;
          } else if (config.objection_responses && Object.keys(config.objection_responses).length > 0) {
            objectionGuidance = `Prepared guidance for objections: ${JSON.stringify(config.objection_responses)}`;
          }

          // The whole brief, not just a persona line. This prompt used to be one
          // sentence — a name, a persona and a tone — and then asked for a
          // reply. No banned phrases, no anti-slop pass, and nothing at all
          // about how to answer the specific kind of objection that was
          // classified two steps earlier. The objection library below supplies
          // what may be claimed about the product; the skills supply how to
          // write the reply.
          const objectionSystemPrompt = `You are ${config.agent_name}. ${config.persona}. Tone: ${config.tone}.
${UNTRUSTED_CONTENT_RULE}
${bannedPhrasesBlock()}
${agentProhibitions(config.agent_name)}
${composeSkillContext({ goal: "objection" })}`;
          const objectionPrompt = `The prospect raised an objection to your sales email.
Objection type, as classified: ${objectionType ?? "unclassified — read the reply and decide"}
Prospect reply: ${fence(`reply from ${reply.fromEmail}`, reply.bodyText)}
${objectionGuidance}
Write a 2-3 sentence reply that acknowledges their concern, provides a brief value-focused response, and offers a low-commitment next step.
Output ONLY the reply body. No subject line or signature.`;

          const proofPoints = top
            .flatMap((entry: { proof_points?: unknown }) =>
              Array.isArray(entry.proof_points) ? entry.proof_points.filter((point) => typeof point === "string") : [],
            )
            .join("\n");
          await executeDurableReply({
            sentEmailId: reply.sentEmailId,
            fromEmail: reply.fromEmail,
            subject: reply.subject,
            classification: "objection",
            gmailThreadId: reply.gmailThreadId,
            gmailMessageId: reply.gmailMessageId,
            confidence,
            draft: () => callGemini(objectionPrompt, objectionSystemPrompt),
            review: async (body) => {
              const delivCheck = deliverabilityCheck(`Re: ${reply.subject}`, body);
              if (!delivCheck.ok) {
                await logAction({
                  user_id: user.id,
                  sent_email_id: reply.sentEmailId,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: reply.fromEmail,
                  subject: reply.subject,
                  classification: "objection",
                  metadata: { reason: "deliverability_block", spam_triggers: delivCheck.hits },
                });
                skipped++;
                return { hold: true, approval: false };
              }
              if (await blockUngroundedReply(reply, body, "objection", proofPoints)) return { hold: true, approval: false };
              if (approvalMode) return { hold: true, approval: true };
              return { hold: false, approval: false };
            },
            onHold: async (body) => {
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "awaiting_reply",
                status: "pending",
                prospect_email: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                description: `${reply.fromEmail} replied and is waiting on an answer. Ask the agent to reply and it will draft against the live thread.`,
                metadata: { phase: "reply", gmail_message_id: reply.gmailMessageId },
              });
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "awaiting_approval",
                status: "pending",
                prospect_email: reply.fromEmail,
                subject: reply.subject,
                classification: "objection",
                reply_content: body,
                description: `${reply.fromEmail} raised an objection — drafted a response for your approval`,
                metadata: { phase: "reply", confidence, objection_entry_ids: usedEntryIds },
              });
            },
            onSent: async (body) => {
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "reply_sent",
                status: "completed",
                prospect_email: reply.fromEmail,
                subject: reply.subject,
                classification: "objection",
                reply_content: body,
                metadata: { gmail_message_id: reply.gmailMessageId, confidence },
              });
              await adminClient.from("sent_emails").update({ agent_thread_status: "replied" }).eq("id", reply.sentEmailId);
              await adminClient.from("reply_analysis").update({ agent_reply_sent_at: new Date().toISOString() }).eq("sent_email_id", reply.sentEmailId);
            },
          });
        } else if (classification === "meeting_request" && config.can_book_meetings) {
          await executeDurableReply({
            sentEmailId: reply.sentEmailId,
            fromEmail: reply.fromEmail,
            subject: reply.subject,
            classification: "meeting_request",
            gmailThreadId: reply.gmailThreadId,
            gmailMessageId: reply.gmailMessageId,
            confidence,
            draft: async () => {
              if (config.calendly_url) {
                return `Thanks for reaching out! You can book time directly on my calendar here: ${config.calendly_url}. Looking forward to connecting!`;
              }
              const meetingSystemPrompt = `You are ${config.agent_name}. ${config.persona}. Tone: ${config.tone}.
${UNTRUSTED_CONTENT_RULE}
${bannedPhrasesBlock()}
${agentProhibitions(config.agent_name)}`;
              const meetingPrompt = `A prospect is requesting a meeting in response to your sales email.
Prospect reply: ${fence(`reply from ${reply.fromEmail}`, reply.bodyText)}
Write a short, friendly reply asking for their availability (2-3 time options format or asking when works best).
Output ONLY the reply body. No subject line or signature.`;
              return callGemini(meetingPrompt, meetingSystemPrompt);
            },
            review: async (body) => {
              if (!config.calendly_url && await blockUngroundedReply(reply, body, "meeting_request")) {
                return { hold: true, approval: false };
              }
              if (approvalMode) return { hold: true, approval: true };
              return { hold: false, approval: false };
            },
            onHold: async (body) => {
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "awaiting_reply",
                status: "pending",
                prospect_email: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                description: `${reply.fromEmail} replied and is waiting on an answer. Ask the agent to reply and it will draft against the live thread.`,
                metadata: { phase: "reply", gmail_message_id: reply.gmailMessageId },
              });
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "awaiting_approval",
                status: "pending",
                prospect_email: reply.fromEmail,
                subject: reply.subject,
                classification: "meeting_request",
                reply_content: body,
                description: `${reply.fromEmail} asked to meet — drafted a scheduling reply for your approval`,
                metadata: { phase: "reply", confidence },
              });
            },
            onSent: async (body) => {
              await adminClient.from("sent_emails").update({ agent_thread_status: "meeting_booked" }).eq("id", reply.sentEmailId);
              await notifyMeetingBooked(user.id, { inviteeEmail: reply.fromEmail });
              await logAction({
                user_id: user.id,
                sent_email_id: reply.sentEmailId,
                action_type: "meeting_booked",
                status: "completed",
                prospect_email: reply.fromEmail,
                subject: reply.subject,
                classification: "meeting_request",
                reply_content: body,
                metadata: {
                  gmail_message_id: reply.gmailMessageId,
                  calendly_used: !!config.calendly_url,
                  confidence,
                },
              });
              meetingsBooked++;
            },
          });
        } else if (classification === "not_interested") {
          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "closed" })
            .eq("id", reply.sentEmailId);

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "closed_thread",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "not_interested",
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });
        } else if (classification === "unsubscribe") {
          // Scoped to this sender. On the address alone it stopped every
          // other account on the platform mailing that person, and
          // onConflict: "email" no longer resolves anyway — the plain unique
          // on the address became two partial indexes when opt-outs gained a
          // sender.
          await adminClient
            .from("email_optouts")
            .upsert(
              {
                email: reply.fromEmail.toLowerCase().trim(),
                user_id: user.id,
                opted_out_at: new Date().toISOString(),
              },
              { onConflict: "user_id,email" }
            );

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "unsubscribed" })
            .eq("id", reply.sentEmailId);

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "unsubscribed",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "unsubscribe",
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });
        } else if (
          classification === "out_of_office" ||
          classification === "auto_reply" ||
          classification === "unknown" ||
          (classification === "interested" && !config.can_reply_interested) ||
          (classification === "objection" && !config.can_handle_objections) ||
          (classification === "meeting_request" && !config.can_book_meetings)
        ) {
          const reason =
            classification === "interested" && !config.can_reply_interested
              ? "agent_reply_disabled"
              : classification === "objection" && !config.can_handle_objections
              ? "objection_handling_disabled"
              : classification === "meeting_request" && !config.can_book_meetings
              ? "meeting_booking_disabled"
              : classification;

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "skipped",
            status: "skipped",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification,
            metadata: { reason, gmail_message_id: reply.gmailMessageId, confidence },
          });

          skipped++;
        }
      } catch (replyErr: any) {
        console.error(`Error processing reply:`, replyErr.message);
        errors++;

        try {
          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "error",
            status: "failed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            error_message: replyErr.message,
            metadata: { gmail_message_id: reply.gmailMessageId },
          });
        } catch {
          // Logging failure must not propagate
        }
      }
    }

    const agentLabel = `${config.agent_name || "Agent"} (${agentRole.replace(/_/g, " ")})`;
    let runReceipts = leadReceipts;
    let receiptLoadFailed = false;
    const unsavedDeliveries: ToolReceipt[] = [];
    if (durableMode === "on") {
      for (const receipt of leadReceipts) {
        const written = await adminClient.rpc("record_agent_tool_receipt", {
          p_user_id: user.id,
          p_run_id: runId,
          p_tool_name: receipt.toolName,
          p_status: receipt.status,
          p_detail: receipt.detail ?? null,
        }).then((saved) => !saved.error, () => false);
        if (!written && receipt.status === "ok") unsavedDeliveries.push(receipt);
      }
      const listed = await adminClient.rpc("list_agent_tool_receipts", {
        p_user_id: user.id,
        p_run_id: runId,
      }).then((loaded) => loaded, () => ({ error: { message: "list failed" }, data: null }));
      if (listed.error || !Array.isArray(listed.data)) {
        receiptLoadFailed = true;
        runReceipts = [];
      } else {
        const saved = listed.data.map((row: { tool_name?: string; status?: string; detail?: string | null }) => ({
          toolName: String(row.tool_name ?? ""),
          status: String(row.status ?? "failed") as ToolReceipt["status"],
          detail: row.detail ?? undefined,
        }));
        runReceipts = reconcileReceipts(saved, []);
      }
      await adminClient.rpc("close_outbound_run", { p_user_id: user.id, p_run_id: runId }).then(() => {}, () => {});
    } else {
      for (const receipt of leadReceipts) {
        await adminClient.rpc("record_agent_tool_receipt", {
          p_user_id: user.id,
          p_run_id: runId,
          p_tool_name: receipt.toolName,
          p_status: receipt.status,
          p_detail: receipt.detail ?? null,
        }).then(() => {}, () => {});
      }
    }
    const runSummary = receiptLoadFailed
      ? `${agentLabel} could not load saved results for this run. Do not treat this request as delivered.`
      : buildAgentRunSummary({
          agentLabel,
          approvalMode,
          leadsFound,
          outreachDrafted,
          threadsChecked,
          pendingApprovals,
          receipts: runReceipts,
        }) + (unsavedDeliveries.length
          ? ` ${unsavedDeliveries.length} send result(s) could not be saved, and are not counted as delivered.`
          : "");

    await logAction({
      user_id: user.id,
      action_type: "sync",
      status: "completed",
      description: runSummary,
      metadata: {
        mode: approvalMode ? "approval" : "autonomous",
        trigger: triggerSource,
        role: agentRole,
        agent_name: config.agent_name ?? null,
        threads_checked: threadsChecked,
        leads_found: leadsFound,
        outreach_drafted: outreachDrafted,
        outreach_sent: outreachSent,
        drafts_without_research: draftsWithoutResearch,
        research_outcomes: researchOutcomes,
        pending_approvals: pendingApprovals,
        replies_processed: repliesProcessed,
        replies_sent: repliesSent,
        meetings_booked: meetingsBooked,
        skipped,
        errors,
      },
    });

    if (leadsFound || outreachDrafted || outreachSent || repliesSent || pendingApprovals) {
      await notifyAgentRunFinished(user.id, config.agent_name ?? "", runSummary);
    }

    await captureServerEvent("agent_run_completed", user.id, {
      mode: approvalMode ? "approval" : "autonomous",
      threads_checked: threadsChecked,
      leads_found: leadsFound,
      outreach_drafted: outreachDrafted,
      outreach_sent: outreachSent,
      pending_approvals: pendingApprovals,
      replies_processed: repliesProcessed,
      replies_sent: repliesSent,
      meetings_booked: meetingsBooked,
      error_count: Array.isArray(errors) ? errors.length : 0,
    });

    return new Response(

      JSON.stringify({
        success: true,
        agentId: config.id,
        agentName: config.agent_name,
        role: agentRole,
        mode: approvalMode ? "approval" : "autonomous",
        summary: runSummary,
        // "on" leases first-touch and reply phases. "off" is the in-memory loop.
        durableMode,
        replyExecution: durableMode === "on" ? "leased_steps" : "in_memory",
        threadsChecked,
        leadsFound,
        outreachDrafted,
        outreachSent,
        pendingApprovals,
        repliesProcessed,
        repliesSent,
        meetingsBooked,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("agent-run error:", err);
    await logRunEvent({
      action_type: "error",
      status: "failed",
      description: "Run failed before it could finish.",
      error_message: err?.message ?? "Unknown error",
      metadata: { phase: "run", trigger: triggerSource },
    });
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
